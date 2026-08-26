import { create } from "zustand";

export type WeaponId = "cue" | "club" | "trebuchet";
export type Phase = "boot" | "menu" | "playing" | "hole-complete" | "course-complete" | "paused";
export type TrackingMode = "off" | "camera" | "xr";
export type ShotState = "idle" | "aiming" | "charging" | "ready" | "flying" | "sunk";
export type PlayMode = "stroke" | "chain";

export type QueuedShot = {
  id: string;
  weapon: WeaponId;
  yaw: number;
  pitch: number;
  power: number;
  impulse: number;
  loft: number;
  velocity: { x: number; y: number; z: number };
  origin: { x: number; y: number; z: number };
  rest: { x: number; y: number; z: number };
  path: { x: number; y: number; z: number }[];
  sunk: boolean;
};

export type TrackingSnapshot = {
  hands: {
    left: HandPose | null;
    right: HandPose | null;
  };
  face: FacePose | null;
  updatedAt: number;
};

export type HandPose = {
  /** Palm center in normalized image coords 0-1 (mirrored for selfie) */
  x: number;
  y: number;
  /** Pinch strength 0-1 */
  pinch: number;
  /** Openness 0-1 */
  open: number;
  /** Wrist→middle knuckle direction in screen space */
  dirX: number;
  dirY: number;
  /** Confidence */
  score: number;
};

export type FacePose = {
  x: number;
  y: number;
  /** Approximate head yaw / pitch from landmarks, -1..1 */
  yaw: number;
  pitch: number;
  mouthOpen: number;
};

export type GameStats = {
  strokes: number;
  totalStrokes: number;
  par: number;
  hole: number;
  holesCompleted: number;
  bestStreak: number;
};

export const WEAPON_IDS: WeaponId[] = ["cue", "club", "trebuchet"];

export type WeaponUses = Record<WeaponId, number>;

export function rollWeaponUses(): WeaponUses {
  let uses: WeaponUses;
  do {
    uses = {
      cue: Math.floor(Math.random() * 3),
      club: Math.floor(Math.random() * 3),
      trebuchet: Math.floor(Math.random() * 3),
    };
  } while (uses.cue + uses.club + uses.trebuchet < 3);
  return uses;
}

export function pickArmedWeapon(uses: WeaponUses, preferred?: WeaponId): WeaponId {
  if (preferred && uses[preferred] > 0) return preferred;
  for (const id of WEAPON_IDS) {
    if (uses[id] > 0) return id;
  }
  return preferred ?? "cue";
}

export const WEAPON_META: Record<
  WeaponId,
  { label: string; blurb: string; maxImpulse: number }
> = {
  cue: {
    label: "Pool Cue",
    blurb: "Flat strike — pull back like a real cue stroke",
    maxImpulse: 13,
  },
  club: {
    label: "Golf Club",
    blurb: "Lofted swing — draw back then release through the ball",
    maxImpulse: 10.75,
  },
  trebuchet: {
    label: "Trebuchet",
    blurb: "Sling under the ball — cock the arm, then Hit now",
    maxImpulse: 21,
  },
};

type GameStore = {
  phase: Phase;
  weapon: WeaponId;
  shot: ShotState;
  power: number;
  aimYaw: number;
  aimPitch: number;
  /** Ball selected for a shot — camera focuses; drag to strike */
  ballSelected: boolean;
  /** 0..1 strike flourish after release (weapon anim) */
  strikeT: number;
  stats: GameStats;
  trackingMode: TrackingMode;
  trackingReady: boolean;
  tracking: TrackingSnapshot;
  message: string;
  lastHoleStrokes: number;
  audioEnabled: boolean;
  showHelp: boolean;
  mobile: boolean;
  lowPower: boolean;
  /** Incremented when HUD / keyboard asks to strike the locked shot */
  hitSerial: number;
  /** Remaining uses for this hole (0–2 each, at least 3 total) */
  weaponUses: WeaponUses;
  /** Snapshot of the hole's rolled kit (for redo) */
  weaponUsesHole: WeaponUses;
  playMode: PlayMode;
  chain: QueuedShot[];
  chainPlaying: boolean;
  chainPlayIndex: number;
  /** Ghost-aim origin while setting up later chain shots */
  chainSetupOrigin: { x: number; y: number; z: number } | null;
  /** Index of the shot being retuned (chain truncated after it). */
  editingIndex: number | null;
  lockSerial: number;
  chainPlaySerial: number;

  setPhase: (phase: Phase) => void;
  setWeapon: (weapon: WeaponId) => void;
  setShot: (shot: ShotState) => void;
  setPower: (power: number) => void;
  setAim: (yaw: number, pitch?: number) => void;
  setBallSelected: (v: boolean) => void;
  setStrikeT: (t: number) => void;
  setTrackingMode: (mode: TrackingMode) => void;
  setTrackingReady: (ready: boolean) => void;
  setTracking: (snap: Partial<TrackingSnapshot>) => void;
  setMessage: (msg: string) => void;
  setShowHelp: (v: boolean) => void;
  setMobile: (v: boolean) => void;
  setLowPower: (v: boolean) => void;
  setAudioEnabled: (v: boolean) => void;
  startCourse: () => void;
  registerStroke: () => void;
  completeHole: (par: number) => void;
  nextHole: () => void;
  resetShotIdle: () => void;
  restoreHoleUses: () => void;
  resetCourse: () => void;
  requestHit: () => void;
  setPlayMode: (mode: PlayMode) => void;
  lockChainShot: (shot: QueuedShot) => void;
  undoChainShot: () => void;
  editChainShot: (index: number) => void;
  clearChain: () => void;
  requestLockShot: () => void;
  requestChainPlay: () => void;
  startChainPlay: () => boolean;
  advanceChainPlay: () => boolean;
  finishChainPlay: () => void;
  equipWeapon: (weapon: WeaponId) => void;
};

