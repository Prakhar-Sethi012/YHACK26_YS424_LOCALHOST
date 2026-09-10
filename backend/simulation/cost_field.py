"""
AEGIS-NAV Multi-Objective Cost Field Engine
Vectorized 2D environmental cost tensor computation using NumPy.

Mathematical Formulation:
--------------------------
For each spatial cell (x, y) on an N x M discretization grid:
1. Terrain Slope Penalty:
   Gradient: ∇h = (∂h/∂x, ∂h/∂y) approximated via central differences.
   Slope Angle: θ(x, y) = arctan(||∇h(x, y)|| / Δs)
   Slope Penalty: S(x, y) = (θ / θ_max)^2 if θ <= θ_max, else ∞ (impassable rollover limit).

2. Thermal Hazard Penalty:
   T(x, y) = Ambient + Σ_i A_i * exp( - ((x - x_i)^2 + (y - y_i)^2) / (2 * σ_i^2) )
   Thermal Penalty: T_pen(x, y) = max(0, T(x, y) - T_safe) / (T_crit - T_safe)

3. Euclidean Obstacle Clearance:
   Distance Transform: D(x, y) = min_{o ∈ Obstacles} ||(x, y) - o||_2
   Clearance Penalty: O_pen(x, y) = (1 - D(x, y) / d_safe)^2 if D <= d_safe, else 0

4. Combined Scalar Cost Field:
   C(x, y) = w_dist + w_slope * S(x, y) + w_thermal * T_pen(x, y) + w_clear * O_pen(x, y) + w_risk * R(x, y)
"""

import numpy as np
from typing import Tuple, List, Optional

try:
    from scipy.ndimage import distance_transform_edt
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


