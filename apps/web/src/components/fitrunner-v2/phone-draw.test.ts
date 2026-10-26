import { describe, expect, it } from "vitest";
import { fitRunnerDrawingBuffer } from "./tv-graphics";
import {
  createPhoneDrawHysteresis,
  phoneAnisotropy,
  phoneDrawingBuffer,
  phoneDrawingPixelRatio,
  PHONE_DOWNGRADE_FRAMES,
  PHONE_DRAW_LONG_EDGE,
  PHONE_GOOD_FRAME_MS,
  PHONE_SLOW_FRAME_MS,
  PHONE_UPGRADE_FRAMES,
  selectPhoneDrawPreset,
  stepPhoneDrawHysteresis,
} from "./phone-draw";

describe("phone draw presets", () => {
  it("keeps the television 960×540 cap off the phone buffer", () => {
    const television = fitRunnerDrawingBuffer(1920, 1080, 3, true);
    expect(television.width).toBeLessThanOrEqual(960);
    expect(television.height).toBeLessThanOrEqual(540);
    expect(television.pixelRatio).toBe(1);

    const phone = phoneDrawingBuffer({
      devicePixelRatio: 3,
      cssWidth: 844,
      cssHeight: 390,
      preset: "balanced",
    });
    expect(Math.max(phone.width, phone.height)).toBeGreaterThan(960);
    expect(Math.max(phone.width, phone.height)).toBeLessThanOrEqual(PHONE_DRAW_LONG_EDGE.balanced);
    expect(phone.pixelRatio).toBeLessThanOrEqual(1.5);
  });

  it("lets a capable phone use DPR 2 inside a 1920 long edge and keeps a weak phone lower", () => {
    expect(selectPhoneDrawPreset({ screenWidth: 390, screenHeight: 844, deviceMemoryGb: null, hardwareConcurrency: 6 })).toBe("high");
    expect(selectPhoneDrawPreset({ screenWidth: 390, screenHeight: 844, deviceMemoryGb: 4, hardwareConcurrency: 4 })).toBe("balanced");
    expect(selectPhoneDrawPreset({ screenWidth: 1080, screenHeight: 2400, deviceMemoryGb: 2, hardwareConcurrency: 8 })).toBe("low");
    expect(selectPhoneDrawPreset({ screenWidth: 360, screenHeight: 640, deviceMemoryGb: 8, hardwareConcurrency: 8 })).toBe("low");

    const sharp = phoneDrawingBuffer({ devicePixelRatio: 3, cssWidth: 932, cssHeight: 430, preset: "high" });
    expect(sharp.pixelRatio).toBe(2);
    expect(Math.max(sharp.width, sharp.height)).toBe(1864);
    expect(Math.max(sharp.width, sharp.height)).toBeLessThanOrEqual(1920);
    expect(Math.max(sharp.width, sharp.height)).toBeGreaterThan(960);

    const wide = phoneDrawingPixelRatio({ devicePixelRatio: 3, cssWidth: 2000, cssHeight: 1000, preset: "high" });
    expect(wide).toBeLessThanOrEqual(1920 / 2000);
    expect(Math.floor(2000 * wide)).toBeLessThanOrEqual(1920);
    expect(Math.floor(2000 * wide)).toBeLessThan(3840);

    const weak = phoneDrawingBuffer({ devicePixelRatio: 3, cssWidth: 640, cssHeight: 360, preset: "low" });
    expect(weak.pixelRatio).toBe(1);
    expect(Math.max(weak.width, weak.height)).toBe(640);
  });

  it("steps quality down only after a sustained slow run and never past the device ceiling", () => {
    let state = createPhoneDrawHysteresis("high");
    for (let frame = 0; frame < PHONE_DOWNGRADE_FRAMES - 1; frame += 1) {
      state = stepPhoneDrawHysteresis(state, PHONE_SLOW_FRAME_MS);
    }
    expect(state.preset).toBe("high");
    state = stepPhoneDrawHysteresis(state, PHONE_SLOW_FRAME_MS);
    expect(state.preset).toBe("balanced");

    let flicker = createPhoneDrawHysteresis("high");
    for (let frame = 0; frame < PHONE_DOWNGRADE_FRAMES; frame += 1) {
      flicker = stepPhoneDrawHysteresis(flicker, frame % 2 === 0 ? PHONE_SLOW_FRAME_MS : PHONE_GOOD_FRAME_MS);
    }
    expect(flicker.preset).toBe("high");

    let weak = createPhoneDrawHysteresis("low");
    for (let frame = 0; frame < PHONE_UPGRADE_FRAMES; frame += 1) {
      weak = stepPhoneDrawHysteresis(weak, PHONE_GOOD_FRAME_MS);
    }
    expect(weak.preset).toBe("low");

    let recovered = createPhoneDrawHysteresis("high");
    recovered = { ...recovered, preset: "balanced" };
    for (let frame = 0; frame < PHONE_UPGRADE_FRAMES - 1; frame += 1) {
      recovered = stepPhoneDrawHysteresis(recovered, PHONE_GOOD_FRAME_MS);
    }
    expect(recovered.preset).toBe("balanced");
    recovered = stepPhoneDrawHysteresis(recovered, PHONE_GOOD_FRAME_MS);
    expect(recovered.preset).toBe("high");
    recovered = stepPhoneDrawHysteresis(recovered, 33);
    expect(recovered.preset).toBe("high");
    recovered = stepPhoneDrawHysteresis(recovered, 500);
    expect(recovered.badFrames).toBe(0);
    expect(recovered.preset).toBe("high");
  });

  it("uses the GPU anisotropy limit and stays at 1 when the GPU has none", () => {
    expect(phoneAnisotropy("high", 16)).toBe(8);
    expect(phoneAnisotropy("balanced", 16)).toBe(4);
    expect(phoneAnisotropy("low", 16)).toBe(1);
    expect(phoneAnisotropy("high", 1)).toBe(1);
    expect(phoneAnisotropy("high", Number.NaN)).toBe(1);
  });
});
