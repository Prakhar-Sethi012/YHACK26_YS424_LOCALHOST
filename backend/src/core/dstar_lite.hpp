#pragma once

#include <memory>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include "astar.hpp"
#include "grid2d.hpp"

namespace aegis {

struct Key {
    double k1;
    double k2;

    bool operator<(const Key& other) const;
    bool operator==(const Key& other) const;
};

struct ReplanResult {
    std::vector<std::pair<int, int>> path;
    double cost = 0.0;
    double latency_ms = 0.0;
    bool found = false;
    int vertices_expanded = 0;
};

// D* Lite (Koenig & Likhachev, 2002), incremental replanning over Grid2D.
// init() runs one full ComputeShortestPath from scratch; update_obstacles()
// applies the blocked-state change to the shared grid itself, then repairs
// only the vertices whose cost could have been affected, instead of
// re-running the search over the whole grid.
//
// The planner holds a shared_ptr to the grid (rather than a const view) because
// update_obstacles mutates it directly, and because an obstacle change shifts
// the global clearance distance-transform, not just the changed cell's neighbors.
class DStarLitePlanner {
public:
    explicit DStarLitePlanner(CostWeights weights = CostWeights());

    ReplanResult init(std::shared_ptr<Grid2D> grid, std::pair<int, int> start, std::pair<int, int> goal);
    ReplanResult update_obstacles(const std::vector<std::pair<int, int>>& changed_cells,
                                   const std::vector<bool>& blocked);

    const CostWeights& weights() const { return weights_; }
    void set_weights(const CostWeights& weights) { weights_ = weights; }

private:
    struct QueueEntry {
        Key key;
        int idx;
    };
    struct QueueEntryCompare {
        bool operator()(const QueueEntry& a, const QueueEntry& b) const { return b.key < a.key; }
    };

    Key calculate_key(int idx) const;
    void update_vertex(int idx);
    int compute_shortest_path(int expansion_budget);
    std::vector<int> neighbors(int idx) const;
    double edge_cost(int from_idx, int to_idx) const;
    double heuristic_idx(int a_idx, int b_idx) const;
    ReplanResult extract_path() const;
    double g_of(int idx) const;
    double rhs_of(int idx) const;

    std::shared_ptr<Grid2D> grid_;
    CostWeights weights_;

    int width_ = 0;
    int height_ = 0;
    int start_idx_ = -1;
    int goal_idx_ = -1;
    int last_start_idx_ = -1;
    double k_m_ = 0.0;
    bool initialized_ = false;

    std::unordered_map<int, double> g_;
    std::unordered_map<int, double> rhs_;
    std::unordered_map<int, Key> last_key_in_queue_;
    std::unordered_set<int> in_queue_;
    std::vector<QueueEntry> heap_;
};

} // namespace aegis
