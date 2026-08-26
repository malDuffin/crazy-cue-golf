import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { GameScene } from "./components/GameScene";
import { HUD } from "./components/HUD";
import * as THREE from "three";

export function App() {
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [2.8, 2.6, -4.2], fov: 42, near: 0.1, far: 50 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.28 }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor("#122034");
          camera.up.set(0, 1, 0);
          camera.lookAt(0, 0.15, 0.5);
        }}
      >
        <Suspense fallback={null}>
          <GameScene />
        </Suspense>
      </Canvas>
      <HUD />
    </>
  );
}
