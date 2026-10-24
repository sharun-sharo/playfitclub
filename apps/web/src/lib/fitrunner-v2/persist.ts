import { assertCanStartGameplay, attributeCompletedWorkout, getPrisma } from "@fitplay/db";
import {
  assignmentsForDay,
  completedDailyMissions,
  isBonusTemplate,
  isRetiredMission,
  kolkataDayKey,
  kolkataDayRange,
  msUntilKolkataMidnight,
  progressForBoard,
} from "./missions";
import { parseProfilePatch } from "./workout";
import {
  achievementsToUnlock,
  activeMilliseconds,
  aggregateDay,
  dedupeEvents,
  eligibleTokenTotal,
  parseEventBatch,
  summarizeWorkout,
  decideClaim,
  type WorkoutEventDraft,
  type WorkoutSummary,
} from "./workout";

function isUnique(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002";
}

function missionView(row: { id: string; templateKey: string; title: string; progress: number; target: number; xp: number; claimedAt: Date | null }) {
  return {
    id: row.id,
    templateKey: row.templateKey,
    title: row.title,
    progress: row.progress,
    target: row.target,
    xp: row.xp,
    claimed: row.claimedAt !== null,
  };
}

export async function ensureMissions(userId: string, now = new Date()) {
  const prisma = getPrisma();
  const dayKey = kolkataDayKey(now);
  const existing = await prisma.dailyMission.findMany({ where: { userId, dayKey }, orderBy: { templateKey: "asc" } });
  const inserts = assignmentsForDay(existing.map((mission) => mission.templateKey), userId, dayKey);
  if (inserts.length > 0) {
    await prisma.dailyMission.createMany({
      data: inserts.map((template) => ({
        userId,
        dayKey,
        templateKey: template.key,
        title: template.title,
        target: template.target,
        xp: template.xp,
      })),
      skipDuplicates: true,
    });
  }
  const missions = await prisma.dailyMission.findMany({ where: { userId, dayKey }, orderBy: { templateKey: "asc" } });
  return {
    dayKey,
    resetsInMs: msUntilKolkataMidnight(now),
    missions: missions.filter((mission) => !isRetiredMission(mission.templateKey)).map(missionView),
  };
}

async function sessionsForDay(userId: string, dayKey: string) {
  const prisma = getPrisma();
  const range = kolkataDayRange(dayKey);
  return prisma.workoutSession.findMany({
    where: { userId, startedAt: { gte: range.start, lt: range.end } },
    include: { events: true, pauses: true },
  });
}

function summaryForStored(
  session: {
    startedAt: Date;
    endedAt: Date | null;
    status: string;
    pauses: Array<{ pausedAt: Date; resumedAt: Date | null }>;
    events: Array<{
      eventId: string;
      kind: string;
      source: string;
      movementType: string | null;
      confidence: number | null;
      clientTimestamp: number;
      speedMps: number | null;
      distanceM: number | null;
      distanceToObstacleM: number | null;
      obstacleKind: string | null;
      action: string | null;
      outcome: string | null;
    }>;
  },
  now: Date,
  weightKg: number | null,
) {
  const endedAt = session.endedAt ?? now;
  const activeMs = session.status === "COMPLETED" && session.endedAt
    ? activeMilliseconds(session.startedAt, session.endedAt, session.pauses)
    : activeMilliseconds(session.startedAt, endedAt, session.pauses);
  return summarizeWorkout({
    events: session.events.map(toDraft),
    activeMs,
    weightKg,
  });
}

