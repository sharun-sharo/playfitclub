import { inCameraFrame } from "./preview-fit";

/**
 * Camera framing from normalized MediaPipe landmarks.
 * x and y are 0–1 in the unmirrored camera image, origin at the top-left, y downward.
 * Nothing here is metres, pixels, or a depth estimate.
 *
 * Mirror rule:
 * The phone preview flips the front camera (`facing === "user"`) with CSS, so the
 * picture behaves like a mirror. MediaPipe still reads the unmirrored frame.
 * previewX = mirrored ? 1 - rawX : rawX.
 * A fully visible body may stand anywhere in the frame. MOVE LEFT and MOVE RIGHT
 * are only for a required joint touching the image edge. On a mirrored preview,
 * a body cut off on the right of the picture steps to the player's left.
 * The words are the step in the real room.
 */

export interface FramingLandmark {
  x: number;
  y: number;
  visibility?: number;
}

export type FramingProfile = "setup" | "play";

export type FramingCode =
  | "good"
  | "too_close"
  | "too_far"
  | "move_left"
  | "move_right"
  | "tilt_up"
  | "tilt_down"
  | "keep_feet"
  | "arm_space"
  | "adjust_camera";

export type FramingTone = "ready" | "adjust" | "poor";

export interface FramingConfig {
  /** Landmark inside this fraction of a frame edge counts as clipped. */
  clipEdge: number;
  /** Empty space above the head before a clipped head is a tilt, not a crop. */
  headroom: number;
  /** Setup: empty space below the ankles. */
  footroom: number;
  minVisibility: number;
  /** Consecutive frames before the published instruction changes. */
  stableFrames: number;
  /** Consecutive raw GOOD frames before calibration may start. */
  goodFramesToCalibrate: number;
  /** Bad framing must last at least this long before the in-play banner. Longer than one frame. */
  warnMs: number;
  /** Further sustained loss pauses into the reposition state. One frame is not enough. */
  pauseMs: number;
}

export const DEFAULT_FRAMING_CONFIG: FramingConfig = {
  clipEdge: 0.035,
  headroom: 0.08,
  footroom: 0.08,
  minVisibility: 0.45,
  stableFrames: 5,
  goodFramesToCalibrate: 8,
  warnMs: 800,
  pauseMs: 3000,
};

export const FRAMING_SETUP_LINES = [
  "Move back until your full body is visible.",
  "Place your phone upright on a stable stand.",
  "Keep your head and feet inside the frame.",
] as const;

export const FRAMING_SETUP_COPY = FRAMING_SETUP_LINES.join(" ");

export const FRAMING_DISTANCE_HINT = FRAMING_SETUP_COPY;

export const CALIBRATION_HOLD = "Great! Stay still while we calibrate.";
export const PLAY_BANNER = "PLEASE MOVE BACK INTO FRAME";
export const LOST_YOU = "We lost you. Step back into view.";

const INSTRUCTION: Record<FramingCode, string> = {
  good: "Player detected",
  too_close: "STEP BACK A LITTLE",
  too_far: "MOVE CLOSER",
  move_left: "MOVE LEFT",
  move_right: "MOVE RIGHT",
  tilt_up: "TILT YOUR PHONE UP",
  tilt_down: "TILT YOUR PHONE DOWN",
  keep_feet: "KEEP YOUR FEET VISIBLE",
  arm_space: "MAKE SPACE FOR BOTH ARMS",
  adjust_camera: "ADJUST THE CAMERA",
};

/** MediaPipe Pose Landmarker indices. Anatomical left and right, not preview sides. */
const JOINT = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

const CONFIDENCE_JOINTS = [
  JOINT.nose,
  JOINT.leftShoulder,
  JOINT.rightShoulder,
  JOINT.leftWrist,
  JOINT.rightWrist,
  JOINT.leftHip,
  JOINT.rightHip,
  JOINT.leftKnee,
  JOINT.rightKnee,
  JOINT.leftAnkle,
  JOINT.rightAnkle,
] as const;

export interface GestureBlocks {
  leftArm: boolean;
  rightArm: boolean;
  squat: boolean;
  jump: boolean;
  note: string | null;
}

