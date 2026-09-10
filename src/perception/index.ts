import type { RobotPose, SosTransmission, Victim } from "@/types";

const DETECTION_RADIUS = 15;

export function detectVictims(pose: RobotPose, victims: Victim[]): Victim[] {
  return victims.filter((victim) => {
    if (victim.detected) return false;
    const dx = victim.position.x - pose.position.x;
    const dy = victim.position.y - pose.position.y;
    return Math.sqrt(dx * dx + dy * dy) <= DETECTION_RADIUS;
  });
}

export function buildSosTransmission(victim: Victim): SosTransmission {
  return {
    victimId: victim.id,
    position: victim.position,
    elevation: 0,
    triageStatus: "unknown",
    timestamp: Date.now(),
  };
}
