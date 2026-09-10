import type { GridNode, Vec2 } from "@/types";

export interface DStarLiteState {
  start: Vec2;
  goal: Vec2;
  grid: GridNode[][];
}

export function initDStarLite(grid: GridNode[][], start: Vec2, goal: Vec2): DStarLiteState {
  return { start, goal, grid };
}

export function repairPath(state: DStarLiteState, changedCells: Vec2[]): Vec2[] {
  // TODO(phase 2): incremental replanning — only touch path segments downstream
  // of `changedCells` instead of recomputing the full search from scratch.
  void changedCells;
  return [state.start, state.goal];
}
