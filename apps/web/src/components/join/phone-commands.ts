import { PROTOCOL_VERSION } from "@fitplay/shared";

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

/** Socket body shared by a real gesture and a motiondiag test button. */
export function buildMovementSocketBody(input: {
  eventId: string;
  playerId: string;
  sessionId: string;
  movementType: "lean_left" | "lean_right" | "squat" | "jump" | "punch" | "hold";
  confidence: number;
  clientTimestamp: number;
  sequenceNumber: number;
}) {
  return {
    v: PROTOCOL_VERSION,
    eventId: input.eventId,
    playerId: input.playerId,
    sessionId: input.sessionId,
    movementType: input.movementType,
    confidence: input.confidence,
    clientTimestamp: input.clientTimestamp,
    sequenceNumber: input.sequenceNumber,
  };
}

/**
 * One increasing sequence for gestures and test buttons.
 * A test press must not reuse a number the server already accepted, and the next
 * gesture must stay above that press.
 */
export function nextMovementSequence(lastSent: number, proposed: number) {
  const last = Number.isFinite(lastSent) ? lastSent : 0;
  const next = Number.isFinite(proposed) ? Math.floor(proposed) : 0;
  return Math.max(last + 1, Math.max(0, next));
}

/** Test buttons send only while the round is running. One press is one new event. */
export function testMovementAllowed(phase: string) {
  return phase === "running";
}

export const TEST_MOVEMENT_BUTTONS = [
  { label: "TEST JUMP", movementType: "jump" },
  { label: "TEST SQUAT", movementType: "squat" },
  { label: "TEST LEFT", movementType: "lean_left" },
  { label: "TEST RIGHT", movementType: "lean_right" },
] as const;

/** A gesture is sent once. A stale, duplicate, or rejected command is not sent again. */
export function shouldRetryMovement(reason: string | null, ageMs: number, staleMs = 800) {
  void reason;
  void ageMs;
  void staleMs;
  return false;
}

/** Tester overlay on the production phone page. The query is `?motiondiag=1`. */
export function readMotionDiagFlag(search: string) {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("motiondiag") === "1";
}

export function motionDiagnosticsEnabled(nodeEnv: string | undefined = process.env.NODE_ENV, search = "") {
  if (readMotionDiagFlag(search)) return true;
  return nodeEnv !== "production";
}

export interface QueuedMovement<T> {
  eventId: string;
  queuedAt: number;
  sent: boolean;
  body: T;
}

/** The same event id is not queued twice and is not sent again after it leaves. */
export function enqueueMovement<T>(queue: QueuedMovement<T>[], item: QueuedMovement<T>) {
  if (queue.some((entry) => entry.eventId === item.eventId)) return queue;
  return [...queue, item];
}

/**
 * Sends each unsent command once, and only while the socket can deliver it.
 * A command that is still waiting through a disconnect stays queued until it
 * is older than the stale bound. It is not replayed after that, and a command
 * that was already handed to the socket is not sent again.
 */
export function flushMovementQueue<T>(queue: QueuedMovement<T>[], now: number, canSend: boolean, staleMs: number) {
  const send: QueuedMovement<T>[] = [];
  const keep: QueuedMovement<T>[] = [];
  const dropped: QueuedMovement<T>[] = [];
  for (const item of queue) {
    if (item.sent) continue;
    if (now - item.queuedAt > staleMs) {
      dropped.push(item);
      continue;
    }
    if (!canSend) {
      keep.push(item);
      continue;
    }
    send.push({ ...item, sent: true });
  }
  return { send, keep, dropped };
}

export function candidateLabel(input: {
  squatPhase?: string | null;
  jumpPhase?: string | null;
  leanPhase?: string | null;
  leftPhase?: string | null;
  rightPhase?: string | null;
}) {
  const parts: string[] = [];
  if (input.squatPhase === "CANDIDATE") parts.push("squat");
  if (input.jumpPhase === "CANDIDATE") parts.push("jump");
  if (input.leanPhase === "CANDIDATE") parts.push("lean");
  if (input.leftPhase === "ARM_RISING") parts.push("left arm");
  if (input.rightPhase === "ARM_RISING") parts.push("right arm");
  return parts.length ? parts.join(", ") : "none";
}

