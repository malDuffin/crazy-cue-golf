import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/game/store";

/**
 * Local +Z is the fire/aim direction. The group sits on the ball.
 * Cue: tip on the ball at 0 power, pulls back along −Z with power.
 * Club: iron head on the ball surface at 0 power, head draws back with power.
 * Trebuchet: pouch cups the ball at 0 power; arm cocks back with power.
 */
export function WeaponPreview({
  ballPos,
  yaw,
}: {
  ballPos: THREE.Vector3;
  yaw: number;
}) {
  const weapon = useGameStore((s) => s.weapon);
  const shot = useGameStore((s) => s.shot);
  const power = useGameStore((s) => s.power);
  const strikeT = useGameStore((s) => s.strikeT);
  const ballSelected = useGameStore((s) => s.ballSelected);
  const uses = useGameStore((s) => s.weaponUses[s.weapon]);
  const chainPlaying = useGameStore((s) => s.chainPlaying);
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const armed =
      uses > 0 ||
      chainPlaying ||
      strikeT > 0.01 ||
      shot === "charging" ||
      shot === "flying";
    const show =
      ballSelected &&
      armed &&
      (shot === "idle" ||
        shot === "aiming" ||
        shot === "charging" ||
        shot === "ready" ||
        strikeT > 0.01);
    group.current.visible = show;
    if (!show) return;

    const baseGap = weapon === "cue" ? 0.1 : 0;
    const pullBack = weapon === "cue" ? power * 0.38 : 0;
    const gap = baseGap + pullBack;
    const ox = -Math.sin(yaw) * gap;
    const oz = -Math.cos(yaw) * gap;
    group.current.position.set(ballPos.x + ox, ballPos.y, ballPos.z + oz);
    group.current.rotation.order = "YXZ";
    group.current.rotation.y = yaw;
    group.current.rotation.x = 0;
    group.current.rotation.z = 0;

    if (weapon === "cue" && shot === "idle" && power < 0.01 && strikeT < 0.01) {
      group.current.position.y = ballPos.y + Math.sin(clock.elapsedTime * 2.2) * 0.008;
    }
  });

  return (
    <group ref={group} userData={{ weapon: true }}>
      {weapon === "cue" && (
        <mesh
          userData={{ weapon: true, cueOrb: true }}
          position={[0, 0.04, -0.62]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.09, 0.09, 1.15, 10]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {weapon === "club" && (
        <mesh userData={{ weapon: true }} position={[0.02, 0.28, -0.22]}>
          <boxGeometry args={[0.32, 0.95, 0.55]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {weapon === "trebuchet" && (
        <mesh userData={{ weapon: true }} position={[0, 0.08, 0.06]} scale={0.48}>
          <boxGeometry args={[0.7, 0.75, 1.2]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {weapon === "cue" && <CueMesh power={power} strikeT={strikeT} />}
      {weapon === "club" && <ClubMesh power={power} strikeT={strikeT} />}
      {weapon === "trebuchet" && <TrebuchetMesh power={power} strikeT={strikeT} />}
    </group>
  );
}

function CueMesh({ power, strikeT }: { power: number; strikeT: number }) {
  const thrust = strikeT > 0 ? Math.sin(strikeT * Math.PI) * 0.28 : 0;
  const tipOffset = 0.52 - thrust;

  return (
    <group rotation={[0.03, 0, 0]} position={[0, 0.02, -tipOffset]}>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 1.15, 12]} />
        <meshStandardMaterial color="#e8d4b0" roughness={0.45} metalness={0.05} />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.28]}>
        <cylinderGeometry args={[0.014, 0.016, 0.22, 12]} />
        <meshStandardMaterial color="#c9a46a" roughness={0.5} />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.52]}>
        <cylinderGeometry args={[0.011, 0.012, 0.04, 10]} />
        <meshStandardMaterial color="#f4f0e8" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.56]}>
        <cylinderGeometry args={[0.009, 0.011, 0.02, 10]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.575]}>
        <sphereGeometry args={[0.01, 10, 8]} />
        <meshStandardMaterial color="#5a4030" roughness={0.9} />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.38]}>
        <cylinderGeometry args={[0.017, 0.018, 0.28, 12]} />
        <meshStandardMaterial color="#1a2430" roughness={0.75} />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.58]}>
        <cylinderGeometry args={[0.02, 0.016, 0.18, 12]} />
        <meshStandardMaterial color="#3d2412" roughness={0.55} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0, -0.68]}>
        <sphereGeometry args={[0.02, 10, 8]} />
        <meshStandardMaterial color="#2a1810" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

