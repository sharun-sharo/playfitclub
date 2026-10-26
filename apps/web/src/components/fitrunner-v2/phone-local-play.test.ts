import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_THRESHOLDS } from "@fitplay/game";
import { describe, expect, it } from "vitest";
import { fitRunnerPixelRatio } from "./tv-graphics";
import {
  applyLocalPose,
  confirmToGameMs,
  confirmedLocalGesture,
  dispatchLocalGesture,
  KEYBOARD_GAME_ACTIONS,
  phoneAsksForLandscape,
  phoneCameraFailure,
  phoneFrameWarning,
  phoneGestureCandidate,
  phoneMotionDiagEnabled,
  phoneMotionDiagLines,
  phonePixelRatio,
  phonePlayCalories,
  phoneSetupLine,
  phoneTrackingStatus,
  homePlayHref,
  phonePlayQrPayload,
  PHONE_LAPTOP_QR_LINE,
  PHONE_LAPTOP_QR_NAME,
  PHONE_LIVE_CAMERA,
  phoneLiveCameraKeepsFrames,
  PHONE_MIRROR_GUIDE,
  PHONE_MIRROR_NOTE,
  PHONE_PLAY_PATH,
  PHONE_PIXEL_RATIO_CAP,
  PHONE_ROTATE_LINE,
  PHONE_STAND_LINE,
  PHONE_TEST_CONTROLS_LABEL,
  renderLoopFps,
} from "./phone-local-play";

