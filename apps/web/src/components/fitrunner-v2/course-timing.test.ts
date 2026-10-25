import { COMMAND_STALE_MS, DEFAULT_THRESHOLDS } from "@fitplay/game";
import { AIRBORNE_S, LATENCY_BUDGET_S, LANE_SLIDE_S, STAND_RECOVERY_S } from "@fitplay/shared";
import { describe, expect, it } from "vitest";
import { AIRBORNE_SECONDS } from "./jump-arc";
import { fitRunnerTuning } from "./tuning";

describe("course timing stays locked to the live body", () => {
  it("uses the jump arc, the lane slide, the stand-up recovery, and the stale command window", () => {
    expect(AIRBORNE_S).toBeCloseTo(AIRBORNE_SECONDS, 8);
    expect(LANE_SLIDE_S).toBe(fitRunnerTuning.laneChangeDuration);
    expect(STAND_RECOVERY_S).toBe(DEFAULT_THRESHOLDS.recoverMs / 1000);
    expect(LATENCY_BUDGET_S.commandStale).toBe(COMMAND_STALE_MS / 1000);
    expect(fitRunnerTuning.forwardSpeed).toBe(6.15);
    expect(fitRunnerTuning.maxSpeed).toBe(8.2);
    expect(fitRunnerTuning.props.blocker).toMatchObject({ x: 2.2, y: 2.78, z: 1.18 });
  });
});
