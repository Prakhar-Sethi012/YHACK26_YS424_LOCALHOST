from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


class SosIncidentRequest(BaseModel):
    mission_id: int | None = None
    victim_id: str
    x: float
    y: float
    ambient_temp: float = Field(ge=0)
    structural_risk: float = Field(ge=0, le=1)
    triage_status: str = "UNKNOWN"


class SosIncidentResponse(BaseModel):
    id: int
    mission_id: int
    victim_id: str
    x_coord: float
    y_coord: float
    ambient_temp: float
    structural_risk: float
    triage_status: str
    timestamp: dt.datetime


class HazardContext(BaseModel):
    ambient_temp: float
    structural_instability: float


class TacticalTarget(BaseModel):
    victim_id: str
    coordinates: dict[str, float]
    triage: str
    hazard_context: HazardContext
    extraction_waypoint: list[float] | None


class TacticalExportResponse(BaseModel):
    transmission_id: str
    timestamp: dt.datetime
    operation_status: str
    target_count: int
    targets: list[TacticalTarget]


class BenchmarkRecordRequest(BaseModel):
    scenario_name: str
    algorithm: str = Field(pattern="^(astar|dstar_lite)$")
    path_length: float = Field(ge=0)
    total_energy_wh: float = Field(ge=0)
    avg_latency_ms: float = Field(ge=0)
    replans_count: int = Field(ge=0, default=0)
    collisions_avoided: int = Field(ge=0, default=0)


class BenchmarkRecordResponse(BenchmarkRecordRequest):
    id: int
    recorded_at: dt.datetime


class BenchmarkAlgorithmSummary(BaseModel):
    runs: int
    avg_path_length: float
    avg_energy_wh: float
    avg_latency_ms: float
    total_replans: int
    total_collisions_avoided: int


class BenchmarkSummaryResponse(BaseModel):
    by_algorithm: dict[str, BenchmarkAlgorithmSummary]
