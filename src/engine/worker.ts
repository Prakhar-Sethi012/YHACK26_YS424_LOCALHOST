/// <reference lib="webworker" />
import { createEnvironmentGrid } from "@/environment";
import { planAStar } from "@/engine/planners/astar";

// TODO(phase 2): route real EngineRequest messages (replan triggers, cost-field
// updates) here instead of the placeholder grid/plan below.
const grid = createEnvironmentGrid();

self.onmessage = () => {
  const path = planAStar(grid, { x: 0, y: 0 }, { x: grid.length - 1, y: grid.length - 1 });
  self.postMessage({ type: "path", path });
};
