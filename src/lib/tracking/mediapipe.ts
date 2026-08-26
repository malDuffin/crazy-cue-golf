import type { FacePose, HandPose } from "@/lib/game/store";

export type Landmark = { x: number; y: number; z: number };

export type RawHand = {
  /** mirrored palm pose used by gameplay */
  pose: HandPose;
  /** original MediaPipe landmarks in video space (0-1, unmirrored) */
  landmarks: Landmark[];
  /** "left" | "right" after selfie remapping */
  side: "left" | "right";
};

export type MediaPipeSession = {
  video: HTMLVideoElement;
  stop: () => void;
  /** Process next frame; returns true if results updated */
  tick: () => Promise<boolean>;
  getHands: () => { left: HandPose | null; right: HandPose | null };
  getFace: () => FacePose | null;
  /** Raw landmarks for overlay drawing */
  getRawHands: () => RawHand[];
  getFaceLandmarks: () => Landmark[] | null;
  ready: boolean;
};

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** MediaPipe hand connections for skeleton drawing */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

function pinchStrength(landmarks: Landmark[]) {
  const thumb = landmarks[4]!;
  const index = landmarks[8]!;
  const d = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  return Math.max(0, Math.min(1, 1 - d / 0.12));
}

function openness(landmarks: Landmark[]) {
  const wrist = landmarks[0]!;
  const tips = [8, 12, 16, 20].map((i) => landmarks[i]!);
  const avg =
    tips.reduce((s, t) => s + Math.hypot(t.x - wrist.x, t.y - wrist.y), 0) / tips.length;
  return Math.max(0, Math.min(1, (avg - 0.12) / 0.25));
}

function handFromLandmarks(landmarks: Landmark[], score: number): HandPose {
  const wrist = landmarks[0]!;
  const mid = landmarks[9]!;
  const palmX = (wrist.x + mid.x) * 0.5;
  const palmY = (wrist.y + mid.y) * 0.5;
  const x = 1 - palmX;
  const y = palmY;
  const dirX = 1 - mid.x - (1 - wrist.x);
  const dirY = mid.y - wrist.y;
  return {
    x,
    y,
    pinch: pinchStrength(landmarks),
    open: openness(landmarks),
    dirX,
    dirY,
    score,
  };
}

function faceFromLandmarks(landmarks: Landmark[]): FacePose {
  const nose = landmarks[1] ?? landmarks[0]!;
  const left = landmarks[234] ?? landmarks[33] ?? nose;
  const right = landmarks[454] ?? landmarks[263] ?? nose;
  const upper = landmarks[13] ?? nose;
  const lower = landmarks[14] ?? nose;
  const midX = (left.x + right.x) * 0.5;
  const yaw = Math.max(-1, Math.min(1, (nose.x - midX) * 8));
  const pitch = Math.max(-1, Math.min(1, (nose.y - 0.45) * 4));
  const mouthOpen = Math.max(0, Math.min(1, (lower.y - upper.y) * 12));
  return {
    x: 1 - nose.x,
    y: nose.y,
    yaw,
    pitch,
    mouthOpen,
  };
}

export async function createMediaPipeSession(
  video: HTMLVideoElement,
): Promise<MediaPipeSession> {
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );

  const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_MODEL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  let faceLandmarker: Awaited<ReturnType<typeof FaceLandmarker.createFromOptions>> | null =
    null;
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_MODEL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch {
    faceLandmarker = null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();

  let left: HandPose | null = null;
  let right: HandPose | null = null;
  let face: FacePose | null = null;
  let rawHands: RawHand[] = [];
  let faceLm: Landmark[] | null = null;
  let lastVideoTime = -1;
  let stopped = false;

  return {
    video,
    ready: true,
    getHands: () => ({ left, right }),
    getFace: () => face,
    getRawHands: () => rawHands,
    getFaceLandmarks: () => faceLm,
    async tick() {
      if (stopped || video.readyState < 2) return false;
      if (video.currentTime === lastVideoTime) return false;
      lastVideoTime = video.currentTime;
      const ts = performance.now();

      const hands = handLandmarker.detectForVideo(video, ts);
      left = null;
      right = null;
      rawHands = [];
      if (hands.landmarks) {
        for (let i = 0; i < hands.landmarks.length; i++) {
          const lm = hands.landmarks[i]! as Landmark[];
          const handedness = hands.handednesses?.[i]?.[0];
          // MediaPipe labels are mirrored in selfie view — swap for natural mapping
          const label = handedness?.categoryName ?? "Right";
          const score = handedness?.score ?? 0.5;
          const pose = handFromLandmarks(lm, score);
          // After selfie remapping: MP "Left" → user right
          const side: "left" | "right" = label === "Left" ? "right" : "left";
          if (side === "right") right = pose;
          else left = pose;
          rawHands.push({ pose, landmarks: lm, side });
        }
      }

      if (faceLandmarker) {
        const faces = faceLandmarker.detectForVideo(video, ts);
        if (faces.faceLandmarks?.[0]) {
          faceLm = faces.faceLandmarks[0] as Landmark[];
          face = faceFromLandmarks(faceLm);
        } else {
          face = null;
          faceLm = null;
        }
      }

      return true;
    },
    stop() {
      stopped = true;
      handLandmarker.close();
      faceLandmarker?.close();
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}
