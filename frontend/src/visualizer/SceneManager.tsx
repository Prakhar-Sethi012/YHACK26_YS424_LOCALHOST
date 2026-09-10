import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { View, Preload } from '@react-three/drei';
import TopologicalViewport from './TopologicalViewport';
import ChaseCamViewport from './ChaseCamViewport';
import { useSimulationStore } from '../store/useSimulationStore';

export default function SceneManager() {
  const container = useRef<HTMLDivElement>(null!);
  const isoView = useRef<HTMLDivElement>(null!);
  const chaseView = useRef<HTMLDivElement>(null!);

  // We need to pass the state so it's available in the 3D tree
  const telemetry = useSimulationStore(s => s.telemetry);
  const path3d = useSimulationStore(s => s.path3d);

  return (
    <div ref={container} className="w-full h-full flex flex-col md:flex-row bg-neutral-900">
      
      {/* DOM Layout for Views */}
      <div className="flex-1 border-r border-neutral-800 relative" ref={isoView}>
        <div className="absolute top-4 left-4 z-10 bg-black/50 text-neutral-400 px-2 py-1 text-xs border border-neutral-800 backdrop-blur-md rounded">
          ORBITAL HEIGHTMAP (TACTICAL)
        </div>
      </div>
      
      <div className="flex-1 relative" ref={chaseView}>
        <div className="absolute top-4 left-4 z-10 bg-black/50 text-neutral-400 px-2 py-1 text-xs border border-neutral-800 backdrop-blur-md rounded">
          CHASE CAM (TPP)
        </div>
      </div>

      {/* R3F Canvas injecting into the DOM nodes */}
      <Canvas eventSource={container} className="absolute inset-0 pointer-events-none">
        
        <View track={isoView}>
          <TopologicalViewport telemetry={telemetry} path3d={path3d} />
        </View>
        
        <View track={chaseView}>
          <ChaseCamViewport telemetry={telemetry} path3d={path3d} />
        </View>

        <Preload all />
      </Canvas>
    </div>
  );
}
