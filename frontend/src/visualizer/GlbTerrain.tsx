import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';

interface Props {
  onTerrainClick?: (gridX: number, gridY: number) => void;
}

export default function GlbTerrain({ onTerrainClick }: Props) {
  const { scene } = useGLTF('/models/hilly_terrain.glb');

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });
    return clone;
  }, [scene]);

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
      {/* 
        hilly_terrain bounds: X[-15.24, 15.23] Z[-15.24, 15.23] -> dx=30.47
        Scale factor = 100 / 30.47 = 3.282 spans the full 100x100 tactical field
      */}
      <primitive
        object={clonedScene}
        position={[0, 0, 0]}
        scale={[3.282, 2.4, 3.282]}
      />
    </group>
  );
}

useGLTF.preload('/models/hilly_terrain.glb');
