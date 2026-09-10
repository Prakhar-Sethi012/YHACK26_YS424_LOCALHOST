#include "astar.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <queue>
#include <tuple>

namespace aegis {

double octile_heuristic(int ax, int ay, int bx, int by) {
    double dx = std::abs(ax - bx);
    double dy = std::abs(ay - by);
    return std::max(dx, dy) + (SQRT2 - 1.0) * std::min(dx, dy);
}

AStarPlanner::AStarPlanner(CostWeights weights) : weights_(weights) {}

PathResult AStarPlanner::plan(const Grid2D& grid, std::pair<int, int> start, std::pair<int, int> goal) const {
    auto t0 = std::chrono::steady_clock::now();

    PathResult result;
    const int w = grid.width();
    const int h = grid.height();
    const size_t n = static_cast<size_t>(w) * static_cast<size_t>(h);

    if (!grid.in_bounds(start.first, start.second) || !grid.in_bounds(goal.first, goal.second)) {
        return result;
    }

    std::vector<double> g_score(n, INF);
    std::vector<int> came_from(n, -1);
    std::vector<bool> closed(n, false);

    using OpenEntry = std::tuple<double, int>; // (f_score, index)
    std::priority_queue<OpenEntry, std::vector<OpenEntry>, std::greater<OpenEntry>> open;

    int start_idx = grid.index(start.first, start.second);
    int goal_idx = grid.index(goal.first, goal.second);

    g_score[start_idx] = 0.0;
    open.push({octile_heuristic(start.first, start.second, goal.first, goal.second), start_idx});

    static const int dx8[8] = {1, -1, 0, 0, 1, 1, -1, -1};
    static const int dy8[8] = {0, 0, 1, -1, 1, -1, 1, -1};

    bool found = false;
    while (!open.empty()) {
        auto [f, idx] = open.top();
        open.pop();
        if (closed[idx]) continue;
        closed[idx] = true;

        if (idx == goal_idx) {
            found = true;
            break;
        }

        int x = idx % w;
        int y = idx / w;
        for (int k = 0; k < 8; ++k) {
            int nx = x + dx8[k];
            int ny = y + dy8[k];
            if (!grid.in_bounds(nx, ny)) continue;
            int nidx = grid.index(nx, ny);
            if (closed[nidx]) continue;

            double step_cost = grid.traversal_cost(x, y, nx, ny, weights_);
            if (!std::isfinite(step_cost)) continue;

            double tentative_g = g_score[idx] + step_cost;
            if (tentative_g < g_score[nidx]) {
                g_score[nidx] = tentative_g;
                came_from[nidx] = idx;
                double f_score = tentative_g + octile_heuristic(nx, ny, goal.first, goal.second);
                open.push({f_score, nidx});
            }
        }
    }

    auto t1 = std::chrono::steady_clock::now();
    result.latency_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

    if (!found) {
        return result;
    }

    std::vector<std::pair<int, int>> path;
    int cur = goal_idx;
    while (cur != -1) {
        path.push_back({cur % w, cur / w});
        if (cur == start_idx) break;
        cur = came_from[cur];
    }
    std::reverse(path.begin(), path.end());

    result.path = std::move(path);
    result.cost = g_score[goal_idx];
    result.found = true;
    return result;
}

} // namespace aegis
