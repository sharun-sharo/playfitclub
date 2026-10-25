import { assessFraming, driftNeutral, neutralFromLandmarks } from "./calibration";
import { classifyPose } from "./movement-classifier";
import { smoothFrame } from "./landmark-smoothing";
import {
  DEFAULT_THRESHOLDS,
  type ArmPose,
  type BodyPhase,
  type DetectorState,
  type GestureTrack,
  type MovementDraft,
  type MovementThresholds,
  type NeutralPose,
  type PoseFrame,
  type PoseRejectReason,
  type PoseSignals,
} from "./movement-types";

/** A single dropped frame must not wipe a gesture that is still forming. */
export const TRACK_GRACE_MS = 160;

export interface DetectorUpdate {
  state: DetectorState;
  events: MovementDraft[];
  signals: PoseSignals | null;
  guidance: string;
  framingReady: boolean;
}

export function movementEventId(sequence: number, timestampMs: number) {
  const stamp = Math.max(0, Math.round(timestampMs)).toString(36).padStart(6, "0");
  const count = Math.max(0, sequence).toString(36).padStart(2, "0");
  return `mv${count}${stamp}`;
}

/** Returns false when this gesture id was already accepted. */
export function claimMovementId(seen: Set<string>, eventId: string) {
  if (seen.has(eventId)) return false;
  seen.add(eventId);
  return true;
}

function freshTrack(): GestureTrack {
  return { phase: "NEUTRAL", since: 0, eventId: null, suppress: false };
}

export function createDetector(overrides: Partial<MovementThresholds> = {}): DetectorState {
  return {
    thresholds: { ...DEFAULT_THRESHOLDS, ...overrides },
    smoother: [],
    neutral: null,
    phase: "NEUTRAL",
    lastHipY: null,
    lastRawHipY: null,
    lastShoulderY: null,
    lastAnkleY: null,
    lastTimestamp: null,
    sequence: 0,
    riseWindow: [],
    recoverUntil: 0,
    lastReject: null,
    rejectLatched: false,
    left: freshTrack(),
    right: freshTrack(),
    squat: freshTrack(),
    jump: freshTrack(),
    jumpMotion: "grounded",
    prepSince: null,
    dipOpen: false,
    squatCalm: false,
    lostSince: null,
    lastGesture: null,
    awaitRelease: false,
  };
}

export function setNeutral(state: DetectorState, neutral: NeutralPose): DetectorState {
  return {
    ...state,
    neutral,
    phase: "NEUTRAL",
    left: freshTrack(),
    right: freshTrack(),
    squat: freshTrack(),
    jump: freshTrack(),
    jumpMotion: "grounded",
    prepSince: null,
    dipOpen: false,
    squatCalm: false,
    recoverUntil: 0,
    rejectLatched: false,
    lostSince: null,
    riseWindow: [],
    awaitRelease: false,
  };
}

/**
 * Standing ready for a new run, a pause, or a resume.
 * Keeps the calibrated neutral and the event sequence.
 * Clears an airborne jump, a latched squat, an armed dip, and recovery.
 * Neutral is allowed to drift again. The pose already in frame is not replayed:
 * hip history is dropped, so that frame has no rise speed.
 */
export function resetMovementReady(state: DetectorState): DetectorState {
  return {
    ...state,
    phase: "NEUTRAL",
    left: freshTrack(),
    right: freshTrack(),
    squat: freshTrack(),
    jump: freshTrack(),
    jumpMotion: "grounded",
    prepSince: null,
    dipOpen: false,
    squatCalm: false,
    recoverUntil: 0,
    rejectLatched: false,
    lastReject: null,
    lostSince: null,
    riseWindow: [],
    lastHipY: null,
    lastRawHipY: null,
    lastShoulderY: null,
    lastAnkleY: null,
    lastTimestamp: null,
    smoother: [],
    awaitRelease: false,
  };
}

/** The phone round-reset listener calls this. Same standing-ready clear as a fresh detector. */
export function resetPhoneForRound(state: DetectorState): DetectorState {
  return resetMovementReady(state);
}

/**
 * Drops any held, paused, or half-sent gesture without emitting one.
 * The pose already in frame is ignored until the body is quiet again.
 */