describe("phone local gestures", () => {
  it("maps one confirmed gesture to the keyboard game call without a socket", () => {
    const calls: string[] = [];
    const game = {
      jump: () => calls.push("jump"),
      roll: () => calls.push("roll"),
      stepLane: (direction: -1 | 1) => calls.push(`stepLane:${direction}`),
    };

    expect(dispatchLocalGesture("jump", game)).toBe(true);
    expect(dispatchLocalGesture("squat", game)).toBe(true);
    expect(dispatchLocalGesture("lean_left", game)).toBe(true);
    expect(dispatchLocalGesture("lean_right", game)).toBe(true);

    expect(calls).toEqual(["jump", "roll", "stepLane:-1", "stepLane:1"]);
    expect(confirmedLocalGesture("jump")).toEqual({ call: KEYBOARD_GAME_ACTIONS.jump.call });
    expect(confirmedLocalGesture("squat")).toEqual({ call: KEYBOARD_GAME_ACTIONS.squat.call });
    expect(confirmedLocalGesture("lean_left")).toEqual({
      call: KEYBOARD_GAME_ACTIONS.lean_left.call,
      direction: KEYBOARD_GAME_ACTIONS.lean_left.direction,
    });
    expect(confirmedLocalGesture("lean_right")).toEqual({
      call: KEYBOARD_GAME_ACTIONS.lean_right.call,
      direction: KEYBOARD_GAME_ACTIONS.lean_right.direction,
    });
    expect(dispatchLocalGesture("punch", game)).toBe(false);
    expect(dispatchLocalGesture("hold", game)).toBe(false);
    expect(calls).toEqual(["jump", "roll", "stepLane:-1", "stepLane:1"]);
    expect(JSON.stringify(confirmedLocalGesture("jump"))).not.toMatch(/socket|movement:event/);
  });

  it("keeps the live detector gates and the balanced pixel-ratio cap", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
    expect(PHONE_PIXEL_RATIO_CAP).toBe(1.5);
    expect(phonePixelRatio(3)).toBe(1.5);
    expect(phonePixelRatio(1.25)).toBe(1.25);
    expect(phonePixelRatio(Number.NaN)).toBe(1);
    expect(fitRunnerPixelRatio(3, false)).toBe(2);
    expect(fitRunnerPixelRatio(2.5, true)).toBe(1);
    expect(phoneCameraFailure(new DOMException("no", "NotAllowedError"))).not.toMatch(/keyboard/i);
  });

  it("still applies a pose action when the camera preview is hidden", () => {
    const calls: string[] = [];
    const seen = new Set<string>();
    const game = {
      jump: () => calls.push("jump"),
      roll: () => calls.push("roll"),
      stepLane: (direction: -1 | 1) => calls.push(`stepLane:${direction}`),
    };

    expect(
      applyLocalPose({
        playing: true,
        previewVisible: false,
        movementType: "jump",
        eventId: "jump-1",
        seen,
        game,
      }),
    ).toBe(true);
    expect(
      applyLocalPose({
        playing: true,
        previewVisible: false,
        movementType: "squat",
        eventId: "squat-1",
        seen,
        game,
      }),
    ).toBe(true);
    expect(calls).toEqual(["jump", "roll"]);
    expect(
      applyLocalPose({
        playing: true,
        previewVisible: false,
        movementType: "jump",
        eventId: "jump-1",
        seen,
        game,
      }),
    ).toBe(false);
    expect(calls).toEqual(["jump", "roll"]);
    expect(
      applyLocalPose({
        playing: false,
        previewVisible: true,
        movementType: "lean_left",
        eventId: "lean-1",
        seen,
        game,
      }),
    ).toBe(false);
    expect(dispatchLocalGesture("hold", game)).toBe(false);
    expect(dispatchLocalGesture("stand", game)).toBe(false);
    expect(calls).toEqual(["jump", "roll"]);
  });

  it("keeps the phone page on landscape copy, the mirror steps, and the existing calorie dash", () => {
    expect(phoneAsksForLandscape(390, 844)).toBe(true);
    expect(phoneAsksForLandscape(844, 390)).toBe(false);
    expect(PHONE_ROTATE_LINE).toBe("Turn your phone sideways.");
    expect(phoneSetupLine("looking", null)).toBe(PHONE_STAND_LINE);
    expect(phoneSetupLine("detected", "Great! Stay still while we calibrate.")).toBe("Great! Stay still while we calibrate.");
    expect(phoneSetupLine("ready", null)).toBe("The game is on this phone.");
    expect(phoneTrackingStatus({ playing: true, poseCount: 1, calibrated: true })).toBe("Motion tracking active");
    expect(phoneTrackingStatus({ playing: true, poseCount: 0, calibrated: true })).toBe("Looking for player...");
    expect(phoneFrameWarning({ playing: true, banner: false, pause: false })).toBeNull();
    expect(phoneFrameWarning({ playing: false, banner: true, pause: true })).toBeNull();
    expect(phoneFrameWarning({ playing: true, banner: true, pause: false })).toMatch(/left the frame/i);
    expect(PHONE_MIRROR_GUIDE).toEqual(["Samsung Smart View", "Android Cast", "iPhone Screen Mirroring"]);
    expect(PHONE_MIRROR_NOTE).toMatch(/phone's own mirror/);
    expect(`${PHONE_MIRROR_NOTE} ${PHONE_MIRROR_GUIDE.join(" ")}`).not.toMatch(/\/tv\/play|WebRTC|every TV|TV browser/i);
    expect(homePlayHref({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", coarsePointer: true, viewportWidth: 390 })).toBe("/play/phone");
    expect(homePlayHref({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", coarsePointer: false, viewportWidth: 1440 })).toBe("/play/fit-run");
    expect(homePlayHref({ userAgent: "Mozilla/5.0 (SMART-TV; Tizen 6.0)", coarsePointer: true, viewportWidth: 1920 })).toBe("/play/fit-run");
    expect(phonePlayQrPayload("https://playfitclub.com")).toBe(`https://playfitclub.com${PHONE_PLAY_PATH}`);
    expect(phonePlayQrPayload("https://playfitclub.com/")).toBe(`https://playfitclub.com${PHONE_PLAY_PATH}`);
    expect(phonePlayQrPayload("https://preview.example")).toBe(`https://preview.example${PHONE_PLAY_PATH}`);
    expect(phonePlayQrPayload("http://127.0.0.1:3000")).toBe(`http://127.0.0.1:3000${PHONE_PLAY_PATH}`);
    expect(phonePlayQrPayload("")).toBe("");
    expect(phonePlayQrPayload("playfitclub.com")).toBe("");
    expect(PHONE_LAPTOP_QR_LINE).toBe("If you opened this on a laptop, scan this with your phone.");
    expect(PHONE_LAPTOP_QR_NAME).toBe("QR code to open this game on your phone");
    expect(`${PHONE_LAPTOP_QR_LINE} ${PHONE_LAPTOP_QR_NAME}`).not.toContain(PHONE_PLAY_PATH);
    expect(`${PHONE_LAPTOP_QR_LINE} ${PHONE_LAPTOP_QR_NAME}`).not.toMatch(/https?:\/\//);
    expect(phonePlayCalories({ weightKg: null, cameraActiveMs: 60_000, cameraLive: true }).text).toBe("—");
    expect(phonePlayCalories({ weightKg: 70, cameraActiveMs: 60_000, cameraLive: false }).text).toBe("—");
    expect(phonePlayCalories({ weightKg: undefined, cameraActiveMs: 60_000, cameraLive: true }).text).toBe("—");
    expect(phonePlayCalories({ weightKg: 70, cameraActiveMs: 60_000, cameraLive: true }).text).toBe("4 kcal");
    expect(phoneMotionDiagEnabled("")).toBe(false);
    expect(phoneMotionDiagEnabled("?motiondiag=1")).toBe(true);
    expect(PHONE_TEST_CONTROLS_LABEL).toBe("Test controls");
    expect(PHONE_TEST_CONTROLS_LABEL).not.toMatch(/play with keyboard/i);
    const lines = phoneMotionDiagLines({
      buffer: "1688x860",
      renderFps: 30,
      poseFps: 15,
      inferenceMs: 12.5,
      candidate: "jump",
      confirmed: "jump",
      confirmToCallMs: confirmToGameMs(1000, 1018),
      reject: "none",
    });
    expect(lines).toEqual([
      "buffer 1688x860",
      "game 30.0 fps",
      "pose 15.0 fps",
      "inference 12.5 ms",
      "candidate jump",
      "confirmed jump",
      "confirm to call 18 ms",
      "reject none",
    ]);
    expect(phoneGestureCandidate({ jumpPhase: "CANDIDATE", squatPhase: "NEUTRAL" })).toBe("jump");
    expect(phoneGestureCandidate({ leftPhase: "ARM_RISING", rightPhase: "ARM_RISING" })).toBe("left+right");
    expect(phoneGestureCandidate(null)).toBe("none");
    expect(lines.join(" ")).not.toMatch(/token|player name|email|session|socket/i);
    expect(renderLoopFps([0, 500, 1000])).toBe(2);
    expect(renderLoopFps([10])).toBeNull();
    expect(confirmToGameMs(50, 40)).toBeNull();
  });

  it("keeps a real camera box so a long frame can still dispatch jump, squat, left, and right", () => {
    expect(phoneLiveCameraKeepsFrames(PHONE_LIVE_CAMERA)).toBe(true);
    expect(phoneLiveCameraKeepsFrames({ width: 1, height: 1 })).toBe(false);
    const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "phone-hud.css"), "utf8");
    const park = css.slice(css.indexOf(".phone-camera-park"), css.indexOf(".phone-camera-park") + 320);
    expect(park).toContain("width: 320px");
    expect(park).toContain("height: 180px");
    expect(park).toContain("opacity: 1");
    expect(park).not.toContain("width: 1px");
    expect(park).not.toContain("opacity: 0");
    const calls: string[] = [];
    const game = {
      jump: () => calls.push("jump"),
      roll: () => calls.push("roll"),
      stepLane: (direction: -1 | 1) => calls.push(`stepLane:${direction}`),
    };
    expect(dispatchLocalGesture("jump", game)).toBe(true);
    expect(dispatchLocalGesture("squat", game)).toBe(true);
    expect(dispatchLocalGesture("lean_left", game)).toBe(true);
    expect(dispatchLocalGesture("lean_right", game)).toBe(true);
    expect(calls).toEqual(["jump", "roll", "stepLane:-1", "stepLane:1"]);
  });
});
