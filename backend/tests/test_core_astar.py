import aegis_core


def make_open_grid(width=20, height=20):
    return aegis_core.Grid2D(width, height)


def test_astar_finds_straight_path_on_open_grid():
    grid = make_open_grid()
    grid.recompute_clearance()
    planner = aegis_core.AStarPlanner()

    result = planner.plan(grid, (0, 0), (10, 0))

    assert result.found
    assert result.path[0] == (0, 0)
    assert result.path[-1] == (10, 0)
    assert result.cost > 0


def test_astar_prefers_diagonal_over_zigzag():
    grid = make_open_grid()
    grid.recompute_clearance()
    planner = aegis_core.AStarPlanner()

    result = planner.plan(grid, (0, 0), (5, 5))

    assert result.found
    # A pure diagonal route costs 5*sqrt(2) plus the per-cell penalty terms;
    # a zigzag route of the same displacement is strictly longer, so the
    # optimal path must be no worse than the diagonal-only distance term.
    assert result.cost <= 5 * 1.4142135623730951 + 1.0


def test_astar_routes_around_a_wall():
    grid = make_open_grid()
    for y in range(0, 15):
        grid.set_obstacle(10, y, True)
    grid.recompute_clearance()
    planner = aegis_core.AStarPlanner()

    result = planner.plan(grid, (0, 5), (19, 5))

    assert result.found
    assert all(not (x == 10 and y < 15) for x, y in result.path)


def test_astar_reports_unreachable_goal():
    grid = make_open_grid(10, 10)
    for y in range(10):
        grid.set_obstacle(5, y, True)
    grid.recompute_clearance()
    planner = aegis_core.AStarPlanner()

    result = planner.plan(grid, (0, 0), (9, 9))

    assert not result.found


def test_thermal_hazard_increases_cost_of_a_hotter_route():
    grid = make_open_grid(10, 3)
    grid.recompute_clearance()
    weights = aegis_core.CostWeights()
    weights.w_temp = 5.0
    planner = aegis_core.AStarPlanner(weights)

    baseline = planner.plan(grid, (0, 1), (9, 1))

    for x in range(10):
        grid.set_hazard(x, 1, 100.0, 0.0)
    grid.recompute_clearance()
    hazardous = planner.plan(grid, (0, 1), (9, 1))

    assert hazardous.found and baseline.found
    assert hazardous.cost > baseline.cost
