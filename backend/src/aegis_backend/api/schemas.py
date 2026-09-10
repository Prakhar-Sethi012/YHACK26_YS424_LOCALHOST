from __future__ import annotations

from pydantic import BaseModel, Field

Coord = tuple[int, int]


class GridInitRequest(BaseModel):
    width: int = Field(gt=0, le=1000)
    height: int = Field(gt=0, le=1000)
    resolution: float = Field(default=1.0, gt=0)
    obstacles: list[Coord] = Field(default_factory=list)
    # Row-major [y][x] heightmap, meters. Optional: Backend 1 (the source of
    # elevation data) pushes this so Backend 2's A*/D* Lite penalize steep
    # edges and refuse rollover-impassable slopes -- without it the grid is
    # flat and every route looks equally climbable.
    elevation: list[list[float]] | None = None


class GridInitResponse(BaseModel):
    width: int
    height: int
    resolution: float
    obstacle_count: int


class HazardCircle(BaseModel):
    shape: str = "circle"
    center: Coord
    radius: float = Field(gt=0)
    thermal_hazard: float = Field(default=0.0, ge=0, le=100)
    structural_risk: float = Field(default=0.0, ge=0, le=1)


class HazardPolygon(BaseModel):
    shape: str = "polygon"
    points: list[Coord] = Field(min_length=3)
    thermal_hazard: float = Field(default=0.0, ge=0, le=100)
    structural_risk: float = Field(default=0.0, ge=0, le=1)


class HazardRequest(BaseModel):
    circles: list[HazardCircle] = Field(default_factory=list)
    polygons: list[HazardPolygon] = Field(default_factory=list)


class HazardResponse(BaseModel):
    cells_affected: int


class CostWeightsModel(BaseModel):
    w_d: float = 1.0
    w_temp: float = 0.2
    w_risk: float = 6.0
    w_obs: float = 4.0
    w_slope: float = 3.0


class PlanBaselineRequest(BaseModel):
    start: Coord
    goal: Coord
    weights: CostWeightsModel | None = None


class PlanResponse(BaseModel):
    path: list[Coord]
    length: float
    cost: float
    compute_time_ms: float
    found: bool


class GridMutateRequest(BaseModel):
    changed_cells: list[Coord]
    blocked: list[bool]
    # Rover's current grid cell. Moves D* Lite's internal start here before
    # repairing, so the returned path picks up from where the agent actually
    # is -- omit only for backward compatibility, in which case the repaired
    # path stays anchored at whatever /api/plan/baseline last set as start.
    current_position: Coord | None = None


class MutateResponse(BaseModel):
    path: list[Coord]
    cost: float
    replan_latency_ms: float
    vertices_expanded: int
    found: bool
    path_changed: bool


class CostmapResponse(BaseModel):
    width: int
    height: int
    costs: list[list[float]]


class SimulationTickRequest(BaseModel):
    distance_m: float = Field(ge=0)
    speed_mps: float = Field(ge=0)
    dt_s: float = Field(gt=0)
    ambient_hazard: float = Field(default=20.0, ge=0, le=100)


class SimulationTickResponse(BaseModel):
    battery_wh: float
    battery_pct: float
    fuel_l: float
    fuel_pct: float
    power_draw_w: float
    reroute_triggered: bool
    reroute_path: list[Coord] | None = None


class TelemetryResponse(BaseModel):
    battery_pct: float
    battery_wh: float
    fuel_l: float
    fuel_pct: float
    estimated_range_km: float | None
    power_draw_w: float
    low_reserve: bool
