import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, SoftShadows } from "@react-three/drei";
import { useXRInputSourceStates, useXR, XROrigin } from "@react-three/xr";
import * as THREE from "three";
import { Course, CueOrbitGuide, PhysicsPathPreview, ChainGhosts } from "./Course";
import { Ball } from "./Ball";
import { WeaponPreview } from "./Weapons";
import { WorldDecor } from "./WorldDecor";
import { JuiceFX } from "./JuiceFX";
import { Box3DWorld } from "@/lib/physics/box3dWorld";
import { getHole } from "@/lib/game/holes";
import { useGameStore, WEAPON_META, type ShotState } from "@/lib/game/store";
import { computeShot, copyVec, nextShotId } from "@/lib/game/shot";
import { sfx } from "@/lib/game/audio";
import { juiceBus, TraumaShake, expLerp } from "@/lib/game/juice";

type Props = {
  physicsRef: React.MutableRefObject<Box3DWorld | null>;
  onRequestHoleReset: React.MutableRefObject<(() => void) | null>;
};

type DragMode = "orbit" | "power" | "pending";

type DragState = {
  active: boolean;
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  startOnBall: boolean;
  startOnWeapon: boolean;
  yaw0: number;
  viewYaw0: number;
  pitch0: number;
  maxDist: number;
};

type PendingStrike = {
  power: number;
  t: number;
  windDur: number;
  holdDur: number;
  impactAt: number;
  fired: boolean;
};

const CLICK_PX = 16;
const CUE_DEADZONE_PX = 24;
const CUE_FULL_POWER_PX = 150;
const BALL_HIT_PX = 56;
const CUE_ORB_HIT_PX = 78;
const WEAPON_NEAR_BALL_PX = 88;

const _up = new THREE.Vector3(0, 1, 0);
const _rollQ = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _proj = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _pullWorld = new THREE.Vector3();

function placeCamera(
  camera: THREE.Camera,
  eye: THREE.Vector3,
  target: THREE.Vector3,
  roll = 0,
) {
  camera.up.copy(_up);
  camera.position.copy(eye);
  camera.lookAt(target);
  if (Math.abs(roll) > 1e-5) {
    _rollQ.setFromAxisAngle(_zAxis, roll);
    camera.quaternion.multiply(_rollQ);
  }
  camera.up.copy(_up);
  camera.updateMatrixWorld(true);
}

function overviewCamPose(
  ball: THREE.Vector3,
  cup: { x: number; y: number; z: number },
  viewYaw: number,
  orbitPitch: number,
  outEye: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  const tx = THREE.MathUtils.lerp(ball.x, cup.x, 0.45);
  const tz = THREE.MathUtils.lerp(ball.z, cup.z, 0.45);
  const orbit = viewYaw + Math.PI + 0.55;
  const radius = 5.4 - orbitPitch * 0.5;
  const height = THREE.MathUtils.clamp(4.3 + orbitPitch * 2.0, 2.8, 7.5);
  outEye.set(tx + Math.sin(orbit) * radius, height, tz + Math.cos(orbit) * radius);
  outTarget.set(tx, 0.05, tz);
}

function focusCamPose(
  ball: THREE.Vector3,
  viewYaw: number,
  orbitPitch: number,
  outEye: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  const orbit = viewYaw + Math.PI + 0.35;
  const radius = THREE.MathUtils.clamp(2.35 - orbitPitch * 0.35, 1.6, 3.2);
  const height = THREE.MathUtils.clamp(1.55 + orbitPitch * 1.4, 0.95, 3.2);
  outEye.set(
    ball.x + Math.sin(orbit) * radius,
    ball.y + height,
    ball.z + Math.cos(orbit) * radius,
  );
  outTarget.set(ball.x, ball.y + 0.04, ball.z);
}

function chainReplayCamPose(
  origin: { x: number; y: number; z: number },
  rest: { x: number; y: number; z: number },
  yaw: number,
  flying: boolean,
  ball: THREE.Vector3,
  outEye: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  const dx = rest.x - origin.x;
  const dz = rest.z - origin.z;
  const travel = Math.hypot(dx, dz);
  let backX: number;
  let backZ: number;
  if (travel > 0.12) {
    backX = -dx / travel;
    backZ = -dz / travel;
  } else {
    backX = Math.sin(yaw + Math.PI);
    backZ = Math.cos(yaw + Math.PI);
  }

  const anchorX = flying ? ball.x : origin.x;
  const anchorY = flying ? ball.y : Math.max(origin.y, 0.08);
  const anchorZ = flying ? ball.z : origin.z;

  const radius = THREE.MathUtils.clamp(2.1 + travel * 0.28, 2.0, 4.2);
  const height = THREE.MathUtils.clamp(1.35 + travel * 0.12, 1.2, 2.6);

  outEye.set(anchorX + backX * radius, anchorY + height, anchorZ + backZ * radius);

  const lookT = flying ? 0.35 : 0.55;
  const lx = THREE.MathUtils.lerp(anchorX, rest.x, lookT);
  const ly = THREE.MathUtils.lerp(anchorY, Math.max(rest.y, 0.06), lookT * 0.6);
  const lz = THREE.MathUtils.lerp(anchorZ, rest.z, lookT);
  outTarget.set(lx, ly, lz);
}

function flagOf(obj: THREE.Object3D | null, key: "ball" | "weapon" | "cueOrb"): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (o.userData?.[key]) return true;
    o = o.parent;
  }
  return false;
}

function worldToScreen(
  camera: THREE.Camera,
  pos: THREE.Vector3,
  dom: HTMLElement,
): { x: number; y: number; ok: boolean } {
  const rect = dom.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0, ok: false };
  _proj.copy(pos).project(camera);
  if (_proj.z >= 1 || _proj.z <= -1) return { x: 0, y: 0, ok: false };
  return {
    x: (_proj.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-_proj.y * 0.5 + 0.5) * rect.height + rect.top,
    ok: true,
  };
}

type HitKind = { ball: boolean; weapon: boolean };