function toDraft(event: {
  eventId: string;
  kind: string;
  source: string;
  movementType: string | null;
  confidence: number | null;
  clientTimestamp: number;
  speedMps: number | null;
  distanceM: number | null;
  distanceToObstacleM: number | null;
  obstacleKind: string | null;
  action: string | null;
  outcome: string | null;
}): WorkoutEventDraft {
  return {
    eventId: event.eventId,
    kind: event.kind as WorkoutEventDraft["kind"],
    source: event.source === "camera" ? "camera" : "keyboard",
    movementType: (event.movementType ?? undefined) as WorkoutEventDraft["movementType"],
    confidence: event.confidence ?? undefined,
    clientTimestamp: event.clientTimestamp,
    speedMps: event.speedMps ?? undefined,
    distanceM: event.distanceM ?? undefined,
    distanceToObstacleM: event.distanceToObstacleM ?? undefined,
    obstacleKind: (event.obstacleKind ?? undefined) as WorkoutEventDraft["obstacleKind"],
    action: (event.action ?? undefined) as WorkoutEventDraft["action"],
    outcome: (event.outcome ?? undefined) as WorkoutEventDraft["outcome"],
  };
}

export async function recomputeMissions(userId: string, now = new Date()) {
  const prisma = getPrisma();
  const dayKey = kolkataDayKey(now);
  await ensureMissions(userId, now);
  const sessions = await sessionsForDay(userId, dayKey);
  const parts = sessions.map((session) => summaryForStored(session, now, null));
  const facts = aggregateDay(parts);
  const missions = await prisma.dailyMission.findMany({ where: { userId, dayKey } });
  const progress = progressForBoard(missions, facts);
  await Promise.all(
    missions.map((mission, index) =>
      prisma.dailyMission.update({
        where: { id: mission.id },
        data: { progress: progress[index] ?? 0 },
      }),
    ),
  );
  return facts;
}

async function finishOpenWorkouts(userId: string) {
  const prisma = getPrisma();
  const open = await prisma.workoutSession.findMany({
    where: { userId, status: { in: ["ACTIVE", "PAUSED"] } },
    select: { id: true },
  });
  for (const session of open) await completeWorkout(userId, session.id);
}

export async function startWorkout(userId: string) {
  await assertCanStartGameplay(userId);
  await finishOpenWorkouts(userId);
  const created = await getPrisma().workoutSession.create({ data: { userId, status: "ACTIVE" } });
  return { id: created.id };
}

async function owned(userId: string, sessionId: string) {
  return getPrisma().workoutSession.findFirst({ where: { id: sessionId, userId }, include: { pauses: true } });
}

export async function pauseWorkout(userId: string, sessionId: string) {
  const prisma = getPrisma();
  const session = await owned(userId, sessionId);
  if (!session) return { ok: false as const, status: 404, message: "Workout not found." };
  if (session.status === "COMPLETED") return { ok: false as const, status: 409, message: "This workout is already finished." };
  if (session.status === "PAUSED") return { ok: true as const };
  const now = new Date();
  await prisma.$transaction([
    prisma.workoutPause.create({ data: { sessionId, pausedAt: now } }),
    prisma.workoutSession.update({ where: { id: sessionId }, data: { status: "PAUSED" } }),
  ]);
  return { ok: true as const };
}

export async function resumeWorkout(userId: string, sessionId: string) {
  const prisma = getPrisma();
  const session = await owned(userId, sessionId);
  if (!session) return { ok: false as const, status: 404, message: "Workout not found." };
  if (session.status === "COMPLETED") return { ok: false as const, status: 409, message: "This workout is already finished." };
  if (session.status === "ACTIVE") return { ok: true as const };
  const open = session.pauses.find((pause) => pause.resumedAt === null);
  const now = new Date();
  await prisma.$transaction([
    open
      ? prisma.workoutPause.update({ where: { id: open.id }, data: { resumedAt: now } })
      : prisma.workoutSession.update({ where: { id: sessionId }, data: { status: "ACTIVE" } }),
    prisma.workoutSession.update({ where: { id: sessionId }, data: { status: "ACTIVE" } }),
  ]);
  return { ok: true as const };
}