/** TV result when the server relayed one. Otherwise the server ack, or not reported. */
export function authoritativeMoveLabel(input: { tvState: string; serverAck: string }) {
  if (input.tvState) return input.tvState;
  if (input.serverAck) return `server ${input.serverAck}`;
  return "not reported";
}

/**
 * Development readout for a body lean. Not a player-facing move banner.
 * Lane commands stay lean_left and lean_right.
 */
export function leanOverlayText(input: {
  neutral: number | null | undefined;
  lean: number | null | undefined;
  confidence: number | null | undefined;
  phase: string | null | undefined;
  command: string | null | undefined;
  lane: string | null | undefined;
}) {
  const lean = typeof input.lean === "number" && Number.isFinite(input.lean) ? input.lean : 0;
  const direction = Math.abs(lean) <= 0.07 ? "neutral" : lean > 0 ? "left" : "right";
  const phase = input.phase || "idle";
  const armed = phase === "CANDIDATE" || phase === "ARM_RISING" ? "armed" : phase === "TRIGGERED" || phase === "WAIT_RESET" || phase === "CONFIRMED" ? "triggered" : "idle";
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence) ? Math.round(input.confidence * 100) : 0;
  const neutral = typeof input.neutral === "number" && Number.isFinite(input.neutral) ? input.neutral.toFixed(3) : "—";
  return `neutral ${neutral} · ${direction} ${Math.abs(lean).toFixed(3)} · confidence ${confidence}% · ${armed} · sent ${input.command || "—"} · lane ${input.lane || "—"}`;
}

/** Dev readout for one arm. Production does not show this. */
export function armDiagnosticLabel(side: "left" | "right", phase: string | null | undefined) {
  if (phase === "ARM_RISING") return side === "left" ? "LEFT READY" : "RIGHT READY";
  if (phase === "TRIGGERED") return side === "left" ? "LEFT DETECTED" : "RIGHT DETECTED";
  if (phase === "WAIT_FOR_RELEASE") return "WAITING FOR ARM RELEASE";
  return "—";
}

/**
 * Development readout on the phone camera. Numbers and the gesture phase only.
 * No name, token, or session secret belongs in this text.
 */
export function motionDebugLines(input: {
  confidence: number;
  kneeAngle: number;
  hipDrop: number;
  hipVelocity: number;
  recognition: string;
  jumpConfidence: number;
  squatConfidence: number;
  command: string | null | undefined;
  shoulderVelocity?: number;
  kneeExtension?: number;
  jumpCandidate?: string | null;
  jumpConfirmation?: string | null;
  squatArbitration?: string | null;
  lastJump?: string | null;
  serverAck?: string | null;
  grounded?: string | null;
  cameraFps?: number | null;
  /** Presentation clock for this frame. Same clock as confirmMs. */
  frameMs?: number | null;
  /** Latest detectForVideo duration on this phone. */
  inferenceMs?: number | null;
  /** Phone performance clock when detectForVideo started. */
  inferenceStartMs?: number | null;
  /** Phone performance clock when detectForVideo returned. */
  inferenceEndMs?: number | null;
  /** Phone performance clock when the gesture became a candidate. */
  candidateMs?: number | null;
  /** Frame time when the gesture was confirmed. */
  confirmMs?: number | null;
  /** Phone date stamp when the socket emit ran. Not a duration, and not a TV clock. */
  sendMs?: number | null;
  delegate?: "GPU" | "CPU" | null;
}) {
  const pct = (value: number) => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  const num = (value: number) => (Number.isFinite(value) ? value : 0);
  const fps = typeof input.cameraFps === "number" && Number.isFinite(input.cameraFps) ? input.cameraFps.toFixed(1) : "—";
  return [
    `confidence ${pct(num(input.confidence))}`,
    `knee ${num(input.kneeAngle).toFixed(0)}°`,
    `hip ${num(input.hipDrop).toFixed(2)} torso`,
    `vertical ${num(input.hipVelocity).toFixed(2)} torso/s`,
    `state ${input.recognition || "NEUTRAL"}`,
    `jump ${pct(num(input.jumpConfidence))}`,
    `squat ${pct(num(input.squatConfidence))}`,
    `command ${input.command || "none"}`,
    `camera ${fps} fps`,
    `shoulder ${num(input.shoulderVelocity ?? 0).toFixed(2)} torso/s`,
    `knee extension ${num(input.kneeExtension ?? 0).toFixed(0)}°`,
    `jump candidate ${input.jumpCandidate || "NEUTRAL"}`,
    `jump confirm ${input.jumpConfirmation || "NEUTRAL"}`,
    `squat arbitration ${input.squatArbitration || "idle"}`,
    `last jump ${input.lastJump || "none"}`,
    `server ${input.serverAck || "none"}`,
    `body ${input.grounded || "grounded"}`,
    `frame ${stamp(input.frameMs)}`,
    `inference start ${stamp(input.inferenceStartMs)}`,
    `inference end ${stamp(input.inferenceEndMs)}`,
    `inference ${input.inferenceMs == null || !Number.isFinite(input.inferenceMs) ? "—" : `${input.inferenceMs.toFixed(1)} ms`}`,
    `candidate ${stamp(input.candidateMs)}`,
    `confirm ${stamp(input.confirmMs)}`,
    `emit ${stamp(input.sendMs)}`,
    `send ${stamp(input.sendMs)}`,
    `delegate ${input.delegate ?? "—"}`,
  ];
}