function hitPick(
  camera: THREE.Camera,
  scene: THREE.Scene,
  clientX: number,
  clientY: number,
  dom: HTMLElement,
): HitKind {
  const rect = dom.getBoundingClientRect();
  const none = { ball: false, weapon: false };
  if (rect.width <= 0 || rect.height <= 0) return none;

  const result: HitKind = { ball: false, weapon: false };

  const orb = (scene.userData as { cueOrbPos?: THREE.Vector3 | null }).cueOrbPos;
  if (orb) {
    const sp = worldToScreen(camera, orb, dom);
    if (sp.ok && Math.hypot(clientX - sp.x, clientY - sp.y) < CUE_ORB_HIT_PX) {
      result.weapon = true;
    }
  }

  const ball = (scene.userData as { ballPos?: THREE.Vector3 }).ballPos;
  const selected = useGameStore.getState().ballSelected;
  if (selected && ball) {
    const sp = worldToScreen(camera, ball, dom);
    if (sp.ok && Math.hypot(clientX - sp.x, clientY - sp.y) < WEAPON_NEAR_BALL_PX) {
      result.weapon = true;
    }
  }

  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, camera);
  const hits = _raycaster.intersectObjects(scene.children, true);
  for (const h of hits) {
    if (flagOf(h.object, "cueOrb") || flagOf(h.object, "weapon")) {
      result.weapon = true;
      break;
    }
    if (flagOf(h.object, "ball") && !result.weapon) {
      result.ball = true;
      // keep scanning in case a weapon is behind the oversized ball glow
    }
  }

  if (!result.ball) {
    const ball = (scene.userData as { ballPos?: THREE.Vector3 }).ballPos;
    if (ball) {
      const sp = worldToScreen(camera, ball, dom);
      if (sp.ok && Math.hypot(clientX - sp.x, clientY - sp.y) < BALL_HIT_PX) {
        result.ball = true;
      }
    }
  }
  return result;
}

/**
 * Circular aim — ball is the center of the control circle (all weapons).
 * Pointer relative to the ball places the weapon on that side.
 * Shot aim is opposite (drag the grab orb up → hit down the table).
 * Distance from the ball is power.
 */
function applyCircularAim(
  camera: THREE.Camera,
  ball: THREE.Vector3,
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  setAim: (yaw: number, pitch?: number) => void,
  setPower: (p: number) => void,
  setShot: (s: ShotState) => void,
) {
  const sp = worldToScreen(camera, ball, dom);
  if (!sp.ok) return;

  const sdx = clientX - sp.x;
  const sdy = clientY - sp.y;
  const screenDist = Math.hypot(sdx, sdy);

  camera.getWorldDirection(_camLook);
  _camLook.y = 0;
  if (_camLook.lengthSq() < 1e-6) _camLook.set(0, 0, -1);
  else _camLook.normalize();

  _camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  _camRight.y = 0;
  if (_camRight.lengthSq() < 1e-6) _camRight.set(1, 0, 0);
  else _camRight.normalize();

  _pullWorld
    .set(0, 0, 0)
    .addScaledVector(_camRight, sdx)
    .addScaledVector(_camLook, -sdy);
  _pullWorld.y = 0;

  if (_pullWorld.lengthSq() > 1e-6) {
    _pullWorld.normalize();
    setAim(Math.atan2(-_pullWorld.x, -_pullWorld.z), useGameStore.getState().aimPitch);
  }

  const pull = Math.max(
    0,
    Math.min(1, (screenDist - CUE_DEADZONE_PX) / (CUE_FULL_POWER_PX - CUE_DEADZONE_PX)),
  );
  if (pull > 0.02) {
    setShot("charging");
    setPower(pull);
  } else {
    setShot("aiming");
    setPower(0);
  }
  juiceBus.emit({ type: "charge", power: pull });
  if (useGameStore.getState().audioEnabled) {
    const yaw = useGameStore.getState().aimYaw;
    if (pull > 0.02) sfx.pull(pull, yaw);
    else sfx.pull(0, yaw);
  }
}

