import { CALORIE_CONFIG, estimateCalories } from "./calories";

/** Shown when a saved weight or the phone camera is missing. Not a kcal value. */
export const CALORIE_NEEDS_NOTE = "Calories need a saved weight and the phone camera.";

export type PlayCalorieInput = {
  weightKg: number | null | undefined;
  /** Camera time spent on recognized play: the running round, jumps, squats, and lane moves. */
  cameraActiveMs: number;
  keyboardOnly: boolean;
  /** Virtual course distance. It does not change kcal. */
  distanceM?: number;
};

export type PlayCalorieView = {
  kcal: number | null;
  text: string;
  note: string | null;
};

const unavailable: PlayCalorieView = { kcal: null, text: "—", note: CALORIE_NEEDS_NOTE };

/**
 * Time to add to the live calorie clock.
 * Only a phone-camera run whose course clock is moving counts. Keyboard play adds nothing.
 */
export function cameraActiveStep(input: { deltaMs: number; keyboardOnly: boolean; courseLive: boolean }): number {
  if (input.keyboardOnly || !input.courseLive) return 0;
  if (!Number.isFinite(input.deltaMs) || input.deltaMs <= 0) return 0;
  return input.deltaMs;
}

/**
 * Live score-card calories.
 * kcal = MET × 3.5 × kg / 200 × activeMinutes, with MET 3.5.
 * Active minutes are camera time only. Keyboard play, a missing weight, game speed,
 * virtual distance, and Nitro do not add kcal. Actions count only as that active time.
 */
export function playCalories(input: PlayCalorieInput): PlayCalorieView {
  if (input.keyboardOnly || input.weightKg === null || input.weightKg === undefined) return unavailable;
  const kcal = estimateCalories({ weightKg: input.weightKg, cameraActiveMs: input.cameraActiveMs });
  if (kcal === null) {
    const weightOk = input.weightKg >= CALORIE_CONFIG.minWeightKg && input.weightKg <= CALORIE_CONFIG.maxWeightKg;
    const idle = weightOk && (!Number.isFinite(input.cameraActiveMs) || input.cameraActiveMs <= 0);
    if (idle) return { kcal: 0, text: "0 kcal", note: null };
    return unavailable;
  }
  return { kcal, text: `${kcal} kcal`, note: null };
}
