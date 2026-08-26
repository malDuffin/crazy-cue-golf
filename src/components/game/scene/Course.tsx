import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildCourseColliders, HOLES, type StaticBox } from "@/lib/game/holes";

const COLORS = {
  felt: "#3ad07a",
  feltDark: "#1e8a4e",
  wood: "#c48a48",
  woodDark: "#7a4a22",
  rail: "#f0ddb4",
  railEdge: "#d4b07a",
  ramp: "#48d68c",
  block: "#efd3a0",
  accent: "#f4c14a",
  cup: "#05070a",
  cupRim: "#f0c14a",
  tableLeg: "#5a3820",
};

function kindColor(kind: StaticBox["kind"]) {
  switch (kind) {
    case "felt":
      return COLORS.felt;
    case "wood":
      return COLORS.wood;
    case "rail":
      return COLORS.rail;
    case "ramp":
      return COLORS.ramp;
    case "block":
      return COLORS.block;
    case "accent":
      return COLORS.accent;
    default:
      return COLORS.wood;
  }
}

export function Course() {
  const boxes = useMemo(() => buildCourseColliders(), []);
  const mill = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (mill.current) mill.current.rotation.y = clock.elapsedTime * 1.25;
  });

  return (
    <group>
      {boxes.map((box, i) => (
        <mesh
          key={i}
          position={[box.pos.x, box.pos.y, box.pos.z]}
          rotation={[box.rotX ?? 0, box.rotY ?? 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[box.half.x * 2, box.half.y * 2, box.half.z * 2]} />
          <meshStandardMaterial
            color={kindColor(box.kind)}
            roughness={box.kind === "felt" ? 0.78 : box.kind === "rail" ? 0.42 : 0.52}
            metalness={box.kind === "rail" ? 0.08 : 0.03}
            emissive={
              box.kind === "felt" ? "#147a40" : box.kind === "ramp" ? "#0d5c32" : "#000000"
            }
            emissiveIntensity={box.kind === "felt" ? 0.42 : box.kind === "ramp" ? 0.22 : 0}
            flatShading
          />
        </mesh>
      ))}

      {/* Always-visible felt top so the course never reads as a black void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0.5]} receiveShadow>
        <planeGeometry args={[3.38, 7.18]} />
        <meshStandardMaterial
          color={COLORS.felt}
          roughness={0.82}
          emissive="#1a8f4c"
          emissiveIntensity={0.55}
          toneMapped={false}
        />
      </mesh>

      {[-2.4, -1.2, 0, 1.2, 2.4, 3.4].map((z) => (
        <mesh key={`st-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, z]} receiveShadow>
          <planeGeometry args={[3.2, 0.018]} />
          <meshBasicMaterial color="#7dffb0" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}

      {HOLES.map((h) => (
        <group key={h.id} position={[h.cup.x, 0.01, h.cup.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.11, 24]} />
            <meshStandardMaterial color={COLORS.cup} roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
            <ringGeometry args={[0.11, 0.145, 24]} />
            <meshStandardMaterial
              color={COLORS.cupRim}
              emissive={COLORS.cupRim}
              emissiveIntensity={0.45}
              roughness={0.35}
              metalness={0.4}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.56, 8]} />
            <meshStandardMaterial color="#f4efe4" roughness={0.5} />
          </mesh>
          <mesh position={[0.09, 0.42, 0]}>
            <planeGeometry args={[0.16, 0.12]} />
            <meshStandardMaterial
              color="#e07a6a"
              emissive="#8a3028"
              emissiveIntensity={0.4}
              side={THREE.DoubleSide}
              roughness={0.6}
            />
          </mesh>
        </group>
      ))}

      <group position={[0, 0, 1.35]}>
        <mesh position={[0, 0.38, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.76, 8]} />
          <meshStandardMaterial color="#8a5a32" roughness={0.55} flatShading />
        </mesh>
        <group ref={mill} position={[0, 0.72, 0]}>
          <mesh rotation={[0, 0, 0]} castShadow>
            <boxGeometry args={[1.1, 0.08, 0.12]} />
            <meshStandardMaterial color="#e8d5a8" roughness={0.45} flatShading />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[1.1, 0.08, 0.12]} />
            <meshStandardMaterial color="#dcc48c" roughness={0.45} flatShading />
          </mesh>
        </group>
      </group>

      <mesh position={[0, -0.22, 0.5]} receiveShadow>
        <boxGeometry args={[3.7, 0.2, 7.5]} />
        <meshStandardMaterial color={COLORS.woodDark} roughness={0.7} flatShading />
      </mesh>
      {(
        [
          [-1.55, -0.8, -2.7],
          [1.55, -0.8, -2.7],
          [-1.55, -0.8, 3.7],
          [1.55, -0.8, 3.7],
        ] as const
      ).map((p, i) => (
        <mesh key={i} position={[...p]} castShadow>
          <boxGeometry args={[0.16, 1.2, 0.16]} />
          <meshStandardMaterial color={COLORS.tableLeg} roughness={0.75} flatShading />
        </mesh>
      ))}

      <LowPolyTree position={[-2.8, -1.38, -2.2]} />
      <LowPolyTree position={[2.9, -1.38, -1.4]} scale={1.15} />
      <LowPolyTree position={[-3.1, -1.38, 2.6]} scale={0.9} />
      <LowPolyTree position={[3.2, -1.38, 3.4]} scale={1.05} />

      <HoleMarker id={1} position={[-1.45, 0.02, -2.45]} />
      <HoleMarker id={2} position={[1.45, 0.02, 0.7]} />
      <HoleMarker id={3} position={[-1.45, 0.02, 3.15]} />
    </group>
  );
}

function HoleMarker({ id, position }: { id: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.16, 20]} />
        <meshBasicMaterial color="#f4d36a" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[0.16, 0.2, 20]} />
        <meshBasicMaterial color="#fff6d0" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[0.045, 0.14, 0.03]} />
        <meshBasicMaterial color="#3a2410" toneMapped={false} />
      </mesh>
      {id > 1 && (
        <mesh position={[0.07, 0.08, 0]}>
          <boxGeometry args={[0.03, 0.1, 0.03]} />
          <meshBasicMaterial color="#3a2410" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function LowPolyTree({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 0.7, 6]} />
        <meshStandardMaterial color="#5a3a22" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <coneGeometry args={[0.42, 0.7, 7]} />
        <meshStandardMaterial color="#2eb86a" roughness={0.62} flatShading emissive="#0a5c30" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <coneGeometry args={[0.3, 0.5, 7]} />
        <meshStandardMaterial color="#3ad07a" roughness={0.62} flatShading emissive="#147a40" emissiveIntensity={0.28} />
      </mesh>
    </group>
  );
}

const PATH_DOTS = 64;

/**
 * Ghost balls every 0.05s of the Box3D predicted shot (up to 3s).
 */
export function PhysicsPathPreview({
  pathRef,
  visible,
  sunkRef,
}: {
  pathRef: React.MutableRefObject<{ x: number; y: number; z: number }[]>;
  visible: boolean;
  sunkRef: React.MutableRefObject<boolean>;
}) {
  const group = useRef<THREE.Group>(null);
  const dots = useRef<THREE.Group>(null);
  const ghost = useRef<THREE.Mesh>(null);
  const tube = useRef<THREE.Mesh>(null);
  const lastSig = useRef("");

  useFrame(() => {
    if (!group.current) return;
    const pts = pathRef.current;
    const show = visible && pts.length > 1;
    group.current.visible = show;
    if (!show) {
      if (ghost.current) ghost.current.visible = false;
      if (tube.current) tube.current.visible = false;
      return;
    }

    const n = Math.min(PATH_DOTS, pts.length);
    const sunkNow = sunkRef.current;
    const lift = 0.04;
    const last = pts[n - 1]!;
    const sig = `${n}:${pts[0]!.x.toFixed(2)}:${last.x.toFixed(2)}:${last.z.toFixed(2)}:${sunkNow ? 1 : 0}`;

    if (tube.current && n >= 2 && sig !== lastSig.current) {
      lastSig.current = sig;
      const vecs = [];
      for (let i = 0; i < n; i++) {
        const p = pts[i]!;
        vecs.push(new THREE.Vector3(p.x, Math.max(p.y, 0.02) + lift, p.z));
      }
      const curve = new THREE.CatmullRomCurve3(vecs, false, "catmullrom", 0.2);
      const geo = new THREE.TubeGeometry(curve, Math.max(16, n * 3), 0.014, 6, false);
      const old = tube.current.geometry;
      tube.current.geometry = geo;
      old.dispose();
      const mat = tube.current.material as THREE.MeshBasicMaterial;
      mat.color.set(sunkNow ? "#7ef0a0" : "#7dd3c0");
      tube.current.visible = true;
    } else if (tube.current) {
      tube.current.visible = n >= 2;
    }

    if (dots.current) {
      for (let i = 0; i < PATH_DOTS; i++) {
        const child = dots.current.children[i] as THREE.Mesh | undefined;
        if (!child) continue;
        if (i === 0 || i >= n) {
          child.visible = false;
          continue;
        }
        const p = pts[i]!;
        child.visible = true;
        child.position.set(p.x, Math.max(p.y, 0.02) + lift, p.z);
        const t = n <= 1 ? 1 : i / Math.max(1, n - 1);
        child.scale.setScalar((0.9 - t * 0.25) );
        const mat = child.material as THREE.MeshBasicMaterial;
        if (sunkNow) mat.color.set(i === n - 1 ? "#7ef0a0" : "#7dd3c0");
        else mat.color.set(t < 0.4 ? "#7dd3c0" : t < 0.75 ? "#e0c36a" : "#e07a6a");
        mat.opacity = 0.55 + (1 - t) * 0.35;
      }
    }

    if (ghost.current) {
      ghost.current.visible = true;
      ghost.current.position.set(last.x, last.y + 0.02, last.z);
      const mat = ghost.current.material as THREE.MeshBasicMaterial;
      mat.color.set(sunkNow ? "#7ef0a0" : "#f4f7ff");
      mat.opacity = 0.55;
    }
  });

  return (
    <group ref={group} renderOrder={18}>
      <mesh ref={tube} frustumCulled={false} renderOrder={18}>
        <tubeGeometry args={[new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.1)), 1, 0.018, 5]} />
        <meshBasicMaterial
          color="#7dd3c0"
          transparent
          opacity={0.45}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group ref={dots}>
        {Array.from({ length: PATH_DOTS }, (_, i) => (
          <mesh key={i} renderOrder={19} frustumCulled={false}>
            <sphereGeometry args={[0.048, 10, 10]} />
            <meshBasicMaterial
              color="#7dd3c0"
              transparent
              opacity={0.8}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      <mesh ref={ghost} renderOrder={20} frustumCulled={false}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial
          color="#f4f7ff"
          transparent
          opacity={0.5}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

const _orbWorld = new THREE.Vector3();

export function CueOrbitGuide({
  origin,
  yaw,
  power,
  visible,
}: {
  origin: THREE.Vector3;
  yaw: number;
  power: number;
  visible: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const orb = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const aimArrow = useRef<THREE.Group>(null);
  const { scene } = useThree();

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.visible = visible;
    if (!visible) {
      const ud = scene.userData as { cueOrbPos?: THREE.Vector3 | null };
      ud.cueOrbPos = null;
      return;
    }

    const t = clock.elapsedTime;
    group.current.position.set(origin.x, origin.y + 0.04, origin.z);

    if (ring.current) {
      const r = 1 + power * 0.7;
      ring.current.scale.setScalar(r);
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.28 + power * 0.3 + Math.sin(t * 4) * 0.06;
    }

    const buttYaw = yaw + Math.PI;
    const dist = 0.42 + power * 0.55;
    const ox = Math.sin(buttYaw) * dist;
    const oy = 0.1;
    const oz = Math.cos(buttYaw) * dist;

    if (orb.current) {
      orb.current.position.set(ox, oy, oz);
      orb.current.scale.setScalar(1 + Math.sin(t * 5.5) * 0.08);
      orb.current.getWorldPosition(_orbWorld);
      const ud = scene.userData as { cueOrbPos?: THREE.Vector3 };
      if (!ud.cueOrbPos) ud.cueOrbPos = new THREE.Vector3();
      ud.cueOrbPos.copy(_orbWorld);
    }
    if (glow.current) {
      glow.current.position.set(ox, oy, oz);
      glow.current.scale.setScalar(1.15 + power * 0.35 + Math.sin(t * 5.5) * 0.1);
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 + power * 0.28;
    }
    if (aimArrow.current) {
      const ad = 0.48 + power * 0.75;
      aimArrow.current.position.set(Math.sin(yaw) * ad, 0.04, Math.cos(yaw) * ad);
      aimArrow.current.rotation.y = yaw;
      aimArrow.current.rotation.x = Math.PI / 2;
      aimArrow.current.scale.setScalar(0.8 + power * 0.7);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.5, 48]} />
        <meshBasicMaterial
          color="#7ef0c8"
          transparent
          opacity={0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh userData={{ cueOrb: true }} ref={orb}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={glow}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshBasicMaterial
          color="#ffe08a"
          transparent
          opacity={0.28}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <CueOrbVisual orbRef={orb} />
      <group ref={aimArrow}>
        <mesh>
          <coneGeometry args={[0.05, 0.16, 8]} />
          <meshBasicMaterial
            color="#7dd3c0"
            transparent
            opacity={0.8}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function CueOrbVisual({ orbRef }: { orbRef: React.RefObject<THREE.Mesh | null> }) {
  const vis = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!vis.current || !orbRef.current) return;
    vis.current.position.copy(orbRef.current.position);
    vis.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5.5) * 0.1);
  });
  return (
    <mesh ref={vis} userData={{ cueOrb: true }} castShadow>
      <sphereGeometry args={[0.09, 18, 18]} />
      <meshStandardMaterial
        color="#f0c14a"
        emissive="#e0c36a"
        emissiveIntensity={0.85}
        metalness={0.35}
        roughness={0.25}
        toneMapped={false}
      />
    </mesh>
  );
}

export function ChainGhosts({
  chain,
  setupOrigin,
  playing,
  selected,
  editingIndex,
  onEdit,
}: {
  chain: {
    id?: string;
    rest: { x: number; y: number; z: number };
    origin: { x: number; y: number; z: number };
    path: { x: number; y: number; z: number }[];
    sunk: boolean;
  }[];
  setupOrigin: { x: number; y: number; z: number } | null;
  playing: boolean;
  selected: boolean;
  editingIndex: number | null;
  onEdit: (index: number) => void;
}) {
  if (playing || (chain.length === 0 && !setupOrigin)) return null;

  return (
    <group>
      {chain.map((shot, i) => {
        const editing = editingIndex === i;
        return (
        <group
          key={shot.id ?? `chain-${i}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(i);
          }}
        >
          {shot.path.length > 1 &&
            shot.path
              .filter((_, idx) => idx % 4 === 0 || idx === shot.path.length - 1)
              .map((p, k) => (
                <mesh key={`p-${k}`} position={[p.x, Math.max(p.y, 0.02) + 0.03, p.z]}>
                  <sphereGeometry args={[0.03, 8, 8]} />
                  <meshBasicMaterial
                    color={shot.sunk ? "#7ef0a0" : editing ? "#ffe08a" : "#8ec8ff"}
                    transparent
                    opacity={editing ? 0.55 : 0.28}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
              ))}
          <mesh position={[shot.rest.x, Math.max(shot.rest.y, 0.06) + 0.02, shot.rest.z]}>
            <sphereGeometry args={[0.055, 14, 14]} />
            <meshBasicMaterial
              color={editing ? "#ffe08a" : "#9ad8ff"}
              transparent
              opacity={editing ? 0.7 : 0.35}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[shot.rest.x, 0.02, shot.rest.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.1, 0.16, 24]} />
            <meshBasicMaterial
              color={editing ? "#f4d36a" : "#7ec8ff"}
              transparent
              opacity={0.55}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
        );
      })}
      {setupOrigin && selected && (
        <mesh
          position={[setupOrigin.x, Math.max(setupOrigin.y, 0.06), setupOrigin.z]}
          userData={{ ball: true }}
        >
          <sphereGeometry args={[0.058, 16, 16]} />
          <meshStandardMaterial
            color="#f4f7ff"
            transparent
            opacity={0.55}
            roughness={0.2}
            metalness={0.3}
            emissive="#a8d8ff"
            emissiveIntensity={0.35}
          />
        </mesh>
      )}
    </group>
  );
}
