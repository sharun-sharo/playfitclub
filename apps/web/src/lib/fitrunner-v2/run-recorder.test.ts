import { describe, expect, it } from "vitest";
import { createRunRecorder } from "./run-recorder";

function recorder() {
  const events: Array<{ source: string; action?: string; movementType?: string }> = [];
  const run = createRunRecorder({
    onEvent: (event) => {
      events.push({ source: event.source, action: event.action, movementType: event.movementType });
    },
    onGrade: () => undefined,
  });
  return { run, events };
}

function press(
  run: ReturnType<typeof createRunRecorder>,
  action: "jump" | "roll" | "lane",
  direction: -1 | 1 | 0,
  source: "keyboard" | "camera" = "keyboard",
) {
  run.action({
    action,
    source,
    direction,
    speedMps: 6,
    distanceM: 12,
    threat: null,
    eventId: `${action}-${direction}-${source}`,
    clientTimestamp: 1,
  });
}

describe("accepted move counts", () => {
  it("counts a jump, a squat, and each lane step, including keyboard", () => {
    const { run, events } = recorder();
    press(run, "jump", 0, "keyboard");
    press(run, "roll", 0, "camera");
    press(run, "lane", -1, "keyboard");
    press(run, "lane", 1, "keyboard");
    press(run, "lane", 1, "camera");
    expect(run.stats()).toMatchObject({
      jumps: 1,
      squats: 1,
      laneLeft: 1,
      laneRight: 2,
      laneDodges: 0,
      tokens: 0,
      clearancePoints: 0,
    });
    expect(events.map((event) => event.source)).toEqual(["keyboard", "camera", "keyboard", "keyboard", "camera"]);
    expect(events[0]).toMatchObject({ action: "jump", movementType: "jump" });
    expect(events[2]).toMatchObject({ action: "lane", movementType: "lean_left" });
    expect(events[3]).toMatchObject({ action: "lane", movementType: "lean_right" });
  });
});
