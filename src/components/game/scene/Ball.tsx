import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BALL_R, type Box3DWorld } from "@/lib/physics/box3dWorld";
import { useGameStore } from "@/lib/game/store";

export function Ball({
  physicsRef,
  onBallState,
}: {
  physicsRef: React.MutableRefObject<Box3DWorld | null>;
  onBallState: (pos: THREE.Vector3, asleep: boolean, speed: number) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const hit = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const pos = useRef(new THREE.Vector3());
  const squash = useRef(1);
  const ballSelected = useGameStore((s) => s.ballSelected);
  const shot = useGameStore((s) => s.shot);
  const phase = useGameStore((s) => s.phase);

  useFrame(({ clock }, dt) => {
    const world = physicsRef.current;
    if (!world || !mesh.current) return;
    const s = world.getBallState();
    mesh.current.position.set(s.position.x, s.position.y, s.position.z);
    mesh.current.quaternion.set(s.rotation.x, s.rotation.y, s.rotation.z, s.rotation.w);
    pos.current.copy(mesh.current.position);
    const speed = Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z);

    const stretch = 1 + Math.min(0.35, speed * 0.06);
    const targetSquash = speed > 0.4 ? stretch : 1;
    squash.current += (targetSquash - squash.current) * (1 - Math.exp(-12 * dt));
    const sy = 1 / Math.sqrt(squash.current);
    mesh.current.scale.set(sy, squash.current, sy);

    if (glow.current) {
      glow.current.position.copy(mesh.current.position);
      const g = 0.08 + Math.min(0.25, speed * 0.04);
      glow.current.scale.setScalar(1 + g * 4);
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.min(0.35, speed * 0.05);
    }
    if (hit.current) {
      hit.current.position.copy(mesh.current.position);
    }

    // Selection ring / idle pulse
    const t = clock.elapsedTime;
    if (ring.current) {
      ring.current.position.set(pos.current.x, 0.02, pos.current.z);
      const selected = ballSelected && shot !== "flying";
      ring.current.visible = phase === "playing" && shot !== "flying";
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      if (selected) {
        ring.current.scale.setScalar(1.05 + Math.sin(t * 4) * 0.06);
        mat.opacity = 0.55 + Math.sin(t * 5) * 0.15;
        mat.color.set("#7ef0c8");
      } else {
        ring.current.scale.setScalar(1 + Math.sin(t * 2.5) * 0.08);
        mat.opacity = 0.28 + Math.sin(t * 3) * 0.1;
        mat.color.set("#e0c36a");
      }
    }
    if (pulse.current) {
      pulse.current.position.set(pos.current.x, 0.015, pos.current.z);
      const show = phase === "playing" && !ballSelected && shot !== "flying";
      pulse.current.visible = show;
      if (show) {
        const k = (Math.sin(t * 2.8) * 0.5 + 0.5);
        pulse.current.scale.setScalar(0.9 + k * 0.55);
        (pulse.current.material as THREE.MeshBasicMaterial).opacity = 0.22 * (1 - k * 0.7);
      }
    }

    onBallState(pos.current, s.asleep, speed);
  });

  return (
    <group>
      <mesh ref={mesh} castShadow userData={{ ball: true }}>
        <sphereGeometry args={[BALL_R, 24, 24]} />
        <meshStandardMaterial
          color="#f7f9fc"
          roughness={0.16}
          metalness={0.28}
          envMapIntensity={1.1}
        />
      </mesh>
      {/* Dimple-ish highlight cap */}
      <mesh position={[0, 0, 0]} userData={{ ball: true }}>
        {/* follows via parent? actually need sync — use hit-only for interaction */}
      </mesh>
      <mesh ref={hit} userData={{ ball: true }}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={glow}>
        <sphereGeometry args={[BALL_R * 1.35, 12, 12]} />
        <meshBasicMaterial
          color="#a8ffe8"
          transparent
          opacity={0.2}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Clickable selection ring on felt */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} userData={{ ball: true }}>
        <ringGeometry args={[0.14, 0.2, 40]} />
        <meshBasicMaterial
          color="#e0c36a"
          transparent
          opacity={0.35}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} userData={{ ball: true }}>
        <ringGeometry args={[0.18, 0.24, 40]} />
        <meshBasicMaterial
          color="#e0c36a"
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
