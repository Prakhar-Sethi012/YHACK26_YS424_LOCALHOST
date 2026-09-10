import type { GridNode, Vec2 } from "@/types";
import { nodeCost } from "@/engine/costField";

export function planAStar(grid: GridNode[][], start: Vec2, goal: Vec2): Vec2[] {
  // TODO(phase 2): baseline global planner. Replace with real A* search
  // (open/closed sets keyed by grid coords, heuristic = euclidean to goal).
  void nodeCost(grid[start.y]?.[start.x] ?? grid[0][0]);
  return [start, goal];
}
