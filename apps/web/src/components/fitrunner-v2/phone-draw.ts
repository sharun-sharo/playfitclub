/**
 * Phone drawing buffer for /play/phone. A television browser on /tv/play keeps
 * its own 960×540 cap. This budget is the mirrored phone image.
 *
 * The long edge stays around 1920, not 3840. A capable phone may use a device
 * pixel ratio up to 2. A weaker phone stays lower. Shadow maps stay off on
 * this route so pose detection is not competing with them.
 */

export type PhoneDrawPreset = "low" | "balanced" | "high";

/** Balanced cap kept for callers that want that one step. The live route uses the preset. */
export const PHONE_BALANCED_DPR_CAP = 1.5;

export const PHONE_DRAW_DPR_CAP: Record<PhoneDrawPreset, number> = {
  low: 1,
  balanced: PHONE_BALANCED_DPR_CAP,
  high: 2,
};

/** Long edge of the drawing buffer. High stops at 1920, not 3840. */
export const PHONE_DRAW_LONG_EDGE: Record<PhoneDrawPreset, number> = {
  low: 1280,
  balanced: 1600,
  high: 1920,
};

const RANK: Record<PhoneDrawPreset, number> = { low: 0, balanced: 1, high: 2 };
const ORDER: PhoneDrawPreset[] = ["low", "balanced", "high"];

/**
 * A frame slower than this has missed a 30Hz budget. A 30Hz display sits near
 * 33ms and must not be treated as a struggling GPU.
 */
export const PHONE_SLOW_FRAME_MS = 40;

/** Fast enough to climb back one preset. A steady 30Hz display stays put. */
export const PHONE_GOOD_FRAME_MS = 22;

/** About three seconds of slow frames before one step down. */
export const PHONE_DOWNGRADE_FRAMES = 90;

/** Several seconds of fast frames before one step back up, and never past the device ceiling. */
export const PHONE_UPGRADE_FRAMES = 450;

export interface PhoneDeviceHints {
  screenWidth: number;
  screenHeight: number;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
}

export function selectPhoneDrawPreset(input: PhoneDeviceHints): PhoneDrawPreset {
  const longEdge = Math.max(finite(input.screenWidth), finite(input.screenHeight));
  const memory = finiteOrNull(input.deviceMemoryGb);
  const cores = finiteOrNull(input.hardwareConcurrency);
  const weakMemory = memory !== null && memory <= 2;
  const weakCores = cores !== null && cores <= 2;
  const smallScreen = longEdge > 0 && longEdge < 700;
  if (weakMemory || weakCores || smallScreen) return "low";
  const strongMemory = memory !== null && memory >= 6;
  const strongCores = cores !== null && cores >= 8;
  const roomy = longEdge >= 800;
  if (roomy && (strongMemory || strongCores || (memory === null && cores !== null && cores >= 6))) return "high";
  return "balanced";
}

export function phoneDrawingPixelRatio(input: {
  devicePixelRatio: number;
  cssWidth: number;
  cssHeight: number;
  preset: PhoneDrawPreset;
}) {
  const cssLong = Math.max(finite(input.cssWidth), finite(input.cssHeight));
  const device = finite(input.devicePixelRatio) > 0 ? finite(input.devicePixelRatio) : 1;
  const cap = PHONE_DRAW_DPR_CAP[input.preset];
  const budget = PHONE_DRAW_LONG_EDGE[input.preset];
  let ratio = Math.min(device, cap);
  if (cssLong > 0 && cssLong * ratio > budget) ratio = budget / cssLong;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.max(0.25, Math.floor(ratio * 100) / 100);
}

export function phoneDrawingBuffer(input: {
  devicePixelRatio: number;
  cssWidth: number;
  cssHeight: number;
  preset: PhoneDrawPreset;
}) {
  const pixelRatio = phoneDrawingPixelRatio(input);
  const width = finite(input.cssWidth);
  const height = finite(input.cssHeight);
  return {
    width: Math.floor(width * pixelRatio),
    height: Math.floor(height * pixelRatio),
    pixelRatio,
    preset: input.preset,
  };
}

export function phoneAnisotropy(preset: PhoneDrawPreset, gpuMax: number) {
  const want = preset === "high" ? 8 : preset === "balanced" ? 4 : 1;
  const max = Number.isFinite(gpuMax) && gpuMax >= 1 ? gpuMax : 1;
  return Math.max(1, Math.min(want, Math.floor(max)));
}

export interface PhoneDrawHysteresis {
  preset: PhoneDrawPreset;
  ceiling: PhoneDrawPreset;
  badFrames: number;
  goodFrames: number;
}

export function createPhoneDrawHysteresis(ceiling: PhoneDrawPreset): PhoneDrawHysteresis {
  return { preset: ceiling, ceiling, badFrames: 0, goodFrames: 0 };
}

/**
 * One slow frame does not change the preset. A sustained slow run steps down
 * once. A sustained fast run steps up once, and never past the device ceiling.
 * A gap longer than 80ms is a stall, not a quality signal.
 */
export function stepPhoneDrawHysteresis(state: PhoneDrawHysteresis, frameMs: number): PhoneDrawHysteresis {
  if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 80) {
    return { ...state, badFrames: 0, goodFrames: 0 };
  }
  if (frameMs >= PHONE_SLOW_FRAME_MS) {
    const badFrames = state.badFrames + 1;
    if (badFrames >= PHONE_DOWNGRADE_FRAMES && state.preset !== "low") {
      return { ...state, preset: stepPreset(state.preset, -1), badFrames: 0, goodFrames: 0 };
    }
    return { ...state, badFrames, goodFrames: 0 };
  }
  if (frameMs <= PHONE_GOOD_FRAME_MS) {
    const goodFrames = state.goodFrames + 1;
    if (goodFrames >= PHONE_UPGRADE_FRAMES && RANK[state.preset] < RANK[state.ceiling]) {
      return { ...state, preset: stepPreset(state.preset, 1), badFrames: 0, goodFrames: 0 };
    }
    return { ...state, goodFrames, badFrames: 0 };
  }
  return {
    ...state,
    badFrames: Math.max(0, state.badFrames - 1),
    goodFrames: Math.max(0, state.goodFrames - 1),
  };
}

function stepPreset(preset: PhoneDrawPreset, delta: -1 | 1): PhoneDrawPreset {
  const next = RANK[preset] + delta;
  return ORDER[Math.max(0, Math.min(ORDER.length - 1, next))] ?? preset;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function finiteOrNull(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return value;
}
