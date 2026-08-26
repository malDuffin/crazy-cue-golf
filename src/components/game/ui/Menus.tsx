import { Play, Trophy, RotateCcw, Target, Link2 } from "lucide-react";
import { useGameStore, WEAPON_META, type WeaponId, type PlayMode } from "@/lib/game/store";
import { GlassButton, GlassPanel } from "./LiquidGlass";
import { sfx, unlockAudio } from "@/lib/game/audio";

const WEAPONS: WeaponId[] = ["cue", "club", "trebuchet"];

export function StartMenu({ onStart }: { onStart: () => void }) {
  const weapon = useGameStore((s) => s.weapon);
  const setWeapon = useGameStore((s) => s.setWeapon);
  const audioEnabled = useGameStore((s) => s.audioEnabled);
  const weaponUses = useGameStore((s) => s.weaponUses);
  const playMode = useGameStore((s) => s.playMode);
  const setPlayMode = useGameStore((s) => s.setPlayMode);

  const pickMode = (mode: PlayMode) => {
    setPlayMode(mode);
    if (audioEnabled) sfx.ui();
  };

  return (
    <div className="hud-layer flex items-end justify-center p-4 pb-[max(24px,env(safe-area-inset-bottom))] sm:items-center">
      <GlassPanel
        strong
        className="w-full max-w-md rounded-[var(--radius-xl)] p-5 sm:p-6"
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-accent)]">
          Face-for-Games inspired
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          Crazy Cue Golf
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          Low-poly tabletop golf with three wild weapons. Each hole rolls a kit
          of uses (0–2 each, at least 3 total).
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => pickMode("stroke")}
            className={`min-h-[96px] rounded-[var(--radius-md)] border px-3 py-3 text-left transition active:scale-[0.98] ${
              playMode === "stroke"
                ? "border-[color-mix(in_oklab,var(--color-accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)]"
                : "border-[color-mix(in_oklab,white_14%,transparent)] bg-[color-mix(in_oklab,white_6%,transparent)]"
            }`}
          >
            <Target className="mb-1.5 h-5 w-5 text-[var(--color-accent)]" />
            <div className="text-sm font-semibold">Stroke Play</div>
            <div className="mt-1 text-[10px] leading-snug text-[var(--color-muted)]">
              Hit the ball, then hit it again. Classic one shot at a time.
            </div>
          </button>
          <button
            type="button"
            onClick={() => pickMode("chain")}
            className={`min-h-[96px] rounded-[var(--radius-md)] border px-3 py-3 text-left transition active:scale-[0.98] ${
              playMode === "chain"
                ? "border-[color-mix(in_oklab,var(--color-accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)]"
                : "border-[color-mix(in_oklab,white_14%,transparent)] bg-[color-mix(in_oklab,white_6%,transparent)]"
            }`}
          >
            <Link2 className="mb-1.5 h-5 w-5 text-[var(--color-accent)]" />
            <div className="text-sm font-semibold">Trick Chain</div>
            <div className="mt-1 text-[10px] leading-snug text-[var(--color-muted)]">
              Queue a hit at each predicted landing, then press Hit ball.
              Tap a shot number to go back and retune it.
            </div>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {WEAPONS.map((id) => {
            const meta = WEAPON_META[id];
            const active = weapon === id;
            const uses = weaponUses[id];
            const empty = uses <= 0;
            return (
              <button
                key={id}
                type="button"
                disabled={empty}
                onClick={() => {
                  setWeapon(id);
                  if (audioEnabled) sfx.ui();
                }}
                className={`min-h-[72px] rounded-[var(--radius-md)] border px-3 py-3 text-left transition active:scale-[0.98] ${
                  empty
                    ? "cursor-not-allowed opacity-40 border-[color-mix(in_oklab,white_10%,transparent)]"
                    : active
                      ? "border-[color-mix(in_oklab,var(--color-accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)]"
                      : "border-[color-mix(in_oklab,white_14%,transparent)] bg-[color-mix(in_oklab,white_6%,transparent)]"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="text-sm font-semibold">{meta.label}</div>
                  <span
                    className={`tabular-nums text-xl font-bold leading-none ${
                      empty ? "text-[var(--color-muted)]" : "text-[var(--color-accent)]"
                    }`}
                  >
                    {uses}
                  </span>
                </div>
                <div className="mt-1 text-[10px] leading-snug text-[var(--color-muted)]">
                  {empty ? "No uses this kit" : meta.blurb}
                </div>
              </button>
            );
          })}
        </div>

        <GlassButton
          className="mt-5 w-full"
          onClick={async () => {
            await unlockAudio();
            if (audioEnabled) sfx.ui();
            onStart();
          }}
        >
          <Play className="h-5 w-5" />
          {playMode === "chain" ? "Play Trick Chain" : "Play Stroke Course"}
        </GlassButton>
        <p className="mt-3 text-center text-[11px] text-[var(--color-muted)]">
          {playMode === "chain"
            ? "Set shots on landings · Hit ball to watch the combo"
            : "Click ball to focus · drag to strike · click off for course view"}
        </p>
      </GlassPanel>
    </div>
  );
}

export function HoleCompleteOverlay({ onNext }: { onNext: () => void }) {
  const stats = useGameStore((s) => s.stats);
  const lastHoleStrokes = useGameStore((s) => s.lastHoleStrokes);
  const message = useGameStore((s) => s.message);
  const audioEnabled = useGameStore((s) => s.audioEnabled);

  return (
    <div className="hud-layer flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
      <GlassPanel strong className="w-full max-w-sm rounded-[var(--radius-xl)] p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Hole complete
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{message}</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {lastHoleStrokes} stroke{lastHoleStrokes === 1 ? "" : "s"} · total{" "}
          {stats.totalStrokes}
        </p>
        <GlassButton
          className="mt-5 w-full"
          onClick={() => {
            if (audioEnabled) sfx.ui();
            onNext();
          }}
        >
          Next hole
        </GlassButton>
      </GlassPanel>
    </div>
  );
}

export function CourseCompleteOverlay({
  onReplay,
  onMenu,
}: {
  onReplay: () => void;
  onMenu: () => void;
}) {
  const stats = useGameStore((s) => s.stats);
  const audioEnabled = useGameStore((s) => s.audioEnabled);

  return (
    <div className="hud-layer flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <GlassPanel strong className="w-full max-w-sm rounded-[var(--radius-xl)] p-6 text-center">
        <Trophy className="mx-auto h-10 w-10 text-[var(--color-warn)]" />
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Course complete!</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Finished in <strong className="text-[var(--color-fg)]">{stats.totalStrokes}</strong>{" "}
          strokes across 3 holes.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <GlassButton
            className="w-full"
            onClick={() => {
              if (audioEnabled) sfx.ui();
              onReplay();
            }}
          >
            <RotateCcw className="h-4 w-4" /> Play again
          </GlassButton>
          <GlassButton
            variant="ghost"
            className="w-full"
            onClick={() => {
              if (audioEnabled) sfx.ui();
              onMenu();
            }}
          >
            Main menu
          </GlassButton>
        </div>
      </GlassPanel>
    </div>
  );
}

export function PauseOverlay({
  onResume,
  onMenu,
}: {
  onResume: () => void;
  onMenu: () => void;
}) {
  const audioEnabled = useGameStore((s) => s.audioEnabled);

  return (
    <div className="hud-layer flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <GlassPanel strong className="w-full max-w-sm rounded-[var(--radius-xl)] p-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Paused</h2>
        <div className="mt-5 flex flex-col gap-2">
          <GlassButton
            className="w-full"
            onClick={() => {
              if (audioEnabled) sfx.ui();
              onResume();
            }}
          >
            Resume
          </GlassButton>
          <GlassButton
            variant="ghost"
            className="w-full"
            onClick={() => {
              if (audioEnabled) sfx.ui();
              onMenu();
            }}
          >
            Main menu
          </GlassButton>
        </div>
      </GlassPanel>
    </div>
  );
}