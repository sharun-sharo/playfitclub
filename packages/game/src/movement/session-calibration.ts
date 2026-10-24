import type { MovementType } from "@fitplay/shared";
import type { MovementThresholds } from "./movement-types";

/** How long a framed step waits before the TV repeats the instruction. */
export const CALIBRATION_RETRY_MS = 4000;

export type MotionCalibrationStep = "left" | "right" | "jump" | "squat" | "done";

export interface MotionCalibration {
  step: MotionCalibrationStep;
  stepStartedAt: number;
  attempts: number;
  bodyScale: { torso: number; shoulderWidth: number } | null;
  leftElevation: number | null;
  rightElevation: number | null;
  jumpVelocity: number | null;
  squatDrop: number | null;
  /** Null until the still stance is stored, and again when the race starts or the coach finishes. */
  instruction: string | null;
}

const FIRST: Record<Exclude<MotionCalibrationStep, "done">, string> = {
  left: "Raise your left arm",
  right: "Raise your right arm",
  jump: "Do a small jump",
  squat: "Squat down",
};

const RETRY: Record<Exclude<MotionCalibrationStep, "done">, string> = {
  left: "Raise your left hand out, about chest height",
  right: "Raise your right hand out, about chest height",
  jump: "Bend your knees, then hop",
  squat: "Lower your hips and bend your knees",
};

const ORDER: MotionCalibrationStep[] = ["left", "right", "jump", "squat", "done"];

export function createMotionCalibration(now = 0): MotionCalibration {
  return {
    step: "left",
    stepStartedAt: now,
    attempts: 0,
    bodyScale: null,
    leftElevation: null,
    rightElevation: null,
    jumpVelocity: null,
    squatDrop: null,
    instruction: null,
  };
}

/** Records the still-stance scale and shows the first movement. In memory only. */
export function noteBodyScale(state: MotionCalibration, torso: number, shoulderWidth: number, now: number): MotionCalibration {
  if (state.bodyScale) return state;
  return {
    ...state,
    bodyScale: { torso, shoulderWidth },
    stepStartedAt: now,
    instruction: FIRST.left,
  };
}

/**
 * Fits the squat enter depth to a detected squat, inside a fixed band.
 * Jump speed, confidence, and visibility stay on their defaults.
 */
export function calibrationThresholds(state: MotionCalibration): Partial<MovementThresholds> {
  if (state.squatDrop === null) return {};
  return { squatEnterDrop: Math.min(0.2, Math.max(0.14, state.squatDrop * 0.55)) };
}

export function isCalibrationCue(message: string | null | undefined) {
  if (!message) return false;
  const text = message.trim().toLowerCase();
  return Object.values(FIRST).some((line) => text === line.toLowerCase()) || Object.values(RETRY).some((line) => text === line.toLowerCase());
}

export function observeMotionCalibration(
  state: MotionCalibration,
  input: {
    now: number;
    framingReady: boolean;
    movement: MovementType | null;
    leftElevation: number;
    rightElevation: number;
    jumpVelocity: number;
    squatDrop: number;
  },
): MotionCalibration {
  if (!state.bodyScale || state.step === "done") return state;
  const step = state.step;
  const matched =
    (step === "left" && input.movement === "lean_left") ||
    (step === "right" && input.movement === "lean_right") ||
    (step === "jump" && input.movement === "jump") ||
    (step === "squat" && input.movement === "squat");
  if (matched) {
    const next = ORDER[ORDER.indexOf(step) + 1] ?? "done";
    return {
      ...state,
      step: next,
      stepStartedAt: input.now,
      attempts: 0,
      leftElevation: step === "left" ? input.leftElevation : state.leftElevation,
      rightElevation: step === "right" ? input.rightElevation : state.rightElevation,
      jumpVelocity: step === "jump" ? input.jumpVelocity : state.jumpVelocity,
      squatDrop: step === "squat" ? input.squatDrop : state.squatDrop,
      instruction: next === "done" ? null : FIRST[next],
    };
  }
  if (!input.framingReady) {
    return { ...state, stepStartedAt: input.now };
  }
  if (input.now - state.stepStartedAt < CALIBRATION_RETRY_MS) return state;
  return {
    ...state,
    stepStartedAt: input.now,
    attempts: state.attempts + 1,
    instruction: RETRY[step],
  };
}

/** Dev check: anatomical left must map to move-left, and right to move-right. */
export function armMappingVerdict(side: "left" | "right", movementType: string | null): "waiting" | "match" | "mismatch" {
  if (movementType !== "lean_left" && movementType !== "lean_right") return "waiting";
  const expected = side === "left" ? "lean_left" : "lean_right";
  return movementType === expected ? "match" : "mismatch";
}