export interface FramingView {
  code: FramingCode;
  tone: FramingTone;
  instruction: string;
  /** True once the published instruction has held for the stable window. */
  stable: boolean;
  /** Several consecutive raw GOOD frames. Calibration may start. */
  calibrate: boolean;
  /** In-play framing has been bad for the warning interval. */
  banner: boolean;
  /** In-play framing stayed bad long enough to pause. Stays latched until resume(). */
  pause: boolean;
  /** Paused, and raw GOOD has held for the stable frame count. One flicker does not set this. */
  canResume: boolean;
  /** Drop every gesture. A single missed frame does not set this. */
  suppressAll: boolean;
  /** Immediate landmark gaps. One missing frame blocks that gesture only. */
  blocks: GestureBlocks;
  /** Stable copy for a missing arm, squat, or jump. One frame does not show it. */
  unavailable: string | null;
  confidence: number;
  fps: number;
}

export interface FramingSample {
  landmarks: Array<FramingLandmark | null | undefined>;
  mirrored: boolean;
  now: number;
  profile: FramingProfile;
  minVisibility?: number;
}

interface RawFraming {
  code: FramingCode;
  confidence: number;
}

export function classifyFraming(
  landmarks: Array<FramingLandmark | null | undefined>,
  options: { mirrored: boolean; profile: FramingProfile; config?: Partial<FramingConfig> },
): { code: FramingCode; tone: FramingTone; instruction: string; confidence: number } {
  const config = resolveConfig(options.config);
  const raw = classifyRaw(landmarks, options.mirrored, options.profile, config);
  return {
    code: raw.code,
    tone: toneFor(raw.code),
    instruction: INSTRUCTION[raw.code],
    confidence: raw.confidence,
  };
}

function resolveConfig(overrides?: Partial<FramingConfig>, minVisibility?: number): FramingConfig {
  return {
    ...DEFAULT_FRAMING_CONFIG,
    ...overrides,
    ...(typeof minVisibility === "number" ? { minVisibility } : {}),
  };
}

/**
 * One primary instruction for a single frame.
 * GOOD means the head, shoulders, and hips are inside the image.
 * Knees and ankles under the visibility floor do not reject the frame.
 * Where the body stands in the frame does not matter. Apparent size does not matter
 * while those joints stay inside. Setup and play share that rule.
 */
function classifyRaw(
  landmarks: Array<FramingLandmark | null | undefined>,
  mirrored: boolean,
  _profile: FramingProfile,
  config: FramingConfig,
): RawFraming {
  void _profile;
  const confidence = visibilityConfidence(landmarks);
  const nose = joint(landmarks, JOINT.nose, config.minVisibility);
  const leftShoulder = joint(landmarks, JOINT.leftShoulder, config.minVisibility);
  const rightShoulder = joint(landmarks, JOINT.rightShoulder, config.minVisibility);
  const leftHip = joint(landmarks, JOINT.leftHip, config.minVisibility);
  const rightHip = joint(landmarks, JOINT.rightHip, config.minVisibility);
  const leftKnee = joint(landmarks, JOINT.leftKnee, config.minVisibility);
  const rightKnee = joint(landmarks, JOINT.rightKnee, config.minVisibility);
  const leftAnkle = joint(landmarks, JOINT.leftAnkle, config.minVisibility);
  const rightAnkle = joint(landmarks, JOINT.rightAnkle, config.minVisibility);

  const seen = [nose, leftShoulder, rightShoulder, leftHip, rightHip, leftAnkle, rightAnkle].filter(Boolean).length;
  if (seen < 2) return { code: "adjust_camera", confidence };

  const shouldersAtTop = Boolean(
    leftShoulder && rightShoulder && Math.min(leftShoulder.y, rightShoulder.y) <= config.clipEdge,
  );
  const headAtEdge = Boolean(nose && nose.y <= config.clipEdge);
  const headClipped = headAtEdge || (!nose && shouldersAtTop);
  const feetAtEdge = Boolean(
    (leftAnkle && leftAnkle.y >= 1 - config.clipEdge) || (rightAnkle && rightAnkle.y >= 1 - config.clipEdge),
  );
  const feetVisible = Boolean(leftAnkle && rightAnkle);
  const headVisible = Boolean(nose);

  if (!headVisible && !feetVisible && !headClipped && !feetAtEdge) return { code: "adjust_camera", confidence };
  if (headClipped && feetAtEdge) return { code: "too_close", confidence };

  const headHasRoom = Boolean(nose && nose.y >= config.headroom);
  const feetHaveRoom = Boolean(
    leftAnkle && rightAnkle && leftAnkle.y <= 1 - config.footroom && rightAnkle.y <= 1 - config.footroom,
  );

  if (headClipped && feetVisible && !feetAtEdge && feetHaveRoom) return { code: "tilt_up", confidence };
  if (feetAtEdge && headVisible && !headClipped && headHasRoom) return { code: "tilt_down", confidence };
  const upperBody = Boolean(nose && leftShoulder && rightShoulder && leftHip && rightHip && !headClipped);
  const ankleOutside = [JOINT.leftAnkle, JOINT.rightAnkle].some((index) => {
    const point = landmarks[index];
    if (!point || (point.visibility ?? 0) < config.minVisibility) return false;
    return !inCameraFrame(point);
  });
  if (ankleOutside || (!feetVisible && !upperBody)) return { code: "keep_feet", confidence };
  if (!headVisible) return { code: shouldersAtTop ? "tilt_up" : "adjust_camera", confidence };

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return { code: "adjust_camera", confidence };
  }

  const edge = horizontalEdge(
    [nose, leftShoulder, rightShoulder, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle],
    config,
    mirrored,
  );
  if (edge) return { code: edge, confidence };

  if (footPredictedOutside(landmarks, config.minVisibility)) return { code: "keep_feet", confidence };

  return { code: "good", confidence };
}

