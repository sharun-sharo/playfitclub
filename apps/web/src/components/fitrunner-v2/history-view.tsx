"use client";

import { useEffect, useState } from "react";
import { CALORIE_LABEL } from "@/lib/fitrunner-v2/calories";

type Row = {
  id: string;
  startedAt: string;
  activeMs: number;
  distanceM: number;
  score: number;
  tokens: number;
  jumps: number;
  squats: number;
  laneDodges: number;
  perfects: number;
  bestCombo: number;
  missionsDone: number;
  xp: number;
  calories: number | null;
  eligible: boolean;
};

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

export function FitRunnerHistory() {
  const [state, setState] = useState<"loading" | "signed-out" | "error" | "ready">("loading");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void fetch("/api/fitrunner-v2/history")
      .then(async (response) => {
        if (response.status === 401) {
          setState("signed-out");
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        const body = (await response.json()) as { workouts?: Row[] };
        setRows(body.workouts ?? []);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <main className="min-h-screen bg-[#1c1f24] px-6 py-10 text-white">
      <p className="text-[10px] tracking-[0.18em] text-[#BEFF39]">FITRUNNER V2</p>
      <h1 className="mt-1 font-display text-4xl">Workout history</h1>
      <p className="mt-2 max-w-xl text-sm text-[#9aa8bd]">{CALORIE_LABEL}</p>
      <p className="mt-4">
        <a className="text-sm text-[#BEFF39] underline" href="/dev/fitrunner-v2">
          Back to FitRunner
        </a>
      </p>
      {state === "signed-out" ? (
        <p className="mt-8 text-sm">
          Sign in to see your workouts.{" "}
          <a className="text-[#BEFF39] underline" href="/login?next=/dev/fitrunner-v2/history">
            Sign in
          </a>
        </p>
      ) : null}
      {state === "error" ? <p className="mt-8 text-sm">History is unavailable right now.</p> : null}
      {state === "ready" && rows.length === 0 ? <p className="mt-8 text-sm text-[#9aa8bd]">No saved workouts yet.</p> : null}
      {state === "ready" ? (
        <ul className="mt-6 max-w-3xl space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-white/10 bg-[#14181e] px-4 py-3 text-sm">
              <p className="text-[#BEFF39]">
                {new Date(row.startedAt).toLocaleString()} · {row.eligible ? "Eligible" : "Stored, no workout XP"}
              </p>
              <p className="mt-1 text-[#d5deea]">
                {clock(row.activeMs)} active · {Math.floor(row.distanceM)} m · score {row.score} · {row.tokens} tokens
              </p>
              <p className="text-[#9aa8bd]">
                {row.jumps} jumps · {row.squats} squats · {row.laneDodges} dodges · {row.perfects} perfects · best x{row.bestCombo || "—"} · {row.missionsDone} missions · {row.xp} XP ·{" "}
                {row.calories === null ? "calories unavailable" : `${row.calories} kcal`}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
