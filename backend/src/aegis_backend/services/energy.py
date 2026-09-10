from __future__ import annotations

from dataclasses import dataclass

import aegis_core

GRAVITY = 9.81
LOW_RESERVE_THRESHOLD = 0.15
LOW_RESERVE_THERMAL_MULTIPLIER = 3.0
LOW_RESERVE_DISTANCE_MULTIPLIER = 1.5


@dataclass
class PowerModelParams:
    mass_kg: float = 45.0
    rolling_resistance: float = 0.08
    avionics_watts: float = 18.0
    thermal_cooling_coefficient: float = 0.35  # W per degree of ambient hazard above baseline
    ambient_baseline: float = 20.0


@dataclass
class EnergyState:
    # 12.4 Ah at a nominal 24V pack (~300 Wh) -- the frontend blueprint's HUD
    # mockup quotes "12.4 Ah"; Wh is Ah * nominal voltage, not the same number.
    battery_wh: float = 300.0
    battery_capacity_wh: float = 300.0
    fuel_l: float = 4.2
    fuel_capacity_l: float = 4.2
    fuel_energy_density_wh_per_l: float = 9500.0  # ~diesel-equivalent, Wh/L
    engine_efficiency: float = 0.30
    last_power_draw_w: float = 0.0

    def battery_fraction(self) -> float:
        return self.battery_wh / self.battery_capacity_wh if self.battery_capacity_wh else 0.0

    def fuel_fraction(self) -> float:
        return self.fuel_l / self.fuel_capacity_l if self.fuel_capacity_l else 0.0

    def is_low_reserve(self) -> bool:
        return self.battery_fraction() < LOW_RESERVE_THRESHOLD or self.fuel_fraction() < LOW_RESERVE_THRESHOLD


def thermal_cooling_power(params: PowerModelParams, ambient_hazard: float) -> float:
    excess = max(0.0, ambient_hazard - params.ambient_baseline)
    return params.thermal_cooling_coefficient * excess


def instantaneous_power_draw(
    params: PowerModelParams,
    speed_mps: float,
    acceleration_mps2: float,
    ambient_hazard: float,
) -> float:
    locomotion = (params.mass_kg * GRAVITY * params.rolling_resistance + params.mass_kg * acceleration_mps2) * speed_mps
    return params.avionics_watts + thermal_cooling_power(params, ambient_hazard) + locomotion


def apply_tick(
    energy: EnergyState,
    params: PowerModelParams,
    distance_m: float,
    speed_mps: float,
    dt_s: float,
    ambient_hazard: float,
    replanning: bool = False,
) -> float:
    acceleration = speed_mps / dt_s if dt_s > 0 else 0.0
    power_w = instantaneous_power_draw(params, speed_mps, acceleration, ambient_hazard)
    if replanning:
        power_w += 2.5  # replanning compute draw, drawn from battery like sensors/avionics

    energy.last_power_draw_w = power_w
    delta_e_bat_wh = power_w * (dt_s / 3600.0)
    energy.battery_wh = max(0.0, energy.battery_wh - delta_e_bat_wh)

    locomotion_energy_wh = (
        params.mass_kg * GRAVITY * params.rolling_resistance * distance_m
    ) / 3600.0
    delta_v_fuel_l = locomotion_energy_wh / (energy.engine_efficiency * energy.fuel_energy_density_wh_per_l)
    energy.fuel_l = max(0.0, energy.fuel_l - delta_v_fuel_l)

    return power_w


def reweight_for_low_reserve(weights: aegis_core.CostWeights) -> aegis_core.CostWeights:
    """Bias the cost field toward conservative, low-drag, low-heat routes.

    Triggered below the 15% battery/fuel reserve threshold: thermal penalty is
    tripled to steer hard away from heat/cooling drain, and the base distance
    weight is scaled up relative to risk/obstacle terms so the planner favors
    shorter, flatter routes over marginal safety margin.
    """
    reweighted = aegis_core.CostWeights()
    reweighted.w_d = weights.w_d * LOW_RESERVE_DISTANCE_MULTIPLIER
    reweighted.w_temp = weights.w_temp * LOW_RESERVE_THERMAL_MULTIPLIER
    reweighted.w_risk = weights.w_risk
    reweighted.w_obs = weights.w_obs
    return reweighted


def estimated_range_km(
    energy: EnergyState, params: PowerModelParams, avg_speed_mps: float = 1.5
) -> float | None:
    """Returns None (not infinity) when no power draw has been recorded yet --
    the API layer serializes this as JSON null; "infinite range" isn't a
    number a client can plot or compare against."""
    if energy.last_power_draw_w <= 0:
        return None
    hours_remaining_on_battery = energy.battery_wh / energy.last_power_draw_w
    locomotion_wh_per_km = (
        params.mass_kg * GRAVITY * params.rolling_resistance * 1000.0
    ) / 3600.0
    fuel_energy_wh = energy.fuel_l * energy.engine_efficiency * energy.fuel_energy_density_wh_per_l
    range_from_fuel_km = fuel_energy_wh / locomotion_wh_per_km if locomotion_wh_per_km > 0 else float("inf")
    range_from_battery_km = hours_remaining_on_battery * avg_speed_mps * 3.6
    return min(range_from_fuel_km, range_from_battery_km)