/** A confident heel or toe past the image is not a visible foot. A low-confidence guess is ignored. */
function footPredictedOutside(landmarks: Array<FramingLandmark | null | undefined>, minVisibility: number) {
  const indexes = [JOINT.leftHeel, JOINT.rightHeel, JOINT.leftFoot, JOINT.rightFoot];
  return indexes.some((index) => {
    const point = landmarks[index];
    if (!point || (point.visibility ?? 0) < minVisibility) return false;
    return !inCameraFrame(point);
  });
}

/** A required joint on the image edge. A body standing in the left or right third, fully inside, returns null. */
function horizontalEdge(
  points: Array<FramingLandmark | null>,
  config: FramingConfig,
  mirrored: boolean,
): "move_left" | "move_right" | "too_close" | null {
  const visible = points.filter((point): point is FramingLandmark => Boolean(point));
  if (visible.length === 0) return null;
  let minX = 1;
  let maxX = 0;
  for (const point of visible) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
  }
  const clippedLeft = minX <= config.clipEdge;
  const clippedRight = maxX >= 1 - config.clipEdge;
  if (!clippedLeft && !clippedRight) return null;
  if (clippedLeft && clippedRight) return "too_close";
  const rawX = clippedLeft ? minX : maxX;
  const previewX = mirrored ? 1 - rawX : rawX;
  return recenter(previewX, mirrored);
}

/** Image on the right of the preview has to move left. The returned step is the real-room step. */
function recenter(previewX: number, mirrored: boolean): "move_left" | "move_right" {
  const imageOnRight = previewX > 0.5;
  if (imageOnRight) return mirrored ? "move_left" : "move_right";
  return mirrored ? "move_right" : "move_left";
}

function joint(
  landmarks: Array<FramingLandmark | null | undefined>,
  index: number,
  minVisibility: number,
): FramingLandmark | null {
  const point = landmarks[index];
  if (!point || (point.visibility ?? 0) < minVisibility) return null;
  if (!inCameraFrame(point)) return null;
  return point;
}

function visibilityConfidence(landmarks: Array<FramingLandmark | null | undefined>) {
  let total = 0;
  for (const index of CONFIDENCE_JOINTS) total += landmarks[index]?.visibility ?? 0;
  return total / CONFIDENCE_JOINTS.length;
}

function toneFor(code: FramingCode): FramingTone {
  if (code === "good") return "ready";
  if (code === "adjust_camera") return "poor";
  return "adjust";
}

/**
 * A hip this far past the image is still the player's hip.
 * The hard 0–1 box treated that hip as missing and dropped jump and squat.
 * A lean does not read this box, so left and right still fired.
 */
