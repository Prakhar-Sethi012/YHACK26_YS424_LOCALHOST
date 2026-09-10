import { Suspense, useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
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
  onTerrainClick?: (gridX: number, gridY: number) => void;
}

const HEIGHT_SCALE = 0.35;

function DynamicDebris({ obs }: { obs: DynamicObstacle }) {
  const pos: [number, number, number] = [obs.x - 50, 0.4, obs.y - 50];
  return (
    <mesh position={pos} castShadow>
      <boxGeometry args={[obs.radius * 2, 0.8, obs.radius * 2]} />
      <meshStandardMaterial color="#555" roughness={0.8} />
    </mesh>
  );
}

function VictimMarker({ victim }: { victim: VictimData }) {
  const pos: [number, number, number] = [victim.x - 50, 1, victim.y - 50];
  return (
    <group position={pos}>
      {/* Glowing FLIR thermal blob */}
      <mesh>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial
          color="#ff6600"
          emissive="#ff3300"
          emissiveIntensity={3}
          transparent
          opacity={0.85}
        />
      </mesh>
      <pointLight color="#ff6600" intensity={2} distance={5} />
      {/* SOS ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.6, 0.06, 8, 24]} />
        <meshStandardMaterial color="#ffff00" emissive="#eeee00" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

function ThermalHeatZone({ temperatureData }: { temperatureData: number[][] }) {
  const heatLights = useMemo(() => {
    const lights: { x: number; z: number; intensity: number }[] = [];
    const rows = temperatureData.length;
    const cols = temperatureData[0]?.length ?? 0;
    // Sample every 5 cells
    for (let r = 0; r < rows; r += 5) {
      for (let c = 0; c < cols; c += 5) {
        const t = temperatureData[r]?.[c] ?? 24;
        if (t > 60) {
          lights.push({ x: c - 50, z: r - 50, intensity: Math.min(3, (t - 60) / 20) });
        }
      }
    }
    return lights.slice(0, 20); // cap at 20 lights for perf
  }, [temperatureData]);

  return (
    <>
      {heatLights.map((l, i) => (
        <pointLight key={i} position={[l.x, 1.5, l.z]} color="#ff4400" intensity={l.intensity} distance={8} />
      ))}
    </>
  );
}

export default function TopologicalViewport({
  telemetry, path3d, elevationData, temperatureData, obstacleData, victims, dynamicObstacles, onTerrainClick
}: Props) {
  const terrainVisual = useSimulationStore((s) => s.terrainVisual);
  const staticElevationData = useSimulationStore((s) => s.staticElevationData);

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
    return defaultZ * HEIGHT_SCALE + 0.4;
  };

  const roverPos: [number, number, number] = telemetry
    ? [telemetry.x - 50, getRoverY(telemetry.x, telemetry.y, telemetry.z), telemetry.y - 50]
    : [0, 0.4, 0];

  return (
    <>
      {/* Atmosphere */}
      <fog attach="fog" args={['#0a0a12', 60, 180]} />
      <color attach="background" args={['#050508']} />

      {/* Lighting */}
      <ambientLight intensity={0.5} color="#5599bb" />
      <directionalLight
        position={[20, 40, 10]}
        intensity={1.0}
        color="#ffeedd"
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      {/* Rim light from behind */}
      <directionalLight position={[-20, 10, -30]} intensity={0.6} color="#3355cc" />

      {/* Removed Stars and Environment for perf */}

      {/* Camera Controls */}
      <OrbitControls
        makeDefault
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={8}
        maxDistance={140}
        target={[0, 0, 0]}
      />

      {/* Terrain */}
      {terrainVisual === 'glb_mesh' ? (
        <group>
          <Suspense fallback={null}>
            <GlbTerrain onTerrainClick={onTerrainClick} />
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
              onTerrainClick={onTerrainClick}
              heightScale={HEIGHT_SCALE}
            />
            <InstancedObstacles
              obstacleData={obstacleData}
              elevationData={elevationData}
              heightScale={HEIGHT_SCALE}
            />
            <ThermalHeatZone temperatureData={temperatureData} />
          </group>
        )
      )}

      {/* Planned Path */}
      <PathVisualizer path3d={path3d} heightScale={HEIGHT_SCALE} />

      {/* Dynamic obstacles (moving debris) */}
      {dynamicObstacles.map((obs, i) => <DynamicDebris key={i} obs={obs} />)}

      {/* Victim markers */}
      {victims.map((v) => <VictimMarker key={v.id} victim={v} />)}

      {/* Rover */}
      {telemetry && (
        <RoverModel
          position={roverPos}
          headingRad={telemetry.heading_rad}
          slopeDeg={telemetry.slope_deg}
        />
      )}
    </>
  );
}
