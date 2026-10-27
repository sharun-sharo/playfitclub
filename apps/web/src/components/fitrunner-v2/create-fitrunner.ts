import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createCourseFx,
  createObstacle,
  createToken,
  tokenLayout,
  tokenRadius,
  type ObstacleKind,
  type Token,
} from "@/components/fitrunner-v2/course";
import { assignObstacleTheme } from "@/components/fitrunner-v2/obstacle-themes";
import { prepareMaterials, seat } from "@/components/fitrunner-v2/mesh-fit";
import { coastModule, createTropical, type SegmentDressing } from "@/components/fitrunner-v2/tropical";
import { COMMAND_SLICE_S, jumpDuringRoll, laneHitShift, laneSlideFraction, releaseStuckClip, remainingMotionDt, replayClip, sideStepPose, sideStepTravel, verticalCommandReady } from "@/components/fitrunner-v2/course-body";
import { beginJumpArc, jumpClipTime, jumpPlaybackClip, RUNNING_JUMP_CLIP, RUNNING_JUMP_LEAVE_S, RUNNING_JUMP_RETURN_S, runningJumpClipTime, sampleJump, stepJumpArc, type JumpArc } from "@/components/fitrunner-v2/jump-arc";
import { COURSE_CAMERA_FAR, obstaclesForTile, PROVISIONAL_COURSE_SEED } from "@/components/fitrunner-v2/course-place";
import { noteLongFrame, releaseLiveCommand, runPace, runStepMeters, runnerFrameSlices, runnerUsesCatchUp } from "@/components/fitrunner-v2/runner-clock";
import { applyPhoneTextureClarity } from "@/components/fitrunner-v2/phone-clarity";
import {
  createPhoneDrawHysteresis,
  phoneDrawingPixelRatio,
  selectPhoneDrawPreset,
  stepPhoneDrawHysteresis,
  type PhoneDrawHysteresis,
  type PhoneDrawPreset,
} from "@/components/fitrunner-v2/phone-draw";
import { cameraAspectFromCss, fitRunnerDrawingSize, fitRunnerPixelRatio, fitRunnerQuality, graphicsFailureMessage, isTelevisionBrowser } from "@/components/fitrunner-v2/tv-graphics";
import { fitRunnerTuning as tuning, type GraphicsQuality } from "@/components/fitrunner-v2/tuning";
import { clearanceWindowsMs, type GradePopup, type InputSource } from "@/lib/fitrunner-v2/combo";
import { createRunRecorder } from "@/lib/fitrunner-v2/run-recorder";
import { MIN_FITNESS_CONFIDENCE, type WorkoutEventDraft } from "@/lib/fitrunner-v2/workout";
import { COMMAND_STALE_MS, holdCommand, type HeldCommand } from "@fitplay/game";
import {
  courseDebugSnapshot,
  courseHorizonFor,
  scheduleCourse,
  type CourseLevel,
  type ScheduledObstacle,
  RUN_LIVES,
} from "@fitplay/shared";

const ASSETS = {
  xbot: "/assets/fitrunner/xbot.glb",
  pulse: "/assets/fitrunner/pulse-robot.glb",
  runningJump: "/assets/fitrunner/running-jump.glb",
  roads: ["/assets/fitrunner/kenney/road/roadTile_162.gltf"],
  palms: [
    "/assets/fitrunner/kenney/nature/tree_palm.glb",
    "/assets/fitrunner/kenney/nature/tree_palmShort.glb",
    "/assets/fitrunner/kenney/nature/tree_palmBend.glb",
    "/assets/fitrunner/kenney/nature/tree_palmTall.glb",
  ],
  bush: "/assets/fitrunner/kenney/nature/plant_bushLarge.glb",
  rock: "/assets/fitrunner/kenney/fantasy/rock-large.glb",
  rockSmall: "/assets/fitrunner/kenney/nature/rock_smallA.glb",
  log: "/assets/fitrunner/kenney/nature/log_large.glb",
  fence: "/assets/fitrunner/kenney/fantasy/fence.glb",
  fencePlanks: "/assets/fitrunner/kenney/nature/fence_planks.glb",
  stall: "/assets/fitrunner/kenney/fantasy/stall-red.glb",
  fruit: "/assets/fitrunner/kenney/market/display-fruit.glb",
  bread: "/assets/fitrunner/kenney/market/display-bread.glb",
  shelf: "/assets/fitrunner/kenney/market/shelf-boxes.glb",
  basket: "/assets/fitrunner/kenney/market/shopping-basket.glb",
  pathWood: "/assets/fitrunner/kenney/nature/path_wood.glb",
  flowerYellow: "/assets/fitrunner/kenney/nature/flower_yellowA.glb",
  flowerRed: "/assets/fitrunner/kenney/nature/flower_redA.glb",
  grass: "/assets/fitrunner/kenney/nature/grass_large.glb",
  tree: "/assets/fitrunner/kenney/nature/tree_oak.glb",
  sideWall: "/assets/fitrunner/kenney/prototype/wall.glb",
  sideWindow: "/assets/fitrunner/kenney/prototype/wall-window-medium.glb",
  sideDoor: "/assets/fitrunner/kenney/prototype/wall-doorway.glb",
  sideColumn: "/assets/fitrunner/kenney/prototype/column.glb",
  sideCrate: "/assets/fitrunner/kenney/prototype/crate.glb",
  sideVehicle: "/assets/fitrunner/kenney/prototype/vehicle.glb",
  sideFlag: "/assets/fitrunner/kenney/prototype/flag.glb",
  sideLoco: "/assets/fitrunner/kenney/train/train-locomotive-a.glb",
  sideContainer: "/assets/fitrunner/kenney/train/train-carriage-container-red.glb",
} as const;

const CLIPS = ["Run", "JumpUp", "ForwardRoll", "LongJump", "StandUp", "WipeSweat"] as const;
type ClipName = (typeof CLIPS)[number];
type ActiveClip = ClipName | typeof RUNNING_JUMP_CLIP;
type Motion = "run" | "jump" | "fall" | "roll" | "celebrate" | "stand" | "longJump";

export type FitRunnerHud = {
  clip: HTMLElement | null;
  lane: HTMLElement | null;
  motion: HTMLElement | null;
  speed: HTMLElement | null;
  score: HTMLElement | null;
  playScore: HTMLElement | null;
  distance: HTMLElement | null;
  time: HTMLElement | null;
  tokens: HTMLElement | null;
  combo: HTMLElement | null;
  demoTime?: HTMLElement | null;
  /** Development readout. Production leaves this null. */
  courseDebug?: HTMLElement | null;
  onDemoOver?: (info: { activeMs: number }) => void;
  /** Local overlap. The server decides whether this obstacle id spends a life. */
  onHit?: (hit: { obstacleId: string; clientTimestamp: number }) => void;
  onRunBegin?: () => void;
  onUi?: (state: { paused: boolean; muted: boolean }) => void;
  onGrade?: (grade: GradePopup) => void;
  onStats?: (stats: { multiplier: number; bestMultiplier: number }) => void;
  onEvent?: (event: WorkoutEventDraft) => void;
  onFinished?: (run: {
    durationMs: number;
    activeMs: number;
    distanceM: number;
    score: number;
    tokens: number;
    jumps: number;
    squats: number;
    laneDodges: number;
    perfects: number;
    bestCombo: number;
  }) => void;
  onPose?: (report: PoseReport) => void;
  onGraphicsFailure?: (message: string) => void;
  /** Render-loop clock. Phone diagnostics read this. The course does not wait on it. */
  onFrame?: (now: number) => void;
};

export type PoseCommand = {
  eventId: string;
  movementType: "lean_left" | "lean_right" | "squat" | "jump" | "punch" | "hold";
  confidence: number;
  clientTimestamp?: number;
  sequenceNumber?: number;
  source?: InputSource;
  playerId?: string;
  sessionId?: string;
};

export type PoseReport = {
  accepted: boolean;
  reason: string | null;
  latencyMs: number | null;
  lane: string;
  action: string;
  movementType: string;
  confidence: number;
  source: InputSource;
  eventId?: string;
  playerId?: string;
  sessionId?: string;
};

export type FitRunnerHandle = {
  dispose: () => void;
  playClip: (clip: "StandUp" | "WipeSweat" | "LongJump") => void;
  setPaused: (paused: boolean) => void;
  setMuted: (muted: boolean) => void;
  setQuality: (quality: GraphicsQuality) => void;
  applyPose: (event: PoseCommand) => PoseReport;
  finish: () => void;
  holdIdle: () => void;
  previewCourse: () => void;
  resetNeutral: () => void;
  beginCourse: () => void;
  prepareReplay: (clip?: ReturnType<typeof replayClip>) => void;
  commitHit: (obstacleId: string) => void;
  commitPending: () => void;
  dropHit: (obstacleId: string) => void;
  releaseLivesHold: () => void;
  setLives: (lives: number) => void;
  /** Places meshes from the server seed. The browser does not roll its own obstacles. */
  applyCourse: (plan: { seed: number; ceiling: CourseLevel }) => void;
  /** Same jump the keyboard calls. Runs in this turn. No socket. */
  localJump: (confidence?: number, eventId?: string) => boolean;
  /** Same roll the keyboard calls for a squat. Runs in this turn. No socket. */
  localRoll: (confidence?: number, eventId?: string) => boolean;
  /** Same stepLane the keyboard calls. Runs in this turn. No socket. */
  localStep: (direction: -1 | 1, confidence?: number, eventId?: string) => boolean;
};

type Placed = {
  id: string;
  kind: ObstacleKind;
  lane: number;
  object: THREE.Object3D;
  resolved: boolean;
  hit: boolean;
  threatened: boolean;
};

type Segment = {
  group: THREE.Group;
  spawn: number;
  placed: Placed[];
  slots: Record<ObstacleKind, THREE.Object3D[]>;
  tokens: Token[];
  dressing: SegmentDressing;
};

const laneNames = ["left", "center", "right"] as const;
const obstacleKinds: ObstacleKind[] = ["rock", "log", "fence"];

function laneLabel(lane: number) {
  return laneNames[lane + 1] ?? "center";
}

function shapeLane(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  if (tuning.laneEasing === "cubic") {
    return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - (-2 * clamped + 2) ** 3 / 2;
  }
  return laneSlideFraction(clamped);
}

