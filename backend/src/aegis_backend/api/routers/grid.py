from __future__ import annotations

import math

import aegis_core
from fastapi import APIRouter, Depends, HTTPException

from aegis_backend.api.schemas import (
    CostmapResponse,
    GridInitRequest,
    GridInitResponse,
    GridMutateRequest,
    HazardCircle,
    HazardPolygon,
    HazardRequest,
    HazardResponse,
    MutateResponse,
)
from aegis_backend.api.state import EngineState, get_engine_state

router = APIRouter(prefix="/api/grid", tags=["grid"])


@router.post("/init", response_model=GridInitResponse)
def init_grid(req: GridInitRequest, state: EngineState = Depends(get_engine_state)) -> GridInitResponse:
    grid = aegis_core.Grid2D(req.width, req.height)
    for x, y in req.obstacles:
        if not grid.in_bounds(x, y):
            raise HTTPException(400, f"Obstacle ({x},{y}) is outside the {req.width}x{req.height} grid")
        grid.set_obstacle(x, y, True)
    grid.recompute_clearance()

    state.grid = grid
    state.resolution = req.resolution
    state.active_path = []
    state.dstar_initialized = False
    state.dstar = aegis_core.DStarLitePlanner(state.astar.weights)

    return GridInitResponse(
        width=req.width,
        height=req.height,
        resolution=req.resolution,
        obstacle_count=len(req.obstacles),
    )


def _point_in_polygon(x: float, y: float, points: list[tuple[int, int]]) -> bool:
    inside = False
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            x_intersect = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < x_intersect:
                inside = not inside
    return inside


def _apply_circle(grid: aegis_core.Grid2D, circle: HazardCircle) -> int:
    cx, cy = circle.center
    affected = 0
    x_min = max(0, int(cx - circle.radius))
    x_max = min(grid.width - 1, int(cx + circle.radius))
    y_min = max(0, int(cy - circle.radius))
    y_max = min(grid.height - 1, int(cy + circle.radius))
    for y in range(y_min, y_max + 1):
        for x in range(x_min, x_max + 1):
            if math.hypot(x - cx, y - cy) <= circle.radius:
                cell = grid.get_cell(x, y)
                grid.set_hazard(
                    x,
                    y,
                    max(cell.thermal_hazard, circle.thermal_hazard),
                    max(cell.structural_risk, circle.structural_risk),
                )
                affected += 1
    return affected


def _apply_polygon(grid: aegis_core.Grid2D, polygon: HazardPolygon) -> int:
    affected = 0
    xs = [p[0] for p in polygon.points]
    ys = [p[1] for p in polygon.points]
    x_min, x_max = max(0, min(xs)), min(grid.width - 1, max(xs))
    y_min, y_max = max(0, min(ys)), min(grid.height - 1, max(ys))
    for y in range(y_min, y_max + 1):
        for x in range(x_min, x_max + 1):
            if _point_in_polygon(x + 0.5, y + 0.5, polygon.points):
                cell = grid.get_cell(x, y)
                grid.set_hazard(
                    x,
                    y,
                    max(cell.thermal_hazard, polygon.thermal_hazard),
                    max(cell.structural_risk, polygon.structural_risk),
                )
                affected += 1
    return affected


@router.post("/hazards", response_model=HazardResponse)
def apply_hazards(req: HazardRequest, state: EngineState = Depends(get_engine_state)) -> HazardResponse:
    grid = state.require_grid()
    affected = 0
    for circle in req.circles:
        affected += _apply_circle(grid, circle)
    for polygon in req.polygons:
        affected += _apply_polygon(grid, polygon)
    return HazardResponse(cells_affected=affected)


@router.get("/costmap", response_model=CostmapResponse)
def get_costmap(state: EngineState = Depends(get_engine_state)) -> CostmapResponse:
    grid = state.require_grid()
    costs = grid.costmap(state.astar.weights)
    return CostmapResponse(width=grid.width, height=grid.height, costs=costs)


@router.post("/mutate", response_model=MutateResponse)
def mutate_grid(req: GridMutateRequest, state: EngineState = Depends(get_engine_state)) -> MutateResponse:
    state.require_grid()
    if not state.dstar_initialized:
        raise HTTPException(400, "D* Lite has no active plan yet. Call /api/plan/baseline first.")
    if len(req.changed_cells) != len(req.blocked):
        raise HTTPException(400, "changed_cells and blocked must be the same length")

    old_path = state.active_path
    result = state.dstar.update_obstacles(req.changed_cells, req.blocked)

    if result.found:
        state.active_path = result.path
        state.active_cost = result.cost

    return MutateResponse(
        path=result.path,
        cost=result.cost,
        replan_latency_ms=result.latency_ms,
        vertices_expanded=result.vertices_expanded,
        found=result.found,
        path_changed=result.found and result.path != old_path,
    )
