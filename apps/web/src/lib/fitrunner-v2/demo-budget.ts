/** Active seconds already used from the free demo. A lost run only adds its own active time. */
export function spendActiveDemo(spentSeconds: number, runActiveSeconds: number) {
  if (!Number.isFinite(runActiveSeconds) || runActiveSeconds <= 0) return spentSeconds;
  return spentSeconds + runActiveSeconds;
}

/** Null means the account is not on the demo clock. Zero means the demo is used up. */
export function remainingDemoSeconds(limitSeconds: number | null, spentSeconds: number) {
  if (limitSeconds === null) return null;
  return Math.max(0, limitSeconds - Math.max(0, spentSeconds));
}