type RootCurve = {
  times: Float32Array;
  y: Float32Array;
  z: Float32Array;
};

function sampleCurve(times: Float32Array, values: Float32Array, time: number) {
  const last = times.length - 1;
  if (last < 0) return 0;
  const startTime = times[0] ?? 0;
  const endTime = times[last] ?? startTime;
  const clamped = Math.min(Math.max(time, startTime), endTime);
  let index = 0;
  while (index < last && (times[index + 1] ?? endTime) < clamped) index += 1;
  const next = Math.min(index + 1, last);
  const from = times[index] ?? startTime;
  const to = times[next] ?? from;
  const span = to - from;
  const weight = span <= 1e-5 ? 0 : (clamped - from) / span;
  const a = values[index] ?? 0;
  const b = values[next] ?? a;
  return a + (b - a) * weight;
}

/** Mixamo loop clips repeat the first pose on the last key. Playing that key snaps the body back. */
function endBeforeLoop(curve: RootCurve): number {
  const last = curve.z.length - 1;
  if (last <= 0) return 0;
  let peak = 0;
  for (let index = 0; index < curve.z.length; index += 1) peak = Math.max(peak, Math.abs(curve.z[index] ?? 0));
  if (peak > 0.4 && Math.abs(curve.z[last] ?? 0) < peak * 0.25) return curve.times[last - 1] ?? 0;
  return curve.times[last] ?? 0;
}

/** Keep skeletal pose motion. Move large horizontal travel, and a jump's vertical root, onto the parent. */
function extractRoot(clip: THREE.AnimationClip, liftVertical: boolean, pinRoot = false): RootCurve {
  const track = clip.tracks.find((item) => item.name === "mixamorigHips.position");
  if (!track) throw new Error(`${clip.name} has no hips position track.`);
  const times = track.times;
  const values = track.values;
  const originX = values[0] ?? 0;
  const originY = values[1] ?? 0;
  const originZ = values[2] ?? 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let index = 0; index < times.length; index += 1) {
    const x = values[index * 3] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  const stripLateral = pinRoot || maxX - minX > 0.5;
  const curve: RootCurve = {
    times: Float32Array.from(times),
    y: new Float32Array(times.length),
    z: new Float32Array(times.length),
  };
  for (let index = 0; index < times.length; index += 1) {
    const x = values[index * 3] ?? 0;
    const y = values[index * 3 + 1] ?? 0;
    const z = values[index * 3 + 2] ?? 0;
    curve.y[index] = y - originY;
    curve.z[index] = z - originZ;
    values[index * 3 + 2] = originZ;
    if (stripLateral) values[index * 3] = originX;
    if (liftVertical || pinRoot) values[index * 3 + 1] = originY;
  }
  return curve;
}

