import { describe, expect, it } from "vitest";
import { createHandsFree, type HandsFreeSample } from "../../lib/vision/hands-free";
import { armDiagnosticLabel, canSendMovement, framingStatusCue, gameplaySendAllowed, leanOverlayText, liveGestureName, motionDiagnosticsEnabled, shouldRetryMovement, trackingStatusLine } from "./phone-commands";

const live = {
  controllerOn: true,
  tuning: false,
  hidden: false,
  upright: true,
  playing: true,
  cameraLive: true,
};

describe("phone command gate", () => {
  it("sends only from the live controller", () => {
    expect(canSendMovement(live)).toBe(true);
  });

  it("holds commands during the practice tutorial and recalibration", () => {
    expect(canSendMovement({ ...live, controllerOn: false })).toBe(false);
    expect(canSendMovement({ ...live, tuning: true })).toBe(false);
  });

  it("does not retry a stale, duplicate, or rejected command", () => {
    expect(shouldRetryMovement("stale", 500)).toBe(false);
    expect(shouldRetryMovement("DUPLICATE_EVENT", 10)).toBe(false);
    expect(shouldRetryMovement(null, 10)).toBe(false);
  });

  it("hides motion diagnostics in production", () => {
    expect(motionDiagnosticsEnabled("production")).toBe(false);
    expect(motionDiagnosticsEnabled("development")).toBe(true);
    const line = leanOverlayText({
      neutral: 0.012,
      lean: 0.21,
      confidence: 0.86,
      phase: "TRIGGERED",
      command: "lean_left",
      lane: "left",
    });
    expect(line).toContain("neutral 0.012");
    expect(line).toContain("left 0.210");
    expect(line).toContain("confidence 86%");
    expect(line).toContain("triggered");
    expect(line).toContain("sent lean_left");
    expect(line).toContain("lane left");
    expect(line).not.toContain("MOVE LEFT");
  });

  it("names the arm phases and the live gesture without covering them in a status line", () => {
    expect(armDiagnosticLabel("left", "ARM_RISING")).toBe("LEFT READY");
    expect(armDiagnosticLabel("left", "TRIGGERED")).toBe("LEFT DETECTED");
    expect(armDiagnosticLabel("right", "ARM_RISING")).toBe("RIGHT READY");
    expect(armDiagnosticLabel("right", "TRIGGERED")).toBe("RIGHT DETECTED");
    expect(armDiagnosticLabel("left", "WAIT_FOR_RELEASE")).toBe("WAITING FOR ARM RELEASE");
    expect(liveGestureName("lean_left")).toBe("LEFT");
    expect(liveGestureName("lean_right")).toBe("RIGHT");
    expect(liveGestureName("jump")).toBe("JUMP");
    expect(liveGestureName("squat")).toBe("SQUAT");
    expect(trackingStatusLine("DETECTING_PLAYER", 0, null)).toBe("Looking for player...");
    expect(trackingStatusLine("POSITIONING", 1, "Move Back")).toBe("Player detected");
    expect(trackingStatusLine("PLAYING", 1, "Motion tracking active")).toBe("Motion tracking active");
    expect(trackingStatusLine("PLAYING", 2, "Player detected")).toBe("One person at a time");
    expect(framingStatusCue("Move Back")).toBe("Move Back");
    expect(framingStatusCue("Player detected")).toBe("");
  });

  it("holds commands when the phone is hidden, sideways, or the round is not running", () => {
    expect(canSendMovement({ ...live, hidden: true })).toBe(false);
    expect(canSendMovement({ ...live, upright: false })).toBe(false);
    expect(canSendMovement({ ...live, playing: false })).toBe(false);
    expect(canSendMovement({ ...live, cameraLive: false })).toBe(false);
  });
});

const readyRound = {
  controllerOn: true,
  tuning: false,
  hidden: false,
  upright: true,
  phase: "running",
  ready: true,
  framingPaused: false,
  cameraLive: true,
};

describe("gameplay send gate", () => {
  it("sends a recognized move only after practice, while the round is running", () => {
    expect(gameplaySendAllowed(readyRound)).toBe(true);
    expect(gameplaySendAllowed({ ...readyRound, controllerOn: false })).toBe(false);
    expect(gameplaySendAllowed({ ...readyRound, phase: "lobby" })).toBe(false);
    expect(gameplaySendAllowed({ ...readyRound, phase: "countdown" })).toBe(false);
    expect(gameplaySendAllowed({ ...readyRound, ready: false })).toBe(false);
    expect(gameplaySendAllowed({ ...readyRound, framingPaused: true })).toBe(false);
    expect(gameplaySendAllowed({ ...readyRound, tuning: true })).toBe(false);
    expect(gameplaySendAllowed({ ...readyRound, phase: "paused" })).toBe(false);
  });
});

