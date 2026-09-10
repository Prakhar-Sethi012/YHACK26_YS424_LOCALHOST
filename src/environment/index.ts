import type { GridNode } from "@/types";

export const GRID_SIZE = 100;

export function createEnvironmentGrid(size = GRID_SIZE): GridNode[][] {
  const grid: GridNode[][] = [];
  for (let y = 0; y < size; y++) {
    const row: GridNode[] = [];
    for (let x = 0; x < size; x++) {
      row.push({ elevation: 0, slope: 0, heat: 0, structuralRisk: 0, obstacle: false });
    }
    grid.push(row);
  }
  return grid;
}
