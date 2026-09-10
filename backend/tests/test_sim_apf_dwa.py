import math

from simulation.kinematics.apf_dwa import APF_DWA_Controller, DynamicObstacle


def test_select_velocity_moves_toward_target_with_no_obstacles():
    controller = APF_DWA_Controller()
    v, omega, traj = controller.select_velocity(
        current_pose=(0.0, 0.0, 0.0),
        current_vel=(0.0, 0.0),
        target_waypoint=(10.0, 0.0),
        dynamic_obstacles=[],
        dt_step=0.1,
    )
    assert v > 0.0  # should accelerate forward toward a target straight ahead
    assert len(traj) > 1


def test_select_velocity_brakes_when_fully_surrounded():
    controller = APF_DWA_Controller(rover_radius=1.0)
    # Obstacles packed tightly enough that every sampled trajectory collides.
    obstacles = [
        DynamicObstacle(x=0.3, y=0.0, vx=0.0, vy=0.0, radius=1.0),
        DynamicObstacle(x=-0.3, y=0.0, vx=0.0, vy=0.0, radius=1.0),
        DynamicObstacle(x=0.0, y=0.3, vx=0.0, vy=0.0, radius=1.0),
        DynamicObstacle(x=0.0, y=-0.3, vx=0.0, vy=0.0, radius=1.0),
    ]
    v, omega, traj = controller.select_velocity(
        current_pose=(0.0, 0.0, 0.0),
        current_vel=(1.0, 0.0),
        target_waypoint=(10.0, 0.0),
        dynamic_obstacles=obstacles,
        dt_step=0.1,
    )
    assert v == 0.0 and omega == 0.0  # emergency brake, no admissible trajectory


def test_dynamic_obstacle_predicts_linear_motion():
    obs = DynamicObstacle(x=0.0, y=0.0, vx=2.0, vy=-1.0)
    x, y = obs.predict_position(2.0)
    assert math.isclose(x, 4.0)
    assert math.isclose(y, -2.0)


def test_dynamic_obstacle_bounces_off_bounds():
    obs = DynamicObstacle(x=0.5, y=10.0, vx=-1.0, vy=0.0, radius=0.5)
    obs.step(dt=1.0, bounds_w=100.0, bounds_h=100.0)
    assert obs.vx > 0.0  # reflected after hitting the left wall
