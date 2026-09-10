from __future__ import annotations

import datetime as dt
import math

from aegis_backend.api.schemas_db import HazardContext, TacticalExportResponse, TacticalTarget
from aegis_backend.db.models import IncidentSOS

_transmission_counter = 0


def _next_transmission_id(now: dt.datetime) -> str:
    global _transmission_counter
    _transmission_counter += 1
    return f"TRT-{now.strftime('%Y%m%d')}-{_transmission_counter:03d}"


def _nearest_point_on_path(
    x: float, y: float, path: list[tuple[int, int]]
) -> tuple[float, float] | None:
    if not path:
        return None
    best_point = path[0]
    best_dist = math.inf
    for px, py in path:
        d = math.hypot(px - x, py - y)
        if d < best_dist:
            best_dist = d
            best_point = (px, py)
    return float(best_point[0]), float(best_point[1])


def build_tactical_transmission(
    incidents: list[IncidentSOS],
    active_path: list[tuple[int, int]] | None,
    mission_start: tuple[int, int] | None,
) -> TacticalExportResponse:
    now = dt.datetime.now(dt.timezone.utc)
    targets: list[TacticalTarget] = []

    for incident in incidents:
        waypoint = None
        if active_path:
            waypoint_point = _nearest_point_on_path(incident.x_coord, incident.y_coord, active_path)
            waypoint = list(waypoint_point) if waypoint_point else None
        elif mission_start is not None:
            waypoint = [float(mission_start[0]), float(mission_start[1])]

        targets.append(
            TacticalTarget(
                victim_id=incident.victim_id,
                coordinates={"x": incident.x_coord, "y": incident.y_coord},
                triage=incident.triage_status,
                hazard_context=HazardContext(
                    ambient_temp=incident.ambient_temp,
                    structural_instability=incident.structural_risk,
                ),
                extraction_waypoint=waypoint,
            )
        )

    return TacticalExportResponse(
        transmission_id=_next_transmission_id(now),
        timestamp=now,
        operation_status="ACTIVE_RESCUE" if targets else "NO_ACTIVE_TARGETS",
        target_count=len(targets),
        targets=targets,
    )
