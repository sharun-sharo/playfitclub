/**
 * Shared MediaPipe Pose Landmarker bootstrap.
 * Warm the WASM + lite model before camera permission so Fit Run is not
 * blocked on a serial ~10–15s download after getUserMedia returns.
 */

export const POSE_WASM_PATH = "/mediapipe/wasm";
export const POSE_MODEL_PATH = "/mediapipe/pose_landmarker_lite.task";

export type PoseDelegate = "GPU" | "CPU";

export type PoseLandmarkerHandle = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => {
    landmarks?: Array<Array<{ x: number; y: number; z?: number; visibility?: number }>>;
    worldLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
  };
  close: () => void;
};

export type PoseRuntimeBundle = {
  landmarker: PoseLandmarkerHandle;
  delegate: PoseDelegate;
};

export type PoseRuntimePhase = "idle" | "loading" | "ready" | "error";

type VisionModule = typeof import("@mediapipe/tasks-vision");
type WasmFileset = Awaited<ReturnType<VisionModule["FilesetResolver"]["forVisionTasks"]>>;

let visionModule: Promise<VisionModule> | null = null;
let fileset: WasmFileset | null = null;
let filesetPromise: Promise<WasmFileset> | null = null;
let spare: PoseRuntimeBundle | null = null;
let inflight: Promise<PoseRuntimeBundle> | null = null;
let phase: PoseRuntimePhase = "idle";
let lastError: string | null = null;
const listeners = new Set<(next: PoseRuntimePhase) => void>();

function setPhase(next: PoseRuntimePhase) {
  if (phase === next) return;
  phase = next;
  for (const listener of listeners) listener(next);
}

export function poseRuntimePhase() {
  return phase;
}

export function poseRuntimeError() {
  return lastError;
}

export function subscribePoseRuntime(listener: (next: PoseRuntimePhase) => void) {
  listeners.add(listener);
  listener(phase);
  return () => {
    listeners.delete(listener);
  };
}

function loadVision() {
  if (!visionModule) visionModule = import("@mediapipe/tasks-vision");
  return visionModule;
}

async function resolveFileset(): Promise<WasmFileset> {
  if (fileset) return fileset;
  if (!filesetPromise) {
    filesetPromise = (async () => {
      try {
        const vision = await loadVision();
        const resolved = await vision.FilesetResolver.forVisionTasks(POSE_WASM_PATH);
        fileset = resolved;
        return resolved;
      } catch (error) {
        filesetPromise = null;
        throw error;
      }
    })();
  }
  return filesetPromise;
}

/** Best-effort HTTP cache warm for the model bytes. WASM variant is browser-specific. */
export function prefetchPoseModel() {
  if (typeof fetch !== "function") return Promise.resolve();
  return fetch(POSE_MODEL_PATH, { cache: "force-cache", credentials: "same-origin" }).then(
    (response) => {
      if (!response.ok) return;
      return response.arrayBuffer().then(() => undefined);
    },
    () => undefined,
  );
}

async function createPoseLandmarker(): Promise<PoseRuntimeBundle> {
  const vision = await loadVision();
  const files = await resolveFileset();
  const options = {
    baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate: "GPU" as const },
    runningMode: "VIDEO" as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.35,
    minPosePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
  };
  try {
    const landmarker = (await vision.PoseLandmarker.createFromOptions(files, options)) as PoseLandmarkerHandle;
    return { landmarker, delegate: "GPU" };
  } catch {
    const landmarker = (await vision.PoseLandmarker.createFromOptions(files, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    })) as PoseLandmarkerHandle;
    return { landmarker, delegate: "CPU" };
  }
}

function preparePoseLandmarker() {
  if (spare) {
    setPhase("ready");
    return Promise.resolve(spare);
  }
  if (!inflight) {
    setPhase("loading");
    lastError = null;
    inflight = createPoseLandmarker()
      .then((bundle) => {
        spare = bundle;
        inflight = null;
        setPhase("ready");
        return bundle;
      })
      .catch((error) => {
        inflight = null;
        lastError = error instanceof Error ? error.message : "Pose runtime failed";
        setPhase("error");
        throw error;
      });
  }
  return inflight;
}

/**
 * Start WASM + model init as early as the play page mounts.
 * Safe to call repeatedly; shares one in-flight create.
 */
export function preloadPoseLandmarker() {
  void prefetchPoseModel();
  return preparePoseLandmarker().then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Take a ready landmarker for a PoseEstimator. Creates one if the spare
 * was already claimed or never preloaded.
 */
export async function takePoseLandmarker(): Promise<PoseRuntimeBundle> {
  await preparePoseLandmarker();
  if (spare) {
    const taken = spare;
    spare = null;
    setPhase(inflight ? "loading" : "idle");
    return taken;
  }
  setPhase("loading");
  lastError = null;
  try {
    const bundle = await createPoseLandmarker();
    setPhase("idle");
    return bundle;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Pose runtime failed";
    setPhase("error");
    throw error;
  }
}

/** Test helper: drop module state between cases. */
export function resetPoseRuntimeForTests() {
  spare?.landmarker.close();
  spare = null;
  inflight = null;
  fileset = null;
  filesetPromise = null;
  visionModule = null;
  lastError = null;
  setPhase("idle");
}
