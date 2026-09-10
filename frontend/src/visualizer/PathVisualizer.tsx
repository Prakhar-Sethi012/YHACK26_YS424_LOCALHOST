import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore } from '../store/useSimulationStore';

interface Props {
  path3d: [number, number, number][];
  heightScale?: number;
}

export default function PathVisualizer({ path3d, heightScale = 0.35 }: Props) {
  const terrainVisual = useSimulationStore(s => s.terrainVisual);
  const staticElevationData = useSimulationStore(s => s.staticElevationData);

  const { linePoints, waypointPositions } = useMemo(() => {
    if (!path3d || path3d.length < 2) return { linePoints: [], waypointPositions: [] };

    const getElev = (bx: number, by: number, bz: number) => {
      if (terrainVisual === 'glb_mesh' && staticElevationData) {
        const cx = Math.max(0, Math.min(99, bx));
        const cy = Math.max(0, Math.min(99, by));
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
        return (h0 * (1 - ty) + h1 * ty) + 0.15;
      }
      return bz * heightScale + 0.15;
    };

    // Map backend coords → Three.js: (backX-50, elev*scale+0.1, backY-50)
    const pts = path3d.map(
      ([bx, by, bz]) => new THREE.Vector3(bx - 50, getElev(bx, by, bz), by - 50)
    );

    // The backend already smooths the path with Catmull-Rom.
    // Use the points directly.
    // Every Nth waypoint as a marker
    const waypoints = pts.filter((_, i) => i % 8 === 0 || i === pts.length - 1);

    return { linePoints: pts, waypointPositions: waypoints };
  }, [path3d, heightScale, terrainVisual, staticElevationData]);

  if (linePoints.length < 2) return null;

  return (
    <group>
      {/* Glowing neon path line */}
      <Line
        points={linePoints}
        color="#00ff88"
        lineWidth={3}
        dashed={false}
      />
      {/* Softer glow underneath */}
      <Line
        points={linePoints}
        color="#00ff44"
        lineWidth={8}
        transparent
        opacity={0.15}
        dashed={false}
      />

      {/* Waypoint markers */}
      {waypointPositions.map((pt, i) => (
        <mesh key={i} position={[pt.x, pt.y, pt.z]}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshStandardMaterial
            color={i === waypointPositions.length - 1 ? '#ff4400' : '#00ff88'}
            emissive={i === waypointPositions.length - 1 ? '#ff2200' : '#00cc66'}
            emissiveIntensity={2}
          />
        </mesh>
      ))}

      {/* Goal marker (last waypoint) */}
      {waypointPositions.length > 0 && (
        <group position={waypointPositions[waypointPositions.length - 1].toArray() as [number, number, number]}>
          <mesh>
            <cylinderGeometry args={[0.5, 0.5, 0.05, 24]} />
            <meshStandardMaterial
              color="#ff4400"
              emissive="#ff2200"
              emissiveIntensity={2}
              transparent
              opacity={0.5}
            />
          </mesh>
          <pointLight color="#ff4400" intensity={2} distance={6} />
        </group>
      )}
    </group>
  );
}
