/** Minimal typings for the vendored box3d.js 0.0.2 inline engine. */
export type b3Vec3 = { x: number; y: number; z: number };
export type b3Quat = { v: b3Vec3; s: number };
export type b3BodyId = object;
export type b3WorldId = object;

export type Box3DModule = {
  b3BodyType: { b3_staticBody: number; b3_dynamicBody: number; b3_kinematicBody: number };
  b3DefaultWorldDef(): Record<string, unknown>;
  b3CreateWorld(def: Record<string, unknown>): b3WorldId;
  b3DestroyWorld(world: b3WorldId): void;
  b3World_Step(world: b3WorldId, dt: number, substeps: number): void;
  b3DefaultBodyDef(): Record<string, unknown>;
  b3CreateBody(world: b3WorldId, def: Record<string, unknown>): b3BodyId;
  b3DefaultShapeDef(): Record<string, unknown>;
  b3DefaultSurfaceMaterial(): Record<string, unknown>;
  b3CreateBoxShape(body: b3BodyId, shapeDef: Record<string, unknown>, hx: number, hy: number, hz: number): unknown;
  b3CreateSphereShape(
    body: b3BodyId,
    shapeDef: Record<string, unknown>,
    sphere: { center: b3Vec3; radius: number },
  ): unknown;
  b3Body_SetTransform(body: b3BodyId, pos: b3Vec3, rot: b3Quat): void;
  b3Body_SetLinearVelocity(body: b3BodyId, vel: b3Vec3): void;
  b3Body_SetAngularVelocity(body: b3BodyId, vel: b3Vec3): void;
  b3Body_SetAwake(body: b3BodyId, awake: boolean): void;
  b3Body_GetPosition(body: b3BodyId): b3Vec3;
  b3Body_GetLinearVelocity(body: b3BodyId): b3Vec3;
  b3Body_GetRotation(body: b3BodyId): b3Quat;
};

declare function Box3D(moduleArg?: Record<string, unknown>): Promise<Box3DModule>;
export default Box3D;