export const VERTICAL_HIP_MARGIN = 0.08;

/**
 * Anatomical sides, matching LEFT ARM UP → MOVE LEFT on the phone.
 * A missing shoulder, elbow, or wrist blocks that arm only.
 * Jump and squat need both hips visible. A hip a little past the image still counts.
 */
export function gestureBlocks(
  landmarks: Array<FramingLandmark | null | undefined>,
  minVisibility = DEFAULT_FRAMING_CONFIG.minVisibility,
): GestureBlocks {
  const leftArm = !chainVisible(landmarks, [JOINT.leftShoulder, JOINT.leftElbow, JOINT.leftWrist], minVisibility);
  const rightArm = !chainVisible(landmarks, [JOINT.rightShoulder, JOINT.rightElbow, JOINT.rightWrist], minVisibility);
  const hips = verticalHipsVisible(landmarks, [JOINT.leftHip, JOINT.rightHip], minVisibility);
  const squat = !hips;
  const jump = !hips;
  const notes: string[] = [];
  if (leftArm) notes.push("LEFT ARM NOT IN FRAME");
  if (rightArm) notes.push("RIGHT ARM NOT IN FRAME");
  if (squat) notes.push("SQUAT NEEDS HIPS");
  if (jump) notes.push("JUMP NEEDS HIPS");
  return { leftArm, rightArm, squat, jump, note: notes.length > 0 ? notes.join(" · ") : null };
}

export function gestureAllowed(movementType: string, blocks: GestureBlocks) {
  if (movementType === "lean_left") return !blocks.leftArm;
  if (movementType === "lean_right") return !blocks.rightArm;
  if (movementType === "squat") return !blocks.squat;
  if (movementType === "jump") return !blocks.jump;
  return true;
}

function chainVisible(
  landmarks: Array<FramingLandmark | null | undefined>,
  indexes: number[],
  minVisibility: number,
) {
  return indexes.every((index) => joint(landmarks, index, minVisibility));
}

function verticalHipsVisible(
  landmarks: Array<FramingLandmark | null | undefined>,
  indexes: number[],
  minVisibility: number,
) {
  return indexes.every((index) => {
    const point = landmarks[index];
    if (!point || (point.visibility ?? 0) < minVisibility) return false;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    return (
      point.x >= -VERTICAL_HIP_MARGIN &&
      point.x <= 1 + VERTICAL_HIP_MARGIN &&
      point.y >= -VERTICAL_HIP_MARGIN &&
      point.y <= 1 + VERTICAL_HIP_MARGIN
    );
  });
}

/** One plain line for the phone. The classifier still owns the decision. */
export function plainFramingCue(code: FramingCode, confidence = 1): string {
  switch (code) {
    case "too_close":
      return "Move backward";
    case "too_far":
      return "Move closer";
    case "keep_feet":
      return "Keep your head and feet inside the frame.";
    case "tilt_up":
      return "Tilt phone upward";
    case "tilt_down":
      return "Tilt phone downward";
    case "move_left":
      return "Move slightly left";
    case "move_right":
      return "Move slightly right";
    case "arm_space":
      return "Move back until your full body is visible.";
    case "adjust_camera":
      return confidence < 0.45 ? "Improve lighting" : "Move back until your full body is visible.";
    case "good":
      return "Player detected";
  }
}

/** Calibration already decided. This only picks the line the phone shows. */
export function plainCalibrationCue(guidance: string, code: FramingCode | null, confidence = 1): string {
  if (code && code !== "good") return plainFramingCue(code, confidence);
  if (/feet|ankles/i.test(guidance)) return "Show your feet";
  if (/stay in frame/i.test(guidance)) return "Step into view";
  if (/closer/i.test(guidance)) return "Move closer";
  if (/head|shoulder|full body|back/i.test(guidance)) return "Move back";
  return "Stand naturally";
}

export function plainLimbCue(note: string | null): string | null {
  if (!note) return null;
  if (note.includes("LEFT ARM")) return "Show your left arm";
  if (note.includes("RIGHT ARM")) return "Show your right arm";
  if (note.includes("HIPS AND KNEES")) return "Show your hips and knees";
  if (note.includes("HIPS AND ANKLES")) return "Show your feet";
  return null;
}

