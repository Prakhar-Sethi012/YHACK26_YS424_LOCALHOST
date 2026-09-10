from simulation.cost_field import MultiObjectiveCostField


def make_flat_field(width=20, height=20):
    field = MultiObjectiveCostField(width=width, height=height)
    field.elevation[:] = 0.0
    field.obstacles[:] = False
    field.temperature[:] = 24.0
    field.recompute_all()
    return field


def test_open_flat_cell_has_finite_baseline_cost():
    field = make_flat_field()
    cost = field.get_traversability_cost(5, 5)
    assert cost == field.w_dist  # no slope, heat, or clearance penalty on a flat open field


def test_obstacle_cell_is_impassable():
    field = make_flat_field()
    field.drop_obstacle(10, 10, radius=1)
    field.recompute_all()
    assert field.get_traversability_cost(10, 10) == float("inf")


def test_thermal_source_raises_nearby_temperature():
    field = make_flat_field()
    baseline_temp = float(field.temperature[10, 10])
    field.add_thermal_source(center=(10, 10), peak_temp=90.0, sigma=4.0)
    assert float(field.temperature[10, 10]) > baseline_temp


def test_hot_cell_costs_more_than_cool_cell():
    field = make_flat_field()
    field.add_thermal_source(center=(10, 10), peak_temp=95.0, sigma=3.0)
    field.recompute_all()
    hot_cost = field.get_traversability_cost(10, 10)
    cool_cost = field.get_traversability_cost(0, 0)
    assert hot_cost > cool_cost


def test_out_of_bounds_cost_is_infinite():
    field = make_flat_field()
    assert field.get_traversability_cost(-1, 0) == float("inf")
    assert field.get_traversability_cost(0, field.height) == float("inf")
