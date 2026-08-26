/**
 * Procedural audio — lounge bed + juiced SFX.
 * All Web Audio, no asset files. Mute via setMuted / audioEnabled.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;

let muted = false;
let musicOn = false;
let musicTimer = 0;
let nextStepTime = 0;
let musicStep = 0;

type AimVoice = {
  osc: OscillatorNode;
  fifth: OscillatorNode;
  sparkle: OscillatorNode;
  noise: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  noiseFilter: BiquadFilterNode;
  gain: GainNode;
  noiseGain: GainNode;
};
let aimVoice: AimVoice | null = null;
let lastPullPower = 0;
let lastAimYaw = 0;
let lastYawTickAt = 0;
let lastPowerTick = -1;
let lastCollisionAt = 0;

const BPM = 92;
const STEP = 60 / BPM / 2; // eighth notes

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 8;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.22;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);
  }
  return ctx;
}

function out() {
  getCtx();
  return sfxBus;
}

function musicOut() {
  getCtx();
  return musicBus;
}

export async function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") await c.resume();
}

export function setMuted(on: boolean) {
  muted = on;
  const c = getCtx();
  if (!c || !master) return;
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setTargetAtTime(on ? 0.0001 : 0.85, c.currentTime, 0.04);
  if (on) {
    stopAim();
    stopMusic();
  }
}

export function isMuted() {
  return muted;
}

function envGain(
  dest: AudioNode,
  peak: number,
  attack: number,
  decay: number,
  when: number,
) {
  const c = getCtx();
  if (!c) return null;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + Math.max(0.004, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  g.connect(dest);
  return g;
}

function osc(
  freq: number,
  type: OscillatorType,
  duration: number,
  gain: number,
  when = 0,
  dest?: AudioNode,
  slideTo?: number,
) {
  const c = getCtx();
  const bus = dest ?? out();
  if (!c || !bus) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
  }
  const g = envGain(bus, gain, 0.01, duration, t0);
  if (!g) return;
  o.connect(g);
  o.start(t0);
  o.stop(t0 + duration + 0.04);
}

function noiseBuf(seconds: number) {
  const c = getCtx();
  if (!c) return null;
  const n = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
  const d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return n;
}

function noiseBurst(
  duration: number,
  gain: number,
  when = 0,
  freq = 900,
  q = 0.7,
  type: BiquadFilterType = "bandpass",
  dest?: AudioNode,
) {
  const c = getCtx();
  const bus = dest ?? out();
  if (!c || !bus) return;
  const buf = noiseBuf(duration + 0.04);
  if (!buf) return;
  const t0 = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  f.Q.value = q;
  const g = envGain(bus, gain, 0.006, duration, t0);
  if (!g) return;
  src.connect(f);
  f.connect(g);
  src.start(t0);
  src.stop(t0 + duration + 0.03);
}

/* ---------------- live aim (direction + power) ---------------- */

function startAim() {
  const c = getCtx();
  const bus = out();
  if (!c || !bus || aimVoice || muted) return;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 720;
  filter.Q.value = 0.9;

  const gain = c.createGain();
  gain.gain.value = 0.0001;
  filter.connect(gain);
  gain.connect(bus);

  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 110;
  osc.connect(filter);
  osc.start();

  const fifth = c.createOscillator();
  fifth.type = "triangle";
  fifth.frequency.value = 165;
  fifth.connect(filter);
  fifth.start();

  const sparkle = c.createOscillator();
  sparkle.type = "sine";
  sparkle.frequency.value = 440;
  const sparkleGain = c.createGain();
  sparkleGain.gain.value = 0.35;
  sparkle.connect(sparkleGain);
  sparkleGain.connect(filter);
  sparkle.start();

  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.0001;
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 900;
  noiseFilter.Q.value = 0.7;
  noiseFilter.connect(noiseGain);
  noiseGain.connect(bus);

  const buf = noiseBuf(2);
  const noise = c.createBufferSource();
  if (buf) {
    noise.buffer = buf;
    noise.loop = true;
    noise.connect(noiseFilter);
    noise.start();
  }

  aimVoice = { osc, fifth, sparkle, noise, filter, noiseFilter, gain, noiseGain };
}

