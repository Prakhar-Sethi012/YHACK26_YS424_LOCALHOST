import { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  position: [number, number, number];
  headingRad: number;
  slopeDeg?: number;
}

export default function GlbRover({ position, headingRad, slopeDeg = 0 }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltRef = useRef(0);

  // Load the downloaded Leo Rover GLB model
  const { scene } = useGLTF('/models/leo_rover.glb');
  
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Auto-scale to roughly 1.5 - 2 meters regardless of original model units
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // If the model is 33 units (cm), scale is 2/33 ~ 0.06.
    // If model is 0.5 units (m), scale is 2/0.5 = 4.
    // We want the max dimension to be about 2.0.
    const targetSize = 2.0;
    const scaleFactor = maxDim > 0 ? targetSize / maxDim : 1;
    
    clone.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Center the model's bottom at Y=0
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.set(-center.x * scaleFactor, -box.min.y * scaleFactor, -center.z * scaleFactor);

    return clone;
  }, [scene]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Smooth suspension tilt along slope
    tiltRef.current += (slopeDeg * 0.017 - tiltRef.current) * delta * 4;
    groupRef.current.rotation.z = tiltRef.current * 0.4;
  });

  return (
    <group position={position} rotation={[0, -headingRad, 0]} ref={groupRef}>
      {/* 
        Leo Rover model is auto-scaled and bottom-centered in useMemo.
        Rotated by 90 degrees (Math.PI / 2) to align with forward vector.
      */}
      <group position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <primitive object={clonedScene} />
      </group>

      {/* Dynamic Tactical Headlights - Shadows disabled for perf */}
      <spotLight
        position={[0, 0.6, 0.8]}
        target-position={[0, 0, 10]}
        intensity={4.5}
        distance={30}
        angle={0.65}
        penumbra={0.4}
        color="#fff5e6"
      />
      {/* Ground contact shadow filler */}
      <pointLight position={[0, 0.2, 0]} intensity={1.2} distance={3} color="#ff9944" />
    </group>
  );
}

useGLTF.preload('/models/leo_rover.glb');
