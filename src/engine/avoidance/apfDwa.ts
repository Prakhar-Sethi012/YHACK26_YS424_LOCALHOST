import type { RobotPose, Vec2 } from "@/types";

export interface DynamicObstacle {
  position: Vec2;
  velocity: Vec2;
}

export interface VelocityCommand {
  v: number;
  omega: number;
}

export function selectVelocity(pose: RobotPose, obstacles: DynamicObstacle[]): VelocityCommand {
  // TODO(phase 3): APF repulsion + DWA admissible-velocity search over
  // (v, omega) pairs scored by heading/clearance/velocity objectives.
  void obstacles;
  return { v: pose.velocity, omega: 0 };
}
