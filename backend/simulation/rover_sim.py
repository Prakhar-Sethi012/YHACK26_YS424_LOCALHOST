"""
AEGIS-NAV Simulation Session Coordinator
-----------------------------------------
Stateless in-memory orchestration loop:
- Synchronizes Cost Field, Local APF+DWA, and Power Model.
- Runs at 20-30 Hz without database or file I/O dependencies.

Phase 5: this no longer plans locally. Global pathfinding (A* / D* Lite) is
Backend 2's job (backend/src -- the C++ aegis_core engine behind a FastAPI
REST API). This module is a client of that API: it pushes its terrain onto
Backend 2's grid once at startup, then calls /api/plan/baseline for the
initial route and /api/grid/mutate whenever an obstacle changes. Backend 2
returns a 2D path [(x, y)]; _rebuild_3d_path() samples this module's own
elevation heightmap at each waypoint (bilinear interpolation) and runs a
Catmull-Rom smoothing pass to produce the Path3D this session actually
streams to the client.

Fixed in a later pass (both touching Backend 2's C++ core directly, since
by that point both were explicitly in scope):
- POST /api/grid/mutate now accepts `current_position`, which moves D* Lite's
  internal start there before repairing -- a repaired path picks up from
  wherever the rover actually is, not wherever init() was last called from.
  _replan_via_mutate sends the rover's live grid cell on every call.
- POST /api/grid/init now accepts an `elevation` heightmap. Backend 2's
  Grid2D computes a real slope penalty and a hard rollover-impassable
  threshold (35 degrees) from it via CostWeights.w_slope, so the C++
  planners now know the world isn't flat -- _sync_grid_to_backend2 pushes
  this module's own heightmap there once at startup, and
  "emergency_low_battery" biases the real w_slope remotely instead of a
  thermal-weight proxy for it.

One limitation remains, inherent to Backend 2's current REST contract and
accepted rather than fixed (by explicit choice -- this endpoint's job is
obstacle changes, not a general "recompute everything" call):
- POST /api/grid/hazards updates Backend 2's cost field but never touches
  its D* Lite planner state, so a hazard-only change (add_heat_zone) has no
  incremental-repair path there at all -- this session falls back to a
  fresh /api/plan/baseline call for those, which does reset Backend 2's D*
  Lite state (same cost any full replan would carry).

Added for live operator control (play/pause + manual start/goal):
- "set_paused" doesn't touch physics itself -- server.py's tick loop is what
  actually skips step() while self.paused is set, via get_last_frame(),
  which freezes the rover AND the dynamic obstacles rather than advancing
  either. "set_start"/"set_goal" both go through the same
  _replan_via_baseline() path as the existing mutation handlers, so they
  return an ordinary "replanned" ack with no new frontend types needed.
  self.goal and self.paused are streamed in every telemetry frame (not just
  get_initial_map()) since either can change mid-mission now.

Added for time-warp: "set_time_warp" only records the requested factor on
self.time_warp -- server.py's tick loop is what actually multiplies dt by
it before calling step(), same division of responsibility as "set_paused"
above. The wall-clock tick rate (and therefore the WebSocket send cadence)
is untouched; only the amount of simulated time each tick advances changes.
"""

import asyncio
import logging
import math
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np

from .cost_field import MultiObjectiveCostField
from .kinematics.apf_dwa import APF_DWA_Controller, DynamicObstacle
from .kinematics.power_model import PowerDissipationModel

logger = logging.getLogger("AEGIS-NAV-BACKEND")

