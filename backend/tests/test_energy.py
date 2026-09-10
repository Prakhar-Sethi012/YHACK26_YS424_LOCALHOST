import aegis_core

from aegis_backend.services import energy


def test_apply_tick_drains_battery_and_fuel():
    state = energy.EnergyState()
    params = energy.PowerModelParams()

    energy.apply_tick(state, params, distance_m=5.0, speed_mps=1.5, dt_s=3.0, ambient_hazard=20.0)

    assert state.battery_wh < state.battery_capacity_wh
    assert state.fuel_l < state.fuel_capacity_l


def test_high_ambient_hazard_draws_more_power_than_baseline():
    params = energy.PowerModelParams()

    cool = energy.instantaneous_power_draw(params, speed_mps=1.5, acceleration_mps2=0.0, ambient_hazard=20.0)
    hot = energy.instantaneous_power_draw(params, speed_mps=1.5, acceleration_mps2=0.0, ambient_hazard=90.0)

    assert hot > cool


def test_is_low_reserve_below_15_percent():
    state = energy.EnergyState(battery_wh=1.0, battery_capacity_wh=12.4, fuel_l=4.0, fuel_capacity_l=4.2)
    assert state.is_low_reserve()

    state = energy.EnergyState(battery_wh=12.0, battery_capacity_wh=12.4, fuel_l=4.0, fuel_capacity_l=4.2)
    assert not state.is_low_reserve()


def test_reweight_for_low_reserve_triples_thermal_penalty():
    weights = aegis_core.CostWeights()
    weights.w_temp = 0.2

    reweighted = energy.reweight_for_low_reserve(weights)

    assert reweighted.w_temp == weights.w_temp * 3.0
    assert reweighted.w_d > weights.w_d


def test_estimated_range_km_is_positive_and_finite_after_a_tick():
    state = energy.EnergyState()
    params = energy.PowerModelParams()
    energy.apply_tick(state, params, distance_m=5.0, speed_mps=1.5, dt_s=3.0, ambient_hazard=20.0)

    range_km = energy.estimated_range_km(state, params)

    assert range_km > 0
    assert range_km < float("inf")


def test_estimated_range_km_is_none_before_any_tick():
    # No power draw recorded yet. This must be JSON-serializable via the API
    # (a bare float('inf') is not -- Starlette's JSONResponse uses
    # allow_nan=False and raises ValueError on it), so "unknown" is None here,
    # not infinity.
    state = energy.EnergyState()
    params = energy.PowerModelParams()

    assert energy.estimated_range_km(state, params) is None


def test_estimated_range_km_shrinks_as_fuel_depletes():
    # Range is min(fuel-limited, battery-limited); give both states a large
    # battery so it's never the binding constraint and the comparison isolates
    # the fuel branch (with the default ~300 Wh battery, battery is otherwise
    # binding at this power draw, which would make both sides equal).
    params = energy.PowerModelParams()
    full_fuel = energy.EnergyState(battery_wh=10_000.0, battery_capacity_wh=10_000.0, fuel_l=4.2)
    low_fuel = energy.EnergyState(battery_wh=10_000.0, battery_capacity_wh=10_000.0, fuel_l=0.5)
    for state in (full_fuel, low_fuel):
        energy.apply_tick(state, params, distance_m=5.0, speed_mps=1.5, dt_s=3.0, ambient_hazard=20.0)

    assert energy.estimated_range_km(low_fuel, params) < energy.estimated_range_km(full_fuel, params)
