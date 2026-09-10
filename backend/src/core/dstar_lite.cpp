#include "dstar_lite.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace aegis {

namespace {
constexpr double EPS = 1e-9;
}

bool Key::operator<(const Key& other) const {
    if (k1 + EPS < other.k1) return true;
    if (other.k1 + EPS < k1) return false;
    return k2 + EPS < other.k2;
}

bool Key::operator==(const Key& other) const {
    return std::abs(k1 - other.k1) < EPS && std::abs(k2 - other.k2) < EPS;
}

DStarLitePlanner::DStarLitePlanner(CostWeights weights) : weights_(weights) {}

double DStarLitePlanner::g_of(int idx) const {
    auto it = g_.find(idx);
    return it == g_.end() ? INF : it->second;
}

double DStarLitePlanner::rhs_of(int idx) const {
    auto it = rhs_.find(idx);
    return it == rhs_.end() ? INF : it->second;
}

std::vector<int> DStarLitePlanner::neighbors(int idx) const {
    static const int dx8[8] = {1, -1, 0, 0, 1, 1, -1, -1};
    static const int dy8[8] = {0, 0, 1, -1, 1, -1, 1, -1};
    std::vector<int> result;
    result.reserve(8);
    int x = idx % width_;
    int y = idx / width_;
    for (int k = 0; k < 8; ++k) {
        int nx = x + dx8[k];
        int ny = y + dy8[k];
        if (nx < 0 || ny < 0 || nx >= width_ || ny >= height_) continue;
        result.push_back(ny * width_ + nx);
    }
    return result;
}

double DStarLitePlanner::edge_cost(int from_idx, int to_idx) const {
    int fx = from_idx % width_, fy = from_idx / width_;
    int tx = to_idx % width_, ty = to_idx / width_;
    return grid_->traversal_cost(fx, fy, tx, ty, weights_);
}

double DStarLitePlanner::heuristic_idx(int a_idx, int b_idx) const {
    return octile_heuristic(a_idx % width_, a_idx / width_, b_idx % width_, b_idx / width_);
}

Key DStarLitePlanner::calculate_key(int idx) const {
    double m = std::min(g_of(idx), rhs_of(idx));
    return Key{m + heuristic_idx(start_idx_, idx) + k_m_, m};
}

void DStarLitePlanner::update_vertex(int idx) {
    if (idx != goal_idx_) {
        double best = INF;
        for (int n : neighbors(idx)) {
            double c = edge_cost(idx, n);
            if (!std::isfinite(c)) continue;
            double candidate = c + g_of(n);
            if (candidate < best) best = candidate;
        }
        rhs_[idx] = best;
    }

    bool inconsistent = std::abs(g_of(idx) - rhs_of(idx)) > EPS;
    if (inconsistent) {
        Key k = calculate_key(idx);
        last_key_in_queue_[idx] = k;
        in_queue_.insert(idx);
        heap_.push_back({k, idx});
        std::push_heap(heap_.begin(), heap_.end(), QueueEntryCompare());
    } else {
        in_queue_.erase(idx);
    }
}

int DStarLitePlanner::compute_shortest_path(int expansion_budget) {
    int expanded = 0;
    while (!heap_.empty() && expanded < expansion_budget) {
        Key top_key = heap_.front().key;
        bool start_consistent = std::abs(g_of(start_idx_) - rhs_of(start_idx_)) < EPS;
        Key start_key = calculate_key(start_idx_);
        if (!(top_key < start_key) && start_consistent) break;

        std::pop_heap(heap_.begin(), heap_.end(), QueueEntryCompare());
        QueueEntry entry = heap_.back();
        heap_.pop_back();

        int u = entry.idx;

        // Lazy deletion: the heap may hold stale entries for a vertex that was
        // re-keyed or became consistent since being pushed. Skip anything that
        // isn't the currently-authoritative entry for its vertex.
        if (!in_queue_.count(u)) continue;
        auto it = last_key_in_queue_.find(u);
        if (it == last_key_in_queue_.end() || !(it->second == entry.key)) continue;

        ++expanded;

        Key k_new = calculate_key(u);
        if (entry.key < k_new) {
            last_key_in_queue_[u] = k_new;
            heap_.push_back({k_new, u});
            std::push_heap(heap_.begin(), heap_.end(), QueueEntryCompare());
            continue;
        }

        if (g_of(u) > rhs_of(u)) {
            g_[u] = rhs_of(u);
            in_queue_.erase(u);
            for (int s : neighbors(u)) update_vertex(s);
        } else {
            g_[u] = INF;
            update_vertex(u);
            for (int s : neighbors(u)) update_vertex(s);
        }
    }
    return expanded;
}

