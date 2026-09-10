from __future__ import annotations

import math

import aegis_core
from fastapi import APIRouter, Depends, HTTPException

from aegis_backend.api.schemas import PlanBaselineRequest, PlanResponse
from aegis_backend.api.state import EngineState, get_engine_state

router = APIRouter(prefix="/api/plan", tags=["plan"])


def _path_length(path: list[tuple[int, int]]) -> float:
    length = 0.0
    for (x1, y1), (x2, y2) in zip(path, path[1:]):
        length += math.hypot(x2 - x1, y2 - y1)
    return length


@router.post("/baseline", response_model=PlanResponse)
def plan_baseline(req: PlanBaselineRequest, state: EngineState = Depends(get_engine_state)) -> PlanResponse:
    grid = state.require_grid()

    if not grid.in_bounds(*req.start) or not grid.in_bounds(*req.goal):
        raise HTTPException(400, "start/goal must be within grid bounds")

    if req.weights is not None:
        weights = aegis_core.CostWeights()
        weights.w_d = req.weights.w_d
        weights.w_temp = req.weights.w_temp
        weights.w_risk = req.weights.w_risk
        weights.w_obs = req.weights.w_obs
        weights.w_slope = req.weights.w_slope
        state.set_weights(weights)

    result = state.astar.plan(grid, req.start, req.goal)

    # D* Lite is (re)initialized against this same start/goal so /api/grid/mutate
    # can repair incrementally from here rather than re-running a full search.
    state.dstar = aegis_core.DStarLitePlanner(state.astar.weights)
    dstar_result = state.dstar.init(grid, req.start, req.goal)
    state.dstar_initialized = True
    state.start = req.start
    state.goal = req.goal

    path = result.path if result.found else dstar_result.path
    cost = result.cost if result.found else dstar_result.cost
    state.active_path = path
    state.active_cost = cost

    return PlanResponse(
        path=path,
        length=_path_length(path),
        cost=cost,
        compute_time_ms=result.latency_ms,
        found=result.found,
    )