export function settleGestures(state: DetectorState): DetectorState {
  return {
    ...state,
    phase: "NEUTRAL",
    left: freshTrack(),
    right: freshTrack(),
    squat: freshTrack(),
    jump: freshTrack(),
    jumpMotion: "grounded",
    prepSince: null,
    dipOpen: false,
    squatCalm: false,
    recoverUntil: 0,
    rejectLatched: false,
    lastReject: null,
    lostSince: null,
    riseWindow: [],
    lastHipY: null,
    lastRawHipY: null,
    lastShoulderY: null,
    lastAnkleY: null,
    lastTimestamp: null,
    smoother: [],
    awaitRelease: true,
  };
}

export function setThresholds(state: DetectorState, overrides: Partial<MovementThresholds>): DetectorState {
  return { ...state, thresholds: { ...state.thresholds, ...overrides } };
}

export function pushPose(state: DetectorState, frame: PoseFrame): DetectorUpdate {
  const mirrored = state.thresholds.mirror ? mirrorFrame(frame) : frame;
  const smoothed = smoothFrame(state.smoother, mirrored, state.thresholds.smoothingAlpha);
  const framing = assessFraming(smoothed.landmarks, state.thresholds.minVisibility);
  const dt = state.lastTimestamp !== null ? Math.max(0, mirrored.timestampMs - state.lastTimestamp) : 0;
  let shoulderSpeed = 0;
  let ankleSpeed = 0;
  let rawRise = 0;
  const minVisibility = state.thresholds.minVisibility;
  const hip = midY(smoothed.landmarks, 23, 24, minVisibility);
  const rawHip = midY(mirrored.landmarks, 23, 24, minVisibility);
  const shoulder = midY(smoothed.landmarks, 11, 12, minVisibility);
  const ankle = midY(smoothed.landmarks, 27, 28, minVisibility);
  const seconds = dt / 1000;
  const torso = state.neutral?.torso ?? 0.2;
  if (seconds > 0 && seconds < 0.5) {
    if (rawHip !== null && state.lastRawHipY !== null) rawRise = (state.lastRawHipY - rawHip) / seconds / torso;
    if (shoulder !== null && state.lastShoulderY !== null) shoulderSpeed = (state.lastShoulderY - shoulder) / seconds / torso;
    if (ankle !== null && state.lastAnkleY !== null) ankleSpeed = (state.lastAnkleY - ankle) / seconds / torso;
  }

  // Jump speed is the raw hip. The smoothed hip keeps rising after the body has already stopped, which turned a one-frame twitch into a hop.
  const hipSpeed = rawRise;
  const riseWindow = [...state.riseWindow, rawRise].slice(-3);
  const peakRise = Math.max(rawRise, ...riseWindow);
  const base: DetectorState = {
    ...state,
    smoother: smoothed.smoother,
    lastHipY: hip ?? state.lastHipY,
    lastRawHipY: rawHip ?? state.lastRawHipY,
    lastShoulderY: shoulder ?? state.lastShoulderY,
    lastAnkleY: ankle ?? state.lastAnkleY,
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
  signals.hipVelocity = hipSpeed;
  signals.riseSpeed = Math.max(signals.riseSpeed, peakRise);
  signals.shoulderVelocity = shoulderSpeed;
  signals.ankleVelocity = ankleSpeed;
  if (!signals.ok || signals.confidence < state.thresholds.minActionConfidence) {
    const reason: PoseRejectReason = !signals.ok && signals.reason === "missing" ? "tracking_lost" : "low_confidence";
    const lostSince = state.lostSince ?? mirrored.timestampMs;
    const expired = mirrored.timestampMs - lostSince > TRACK_GRACE_MS;
    const keep = (track: GestureTrack) => (expired ? cancelCandidate(track) : delayCandidate(track, dt));
    return {
      state: {
        ...base,
        lostSince,
        lastHipY: expired ? null : base.lastHipY,
        lastRawHipY: expired ? null : base.lastRawHipY,
        lastShoulderY: expired ? null : base.lastShoulderY,
        lastAnkleY: expired ? null : base.lastAnkleY,
        riseWindow: expired ? [] : base.riseWindow,
        prepSince: expired ? null : state.prepSince,
        dipOpen: expired ? false : state.dipOpen,
        squatCalm: expired ? false : state.squatCalm,
        left: keep(state.left),
        right: keep(state.right),
        squat: keep(state.squat),
        jump: keep(state.jump),
        lastReject: state.lastReject?.reason === reason ? state.lastReject : { reason, at: mirrored.timestampMs },
      },
      events: [],
      signals,
      guidance:
        reason === "tracking_lost"
          ? "Some joints are hidden. Step fully into frame. Body controls are paused."
          : "Tracking confidence is low. Body controls are paused until the camera sees you clearly.",
      framingReady: false,
    };
  }

  if (state.awaitRelease && state.neutral) {
    const quiet = poseIsQuiet(signals, state.thresholds, state.neutral);
    return {
      state: {
        ...base,
        lastHipY: null,
        lastRawHipY: null,
        lastShoulderY: null,
        lastAnkleY: null,
        riseWindow: [],
        phase: "NEUTRAL",
        left: freshTrack(),
        right: freshTrack(),
        squat: freshTrack(),
        jump: freshTrack(),
        jumpMotion: "grounded",
        prepSince: null,
        dipOpen: false,
        squatCalm: false,
        recoverUntil: 0,
        lostSince: null,
        awaitRelease: !quiet,
      },
      events: [],
      signals,
      guidance: framing.ready ? "Tracking" : framing.guidance,
      framingReady: framing.ready,
    };
  }

  const transition = transitionPhase({ ...base, lostSince: null }, signals, mirrored.timestampMs);
  const enteredJump = transition.state.phase === "JUMPING" && state.phase !== "JUMPING";
  let settled = enteredJump ? { ...transition.state, riseWindow: [] } : transition.state;
  if (settled.neutral && stanceIsQuiet(settled, signals)) {
    const sample = neutralFromLandmarks(smoothed.landmarks);
    if (sample) settled = { ...settled, neutral: driftNeutral(settled.neutral, sample, settled.thresholds.neutralDrift) };
  }
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
  let left = state.left;
  let right = state.right;
  let squat = state.squat;
  let jump = state.jump;
  let recoverUntil = state.recoverUntil;
  let sequence = state.sequence;
  let lastReject = state.lastReject;
  let rejectLatched = state.rejectLatched;
  let lastGesture = state.lastGesture;
  let jumpMotion = state.jumpMotion;
  let prepSince = state.prepSince;
  let dipOpen = state.dipOpen;
  let squatCalm = state.squatCalm;

  const emit = (movementType: MovementDraft["movementType"], confidence: number) => {
    sequence += 1;
    const eventId = movementEventId(sequence, now);
    lastGesture = { movementType, eventId, at: now };
    events.push({ movementType, confidence, clientTimestamp: now, sequenceNumber: sequence, eventId });
    return { id: eventId };
  };

  const reject = (reason: PoseRejectReason) => {
    if (rejectLatched && lastReject?.reason === reason) return;
    lastReject = { reason, at: now };
    rejectLatched = true;
  };

  const pack = () => ({
    events,
    state: {
      ...state,
      phase,
      recoverUntil,
      sequence,
      left,
      right,
      squat,
      jump,
      jumpMotion,
      prepSince,
      dipOpen,
      squatCalm,
      lastReject,
      rejectLatched,
      lastGesture,
      lostSince: null,
    },
  });

  const neutral = state.neutral;
  const leftUp = neutral ? armRaised(signals.leftArm, neutral.leftWristLateral, usesExit(left), thresholds) : false;
  const rightUp = neutral ? armRaised(signals.rightArm, neutral.rightWristLateral, usesExit(right), thresholds) : false;

  const planted = signals.ankleRise < Math.max(thresholds.jumpAnkleRise, 0.03);
  const dipping =
    !signals.forwardBend &&
    signals.hipDrop > thresholds.jumpPrepDrop &&
    (signals.legsReady ? planted : true);
  const instant = signals.legsReady ? signals.hipVelocity : Math.max(signals.hipVelocity, signals.shoulderVelocity);
  const elevated = signals.hipDrop < -0.02 || signals.ankleRise > thresholds.jumpAnkleRise;
  const risingNow = instant > thresholds.jumpRise;
  const dipAge = state.prepSince !== null ? now - state.prepSince : -1;
  const dipReal = dipAge >= thresholds.jumpPrepMs;
  // A one-frame dip is 33ms, under the 50ms confirm. If that next frame has already left the
  // stance, it is the hop. A twitch that only returns to standing is not elevated, so it waits
  // out the 50ms and the following quiet frame does not jump.
  const oneFrameHop = dipAge >= 30 && dipAge < thresholds.jumpPrepMs && risingNow && elevated;
  // A return to the same standing height is not a hop. Leaving the line, or still rising after a real dip, is.
  const takeoffFromDip =
    (dipReal || oneFrameHop) &&
    !signals.forwardBend &&
    (risingNow || (signals.riseSpeed > thresholds.jumpRise && elevated)) &&
    (signals.legsReady || elevated);

  let justLanded = false;
  if (jump.phase === "CONFIRMED" || jump.phase === "SENT" || jump.phase === "WAIT_RESET") {
    // A few pixels above the calibrated ankles is still the floor. Only a clear flight stays open.
    const feetClear = signals.hipDrop < -0.08 || signals.ankleRise > 0.1;
    const landed = !feetClear;
    if (!landed) {
      jump = { ...jump, phase: jump.phase === "CONFIRMED" ? "SENT" : "WAIT_RESET" };
      jumpMotion = signals.hipVelocity < -0.45 || state.jumpMotion === "landing" ? "landing" : "airborne";
      phase = "JUMPING";
      if (leftUp) left = suppressTrack(left, now);
      if (rightUp) right = suppressTrack(right, now);
      return pack();
    }
    jump = freshTrack();
    jumpMotion = "landing";
    prepSince = null;
    dipOpen = false;
    squatCalm = false;
    phase = "RECOVERING";
    recoverUntil = now + thresholds.recoverMs;
    justLanded = true;
  }

  const squatLatched = squat.phase === "CONFIRMED" || squat.phase === "SENT" || squat.phase === "WAIT_RESET";
  // Hips down are the squat. A missing knee must not cancel it.
  // The confirm frame still has to be a real drop. The lower exit line is only for a squat already sent,
  // so the smoothing tail of a one-frame bob cannot duck.
  const hipNeeded = squatLatched ? thresholds.squatExitDrop : thresholds.squatEnterDrop;
  const inSquatBand = !signals.forwardBend && signals.hipDrop > hipNeeded;
  if (signals.forwardBend) reject("forward_bend");

  // A short dip, then hips rising faster than jumpRise, is one jump. It is not a squat.
  const countermovement = takeoffFromDip && !squatLatched && (squat.phase === "CANDIDATE" || inSquatBand || state.jumpMotion === "preparing");

  // Standing up is an upward return while the hips are still low. A new dip has downward speed,
  // so the next hop can arm during the squat recovery instead of being thrown away.
  const standingOutOfSquat =
    jumpMotion === "recovery" && signals.hipVelocity > 0.35 && signals.hipDrop > thresholds.jumpPrepDrop;
  if (dipping && !countermovement && !squatLatched && jump.phase === "NEUTRAL" && !standingOutOfSquat) {
    // Keep the clock from the frame the dip started. Resetting it on every downward
    // sample made the rise 33ms later, which is after a one-frame hop has already slowed.
    if (!state.dipOpen || prepSince === null) prepSince = now;
    dipOpen = true;
    if (jumpMotion !== "landing") jumpMotion = "preparing";
  } else if (!dipping || countermovement) {
    dipOpen = false;
  }
  if (standingOutOfSquat) prepSince = null;

  // Nearly still, in torso-lengths per second. A hop is still moving at its bottom.
  // Two still frames is a duck. One still frame at the bottom of a hop is not.
  const squatStill = Math.abs(signals.hipVelocity) < 0.75;
  let holdingSquat = false;
  if (countermovement) {
    squat = freshTrack();
    squatCalm = false;
  } else if (inSquatBand) {
    holdingSquat = true;
    if (!squatLatched) {
      const since = squat.phase === "CANDIDATE" ? squat.since : now;
      const held = squat.phase === "CANDIDATE" && now - since >= thresholds.squatHoldMs;
      if (held && squatStill && squatCalm) {
        const sent = emit("squat", signals.confidence);
        squat = { phase: "CONFIRMED", since: now, eventId: sent.id, suppress: false };
        phase = "SQUATTING";
        prepSince = null;
        dipOpen = false;
        squatCalm = false;
        jumpMotion = "grounded";
      } else {
        squat = { phase: "CANDIDATE", since, eventId: null, suppress: false };
        squatCalm = squatStill;
      }
    } else if (squat.phase === "CONFIRMED") {
      squat = { ...squat, phase: "SENT" };
      phase = "SQUATTING";
    } else if (squat.phase === "SENT") {
      squat = { ...squat, phase: "WAIT_RESET" };
      phase = "SQUATTING";
    } else {
      phase = "SQUATTING";
    }
  } else if (squat.phase === "CANDIDATE") {
    squat = freshTrack();
    squatCalm = false;
  } else {
    squatCalm = false;
  }

  let enteredRecovery = false;
  const squatHeldNow = squat.phase === "CONFIRMED" || squat.phase === "SENT" || squat.phase === "WAIT_RESET";
  if (!holdingSquat && (squatHeldNow || phase === "SQUATTING")) {
    squat = freshTrack();
    squatCalm = false;
    dipOpen = false;
    phase = "RECOVERING";
    jumpMotion = "recovery";
    prepSince = null;
    recoverUntil = now + thresholds.recoverMs;
    enteredRecovery = true;
  }

  const calm =
    now >= recoverUntil &&
    signals.hipDrop < thresholds.squatExitDrop &&
    Math.abs(signals.riseSpeed) < thresholds.jumpRise * 0.45 &&
    signals.ankleRise < thresholds.jumpAnkleRise * 2;
  const recovering = phase === "RECOVERING" && !calm;
  if (phase === "RECOVERING" && calm) {
    phase = "NEUTRAL";
    if (jumpMotion === "recovery" || jumpMotion === "landing") jumpMotion = "grounded";
  } else if (recovering && jumpMotion !== "landing" && jumpMotion !== "preparing" && jumpMotion !== "takeoff") {
    jumpMotion = "recovery";
  }

  const flight =
    signals.legsReady &&
    signals.kneeAngle > thresholds.squatKneeEnter &&
    signals.hipDrop < thresholds.squatExitDrop &&
    signals.ankleRise > thresholds.jumpAnkleRise &&
    signals.riseSpeed > thresholds.jumpRise;
  const jumping =
    !holdingSquat &&
    !justLanded &&
    !enteredRecovery &&
    jump.phase === "NEUTRAL" &&
    !standingOutOfSquat &&
    (takeoffFromDip || (flight && !recovering));
  // The fast frame of a small hop often arrives after the hips have already left the dip
  // band, with the knees still bent. Keep the armed dip until that rise, or until the
  // body is quiet again. Do not require straight knees on the speed frame.
  const prepHeld = prepSince !== null && now - prepSince >= thresholds.jumpPrepMs;
  const settled =
    signals.hipDrop < 0.02 && Math.abs(signals.hipVelocity) < 0.2 && signals.ankleRise < thresholds.jumpAnkleRise;
  // Keep the dip while the rise is already fast, so a 33ms hop is not thrown away before the dip is 50ms old.
  const risingHot = instant > thresholds.jumpRise;
  if (!dipping && !jumping && jump.phase === "NEUTRAL" && !risingHot && (!prepHeld || settled)) {
    prepSince = null;
    dipOpen = false;
    if (jumpMotion === "preparing") jumpMotion = "grounded";
  }
  if (jumping) {
    const speed = Math.max(signals.hipVelocity, signals.riseSpeed);
    const sent = emit(
      "jump",
      Math.min(1, signals.confidence * Math.min(1, speed / Math.max(0.2, thresholds.jumpRise * 2))),
    );
    jump = { phase: "CONFIRMED", since: now, eventId: sent.id, suppress: false };
    jumpMotion = "takeoff";
    prepSince = null;
    dipOpen = false;
    squatCalm = false;
    phase = "JUMPING";
    if (leftUp) left = suppressTrack(left, now);
    if (rightUp) right = suppressTrack(right, now);
    return pack();
  }

  const leftSent = sentPhase(left);
  const rightSent = sentPhase(right);
  if (leftUp && rightUp && !leftSent && !rightSent) {
    reject("both_arms");
    left = { phase: "NEUTRAL", since: now, eventId: null, suppress: true };
    right = { phase: "NEUTRAL", since: now, eventId: null, suppress: true };
    if (!recovering && phase !== "RECOVERING") phase = "NEUTRAL";
    return pack();
  }

  left = advanceArm(left, leftUp && !(rightUp && !leftSent), thresholds.armHoldMs, now, () => emit("lean_left", signals.confidence));
  right = advanceArm(right, rightUp && !(leftUp && !rightSent), thresholds.armHoldMs, now, () => emit("lean_right", signals.confidence));
  if (!leftUp && !rightUp) rejectLatched = false;

  const squatStillHeld = squat.phase === "CONFIRMED" || squat.phase === "SENT" || squat.phase === "WAIT_RESET";
  if (holdingSquat && squatStillHeld) {
    phase = "SQUATTING";
  } else if (recovering) {
    phase = "RECOVERING";
  } else if (left.phase !== "NEUTRAL" && right.phase === "NEUTRAL") {
    phase = "LEFT_ARM_ACTIVE";
  } else if (right.phase !== "NEUTRAL" && left.phase === "NEUTRAL") {
    phase = "RIGHT_ARM_ACTIVE";
  } else {
    phase = "NEUTRAL";
  }
  return pack();
}

function advanceArm(
  track: GestureTrack,
  up: boolean,
  holdMs: number,
  now: number,
  emit: () => { id: string },
): GestureTrack {
  if (track.suppress) {
    if (!up) return freshTrack();
    return { phase: "NEUTRAL", since: now, eventId: null, suppress: true };
  }
  if (track.phase === "TRIGGERED") {
    return up ? { ...track, phase: "WAIT_FOR_RELEASE" } : freshTrack();
  }
  if (track.phase === "WAIT_FOR_RELEASE") {
    return up ? track : freshTrack();
  }
  if (!up) return freshTrack();
  const since = track.phase === "ARM_RISING" ? track.since : now;
  if (now - since >= holdMs) {
    const sent = emit();
    return { phase: "TRIGGERED", since: now, eventId: sent.id, suppress: false };
  }
  return { phase: "ARM_RISING", since, eventId: null, suppress: false };
}

function sentPhase(track: GestureTrack) {
  return track.phase === "TRIGGERED" || track.phase === "WAIT_FOR_RELEASE";
}

function usesExit(track: GestureTrack) {
  return track.phase !== "NEUTRAL" || track.suppress;
}

function suppressTrack(track: GestureTrack, now: number): GestureTrack {
  if (sentPhase(track)) return { ...track, suppress: true };
  return { phase: "NEUTRAL", since: now, eventId: null, suppress: true };
}

function cancelCandidate(track: GestureTrack): GestureTrack {
  if (track.phase === "CANDIDATE" || track.phase === "CONFIRMED" || track.phase === "ARM_RISING" || track.phase === "TRIGGERED") {
    return { ...freshTrack(), suppress: track.suppress };
  }
  return track;
}

function delayCandidate(track: GestureTrack, dt: number): GestureTrack {
  if ((track.phase !== "CANDIDATE" && track.phase !== "ARM_RISING") || dt <= 0) return track;
  return { ...track, since: track.since + dt };
}

function poseIsQuiet(signals: PoseSignals, thresholds: MovementThresholds, neutral: NeutralPose) {
  const leftUp = armRaised(signals.leftArm, neutral.leftWristLateral, false, thresholds);
  const rightUp = armRaised(signals.rightArm, neutral.rightWristLateral, false, thresholds);
  const squatting = !signals.forwardBend && signals.hipDrop > thresholds.squatEnterDrop;
  const preparing = !signals.forwardBend && signals.hipDrop > thresholds.jumpPrepDrop;
  const jumping = signals.legsReady
    ? (signals.ankleRise > thresholds.jumpAnkleRise || signals.hipDrop < -0.05) &&
      (signals.riseSpeed > thresholds.jumpRise || signals.hipVelocity > thresholds.jumpRise)
    : signals.hipVelocity > thresholds.jumpRise || signals.shoulderVelocity > thresholds.jumpRise;
  return !leftUp && !rightUp && !squatting && !preparing && !jumping;
}

function stanceIsQuiet(state: DetectorState, signals: PoseSignals) {
  const neutral = state.neutral;
  if (!neutral || state.awaitRelease || state.phase !== "NEUTRAL" || state.jumpMotion !== "grounded") return false;
  if (state.left.phase !== "NEUTRAL" || state.right.phase !== "NEUTRAL") return false;
  if (state.squat.phase !== "NEUTRAL" || state.jump.phase !== "NEUTRAL") return false;
  if (signals.hipDrop > 0.02 || signals.hipDrop < -0.02 || Math.abs(signals.hipVelocity) > 0.12 || signals.ankleRise > 0.02) return false;
  return poseIsQuiet(signals, state.thresholds, neutral);
}

/**
 * Two raises per side, plus an overhead raise that is allowed and not required.
 * Halfway: waist-to-chest, bent elbow allowed, wrist must travel outward from the calibrated hang.
 * Sideways: arm pointed about horizontal, extended, elbow softer than a locked straight arm.
 */
function armRaised(arm: ArmPose, neutralLateral: number, engaged: boolean, thresholds: MovementThresholds) {
  if (!arm.visible) return false;
  return halfwayRaised(arm, neutralLateral, engaged, thresholds) || sidewaysRaised(arm, engaged, thresholds) || overheadRaised(arm, engaged);
}

function halfwayRaised(arm: ArmPose, neutralLateral: number, engaged: boolean, thresholds: MovementThresholds) {
  const travel = arm.lateral - neutralLateral;
  const elbow = engaged ? Math.min(55, thresholds.halfwayElbowMin) : thresholds.halfwayElbowMin;
  const outward = engaged ? thresholds.halfwayOutExit : thresholds.halfwayOutEnter;
  const minHeight = engaged ? 0.18 : thresholds.halfwayHeightMin;
  const maxHeight = thresholds.halfwayHeightMax;
  return travel >= outward && arm.height >= minHeight && arm.height <= maxHeight && arm.elbowAngle >= elbow;
}

function sidewaysRaised(arm: ArmPose, engaged: boolean, thresholds: MovementThresholds) {
  const elevation = engaged ? Math.max(50, thresholds.sidewaysElevationMin - 12) : thresholds.sidewaysElevationMin;
  const reach = engaged ? thresholds.sidewaysReachExit : thresholds.sidewaysReachEnter;
  const elbow = engaged ? thresholds.sidewaysElbowExit : thresholds.sidewaysElbowEnter;
  const maxElevation = engaged ? 150 : thresholds.sidewaysElevationMax;
  return arm.elevation >= elevation && arm.elevation <= maxElevation && arm.reach >= reach && arm.elbowAngle >= elbow;
}

/** Optional. A hand above the head still counts, and it is not required. */
function overheadRaised(arm: ArmPose, engaged: boolean) {
  const elevation = engaged ? 100 : 125;
  const reach = engaged ? 0.7 : 0.9;
  const elbow = engaged ? 80 : 90;
  return arm.elevation >= elevation && arm.reach >= reach && arm.elbowAngle >= elbow;
}

function midY(
  landmarks: Array<{ y: number; visibility?: number } | null | undefined>,
  leftIndex: number,
  rightIndex: number,
  minVisibility: number,
): number | null {
  const left = landmarks[leftIndex];
  const right = landmarks[rightIndex];
  if (!left || !right) return null;
  if ((left.visibility ?? 0) < minVisibility || (right.visibility ?? 0) < minVisibility) return null;
  if (!Number.isFinite(left.y) || !Number.isFinite(right.y)) return null;
  return (left.y + right.y) / 2;
}

function mirrorFrame(frame: PoseFrame): PoseFrame {
  return {
    timestampMs: frame.timestampMs,
    landmarks: frame.landmarks.map((landmark) => (landmark ? { ...landmark, x: 1 - landmark.x } : landmark)),
  };
}
