import { useEffect, useRef } from 'react';
import { useMissionStore, bindWebSocket, unbindWebSocket } from '../store/useMissionStore';

export const useSimulationSocket = () => {
  const { setWsConnected, setInitialState, updateTelemetry, setMutationAck } = useMissionStore();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Avoid double instantiation in dev
    if (socketRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/simulation`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;
    bindWebSocket(ws);

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onclose = () => {
      setWsConnected(false);
      unbindWebSocket();
      socketRef.current = null;
    };

    ws.onerror = (err) => {
      console.error('[AEGIS WS] Stream Error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'initial_state':
            setInitialState(message.data);
            break;
          case 'telemetry':
            updateTelemetry(message.data);
            break;
          case 'mutation_ack':
            setMutationAck(message.data);
            break;
          case 'error':
            console.error('[AEGIS Backend Error]:', message.data.message);
            break;
        }
      } catch (err) {
        console.error('[AEGIS WS] Parsing failed:', err);
      }
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
        unbindWebSocket();
        setWsConnected(false);
      }
    };
  }, [setWsConnected, setInitialState, updateTelemetry, setMutationAck]);
};
