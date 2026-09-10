from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis_backend.api.schemas_db import SosIncidentRequest, SosIncidentResponse, TacticalExportResponse
from aegis_backend.api.state import EngineState, get_engine_state
from aegis_backend.db.models import IncidentSOS, Mission
from aegis_backend.db.session import get_session
from aegis_backend.services.reporting import build_tactical_transmission

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


async def _get_or_create_active_mission(session: AsyncSession) -> Mission:
    result = await session.execute(select(Mission).where(Mission.status == "ACTIVE").limit(1))
    mission = result.scalar_one_or_none()
    if mission is None:
        mission = Mission(
            name="AEGIS-NAV Rescue Operation",
            started_at=dt.datetime.now(dt.timezone.utc),
            status="ACTIVE",
        )
        session.add(mission)
        await session.flush()
    return mission


@router.post("/sos", response_model=SosIncidentResponse)
async def report_sos(
    req: SosIncidentRequest, session: AsyncSession = Depends(get_session)
) -> SosIncidentResponse:
    if req.mission_id is not None:
        mission = await session.get(Mission, req.mission_id)
        if mission is None:
            mission = await _get_or_create_active_mission(session)
    else:
        mission = await _get_or_create_active_mission(session)

    incident = IncidentSOS(
        mission_id=mission.id,
        victim_id=req.victim_id,
        x_coord=req.x,
        y_coord=req.y,
        ambient_temp=req.ambient_temp,
        structural_risk=req.structural_risk,
        triage_status=req.triage_status,
        timestamp=dt.datetime.now(dt.timezone.utc),
    )
    session.add(incident)
    await session.commit()
    await session.refresh(incident)

    return SosIncidentResponse(
        id=incident.id,
        mission_id=incident.mission_id,
        victim_id=incident.victim_id,
        x_coord=incident.x_coord,
        y_coord=incident.y_coord,
        ambient_temp=incident.ambient_temp,
        structural_risk=incident.structural_risk,
        triage_status=incident.triage_status,
        timestamp=incident.timestamp,
    )


@router.get("/tactical-export", response_model=TacticalExportResponse)
async def tactical_export(
    session: AsyncSession = Depends(get_session),
    state: EngineState = Depends(get_engine_state),
    mission_id: int | None = None,
) -> TacticalExportResponse:
    query = select(IncidentSOS).order_by(IncidentSOS.timestamp.desc())
    if mission_id is not None:
        query = query.where(IncidentSOS.mission_id == mission_id)
    result = await session.execute(query)
    incidents = list(result.scalars().all())

    return build_tactical_transmission(
        incidents=incidents,
        active_path=state.active_path,
        mission_start=state.start,
    )
