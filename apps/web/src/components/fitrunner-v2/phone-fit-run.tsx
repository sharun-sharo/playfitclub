"use client";

import { useEffect, useRef, useState } from "react";
import { applyObstacleHit, beginRun, emptyRun, HIT_INVULNERABILITY_MS, RUN_LIVES, type RunLives } from "@fitplay/shared";
import { GameOverScreen } from "@/components/fitrunner-v2/game-over";
import { LivesHearts } from "@/components/fitrunner-v2/lives-hearts";
import {
  dispatchLocalGesture,
  phoneBodyPhase,
  phoneCameraFailure,
  PHONE_BODY_LABEL,
  PHONE_MIRROR_LINE,
  PHONE_PLAY_URL,
  type PhoneBodyPhase,
} from "@/components/fitrunner-v2/phone-local-play";
import { PlayScoreCard } from "@/components/fitrunner-v2/play-score-card";
import type { FitRunnerHandle } from "@/components/fitrunner-v2/create-fitrunner";
import { whatsappUrl } from "@/lib/whatsapp";
import { MODEL_FAILED_MESSAGE } from "@/lib/vision/camera-status";
import { openCamera, PoseEstimator, releaseCamera } from "@/lib/vision/pose-estimator";

export function PhoneFitRun({ demoLimitSeconds }: { demoLimitSeconds: number | null }) {
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
  const [runId, setRunId] = useState(0);
  const [runnerReady, setRunnerReady] = useState(false);
  const [phase, setPhase] = useState<PhoneBodyPhase>("looking");
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
          { holdCourse: true, demoLimitSeconds, drawProfile: "phone" },
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
              if (cancelled || playingRef.current) return;
              setPhase(phoneBodyPhase({ poseCount: state.poseCount, calibrated: state.calibrated }));
            },
            onMovement: (draft) => {
              if (!playingRef.current) return;
              if (seenRef.current.has(draft.eventId)) return;
              const current = handleRef.current;
              if (!current) return;
              const applied = dispatchLocalGesture(draft.movementType, {
                jump: () => {
                  current.localJump(draft.confidence, draft.eventId);
                },
                roll: () => {
                  current.localRoll(draft.confidence, draft.eventId);
                },
                stepLane: (direction) => {
                  current.localStep(direction, draft.confidence, draft.eventId);
                },
              });
              if (!applied) return;
              seenRef.current.add(draft.eventId);
              if (seenRef.current.size > 80) {
                const oldest = seenRef.current.values().next().value;
                if (oldest) seenRef.current.delete(oldest);
              }
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

  const bodyLabel = PHONE_BODY_LABEL[phase];

  return (
    <div className="fixed inset-0 bg-[#8ec8ea] text-white" data-phone-play="">
      <canvas ref={canvasRef} data-fitrunner-v2="" aria-label="Fit Run" className="h-full w-full" hidden={Boolean(graphicsError)} />
      <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
        <video ref={videoRef} className="h-px w-px" muted playsInline />
        <canvas ref={poseCanvasRef} className="h-px w-px" width={2} height={2} />
      </div>
      <LivesHearts hidden={!playing || Boolean(gameOver)} lives={lives} />
      <PlayScoreCard
        hidden={!playing || Boolean(gameOver)}
        scoreRef={playScoreRef}
        distanceRef={distanceRef}
        timeRef={timeRef}
        calories="—"
        note={null}
        keyboard={false}
      />
      <p
        className="pointer-events-none absolute bottom-4 left-1/2 z-20 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded-full bg-[#10141ccc] px-4 py-2 text-center text-sm leading-snug text-[#d6ff4a]"
        data-phone-mirror=""
      >
        {PHONE_MIRROR_LINE}
      </p>
      {!playing && !graphicsError && !gameOver && !demoOver ? (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#16181d] px-6 text-center"
          data-phone-body={phase}
          role="status"
        >
          <p className="text-xs tracking-[0.16em] text-[#d6ff4a]">Fit Run</p>
          <h1 className="mt-4 font-display text-5xl text-[#BEFF39]">{bodyLabel}</h1>
          <p className="mt-4 max-w-md text-lg text-white/80">
            {phase === "looking" ? "Reading your body." : phase === "detected" ? "Hold still." : "The game is on this phone."}
          </p>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-[#d6ff4a]">{PHONE_MIRROR_LINE}</p>
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
        <div className="absolute bottom-16 right-4 z-20 flex gap-2">
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
