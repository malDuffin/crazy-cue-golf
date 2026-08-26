/// <reference types="vite/client" />

declare module "@/vendor/box3d.inline.mjs" {
  import type { Box3DModule } from "box3d.js";
  function Box3D(moduleArg?: Record<string, unknown>): Promise<Box3DModule>;
  export default Box3D;
}
