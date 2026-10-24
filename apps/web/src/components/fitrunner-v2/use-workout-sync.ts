"use client";

import { useEffect, useRef, useState } from "react";
import type { GradePopup } from "@/lib/fitrunner-v2/combo";
import type { WorkoutEventDraft } from "@/lib/fitrunner-v2/workout";
import type { MissionBoard, MissionLoadError, RunResult } from "@/components/fitrunner-v2/rewards-ui";

export type LocalRun = Omit<RunResult, "saved" | "missionsDone" | "xp" | "calories" | "achievements">;

async function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fetchWithTimeout(url: string, ms = 12000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => window.clearTimeout(timer));
}

export function useWorkoutSync(runId: number, enabled = true) {
  const queue = useRef<WorkoutEventDraft[]>([]);
  const sessionId = useRef<string | null>(null);
  const paused = useRef(false);
  const progress = useRef<Record<string, number>>({});
  const [auth, setAuth] = useState<"unknown" | "in" | "out">("unknown");
  const [missions, setMissions] = useState<MissionBoard | null>(null);
  const [missionError, setMissionError] = useState<MissionLoadError | null>(null);
  const loadSeq = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradePopup | null>(null);
  const [combo, setCombo] = useState({ multiplier: 0, best: 0 });

  async function flush() {
    const id = sessionId.current;
    if (!id || queue.current.length === 0) return;
    const batch = queue.current.splice(0, 80);
    const response = await postJson(`/api/fitrunner-v2/workouts/${id}/events`, { events: batch }).catch(() => null);
    if (!response?.ok) {
      queue.current.unshift(...batch);
      return;
    }
    const body = (await response.json()) as MissionBoard & { missions?: MissionBoard["missions"] };
    if (!body.missions) return;
    setMissions({ dayKey: body.dayKey, resetsInMs: body.resetsInMs, missions: body.missions });
    for (const mission of body.missions) {
      const previous = progress.current[mission.id] ?? 0;
      if (mission.progress > previous) {
        setToast(`${mission.title} ${Math.min(mission.progress, mission.target)}/${mission.target} · ${mission.xp} XP`);
      }
      progress.current[mission.id] = mission.progress;
    }
  }

  async function readMissions(seq: number) {
    const response = await fetchWithTimeout("/api/fitrunner-v2/missions").catch(() => null);
    if (seq !== loadSeq.current) return;
    if (!response) {
      setMissions(null);
      setMissionError({ status: 0, message: "The missions request did not finish." });
      return;
    }
    if (response.status === 401) {
      setAuth("out");
      setMissions(null);
      setMissionError(null);
      return;
    }
    if (!response.ok) {
      let message = "Missions are unavailable.";
      try {
        const body = (await response.json()) as { message?: string };
        if (typeof body.message === "string" && body.message) message = body.message;
      } catch {
        message = "Missions are unavailable.";
      }
      setMissions(null);
      setMissionError({ status: response.status, message });
      return;
    }
    const payload = (await response.json()) as MissionBoard;
    if (seq !== loadSeq.current) return;
    if (!payload.missions) {
      setMissions(null);
      setMissionError({ status: response.status, message: "Missions response was empty." });
      return;
    }
    setMissionError(null);
    setMissions({ dayKey: payload.dayKey, resetsInMs: payload.resetsInMs, missions: payload.missions });
    for (const mission of payload.missions) progress.current[mission.id] = mission.progress;
  }

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;
    const seq = ++loadSeq.current;
    sessionId.current = null;
    queue.current = [];
    paused.current = false;
    progress.current = {};
    setAuth("unknown");
    setMissions(null);
    setMissionError(null);
    setGrade(null);
    setCombo({ multiplier: 0, best: 0 });

    void (async () => {
      const meResponse = await fetchWithTimeout("/api/me").catch(() => null);
      if (cancel || seq !== loadSeq.current) return;
      if (!meResponse?.ok) {
        setMissionError({ status: meResponse?.status ?? 0, message: "Could not check your session." });
        return;
      }
      const me = await meResponse.json().then((body) => body as { user?: { id?: string } | null }).catch(() => null);
      if (cancel || seq !== loadSeq.current) return;
      if (!me) {
        setMissionError({ status: meResponse.status, message: "Could not check your session." });
        return;
      }
      if (!me.user?.id) {
        setAuth("out");
        setMissions(null);
        setMissionError(null);
        return;
      }
      setAuth("in");
      const missionsTask = readMissions(seq);
      const started = await postJson("/api/fitrunner-v2/workouts", {}).catch(() => null);
      if (!cancel && seq === loadSeq.current && started?.ok) {
        const body = await started.json().then((value) => value as { id?: string }).catch(() => null);
        sessionId.current = body?.id ?? null;
        if (sessionId.current) await flush();
      }
      await missionsTask;
    })();

    const timer = window.setInterval(() => void flush(), 4000);
    return () => {
      cancel = true;
      loadSeq.current += 1;
      window.clearInterval(timer);
    };
  }, [runId, enabled]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!grade) return;
    const timer = window.setTimeout(() => setGrade(null), 1600);
    return () => window.clearTimeout(timer);
  }, [grade]);

  return {
    auth,
    missions,
    missionError,
    toast,
    grade,
    combo,
    pushEvent(event: WorkoutEventDraft) {
      queue.current.push(event);
    },
    noteGrade(popup: GradePopup) {
      setGrade(popup);
      setCombo({ multiplier: popup.multiplier, best: popup.bestMultiplier });
    },
    noteStats(next: { multiplier: number; bestMultiplier: number }) {
      setCombo({ multiplier: next.multiplier, best: next.bestMultiplier });
    },
    async setPaused(next: boolean) {
      if (paused.current === next) return;
      paused.current = next;
      const id = sessionId.current;
      if (!id) return;
      await flush();
      await postJson(`/api/fitrunner-v2/workouts/${id}`, { action: next ? "pause" : "resume" }).catch(() => undefined);
    },
    async finish(local: LocalRun): Promise<RunResult> {
      await flush();
      const unsaved: RunResult = { ...local, saved: false, missionsDone: null, xp: null, calories: null };
      const id = sessionId.current;
      if (!id) return unsaved;
      const response = await postJson(`/api/fitrunner-v2/workouts/${id}`, { action: "complete" }).catch(() => null);
      if (!response?.ok) return unsaved;
      const body = (await response.json()) as { result?: RunResult };
      return body.result ?? unsaved;
    },
    async retryMissions() {
      const seq = ++loadSeq.current;
      setMissionError(null);
      setMissions(null);
      if (auth !== "in") {
        const meResponse = await fetchWithTimeout("/api/me").catch(() => null);
        if (seq !== loadSeq.current) return;
        if (!meResponse?.ok) {
          setMissionError({ status: meResponse?.status ?? 0, message: "Could not check your session." });
          return;
        }
        const me = await meResponse.json().then((body) => body as { user?: { id?: string } | null }).catch(() => null);
        if (seq !== loadSeq.current) return;
        if (!me?.user?.id) {
          setAuth("out");
          setMissions(null);
          setMissionError(null);
          return;
        }
        setAuth("in");
      }
      await readMissions(seq);
    },
    async claim(id: string) {
      const response = await postJson(`/api/fitrunner-v2/missions/${id}/claim`, {}).catch(() => null);
      if (!response?.ok) return;
      const board = await fetch("/api/fitrunner-v2/missions").catch(() => null);
      if (!board?.ok) return;
      const payload = (await board.json()) as MissionBoard;
      setMissions(payload);
      for (const mission of payload.missions) progress.current[mission.id] = mission.progress;
    },
  };
}
