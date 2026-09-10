from simulation.kinematics.power_model import PowerDissipationModel


def test_power_draw_increases_with_velocity():
    model = PowerDissipationModel()
    low_speed = model.compute_power_draw(velocity=0.2, acceleration=0.0, slope_radians=0.0)
    high_speed = model.compute_power_draw(velocity=2.0, acceleration=0.0, slope_radians=0.0)
    assert high_speed > low_speed


def test_power_draw_increases_with_slope():
    model = PowerDissipationModel()
    flat = model.compute_power_draw(velocity=1.0, acceleration=0.0, slope_radians=0.0)
    uphill = model.compute_power_draw(velocity=1.0, acceleration=0.0, slope_radians=0.3)
    assert uphill > flat


def test_high_ambient_temp_adds_cooling_load():
    model = PowerDissipationModel()
    cool = model.compute_power_draw(velocity=1.0, acceleration=0.0, slope_radians=0.0, ambient_temp_c=25.0)
    hot = model.compute_power_draw(velocity=1.0, acceleration=0.0, slope_radians=0.0, ambient_temp_c=80.0)
    assert hot > cool


def test_step_drains_battery_over_time():
    model = PowerDissipationModel()
    telemetry = model.step(velocity=1.5, acceleration=0.1, slope_radians=0.0, ambient_temp_c=24.0, dt_seconds=1.0)
    assert telemetry["battery_wh"] < model.battery_max_wh
    assert telemetry["battery_pct"] < 100.0


def test_critical_reserve_flag_below_15_percent():
    model = PowerDissipationModel(battery_capacity_wh=100.0)
    model.battery_wh = 10.0  # 10%
    telemetry = model.step(velocity=0.0, acceleration=0.0, slope_radians=0.0, ambient_temp_c=24.0, dt_seconds=0.01)
    assert telemetry["is_critical_reserve"]


def test_low_battery_engages_fuel_generator():
    model = PowerDissipationModel(battery_capacity_wh=100.0, fuel_capacity_liters=5.0)
    model.battery_wh = 10.0  # below the 20% aux-generator threshold
    fuel_before = model.fuel_liters
    model.step(velocity=0.0, acceleration=0.0, slope_radians=0.0, ambient_temp_c=24.0, dt_seconds=10.0)
    assert model.fuel_liters < fuel_before
