import {
  ComboChain,
  expectedAction,
  gradeLabel,
  type ActionKind,
  type GradePopup,
  type InputSource,
  type ObstacleKindName,
} from "./combo";
import type { WorkoutEventDraft } from "./workout";

export type Threat = { id: string; kind: ObstacleKindName; distanceM: number };

export type RunStats = {
  chain: number;
  multiplier: number;
  bestMultiplier: number;
  clearancePoints: number;
  perfects: number;
  jumps: number;
  squats: number;
  laneDodges: number;
  hits: number;
  tokens: number;
};

type Press = {
  action: ActionKind;
  source: InputSource;
  speedMps: number;
  distanceToObstacleM: number;
  movementType: WorkoutEventDraft["movementType"];
  confidence?: number;
};

function poseFor(action: ActionKind, direction: -1 | 1 | 0): WorkoutEventDraft["movementType"] {
  if (action === "jump") return "jump";
  if (action === "roll") return "squat";
  return direction < 0 ? "lean_left" : "lean_right";
}

export function createRunRecorder(hooks: { onEvent: (event: WorkoutEventDraft) => void; onGrade: (grade: GradePopup) => void }) {
  const combo = new ComboChain();
  const presses = new Map<string, Press>();
  let jumps = 0;
  let squats = 0;
  let laneDodges = 0;
  let hits = 0;
  let tokens = 0;

  function stats(): RunStats {
    const snap = combo.snapshot();
    return {
      chain: snap.chain,
      multiplier: snap.multiplier,
      bestMultiplier: snap.bestMultiplier,
      clearancePoints: snap.clearancePoints,
      perfects: snap.perfects,
      jumps,
      squats,
      laneDodges,
      hits,
      tokens,
    };
  }

  return {
    stats,
    action(input: {
      action: ActionKind;
      source: InputSource;
      direction: -1 | 1 | 0;
      speedMps: number;
      distanceM: number;
      threat: Threat | null;
      eventId: string;
      clientTimestamp: number;
      confidence?: number;
    }) {
      if (input.action === "jump") jumps += 1;
      if (input.action === "roll") squats += 1;
      const movementType = poseFor(input.action, input.direction);
      hooks.onEvent({
        eventId: input.eventId,
        kind: "movement",
        source: input.source,
        movementType,
        confidence: input.source === "camera" ? input.confidence : undefined,
        clientTimestamp: input.clientTimestamp,
        speedMps: input.speedMps,
        distanceM: input.distanceM,
        action: input.action,
      });
      if (!input.threat) return;
      const press: Press = {
        action: input.action,
        source: input.source,
        speedMps: input.speedMps,
        distanceToObstacleM: input.threat.distanceM,
        movementType,
        confidence: input.confidence,
      };
      presses.set(input.threat.id, press);
      combo.arm({
        obstacleId: input.threat.id,
        action: input.action,
        expected: expectedAction(input.threat.kind),
        source: input.source,
        speedMps: input.speedMps,
        distanceToObstacleM: input.threat.distanceM,
      });
    },
    token(input: { eventId: string; source: InputSource; distanceM: number; clientTimestamp: number }) {
      tokens += 1;
      hooks.onEvent({
        eventId: input.eventId,
        kind: "token",
        source: input.source,
        clientTimestamp: input.clientTimestamp,
        distanceM: input.distanceM,
      });
    },
    resolve(input: {
      obstacleId: string;
      kind: ObstacleKindName;
      outcome: "clear" | "hit";
      threatened: boolean;
      distanceM: number;
      clientTimestamp: number;
      speedMps: number;
    }) {
      const press = presses.get(input.obstacleId);
      presses.delete(input.obstacleId);
      const result = combo.resolve({
        obstacleId: input.obstacleId,
        kind: input.kind,
        outcome: input.outcome,
        threatened: input.threatened,
      });
      if (!result) return null;
      if (input.outcome === "hit") hits += 1;
      if (result.grade !== "MISS" && input.kind === "rock") laneDodges += 1;
      const snap = combo.snapshot();
      const popup: GradePopup = {
        grade: result.grade,
        source: result.source,
        multiplier: snap.multiplier,
        bestMultiplier: snap.bestMultiplier,
        chain: snap.chain,
        label: gradeLabel(result.grade, result.source),
      };
      hooks.onEvent({
        eventId: `resolve:${input.obstacleId}`,
        kind: "resolve",
        source: press?.source ?? "keyboard",
        movementType: press?.movementType,
        confidence: press?.source === "camera" ? press.confidence : undefined,
        clientTimestamp: input.clientTimestamp,
        speedMps: press?.speedMps ?? input.speedMps,
        distanceM: input.distanceM,
        distanceToObstacleM: press?.distanceToObstacleM,
        obstacleKind: input.kind,
        action: press?.action,
        outcome: input.outcome,
      });
      hooks.onGrade(popup);
      return { popup, award: result.award, multiplier: result.multiplier };
    },
  };
}
