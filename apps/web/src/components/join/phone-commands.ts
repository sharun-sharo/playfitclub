/** Gates gameplay commands. Practice, taps, and recovery buttons never pass this. */
export function canSendMovement(flags: {
  controllerOn: boolean;
  tuning: boolean;
  hidden: boolean;
  upright: boolean;
  playing: boolean;
  cameraLive: boolean;
}) {
  return flags.controllerOn && !flags.tuning && !flags.hidden && flags.upright && flags.playing && flags.cameraLive;
}

/**
 * Active controller plus a running round. The practice step keeps controllerOn false,
 * so those recognitions stay on the phone.
 */
export function gameplaySendAllowed(input: {
  controllerOn: boolean;
  tuning: boolean;
  hidden: boolean;
  upright: boolean;
  phase: string;
  ready: boolean;
  framingPaused: boolean;
  cameraLive: boolean;
}) {
  const playing = input.phase === "running" && input.ready && !input.framingPaused;
  return canSendMovement({
    controllerOn: input.controllerOn,
    tuning: input.tuning,
    hidden: input.hidden,
    upright: input.upright,
    playing,
    cameraLive: input.cameraLive,
  });
}

/** A gesture is sent once. A stale, duplicate, or rejected command is not sent again. */
export function shouldRetryMovement(reason: string | null, ageMs: number, staleMs = 400) {
  void reason;
  void ageMs;
  void staleMs;
  return false;
}

export function motionDiagnosticsEnabled(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv !== "production";
}

/** Dev readout for one arm. Production does not show this. */
export function armDiagnosticLabel(side: "left" | "right", phase: string | null | undefined) {
  if (phase === "ARM_RISING") return side === "left" ? "LEFT READY" : "RIGHT READY";
  if (phase === "TRIGGERED") return side === "left" ? "LEFT DETECTED" : "RIGHT DETECTED";
  if (phase === "WAIT_FOR_RELEASE") return "WAITING FOR ARM RELEASE";
  return "—";
}

/** The chip on the camera. Empty until a gesture has fired. */
export function liveGestureName(movement: string | null | undefined) {
  if (movement === "lean_left" || movement === "MOVE LEFT") return "LEFT";
  if (movement === "lean_right" || movement === "MOVE RIGHT") return "RIGHT";
  if (movement === "jump" || movement === "JUMP") return "JUMP";
  if (movement === "squat" || movement === "DUCK" || movement === "SQUAT") return "SQUAT";
  return "";
}

const STATUS_LINES = new Set(["Looking for player...", "Player detected", "Motion tracking active", "One person at a time"]);

/** Connection stays separate. This is the person line, not a framing instruction. */
export function trackingStatusLine(phase: string, poseCount: number, cue: string | null) {
  if (poseCount > 1 || cue === "One person at a time") return "One person at a time";
  if (poseCount === 0 || phase === "WAITING_FOR_CAMERA" || phase === "DETECTING_PLAYER") return "Looking for player...";
  if (phase === "READY" || phase === "PLAYING" || phase === "COUNTDOWN") return "Motion tracking active";
  if (cue && STATUS_LINES.has(cue)) return cue;
  return "Player detected";
}

/** A move-back or feet line. Status lines are not repeated here. */
export function framingStatusCue(cue: string | null | undefined) {
  if (!cue || STATUS_LINES.has(cue)) return "";
  return cue;
}
