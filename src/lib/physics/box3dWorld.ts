/**
 * Live physics via Box3D WASM (https://github.com/isaac-mason/box3d.js).
 * A second ghost world runs the same colliders so shot prediction never
 * disturbs the playable ball.
 * Engine binary is vendored at src/vendor/box3d.inline.mjs.
 */
import type { Box3DModule, b3BodyId, b3WorldId, b3Quat } from "@/vendor/box3d";
import Box3DFactory from "@/vendor/box3d.inline.mjs";
import { buildCourseColliders, type Vec3 } from "@/lib/game/holes";

export type PhysicsBallState = {
  position: Vec3;
  velocity: Vec3;
  rotation: { x: number; y: number; z: number; w: number };
  asleep: boolean;
};

export type PredictedPath = {
  points: Vec3[];
  speeds: number[];
  sunk: boolean;
  rest: Vec3;
};

const BALL_RADIUS = 0.055;
const FIXED_DT = 1 / 60;
const MAX_STEPS = 4;
const MAX_SPEED = 32.5;
const PREVIEW_DT = 0.05;

function identityQuat(): b3Quat {
  return { v: { x: 0, y: 0, z: 0 }, s: 1 };
}

function eulerToQuat(rx: number, ry: number): b3Quat {
  const cy = Math.cos(ry * 0.5);
  const sy = Math.sin(ry * 0.5);
  const cx = Math.cos(rx * 0.5);
  const sx = Math.sin(rx * 0.5);
  return {
    v: {
      x: sx * cy,
      y: cx * sy,
      z: -sx * sy,
    },
    s: cx * cy,
  };
}

function copyVec(v: { x: number; y: number; z: number }): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function shotVelocity(dir: Vec3, impulse: number, loft: number): Vec3 {
  const len = Math.hypot(dir.x, dir.z) || 1;
  const nx = dir.x / len;
  const nz = dir.z / len;
  const up = Math.min(0.95, Math.max(0.02, loft));
  const horiz = Math.max(0.35, 1 - up * 0.28);
  return {
    x: nx * impulse * horiz,
    y: impulse * up * 0.55,
    z: nz * impulse * horiz,
  };
}

export class Box3DWorld {
  b3: Box3DModule;
  world: b3WorldId;
  ball: b3BodyId;
  windmill: b3BodyId | null = null;
  private ghostWorld: b3WorldId;
  private ghostBall: b3BodyId;
  private ghostMill: b3BodyId | null = null;
  private accumulator = 0;
  private cupSensors: { pos: Vec3; radius: number; hole: number }[] = [];
  private ready = false;

  private constructor(
    b3: Box3DModule,
    world: b3WorldId,
    ball: b3BodyId,
    ghostWorld: b3WorldId,
    ghostBall: b3BodyId,
  ) {
    this.b3 = b3;
    this.world = world;
    this.ball = ball;
    this.ghostWorld = ghostWorld;
    this.ghostBall = ghostBall;
  }

  static async create(): Promise<Box3DWorld> {
    const b3 = await Box3DFactory();

    const makeWorld = (continuous: boolean) => {
      const worldDef = b3.b3DefaultWorldDef();
      worldDef.gravity = { x: 0, y: -10.5, z: 0 };
      worldDef.enableContinuous = continuous;
      worldDef.enableSleep = continuous;
      worldDef.restitutionThreshold = 0.15;
      return b3.b3CreateWorld(worldDef);
    };

    const world = makeWorld(true);
    const ghostWorld = makeWorld(false);

    const engine = new Box3DWorld(
      b3,
      world,
      null as unknown as b3BodyId,
      ghostWorld,
      null as unknown as b3BodyId,
    );
    engine.populate(world);
    engine.populate(ghostWorld);
    engine.ball = engine.createBall(world, { x: 0, y: 0.2, z: -2.6 }, true);
    engine.ghostBall = engine.createBall(ghostWorld, { x: 0, y: 0.2, z: -2.6 }, false);
    engine.windmill = engine.createWindmill(world, { x: 0, y: 0.35, z: 1.35 });
    engine.ghostMill = engine.createWindmill(ghostWorld, { x: 0, y: 0.35, z: 1.35 });
    engine.cupSensors = [
      { pos: { x: 0.15, y: 0.02, z: -0.35 }, radius: 0.1, hole: 1 },
      { pos: { x: -0.25, y: 0.02, z: 2.45 }, radius: 0.1, hole: 2 },
      { pos: { x: -1.15, y: 0.02, z: 3.55 }, radius: 0.1, hole: 3 },
    ];
    engine.ready = true;
    return engine;
  }

