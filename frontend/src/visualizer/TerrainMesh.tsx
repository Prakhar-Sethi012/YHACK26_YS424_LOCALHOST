import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';

interface Props {
  elevationData: number[][];
  temperatureData: number[][];
  obstacleData: boolean[][];
  onTerrainClick?: (gridX: number, gridY: number) => void;
  heightScale?: number;
}

// Color stops for terrain based on normalized elevation
function elevToColor(normElev: number, heatFactor: number, isObs: boolean): [number, number, number] {
  if (isObs) return [0.25, 0.22, 0.18]; // dark rubble/concrete

  if (heatFactor > 0.5) {
    // Thermal zone: bright orange-red
    const t = Math.min(1, (heatFactor - 0.5) * 2);
    return [0.9 + t * 0.1, 0.15 * (1 - t), 0.0];
  } else if (heatFactor > 0.15) {
    // Warm zone: orange tint
    const t = (heatFactor - 0.15) / 0.35;
    return [0.5 + t * 0.4, 0.2 + t * 0.1, 0.0];
  }

  // Elevation-based terrain coloring
  if (normElev < 0.15) {
    // Low ground: dark grey rubble / ash
    const t = normElev / 0.15;
    return [0.12 + t * 0.05, 0.10 + t * 0.04, 0.09 + t * 0.03];
  } else if (normElev < 0.4) {
    // Mid ground: earthy brown / destroyed concrete
    const t = (normElev - 0.15) / 0.25;
    return [0.28 + t * 0.15, 0.20 + t * 0.08, 0.14 + t * 0.04];
  } else if (normElev < 0.7) {
    // High ground: rocky grey with brown tinge
    const t = (normElev - 0.4) / 0.3;
    return [0.43 + t * 0.18, 0.35 + t * 0.10, 0.28 + t * 0.08];
  } else {
    // Peak: light grey/white debris
    const t = (normElev - 0.7) / 0.3;
    return [0.61 + t * 0.25, 0.55 + t * 0.22, 0.52 + t * 0.20];
  }
}

export default function TerrainMesh({ elevationData, temperatureData, obstacleData, onTerrainClick, heightScale = 0.35 }: Props) {
  const rows = elevationData.length;
  const cols = elevationData[0]?.length ?? 0;

  const { geometry } = useMemo(() => {
    if (!rows || !cols) return { geometry: null, minElev: 0, maxElev: 1 };

    const geo = new THREE.PlaneGeometry(100, 100, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position as THREE.BufferAttribute;
    const colorArr = new Float32Array(positions.count * 3);

    // Find min/max for normalization
    let minE = Infinity, maxE = -Infinity;
    let minT = Infinity, maxT = -Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const e = elevationData[r]?.[c] ?? 0;
        const t = temperatureData[r]?.[c] ?? 24;
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }

    for (let i = 0; i < positions.count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const elev = elevationData[row]?.[col] ?? 0;
      const temp = temperatureData[row]?.[col] ?? 24;
      const isObs = !!(obstacleData[row]?.[col]);

      // Displace Y (up axis after rotateX)
      positions.setY(i, elev * heightScale);

      const normElev = maxE > minE ? (elev - minE) / (maxE - minE) : 0;
      const heatFactor = maxT > minT ? Math.max(0, (temp - 30) / (maxT - 30 + 0.001)) : 0;

      const [r, g, b] = elevToColor(normElev, heatFactor, isObs);
      colorArr[i * 3] = r;
      colorArr[i * 3 + 1] = g;
      colorArr[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    geo.computeVertexNormals();

    return { geometry: geo, minElev: minE, maxElev: maxE };
  }, [elevationData, temperatureData, obstacleData, heightScale, rows, cols]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onTerrainClick) return;
    e.stopPropagation();
    const p = e.point;
    // Map Three.js scene coords back to grid coords
    const gridX = Math.round(p.x + 50);
    const gridY = Math.round(p.z + 50);
    if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
      onTerrainClick(gridX, gridY);
    }
  };

  if (!geometry) return null;

  return (
    <group>
      {/* Main terrain */}
      <mesh
        geometry={geometry}
        receiveShadow
        castShadow
        onClick={onTerrainClick ? handleClick : undefined}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.95}
          metalness={0.0}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Wireframe overlay (very subtle) */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#334"
          wireframe
          transparent
          opacity={0.06}
        />
      </mesh>
    </group>
  );
}
