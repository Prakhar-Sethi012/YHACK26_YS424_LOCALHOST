import type { GridNode } from "@/types";

export interface CostWeights {
  distance: number;
  slope: number;
  risk: number;
  thermal: number;
  obstacle: number;
}

export const DEFAULT_WEIGHTS: CostWeights = {
  distance: 1,
  slope: 4,
  risk: 3,
  thermal: 2,
  obstacle: 5,
};

const MAX_SLOPE_DEGREES = 35;

export function nodeCost(node: GridNode, weights: CostWeights = DEFAULT_WEIGHTS): number {
  if (node.slope > MAX_SLOPE_DEGREES) return Infinity;
  if (node.obstacle) return Infinity;

  return (
    weights.distance +
    weights.slope * node.slope +
    weights.risk * node.structuralRisk +
    weights.thermal * node.heat
  );
}
