"""
AEGIS-NAV Production Global Path Planner: D* Lite (Optimized NumPy Array Implementation)
Based on Sven Koenig & Maxim Likhachev (2002) "D* Lite".

Optimizations:
- 2D float32 NumPy arrays for g(s) and rhs(s) instead of Python dict hashing.
- Direct memory-mapped cost tensor lookups.
- Fast lazy priority queue deletion for sub-millisecond incremental replanning.
"""

import time
import math
import heapq
import numpy as np
from typing import List, Tuple, Dict, Optional, Any, Set
from ..cost_field import MultiObjectiveCostField


class DStarLitePlanner:
    """
    High-performance NumPy-backed D* Lite incremental planner.
    """

    # 8-connected grid offsets: (dx, dy, step_distance)
    NEIGHBORS = [
        (1, 0, 1.0),
        (-1, 0, 1.0),
        (0, 1, 1.0),
        (0, -1, 1.0),
        (1, 1, 1.41421356),
        (1, -1, 1.41421356),
        (-1, 1, 1.41421356),
        (-1, -1, 1.41421356),
    ]

    def __init__(self, cost_field: MultiObjectiveCostField):
        self.cost_field = cost_field
        self.w = cost_field.width
        self.h = cost_field.height

        self.start: Tuple[int, int] = (0, 0)
        self.goal: Tuple[int, int] = (0, 0)
        self.last_start: Tuple[int, int] = (0, 0)
        self.k_m: float = 0.0

        # High performance 2D NumPy arrays for g and rhs
        self.g = np.full((self.h, self.w), np.inf, dtype=np.float32)
        self.rhs = np.full((self.h, self.w), np.inf, dtype=np.float32)

        # Min-heap priority queue: entries are ((k1, k2), (x, y))
        self.heap: List[Tuple[Tuple[float, float], Tuple[int, int]]] = []
        # Fast membership and current priority tracking
        self.open_dict: Dict[Tuple[int, int], Tuple[float, float]] = {}

        self.initialized = False

    def heuristic(self, a: Tuple[int, int], b: Tuple[int, int]) -> float:
        """Euclidean distance lower bound scaled by base unit cost."""
        return self.cost_field.w_dist * math.hypot(a[0] - b[0], a[1] - b[1])

    def calculate_key(self, s: Tuple[int, int]) -> Tuple[float, float]:
        """Calculates D* Lite priority key [k1, k2]."""
        x, y = s
        g_val = float(self.g[y, x])
        rhs_val = float(self.rhs[y, x])
        min_cost = min(g_val, rhs_val)
        k1 = min_cost + self.heuristic(self.start, s) + self.k_m
        k2 = min_cost
        return (k1, k2)

    def edge_cost(self, x1: int, y1: int, x2: int, y2: int, step_dist: float) -> float:
        """Direct memory-mapped edge cost between adjacent grid cells."""
        c1 = float(self.cost_field.cost_tensor[y1, x1])
        c2 = float(self.cost_field.cost_tensor[y2, x2])
        if not (np.isfinite(c1) and np.isfinite(c2)):
            return float('inf')
        return 0.5 * (c1 + c2) * step_dist

    def initialize(self, start: Tuple[int, int], goal: Tuple[int, int]):
        """Initializes backwards search state with s_goal at 0."""
        self.start = start
        self.goal = goal
        self.last_start = start
        self.k_m = 0.0

        self.g.fill(np.inf)
        self.rhs.fill(np.inf)
        self.heap.clear()
        self.open_dict.clear()

        gx, gy = goal
        self.rhs[gy, gx] = 0.0
        init_key = self.calculate_key(goal)
        self.open_dict[goal] = init_key
        heapq.heappush(self.heap, (init_key, goal))
        self.initialized = True

    def update_vertex(self, u: Tuple[int, int]):
        """Updates rhs(u) and maintains open list priority."""
        ux, uy = u
        if u != self.goal:
            min_rhs = float('inf')
            c_u = float(self.cost_field.cost_tensor[uy, ux])

            if np.isfinite(c_u):
                for dx, dy, step_dist in self.NEIGHBORS:
                    nx, ny = ux + dx, uy + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h:
                        c_n = float(self.cost_field.cost_tensor[ny, nx])
                        if np.isfinite(c_n):
                            edge = 0.5 * (c_u + c_n) * step_dist
                            cost = edge + float(self.g[ny, nx])
                            if cost < min_rhs:
                                min_rhs = cost

            self.rhs[uy, ux] = min_rhs

        # Update in open list
        g_val = float(self.g[uy, ux])
        rhs_val = float(self.rhs[uy, ux])

        if g_val != rhs_val:
            key = self.calculate_key(u)
            self.open_dict[u] = key
            heapq.heappush(self.heap, (key, u))
        elif u in self.open_dict:
            del self.open_dict[u]

    def _top_key(self) -> Tuple[float, float]:
        while self.heap:
            key, item = self.heap[0]
            if item in self.open_dict and self.open_dict[item] == key:
                return key
            heapq.heappop(self.heap)
        return (float('inf'), float('inf'))

    def compute_shortest_path(self) -> int:
        """Expands inconsistent vertices until start is consistent."""
        expansions = 0
        sx, sy = self.start

        while True:
            top_k = self._top_key()
            start_k = self.calculate_key(self.start)

            g_start = float(self.g[sy, sx])
            rhs_start = float(self.rhs[sy, sx])

            if not (top_k < start_k or g_start != rhs_start):
                break

            if not self.open_dict:
                break

            k_old, u = heapq.heappop(self.heap)
            if u not in self.open_dict or self.open_dict[u] != k_old:
                continue

            ux, uy = u
            k_new = self.calculate_key(u)

            if k_old < k_new:
                self.open_dict[u] = k_new
                heapq.heappush(self.heap, (k_new, u))
            else:
                expansions += 1
                del self.open_dict[u]

                g_u = float(self.g[uy, ux])
                rhs_u = float(self.rhs[uy, ux])

                if g_u > rhs_u:
                    # Overconsistent: propagate decrease
                    self.g[uy, ux] = rhs_u
                    for dx, dy, _ in self.NEIGHBORS:
                        nx, ny = ux + dx, uy + dy
                        if 0 <= nx < self.w and 0 <= ny < self.h:
                            self.update_vertex((nx, ny))
                else:
                    # Underconsistent: cost increased or blocked
                    self.g[uy, ux] = float('inf')
                    self.update_vertex(u)
                    for dx, dy, _ in self.NEIGHBORS:
                        nx, ny = ux + dx, uy + dy
                        if 0 <= nx < self.w and 0 <= ny < self.h:
                            self.update_vertex((nx, ny))

        return expansions

    def extract_path(self) -> List[Tuple[int, int]]:
        """Extracts optimal path from start to goal following minimum (c(u, v) + g(v))."""
        sx, sy = self.start
        if not np.isfinite(self.rhs[sy, sx]):
            return []

        path = [self.start]
        curr = self.start
        visited = {curr}

        while curr != self.goal:
            cx, cy = curr
            c_curr = float(self.cost_field.cost_tensor[cy, cx])
            best_next = None
            min_val = float('inf')

            for dx, dy, step_dist in self.NEIGHBORS:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < self.w and 0 <= ny < self.h:
                    c_next = float(self.cost_field.cost_tensor[ny, nx])
                    if np.isfinite(c_next):
                        edge = 0.5 * (c_curr + c_next) * step_dist
                        val = edge + float(self.g[ny, nx])
                        if val < min_val:
                            min_val = val
                            best_next = (nx, ny)

            if best_next is None or not np.isfinite(min_val) or best_next in visited:
                break

            curr = best_next
            path.append(curr)
            visited.add(curr)

            if len(path) > (self.w * self.h):
                break

        return path

    def plan(self, start: Tuple[int, int], goal: Tuple[int, int]) -> Dict[str, Any]:
        """Initial global planning run."""
        t0 = time.perf_counter()
        self.initialize(start, goal)
        expansions = self.compute_shortest_path()
        path = self.extract_path()
        latency_ms = (time.perf_counter() - t0) * 1000.0

        dist = sum(math.hypot(path[i+1][0] - path[i][0], path[i+1][1] - path[i][1]) for i in range(len(path)-1))
        return {
            "success": len(path) > 0 and path[-1] == goal,
            "path": path,
            "path_length": dist,
            "latency_ms": latency_ms,
            "nodes_expanded": expansions,
        }

    def repair_on_mutation(
        self, current_rover_pos: Tuple[int, int], modified_cells: List[Tuple[int, int]]
    ) -> Dict[str, Any]:
        """
        Incremental repair: only updates inconsistent neighbors of modified cells.
        Sub-millisecond latency for real-time obstacle avoidance.
        """
        t0 = time.perf_counter()

        self.start = current_rover_pos
        self.k_m += self.heuristic(self.last_start, self.start)
        self.last_start = self.start

        # Deduplicate and update modified vertices and immediate 1-hop neighbors
        affected: Set[Tuple[int, int]] = set(modified_cells)
        for mx, my in modified_cells:
            for dx, dy, _ in self.NEIGHBORS:
                nx, ny = mx + dx, my + dy
                if 0 <= nx < self.w and 0 <= ny < self.h:
                    affected.add((nx, ny))

        for cell in affected:
            self.update_vertex(cell)

        expansions = self.compute_shortest_path()
        path = self.extract_path()
        latency_ms = (time.perf_counter() - t0) * 1000.0

        dist = sum(math.hypot(path[i+1][0] - path[i][0], path[i+1][1] - path[i][1]) for i in range(len(path)-1))
        return {
            "success": len(path) > 0 and path[-1] == self.goal,
            "path": path,
            "path_length": dist,
            "latency_ms": latency_ms,
            "nodes_expanded": expansions,
            "repaired_cells_count": len(affected),
        }
