import { WEAPON_META, type WeaponId } from "@/lib/game/store";
import { shotVelocity } from "@/lib/physics/box3dWorld";
import type { Vec3 } from "@/lib/game/holes";

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
  return { velocity: shotVelocity(dir, impulse, loft), impulse, loft, dir };
}

let shotSeq = 0;
export function nextShotId(): string {
  shotSeq += 1;
  return `shot-${shotSeq}-${Date.now().toString(36)}`;
}