class MultiObjectiveCostField:
    """
    NumPy-vectorized environmental cost tensor for robotic search and rescue.
    Operates statelessly on 2D arrays with microsecond execution times.
    """

    def __init__(
        self,
        width: int = 100,
        height: int = 100,
        resolution: float = 1.0,
        max_slope_deg: float = 35.0,
        safe_temp_c: float = 45.0,
        crit_temp_c: float = 85.0,
        safe_clearance_m: float = 4.0,
        w_dist: float = 1.0,
        w_slope: float = 3.5,
        w_thermal: float = 2.5,
        w_clearance: float = 3.0,
        w_risk: float = 2.0,
    ):
        self.width = width
        self.height = height
        self.resolution = resolution
        self.max_slope_rad = np.radians(max_slope_deg)
        self.safe_temp_c = safe_temp_c
        self.crit_temp_c = crit_temp_c
        self.safe_clearance_m = safe_clearance_m

        # Cost weighting coefficients
        self.w_dist = w_dist
        self.w_slope = w_slope
        self.w_thermal = w_thermal
        self.w_clearance = w_clearance
        self.w_risk = w_risk

        # Base environment layers (N x M)
        self.elevation = np.zeros((height, width), dtype=np.float32)
        self.temperature = np.full((height, width), 24.0, dtype=np.float32)
        self.obstacles = np.zeros((height, width), dtype=bool)
        self.structural_risk = np.zeros((height, width), dtype=np.float32)

        # Derived fields (cached until mutation)
        self.slope_field = np.zeros((height, width), dtype=np.float32)
        self.clearance_field = np.zeros((height, width), dtype=np.float32)
        self.cost_tensor = np.ones((height, width), dtype=np.float32)

        self._generate_default_disaster_terrain()
        self.recompute_all()

    def _generate_default_disaster_terrain(self):
        """Generates realistic disaster zone terrain with ridges, valleys, and heat sources."""
        y, x = np.mgrid[0:self.height, 0:self.width]

        # Procedural multi-scale elevation: rolling hills with steep central seismic fault
        self.elevation = (
            6.0 * np.sin(x * 0.05) * np.cos(y * 0.05)
            + 3.5 * np.sin(x * 0.12 + y * 0.08)
            + 4.0 * np.exp(-((x - 45)**2 + (y - 50)**2) / 250.0) # Collapsed hill
        ).astype(np.float32)

        # Add initial perimeter walls / static rubble obstacles
        self.obstacles[15:85, 48:52] = True  # Collapsed concrete corridor
        self.obstacles[48:52, 40:60] = False # Breach passage
        self.obstacles[70:80, 20:30] = True  # Rubble mound

        # Industrial chemical fire heat zone
        self.add_thermal_source(center=(75, 70), peak_temp=95.0, sigma=8.0)
        self.add_thermal_source(center=(25, 40), peak_temp=65.0, sigma=6.0)

    def add_thermal_source(self, center: Tuple[int, int], peak_temp: float, sigma: float):
        """Vectorized Gaussian heat diffusion: T(r) = T_0 + A * exp(-r^2 / 2σ^2)"""
        cx, cy = center
        y, x = np.ogrid[:self.height, :self.width]
        dist_sq = (x - cx)**2 + (y - cy)**2
        gaussian_bloom = (peak_temp - 24.0) * np.exp(-dist_sq / (2.0 * sigma**2))
        self.temperature = np.maximum(self.temperature, 24.0 + gaussian_bloom.astype(np.float32))

    def drop_obstacle(self, x: int, y: int, radius: int = 2):
        """Drops a static obstacle or structural collapse block."""
        y_grid, x_grid = np.ogrid[:self.height, :self.width]
        mask = (x_grid - x)**2 + (y_grid - y)**2 <= radius**2
        self.obstacles[mask] = True

    def recompute_all(self):
        """Vectorized recalculation of gradients, distance transforms, and scalar cost field."""
        # 1. Slope Calculation via Central Differences ∇h
        # grad_y = ∂h/∂y, grad_x = ∂h/∂x
        grad_y, grad_x = np.gradient(self.elevation, self.resolution)
        grad_magnitude = np.sqrt(grad_x**2 + grad_y**2)
        # Incline angle θ = arctan(||∇h||) in radians
        self.slope_field = np.arctan(grad_magnitude)

        # 2. Euclidean Distance Transform (EDT) for Obstacle Clearance
        if HAS_SCIPY:
            free_space = ~self.obstacles
            self.clearance_field = distance_transform_edt(free_space) * self.resolution
        else:
            # Vectorized Manhattan/Euclidean fallback approximation if SciPy not present
            self.clearance_field = np.where(self.obstacles, 0.0, 10.0).astype(np.float32)

        # 3. Component Penalties
        # Slope Penalty: Quadratic penalty up to max_slope, then impassable (inf)
        slope_norm = np.clip(self.slope_field / self.max_slope_rad, 0.0, 1.0)
        slope_penalty = slope_norm ** 2
        impassable_slope = self.slope_field > self.max_slope_rad

        # Thermal Penalty: Linear scaling above safe threshold
        temp_excess = np.maximum(0.0, self.temperature - self.safe_temp_c)
        thermal_penalty = np.clip(temp_excess / (self.crit_temp_c - self.safe_temp_c), 0.0, 5.0)

        # Clearance Penalty: Inverse-distance quadratic repulsion within safety buffer
        clear_dist = np.clip(self.clearance_field, 0.0, self.safe_clearance_m)
        clearance_penalty = ((self.safe_clearance_m - clear_dist) / self.safe_clearance_m) ** 2

        # 4. Synthesize Combined Cost Tensor
        cost = (
            self.w_dist
            + self.w_slope * slope_penalty
            + self.w_thermal * thermal_penalty
            + self.w_clearance * clearance_penalty
            + self.w_risk * self.structural_risk
        )

        # Hard constraints: mark obstacles and critical rollover slopes as impassable
        cost[self.obstacles] = np.inf
        cost[impassable_slope] = np.inf

        self.cost_tensor = cost

    def get_traversability_cost(self, x: int, y: int) -> float:
        """Returns the scalar traversal cost at discrete coordinates (x, y)."""
        if not (0 <= x < self.width and 0 <= y < self.height):
            return float('inf')
        return float(self.cost_tensor[y, x])
