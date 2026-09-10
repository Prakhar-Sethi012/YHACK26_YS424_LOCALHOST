#pragma once

#include <vector>
#include <cstdint>
#include <limits>

namespace aegis {

constexpr double SQRT2 = 1.4142135623730951;
constexpr double INF = std::numeric_limits<double>::infinity();

struct Cell {
    bool traversable = true;
    float thermal_hazard = 0.0f;     // [0, 100]
    float structural_risk = 0.0f;    // [0, 1]
    float clearance = 0.0f;          // grid-distance to nearest obstacle, recomputed lazily
};

struct CostWeights {
    double w_d = 1.0;
    double w_temp = 0.2;
    double w_risk = 6.0;
    double w_obs = 4.0;
};

class Grid2D {
public:
    Grid2D(int width, int height);

    int width() const { return width_; }
    int height() const { return height_; }
    bool in_bounds(int x, int y) const;
    int index(int x, int y) const { return y * width_ + x; }

    Cell& at(int x, int y);
    const Cell& at(int x, int y) const;

    void set_obstacle(int x, int y, bool blocked);
    void set_hazard(int x, int y, float thermal_hazard, float structural_risk);

    // Multi-source Dijkstra distance transform from all obstacle cells.
    // Must be called after obstacle mutations for clearance-dependent costs to be current.
    void recompute_clearance();

    double obstacle_penalty(int x, int y) const;

    // Intrinsic per-cell cost (direction-independent), used for the costmap export.
    double cell_cost(int x, int y, const CostWeights& weights) const;

    // Directed edge cost of moving from (fromX, fromY) into (toX, toY).
    // Infinite if the destination is not traversable.
    double traversal_cost(int fromX, int fromY, int toX, int toY, const CostWeights& weights) const;

    // Whether the diagonal move between two orthogonally-adjacent-to-both cells
    // is allowed to "cut the corner" — both flanking orthogonal cells must be open.
    bool diagonal_move_allowed(int fromX, int fromY, int toX, int toY) const;

    std::vector<Cell> cells;

private:
    int width_;
    int height_;
};

} // namespace aegis
