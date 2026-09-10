import { create } from "zustand";
import type { BenchmarkRow, PathPoint, ResourceLevels, RobotPose, SosTransmission } from "@/types";

interface MissionState {
  pose: RobotPose;
  resources: ResourceLevels;
  activePath: PathPoint[];
  benchmark: BenchmarkRow[];
  sosLog: SosTransmission[];
  missionActive: boolean;
  startMission: () => void;
  setPose: (pose: RobotPose) => void;
  setResources: (resources: ResourceLevels) => void;
  setActivePath: (path: PathPoint[]) => void;
  setBenchmark: (rows: BenchmarkRow[]) => void;
  pushSos: (tx: SosTransmission) => void;
}

export const useMissionStore = create<MissionState>((set) => ({
  pose: { position: { x: 0, y: 0 }, heading: 0, velocity: 0 },
  resources: { fuelLiters: 4.2, batteryWh: 12.4 },
  activePath: [],
  benchmark: [],
  sosLog: [],
  missionActive: false,
  startMission: () => set({ missionActive: true }),
  setPose: (pose) => set({ pose }),
  setResources: (resources) => set({ resources }),
  setActivePath: (activePath) => set({ activePath }),
  setBenchmark: (benchmark) => set({ benchmark }),
  pushSos: (tx) => set((s) => ({ sosLog: [...s.sosLog, tx] })),
}));
