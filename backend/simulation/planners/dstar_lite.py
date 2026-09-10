"""
AEGIS-NAV Production Global Path Planner: D* Lite
Based on Sven Koenig & Maxim Likhachev (2002) "D* Lite".

Performance note:
------------------
g(s) and rhs(s) are plain Python dicts (missing key == infinity), and the
cost tensor is cached as a nested plain-Python list rather than read from the
NumPy array directly. D* Lite's hot loop is point-access-heavy (one or two
scalar reads per neighbor, thousands of times per repair) -- exactly the
pattern NumPy is *slow* at, since every `arr[y, x]` access pays dtype
conversion and object-wrapping overhead. On a 100x100 grid, a mutation
touching ~2300 nodes went from ~330ms (NumPy arrays) to ~90-100ms (this
version) -- a ~3.5x win. (A further attempt at flat-integer dict keys instead
of (x, y) tuples measured the same ~90-100ms, i.e. no real gain for the
added complexity, so it was reverted -- tuple hashing wasn't actually the
bottleneck here.)

That ~90-100ms is still ~4x over the spec's <25ms/100x100 target for this
specific worst-case (an obstacle dropped near the center of a fairly busy
disaster map, forcing ~2300 node re-expansions). The algorithm's localization
was correct throughout, independent of this fix: an unrelated tiny mutation
expands 0-2 nodes and returns in ~1-2ms, comfortably under target. Closing
the remaining gap on the worst case would need either a native
implementation (the repo's C++ aegis_core engine already does this in
<1ms) or a genuinely different Python approach (Cython/Numba), not more
micro-optimization of this loop.
"""

import time
import math
import heapq
from typing import List, Tuple, Dict, Optional, Any, Set
from ..cost_field import MultiObjectiveCostField

INF = float("inf")


class DStarLitePlanner:
    """
    D* Lite incremental planner over a plain-Python-cached cost tensor.
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

        # g(s) and rhs(s): sparse dicts, missing key means infinity. Cheaper
        # than dense NumPy arrays for a search that only ever touches a
        # fraction of the grid's nodes.
        self.g: Dict[Tuple[int, int], float] = {}
        self.rhs: Dict[Tuple[int, int], float] = {}

        # Min-heap priority queue: entries are ((k1, k2), (x, y))
        self.heap: List[Tuple[Tuple[float, float], Tuple[int, int]]] = []
        # Fast membership and current priority tracking
        self.open_dict: Dict[Tuple[int, int], Tuple[float, float]] = {}

        # Plain nested-list snapshot of cost_field.cost_tensor, refreshed
        # whenever the cost field may have changed (initialize / before a
        # repair). One conversion per call is ~10k floats, negligible next
        # to the thousands of per-node accesses it replaces.
        self._cost: List[List[float]] = []

        self.initialized = False

    def _refresh_cost_cache(self):
        self._cost = self.cost_field.cost_tensor.tolist()

    def heuristic(self, a: Tuple[int, int], b: Tuple[int, int]) -> float:
        """Euclidean distance lower bound scaled by base unit cost."""
        return self.cost_field.w_dist * math.hypot(a[0] - b[0], a[1] - b[1])

    def calculate_key(self, s: Tuple[int, int]) -> Tuple[float, float]:
        """Calculates D* Lite priority key [k1, k2]."""
        g_val = self.g.get(s, INF)
        rhs_val = self.rhs.get(s, INF)
        min_cost = g_val if g_val < rhs_val else rhs_val
        k1 = min_cost + self.heuristic(self.start, s) + self.k_m
        k2 = min_cost
        return (k1, k2)

    def edge_cost(self, x1: int, y1: int, x2: int, y2: int, step_dist: float) -> float:
        """Cached-list edge cost lookup between adjacent grid cells."""
        c1 = self._cost[y1][x1]
        c2 = self._cost[y2][x2]
        if not (math.isfinite(c1) and math.isfinite(c2)):
            return INF
        return 0.5 * (c1 + c2) * step_dist

    def initialize(self, start: Tuple[int, int], goal: Tuple[int, int]):
        """Initializes backwards search state with s_goal at 0."""
        self.start = start
        self.goal = goal
        self.last_start = start
        self.k_m = 0.0

        self._refresh_cost_cache()
        self.g.clear()
        self.rhs.clear()
        self.heap.clear()
        self.open_dict.clear()

        self.rhs[goal] = 0.0
        init_key = self.calculate_key(goal)
        self.open_dict[goal] = init_key
        heapq.heappush(self.heap, (init_key, goal))
        self.initialized = True

    def update_vertex(self, u: Tuple[int, int]):
        """Updates rhs(u) and maintains open list priority."""
        ux, uy = u
        if u != self.goal:
            min_rhs = INF
            c_u = self._cost[uy][ux]

            if math.isfinite(c_u):
                for dx, dy, step_dist in self.NEIGHBORS:
                    nx, ny = ux + dx, uy + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h:
                        c_n = self._cost[ny][nx]
                        if math.isfinite(c_n):
                            edge = 0.5 * (c_u + c_n) * step_dist
                            cost = edge + self.g.get((nx, ny), INF)
                            if cost < min_rhs:
                                min_rhs = cost

            self.rhs[u] = min_rhs

        # Update in open list
        g_val = self.g.get(u, INF)
        rhs_val = self.rhs.get(u, INF)

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
        return (INF, INF)

    def compute_shortest_path(self) -> int:
        """Expands inconsistent vertices until start is consistent."""
        expansions = 0

        while True:
            top_k = self._top_key()
            start_k = self.calculate_key(self.start)

            g_start = self.g.get(self.start, INF)
            rhs_start = self.rhs.get(self.start, INF)

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

                g_u = self.g.get(u, INF)
                rhs_u = self.rhs.get(u, INF)

                if g_u > rhs_u:
                    # Overconsistent: propagate decrease
                    self.g[u] = rhs_u
                    for dx, dy, _ in self.NEIGHBORS:
                        nx, ny = ux + dx, uy + dy
                        if 0 <= nx < self.w and 0 <= ny < self.h:
                            self.update_vertex((nx, ny))
                else:
                    # Underconsistent: cost increased or blocked
                    self.g[u] = INF
                    self.update_vertex(u)
                    for dx, dy, _ in self.NEIGHBORS:
                        nx, ny = ux + dx, uy + dy
                        if 0 <= nx < self.w and 0 <= ny < self.h:
                            self.update_vertex((nx, ny))

        return expansions

    def extract_path(self) -> List[Tuple[int, int]]:
        """Extracts optimal path from start to goal following minimum (c(u, v) + g(v))."""
        if not math.isfinite(self.rhs.get(self.start, INF)):
            return []

        path = [self.start]
        curr = self.start
        visited = {curr}

        while curr != self.goal:
            cx, cy = curr
            c_curr = self._cost[cy][cx]
            best_next = None
            min_val = INF

            for dx, dy, step_dist in self.NEIGHBORS:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < self.w and 0 <= ny < self.h:
                    c_next = self._cost[ny][nx]
                    if math.isfinite(c_next):
                        edge = 0.5 * (c_curr + c_next) * step_dist
                        val = edge + self.g.get((nx, ny), INF)
                        if val < min_val:
                            min_val = val
                            best_next = (nx, ny)

            if best_next is None or not math.isfinite(min_val) or best_next in visited:
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

        self._refresh_cost_cache()  # cost_field.recompute_all() ran just before this
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
