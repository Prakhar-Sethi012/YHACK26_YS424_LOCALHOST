from __future__ import annotations

import aegis_core

from aegis_backend.services.energy import EnergyState, PowerModelParams


class EngineState:
    """In-memory singleton holding the active Grid2D and planner instances.

    A single mission runs at a time per service instance, matching the scope
    of this hackathon build (see docs in the repo root's blueprint doc).
    """

    def __init__(self) -> None:
        self.grid: aegis_core.Grid2D | None = None
        self.resolution: float = 1.0
        self.astar = aegis_core.AStarPlanner()
        self.dstar = aegis_core.DStarLitePlanner()
        self.active_path: list[tuple[int, int]] = []
        self.active_cost: float = 0.0
        self.start: tuple[int, int] | None = None
        self.goal: tuple[int, int] | None = None
        self.dstar_initialized: bool = False
        self.energy = EnergyState()
        self.power_params = PowerModelParams()

    def require_grid(self) -> aegis_core.Grid2D:
        if self.grid is None:
            raise RuntimeError("Grid not initialized. Call /api/grid/init first.")
        return self.grid

    def set_weights(self, weights: aegis_core.CostWeights) -> None:
        self.astar.weights = weights
        self.dstar.weights = weights


engine_state = EngineState()


def get_engine_state() -> EngineState:
    return engine_state
