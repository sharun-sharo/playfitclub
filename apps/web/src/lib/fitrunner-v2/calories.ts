/** Mixed in-place movement. Not derived from game speed or virtual distance. */
export const CALORIE_CONFIG = {
  met: 3.5,
  minWeightKg: 30,
  maxWeightKg: 250,
} as const;

export const CALORIE_LABEL =
  "Approximate energy expenditure based on your weight, active workout duration and estimated activity intensity. Not a medical measurement.";

/**
 * kcal = MET * 3.5 * kg / 200 * activeMinutes.
 * Returns null when weight is missing or there are no camera-active minutes.
 */
export function estimateCalories(input: { weightKg: number | null | undefined; cameraActiveMs: number; met?: number }): number | null {
  const weight = input.weightKg;
  if (weight === null || weight === undefined || !Number.isFinite(weight)) return null;
  if (weight < CALORIE_CONFIG.minWeightKg || weight > CALORIE_CONFIG.maxWeightKg) return null;
  if (!Number.isFinite(input.cameraActiveMs) || input.cameraActiveMs <= 0) return null;
  const minutes = input.cameraActiveMs / 60_000;
  const met = input.met ?? CALORIE_CONFIG.met;
  return Math.round((met * 3.5 * weight) / 200 * minutes);
}

export function parseWeightKg(value: unknown): number | null | undefined {
  if (value === null || value === "") return null;
  if (value === undefined) return undefined;
  const weight = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(weight) || weight < CALORIE_CONFIG.minWeightKg || weight > CALORIE_CONFIG.maxWeightKg) return undefined;
  return Math.round(weight * 10) / 10;
}
