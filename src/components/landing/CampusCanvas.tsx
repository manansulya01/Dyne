"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, Grid, Line, Stars } from "@react-three/drei";
import * as THREE from "three";

/** Timer singleton for animation timing (replaces deprecated THREE.Clock). */
const timer = new THREE.Timer();

export interface CampusCanvasProps {
  reducedMotion: boolean;
  lowPower: boolean;
}

interface BuildingSpec {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

/** Deterministic campus layout — no runtime randomness, stable across renders. */
const BUILDINGS: BuildingSpec[] = [
  { position: [-5.4, 1.1, 0.6], size: [1.9, 2.2, 1.9], color: "#2b3547" },
  { position: [5.4, 1.4, 0.6], size: [2.1, 2.8, 2.1], color: "#323e54" },
  { position: [-3.1, 0.8, -3.4], size: [1.6, 1.6, 1.6], color: "#273043" },
  { position: [3.1, 1.0, -3.4], size: [1.7, 2.0, 1.7], color: "#2e3a50" },
  { position: [0, 0.65, 3.6], size: [2.4, 1.3, 1.8], color: "#28324a" },
];

const HUB_TOP: [number, number, number] = [0, 4.6, -0.4];

function beaconTop(size: [number, number, number]): number {
  return size[1] / 2 + 0.08;
}

function Buildings() {
  return (
    <group>
      {BUILDINGS.map((b, i) => (
        <mesh key={i} position={b.position}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={b.color} roughness={0.85} metalness={0.15} />
          <Edges threshold={20} color="#46566f" />
          <mesh position={[0, beaconTop(b.size), 0]}>
            <boxGeometry args={[0.42, 0.12, 0.42]} />
            <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={1.8} />
          </mesh>
        </mesh>
      ))}
    </group>
  );
}

/** Central network hub — the "one digital network" the campus connects through. */
function NetworkHub() {
  return (
    <group position={[0, 0, -0.4]}>
      <mesh position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.32, 0.5, 4.2, 12]} />
        <meshStandardMaterial color="#3a4763" roughness={0.6} metalness={0.35} />
      </mesh>
      <mesh position={[0, 4.6, 0]}>
        <sphereGeometry args={[0.34, 24, 24]} />
        <meshStandardMaterial color="#a5f3fc" emissive="#22d3ee" emissiveIntensity={2.4} />
      </mesh>
      <mesh position={[0, 4.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.035, 12, 48]} />
        <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

/** Glowing connection lines from the hub to every building rooftop. */
function Connections() {
  const lines = useMemo(
    () =>
      BUILDINGS.map((b) => {
        const top: [number, number, number] = [
          b.position[0],
          b.position[1] + beaconTop(b.size),
          b.position[2],
        ];
        return [HUB_TOP, top] as [number, number, number][];
      }),
    []
  );
  return (
    <group>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#22d3ee" transparent opacity={0.45} lineWidth={1.5} />
      ))}
    </group>
  );
}

