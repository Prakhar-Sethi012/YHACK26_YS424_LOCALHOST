import aegis_core


def test_dstar_lite_matches_astar_on_open_grid():
    grid = aegis_core.Grid2D(20, 20)
    grid.recompute_clearance()

    astar = aegis_core.AStarPlanner()
    astar_result = astar.plan(grid, (0, 0), (15, 15))

    dstar = aegis_core.DStarLitePlanner()
    dstar_result = dstar.init(grid, (0, 0), (15, 15))

    assert astar_result.found and dstar_result.found
    assert abs(astar_result.cost - dstar_result.cost) < 1e-6


def test_dstar_lite_repairs_around_a_newly_dropped_wall():
    grid = aegis_core.Grid2D(20, 20)
    grid.recompute_clearance()

    dstar = aegis_core.DStarLitePlanner()
    initial = dstar.init(grid, (0, 5), (19, 5))
    assert initial.found
    assert any(x == 10 and y == 5 for x, y in initial.path)

    changed_cells = [(10, y) for y in range(0, 15)]
    blocked = [True] * len(changed_cells)
    repaired = dstar.update_obstacles(changed_cells, blocked)

    assert repaired.found
    assert all(not (x == 10 and y < 15) for x, y in repaired.path)


def test_dstar_lite_replan_latency_is_fast_on_100x100():
    grid = aegis_core.Grid2D(100, 100)
    grid.recompute_clearance()

    dstar = aegis_core.DStarLitePlanner()
    dstar.init(grid, (0, 0), (99, 99))

    result = dstar.update_obstacles([(50, 50)], [True])

    assert result.found
    assert result.latency_ms < 25.0


def test_dstar_lite_clearing_an_obstacle_reopens_the_shortcut():
    grid = aegis_core.Grid2D(20, 20)
    for y in range(0, 15):
        grid.set_obstacle(10, y, True)
    grid.recompute_clearance()

    dstar = aegis_core.DStarLitePlanner()
    blocked_result = dstar.init(grid, (0, 5), (19, 5))
    assert blocked_result.found
    assert not any(x == 10 and y == 5 for x, y in blocked_result.path)

    reopened = dstar.update_obstacles([(10, 5)], [False])

    assert reopened.found
    assert any(x == 10 and y == 5 for x, y in reopened.path)
    assert reopened.cost < blocked_result.cost
