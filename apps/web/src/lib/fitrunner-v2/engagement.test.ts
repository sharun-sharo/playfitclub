import { describe, expect, it } from "vitest";
import { estimateCalories } from "./calories";
import { warningHorizonS } from "@fitplay/shared";
import { clearanceAward, clearanceWindowsMs, ComboChain, composeScore } from "./combo";
import {
  assignmentsForDay,
  emptyDayFacts,
  isRetiredMission,
  kolkataDayKey,
  MISSION_TEMPLATES,
  missionProgress,
  pickMissionTemplates,
  progressForBoard,
  TRIPLE_VICTORY,
} from "./missions";
import {
  aggregateDay,
  claimInLedger,
  clientResultField,
  dedupeEvents,
  grantOnce,
  historyForViewer,
  parseEventBatch,
  summarizeWorkout,
  type MemoryLedger,
  type WorkoutEventDraft,
} from "./workout";

describe("FitRunner V2 engagement", () => {
  it("keeps the same three missions across a Kolkata day and changes the day at midnight", () => {
    const beforeMidnight = new Date("2026-10-22T18:29:59.000Z");
    const afterMidnight = new Date("2026-10-22T18:30:00.000Z");
    const before = kolkataDayKey(beforeMidnight);
    const after = kolkataDayKey(afterMidnight);
    expect(before).toBe("2026-10-22");
    expect(after).toBe("2026-10-23");

    const first = pickMissionTemplates("player-7", before).map((template) => template.key);
    const second = pickMissionTemplates("player-7", before).map((template) => template.key);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(3);

    const nextDay = pickMissionTemplates("player-7", after).map((template) => template.key);
    expect(pickMissionTemplates("player-7", after).map((template) => template.key)).toEqual(nextDay);
    expect(new Set(nextDay).size).toBe(3);
  });

  it("ignores a duplicate event id", () => {
    const incoming: WorkoutEventDraft[] = [
      { eventId: "event-aaaa", kind: "token", source: "keyboard", clientTimestamp: 1, distanceM: 6 },
      { eventId: "event-bbbb", kind: "token", source: "keyboard", clientTimestamp: 2, distanceM: 8 },
    ];
    const deduped = dedupeEvents(["event-aaaa"], incoming);
    expect(deduped.ignored).toEqual(["event-aaaa"]);
    expect(deduped.accepted.map((event) => event.eventId)).toEqual(["event-bbbb"]);

    const scored = summarizeWorkout({
      events: [incoming[0] as WorkoutEventDraft, { ...(incoming[0] as WorkoutEventDraft) }],
      activeMs: 5_000,
      weightKg: null,
    });
    expect(scored.tokens).toBe(1);
    expect(scored.score).toBe(Math.floor(6) + 25);
  });

  it("grants mission XP once when a claim is submitted twice", () => {
    const ledger: MemoryLedger = {
      missions: [{ id: "mission-1", userId: "user-1", progress: 30, target: 30, xp: 50, claimedAt: null }],
      entries: new Map(),
      totals: new Map(),
    };
    expect(claimInLedger(ledger, "user-1", "mission-1")).toMatchObject({ xpGranted: 50, total: 50 });
    expect(claimInLedger(ledger, "user-1", "mission-1")).toMatchObject({ xpGranted: 0, total: 50, code: "already" });
    expect(grantOnce(ledger, "user-1", "mission-1", 50)).toBe(0);
    expect(ledger.totals.get("user-1")).toBe(50);
  });

  it("resets the combo chain on a hit and ignores a confidence dip", () => {
    const chain = new ComboChain();
    chain.arm({ obstacleId: "log-a", action: "jump", expected: "jump", source: "keyboard", speedMps: 6.15, distanceToObstacleM: 1.23 });
    chain.resolve({ obstacleId: "log-a", kind: "log", outcome: "clear", threatened: true });
    expect(chain.chain).toBe(1);
    expect(chain.ignoreConfidenceDip()).toBe(1);
    chain.arm({ obstacleId: "log-b", action: "jump", expected: "jump", source: "camera", speedMps: 6.15, distanceToObstacleM: 1.23 });
    chain.resolve({ obstacleId: "log-b", kind: "log", outcome: "hit", threatened: true });
    expect(chain.chain).toBe(0);
    expect(chain.bestChain).toBe(1);
    expect(chain.cameraChain).toBe(0);
  });

  it("documents clearance windows at 6.15 m/s and applies the combo bonus once", () => {
    const windows = clearanceWindowsMs(6.15);
    expect(windows.perfect).toEqual({ min: 113, max: 442 });
    expect(windows.great).toEqual({ min: 26, max: 642 });
    expect(windows.good.min).toBe(0);
    expect(windows.good.max).toBe(Math.round(warningHorizonS(6.15) * 1000));
    expect(windows.good.max).toBeGreaterThanOrEqual(3000);

    const award = clearanceAward("PERFECT", 2, true);
    expect(award).toEqual({ base: 10, bonus: 30 });
    const score = composeScore({ distanceM: 40, tokens: 1, awards: [award] });
    expect(score).toBe(40 + 25 + 10 + 30);
    expect(composeScore({ distanceM: 40, tokens: 1, awards: [award] })).toBe(score);

    const clear: WorkoutEventDraft = {
      eventId: "resolve-once-01",
      kind: "resolve",
      source: "keyboard",
      clientTimestamp: 1,
      speedMps: 6.15,
      distanceM: 20,
      distanceToObstacleM: 1.23,
      obstacleKind: "log",
      action: "jump",
      outcome: "clear",
    };
    const summary = summarizeWorkout({ events: [clear, { ...clear }], activeMs: 10_000, weightKg: 70 });
    expect(summary.perfects).toBe(1);
    expect(summary.score).toBe(20 + 10 + 15);
    expect(summary.calories).toBeNull();
  });

  it("uses the MET formula and withholds calories without weight or camera time", () => {
    expect(estimateCalories({ weightKg: 70, cameraActiveMs: 120_000 })).toBe(9);
    expect(estimateCalories({ weightKg: null, cameraActiveMs: 120_000 })).toBeNull();
    expect(estimateCalories({ weightKg: undefined, cameraActiveMs: 120_000 })).toBeNull();
    expect(estimateCalories({ weightKg: 70, cameraActiveMs: 0 })).toBeNull();
  });

  it("stores a keyboard session with null calories and no fitness credit", () => {
    const summary = summarizeWorkout({
      events: [
        { eventId: "keyboard-jump", kind: "movement", source: "keyboard", movementType: "jump", action: "jump", clientTimestamp: 1, distanceM: 30 },
        { eventId: "keyboard-token", kind: "token", source: "keyboard", clientTimestamp: 2, distanceM: 36 },
      ],
      activeMs: 120_000,
      weightKg: 80,
    });
    expect(summary.calories).toBeNull();
    expect(summary.cameraActiveMs).toBe(0);
    expect(summary.eligible).toBe(false);
    expect(summary.xp).toBe(0);
    expect(summary.jumps).toBe(1);
    expect(summary.cameraJumps).toBe(0);
  });

  it("shows history only to the signed-in owner", () => {
    const rows = [
      { userId: "ada", id: "run-ada" },
      { userId: "bea", id: "run-bea" },
    ];
    expect(historyForViewer(null, rows)).toEqual({ status: 401, rows: [] });
    expect(historyForViewer("ada", rows).status).toBe(200);
    expect(historyForViewer("ada", rows).rows.map((row) => row.id)).toEqual(["run-ada"]);
  });

  it("matches the recommended daily mission catalog", () => {
    expect(MISSION_TEMPLATES.map((template) => [template.title, template.target, template.xp])).toEqual([
      ["Warm-Up Warrior", 3, 100],
      ["Dodge Master", 15, 120],
      ["Jump Champion", 10, 100],
      ["Squat Hero", 12, 120],
      ["Untouchable", 2, 180],
      ["Perfect Moves", 8, 150],
      ["Token Hunter", 30, 100],
      ["Combo King", 5, 150],
      ["Finish Strong", 5, 120],
      ["Fitness Explorer", 5, 200],
    ]);
    expect(TRIPLE_VICTORY).toMatchObject({ title: "Triple Victory", target: 3, xp: 250 });
    const drawn: string[] = pickMissionTemplates("player-7", "2026-10-23").map((template) => template.key);
    expect(drawn.includes(TRIPLE_VICTORY.key)).toBe(false);
  });

  it("does not reshuffle a board that was already saved for the Kolkata day", () => {
    const day = "2026-10-23";
    const saved = ["tokens_30", "jumps_10", "combo_5"];
    expect(assignmentsForDay(saved, "player-7", day)).toEqual([]);
    expect(assignmentsForDay(saved, "player-7", day)).toEqual([]);

    const fresh = assignmentsForDay([], "player-7", day);
    expect(fresh.map((template) => template.key)).toEqual(assignmentsForDay([], "player-7", day).map((template) => template.key));
    expect(fresh.filter((template) => template.key !== TRIPLE_VICTORY.key)).toHaveLength(3);
    expect(fresh.some((template) => template.key === TRIPLE_VICTORY.key)).toBe(true);
    expect(assignmentsForDay(fresh.map((template) => template.key), "player-7", day)).toEqual([]);
  });

  it("keeps older template ids on the closest catalog metric", () => {
    const facts = emptyDayFacts();
    facts.cameraJumps = 4;
    facts.cameraLaneDodges = 6;
    facts.cameraActiveMs = 2 * 60_000;
    facts.longestCameraActiveMs = 2 * 60_000;
    facts.cameraCleanMs = 2 * 60_000;
    facts.cameraBestCombo = 5;
    facts.cameraTokens = 10;
    facts.cameraSquatClears = 3;
    facts.cameraSquats = 7;
    facts.cameraPerfects = 8;
    facts.eligibleWorkouts = 1;
    expect(missionProgress("jumps_10", facts)).toBe(4);
    expect(missionProgress("jump_champion", facts)).toBe(4);
    expect(missionProgress("dodges_15", facts)).toBe(6);
    expect(missionProgress("dodge_master", facts)).toBe(6);
    expect(missionProgress("camera_minutes_5", facts)).toBe(2);
    expect(missionProgress("warmup_warrior", facts)).toBe(2);
    expect(missionProgress("clean_minutes_3", facts)).toBe(2);
    expect(missionProgress("untouchable", facts)).toBe(2);
    expect(missionProgress("combo_5", facts)).toBe(5);
    expect(missionProgress("combo_king", facts)).toBe(5);
    expect(missionProgress("tokens_30", facts)).toBe(10);
    expect(missionProgress("tokens_50", facts)).toBe(10);
    expect(missionProgress("token_hunter", facts)).toBe(10);
    expect(missionProgress("squat_clears_10", facts)).toBe(3);
    expect(missionProgress("squat_hero", facts)).toBe(7);
    expect(missionProgress("workouts_2", facts)).toBe(1);
    expect(missionProgress("finish_strong", facts)).toBe(2);
    expect(missionProgress("perfect_moves", facts)).toBe(8);
  });

  it("keeps the other saved missions when a retired template is still on today's board", () => {
    const saved = ["jump_champion", "nitro_charger", "token_hunter"];
    expect(assignmentsForDay(saved, "player-7", "2026-10-23")).toEqual([]);
    expect(MISSION_TEMPLATES).toHaveLength(10);
    expect(isRetiredMission("nitro_charger")).toBe(true);
    const facts = emptyDayFacts();
    facts.cameraJumps = 10;
    facts.cameraTokens = 30;
    const rows = [
      { templateKey: "jump_champion", target: 10 },
      { templateKey: "nitro_charger", target: 3 },
      { templateKey: "token_hunter", target: 30 },
      { templateKey: TRIPLE_VICTORY.key, target: TRIPLE_VICTORY.target },
    ];
    const progress = progressForBoard(rows, facts);
    expect(missionProgress("nitro_charger", facts)).toBe(0);
    expect(progress[0]).toBe(10);
    expect(progress[1]).toBe(0);
    expect(progress[2]).toBe(30);
    expect(progress[3]).toBe(2);
  });

  it("ignores keyboard play for mission progress, fitness XP, and calories", () => {
    const summary = summarizeWorkout({
      events: [
        { eventId: "keyboard-jump", kind: "movement", source: "keyboard", movementType: "jump", action: "jump", clientTimestamp: 1, distanceM: 30 },
        { eventId: "keyboard-squat", kind: "movement", source: "keyboard", movementType: "squat", action: "roll", clientTimestamp: 2, distanceM: 32 },
        { eventId: "keyboard-token", kind: "token", source: "keyboard", clientTimestamp: 3, distanceM: 36 },
        {
          eventId: "keyboard-clear",
          kind: "resolve",
          source: "keyboard",
          clientTimestamp: 5,
          speedMps: 6.15,
          distanceM: 40,
          distanceToObstacleM: 1.23,
          obstacleKind: "rock",
          action: "lane",
          outcome: "clear",
        },
      ],
      activeMs: 120_000,
      weightKg: 80,
    });
    expect(summary.calories).toBeNull();
    expect(summary.xp).toBe(0);
    expect(summary.cameraJumps).toBe(0);
    expect(summary.cameraSquats).toBe(0);
    expect(summary.cameraTokens).toBe(0);
    expect(summary.cameraLaneDodges).toBe(0);
    expect(summary.cameraPerfects).toBe(0);
    const facts = aggregateDay([summary]);
    for (const template of MISSION_TEMPLATES) expect(missionProgress(template.key, facts)).toBe(0);
  });

  it("completes Triple Victory only after all three daily missions", () => {
    const rows = [
      { templateKey: "jump_champion", target: 10 },
      { templateKey: "squat_hero", target: 12 },
      { templateKey: "token_hunter", target: 30 },
      { templateKey: TRIPLE_VICTORY.key, target: TRIPLE_VICTORY.target },
    ];
    const facts = emptyDayFacts();
    facts.cameraJumps = 10;
    facts.cameraSquats = 12;
    facts.cameraTokens = 29;
    expect(progressForBoard(rows, facts)[3]).toBe(2);
    facts.cameraTokens = 30;
    expect(progressForBoard(rows, facts)[3]).toBe(TRIPLE_VICTORY.target);

    const triple = { id: "triple", userId: "user-1", progress: 2, target: 3, xp: 250, claimedAt: null };
    const ledger: MemoryLedger = { missions: [triple], entries: new Map(), totals: new Map() };
    expect(claimInLedger(ledger, "user-1", "triple").xpGranted).toBe(0);
    triple.progress = 3;
    expect(claimInLedger(ledger, "user-1", "triple")).toMatchObject({ xpGranted: 250, total: 250 });
    expect(claimInLedger(ledger, "user-1", "triple")).toMatchObject({ xpGranted: 0, total: 250, code: "already" });
  });

  it("rejects a client-posted score", () => {
    expect(clientResultField({ action: "complete", score: 9 })).toBe("score");
    expect(clientResultField({ bonusScore: 50 })).toBe("bonusScore");
    expect(parseEventBatch({ score: 3, events: [] }).ok).toBe(false);
  });

  it("separates a 5-minute workout from summed camera minutes and counts detected squats", () => {
    const move = (id: string, pose: "jump" | "squat"): WorkoutEventDraft => ({
      eventId: id,
      kind: "movement",
      source: "camera",
      movementType: pose,
      confidence: 0.95,
      clientTimestamp: 1,
      action: pose === "jump" ? "jump" : "roll",
      distanceM: 12,
    });
    const facts = aggregateDay([
      summarizeWorkout({ events: [move("jump-a", "jump")], activeMs: 3 * 60_000, weightKg: 70 }),
      summarizeWorkout({ events: [move("jump-b", "jump")], activeMs: 3 * 60_000, weightKg: 70 }),
    ]);
    expect(missionProgress("warmup_warrior", facts)).toBe(6);
    expect(missionProgress("finish_strong", facts)).toBe(3);
    expect(missionProgress("fitness_explorer", facts)).toBe(0);

    const squat = aggregateDay([summarizeWorkout({ events: [move("squat-a", "squat")], activeMs: 5_000, weightKg: null })]);
    expect(squat.cameraSquats).toBe(1);
    expect(missionProgress("squat_hero", squat)).toBe(1);
    expect(missionProgress("squat_clears_10", squat)).toBe(0);

    const explorer = emptyDayFacts();
    explorer.cameraJumps = 5;
    explorer.cameraSquats = 5;
    explorer.cameraLaneDodges = 4;
    expect(missionProgress("fitness_explorer", explorer)).toBe(4);
    explorer.cameraLaneDodges = 5;
    expect(missionProgress("fitness_explorer", explorer)).toBe(5);
  });
});
