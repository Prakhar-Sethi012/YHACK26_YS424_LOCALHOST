import { useRef, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import GlbRover from './GlbRover';
import { useSimulationStore } from '../store/useSimulationStore';

interface Props {
  position: [number, number, number];
  headingRad: number;
  velocity: number;
  slopeDeg: number;
}

// Wheel sub-component: large knobby all-terrain tire
function Wheel({ position, isLeft }: { position: [number, number, number]; isLeft: boolean }) {
  const wheelRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (wheelRef.current) {
      // Wheel spins on its own local X axis
      wheelRef.current.rotation.x -= delta * 4;
    }
  });

  return (
    <group position={position} ref={wheelRef}>
      {/* Outer tire (rubber) */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.38, 0.18, 8, 24]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.95} metalness={0.0} />
      </mesh>
      {/* Wheel hub */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.15, 12]} />
        <meshStandardMaterial color="#444" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* 5 lug bolts */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[isLeft ? -0.08 : 0.08, Math.sin(angle) * 0.14, Math.cos(angle) * 0.14]}
          >
            <cylinderGeometry args={[0.03, 0.03, 0.05, 6]} />
            <meshStandardMaterial color="#888" roughness={0.3} metalness={0.9} />
          </mesh>
        );
      })}
      {/* Spoke cross */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.1, 0.42, 0.05]} />
        <meshStandardMaterial color="#555" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 3, 0, Math.PI / 2]}>
        <boxGeometry args={[0.1, 0.42, 0.05]} />
        <meshStandardMaterial color="#555" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 3, 0, Math.PI / 2]}>
        <boxGeometry args={[0.1, 0.42, 0.05]} />
        <meshStandardMaterial color="#555" roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  );
}

// LiDAR puck with spinning beam
function LiDAR({ position }: { position: [number, number, number] }) {
  const spinRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (spinRef.current) spinRef.current.rotation.y += delta * 12;
  });
  return (
    <group position={position}>
      {/* Dome base */}
      <mesh>
        <cylinderGeometry args={[0.22, 0.22, 0.12, 16]} />
        <meshStandardMaterial color="#2a2a3a" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Rotating sensor head */}
      <group ref={spinRef}>
        <mesh position={[0.0, 0.1, 0]}>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Laser beam stripe */}
        <mesh position={[0.15, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.015, 0.015, 0.3, 6]} />
          <meshStandardMaterial
            color="#00ffff"
            emissive="#00ffff"
            emissiveIntensity={3}
            transparent
            opacity={0.7}
          />
        </mesh>
      </group>
      <pointLight color="#00ffff" intensity={0.8} distance={4} />
    </group>
  );
}

