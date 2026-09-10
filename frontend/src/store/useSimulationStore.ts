import { create } from 'zustand';

export interface Telemetry {
  x: number;
  y: number;
  z: number;
  heading_rad: number;
  velocity: number;
  angular_velocity: number;
  slope_deg: number;
  ambient_temp_c: number;
  battery_pct: number;
  battery_wh: number;
  fuel_liters: number;
  is_critical_reserve: boolean;
  status: 'INITIALIZED' | 'ACTIVE' | 'STOPPED';
  distance_traveled_m: number;
}

export interface VictimData {
  id: string;
  x: number;
  y: number;
  triage: string;
  temp_c: number;
}

export interface DynamicObstacle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface BenchmarkStats {
  astar_latency_ms: number;
  dstar_latency_ms: number;
  astar_path_length: number;
  dstar_path_length: number;
  speedup_factor: number;
  nodes_expanded: number;
  last_source: 'baseline' | 'mutate';
  replan_count: number;
}

export interface SosAlert {
  transmission_id: string;
  victim_id: string;
  timestamp_utc: string;
  target_coordinates: { x: number; y: number; elevation: number };
  triage_status: string;
  vital_thermal_signature: string;
  ambient_temperature: string;
  extraction_corridor: string;
}

export type GodModeTool = 'wall' | 'fire' | 'landslide' | 'clear' | null;

interface SimulationState {
  connected: boolean;
  telemetry: Telemetry | null;
  path3d: [number, number, number][];
  elevationData: number[][] | null;
  temperatureData: number[][] | null;
  obstacleData: boolean[][] | null;
  victims: VictimData[];
  dynamicObstacles: DynamicObstacle[];
  mapWidth: number;
  mapHeight: number;
  benchmarkStats: BenchmarkStats | null;
  godModeTool: GodModeTool;
  lastMutationAck: string | null;
  latestSosAlert: SosAlert | null;
  sosCount: number;
  terrainVisual: 'digital_twin' | 'glb_mesh';
  roverVisual: 'leo_glb' | 'procedural';

  staticElevationData: number[][] | null;

  connect: () => void;
  disconnect: () => void;
  setGodModeTool: (tool: GodModeTool) => void;
  applyGodModeAt: (gridX: number, gridY: number) => void;
  sendGodModeCommand: (payload: any) => void;
  dismissSosAlert: () => void;
  setTerrainVisual: (v: 'digital_twin' | 'glb_mesh') => void;
  setRoverVisual: (v: 'leo_glb' | 'procedural') => void;
  setStaticElevationData: (data: number[][]) => void;
}

let _ws: WebSocket | null = null;