function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, "rgba(0,0,0,0.62)");
  gradient.addColorStop(0.42, "rgba(0,0,0,0.3)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

function formatRemaining(limit: number, elapsedSeconds: number) {
  const left = Math.max(0, limit - elapsedSeconds);
  if (left <= 0) return formatTime(0);
  return formatTime(Math.ceil(left - 1e-6));
}

async function loadAsset(url: string) {
  try {
    return await new GLTFLoader().loadAsync(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load ${url}: ${message}`);
  }
}

function runnerAssetReady(gltf: { animations: { name: string }[]; scene: THREE.Object3D }) {
  if (gltf.animations.length !== CLIPS.length) return false;
  const names = new Set(gltf.animations.map((clip) => clip.name));
  if (CLIPS.some((name) => !names.has(name))) return false;
  let skinnedCount = 0;
  gltf.scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinnedCount += 1;
  });
  return skinnedCount === 1;
}

async function loadRunner() {
  try {
    const gltf = await loadAsset(ASSETS.pulse);
    if (!runnerAssetReady(gltf)) throw new Error("Pulse robot is missing the X Bot skeleton.");
    return gltf;
  } catch (error) {
    console.warn("Pulse robot failed to load. Using X Bot.", error);
    return loadAsset(ASSETS.xbot);
  }
}

function readPhoneDeviceHints() {
  if (typeof window === "undefined") {
    return { screenWidth: 0, screenHeight: 0, deviceMemoryGb: null, hardwareConcurrency: null };
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;
  return {
    screenWidth: window.screen?.width || window.innerWidth || 0,
    screenHeight: window.screen?.height || window.innerHeight || 0,
    deviceMemoryGb: memory,
    hardwareConcurrency: cores,
  };
}

export async function startFitRunner(
  canvas: HTMLCanvasElement,
  hud: FitRunnerHud,
  options?: { holdCourse?: boolean; demoLimitSeconds?: number | null; drawProfile?: "phone"; acceptKeyboard?: boolean },
): Promise<FitRunnerHandle> {
  const holdCourse = options?.holdCourse === true;
  const acceptKeyboard = options?.acceptKeyboard !== false;
  const rawLimit = options?.demoLimitSeconds;
  const demoLimit = typeof rawLimit === "number" && Number.isFinite(rawLimit) ? Math.max(0, rawLimit) : null;
  const phoneDraw = options?.drawProfile === "phone";
  const television =
    phoneDraw
      ? false
      : isTelevisionBrowser({
          userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
          pointerCoarse:
            typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
          screenWidth: typeof window === "undefined" ? 0 : Math.max(window.screen?.width || 0, window.innerWidth || 0),
          screenHeight: typeof window === "undefined" ? 0 : Math.max(window.screen?.height || 0, window.innerHeight || 0),
        });
  if (television) tuning.quality = fitRunnerQuality(true);
  const sceneQuality: GraphicsQuality = phoneDraw ? "low" : tuning.quality;
  let activeQuality = sceneQuality;
  const phoneHints = phoneDraw ? readPhoneDeviceHints() : null;
  let phonePreset: PhoneDrawPreset = phoneHints ? selectPhoneDrawPreset(phoneHints) : "balanced";
  let phoneDrawState: PhoneDrawHysteresis = createPhoneDrawHysteresis(phonePreset);
  let phoneFrameAt = 0;
  let phoneWarmup = 0;
  function drawingPixelRatio() {
    const ratio = window.devicePixelRatio || 1;
    if (!phoneDraw) return fitRunnerPixelRatio(ratio, television);
    return phoneDrawingPixelRatio({
      devicePixelRatio: ratio,
      cssWidth: canvas.clientWidth || window.innerWidth || 0,
      cssHeight: canvas.clientHeight || window.innerHeight || 0,
      preset: phonePreset,
    });
  }
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: !television,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
    ...(television ? { powerPreference: "low-power" as const } : {}),
  });
  if (!gl) {
    canvas.dataset.webgl = "unavailable";
    throw new Error(graphicsFailureMessage("no-webgl2"));
  }
  const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
  canvas.dataset.webgl = "2";
  canvas.dataset.glVersion = String(gl.getParameter(gl.VERSION));
  if (rendererInfo) canvas.dataset.glRenderer = String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL));
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl,
    antialias: !television,
    alpha: false,
    preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = television ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = television ? 1 : 1.05;
  renderer.shadowMap.enabled = sceneQuality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(drawingPixelRatio());
  if (phoneDraw) {
    canvas.dataset.draw = "phone";
    canvas.dataset.shadows = "off";
    canvas.dataset.drawPreset = phonePreset;
  }
  renderer.setClearColor("#8ec8ea");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8ec8ea");
  scene.fog = new THREE.Fog("#d5eef8", 34, 74);

  const camera = new THREE.PerspectiveCamera(tuning.camera.fov, 1, 0.1, COURSE_CAMERA_FAR);
  camera.position.set(0, tuning.camera.height, tuning.camera.distance);

  scene.add(new THREE.HemisphereLight("#e7f6ff", "#e4c48a", 0.92));
  if (!television) scene.add(new THREE.AmbientLight("#fff8ee", 0.2));
  const sun = new THREE.DirectionalLight("#fff1d2", 2.45);
  const shadowSize = sceneQuality === "high" ? 2048 : sceneQuality === "medium" ? 1024 : 1;
  sun.castShadow = sceneQuality !== "low";
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 46;
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.bias = -0.00035;
  scene.add(sun);
  scene.add(sun.target);

  try {
    const [
      xbot,
      jumpGltf,
      bushGltf,
      rockGltf,
      rockSmallGltf,
      logGltf,
      fenceGltf,
      fencePlanksGltf,
      stallGltf,
      fruitGltf,
      breadGltf,
      shelfGltf,
      basketGltf,
      pathGltf,
      flowerYellowGltf,
      flowerRedGltf,
      grassGltf,
      treeGltf,
      sideWallGltf,
      sideWindowGltf,
      sideDoorGltf,
      sideColumnGltf,
      sideCrateGltf,
      sideVehicleGltf,
      sideFlagGltf,
      sideLocoGltf,
      sideContainerGltf,
      ...rest
    ] = await Promise.all([
      loadRunner(),
      loadAsset(ASSETS.runningJump).catch(() => null),
      loadAsset(ASSETS.bush),
      loadAsset(ASSETS.rock),
      loadAsset(ASSETS.rockSmall),
      loadAsset(ASSETS.log),
      loadAsset(ASSETS.fence),
      loadAsset(ASSETS.fencePlanks),
      loadAsset(ASSETS.stall),
      loadAsset(ASSETS.fruit),
      loadAsset(ASSETS.bread),
      loadAsset(ASSETS.shelf),
      loadAsset(ASSETS.basket),
      loadAsset(ASSETS.pathWood),
      loadAsset(ASSETS.flowerYellow),
      loadAsset(ASSETS.flowerRed),
      loadAsset(ASSETS.grass),
      loadAsset(ASSETS.tree),
      loadAsset(ASSETS.sideWall),
      loadAsset(ASSETS.sideWindow),
      loadAsset(ASSETS.sideDoor),
      loadAsset(ASSETS.sideColumn),
      loadAsset(ASSETS.sideCrate),
      loadAsset(ASSETS.sideVehicle),
      loadAsset(ASSETS.sideFlag),
      loadAsset(ASSETS.sideLoco),
      loadAsset(ASSETS.sideContainer),
      ...ASSETS.roads.map((url) => loadAsset(url)),
      ...ASSETS.palms.map((url) => loadAsset(url)),
    ]);

    const roadGltfs = rest.slice(0, ASSETS.roads.length);
    const palmGltfs = rest.slice(ASSETS.roads.length);
    if (xbot.animations.length !== CLIPS.length) {
      throw new Error(`Expected ${CLIPS.length} clips, found ${xbot.animations.map((clip) => clip.name).join(", ") || "none"}.`);
    }
    const roots = {} as Record<ClipName, RootCurve>;
    for (const clip of xbot.animations) {
      if (!CLIPS.includes(clip.name as ClipName)) throw new Error(`Unexpected clip ${clip.name}.`);
      roots[clip.name as ClipName] = extractRoot(clip, clip.name === "JumpUp");
    }

    const model = xbot.scene;
    const mixer = new THREE.AnimationMixer(model);
    const actions = {} as Record<ClipName, THREE.AnimationAction>;
    for (const clip of xbot.animations) {
      if (!CLIPS.includes(clip.name as ClipName)) throw new Error(`Unexpected clip ${clip.name}.`);
      const action = mixer.clipAction(clip);
      action.enabled = true;
      actions[clip.name as ClipName] = action;
    }
    const missing = CLIPS.filter((name) => !actions[name]);
    if (missing.length) throw new Error(`X Bot GLB is missing ${missing.join(", ")}.`);
    let jumpAction: THREE.AnimationAction = actions.JumpUp;
    let jumpUsesRunning = false;
    const runningJump = jumpGltf?.animations.find((clip) => clip.name === RUNNING_JUMP_CLIP) ?? null;
    if (runningJump) {
      try {
        extractRoot(runningJump, true, true);
        jumpAction = mixer.clipAction(runningJump);
        jumpAction.enabled = true;
        jumpUsesRunning = true;
      } catch {
        jumpAction = actions.JumpUp;
        jumpUsesRunning = false;
      }
    }

    let skinnedCount = 0;
    let bodyMesh: THREE.SkinnedMesh | null = null;
    const skinMaterials: THREE.MeshStandardMaterial[] = [];
    model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isMesh && !mesh.isSkinnedMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      }
      if (!mesh.isSkinnedMesh) return;
      bodyMesh = mesh;
      skinnedCount += 1;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.color.set("#2c3338");
        material.roughness = 0.62;
        material.metalness = 0.04;
        material.emissive.set("#000000");
        material.userData.baseColor = material.color.clone();
        skinMaterials.push(material);
      }
    });
    if (skinnedCount !== 1) throw new Error(`Expected one skinned mesh, found ${skinnedCount}.`);

    const runAction = actions.Run;
    runAction.setLoop(THREE.LoopRepeat, Infinity);
    runAction.timeScale = tuning.runTimeScale;
    runAction.play();
    let jumpApex = 0;
    for (let index = 1; index < roots.JumpUp.y.length; index += 1) {
      if ((roots.JumpUp.y[index] ?? 0) > (roots.JumpUp.y[jumpApex] ?? 0)) jumpApex = index;
    }
    const jumpApexTime = roots.JumpUp.times[jumpApex] ?? actions.JumpUp.getClip().duration;
    let crouchIndex = 0;
    for (let index = 1; index < roots.JumpUp.y.length; index += 1) {
      if ((roots.JumpUp.y[index] ?? 0) < (roots.JumpUp.y[crouchIndex] ?? 0)) crouchIndex = index;
    }
    let takeoffIndex = crouchIndex;
    for (let index = crouchIndex + 1; index < roots.JumpUp.y.length; index += 1) {
      const height = roots.JumpUp.y[index] ?? 0;
      const previous = roots.JumpUp.y[index - 1] ?? height;
      if (height >= -0.02 && height > previous) {
        takeoffIndex = index;
        break;
      }
    }
    const jumpTakeoffTime = roots.JumpUp.times[takeoffIndex] ?? 0;
    const rollEndTime = endBeforeLoop(roots.ForwardRoll);
    if (!jumpUsesRunning) actions.JumpUp.getClip().duration = jumpApexTime;
    actions.ForwardRoll.getClip().duration = rollEndTime;
    mixer.update(0);

    model.rotation.y = tuning.modelYaw;
    model.updateWorldMatrix(true, true);
    model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) mesh.computeBoundingBox();
    });
    const posed = new THREE.Box3().setFromObject(model);
    model.position.x -= (posed.min.x + posed.max.x) / 2;
    model.position.z -= (posed.min.z + posed.max.z) / 2;
    model.position.y -= posed.min.y;

    const visual = new THREE.Group();
    visual.add(model);
    const runner = new THREE.Group();
    runner.add(visual);
    scene.add(runner);

    const rollAxis = new THREE.Vector3();
    const rollQuat = new THREE.Quaternion();
    const rollInv = new THREE.Matrix4();
    const sideBones = {
      spine: model.getObjectByName("mixamorigSpine2") ?? null,
      leftUp: model.getObjectByName("mixamorigLeftUpLeg") ?? null,
      rightUp: model.getObjectByName("mixamorigRightUpLeg") ?? null,
      leftFoot: model.getObjectByName("mixamorigLeftFoot") ?? null,
      rightFoot: model.getObjectByName("mixamorigRightFoot") ?? null,
    };

    function addWorldRoll(bone: THREE.Object3D | null, radians: number) {
      if (!bone || Math.abs(radians) < 1e-4) return;
      const parent = bone.parent;
      if (!parent) return;
      parent.updateWorldMatrix(true, false);
      rollInv.copy(parent.matrixWorld).invert();
      rollAxis.set(0, 0, 1).transformDirection(rollInv);
      if (rollAxis.lengthSq() < 1e-8) return;
      rollAxis.normalize();
      rollQuat.setFromAxisAngle(rollAxis, radians);
      bone.quaternion.premultiply(rollQuat);
    }

    function visualStepSeconds() {
      return Math.min(0.35, Math.max(0.25, tuning.sideStepDuration));
    }

    function advanceVisualLane(dt: number) {
      const step = remainingMotionDt(dt, shownLane);
      shownLane = 0;
      if (laneT >= 1 || step <= 0) return;
      const duration = visualStepSeconds();
      laneT = Math.min(1, laneT + step / duration);
      const shaped = tuning.laneEasing === "cubic" ? shapeLane(laneT) : sideStepTravel(laneT);
      visualLane = laneFrom + (laneTo - laneFrom) * shaped;
    }

    function leanScale() {
      return tuning.leanRadians / 0.2;
    }

    function sideLeanTarget() {
      if (laneT >= 0.999) return 0;
      const dir = Math.sign(laneTo - laneFrom);
      if (dir === 0) return 0;
      return sideStepPose(laneT, dir < 0 ? -1 : 1).torso * 0.55 * leanScale();
    }

    /** Foot push only on the run clip. A jump or roll keeps its own leg motion. */
    function applySideStep() {
      if (laneT >= 0.999) return;
      const dir = Math.sign(laneTo - laneFrom);
      if (dir === 0) return;
      const pose = sideStepPose(laneT, dir < 0 ? -1 : 1);
      const scale = leanScale();
      addWorldRoll(sideBones.spine, pose.torso * scale);
      if (activeClip !== "Run") return;
      addWorldRoll(sideBones.leftUp, pose.leftHip * scale);
      addWorldRoll(sideBones.rightUp, pose.rightHip * scale);
      addWorldRoll(sideBones.leftFoot, pose.leftFoot * scale);
      addWorldRoll(sideBones.rightFoot, pose.rightFoot * scale);
    }

    const tropical = createTropical(
      scene,
      {
        palms: palmGltfs.map((gltf) => gltf.scene),
        bush: bushGltf.scene,
        rock: rockGltf.scene,
        rockSmall: rockSmallGltf.scene,
        log: logGltf.scene,
        fence: fenceGltf.scene,
        fencePlanks: fencePlanksGltf.scene,
        stall: stallGltf.scene,
        fruit: fruitGltf.scene,
        bread: breadGltf.scene,
        shelf: shelfGltf.scene,
        basket: basketGltf.scene,
        pathWood: pathGltf.scene,
        flowerYellow: flowerYellowGltf.scene,
        flowerRed: flowerRedGltf.scene,
        grass: grassGltf.scene,
        tree: treeGltf.scene,
        side: {
          wall: sideWallGltf.scene,
          window: sideWindowGltf.scene,
          doorway: sideDoorGltf.scene,
          column: sideColumnGltf.scene,
          crate: sideCrateGltf.scene,
          vehicle: sideVehicleGltf.scene,
          flag: sideFlagGltf.scene,
          locomotive: sideLocoGltf.scene,
          container: sideContainerGltf.scene,
        },
      },
      renderer,
      sun,
      sceneQuality,
    );
    const fx = createCourseFx(scene, sceneQuality);

    const shadowMap = shadowTexture();
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({
        map: shadowMap,
        transparent: true,
        depthWrite: false,
        color: "#000000",
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.renderOrder = 2;
    scene.add(blob);

    const landing = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.38, 24),
      new THREE.MeshBasicMaterial({ color: "#f4f1c8", transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    landing.rotation.x = -Math.PI / 2;
    landing.position.y = 0.05;
    scene.add(landing);

    function toneRoad(root: THREE.Object3D) {
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          const name = material.name.toLowerCase();
          if (name.includes("grass") || name.includes("asphalt")) material.color.set("#6a7168");
          else if (name.includes("stone")) material.color.set("#7e867c");
          material.roughness = 0.94;
          material.metalness = 0;
        }
      });
    }

    function roadTemplate(gltfScene: THREE.Group) {
      prepareMaterials(gltfScene, { cast: false, receive: true });
      toneRoad(gltfScene);
      gltfScene.rotation.y = -Math.PI / 2;
      const seated = seat(gltfScene, "top");
      seated.wrapper.scale.setScalar((tuning.tileSize * 1.02) / Math.max(seated.size.x, 0.0001));
      return seated.wrapper;
    }

    const roads = roadGltfs.map((gltf) => roadTemplate(gltf.scene));
    let coursePlan: { seed: number; ceiling: CourseLevel } | null = null;
    let courseObstacles: ScheduledObstacle[] = [];
    let courseValid = false;
    let courseReasons: string[] = [];
    let courseHorizonM = 0;
    /** Meters already run. Obstacle placement skips anything the body has passed. */
    let runDistance = 0;
    /** Countdown hides the meshes. A seed that arrives then must not pop them on early. */
    let obstaclesConcealed = holdCourse;

    function obstaclesForSpawn(spawn: number) {
      return obstaclesForTile(courseObstacles, spawn, runDistance, tuning.tileSize);
    }

    function makeSegment(spawn: number): Segment {
      const group = new THREE.Group();
      const road = roads[Math.abs(spawn) % roads.length] ?? roads[0];
      if (!road) throw new Error("No road tile loaded.");
      for (const lane of [-1, 0, 1]) {
        const tile = road.clone(true);
        tile.position.set(lane * tuning.tileSize, 0, 0);
        group.add(tile);
      }
      const dressing = tropical.dressing();
      group.add(dressing.group);
      const slots = {
        rock: [createObstacle("rock"), createObstacle("rock")],
        log: [createObstacle("log"), createObstacle("log")],
        fence: [createObstacle("fence"), createObstacle("fence")],
      } satisfies Record<ObstacleKind, THREE.Object3D[]>;
      for (const kind of obstacleKinds) {
        for (const obstacle of slots[kind]) {
          obstacle.visible = false;
          obstacle.frustumCulled = false;
          obstacle.traverse((child) => {
            child.frustumCulled = false;
          });
          group.add(obstacle);
        }
      }
      const tokens = [createToken(), createToken(), createToken(), createToken()];
      for (const token of tokens) group.add(token.mesh);
      const segment: Segment = { group, spawn, placed: [], slots, tokens, dressing };
      refill(segment, spawn);
      scene.add(group);
      return segment;
    }

    function refill(segment: Segment, spawn: number) {
      segment.spawn = spawn;
      segment.dressing.apply(spawn);
      for (const kind of obstacleKinds) {
        for (const obstacle of segment.slots[kind]) obstacle.visible = false;
      }
      const chosen = obstaclesForSpawn(spawn);
      const used: Record<ObstacleKind, number> = { rock: 0, log: 0, fence: 0 };
      const worldZ = tuning.tileSize * 2 - spawn * tuning.tileSize;
      segment.placed = chosen.flatMap((item) => {
        const slot = used[item.kind];
        used[item.kind] = slot + 1;
        const object = segment.slots[item.kind][slot];
        if (!object) return [];
        object.visible = true;
        assignObstacleTheme(object);
        const centerZ = -item.distanceM - item.depthM / 2;
        object.position.set(item.lane * tuning.laneSpacing, 0, centerZ - worldZ);
        return [{ id: item.id, kind: item.kind, lane: item.lane, object, resolved: false, hit: false, threatened: false }];
      });
      const spots = tokenLayout(spawn, chosen.map((item) => item.lane));
      segment.tokens.forEach((token, index) => {
        const spot = spots[index];
        token.collecting = 0;
        token.mesh.scale.setScalar(1);
        if (!spot) {
          token.active = false;
          token.mesh.visible = false;
          return;
        }
        token.active = true;
        token.baseY = spot.y;
        token.mesh.visible = true;
        token.mesh.position.set(spot.x, spot.y, spot.z);
      });
    }

    const segments: Segment[] = [];
    for (let index = 0; index < tuning.segmentCount; index += 1) {
      const segment = makeSegment(index);
      segment.group.position.z = tuning.tileSize * 2 - index * tuning.tileSize;
      segments.push(segment);
    }
    let nextSpawn = tuning.segmentCount;

    function ensureCourse(distanceM: number) {
      if (!coursePlan) return;
      const need = courseHorizonFor(distanceM);
      if (courseHorizonM >= need) return;
      courseHorizonM = need;
      const next = scheduleCourse({
        seed: coursePlan.seed,
        ceiling: coursePlan.ceiling,
        untilDistanceM: courseHorizonM,
      });
      courseObstacles = next.obstacles;
      courseValid = next.valid;
      courseReasons = next.reasons;
    }

    function applyCourse(plan: { seed: number; ceiling: CourseLevel }) {
      const seed = plan.seed >>> 0 || 1;
      if (coursePlan && coursePlan.seed === seed && coursePlan.ceiling === plan.ceiling) return;
      coursePlan = { seed, ceiling: plan.ceiling };
      courseHorizonM = 0;
      courseObstacles = [];
      ensureCourse(runDistance);
      for (const segment of segments) refill(segment, segment.spawn);
      if (obstaclesConcealed) concealCourse();
    }

    let lane = 0;
    let laneFrom = 0;
    let laneTo = 0;
    let laneT = 1;
    let visualLane = 0;
    let motion: Motion = "run";
    let activeClip: ActiveClip = "Run";
    let current: THREE.AnimationAction = runAction;
    let motionEndsAt = 0;
    let elapsed = 0;
    let courseMode: "hold" | "preview" | "live" = holdCourse ? "hold" : "live";
    let previewTime = 0;
    function actionNow() {
      return courseMode === "live" ? elapsed : previewTime;
    }
    let distance = 0;
    let coins = 0;
    let liveSpeed = tuning.forwardSpeed;
    let lastSource: InputSource = "keyboard";
    let lastPoseSequence = -1;
    const seenPose = new Set<string>();
    let poseBuffer: HeldCommand<PoseCommand> | null = null;
    /** Wall time a television spent inside slow frames since this command was received. */
    let poseFrameDebtMs = 0;
    let statsAt = 0;
    let finished = false;
    const wallStart = performance.now();
    const recorder = createRunRecorder({
      onEvent: (event) => hud.onEvent?.(event),
      onGrade: (grade) => hud.onGrade?.(grade),
    });
    let speedMul = 1;
    let invuln = 0;
    let livesHold = false;
    let shownLives = RUN_LIVES;
    const pendingHits = new Map<
      string,
      { obstacleId: string; kind: ObstacleKind; distanceM: number; clientTimestamp: number; speedMps: number }
    >();
    let landingLife = 0;
    let cameraDip = 0;
    let shake = 0;
    let flash = 0;
    let jumpArc: JumpArc | null = null;
    let footTarget: number | null = null;
    let groundLock = 0;
    /** Slice already drawn for this command, so the next loop step does not add it again. */
    let shownLane = 0;
    let shownJump = 0;
    let shownMixer = 0;
    let inTick = false;
    let rollCursor = 0;
    let frameStep = 0;
    let nearestAhead = "none";
    let laneLockUntil = 0;
    let laneStepX = 0;
    let bodySpanX = "0,0";
    let stopped = false;
    let frame = 0;
    const stopGraphics = (kind: "context-lost" | "shader") => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      hud.onGraphicsFailure?.(graphicsFailureMessage(kind));
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      stopGraphics("context-lost");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    renderer.debug.onShaderError = () => {
      stopGraphics("shader");
    };
    let paused = false;
    let demoOver = false;
    let muted = false;
    const clock = new THREE.Clock();
    const fxPoint = new THREE.Vector3();

    function emitUi() {
      hud.onUi?.({ paused, muted });
    }

    function setPaused(next: boolean) {
      if (finished) return;
      paused = next;
      canvas.dataset.hold = next ? "1" : "0";
      groundRunner();
      emitUi();
    }

    function setMuted(next: boolean) {
      muted = next;
      fx.setMuted(next);
      canvas.dataset.muted = next ? "1" : "0";
      emitUi();
    }

    function liveScore(clearancePoints: number) {
      return Math.floor(distance * tuning.distancePoints + coins * tuning.coinPoints + clearancePoints);
    }

    function setQuality(next: GraphicsQuality) {
      const applied = phoneDraw ? "low" : television ? fitRunnerQuality(true) : next;
      if (!phoneDraw) tuning.quality = applied;
      activeQuality = applied;
      tropical.setQuality(applied);
      canvas.dataset.quality = applied;
    }

    function fadeTo(action: THREE.AnimationAction, fade = tuning.crossfade) {
      if (current !== action) current.fadeOut(fade);
      action.reset();
      action.fadeIn(fade).play();
      current = action;
    }

    function playRun() {
      if (motion === "run" && current === runAction) return;
      runAction.setLoop(THREE.LoopRepeat, Infinity);
      runAction.clampWhenFinished = false;
      runAction.timeScale = tuning.runTimeScale;
      fadeTo(runAction, motion === "fall" ? 0.16 : tuning.crossfade);
      motion = "run";
      activeClip = "Run";
    }

    function playOnce(clip: ClipName, duration: number, nextMotion: Motion) {
      if (motion !== "run") return false;
      const action = actions[clip];
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 1;
      fadeTo(action);
      motion = nextMotion;
      activeClip = clip;
      motionEndsAt = actionNow() + duration;
      return true;
    }

    function playerLane() {
      return Math.max(-1, Math.min(1, lane));
    }

    function threatFor(kind: ObstacleKind, lane: number) {
      const windows = clearanceWindowsMs(liveSpeed);
      const lookahead = (windows.good.max / 1000) * Math.max(liveSpeed, 0.5) + 0.35;
      let best: { id: string; kind: ObstacleKind; distanceM: number } | null = null;
      for (const segment of segments) {
        for (const placed of segment.placed) {
          if (placed.resolved || placed.kind !== kind || placed.lane !== lane) continue;
          const distanceM = runner.position.z - segment.group.position.z;
          if (distanceM < -0.3 || distanceM > Math.max(lookahead, 9)) continue;
          if (!best || distanceM < best.distanceM) best = { id: placed.id, kind: placed.kind, distanceM };
        }
      }
      return best;
    }

    function noteAction(action: "jump" | "roll" | "lane", source: InputSource, direction: -1 | 1 | 0, fromLane: number, confidence?: number, eventId?: string) {
      if (courseMode !== "live") {
        if (source === "keyboard") {
          hud.onPose?.({
            accepted: true,
            reason: null,
            latencyMs: null,
            lane: laneLabel(lane),
            action: motion,
            movementType: action === "jump" ? "jump" : action === "roll" ? "squat" : direction < 0 ? "lean_left" : "lean_right",
            confidence: confidence ?? 1,
            source: "keyboard",
          });
        }
        return;
      }
      lastSource = source;
      const kind: ObstacleKind = action === "jump" ? "log" : action === "roll" ? "fence" : "rock";
      recorder.action({
        action,
        source,
        direction,
        speedMps: liveSpeed,
        distanceM: distance,
        threat: threatFor(kind, fromLane),
        eventId: eventId ?? crypto.randomUUID(),
        clientTimestamp: Date.now(),
        confidence,
      });
    }

    function jump(source: InputSource = "keyboard", confidence?: number, eventId?: string) {
      if (courseMode !== "live" || demoOver) return false;
      if (motion === "roll") playRun();
      if (motion !== "run") return false;
      const next = beginJumpArc(jumpArc);
      if (!next) return false;
      jumpArc = next;
      groundLock = 0;
      footTarget = 0;
      const action = jumpAction;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 1;
      action.paused = true;
      fadeTo(action, 0.04);
      action.time = jumpUsesRunning ? RUNNING_JUMP_LEAVE_S : jumpTakeoffTime;
      action.paused = true;
      motion = "jump";
      activeClip = jumpPlaybackClip(jumpUsesRunning);
      motionEndsAt = Number.POSITIVE_INFINITY;
      noteAction("jump", source, 0, playerLane(), confidence, eventId);
      return true;
    }

    /** One arc owns the airborne collision height. Running Jump is scrubbed to that same clock. */
    function updateVertical(dt: number) {
      const step = remainingMotionDt(dt, shownJump);
      shownJump = 0;
      const arc = jumpArc;
      if (arc && arc.active) {
        const stepped = stepJumpArc(arc, step);
        jumpArc = stepped;
        const sample = sampleJump(stepped.elapsed);
        const action = jumpAction;
        if (!stepped.active || !sample.airborne) {
          action.time = jumpUsesRunning ? RUNNING_JUMP_RETURN_S : jumpTakeoffTime;
          action.paused = true;
          groundLock = 0.07;
          footTarget = 0;
          runAction.setLoop(THREE.LoopRepeat, Infinity);
          runAction.clampWhenFinished = false;
          runAction.timeScale = tuning.runTimeScale;
          fadeTo(runAction, 0.05);
          motion = "run";
          activeClip = "Run";
          if (courseMode === "live") {
            landingLife = 0.28;
            cameraDip = tuning.camera.landingDip;
            landing.position.set(runner.position.x, 0.05, runner.position.z);
            landing.scale.setScalar(0.55);
          }
          return;
        }
        const clipTime = jumpUsesRunning
          ? runningJumpClipTime(stepped.elapsed).time
          : jumpClipTime(stepped.elapsed, jumpTakeoffTime, jumpApexTime).time;
        action.timeScale = 0;
        action.paused = true;
        action.time = clipTime;
        motion = sample.phase === "rise" ? "jump" : "fall";
        activeClip = jumpPlaybackClip(jumpUsesRunning);
        footTarget = sample.height;
        return;
      }
      if (groundLock > 0) {
        groundLock = Math.max(0, groundLock - dt);
        if (groundLock === 0) {
          footTarget = null;
          runner.position.y = 0;
          return;
        }
        footTarget = 0;
        return;
      }
      footTarget = null;
      if (motion !== "roll") runner.position.y = THREE.MathUtils.damp(runner.position.y, 0, 16, dt);
    }

    function roll(source: InputSource = "keyboard", confidence?: number, eventId?: string) {
      if (courseMode !== "live" || demoOver || motion !== "run") return false;
      const action = actions.ForwardRoll;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 1;
      action.paused = false;
      fadeTo(action, 0.08);
      motion = "roll";
      activeClip = "ForwardRoll";
      motionEndsAt = actionNow() + rollEndTime;
      rollCursor = 0;
      noteAction("roll", source, 0, playerLane(), confidence, eventId);
      return true;
    }

    function playClip(clip: "StandUp" | "WipeSweat" | "LongJump") {
      if (demoOver || finished) return;
      const duration = Math.max(0.05, actions[clip].getClip().duration);
      const nextMotion: Motion = clip === "WipeSweat" ? "celebrate" : clip === "StandUp" ? "stand" : "longJump";
      playOnce(clip, duration, nextMotion);
    }

    function stepLane(direction: -1 | 1, source: InputSource = "keyboard", confidence?: number, eventId?: string) {
      if (courseMode !== "live" || finished || demoOver || actionNow() < laneLockUntil) return false;
      const sliding = laneT < 0.999 && Math.abs(laneTo - visualLane) > 0.02;
      const travel = Math.sign(laneTo - visualLane);
      if (sliding && travel === direction) return false;
      const next = sliding
        ? direction > 0
          ? Math.min(1, Math.floor(visualLane + 1e-3) + 1)
          : Math.max(-1, Math.ceil(visualLane - 1e-3) - 1)
        : Math.max(-1, Math.min(1, lane + direction));
      if (!sliding && next === lane) return false;
      if (sliding && next === laneTo) return false;
      const fromLane = playerLane();
      lane = next;
      laneFrom = visualLane;
      laneTo = next;
      laneT = 0;
      laneLockUntil = actionNow() + Math.max(0, tuning.laneInputCooldown);
      noteAction("lane", source, direction, fromLane, confidence, eventId);
      return true;
    }

    function reportPose(event: PoseCommand, accepted: boolean, reason: string | null, latencyMs: number | null = null): PoseReport {
      const source: InputSource = event.source === "keyboard" ? "keyboard" : "camera";
      const next: PoseReport = {
        accepted,
        reason,
        latencyMs,
        lane: laneLabel(lane),
        action: motion,
        movementType: event.movementType,
        confidence: event.confidence,
        source,
        eventId: event.eventId,
        playerId: event.playerId,
        sessionId: event.sessionId,
      };
      hud.onPose?.(next);
      return next;
    }

    function rememberPose(eventId: string) {
      seenPose.add(eventId);
      if (seenPose.size > 80) {
        const oldest = seenPose.values().next().value;
        if (oldest) seenPose.delete(oldest);
      }
    }

    function poseTiming(event: PoseCommand): "now" | "later" | "never" {
      if (event.movementType === "jump" && jumpDuringRoll(motion, event.movementType)) return "now";
      // The run clip is motion "run". An accepted jump plays in this call, not after a clip cue.
      // The 300ms lane slide is visual. stepLane already moved the authoritative lane.
      if (event.movementType === "jump" || event.movementType === "squat") return verticalCommandReady(motion) ? "now" : "later";
      if (event.movementType !== "lean_left" && event.movementType !== "lean_right") return "never";
      const direction = event.movementType === "lean_left" ? -1 : 1;
      if (actionNow() < laneLockUntil) return "later";
      const sliding = laneT < 0.999 && Math.abs(laneTo - visualLane) > 0.02;
      if (!sliding) {
        const next = lane + direction;
        return next < -1 || next > 1 ? "never" : "now";
      }
      return Math.sign(laneTo - visualLane) === direction ? "later" : "now";
    }

    function actPose(event: PoseCommand) {
      const source: InputSource = event.source === "keyboard" ? "keyboard" : "camera";
      if (event.movementType === "jump") return jump(source, event.confidence, event.eventId);
      if (event.movementType === "squat") return roll(source, event.confidence, event.eventId);
      if (event.movementType === "lean_left") return stepLane(-1, source, event.confidence, event.eventId);
      return stepLane(1, source, event.confidence, event.eventId);
    }

    /**
     * Draws the first slice before the next animation frame.
     * The loop subtracts that slice, so the arc and the lane are not stepped twice.
     */
    function showCommand(movementType: PoseCommand["movementType"]) {
      if (inTick || courseMode !== "live" || paused || finished || demoOver) return;
      if (movementType === "lean_left" || movementType === "lean_right") {
        advanceVisualLane(COMMAND_SLICE_S);
        shownLane = COMMAND_SLICE_S;
        applySideStep();
        runner.position.x = visualLane * tuning.laneSpacing;
      } else if (movementType === "jump") {
        updateVertical(COMMAND_SLICE_S);
        shownJump = COMMAND_SLICE_S;
        mixer.update(0);
        commitBodyHeight();
      } else if (movementType === "squat") {
        mixer.update(remainingMotionDt(COMMAND_SLICE_S, shownMixer));
        shownMixer = COMMAND_SLICE_S;
      } else {
        return;
      }
      renderer.render(scene, camera);
    }

    function flushPoseBuffer() {
      if (!poseBuffer || courseMode !== "live" || paused || finished) return;
      const event = poseBuffer.value;
      const receivedAt = poseBuffer.receivedAt;
      const timing = poseTiming(event);
      // Age starts when this TV accepted the socket event. A long frame's wall time
      // is not part of that age, so the latest jump, squat, or lane is not dropped
      // while the runner can still perform it. The phone timestamp is not used.
      const step = releaseLiveCommand(poseBuffer, performance.now(), COMMAND_STALE_MS, timing === "now", television, poseFrameDebtMs);
      if (step.dropped === "stale") {
        poseBuffer = null;
        poseFrameDebtMs = 0;
        reportPose(event, false, "stale");
        return;
      }
      if (timing === "never") {
        poseBuffer = null;
        poseFrameDebtMs = 0;
        reportPose(event, false, "not_ready");
        return;
      }
      if (!step.apply) {
        poseBuffer = step.held;
        return;
      }
      poseBuffer = null;
      poseFrameDebtMs = 0;
      fx.prime();
      const acted = actPose(event);
      if (acted) showCommand(event.movementType);
      reportPose(event, acted, acted ? null : "not_ready", acted ? Math.round(performance.now() - receivedAt) : null);
    }

    function applyPose(event: PoseCommand): PoseReport {
      const opened = performance.now();
      if (seenPose.has(event.eventId)) return reportPose(event, false, "duplicate");
      if (event.sequenceNumber !== undefined && event.sequenceNumber <= lastPoseSequence) return reportPose(event, false, "duplicate");
      if (finished || demoOver || livesHold) return reportPose(event, false, "finished");
      if (paused) return reportPose(event, false, "paused");
      if (event.movementType === "punch" || event.movementType === "hold") return reportPose(event, false, "ignored");
      if (!(event.confidence >= MIN_FITNESS_CONFIDENCE)) return reportPose(event, false, "low_confidence");
      rememberPose(event.eventId);
      if (event.sequenceNumber !== undefined) lastPoseSequence = event.sequenceNumber;
      if (courseMode !== "live") return reportPose(event, courseMode === "preview", courseMode === "preview" ? null : "not_ready");
      if (event.movementType === "jump" || event.movementType === "squat") unstickClip();
      const timing = poseTiming(event);
      if (timing === "later") {
        if (poseBuffer && poseBuffer.value.eventId !== event.eventId) reportPose(poseBuffer.value, false, "replaced");
        poseBuffer = holdCommand(poseBuffer, event, opened);
        poseFrameDebtMs = 0;
        return reportPose(event, false, "buffered");
      }
      if (timing === "never") return reportPose(event, false, "not_ready");
      fx.prime();
      const acted = actPose(event);
      if (acted) showCommand(event.movementType);
      // This duration is the TV performance clock, from this handler through the draw.
      // Do not subtract a phone timestamp from it.
      return reportPose(event, acted, acted ? null : "not_ready", acted ? Math.round(performance.now() - opened) : null);
    }

    function finish() {
      if (finished || demoOver) return;
      finished = true;
      stopped = true;
      window.cancelAnimationFrame(frame);
      const snap = recorder.stats();
      const score = liveScore(snap.clearancePoints);
      hud.onFinished?.({
        durationMs: performance.now() - wallStart,
        activeMs: Math.round(elapsed * 1000),
        distanceM: distance,
        score,
        tokens: coins,
        jumps: snap.jumps,
        squats: snap.squats,
        laneDodges: snap.laneDodges,
        perfects: snap.perfects,
        bestCombo: snap.bestMultiplier,
      });
    }

    // Arrow keys and Space call jump, roll, or stepLane on this TV. They do not emit
    // movement:event and they do not go through the phone camera. Camera commands
    // arrive later, in applyPose, after the phone and the server.
    function onKey(event: KeyboardEvent) {
      if (!acceptKeyboard) return;
      if (finished || demoOver || livesHold || courseMode === "hold") return;
      if (courseMode !== "live" && canvas.dataset.tutorialKeys !== "1") return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      fx.prime();
      const code = event.code;
      const practice = courseMode !== "live";
      if (code === "ArrowLeft" || code === "KeyA") {
        event.preventDefault();
        if (practice) noteAction("lane", "keyboard", -1, playerLane());
        else stepLane(-1);
      } else if (code === "ArrowRight" || code === "KeyD") {
        event.preventDefault();
        if (practice) noteAction("lane", "keyboard", 1, playerLane());
        else stepLane(1);
      } else if (code === "Space" || code === "ArrowUp") {
        event.preventDefault();
        if (practice) noteAction("jump", "keyboard", 0, playerLane());
        else jump();
      } else if (code === "ArrowDown" || code === "KeyS") {
        event.preventDefault();
        if (practice) noteAction("roll", "keyboard", 0, playerLane());
        else roll();
      } else if (code === "KeyC") {
        event.preventDefault();
        playClip("WipeSweat");
      } else if (code === "KeyP") {
        if (courseMode !== "live") return;
        event.preventDefault();
        setPaused(!paused);
      } else if (code === "KeyM") {
        event.preventDefault();
        setMuted(!muted);
      }
    }

    function onPointer() {
      fx.prime();
    }

    let viewWidth = 0;
    let viewHeight = 0;
    function resize() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const aspect = cameraAspectFromCss(width, height);
      if (aspect === null) return;
      const ratio = drawingPixelRatio();
      const layout = fitRunnerDrawingSize(width, height, television);
      const bufferWidth = Math.floor(layout.width * ratio);
      const bufferHeight = Math.floor(layout.height * ratio);
      const unchanged =
        width === viewWidth &&
        height === viewHeight &&
        canvas.width === bufferWidth &&
        canvas.height === bufferHeight &&
        renderer.getPixelRatio() === ratio;
      if (unchanged) return;
      viewWidth = width;
      viewHeight = height;
      if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
      // false keeps the CSS box on the full viewport. A later resize cannot write a 4K bitmap back.
      renderer.setSize(layout.width, layout.height, false);
      canvas.dataset.buffer = `${renderer.domElement.width}x${renderer.domElement.height}`;
      if (phoneDraw) canvas.dataset.drawPreset = phonePreset;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    function publish(speed: number) {
      const snap = recorder.stats();
      const score = liveScore(snap.clearancePoints);
      if (elapsed - statsAt > 0.25) {
        statsAt = elapsed;
        hud.onStats?.({ multiplier: snap.multiplier, bestMultiplier: snap.bestMultiplier });
      }
      canvas.dataset.ready = "true";
      canvas.dataset.clip = activeClip;
      canvas.dataset.lane = laneLabel(lane);
      canvas.dataset.visualLane = visualLane.toFixed(3);
      canvas.dataset.bodyX = bodySpanX;
      canvas.dataset.motion = motion;
      canvas.dataset.score = String(score);
      canvas.dataset.tokens = String(coins);
      canvas.dataset.combo = String(snap.multiplier);
      canvas.dataset.distance = distance.toFixed(1);
      canvas.dataset.paused = paused ? "1" : "0";
      canvas.dataset.quality = activeQuality;
      canvas.dataset.ahead = nearestAhead;
      canvas.dataset.module = coastModule(Math.max(0, Math.round(-runner.position.z / tuning.tileSize)));
      canvas.dataset.jumpTime = `${jumpAction.time.toFixed(2)}/${jumpAction.getClip().duration.toFixed(2)}/${runner.position.y.toFixed(2)}`;
      canvas.dataset.animTime = current.time.toFixed(3);
      canvas.dataset.hit = invuln > 0 ? "1" : "0";
      canvas.dataset.lives = String(shownLives);
      if (hud.clip) hud.clip.textContent = activeClip;
      if (hud.lane) hud.lane.textContent = laneT < 0.999 ? `${visualLane.toFixed(2)} → ${laneLabel(lane)}` : laneLabel(lane);
      if (hud.motion) hud.motion.textContent = invuln > 0 ? `${motion} · hit` : motion;
      if (hud.speed) hud.speed.textContent = `${speed.toFixed(1)} m/s`;
      if (hud.score) hud.score.textContent = String(score);
      if (hud.playScore) hud.playScore.textContent = String(score);
      if (hud.distance) hud.distance.textContent = `${Math.floor(distance)} m`;
      if (hud.time) hud.time.textContent = formatTime(elapsed);
      if (hud.demoTime && demoLimit !== null) hud.demoTime.textContent = formatRemaining(demoLimit, elapsed);
      if (hud.tokens) hud.tokens.textContent = String(coins);
      if (hud.combo) hud.combo.textContent = snap.multiplier > 0 ? `x${snap.multiplier}` : "—";
      if (hud.courseDebug) {
        const cueLane = Math.max(-1, Math.min(1, Math.round(visualLane))) as -1 | 0 | 1;
        const readout = courseDebugSnapshot({
          obstacles: courseObstacles,
          elapsedS: elapsed,
          speedMps: speed,
          playerLane: cueLane,
          valid: coursePlan ? courseValid : false,
          reasons: coursePlan ? courseReasons : ["waiting"],
        });
        hud.courseDebug.textContent = [
          `speed ${readout.speedMps.toFixed(2)} m/s`,
          `next obstacle ${readout.secondsUntilNext === null ? "—" : `${readout.secondsUntilNext.toFixed(2)} s`}`,
          `action ${readout.requiredAction}`,
          `between actions ${readout.secondsBetweenActions === null ? "—" : `${readout.secondsBetweenActions.toFixed(2)} s`}`,
          `latency allowance ${readout.latencyAllowanceS.toFixed(3)} s`,
          `recovery allowance ${readout.recoveryAllowanceS.toFixed(3)} s`,
          `difficulty ${readout.difficulty}`,
          `validation ${readout.validation}`,
        ].join("\n");
      }
    }

    function recycle() {
      for (let guard = 0; guard < segments.length; guard += 1) {
        let back = segments[0];
        let front = segments[0];
        if (!back || !front) return;
        for (const segment of segments) {
          if (segment.group.position.z > back.group.position.z) back = segment;
          if (segment.group.position.z < front.group.position.z) front = segment;
        }
        if (back.group.position.z <= runner.position.z + tuning.recycleBehind) break;
        back.group.position.z = front.group.position.z - tuning.tileSize;
        refill(back, nextSpawn);
        nextSpawn += 1;
      }
    }

    const skinVertex = new THREE.Vector3();
    const skinAccum = new THREE.Vector3();
    const skinInfluenced = new THREE.Vector3();
    const skinMatrix = new THREE.Matrix4();
    const flashColor = new THREE.Color(1, 0.28, 0.2);

    function paintFlash() {
      // Tint the materials already on the skinned mesh. Do not clone those materials or rescale the mesh.
      for (const material of skinMaterials) {
        const base = material.userData.baseColor ?? (material.userData.baseColor = material.color.clone());
        material.color.copy(base).lerp(flashColor, flash * 0.65);
        material.emissive.setRGB(flash * 1.4, flash * 0.25, flash * 0.12);
      }
    }

    function commitHit(obstacleId: string) {
      const pending = pendingHits.get(obstacleId);
      if (!pending) return;
      pendingHits.delete(obstacleId);
      recorder.resolve({
        obstacleId: pending.obstacleId,
        kind: pending.kind,
        outcome: "hit",
        threatened: true,
        distanceM: pending.distanceM,
        clientTimestamp: pending.clientTimestamp,
        speedMps: pending.speedMps,
      });
    }

    function commitPending() {
      for (const obstacleId of [...pendingHits.keys()]) commitHit(obstacleId);
    }

    function dropHit(obstacleId: string) {
      pendingHits.delete(obstacleId);
    }

    function releaseLivesHold() {
      livesHold = false;
    }

    function setLives(lives: number) {
      shownLives = Math.max(0, Math.min(RUN_LIVES, Math.floor(lives)));
      canvas.dataset.lives = String(shownLives);
    }

    function bodyBox() {
      const box = new THREE.Box3();
      if (!bodyMesh) return box;
      const position = bodyMesh.geometry.attributes.position;
      const skinIndex = bodyMesh.geometry.attributes.skinIndex;
      const skinWeight = bodyMesh.geometry.attributes.skinWeight;
      if (!position || !skinIndex || !skinWeight) return box;
      runner.updateWorldMatrix(true, true);
      bodyMesh.skeleton.update();
      const bones = bodyMesh.skeleton.boneMatrices;
      for (let index = 0; index < position.count; index += 8) {
        skinVertex.fromBufferAttribute(position, index);
        skinAccum.set(0, 0, 0);
        let weightSum = 0;
        for (let influence = 0; influence < 4; influence += 1) {
          const weight = skinWeight.getComponent(index, influence);
          if (weight === 0) continue;
          weightSum += weight;
          skinMatrix.fromArray(bones, skinIndex.getComponent(index, influence) * 16);
          skinInfluenced.copy(skinVertex).applyMatrix4(skinMatrix).multiplyScalar(weight);
          skinAccum.add(skinInfluenced);
        }
        if (weightSum === 0) continue;
        box.expandByPoint(skinAccum);
      }
      return box;
    }

    function commitBodyHeight() {
      const airborne = motion === "jump" || motion === "fall";
      canvas.dataset.airborne = airborne ? "1" : "0";
      canvas.dataset.feet = airborne && footTarget !== null ? footTarget.toFixed(3) : "ground";
      if (footTarget === null) return;
      const box = bodyBox();
      if (box.isEmpty()) runner.position.y = footTarget;
      else runner.position.y += footTarget - box.min.y;
    }

    function hitBoxes(object: THREE.Object3D) {
      const boxes: THREE.Box3[] = [];
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || mesh.name !== "hit" || !mesh.geometry) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox;
        if (!bounds) return;
        boxes.push(bounds.clone().applyMatrix4(mesh.matrixWorld));
      });
      return boxes;
    }

    function collide() {
      for (const segment of segments) {
        segment.tokens.forEach((token, index) => {
          if (!token.active) return;
          const tokenZ = segment.group.position.z + token.mesh.position.z;
          const prevZ = runner.position.z + frameStep;
          const reachZ = tokenRadius + 0.16;
          const zLo = Math.min(prevZ, runner.position.z) - reachZ;
          const zHi = Math.max(prevZ, runner.position.z) + reachZ;
          if (tokenZ < zLo || tokenZ > zHi) return;
          if (Math.abs(token.mesh.position.x - lane * tuning.laneSpacing) > tokenRadius + 0.26) return;
          if (token.baseY > 1.28 && runner.position.y < 0.34) return;
          token.active = false;
          token.collecting = 0.28;
          coins += 1;
          recorder.token({
            eventId: `token:${segment.spawn}:${index}`,
            source: lastSource,
            distanceM: distance,
            clientTimestamp: Date.now(),
          });
          token.mesh.getWorldPosition(fxPoint);
          fx.popup(fxPoint);
          fx.burst(fxPoint, "gold");
          fx.collect();
        });
      }

      nearestAhead = "none";
      let aheadDistance = Number.POSITIVE_INFINITY;
      const body = bodyBox();
      const hitShift = laneHitShift(lane, visualLane, tuning.laneSpacing);
      if (!body.isEmpty() && Math.abs(hitShift) > 1e-3) {
        body.min.x += hitShift;
        body.max.x += hitShift;
      } else if (!body.isEmpty() && Math.abs(laneStepX) > 1e-4) {
        const previous = body.clone();
        previous.min.x -= laneStepX;
        previous.max.x -= laneStepX;
        body.union(previous);
      }
      bodySpanX = body.isEmpty() ? "0,0" : `${body.min.x.toFixed(2)},${body.max.x.toFixed(2)}`;
      const shownBounds: THREE.Box3[] = [];
      for (const segment of segments) {
        for (const placed of segment.placed) {
          const span = runner.position.z - segment.group.position.z;
          const windows = clearanceWindowsMs(liveSpeed);
          const lookahead = (windows.good.max / 1000) * Math.max(liveSpeed, 0.5) + 0.35;
          if (!placed.resolved && placed.lane === playerLane() && span > -0.2 && span <= lookahead) placed.threatened = true;
          if (span > -0.4 && span < aheadDistance) {
            aheadDistance = span;
            nearestAhead = `${placed.kind}:${laneLabel(placed.lane)}:${span.toFixed(2)}`;
          }
          let struck = false;
          let push = 0;
          for (const bounds of hitBoxes(placed.object)) {
            if (tuning.showColliders) shownBounds.push(bounds);
            if (bounds.isEmpty() || !body.intersectsBox(bounds)) continue;
            struck = true;
            push = Math.max(push, bounds.max.z + 0.12 - body.min.z);
          }
          if (struck && push > 0) runner.position.z += push;
          if (struck && invuln <= 0 && !placed.hit) {
            placed.hit = true;
            placed.resolved = true;
            invuln = tuning.invulnerable;
            speedMul = tuning.hitSlowMultiplier;
            shake = 0.22;
            flash = 1;
            const clientTimestamp = Date.now();
            // The overlap is detected here. The server accepts or rejects this obstacle id.
            pendingHits.set(placed.id, {
              obstacleId: placed.id,
              kind: placed.kind,
              distanceM: distance,
              clientTimestamp,
              speedMps: liveSpeed,
            });
            placed.object.getWorldPosition(fxPoint);
            fxPoint.y += 0.7;
            fx.burst(fxPoint, "hit");
            fx.hit();
            if (shownLives <= 1) livesHold = true;
            hud.onHit?.({ obstacleId: placed.id, clientTimestamp });
          }
          if (!placed.resolved && span < -0.55) {
            placed.resolved = true;
            if (!placed.hit) {
              recorder.resolve({
                obstacleId: placed.id,
                kind: placed.kind,
                outcome: "clear",
                threatened: placed.threatened,
                distanceM: distance,
                clientTimestamp: Date.now(),
                speedMps: liveSpeed,
              });
              placed.object.getWorldPosition(fxPoint);
              fxPoint.y += placed.kind === "fence" ? 1.35 : 0.55;
              fx.burst(fxPoint, "lime");
              fx.clear();
            }
          }
        }
      }
      syncColliderGizmo(body, shownBounds);
    }

    const playerHit = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color("#7dffb2"));
    playerHit.visible = false;
    playerHit.frustumCulled = false;
    scene.add(playerHit);
    const obstacleHits: THREE.Box3Helper[] = [];

    function syncColliderGizmo(body: THREE.Box3, bounds: THREE.Box3[]) {
      const show = tuning.showColliders;
      playerHit.visible = show && !body.isEmpty();
      if (playerHit.visible) playerHit.box.copy(body);
      let count = 0;
      if (show) {
        for (const box of bounds) {
          if (box.isEmpty()) continue;
          let helper = obstacleHits[count];
          if (!helper) {
            helper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color("#ffe14a"));
            helper.frustumCulled = false;
            scene.add(helper);
            obstacleHits.push(helper);
          }
          helper.visible = true;
          helper.box.copy(box);
          count += 1;
        }
      }
      for (let index = count; index < obstacleHits.length; index += 1) {
        const helper = obstacleHits[index];
        if (helper) helper.visible = false;
      }
    }

    function concealCourse() {
      obstaclesConcealed = true;
      for (const segment of segments) {
        for (const placed of segment.placed) placed.object.visible = false;
        for (const token of segment.tokens) token.mesh.visible = false;
      }
    }

    function revealCourse() {
      obstaclesConcealed = false;
      for (const segment of segments) {
        for (const placed of segment.placed) placed.object.visible = true;
        for (const token of segment.tokens) token.mesh.visible = token.active;
      }
    }

    function presentHeld(dt: number) {
      if (courseMode !== "live") {
        previewTime += dt;
        if ((motion === "roll" || motion === "celebrate" || motion === "stand" || motion === "longJump") && previewTime >= motionEndsAt) {
          playRun();
        }
      }
      if (courseMode === "preview") {
        advanceVisualLane(dt);
        visual.rotation.z = THREE.MathUtils.damp(visual.rotation.z, sideLeanTarget(), tuning.leanDamp, dt);
        runner.position.x = visualLane * tuning.laneSpacing;
        updateVertical(dt);
        const desired = new THREE.Vector3(runner.position.x, tuning.camera.height, runner.position.z + tuning.camera.distance);
        const follow = 1 - Math.exp(-tuning.camera.smooth * dt);
        camera.position.lerp(desired, follow);
        camera.lookAt(runner.position.x, tuning.camera.lookHeight, runner.position.z - tuning.camera.lookAhead);
        blob.position.set(runner.position.x, 0.02, runner.position.z);
      }
      mixer.update(dt);
      applySideStep();
      commitBodyHeight();
      canvas.dataset.course = courseMode;
      canvas.dataset.clip = activeClip;
      canvas.dataset.lane = laneLabel(lane);
      canvas.dataset.motion = motion;
      renderer.render(scene, camera);
    }

    function clearJumpArc() {
      jumpArc = null;
      footTarget = null;
      groundLock = 0;
    }

    /** Drops a jump arc or a roll. The body is grounded and running. A waiting jump or squat is not played. */
    function groundRunner() {
      clearJumpArc();
      if (poseBuffer) {
        const held = poseBuffer.value;
        poseBuffer = null;
        poseFrameDebtMs = 0;
        reportPose(held, false, "paused");
      }
      runner.position.y = 0;
      rollCursor = 0;
      motionEndsAt = 0;
      if (!verticalCommandReady(motion)) playRun();
    }

    /** Play Again applies this clip. A stale canvas hold must not freeze the next arc. */
    function prepareReplay(clip: ReturnType<typeof replayClip> = replayClip()) {
      groundRunner();
      paused = false;
      livesHold = false;
      canvas.dataset.hold = "0";
      if (motion !== clip.motion) playRun();
    }

    function unstickClip() {
      if (releaseStuckClip({ motion, jumpActive: Boolean(jumpArc?.active), elapsed: actionNow(), motionEndsAt }) === "ground") {
        groundRunner();
      }
    }

    function holdIdle() {
      if (courseMode === "live") return;
      clearJumpArc();
      courseMode = "hold";
      canvas.dataset.course = "hold";
      runner.position.y = 0;
      visual.rotation.x = 0;
      visual.rotation.z = 0;
      playRun();
    }

    function previewCourse() {
      if (courseMode === "live") return;
      courseMode = "preview";
      canvas.dataset.course = "preview";
      if (motion !== "run") playRun();
    }

    function resetNeutral() {
      groundRunner();
      lane = 0;
      laneFrom = 0;
      laneTo = 0;
      laneT = 1;
      visualLane = 0;
      laneLockUntil = 0;
      runner.position.x = 0;
      visual.rotation.z = 0;
    }

    function beginCourse() {
      if (finished) return;
      prepareReplay();
      if (courseMode === "live") return;
      resetNeutral();
      revealCourse();
      courseMode = "live";
      canvas.dataset.hold = "0";
      paused = false;
      delete canvas.dataset.tutorialKeys;
      elapsed = 0;
      previewTime = 0;
      distance = 0;
      runDistance = 0;
      clock.getDelta();
      canvas.dataset.course = "live";
      hud.onRunBegin?.();
    }

    function endDemo() {
      if (demoOver) return;
      demoOver = true;
      if (demoLimit !== null) elapsed = demoLimit;
      canvas.dataset.demoOver = "1";
      publish(liveSpeed);
      hud.onDemoOver?.({ activeMs: Math.round(elapsed * 1000) });
    }

    function notePhoneFrame(now: number) {
      if (!phoneDraw) return;
      const previous = phoneFrameAt;
      phoneFrameAt = now;
      if (phoneWarmup < 45) {
        phoneWarmup += 1;
        return;
      }
      if (previous <= 0) return;
      const next = stepPhoneDrawHysteresis(phoneDrawState, now - previous);
      const changed = next.preset !== phoneDrawState.preset;
      phoneDrawState = next;
      if (!changed) return;
      phonePreset = next.preset;
      canvas.dataset.drawPreset = next.preset;
      applyPhoneTextureClarity(scene, next.preset, renderer.capabilities.getMaxAnisotropy());
    }

    function tick(now = performance.now()) {
      if (stopped) return;
      frame = window.requestAnimationFrame(tick);
      notePhoneFrame(now);
      hud.onFrame?.(now);
      resize();
      if (courseMode !== "live") {
        if (!phoneDraw) {
          presentHeld(Math.min(0.05, clock.getDelta()));
          return;
        }
        const rawDelta = clock.getDelta();
        const heldDt = runnerFrameSlices(rawDelta, true).reduce((total, step) => total + step, 0);
        presentHeld(heldDt);
        return;
      }
      if (demoOver) {
        clock.getDelta();
        renderer.render(scene, camera);
        return;
      }
      if (paused || livesHold) {
        unstickClip();
        clock.getDelta();
        if (livesHold && flash > 0) paintFlash();
        renderer.render(scene, camera);
        return;
      }
      unstickClip();
      const rawDelta = clock.getDelta();
      if (television && poseBuffer) poseFrameDebtMs = noteLongFrame(poseFrameDebtMs, rawDelta * 1000);
      const slices = runnerFrameSlices(rawDelta, runnerUsesCatchUp({ television, phone: phoneDraw }));
      const steps = slices.length > 0 ? slices : [0];
      inTick = true;
      try {
      let demoEnded = false;
      for (const dt of steps) {
      elapsed += dt;
      if (demoLimit !== null && elapsed >= demoLimit) {
        elapsed = demoLimit;
        endDemo();
        demoEnded = true;
        break;
      }
      if ((motion === "roll" || motion === "celebrate" || motion === "stand" || motion === "longJump") && elapsed >= motionEndsAt) {
        playRun();
      }

      flushPoseBuffer();
      advanceVisualLane(dt);
      visual.rotation.z = THREE.MathUtils.damp(visual.rotation.z, sideLeanTarget(), tuning.leanDamp, dt);
      const previousX = runner.position.x;
      runner.position.x = visualLane * tuning.laneSpacing;
      laneStepX = runner.position.x - previousX;
      updateVertical(dt);

      speedMul = Math.min(1, speedMul + dt * tuning.hitRecovery);
      invuln = Math.max(0, invuln - dt);
      flash = Math.max(0, flash - dt * 2.2);

      const speed = runPace(elapsed, tuning, speedMul);
      liveSpeed = speed;
      if (motion === "roll") {
        if (actions.ForwardRoll.time > rollEndTime) {
          actions.ForwardRoll.time = rollEndTime;
          actions.ForwardRoll.paused = true;
        }
        const rollTime = Math.min(actions.ForwardRoll.time, rollEndTime);
        const traveled = sampleCurve(roots.ForwardRoll.times, roots.ForwardRoll.z, rollTime);
        const step = traveled - rollCursor;
        runner.position.z -= step;
        distance += Math.max(0, step);
        rollCursor = traveled;
        frameStep = Math.max(0, step);
      } else {
        const step = runStepMeters(elapsed, dt, tuning, speedMul);
        runner.position.z -= step;
        distance += step;
        frameStep = step;
      }
      const mixerDt = remainingMotionDt(dt, shownMixer);
      shownMixer = 0;
      mixer.update(mixerDt);
      applySideStep();
      commitBodyHeight();
      runDistance = distance;
      ensureCourse(distance);
      recycle();
      collide();
      paintFlash();

      for (const segment of segments) {
        for (const token of segment.tokens) {
          if (token.active) {
            const worldZ = segment.group.position.z + token.mesh.position.z;
            if (worldZ > runner.position.z + 0.45) {
              token.active = false;
              token.mesh.visible = false;
            } else {
              token.mesh.rotation.y += dt * 1.15;
              token.mesh.position.y = token.baseY + Math.sin(elapsed * 2.2 + segment.spawn) * 0.04;
            }
          } else if (token.collecting > 0) {
            token.collecting -= dt;
            const life = Math.max(0, token.collecting / 0.28);
            token.mesh.scale.setScalar(Math.max(0.01, life));
            token.mesh.position.y = token.baseY + (1 - life) * 0.28;
            token.mesh.rotation.y += dt * 2.2;
            if (token.collecting <= 0) token.mesh.visible = false;
          }
        }
      }

      const jumpLift = Math.max(0, runner.position.y);
      const jumpScale = 1 - Math.min(1, jumpLift / 0.7) * 0.45;
      blob.position.set(runner.position.x, 0.02, runner.position.z);
      blob.scale.setScalar(0.82 + 0.18 * jumpScale);
      const blobMaterial = blob.material as THREE.MeshBasicMaterial;
      blobMaterial.opacity = 0.22 + 0.62 * jumpScale;

      if (landingLife > 0) {
        landingLife -= dt;
        landing.scale.setScalar(0.4 + (0.35 - landingLife) * 6);
        const landingMaterial = landing.material as THREE.MeshBasicMaterial;
        landingMaterial.opacity = Math.max(0, landingLife * 2);
      }

      shake = Math.max(0, shake - dt);
      cameraDip = THREE.MathUtils.damp(cameraDip, 0, 4.5, dt);
      const targetFov = tuning.camera.fov + tuning.camera.fovGain * (speed / tuning.maxSpeed);
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
      const desired = new THREE.Vector3(
        runner.position.x + Math.sin(elapsed * 48) * shake,
        tuning.camera.height - cameraDip,
        runner.position.z + tuning.camera.distance,
      );
      const follow = 1 - Math.exp(-tuning.camera.smooth * dt);
      camera.position.lerp(desired, follow);
      camera.lookAt(
        runner.position.x,
        tuning.camera.lookHeight + jumpLift * tuning.camera.jumpLook,
        runner.position.z - tuning.camera.lookAhead,
      );

      sun.position.set(runner.position.x + 6, 14, runner.position.z + 8);
      sun.target.position.set(runner.position.x, 0.4, runner.position.z - 4);
      tropical.update(runner.position, camera, elapsed);
      fx.update(dt);
      }
      if (!demoEnded) publish(liveSpeed);
      renderer.render(scene, camera);
      } finally {
        inTick = false;
      }
    }

    function localJump(confidence?: number, eventId?: string) {
      if (finished || demoOver || livesHold || courseMode !== "live") return false;
      fx.prime();
      const acted = jump("camera", confidence, eventId);
      if (acted) showCommand("jump");
      return acted;
    }

    function localRoll(confidence?: number, eventId?: string) {
      if (finished || demoOver || livesHold || courseMode !== "live") return false;
      fx.prime();
      const acted = roll("camera", confidence, eventId);
      if (acted) showCommand("squat");
      return acted;
    }

    function localStep(direction: -1 | 1, confidence?: number, eventId?: string) {
      if (finished || demoOver || livesHold || courseMode !== "live") return false;
      fx.prime();
      const acted = stepLane(direction, "camera", confidence, eventId);
      if (acted) showCommand(direction < 0 ? "lean_left" : "lean_right");
      return acted;
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    window.addEventListener("pointerdown", onPointer);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", resize);
    visualViewport?.addEventListener("scroll", resize);
    if (phoneDraw) applyPhoneTextureClarity(scene, phonePreset, renderer.capabilities.getMaxAnisotropy());
    resize();
    publish(tuning.forwardSpeed);
    tropical.update(runner.position, camera, 0);
    canvas.dataset.hold = "0";
    applyCourse({ seed: PROVISIONAL_COURSE_SEED, ceiling: "beginner" });
    if (holdCourse) {
      concealCourse();
      canvas.dataset.course = "hold";
    }
    frame = window.requestAnimationFrame(tick);

    return {
      playClip,
      setPaused,
      setMuted,
      setQuality,
      applyPose,
      finish,
      holdIdle,
      previewCourse,
      resetNeutral,
      beginCourse,
      prepareReplay,
      commitHit,
      commitPending,
      dropHit,
      releaseLivesHold,
      setLives,
      applyCourse,
      localJump,
      localRoll,
      localStep,
      dispose() {
        stopped = true;
        canvas.removeEventListener("webglcontextlost", onContextLost);
        window.cancelAnimationFrame(frame);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", resize);
        window.removeEventListener("orientationchange", resize);
        window.removeEventListener("pointerdown", onPointer);
        visualViewport?.removeEventListener("resize", resize);
        visualViewport?.removeEventListener("scroll", resize);
        mixer.stopAllAction();
        fx.dispose();
        tropical.dispose();
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        const textures = new Set<THREE.Texture>();
        scene.traverse((object) => {
          const drawable = object as THREE.Mesh;
          if (drawable.geometry && !geometries.has(drawable.geometry)) {
            geometries.add(drawable.geometry);
            drawable.geometry.dispose();
          }
          const material = drawable.material;
          const list = Array.isArray(material) ? material : material ? [material] : [];
          for (const item of list) {
            if (materials.has(item)) continue;
            materials.add(item);
            const mapped = item as THREE.MeshStandardMaterial;
            if (mapped.map && !textures.has(mapped.map)) {
              textures.add(mapped.map);
              mapped.map.dispose();
            }
            item.dispose();
          }
        });
        playerHit.geometry.dispose();
        (playerHit.material as THREE.Material).dispose();
        for (const helper of obstacleHits) {
          helper.geometry.dispose();
          (helper.material as THREE.Material).dispose();
        }
        renderer.dispose();
      },
    };
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}
