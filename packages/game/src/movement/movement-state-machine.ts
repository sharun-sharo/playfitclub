import { assessFraming } from "./calibration";
import { classifyPose } from "./movement-classifier";
import { smoothFrame } from "./landmark-smoothing";
import {
  DEFAULT_THRESHOLDS,
  type BodyPhase,
  type DetectorState,
  type MovementDraft,
  type MovementThresholds,
  type NeutralPose,
  type PoseFrame,
  type PoseSignals,
} from "./movement-types";

export interface DetectorUpdate {
  state: DetectorState;
  events: MovementDraft[];
  signals: PoseSignals | null;
  guidance: string;
  framingReady: boolean;
}

export function createDetector(overrides: Partial<MovementThresholds> = {}): DetectorState {
  return {
    thresholds: { ...DEFAULT_THRESHOLDS, ...overrides },
    smoother: [],
    neutral: null,
    phase: "neutral",
    lastHipY: null,
    lastTimestamp: null,
    cooldownUntil: 0,
    holdSince: null,
    holdLatched: false,
    sequence: 0,
    riseWindow: [],
  };
}

export function setNeutral(state: DetectorState, neutral: NeutralPose): DetectorState {
  return { ...state, neutral, phase: "neutral", holdSince: null, holdLatched: false };
}

export function pushPose(state: DetectorState, frame: PoseFrame): DetectorUpdate {
  const mirrored = state.thresholds.mirror ? mirrorFrame(frame) : frame;
  const smoothed = smoothFrame(state.smoother, mirrored, state.thresholds.smoothingAlpha);
  const framing = assessFraming(smoothed.landmarks, state.thresholds.minVisibility);
  let riseSpeed = 0;
  const hip = hipY(smoothed.landmarks);
  if (hip !== null && state.lastHipY !== null && state.lastTimestamp !== null) {
    const dt = (mirrored.timestampMs - state.lastTimestamp) / 1000;
    const torso = state.neutral?.torso ?? 0.2;
    if (dt > 0 && dt < 0.5) riseSpeed = (state.lastHipY - hip) / dt / torso;
  }

  const riseWindow = [...state.riseWindow, riseSpeed].slice(-3);
  const peakRise = Math.max(riseSpeed, ...riseWindow);
  const base: DetectorState = {
    ...state,
    smoother: smoothed.smoother,
    lastHipY: hip ?? state.lastHipY,
    lastTimestamp: mirrored.timestampMs,
    riseWindow,
  };

  if (!state.neutral) {
    return {
      state: base,
      events: [],
      signals: null,
      guidance: framing.guidance,
      framingReady: framing.ready,
    };
  }

  const signals = classifyPose(smoothed.landmarks, state.neutral, state.thresholds, peakRise);
  if (!signals.ok || signals.confidence < state.thresholds.minActionConfidence) {
    const hidden = signals.reason === "missing";
    return {
      state: base,
      events: [],
      signals,
      guidance: hidden
        ? "Some joints are hidden. Step fully into frame. Body controls are paused."
        : "Tracking confidence is low. Body controls are paused until the camera sees you clearly.",
      framingReady: false,
    };
  }

  const transition = transitionPhase(base, signals, mirrored.timestampMs);
  const settled = transition.state.phase === "air" ? { ...transition.state, riseWindow: [] } : transition.state;
  return {
    state: settled,
    events: transition.events,
    signals,
    guidance: framing.ready ? "Tracking" : framing.guidance,
    framingReady: framing.ready,
  };
}

