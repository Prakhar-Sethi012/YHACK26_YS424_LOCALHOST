from simulation.cost_field import MultiObjectiveCostField
from simulation.planners.astar import AStarPlanner


def make_flat_field(width=20, height=20):
    field = MultiObjectiveCostField(width=width, height=height)
    field.elevation[:] = 0.0
    field.obstacles[:] = False
    field.temperature[:] = 24.0
    field.recompute_all()
    return field


def test_astar_finds_a_path_on_open_grid():
    field = make_flat_field()
    planner = AStarPlanner(field)

    result = planner.plan((0, 0), (10, 0))

    assert result["success"]
    assert result["path"][0] == (0, 0)
    assert result["path"][-1] == (10, 0)


def test_astar_routes_around_a_wall():
    field = make_flat_field()
    for y in range(0, 15):
        field.drop_obstacle(10, y, radius=0)
    field.recompute_all()
    planner = AStarPlanner(field)

    result = planner.plan((0, 5), (19, 5))

    assert result["success"]
    assert all(not (x == 10 and y < 15) for x, y in result["path"])


def test_astar_reports_failure_for_unreachable_goal():
    field = make_flat_field(10, 10)
    for y in range(10):
        field.drop_obstacle(5, y, radius=0)
    field.recompute_all()
    planner = AStarPlanner(field)

    result = planner.plan((0, 0), (9, 9))

    assert not result["success"]
    assert result["path"] == []


def test_astar_start_inside_obstacle_fails_fast():
    field = make_flat_field()
    field.drop_obstacle(0, 0, radius=0)
    field.recompute_all()
    planner = AStarPlanner(field)

    result = planner.plan((0, 0), (5, 5))

    assert not result["success"]
    assert result["error"] == "Start inside obstacle"
