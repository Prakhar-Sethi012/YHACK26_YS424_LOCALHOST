import React from 'react';
import { AlertOctagon } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// React unmounts the whole tree on any uncaught render error with no boundary
// in place -- for a live command-and-control display, a bad telemetry frame
// or a rendering edge case would otherwise take the operator from a full
// dashboard straight to a blank black screen with no way back short of a
// manual reload they have no prompt to make.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AEGIS-NAV] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-screen h-screen bg-black flex items-center justify-center font-mono text-white p-4">
          <div className="max-w-md w-full bg-neutral-950 border-2 border-rose-500 rounded p-5 shadow-[0_0_30px_rgba(244,63,94,0.25)]">
            <div className="flex items-center gap-2.5 text-rose-400 text-sm font-bold tracking-wider mb-3 border-b border-neutral-800 pb-2">
              <AlertOctagon className="w-5 h-5" />
              C2 INTERFACE FAULT
            </div>
            <p className="text-xs text-neutral-400 mb-4">
              The command interface hit an unrecoverable rendering error and stopped to avoid showing stale
              or incorrect tactical data.
            </p>
            <p className="text-[11px] text-neutral-500 mb-4 break-words">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold transition-colors"
            >
              RELOAD C2 INTERFACE
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
