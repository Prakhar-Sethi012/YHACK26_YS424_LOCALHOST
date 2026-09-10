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
    float elevation = 0.0f;          // meters, set via Grid2D::set_elevation_grid
    float slope_penalty = 0.0f;      // ||grad h||^2, cached by set_elevation_grid's recompute_slope pass
    bool rollover_impassable = false; // true once the local slope angle exceeds MAX_SLOPE_DEGREES
};

struct CostWeights {
    double w_d = 1.0;
    double w_temp = 0.2;
    double w_risk = 6.0;
    double w_obs = 4.0;
    double w_slope = 3.0;
};

// Rollover-impassable threshold. Fixed rather than a tunable weight because
// it represents a hard physical limit (the vehicle tips over), not a soft
// cost preference -- matches Backend 1's own default of the same value.
constexpr double MAX_SLOPE_DEGREES = 35.0;

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

    // Uploads a full heightmap (row-major, [y][x]) and immediately recomputes
    // slope_penalty/rollover_impassable for every cell -- unlike obstacles,
    // elevation is set once at init and never incrementally mutated in this
    // phase, so there's no separate "recompute" step to forget to call.
    void set_elevation_grid(const std::vector<std::vector<float>>& heightmap);

    // Multi-source Dijkstra distance transform from all obstacle cells.
    // Must be called after obstacle mutations for clearance-dependent costs to be current.
    void recompute_clearance();

    // Central-difference gradient magnitude per cell -> slope_penalty (||grad h||^2)
    // and rollover_impassable (angle > MAX_SLOPE_DEGREES). Called by set_elevation_grid.
    void recompute_slope();

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