function stopAim() {
  const c = getCtx();
  if (!aimVoice) {
    lastPullPower = 0;
    lastPowerTick = -1;
    return;
  }
  const v = aimVoice;
  aimVoice = null;
  lastPullPower = 0;
  lastPowerTick = -1;
  if (c) {
    v.gain.gain.cancelScheduledValues(c.currentTime);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.1);
    v.noiseGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
  }
  window.setTimeout(() => {
    try {
      v.osc.stop();
      v.fifth.stop();
      v.sparkle.stop();
      v.noise.stop();
    } catch {
      /* already stopped */
    }
    v.osc.disconnect();
    v.fifth.disconnect();
    v.sparkle.disconnect();
    v.noise.disconnect();
    v.filter.disconnect();
    v.noiseFilter.disconnect();
    v.gain.disconnect();
    v.noiseGain.disconnect();
  }, 140);
}

const AIM_SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // pentatonic-ish over 2 octaves

function yawTick(yaw: number, power: number) {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (now - lastYawTickAt < 42) return;
  let dy = yaw - lastAimYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const speed = Math.abs(dy);
  if (speed < 0.018) return;
  lastYawTickAt = now;
  lastAimYaw = yaw;

  const wrapped = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const idx = Math.floor((wrapped / (Math.PI * 2)) * AIM_SCALE.length) % AIM_SCALE.length;
  const semitone = AIM_SCALE[idx]!;
  const freq = 392 * Math.pow(2, semitone / 12);
  const vol = 0.022 + Math.min(0.05, speed * 0.7) + power * 0.02;
  osc(freq, "sine", 0.055, vol);
  osc(freq * 2.01, "triangle", 0.04, vol * 0.35, 0.008);
  noiseBurst(0.03, 0.012 + speed * 0.04, 0, 1800 + power * 800, 1.1, "bandpass");
}

function powerStep(power: number) {
  const bucket = Math.floor(power * 8);
  if (bucket === lastPowerTick) return;
  if (bucket > lastPowerTick && power > 0.08) {
    const freq = 220 * Math.pow(2, bucket / 8);
    osc(freq, "sine", 0.05, 0.02 + power * 0.025);
    osc(freq * 1.5, "triangle", 0.04, 0.012 + power * 0.015, 0.01);
  }
  lastPowerTick = bucket;
}

function aimSet(power: number, yaw?: number) {
  if (muted) return;
  const p = Math.max(0, Math.min(1, power));
  if (yaw != null) yawTick(yaw, p);
  if (p < 0.025) {
    if (aimVoice) stopAim();
    return;
  }
  if (!aimVoice) startAim();
  const c = getCtx();
  const v = aimVoice;
  if (!c || !v) return;
  const t = c.currentTime;
  const fund = 98 * Math.pow(2, p * 1.55);
  v.osc.frequency.setTargetAtTime(fund, t, 0.045);
  v.fifth.frequency.setTargetAtTime(fund * 1.498, t, 0.045);
  v.sparkle.frequency.setTargetAtTime(fund * 3.99, t, 0.06);
  v.filter.frequency.setTargetAtTime(620 + p * 2800, t, 0.06);
  v.gain.gain.setTargetAtTime(0.016 + p * 0.075, t, 0.05);
  v.noiseFilter.frequency.setTargetAtTime(520 + p * 2200, t, 0.07);
  v.noiseGain.gain.setTargetAtTime(0.01 + p * 0.045, t, 0.06);
  powerStep(p);
  lastPullPower = p;
}

/* ---------------- music ---------------- */

