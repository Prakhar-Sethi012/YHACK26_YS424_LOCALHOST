import { Canvas } from '@react-three/fiber';
import { useSimulationStore } from '../store/useSimulationStore';
import TopologicalViewport from './TopologicalViewport';
import ChaseCamViewport from './ChaseCamViewport';

export default function SceneManager() {
  const telemetry = useSimulationStore(s => s.telemetry);
  const path3d = useSimulationStore(s => s.path3d);
  const elevationData = useSimulationStore(s => s.elevationData);
  const temperatureData = useSimulationStore(s => s.temperatureData);
  const obstacleData = useSimulationStore(s => s.obstacleData);
  const victims = useSimulationStore(s => s.victims);
  const dynamicObstacles = useSimulationStore(s => s.dynamicObstacles);
  const applyGodModeAt = useSimulationStore(s => s.applyGodModeAt);
  const godModeTool = useSimulationStore(s => s.godModeTool);

  const commonProps = { telemetry, path3d, elevationData, temperatureData, obstacleData, victims, dynamicObstacles };

  return (
    <div className="w-full h-full flex flex-col md:flex-row">

      {/* LEFT: Tactical orbital map */}
      <div className="flex-1 relative border-r border-neutral-800" style={{ minHeight: 0 }}>
        <div className="absolute top-3 left-3 z-10 px-2 py-1 text-[10px] font-mono text-neutral-400 bg-black/50 border border-neutral-700 backdrop-blur-sm rounded uppercase tracking-widest">
          ORBITAL HEIGHTMAP / TACTICAL
        </div>
        {godModeTool && (
          <div className="absolute top-3 right-3 z-10 px-2 py-1 text-[10px] font-mono text-yellow-400 bg-yellow-900/30 border border-yellow-700/50 backdrop-blur-sm rounded uppercase tracking-widest animate-pulse">
            CLICK MAP TO PLACE
          </div>
        )}
        <Canvas
          shadows
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          camera={{ position: [0, 55, 60], fov: 45 }}
          style={{ background: '#050508' }}
        >
          <TopologicalViewport
            {...commonProps}
            onTerrainClick={godModeTool ? applyGodModeAt : undefined}
          />
        </Canvas>
      </div>

      {/* RIGHT: Chase camera TPP view */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <div className="absolute top-3 left-3 z-10 px-2 py-1 text-[10px] font-mono text-neutral-400 bg-black/50 border border-neutral-700 backdrop-blur-sm rounded uppercase tracking-widest">
          CHASE CAM / TPP
        </div>
        <Canvas
          shadows
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          style={{ background: '#050508' }}
        >
          <ChaseCamViewport {...commonProps} />
        </Canvas>
      </div>

    </div>
  );
}
