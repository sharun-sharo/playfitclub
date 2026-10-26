import { DEFAULT_THRESHOLDS } from "@fitplay/game";
import { describe, expect, it } from "vitest";
import { fitRunnerPixelRatio } from "./tv-graphics";
import {
  confirmedLocalGesture,
  dispatchLocalGesture,
  KEYBOARD_GAME_ACTIONS,
  phoneCameraFailure,
  phonePixelRatio,
  PHONE_PIXEL_RATIO_CAP,
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
});