  get isReady() {
    return this.ready;
  }

  private material(friction: number, restitution: number, rollingResistance = 0.03) {
    const mat = this.b3.b3DefaultSurfaceMaterial();
    mat.friction = friction;
    mat.restitution = restitution;
    mat.rollingResistance = rollingResistance;
    return mat;
  }

  private createStaticBox(
    world: b3WorldId,
    pos: Vec3,
    half: { x: number; y: number; z: number },
    rotX = 0,
    rotY = 0,
    friction = 0.55,
    restitution = 0.08,
    rollingResistance = 0.04,
  ) {
    const def = this.b3.b3DefaultBodyDef();
    def.type = this.b3.b3BodyType.b3_staticBody;
    def.position = { x: pos.x, y: pos.y, z: pos.z };
    def.rotation = eulerToQuat(rotX, rotY);
    const body = this.b3.b3CreateBody(world, def);
    const shapeDef = this.b3.b3DefaultShapeDef();
    shapeDef.baseMaterial = this.material(friction, restitution, rollingResistance);
    shapeDef.density = 0;
    this.b3.b3CreateBoxShape(body, shapeDef, half.x, half.y, half.z);
    return body;
  }

  private populate(world: b3WorldId) {
    for (const box of buildCourseColliders()) {
      const friction = box.kind === "felt" ? 0.2 : box.kind === "ramp" ? 0.16 : 0.38;
      const restitution = box.kind === "felt" ? 0.12 : box.kind === "ramp" ? 0.1 : 0.42;
      const roll = box.kind === "felt" ? 0.028 : box.kind === "ramp" ? 0.02 : 0.045;
      this.createStaticBox(
        world,
        box.pos,
        box.half,
        box.rotX ?? 0,
        box.rotY ?? 0,
        friction,
        restitution,
        roll,
      );
    }

    for (const cup of [
      { x: 0.15, z: -0.35 },
      { x: -0.25, z: 2.45 },
      { x: -1.15, z: 3.55 },
    ]) {
      const r = 0.12;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this.createStaticBox(
          world,
          { x: cup.x + Math.cos(a) * r, y: 0.02, z: cup.z + Math.sin(a) * r },
          { x: 0.04, y: 0.025, z: 0.04 },
          0,
          0,
          0.4,
          0.04,
        );
      }
    }
  }

  private createBall(world: b3WorldId, pos: Vec3, bullet: boolean): b3BodyId {
    const def = this.b3.b3DefaultBodyDef();
    def.type = this.b3.b3BodyType.b3_dynamicBody;
    def.position = { x: pos.x, y: pos.y, z: pos.z };
    def.rotation = identityQuat();
    def.linearDamping = 0.04;
    def.angularDamping = 0.1;
    def.isBullet = bullet;
    def.isAwake = true;
    def.enableSleep = true;
    def.sleepThreshold = 0.035;
    const body = this.b3.b3CreateBody(world, def);
    const shapeDef = this.b3.b3DefaultShapeDef();
    shapeDef.density = 1.4;
    shapeDef.baseMaterial = this.material(0.22, 0.42, 0.018);
    this.b3.b3CreateSphereShape(body, shapeDef, {
      center: { x: 0, y: 0, z: 0 },
      radius: BALL_RADIUS,
    });
    return body;
  }

  private createWindmill(world: b3WorldId, pos: Vec3): b3BodyId {
    const def = this.b3.b3DefaultBodyDef();
    def.type = this.b3.b3BodyType.b3_kinematicBody;
    def.position = { x: pos.x, y: pos.y, z: pos.z };
    def.rotation = identityQuat();
    const body = this.b3.b3CreateBody(world, def);
    const shapeDef = this.b3.b3DefaultShapeDef();
    shapeDef.density = 0;
    shapeDef.baseMaterial = this.material(0.3, 0.35);
    this.b3.b3CreateBoxShape(body, shapeDef, 0.55, 0.05, 0.08);
    this.b3.b3CreateBoxShape(body, shapeDef, 0.08, 0.05, 0.55);
    return body;
  }

  private resetBody(body: b3BodyId, pos: Vec3) {
    this.b3.b3Body_SetTransform(body, { x: pos.x, y: pos.y, z: pos.z }, identityQuat());
    this.b3.b3Body_SetLinearVelocity(body, { x: 0, y: 0, z: 0 });
    this.b3.b3Body_SetAngularVelocity(body, { x: 0, y: 0, z: 0 });
    this.b3.b3Body_SetAwake(body, true);
  }

  resetBall(pos: Vec3) {
    this.resetBody(this.ball, pos);
  }

  private clampSpeed(body: b3BodyId) {
    const vel = this.b3.b3Body_GetLinearVelocity(body);
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    if (speed > MAX_SPEED) {
      const s = MAX_SPEED / speed;
      this.b3.b3Body_SetLinearVelocity(body, {
        x: vel.x * s,
        y: vel.y * s,
        z: vel.z * s,
      });
    }
  }

  applyShot(dir: Vec3, impulse: number, loft: number) {
    const v = shotVelocity(dir, impulse, loft);
    this.applyExactVelocity(v);
  }

  /** Frozen vector — preview and live both call this after a body reset. */
  applyExactVelocity(v: Vec3) {
    this.b3.b3Body_SetLinearVelocity(this.ball, { x: v.x, y: v.y, z: v.z });
    this.b3.b3Body_SetAngularVelocity(this.ball, { x: 0, y: 0, z: 0 });
    this.b3.b3Body_SetAwake(this.ball, true);
    this.clampSpeed(this.ball);
  }

  /** Full reset + frozen velocity. This is the only live-fire path that matches the ghost. */
  launch(origin: Vec3, velocity: Vec3) {
    this.resetBody(this.ball, origin);
    this.applyExactVelocity(velocity);
  }

  snapBall(pos: Vec3) {
    this.resetBody(this.ball, pos);
  }

  /**
   * Run the same Box3D WASM solver on a ghost copy of the course.
   * Returns sampled ball positions for the aim/power currently dialed in.
   */
  predictShot(opts: {
    origin: Vec3;
    dir: Vec3;
    impulse: number;
    loft: number;
    millAngle: number;
    cup: Vec3;
    lowPower?: boolean;
  }): PredictedPath {
    const empty: PredictedPath = {
      points: [],
      speeds: [],
      sunk: false,
      rest: copyVec(opts.origin),
    };
    if (!this.ready) return empty;

    this.resetBody(this.ghostBall, opts.origin);
    // Freeze the mill so the preview is deterministic (no left/right drift)
    if (this.ghostMill) {
      const q = eulerToQuat(0, 0);
      const p = this.b3.b3Body_GetPosition(this.ghostMill);
      this.b3.b3Body_SetTransform(this.ghostMill, p, q);
    }

    const v0 = shotVelocity(opts.dir, opts.impulse, opts.loft);
    this.b3.b3Body_SetLinearVelocity(this.ghostBall, v0);
    this.b3.b3Body_SetAngularVelocity(this.ghostBall, { x: 0, y: 0, z: 0 });
    this.b3.b3Body_SetAwake(this.ghostBall, true);
    this.clampSpeed(this.ghostBall);

    const maxSteps = Math.ceil(3 / FIXED_DT); // 180
    const sub = 4;
    const sampleEvery = Math.round(PREVIEW_DT / FIXED_DT); // 3 frames
    const points: Vec3[] = [copyVec(opts.origin)];
    const speeds: number[] = [0];
    let sunk = false;
    let rest = copyVec(opts.origin);

    for (let i = 0; i < maxSteps; i++) {
      this.b3.b3World_Step(this.ghostWorld, FIXED_DT, sub);
      this.clampSpeed(this.ghostBall);
      const vel = this.b3.b3Body_GetLinearVelocity(this.ghostBall);
      const speed = Math.hypot(vel.x, vel.y, vel.z);
      const p = this.b3.b3Body_GetPosition(this.ghostBall);
      rest = { x: p.x, y: p.y, z: p.z };
      if ((i + 1) % sampleEvery === 0) {
        points.push(copyVec(rest));
        speeds.push(speed);
      }
      const dx = p.x - opts.cup.x;
      const dz = p.z - opts.cup.z;
      if (Math.hypot(dx, dz) < 0.11 && p.y < 0.18 && speed < 1.6) {
        sunk = true;
        rest = { x: opts.cup.x, y: 0.04, z: opts.cup.z };
        points.push(copyVec(rest));
        speeds.push(speed);
        break;
      }
      if (p.y < -1.4 || Math.abs(p.x) > 3.3 || p.z < -4.3 || p.z > 5.3) {
        if ((i + 1) % sampleEvery !== 0) {
          points.push(copyVec(rest));
          speeds.push(speed);
        }
        break;
      }
      if (i > 18 && speed < 0.04) {
        if ((i + 1) % sampleEvery !== 0) {
          points.push(copyVec(rest));
          speeds.push(speed);
        }
        break;
      }
    }

    return { points, speeds, sunk, rest };
  }

  step(dt: number, windmillAngle: number, freezeMill = false) {
    if (!this.ready) return;
    this.accumulator += Math.min(dt, 0.05);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      if (this.windmill) {
        const q = eulerToQuat(0, freezeMill ? 0 : windmillAngle);
        const p = this.b3.b3Body_GetPosition(this.windmill);
        this.b3.b3Body_SetTransform(this.windmill, p, q);
      }
      this.b3.b3World_Step(this.world, FIXED_DT, 4);

      const vel = this.b3.b3Body_GetLinearVelocity(this.ball);
      const speed = Math.hypot(vel.x, vel.y, vel.z);
      if (speed > MAX_SPEED) {
        const s = MAX_SPEED / speed;
        this.b3.b3Body_SetLinearVelocity(this.ball, {
          x: vel.x * s,
          y: vel.y * s,
          z: vel.z * s,
        });
      }

      this.accumulator -= FIXED_DT;
      steps++;
    }
  }

  getBallState(): PhysicsBallState {
    const p = this.b3.b3Body_GetPosition(this.ball);
    const v = this.b3.b3Body_GetLinearVelocity(this.ball);
    const q = this.b3.b3Body_GetRotation(this.ball);
    const speed = Math.hypot(v.x, v.y, v.z);
    return {
      position: { x: p.x, y: p.y, z: p.z },
      velocity: { x: v.x, y: v.y, z: v.z },
      rotation: { x: q.v.x, y: q.v.y, z: q.v.z, w: q.s },
      asleep: speed < 0.04,
    };
  }

  checkCup(hole: number): boolean {
    const sensor = this.cupSensors.find((c) => c.hole === hole);
    if (!sensor) return false;
    const p = this.b3.b3Body_GetPosition(this.ball);
    const v = this.b3.b3Body_GetLinearVelocity(this.ball);
    const speed = Math.hypot(v.x, v.y, v.z);
    const dx = p.x - sensor.pos.x;
    const dz = p.z - sensor.pos.z;
    const dist = Math.hypot(dx, dz);
    return dist < sensor.radius && p.y < 0.16 && speed < 1.5;
  }

  dispose() {
    try {
      this.b3.b3DestroyWorld(this.world);
    } catch {
      /* ignore */
    }
    try {
      this.b3.b3DestroyWorld(this.ghostWorld);
    } catch {
      /* ignore */
    }
    this.ready = false;
  }
}

export const BALL_R = BALL_RADIUS;
