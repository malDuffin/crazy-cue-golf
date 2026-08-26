/**
 * Live physics via Box3D WASM (https://github.com/isaac-mason/box3d.js).
 * A second ghost world runs the same colliders so shot prediction never
 * disturbs the playable ball.
 * Engine binary is vendored at src/vendor/box3d.inline.mjs.
 */
import type { Box3DModule, b3BodyId, b3WorldId, b3Quat } from "@/vendor/box3d";
import Box3DFactory from "@/vendor/box3d.inline.mjs";
import { buildCourseColliders, type Vec3 } from "@/lib/game/holes";
