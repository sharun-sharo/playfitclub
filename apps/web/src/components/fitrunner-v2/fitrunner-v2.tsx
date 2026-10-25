"use client";

import { useEffect, useRef, useState } from "react";
import { whatsappUrl } from "@/lib/whatsapp";
import type { FitRunnerHandle, PoseCommand, PoseReport } from "@/components/fitrunner-v2/create-fitrunner";
import { GameOverScreen } from "@/components/fitrunner-v2/game-over";
import { playAgain as startPlayAgain } from "@/components/fitrunner-v2/play-again";
import { LivesHearts } from "@/components/fitrunner-v2/lives-hearts";
import { PlayScoreCard } from "@/components/fitrunner-v2/play-score-card";
import { MissionPanel, MissionToast, playGradeBlip, ResultsScreen, type RunResult } from "@/components/fitrunner-v2/rewards-ui";
import { remainingDemoSeconds, spendActiveDemo } from "@/lib/fitrunner-v2/demo-budget";
import { playCalories } from "@/lib/fitrunner-v2/play-calories";
import { createOnce } from "@/lib/fitrunner-v2/run-save";
import { fitRunnerTuning as tuning, type GraphicsQuality, type LaneEasing } from "@/components/fitrunner-v2/tuning";
import { FitRunnerTutorial } from "@/components/fitrunner-v2/tutorial-overlay";
import { useTvSession, type LivesAck } from "@/components/fitrunner-v2/use-tv-session";
import { useWorkoutSync } from "@/components/fitrunner-v2/use-workout-sync";
import { framingStatusLine, LOST_YOU } from "@/lib/vision/framing";
import "./tv-shell.css";
import { STEP_BACK_INTO_FRAME } from "@/lib/vision/hands-free";
import { MOTION_THRESHOLD_FIELDS, thresholdDefaults, thresholdDraft, writeMotionThresholds } from "@/lib/vision/motion-thresholds";
import type { PoseDiagnostics } from "@/lib/vision/pose-estimator";

const CLIP_BUTTONS = ["StandUp", "WipeSweat", "LongJump"] as const;
const QUALITIES = ["low", "medium", "high"] as const;

/** Opened on a TV route, Exit returns to TV home. Any other route returns to the games list. */
function gameOverExitPath(pathname: string) {
  return pathname === "/tv" || pathname.startsWith("/tv/") ? "/tv" : "/games";
}

