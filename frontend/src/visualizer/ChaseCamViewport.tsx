import { useRef, useMemo } from 'react';
import { PerspectiveCamera, Environment, Grid, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import RoverModel from './RoverModel';
import type { Telemetry } from '../store/useSimulationStore';

interface Props {
  telemetry: Telemetry | null;
  path3d: [number, number, number][];
}

export default function ChaseCamViewport({ telemetry, path3d }: Props) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame(() => {
    if (!cameraRef.current || !telemetry) return;

    // The rover's world position
    const targetX = telemetry.x - 50;
    const targetY = telemetry.z;
    const targetZ = telemetry.y - 50;
    const roverPos = new THREE.Vector3(targetX, targetY, targetZ);

    // Calculate a chase position behind and slightly above the rover
    // Assuming yaw is rotation around Y axis. We want to be behind the rover.
    const chaseDist = 5;
    const chaseHeight = 2.5;
    
    // Offset vector based on yaw (assuming 0 yaw faces positive Z)
    const offset = new THREE.Vector3(
      Math.sin(telemetry.yaw) * chaseDist,
      chaseHeight,
      Math.cos(telemetry.yaw) * chaseDist
    );

    const idealCamPos = roverPos.clone().add(offset);
    
    // Smoothly interpolate camera position and lookAt
    cameraRef.current.position.lerp(idealCamPos, 0.1);
    cameraRef.current.lookAt(roverPos);
  });

  const linePoints = useMemo(() => {
    if (!path3d || path3d.length === 0) return [];
    return path3d.map(p => new THREE.Vector3(p[0] - 50, p[2], p[1] - 50)); 
  }, [path3d]);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={60} />
      
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
      <Environment preset="night" />

      {/* Grid ground */}
      <Grid 
        args={[100, 100]} 
        position={[0, -0.1, 0]} 
        cellColor="#222" 
        sectionColor="#444" 
        fadeDistance={30}
      />

      {/* Path */}
      {linePoints.length > 1 && (
        <Line
          points={linePoints}
          color="#10b981"
          lineWidth={4}
        />
      )}

      {/* Rover */}
      {telemetry && (
        <RoverModel 
          position={[telemetry.x - 50, telemetry.z, telemetry.y - 50]} 
          rotation={[telemetry.pitch, telemetry.yaw, telemetry.roll]}
        />
      )}
    </>
  );
}
