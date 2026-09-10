"""
AEGIS-NAV Simulation Session Coordinator
-----------------------------------------
Stateless in-memory orchestration loop:
- Synchronizes Cost Field, Global Planners (A* / D* Lite), Local APF+DWA, and Power Model.
- Runs at 20-30 Hz without database or file I/O dependencies.
"""

import math
import time
import numpy as np
from typing import List, Tuple, Dict, Any, Optional

from .cost_field import MultiObjectiveCostField
from .planners.astar import AStarPlanner
from .planners.dstar_lite import DStarLitePlanner
from .kinematics.apf_dwa import APF_DWA_Controller, DynamicObstacle
from .kinematics.power_model import PowerDissipationModel


class VictimEntity:
    """Represents a human casualty in the disaster zone."""
    def __init__(self, victim_id: str, x: float, y: float, triage: str = "CONSCIOUS_TRAPPED", temp_c: float = 37.2):
        self.id = victim_id
        self.x = x
        self.y = y
        self.triage = triage
        self.temp_c = temp_c
        self.detected = False


class RoverSimulationSession:
    """
    Stateless per-connection simulation world.
    Purely in-memory, deterministic, and high performance.
    """

    def __init__(self, width: int = 100, height: int = 100):
        self.width = width
        self.height = height

        # 1. Environment & Cost Field
        self.cost_field = MultiObjectiveCostField(width=width, height=height)

        # 2. Global Planners
        self.astar = AStarPlanner(self.cost_field)
        self.dstar = DStarLitePlanner(self.cost_field)
        self.active_planner = "dstar_lite" # "astar" | "dstar_lite"

        # 3. Kinematics & Power Model
        self.controller = APF_DWA_Controller(v_max=2.2, omega_max=1.8)
        self.power_model = PowerDissipationModel()

        # 4. Navigation State
        self.start = (10, 10)
        self.goal = (88, 85)
        self.x = float(self.start[0])
        self.y = float(self.start[1])
        self.heading = 0.0
        self.v = 0.0
        self.omega = 0.0

        # Waypoint sequence
        self.current_path: List[Tuple[int, int]] = []
        self.current_waypoint_idx = 0

        # 5. Dynamic Entities
        self.dynamic_obstacles: List[DynamicObstacle] = [
            DynamicObstacle(x=35.0, y=25.0, vx=1.2, vy=-0.8, radius=1.5),
            DynamicObstacle(x=60.0, y=70.0, vx=-0.9, vy=1.1, radius=1.8),
            DynamicObstacle(x=48.0, y=42.0, vx=0.8, vy=0.6, radius=1.4),
        ]

        # 6. Casualties / Victims
        self.victims: List[VictimEntity] = [
            VictimEntity("CAS-ALPHA-1", x=48.5, y=52.0, triage="CONSCIOUS_TRAPPED", temp_c=37.1),
            VictimEntity("CAS-BETA-2", x=82.0, y=78.0, triage="HYPOTHERMIC", temp_c=34.6),
        ]
        self.sos_transmissions: List[Dict[str, Any]] = []

        # 7. Benchmarking Cache
        self.benchmark_stats = {
            "astar": {"latency_ms": 0.0, "path_length": 0.0, "nodes_expanded": 0, "energy_kj": 0.0},
            "dstar_lite": {"latency_ms": 0.0, "path_length": 0.0, "nodes_expanded": 0, "energy_kj": 0.0},
        }

        # Initialize initial global path
        self.compute_initial_path()

    def get_initial_map(self) -> Dict[str, Any]:
        """Exports static environmental layers on connection initialization."""
        return {
            "width": self.width,
            "height": self.height,
            "resolution": self.cost_field.resolution,
            "start": list(self.start),
            "goal": list(self.goal),
            "elevation": self.cost_field.elevation.tolist(),
            "temperature": self.cost_field.temperature.tolist(),
            "obstacles": self.cost_field.obstacles.tolist(),
            "victims": [
                {"id": v.id, "x": v.x, "y": v.y, "triage": v.triage, "temp_c": v.temp_c}
                for v in self.victims
            ],
            "initial_path": self.current_path,
        }

    def compute_initial_path(self):
        """Computes both A* and D* Lite paths for comparative baseline."""
        # 1. Baseline A*
        astar_res = self.astar.plan(self.start, self.goal)
        if astar_res["success"]:
            self.benchmark_stats["astar"] = {
                "latency_ms": astar_res["latency_ms"],
                "path_length": astar_res["path_length"],
                "nodes_expanded": astar_res["nodes_expanded"],
                "energy_kj": 0.0,
            }

        # 2. D* Lite
        dstar_res = self.dstar.plan(self.start, self.goal)
        if dstar_res["success"]:
            self.benchmark_stats["dstar_lite"] = {
                "latency_ms": dstar_res["latency_ms"],
                "path_length": dstar_res["path_length"],
                "nodes_expanded": dstar_res["nodes_expanded"],
                "energy_kj": 0.0,
            }
            self.current_path = dstar_res["path"]
        else:
            self.current_path = astar_res["path"]

        self.current_waypoint_idx = 0

    def step(self, dt: float = 0.05) -> Dict[str, Any]:
        """
        Advances the simulation by dt seconds (called at 20 Hz).
        """
        # 1. Advance dynamic obstacles
        for obs in self.dynamic_obstacles:
            obs.step(dt, self.width, self.height)

        # 2. Determine target waypoint along global path
        target = self.goal
        if self.current_path and self.current_waypoint_idx < len(self.current_path):
            curr_target = self.current_path[self.current_waypoint_idx]
            dist_to_wp = math.hypot(curr_target[0] - self.x, curr_target[1] - self.y)

            # Advance waypoint if reached threshold
            if dist_to_wp < 1.8 and self.current_waypoint_idx < len(self.current_path) - 1:
                self.current_waypoint_idx += 1
                curr_target = self.current_path[self.current_waypoint_idx]
            target = curr_target

        # 3. Local APF + DWA Reactive Control
        current_pose = (self.x, self.y, self.heading)
        current_vel = (self.v, self.omega)
        best_v, best_w, projected_traj = self.controller.select_velocity(
            current_pose=current_pose,
            current_vel=current_vel,
            target_waypoint=(float(target[0]), float(target[1])),
            dynamic_obstacles=self.dynamic_obstacles,
            dt_step=dt
        )

        # 4. Integrate Kinematics (Unicycle Model)
        self.v = best_v
        self.omega = best_w
        self.x += self.v * math.cos(self.heading) * dt
        self.y += self.v * math.sin(self.heading) * dt
        self.heading += self.omega * dt

        # Normalize angle to [-π, π]
        self.heading = math.atan2(math.sin(self.heading), math.cos(self.heading))

        # Clamp within grid bounds
        self.x = max(1.0, min(self.width - 2.0, self.x))
        self.y = max(1.0, min(self.height - 2.0, self.y))

        # 5. Extract local environmental variables for Power Draw
        grid_x = int(np.clip(self.x, 0, self.width - 1))
        grid_y = int(np.clip(self.y, 0, self.height - 1))

        slope_rad = float(self.cost_field.slope_field[grid_y, grid_x])
        ambient_temp = float(self.cost_field.temperature[grid_y, grid_x])

        power_telemetry = self.power_model.step(
            velocity=self.v,
            acceleration=0.1 if self.v > 0.1 else 0.0,
            slope_radians=slope_rad,
            ambient_temp_c=ambient_temp,
            dt_seconds=dt
        )

        # Low battery safety reaction: prune steep routes
        if power_telemetry["is_critical_reserve"] and self.cost_field.w_slope < 8.0:
            self.cost_field.w_slope = 10.0 # Extreme aversion to climbs
            self.cost_field.recompute_all()
            self._trigger_replan()

        # 6. Victim Perception Frustum Sweep (60 deg cone, 12m radius)
        new_sos = self._sweep_perception_frustum()

        return {
            "pose": {
                "x": round(self.x, 2),
                "y": round(self.y, 2),
                "heading_rad": round(self.heading, 3),
                "heading_deg": round(math.degrees(self.heading), 1),
                "velocity": round(self.v, 2),
                "angular_velocity": round(self.omega, 2),
            },
            "environment": {
                "elevation": round(float(self.cost_field.elevation[grid_y, grid_x]), 2),
                "slope_deg": round(math.degrees(slope_rad), 1),
                "ambient_temp_c": round(ambient_temp, 1),
            },
            "power": power_telemetry,
            "path": self.current_path,
            "waypoint_index": self.current_waypoint_idx,
            "dynamic_obstacles": [
                {"x": round(o.x, 2), "y": round(o.y, 2), "vx": round(o.vx, 2), "vy": round(o.vy, 2), "radius": o.radius}
                for o in self.dynamic_obstacles
            ],
            "benchmark": self.benchmark_stats,
            "new_sos": new_sos,
            "sos_count": len(self.sos_transmissions),
        }

    def _sweep_perception_frustum(self) -> Optional[Dict[str, Any]]:
        """Simulated FLIR vision/thermal sweep detecting casualties within sensor range."""
        sensor_range = 14.0
        fov_rad = math.radians(60.0)

        for v in self.victims:
            if v.detected:
                continue

            dx = v.x - self.x
            dy = v.y - self.y
            dist = math.hypot(dx, dy)

            if dist <= sensor_range:
                angle_to_victim = math.atan2(dy, dx)
                angle_diff = abs(self.controller._normalize_angle(angle_to_victim - self.heading))

                if angle_diff <= fov_rad / 2.0:
                    v.detected = True
                    grid_x = int(np.clip(v.x, 0, self.width - 1))
                    grid_y = int(np.clip(v.y, 0, self.height - 1))
                    elevation = float(self.cost_field.elevation[grid_y, grid_x])

                    sos_packet = {
                        "transmission_id": f"TAC-SAR-{v.id}",
                        "victim_id": v.id,
                        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "target_coordinates": {"x": round(v.x, 2), "y": round(v.y, 2), "elevation": round(elevation, 2)},
                        "triage_status": v.triage,
                        "vital_thermal_signature": f"{v.temp_c}°C",
                        "ambient_temperature": f"{self.cost_field.temperature[grid_y, grid_x]:.1f}°C",
                        "extraction_corridor": "AIR-DROP-SECTOR-4",
                    }
                    self.sos_transmissions.append(sos_packet)
                    return sos_packet

        return None

    def handle_mutation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes operator / judge map mutations in real time:
        - "drop_obstacle": Drops rubble / collapsed wall
        - "add_heat_zone": Spawns fire / chemical thermal burst
        - "switch_planner": Toggles between A* baseline and D* Lite
        """
        action_type = payload.get("type")
        modified_cells = []

        if action_type == "drop_obstacle":
            ox = int(payload.get("x", 50))
            oy = int(payload.get("y", 50))
            radius = int(payload.get("radius", 3))
            self.cost_field.drop_obstacle(ox, oy, radius)

            # Record modified coordinates
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dx*dx + dy*dy <= radius*radius:
                        mx, my = ox + dx, oy + dy
                        if 0 <= mx < self.width and 0 <= my < self.height:
                            modified_cells.append((mx, my))

            self.cost_field.recompute_all()

        elif action_type == "add_heat_zone":
            hx = int(payload.get("x", 50))
            hy = int(payload.get("y", 50))
            temp = float(payload.get("temp", 80.0))
            sigma = float(payload.get("sigma", 6.0))
            self.cost_field.add_thermal_source((hx, hy), temp, sigma)
            self.cost_field.recompute_all()

            # Mark neighborhood as modified for incremental repair
            rad = int(sigma * 2)
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    mx, my = hx + dx, hy + dy
                    if 0 <= mx < self.width and 0 <= my < self.height:
                        modified_cells.append((mx, my))

        elif action_type == "switch_planner":
            self.active_planner = payload.get("planner", "dstar_lite")
            return {"status": "ok", "active_planner": self.active_planner}

        elif action_type == "emergency_low_battery":
            self.power_model.battery_wh = 40.0 # Force < 10%
            self.cost_field.w_slope = 12.0
            self.cost_field.recompute_all()
            return self._trigger_replan()

        # Trigger replan benchmark showdown
        return self._trigger_replan(modified_cells)

    def _trigger_replan(self, modified_cells: Optional[List[Tuple[int, int]]] = None) -> Dict[str, Any]:
        """Runs both planners to compare replanning latency on the same mutation."""
        rover_grid = (int(np.clip(self.x, 0, self.width - 1)), int(np.clip(self.y, 0, self.height - 1)))

        # 1. Baseline A* (Full Recomputation from scratch)
        astar_res = self.astar.plan(rover_grid, self.goal)
        self.benchmark_stats["astar"]["latency_ms"] = astar_res["latency_ms"]
        self.benchmark_stats["astar"]["path_length"] = astar_res["path_length"]
        self.benchmark_stats["astar"]["nodes_expanded"] = astar_res["nodes_expanded"]

        # 2. Production D* Lite (Incremental Repair)
        if modified_cells and self.dstar.initialized:
            dstar_res = self.dstar.repair_on_mutation(rover_grid, modified_cells)
        else:
            dstar_res = self.dstar.plan(rover_grid, self.goal)

        self.benchmark_stats["dstar_lite"]["latency_ms"] = dstar_res["latency_ms"]
        self.benchmark_stats["dstar_lite"]["path_length"] = dstar_res["path_length"]
        self.benchmark_stats["dstar_lite"]["nodes_expanded"] = dstar_res["nodes_expanded"]

        # Assign active path
        if self.active_planner == "dstar_lite" and dstar_res["success"]:
            self.current_path = dstar_res["path"]
        elif astar_res["success"]:
            self.current_path = astar_res["path"]

        self.current_waypoint_idx = 0

        return {
            "status": "replanned",
            "active_planner": self.active_planner,
            "astar_latency_ms": astar_res["latency_ms"],
            "dstar_latency_ms": dstar_res["latency_ms"],
            "speedup_factor": round(astar_res["latency_ms"] / max(0.01, dstar_res["latency_ms"]), 1),
            "new_path_length": len(self.current_path),
        }
