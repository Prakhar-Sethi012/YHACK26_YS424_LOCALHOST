export type Path3DPoint = [number, number, number]; // [x, y, z]

export interface VictimGroundTruth {
  id: string;
  x: number;
  y: number;
  triage: string;
  temp_c: number;
}

export interface InitialStateData {
  width: number;
  height: number;
  resolution: number;
  start: [number, number];
  goal: [number, number];
  elevation: number[][]; // [100][100]
  temperature: number[][];
  obstacles: boolean[][];
  victims: VictimGroundTruth[];
  initial_path: Path3DPoint[];
  planning_backend: string;
}

export interface DynamicObstacle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface BenchmarkMetrics {
  latency_ms: number;
  path_length: number;
  nodes_expanded: number;
  energy_kj: number;
}

export interface SOSPayload {
  transmission_id: string;
  victim_id: string;
  timestamp_utc: string;
  target_coordinates: { x: number; y: number; elevation: number };
  triage_status: string;
  vital_thermal_signature: string;
  ambient_temperature: string;
  extraction_corridor: string;
}

export interface TelemetryData {
  pose: {
    x: number;
    y: number;
    heading_rad: number;
    heading_deg: number;
    velocity: number;
    angular_velocity: number;
  };
  environment: {
    elevation: number;
    slope_deg: number;
    ambient_temp_c: number;
  };
  power: {
    power_watts: number;
    battery_wh: number;
    battery_pct: number;
    fuel_liters: number;
    fuel_pct: number;
    total_energy_kj: number;
    is_critical_reserve: boolean;
  };
  path: Path3DPoint[];
  waypoint_index: number;
  goal: [number, number]; // live -- set_goal can retarget this mid-mission
  paused: boolean;
  dynamic_obstacles: DynamicObstacle[];
  benchmark: {
    astar: BenchmarkMetrics;
    dstar_lite: BenchmarkMetrics;
  };
  new_sos: SOSPayload | null;
  sos_count: number;
}

export type MutationAck =
  | { status: 'replanned'; source: 'baseline' | 'mutate'; round_trip_ms: number; path_changed: boolean; speedup_factor?: number }
  | { status: 'no_op'; reason: string }
  | { status: 'replan_failed'; error: string }
  | { status: 'ignored'; reason: string };

export type ActiveTool = 'select' | 'drop_obstacle' | 'add_heat_zone' | 'set_start' | 'set_goal';
