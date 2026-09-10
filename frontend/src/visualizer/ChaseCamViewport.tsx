import { Suspense, useRef } from 'react';
import { PerspectiveCamera } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import TerrainMesh from './TerrainMesh';
import GlbTerrain from './GlbTerrain';
import InstancedObstacles from './InstancedObstacles';
import PathVisualizer from './PathVisualizer';
import RoverModel from './RoverModel';
import { useSimulationStore } from '../store/useSimulationStore';
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
  const terrainVisual = useSimulationStore((s) => s.terrainVisual);
  const staticElevationData = useSimulationStore((s) => s.staticElevationData);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const camTarget = useRef(new THREE.Vector3());
  const camPos = useRef(new THREE.Vector3(0, 5, 10));
  const smoothHeading = useRef(0);

  const getRoverY = (x: number, y: number, defaultZ: number) => {
    if (terrainVisual === 'glb_mesh' && staticElevationData) {
      const cx = Math.max(0, Math.min(99, x));
      const cy = Math.max(0, Math.min(99, y));
      const x0 = Math.floor(cx);
      const x1 = Math.min(99, x0 + 1);
      const y0 = Math.floor(cy);
      const y1 = Math.min(99, y0 + 1);
      
      const tx = cx - x0;
      const ty = cy - y0;
      
      const h00 = staticElevationData[x0]?.[y0] ?? 0;
      const h10 = staticElevationData[x1]?.[y0] ?? 0;
      const h01 = staticElevationData[x0]?.[y1] ?? 0;
      const h11 = staticElevationData[x1]?.[y1] ?? 0;
      
      const h0 = h00 * (1 - tx) + h10 * tx;
      const h1 = h01 * (1 - tx) + h11 * tx;
      return h0 * (1 - ty) + h1 * ty;
    }
    return defaultZ * HEIGHT_SCALE;
  };

  useFrame((_, delta) => {
    if (!cameraRef.current || !telemetry) return;

    const rx = telemetry.x - 50;
    const ry = getRoverY(telemetry.x, telemetry.y, telemetry.z);
    const rz = telemetry.y - 50;
    const roverWorld = new THREE.Vector3(rx, ry, rz);

    // Smooth the heading to prevent camera violently shaking
    let diff = telemetry.heading_rad - smoothHeading.current;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    smoothHeading.current += diff * (1 - Math.exp(-5 * delta));

    // Chase offset: behind the rover based on smoothed heading
    const chaseDist = 6;
    const chaseHeight = 3.5;
    const offset = new THREE.Vector3(
      -Math.sin(smoothHeading.current) * chaseDist,
      chaseHeight,
      -Math.cos(smoothHeading.current) * chaseDist
    );
    const desiredCamPos = roverWorld.clone().add(offset);

    // Smooth interpolation with damp for no jitter
    camPos.current.x = THREE.MathUtils.damp(camPos.current.x, desiredCamPos.x, 4, delta);
    camPos.current.y = THREE.MathUtils.damp(camPos.current.y, desiredCamPos.y, 4, delta);
    camPos.current.z = THREE.MathUtils.damp(camPos.current.z, desiredCamPos.z, 4, delta);

    const targetY = roverWorld.y + 0.5;
    camTarget.current.x = THREE.MathUtils.damp(camTarget.current.x, roverWorld.x, 6, delta);
    camTarget.current.y = THREE.MathUtils.damp(camTarget.current.y, targetY, 6, delta);
    camTarget.current.z = THREE.MathUtils.damp(camTarget.current.z, roverWorld.z, 6, delta);

    cameraRef.current.position.copy(camPos.current);
    cameraRef.current.lookAt(camTarget.current);
  });

  const roverPos: [number, number, number] = telemetry
    ? [telemetry.x - 50, getRoverY(telemetry.x, telemetry.y, telemetry.z), telemetry.y - 50]
    : [-40, 0, -40];

  return (
    <>
      <fog attach="fog" args={['#060810', 30, 100]} />
      <color attach="background" args={['#050508']} />

      <PerspectiveCamera ref={cameraRef} makeDefault fov={65} near={0.1} far={300} />

      {/* Main sun-like directional light */}
      <ambientLight intensity={0.6} color="#445566" />
      <directionalLight
        position={[15, 30, 10]}
        intensity={1.2}
        color="#fff5ee"
        castShadow
        shadow-mapSize={[512, 512]}
      />
      {/* Backfill light */}
      <directionalLight position={[-10, 5, -20]} intensity={0.6} color="#2a3255" />

      {/* Removed Stars and Environment for maximum performance on integrated GPUs */}

      {/* Terrain & Physical Obstacles */}
      {terrainVisual === 'glb_mesh' ? (
        <group>
          <Suspense fallback={null}>
            <GlbTerrain />
          </Suspense>
          {obstacleData && elevationData && (
            <InstancedObstacles
              obstacleData={obstacleData}
              elevationData={elevationData}
              heightScale={HEIGHT_SCALE}
            />
          )}
        </group>
      ) : (
        elevationData && temperatureData && obstacleData && (
          <group>
            <TerrainMesh
              elevationData={elevationData}
              temperatureData={temperatureData}
              obstacleData={obstacleData}
              heightScale={HEIGHT_SCALE}
            />
            <InstancedObstacles
              obstacleData={obstacleData}
              elevationData={elevationData}
              heightScale={HEIGHT_SCALE}
            />
          </group>
        )
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
