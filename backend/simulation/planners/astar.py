"""
AEGIS-NAV Baseline Global Path Planner: Multi-Objective A*
-----------------------------------------------------------
Mathematical Formulation:
f(n) = g(n) + h(n)

Where:
- g(n): Actual cumulative cost from start to node n:
        g(v) = g(u) + c(u, v)
        c(u, v) = 0.5 * (C(u) + C(v)) * ||u - v||_2
- h(n): Admissible & consistent Euclidean heuristic to goal:
        h(n) = w_min * ||n - goal||_2
- 8-connected grid transitions: Cardinal cost = 1.0, Diagonal cost = sqrt(2) ~= 1.414.

Performance note: reads a cached nested-list snapshot of cost_field.cost_tensor
rather than indexing the NumPy array per neighbor -- see dstar_lite.py's
module docstring for why (point-access-heavy loops are where NumPy is slow,
not where it helps).
"""

import heapq
import time
import math
from typing import List, Tuple, Dict, Optional, Any
from ..cost_field import MultiObjectiveCostField

INF = float("inf")


class AStarPlanner:
    """
    Standard A* search over the 2D Multi-Objective Cost Field.
    Acts as the baseline to compare against incremental D* Lite.
    """

    # 8-connected grid offsets: (dx, dy, step_distance)
    NEIGHBORS = [
        (1, 0, 1.0),
        (-1, 0, 1.0),
        (0, 1, 1.0),
        (0, -1, 1.0),
        (1, 1, math.sqrt(2.0)),
        (1, -1, math.sqrt(2.0)),
        (-1, 1, math.sqrt(2.0)),
        (-1, -1, math.sqrt(2.0)),
    ]

    def __init__(self, cost_field: MultiObjectiveCostField):
        self.cost_field = cost_field

    def heuristic(self, a: Tuple[int, int], b: Tuple[int, int]) -> float:
        """Euclidean distance lower bound scaled by base distance cost (admissible)."""
        return self.cost_field.w_dist * math.hypot(a[0] - b[0], a[1] - b[1])

    def plan(
        self, start: Tuple[int, int], goal: Tuple[int, int]
    ) -> Dict[str, Any]:
        """
        Computes the optimal path from start to goal over the cost tensor.
        Returns path coordinates, path length, total cost, latency (ms), and expanded nodes.
        """
        t0 = time.perf_counter()

        # One-time snapshot into plain Python lists for this run.
        cost = self.cost_field.cost_tensor.tolist()
        width = self.cost_field.width
        height = self.cost_field.height

        # Sanity check: start or goal inside impassable obstacle
        if not math.isfinite(cost[start[1]][start[0]]):
            return self._empty_result(time.perf_counter() - t0, "Start inside obstacle")
        if not math.isfinite(cost[goal[1]][goal[0]]):
            return self._empty_result(time.perf_counter() - t0, "Goal inside obstacle")

        # Priority queue stores tuples: (f_score, g_score, (x, y))
        open_set: List[Tuple[float, float, Tuple[int, int]]] = []
        heapq.heappush(open_set, (self.heuristic(start, goal), 0.0, start))

        # Tracks best cost-to-come g(n) for each visited coordinate
        g_scores: Dict[Tuple[int, int], float] = {start: 0.0}
        came_from: Dict[Tuple[int, int], Tuple[int, int]] = {}

        nodes_expanded = 0

        while open_set:
            f, current_g, current = heapq.heappop(open_set)

            if current == goal:
                latency_ms = (time.perf_counter() - t0) * 1000.0
                path = self._reconstruct_path(came_from, current)
                return {
                    "success": True,
                    "path": path,
                    "path_length": self._calculate_path_distance(path),
                    "total_cost": current_g,
                    "latency_ms": latency_ms,
                    "nodes_expanded": nodes_expanded,
                }

            # Skip suboptimal entries if we already found a cheaper route to `current`
            if current_g > g_scores.get(current, INF):
                continue

            nodes_expanded += 1
            cx, cy = current
            c_curr = cost[cy][cx]

            for dx, dy, step_dist in self.NEIGHBORS:
                nx, ny = cx + dx, cy + dy
                neighbor = (nx, ny)

                # Boundary check
                if not (0 <= nx < width and 0 <= ny < height):
                    continue

                c_next = cost[ny][nx]
                if not math.isfinite(c_next):
                    continue  # Impassable obstacle or rollover slope

                # Edge cost: c(u, v) = 0.5 * (C(u) + C(v)) * ||u - v||
                edge_cost = 0.5 * (c_curr + c_next) * step_dist
                tentative_g = current_g + edge_cost

                if tentative_g < g_scores.get(neighbor, INF):
                    g_scores[neighbor] = tentative_g
                    came_from[neighbor] = current
                    f_score = tentative_g + self.heuristic(neighbor, goal)
                    heapq.heappush(open_set, (f_score, tentative_g, neighbor))

        latency_ms = (time.perf_counter() - t0) * 1000.0
        return self._empty_result(latency_ms, "No valid collision-free path found")

    def _reconstruct_path(
        self, came_from: Dict[Tuple[int, int], Tuple[int, int]], current: Tuple[int, int]
    ) -> List[Tuple[int, int]]:
        path = [current]
        while current in came_from:
            current = came_from[current]
            path.append(current)
        path.reverse()
        return path

    def _calculate_path_distance(self, path: List[Tuple[int, int]]) -> float:
        dist = 0.0
        for i in range(len(path) - 1):
            dist += math.hypot(path[i+1][0] - path[i][0], path[i+1][1] - path[i][1])
        return dist

    def _empty_result(self, latency_ms: float, error_msg: str) -> Dict[str, Any]:
        return {
            "success": False,
            "path": [],
            "path_length": 0.0,
            "total_cost": INF,
            "latency_ms": latency_ms,
            "nodes_expanded": 0,
            "error": error_msg,
        }
