import { useCallback, useEffect, useRef, useState } from "react";
import { GameCanvas, xrStore } from "./GameCanvas";
import { TrackingLayer } from "./TrackingLayer";
import { HUD } from "./ui/HUD";
import {
  StartMenu,
  HoleCompleteOverlay,
  CourseCompleteOverlay,
  PauseOverlay,
} from "./ui/Menus";
import { Box3DWorld } from "@/lib/physics/box3dWorld";
import { useGameStore } from "@/lib/game/store";
import { sfx, unlockAudio, startMusic, stopMusic, setMuted } from "@/lib/game/audio";

export function CrazyCueGolf() {
  const physicsRef = useRef<Box3DWorld | null>(null);
  const holeResetRef = useRef<(() => void) | null>(null);
  const [physicsReady, setPhysicsReady] = useState(false);
  const [xrSupported, setXrSupported] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const phase = useGameStore((s) => s.phase);
  const startCourse = useGameStore((s) => s.startCourse);
  const nextHole = useGameStore((s) => s.nextHole);
  const resetCourse = useGameStore((s) => s.resetCourse);
  const setPhase = useGameStore((s) => s.setPhase);
  const setMobile = useGameStore((s) => s.setMobile);
  const setLowPower = useGameStore((s) => s.setLowPower);
  const setTrackingMode = useGameStore((s) => s.setTrackingMode);
  const restoreHoleUses = useGameStore((s) => s.restoreHoleUses);
  const audioEnabled = useGameStore((s) => s.audioEnabled);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    const low =
      mobile ||
      (navigator.hardwareConcurrency || 8) <= 4 ||
      /Android|iPhone|iPad/i.test(navigator.userAgent);
    setMobile(mobile);
    setLowPower(low);

    const checkXR = async () => {
      try {
        const nav = navigator as Navigator & {
          xr?: { isSessionSupported: (m: string) => Promise<boolean> };
        };
        if (nav.xr) {
          const ok =
            (await nav.xr.isSessionSupported("immersive-vr")) ||
            (await nav.xr.isSessionSupported("immersive-ar"));
          setXrSupported(!!ok);
        }
      } catch {
        setXrSupported(false);
      }
    };
    void checkXR();
  }, [setMobile, setLowPower]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const world = await Box3DWorld.create();
        if (cancelled) {
          world.dispose();
          return;
        }
        physicsRef.current = world;
        setPhysicsReady(true);
      } catch (e) {
        console.error(e);
        setBootError(e instanceof Error ? e.message : "Physics failed to load");
      }
    })();
    return () => {
      cancelled = true;
      physicsRef.current?.dispose();
      physicsRef.current = null;
    };
  }, []);

  useEffect(() => {
    setMuted(!audioEnabled);
    if (
      audioEnabled &&
      (phase === "playing" ||
        phase === "paused" ||
        phase === "hole-complete" ||
        phase === "course-complete")
    ) {
      startMusic();
    } else if (phase === "boot" || phase === "menu") {
      // wait for Play (user gesture) — handleStart kicks the bed
      if (!audioEnabled) stopMusic();
    } else if (!audioEnabled) {
      stopMusic();
    }
  }, [audioEnabled, phase]);

  useEffect(() => {
    return () => {
      stopMusic();
      sfx.pullEnd();
    };
  }, []);

  const handleStart = useCallback(async () => {
    await unlockAudio();
    setMuted(!audioEnabled);
    if (audioEnabled) {
      sfx.ui();
      startMusic();
    }
    startCourse();
  }, [audioEnabled, startCourse]);

  const handleNextHole = useCallback(() => {
    nextHole();
    // placeTee is triggered by hole change effect in GameScene
  }, [nextHole]);

  const handleRestartHole = useCallback(() => {
    if (audioEnabled) sfx.ui();
    restoreHoleUses();
    holeResetRef.current?.();
  }, [audioEnabled, restoreHoleUses]);

  const handleEnableCamera = useCallback(async () => {
    await unlockAudio();
    const mode = useGameStore.getState().trackingMode;
    if (mode === "camera") {
      setTrackingMode("off");
    } else {
      setTrackingMode("camera");
    }
  }, [setTrackingMode]);

  const handleEnterXR = useCallback(async () => {
    await unlockAudio();
    try {
      await xrStore.enterVR();
    } catch {
      try {
        await xrStore.enterAR();
      } catch {
        useGameStore.getState().setMessage("WebXR session unavailable on this device");
      }
    }
  }, []);

  return (
    <div className="game-shell">
      <div className="game-canvas-wrap">
        {physicsReady ? (
          <GameCanvas
            physicsRef={physicsRef}
            onRequestHoleReset={holeResetRef}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="liquid-glass liquid-glass-strong rounded-[var(--radius-xl)] px-8 py-6 text-center">
              <p className="text-sm text-[var(--color-muted)]">
                {bootError ? "Could not start physics" : "Warming up the table…"}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Crazy Cue Golf
              </h1>
              {bootError && (
                <p className="mt-2 max-w-xs text-xs text-[var(--color-danger)]">
                  {bootError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <TrackingLayer />

      {phase === "menu" && <StartMenu onStart={handleStart} />}

      {(phase === "playing" ||
        phase === "paused" ||
        phase === "hole-complete" ||
        phase === "course-complete") && (
        <HUD
          onRestartHole={handleRestartHole}
          onEnableCamera={handleEnableCamera}
          onEnterXR={handleEnterXR}
          xrSupported={xrSupported}
        />
      )}

      {phase === "hole-complete" && (
        <HoleCompleteOverlay onNext={handleNextHole} />
      )}
      {phase === "course-complete" && (
        <CourseCompleteOverlay
          onReplay={handleStart}
          onMenu={resetCourse}
        />
      )}
      {phase === "paused" && (
        <PauseOverlay
          onResume={() => setPhase("playing")}
          onMenu={resetCourse}
        />
      )}
    </div>
  );
}
