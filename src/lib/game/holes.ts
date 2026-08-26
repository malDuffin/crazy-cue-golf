export type Vec3 = { x: number; y: number; z: number };

export type HoleDef = {
  id: number;
  name: string;
  par: number;
  tee: Vec3;
  cup: Vec3;
  /** Camera look target bias */
  camFocus: Vec3;
  description: string;
};

/** Tabletop course along +Z; origin at table center. Felt y ≈ 0. */
export const HOLES: HoleDef[] = [
  {
    id: 1,
    name: "Warm-up Run",
    par: 3,
    tee: { x: -0.2, y: 0.12, z: -2.6 },
    cup: { x: 0.15, y: 0.02, z: -0.35 },
    camFocus: { x: 0, y: 0.2, z: -1.4 },
    description: "Gentle ramps into a tucked cup. Perfect for cue practice.",
  },
  {
    id: 2,
    name: "Windmill Alley",
    par: 4,
    tee: { x: 0.1, y: 0.12, z: 0.55 },
    cup: { x: -0.25, y: 0.02, z: 2.45 },
    camFocus: { x: 0, y: 0.35, z: 1.5 },
    description: "Time the spinning sails or lob over them with the club.",
  },
  {
    id: 3,
    name: "Loop & Drop",
    par: 5,
    tee: { x: 0.9, y: 0.12, z: 2.9 },
    cup: { x: -1.15, y: 0.02, z: 3.55 },
    camFocus: { x: -0.2, y: 0.5, z: 3.3 },
    description: "Half-pipe launch, high bank, and a cheeky side cup.",
  },
];

export type StaticBox = {
  pos: Vec3;
  half: Vec3;
  rotY?: number;
  rotX?: number;
  kind: "felt" | "wood" | "rail" | "ramp" | "block" | "accent";
};

/** Tabletop felt half-extents. Full board is 2× this; largest side drives trebuchet max range. */
export const FELT_HALF = { x: 1.7, y: 0.06, z: 3.6 } as const;

export function courseLargestSide(): number {
  return Math.max(FELT_HALF.x, FELT_HALF.z) * 2;
}

/** Shared static colliders for the whole tabletop (visuals mirror these). */
export function buildCourseColliders(): StaticBox[] {
  const boxes: StaticBox[] = [];

  // Main felt board
  boxes.push({
    pos: { x: 0, y: -0.06, z: 0.5 },
    half: { x: FELT_HALF.x, y: FELT_HALF.y, z: FELT_HALF.z },
    kind: "felt",
  });

  // Outer wood rails — tall enough to keep the ball in play
  const railH = 0.16;
  const railT = 0.1;
  boxes.push({
    pos: { x: -1.8, y: railH / 2, z: 0.5 },
    half: { x: railT, y: railH, z: 3.75 },
    kind: "rail",
  });
  boxes.push({
    pos: { x: 1.8, y: railH / 2, z: 0.5 },
    half: { x: railT, y: railH, z: 3.75 },
    kind: "rail",
  });
  boxes.push({
    pos: { x: 0, y: railH / 2, z: -3.2 },
    half: { x: 1.9, y: railH, z: railT },
    kind: "rail",
  });
  boxes.push({
    pos: { x: 0, y: railH / 2, z: 4.2 },
    half: { x: 1.9, y: railH, z: railT },
    kind: "rail",
  });

  // Hole 1 features
  boxes.push({
    pos: { x: -0.55, y: 0.08, z: -1.9 },
    half: { x: 0.55, y: 0.02, z: 0.35 },
    rotX: -0.28,
    kind: "ramp",
  });
  boxes.push({
    pos: { x: 0.45, y: 0.06, z: -1.2 },
    half: { x: 0.35, y: 0.12, z: 0.12 },
    kind: "block",
  });
  boxes.push({
    pos: { x: -0.1, y: 0.05, z: -0.7 },
    half: { x: 0.5, y: 0.02, z: 0.28 },
    rotX: 0.18,
    kind: "ramp",
  });

  // Hole 2 banks + channel
  boxes.push({
    pos: { x: -0.85, y: 0.12, z: 1.2 },
    half: { x: 0.12, y: 0.14, z: 0.7 },
    kind: "block",
  });
  boxes.push({
    pos: { x: 0.85, y: 0.12, z: 1.2 },
    half: { x: 0.12, y: 0.14, z: 0.7 },
    kind: "block",
  });
  boxes.push({
    pos: { x: 0, y: 0.07, z: 1.85 },
    half: { x: 0.7, y: 0.02, z: 0.4 },
    rotX: -0.22,
    kind: "ramp",
  });
  boxes.push({
    pos: { x: 0.35, y: 0.14, z: 2.2 },
    half: { x: 0.18, y: 0.16, z: 0.18 },
    kind: "accent",
  });

  // Hole 3 half-pipe walls + high bank
  boxes.push({
    pos: { x: 1.15, y: 0.22, z: 3.15 },
    half: { x: 0.1, y: 0.28, z: 0.55 },
    rotY: 0.15,
    kind: "block",
  });
  boxes.push({
    pos: { x: 0.35, y: 0.18, z: 3.4 },
    half: { x: 0.55, y: 0.02, z: 0.35 },
    rotX: -0.45,
    kind: "ramp",
  });
  boxes.push({
    pos: { x: -0.55, y: 0.28, z: 3.55 },
    half: { x: 0.45, y: 0.02, z: 0.35 },
    rotX: 0.35,
    kind: "ramp",
  });
  boxes.push({
    pos: { x: -1.05, y: 0.16, z: 3.9 },
    half: { x: 0.25, y: 0.18, z: 0.12 },
    kind: "block",
  });

  // Divider hole 1 / 2 with gate gap
  boxes.push({
    pos: { x: -1.05, y: 0.08, z: 0.2 },
    half: { x: 0.45, y: 0.1, z: 0.06 },
    kind: "wood",
  });
  boxes.push({
    pos: { x: 1.05, y: 0.08, z: 0.2 },
    half: { x: 0.45, y: 0.1, z: 0.06 },
    kind: "wood",
  });

  // Divider hole 2 / 3
  boxes.push({
    pos: { x: -1.0, y: 0.08, z: 2.7 },
    half: { x: 0.5, y: 0.1, z: 0.06 },
    kind: "wood",
  });
  boxes.push({
    pos: { x: 1.05, y: 0.08, z: 2.7 },
    half: { x: 0.45, y: 0.1, z: 0.06 },
    kind: "wood",
  });

  return boxes;
}

export function getHole(index: number): HoleDef {
  return HOLES[Math.max(0, Math.min(HOLES.length - 1, index - 1))]!;
}
