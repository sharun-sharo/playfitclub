"use client";

import { useEffect, useRef, useState } from "react";
import { applyObstacleHit, beginRun, emptyRun, HIT_INVULNERABILITY_MS, RUN_LIVES, type RunLives } from "@fitplay/shared";
import { GameOverScreen } from "@/components/fitrunner-v2/game-over";
import { LivesHearts } from "@/components/fitrunner-v2/lives-hearts";
import {
  applyLocalPose,
  confirmToGameMs,
  phoneAsksForLandscape,
  phoneBodyPhase,
  phoneCameraFailure,
  phoneFrameWarning,
  phoneMotionDiagEnabled,
  phoneMotionDiagLines,
  phonePlayCalories,
  phoneSetupLine,
  phoneTrackingStatus,
  PHONE_BODY_LABEL,
  PHONE_MIRROR_GUIDE,
  PHONE_PLAY_URL,
  PHONE_ROTATE_LINE,
  PHONE_TEST_CONTROLS,
  PHONE_TEST_CONTROLS_LABEL,
  renderLoopFps,
  type PhoneBodyPhase,
  type PhoneMotionDiag,
} from "@/components/fitrunner-v2/phone-local-play";
import { PlayScoreCard } from "@/components/fitrunner-v2/play-score-card";
import type { FitRunnerHandle } from "@/components/fitrunner-v2/create-fitrunner";
import { parseWeightKg } from "@/lib/fitrunner-v2/calories";
import { cameraActiveStep } from "@/lib/fitrunner-v2/play-calories";
import { whatsappUrl } from "@/lib/whatsapp";
import { MODEL_FAILED_MESSAGE } from "@/lib/vision/camera-status";
import { openCamera, PoseEstimator, releaseCamera } from "@/lib/vision/pose-estimator";

const emptyDiag = (): PhoneMotionDiag => ({
  renderFps: null,
  inferenceMs: null,
  confidence: null,
  lastAction: null,
  confirmToCallMs: null,
});

