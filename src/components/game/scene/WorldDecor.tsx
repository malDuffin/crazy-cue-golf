import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/game/store";

/** Stylized sky dome + ambient floating orbs + room walls for wow factor. */
export function WorldDecor() {
  const lowPower = useGameStore((s) => s.lowPower);
  const orbs = useRef<THREE.Group>(null);
  const skyMat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "#1a2848");
    grad.addColorStop(0.35, "#243656");
    grad.addColorStop(0.7, "#2a4050");
    grad.addColorStop(1, "#1a3028");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const moteCount = lowPower ? 24 : 48;
  const moteData = useMemo(() => {
    return Array.from({ length: moteCount }, (_, i) => ({
      x: (Math.sin(i * 12.1) * 0.5 + 0.5) * 10 - 5,
      y: 0.3 + (i % 7) * 0.25,
      z: (Math.cos(i * 7.7) * 0.5 + 0.5) * 10 - 4,
      s: 0.02 + (i % 5) * 0.008,
      phase: i * 0.7,
    }));
  }, [moteCount]);

  useFrame(({ clock }) => {
    if (!orbs.current) return;
    const t = clock.elapsedTime;
    orbs.current.children.forEach((child, i) => {
      const d = moteData[i];
      if (!d) return;
      child.position.y = d.y + Math.sin(t * 0.7 + d.phase) * 0.12;
      child.position.x = d.x + Math.cos(t * 0.35 + d.phase) * 0.08;
    });
  });

  return (
    <group>
      {/* Sky dome */}
      <mesh scale={[-1, 1, 1]}>
        <sphereGeometry args={[28, 24, 16]} />
        <meshBasicMaterial map={skyMat} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Soft horizon glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.35, 0.5]}>
        <ringGeometry args={[6, 14, 48]} />
        <meshBasicMaterial
          color="#1a3a4a"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Floor with subtle grid feel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.39, 0.5]} receiveShadow>
        <circleGeometry args={[12, 48]} />
        <meshStandardMaterial color="#10161f" roughness={0.92} metalness={0.05} />
      </mesh>

      {/* Neon under-table glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.28, 0.5]}>
        <planeGeometry args={[3.9, 7.7]} />
        <meshBasicMaterial color="#2a9d8f" transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {/* Ambient motes */}
      <group ref={orbs}>
        {moteData.map((d, i) => (
          <mesh key={i} position={[d.x, d.y, d.z]}>
            <sphereGeometry args={[d.s, 6, 6]} />
            <meshBasicMaterial
              color={i % 3 === 0 ? "#7dd3c0" : i % 3 === 1 ? "#e0c36a" : "#a8c4ff"}
              transparent
              opacity={0.55}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {/* Backdrop props */}
      <LowPolyBoulder position={[-4.2, -1.4, 1.5]} />
      <LowPolyBoulder position={[4.0, -1.4, -0.5]} scale={1.3} />
      <LowPolyBoulder position={[3.5, -1.4, 3.8]} scale={0.85} />
    </group>
  );
}

function LowPolyBoulder({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.25, 0]}>
        <dodecahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color="#2a3340" roughness={0.9} flatShading />
      </mesh>
      <mesh castShadow position={[0.25, 0.15, 0.15]} scale={0.55}>
        <dodecahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color="#343f4f" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}