function ProceduralRover({ position, headingRad, slopeDeg }: Omit<Props, 'velocity'> & { velocity?: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Smooth tilt alignment with slope (visual only)
    tiltRef.current += (slopeDeg * 0.017 - tiltRef.current) * delta * 3;
    groupRef.current.rotation.z = tiltRef.current * 0.4;
  });

  const BODY_COLOR = '#C05A20';  // burnt orange, matches reference
  const ACCENT_COLOR = '#0ACDCD'; // teal trim, matches reference
  const METAL = { roughness: 0.4, metalness: 0.3 };

  // Wheel positions: 3 per side, symmetric
  const wheelPositions: [number, number, number][] = [
    [-0.82, 0, 0.9],  // front left
    [-0.82, 0, 0.0],  // mid left
    [-0.82, 0, -0.9], // rear left
    [0.82, 0, 0.9],   // front right
    [0.82, 0, 0.0],   // mid right
    [0.82, 0, -0.9],  // rear right
  ];

  return (
    <group position={position} rotation={[0, -headingRad, 0]} ref={groupRef}>

      {/* ── FRONT BODY SECTION ── */}
      <group position={[0, 0.45, 0.55]}>
        {/* Main hull - rounded box shape */}
        <mesh castShadow>
          <boxGeometry args={[1.45, 0.55, 1.0]} />
          <meshStandardMaterial color={BODY_COLOR} {...METAL} />
        </mesh>
        {/* Front slope panel */}
        <mesh position={[0, 0.15, 0.52]} rotation={[Math.PI / 6, 0, 0]}>
          <boxGeometry args={[1.45, 0.22, 0.18]} />
          <meshStandardMaterial color={BODY_COLOR} {...METAL} />
        </mesh>
        {/* Side armor panel - left */}
        <mesh position={[-0.73, 0.05, 0]}>
          <boxGeometry args={[0.08, 0.45, 0.95]} />
          <meshStandardMaterial color="#A04010" {...METAL} />
        </mesh>
        {/* Side armor panel - right */}
        <mesh position={[0.73, 0.05, 0]}>
          <boxGeometry args={[0.08, 0.45, 0.95]} />
          <meshStandardMaterial color="#A04010" {...METAL} />
        </mesh>
        {/* Teal accent stripe */}
        <mesh position={[0, -0.28, 0]}>
          <boxGeometry args={[1.48, 0.06, 1.02]} />
          <meshStandardMaterial color={ACCENT_COLOR} roughness={0.3} metalness={0.6} />
        </mesh>
        {/* Sensor cluster (front face) */}
        <mesh position={[0, 0.1, 0.52]}>
          <boxGeometry args={[0.5, 0.18, 0.06]} />
          <meshStandardMaterial color="#111" roughness={0.2} metalness={0.7} />
        </mesh>
        {/* Front stereo cameras */}
        <mesh position={[-0.18, 0.1, 0.55]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#222" roughness={0.1} metalness={0.9} />
        </mesh>
        <mesh position={[0.18, 0.1, 0.55]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#222" roughness={0.1} metalness={0.9} />
        </mesh>
        {/* Headlights */}
        <pointLight position={[-0.4, 0, 0.6]} color="#ffffee" intensity={3} distance={12} />
        <pointLight position={[0.4, 0, 0.6]} color="#ffffee" intensity={3} distance={12} />
        <mesh position={[-0.4, 0, 0.52]}>
          <circleGeometry args={[0.07, 12]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={4} />
        </mesh>
        <mesh position={[0.4, 0, 0.52]}>
          <circleGeometry args={[0.07, 12]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={4} />
        </mesh>
      </group>

      {/* ── TRANSPARENT CENTER CHASSIS (PCB visible) ── */}
      <group position={[0, 0.35, 0]}>
        {/* Transparent chassis shell */}
        <mesh castShadow>
          <boxGeometry args={[1.3, 0.4, 0.65]} />
          <meshStandardMaterial
            color="#88aacc"
            roughness={0.05}
            metalness={0.2}
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
        {/* PCB motherboard */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[1.1, 0.04, 0.55]} />
          <meshStandardMaterial color="#0a5c3a" roughness={0.6} metalness={0.1} />
        </mesh>
        {/* Capacitors row 1 */}
        {[-0.35, -0.1, 0.15, 0.4].map((x, i) => (
          <mesh key={`cap_${i}`} position={[x, 0.03, 0.05]}>
            <cylinderGeometry args={[0.03, 0.03, 0.1, 8]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#1166ff' : '#cc8800'} roughness={0.4} />
          </mesh>
        ))}
        {/* ICs and processors */}
        <mesh position={[0.15, 0.01, -0.1]}>
          <boxGeometry args={[0.18, 0.05, 0.14]} />
          <meshStandardMaterial color="#222" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[-0.2, 0.01, -0.12]}>
          <boxGeometry args={[0.22, 0.05, 0.16]} />
          <meshStandardMaterial color="#111" roughness={0.3} metalness={0.7} />
        </mesh>
        {/* Battery pack (purple, large) */}
        <mesh position={[0, 0.01, 0.18]}>
          <boxGeometry args={[0.5, 0.08, 0.22]} />
          <meshStandardMaterial color="#7a00cc" roughness={0.5} metalness={0.2} />
        </mesh>
        {/* Heat sink fins */}
        {[-0.15, -0.08, -0.01, 0.06, 0.13].map((z, i) => (
          <mesh key={`fin_${i}`} position={[-0.38, 0.06, z]}>
            <boxGeometry args={[0.06, 0.14, 0.012]} />
            <meshStandardMaterial color="#aaaaaa" roughness={0.2} metalness={0.9} />
          </mesh>
        ))}
      </group>

      {/* ── REAR BODY SECTION ── */}
      <group position={[0, 0.45, -0.55]}>
        <mesh castShadow>
          <boxGeometry args={[1.45, 0.55, 1.0]} />
          <meshStandardMaterial color={BODY_COLOR} {...METAL} />
        </mesh>
        {/* Rear slope */}
        <mesh position={[0, 0.15, -0.52]} rotation={[-Math.PI / 6, 0, 0]}>
          <boxGeometry args={[1.45, 0.22, 0.18]} />
          <meshStandardMaterial color={BODY_COLOR} {...METAL} />
        </mesh>
        {/* Side panels */}
        <mesh position={[-0.73, 0.05, 0]}>
          <boxGeometry args={[0.08, 0.45, 0.95]} />
          <meshStandardMaterial color="#A04010" {...METAL} />
        </mesh>
        <mesh position={[0.73, 0.05, 0]}>
          <boxGeometry args={[0.08, 0.45, 0.95]} />
          <meshStandardMaterial color="#A04010" {...METAL} />
        </mesh>
        {/* Teal accent stripe */}
        <mesh position={[0, -0.28, 0]}>
          <boxGeometry args={[1.48, 0.06, 1.02]} />
          <meshStandardMaterial color={ACCENT_COLOR} roughness={0.3} metalness={0.6} />
        </mesh>
        {/* Fuel cell / exhaust grille */}
        <mesh position={[0, 0.05, -0.52]}>
          <boxGeometry args={[0.6, 0.25, 0.06]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.5} />
        </mesh>
        {/* Rear lights */}
        <mesh position={[-0.4, 0, -0.52]}>
          <circleGeometry args={[0.06, 12]} />
          <meshStandardMaterial color="#ff2200" emissive="#ff2200" emissiveIntensity={2} />
        </mesh>
        <mesh position={[0.4, 0, -0.52]}>
          <circleGeometry args={[0.06, 12]} />
          <meshStandardMaterial color="#ff2200" emissive="#ff2200" emissiveIntensity={2} />
        </mesh>
      </group>

      {/* ── ARTICULATION JOINT (center) ── */}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.3, 16]} />
        <meshStandardMaterial color="#222" roughness={0.3} metalness={0.9} />
      </mesh>

      {/* ── LiDAR on top of front section ── */}
      <LiDAR position={[0, 0.76, 0.4]} />

      {/* ── Antenna ── */}
      <mesh position={[0.5, 1.05, 0.3]} rotation={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.012, 0.004, 0.55, 6]} />
        <meshStandardMaterial color="#888" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* ── 6 WHEELS ── */}
      {wheelPositions.map((pos, i) => (
        <Wheel key={i} position={pos} isLeft={i < 3} />
      ))}

      {/* Ambient glow under chassis (status indicator) */}
      <pointLight color="#0044ff" intensity={0.4} distance={3} position={[0, -0.1, 0]} />
    </group>
  );
}

export default function RoverModel(props: Omit<Props, 'velocity'> & { velocity?: number }) {
  const roverVisual = useSimulationStore((s) => s.roverVisual);

  if (roverVisual === 'procedural') {
    return <ProceduralRover {...props} />;
  }

  return (
    <Suspense fallback={<ProceduralRover {...props} />}>
      <GlbRover position={props.position} headingRad={props.headingRad} slopeDeg={props.slopeDeg} />
    </Suspense>
  );
}
