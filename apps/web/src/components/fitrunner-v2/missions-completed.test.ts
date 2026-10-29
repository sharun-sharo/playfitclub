import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missionsCompletedThisRun } from "./missions-completed";

const board = [
  { id: "dodge", title: "Dodge Master", progress: 4, target: 15 },
  { id: "triple", title: "Triple Victory", progress: 0, target: 3 },
  { id: "clean", title: "Untouchable", progress: 0, target: 2 },
  { id: "warm", title: "Warm-Up Warrior", progress: 1, target: 3 },
];

describe("missions completed this run", () => {
  it("lists only missions that reached their target during the run", () => {
    const done = missionsCompletedThisRun(board, [
      { id: "dodge", title: "Dodge Master", progress: 15, target: 15 },
      { id: "triple", title: "Triple Victory", progress: 1, target: 3 },
      { id: "clean", title: "Untouchable", progress: 2, target: 2 },
      { id: "warm", title: "Warm-Up Warrior", progress: 1, target: 3 },
    ]);
    expect(done.map((mission) => mission.title)).toEqual(["Dodge Master", "Untouchable"]);
  });

  it("does not treat missions that were already complete as completed again", () => {
    const done = missionsCompletedThisRun(
      [{ id: "dodge", title: "Dodge Master", progress: 15, target: 15 }],
      [{ id: "dodge", title: "Dodge Master", progress: 20, target: 15 }],
    );
    expect(done).toEqual([]);
  });

  it("does not invent a completion for a mission missing from the start of the run", () => {
    const done = missionsCompletedThisRun([], [{ id: "dodge", title: "Dodge Master", progress: 15, target: 15 }]);
    expect(done).toEqual([]);
  });
});

describe("daily missions visibility", () => {
  it("keeps the missions panel off the laptop run and names completions on game over", () => {
    const laptop = readFileSync(new URL("./fitrunner-v2.tsx", import.meta.url), "utf8");
    const phone = readFileSync(new URL("./phone-fit-run.tsx", import.meta.url), "utf8");
    expect(laptop).not.toContain("<MissionPanel");
    expect(laptop).not.toContain("<MissionToast");
    expect(laptop).toContain("completedMissions={sync.completedThisRun ?? []}");
    expect(phone).not.toContain("MissionPanel");
    expect(phone).not.toContain("DAILY MISSIONS");
  });
});