export async function appendWorkoutEvents(userId: string, sessionId: string, body: unknown) {
  const parsed = parseEventBatch(body);
  if (!parsed.ok) return { ok: false as const, status: 400, message: parsed.message };
  const session = await owned(userId, sessionId);
  if (!session) return { ok: false as const, status: 404, message: "Workout not found." };
  if (session.status === "COMPLETED") return { ok: false as const, status: 409, message: "This workout is already finished." };
  const prisma = getPrisma();
  const existing = await prisma.workoutEvent.findMany({ where: { sessionId }, select: { eventId: true } });
  const { accepted, ignored } = dedupeEvents(existing.map((event) => event.eventId), parsed.events);
  if (accepted.length > 0) {
    await prisma.workoutEvent.createMany({
      data: accepted.map((event) => ({
        sessionId,
        eventId: event.eventId,
        kind: event.kind,
        source: event.source,
        movementType: event.movementType,
        confidence: event.confidence,
        clientTimestamp: event.clientTimestamp,
        speedMps: event.speedMps,
        distanceM: event.distanceM,
        distanceToObstacleM: event.distanceToObstacleM,
        obstacleKind: event.obstacleKind,
        action: event.action,
        outcome: event.outcome,
      })),
      skipDuplicates: true,
    });
  }
  await recomputeMissions(userId);
  const board = await ensureMissions(userId);
  return { ok: true as const, accepted: accepted.length, ignored: ignored.length, ...board };
}

function publicSummary(summary: WorkoutSummary, extras: { durationMs: number; missionsDone: number; xpAwarded: number; achievements: Array<{ key: string; title: string }> }) {
  return {
    saved: true,
    durationMs: extras.durationMs,
    activeMs: summary.activeMs,
    distanceM: summary.distanceM,
    score: summary.score,
    tokens: summary.tokens,
    jumps: summary.jumps,
    squats: summary.squats,
    laneDodges: summary.laneDodges,
    perfects: summary.perfects,
    bestCombo: summary.bestCombo,
    hits: summary.hits,
    missionsDone: extras.missionsDone,
    xp: extras.xpAwarded,
    calories: summary.calories,
    eligible: summary.eligible,
    achievements: extras.achievements,
  };
}

