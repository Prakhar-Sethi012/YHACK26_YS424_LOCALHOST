import { useEffect, useRef } from 'react';
import { useMissionStore, bindWebSocket, unbindWebSocket } from '../store/useMissionStore';

export const useSimulationSocket = () => {
  const { setWsConnected, setInitialState, updateTelemetry, setMutationAck } = useMissionStore();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    // Avoid double instantiation in dev
    if (socketRef.current) return;

    // `cancelled` distinguishes a real unmount from React StrictMode's dev-mode
    // double-invoke: it's captured per-effect-run, so the throwaway first run's
    // reconnect timer (if any) can never fire once that run's cleanup sets it.
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

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
      // a perfectly good connection sitting right there. The same identity check
      // also keeps a stale socket's close event from scheduling a duplicate
      // reconnect once a newer socket is already active.
      ws.onopen = () => {
        if (socketRef.current === ws) {
          reconnectAttemptRef.current = 0;
          setWsConnected(true);
        }
      };

      ws.onclose = () => {
        if (socketRef.current === ws) {
          setWsConnected(false);
          unbindWebSocket();
          socketRef.current = null;

          if (!cancelled) {
            const attempt = reconnectAttemptRef.current;
            reconnectAttemptRef.current = attempt + 1;
            const delayMs = Math.min(1000 * 2 ** attempt, 8000);
            reconnectTimerRef.current = setTimeout(connect, delayMs);
          }
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
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
        unbindWebSocket();
        setWsConnected(false);
      }
    };
  }, [setWsConnected, setInitialState, updateTelemetry, setMutationAck]);
};
