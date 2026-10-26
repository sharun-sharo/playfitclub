import { describe, expect, it } from "vitest";
import { fitRunnerTuning } from "./tuning";
import {
  forwardTravel,
  noteLongFrame,
  notePhoneFrameGap,
  phoneFrameDiagLines,
  releaseLiveCommand,
  runnerFrameSlices,
  runnerUsesCatchUp,
} from "./runner-clock";

const speed = {
  forwardSpeed: fitRunnerTuning.forwardSpeed,
  speedGain: fitRunnerTuning.speedGain,
  maxSpeed: fitRunnerTuning.maxSpeed,
};

describe("television runner clock", () => {
  it("travels the same distance in one second at 10fps as at 60fps, and leaves the laptop step clamped", () => {
    const at60 = forwardTravel(Array.from({ length: 60 }, () => 1 / 60), true, speed);
    const at10 = forwardTravel(Array.from({ length: 10 }, () => 0.1), true, speed);
    expect(Math.abs(at10 - at60)).toBeLessThan(0.02);

    const laptop60 = forwardTravel(Array.from({ length: 60 }, () => 1 / 60), false, speed);
    expect(Math.abs(laptop60 - at60)).toBeLessThan(1e-9);
    expect(runnerFrameSlices(1 / 60, false)[0]).toBeCloseTo(1 / 60, 8);
    expect(runnerFrameSlices(1 / 60, true)[0]).toBeCloseTo(1 / 60, 8);

    const laptop10 = forwardTravel(Array.from({ length: 10 }, () => 0.1), false, speed);
    expect(runnerFrameSlices(0.1, false)).toEqual([0.05]);
    expect(laptop10).toBeLessThan(at60 * 0.6);

    const ten = runnerFrameSlices(0.1, true);
    expect(ten).toHaveLength(2);
    expect(ten[0]).toBeCloseTo(0.05, 6);
    expect(ten[1]).toBeCloseTo(0.05, 6);
    const stall = runnerFrameSlices(1, true);
    expect(stall.reduce((sum, step) => sum + step, 0)).toBeCloseTo(0.25, 6);
    expect(Math.max(...stall)).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it("spends a phone hitch in slices and still matches a steady 60fps laptop step", () => {
    const phone = runnerUsesCatchUp({ television: false, phone: true });
    const laptop = runnerUsesCatchUp({ television: false, phone: false });
    const television = runnerUsesCatchUp({ television: true, phone: false });
    expect(phone).toBe(true);
    expect(laptop).toBe(false);
    expect(television).toBe(true);

    const at60Phone = forwardTravel(Array.from({ length: 60 }, () => 1 / 60), phone, speed);
    const at60Laptop = forwardTravel(Array.from({ length: 60 }, () => 1 / 60), laptop, speed);
    expect(Math.abs(at60Phone - at60Laptop)).toBeLessThan(1e-9);
    expect(runnerFrameSlices(1 / 60, phone)[0]).toBeCloseTo(1 / 60, 8);

    expect(runnerFrameSlices(0.1, phone)).toEqual([0.05, 0.05]);
    expect(runnerFrameSlices(0.1, laptop)).toEqual([0.05]);
    const hitchPhone = forwardTravel([0.1], phone, speed);
    const hitchLaptop = forwardTravel([0.1], laptop, speed);
    expect(hitchPhone).toBeGreaterThan(hitchLaptop);

    const stall = runnerFrameSlices(1, phone);
    expect(stall.reduce((sum, step) => sum + step, 0)).toBeCloseTo(0.25, 6);
    expect(Math.max(...stall)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(runnerFrameSlices(0, phone)).toEqual([]);
    expect(runnerFrameSlices(Number.NaN, phone)).toEqual([]);
  });

  it("reports frame time and a long frame for the motion diag overlay", () => {
    expect(notePhoneFrameGap(0, 1_000)).toEqual({ frameMs: null, longFrame: false });
    expect(notePhoneFrameGap(Number.NaN, 1_000)).toEqual({ frameMs: null, longFrame: false });
    expect(notePhoneFrameGap(1_000, 990)).toEqual({ frameMs: null, longFrame: false });

    const steady = notePhoneFrameGap(1_000, 1_016.7);
    expect(steady.frameMs).toBeCloseTo(16.7, 5);
    expect(steady.longFrame).toBe(false);
    expect(notePhoneFrameGap(1_000, 1_049.9).longFrame).toBe(false);
    expect(notePhoneFrameGap(1_000, 1_050)).toEqual({ frameMs: 50, longFrame: true });

    expect(phoneFrameDiagLines({ frameMs: null, longFrame: false })).toEqual(["frame —", "long frame no"]);
    expect(phoneFrameDiagLines({ frameMs: 72.4, longFrame: true })).toEqual(["frame 72.4 ms", "long frame yes"]);
    expect(phoneFrameDiagLines({ frameMs: 12, longFrame: false }).join(" ")).not.toMatch(/token|email|session|player name/i);
  });

  it("keeps a television command that waited through a long frame and still drops that command on a laptop", () => {
    const held = { value: { id: "jump-during-hitch" }, receivedAt: 1_000 };
    const now = 1_900;
    const debt = noteLongFrame(0, 900);
    expect(debt).toBe(900);

    const played = releaseLiveCommand(held, now, 800, true, true, debt);
    expect(played.dropped).toBeNull();
    expect(played.apply).toEqual(held.value);

    const waiting = releaseLiveCommand(held, now, 800, false, true, debt);
    expect(waiting.dropped).toBeNull();
    expect(waiting.apply).toBeNull();
    expect(waiting.held).toBe(held);

    const laptop = releaseLiveCommand(held, now, 800, true, false, debt);
    expect(laptop.dropped).toBe("stale");
    expect(laptop.apply).toBeNull();

    const noHitch = releaseLiveCommand(held, now, 800, true, true, noteLongFrame(0, 16));
    expect(noHitch.dropped).toBe("stale");

    const expired = releaseLiveCommand(held, 1_000 + 5_000, 800, true, true, debt);
    expect(expired.dropped).toBe("stale");
    expect(expired.apply).toBeNull();
    expect(releaseLiveCommand(null, now, 800, true, true, debt).apply).toBeNull();
  });
});
