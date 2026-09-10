import { create } from 'zustand';

export interface Telemetry {
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
  yaw: number;
  velocity: number;
  battery_pct: number;
  battery_wh: number;
  fuel_liters: number;
  distance_traveled_m: number;
  status: string;
  is_critical_reserve: boolean;
}

interface SimulationState {
  connected: boolean;
  telemetry: Telemetry | null;
  path3d: [number, number, number][];
  hazards: { x: number; y: number; temp: number }[];
  connect: () => void;
  disconnect: () => void;
  addHazard: (x: number, y: number, temp: number) => void;
  dropObstacle: (x: number, y: number, radius: number) => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => {
  let ws: WebSocket | null = null;

  return {
    connected: false,
    telemetry: null,
    path3d: [],
    hazards: [],

    connect: () => {
      if (ws) return;
      ws = new WebSocket('ws://localhost:8002/ws/simulation');
      
      ws.onopen = () => set({ connected: true });
      ws.onclose = () => {
        set({ connected: false });
        ws = null;
        // Auto-reconnect after 2s
        setTimeout(() => get().connect(), 2000);
      };
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'initial_state') {
          const data = msg.data || {};
          const start = data.start || [0, 0];
          set({ 
            path3d: data.initial_path || [],
            telemetry: {
              status: 'INITIALIZED',
              x: start[0],
              y: start[1],
              z: 0,
              pitch: 0,
              roll: 0,
              yaw: 0,
              velocity: 0,
              battery_pct: 100,
              battery_wh: 100,
              fuel_liters: 0,
              distance_traveled_m: 0,
              is_critical_reserve: false
            }
          });
        } else if (msg.type === 'telemetry') {
          const t = msg.data;
          if (!t || !t.pose) return;
          set({ 
            telemetry: {
              status: 'ACTIVE',
              x: t.pose.x,
              y: t.pose.y,
              z: t.environment ? t.environment.elevation : 0,
              pitch: t.environment ? t.environment.slope_deg * (Math.PI/180) : 0,
              roll: 0,
              yaw: t.pose.heading_rad,
              velocity: t.pose.velocity,
              battery_pct: t.power ? t.power.battery_pct : 100,
              battery_wh: t.power ? t.power.battery_wh : 0,
              fuel_liters: t.power ? t.power.fuel_liters : 0,
              distance_traveled_m: 0,
              is_critical_reserve: t.power ? t.power.is_critical_reserve : false
            },
            path3d: t.path || []
          });
        }
      };
    },

    disconnect: () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    addHazard: (x: number, y: number, temp: number) => {
      set((state) => ({ hazards: [...state.hazards, { x, y, temp }] }));
    },

    dropObstacle: (x: number, y: number, radius: number) => {
      if (!ws) return;
      ws.send(JSON.stringify({
        type: 'mutate',
        action: 'drop_obstacle',
        x, y, radius
      }));
    }
  };
});
