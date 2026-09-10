"""
AEGIS-NAV Local Reactive Kinematics: APF + Dynamic Window Approach (DWA)
-------------------------------------------------------------------------
Computes admissible, collision-free (v, ω) velocity pairs at 20-50 Hz.

Mathematical Formulation:
--------------------------
1. Kinematic Motion Model (Unicycle Differential Drive):
   x(t + Δt) = x(t) + v * cos(θ(t)) * Δt
   y(t + Δt) = y(t) + v * sin(θ(t)) * Δt
   θ(t + Δt) = θ(t) + ω * Δt

2. Dynamic Window Search Space V_a:
   V_s = [v_min, v_max] × [-ω_max, ω_max]               (Actuator limits)
   V_d = [v - a_max*Δt, v + a_max*Δt] × [ω - α_max*Δt, ω + α_max*Δt] (Dynamic limits)
   V_a = V_s ∩ V_d

3. Predictive Horizon with Moving Obstacles:
   Forward simulation over time horizon T_pred (e.g. 2.0 s).
   Dynamic obstacles project position along linear velocity:
   p_obs(t) = p_obs(0) + v_obs * t

4. Artificial Potential Field (APF) Repulsion:
   U_rep = 0.5 * k_rep * (1 / (d_min - r_rover) - 1 / d_safe)^2  if d_min < d_safe, else 0

5. Multi-Criteria Objective Maximization:
   G(v, ω) = α * Heading(v, ω) + β * Clearance(v, ω) + γ * Velocity(v, ω) - δ * U_rep
"""

import math
import numpy as np
from typing import List, Tuple, Dict, Optional, Any


class DynamicObstacle:
    """Represents a moving hazard (debris, rescue personnel, flood surge)."""
    def __init__(self, x: float, y: float, vx: float, vy: float, radius: float = 1.2):
        self.x = x
        self.y = y
        self.vx = vx
        self.vy = vy
        self.radius = radius

    def predict_position(self, t: float) -> Tuple[float, float]:
        """Linear ballistic trajectory projection: p(t) = p_0 + v * t"""
        return (self.x + self.vx * t, self.y + self.vy * t)

    def step(self, dt: float, bounds_w: float = 100.0, bounds_h: float = 100.0):
        """Advances obstacle position, bouncing off simulation borders."""
        self.x += self.vx * dt
        self.y += self.vy * dt
        if self.x <= self.radius or self.x >= bounds_w - self.radius:
            self.vx *= -1.0
        if self.y <= self.radius or self.y >= bounds_h - self.radius:
            self.vy *= -1.0


