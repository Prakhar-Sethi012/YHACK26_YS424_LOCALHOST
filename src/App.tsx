import React, { useState } from 'react';
import { Globe2, LayoutDashboard } from 'lucide-react';
import { ViewportCanvas } from './components/ViewportCanvas';
import { HUD } from './components/HUD';
import { GodModeToolbar } from './components/GodModeToolbar';
import { SOSModal } from './components/SOSModal';
import { MutationAckToast } from './components/MutationAckToast';
import { WayanadMission } from './components/WayanadMission';
import { useSimulationSocket } from './hooks/useSimulationSocket';

type View = 'command' | 'wayanad';

// Backend 2 holds one global grid/planner state for the whole process (see
// its EngineState docstring) -- Backend 1's live simulation loop and this
// page both write to that same singleton, so only one can safely be active
// at a time. Splitting the WS-driving hook into its own child component
// (rather than calling it conditionally in App itself, which would break
// React's rules of hooks) means switching away from 'command' actually
// unmounts it and closes the WebSocket, instead of leaving it running in
// the background fighting over Backend 2's grid with WayanadMission.
const CommandCenterView: React.FC = () => {
  useSimulationSocket();
  return (
    <>
      <ViewportCanvas />
      <HUD />
      <GodModeToolbar />
      <SOSModal />
      <MutationAckToast />
    </>
  );
};

export const App: React.FC = () => {
  const [view, setView] = useState<View>('command');

  return (
    <main className="relative w-screen h-screen bg-black overflow-hidden select-none">
      {view === 'command' ? <CommandCenterView /> : <WayanadMission />}

      <button
        onClick={() => setView((v) => (v === 'command' ? 'wayanad' : 'command'))}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 bg-neutral-950/90 border border-cyan-500/40 text-cyan-300 rounded font-mono text-xs tracking-wider hover:bg-neutral-900 hover:border-cyan-400 transition-colors shadow-lg"
      >
        {view === 'command' ? (
          <>
            <Globe2 className="w-3.5 h-3.5" /> REAL-WORLD DIGITAL TWIN
          </>
        ) : (
          <>
            <LayoutDashboard className="w-3.5 h-3.5" /> COMMAND CENTER
          </>
        )}
      </button>
    </main>
  );
};

export default App;