export function FitRunnerV2({ demoLimitSeconds }: { demoLimitSeconds: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<FitRunnerHandle | null>(null);
  const clipRef = useRef<HTMLElement>(null);
  const laneRef = useRef<HTMLElement>(null);
  const motionRef = useRef<HTMLElement>(null);
  const speedRef = useRef<HTMLElement>(null);
  const scoreRef = useRef<HTMLElement>(null);
  const playScoreRef = useRef<HTMLParagraphElement>(null);
  const distanceRef = useRef<HTMLElement>(null);
  const timeRef = useRef<HTMLElement>(null);
  const uiRef = useRef<(state: { paused: boolean; muted: boolean }) => void>(() => {});
  const [error, setError] = useState("");
  const [graphicsError, setGraphicsError] = useState("");
  const [ready, setReady] = useState(false);
  const [camera, setCamera] = useState({ ...tuning.camera });
  const [devOpen, setDevOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [quality, setQuality] = useState<GraphicsQuality>(tuning.quality);
  const [laneDuration, setLaneDuration] = useState(tuning.laneChangeDuration);
  const [laneEasing, setLaneEasing] = useState<LaneEasing>(tuning.laneEasing);
  const [leanDegrees, setLeanDegrees] = useState(Math.round((tuning.leanRadians * 180) / Math.PI));
  const [laneCooldown, setLaneCooldown] = useState(tuning.laneInputCooldown);
  const [showColliders, setShowColliders] = useState(tuning.showColliders);
  const [runId, setRunId] = useState(0);
  const [holdStart, setHoldStart] = useState(false);
  const [results, setResults] = useState<RunResult | null>(null);
  const [poseReport, setPoseReport] = useState<PoseReport | null>(null);
  const [phoneDiag, setPhoneDiag] = useState<PoseDiagnostics | null>(null);
  const [liveMotion, setLiveMotion] = useState({ lane: "—", action: "—" });
  const [motionThresholds, setMotionThresholds] = useState(thresholdDefaults);
  const [playing, setPlaying] = useState(false);
  const [demoOver, setDemoOver] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [weightKg, setWeightKg] = useState<number | null | undefined>(undefined);
  const [calorieText, setCalorieText] = useState("—");
  const [calorieNote, setCalorieNote] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState<{ score: number; coins: number; distanceM: number; obstaclesHit: number } | null>(null);
  const [gameSaved, setGameSaved] = useState<boolean | null>(null);
  const cameraActiveRef = useRef(0);
  const weightRef = useRef(weightKg);
  const keyboardOnlyRef = useRef(true);
  weightRef.current = weightKg;
  const playingRef = useRef(false);
  const tutorialPoseRef = useRef<(report: PoseReport) => void>(() => {});
  const notifyRef = useRef<(report: PoseReport) => void>(() => {});
  const beginRunRef = useRef<() => Promise<LivesAck | null>>(async () => null);
  const reportHitRef = useRef<(hit: { obstacleId: string; clientTimestamp: number }) => Promise<LivesAck | null>>(async () => null);
  const runGate = useRef<Promise<void>>(Promise.resolve());
  const armed = useRef(false);
  const courseEpoch = useRef(0);
  const endedByLivesRef = useRef(false);
  const hitsRef = useRef(0);
  const saveRun = useRef(createOnce());
  const demoSpentRef = useRef(0);
  const demoLimitRef = useRef(demoLimitSeconds);
  demoLimitRef.current = demoLimitSeconds;
  playingRef.current = playing;
  const sync = useWorkoutSync(runId, playing);
  const syncRef = useRef(sync);
  const mutedRef = useRef(muted);
  syncRef.current = sync;
  mutedRef.current = muted;

  uiRef.current = (state) => {
    setPaused(state.paused);
    setMuted(state.muted);
  };

  function setCameraValue(key: keyof typeof tuning.camera, value: number) {
    tuning.camera[key] = value;
    setCamera((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const storedDemo = typeof window === "undefined" ? 0 : Number(window.sessionStorage.getItem("fitplay.fitrunner.demoSpent"));
    if (Number.isFinite(storedDemo) && storedDemo > demoSpentRef.current) demoSpentRef.current = storedDemo;
    const remaining = remainingDemoSeconds(demoLimitRef.current, demoSpentRef.current);
    if (remaining === 0) {
      setDemoOver(true);
      return;
    }
    saveRun.current = createOnce();
    endedByLivesRef.current = false;
    setGraphicsError("");
    let cancelled = false;
    let handle: FitRunnerHandle | null = null;

    void import("@/components/fitrunner-v2/create-fitrunner")
      .then(({ startFitRunner }) =>
        startFitRunner(canvas, {
          clip: clipRef.current,
          lane: laneRef.current,
          motion: motionRef.current,
          speed: speedRef.current,
          score: scoreRef.current,
          playScore: playScoreRef.current,
          distance: distanceRef.current,
          time: timeRef.current,
          tokens: null,
          combo: null,
          onDemoOver: ({ activeMs }) => {
            if (demoLimitRef.current !== null) {
              demoSpentRef.current = spendActiveDemo(demoSpentRef.current, activeMs / 1000);
              window.sessionStorage.setItem("fitplay.fitrunner.demoSpent", String(demoSpentRef.current));
            }
            if (!cancelled) setDemoOver(true);
          },
          onRunBegin: () => {
            armed.current = false;
            const pending = beginRunRef.current();
            runGate.current = pending.then(() => undefined);
          },
          onHit: (hit) => {
            void runGate.current.then(async () => {
              const decision = await reportHitRef.current(hit);
              if (cancelled) return;
              const current = handleRef.current;
              if (!current) return;
              if (!decision?.accepted) {
                current.dropHit(hit.obstacleId);
                current.releaseLivesHold();
                if (decision?.gameOver) {
                  endedByLivesRef.current = true;
                  if (typeof decision.hits === "number") hitsRef.current = decision.hits;
                  current.commitPending();
                  current.finish();
                }
                return;
              }
              if (typeof decision.hits === "number") hitsRef.current = decision.hits;
              current.commitHit(hit.obstacleId);
              if (decision.gameOver) {
                endedByLivesRef.current = true;
                current.finish();
              }
            });
          },
          onUi: (state) => {
            uiRef.current(state);
            void syncRef.current.setPaused(state.paused);
          },
          onGrade: (grade) => {
            syncRef.current.noteGrade(grade);
            if (!mutedRef.current) playGradeBlip(grade.grade);
          },
          onStats: (stats) => syncRef.current.noteStats(stats),
          onEvent: (event) => {
            if (!playingRef.current) return;
            syncRef.current.pushEvent(event);
          },
          onFinished: (run) => {
            if (!saveRun.current(() => undefined)) return;
            if (demoLimitRef.current !== null) {
              demoSpentRef.current = spendActiveDemo(demoSpentRef.current, run.activeMs / 1000);
              window.sessionStorage.setItem("fitplay.fitrunner.demoSpent", String(demoSpentRef.current));
            }
            setRunOpen(false);
            if (endedByLivesRef.current) {
              setGameOver({
                score: run.score,
                coins: run.tokens,
                distanceM: run.distanceM,
                obstaclesHit: hitsRef.current,
              });
            }
            void syncRef.current.finish(run).then((result) => {
              if (cancelled) return;
              if (endedByLivesRef.current) setGameSaved(result.saved);
              else setResults(result);
            });
          },
          onPose: (report) => {
            setPoseReport(report);
            notifyRef.current(report);
            if (report.accepted && !playingRef.current) tutorialPoseRef.current(report);
          },
          onGraphicsFailure: (message) => {
            if (!cancelled) setGraphicsError(message);
          },
        }, { holdCourse: true, demoLimitSeconds: remaining }),
      )
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        handle = next;
        handleRef.current = next;
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : "FitRunner V2 failed to start.";
        if (/WebGL|shader|graphics context/i.test(message)) setGraphicsError(message);
        else setError(message);
      });

    return () => {
      cancelled = true;
      handle?.dispose();
      handleRef.current = null;
    };
  }, [demoLimitSeconds, runId]);

  useEffect(() => {
    if (!playing || !ready) return;
    handleRef.current?.beginCourse();
  }, [playing, ready, runId]);

  const session = useTvSession(
    ready,
    (event) => {
      const report = handleRef.current?.applyPose(event);
      if (report) setPoseReport(report);
      return report;
    },
    (diagnostics) => {
      setPhoneDiag(diagnostics);
    },
  );
  notifyRef.current = session.notifyApplied;
  beginRunRef.current = () => {
    const epoch = ++courseEpoch.current;
    return session.beginRun().then((state) => {
      if (epoch !== courseEpoch.current) return state;
      if (state?.ok && !state.gameOver) armed.current = true;
      if (typeof state?.lives === "number") handleRef.current?.setLives(state.lives);
      if (typeof state?.hits === "number") hitsRef.current = state.hits;
      return state;
    });
  };
  reportHitRef.current = session.reportHit;

  useEffect(() => {
    handleRef.current?.setLives(session.lives);
    hitsRef.current = session.hits;
  }, [session.lives, session.hits, ready, runId]);

  useEffect(() => {
    if (!playing || !armed.current || !session.runOver) return;
    endedByLivesRef.current = true;
    handleRef.current?.commitPending();
    handleRef.current?.finish();
  }, [playing, session.runOver, session.hits, ready]);

  useEffect(() => {
    if (!holdStart) return;
    if (session.phase === "lobby" || session.phase === "countdown") setHoldStart(false);
  }, [holdStart, session.phase]);
  const framingLine = framingStatusLine(session.tracking?.message);
  const lostYou = session.tracking?.message === LOST_YOU;
  const sessionHeld = useRef(false);

  const cameraControl = session.players.some((player) => player.connected && player.control === "camera");
  const keyboardOnly = !cameraControl;
  keyboardOnlyRef.current = keyboardOnly;

  const publishCaloriesRef = useRef<(ms: number) => void>(() => {});
  publishCaloriesRef.current = (ms: number) => {
    const weight = weightRef.current;
    const keysOnly = keyboardOnlyRef.current;
    const view =
      weight === undefined && !keysOnly
        ? { text: "—", note: null }
        : playCalories({ weightKg: weight, cameraActiveMs: ms, keyboardOnly: keysOnly });
    setCalorieText((current) => (current === view.text ? current : view.text));
    setCalorieNote((current) => (current === view.note ? current : view.note));
  };

  useEffect(() => {
    if (!playing) return;
    cameraActiveRef.current = 0;
    publishCaloriesRef.current(0);
  }, [playing, runId]);

  useEffect(() => {
    publishCaloriesRef.current(cameraActiveRef.current);
  }, [weightKg, keyboardOnly]);

  useEffect(() => {
    setRunOpen(playing && !demoOver && results === null);
  }, [playing, demoOver, results, runId]);

  useEffect(() => {
    if (!playing) return;
    let cancel = false;
    void fetch("/api/me/profile")
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { profile?: { weightKg?: unknown } };
        const weight = body.profile?.weightKg;
        return typeof weight === "number" && Number.isFinite(weight) ? weight : null;
      })
      .catch(() => null)
      .then((weight) => {
        if (!cancel) setWeightKg(weight);
      });
    return () => {
      cancel = true;
    };
  }, [playing, runId]);

  useEffect(() => {
    if (!runOpen || paused || demoOver || !cameraControl || session.phase !== "running") return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      cameraActiveRef.current += now - last;
      last = now;
      publishCaloriesRef.current(cameraActiveRef.current);
    }, 1000);
    return () => {
      const now = performance.now();
      cameraActiveRef.current += Math.max(0, now - last);
      publishCaloriesRef.current(cameraActiveRef.current);
      window.clearInterval(timer);
    };
  }, [runOpen, paused, demoOver, cameraControl, session.phase]);

  useEffect(() => {
    if (playing) session.markRaceLive();
    else session.markRaceHeld();
  }, [playing, session.markRaceHeld, session.markRaceLive]);

  useEffect(() => {
    if (!playing) {
      sessionHeld.current = false;
      return;
    }
    if (session.phase === "paused") {
      sessionHeld.current = true;
      handleRef.current?.setPaused(true);
      return;
    }
    if (session.phase === "running" && sessionHeld.current) {
      sessionHeld.current = false;
      handleRef.current?.setPaused(false);
    }
  }, [playing, session.phase]);

  useEffect(() => {
    setMotionThresholds(thresholdDraft());
  }, []);

  useEffect(() => {
    const target = window as Window & { __fitrunnerApplyPose?: (event: PoseCommand) => PoseReport | undefined };
    target.__fitrunnerApplyPose = (event) => {
      const report = handleRef.current?.applyPose(event);
      if (report) setPoseReport(report);
      return report;
    };
    return () => {
      delete target.__fitrunnerApplyPose;
    };
  }, []);

  useEffect(() => {
    if (!devOpen) return;
    const timer = window.setInterval(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setLiveMotion({ lane: canvas.dataset.lane || "—", action: canvas.dataset.motion || "—" });
    }, 200);
    return () => window.clearInterval(timer);
  }, [devOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.code !== "Backquote" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      setDevOpen((open) => !open);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function playAgain() {
    startPlayAgain({
      demoSecondsLeft: remainingDemoSeconds(demoLimitRef.current, demoSpentRef.current),
      applyCourse: (clip) => {
        handleRef.current?.prepareReplay(clip);
      },
      emitPhoneReset: () => session.emitRoundReset(),
      restartRun: () => {
        endedByLivesRef.current = false;
        armed.current = false;
        hitsRef.current = 0;
        setDemoOver(false);
        setHoldStart(true);
        setPlaying(false);
        setRunId((value) => value + 1);
        void session.restartRun();
      },
      clearRound: () => {
        setGameOver(null);
        setGameSaved(null);
        setResults(null);
      },
      showDemoOver: () => setDemoOver(true),
    });
  }

  return (
    <div className="fixed inset-0 bg-[#8ec8ea] text-white" data-fitrunner-root="">
      <canvas
        ref={canvasRef}
        data-fitrunner-v2=""
        aria-label="FitRunner V2 prototype"
        className="h-full w-full"
        hidden={Boolean(graphicsError)}
      />
      <LivesHearts hidden={!playing} lives={session.lives} />
      <PlayScoreCard
        hidden={!playing}
        scoreRef={playScoreRef}
        distanceRef={distanceRef}
        timeRef={timeRef}
        calories={calorieText}
        note={calorieNote}
        keyboard={session.keyboardChosen}
      />
      {playing ? <MissionPanel auth={sync.auth} board={sync.missions} error={sync.missionError} onRetry={() => void sync.retryMissions()} onClaim={(id) => void sync.claim(id)} /> : null}
      {playing ? <MissionToast text={sync.toast} /> : null}
      {playing && session.phase === "countdown" ? (
        <p
          data-countdown={session.countdown || undefined}
          className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-8xl text-[#d6ff4a]"
          role="status"
        >
          {session.countdown > 0 ? session.countdown : ""}
        </p>
      ) : null}
      {playing && (paused || session.phase === "paused") && session.phase !== "countdown" ? (
        <p className="pointer-events-none absolute left-1/2 top-6 z-10 max-w-md -translate-x-1/2 rounded-full bg-[#10141ccc] px-4 py-2 text-center text-sm text-[#d6ff4a]">
          {session.statusMessage === STEP_BACK_INTO_FRAME || lostYou ? STEP_BACK_INTO_FRAME : "Paused"}
        </p>
      ) : null}
      {playing && framingLine && !(paused && lostYou) ? (
        <p className="pointer-events-none absolute bottom-16 left-1/2 z-10 max-w-xs -translate-x-1/2 truncate rounded-full bg-[#1c1f24]/90 px-3 py-1 text-center text-[11px] tracking-[0.12em] text-[#BEFF39]">
          {framingLine}
        </p>
      ) : null}
      {playing && !gameOver ? <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        {session.phase === "paused" || session.phase === "countdown" ? null : (
          <button
            type="button"
            className="rounded-full border border-white/15 bg-[#10141ccc] px-4 py-2 text-sm"
            aria-pressed={paused}
            onClick={() => handleRef.current?.setPaused(!paused)}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button
          type="button"
          className="rounded-full border border-[#BEFF39]/50 bg-[#1c1f24] px-4 py-2 text-sm text-[#BEFF39]"
          onClick={() => handleRef.current?.finish()}
        >
          Finish
        </button>
        <button
          type="button"
          className="rounded-full border border-white/15 bg-[#10141ccc] px-4 py-2 text-sm"
          aria-pressed={!muted}
          onClick={() => handleRef.current?.setMuted(!muted)}
        >
          {muted ? "Sound off" : "Sound on"}
        </button>
      </div> : null}
      {!playing ? (
        <FitRunnerTutorial
          key={runId}
          ready={ready}
          runnerRef={handleRef}
          canvasRef={canvasRef}
          session={session}
          poseRef={tutorialPoseRef}
          holdStart={holdStart}
          onPlay={() => setPlaying(true)}
        />
      ) : null}
      <button
        type="button"
        className="absolute right-4 top-4 z-20 rounded-full border border-white/15 bg-[#10141ccc] px-3 py-1 text-xs tracking-[0.14em] text-[#d6ff4a]"
        aria-pressed={devOpen}
        onClick={() => setDevOpen((open) => !open)}
      >
        Dev
      </button>
      <aside
        className={`${devOpen ? "" : "hidden"} absolute left-4 top-48 z-20 max-h-[calc(100vh-13rem)] w-[19rem] overflow-auto rounded-2xl border border-white/15 bg-[#10141ce6] p-4 text-sm shadow-xl`}
      >
        <p className="font-display text-xs tracking-[0.14em] text-[#d6ff4a]">DEV ONLY</p>
        <h1 className="mt-1 font-display text-2xl">FitRunner V2</h1>
        <p className="mt-1 text-xs text-[#c5d0e0]">
          {error ? error : ready ? "Coastal prototype. A signed-in workout is saved from this run." : "Loading X Bot and the coast…"}
        </p>
        <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-y-1 text-xs" data-fitrunner-hud="">
          <dt className="text-[#9aa8bd]">Clip</dt>
          <dd ref={clipRef}>—</dd>
          <dt className="text-[#9aa8bd]">Lane</dt>
          <dd ref={laneRef}>—</dd>
          <dt className="text-[#9aa8bd]">Motion</dt>
          <dd ref={motionRef}>—</dd>
          <dt className="text-[#9aa8bd]">Speed</dt>
          <dd ref={speedRef}>—</dd>
          <dt className="text-[#9aa8bd]">Score</dt>
          <dd ref={scoreRef}>—</dd>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {CLIP_BUTTONS.map((clip) => (
            <button
              key={clip}
              type="button"
              tabIndex={-1}
              className="rounded-full border border-white/20 px-3 py-1 text-xs"
              onClick={() => handleRef.current?.playClip(clip)}
            >
              {clip}
            </button>
          ))}
        </div>
        <fieldset className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[11px]" data-fitrunner-lane="">
          <legend className="text-[#9aa8bd]">Lane</legend>
          <label className="grid grid-cols-[5.4rem_1fr_2.2rem] items-center gap-2">
            <span className="text-[#9aa8bd]">duration</span>
            <input
              type="range"
              min={0.12}
              max={0.45}
              step={0.01}
              value={laneDuration}
              aria-label="Lane duration"
              onChange={(event) => {
                const value = Number(event.target.value);
                tuning.laneChangeDuration = value;
                setLaneDuration(value);
              }}
            />
            <span>{laneDuration.toFixed(2)}</span>
          </label>
          <label className="grid grid-cols-[5.4rem_1fr] items-center gap-2">
            <span className="text-[#9aa8bd]">easing</span>
            <select
              className="rounded-md border border-white/20 bg-transparent px-2 py-1"
              value={laneEasing}
              aria-label="Lane easing"
              onChange={(event) => {
                const value: LaneEasing = event.target.value === "cubic" ? "cubic" : "smoothstep";
                tuning.laneEasing = value;
                setLaneEasing(value);
              }}
            >
              <option value="smoothstep">smoothstep</option>
              <option value="cubic">cubic</option>
            </select>
          </label>
          <label className="grid grid-cols-[5.4rem_1fr_2.2rem] items-center gap-2">
            <span className="text-[#9aa8bd]">lean</span>
            <input
              type="range"
              min={0}
              max={25}
              step={1}
              value={leanDegrees}
              aria-label="Lean angle"
              onChange={(event) => {
                const value = Number(event.target.value);
                tuning.leanRadians = (value * Math.PI) / 180;
                setLeanDegrees(value);
              }}
            />
            <span>{leanDegrees}°</span>
          </label>
          <label className="grid grid-cols-[5.4rem_1fr_2.2rem] items-center gap-2">
            <span className="text-[#9aa8bd]">cooldown</span>
            <input
              type="range"
              min={0}
              max={0.35}
              step={0.01}
              value={laneCooldown}
              aria-label="Lane input cooldown"
              onChange={(event) => {
                const value = Number(event.target.value);
                tuning.laneInputCooldown = value;
                setLaneCooldown(value);
              }}
            />
            <span>{laneCooldown.toFixed(2)}</span>
          </label>
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={showColliders}
              aria-label="Show colliders"
              onChange={(event) => {
                tuning.showColliders = event.target.checked;
                setShowColliders(event.target.checked);
              }}
            />
            <span className="text-[#9aa8bd]">Show colliders</span>
          </label>
        </fieldset>
        <fieldset className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[11px]" data-fitrunner-motion="">
          <legend className="text-[#9aa8bd]">Motion</legend>
          <p className="text-[#9aa8bd]">{session.connected ? "TV session connected." : "No TV session on this browser. Keyboard still works."}</p>
          <p className="text-[#9aa8bd]">Jump is a hip-rise estimate. It does not prove both feet left the ground.</p>
          <dl className="grid grid-cols-[6.2rem_1fr] gap-y-1">
            <dt className="text-[#9aa8bd]">Phase</dt>
            <dd>{phoneDiag?.phase ?? "—"}</dd>
            <dt className="text-[#9aa8bd]">Left arm</dt>
            <dd>{phoneDiag ? `${phoneDiag.leftElbow.toFixed(0)}° · out ${phoneDiag.leftLateral.toFixed(2)}` : "—"}</dd>
            <dt className="text-[#9aa8bd]">Right arm</dt>
            <dd>{phoneDiag ? `${phoneDiag.rightElbow.toFixed(0)}° · out ${phoneDiag.rightLateral.toFixed(2)}` : "—"}</dd>
            <dt className="text-[#9aa8bd]">Squat</dt>
            <dd>{phoneDiag ? `drop ${phoneDiag.hipDrop.toFixed(2)} · knee ${phoneDiag.kneeAngle.toFixed(0)}°` : "—"}</dd>
            <dt className="text-[#9aa8bd]">Jump</dt>
            <dd>{phoneDiag ? `rise ${phoneDiag.riseSpeed.toFixed(2)} · ankle ${phoneDiag.ankleRise.toFixed(2)}` : "—"}</dd>
            <dt className="text-[#9aa8bd]">Confidence</dt>
            <dd>{phoneDiag ? `${Math.round(phoneDiag.confidence * 100)}%` : "—"}</dd>
            <dt className="text-[#9aa8bd]">Accepted</dt>
            <dd>{poseReport?.accepted ? `${poseReport.movementType} · ${poseReport.source}` : "—"}</dd>
            <dt className="text-[#9aa8bd]">Rejected</dt>
            <dd>{rejectText(poseReport && !poseReport.accepted ? poseReport.reason : phoneDiag?.reject)}</dd>
            <dt className="text-[#9aa8bd]">Latency</dt>
            <dd>{poseReport?.latencyMs === null || poseReport?.latencyMs === undefined ? "—" : `${poseReport.latencyMs} ms`}</dd>
            <dt className="text-[#9aa8bd]">Lane</dt>
            <dd>{liveMotion.lane}</dd>
            <dt className="text-[#9aa8bd]">Action</dt>
            <dd>{liveMotion.action}</dd>
          </dl>
          {MOTION_THRESHOLD_FIELDS.map((field) => (
            <label key={field.key} className="grid grid-cols-[5.4rem_1fr_2.4rem] items-center gap-2">
              <span className="text-[#9aa8bd]">{field.label}</span>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={motionThresholds[field.key]}
                aria-label={`Motion ${field.label}`}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  const next = { ...motionThresholds, [field.key]: value };
                  setMotionThresholds(next);
                  writeMotionThresholds(next);
                }}
              />
              <span>{field.step < 1 ? motionThresholds[field.key].toFixed(2) : motionThresholds[field.key].toFixed(0)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[11px]" data-fitrunner-camera="">
          <legend className="text-[#9aa8bd]">Camera</legend>
          {(
            [
              ["distance", 2.2, 9, 0.05],
              ["height", 0.6, 4.5, 0.05],
              ["lookAhead", 2, 14, 0.1],
              ["lookHeight", 0.2, 2.4, 0.05],
              ["fov", 30, 75, 1],
              ["fovGain", 0, 12, 0.5],
              ["landingDip", 0, 0.35, 0.01],
              ["jumpLook", 0, 0.6, 0.02],
              ["smooth", 1, 16, 0.5],
            ] as const
          ).map(([key, min, max, step]) => (
            <label key={key} className="grid grid-cols-[5.4rem_1fr_2.2rem] items-center gap-2">
              <span className="text-[#9aa8bd]">{key}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={camera[key]}
                aria-label={`Camera ${key}`}
                onChange={(event) => setCameraValue(key, Number(event.target.value))}
              />
              <span>{key === "fov" ? camera[key].toFixed(0) : camera[key].toFixed(2)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="mt-3 border-t border-white/10 pt-3 text-[11px]">
          <legend className="text-[#9aa8bd]">Graphics</legend>
          <div className="mt-2 flex gap-2">
            {QUALITIES.map((level) => (
              <button
                key={level}
                type="button"
                className={`rounded-full border px-3 py-1 ${quality === level ? "border-[#d6ff4a] text-[#d6ff4a]" : "border-white/20"}`}
                aria-pressed={quality === level}
                onClick={() => {
                  setQuality(level);
                  handleRef.current?.setQuality(level);
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </fieldset>
      </aside>
      {graphicsError ? (
        <p data-fitrunner-graphics-error="" role="alert">
          {graphicsError}
        </p>
      ) : null}
      {error && !graphicsError ? <p className="absolute bottom-4 left-4 z-30 max-w-md rounded-xl bg-[#3a1212ee] px-3 py-2 text-sm">{error}</p> : null}
      {demoOver ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#10141ce6] px-6" data-fitrunner-demo-over="">
          <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#1c1f24] px-8 py-8 text-center shadow-2xl" aria-labelledby="fitrunner-demo-over-title">
            <h2 id="fitrunner-demo-over-title" className="font-display text-4xl text-[#BEFF39]">
              Your demo time is over.
            </h2>
            <a className="mt-6 inline-flex rounded-full bg-[#BEFF39] px-6 py-3 text-sm font-semibold text-[#1c1f24]" href={whatsappUrl("individual")} target="_blank" rel="noopener noreferrer">
              Buy Plan
            </a>
          </section>
        </div>
      ) : null}
      {gameOver && !demoOver ? (
        <GameOverScreen
          score={gameOver.score}
          coins={gameOver.coins}
          distanceM={gameOver.distanceM}
          obstaclesHit={gameOver.obstaclesHit}
          saved={gameSaved}
          onAgain={playAgain}
          onExit={() => {
            const exitTo = gameOverExitPath(window.location.pathname);
            void session.leaveSession().finally(() => {
              window.location.assign(exitTo);
            });
          }}
        />
      ) : null}
      {results && !demoOver && !gameOver ? (
        <ResultsScreen result={results} onAgain={playAgain} />
      ) : null}
    </div>
  );
}

function rejectText(reason: string | null | undefined) {
  if (reason === "both_arms") return "Both arms were out, so neither lane command was sent.";
  if (reason === "low_confidence") return "Confidence was below the action threshold.";
  if (reason === "tracking_lost") return "Tracking was lost, so no command was sent.";
  if (reason === "duplicate") return "That command was already used.";
  if (reason === "not_ready") return "The runner could not take that action yet.";
  if (reason === "buffered") return "Waiting until the current move finishes.";
  if (reason === "stale") return "That command was too old to apply.";
  if (reason === "replaced") return "A newer command replaced it.";
  if (reason === "forward_bend") return "That was a forward bend, not a duck.";
  if (reason === "paused") return "The run is paused.";
  if (reason === "ignored") return "That pose is not a lane, jump, or duck.";
  if (!reason) return "—";
  return reason;
}
