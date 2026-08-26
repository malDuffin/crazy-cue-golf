import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { createXRStore, XR } from "@react-three/xr";
import * as THREE from "three";
import { GameScene } from "./scene/GameScene";
import type { Box3DWorld } from "@/lib/physics/box3dWorld";
import { useGameStore } from "@/lib/game/store";

export const xrStore = createXRStore({
  hand: true,
  handTracking: true,
  controller: true,
  emulate: false,
});

export function GameCanvas({
  physicsRef,
  onRequestHoleReset,
}: {
  physicsRef: React.MutableRefObject<Box3DWorld | null>;
  onRequestHoleReset: React.MutableRefObject<(() => void) | null>;
}) {
  const lowPower = useGameStore((s) => s.lowPower);
  const setTrackingMode = useGameStore((s) => s.setTrackingMode);
  const [dpr, setDpr] = useState<[number, number]>([1, 1.75]);

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const cores = navigator.hardwareConcurrency || 4;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isMobile || cores <= 4 || reduced) {
      setDpr([1, 1.25]);
    } else {
      setDpr([1, 1.75]);
    }
  }, []);

  useEffect(() => {
    const unsub = xrStore.subscribe((s, prev) => {
      if (s.session && !prev.session) setTrackingMode("xr");
      else if (!s.session && prev.session) {
        if (useGameStore.getState().trackingMode === "xr") setTrackingMode("off");
      }
    });
    return () => unsub();
  }, [setTrackingMode]);

  return (
    <Canvas
      className="touch-none"
      shadows={!lowPower}
      dpr={dpr}
      gl={{
        antialias: !lowPower,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.28,
      }}
      camera={{
        position: [2.8, 2.6, -4.2],
        fov: 42,
        near: 0.1,
        far: 50,
        up: [0, 1, 0],
      }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor("#122034");
        gl.domElement.style.touchAction = "none";
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0.15, 0.5);
      }}
    >
      <XR store={xrStore}>
        <Suspense fallback={null}>
          <GameScene
            physicsRef={physicsRef}
            onRequestHoleReset={onRequestHoleReset}
          />
        </Suspense>
      </XR>
    </Canvas>
  );
}
