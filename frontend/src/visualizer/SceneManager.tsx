import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import TopologicalViewport from './TopologicalViewport';
import ChaseCamViewport from './ChaseCamViewport';
import { useSimulationStore } from '../store/useSimulationStore';

export default function SceneManager() {
  const container = useRef<HTMLDivElement>(null!);

  // We need to pass the state so it's available in the 3D tree
  const telemetry = useSimulationStore(s => s.telemetry);
  const path3d = useSimulationStore(s => s.path3d);

  return (
    <div ref={container} className="w-full h-full flex flex-col md:flex-row bg-neutral-900">
      
      {/* Viewport 1 */}
      <div className="flex-1 border-r border-neutral-800 relative">
        <div className="absolute top-4 left-4 z-10 bg-black/50 text-neutral-400 px-2 py-1 text-xs border border-neutral-800 backdrop-blur-md rounded">
          ORBITAL HEIGHTMAP (TACTICAL)
        </div>
        <Canvas>
          <TopologicalViewport telemetry={telemetry} path3d={path3d} />
        </Canvas>
      </div>
      
      {/* Viewport 2 */}
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 z-10 bg-black/50 text-neutral-400 px-2 py-1 text-xs border border-neutral-800 backdrop-blur-md rounded">
          CHASE CAM (TPP)
        </div>
        <Canvas>
          <ChaseCamViewport telemetry={telemetry} path3d={path3d} />
        </Canvas>
      </div>

    </div>
  );
}