function sample(patch: Partial<HandsFreeSample> & Pick<HandsFreeSample, "now" | "serverPhase">): HandsFreeSample {
  return {
    cameraGranted: true,
    sessionConnected: true,
    framingCode: "good",
    confidence: 0.9,
    poseCount: 1,
    presenceConfidence: null,
    detectionConfidence: null,
    serverCountdown: 0,
    countdownPurpose: null,
    ...patch,
  };
}

describe("hands-free start and pause", () => {
  it("cancels a countdown when tracking breaks, then requires another 2 seconds", () => {
    const machine = createHandsFree();
    expect(machine.push(sample({ now: 0, serverPhase: "lobby" })).sendReady).toBeNull();
    const ready = machine.push(sample({ now: 2000, serverPhase: "lobby" }));
    expect(ready.phase).toBe("READY");
    expect(ready.sendReady).toBe(true);
    const counting = machine.push(sample({ now: 2100, serverPhase: "countdown", serverCountdown: 3, countdownPurpose: "start" }));
    expect(counting.phase).toBe("COUNTDOWN");
    expect(counting.countdown).toBe(3);
    expect(counting.sendReady).toBeNull();
    const flicker = machine.push(sample({ now: 2300, serverPhase: "countdown", serverCountdown: 3, countdownPurpose: "start", framingCode: "too_close" }));
    expect(flicker.phase).toBe("COUNTDOWN");
    expect(flicker.sendReady).toBeNull();
    const cancelled = machine.push(sample({ now: 2700, serverPhase: "countdown", serverCountdown: 2, countdownPurpose: "start", framingCode: "too_close" }));
    expect(cancelled.phase).toBe("POSITIONING");
    expect(cancelled.sendReady).toBe(false);
    expect(cancelled.cue).toBe("Move Back");
    const again = machine.push(sample({ now: 2800, serverPhase: "lobby" }));
    expect(again.sendReady).toBeNull();
    expect(machine.push(sample({ now: 4799, serverPhase: "lobby" })).sendReady).toBeNull();
    const second = machine.push(sample({ now: 4800, serverPhase: "lobby" }));
    expect(second.phase).toBe("READY");
    expect(second.sendReady).toBe(true);
  });

  it("pauses only after 3 seconds lost, then resumes after 2 seconds back in frame", () => {
    const machine = createHandsFree();
    machine.push(sample({ now: 0, serverPhase: "running" }));
    const missed = machine.push(sample({ now: 100, serverPhase: "running", framingCode: "keep_feet", poseCount: 1 }));
    expect(missed.phase).toBe("PLAYING");
    expect(missed.pause).toBe(false);
    expect(machine.push(sample({ now: 133, serverPhase: "running", framingCode: "keep_feet" })).phase).toBe("PLAYING");
    const warning = machine.push(sample({ now: 900, serverPhase: "running", framingCode: "keep_feet" }));
    expect(warning.phase).toBe("TRACKING_LOST");
    expect(warning.pause).toBe(false);
    expect(warning.trackingWarning).toBe(true);
    expect(warning.cue).toBe("Keep Your Feet Visible");
    expect(machine.push(sample({ now: 3099, serverPhase: "running", framingCode: "keep_feet" })).pause).toBe(false);
    const paused = machine.push(sample({ now: 3100, serverPhase: "running", framingCode: "keep_feet" }));
    expect(paused.pause).toBe(true);
    expect(paused.cue).toBe("Step Back Into Frame");
    expect(machine.push(sample({ now: 3200, serverPhase: "running", framingCode: "keep_feet" })).pause).toBe(false);

    expect(machine.push(sample({ now: 4000, serverPhase: "paused" })).resumeCountdown).toBe(false);
    expect(machine.push(sample({ now: 5999, serverPhase: "paused" })).resumeCountdown).toBe(false);
    const resume = machine.push(sample({ now: 6000, serverPhase: "paused" }));
    expect(resume.resumeCountdown).toBe(true);
    expect(resume.sendReady).toBeNull();
    expect(machine.push(sample({ now: 6100, serverPhase: "paused" })).resumeCountdown).toBe(false);
    const counting = machine.push(sample({ now: 6200, serverPhase: "countdown", serverCountdown: 3, countdownPurpose: "resume" }));
    expect(counting.phase).toBe("COUNTDOWN");
    expect(gameplaySendAllowed({ ...readyRound, phase: "countdown" })).toBe(false);
    expect(gameplaySendAllowed({ ...readyRound, phase: "paused" })).toBe(false);
  });

  it("does not start again after the round ends", () => {
    const machine = createHandsFree();
    machine.push(sample({ now: 0, serverPhase: "running" }));
    const over = machine.push(sample({ now: 1000, serverPhase: "ended" }));
    expect(over.phase).toBe("GAME_OVER");
    expect(over.sendReady).toBeNull();
    expect(over.resumeCountdown).toBe(false);
    const later = machine.push(sample({ now: 9000, serverPhase: "lobby" }));
    expect(later.phase).toBe("GAME_OVER");
    expect(later.sendReady).toBeNull();
  });
});