function kick(when: number) {
  const dest = musicOut();
  if (!dest) return;
  osc(78, "sine", 0.18, 0.16, when, dest, 38);
  noiseBurst(0.04, 0.03, when, 180, 0.6, "lowpass", dest);
}

function hat(when: number, open = false) {
  const dest = musicOut();
  if (!dest) return;
  noiseBurst(open ? 0.09 : 0.035, open ? 0.045 : 0.028, when, open ? 9000 : 7000, 0.6, "highpass", dest);
}

function snare(when: number) {
  const dest = musicOut();
  if (!dest) return;
  noiseBurst(0.08, 0.05, when, 1800, 0.7, "bandpass", dest);
  osc(190, "triangle", 0.07, 0.03, when, dest, 90);
}

function bassNote(freq: number, when: number, dur = 0.28) {
  const dest = musicOut();
  if (!dest) return;
  osc(freq, "triangle", dur, 0.14, when, dest);
  osc(freq * 0.5, "sine", dur * 1.1, 0.09, when, dest);
}

function padChord(freqs: number[], when: number, dur = 1.6) {
  const dest = musicOut();
  if (!dest) return;
  for (const f of freqs) {
    osc(f, "sine", dur, 0.028, when, dest);
    osc(f * 2.005, "triangle", dur * 0.9, 0.012, when, dest);
  }
}

function lead(freq: number, when: number, dur = 0.22) {
  const dest = musicOut();
  if (!dest) return;
  osc(freq, "triangle", dur, 0.045, when, dest);
  osc(freq * 2, "sine", dur * 0.6, 0.012, when + 0.01, dest);
}

const BASS = [98, 98, 78, 87]; // G2 G2 D#2 F2
const CHORDS = [
  [196, 233, 294], // G3 Bb3 D4
  [196, 247, 294],
  [156, 196, 233],
  [175, 220, 262],
];
const MELODY = [392, 466, 523, 587, 698, 587, 523, 466];

function scheduleStep(step: number, whenAbs: number) {
  const c = getCtx();
  if (!c) return;
  const when = whenAbs - c.currentTime;
  if (when < -0.05) return;
  const bar = Math.floor(step / 8) % 4;
  const beat = step % 8;

  if (beat === 0) kick(when);
  if (beat === 4) snare(when);
  if (beat % 2 === 1) hat(when, beat === 7);
  else hat(when, false);

  if (beat === 0 || beat === 3 || beat === 6) {
    bassNote(BASS[bar]! * (beat === 6 ? 1.5 : 1), when, beat === 0 ? 0.42 : 0.22);
  }

  if (beat === 0) padChord(CHORDS[bar]!, when, 1.7);

  if ((step + bar) % 5 === 0 && beat !== 4) {
    const n = MELODY[(step + bar * 2) % MELODY.length]!;
    lead(n, when, 0.2);
  }
}

function musicLoop() {
  if (!musicOn) return;
  const c = getCtx();
  if (!c) return;
  const horizon = c.currentTime + 0.28;
  while (nextStepTime < horizon) {
    scheduleStep(musicStep, nextStepTime);
    musicStep = (musicStep + 1) % 32;
    nextStepTime += STEP;
  }
  musicTimer = window.setTimeout(musicLoop, 80);
}

export function startMusic() {
  if (muted) return;
  const c = getCtx();
  if (!c || musicOn) return;
  if (c.state === "suspended") void c.resume();
  musicOn = true;
  musicStep = 0;
  nextStepTime = c.currentTime + 0.05;
  if (musicBus) {
    musicBus.gain.cancelScheduledValues(c.currentTime);
    musicBus.gain.setTargetAtTime(0.22, c.currentTime, 0.25);
  }
  musicLoop();
}

export function stopMusic() {
  musicOn = false;
  if (musicTimer) {
    clearTimeout(musicTimer);
    musicTimer = 0;
  }
  const c = getCtx();
  if (c && musicBus) {
    musicBus.gain.cancelScheduledValues(c.currentTime);
    musicBus.gain.setTargetAtTime(0.0001, c.currentTime, 0.12);
  }
}

