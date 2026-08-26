import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { juiceBus, type JuiceEvent } from "@/lib/game/juice";
import { useGameStore } from "@/lib/game/store";

const MAX = 180;

type Particle = {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
};

function makePool(): Particle[] {
  return Array.from({ length: MAX }, () => ({
    alive: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 1,
    size: 0.03,
    r: 1,
    g: 1,
    b: 1,
    gravity: 4,
  }));
}

export function JuiceFX() {
  const lowPower = useGameStore((s) => s.lowPower);
  const lowPowerRef = useRef(lowPower);
  lowPowerRef.current = lowPower;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const pool = useRef(makePool());
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const trailMesh = useRef<THREE.Points>(null);
  const trailPos = useMemo(() => new Float32Array(48 * 3), []);
  const trailAges = useRef(new Float32Array(48));
  const trailHead = useRef(0);
  const lastBall = useRef(new THREE.Vector3());

  useEffect(() => {
    const spawn = (
      x: number,
      y: number,
      z: number,
      count: number,
      opts: {
        speed?: number;
        up?: number;
        life?: number;
        size?: number;
        color?: [number, number, number];
        gravity?: number;
        spread?: number;
      } = {},
    ) => {
      const budget = lowPowerRef.current ? Math.ceil(count * 0.45) : count;
      let spawned = 0;
      const particles = pool.current;
      for (let i = 0; i < particles.length && spawned < budget; i++) {
        const p = particles[i]!;
        if (p.alive) continue;
        const sp = opts.speed ?? 1.2;
        const spread = opts.spread ?? 1;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.55;
        p.alive = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = Math.cos(theta) * Math.sin(phi) * sp * spread * (0.4 + Math.random());
        p.vy = (opts.up ?? 1.2) * (0.5 + Math.random());
        p.vz = Math.sin(theta) * Math.sin(phi) * sp * spread * (0.4 + Math.random());
        p.life = 0;
        p.maxLife = (opts.life ?? 0.6) * (0.7 + Math.random() * 0.6);
        p.size = (opts.size ?? 0.035) * (0.7 + Math.random() * 0.8);
        const c = opts.color ?? [0.5, 0.9, 0.8];
        p.r = c[0];
        p.g = c[1];
        p.b = c[2];
        p.gravity = opts.gravity ?? 5;
        spawned++;
      }
    };

    return juiceBus.on((e: JuiceEvent) => {
      if (e.type === "hit") {
        spawn(e.x, e.y, e.z, 18 + Math.floor(e.power * 24), {
          speed: 1.4 + e.power * 1.8,
          up: 0.6 + e.power,
          life: 0.45,
          size: 0.04,
          color: [1, 0.95, 0.75],
          gravity: 6,
        });
        spawn(e.x, e.y, e.z, 10, {
          speed: 0.6,
          up: 0.3,
          life: 0.7,
          size: 0.05,
          color: [0.49, 0.83, 0.75],
          gravity: 2,
        });
      } else if (e.type === "bounce") {
        spawn(e.x, e.y, e.z, 6 + Math.floor(e.speed * 3), {
          speed: 0.5 + e.speed * 0.2,
          up: 0.5,
          life: 0.35,
          size: 0.03,
          color: [0.9, 0.9, 0.85],
          gravity: 8,
        });
      } else if (e.type === "sink") {
        spawn(e.x, e.y + 0.1, e.z, 40, {
          speed: 1.6,
          up: 2.2,
          life: 1.1,
          size: 0.05,
          color: [0.95, 0.82, 0.3],
          gravity: 3,
          spread: 1.4,
        });
        spawn(e.x, e.y + 0.1, e.z, 28, {
          speed: 1.2,
          up: 1.8,
          life: 1.0,
          size: 0.04,
          color: [0.49, 0.83, 0.75],
          gravity: 2.5,
          spread: 1.2,
        });
        spawn(e.x, e.y + 0.1, e.z, 18, {
          speed: 1.4,
          up: 2.0,
          life: 0.9,
          size: 0.045,
          color: [0.88, 0.48, 0.42],
          gravity: 2.8,
        });
      } else if (e.type === "confetti") {
        spawn(0, 1.2, 0.5, 50, {
          speed: 2.2,
          up: 1.5,
          life: 1.4,
          size: 0.06,
          color: [0.49, 0.83, 0.75],
          gravity: 2,
          spread: 2,
        });
      } else if (e.type === "oob") {
        spawn(0, 0.4, 0, 12, {
          speed: 0.8,
          up: 0.4,
          life: 0.5,
          color: [0.88, 0.48, 0.42],
        });
      }
    });
  }, []);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    const im = mesh.current;
    if (!im) return;

    if (!im.instanceColor) {
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    }

    const bridge = (state.scene.userData as { ballPos?: THREE.Vector3 }).ballPos;
    if (bridge) {
      const dist = bridge.distanceTo(lastBall.current);
      if (dist > 0.012) {
        const i = trailHead.current % 48;
        trailPos[i * 3] = bridge.x;
        trailPos[i * 3 + 1] = bridge.y;
        trailPos[i * 3 + 2] = bridge.z;
        trailAges.current[i] = 1;
        trailHead.current++;
        lastBall.current.copy(bridge);
      }
    }
    for (let i = 0; i < 48; i++) {
      trailAges.current[i] = Math.max(0, trailAges.current[i]! - d * 2.2);
    }
    if (trailMesh.current) {
      const geo = trailMesh.current.geometry;
      const attr = geo.getAttribute("position") as THREE.BufferAttribute;
      attr.needsUpdate = true;
      const cols = geo.getAttribute("color") as THREE.BufferAttribute;
      for (let i = 0; i < 48; i++) {
        const a = trailAges.current[i]!;
        cols.setXYZ(i, 0.49 * a, 0.9 * a, 0.8 * a);
      }
      cols.needsUpdate = true;
    }

    let visible = 0;
    const maxVis = lowPower ? 80 : MAX;
    for (let i = 0; i < pool.current.length; i++) {
      const p = pool.current[i]!;
      if (!p.alive) continue;
      p.life += d;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      p.vy -= p.gravity * d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      p.z += p.vz * d;
      const t = 1 - p.life / p.maxLife;
      const s = p.size * (0.4 + t * 0.9);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      im.setMatrixAt(visible, dummy.matrix);
      color.setRGB(p.r, p.g, p.b);
      im.setColorAt(visible, color);
      visible++;
      if (visible >= maxVis) break;
    }
    dummy.scale.setScalar(0);
    dummy.position.set(0, -99, 0);
    dummy.updateMatrix();
    for (let i = visible; i < maxVis; i++) {
      im.setMatrixAt(i, dummy.matrix);
      color.setRGB(0, 0, 0);
      im.setColorAt(i, color);
    }
    im.count = maxVis;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  const trailGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const colors = new Float32Array(48 * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [trailPos]);

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.92} />
      </instancedMesh>
      <points ref={trailMesh} geometry={trailGeo} frustumCulled={false}>
        <pointsMaterial
          size={0.06}
          vertexColors
          transparent
          opacity={0.85}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </>
  );
}