ReplanResult DStarLitePlanner::extract_path() const {
    ReplanResult result;
    if (!std::isfinite(g_of(start_idx_))) {
        return result;
    }

    std::vector<std::pair<int, int>> path;
    int cur = start_idx_;
    int max_steps = width_ * height_ + 4;
    double total_cost = 0.0;

    path.push_back({cur % width_, cur / width_});
    while (cur != goal_idx_ && max_steps-- > 0) {
        int best_next = -1;
        double best_cost = INF;
        for (int n : neighbors(cur)) {
            double c = edge_cost(cur, n);
            if (!std::isfinite(c)) continue;
            double candidate = c + g_of(n);
            if (candidate < best_cost) {
                best_cost = candidate;
                best_next = n;
            }
        }
        if (best_next == -1 || !std::isfinite(best_cost)) {
            return ReplanResult{}; // no route found
        }
        total_cost += edge_cost(cur, best_next);
        cur = best_next;
        path.push_back({cur % width_, cur / width_});
    }

    if (cur != goal_idx_) {
        return ReplanResult{}; // exceeded max_steps without reaching goal
    }

    result.path = std::move(path);
    result.cost = total_cost;
    result.found = true;
    return result;
}

ReplanResult DStarLitePlanner::init(std::shared_ptr<Grid2D> grid, std::pair<int, int> start, std::pair<int, int> goal) {
    auto t0 = std::chrono::steady_clock::now();

    grid_ = std::move(grid);
    width_ = grid_->width();
    height_ = grid_->height();
    start_idx_ = grid_->index(start.first, start.second);
    goal_idx_ = grid_->index(goal.first, goal.second);
    last_start_idx_ = start_idx_;
    k_m_ = 0.0;

    g_.clear();
    rhs_.clear();
    last_key_in_queue_.clear();
    in_queue_.clear();
    heap_.clear();

    rhs_[goal_idx_] = 0.0;
    Key k = calculate_key(goal_idx_);
    last_key_in_queue_[goal_idx_] = k;
    in_queue_.insert(goal_idx_);
    heap_.push_back({k, goal_idx_});
    std::push_heap(heap_.begin(), heap_.end(), QueueEntryCompare());

    compute_shortest_path(2 * width_ * height_ + 16);
    initialized_ = true;

    ReplanResult result = extract_path();
    auto t1 = std::chrono::steady_clock::now();
    result.latency_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
    return result;
}

ReplanResult DStarLitePlanner::update_obstacles(const std::vector<std::pair<int, int>>& changed_cells,
                                                 const std::vector<bool>& blocked,
                                                 std::pair<int, int> current_position) {
    auto t0 = std::chrono::steady_clock::now();

    if (!initialized_ || !grid_) {
        return ReplanResult{};
    }

    if (grid_->in_bounds(current_position.first, current_position.second)) {
        start_idx_ = grid_->index(current_position.first, current_position.second);
    }

    // k_m accumulates heuristic drift as the agent's start advances between
    // replans -- see this method's declaration in the header for why.
    k_m_ += heuristic_idx(last_start_idx_, start_idx_);
    last_start_idx_ = start_idx_;

    std::vector<float> old_clearance(grid_->cells.size());
    for (size_t i = 0; i < grid_->cells.size(); ++i) old_clearance[i] = grid_->cells[i].clearance;

    size_t count = std::min(changed_cells.size(), blocked.size());
    std::unordered_set<int> mutated;
    for (size_t i = 0; i < count; ++i) {
        int x = changed_cells[i].first;
        int y = changed_cells[i].second;
        if (!grid_->in_bounds(x, y)) continue;
        grid_->set_obstacle(x, y, blocked[i]);
        mutated.insert(grid_->index(x, y));
    }

    grid_->recompute_clearance();

    // Any cell whose clearance shifted (or was directly mutated) changes the
    // cost of edges *into* it, which affects the rhs of its neighbors.
    std::unordered_set<int> touched;
    for (size_t i = 0; i < grid_->cells.size(); ++i) {
        int idx = static_cast<int>(i);
        if (grid_->cells[i].clearance != old_clearance[i] || mutated.count(idx)) {
            touched.insert(idx);
            for (int n : neighbors(idx)) touched.insert(n);
        }
    }

    for (int idx : touched) update_vertex(idx);

    int expanded = compute_shortest_path(2 * width_ * height_ + 16);

    ReplanResult result = extract_path();
    auto t1 = std::chrono::steady_clock::now();
    result.latency_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
    result.vertices_expanded = expanded;
    return result;
}

} // namespace aegis