export async function completeWorkout(userId: string, sessionId: string) {
  const prisma = getPrisma();
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId },
    include: { events: true, pauses: true },
  });
  if (!session) return { ok: false as const, status: 404, message: "Workout not found." };
  if (session.status === "COMPLETED") {
    const board = await ensureMissions(userId);
    const done = board.missions.filter((mission) => !isBonusTemplate(mission.templateKey) && mission.progress >= mission.target).length;
    return {
      ok: true as const,
      already: true,
      result: publicSummary(
        {
          activeMs: session.activeMs,
          cameraActiveMs: session.cameraActiveMs,
          distanceM: session.distanceM,
          score: session.score,
          tokens: session.tokens,
          jumps: session.jumps,
          squats: session.squats,
          laneDodges: session.laneDodges,
          perfects: session.perfects,
          bestCombo: session.bestCombo,
          hits: session.hits,
          calories: session.calories,
          eligible: session.eligible,
          xp: session.xpAwarded,
          cameraJumps: 0,
          cameraSquats: 0,
          cameraSquatClears: 0,
          cameraLaneDodges: 0,
          cameraPerfects: 0,
          cameraBestCombo: session.bestCombo,
          cameraCleanMs: 0,
          cameraTokens: 0,
        },
        { durationMs: session.endedAt ? session.endedAt.getTime() - session.startedAt.getTime() : 0, missionsDone: done, xpAwarded: session.xpAwarded, achievements: [] },
      ),
    };
  }

  const now = new Date();
  const pauses = session.pauses.map((pause) => ({
    pausedAt: pause.pausedAt,
    resumedAt: pause.resumedAt ?? (session.status === "PAUSED" ? now : pause.resumedAt),
  }));
  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  const summary = summarizeWorkout({
    events: session.events.map(toDraft),
    activeMs: activeMilliseconds(session.startedAt, now, pauses),
    weightKg: profile?.weightKg ?? null,
  });
  const dayKey = kolkataDayKey(session.startedAt);
  await ensureMissions(userId, session.startedAt);
  const daySessions = await sessionsForDay(userId, dayKey);
  const prior = daySessions.filter((item) => item.id !== session.id).map((item) => summaryForStored(item, now, null));
  const facts = aggregateDay([...prior, summary]);
  const missionRowsForCount = await prisma.dailyMission.findMany({ where: { userId, dayKey } });
  const missionsDone = completedDailyMissions(missionRowsForCount, facts);

  const [priorEligible, tokenRows, eligibleRows, unlocked] = await Promise.all([
    prisma.workoutSession.count({ where: { userId, eligible: true, status: "COMPLETED" } }),
    prisma.workoutSession.findMany({ where: { userId, status: "COMPLETED" }, select: { eligible: true, tokens: true } }),
    prisma.workoutSession.findMany({ where: { userId, status: "COMPLETED", eligible: true }, select: { startedAt: true } }),
    prisma.achievement.findMany({ where: { userId }, select: { key: true } }),
  ]);
  const days = new Set(eligibleRows.map((row) => kolkataDayKey(row.startedAt)));
  if (summary.eligible) days.add(dayKey);
  const earned = achievementsToUnlock({
    eligible: summary.eligible,
    priorEligible,
    cameraPerfects: summary.cameraPerfects,
    cameraBestCombo: summary.cameraBestCombo,
    eligibleLifetimeTokens: eligibleTokenTotal(tokenRows) + (summary.eligible ? summary.tokens : 0),
    eligibleKolkataDays: days.size,
    already: unlocked.map((row) => row.key),
  });

  const sourceId = `workout:${session.id}`;
  try {
    await prisma.$transaction(async (tx) => {
      const attribution = await attributeCompletedWorkout(userId, now, tx);
      const closed = await tx.workoutSession.updateMany({
        where: { id: session.id, userId, status: { in: ["ACTIVE", "PAUSED"] } },
        data: {
          status: "COMPLETED",
          endedAt: now,
          gymIdAtSession: attribution.gymIdAtSession,
          gameId: attribution.gameId,
          activeMs: summary.activeMs,
          cameraActiveMs: summary.cameraActiveMs,
          distanceM: summary.distanceM,
          score: summary.score,
          tokens: summary.tokens,
          jumps: summary.jumps,
          squats: summary.squats,
          laneDodges: summary.laneDodges,
          perfects: summary.perfects,
          bestCombo: summary.bestCombo,
          hits: summary.hits,
          missionsDone,
          xpAwarded: summary.xp,
          calories: summary.calories,
          eligible: summary.eligible,
        },
      });
      if (closed.count === 0) return;
      const openPause = session.pauses.find((pause) => pause.resumedAt === null);
      if (openPause) await tx.workoutPause.update({ where: { id: openPause.id }, data: { resumedAt: now } });
      if (summary.xp > 0) {
        await tx.xpEntry.create({ data: { userId, amount: summary.xp, reason: "workout", sourceId } });
        await tx.user.update({ where: { id: userId }, data: { xpTotal: { increment: summary.xp } } });
      }
      if (earned.length > 0) {
        await tx.achievement.createMany({
          data: earned.map((item) => ({ userId, key: item.key, title: item.title })),
          skipDuplicates: true,
        });
      }
      const missionRows = await tx.dailyMission.findMany({ where: { userId, dayKey } });
      const progress = progressForBoard(missionRows, facts);
      for (let index = 0; index < missionRows.length; index += 1) {
        const mission = missionRows[index];
        if (!mission) continue;
        await tx.dailyMission.update({
          where: { id: mission.id },
          data: { progress: progress[index] ?? 0 },
        });
      }
    });
  } catch (error) {
    if (!isUnique(error)) throw error;
    const saved = await prisma.workoutSession.findFirst({ where: { id: session.id, userId } });
    if (saved?.status !== "COMPLETED") throw error;
  }

  return {
    ok: true as const,
    already: false,
    result: publicSummary(summary, {
      durationMs: now.getTime() - session.startedAt.getTime(),
      missionsDone,
      xpAwarded: summary.xp,
      achievements: earned,
    }),
  };
}