export function framingStatusLine(message: string | null | undefined) {
  if (!message) return "";
  const text = message.trim();
  if (!text || text.length > 96) return "";
  const upper = text.toUpperCase();
  const cues = [
    "STEP BACK",
    "MOVE CLOSER",
    "MOVE LEFT",
    "MOVE RIGHT",
    "KEEP YOUR FEET",
    "MAKE SPACE",
    "TILT YOUR PHONE",
    "PERFECT",
    "PLEASE MOVE BACK",
    "WE LOST YOU",
    "STEP BACK INTO VIEW",
    "ADJUST THE CAMERA",
    "NOT IN FRAME",
    "HIPS AND KNEES",
    "HIPS AND ANKLES",
    "STAY STILL WHILE WE CALIBRATE",
    "PLAYER DETECTED",
    "MOTION TRACKING ACTIVE",
    "LOOKING FOR PLAYER",
    "ONE PERSON AT A TIME",
    "CHEST HEIGHT",
    "RAISE YOUR LEFT ARM",
    "RAISE YOUR RIGHT ARM",
    "DO A SMALL JUMP",
    "SQUAT DOWN",
    "LIFT YOUR LEFT ARM",
    "LIFT YOUR RIGHT ARM",
    "BEND YOUR KNEES, THEN HOP",
    "LOWER YOUR HIPS",
  ];
  return cues.some((cue) => upper.includes(cue)) ? text : "";
}

export function createFramingMonitor(overrides?: Partial<FramingConfig>) {
  const config = { ...DEFAULT_FRAMING_CONFIG, ...overrides };
  let runCode: FramingCode | null = null;
  let run = 0;
  let published: FramingCode | null = null;
  let goodStreak = 0;
  let badSince: number | null = null;
  let paused = false;
  let noteValue: string | null = null;
  let noteRun = 0;
  let shownNote: string | null = null;
  let stamps: number[] = [];

  function reset() {
    runCode = null;
    run = 0;
    published = null;
    goodStreak = 0;
    badSince = null;
    paused = false;
    noteValue = null;
    noteRun = 0;
    shownNote = null;
    stamps = [];
  }

  function push(sample: FramingSample): FramingView {
    const active = resolveConfig(config, sample.minVisibility);
    const raw = classifyRaw(sample.landmarks, sample.mirrored, sample.profile, active);
    if (raw.code === runCode) run += 1;
    else {
      runCode = raw.code;
      run = 1;
    }
    const justStable = run >= active.stableFrames;
    if (!published || justStable) published = raw.code;
    const code = published;
    if (raw.code === "good") goodStreak += 1;
    else goodStreak = 0;

    if (sample.profile === "play") {
      if (!paused) {
        if (code !== "good") {
          if (badSince === null) badSince = sample.now;
          if (sample.now - badSince >= active.pauseMs) paused = true;
        } else {
          badSince = null;
        }
      }
    } else {
      badSince = null;
      paused = false;
    }

    const resumeReady = paused && goodStreak >= active.stableFrames;
    const banner = sample.profile === "play" && !resumeReady && (paused || (badSince !== null && sample.now - badSince >= active.warnMs));
    const blocks = gestureBlocks(sample.landmarks, active.minVisibility);
    if (blocks.note === noteValue) noteRun += 1;
    else {
      noteValue = blocks.note;
      noteRun = 1;
    }
    if (noteRun >= active.stableFrames) shownNote = blocks.note;

    stamps = stamps.filter((stamp) => sample.now - stamp < 1000);
    stamps.push(sample.now);

    return {
      code,
      tone: toneFor(code),
      instruction: INSTRUCTION[code],
      stable: published === raw.code && justStable,
      calibrate: goodStreak >= active.goodFramesToCalibrate,
      banner,
      pause: paused,
      canResume: resumeReady,
      suppressAll: sample.profile === "play" && (paused || banner),
      blocks,
      unavailable: sample.profile === "play" ? shownNote : null,
      confidence: raw.confidence,
      fps: stamps.length,
    };
  }

  return {
    push,
    reset,
    resume() {
      paused = false;
      badSince = null;
    },
  };
}
