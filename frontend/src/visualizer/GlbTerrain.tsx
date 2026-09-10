import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useSimulationStore } from '../store/useSimulationStore';

interface Props {
  onTerrainClick?: (gridX: number, gridY: number) => void;
}

export default function GlbTerrain({ onTerrainClick }: Props) {
  const { scene } = useGLTF('/models/hilly_terrain.glb');
  const setStaticElevationData = useSimulationStore(s => s.setStaticElevationData);
  const staticElevationData = useSimulationStore(s => s.staticElevationData);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.receiveShadow = true;
        mesh.castShadow = false; // Disable castShadow for huge terrain to save GPU
        // Ensure raycaster can hit it from above even if normals are weird
        if (mesh.material) {
          (mesh.material as any).side = THREE.DoubleSide;
        }
      }
    });

    // Auto-scale terrain to fit 100x100 exactly
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetSize = 100.0;
    const scaleFactor = Math.max(
      size.x > 0 ? targetSize / size.x : 1,
      size.z > 0 ? targetSize / size.z : 1
    );

    // Keep Y scale reasonable so it's not a massive spike
    clone.scale.set(scaleFactor, scaleFactor * 0.3, scaleFactor);

    // Recompute box after scaling to find center
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);

    // Center it exactly at 0,0,0 (spanning -50 to 50) and Y=0 at the bottom
    clone.position.set(-center.x, -scaledBox.min.y, -center.z);
    clone.updateMatrixWorld(true);

    return clone;
  }, [scene]);

  useEffect(() => {
    if (staticElevationData) return;

    let active = true;
    const raycaster = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, -1, 0);
    const grid: number[][] = [];
    let x = 0;

    const processBatch = () => {
      if (!active) return;
      // Process 1 row per frame to yield to the browser and prevent freezing on weak GPUs
      const endX = Math.min(100, x + 1);
      
      for (; x < endX; x++) {
        const col: number[] = [];
        for (let y = 0; y < 100; y++) {
          const origin = new THREE.Vector3(x - 50, 5000, y - 50);
          raycaster.set(origin, dir);
          const intersects = raycaster.intersectObject(clonedScene, true);
          if (intersects.length > 0) {
            col.push(intersects[0].point.y);
          } else {
            col.push(0);
          }
        }
        grid.push(col);
      }

      if (x < 100) {
        requestAnimationFrame(processBatch);
      } else {
        setStaticElevationData(grid);
      }
    };

    requestAnimationFrame(processBatch);
    return () => { active = false; };
  }, [clonedScene, setStaticElevationData, staticElevationData]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onTerrainClick) return;
    e.stopPropagation();
    const p = e.point;
    const gridX = Math.round(p.x + 50);
    const gridY = Math.round(p.z + 50);
    if (gridX >= 0 && gridX < 100 && gridY >= 0 && gridY < 100) {
      onTerrainClick(gridX, gridY);
    }
  };

  return (
    <group onClick={onTerrainClick ? handleClick : undefined}>
      {/* Terrain is auto-scaled and centered in useMemo */}
      <primitive object={clonedScene} />
    </group>
  );
}

useGLTF.preload('/models/hilly_terrain.glb');
