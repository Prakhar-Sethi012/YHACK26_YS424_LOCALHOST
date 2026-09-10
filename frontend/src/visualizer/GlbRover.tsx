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
  
  // Clone scene for multiple viewports without reparenting conflicts
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
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
        Leo Rover model bounding box adjustment:
        Original bounds: dx=33.45, dy=20.76, dz=43.80.
        Scaling by 0.048 sets length to ~2.1m (matching human scale vs terrain).
        Position Y offset ~0.58 puts wheels on the ground.
      */}
      <group position={[0, 0.58, 0.28]} rotation={[0, Math.PI, 0]}>
        <primitive object={clonedScene} scale={[0.048, 0.048, 0.048]} />
      </group>

      {/* Dynamic Tactical Headlights */}
      <spotLight
        position={[0, 0.6, 0.8]}
        target-position={[0, 0, 10]}
        intensity={4.5}
        distance={30}
        angle={0.65}
        penumbra={0.4}
        color="#fff5e6"
        castShadow
      />
      {/* Ground contact shadow filler */}
      <pointLight position={[0, 0.2, 0]} intensity={1.2} distance={3} color="#ff9944" />
    </group>
  );
}

useGLTF.preload('/models/leo_rover.glb');