BACKEND2_BASE_URL = os.environ.get("BACKEND2_BASE_URL", "http://localhost:8001")


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
    Purely in-memory, deterministic, and high performance. Plans by calling
    out to Backend 2's REST API rather than running a local planner.
    """

    def __init__(self, width: int = 100, height: int = 100):
        self.width = width
        self.height = height

        # 1. Environment & Cost Field (still owned locally: elevation for the
        # Z-mapping, and hazards/obstacles for APF/DWA's own awareness).
        self.cost_field = MultiObjectiveCostField(width=width, height=height)

        # 2. Kinematics & Power Model
        self.controller = APF_DWA_Controller(v_max=2.2, omega_max=1.8)
        self.power_model = PowerDissipationModel()

        # 3. Navigation State
        self.start = (10, 10)
        self.goal = (88, 85)
        self.x = float(self.start[0])
        self.y = float(self.start[1])
        self.heading = 0.0
        self.v = 0.0
        self.omega = 0.0

        # Waypoint sequence -- 2D, as returned by Backend 2, used for local
        # waypoint-following/steering. current_path_3d is the Z-mapped,
        # smoothed version actually streamed to the client.
        self.current_path: List[Tuple[int, int]] = []
        self.current_path_3d: List[Tuple[float, float, float]] = []
        self.current_waypoint_idx = 0

        # 4. Dynamic Entities
        self.dynamic_obstacles: List[DynamicObstacle] = [
            DynamicObstacle(x=35.0, y=25.0, vx=1.2, vy=-0.8, radius=1.5),
            DynamicObstacle(x=60.0, y=70.0, vx=-0.9, vy=1.1, radius=1.8),
            DynamicObstacle(x=48.0, y=42.0, vx=0.8, vy=0.6, radius=1.4),
        ]

        # 5. Casualties / Victims
        self.victims: List[VictimEntity] = [
            VictimEntity("CAS-ALPHA-1", x=48.5, y=52.0, triage="CONSCIOUS_TRAPPED", temp_c=37.1),
            VictimEntity("CAS-BETA-2", x=82.0, y=78.0, triage="HYPOTHERMIC", temp_c=34.6),
        ]
        self.sos_transmissions: List[Dict[str, Any]] = []

        # 6. Benchmarking Cache -- "astar" reflects Backend 2's last
        # /api/plan/baseline call (a fresh full replan); "dstar_lite"
        # reflects its last /api/grid/mutate call (incremental repair). These
        # are not a live per-event A*-vs-D*-Lite rerun -- see
        # _replan_via_mutate's docstring.
        self.benchmark_stats = {
            "astar": {"latency_ms": 0.0, "path_length": 0.0, "nodes_expanded": 0, "energy_kj": 0.0},
            "dstar_lite": {"latency_ms": 0.0, "path_length": 0.0, "nodes_expanded": 0, "energy_kj": 0.0},
        }

        # 7. Backend 2 REST client
        self._http = httpx.AsyncClient(base_url=BACKEND2_BASE_URL, timeout=10.0)
        self._replan_task: Optional[asyncio.Task] = None

        # 8. Play/pause -- server.py's tick loop skips step() entirely while
        # paused (see get_last_frame()), which freezes the rover AND the
        # dynamic obstacles rather than just stopping the rover in place.
        self.paused: bool = False
        self._last_frame: Optional[Dict[str, Any]] = None

        # 9. Time warp -- server.py's tick loop keeps ticking at real 20Hz
        # (so the WebSocket cadence and everyone else's frame budget are
        # unaffected) but scales the *simulated* dt passed into step() by
        # this factor, so kinematics/fuel drain/movement advance faster per
        # wall-clock tick without touching the network tick rate itself.
        self.time_warp: float = 1.0

    # ------------------------------------------------------------------
    # Backend 2 integration
    # ------------------------------------------------------------------

    async def initialize_backend2_planning(self) -> None:
        """Pushes this session's terrain onto Backend 2's grid, then requests
        the initial baseline path. Must be awaited before get_initial_map()
        is read -- called once from server.py right after construction."""
        await self._sync_grid_to_backend2()
        result = await self._replan_via_baseline()
        if result.get("status") != "replanned":
            logger.warning("Initial Backend 2 plan failed: %s", result)

    async def _sync_grid_to_backend2(self) -> None:
        """One-time push of obstacles + hazards onto Backend 2's grid. Retries
        the first call with backoff: `sim` and `api` start concurrently in
        compose, so this can race api's FastAPI startup by a second or two."""
        obstacle_indices = np.argwhere(self.cost_field.obstacles)  # rows are [y, x]
        obstacles = [[int(x), int(y)] for y, x in obstacle_indices.tolist()]

        last_error: Optional[Exception] = None
        for attempt in range(5):
            try:
                resp = await self._http.post(
                    "/api/grid/init",
                    json={
                        "width": self.width,
                        "height": self.height,
                        "resolution": float(self.cost_field.resolution),
                        "obstacles": obstacles,
                        "elevation": self.cost_field.elevation.tolist(),
                    },
                )
                resp.raise_for_status()
                break
            except httpx.HTTPError as exc:
                last_error = exc
                logger.warning("Backend 2 not ready yet (attempt %d/5): %s", attempt + 1, exc)
                await asyncio.sleep(1.0 * (attempt + 1))
        else:
            raise RuntimeError(f"Backend 2 unreachable at {BACKEND2_BASE_URL} after 5 attempts") from last_error

        # Backend 2's /api/grid/hazards takes circle/polygon shapes, not a raw
        # grid overlay, so these mirror cost_field.py's own hardcoded thermal
        # sources by hand (_generate_default_disaster_terrain). This drifts if
        # that generator changes -- there's no way to introspect or push a
        # full hazard grid through Backend 2's current API.
        await self._http.post(
            "/api/grid/hazards",
            json={
                "circles": [
                    {"center": [75, 70], "radius": 16.0, "thermal_hazard": 95.0, "structural_risk": 0.0},
                    {"center": [25, 40], "radius": 12.0, "thermal_hazard": 65.0, "structural_risk": 0.0},
                ]
            },
        )

    async def _push_hazard_circle(self, x: int, y: int, radius: float, thermal_hazard: float) -> None:
        try:
            resp = await self._http.post(
                "/api/grid/hazards",
                json={"circles": [{"center": [x, y], "radius": radius, "thermal_hazard": thermal_hazard, "structural_risk": 0.0}]},
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Failed to push hazard to Backend 2: %s", exc)

    async def _replan_via_baseline(self, weights: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        """Full replan via POST /api/plan/baseline, from the rover's current
        grid cell to the mission goal. Resets Backend 2's D* Lite state."""
        t0 = time.perf_counter()
        rover_grid = [int(np.clip(self.x, 0, self.width - 1)), int(np.clip(self.y, 0, self.height - 1))]
        body: Dict[str, Any] = {"start": rover_grid, "goal": list(self.goal)}
        if weights:
            body["weights"] = weights

        try:
            resp = await self._http.post("/api/plan/baseline", json=body)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            return {"status": "replan_failed", "error": str(exc)}

        round_trip_ms = (time.perf_counter() - t0) * 1000.0
        if data["found"]:
            self.current_path = [tuple(p) for p in data["path"]]
            self._rebuild_3d_path()
            self.current_waypoint_idx = 0

        self.benchmark_stats["astar"] = {
            "latency_ms": data["compute_time_ms"],
            "path_length": data["length"],
            "nodes_expanded": 0,  # aegis_core's PathResult doesn't expose this
            "energy_kj": 0.0,
        }
        # Backend 2 also (re)initializes D* Lite to this same start/goal (see
        # routers/plan.py's plan_baseline) -- its active path is identical to
        # A*'s until the first incremental repair diverges them. Mirror the
        # stats here too, or the HUD keeps showing whatever a PREVIOUS
        # /api/grid/mutate call produced (or the all-zero initial value, if
        # none ever ran) as if it still described the current plan, even
        # though that D* Lite instance no longer exists server-side.
        self.benchmark_stats["dstar_lite"] = {
            "latency_ms": data["compute_time_ms"],
            "path_length": data["length"],
            "nodes_expanded": 0,
            "energy_kj": 0.0,
        }

        return {
            "status": "replanned",
            "source": "baseline",
            "backend2_compute_time_ms": data["compute_time_ms"],
            "round_trip_ms": round_trip_ms,
            "new_path_length": len(self.current_path),
        }

    async def _replan_via_mutate(self, modified_cells: List[Tuple[int, int]]) -> Dict[str, Any]:
        """Incremental repair via POST /api/grid/mutate for an obstacle
        blocked/unblocked change. Sends the rover's current grid cell as
        current_position so the repaired path picks up from there."""
        if not modified_cells:
            return {"status": "no_op", "reason": "no changed cells to report to Backend 2"}

        t0 = time.perf_counter()
        changed_cells = [[x, y] for x, y in modified_cells]
        blocked = [bool(self.cost_field.obstacles[y, x]) for x, y in modified_cells]
        rover_grid = [int(np.clip(self.x, 0, self.width - 1)), int(np.clip(self.y, 0, self.height - 1))]

        try:
            resp = await self._http.post(
                "/api/grid/mutate",
                json={"changed_cells": changed_cells, "blocked": blocked, "current_position": rover_grid},
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            return {"status": "replan_failed", "error": str(exc)}

        round_trip_ms = (time.perf_counter() - t0) * 1000.0
        if data["found"]:
            self.current_path = [tuple(p) for p in data["path"]]
            self._rebuild_3d_path()
            self.current_waypoint_idx = 0

        self.benchmark_stats["dstar_lite"] = {
            "latency_ms": data["replan_latency_ms"],
            "path_length": len(self.current_path),
            "nodes_expanded": data["vertices_expanded"],
            "energy_kj": 0.0,
        }

        astar_latency = self.benchmark_stats["astar"]["latency_ms"]
        return {
            "status": "replanned",
            "source": "mutate",
            "backend2_repair_latency_ms": data["replan_latency_ms"],
            "round_trip_ms": round_trip_ms,
            # Compared against the original cold-start baseline latency, not a
            # fresh from-scratch replan of this specific mutation -- Backend 2
            # has no "replan with A* without touching D* Lite's state"
            # endpoint, so a true per-event apples-to-apples number isn't
            # available without resetting the incremental planner.
            "astar_baseline_latency_ms": astar_latency,
            "speedup_factor": round(astar_latency / max(0.01, data["replan_latency_ms"]), 1) if astar_latency else None,
            "new_path_length": len(self.current_path),
            "path_changed": data["path_changed"],
        }

    # ------------------------------------------------------------------
    # Z-axis mapping + smoothing
    # ------------------------------------------------------------------

    def _sample_elevation_bilinear(self, x: float, y: float) -> float:
        """Bilinearly-interpolated elevation at a (possibly sub-cell) (x, y)."""
        elevation = self.cost_field.elevation
        h, w = elevation.shape
        x = min(max(x, 0.0), w - 1.0)
        y = min(max(y, 0.0), h - 1.0)

        x0 = int(math.floor(x))
        y0 = int(math.floor(y))
        x1 = min(x0 + 1, w - 1)
        y1 = min(y0 + 1, h - 1)
        tx = x - x0
        ty = y - y0

        z00 = float(elevation[y0, x0])
        z10 = float(elevation[y0, x1])
        z01 = float(elevation[y1, x0])
        z11 = float(elevation[y1, x1])

        z0 = z00 * (1.0 - tx) + z10 * tx
        z1 = z01 * (1.0 - tx) + z11 * tx
        return z0 * (1.0 - ty) + z1 * ty

    @staticmethod
    def _catmull_rom_smooth(
        points: List[Tuple[float, float, float]], samples_per_segment: int = 6
    ) -> List[Tuple[float, float, float]]:
        """Uniform Catmull-Rom spline over 3D control points, to remove
        grid-snapping from a path whose waypoints sit on integer cells."""
        if len(points) < 3:
            return list(points)

        padded = [points[0]] + list(points) + [points[-1]]
        smoothed: List[Tuple[float, float, float]] = []

        for i in range(1, len(padded) - 2):
            p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
            for s in range(samples_per_segment):
                t = s / samples_per_segment
                t2 = t * t
                t3 = t2 * t
                point = tuple(
                    0.5
                    * (
                        (2 * p1[k])
                        + (-p0[k] + p2[k]) * t
                        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                        + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
                    )
                    for k in range(3)
                )
                smoothed.append(point)

        smoothed.append(points[-1])
        return smoothed

    def _rebuild_3d_path(self) -> None:
        points_3d = [
            (float(x), float(y), self._sample_elevation_bilinear(float(x), float(y)))
            for x, y in self.current_path
        ]
        self.current_path_3d = self._catmull_rom_smooth(points_3d)

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        await self._http.aclose()

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
            "initial_path": self.current_path_3d,  # [(x, y, z), ...] via Backend 2 + Z-mapping + smoothing
            "planning_backend": "backend2-rest",
        }

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

        # Low battery safety reaction: prune steep routes locally, and kick
        # off a background replan against Backend 2 without blocking this
        # tick -- a network round-trip mid-physics-step would stall the 20Hz
        # stream for every other client-visible field, not just the path.
        if power_telemetry["is_critical_reserve"] and self.cost_field.w_slope < 8.0:
            self.cost_field.w_slope = 10.0  # Extreme aversion to climbs, mirrored to Backend 2 below
            self.cost_field.recompute_all()
            if self._replan_task is None or self._replan_task.done():
                self._replan_task = asyncio.create_task(self._replan_via_baseline(weights={"w_slope": 10.0}))

        # 6. Victim Perception Frustum Sweep (60 deg cone, 12m radius)
        new_sos = self._sweep_perception_frustum()

        frame = {
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
            "path": self.current_path_3d,  # [(x, y, z), ...] -- smoothed Path3D
            "waypoint_index": self.current_waypoint_idx,
            "goal": list(self.goal),  # live -- set_goal can retarget this mid-mission
            "paused": self.paused,
            "time_warp": self.time_warp,
            "dynamic_obstacles": [
                {"x": round(o.x, 2), "y": round(o.y, 2), "vx": round(o.vx, 2), "vy": round(o.vy, 2), "radius": o.radius}
                for o in self.dynamic_obstacles
            ],
            "benchmark": self.benchmark_stats,
            "new_sos": new_sos,
            "sos_count": len(self.sos_transmissions),
        }
        self._last_frame = frame
        return frame

    def get_last_frame(self) -> Dict[str, Any]:
        """Returns the last computed telemetry frame without advancing the
        simulation -- what server.py streams at 20Hz while paused, so the
        rover and dynamic obstacles both stay frozen in place.

        The cached frame's own "paused"/"goal"/"time_warp" values were
        captured by whatever step() call produced it, which happened before
        the pause (or a mid-pause set_goal/set_time_warp) took effect --
        patch them from live state rather than serving stale copies of
        fields that can change while step() itself isn't running.
        """
        frame = dict(self._last_frame) if self._last_frame is not None else self.step(dt=0.0)
        frame["paused"] = self.paused
        frame["goal"] = list(self.goal)
        frame["time_warp"] = self.time_warp
        return frame

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

    async def handle_mutation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes operator / judge map mutations in real time:
        - "drop_obstacle": Drops rubble / collapsed wall, repaired incrementally via Backend 2's D* Lite.
        - "add_heat_zone": Spawns fire / chemical thermal burst, replanned via a fresh Backend 2 baseline.
        - "emergency_low_battery": Forces a conservative reroute, biasing Backend 2's real slope weight.
        - "set_start": Teleports the rover to a new grid cell and replans from there.
        - "set_goal": Retargets the mission goal and replans from the rover's current position.
        - "set_paused": Toggles whether server.py's tick loop advances step() at all.
        """
        action_type = payload.get("type")

        if action_type == "drop_obstacle":
            ox = int(payload.get("x", 50))
            oy = int(payload.get("y", 50))
            radius = int(payload.get("radius", 3))
            self.cost_field.drop_obstacle(ox, oy, radius)

            modified_cells = []
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dx * dx + dy * dy <= radius * radius:
                        mx, my = ox + dx, oy + dy
                        if 0 <= mx < self.width and 0 <= my < self.height:
                            modified_cells.append((mx, my))

            self.cost_field.recompute_all()
            return await self._replan_via_mutate(modified_cells)

        elif action_type == "add_heat_zone":
            hx = int(payload.get("x", 50))
            hy = int(payload.get("y", 50))
            temp = float(payload.get("temp", 80.0))
            sigma = float(payload.get("sigma", 6.0))
            self.cost_field.add_thermal_source((hx, hy), temp, sigma)
            self.cost_field.recompute_all()

            await self._push_hazard_circle(hx, hy, radius=sigma * 2.0, thermal_hazard=temp)
            return await self._replan_via_baseline()

        elif action_type == "emergency_low_battery":
            self.power_model.battery_wh = 40.0  # Force < 10%
            self.cost_field.w_slope = 12.0
            self.cost_field.recompute_all()
            return await self._replan_via_baseline(weights={"w_slope": 12.0})

        elif action_type == "set_start":
            sx = int(np.clip(int(payload.get("x", self.start[0])), 0, self.width - 1))
            sy = int(np.clip(int(payload.get("y", self.start[1])), 0, self.height - 1))
            self.start = (sx, sy)
            self.x = float(sx)
            self.y = float(sy)
            self.v = 0.0
            self.omega = 0.0
            self.current_waypoint_idx = 0
            return await self._replan_via_baseline()

        elif action_type == "set_goal":
            gx = int(np.clip(int(payload.get("x", self.goal[0])), 0, self.width - 1))
            gy = int(np.clip(int(payload.get("y", self.goal[1])), 0, self.height - 1))
            self.goal = (gx, gy)
            return await self._replan_via_baseline()

        elif action_type == "set_paused":
            self.paused = bool(payload.get("paused", False))
            return {"status": "no_op", "reason": f"simulation {'paused' if self.paused else 'resumed'}"}

        elif action_type == "set_time_warp":
            # Clamped defensively -- the UI only offers 1x/2x/5x, but nothing
            # stops a client from sending an arbitrary factor, and a very
            # large dt-per-tick would let the rover tunnel past waypoints
            # and dynamic obstacles the DWA controller never got a chance to
            # react to at the intermediate positions.
            factor = float(payload.get("factor", 1.0))
            self.time_warp = max(0.25, min(10.0, factor))
            return {"status": "no_op", "reason": f"time warp set to {self.time_warp}x"}

        return {"status": "ignored", "reason": f"unknown mutation type: {action_type!r}"}
