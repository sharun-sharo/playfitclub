import { describe, expect, it } from "vitest";
import { applyObstacleHit, beginRun, emptyRun, HIT_INVULNERABILITY_MS, RUN_LIVES } from "./run-lives";

describe("fitrunner lives", () => {
  it("spends one life per hit and ends on the fifth", () => {
    let run = beginRun(emptyRun()).run;
    expect(run.lives).toBe(RUN_LIVES);
    const expected = [4, 3, 2, 1, 0];
    for (let index = 0; index < expected.length; index += 1) {
      const decision = applyObstacleHit(run, `hurdle-${index}`, index * HIT_INVULNERABILITY_MS, HIT_INVULNERABILITY_MS);
      expect(decision.accepted).toBe(true);
      if (!decision.accepted) return;
      expect(decision.run.lives).toBe(expected[index]);
      expect(decision.run.hits).toBe(index + 1);
      expect(decision.gameOver).toBe(index === 4);
      run = decision.run;
    }
    expect(run.over).toBe(true);

    const sixth = applyObstacleHit(run, "hurdle-5", 5 * HIT_INVULNERABILITY_MS, HIT_INVULNERABILITY_MS);
    expect(sixth.accepted).toBe(false);
    if (sixth.accepted) return;
    expect(sixth.code).toBe("GAME_OVER");
    expect(sixth.run.lives).toBe(0);
    expect(sixth.run.hits).toBe(5);
    expect(sixth.run.obstacleIds).toHaveLength(5);
  });

  it("counts one obstacle id once", () => {
    let run = beginRun(emptyRun()).run;
    const first = applyObstacleHit(run, "same-log", 0, HIT_INVULNERABILITY_MS);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const again = applyObstacleHit(first.run, "same-log", HIT_INVULNERABILITY_MS, HIT_INVULNERABILITY_MS);
    expect(again.accepted).toBe(false);
    if (again.accepted) return;
    expect(again.code).toBe("DUPLICATE_HIT");
    expect(again.run.lives).toBe(4);
    expect(again.run.hits).toBe(1);
  });

  it("ignores a second obstacle during invulnerability", () => {
    let run = beginRun(emptyRun()).run;
    const first = applyObstacleHit(run, "log-a", 1_000, HIT_INVULNERABILITY_MS);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const clipped = applyObstacleHit(first.run, "log-b", 1_000 + HIT_INVULNERABILITY_MS - 1, HIT_INVULNERABILITY_MS);
    expect(clipped.accepted).toBe(false);
    if (clipped.accepted) return;
    expect(clipped.code).toBe("INVULNERABLE");
    expect(clipped.run.hits).toBe(1);
    expect(clipped.run.lives).toBe(4);
  });

  it("resets a new run to 5 and keeps an in-progress run", () => {
    const started = beginRun(emptyRun());
    expect(started.resumed).toBe(false);
    expect(started.run.lives).toBe(5);
    const hit = applyObstacleHit(started.run, "rock-1", 0, 0);
    expect(hit.accepted).toBe(true);
    if (!hit.accepted) return;
    const resumed = beginRun(hit.run);
    expect(resumed.resumed).toBe(true);
    expect(resumed.run.lives).toBe(4);
    expect(resumed.run.hits).toBe(1);
    const ended = applyObstacleHit(hit.run, "rock-2", 0, 0);
    expect(ended.accepted).toBe(true);
    if (!ended.accepted) return;
    let run = ended.run;
    for (let index = 0; index < 3; index += 1) {
      const next = applyObstacleHit(run, `rock-more-${index}`, index + 1, 0);
      expect(next.accepted).toBe(true);
      if (!next.accepted) return;
      run = next.run;
    }
    expect(run.lives).toBe(0);
    const again = beginRun(run);
    expect(again.resumed).toBe(false);
    expect(again.run.lives).toBe(5);
    expect(again.run.hits).toBe(0);
    expect(again.run.over).toBe(false);
    expect(again.run.obstacleIds).toEqual([]);
  });
});
