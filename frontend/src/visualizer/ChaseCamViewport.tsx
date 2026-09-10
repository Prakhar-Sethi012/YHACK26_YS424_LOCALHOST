import { Suspense, useRef } from 'react';
import { PerspectiveCamera, Environment, Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import TerrainMesh from './TerrainMesh';
import PathVisualizer from './PathVisualizer';
import RoverModel from './RoverModel';
import type { Telemetry, DynamicObstacle, VictimData } from '../store/useSimulationStore';

interface Props {
  telemetry: Telemetry | null;
  path3d: [number, number, number][];
  elevationData: number[][] | null;
  temperatureData: number[][] | null;
  obstacleData: boolean[][] | null;
  victims: VictimData[];
  dynamicObstacles: DynamicObstacle[];
}

const HEIGHT_SCALE = 0.35;

export default function ChaseCamViewport({
  telemetry, path3d, elevationData, temperatureData, obstacleData, victims, dynamicObstacles
}: Props) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const camTarget = useRef(new THREE.Vector3());
  const camPos = useRef(new THREE.Vector3(0, 5, 10));

  useFrame((_, delta) => {
    if (!cameraRef.current || !telemetry) return;

    const rx = telemetry.x - 50;
    const ry = telemetry.z * HEIGHT_SCALE;
    const rz = telemetry.y - 50;
    const roverWorld = new THREE.Vector3(rx, ry, rz);

    // Chase offset: behind the rover based on heading
    const heading = telemetry.heading_rad;
    const chaseDist = 6;
    const chaseHeight = 3.5;
    const offset = new THREE.Vector3(
      -Math.sin(heading) * chaseDist,
      chaseHeight,
      -Math.cos(heading) * chaseDist
    );
    const desiredCamPos = roverWorld.clone().add(offset);

    // Smooth interpolation
    camPos.current.lerp(desiredCamPos, Math.min(1, delta * 5));
    camTarget.current.lerp(roverWorld.clone().add(new THREE.Vector3(0, 0.5, 0)), Math.min(1, delta * 8));

    cameraRef.current.position.copy(camPos.current);
    cameraRef.current.lookAt(camTarget.current);
  });

  const roverPos: [number, number, number] = telemetry
    ? [telemetry.x - 50, telemetry.z * HEIGHT_SCALE, telemetry.y - 50]
    : [-40, 0, -40];

  return (
    <>
      <fog attach="fog" args={['#060810', 30, 100]} />
      <color attach="background" args={['#050508']} />

      <PerspectiveCamera ref={cameraRef} makeDefault fov={65} near={0.1} far={300} />

      {/* Main sun-like directional light */}
      <ambientLight intensity={0.35} color="#334455" />
      <directionalLight
        position={[15, 30, 10]}
        intensity={1.4}
        color="#fff5ee"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {/* Backfill light */}
      <directionalLight position={[-10, 5, -20]} intensity={0.4} color="#1a2255" />

      <Stars radius={80} depth={50} count={2000} factor={3} fade speed={0.5} />

      <Suspense fallback={null}>
        <Environment preset="night" />
      </Suspense>

      {/* Terrain */}
      {elevationData && temperatureData && obstacleData && (
        <TerrainMesh
          elevationData={elevationData}
          temperatureData={temperatureData}
          obstacleData={obstacleData}
          heightScale={HEIGHT_SCALE}
        />
      )}

      {/* Path */}
      <PathVisualizer path3d={path3d} heightScale={HEIGHT_SCALE} />

      {/* Rover - full detailed model */}
      {telemetry && (
        <RoverModel
          position={roverPos}
          headingRad={telemetry.heading_rad}
          velocity={telemetry.velocity}
          slopeDeg={telemetry.slope_deg}
        />
      )}

      {/* Dynamic obstacles */}
      {dynamicObstacles.map((obs, i) => (
        <mesh key={i} position={[obs.x - 50, 0.5, obs.y - 50]} castShadow>
          <boxGeometry args={[obs.radius * 2, 1, obs.radius * 2]} />
          <meshStandardMaterial color="#444" roughness={0.9} />
        </mesh>
      ))}

      {/* Victim glows */}
      {victims.map((v) => (
        <group key={v.id} position={[v.x - 50, 0.8, v.y - 50]}>
          <mesh>
            <sphereGeometry args={[0.25, 10, 10]} />
            <meshStandardMaterial color="#ff6600" emissive="#ff3300" emissiveIntensity={3} />
          </mesh>
          <pointLight color="#ff4400" intensity={1.5} distance={6} />
        </group>
      ))}
    </>
  );
}
