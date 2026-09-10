import React from 'react';
import { ViewportCanvas } from './components/ViewportCanvas';
import { HUD } from './components/HUD';
import { GodModeToolbar } from './components/GodModeToolbar';
import { SOSModal } from './components/SOSModal';
import { MutationAckToast } from './components/MutationAckToast';
import { useSimulationSocket } from './hooks/useSimulationSocket';

export const App: React.FC = () => {
  // Initialize singleton 20Hz WebSocket connection
  useSimulationSocket();

  return (
    <main className="relative w-screen h-screen bg-black overflow-hidden select-none">
      <ViewportCanvas />
      <HUD />
      <GodModeToolbar />
      <SOSModal />
      <MutationAckToast />
    </main>
  );
};

export default App;