function ClubMesh({ power, strikeT }: { power: number; strikeT: number }) {
  // Grip is the pivot, above and behind the ball. At 0 power the iron
  // sits on the back of the ball (local −Z = opposite aim). Power cocks
  // the club back in the aim plane; the face stays toward +Z.
  const back = power * 1.15;
  const swing =
    strikeT > 0
      ? THREE.MathUtils.lerp(back, -0.55, Math.min(1, strikeT * 1.35))
      : back;

  return (
    <group position={[0.02, 0.585, -0.06]} rotation={[swing, 0, 0]}>
      <mesh castShadow position={[0, -0.07, 0]}>
        <cylinderGeometry args={[0.015, 0.014, 0.15, 8]} />
        <meshStandardMaterial color="#1a1814" roughness={0.92} />
      </mesh>
      <mesh castShadow position={[0, -0.34, 0]}>
        <cylinderGeometry args={[0.01, 0.014, 0.42, 8]} />
        <meshStandardMaterial color="#d0d6de" roughness={0.28} metalness={0.5} />
      </mesh>
      <mesh castShadow position={[0, -0.56, 0]}>
        <cylinderGeometry args={[0.009, 0.011, 0.05, 8]} />
        <meshStandardMaterial color="#b8c0c8" roughness={0.35} metalness={0.65} />
      </mesh>
      <mesh castShadow position={[0, -0.595, 0.006]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[0.072, 0.036, 0.022]} />
        <meshStandardMaterial
          color="#c5cdd6"
          roughness={0.28}
          metalness={0.72}
          flatShading
        />
      </mesh>
    </group>
  );
}