function transitionPhase(
  state: DetectorState,
  signals: PoseSignals,
  now: number,
): { state: DetectorState; events: MovementDraft[] } {
  const events: MovementDraft[] = [];
  const thresholds = state.thresholds;
  let phase: BodyPhase = state.phase;
  let cooldownUntil = state.cooldownUntil;
  let holdSince = state.holdSince;
  let holdLatched = state.holdLatched;
  let sequence = state.sequence;
  let leftSquat = false;

  const emit = (movementType: MovementDraft["movementType"], confidence: number) => {
    if (now < cooldownUntil) return;
    sequence += 1;
    cooldownUntil = now + thresholds.cooldownMs;
    events.push({ movementType, confidence, clientTimestamp: now, sequenceNumber: sequence });
  };

  const squatting =
    phase === "squat"
      ? signals.hipDrop > thresholds.squatExitDrop && signals.kneeAngle < thresholds.squatKneeExit
      : signals.hipDrop > thresholds.squatEnterDrop && signals.kneeAngle < thresholds.squatKneeEnter;
  const oneArmExtended =
    (signals.leftExtension > thresholds.punchEnter && signals.rightExtension < thresholds.punchExit) ||
    (signals.rightExtension > thresholds.punchEnter && signals.leftExtension < thresholds.punchExit);
  const punching = phase === "punch"
    ? Math.max(signals.leftExtension, signals.rightExtension) > thresholds.punchExit && signals.armsOut < 2.2
    : oneArmExtended && signals.armsOut < 2.2;
  const leanLeft = phase === "lean_left" ? signals.lean > thresholds.leanExit : signals.lean > thresholds.leanEnter;
  const leanRight = phase === "lean_right" ? signals.lean < -thresholds.leanExit : signals.lean < -thresholds.leanEnter;

  if (phase === "air") {
    if (signals.hipDrop > -0.04 && signals.riseSpeed < thresholds.jumpRise * 0.4) phase = "neutral";
  } else if (squatting) {
    if (phase !== "squat") emit("squat", signals.confidence);
    phase = "squat";
  } else if (phase === "squat") {
    phase = "neutral";
    leftSquat = true;
  } else if (punching) {
    if (phase !== "punch") emit("punch", signals.confidence);
    phase = "punch";
  } else if (phase === "punch") {
    phase = "neutral";
  } else if (leanLeft && phase !== "lean_right") {
    if (phase === "neutral") emit("lean_left", signals.confidence);
    phase = "lean_left";
  } else if (leanRight && phase !== "lean_left") {
    if (phase === "neutral") emit("lean_right", signals.confidence);
    phase = "lean_right";
  } else if (phase === "lean_left" || phase === "lean_right") {
    phase = "neutral";
  }

  const jumping =
    !leftSquat &&
    phase !== "squat" &&
    phase !== "air" &&
    signals.hipDrop < thresholds.squatEnterDrop &&
    signals.ankleRise > thresholds.jumpAnkleRise &&
    signals.riseSpeed > thresholds.jumpRise * 0.65;
  if (jumping) {
    emit("jump", Math.min(1, signals.confidence * Math.min(1, signals.riseSpeed / (thresholds.jumpRise * 2))));
    phase = "air";
  }

  const holding = signals.armsOut > 2.4 && phase === "neutral" && Math.abs(signals.lean) < thresholds.leanExit;
  if (holding) {
    if (holdSince === null) holdSince = now;
    if (!holdLatched && now - holdSince >= thresholds.holdMs) {
      emit("hold", signals.confidence);
      holdLatched = true;
    }
  } else {
    holdSince = null;
    if (signals.armsOut < 1.8) holdLatched = false;
  }

  return {
    events,
    state: { ...state, phase, cooldownUntil, holdSince, holdLatched, sequence },
  };
}

function hipY(landmarks: Array<{ y: number } | null>): number | null {
  const left = landmarks[23];
  const right = landmarks[24];
  if (!left || !right) return null;
  return (left.y + right.y) / 2;
}

function mirrorFrame(frame: PoseFrame): PoseFrame {
  return {
    timestampMs: frame.timestampMs,
    landmarks: frame.landmarks.map((landmark) => (landmark ? { ...landmark, x: 1 - landmark.x } : landmark)),
  };
}
