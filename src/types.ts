export interface Vec2 {
  x: number;
  y: number;
}

export interface GridNode {
  elevation: number;
  slope: number;
  heat: number;
  structuralRisk: number;
  obstacle: boolean;
}

export interface RobotPose {
  position: Vec2;
  heading: number;
  velocity: number;
}

export interface ResourceLevels {
  fuelLiters: number;
  batteryWh: number;
}

export type PlannerId = "astar" | "dstar-lite";

export interface PathPoint extends Vec2 {
  cost: number;
}

export interface BenchmarkRow {
  planner: PlannerId;
  latencyMs: number;
  pathLength: number;
  energyUsed: number;
  collisionsAvoided: number;
}

export interface Victim {
  id: string;
  position: Vec2;
  detected: boolean;
}

export interface SosTransmission {
  victimId: string;
  position: Vec2;
  elevation: number;
  triageStatus: string;
  timestamp: number;
}
