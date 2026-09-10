#include "grid2d.hpp"

#include <algorithm>
#include <cmath>
#include <queue>
#include <utility>

namespace aegis {

namespace {
constexpr double PI = 3.14159265358979323846;
}

Grid2D::Grid2D(int width, int height) : width_(width), height_(height) {
    cells.assign(static_cast<size_t>(width_) * static_cast<size_t>(height_), Cell{});
}

bool Grid2D::in_bounds(int x, int y) const {
    return x >= 0 && y >= 0 && x < width_ && y < height_;
}

Cell& Grid2D::at(int x, int y) {
    return cells[index(x, y)];
}

const Cell& Grid2D::at(int x, int y) const {
    return cells[index(x, y)];
}

void Grid2D::set_obstacle(int x, int y, bool blocked) {
    if (!in_bounds(x, y)) return;
    at(x, y).traversable = !blocked;
}

void Grid2D::set_hazard(int x, int y, float thermal_hazard, float structural_risk) {
    if (!in_bounds(x, y)) return;
    Cell& c = at(x, y);
    c.thermal_hazard = thermal_hazard;
    c.structural_risk = structural_risk;
}

void Grid2D::set_elevation_grid(const std::vector<std::vector<float>>& heightmap) {
    for (int y = 0; y < height_ && y < static_cast<int>(heightmap.size()); ++y) {
        const auto& row = heightmap[y];
        for (int x = 0; x < width_ && x < static_cast<int>(row.size()); ++x) {
            at(x, y).elevation = row[x];
        }
    }
    recompute_slope();
}

void Grid2D::recompute_slope() {
    const double max_slope_rad = MAX_SLOPE_DEGREES * PI / 180.0;

    for (int y = 0; y < height_; ++y) {
        for (int x = 0; x < width_; ++x) {
            int x0 = std::max(x - 1, 0);
            int x1 = std::min(x + 1, width_ - 1);
            int y0 = std::max(y - 1, 0);
            int y1 = std::min(y + 1, height_ - 1);

            float dx_span = static_cast<float>(x1 - x0);
            float dy_span = static_cast<float>(y1 - y0);
            float grad_x = dx_span > 0.0f ? (at(x1, y).elevation - at(x0, y).elevation) / dx_span : 0.0f;
            float grad_y = dy_span > 0.0f ? (at(x, y1).elevation - at(x, y0).elevation) / dy_span : 0.0f;
            float grad_mag = std::sqrt(grad_x * grad_x + grad_y * grad_y);

            Cell& c = at(x, y);
            c.slope_penalty = grad_mag * grad_mag;
            c.rollover_impassable = std::atan(static_cast<double>(grad_mag)) > max_slope_rad;
        }
    }
}

void Grid2D::recompute_clearance() {
    static const int dx8[8] = {1, -1, 0, 0, 1, 1, -1, -1};
    static const int dy8[8] = {0, 0, 1, -1, 1, -1, 1, -1};

    std::vector<double> dist(cells.size(), INF);
    using PQEntry = std::pair<double, int>;
    std::priority_queue<PQEntry, std::vector<PQEntry>, std::greater<PQEntry>> pq;

    for (int y = 0; y < height_; ++y) {
        for (int x = 0; x < width_; ++x) {
            int idx = index(x, y);
            if (!cells[idx].traversable) {
                dist[idx] = 0.0;
                pq.push({0.0, idx});
            }
        }
    }

    while (!pq.empty()) {
        auto [d, idx] = pq.top();
        pq.pop();
        if (d > dist[idx]) continue;

        int x = idx % width_;
        int y = idx / width_;
        for (int k = 0; k < 8; ++k) {
            int nx = x + dx8[k];
            int ny = y + dy8[k];
            if (!in_bounds(nx, ny)) continue;
            int nidx = index(nx, ny);
            double step = (dx8[k] != 0 && dy8[k] != 0) ? SQRT2 : 1.0;
            double nd = d + step;
            if (nd < dist[nidx]) {
                dist[nidx] = nd;
                pq.push({nd, nidx});
            }
        }
    }

    for (size_t i = 0; i < cells.size(); ++i) {
        cells[i].clearance = static_cast<float>(dist[i]);
    }
}

double Grid2D::obstacle_penalty(int x, int y) const {
    double clearance = static_cast<double>(at(x, y).clearance);
    double denom = std::max(clearance, 0.1);
    return 1.0 / (denom * denom);
}

double Grid2D::cell_cost(int x, int y, const CostWeights& weights) const {
    const Cell& c = at(x, y);
    if (!c.traversable || c.rollover_impassable) return INF;
    return weights.w_d +
           weights.w_temp * c.thermal_hazard +
           weights.w_risk * c.structural_risk +
           weights.w_slope * c.slope_penalty +
           weights.w_obs * obstacle_penalty(x, y);
}

bool Grid2D::diagonal_move_allowed(int fromX, int fromY, int toX, int toY) const {
    int dx = toX - fromX;
    int dy = toY - fromY;
    if (dx == 0 || dy == 0) return true; // orthogonal move, not a diagonal
    // Prevent cutting through a blocked corner: both flanking cells must be open.
    if (!in_bounds(fromX + dx, fromY) || !at(fromX + dx, fromY).traversable) return false;
    if (!in_bounds(fromX, fromY + dy) || !at(fromX, fromY + dy).traversable) return false;
    return true;
}

double Grid2D::traversal_cost(int fromX, int fromY, int toX, int toY, const CostWeights& weights) const {
    if (!in_bounds(toX, toY) || !at(toX, toY).traversable || at(toX, toY).rollover_impassable) return INF;
    if (!diagonal_move_allowed(fromX, fromY, toX, toY)) return INF;

    bool diagonal = (fromX != toX) && (fromY != toY);
    const Cell& c = at(toX, toY);
    double base = weights.w_d * (diagonal ? SQRT2 : 1.0);
    return base +
           weights.w_temp * c.thermal_hazard +
           weights.w_risk * c.structural_risk +
           weights.w_slope * c.slope_penalty +
           weights.w_obs * obstacle_penalty(toX, toY);
}

} // namespace aegis