export function GameScene({ physicsRef, onRequestHoleReset }: Props) {
  const phase = useGameStore((s) => s.phase);
  const shot = useGameStore((s) => s.shot);
  const setShot = useGameStore((s) => s.setShot);
  const weapon = useGameStore((s) => s.weapon);
  const setWeapon = useGameStore((s) => s.setWeapon);
  const power = useGameStore((s) => s.power);
  const setPower = useGameStore((s) => s.setPower);
  const aimYaw = useGameStore((s) => s.aimYaw);
  const aimPitch = useGameStore((s) => s.aimPitch);
  const setAim = useGameStore((s) => s.setAim);
  const ballSelected = useGameStore((s) => s.ballSelected);
  const setBallSelected = useGameStore((s) => s.setBallSelected);
  const setStrikeT = useGameStore((s) => s.setStrikeT);
  const stats = useGameStore((s) => s.stats);
  const registerStroke = useGameStore((s) => s.registerStroke);
  const completeHole = useGameStore((s) => s.completeHole);
  const resetShotIdle = useGameStore((s) => s.resetShotIdle);
  const tracking = useGameStore((s) => s.tracking);
  const trackingMode = useGameStore((s) => s.trackingMode);
  const audioEnabled = useGameStore((s) => s.audioEnabled);
  const lowPower = useGameStore((s) => s.lowPower);
  const setMessage = useGameStore((s) => s.setMessage);
  const setPhase = useGameStore((s) => s.setPhase);
  const hitSerial = useGameStore((s) => s.hitSerial);
  const playMode = useGameStore((s) => s.playMode);
  const chain = useGameStore((s) => s.chain);
  const chainPlaying = useGameStore((s) => s.chainPlaying);
  const chainSetupOrigin = useGameStore((s) => s.chainSetupOrigin);
  const lockSerial = useGameStore((s) => s.lockSerial);
  const chainPlaySerial = useGameStore((s) => s.chainPlaySerial);
  const editingIndex = useGameStore((s) => s.editingIndex);
  const editChainShot = useGameStore((s) => s.editChainShot);

  const ballPos = useRef(new THREE.Vector3(0, 0.12, -2.6));
  const ballAsleep = useRef(true);
  const ballSpeed = useRef(0);
  const prevSpeed = useRef(0);
  const prevVel = useRef({ x: 0, y: 0, z: 0 });
  const windmillAngle = useRef(0);
  const sinkLock = useRef(false);
  const chargeFromTracking = useRef(false);
  const lastPinch = useRef(0);
  const flyingFrames = useRef(0);
  const shake = useRef(new TraumaShake());
  const camBase = useRef(new THREE.Vector3(3.5, 4.2, -4.0));
  const camPos = useRef(new THREE.Vector3(3.5, 4.2, -4.0));
  const lookTarget = useRef(new THREE.Vector3(0, 0.1, 0.5));
  const desiredEye = useRef(new THREE.Vector3());
  const desiredLook = useRef(new THREE.Vector3());
  const viewYaw = useRef(0);
  const orbitPitch = useRef(0);
  const camLocked = useRef(false);
  const lockedEye = useRef(new THREE.Vector3());
  const lockedLook = useRef(new THREE.Vector3());
  const keys = useRef(new Set<string>());
  const spaceHeld = useRef(false);
  const gamepadFired = useRef(false);
  const padAHeld = useRef(false);
  const drag = useRef<DragState | null>(null);
  const lastPhase = useRef(phase);
  const hoverShot = useRef(false);
  const pendingStrike = useRef<PendingStrike | null>(null);
  const selectedRef = useRef(false);
  const predPath = useRef<{ x: number; y: number; z: number }[]>([]);
  const predSunk = useRef(false);
  const predRest = useRef<{ x: number; y: number; z: number } | null>(null);
  const lastPredAt = useRef(0);
  const lastPredKey = useRef("");
  const aimPos = useRef(new THREE.Vector3(0, 0.12, -2.6));
  const restHold = useRef(0);
  const flySettle = useRef(0);

  const hole = getHole(stats.hole);
  const { camera, gl, scene } = useThree();
  const menuAngle = useRef(0.55);
  const session = useXR((xr) => xr.session);

  useEffect(() => {
    selectedRef.current = ballSelected;
  }, [ballSelected]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      shake.current.reduced = mq.matches;
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const selectBall = useCallback(() => {
    const st = useGameStore.getState();
    if (st.shot === "flying") return;
    setBallSelected(true);
    selectedRef.current = true;
    viewYaw.current = st.aimYaw;
    orbitPitch.current = 0.15;
    camLocked.current = false;
    setMessage(
      st.playMode === "chain"
        ? "Aim this shot — Set shot to queue a hit at the landing"
        : "Drag around the ball to aim · pull away for power · then Hit now",
    );
    if (st.audioEnabled) sfx.ui();
  }, [setBallSelected, setMessage]);

  const deselectBall = useCallback(() => {
    setBallSelected(false);
    selectedRef.current = false;
    camLocked.current = false;
    pendingStrike.current = null;
    setStrikeT(0);
    resetShotIdle();
    sfx.pullEnd();
    setMessage("Click the ball to take your shot · drag empty space to look around");
  }, [setBallSelected, setStrikeT, resetShotIdle, setMessage]);

  const placeTee = useCallback(() => {
    const h = getHole(useGameStore.getState().stats.hole);
    physicsRef.current?.resetBall(h.tee);
    ballPos.current.set(h.tee.x, h.tee.y, h.tee.z);
    sinkLock.current = false;
    flyingFrames.current = 0;
    camLocked.current = false;
    pendingStrike.current = null;
    setStrikeT(0);
    setBallSelected(false);
    selectedRef.current = false;
    resetShotIdle();
    const dx = h.cup.x - h.tee.x;
    const dz = h.cup.z - h.tee.z;
    const yaw = Math.atan2(dx, dz);
    setAim(yaw, 0.08);
    viewYaw.current = yaw;
    orbitPitch.current = 0;
    overviewCamPose(
      ballPos.current,
      h.cup,
      viewYaw.current,
      orbitPitch.current,
      desiredEye.current,
      desiredLook.current,
    );
    camBase.current.copy(desiredEye.current);
    lookTarget.current.copy(desiredLook.current);
    setMessage(`Hole ${h.id} — ${h.name}. Click the ball to play.`);
  }, [physicsRef, resetShotIdle, setAim, setMessage, setBallSelected, setStrikeT]);

  useEffect(() => {
    onRequestHoleReset.current = placeTee;
  }, [onRequestHoleReset, placeTee]);

  useEffect(() => {
    if (phase === "playing") placeTee();
  }, [phase, stats.hole, placeTee]);

  useEffect(() => {
    camBase.current.set(3.5, 4.2, -4.0);
    lookTarget.current.set(0, 0.1, 0.5);
    placeCamera(camera, camBase.current, lookTarget.current, 0);
  }, [camera]);

  const applyImpulse = useCallback(
    (pwr: number) => {
      const world = physicsRef.current;
      if (!world) return;
      const st = useGameStore.getState();
      if (st.shot === "flying") return;
      if (!(st.playMode === "chain" && st.chainPlaying) && st.weaponUses[st.weapon] <= 0) {
        setMessage(`No uses left on ${WEAPON_META[st.weapon].label}`);
        return;
      }

      if (st.playMode === "chain" && st.chainPlaying) {
        const q = st.chain[st.chainPlayIndex];
        if (!q) return;
        world.launch(q.origin, q.velocity);
      } else {
        const computed = computeShot(st.weapon, st.aimYaw, st.aimPitch, pwr);
        const origin = {
          x: ballPos.current.x,
          y: ballPos.current.y,
          z: ballPos.current.z,
        };
        world.launch(origin, computed.velocity);
      }

      flyingFrames.current = 0;
      camLocked.current = false;
      registerStroke();
      if (st.audioEnabled) {
        sfx.pullEnd();
        sfx.hit(pwr);
        sfx.whoosh();
      }
      juiceBus.emit({
        type: "hit",
        power: pwr,
        x: ballPos.current.x,
        y: ballPos.current.y,
        z: ballPos.current.z,
      });
      shake.current.add(0.25 + pwr * 0.45);
      setPower(0);
    },
    [physicsRef, registerStroke, setPower],
  );

  const fireShot = useCallback(() => {
    const st = useGameStore.getState();
    if (st.shot === "flying" || pendingStrike.current) return;
    if (restHold.current > 0 && restHold.current < 1) return;
    if (!(st.playMode === "chain" && st.chainPlaying) && st.weaponUses[st.weapon] <= 0) {
      setMessage(`No uses left on ${WEAPON_META[st.weapon].label}`);
      return;
    }
    const chainReplay = st.playMode === "chain" && st.chainPlaying;
    let pwr = Math.max(st.power, 0.05);
    if (chainReplay) {
      const q = st.chain[st.chainPlayIndex];
      if (q) pwr = Math.max(q.power, 0.05);
      setPower(0);
    }
    const impactAt =
      st.weapon === "cue" ? 0.07 : st.weapon === "club" ? 0.15 : 0.13;
    pendingStrike.current = {
      power: pwr,
      t: 0,
      windDur: chainReplay ? 0.42 + pwr * 0.38 : 0,
      holdDur: chainReplay ? 0.1 : 0,
      impactAt,
      fired: false,
    };
    setShot("charging");
    setStrikeT(chainReplay ? 0 : 0.001);
    if (!chainReplay) setPower(pwr);
  }, [setPower, setShot, setStrikeT]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === "Digit1") setWeapon("cue");
      if (e.code === "Digit2") setWeapon("club");
      if (e.code === "Digit3") setWeapon("trebuchet");
      if (e.code === "KeyR") placeTee();
      if (e.code === "Escape") {
        const st = useGameStore.getState();
        if (st.ballSelected && st.phase === "playing") {
          deselectBall();
          return;
        }
        if (st.phase === "playing") setPhase("paused");
        else if (st.phase === "paused") setPhase("playing");
      }
      if (e.code === "Space") {
        const st = useGameStore.getState();
        if (!st.ballSelected) selectBall();
        else if (st.shot === "ready" && st.power > 0.05) {
          if (st.playMode === "chain" && !st.chainPlaying) st.requestLockShot();
          else st.requestHit();
        } else {
          spaceHeld.current = true;
        }
      }
      if (e.code === "KeyH" || e.code === "Enter") {
        const st = useGameStore.getState();
        if (st.playMode === "chain" && !st.chainPlaying) {
          if (st.chain.length > 0) st.requestChainPlay();
          else st.requestLockShot();
        } else {
          st.requestHit();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      if (e.code === "Space") {
        spaceHeld.current = false;
        const st = useGameStore.getState();
        if (
          st.phase === "playing" &&
          st.ballSelected &&
          (st.shot === "charging" || st.shot === "aiming") &&
          st.power > 0.05
        ) {
          setShot("ready");
          camLocked.current = false;
          sfx.pullEnd();
          setMessage("Preview locked — press Hit now");
        }
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fireShot, placeTee, setPhase, setWeapon, selectBall, deselectBall]);

  useEffect(() => {
    if (hitSerial <= 0) return;
    const st = useGameStore.getState();
    if (st.playMode === "chain" && st.chainPlaying) return;
    if (
      st.phase === "playing" &&
      st.ballSelected &&
      st.power > 0.05 &&
      st.shot !== "flying" &&
      !pendingStrike.current
    ) {
      fireShot();
    }
  }, [hitSerial, fireShot]);

  useEffect(() => {
    if (lockSerial <= 0) return;
    const st = useGameStore.getState();
    if (st.playMode !== "chain" || st.chainPlaying) return;
    const pts = predPath.current;
    if (pts.length < 2) {
      setMessage("Aim and charge a shot first so we can see the landing");
      return;
    }
    const origin = st.chainSetupOrigin
      ? copyVec(st.chainSetupOrigin)
      : {
          x: ballPos.current.x,
          y: ballPos.current.y,
          z: ballPos.current.z,
        };
    const computed = computeShot(st.weapon, st.aimYaw, st.aimPitch, st.power);
    const last = pts[pts.length - 1]!;
    const restSrc = predRest.current ?? last;
    st.lockChainShot({
      id: nextShotId(),
      weapon: st.weapon,
      yaw: st.aimYaw,
      pitch: st.aimPitch,
      power: st.power,
      impulse: computed.impulse,
      loft: computed.loft,
      velocity: computed.velocity,
      origin,
      rest: { x: restSrc.x, y: Math.max(restSrc.y, 0.06), z: restSrc.z },
      path: pts.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      sunk: predSunk.current,
    });
    predPath.current = [];
    predSunk.current = false;
    predRest.current = null;
    lastPredKey.current = "";
    if (st.audioEnabled) sfx.ui();
  }, [lockSerial, setMessage]);

  useEffect(() => {
    if (chainPlaySerial <= 0) return;
    const st = useGameStore.getState();
    if (st.playMode !== "chain" || st.chainPlaying) return;
    if (
      st.shot === "ready" &&
      st.power > 0.05 &&
      st.weaponUses[st.weapon] > 0 &&
      predPath.current.length > 1
    ) {
      const origin = st.chainSetupOrigin
        ? copyVec(st.chainSetupOrigin)
        : {
            x: ballPos.current.x,
            y: ballPos.current.y,
            z: ballPos.current.z,
          };
      const last = predPath.current[predPath.current.length - 1]!;
      const restSrc = predRest.current ?? last;
      const computed = computeShot(st.weapon, st.aimYaw, st.aimPitch, st.power);
      st.lockChainShot({
        id: nextShotId(),
        weapon: st.weapon,
        yaw: st.aimYaw,
        pitch: st.aimPitch,
        power: st.power,
        impulse: computed.impulse,
        loft: computed.loft,
        velocity: computed.velocity,
        origin,
        rest: { x: restSrc.x, y: Math.max(restSrc.y, 0.06), z: restSrc.z },
        path: predPath.current.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        sunk: predSunk.current,
      });
    }
    const ok = useGameStore.getState().startChainPlay();
    if (!ok) return;
    restHold.current = 0;
    flyingFrames.current = 0;
    camLocked.current = false;
    {
      const st2 = useGameStore.getState();
      const q0 = st2.chain[0];
      if (q0) {
        chainReplayCamPose(
          q0.origin,
          q0.rest,
          q0.yaw,
          false,
          ballPos.current,
          desiredEye.current,
          desiredLook.current,
        );
        camBase.current.copy(desiredEye.current);
        lookTarget.current.copy(desiredLook.current);
        viewYaw.current = q0.yaw;
      }
    }
    fireShot();
  }, [chainPlaySerial, fireShot]);

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      const st = useGameStore.getState();
      if (st.phase !== "playing" && st.phase !== "menu") return;
      if ((e.target as HTMLElement)?.closest?.(".hud-layer, .tracking-dock")) return;
      if (st.shot === "flying") return;
      if (pendingStrike.current) return;

      const hit =
        st.phase === "playing"
          ? hitPick(camera, scene, e.clientX, e.clientY, el)
          : { ball: false, weapon: false };

      let mode: DragMode = "pending";
      if (st.phase === "menu") mode = "orbit";
      else if (st.ballSelected && hit.weapon) {
        if (st.weaponUses[st.weapon] <= 0) {
          setMessage(`No uses left on ${WEAPON_META[st.weapon].label}`);
          mode = "orbit";
        } else {
          mode = "power";
        }
      }

      drag.current = {
        active: true,
        mode,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startOnBall: hit.ball,
        startOnWeapon: hit.weapon,
        yaw0: st.aimYaw,
        viewYaw0: viewYaw.current,
        pitch0: orbitPitch.current,
        maxDist: 0,
      };
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = mode === "power" ? "grabbing" : "grabbing";

      if (mode === "power") {
        camLocked.current = true;
        lockedEye.current.copy(camBase.current);
        lockedLook.current.copy(lookTarget.current);
        setShot("aiming");
        setStrikeT(0);
        setMessage("Drag around the ball to aim · pull away for power · then Hit now");
        applyCircularAim(
          camera,
          aimPos.current,
          e.clientX,
          e.clientY,
          el,
          setAim,
          setPower,
          setShot,
        );
      }
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d?.active || d.pointerId !== e.pointerId) {
        if (useGameStore.getState().phase === "playing" && !drag.current?.active) {
          const hit = hitPick(camera, scene, e.clientX, e.clientY, el);
          const over = useGameStore.getState().ballSelected ? hit.weapon : hit.ball;
          if (over !== hoverShot.current) {
            hoverShot.current = over;
            el.style.cursor = over ? (hit.weapon ? "grab" : "pointer") : "default";
          }
        }
        return;
      }

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const dist = Math.hypot(dx, dy);
      d.maxDist = Math.max(d.maxDist, dist);

      if (d.mode === "pending" && dist > CLICK_PX) {
        d.mode = "orbit";
        camLocked.current = false;
      }

      if (d.mode === "power") {
        applyCircularAim(
          camera,
          aimPos.current,
          e.clientX,
          e.clientY,
          el,
          setAim,
          setPower,
          setShot,
        );
      } else if (d.mode === "orbit") {
        viewYaw.current = d.viewYaw0 - dx * 0.007;
        orbitPitch.current = THREE.MathUtils.clamp(d.pitch0 + dy * 0.004, -0.45, 0.9);
        if (useGameStore.getState().phase === "menu") {
          menuAngle.current = viewYaw.current;
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d?.active || d.pointerId !== e.pointerId) return;
      d.active = false;
      try {
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      el.style.cursor = hoverShot.current ? "grab" : "default";

      const st = useGameStore.getState();
      const isClick = d.maxDist < CLICK_PX;

      if (d.mode === "power") {
        if (st.power > 0.05) {
          setShot("ready");
          camLocked.current = false;
          sfx.pullEnd();
          setMessage("Preview locked — press Hit now to strike");
        } else {
          sfx.pullEnd();
          camLocked.current = false;
          resetShotIdle();
          setMessage("Drag around the ball to aim · pull away for power · then Hit now");
        }
        return;
      }

      if (isClick && st.phase === "playing") {
        if (d.startOnBall && !st.ballSelected) {
          selectBall();
          return;
        }
        if (!d.startOnWeapon && st.ballSelected) {
          deselectBall();
          return;
        }
        if (d.startOnWeapon && st.ballSelected) {
          setMessage("Drag around the ball to aim · pull away for power");
          return;
        }
      }

      if (d.mode === "orbit" && st.phase === "playing") {
        setMessage(
          st.ballSelected
            ? "Drag around the ball to aim · pull away for power · elsewhere to look around"
            : "Click the ball to play · drag to look around",
        );
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.style.cursor = "";
    };
  }, [
    gl,
    camera,
    scene,
    fireShot,
    resetShotIdle,
    setAim,
    setPower,
    setShot,
    setMessage,
    setStrikeT,
    selectBall,
    deselectBall,
  ]);

  const xrInputs = useXRInputSourceStates();

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const world = physicsRef.current;
    if (!world) return;

    const stNow = useGameStore.getState();
    const freezeMill =
      !!pendingStrike.current ||
      stNow.shot === "flying" ||
      stNow.chainPlaying;
    if (!freezeMill) windmillAngle.current += d * 1.25;
    world.step(d, windmillAngle.current, freezeMill);

    if (!stNow.chainPlaying && stNow.chainSetupOrigin) {
      const o = stNow.chainSetupOrigin;
      aimPos.current.set(o.x, o.y, o.z);
    } else {
      aimPos.current.copy(ballPos.current);
    }

    // Box3D WASM ghost-sim of the current aim / power
    if (
      phase === "playing" &&
      selectedRef.current &&
      (shot === "aiming" || shot === "charging" || shot === "ready") &&
      power > 0.04 &&
      !pendingStrike.current
    ) {
      const now = performance.now();
      const key = `${weapon}:${(Math.round(aimYaw * 40) / 40).toFixed(3)}:${(Math.round(aimPitch * 20) / 20).toFixed(2)}:${(Math.round(power * 25) / 25).toFixed(2)}:${stats.hole}`;
      const wait = lowPower ? 140 : 90;
      const first = predPath.current.length === 0;
      if ((key !== lastPredKey.current && now - lastPredAt.current > wait) || first) {
        lastPredKey.current = key;
        lastPredAt.current = now;
        const computed = computeShot(weapon, aimYaw, aimPitch, power);
        const pred = world.predictShot({
          origin: {
            x: aimPos.current.x,
            y: aimPos.current.y,
            z: aimPos.current.z,
          },
          dir: computed.dir,
          impulse: computed.impulse,
          loft: computed.loft,
          velocity: computed.velocity,
          millAngle: 0,
          cup: hole.cup,
          lowPower,
        });
        predPath.current = pred.points;
        predSunk.current = pred.sunk;
        predRest.current = pred.rest;
      }
    } else if (shot === "flying") {
      if (predPath.current.length) {
        predPath.current = [];
        predSunk.current = false;
        predRest.current = null;
        lastPredKey.current = "";
      }
    }

    if (pendingStrike.current) {
      const ps = pendingStrike.current;
      ps.t += d;
      const windEnd = ps.windDur;
      const holdEnd = ps.windDur + ps.holdDur;
      if (ps.windDur > 0 && ps.t < holdEnd) {
        const u = Math.min(1, ps.t / Math.max(windEnd, 0.001));
        const eased = u * u * (3 - 2 * u);
        setPower(ps.power * eased);
        setStrikeT(0);
      } else {
        const stt = ps.t - holdEnd;
        const tNorm = Math.min(1, stt / Math.max(ps.impactAt * 1.6, 0.12));
        setStrikeT(tNorm);
        if (!ps.fired && stt >= ps.impactAt) {
          ps.fired = true;
          applyImpulse(ps.power);
        }
        if (stt >= ps.impactAt * 1.85) {
          pendingStrike.current = null;
          setStrikeT(0);
        }
      }
    }

    if (phase === "playing" && ballSelected && !stNow.chainPlaying) {
      if (keys.current.has("KeyA") || keys.current.has("ArrowLeft")) {
        const yaw = aimYaw + d * 1.4;
        setAim(yaw);
        if (audioEnabled) sfx.pull(power, yaw);
      }
      if (keys.current.has("KeyD") || keys.current.has("ArrowRight")) {
        const yaw = aimYaw - d * 1.4;
        setAim(yaw);
        if (audioEnabled) sfx.pull(power, yaw);
      }
      if (spaceHeld.current && shot !== "flying" && shot !== "ready" && !pendingStrike.current) {
        if (!camLocked.current) {
          camLocked.current = true;
          lockedEye.current.copy(camBase.current);
          lockedLook.current.copy(lookTarget.current);
        }
        setShot("charging");
        const pwr = Math.min(1, power + d * 0.85);
        setPower(pwr);
        if (audioEnabled) sfx.pull(pwr, aimYaw);
      }
    }

    if (
      trackingMode === "camera" &&
      phase === "playing" &&
      ballSelected &&
      shot !== "flying" &&
      !pendingStrike.current &&
      !stNow.chainPlaying
    ) {
      const hand = tracking.hands.right ?? tracking.hands.left;
      const face = tracking.face;
      if (face) {
        const yaw = aimYaw * 0.85 + face.yaw * 0.9;
        setAim(yaw, 0.08 + face.pitch * 0.12);
        if (audioEnabled) sfx.pull(power, yaw);
      } else if (hand) {
        const yaw = (hand.x - 0.5) * 1.8;
        setAim(yaw, 0.08);
        if (audioEnabled) sfx.pull(power, yaw);
      }
      if (hand) {
        const pinch = hand.pinch;
        if (pinch > 0.55) {
          if (useGameStore.getState().shot === "ready" && !chargeFromTracking.current) {
            chargeFromTracking.current = true;
            useGameStore.getState().requestHit();
          } else if (useGameStore.getState().shot !== "ready") {
            chargeFromTracking.current = true;
            if (!camLocked.current) {
              camLocked.current = true;
              lockedEye.current.copy(camBase.current);
              lockedLook.current.copy(lookTarget.current);
            }
            setShot("charging");
            const pwr = Math.max(0, Math.min(1, (hand.y - 0.25) * 1.6));
            setPower(Math.max(power * 0.9, pwr));
            if (audioEnabled) sfx.pull(Math.max(power * 0.9, pwr), useGameStore.getState().aimYaw);
          }
        } else if (chargeFromTracking.current && lastPinch.current > 0.55 && pinch < 0.4) {
          chargeFromTracking.current = false;
          if (power > 0.08 && useGameStore.getState().shot === "charging") {
            setShot("ready");
            camLocked.current = false;
            sfx.pullEnd();
            setMessage("Preview locked — press Hit now");
          } else camLocked.current = false;
        }
        lastPinch.current = pinch;
      }
    }

    if (session && phase === "playing" && ballSelected && shot !== "flying") {
      for (const src of xrInputs) {
        const gamepad = (src as { gamepad?: Gamepad }).gamepad;
        if (!gamepad) continue;
        const trigger = gamepad.buttons[0]?.value ?? 0;
        if (trigger > 0.08) {
          const st = useGameStore.getState();
          if (st.shot === "ready" && st.power > 0.08 && !gamepadFired.current) {
            gamepadFired.current = true;
            st.requestHit();
          } else if (st.shot !== "ready") {
            setShot("charging");
            setPower(trigger);
            gamepadFired.current = false;
            if (audioEnabled) sfx.pull(trigger, aimYaw);
          }
        } else if (useGameStore.getState().shot === "charging" && useGameStore.getState().power > 0.08) {
          setShot("ready");
          camLocked.current = false;
          sfx.pullEnd();
          setMessage("Preview locked — press Hit now");
          gamepadFired.current = false;
        } else {
          gamepadFired.current = false;
        }
      }
    }

    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      if (phase === "playing" && shot !== "flying") {
        const aDown = !!pad.buttons[0]?.pressed;
        if (aDown && !padAHeld.current) {
          if (!ballSelected) selectBall();
          else if (shot === "ready") {
            const st = useGameStore.getState();
            if (st.playMode === "chain" && !st.chainPlaying) st.requestLockShot();
            else st.requestHit();
          }
        }
        padAHeld.current = aDown;
        if (ballSelected) {
          const lx = pad.axes[0] ?? 0;
          if (Math.abs(lx) > 0.12) {
            const yaw = aimYaw - lx * d * 1.8;
            setAim(yaw);
            if (audioEnabled) sfx.pull(power, yaw);
          }
        }
        const rx = pad.axes[2] ?? 0;
        const ry = pad.axes[3] ?? 0;
        if (Math.abs(rx) > 0.12 && !camLocked.current) viewYaw.current -= rx * d * 1.6;
        if (Math.abs(ry) > 0.12 && !camLocked.current) {
          orbitPitch.current = THREE.MathUtils.clamp(
            orbitPitch.current + ry * d * 1.1,
            -0.45,
            0.9,
          );
        }
        if (ballSelected) {
          const trigger = pad.buttons[7]?.value ?? pad.buttons[6]?.value ?? 0;
          if (trigger > 0.08) {
            if (!camLocked.current) {
              camLocked.current = true;
              lockedEye.current.copy(camBase.current);
              lockedLook.current.copy(lookTarget.current);
            }
            setShot("charging");
            setPower(trigger);
            gamepadFired.current = false;
            if (audioEnabled) sfx.pull(trigger, aimYaw);
          } else if (useGameStore.getState().shot === "charging" && !gamepadFired.current) {
            if (useGameStore.getState().power > 0.08) {
              gamepadFired.current = true;
              setShot("ready");
              camLocked.current = false;
              sfx.pullEnd();
              setMessage("Preview locked — press Hit now");
            }
          }
        }
        if (pad.buttons[2]?.pressed) setWeapon("cue");
        if (pad.buttons[3]?.pressed) setWeapon("club");
        if (pad.buttons[1]?.pressed) setWeapon("trebuchet");
        if (pad.buttons[9]?.pressed) {
          const ph = useGameStore.getState().phase;
          if (ph === "playing") setPhase("paused");
        }
      }
    }

    shake.current.update(d);
    const sk = shake.current.sample(performance.now() * 0.001);

    if (phase !== lastPhase.current) {
      if (
        phase === "playing" ||
        phase === "hole-complete" ||
        phase === "paused" ||
        phase === "course-complete"
      ) {
        camLocked.current = false;
        overviewCamPose(
          ballPos.current,
          hole.cup,
          viewYaw.current,
          orbitPitch.current,
          desiredEye.current,
          desiredLook.current,
        );
        camBase.current.copy(desiredEye.current);
        lookTarget.current.copy(desiredLook.current);
      }
      lastPhase.current = phase;
    }

    if (!session) {
      if (phase === "menu" || phase === "boot") {
        if (!(drag.current?.active && drag.current.mode === "orbit")) {
          menuAngle.current += d * 0.14;
        }
        desiredEye.current.set(
          Math.sin(menuAngle.current) * 5.2,
          4.0 + orbitPitch.current * 1.5,
          Math.cos(menuAngle.current) * 5.2,
        );
        desiredLook.current.set(0, 0.1, 0.5);
        camBase.current.copy(desiredEye.current);
        lookTarget.current.copy(desiredLook.current);
      } else if (
        phase === "playing" ||
        phase === "hole-complete" ||
        phase === "paused" ||
        phase === "course-complete"
      ) {
        if (camLocked.current && !(stNow.playMode === "chain" && stNow.chainPlaying)) {
          camBase.current.copy(lockedEye.current);
          lookTarget.current.copy(lockedLook.current);
        } else {
          const chainReplay = stNow.playMode === "chain" && stNow.chainPlaying;
          if (chainReplay) {
            const q = stNow.chain[stNow.chainPlayIndex];
            if (q) {
              chainReplayCamPose(
                q.origin,
                q.rest,
                q.yaw,
                stNow.shot === "flying",
                ballPos.current,
                desiredEye.current,
                desiredLook.current,
              );
              viewYaw.current = q.yaw;
            } else {
              overviewCamPose(
                ballPos.current,
                hole.cup,
                viewYaw.current,
                orbitPitch.current,
                desiredEye.current,
                desiredLook.current,
              );
            }
          } else if (selectedRef.current && phase === "playing") {
            focusCamPose(
              aimPos.current,
              viewYaw.current,
              orbitPitch.current,
              desiredEye.current,
              desiredLook.current,
            );
          } else {
            overviewCamPose(
              ballPos.current,
              hole.cup,
              viewYaw.current,
              orbitPitch.current,
              desiredEye.current,
              desiredLook.current,
            );
          }
          const focusing = selectedRef.current || chainReplay;
          const camK =
            drag.current?.active && drag.current.mode === "orbit"
              ? 14
              : chainReplay
                ? 6.5
                : focusing
                  ? 7
                  : 5;
          camBase.current.x = expLerp(camBase.current.x, desiredEye.current.x, camK, d);
          camBase.current.y = expLerp(camBase.current.y, desiredEye.current.y, camK, d);
          camBase.current.z = expLerp(camBase.current.z, desiredEye.current.z, camK, d);
          if (!focusing) camBase.current.y = Math.max(camBase.current.y, 2.8);
          lookTarget.current.x = expLerp(lookTarget.current.x, desiredLook.current.x, 7, d);
          lookTarget.current.y = expLerp(lookTarget.current.y, desiredLook.current.y, 7, d);
          lookTarget.current.z = expLerp(lookTarget.current.z, desiredLook.current.z, 7, d);
        }
      }

      camPos.current.set(
        camBase.current.x + (camLocked.current ? 0 : sk.ox),
        camBase.current.y + (camLocked.current ? 0 : sk.oy),
        camBase.current.z + (camLocked.current ? 0 : sk.oz),
      );
      placeCamera(
        camera,
        camPos.current,
        lookTarget.current,
        camLocked.current ? 0 : sk.roll,
      );

      if (
        "fov" in camera &&
        (phase === "playing" ||
          phase === "hole-complete" ||
          phase === "paused" ||
          phase === "course-complete")
      ) {
        const baseFov = selectedRef.current ? 42 : 48;
        (camera as THREE.PerspectiveCamera).fov =
          baseFov + (camLocked.current ? 0 : shake.current.trauma * 3);
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    }

    (scene.userData as { ballPos?: THREE.Vector3 }).ballPos = ballPos.current;

    const bst = world.getBallState();
    const dvx = bst.velocity.x - prevVel.current.x;
    const dvy = bst.velocity.y - prevVel.current.y;
    const dvz = bst.velocity.z - prevVel.current.z;
    const impulse = Math.hypot(dvx, dvy, dvz);
    if (shot === "flying" && flyingFrames.current > 3 && impulse > 0.85) {
      const absY = Math.abs(dvy);
      const absH = Math.hypot(dvx, dvz);
      const nearMill =
        Math.hypot(bst.position.x - 0, bst.position.z - 1.35) < 0.7 &&
        bst.position.y > 0.2;
      const kind = nearMill ? "windmill" : absY > absH * 1.15 ? "felt" : "rail";
      if (audioEnabled) sfx.collision(impulse, kind);
      juiceBus.emit({
        type: "bounce",
        x: ballPos.current.x,
        y: ballPos.current.y,
        z: ballPos.current.z,
        speed: impulse,
      });
      shake.current.add(kind === "felt" ? 0.05 : 0.1);
    }
    prevVel.current = { x: bst.velocity.x, y: bst.velocity.y, z: bst.velocity.z };
    prevSpeed.current = ballSpeed.current;

    if (shot === "flying") {
      flyingFrames.current += 1;
      if (ballAsleep.current) flySettle.current += d;
      else flySettle.current = 0;
      if (flyingFrames.current > 24 && flySettle.current > 0.42) {
        flySettle.current = 0;
        if (stNow.playMode === "chain" && stNow.chainPlaying) {
          if (restHold.current === 0 && !pendingStrike.current) {
            const q = stNow.chain[stNow.chainPlayIndex];
            if (q) world.snapBall(q.rest);
            const more = stNow.advanceChainPlay();
            if (more) {
              flyingFrames.current = 0;
              restHold.current = 0.001;
              camLocked.current = false;
              const next = useGameStore.getState().chain[useGameStore.getState().chainPlayIndex];
              if (next) {
                chainReplayCamPose(
                  next.origin,
                  next.rest,
                  next.yaw,
                  false,
                  ballPos.current,
                  desiredEye.current,
                  desiredLook.current,
                );
                camBase.current.copy(desiredEye.current);
                lookTarget.current.copy(desiredLook.current);
                viewYaw.current = next.yaw;
              }
            } else {
              stNow.finishChainPlay();
              resetShotIdle();
              camLocked.current = false;
              setMessage("Chain finished — tap a shot number or landing ghost to edit and replay");
            }
          }
        } else {
          resetShotIdle();
          camLocked.current = false;
          if (selectedRef.current) {
            setMessage(
              "Drag around the ball to aim · pull away for power · elsewhere to look around",
            );
          } else {
            setMessage("Click the ball for your next stroke");
          }
        }
      }
    } else {
      flySettle.current = 0;
    }

    if (
      stNow.chainPlaying &&
      restHold.current > 0 &&
      !pendingStrike.current &&
      stNow.shot !== "flying"
    ) {
      restHold.current += d;
      if (restHold.current >= 1) {
        restHold.current = 0;
        fireShot();
      }
    }

    if (phase === "playing" && !sinkLock.current && world.checkCup(stats.hole)) {
      sinkLock.current = true;
      camLocked.current = false;
      setBallSelected(false);
      selectedRef.current = false;
      if (audioEnabled) {
        sfx.sink();
        sfx.confetti();
      }
      juiceBus.emit({
        type: "sink",
        x: ballPos.current.x,
        y: ballPos.current.y,
        z: ballPos.current.z,
        strokes: stats.strokes,
      });
      juiceBus.emit({ type: "confetti" });
      shake.current.add(0.55);
      completeHole(hole.par);
    }

    const p = ballPos.current;
    if (p.y < -1.5 || Math.abs(p.x) > 3.2 || p.z < -4.2 || p.z > 5.2) {
      if (audioEnabled) sfx.oob();
      juiceBus.emit({ type: "oob" });
      shake.current.add(0.2);
      if (stNow.chainPlaying) stNow.finishChainPlay();
      placeTee();
      setMessage("Out of bounds — re-tee");
    }
  });

  const onBallState = useCallback((pos: THREE.Vector3, asleep: boolean, speed: number) => {
    ballPos.current.copy(pos);
    ballAsleep.current = asleep;
    ballSpeed.current = speed;
  }, []);

  return (
    <>
      <color attach="background" args={["#122034"]} />
      <fog attach="fog" args={["#1a2a40", 22, 48]} />

      <ambientLight intensity={1.05} color="#fff6e8" />
      <directionalLight
        castShadow={!lowPower}
        position={[5, 16, 4]}
        intensity={2.15}
        color="#fff3d6"
        shadow-mapSize={[lowPower ? 512 : 1024, lowPower ? 512 : 1024]}
        shadow-camera-far={24}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-6, 8, -3]} intensity={0.85} color="#9ec8ff" />
      <hemisphereLight args={["#dce9ff", "#3a2a18", 0.95]} />
      <pointLight position={[0, 3.2, 0.5]} intensity={1.4} distance={12} color="#ffe7b0" />

      {!lowPower && <SoftShadows size={12} samples={8} focus={0.5} />}

      {session && <XROrigin position={[0, 1.6, 2]} />}

      <WorldDecor />
      <Course />
      <Ball physicsRef={physicsRef} onBallState={onBallState} />
      <WeaponPreview ballPos={aimPos.current} yaw={aimYaw} />
      <CueOrbitGuide
        origin={aimPos.current}
        yaw={aimYaw}
        power={power}
        visible={ballSelected && shot !== "flying" && !chainPlaying}
        dragging={shot === "aiming" || shot === "charging"}
      />
      <PhysicsPathPreview
        pathRef={predPath}
        visible={
          ballSelected &&
          !chainPlaying &&
          (shot === "charging" || shot === "aiming" || shot === "ready") &&
          power > 0.04
        }
        sunkRef={predSunk}
      />
      <ChainGhosts
        chain={chain}
        setupOrigin={chainSetupOrigin}
        playing={chainPlaying}
        selected={ballSelected}
        editingIndex={editingIndex}
        onEdit={editChainShot}
      />
      <JuiceFX />

      {!lowPower && (
        <ContactShadows
          position={[0, -0.02, 0.5]}
          opacity={0.22}
          scale={14}
          blur={2.4}
          far={5}
          color="#000000"
        />
      )}
    </>
  );
}
