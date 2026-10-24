import { describe, expect, it } from "vitest";
import { remainingDemoSeconds, spendActiveDemo } from "./demo-budget";

describe("demo budget", () => {
  it("keeps the remaining demo when a run ends on zero lives", () => {
    const limit = 10 * 60;
    let spent = 0;
    spent = spendActiveDemo(spent, 125);
    const afterLoss = remainingDemoSeconds(limit, spent);
    expect(afterLoss).toBe(limit - 125);
    const nextRun = remainingDemoSeconds(limit, spent);
    expect(nextRun).toBe(475);
    expect(nextRun).toBe(afterLoss);
    spent = spendActiveDemo(spent, 10);
    expect(remainingDemoSeconds(limit, spent)).toBe(465);
    expect(spendActiveDemo(spent, 0)).toBe(spent);
  });

  it("leaves an open account unlimited", () => {
    expect(remainingDemoSeconds(null, 400)).toBeNull();
  });
});