function stamp(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}`;
}

/** One diagnostics sample. Numbers and phase names only. */
export interface MotionDiagSample {
  t: number;
  cameraFps: number | null;
  poseFps: number | null;
  confidence: number;
  hipVelocity: number;
  shoulderVelocity: number;
  kneeExtension: number;
  jumpCandidate: string;
  jumpConfirmation: string;
  squatArbitration: string;
  lastJump: string | null;
  serverAck: string;
  grounded: string;
  frameMs?: number | null;
  inferenceMs?: number | null;
  inferenceStartMs?: number | null;
  inferenceEndMs?: number | null;
  candidateMs?: number | null;
  confirmMs?: number | null;
  /** Phone date when the socket emit ran. */
  sendMs?: number | null;
  emitMs?: number | null;
}

export function groundedLabel(jumpMotion: string) {
  return jumpMotion === "takeoff" || jumpMotion === "airborne" ? "airborne" : "grounded";
}

/** Keeps a short tail. Older samples drop off the front. */
export function appendMotionDiag(log: MotionDiagSample[], sample: MotionDiagSample, limit = 300) {
  const next = [...log, sample];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function diagNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

/** JSON for the phone download. Pose numbers and timestamps only. */
export function motionDiagDownload(samples: MotionDiagSample[]) {
  return JSON.stringify({
    note: "Pose numbers and timestamps only.",
    samples: samples.map((sample) => ({
      t: diagNumber(sample.t),
      cameraFps: diagNumber(sample.cameraFps),
      poseFps: diagNumber(sample.poseFps),
      confidence: diagNumber(sample.confidence),
      hipVelocity: diagNumber(sample.hipVelocity),
      shoulderVelocity: diagNumber(sample.shoulderVelocity),
      kneeExtension: diagNumber(sample.kneeExtension),
      jumpCandidate: sample.jumpCandidate,
      jumpConfirmation: sample.jumpConfirmation,
      squatArbitration: sample.squatArbitration,
      lastJump: sample.lastJump,
      serverAck: sample.serverAck,
      grounded: sample.grounded,
      frameMs: diagNumber(sample.frameMs ?? null),
      inferenceMs: diagNumber(sample.inferenceMs ?? null),
      inferenceStartMs: diagNumber(sample.inferenceStartMs ?? null),
      inferenceEndMs: diagNumber(sample.inferenceEndMs ?? null),
      candidateMs: diagNumber(sample.candidateMs ?? null),
      confirmMs: diagNumber(sample.confirmMs ?? null),
      sendMs: diagNumber(sample.sendMs ?? null),
      emitMs: diagNumber(sample.emitMs ?? sample.sendMs ?? null),
    })),
  });
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
