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

    // Every handler below guards on `socketRef.current === ws` before touching
    // shared state. React StrictMode's dev-mode double-invoke creates a first
    // socket, closes it during the synthetic cleanup, then creates a second
    // (real) one -- but the first socket's close event fires *asynchronously*,
    // often after the second socket is already bound. Without this guard, that
    // stale event's onclose handler unconditionally nulls out socketRef and
    // wsConnected, retroactively destroying the second socket's valid binding
    // even though it's open and streaming fine -- which is exactly what made
    // sendDropObstacle silently no-op: socketRef looked unbound to it, despite
    // a perfectly good connection sitting right there.
    ws.onopen = () => {
      if (socketRef.current === ws) {
        setWsConnected(true);
      }
    };

    ws.onclose = () => {
      if (socketRef.current === ws) {
        setWsConnected(false);
        unbindWebSocket();
        socketRef.current = null;
      }
    };

    ws.onerror = (err) => {
      if (socketRef.current === ws) {
        console.error('[AEGIS WS] Stream Error:', err);
      }
    };

    ws.onmessage = (event) => {
      if (socketRef.current !== ws) return;
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