export async function claimMission(userId: string, missionId: string) {
  const prisma = getPrisma();
  const mission = await prisma.dailyMission.findFirst({ where: { id: missionId, userId } });
  const decision = decideClaim(
    mission
      ? { id: mission.id, userId: mission.userId, progress: mission.progress, target: mission.target, xp: mission.xp, claimedAt: mission.claimedAt?.toISOString() ?? null }
      : null,
    userId,
  );
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { xpTotal: true } });
  if (decision.type === "missing") return { ok: false as const, status: 404, message: "Mission not found." };
  if (decision.type === "incomplete") return { ok: false as const, status: 409, message: "This mission is not complete yet." };
  if (decision.type === "already") return { ok: true as const, xpGranted: 0, total: account?.xpTotal ?? 0, already: true };

  let granted = 0;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.dailyMission.updateMany({
      where: { id: missionId, userId, claimedAt: null, progress: { gte: mission?.target ?? 0 } },
      data: { claimedAt: new Date() },
    });
    if (updated.count === 0) return;
    await tx.xpEntry.create({ data: { userId, amount: decision.amount, reason: "mission", sourceId: missionId } });
    await tx.user.update({ where: { id: userId }, data: { xpTotal: { increment: decision.amount } } });
    granted = decision.amount;
  }).catch((error: unknown) => {
    if (!isUnique(error)) throw error;
    granted = 0;
  });
  const after = await prisma.user.findUnique({ where: { id: userId }, select: { xpTotal: true } });
  return { ok: true as const, xpGranted: granted, total: after?.xpTotal ?? 0, already: granted === 0 };
}

export async function readProfile(userId: string) {
  const row = await getPrisma().playerProfile.findUnique({ where: { userId } });
  return {
    weightKg: row?.weightKg ?? null,
    difficulty: row?.difficulty ?? null,
    fitnessGoal: row?.fitnessGoal ?? null,
    tutorialCompleted: row?.tutorialCompleted ?? false,
  };
}

export async function writeProfile(userId: string, body: unknown) {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (record && Object.keys(record).length === 1 && typeof record.tutorialCompleted === "boolean") {
    const row = await getPrisma().playerProfile.upsert({
      where: { userId },
      create: { userId, tutorialCompleted: record.tutorialCompleted },
      update: { tutorialCompleted: record.tutorialCompleted },
    });
    return {
      ok: true as const,
      profile: {
        weightKg: row.weightKg,
        difficulty: row.difficulty,
        fitnessGoal: row.fitnessGoal,
        tutorialCompleted: row.tutorialCompleted,
      },
    };
  }
  if (record && "tutorialCompleted" in record && typeof record.tutorialCompleted !== "boolean") {
    return { ok: false as const, status: 400, message: "Tutorial completion must be true or false." };
  }
  const parsed = parseProfilePatch(body);
  if (!parsed.ok) return { ok: false as const, status: 400, message: parsed.message };
  const row = await getPrisma().playerProfile.upsert({
    where: { userId },
    create: { userId, weightKg: parsed.weightKg, difficulty: parsed.difficulty, fitnessGoal: parsed.fitnessGoal },
    update: { weightKg: parsed.weightKg, difficulty: parsed.difficulty, fitnessGoal: parsed.fitnessGoal },
  });
  return {
    ok: true as const,
    profile: {
      weightKg: row.weightKg,
      difficulty: row.difficulty,
      fitnessGoal: row.fitnessGoal,
      tutorialCompleted: row.tutorialCompleted,
    },
  };
}

export async function listWorkoutHistory(userId: string) {
  const rows = await getPrisma().workoutSession.findMany({
    where: { userId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return rows.map((row) => ({
    userId: row.userId,
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    activeMs: row.activeMs,
    distanceM: row.distanceM,
    score: row.score,
    tokens: row.tokens,
    jumps: row.jumps,
    squats: row.squats,
    laneDodges: row.laneDodges,
    perfects: row.perfects,
    bestCombo: row.bestCombo,
    missionsDone: row.missionsDone,
    xp: row.xpAwarded,
    calories: row.calories,
    eligible: row.eligible,
  }));
}
