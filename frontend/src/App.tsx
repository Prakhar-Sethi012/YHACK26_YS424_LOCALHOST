import SceneManager from './visualizer/SceneManager';
import HeaderBar from './components/HeaderBar';
import GodModeSculptor from './components/GodModeSculptor';
import BenchmarkTable from './components/BenchmarkTable';
import LiveTelemetry from './components/LiveTelemetry';
import SosAlertModal from './components/SosAlertModal';

function App() {
  return (
    <div className="w-screen h-screen bg-neutral-950 text-white flex flex-col overflow-hidden font-mono select-none">
      {/* Top bar */}
      <HeaderBar />

      {/* Main area: 3D viewports + overlaid UI panels */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {/* Full 3D scene */}
        <div className="absolute inset-0">
          <SceneManager />
        </div>

        {/* Overlay: God Mode Sculptor — bottom-left of left viewport */}
        <div className="absolute bottom-4 left-4 z-20 pointer-events-auto">
          <GodModeSculptor />
        </div>

        {/* Overlay: Live Telemetry — right side of right viewport */}
        <div className="absolute top-12 right-3 z-20 pointer-events-none" style={{ width: 220 }}>
          <div className="pointer-events-auto">
            <LiveTelemetry />
          </div>
        </div>

        {/* Overlay: Benchmark Table — bottom-right */}
        <div className="absolute bottom-4 right-3 z-20 pointer-events-auto" style={{ width: 260 }}>
          <BenchmarkTable />
        </div>

        {/* Center divider label */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="w-px h-full bg-neutral-800 absolute left-0 top-0" style={{ height: '100vh', transform: 'translateY(-50vh)' }} />
        </div>

        {/* Tactical SOS Alert Modal */}
        <SosAlertModal />
      </div>
    </div>
  );
}

export default App;
