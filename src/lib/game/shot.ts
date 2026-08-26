import { WEAPON_META, type WeaponId } from "@/lib/game/store";
import { PHYSICS_GRAVITY, shotVelocity } from "@/lib/physics/box3dWorld";
import { courseLargestSide, type Vec3 } from "@/lib/game/holes";

/** Loft used by preview, lock, and live fire — one source of truth. */
export function weaponLoft(id: WeaponId): number {
  switch (id) {
    case "cue":
      return 0.04;
    case "club":
      return 0.26;
    case "trebuchet":
      return 0.72;
    default:
      return 0.1;
  }
}

export function copyVec(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Trebuchet frame scale 0.48, rail front at local z ≈ 0.94 → ~0.45 world.
 * Min toss lands just past that nose so the ball pops up in front of the engine.
 */
const TREBUCHET_MIN_RANGE = 0.62;
const TREBUCHET_MIN_ANGLE = (78 * Math.PI) / 180;
const TREBUCHET_MAX_ANGLE = (50 * Math.PI) / 180;

function trebuchetVelocity(yaw: number, pitch: number, power: number): Vec3 {
  const pwr = Math.max(0, Math.min(1, power));
  const maxRange = courseLargestSide() * 0.75;
  const range = TREBUCHET_MIN_RANGE + pwr * (maxRange - TREBUCHET_MIN_RANGE);
  let angle =
    TREBUCHET_MIN_ANGLE + pwr * (TREBUCHET_MAX_ANGLE - TREBUCHET_MIN_ANGLE) + pitch * 0.18;
  angle = Math.min((84 * Math.PI) / 180, Math.max((38 * Math.PI) / 180, angle));
  const sin2 = Math.sin(2 * angle);
  const speed = Math.sqrt((range * PHYSICS_GRAVITY) / Math.max(0.18, sin2));
  const horiz = speed * Math.cos(angle);
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  return {
    x: nx * horiz,
    y: speed * Math.sin(angle),
    z: nz * horiz,
  };
}

export function computeShot(
  weapon: WeaponId,
  yaw: number,
  pitch: number,
  power: number,
): { velocity: Vec3; impulse: number; loft: number; dir: Vec3 } {
  const pwr = Math.max(0, Math.min(1, power));
  const loft = weaponLoft(weapon) * 0.85 + pitch * 0.2;
  const impulse = WEAPON_META[weapon].maxImpulse * (0.22 + pwr * 0.78);
  const dir = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  if (weapon === "trebuchet") {
    const velocity = trebuchetVelocity(yaw, pitch, pwr);
    return {
      velocity,
      impulse: Math.hypot(velocity.x, velocity.y, velocity.z),
      loft: Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)),
      dir,
    };
  }
  return { velocity: shotVelocity(dir, impulse, loft), impulse, loft, dir };
}

let shotSeq = 0;
export function nextShotId(): string {
  shotSeq += 1;
  return `shot-${shotSeq}-${Date.now().toString(36)}`;
}