function TrebuchetMesh({ power, strikeT }: { power: number; strikeT: number }) {
  // Power 0: pouch cups the ball. Power cocks the arm back along the
  // throw (pouch lifts up and away). Hit snaps the arm through +Z.
  const cock = power * 1.05;
  const snap = strikeT > 0 ? Math.sin(strikeT * Math.PI) * 1.65 : 0;
  const armAngle = cock - snap;

  const pivotY = 0.38;
  const pivotZ = 0.16;
  const slingY = -0.4;
  const slingZ = -0.16;
  const armLen = Math.hypot(slingY, slingZ);
  const armTilt = Math.atan2(-slingZ, -slingY);
  const cwLen = 0.22;

  return (
    <group scale={0.48}>
      <mesh castShadow position={[0.13, -0.042, 0.48]} receiveShadow>
        <boxGeometry args={[0.038, 0.03, 0.92]} />
        <meshStandardMaterial color="#6b4226" roughness={0.7} flatShading />
      </mesh>
      <mesh castShadow position={[-0.13, -0.042, 0.48]} receiveShadow>
        <boxGeometry args={[0.038, 0.03, 0.92]} />
        <meshStandardMaterial color="#6b4226" roughness={0.7} flatShading />
      </mesh>
      <mesh castShadow position={[0, -0.048, 0.9]}>
        <boxGeometry args={[0.32, 0.028, 0.07]} />
        <meshStandardMaterial color="#5a361c" roughness={0.65} flatShading />
      </mesh>
      <mesh castShadow position={[0, -0.048, 0.1]}>
        <boxGeometry args={[0.32, 0.028, 0.07]} />
        <meshStandardMaterial color="#5a361c" roughness={0.65} flatShading />
      </mesh>
      <mesh castShadow position={[0.135, 0.16, 0.16]} rotation={[0.08, 0, 0.05]}>
        <boxGeometry args={[0.032, 0.4, 0.032]} />
        <meshStandardMaterial color="#7a4a28" roughness={0.6} flatShading />
      </mesh>
      <mesh castShadow position={[-0.135, 0.16, 0.16]} rotation={[0.08, 0, -0.05]}>
        <boxGeometry args={[0.032, 0.4, 0.032]} />
        <meshStandardMaterial color="#7a4a28" roughness={0.6} flatShading />
      </mesh>
      <mesh castShadow position={[0, 0.16, 0.32]} rotation={[0.45, 0, 0]}>
        <boxGeometry args={[0.028, 0.36, 0.028]} />
        <meshStandardMaterial color="#7a4a28" roughness={0.6} flatShading />
      </mesh>
      <mesh castShadow position={[0.12, 0.16, 0.32]} rotation={[0.45, 0, 0.08]}>
        <boxGeometry args={[0.026, 0.36, 0.026]} />
        <meshStandardMaterial color="#6e4224" roughness={0.62} flatShading />
      </mesh>
      <mesh castShadow position={[-0.12, 0.16, 0.32]} rotation={[0.45, 0, -0.08]}>
        <boxGeometry args={[0.026, 0.36, 0.026]} />
        <meshStandardMaterial color="#6e4224" roughness={0.62} flatShading />
      </mesh>
      <mesh castShadow position={[0, pivotY, pivotZ]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.3, 8]} />
        <meshStandardMaterial color="#3a2a1a" roughness={0.45} metalness={0.25} />
      </mesh>

      <group position={[0, pivotY, pivotZ]} rotation={[armAngle, 0, 0]}>
        <group rotation={[armTilt, 0, 0]}>
          <mesh castShadow position={[0, -armLen * 0.48, 0]}>
            <boxGeometry args={[0.034, armLen * 0.96, 0.034]} />
            <meshStandardMaterial color="#8a5a32" roughness={0.55} flatShading />
          </mesh>
          <mesh castShadow position={[0, cwLen, 0]}>
            <boxGeometry args={[0.028, cwLen * 1.7, 0.028]} />
            <meshStandardMaterial color="#8a5a32" roughness={0.55} flatShading />
          </mesh>
          <mesh castShadow position={[0, cwLen + 0.08, 0]}>
            <boxGeometry args={[0.13, 0.13, 0.13]} />
            <meshStandardMaterial
              color="#4a5560"
              roughness={0.4}
              metalness={0.35}
              flatShading
            />
          </mesh>
        </group>

        <mesh
          position={[0.028, slingY * 0.55, slingZ * 0.55]}
          rotation={[armTilt * 0.5, 0, 0.12]}
        >
          <cylinderGeometry args={[0.006, 0.006, armLen * 0.55, 6]} />
          <meshStandardMaterial color="#3a2418" roughness={0.8} />
        </mesh>
        <mesh
          position={[-0.028, slingY * 0.55, slingZ * 0.55]}
          rotation={[armTilt * 0.5, 0, -0.12]}
        >
          <cylinderGeometry args={[0.006, 0.006, armLen * 0.55, 6]} />
          <meshStandardMaterial color="#3a2418" roughness={0.8} />
        </mesh>

        <group position={[0, slingY, slingZ]}>
          <mesh castShadow scale={[1, 0.42, 1]} rotation={[0, 0, 0]}>
            <sphereGeometry
              args={[0.082, 14, 10, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.52]}
            />
            <meshStandardMaterial
              color="#6b3a22"
              roughness={0.75}
              side={THREE.DoubleSide}
              flatShading
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
            <torusGeometry args={[0.07, 0.008, 8, 16]} />
            <meshStandardMaterial color="#4a2814" roughness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export { weaponLoft } from "@/lib/game/shot";