function duckMusic(amount = 0.45, ms = 280) {
  const c = getCtx();
  if (!c || !musicBus || !musicOn) return;
  const t = c.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0.22 * amount, t, 0.03);
  musicBus.gain.setTargetAtTime(0.22, t + ms / 1000, 0.18);
}

/* ---------------- public SFX ---------------- */

export const sfx = {
  /** Aim drag is silent — no looping pad or ticks. */
  pull(_power?: number, _yaw?: number) {
    stopAim();
  },
  aim(_power?: number, _yaw?: number) {
    stopAim();
  },
  pullEnd() {
    stopAim();
  },
  hit(power: number) {
    stopAim();
    const p = Math.max(0, Math.min(1, power));
    duckMusic(0.35, 220);
    // Leather tip crack
    noiseBurst(0.045, 0.09 + p * 0.1, 0, 2400, 1.1, "bandpass");
    osc(2100 + p * 400, "square", 0.03, 0.04 + p * 0.03);
    // Wood body thunk
    osc(78 + p * 40, "sine", 0.22, 0.16 + p * 0.12, 0, undefined, 42);
    osc(160 + p * 50, "triangle", 0.12, 0.07 + p * 0.05, 0.008, undefined, 70);
    // Felt whoosh
    noiseBurst(0.14 + p * 0.08, 0.05 + p * 0.05, 0.01, 500 + p * 400, 0.6, "lowpass");
  },
  bounce(speed: number) {
    this.collision(speed, "felt");
  },
  collision(impulse: number, kind: "felt" | "rail" | "windmill" = "rail") {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - lastCollisionAt < 70) return;
    lastCollisionAt = now;
    const p = Math.max(0.15, Math.min(1, impulse / 4.2));
    if (kind === "felt") {
      osc(140 + p * 80, "sine", 0.09, 0.05 + p * 0.05, 0, undefined, 70);
      noiseBurst(0.05, 0.03 + p * 0.03, 0, 400, 0.8, "lowpass");
    } else if (kind === "windmill") {
      osc(880 + p * 220, "triangle", 0.12, 0.06 + p * 0.04);
      osc(1320, "sine", 0.08, 0.03, 0.02);
      noiseBurst(0.04, 0.03, 0, 3000, 1.4, "bandpass");
    } else {
      // Rail / wood bank
      osc(220 + p * 160, "triangle", 0.07, 0.07 + p * 0.06, 0, undefined, 110);
      osc(90 + p * 40, "sine", 0.11, 0.05 + p * 0.04);
      noiseBurst(0.04, 0.04 + p * 0.04, 0, 1600, 1.1, "bandpass");
    }
  },
  charge() {},
  sink() {
    duckMusic(0.5, 700);
    osc(523.25, "sine", 0.14, 0.1, 0);
    osc(659.25, "sine", 0.16, 0.09, 0.1);
    osc(783.99, "sine", 0.2, 0.1, 0.2);
    osc(1046.5, "triangle", 0.32, 0.07, 0.32);
    noiseBurst(0.12, 0.04, 0.05, 1200, 0.8);
  },
  ui() {
    osc(760, "sine", 0.05, 0.04);
    osc(1140, "sine", 0.04, 0.02, 0.03);
  },
  whoosh() {
    noiseBurst(0.16, 0.05, 0, 700, 0.6, "bandpass");
    osc(190, "sawtooth", 0.14, 0.025, 0, undefined, 70);
  },
  oob() {
    osc(180, "sawtooth", 0.14, 0.06, 0, undefined, 80);
    osc(110, "triangle", 0.2, 0.05, 0.04);
  },
  confetti() {
    for (let i = 0; i < 6; i++) {
      osc(480 + i * 90 + Math.random() * 40, "sine", 0.09, 0.032, i * 0.045);
    }
  },
};
