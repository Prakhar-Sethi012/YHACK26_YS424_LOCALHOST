import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface Props {
  path3d: [number, number, number][];
  heightScale?: number;
}

export default function PathVisualizer({ path3d, heightScale = 0.35 }: Props) {
  const { linePoints, waypointPositions } = useMemo(() => {
    if (!path3d || path3d.length < 2) return { linePoints: [], waypointPositions: [] };

    // Map backend coords → Three.js: (backX-50, elev*scale+0.1, backY-50)
    const pts = path3d.map(
      ([bx, by, bz]) => new THREE.Vector3(bx - 50, bz * heightScale + 0.15, by - 50)
    );

    // Catmull-Rom smoothing
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    const smoothPts = curve.getPoints(Math.max(60, pts.length * 4));

    // Every Nth waypoint as a marker
    const waypoints = pts.filter((_, i) => i % 8 === 0 || i === pts.length - 1);

    return { linePoints: smoothPts, waypointPositions: waypoints };
  }, [path3d, heightScale]);

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
