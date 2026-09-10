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
        const data = JSON.parse(event.data);
        if (data.type === 'initial_state') {
          set({ 
            path3d: data.path,
            telemetry: {
              ...data.telemetry,
              status: 'INITIALIZED'
            }
          });
        } else if (data.type === 'telemetry') {
          set({ 
            telemetry: {
              ...data.telemetry,
              status: 'ACTIVE'
            },
            path3d: data.path 
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
      // In a real app we'd send a command over WS or REST
      // For now, just track locally to render
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
