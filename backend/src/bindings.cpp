#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <memory>

#include "core/astar.hpp"
#include "core/dstar_lite.hpp"
#include "core/grid2d.hpp"

namespace py = pybind11;
using namespace aegis;

PYBIND11_MODULE(aegis_core, m) {
    m.doc() = "AEGIS-NAV native 2D grid pathfinding core (Grid2D, AStarPlanner, DStarLitePlanner)";

    py::class_<CostWeights>(m, "CostWeights")
        .def(py::init<>())
        .def_readwrite("w_d", &CostWeights::w_d)
        .def_readwrite("w_temp", &CostWeights::w_temp)
        .def_readwrite("w_risk", &CostWeights::w_risk)
        .def_readwrite("w_obs", &CostWeights::w_obs);

    py::class_<Cell>(m, "Cell")
        .def(py::init<>())
        .def_readwrite("traversable", &Cell::traversable)
        .def_readwrite("thermal_hazard", &Cell::thermal_hazard)
        .def_readwrite("structural_risk", &Cell::structural_risk)
        .def_readwrite("clearance", &Cell::clearance);

    py::class_<Grid2D, std::shared_ptr<Grid2D>>(m, "Grid2D")
        .def(py::init<int, int>(), py::arg("width"), py::arg("height"))
        .def_property_readonly("width", &Grid2D::width)
        .def_property_readonly("height", &Grid2D::height)
        .def("in_bounds", &Grid2D::in_bounds)
        .def("get_cell", [](const Grid2D& g, int x, int y) { return g.at(x, y); })
        .def("set_obstacle", &Grid2D::set_obstacle, py::arg("x"), py::arg("y"), py::arg("blocked"))
        .def("set_hazard", &Grid2D::set_hazard, py::arg("x"), py::arg("y"), py::arg("thermal_hazard"),
             py::arg("structural_risk"))
        .def("recompute_clearance", &Grid2D::recompute_clearance)
        .def("cell_cost", &Grid2D::cell_cost, py::arg("x"), py::arg("y"), py::arg("weights"))
        .def("costmap", [](const Grid2D& g, const CostWeights& weights) {
            std::vector<std::vector<double>> rows(g.height(), std::vector<double>(g.width()));
            for (int y = 0; y < g.height(); ++y) {
                for (int x = 0; x < g.width(); ++x) {
                    double c = g.cell_cost(x, y, weights);
                    rows[y][x] = std::isfinite(c) ? c : -1.0;
                }
            }
            return rows;
        }, py::arg("weights"));

    py::class_<PathResult>(m, "PathResult")
        .def_readonly("path", &PathResult::path)
        .def_readonly("cost", &PathResult::cost)
        .def_readonly("latency_ms", &PathResult::latency_ms)
        .def_readonly("found", &PathResult::found);

    py::class_<ReplanResult>(m, "ReplanResult")
        .def_readonly("path", &ReplanResult::path)
        .def_readonly("cost", &ReplanResult::cost)
        .def_readonly("latency_ms", &ReplanResult::latency_ms)
        .def_readonly("found", &ReplanResult::found)
        .def_readonly("vertices_expanded", &ReplanResult::vertices_expanded);

    py::class_<AStarPlanner>(m, "AStarPlanner")
        .def(py::init<CostWeights>(), py::arg("weights") = CostWeights())
        .def("plan", &AStarPlanner::plan, py::arg("grid"), py::arg("start"), py::arg("goal"))
        .def_property("weights", &AStarPlanner::weights, &AStarPlanner::set_weights);

    py::class_<DStarLitePlanner>(m, "DStarLitePlanner")
        .def(py::init<CostWeights>(), py::arg("weights") = CostWeights())
        .def("init", &DStarLitePlanner::init, py::arg("grid"), py::arg("start"), py::arg("goal"))
        .def("update_obstacles", &DStarLitePlanner::update_obstacles, py::arg("changed_cells"),
             py::arg("blocked"))
        .def_property("weights", &DStarLitePlanner::weights, &DStarLitePlanner::set_weights);
}
