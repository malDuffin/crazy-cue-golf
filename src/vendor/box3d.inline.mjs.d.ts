import type { Box3DModule } from "box3d.js";

declare function Box3D(moduleArg?: Record<string, unknown>): Promise<Box3DModule>;
export default Box3D;
