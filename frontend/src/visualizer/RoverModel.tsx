import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  position: [number, number, number];
  rotation: [number, number, number]; // pitch, yaw, roll
}

export default function RoverModel({ position, rotation }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const lidarRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    // Spin the LiDAR puck
    if (lidarRef.current) {
      lidarRef.current.rotation.y += delta * 10;
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Chassis */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.5, 2]} />
        <meshStandardMaterial color="#facc15" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* LiDAR Puck */}
      <mesh ref={lidarRef} position={[0, 0.75, 0.5]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
        <meshStandardMaterial color="#3b82f6" emissive="#1d4ed8" emissiveIntensity={0.5} />
      </mesh>

      {/* Wheels */}
      {/* Front Left */}
      <Wheel position={[-0.7, 0.3, 0.8]} />
      {/* Front Right */}
      <Wheel position={[0.7, 0.3, 0.8]} />
      {/* Back Left */}
      <Wheel position={[-0.7, 0.3, -0.8]} />
      {/* Back Right */}
      <Wheel position={[0.7, 0.3, -0.8]} />

      {/* Headlights */}
      <pointLight position={[0.4, 0.4, 1.1]} intensity={2} distance={10} color="#ffffff" />
      <pointLight position={[-0.4, 0.4, 1.1]} intensity={2} distance={10} color="#ffffff" />
    </group>
  );
}

function Wheel({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
      <meshStandardMaterial color="#171717" roughness={0.9} />
    </mesh>
  );
}