export const useSimulationStore = create<SimulationState>((set, get) => ({
  connected: false,
  telemetry: null,
  path3d: [],
  elevationData: null,
  staticElevationData: null,
  temperatureData: null,
  obstacleData: null,
  victims: [],
  dynamicObstacles: [],
  mapWidth: 100,
  mapHeight: 100,
  benchmarkStats: null,
  godModeTool: null,
  lastMutationAck: null,
  latestSosAlert: null,
  sosCount: 0,
  terrainVisual: 'glb_mesh',
  roverVisual: 'leo_glb',

  setStaticElevationData: (data) => set({ staticElevationData: data }),

  connect: () => {
    if (_ws) return;
    _ws = new WebSocket('ws://localhost:8002/ws/simulation');

    _ws.onopen = () => set({ connected: true });

    _ws.onclose = () => {
      set({ connected: false });
      _ws = null;
      setTimeout(() => get().connect(), 2000);
    };

    _ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const data = msg.data || {};

      if (msg.type === 'initial_state') {
        const start = data.start || [10, 10];
        set({
          elevationData: data.elevation || null,
          temperatureData: data.temperature || null,
          obstacleData: data.obstacles || null,
          victims: data.victims || [],
          mapWidth: data.width || 100,
          mapHeight: data.height || 100,
          path3d: data.initial_path || [],
          telemetry: {
            status: 'INITIALIZED',
            x: start[0],
            y: start[1],
            z: 0,
            heading_rad: 0,
            velocity: 0,
            angular_velocity: 0,
            slope_deg: 0,
            ambient_temp_c: 24,
            battery_pct: 100,
            battery_wh: 100,
            fuel_liters: 5,
            is_critical_reserve: false,
            distance_traveled_m: 0,
          },
        });
      } else if (msg.type === 'telemetry') {
        const pose = data.pose || {};
        const env = data.environment || {};
        const pwr = data.power || {};
        set((s) => ({
          telemetry: {
            status: 'ACTIVE',
            x: pose.x ?? s.telemetry?.x ?? 10,
            y: pose.y ?? s.telemetry?.y ?? 10,
            z: env.elevation ?? 0,
            heading_rad: pose.heading_rad ?? 0,
            velocity: pose.velocity ?? 0,
            angular_velocity: pose.angular_velocity ?? 0,
            slope_deg: env.slope_deg ?? 0,
            ambient_temp_c: env.ambient_temp_c ?? 24,
            battery_pct: pwr.battery_pct ?? 100,
            battery_wh: pwr.battery_wh ?? 100,
            fuel_liters: pwr.fuel_liters ?? 5,
            is_critical_reserve: pwr.is_critical_reserve ?? false,
            distance_traveled_m: (s.telemetry?.distance_traveled_m ?? 0) + (pose.velocity ?? 0) * 0.05,
          },
          path3d: data.path ?? s.path3d,
          dynamicObstacles: data.dynamic_obstacles ?? [],
          latestSosAlert: data.new_sos ? data.new_sos : s.latestSosAlert,
          sosCount: data.sos_count ?? s.sosCount,
        }));
      } else if (msg.type === 'mutation_ack') {
        const d = data;
        set((s) => {
          const stats = s.benchmarkStats ?? {
            astar_latency_ms: 0, dstar_latency_ms: 0,
            astar_path_length: 0, dstar_path_length: 0,
            speedup_factor: 1, nodes_expanded: 0,
            last_source: 'baseline' as const, replan_count: 0,
          };

          let newStats: BenchmarkStats;
          if (d.source === 'baseline') {
            newStats = {
              ...stats,
              astar_latency_ms: d.backend2_compute_time_ms ?? d.round_trip_ms ?? stats.astar_latency_ms,
              astar_path_length: d.new_path_length ?? stats.astar_path_length,
              last_source: 'baseline',
              replan_count: stats.replan_count + 1,
            };
          } else {
            newStats = {
              ...stats,
              dstar_latency_ms: d.backend2_repair_latency_ms ?? stats.dstar_latency_ms,
              dstar_path_length: d.new_path_length ?? stats.dstar_path_length,
              speedup_factor: d.speedup_factor ?? stats.speedup_factor,
              nodes_expanded: d.nodes_expanded ?? stats.nodes_expanded,
              last_source: 'mutate',
              replan_count: stats.replan_count + 1,
            };
          }
          return {
            benchmarkStats: newStats,
            lastMutationAck: d.status === 'replanned'
              ? `D* Lite repaired in ${(d.backend2_repair_latency_ms ?? d.round_trip_ms ?? 0).toFixed(1)}ms`
              : d.status,
          };
        });
      }
    };
  },

  disconnect: () => {
    if (_ws) { _ws.close(); _ws = null; }
  },

  setGodModeTool: (tool) => set({ godModeTool: tool }),

  applyGodModeAt: (gridX: number, gridY: number) => {
    if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
    const { godModeTool } = get();
    if (!godModeTool) return;

    if (godModeTool === 'wall') {
      _ws.send(JSON.stringify({ type: 'drop_obstacle', x: gridX, y: gridY, radius: 2 }));
    } else if (godModeTool === 'fire') {
      _ws.send(JSON.stringify({ type: 'add_heat_zone', x: gridX, y: gridY, temp: 90.0, sigma: 5.0 }));
    } else if (godModeTool === 'landslide') {
      _ws.send(JSON.stringify({ type: 'drop_obstacle', x: gridX, y: gridY, radius: 5 }));
    } else if (godModeTool === 'clear') {
      _ws.send(JSON.stringify({ type: 'clear_obstacle', x: gridX, y: gridY, radius: 3 }));
    }
  },

  sendGodModeCommand: (payload: any) => {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(payload));
    }
  },

  dismissSosAlert: () => set({ latestSosAlert: null }),
  setTerrainVisual: (v) => set({ terrainVisual: v }),
  setRoverVisual: (v) => set({ roverVisual: v }),
}));
