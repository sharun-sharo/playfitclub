import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayScoreCard } from "../../components/fitrunner-v2/play-score-card";
import { CALORIE_CONFIG } from "./calories";
import { CALORIE_NEEDS_NOTE, cameraActiveStep, playCalories } from "./play-calories";

describe("play calories", () => {
  it("is unavailable when weight is missing", () => {
    const view = playCalories({ weightKg: null, cameraActiveMs: 10 * 60_000, keyboardOnly: false, distanceM: 830 });
    expect(view.kcal).toBeNull();
    expect(view.text).toBe("—");
    expect(view.note).toBe(CALORIE_NEEDS_NOTE);
  });

  it("is unavailable for keyboard-only play", () => {
    const view = playCalories({ weightKg: 70, cameraActiveMs: 10 * 60_000, keyboardOnly: true, distanceM: 5000 });
    expect(view.kcal).toBeNull();
    expect(view.text).toBe("—");
    expect(view.note).toBe(CALORIE_NEEDS_NOTE);
  });

  it("uses the MET formula for 10 active minutes at 70 kg", () => {
    const minutes = 10;
    const raw = (CALORIE_CONFIG.met * 3.5 * 70) / 200 * minutes;
    const view = playCalories({ weightKg: 70, cameraActiveMs: minutes * 60_000, keyboardOnly: false });
    expect(raw).toBeCloseTo(42.875);
    expect(view.kcal).toBe(Math.round(raw));
    expect(view.kcal).toBe(43);
    expect(view.text).toBe("43 kcal");
    expect(view.note).toBeNull();
  });

  it("changes kcal as camera-active minutes increase", () => {
    const minuteFraction = 110 / 60;
    const earlyRaw = (CALORIE_CONFIG.met * 3.5 * 70) / 200 * minuteFraction;
    const earlyMs = cameraActiveStep({ deltaMs: 110_000, keyboardOnly: false, courseLive: true });
    const early = playCalories({ weightKg: 70, cameraActiveMs: earlyMs, keyboardOnly: false, distanceM: 828 });
    const later = playCalories({ weightKg: 70, cameraActiveMs: 10 * 60_000, keyboardOnly: false, distanceM: 828 });
    expect(earlyRaw).toBeCloseTo(7.8604167, 5);
    expect(early.kcal).toBe(Math.round(earlyRaw));
    expect(early.kcal).toBe(8);
    expect(early.text).toBe("8 kcal");
    expect(early.note).toBeNull();
    expect(later.kcal).toBe(43);
    expect(later.kcal).toBeGreaterThan(early.kcal ?? 0);
    expect(cameraActiveStep({ deltaMs: 110_000, keyboardOnly: true, courseLive: true })).toBe(0);
    expect(cameraActiveStep({ deltaMs: 110_000, keyboardOnly: false, courseLive: false })).toBe(0);
  });

  it("does not change kcal when virtual distance changes", () => {
    const near = playCalories({ weightKg: 70, cameraActiveMs: 10 * 60_000, keyboardOnly: false, distanceM: 0 });
    const far = playCalories({ weightKg: 70, cameraActiveMs: 10 * 60_000, keyboardOnly: false, distanceM: 9000 });
    expect(far.kcal).toBe(near.kcal);
    expect(far.kcal).toBe(43);
    expect(far.text).toBe(near.text);
  });
});

describe("play score card", () => {
  function markup(props: { calories: string; note: string | null; keyboard: boolean }) {
    return renderToStaticMarkup(
      createElement(PlayScoreCard, {
        hidden: false,
        scoreRef: null,
        distanceRef: null,
        timeRef: null,
        calories: props.calories,
        note: props.note,
        keyboard: props.keyboard,
      }),
    );
  }

  it("lists score, distance, time, and calories burned", () => {
    const html = markup({ calories: "—", note: CALORIE_NEEDS_NOTE, keyboard: false });
    expect(html).toContain("SCORE");
    expect(html).toContain("Distance");
    expect(html).toContain("Time");
    expect(html).toContain("Calories burned");
    expect(html).toContain(">—<");
    expect(html).toContain(CALORIE_NEEDS_NOTE);
    expect(html).not.toContain("Demo");
    expect(html).not.toContain("Tokens");
    expect(html).not.toContain("Combo");
    expect(html).not.toContain("A D lanes");
    expect(html).not.toContain("data-keyboard-hint");
  });

  it("labels the keyboard hint only while the keyboard player is in use", () => {
    const html = markup({ calories: "43 kcal", note: null, keyboard: true });
    expect(html).toContain("Keyboard · A D lanes · Space jump · S roll");
    expect(html).toContain("43 kcal");
    expect(html).not.toContain(CALORIE_NEEDS_NOTE);
    expect(html).not.toContain("Demo");
    expect(html).not.toContain("Tokens");
    expect(html).not.toContain("Combo");
  });
});
