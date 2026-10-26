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
  phoneMotionDiagEnabled,
  phoneMotionDiagLines,
  phonePixelRatio,
  phonePlayCalories,
  phoneSetupLine,
  phoneTrackingStatus,
  PHONE_MIRROR_GUIDE,
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

  it("keeps the live detector gates and the phone drawing cap", () => {
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
    const guide = PHONE_MIRROR_GUIDE.join(" ");
    expect(guide).toMatch(/Samsung: Smart View/);
    expect(guide).toMatch(/Android: Cast/);
    expect(guide).toMatch(/iPhone: Screen Mirroring/);
    expect(guide).toMatch(/HDMI: from a laptop only while that laptop is displaying this mirrored phone/);
    expect(guide).not.toMatch(/\/tv\/play|WebRTC|every TV/i);
    expect(phonePlayCalories({ weightKg: null, cameraActiveMs: 60_000, cameraLive: true }).text).toBe("—");
    expect(phonePlayCalories({ weightKg: 70, cameraActiveMs: 60_000, cameraLive: false }).text).toBe("—");
    expect(phonePlayCalories({ weightKg: undefined, cameraActiveMs: 60_000, cameraLive: true }).text).toBe("—");
    expect(phonePlayCalories({ weightKg: 70, cameraActiveMs: 60_000, cameraLive: true }).text).toBe("4 kcal");
    expect(phoneMotionDiagEnabled("")).toBe(false);
    expect(phoneMotionDiagEnabled("?motiondiag=1")).toBe(true);
    expect(PHONE_TEST_CONTROLS_LABEL).toBe("Test controls");
    expect(PHONE_TEST_CONTROLS_LABEL).not.toMatch(/play with keyboard/i);
    const lines = phoneMotionDiagLines({
      renderFps: 30,
      inferenceMs: 12.5,
      confidence: 0.8,
      lastAction: "jump",
      confirmToCallMs: confirmToGameMs(1000, 1018),
    });
    expect(lines).toEqual(["render 30.0 fps", "inference 12.5 ms", "confidence 80%", "action jump", "confirm to call 18 ms"]);
    expect(lines.join(" ")).not.toMatch(/token|player name|socket/i);
    expect(renderLoopFps([0, 500, 1000])).toBe(2);
    expect(renderLoopFps([10])).toBeNull();
    expect(confirmToGameMs(50, 40)).toBeNull();
  });
});
