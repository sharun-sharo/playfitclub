import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_THRESHOLDS } from "@fitplay/game";
import { distanceAt, scheduleCourse } from "@fitplay/shared";
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
  phoneMotionLogText,
  phonePreviewFrame,
  placePhonePreview,
  phonePixelRatio,
  phonePlayCalories,
  phoneSetupLine,
  phoneTrackingStatus,
  homePlayHref,
  phonePlayQrPayload,
  PHONE_LAPTOP_QR_LINE,
  PHONE_LAPTOP_QR_NAME,
  PHONE_HUD_CARD_PX,
  PHONE_LIVE_CAMERA,
  phoneHudCardWidth,
  phoneLiveCameraKeepsFrames,
  phonePlayViewportBox,
  phoneObstacleCounts,
  phoneRunSeed,
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
      "camera —",
      "confidence —",
      "stability —",
      "calibration —",
      "baseline —",
      "hip —",
      "shoulder —",
      "knee —",
      "buffer 1688x860",
      "game 30.0 fps",
      "pose 15.0 fps",
      "inference 12.5 ms",
      "candidate jump",
      "confirmed jump",
      "confirm to call 18 ms",
      "reject none",
    ]);
    const log = phoneMotionLogText([
      {
        t: 10,
        camera: "1280x720",
        confidence: 0.8,
        calibration: "CALIBRATED",
        candidate: "jump",
        confirmed: "jump",
        reject: "none",
        hip: 0.01,
        shoulder: 0.02,
        knee: 170,
        gameFps: 30,
        poseFps: 15,
        inferenceMs: 12,
        confirmToCallMs: 18,
      },
    ]);
    expect(log).toContain("\"confirmed\":\"jump\"");
    expect(log).not.toMatch(/token|email|name|frameData|dataUrl/i);
    expect(phoneGestureCandidate({ jumpPhase: "CANDIDATE", squatPhase: "NEUTRAL" })).toBe("jump");
    expect(phoneGestureCandidate({ leftPhase: "ARM_RISING", rightPhase: "ARM_RISING" })).toBe("left+right");
    expect(phoneGestureCandidate(null)).toBe("none");
    expect(lines.join(" ")).not.toMatch(/token|player name|email|session|socket/i);
    expect(renderLoopFps([0, 500, 1000])).toBe(2);
    expect(renderLoopFps([10])).toBeNull();
    expect(confirmToGameMs(50, 40)).toBeNull();
  });

  it("keeps a few painted pixels so a long frame can still dispatch jump, squat, left, and right", () => {
    expect(phoneLiveCameraKeepsFrames(PHONE_LIVE_CAMERA)).toBe(true);
    expect(phoneLiveCameraKeepsFrames({ width: 6, height: 4, opacity: 0.02 })).toBe(true);
    expect(phoneLiveCameraKeepsFrames({ width: 1, height: 1 })).toBe(true);
    expect(phoneLiveCameraKeepsFrames({ width: 0, height: 4 })).toBe(false);
    expect(phoneLiveCameraKeepsFrames({ width: 112, height: 96, opacity: 0 })).toBe(false);
    expect(phoneLiveCameraKeepsFrames({ width: 112, height: 96, hidden: true })).toBe(false);
    expect(PHONE_LIVE_CAMERA.width).toBeGreaterThan(0);
    expect(PHONE_LIVE_CAMERA.width).toBeLessThanOrEqual(8);
    expect(PHONE_LIVE_CAMERA.height).toBeGreaterThan(0);
    expect(PHONE_LIVE_CAMERA.height).toBeLessThanOrEqual(8);
    expect(PHONE_LIVE_CAMERA.opacity).toBeGreaterThanOrEqual(0.02);
    const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "phone-hud.css"), "utf8");
    const park = css.slice(css.indexOf(".phone-camera-park {"), css.indexOf(".phone-cal-stage"));
    const videoRule = css.slice(css.indexOf(".phone-camera-park video {"), css.indexOf(".phone-camera-park canvas"));
    expect(park).toContain(`width: ${PHONE_LIVE_CAMERA.width}px`);
    expect(park).toContain(`height: ${PHONE_LIVE_CAMERA.height}px`);
    expect(videoRule).toContain(`opacity: ${PHONE_LIVE_CAMERA.opacity}`);
    expect(videoRule).toContain("visibility: visible");
    expect(videoRule).not.toContain("display: none");
    expect(videoRule).not.toContain("visibility: hidden");
    expect(videoRule).not.toContain("opacity: 0;");
    expect(park).toContain("z-index: 24");
    expect(css.slice(css.indexOf(".phone-camera-park canvas"), css.indexOf(".phone-cal-stage"))).toContain("display: none");
    const stage = css.slice(css.indexOf(".phone-cal-stage {"), css.indexOf(".phone-cal-stage video.phone-cal-media"));
    const stageMedia = css.slice(css.indexOf(".phone-cal-stage video.phone-cal-media"), css.indexOf(".phone-calib-guide"));
    expect(stage).toContain("overflow: hidden");
    expect(stageMedia).toContain("max-width: none");
    expect(stageMedia).toContain("opacity: 1");
    expect(stageMedia).toContain("border: 0");
    expect(stageMedia).not.toContain("width: 6px");
    expect(stageMedia).toContain("display: block");
    const preview = phonePreviewFrame(1000, 500, 1920, 1080);
    expect(preview.height).toBeCloseTo(500);
    expect(preview.width).toBeLessThan(1000);
    expect(preview.x).toBeGreaterThan(0);
    const canvasRule = css.slice(css.indexOf(".phone-play > canvas"), css.indexOf(".phone-play > canvas") + 280);
    expect(canvasRule).toContain("position: fixed");
    expect(canvasRule).toContain("z-index: 1");
    expect(canvasRule).toContain("height: 100dvh");
    expect(phoneHudCardWidth(1920)).toBe(PHONE_HUD_CARD_PX);
    expect(phoneHudCardWidth(844)).toBe(PHONE_HUD_CARD_PX);
    expect(phoneHudCardWidth(120)).toBe(120);
    expect(phoneHudCardWidth(0)).toBe(PHONE_HUD_CARD_PX);
    expect(css).toContain(`width: ${PHONE_HUD_CARD_PX}px`);
    expect(css).toContain(`max-width: ${PHONE_HUD_CARD_PX}px`);
    expect(phonePlayViewportBox({
      innerWidth: 1920,
      innerHeight: 1080,
      visualWidth: 1920,
      visualHeight: 980,
      offsetLeft: 0,
      offsetTop: 48,
    })).toEqual({ left: 0, top: 48, width: 1920, height: 980 });
    expect(phonePlayViewportBox({ innerWidth: 800, innerHeight: 400 })).toEqual({ left: 0, top: 0, width: 800, height: 400 });
    expect(phoneRunSeed(0)).toBe(1);
    expect(phoneRunSeed(0x100000000)).toBe(1);
    expect(phoneRunSeed(42)).toBe(42);
    const course = scheduleCourse({ seed: 42, ceiling: "beginner", untilTimeS: 90 });
    const distance = distanceAt(45);
    const ahead = course.obstacles.find((item) => item.distanceM > distance + 1 && item.distanceM < distance + 50);
    expect(ahead).toBeTruthy();
    expect(phoneObstacleCounts(42, "beginner", ahead?.id ?? "")).toBe(true);
    expect(phoneObstacleCounts(42, "beginner", "palm")).toBe(false);
    expect(phoneObstacleCounts(0, "beginner", ahead?.id ?? "")).toBe(false);
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

  it("covers the calibration stage instead of pinning a camera sliver", () => {
    const style = { left: "stale", top: "stale", width: "6px", height: "4px", right: "0px", bottom: "0px" };
    const flip = { style } as unknown as HTMLElement;
    placePhonePreview(flip, { clientWidth: 844, clientHeight: 390 }, { videoWidth: 720, videoHeight: 1280 }, true);
    expect(style.width).toBe("100%");
    expect(style.height).toBe("100%");
    expect(style.left).toBe("0");
    expect(style.top).toBe("0");
    expect(style.width).not.toBe("6px");
    placePhonePreview(flip, { clientWidth: 844, clientHeight: 390 }, { videoWidth: 6, videoHeight: 4 }, false);
    expect(style.width).toBe("");
    expect(style.height).toBe("");
    expect(style.left).toBe("");
  });
});
