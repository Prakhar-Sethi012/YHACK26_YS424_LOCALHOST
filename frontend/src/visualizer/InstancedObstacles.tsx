import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';

interface Props {
  obstacleData: boolean[][];
  elevationData: number[][];
  heightScale?: number;
}

export default function InstancedObstacles({ obstacleData, elevationData, heightScale = 0.35 }: Props) {
  const slabMeshRef = useRef<THREE.InstancedMesh>(null);
  const rubbleMeshRef = useRef<THREE.InstancedMesh>(null);

  const { slabTransforms, rubbleTransforms } = useMemo(() => {
    const slabs: { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number] }[] = [];
    const rubble: { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number] }[] = [];

    const rows = obstacleData.length;
    const cols = obstacleData[0]?.length ?? 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (obstacleData[r]?.[c]) {
          const elev = (elevationData[r]?.[c] ?? 0) * heightScale;
          const x = c - 50;
          const z = r - 50;

          // Deterministic hash based on grid coordinate
          const hash = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
          const rand = hash - Math.floor(hash);

          if (rand > 0.45) {
            // Collapsed concrete slab / barrier
            slabs.push({
              pos: [x, elev + 0.35, z],
              rot: [(rand - 0.5) * 0.45, rand * Math.PI * 2, (rand - 0.5) * 0.45],
              scale: [1.2 + rand * 0.6, 0.5 + rand * 0.4, 1.4 + rand * 0.8],
            });
          } else {
            // Fractured boulder / rubble mound
            rubble.push({
              pos: [x, elev + 0.25, z],
              rot: [rand * Math.PI, rand * Math.PI * 2, rand * Math.PI],
              scale: [0.7 + rand * 0.6, 0.6 + rand * 0.5, 0.7 + rand * 0.6],
            });
          }
        }
      }
    }

    return { slabTransforms: slabs, rubbleTransforms: rubble };
  }, [obstacleData, elevationData, heightScale]);

  useEffect(() => {
    const dummy = new THREE.Object3D();

    if (slabMeshRef.current) {
      slabTransforms.forEach((t, i) => {
        dummy.position.set(...t.pos);
        dummy.rotation.set(...t.rot);
        dummy.scale.set(...t.scale);
        dummy.updateMatrix();
        slabMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      slabMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (rubbleMeshRef.current) {
      rubbleTransforms.forEach((t, i) => {
        dummy.position.set(...t.pos);
        dummy.rotation.set(...t.rot);
        dummy.scale.set(...t.scale);
        dummy.updateMatrix();
        rubbleMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      rubbleMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [slabTransforms, rubbleTransforms]);

  return (
    <group>
      {/* Collapsed Concrete Slabs */}
      {slabTransforms.length > 0 && (
        <instancedMesh
          ref={slabMeshRef}
          args={[undefined, undefined, slabTransforms.length]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color="#3a3734"
            roughness={0.92}
            metalness={0.08}
          />
        </instancedMesh>
      )}

      {/* Fractured Boulders & Concrete Chunks */}
      {rubbleTransforms.length > 0 && (
        <instancedMesh
          ref={rubbleMeshRef}
          args={[undefined, undefined, rubbleTransforms.length]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[0.8, 0]} />
          <meshStandardMaterial
            color="#2a2825"
            roughness={0.95}
            metalness={0.04}
            flatShading
          />
        </instancedMesh>
      )}
    </group>
  );
}
