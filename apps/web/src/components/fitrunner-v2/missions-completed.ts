export type MissionProgressSnap = {
  id: string;
  title: string;
  progress: number;
  target: number;
};

/**
 * Missions that crossed their target during this run.
 * A mission already at its target before the run is left off, and so is anything still short.
 */
export function missionsCompletedThisRun(
  baseline: readonly MissionProgressSnap[],
  latest: readonly MissionProgressSnap[],
): Array<{ id: string; title: string }> {
  const start = new Map(baseline.map((mission) => [mission.id, mission]));
  const completed: Array<{ id: string; title: string }> = [];
  for (const mission of latest) {
    const before = start.get(mission.id);
    if (!before || before.progress >= before.target) continue;
    if (mission.progress < mission.target) continue;
    const title = mission.title.trim();
    if (!title) continue;
    completed.push({ id: mission.id, title });
  }
  return completed;
}
