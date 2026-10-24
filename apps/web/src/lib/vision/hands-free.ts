import type { FramingCode } from "./framing";

/**
 * Hands-free FitRunner start.
 * Readiness is the framing classifier held for READY_HOLD_MS.
 * The realtime server owns the countdown. This machine only requests it.
 *
 * MediaPipe is created with numPoses: 1. PoseLandmarkerResult returns that one
 * pose's landmarks and does not include pose presence or detection confidence,
 * so a second overlapping body cannot be detected or ruled out.
 */

export const READY_HOLD_MS = 2000;
export const READY_HYSTERESIS_MS = 400;
export const COUNTDOWN_SECONDS = 3;
export const TRACKING_WARN_MS = 800;
export const TRACKING_PAUSE_MS = 3000;
export const RESUME_HOLD_MS = 2000;
/** Same floor the gesture detector already uses. Not a new pose threshold. */
export const POSE_CONFIDENCE_MIN = 0.6;

export const SAFETY_LINE = "Stand with room to jump and squat.";
export const STEP_BACK_INTO_FRAME = "Step Back Into Frame";
export const LOOKING_FOR_PLAYER = "Looking for player...";
export const PLAYER_DETECTED = "Player detected";
export const TRACKING_ACTIVE = "Motion tracking active";
export const ONE_PERSON = "One person at a time";

export type HandsFreePhase =
  | "WAITING_FOR_CAMERA"
  | "DETECTING_PLAYER"
  | "POSITIONING"
  | "READY"
  | "COUNTDOWN"
  | "PLAYING"
  | "TRACKING_LOST"
  | "PAUSED"
  | "GAME_OVER";

export type CountdownPurpose = "start" | "resume" | null;

export interface HandsFreeSample {
  now: number;
  cameraGranted: boolean;
  sessionConnected: boolean;
  framingCode: FramingCode | null;
  confidence: number;
  poseCount: number;
  presenceConfidence: number | null;
  detectionConfidence: number | null;
  serverPhase: string;
  serverCountdown: number;
  countdownPurpose: CountdownPurpose;
}

export interface HandsFreeView {
  phase: HandsFreePhase;
  cue: string | null;
  safety: string | null;
  countdown: number | null;
  sendReady: boolean | null;
  pause: boolean;
  resumeCountdown: boolean;
  trackingWarning: boolean;
  trackingHold: boolean;
  secondPersonRuledOut: boolean;
}

export function handsFreeCue(code: FramingCode | null, confidence: number): string | null {
  if (!code) return null;
  switch (code) {
    case "too_close":
    case "arm_space":
      return "Move Back";
    case "too_far":
      return "Move Forward";
    case "move_left":
      return "Move Left";
    case "move_right":
      return "Move Right";
    case "tilt_up":
    case "tilt_down":
    case "adjust_camera":
      return "Adjust Phone Angle";
    case "keep_feet":
      return "Keep Your Feet Visible";
    case "good":
      return confidence >= POSE_CONFIDENCE_MIN ? PLAYER_DETECTED : "Adjust Phone Angle";
    default:
      return null;
  }
}

/**
 * One returned pose can be positioned. It cannot prove the camera is clear of a second person.
 * Ambiguous presence or detection scores, or a second pose in the result, block the start.
 */
export function singlePoseGate(input: {
  poseCount: number;
  presenceConfidence: number | null;
  detectionConfidence: number | null;
  landmarkConfidence: number;
}): { positioned: boolean; secondPersonRuledOut: boolean; reason: string } {
  if (input.poseCount > 1) {
    return { positioned: false, secondPersonRuledOut: true, reason: "second_pose" };
  }
  if (input.poseCount !== 1) {
    return { positioned: false, secondPersonRuledOut: false, reason: "no_pose" };
  }
  const scoresKnown = input.presenceConfidence !== null && input.detectionConfidence !== null;
  if (!scoresKnown) {
    const clear = input.landmarkConfidence >= POSE_CONFIDENCE_MIN;
    return {
      positioned: clear,
      secondPersonRuledOut: false,
      reason: clear ? "second_person_not_detectable" : "ambiguous_confidence",
    };
  }
  const presence = input.presenceConfidence ?? 0;
  const detection = input.detectionConfidence ?? 0;
  if (presence < POSE_CONFIDENCE_MIN || detection < POSE_CONFIDENCE_MIN || input.landmarkConfidence < POSE_CONFIDENCE_MIN) {
    return { positioned: false, secondPersonRuledOut: false, reason: "ambiguous_confidence" };
  }
  return { positioned: true, secondPersonRuledOut: true, reason: "clear" };
}