const initialStats: GameStats = {
  strokes: 0,
  totalStrokes: 0,
  par: 3,
  hole: 1,
  holesCompleted: 0,
  bestStreak: 0,
};

const emptyTracking: TrackingSnapshot = {
  hands: { left: null, right: null },
  face: null,
  updatedAt: 0,
};

const initialUses = rollWeaponUses();

function copyV(v: { x: number; y: number; z: number }) {
  return { x: v.x, y: v.y, z: v.z };
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: "menu",
  weapon: pickArmedWeapon(initialUses, "cue"),
  shot: "idle",
  power: 0,
  aimYaw: 0,
  aimPitch: 0.08,
  ballSelected: false,
  strikeT: 0,
  stats: { ...initialStats },
  trackingMode: "off",
  trackingReady: false,
  tracking: emptyTracking,
  message: "Pick a weapon and sink the cup",
  lastHoleStrokes: 0,
  audioEnabled: true,
  showHelp: false,
  mobile: false,
  lowPower: false,
  hitSerial: 0,
  weaponUses: initialUses,
  weaponUsesHole: { ...initialUses },
  playMode: "stroke",
  chain: [],
  chainPlaying: false,
  chainPlayIndex: 0,
  chainSetupOrigin: null,
  editingIndex: null,
  lockSerial: 0,
  chainPlaySerial: 0,

  setPhase: (phase) => set({ phase }),
  setWeapon: (weapon) => {
    const uses = get().weaponUses[weapon];
    if (uses <= 0) {
      set({ message: `No uses left on ${WEAPON_META[weapon].label}` });
      return;
    }
    set({ weapon });
  },
  setShot: (shot) => set({ shot }),
  setPower: (power) => set({ power: Math.max(0, Math.min(1, power)) }),
  setAim: (yaw, pitch) =>
    set((s) => ({
      aimYaw: yaw,
      aimPitch: pitch ?? s.aimPitch,
    })),
  setBallSelected: (ballSelected) => set({ ballSelected }),
  setStrikeT: (strikeT) => set({ strikeT: Math.max(0, Math.min(1, strikeT)) }),
  setTrackingMode: (trackingMode) => set({ trackingMode }),
  setTrackingReady: (trackingReady) => set({ trackingReady }),
  setTracking: (snap) =>
    set((s) => ({
      tracking: {
        hands: snap.hands ?? s.tracking.hands,
        face: snap.face === undefined ? s.tracking.face : snap.face,
        updatedAt: snap.updatedAt ?? performance.now(),
      },
    })),
  setMessage: (message) => set({ message }),
  setShowHelp: (showHelp) => set({ showHelp }),
  setMobile: (mobile) => set({ mobile }),
  setLowPower: (lowPower) => set({ lowPower }),
  setAudioEnabled: (audioEnabled) => set({ audioEnabled }),

  startCourse: () => {
    const existing = get().weaponUses;
    const sum = existing.cue + existing.club + existing.trebuchet;
    const uses = sum >= 3 ? { ...existing } : rollWeaponUses();
    set({
      phase: "playing",
      shot: "idle",
      power: 0,
      ballSelected: false,
      strikeT: 0,
      stats: { ...initialStats },
      weaponUses: uses,
      weaponUsesHole: { ...uses },
      weapon: pickArmedWeapon(uses, get().weapon),
      message: get().playMode === "chain"
        ? "Chain mode — set a shot, then another at the landing"
        : "Click the ball to take your shot",
      lastHoleStrokes: 0,
      chain: [],
      chainPlaying: false,
      chainPlayIndex: 0,
      chainSetupOrigin: null,
      editingIndex: null,
    });
  },

  registerStroke: () =>
    set((s) => {
      const consume = !(s.playMode === "chain" && s.chainPlaying);
      const left = consume ? Math.max(0, s.weaponUses[s.weapon] - 1) : s.weaponUses[s.weapon];
      const uses = consume ? { ...s.weaponUses, [s.weapon]: left } : s.weaponUses;
      return {
        stats: {
          ...s.stats,
          strokes: s.stats.strokes + 1,
          totalStrokes: s.stats.totalStrokes + 1,
        },
        shot: "flying" as const,
        power: 0,
        weaponUses: uses,
      };
    }),

  completeHole: (par) => {
    const { stats } = get();
    const strokes = stats.strokes || 1;
    const under = Math.max(0, par - strokes);
    set({
      phase: stats.hole >= 3 ? "course-complete" : "hole-complete",
      shot: "sunk",
      ballSelected: false,
      strikeT: 0,
      chainPlaying: false,
      lastHoleStrokes: strokes,
      stats: {
        ...stats,
        holesCompleted: stats.holesCompleted + 1,
        bestStreak: Math.max(stats.bestStreak, under),
      },
      message:
        stats.hole >= 3
          ? "Course complete"
          : strokes === 1
            ? "Hole in one"
            : strokes <= par
              ? "Nice putt"
              : "In the cup",
    });
  },

  nextHole: () => {
    const { stats } = get();
    const next = stats.hole + 1;
    const par = next === 2 ? 4 : next === 3 ? 5 : 3;
    const uses = rollWeaponUses();
    set({
      phase: "playing",
      shot: "idle",
      power: 0,
      ballSelected: false,
      strikeT: 0,
      weaponUses: uses,
      weaponUsesHole: { ...uses },
      weapon: pickArmedWeapon(uses, get().weapon),
      stats: {
        ...stats,
        hole: next,
        strokes: 0,
        par,
      },
      chain: [],
      chainPlaying: false,
      chainPlayIndex: 0,
      chainSetupOrigin: null,
      editingIndex: null,
      message:
        get().playMode === "chain"
          ? `Hole ${next} — set your trick chain`
          : `Hole ${next} — click the ball to play`,
    });
  },

  resetShotIdle: () => {
    const s = get();
    set({
      shot: "idle",
      power: 0,
      strikeT: 0,
      weapon: pickArmedWeapon(s.weaponUses, s.weapon),
    });
  },

  restoreHoleUses: () =>
    set((s) => ({
      weaponUses: { ...s.weaponUsesHole },
      weapon: pickArmedWeapon(s.weaponUsesHole, s.weapon),
      chain: [],
      chainPlaying: false,
      chainPlayIndex: 0,
      chainSetupOrigin: null,
      editingIndex: null,
    })),

  requestHit: () => {
    const s = get();
    if (!(s.playMode === "chain" && s.chainPlaying) && s.weaponUses[s.weapon] <= 0) {
      set({ message: `No uses left on ${WEAPON_META[s.weapon].label}` });
      return;
    }
    set({ hitSerial: s.hitSerial + 1 });
  },

  resetCourse: () => {
    const uses = rollWeaponUses();
    set({
      phase: "menu",
      shot: "idle",
      power: 0,
      ballSelected: false,
      strikeT: 0,
      stats: { ...initialStats },
      weaponUses: uses,
      weaponUsesHole: { ...uses },
      weapon: pickArmedWeapon(uses),
      message: "Pick a weapon and sink the cup",
      lastHoleStrokes: 0,
      chain: [],
      chainPlaying: false,
      chainPlayIndex: 0,
      chainSetupOrigin: null,
      editingIndex: null,
    });
  },

  setPlayMode: (playMode) =>
    set({
      playMode,
      chain: [],
      chainPlaying: false,
      chainPlayIndex: 0,
      chainSetupOrigin: null,
      editingIndex: null,
    }),

  equipWeapon: (weapon) => set({ weapon }),

  requestLockShot: () => set((s) => ({ lockSerial: s.lockSerial + 1 })),

  requestChainPlay: () => set((s) => ({ chainPlaySerial: s.chainPlaySerial + 1 })),

  lockChainShot: (shot) => {
    const s = get();
    if (s.weaponUses[shot.weapon] <= 0) {
      set({ message: `No uses left on ${WEAPON_META[shot.weapon].label}` });
      return;
    }
    const uses = {
      ...s.weaponUses,
      [shot.weapon]: Math.max(0, s.weaponUses[shot.weapon] - 1),
    };
    const frozen: QueuedShot = {
      ...shot,
      velocity: copyV(shot.velocity),
      origin: copyV(shot.origin),
      rest: copyV(shot.rest),
      path: shot.path.map(copyV),
    };
    const chain = [...s.chain, frozen];
    const remaining = uses.cue + uses.club + uses.trebuchet;
    set({
      chain,
      weaponUses: uses,
      chainSetupOrigin: copyV(frozen.rest),
      weapon: pickArmedWeapon(uses, shot.weapon),
      power: 0,
      shot: "idle",
      strikeT: 0,
      ballSelected: true,
      editingIndex: null,
      message: frozen.sunk
        ? `Shot ${chain.length} sinks — press Hit ball to play the chain`
        : remaining <= 0
          ? `Shot ${chain.length} locked — press Hit ball`
          : `Shot ${chain.length} locked — aim the next hit at the landing (tap a number to go back)`,
    });
  },

  undoChainShot: () => {
    const s = get();
    if (s.chainPlaying || s.chain.length === 0) return;
    const last = s.chain[s.chain.length - 1]!;
    const chain = s.chain.slice(0, -1);
    const uses = {
      ...s.weaponUses,
      [last.weapon]: Math.min(2, s.weaponUses[last.weapon] + 1),
    };
    set({
      chain,
      weaponUses: uses,
      weapon: last.weapon,
      chainSetupOrigin: copyV(last.origin),
      power: last.power,
      aimYaw: last.yaw,
      aimPitch: last.pitch,
      shot: "ready",
      ballSelected: true,
      editingIndex: chain.length,
      message: `Editing shot ${chain.length + 1} — retune, then Set shot`,
    });
  },

  editChainShot: (index) => {
    const s = get();
    if (s.chainPlaying) return;
    if (index < 0 || index >= s.chain.length) return;
    const target = s.chain[index]!;
    const uses = { ...s.weaponUses };
    for (let i = index; i < s.chain.length; i++) {
      const w = s.chain[i]!.weapon;
      uses[w] = Math.min(2, uses[w] + 1);
    }
    const kept = s.chain.slice(0, index);
    const dropped = s.chain.length - 1 - index;
    set({
      chain: kept,
      weaponUses: uses,
      chainSetupOrigin: copyV(target.origin),
      weapon: target.weapon,
      aimYaw: target.yaw,
      aimPitch: target.pitch,
      power: target.power,
      shot: "ready",
      ballSelected: true,
      chainPlaying: false,
      chainPlayIndex: 0,
      editingIndex: index,
      message:
        dropped > 0
          ? `Editing shot ${index + 1} — later shots cleared because their landings moved`
          : `Editing shot ${index + 1} — retune, then Set shot`,
    });
  },

  clearChain: () =>
    set((s) => ({
      chain: [],
      chainPlaying: false,
      chainPlayIndex: 0,
      chainSetupOrigin: null,
      editingIndex: null,
      weaponUses: s.phase === "playing" ? { ...s.weaponUsesHole } : s.weaponUses,
      weapon: pickArmedWeapon(
        s.phase === "playing" ? s.weaponUsesHole : s.weaponUses,
        s.weapon,
      ),
    })),

  startChainPlay: () => {
    const s = get();
    if (s.chain.length === 0) {
      set({ message: "Set at least one shot, then press Hit ball" });
      return false;
    }
    const first = s.chain[0]!;
    set({
      chainPlaying: true,
      chainPlayIndex: 0,
      chainSetupOrigin: null,
      editingIndex: null,
      ballSelected: true,
      weapon: first.weapon,
      aimYaw: first.yaw,
      aimPitch: first.pitch,
      power: first.power,
      shot: "ready",
      strikeT: 0,
      message: `Hitting 1 / ${s.chain.length}`,
    });
    return true;
  },

  advanceChainPlay: () => {
    const s = get();
    const next = s.chainPlayIndex + 1;
    if (!s.chainPlaying || next >= s.chain.length) return false;
    const q = s.chain[next]!;
    set({
      chainPlayIndex: next,
      weapon: q.weapon,
      aimYaw: q.yaw,
      aimPitch: q.pitch,
      power: q.power,
      ballSelected: true,
      shot: "ready",
      strikeT: 0,
      message: `Hitting ${next + 1} / ${s.chain.length}`,
    });
    return true;
  },

  finishChainPlay: () => {
    const s = get();
    const last = s.chain[s.chain.length - 1];
    set({
      chainPlaying: false,
      chainPlayIndex: 0,
      chainSetupOrigin: last ? copyV(last.rest) : null,
      power: 0,
      strikeT: 0,
      shot: "idle",
      ballSelected: false,
      message: "Chain finished — tap a shot number or landing ghost to edit and replay",
    });
  },
}));
