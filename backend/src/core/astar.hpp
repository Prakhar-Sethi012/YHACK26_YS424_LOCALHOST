#pragma once

#include <utility>
#include <vector>

#include "grid2d.hpp"

namespace aegis {

struct PathResult {
    std::vector<std::pair<int, int>> path;
    double cost = 0.0;
    double latency_ms = 0.0;
    bool found = false;
};

class AStarPlanner {
public:
    explicit AStarPlanner(CostWeights weights = CostWeights());

    PathResult plan(const Grid2D& grid, std::pair<int, int> start, std::pair<int, int> goal) const;

    const CostWeights& weights() const { return weights_; }
    void set_weights(const CostWeights& weights) { weights_ = weights; }

private:
    CostWeights weights_;
};

// Octile distance heuristic, admissible for 8-connected grids with sqrt(2) diagonal cost.
double octile_heuristic(int ax, int ay, int bx, int by);

} // namespace aegis