function positioned(sample: HandsFreeSample) {
  const gate = singlePoseGate({
    poseCount: sample.poseCount,
    presenceConfidence: sample.presenceConfidence,
    detectionConfidence: sample.detectionConfidence,
    landmarkConfidence: sample.confidence,
  });
  return {
    framed: sample.framingCode === "good" && gate.positioned,
    secondPersonRuledOut: gate.secondPersonRuledOut,
  };
}

export function createHandsFree() {
  let phase: HandsFreePhase = "WAITING_FOR_CAMERA";
  let goodSince: number | null = null;
  let badSince: number | null = null;
  let readyLatched = false;
  let pauseSent = false;
  let resumeSent = false;
  let trackingHold = false;
  let lostSince: number | null = null;
  let resumeSince: number | null = null;
  let finished = false;
  let startCancelled = false;
  let secondPersonRuledOut = false;

  function resetApproach() {
    goodSince = null;
    badSince = null;
  }

  function push(sample: HandsFreeSample): HandsFreeView {
    let sendReady: boolean | null = null;
    let pause = false;
    let resumeCountdown = false;
    const body = positioned(sample);
    secondPersonRuledOut = body.secondPersonRuledOut;
    const framed = body.framed;

    if (sample.serverPhase === "ended") finished = true;
    if (finished) {
      phase = "GAME_OVER";
      trackingHold = false;
      return view(sample, null, sendReady, pause, resumeCountdown);
    }

    if (!sample.cameraGranted || !sample.sessionConnected) {
      phase = "WAITING_FOR_CAMERA";
      resetApproach();
      if (readyLatched && (sample.serverPhase === "lobby" || sample.serverPhase === "")) {
        readyLatched = false;
        sendReady = false;
      }
      return view(sample, null, sendReady, pause, resumeCountdown);
    }

    if (sample.serverPhase !== "countdown") startCancelled = false;
    const purpose = sample.countdownPurpose;
    const startCountdown = sample.serverPhase === "countdown" && purpose !== "resume" && !startCancelled;
    const resumeCountdownPhase = sample.serverPhase === "countdown" && purpose === "resume";

    if (startCountdown) {
      phase = "COUNTDOWN";
      if (!framed) {
        if (badSince === null) badSince = sample.now;
        if (sample.now - badSince >= READY_HYSTERESIS_MS) {
          startCancelled = true;
          readyLatched = false;
          sendReady = false;
          resetApproach();
          phase = sample.poseCount > 0 ? "POSITIONING" : "DETECTING_PLAYER";
        }
      } else {
        badSince = null;
      }
      return view(sample, phase === "COUNTDOWN" ? null : handsFreeCue(sample.framingCode, sample.confidence), sendReady, pause, resumeCountdown);
    }

    if (startCancelled && sample.serverPhase === "countdown") {
      phase = sample.poseCount > 0 ? "POSITIONING" : "DETECTING_PLAYER";
      return view(sample, handsFreeCue(sample.framingCode, sample.confidence), sendReady, pause, resumeCountdown);
    }

    if (resumeCountdownPhase) {
      phase = "COUNTDOWN";
      if (!framed) {
        if (badSince === null) badSince = sample.now;
        if (sample.now - badSince >= READY_HYSTERESIS_MS) {
          badSince = null;
          resumeSince = null;
          resumeSent = false;
          pauseSent = true;
          pause = true;
          phase = "PAUSED";
        }
      } else {
        badSince = null;
      }
      return view(sample, null, sendReady, pause, resumeCountdown);
    }

    if (sample.serverPhase === "running") {
      if (!framed) {
        if (lostSince === null) lostSince = sample.now;
        const lostFor = sample.now - lostSince;
        if (lostFor >= TRACKING_PAUSE_MS) {
          phase = "PAUSED";
          if (!pauseSent) {
            pauseSent = true;
            pause = true;
            trackingHold = true;
          }
        } else if (lostFor >= TRACKING_WARN_MS) {
          phase = "TRACKING_LOST";
        } else {
          phase = "PLAYING";
        }
      } else {
        lostSince = null;
        pauseSent = false;
        phase = "PLAYING";
      }
      const cue = phase === "PAUSED" ? STEP_BACK_INTO_FRAME : phase === "TRACKING_LOST" ? handsFreeCue(sample.framingCode, sample.confidence) : null;
      return view(sample, cue, sendReady, pause, resumeCountdown);
    }

    if (sample.serverPhase === "paused") {
      phase = "PAUSED";
      if (trackingHold && framed) {
        if (resumeSince === null) resumeSince = sample.now;
        if (!resumeSent && sample.now - resumeSince >= RESUME_HOLD_MS) {
          resumeSent = true;
          resumeCountdown = true;
        }
      } else if (trackingHold) {
        resumeSince = null;
        resumeSent = false;
      }
      return view(sample, trackingHold ? STEP_BACK_INTO_FRAME : null, sendReady, pause, resumeCountdown);
    }

    if (sample.poseCount === 0 || sample.framingCode === null) {
      phase = "DETECTING_PLAYER";
      resetApproach();
      if (readyLatched) {
        readyLatched = false;
        sendReady = false;
      }
      return view(sample, null, sendReady, pause, resumeCountdown);
    }

    if (!framed) {
      if (readyLatched) {
        if (badSince === null) badSince = sample.now;
        if (sample.now - badSince >= READY_HYSTERESIS_MS) {
          readyLatched = false;
          sendReady = false;
          goodSince = null;
          badSince = null;
          phase = "POSITIONING";
        } else {
          phase = "READY";
        }
      } else {
        goodSince = null;
        phase = "POSITIONING";
      }
      return view(sample, handsFreeCue(sample.framingCode, sample.confidence), sendReady, pause, resumeCountdown);
    }

    badSince = null;
    if (goodSince === null) goodSince = sample.now;
    if (!readyLatched && sample.now - goodSince >= READY_HOLD_MS) {
      readyLatched = true;
      sendReady = true;
      phase = "READY";
    } else {
      phase = readyLatched ? "READY" : "POSITIONING";
    }
    return view(sample, phase === "READY" ? TRACKING_ACTIVE : PLAYER_DETECTED, sendReady, pause, resumeCountdown);
  }

  function view(
    sample: HandsFreeSample,
    cue: string | null,
    sendReady: boolean | null,
    pause: boolean,
    resumeCountdown: boolean,
  ): HandsFreeView {
    const setup = phase === "WAITING_FOR_CAMERA" || phase === "DETECTING_PLAYER" || phase === "POSITIONING" || phase === "READY";
    let shown = cue;
    if (sample.poseCount > 1) shown = ONE_PERSON;
    else if (sample.poseCount === 0 && phase !== "GAME_OVER" && phase !== "COUNTDOWN") shown = LOOKING_FOR_PLAYER;
    else if (phase === "READY" || phase === "PLAYING") shown = shown && shown !== PLAYER_DETECTED ? shown : TRACKING_ACTIVE;
    return {
      phase,
      cue: shown,
      safety: setup ? SAFETY_LINE : null,
      countdown: phase === "COUNTDOWN" ? sample.serverCountdown : null,
      sendReady,
      pause,
      resumeCountdown,
      trackingWarning: phase === "TRACKING_LOST",
      trackingHold,
      secondPersonRuledOut,
    };
  }

  return { push };
}
