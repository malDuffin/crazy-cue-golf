import { useEffect, useMemo, useRef, useState } from "react";
import {
  createMediaPipeSession,
  HAND_CONNECTIONS,
  type MediaPipeSession,
  type RawHand,
} from "@/lib/tracking/mediapipe";
import { useGameStore } from "@/lib/game/store";

const PREVIEW_W = 360;
const PREVIEW_H = 270;

/** Derived control channels shown in the HUD strip under the feed */
type Channels = {
  aim: number; // -1 left … +1 right
  power: number;
  pinch: number;
  pitch: number;
  mouth: number;
  activeHand: "left" | "right" | "none";
  leftLive: boolean;
  rightLive: boolean;
  faceLive: boolean;
  handLive: boolean;
};

const emptyChannels: Channels = {
  aim: 0,
  power: 0,
  pinch: 0,
  pitch: 0,
  mouth: 0,
  activeHand: "none",
  leftLive: false,
  rightLive: false,
  faceLive: false,
  handLive: false,
};

export function TrackingLayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<MediaPipeSession | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const trackingMode = useGameStore((s) => s.trackingMode);
  const trackingReady = useGameStore((s) => s.trackingReady);
  const setTracking = useGameStore((s) => s.setTracking);
  const setTrackingReady = useGameStore((s) => s.setTrackingReady);
  const setMessage = useGameStore((s) => s.setMessage);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channels>(emptyChannels);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    canvasElRef.current = canvasRef.current;
  });

  useEffect(() => {
    if (trackingMode !== "camera") {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setTrackingReady(false);
      setChannels(emptyChannels);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    (async () => {
      try {
        setLoading(true);
        setMessage("Starting camera tracking…");
        const session = await createMediaPipeSession(video);
        if (cancelled) {
          session.stop();
          return;
        }
        sessionRef.current = session;
        setTrackingReady(true);
        setError(null);
        setLoading(false);
        setMessage("Hands + face tracking live — pinch to charge, release to fire");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Camera unavailable";
        setError(msg);
        setLoading(false);
        setTrackingReady(false);
        setMessage("Camera blocked — use drag to aim instead");
        useGameStore.getState().setTrackingMode("off");
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
      setTrackingReady(false);
    };
  }, [trackingMode, setMessage, setTrackingReady]);

  useEffect(() => {
    if (trackingMode !== "camera") return;
    let raf = 0;
    let lastDraw = 0;
    let lastHud = 0;

    const loop = async () => {
      const session = sessionRef.current;
      if (session) {
        const updated = await session.tick();
        if (updated) {
          const hands = session.getHands();
          const face = session.getFace();
          setTracking({
            hands,
            face,
            updatedAt: performance.now(),
          });

          const hand = hands.right ?? hands.left;
          const activeHand: Channels["activeHand"] = hands.right
            ? "right"
            : hands.left
              ? "left"
              : "none";
          let aim = 0;
          if (face) aim = face.yaw;
          else if (hand) aim = (hand.x - 0.5) * 2;
          const power = hand
            ? Math.max(0, Math.min(1, (hand.y - 0.25) * 1.6))
            : 0;
          const pinch = hand?.pinch ?? 0;

          const ch: Channels = {
            aim: Math.max(-1, Math.min(1, aim)),
            power,
            pinch,
            pitch: face?.pitch ?? 0,
            mouth: face?.mouthOpen ?? 0,
            activeHand,
            leftLive: !!hands.left,
            rightLive: !!hands.right,
            faceLive: !!face,
            handLive: !!hand,
          };

          const now = performance.now();
          // Throttle React state updates for meters
          if (now - lastHud > 50) {
            setChannels(ch);
            lastHud = now;
          }

          if (now - lastDraw > 33) {
            drawOverlay(canvasElRef.current ?? canvasRef.current, session, ch);
            lastDraw = now;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [trackingMode, setTracking]);

  const statusLabel = useMemo(() => {
    if (error) return "Camera error";
    if (loading) return "Loading models…";
    if (!trackingReady) return "Connecting…";
    if (channels.handLive && channels.faceLive) return "Hands + face live";
    if (channels.handLive) return "Hand live";
    if (channels.faceLive) return "Face live";
    return "Searching…";
  }, [error, loading, trackingReady, channels.handLive, channels.faceLive]);

  return (
    <>
      <video ref={videoRef} className="tracking-video" playsInline muted />

      {trackingMode === "camera" && (
        <div
          className="tracking-dock liquid-glass liquid-glass-strong"
          role="region"
          aria-label="Webcam tracking preview"
        >
          <div className="tracking-dock-header">
            <span className={`tracking-live-dot ${trackingReady && !error ? "on" : ""}`} />
            <span className="tracking-dock-title">Webcam track</span>
            <span className="tracking-dock-status">{statusLabel}</span>
          </div>

          <div className="tracking-preview-frame">
            <canvas
              ref={canvasRef}
              width={PREVIEW_W}
              height={PREVIEW_H}
              className="tracking-canvas"
            />
            {(error || loading) && (
              <div className="tracking-preview-fallback">
                {error ?? "Warming up MediaPipe…"}
              </div>
            )}
          </div>

          <div className="tracking-meters">
            <MeterRow
              label="Aim L/R"
              hint={channels.faceLive ? "face yaw" : channels.handLive ? "hand x" : "—"}
            >
              <BidirectionalMeter value={channels.aim} leftLabel="L" rightLabel="R" />
            </MeterRow>

            <MeterRow label="Power" hint="hand height">
              <BarMeter value={channels.power} color="power" />
            </MeterRow>

            <MeterRow label="Pinch" hint="≥55% fires">
              <BarMeter value={channels.pinch} color="pinch" threshold={0.55} />
            </MeterRow>

            <div className="tracking-meta-row">
              <HandBadge side="L" active={channels.activeHand === "left"} live={channels.leftLive} />
              <HandBadge side="R" active={channels.activeHand === "right"} live={channels.rightLive} />
              <span className={`tracking-face-badge ${channels.faceLive ? "on" : ""}`}>
                Face {channels.faceLive ? "on" : "off"}
              </span>
              {channels.faceLive && (
                <span className="tracking-pitch-chip">
                  pitch {(channels.pitch * 100).toFixed(0)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MeterRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="tracking-meter-row">
      <div className="tracking-meter-labels">
        <span>{label}</span>
        <span className="tracking-meter-hint">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function BidirectionalMeter({
  value,
  leftLabel,
  rightLabel,
}: {
  value: number;
  leftLabel: string;
  rightLabel: string;
}) {
  const leftStrength = Math.max(0, -value);
  const rightStrength = Math.max(0, value);
  return (
    <div className="bi-meter" aria-valuenow={Math.round(value * 100)}>
      <span
        className="bi-arrow bi-arrow-l"
        style={{
          opacity: 0.25 + leftStrength * 0.75,
          transform: `scale(${0.75 + leftStrength * 0.55})`,
        }}
      >
        ◀ {leftLabel}
      </span>
      <div className="bi-track">
        <div className="bi-center" />
        <div className="bi-fill bi-fill-l" style={{ width: `${leftStrength * 50}%` }} />
        <div className="bi-fill bi-fill-r" style={{ width: `${rightStrength * 50}%` }} />
        <div className="bi-thumb" style={{ left: `${50 + value * 50}%` }} />
      </div>
      <span
        className="bi-arrow bi-arrow-r"
        style={{
          opacity: 0.25 + rightStrength * 0.75,
          transform: `scale(${0.75 + rightStrength * 0.55})`,
        }}
      >
        {rightLabel} ▶
      </span>
    </div>
  );
}

function BarMeter({
  value,
  color,
  threshold,
}: {
  value: number;
  color: "power" | "pinch";
  threshold?: number;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const over = threshold != null && value >= threshold;
  return (
    <div className={`bar-meter bar-meter-${color} ${over ? "over" : ""}`}>
      <div className="bar-meter-fill" style={{ width: `${pct}%` }} />
      {threshold != null && (
        <div className="bar-meter-threshold" style={{ left: `${threshold * 100}%` }} />
      )}
      <span className="bar-meter-pct">{pct}%</span>
    </div>
  );
}

function HandBadge({
  side,
  active,
  live,
}: {
  side: "L" | "R";
  active: boolean;
  live: boolean;
}) {
  return (
    <span className={`tracking-hand-badge ${live ? "live" : ""} ${active ? "active" : ""}`}>
      {side}
    </span>
  );
}

/* ─── Canvas overlay drawing ─────────────────────────────────────────── */

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  session: MediaPipeSession,
  ch: Channels,
) {
  const video = session.video;
  if (!canvas) return;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  // Mirrored video
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-w, 0);
  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, w, h);
  } else {
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, w, h);
  }

  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const rawHands = session.getRawHands();
  for (const hand of rawHands) {
    drawHandSkeleton(ctx, hand, w, h);
  }

  const faceLm = session.getFaceLandmarks();
  const face = session.getFace();
  if (faceLm && face) {
    drawFace(ctx, faceLm, face, w, h);
  }

  ctx.restore();

  drawAimArrows(ctx, w, h, ch);
  drawPowerGuide(ctx, w, h, ch);
  drawPinchRing(ctx, w, h, ch, rawHands);
  drawLegend(ctx, w, h, ch);
}

function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  hand: RawHand,
  w: number,
  h: number,
) {
  const lm = hand.landmarks;
  const col = hand.side === "right" ? "#7dd3c0" : "#e0c36a";
  const pinch = hand.pose.pinch;
  const alpha = 0.45 + hand.pose.score * 0.55;

  ctx.lineWidth = 2.2;
  ctx.strokeStyle = col;
  ctx.globalAlpha = alpha;

  for (const [a, b] of HAND_CONNECTIONS) {
    const p0 = lm[a]!;
    const p1 = lm[b]!;
    ctx.beginPath();
    ctx.moveTo(p0.x * w, p0.y * h);
    ctx.lineTo(p1.x * w, p1.y * h);
    ctx.stroke();
  }

  const tips = new Set([4, 8, 12, 16, 20]);
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i]!;
    const r = tips.has(i) ? 3.5 : 2.2;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fillStyle = tips.has(i) ? "#f2f4f8" : col;
    ctx.fill();
  }

  const wrist = lm[0]!;
  const mid = lm[9]!;
  const px = ((wrist.x + mid.x) * 0.5) * w;
  const py = ((wrist.y + mid.y) * 0.5) * h;

  const thumb = lm[4]!;
  const index = lm[8]!;
  ctx.globalAlpha = 0.35 + pinch * 0.65;
  ctx.lineWidth = 1.5 + pinch * 3;
  ctx.strokeStyle = pinch > 0.55 ? "#7dd3c0" : "#f2f4f8";
  ctx.setLineDash(pinch > 0.55 ? [] : [4, 3]);
  ctx.beginPath();
  ctx.moveTo(thumb.x * w, thumb.y * h);
  ctx.lineTo(index.x * w, index.y * h);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.5 + pinch * 0.5;
  ctx.beginPath();
  ctx.arc(px, py, 10 + pinch * 8, 0, Math.PI * 2);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.stroke();

  const dirX = mid.x - wrist.x;
  const dirY = mid.y - wrist.y;
  const len = Math.hypot(dirX, dirY) || 1;
  const scale = 40 + hand.pose.open * 30;
  const ax = px + (dirX / len) * scale;
  const ay = py + (dirY / len) * scale;
  drawArrow(ctx, px, py, ax, ay, col, 0.5 + hand.pose.open * 0.5);

  ctx.globalAlpha = 0.95;
  ctx.font = "600 11px system-ui,sans-serif";
  ctx.fillStyle = col;
  ctx.fillText(hand.side === "right" ? "R" : "L", px + 12, py - 10);

  ctx.globalAlpha = 1;
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  lm: { x: number; y: number; z: number }[],
  face: { x: number; y: number; yaw: number; pitch: number; mouthOpen: number },
  w: number,
  h: number,
) {
  const idxs = [1, 33, 263, 61, 291, 13, 14, 234, 454];
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#e0c36a";
  for (const i of idxs) {
    const p = lm[i];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const nose = lm[1] ?? lm[0]!;
  const nx = nose.x * w;
  const ny = nose.y * h;
  const boxW = 48 + Math.abs(face.yaw) * 12;
  const boxH = 58 + Math.abs(face.pitch) * 10;
  ctx.strokeStyle = "#e0c36a";
  ctx.lineWidth = 1.8;
  ctx.globalAlpha = 0.85;
  ctx.strokeRect(nx - boxW / 2, ny - boxH / 2, boxW, boxH);

  const yawLen = 18 + Math.abs(face.yaw) * 36;
  const yawEndX = nx + face.yaw * yawLen;
  drawArrow(ctx, nx, ny - 8, yawEndX, ny - 8, "#e0c36a", 0.35 + Math.abs(face.yaw) * 0.65);

  const pitchLen = 14 + Math.abs(face.pitch) * 28;
  const pitchEndY = ny + face.pitch * pitchLen;
  drawArrow(ctx, nx, ny, nx, pitchEndY, "#f0a868", 0.35 + Math.abs(face.pitch) * 0.65);

  if (face.mouthOpen > 0.05) {
    ctx.globalAlpha = 0.3 + face.mouthOpen * 0.7;
    ctx.strokeStyle = "#e07a6a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(nx, ny + 14, 4 + face.mouthOpen * 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawAimArrows(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ch: Channels,
) {
  const leftS = Math.max(0, -ch.aim);
  const rightS = Math.max(0, ch.aim);
  const midY = h * 0.5;

  ctx.save();
  ctx.globalAlpha = 0.2 + leftS * 0.8;
  const ls = 0.7 + leftS * 0.7;
  ctx.translate(28, midY);
  ctx.scale(ls, ls);
  ctx.fillStyle = "#7dd3c0";
  ctx.beginPath();
  ctx.moveTo(16, -18);
  ctx.lineTo(-10, 0);
  ctx.lineTo(16, 18);
  ctx.closePath();
  ctx.fill();
  ctx.font = "700 10px system-ui,sans-serif";
  ctx.fillText("AIM", -6, 30);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.2 + rightS * 0.8;
  const rs = 0.7 + rightS * 0.7;
  ctx.translate(w - 28, midY);
  ctx.scale(rs, rs);
  ctx.fillStyle = "#7dd3c0";
  ctx.beginPath();
  ctx.moveTo(-16, -18);
  ctx.lineTo(10, 0);
  ctx.lineTo(-16, 18);
  ctx.closePath();
  ctx.fill();
  ctx.font = "700 10px system-ui,sans-serif";
  ctx.fillText("AIM", -10, 30);
  ctx.restore();
}

function drawPowerGuide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ch: Channels,
) {
  const x = w - 14;
  const top = 36;
  const bot = h - 28;
  const railH = bot - top;

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(242,244,248,0.35)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bot);
  ctx.stroke();

  const fillH = railH * ch.power;
  ctx.globalAlpha = 0.4 + ch.power * 0.6;
  const grad = ctx.createLinearGradient(x, bot, x, bot - fillH);
  grad.addColorStop(0, "#7dd3c0");
  grad.addColorStop(0.7, "#e0c36a");
  grad.addColorStop(1, "#e07a6a");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, bot);
  ctx.lineTo(x, bot - fillH);
  ctx.stroke();

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#f2f4f8";
  ctx.beginPath();
  ctx.arc(x, bot - fillH, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "600 9px system-ui,sans-serif";
  ctx.fillStyle = "rgba(242,244,248,0.75)";
  ctx.fillText("PWR", x - 18, top - 8);
  ctx.globalAlpha = 1;
}

function drawPinchRing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ch: Channels,
  rawHands: RawHand[],
) {
  if (!ch.handLive || rawHands.length === 0) return;
  const hand = rawHands.find((r) => r.side === ch.activeHand) ?? rawHands[0]!;
  const wrist = hand.landmarks[0]!;
  const mid = hand.landmarks[9]!;
  const vx = (wrist.x + mid.x) * 0.5;
  const vy = (wrist.y + mid.y) * 0.5;
  const sx = (1 - vx) * w;
  const sy = vy * h;

  const pinch = ch.pinch;
  const r = 16 + pinch * 22;
  ctx.globalAlpha = 0.25 + pinch * 0.75;
  ctx.strokeStyle = pinch > 0.55 ? "#7dd3c0" : "rgba(242,244,248,0.8)";
  ctx.lineWidth = 2 + pinch * 3;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();

  if (pinch > 0.55) {
    ctx.font = "700 10px system-ui,sans-serif";
    ctx.fillStyle = "#7dd3c0";
    ctx.globalAlpha = 0.95;
    ctx.fillText("CHARGE", sx - 22, sy - r - 6);
  }
  ctx.globalAlpha = 1;
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ch: Channels,
) {
  ctx.globalAlpha = 0.9;
  ctx.font = "600 10px system-ui,sans-serif";
  ctx.fillStyle = "rgba(242,244,248,0.85)";
  const src = ch.faceLive ? "aim: face yaw" : ch.handLive ? "aim: hand x" : "aim: —";
  ctx.fillText(src, 8, h - 10);
  ctx.globalAlpha = 1;
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  alpha: number,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len;
  const uy = dy / len;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const hs = 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * hs - uy * hs * 0.55, y1 - uy * hs + ux * hs * 0.55);
  ctx.lineTo(x1 - ux * hs + uy * hs * 0.55, y1 - uy * hs - ux * hs * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}
