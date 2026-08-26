/** Presentation-only juice — never mutates gameplay simulation. */

export type JuiceEvent =
  | { type: "hit"; power: number; x: number; y: number; z: number }
  | { type: "bounce"; x: number; y: number; z: number; speed: number }
  | { type: "sink"; x: number; y: number; z: number; strokes: number }
  | { type: "charge"; power: number }
  | { type: "oob" }
  | { type: "confetti" };

type Listener = (e: JuiceEvent) => void;

const listeners = new Set<Listener>();

export const juiceBus = {
  emit(e: JuiceEvent) {
    for (const l of listeners) l(e);
  },
  on(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Trauma-based screenshake state (trauma² amplitude). */
export class TraumaShake {
  trauma = 0;
  decay = 1.6;
  maxOffset = 0.12;
  maxRoll = 0.04;
  reduced = false;

  add(amount: number) {
    if (this.reduced) amount *= 0.25;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number) {
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
  }

  sample(t: number): { ox: number; oy: number; oz: number; roll: number } {
    const s = this.trauma * this.trauma;
    if (s < 0.0001) return { ox: 0, oy: 0, oz: 0, roll: 0 };
    const n1 = Math.sin(t * 37.1) * Math.cos(t * 23.7);
    const n2 = Math.sin(t * 19.3 + 1.7) * Math.cos(t * 41.2);
    const n3 = Math.sin(t * 29.9 + 0.4);
    return {
      ox: this.maxOffset * s * n1,
      oy: this.maxOffset * s * n2 * 0.6,
      oz: this.maxOffset * s * n3 * 0.4,
      roll: this.maxRoll * s * n2,
    };
  }
}

export function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function expLerp(current: number, target: number, k: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-k * dt));
}