class APF_DWA_Controller:
    """
    Hybrid APF + DWA reactive velocity controller for dynamic obstacle evasion.
    """

    def __init__(
        self,
        v_max: float = 2.5,          # Max linear velocity (m/s)
        v_min: float = 0.0,          # Forward-only motion (m/s)
        omega_max: float = 1.8,      # Max angular velocity (rad/s)
        a_max: float = 1.5,          # Max linear acceleration (m/s^2)
        alpha_max: float = 2.5,      # Max angular acceleration (rad/s^2)
        v_samples: int = 10,         # Velocity discretization steps
        omega_samples: int = 21,     # Angular discretization steps
        predict_time: float = 2.0,   # Forward trajectory horizon (seconds)
        dt: float = 0.1,             # Simulation step (seconds)
        rover_radius: float = 1.0,   # Clearance radius of the rover (m)
        d_safe: float = 3.5,         # APF repulsion safety threshold (m)
        w_heading: float = 0.35,     # Weight for goal orientation alignment
        w_clearance: float = 0.40,   # Weight for obstacle distance
        w_velocity: float = 0.25,    # Weight for maximizing forward speed
        w_apf_repulsion: float = 0.45# Weight for potential field repulsion
    ):
        self.v_max = v_max
        self.v_min = v_min
        self.omega_max = omega_max
        self.a_max = a_max
        self.alpha_max = alpha_max
        self.v_samples = v_samples
        self.omega_samples = omega_samples
        self.predict_time = predict_time
        self.dt = dt
        self.rover_radius = rover_radius
        self.d_safe = d_safe

        self.w_heading = w_heading
        self.w_clearance = w_clearance
        self.w_velocity = w_velocity
        self.w_apf = w_apf_repulsion

    def compute_dynamic_window(self, v_curr: float, omega_curr: float, dt_step: float):
        """Calculates intersection between kinematic limits and acceleration capabilities."""
        v_low = max(self.v_min, v_curr - self.a_max * dt_step)
        v_high = min(self.v_max, v_curr + self.a_max * dt_step)

        omega_low = max(-self.omega_max, omega_curr - self.alpha_max * dt_step)
        omega_high = min(self.omega_max, omega_curr + self.alpha_max * dt_step)

        return v_low, v_high, omega_low, omega_high

    def predict_trajectory(
        self, x: float, y: float, theta: float, v: float, omega: float
    ) -> List[Tuple[float, float, float]]:
        """Projects robot state forward over the prediction horizon."""
        traj = [(x, y, theta)]
        curr_x, curr_y, curr_th = x, y, theta
        steps = int(self.predict_time / self.dt)

        for _ in range(steps):
            curr_x += v * math.cos(curr_th) * self.dt
            curr_y += v * math.sin(curr_th) * self.dt
            curr_th += omega * self.dt
            traj.append((curr_x, curr_y, curr_th))

        return traj

    def evaluate_trajectory(
        self,
        traj: List[Tuple[float, float, float]],
        target: Tuple[float, float],
        obstacles: List[DynamicObstacle],
    ) -> Tuple[float, float, float]:
        """
        Calculates normalized scores for heading, clearance, and APF repulsion.
        Returns (heading_score, min_clearance, apf_repulsion).
        """
        # 1. Heading Alignment to Target
        last_x, last_y, last_th = traj[-1]
        angle_to_goal = math.atan2(target[1] - last_y, target[0] - last_x)
        error_angle = abs(self._normalize_angle(angle_to_goal - last_th))
        heading_score = math.pi - error_angle  # Maximize alignment

        # 2. Obstacle Clearance and Dynamic Collision Check
        min_clearance = float('inf')
        total_apf_repulsion = 0.0

        for step_idx, (rx, ry, _) in enumerate(traj):
            sim_time = step_idx * self.dt

            for obs in obstacles:
                ox, oy = obs.predict_position(sim_time)
                dist = math.hypot(rx - ox, ry - oy)
                effective_dist = dist - (self.rover_radius + obs.radius)

                if effective_dist < 0.0:
                    # Trajectory results in a predicted collision!
                    return -1.0, 0.0, float('inf')

                if effective_dist < min_clearance:
                    min_clearance = effective_dist

                # 3. Artificial Potential Field Repulsive Force
                if effective_dist < self.d_safe:
                    repulsion = 0.5 * ((1.0 / max(0.1, effective_dist)) - (1.0 / self.d_safe)) ** 2
                    total_apf_repulsion += repulsion

        return heading_score, min_clearance, total_apf_repulsion

    def select_velocity(
        self,
        current_pose: Tuple[float, float, float], # (x, y, heading)
        current_vel: Tuple[float, float],         # (v, omega)
        target_waypoint: Tuple[float, float],
        dynamic_obstacles: List[DynamicObstacle],
        dt_step: float = 0.05
    ) -> Tuple[float, float, List[Tuple[float, float, float]]]:
        """
        Sweeps the dynamic window V_a to find the optimal (v*, ω*) velocity command.
        """
        rx, ry, rth = current_pose
        v_curr, omega_curr = current_vel

        v_low, v_high, w_low, w_high = self.compute_dynamic_window(v_curr, omega_curr, dt_step)

        v_candidates = np.linspace(v_low, v_high, self.v_samples)
        w_candidates = np.linspace(w_low, w_high, self.omega_samples)

        best_score = -float('inf')
        best_v = 0.0
        best_omega = 0.0
        best_traj = []

        for v in v_candidates:
            for w in w_candidates:
                traj = self.predict_trajectory(rx, ry, rth, v, w)
                heading, clearance, apf = self.evaluate_trajectory(traj, target_waypoint, dynamic_obstacles)

                if heading < 0.0:
                    continue  # Collision detected

                # Normalize terms into comparable objective weights
                norm_heading = heading / math.pi
                norm_clearance = min(clearance, self.d_safe) / self.d_safe
                norm_velocity = v / self.v_max if self.v_max > 0 else 0.0

                score = (
                    self.w_heading * norm_heading
                    + self.w_clearance * norm_clearance
                    + self.w_velocity * norm_velocity
                    - self.w_apf * min(apf, 10.0)
                )

                if score > best_score:
                    best_score = score
                    best_v = v
                    best_omega = w
                    best_traj = traj

        if math.isinf(best_score) or best_score == -float('inf'):
            # Trapped: safe emergency braking
            return 0.0, 0.0, [(rx, ry, rth)]

        return best_v, best_omega, best_traj

    @staticmethod
    def _normalize_angle(angle: float) -> float:
        """Keeps angle within [-π, π]."""
        while angle > math.pi:
            angle -= 2.0 * math.pi
        while angle < -math.pi:
            angle += 2.0 * math.pi
        return angle
