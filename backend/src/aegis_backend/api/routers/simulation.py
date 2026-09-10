from __future__ import annotations

import aegis_core
from fastapi import APIRouter, Depends

from aegis_backend.api.schemas import SimulationTickRequest, SimulationTickResponse, TelemetryResponse
from aegis_backend.api.state import EngineState, get_engine_state
from aegis_backend.services import energy as energy_service

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("/tick", response_model=SimulationTickResponse)
def simulation_tick(
    req: SimulationTickRequest, state: EngineState = Depends(get_engine_state)
) -> SimulationTickResponse:
    was_low_reserve = state.energy.is_low_reserve()

    power_w = energy_service.apply_tick(
        state.energy,
        state.power_params,
        distance_m=req.distance_m,
        speed_mps=req.speed_mps,
        dt_s=req.dt_s,
        ambient_hazard=req.ambient_hazard,
        replanning=False,
    )

    is_low_reserve = state.energy.is_low_reserve()
    reroute_triggered = False
    reroute_path: list[tuple[int, int]] | None = None

    if is_low_reserve and not was_low_reserve and state.grid is not None and state.start and state.goal:
        reweighted = energy_service.reweight_for_low_reserve(state.astar.weights)
        state.set_weights(reweighted)
        result = state.astar.plan(state.grid, state.start, state.goal)

        # A reserve-triggered reweight changes the cost of every edge in the
        # graph, not a handful of localized cells, so D* Lite's cached g/rhs
        # values (computed under the old weights) can no longer be trusted for
        # incremental repair. Reinitialize it from scratch under the new
        # weights rather than leaving it in an inconsistent hybrid state.
        state.dstar = aegis_core.DStarLitePlanner(reweighted)
        state.dstar.init(state.grid, state.start, state.goal)

        if result.found:
            state.active_path = result.path
            state.active_cost = result.cost
            reroute_triggered = True
            reroute_path = result.path

    return SimulationTickResponse(
        battery_wh=state.energy.battery_wh,
        battery_pct=state.energy.battery_fraction() * 100.0,
        fuel_l=state.energy.fuel_l,
        fuel_pct=state.energy.fuel_fraction() * 100.0,
        power_draw_w=power_w,
        reroute_triggered=reroute_triggered,
        reroute_path=reroute_path,
    )


@router.get("/telemetry", response_model=TelemetryResponse)
def telemetry(state: EngineState = Depends(get_engine_state)) -> TelemetryResponse:
    return TelemetryResponse(
        battery_pct=state.energy.battery_fraction() * 100.0,
        battery_wh=state.energy.battery_wh,
        fuel_l=state.energy.fuel_l,
        fuel_pct=state.energy.fuel_fraction() * 100.0,
        estimated_range_km=energy_service.estimated_range_km(state.energy, state.power_params),
        power_draw_w=state.energy.last_power_draw_w,
        low_reserve=state.energy.is_low_reserve(),
    )