export function PhoneFitRun({ demoLimitSeconds }: { demoLimitSeconds: number | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<FitRunnerHandle | null>(null);
  const estimatorRef = useRef<PoseEstimator | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playScoreRef = useRef<HTMLParagraphElement>(null);
  const distanceRef = useRef<HTMLElement>(null);
  const timeRef = useRef<HTMLElement>(null);
  const playingRef = useRef(false);
  const startedRef = useRef(false);
  const seenRef = useRef(new Set<string>());
  const runRef = useRef<RunLives>(emptyRun());
  const hitsRef = useRef(0);
  const previewRef = useRef(true);
  const motionDiagRef = useRef(false);
  const frameTimesRef = useRef<number[]>([]);
  const diagRef = useRef<PhoneMotionDiag>(emptyDiag());
  const weightRef = useRef<number | null | undefined>(undefined);
  const cameraActiveRef = useRef(0);
  const [runId, setRunId] = useState(0);
  const [runnerReady, setRunnerReady] = useState(false);
  const [phase, setPhase] = useState<PhoneBodyPhase>("looking");
  const [setupGuidance, setSetupGuidance] = useState<string | null>(null);
  const [tracking, setTracking] = useState(() => phoneTrackingStatus({ playing: false, poseCount: 0, calibrated: false }));
  const [frameWarning, setFrameWarning] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [lives, setLives] = useState(RUN_LIVES);
  const [cameraError, setCameraError] = useState("");
  const [graphicsError, setGraphicsError] = useState("");
  const [startError, setStartError] = useState("");
  const [cameraTry, setCameraTry] = useState(0);
  const [gameOver, setGameOver] = useState<{ score: number; coins: number; distanceM: number; obstaclesHit: number } | null>(null);
  const [demoOver, setDemoOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [previewOn, setPreviewOn] = useState(true);
  const [weightKg, setWeightKg] = useState<number | null | undefined>(undefined);
  const [calorieText, setCalorieText] = useState("—");
  const [calorieNote, setCalorieNote] = useState<string | null>(null);
  const [motionDiag, setMotionDiag] = useState(false);
  const [diagLines, setDiagLines] = useState<string[]>(() => phoneMotionDiagLines(emptyDiag()));
  previewRef.current = previewOn;
  weightRef.current = weightKg;

  function cameraStreamLive() {
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    return tracks.some((track) => track.readyState === "live");
  }

  const publishCaloriesRef = useRef<(ms: number, cameraLive: boolean) => void>(() => {});
  publishCaloriesRef.current = (ms, cameraLive) => {
    const view = phonePlayCalories({ weightKg: weightRef.current, cameraActiveMs: ms, cameraLive });
    setCalorieText((current) => (current === view.text ? current : view.text));
    setCalorieNote((current) => (current === view.note ? current : view.note));
  };

  useEffect(() => {
    const on = phoneMotionDiagEnabled(window.location.search);
    motionDiagRef.current = on;
    setMotionDiag(on);
  }, []);

  useEffect(() => {
    const apply = () => {
      const node = rootRef.current;
      if (!node) return;
      node.dataset.phoneOrient = phoneAsksForLandscape(window.innerWidth, window.innerHeight) ? "portrait" : "landscape";
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: FitRunnerHandle | null = null;
    playingRef.current = false;
    startedRef.current = false;
    seenRef.current.clear();
    runRef.current = emptyRun();
    hitsRef.current = 0;
    setRunnerReady(false);
    setPlaying(false);
    setGameOver(null);
    setDemoOver(false);
    setGraphicsError("");
    setStartError("");
    setLives(RUN_LIVES);

    void import("@/components/fitrunner-v2/create-fitrunner")
      .then(({ startFitRunner }) =>
        startFitRunner(
          canvas,
          {
            clip: null,
            lane: null,
            motion: null,
            speed: null,
            score: null,
            playScore: playScoreRef.current,
            distance: distanceRef.current,
            time: timeRef.current,
            tokens: null,
            combo: null,
            onFrame: (now) => {
              if (!motionDiagRef.current) return;
              const samples = frameTimesRef.current;
              samples.push(now);
              const cutoff = now - 1000;
              while (samples.length > 0 && (samples[0] ?? 0) < cutoff) samples.shift();
              diagRef.current.renderFps = renderLoopFps(samples);
            },
            onDemoOver: () => {
              if (!cancelled) setDemoOver(true);
            },
            onRunBegin: () => {
              const started = beginRun(emptyRun());
              runRef.current = started.run;
              hitsRef.current = 0;
              handleRef.current?.setLives(started.run.lives);
              if (!cancelled) setLives(started.run.lives);
            },
            onHit: (hit) => {
              const decision = applyObstacleHit(runRef.current, hit.obstacleId, hit.clientTimestamp, HIT_INVULNERABILITY_MS);
              runRef.current = decision.run;
              const current = handleRef.current;
              if (!current) return;
              if (!decision.accepted) {
                current.dropHit(hit.obstacleId);
                current.releaseLivesHold();
                return;
              }
              hitsRef.current = decision.run.hits;
              current.setLives(decision.run.lives);
              current.commitHit(hit.obstacleId);
              if (!cancelled) setLives(decision.run.lives);
              if (decision.gameOver) current.finish();
            },
            onUi: (state) => {
              if (cancelled) return;
              setPaused(state.paused);
              setMuted(state.muted);
            },
            onFinished: (run) => {
              if (cancelled) return;
              playingRef.current = false;
              setGameOver({
                score: run.score,
                coins: run.tokens,
                distanceM: run.distanceM,
                obstaclesHit: hitsRef.current,
              });
            },
            onGraphicsFailure: (message) => {
              if (!cancelled) setGraphicsError(message);
            },
          },
          { holdCourse: true, demoLimitSeconds, drawProfile: "phone", acceptKeyboard: false },
        ),
      )
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        handle = next;
        handleRef.current = next;
        setRunnerReady(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : "Fit Run failed to start.";
        if (/WebGL|shader|graphics context/i.test(message)) setGraphicsError(message);
        else setStartError(message);
      });

    return () => {
      cancelled = true;
      playingRef.current = false;
      handle?.dispose();
      handleRef.current = null;
    };
  }, [demoLimitSeconds, runId]);

  useEffect(() => {
    const video = videoRef.current;
    const poseCanvas = poseCanvasRef.current;
    if (!video || !poseCanvas) return;
    let cancelled = false;
    const estimator = new PoseEstimator();
    estimatorRef.current = estimator;
    estimator.setCoaching(false);
    estimator.setRaceLive(false);
    setCameraError("");
    setPhase("looking");
    setSetupGuidance(null);
    setFrameWarning(null);

    void (async () => {
      try {
        const stream = await openCamera(video);
        if (cancelled) {
          releaseCamera(stream, video);
          return;
        }
        streamRef.current = stream;
        try {
          await estimator.load();
        } catch {
          if (!cancelled) setCameraError(MODEL_FAILED_MESSAGE);
          return;
        }
        if (cancelled) return;
        estimator.setFacing("user");
        estimator.start(
          video,
          poseCanvas,
          {
            onUi: (state) => {
              if (cancelled) return;
              const playingNow = playingRef.current;
              if (!playingNow) {
                setPhase(phoneBodyPhase({ poseCount: state.poseCount, calibrated: state.calibrated }));
                setSetupGuidance(state.guidance);
              }
              setTracking(
                phoneTrackingStatus({
                  playing: playingNow,
                  poseCount: state.poseCount,
                  calibrated: state.calibrated,
                }),
              );
              setFrameWarning(
                phoneFrameWarning({
                  playing: playingNow,
                  banner: state.framing?.banner === true,
                  pause: state.framing?.pause === true,
                }),
              );
              if (!motionDiagRef.current) return;
              diagRef.current.inferenceMs = state.rates.lastInferenceMs;
              diagRef.current.confidence = state.confidence;
            },
            onMovement: (draft) => {
              const current = handleRef.current;
              if (!current) return;
              const note = (action: string) => {
                if (!motionDiagRef.current) return;
                diagRef.current.lastAction = action;
                diagRef.current.confirmToCallMs = confirmToGameMs(draft.clientTimestamp, performance.now());
              };
              applyLocalPose({
                playing: playingRef.current,
                previewVisible: previewRef.current,
                movementType: draft.movementType,
                eventId: draft.eventId,
                seen: seenRef.current,
                game: {
                  jump: () => {
                    note("jump");
                    current.localJump(draft.confidence, draft.eventId);
                  },
                  roll: () => {
                    note("squat");
                    current.localRoll(draft.confidence, draft.eventId);
                  },
                  stepLane: (direction) => {
                    note(direction < 0 ? "lean_left" : "lean_right");
                    current.localStep(direction, draft.confidence, draft.eventId);
                  },
                },
              });
            },
            onCameraLost: () => {
              if (!cancelled) setCameraError("The camera disconnected. Turn it back on to keep playing.");
            },
          },
          "calibrate",
        );
      } catch (error) {
        if (!cancelled) setCameraError(phoneCameraFailure(error));
      }
    })();

    return () => {
      cancelled = true;
      estimator.stop();
      releaseCamera(streamRef.current, video);
      streamRef.current = null;
      estimatorRef.current = null;
    };
  }, [cameraTry, runId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const resume = () => {
      if (document.hidden || !streamRef.current || !video.paused) return;
      void video.play().catch(() => undefined);
    };
    resume();
    video.addEventListener("pause", resume);
    return () => video.removeEventListener("pause", resume);
  }, [previewOn, cameraTry, runId]);

  useEffect(() => {
    if (phase !== "ready" || !runnerReady || playing || cameraError || graphicsError || startedRef.current) return;
    const timer = window.setTimeout(() => {
      const handle = handleRef.current;
      const estimator = estimatorRef.current;
      if (!handle || startedRef.current) return;
      startedRef.current = true;
      playingRef.current = true;
      handle.beginCourse();
      estimator?.setMode("play");
      estimator?.setCoaching(false);
      estimator?.setRaceLive(true);
      setPlaying(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [cameraError, graphicsError, phase, playing, runnerReady]);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/me/profile")
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { profile?: { weightKg?: unknown } };
        return body.profile ?? null;
      })
      .catch(() => null)
      .then((profile) => {
        if (cancel) return;
        const parsed = parseWeightKg(profile?.weightKg);
        setWeightKg(parsed === undefined ? null : parsed);
      });
    return () => {
      cancel = true;
    };
  }, [runId]);

  useEffect(() => {
    cameraActiveRef.current = 0;
    publishCaloriesRef.current(0, cameraStreamLive());
  }, [playing, runId]);

  useEffect(() => {
    publishCaloriesRef.current(cameraActiveRef.current, cameraStreamLive());
  }, [weightKg]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const live = cameraStreamLive();
      const canvas = canvasRef.current;
      const courseLive =
        live &&
        !paused &&
        !demoOver &&
        canvas?.dataset.course === "live" &&
        canvas.dataset.paused !== "1" &&
        canvas.dataset.demoOver !== "1";
      const delta = cameraActiveStep({ deltaMs: now - last, keyboardOnly: !live, courseLive });
      last = now;
      if (live && delta > 0) cameraActiveRef.current += delta;
      publishCaloriesRef.current(live ? cameraActiveRef.current : 0, live);
    }, 200);
    return () => window.clearInterval(timer);
  }, [playing, paused, demoOver, runId]);

  useEffect(() => {
    if (!motionDiag) return;
    const timer = window.setInterval(() => {
      setDiagLines(phoneMotionDiagLines(diagRef.current));
    }, 250);
    return () => window.clearInterval(timer);
  }, [motionDiag]);

  useEffect(() => {
    if (!motionDiag) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (target instanceof HTMLButtonElement) return;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        event.preventDefault();
        runTest("lean_left");
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        event.preventDefault();
        runTest("lean_right");
      } else if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        runTest("jump");
      } else if (event.code === "ArrowDown" || event.code === "KeyS") {
        event.preventDefault();
        runTest("squat");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [motionDiag]);

  function runTest(movementType: (typeof PHONE_TEST_CONTROLS)[number]["movementType"]) {
    const handle = handleRef.current;
    if (!handle || !motionDiagRef.current) return;
    diagRef.current.lastAction = movementType;
    if (movementType === "jump") handle.localJump();
    else if (movementType === "squat") handle.localRoll();
    else handle.localStep(movementType === "lean_left" ? -1 : 1);
  }

  const bodyLabel = PHONE_BODY_LABEL[phase];
  const setupLine = phoneSetupLine(phase, setupGuidance);

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden bg-[#8ec8ea] text-white" data-phone-play="" data-phone-orient="landscape">
      <canvas ref={canvasRef} data-fitrunner-v2="" aria-label="Fit Run" className="h-full w-full" hidden={Boolean(graphicsError)} />
      <LivesHearts hidden={!playing || Boolean(gameOver)} lives={lives} />
      <PlayScoreCard
        hidden={!playing || Boolean(gameOver)}
        scoreRef={playScoreRef}
        distanceRef={distanceRef}
        timeRef={timeRef}
        calories={calorieText}
        note={calorieNote}
        keyboard={false}
        className="top-3 portrait:top-14"
      />
      <p
        data-phone-tracking=""
        className="pointer-events-none absolute right-3 top-3 z-20 max-w-[11rem] truncate rounded-full bg-[#10141ccc] px-3 py-1 text-right text-[11px] text-[#d6ff4a] portrait:top-14"
      >
        {tracking}
      </p>
      <p data-phone-rotate="" className="absolute inset-x-3 top-2 z-40 hidden rounded-full bg-[#10141ce6] px-3 py-2 text-center text-sm text-white portrait:block">
        {PHONE_ROTATE_LINE}
      </p>
      <ul
        data-phone-mirror=""
        className="pointer-events-none absolute bottom-2 left-40 right-52 z-20 rounded-xl bg-[#10141ccc] px-3 py-2 text-[11px] leading-snug text-[#d6ff4a] portrait:bottom-16 portrait:left-3 portrait:right-3"
      >
        {PHONE_MIRROR_GUIDE.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {frameWarning ? (
        <p
          data-phone-frame=""
          role="status"
          className="pointer-events-none absolute left-1/2 top-1/4 z-30 max-w-xs -translate-x-1/2 rounded-full bg-[#10141ce6] px-4 py-2 text-center text-sm"
        >
          {frameWarning}
        </p>
      ) : null}
      <div className="absolute bottom-2 left-3 z-40 portrait:bottom-36">
        <button
          type="button"
          className="mb-1 rounded-full border border-white/20 bg-[#10141ccc] px-3 py-1.5 text-xs"
          aria-pressed={previewOn}
          onClick={() => setPreviewOn((value) => !value)}
        >
          {previewOn ? "Hide camera" : "Show camera"}
        </button>
        <div
          data-phone-preview={previewOn ? "shown" : "hidden"}
          className={previewOn ? "relative h-20 w-32 overflow-hidden rounded-xl border border-white/20 bg-black" : "pointer-events-none absolute h-px w-px overflow-hidden opacity-0"}
        >
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            muted
            playsInline
            aria-label="Camera preview"
            aria-hidden={previewOn ? undefined : true}
          />
          <canvas ref={poseCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
        </div>
      </div>
      {!playing && !graphicsError && !gameOver && !demoOver ? (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center overflow-y-auto bg-[#16181d] px-5 py-8 text-center portrait:justify-center"
          data-phone-body={phase}
          role="status"
        >
          <p className="text-xs tracking-[0.16em] text-[#d6ff4a]">Fit Run</p>
          <h1 className="mt-3 font-display text-4xl text-[#BEFF39]">{bodyLabel}</h1>
          <p className="mt-3 max-w-md text-lg text-white/80">{setupLine}</p>
          <p className="mt-2 text-sm text-[#d6ff4a]" data-phone-setup-tracking="">
            {tracking}
          </p>
          <ul className="mt-5 max-w-md space-y-1 text-left text-sm leading-relaxed text-[#d6ff4a]">
            {PHONE_MIRROR_GUIDE.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">{PHONE_PLAY_URL}</p>
          {cameraError ? <p className="mt-4 max-w-md text-base text-white">{cameraError}</p> : null}
          {startError ? <p className="mt-4 max-w-md text-base text-white">{startError}</p> : null}
          {cameraError ? (
            <button
              type="button"
              className="pointer-events-auto mt-6 rounded-full border border-white/25 px-5 py-3 text-sm"
              onClick={() => setCameraTry((value) => value + 1)}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {playing && !gameOver && !demoOver ? (
        <div className="absolute bottom-2 right-3 z-20 flex gap-2">
          <button
            type="button"
            className="rounded-full border border-white/15 bg-[#10141ccc] px-4 py-2 text-sm"
            aria-pressed={paused}
            onClick={() => handleRef.current?.setPaused(!paused)}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="rounded-full border border-white/15 bg-[#10141ccc] px-4 py-2 text-sm"
            aria-pressed={!muted}
            onClick={() => handleRef.current?.setMuted(!muted)}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
        </div>
      ) : null}
      {motionDiag ? (
        <aside data-phone-motiondiag="" className="absolute right-3 top-16 z-50 w-56 rounded-xl border border-white/15 bg-[#10141ce6] p-3 text-[11px] leading-relaxed text-[#d5deea]">
          {diagLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="mt-3 text-[#d6ff4a]">{PHONE_TEST_CONTROLS_LABEL}</p>
          <p className="mt-1 text-[10px] text-[#9aa8bd]">A D lanes · Space jump · S roll</p>
          <div className="mt-2 flex flex-wrap gap-1" data-phone-test-controls="">
            {PHONE_TEST_CONTROLS.map((control) => (
              <button
                key={control.movementType}
                type="button"
                className="rounded-full border border-white/20 px-2 py-1"
                onClick={() => runTest(control.movementType)}
              >
                {control.label}
              </button>
            ))}
          </div>
        </aside>
      ) : null}
      {graphicsError ? (
        <p className="absolute inset-x-4 top-1/3 z-30 rounded-2xl bg-[#10141ce6] px-4 py-4 text-center text-sm" data-fitrunner-graphics-error="" role="alert">
          {graphicsError}
        </p>
      ) : null}
      {demoOver ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#10141ce6] px-6" data-fitrunner-demo-over="">
          <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#1c1f24] px-8 py-8 text-center">
            <h2 className="font-display text-4xl text-[#BEFF39]">Your demo time is over.</h2>
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
          saved={null}
          onAgain={() => setRunId((value) => value + 1)}
          onExit={() => {
            window.location.assign("/games");
          }}
        />
      ) : null}
    </div>
  );
}
