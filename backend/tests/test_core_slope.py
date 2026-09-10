import aegis_core


def flat_heightmap(width, height, value=0.0):
    return [[value for _ in range(width)] for _ in range(height)]


def test_flat_elevation_has_zero_slope_penalty():
    grid = aegis_core.Grid2D(10, 10)
    grid.set_elevation_grid(flat_heightmap(10, 10, value=42.0))  # uniform, not just zero

    cell = grid.get_cell(5, 5)
    assert cell.slope_penalty == 0.0
    assert cell.rollover_impassable is False


def test_steep_cliff_is_rollover_impassable():
    heightmap = flat_heightmap(20, 20, value=0.0)
    for y in range(20):
        for x in range(10, 20):
            heightmap[y][x] = 100.0  # sharp step at x=10: ~89 degree slope over 2 cells

    grid = aegis_core.Grid2D(20, 20)
    grid.set_elevation_grid(heightmap)

    cell = grid.get_cell(10, 10)
    assert cell.rollover_impassable is True

    weights = aegis_core.CostWeights()
    assert grid.cell_cost(10, 10, weights) == float("inf")


def test_gentle_ramp_is_traversable_but_penalized():
    # Elevation rises 5cm per cell over 20 cells -> ~3 degree slope, well
    # under the 35 degree threshold, but should still cost more than flat
    # ground. (A 1m-per-cell rise would be a 45 degree slope, not gentle.)
    heightmap = [[float(x) * 0.05 for x in range(20)] for _ in range(20)]

    grid = aegis_core.Grid2D(20, 20)
    grid.set_elevation_grid(heightmap)

    ramp_cell = grid.get_cell(10, 10)
    assert ramp_cell.rollover_impassable is False
    assert ramp_cell.slope_penalty > 0.0

    weights = aegis_core.CostWeights()
    flat_grid = aegis_core.Grid2D(20, 20)
    flat_grid.set_elevation_grid(flat_heightmap(20, 20))

    assert grid.cell_cost(10, 10, weights) > flat_grid.cell_cost(10, 10, weights)


def test_astar_routes_around_a_cliff_when_a_flat_detour_exists():
    heightmap = flat_heightmap(20, 20, value=0.0)
    # A tall wall across x in [8, 12] for the top 13 rows, with a flat gap
    # below y=13 -- the only way from left to right is through that gap.
    for y in range(0, 13):
        for x in range(8, 13):
            heightmap[y][x] = 200.0

    grid = aegis_core.Grid2D(20, 20)
    grid.set_elevation_grid(heightmap)

    planner = aegis_core.AStarPlanner()
    result = planner.plan(grid, (2, 2), (17, 2))

    assert result.found
    # The wall's flat top (its interior columns) has zero gradient and isn't
    # itself impassable -- but it's unreachable without first crossing a
    # steep edge column, so a correct planner still avoids the whole
    # structure rather than "flying" onto the plateau.
    assert all(not (9 <= x <= 11 and y <= 11) for x, y in result.path)
    # Actually used the gap, rather than some other route entirely.
    assert any(8 <= x <= 12 and y >= 13 for x, y in result.path)


def test_set_elevation_grid_smaller_than_grid_applies_partially_without_crashing():
    grid = aegis_core.Grid2D(20, 20)
    small_heightmap = flat_heightmap(5, 5, value=10.0)

    grid.set_elevation_grid(small_heightmap)  # must not raise

    assert grid.get_cell(2, 2).elevation == 10.0
    assert grid.get_cell(15, 15).elevation == 0.0  # untouched, outside the small map
