import { useMemo } from 'react';
import { OrbitControls, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';
import RoverModel from './RoverModel';
import type { Telemetry } from '../store/useSimulationStore';

interface Props {
  telemetry: Telemetry | null;
  path3d: [number, number, number][];
}

export default function TopologicalViewport({ telemetry, path3d }: Props) {
  const linePoints = useMemo(() => {
    if (!path3d || !Array.isArray(path3d) || path3d.length === 0) return [];
    // Scale down coordinates slightly if the map is 100x100 so it fits nicely
    return path3d.map(p => new THREE.Vector3(p[0] - 50, p[2], p[1] - 50)); 
  }, [path3d]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />

      {/* Camera Controls */}
      <OrbitControls 
        makeDefault 
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2.1} 
        minDistance={10}
        maxDistance={150}
      />

      {/* Environment Grid - representing the 100x100 coordinate space centered */}
      <Grid 
        args={[100, 100]} 
        position={[0, -0.1, 0]} 
        cellColor="#333" 
        sectionColor="#666" 
        fadeDistance={100}
        fadeStrength={1.5}
      />

      {/* Planned Path Line */}
      {linePoints.length > 1 && (
        <Line
          points={linePoints}
          color="#10b981"
          lineWidth={3}
          dashed={false}
        />
      )}

      {/* Rover */}
      {telemetry && telemetry.x !== undefined && (
        <RoverModel 
          position={[telemetry.x - 50, telemetry.z, telemetry.y - 50]} 
          rotation={[telemetry.pitch, telemetry.yaw, telemetry.roll]}
        />
      )}
    </>
  );
}
