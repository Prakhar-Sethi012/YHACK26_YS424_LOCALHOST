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

// Generate a procedural noise bump map for realistic micro-rock texture
function createRockBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(256, 256);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const x = (i / 4) % 256;
    const y = Math.floor((i / 4) / 256);

    // Fractal noise approximation
    const n1 = Math.sin(x * 0.15) * Math.cos(y * 0.15);
    const n2 = Math.sin(x * 0.35 + 1.2) * Math.cos(y * 0.35 + 2.4) * 0.5;
    const grain = (Math.random() - 0.5) * 0.35;
    const val = Math.floor(Math.min(255, Math.max(0, 128 + (n1 + n2 + grain) * 75)));

    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
    d[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  return texture;
}

// Realistic disaster coloring combining elevation, slope steepness, and thermal hazards
function elevAndSlopeToColor(
  normElev: number,
  slope: number,
  heatFactor: number,
  isObs: boolean,
  hash: number
): [number, number, number] {
  // Static obstacles: dark concrete rubble
  if (isObs) return [0.18, 0.17, 0.16];

  // Thermal Hazard Zones (Scorched earth with lava-red veins)
  if (heatFactor > 0.45) {
    const t = Math.min(1, (heatFactor - 0.45) * 2);
    return [0.95 + t * 0.05, 0.12 * (1 - t), 0.0];
  } else if (heatFactor > 0.12) {
    const t = (heatFactor - 0.12) / 0.33;
    return [0.45 + t * 0.4, 0.18 + t * 0.1, 0.02];
  }

  // Steep cliffs & fault slopes (>25 deg incline): dark exposed rock face
  if (slope > 1.4) {
    const rockT = Math.min(1, (slope - 1.4) / 1.5);
    const noise = (hash - 0.5) * 0.04;
    return [0.22 - rockT * 0.06 + noise, 0.21 - rockT * 0.06 + noise, 0.20 - rockT * 0.05 + noise];
  }

  // Elevation-based coloring with organic grain
  const grain = (hash - 0.5) * 0.03;

  if (normElev < 0.18) {
    // Low valley: charred black soot / dark cracked asphalt
    const t = normElev / 0.18;
    return [0.11 + t * 0.05 + grain, 0.10 + t * 0.04 + grain, 0.09 + t * 0.03 + grain];
  } else if (normElev < 0.48) {
    // Mid slopes: weathered clay, gravel & destroyed foundation
    const t = (normElev - 0.18) / 0.30;
    return [0.26 + t * 0.14 + grain, 0.19 + t * 0.08 + grain, 0.13 + t * 0.05 + grain];
  } else if (normElev < 0.78) {
    // High ridges: rocky grey debris
    const t = (normElev - 0.48) / 0.30;
    return [0.40 + t * 0.16 + grain, 0.34 + t * 0.11 + grain, 0.28 + t * 0.09 + grain];
  } else {
    // Peaks: light weathered limestone & concrete dust
    const t = (normElev - 0.78) / 0.22;
    return [0.56 + t * 0.15 + grain, 0.50 + t * 0.14 + grain, 0.46 + t * 0.13 + grain];
  }
}

export default function TerrainMesh({ elevationData, temperatureData, obstacleData, onTerrainClick, heightScale = 0.35 }: Props) {
  const rows = elevationData.length;
  const cols = elevationData[0]?.length ?? 0;

  const bumpMap = useMemo(() => createRockBumpTexture(), []);

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

      // Calculate localized slope steepness
      const dl = col > 0 ? (elevationData[row]?.[col - 1] ?? elev) : elev;
      const dr = col < cols - 1 ? (elevationData[row]?.[col + 1] ?? elev) : elev;
      const du = row > 0 ? (elevationData[row - 1]?.[col] ?? elev) : elev;
      const dd = row < rows - 1 ? (elevationData[row + 1]?.[col] ?? elev) : elev;
      const slope = Math.sqrt((dr - dl) * (dr - dl) + (dd - du) * (dd - du));

      // Deterministic hash for noise grain
      const hash = ((Math.sin(col * 12.9898 + row * 78.233) * 43758.5453) % 1 + 1) % 1;

      // Displace Y (elevation)
      positions.setY(i, elev * heightScale);

      const normElev = maxE > minE ? (elev - minE) / (maxE - minE) : 0;
      const heatFactor = maxT > minT ? Math.max(0, (temp - 30) / (maxT - 30 + 0.001)) : 0;

      const [r, g, b] = elevAndSlopeToColor(normElev, slope, heatFactor, isObs, hash);
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
    const gridX = Math.round(p.x + 50);
    const gridY = Math.round(p.z + 50);
    if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
      onTerrainClick(gridX, gridY);
    }
  };

  if (!geometry) return null;

  return (
    <group>
      {/* PBR-styled displaced terrain */}
      <mesh
        geometry={geometry}
        receiveShadow
        castShadow
        onClick={onTerrainClick ? handleClick : undefined}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.92}
          metalness={0.06}
          bumpMap={bumpMap}
          bumpScale={0.12}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Subtle tactical grid overlay */}
      <mesh geometry={geometry} position={[0, 0.02, 0]}>
        <meshBasicMaterial
          color="#334466"
          wireframe
          transparent
          opacity={0.04}
        />
      </mesh>
    </group>
  );
}