/** Ground paths from the plaza to each building. */
function Paths() {
  const paths = useMemo(
    () =>
      BUILDINGS.map((b) => {
        const dx = b.position[0];
        const dz = b.position[2];
        const len = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);
        return { len: Math.max(len - 1.2, 0.5), angle };
      }),
    []
  );
  return (
    <group>
      {paths.map((p, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, p.angle]} position={[0, 0.02, 0]}>
          <planeGeometry args={[0.5, p.len]} />
          <meshStandardMaterial color="#232f45" roughness={1} />
        </mesh>
      ))}
      {/* plaza disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -0.4]}>
        <circleGeometry args={[1.4, 40]} />
        <meshStandardMaterial color="#26334b" roughness={1} />
      </mesh>
    </group>
  );
}

interface PulseNodesProps {
  reducedMotion: boolean;
}

/** Student/community activity nodes — gently pulsing points of campus life. */
function PulseNodes({ reducedMotion }: PulseNodesProps) {
  const group = useRef<THREE.Group>(null);
  const nodes = useMemo(
    () =>
      [
        { p: [-5.4, 2.5, 0.6] as const, c: "#22d3ee" },
        { p: [5.4, 3.1, 0.6] as const, c: "#a78bfa" },
        { p: [-3.1, 1.9, -3.4] as const, c: "#fbbf24" },
        { p: [3.1, 2.3, -3.4] as const, c: "#22d3ee" },
        { p: [0, 1.6, 3.6] as const, c: "#f472b6" },
      ].map((n, i) => ({ ...n, phase: i * 1.3 })),
    []
  );
  useFrame(() => {
    if (reducedMotion || !group.current) return;
    timer.update();
    const t = timer.getElapsed();
    group.current.children.forEach((child, i) => {
      const s = 1 + 0.28 * Math.sin(t * 1.8 + nodes[i].phase);
      child.scale.setScalar(s);
    });
  });
  return (
    <group ref={group}>
      {nodes.map((n, i) => (
        <mesh key={i} position={[n.p[0], n.p[1], n.p[2]]}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshStandardMaterial color={n.c} emissive={n.c} emissiveIntensity={2} />
        </mesh>
      ))}
    </group>
  );
}

interface CameraRigProps {
  reducedMotion: boolean;
}

/**
 * Damped camera: gentle pointer parallax plus a slow scroll-driven
 * dolly. Never dizzying — small ranges, exponential damping.
 */
function CameraRig({ reducedMotion }: CameraRigProps) {
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const cam = state.camera;
    if (reducedMotion) {
      cam.position.set(0, 9, 16);
      lookTarget.set(0, 1.2, 0);
      cam.lookAt(lookTarget);
      return;
    }
    const scroll = typeof window === "undefined" ? 0 : window.scrollY;
    const progress = Math.min(Math.max(scroll / 1100, 0), 1);
    const px = state.pointer.x * 2.0;
    const py = 8.6 - progress * 3.2 + state.pointer.y * 0.9;
    const pz = 15.6 - progress * 4.2;
    // Frame-rate independent damping.
    const k = 1 - Math.exp(-2.6 * delta);
    cam.position.x += (px - cam.position.x) * k;
    cam.position.y += (py - cam.position.y) * k;
    cam.position.z += (pz - cam.position.z) * k;
    lookTarget.set(px * 0.3, 1.2 - progress * 0.4, 0);
    cam.lookAt(lookTarget);
  });
  return null;
}

export default function CampusCanvas({ reducedMotion, lowPower }: CampusCanvasProps) {
  return (
    <Canvas
      dpr={lowPower ? 1 : [1, 1.75]}
      camera={{ position: [0, 9, 16], fov: 45, near: 0.1, far: 220 }}
      gl={{ antialias: true, alpha: true }}
      style={{ touchAction: "pan-y" }}
    >
      <color attach="background" args={["#09090b"]} />
      <hemisphereLight args={["#9db4d8", "#0b0e16", 0.85]} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} color="#e8f1ff" />
      <pointLight position={[0, 4.6, -0.4]} intensity={12} distance={14} color="#22d3ee" />
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[17, 64]} />
        <meshStandardMaterial color="#0d1322" roughness={1} />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        args={[34, 34]}
        cellColor="#1a2438"
        sectionColor="#27334d"
        fadeDistance={30}
        fadeStrength={2}
        infiniteGrid={false}
      />
      <Paths />
      <Buildings />
      <NetworkHub />
      <Connections />
      <PulseNodes reducedMotion={reducedMotion} />
      {!reducedMotion && (
        <Stars radius={70} depth={25} count={lowPower ? 900 : 2200} factor={3.2} saturation={0} fade speed={0.5} />
      )}
      <CameraRig reducedMotion={reducedMotion} />
    </Canvas>
  );
}
