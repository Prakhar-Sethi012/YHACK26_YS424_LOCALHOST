import { create } from 'zustand';
import { InitialStateData, TelemetryData, SOSPayload, MutationAck, ActiveTool } from '../types/mission';

interface MissionStore {
  wsConnected: boolean;
  initialState: InitialStateData | null;
  telemetry: TelemetryData | null;
  activeTool: ActiveTool;
  detectedVictims: Map<string, SOSPayload>;
  activeSOSModal: SOSPayload | null;
  lastMutationAck: MutationAck | null;
  replanSegmentNotice: boolean;

  setWsConnected: (connected: boolean) => void;
  setInitialState: (data: InitialStateData) => void;
  updateTelemetry: (data: TelemetryData) => void;
  setActiveTool: (tool: ActiveTool) => void;
  dismissSOSModal: () => void;
  setMutationAck: (ack: MutationAck) => void;

  // Outbound WS triggers
  sendDropObstacle: (x: number, y: number, radius?: number) => void;
  sendAddHeatZone: (x: number, y: number, temp?: number, sigma?: number) => void;
  sendEmergencyLowBattery: () => void;
}

let socketRef: WebSocket | null = null;

export const useMissionStore = create<MissionStore>((set) => ({
  wsConnected: false,
  initialState: null,
  telemetry: null,
  activeTool: 'select',
  detectedVictims: new Map(),
  activeSOSModal: null,
  lastMutationAck: null,
  replanSegmentNotice: false,

  setWsConnected: (connected) => set({ wsConnected: connected }),
  setInitialState: (data) => set({ initialState: data }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  dismissSOSModal: () => set({ activeSOSModal: null }),
  setMutationAck: (ack) => set({ lastMutationAck: ack }),

  updateTelemetry: (data) => {
    set((state) => {
      let updatedVictims = state.detectedVictims;
      let modalToShow = state.activeSOSModal;

      if (data.new_sos) {
        updatedVictims = new Map(state.detectedVictims);
        updatedVictims.set(data.new_sos.victim_id, data.new_sos);
        modalToShow = data.new_sos;
      }

      return {
        telemetry: data,
        detectedVictims: updatedVictims,
        activeSOSModal: modalToShow,
      };
    });
  },

  sendDropObstacle: (x, y, radius = 3) => {
    if (socketRef && socketRef.readyState === WebSocket.OPEN) {
      socketRef.send(JSON.stringify({ type: 'drop_obstacle', x: Math.round(x), y: Math.round(y), radius }));
    }
  },

  sendAddHeatZone: (x, y, temp = 80.0, sigma = 6.0) => {
    if (socketRef && socketRef.readyState === WebSocket.OPEN) {
      socketRef.send(JSON.stringify({ type: 'add_heat_zone', x: Math.round(x), y: Math.round(y), temp, sigma }));
    }
  },

  sendEmergencyLowBattery: () => {
    if (socketRef && socketRef.readyState === WebSocket.OPEN) {
      socketRef.send(JSON.stringify({ type: 'emergency_low_battery' }));
    }
  },
}));

export const bindWebSocket = (ws: WebSocket) => {
  socketRef = ws;
};

export const unbindWebSocket = () => {
  socketRef = null;
};
