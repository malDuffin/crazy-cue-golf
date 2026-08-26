import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Gamepad2,
  Glasses,
  Hand,
  HelpCircle,
  Keyboard,
  LayoutGrid,
  Pause,
  RotateCcw,
  Target,
  Volume2,
  VolumeX,
  Webcam,
  Undo2,
  Zap,
} from "lucide-react";
import { WEAPON_META, type WeaponId, useGameStore } from "@/lib/game/store";
import { GlassButton, GlassChip, GlassPanel } from "./LiquidGlass";
import { sfx, unlockAudio, setMuted, startMusic, stopMusic } from "@/lib/game/audio";
import { getHole } from "@/lib/game/holes";

const WEAPONS: WeaponId[] = ["cue", "club", "trebuchet"];

export function HUD({
  onRestartHole,
  onEnableCamera,
  onEnterXR,
  xrSupported,
}: {
  onRestartHole: () => void;
  onEnableCamera: () => void;
  onEnterXR: () => void;
  xrSupported: boolean;
}) {
  const phase = useGameStore((s) => s.phase);
  const weapon = useGameStore((s) => s.weapon);
  const setWeapon = useGameStore((s) => s.setWeapon);
  const shot = useGameStore((s) => s.shot);
  const power = useGameStore((s) => s.power);
  const ballSelected = useGameStore((s) => s.ballSelected);
  const stats = useGameStore((s) => s.stats);
  const message = useGameStore((s) => s.message);
  const trackingMode = useGameStore((s) => s.trackingMode);
  const trackingReady = useGameStore((s) => s.trackingReady);
  const audioEnabled = useGameStore((s) => s.audioEnabled);
  const setAudioEnabled = useGameStore((s) => s.setAudioEnabled);
  const showHelp = useGameStore((s) => s.showHelp);
  const setShowHelp = useGameStore((s) => s.setShowHelp);
  const setPhase = useGameStore((s) => s.setPhase);
  const requestHit = useGameStore((s) => s.requestHit);
  const mobile = useGameStore((s) => s.mobile);
  const weaponUses = useGameStore((s) => s.weaponUses);
  const playMode = useGameStore((s) => s.playMode);
  const chain = useGameStore((s) => s.chain);
  const chainPlaying = useGameStore((s) => s.chainPlaying);
  const requestLockShot = useGameStore((s) => s.requestLockShot);
  const requestChainPlay = useGameStore((s) => s.requestChainPlay);
  const undoChainShot = useGameStore((s) => s.undoChainShot);
  const editChainShot = useGameStore((s) => s.editChainShot);
  const editingIndex = useGameStore((s) => s.editingIndex);
  const hole = getHole(stats.hole);
  const cameraOn = trackingMode === "camera";

  const [kitOpen, setKitOpen] = useState(() => !useGameStore.getState().mobile);
  const [scoreOpen, setScoreOpen] = useState(() => !useGameStore.getState().mobile);

  useEffect(() => {
    if (mobile && ballSelected) setKitOpen(false);
  }, [mobile, ballSelected]);

  if (phase === "menu" || phase === "boot") return null;

  const dragging = shot === "aiming" || shot === "charging";
  const locked = shot === "ready" && power > 0.05;
  const canStrike = ballSelected && locked && weaponUses[weapon] > 0 && !chainPlaying;
  const showPower = (dragging || locked) && ballSelected && power > 0.02;
  const powerPct = Math.round(power * 100);

  return (
    <div className="hud-layer p-3 sm:p-4">
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4 pt-[max(12px,env(safe-area-inset-top))]">
        <GlassPanel className="pointer-events-auto max-w-[min(70vw,320px)] rounded-[var(--radius-lg)] px-2.5 py-1.5 sm:px-4 sm:py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            onClick={() => setScoreOpen((o) => !o)}
            aria-expanded={scoreOpen}
            aria-label={scoreOpen ? "Hide score details" : "Show score details"}
          >
            <span className="tabular-nums text-sm font-semibold">
              {stats.hole}<span className="text-[var(--color-muted)]">/3</span>
            </span>
            <GlassChip className="px-2 py-0.5 text-[10px]">Par {stats.par}</GlassChip>
            <GlassChip
              className={`px-2 py-0.5 text-[10px] ${
                shot === "flying" ? "ring-1 ring-[var(--color-accent)]" : ""
              }`}
            >
              {stats.strokes}
            </GlassChip>
            {playMode === "chain" && (
              <GlassChip
                className={`px-2 py-0.5 text-[10px] ${
                  chainPlaying ? "ring-1 ring-[var(--color-accent)]" : ""
                }`}
              >
                {chain.length} chained
              </GlassChip>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5">
              {showPower && (
                <span className="tabular-nums text-xs font-semibold text-[var(--color-accent)]">
                  {powerPct}%
                </span>
              )}
              {scoreOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
              )}
            </span>
          </button>
          {scoreOpen && (
            <p className="mt-1.5 max-w-[min(70vw,280px)] text-xs text-[var(--color-muted)]">
              {hole.name} — {message}
            </p>
          )}
        </GlassPanel>

        <div
          className={`pointer-events-auto flex flex-col items-end gap-2 transition-[margin] ${
            cameraOn ? "mr-[min(228px,44vw)] sm:mr-[min(268px,30vw)]" : ""
          }`}
        >
          <div className="flex gap-2">
            <GlassButton
              variant="ghost"
              className="min-h-11 min-w-11 px-0"
              aria-label="Help"
              onClick={() => setShowHelp(!showHelp)}
            >
              <HelpCircle className="h-5 w-5" />
            </GlassButton>
            <GlassButton
              variant="ghost"
              className="min-h-11 min-w-11 px-0"
              aria-label={audioEnabled ? "Mute" : "Unmute"}
              onClick={() => {
                void unlockAudio();
                const next = !audioEnabled;
                setAudioEnabled(next);
                setMuted(!next);
                if (next) startMusic();
                else {
                  stopMusic();
                  sfx.pullEnd();
                }
              }}
            >
              {audioEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </GlassButton>
            <GlassButton
              variant="ghost"
              className="min-h-11 min-w-11 px-0"
              aria-label="Pause"
              onClick={() => setPhase("paused")}
            >
              <Pause className="h-5 w-5" />
            </GlassButton>
          </div>
        </div>
      </div>

      {!mobile && phase === "playing" && (
        <div className="pointer-events-none absolute left-1/2 top-[max(88px,calc(env(safe-area-inset-top)+72px))] hidden -translate-x-1/2 sm:block">
          <GlassChip className="gap-2 text-[11px] text-[var(--color-muted)]">
            <Keyboard className="h-3.5 w-3.5" />
            {ballSelected
              ? playMode === "chain"
                ? "Aim · Set shot at landing · Hit ball to play · 1/2/3"
                : "Drag weapon to aim · Hit now to strike · Esc zoom out · 1/2/3"
              : "Click ball to play · Drag scene to look · 1/2/3 weapons"}
            <Gamepad2 className="ml-1 h-3.5 w-3.5" />
          </GlassChip>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-0 right-0 flex flex-col items-stretch gap-2 p-3 sm:items-center sm:p-4">
        {showPower && !mobile && (
          <GlassPanel className="pointer-events-none hidden w-full max-w-xs rounded-[var(--radius-lg)] px-4 py-2 sm:block">
            <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span className="inline-flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                {weapon === "cue" ? "Cue power" : weapon === "club" ? "Swing" : "Trebuchet"}
              </span>
              <span className="tabular-nums font-semibold text-[var(--color-fg)]">{powerPct}%</span>
            </div>
            <div className="power-meter">
              <span style={{ width: `${power * 100}%` }} />
            </div>
          </GlassPanel>
        )}

        {phase === "playing" && playMode === "chain" && !chainPlaying && chain.length > 0 && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5">
            {chain.map((q, i) => (
              <button
                key={q.id}
                type="button"
                title={`${WEAPON_META[q.weapon].label} · ${Math.round(q.power * 100)}% · tap to edit`}
                onClick={() => {
                  if (audioEnabled) sfx.ui();
                  editChainShot(i);
                }}
                className={`min-h-10 min-w-10 rounded-full px-3 text-sm font-semibold tabular-nums transition ${
                  editingIndex === i
                    ? "bg-[color-mix(in_oklab,var(--color-accent)_35%,transparent)] ring-1 ring-[var(--color-accent)]"
                    : "liquid-glass bg-[color-mix(in_oklab,white_10%,transparent)]"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {phase === "playing" && canStrike && playMode === "stroke" && (
          <GlassButton
            className="pointer-events-auto min-h-12 w-full max-w-xs self-center text-base font-semibold tracking-tight sm:min-h-14 sm:text-lg"
            tabIndex={-1}
            onClick={() => {
              void unlockAudio();
              requestHit();
            }}
          >
            <Zap className="h-5 w-5" />
            Hit now
          </GlassButton>
        )}

        {phase === "playing" && playMode === "chain" && !chainPlaying && (
          <div className="pointer-events-auto flex w-full max-w-xs flex-col gap-2 self-center">
            {canStrike && (
              <GlassButton
                className="min-h-12 w-full text-base font-semibold tracking-tight"
                tabIndex={-1}
                onClick={() => {
                  void unlockAudio();
                  requestLockShot();
                }}
              >
                <Target className="h-5 w-5" />
                {editingIndex != null
                  ? `Update shot ${editingIndex + 1}`
                  : `Set shot ${chain.length + 1}`}
              </GlassButton>
            )}
            {chain.length > 0 && (
              <div className="flex gap-2">
                <GlassButton
                  variant="ghost"
                  className="min-h-11 flex-1"
                  onClick={() => {
                    if (audioEnabled) sfx.ui();
                    undoChainShot();
                  }}
                >
                  <Undo2 className="h-4 w-4" />
                  Undo
                </GlassButton>
                <GlassButton
                  className="min-h-11 min-w-0 flex-[2] text-base font-semibold"
                  tabIndex={-1}
                  onClick={() => {
                    void unlockAudio();
                    requestChainPlay();
                  }}
                >
                  <Zap className="h-5 w-5" />
                  Hit ball
                </GlassButton>
              </div>
            )}
          </div>
        )}

        <div className="pointer-events-auto flex w-full max-w-lg items-end gap-2 self-center">
          <GlassButton
            variant="ghost"
            className="min-h-11 min-w-11 shrink-0 px-0 sm:min-h-12 sm:min-w-12"
            aria-label={kitOpen ? "Hide weapons" : "Show weapons"}
            aria-expanded={kitOpen}
            onClick={() => {
              if (audioEnabled) sfx.ui();
              setKitOpen((o) => !o);
            }}
          >
            <LayoutGrid className="h-5 w-5" />
          </GlassButton>

          {kitOpen ? (
            <GlassPanel className="min-w-0 flex-1 rounded-[var(--radius-xl)] p-2 sm:p-3">
              <div className="grid grid-cols-3 gap-2">
                {WEAPONS.map((id) => {
                  const meta = WEAPON_META[id];
                  const active = weapon === id;
                  const uses = weaponUses[id];
                  const empty = uses <= 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={shot === "flying" || empty}
                      onClick={() => {
                        setWeapon(id);
                        if (audioEnabled) sfx.ui();
                      }}
                      className={`relative min-h-[52px] rounded-[var(--radius-md)] px-2 py-2 text-left transition-transform active:scale-[0.98] ${
                        empty
                          ? "cursor-not-allowed opacity-40"
                          : active
                            ? "bg-[color-mix(in_oklab,white_22%,transparent)] shadow-[inset_0_1px_0_color-mix(in_oklab,white_45%,transparent)]"
                            : "bg-[color-mix(in_oklab,white_6%,transparent)] hover:bg-[color-mix(in_oklab,white_12%,transparent)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="text-sm font-semibold tracking-tight">{meta.label}</div>
                        <span
                          className={`tabular-nums text-lg font-bold leading-none ${
                            empty
                              ? "text-[var(--color-muted)]"
                              : active
                                ? "text-[var(--color-accent)]"
                                : "text-[var(--color-fg)]"
                          }`}
                        >
                          {uses}
                        </span>
                      </div>
                      <div className="mt-0.5 hidden text-[10px] leading-snug text-[var(--color-muted)] sm:line-clamp-2 sm:block sm:text-[11px]">
                        {empty ? "No uses left" : meta.blurb}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[color-mix(in_oklab,white_12%,transparent)] pt-2">
                <div className="flex flex-wrap gap-1.5">
                  <GlassButton variant="ghost" className="min-h-11 px-3 text-xs" onClick={onRestartHole}>
                    <RotateCcw className="h-3.5 w-3.5" /> Redo
                  </GlassButton>
                  <GlassButton
                    variant={cameraOn ? "primary" : "ghost"}
                    className="min-h-11 px-3 text-xs"
                    onClick={onEnableCamera}
                  >
                    <Webcam className="h-3.5 w-3.5" />
                    {cameraOn && trackingReady ? "Cam on" : cameraOn ? "Cam…" : "Track"}
                  </GlassButton>
                  {xrSupported && (
                    <GlassButton variant="ghost" className="min-h-11 px-3 text-xs" onClick={onEnterXR}>
                      <Glasses className="h-3.5 w-3.5" /> XR
                    </GlassButton>
                  )}
                </div>
                <p className="flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                  {trackingMode === "camera" ? (
                    <>
                      <Hand className="h-3.5 w-3.5 text-[var(--color-accent)]" /> See corner preview
                    </>
                  ) : trackingMode === "xr" ? (
                    <>
                      <Glasses className="h-3.5 w-3.5 text-[var(--color-accent)]" /> XR hands
                    </>
                  ) : (
                    <>
                      <Crosshair className="h-3.5 w-3.5" />
                      {ballSelected ? "Aim, then strike" : mobile ? "Tap ball" : "Click ball"}
                    </>
                  )}
                </p>
              </div>
            </GlassPanel>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {WEAPONS.map((id) => {
                const active = weapon === id;
                const uses = weaponUses[id];
                const empty = uses <= 0;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={shot === "flying" || empty}
                    onClick={() => {
                      setWeapon(id);
                      if (audioEnabled) sfx.ui();
                    }}
                    className={`liquid-glass min-h-11 min-w-0 flex-1 rounded-[var(--radius-md)] px-2 py-1.5 text-center ${
                      empty
                        ? "opacity-40"
                        : active
                          ? "ring-1 ring-[var(--color-accent)]"
                          : ""
                    }`}
                  >
                    <div className="truncate text-[11px] font-semibold leading-none">
                      {WEAPON_META[id].label.split(" ").pop()}
                    </div>
                    <div
                      className={`mt-0.5 tabular-nums text-sm font-bold leading-none ${
                        empty ? "text-[var(--color-muted)]" : "text-[var(--color-accent)]"
                      }`}
                    >
                      {uses}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showHelp && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <GlassPanel
            strong
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-xl)] p-5"
          >
            <h2 className="text-lg font-semibold tracking-tight">How to play</h2>
            <ul className="mt-3 space-y-2 text-sm text-[var(--color-muted)]">
              <li>
                <strong className="text-[var(--color-fg)]">1. Overview</strong> — drag empty space
                to orbit the course. The ball pulses so you can find it.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">2. Select</strong> — click / tap the
                ball. Camera dollies in and your weapon appears.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">3. Aim</strong> — drag around the
                ball to set direction and power. The handle sits on the drag circle and
                goes white → green → red with power. Release to lock — the ball will not
                fire yet. Each weapon has 0–2 uses per hole (at least 3 total).
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">4. Hit now / Hit ball</strong> —
                Stroke Play fires immediately. Trick Chain: Set shot at each landing, then
                Hit ball. After the ball rests a second, the next queued hit fires.
                Tap a shot number or a landing ghost to go back and retune that shot.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">5. Zoom out</strong> — click away from
                the ball (or press Esc) to return to the wide course view.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">HUD</strong> — tap the score chip to
                expand hole info. The grid button opens weapons, Redo, and Track.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">Desktop</strong> — A/D aim, hold Space
                to charge, Hit now to strike, 1/2/3 weapons, R redo.
              </li>
            </ul>
            <GlassButton className="mt-4 w-full" onClick={() => setShowHelp(false)}>
              Got it
            </GlassButton>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
