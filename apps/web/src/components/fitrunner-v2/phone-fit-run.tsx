"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { applyObstacleHit, beginRun, emptyRun, HIT_INVULNERABILITY_MS, RUN_LIVES, type RunLives } from "@fitplay/shared";
import { GameOverScreen } from "@/components/fitrunner-v2/game-over";
import { LivesHearts } from "@/components/fitrunner-v2/lives-hearts";
import {
  createPhoneCalibration,
  phoneBodyReading,
  phoneStageCaps,
  readPhonePlayStarted,
  rememberPhonePlayStarted,
  startPhonePlay,
  stepPhoneCalibration,
  PHONE_PLAYER_READY,
  PHONE_PLAY_STARTED_KEY,
  PHONE_STAGE_NOTE,
  type PhoneCalibState,
} from "@/components/fitrunner-v2/phone-calibration";
import {
  applyLocalPose,
  confirmToGameMs,
  dispatchLocalGesture,
  phoneAsksForLandscape,
  phoneCameraFailure,
  phoneGestureCandidate,
  phoneMotionDiagEnabled,
  phoneMotionDiagLines,
  phonePlayCalories,
  PHONE_LAPTOP_QR_LINE,
  PHONE_LAPTOP_QR_NAME,
  PHONE_MIRROR_GUIDE,
  PHONE_MIRROR_NOTE,
  phonePlayQrPayload,
  PHONE_TEST_CONTROLS,
  PHONE_TEST_CONTROLS_LABEL,
  renderLoopFps,
  type PhoneMotionDiag,
} from "@/components/fitrunner-v2/phone-local-play";
import { PlayScoreCard } from "@/components/fitrunner-v2/play-score-card";
import type { FitRunnerHandle } from "@/components/fitrunner-v2/create-fitrunner";
import { notePhoneFrameGap, phoneFrameDiagLines, type PhoneFrameDiag } from "@/components/fitrunner-v2/runner-clock";
import { parseWeightKg } from "@/lib/fitrunner-v2/calories";
import { cameraActiveStep } from "@/lib/fitrunner-v2/play-calories";
import { whatsappUrl } from "@/lib/whatsapp";
import { BODY_LEFT_MESSAGE, MODEL_FAILED_MESSAGE } from "@/lib/vision/camera-status";
import type { FramingCode } from "@/lib/vision/framing";
import { openCamera, PoseEstimator, releaseCamera } from "@/lib/vision/pose-estimator";
import "./phone-hud.css";

function sameCalib(current: PhoneCalibState, next: PhoneCalibState) {
  return (
    current.phase === next.phase &&
    current.status === next.status &&
    current.guidance === next.guidance &&
    current.countdown === next.countdown &&
    current.coursePaused === next.coursePaused
  );
}

function CalibGuide() {
  return (
    <svg className="phone-calib-guide" viewBox="0 0 120 220" aria-hidden="true">
      <ellipse cx="60" cy="28" rx="16" ry="18" fill="none" stroke="white" strokeWidth="3" />
      <path d="M60 46v74M28 78l32-8 32 8M36 188l24-68 24 68" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function PhoneLaptopQr() {
  const [qr, setQr] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const payload = phonePlayQrPayload(window.location.origin);
    if (!payload) return;
    let cancel = false;
    void QRCode.toDataURL(payload, { margin: 1, width: 480, color: { dark: "#1c1f24", light: "#ffffff" } })
      .then((url) => {
        if (!cancel) setQr(url);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (failed) return null;

  return (
    <figure className="phone-laptop-qr" data-phone-laptop-qr="">
      {qr ? (
        <img className="phone-laptop-qr-image" src={qr} alt={PHONE_LAPTOP_QR_NAME} width={180} height={180} />
      ) : (
        <div className="phone-laptop-qr-image" aria-hidden="true" />
      )}
      <figcaption>{PHONE_LAPTOP_QR_LINE}</figcaption>
    </figure>
  );
}

let phonePlayEngaged = false;

function phoneSessionEngaged() {
  if (phonePlayEngaged) return true;
  if (typeof window === "undefined") return false;
  return readPhonePlayStarted(window.sessionStorage);
}

function engagePhoneSession() {
  phonePlayEngaged = true;
  if (typeof window === "undefined") return;
  rememberPhonePlayStarted(window.sessionStorage);
}

function clearPhoneSession() {
  phonePlayEngaged = false;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PHONE_PLAY_STARTED_KEY);
  } catch {
    /* private mode */
  }
}

const emptyDiag = (): PhoneMotionDiag => ({
  buffer: null,
  renderFps: null,
  poseFps: null,
  inferenceMs: null,
  candidate: null,
  confirmed: null,
  confirmToCallMs: null,
  reject: null,
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
  const seenRef = useRef(new Set<string>());
  const runRef = useRef<RunLives>(emptyRun());
  const hitsRef = useRef(0);
  const motionDiagRef = useRef(false);
  const frameTimesRef = useRef<number[]>([]);
  const frameDiagRef = useRef<PhoneFrameDiag>({ frameMs: null, longFrame: false });
  const diagRef = useRef<PhoneMotionDiag>(emptyDiag());
  const weightRef = useRef<number | null | undefined>(undefined);
  const cameraActiveRef = useRef(0);
  const calibRef = useRef<PhoneCalibState>(createPhoneCalibration());
  const courseBegunRef = useRef(false);
  const pendingCourseRef = useRef<"start" | "resume" | null>(null);
  const trackingPauseRef = useRef(false);
  const movesRef = useRef(false);
  const startingRef = useRef(false);
  const aliveRef = useRef(true);
  const startFromTapRef = useRef<() => Promise<void>>(async () => undefined);
  const poseRef = useRef<{ poseCount: number; framingCode: FramingCode | null; framingPause: boolean }>({
    poseCount: 0,
    framingCode: null,
    framingPause: false,
  });
  const [runId, setRunId] = useState(0);
  const [calib, setCalib] = useState<PhoneCalibState>(() => createPhoneCalibration());
  const [streamToken, setStreamToken] = useState(0);
  const [started, setStarted] = useState(false);
  const [stageNote, setStageNote] = useState<string | null>(null);
  const [poseCount, setPoseCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lives, setLives] = useState(RUN_LIVES);
  const [cameraError, setCameraError] = useState("");
  const [graphicsError, setGraphicsError] = useState("");
  const [startError, setStartError] = useState("");
  const [gameOver, setGameOver] = useState<{ score: number; coins: number; distanceM: number; obstaclesHit: number } | null>(null);
  const [demoOver, setDemoOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [weightKg, setWeightKg] = useState<number | null | undefined>(undefined);
  const [calorieText, setCalorieText] = useState("—");
  const [calorieNote, setCalorieNote] = useState<string | null>(null);
  const [motionDiag, setMotionDiag] = useState(false);
  const [diagLines, setDiagLines] = useState<string[]>(() => [
    ...phoneMotionDiagLines(emptyDiag()),
    ...phoneFrameDiagLines({ frameMs: null, longFrame: false }),
  ]);
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

  useLayoutEffect(() => {
    aliveRef.current = true;
    if (phoneSessionEngaged() && !streamRef.current && !startingRef.current) void startFromTapRef.current();
    return () => {
      aliveRef.current = false;
    };
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
    movesRef.current = false;
    courseBegunRef.current = false;
    pendingCourseRef.current = null;
    trackingPauseRef.current = false;
    poseRef.current = { poseCount: 0, framingCode: null, framingPause: false };
    calibRef.current = createPhoneCalibration();
    setCalib(calibRef.current);
    setPoseCount(0);
    estimatorRef.current?.setMode("calibrate");
    estimatorRef.current?.setRaceLive(false);
    estimatorRef.current?.setCoaching(false);
    seenRef.current.clear();
    runRef.current = emptyRun();
    hitsRef.current = 0;
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
              const previous = samples.length > 0 ? (samples[samples.length - 1] ?? 0) : 0;
              const pace = notePhoneFrameGap(previous, now);
              if (pace.frameMs !== null) {
                frameDiagRef.current = {
                  frameMs: pace.frameMs,
                  longFrame: frameDiagRef.current.longFrame || pace.longFrame,
                };
              }
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
    if (streamToken === 0) return;
    const video = videoRef.current;
    const poseCanvas = poseCanvasRef.current;
    const stream = streamRef.current;
    if (!video || !poseCanvas || !stream) return;
    let cancelled = false;
    const estimator = new PoseEstimator();
    estimatorRef.current = estimator;
    estimator.setCoaching(false);
    estimator.setRaceLive(false);
    estimator.setDiagnosticsLog(motionDiagRef.current);

    void (async () => {
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
            poseRef.current = {
              poseCount: state.poseCount,
              framingCode: state.framing?.code ?? null,
              framingPause: state.framing?.pause === true,
            };
            setPoseCount((current) => (current === state.poseCount ? current : state.poseCount));
            if (!motionDiagRef.current) return;
            diagRef.current.inferenceMs = state.rates.lastInferenceMs;
            diagRef.current.poseFps = state.rates.poseFps;
            diagRef.current.candidate = phoneGestureCandidate(state.diagnostics);
            diagRef.current.reject = state.diagnostics?.reject || "none";
            if (state.movement) diagRef.current.confirmed = state.movement;
            else if (state.diagnostics?.lastGesture) diagRef.current.confirmed = state.diagnostics.lastGesture;
          },
          onMovement: (draft) => {
            const current = handleRef.current;
            if (!current) return;
            const note = (action: string) => {
              if (!motionDiagRef.current) return;
              diagRef.current.confirmed = action;
              diagRef.current.confirmToCallMs = confirmToGameMs(draft.clientTimestamp, performance.now());
            };
            applyLocalPose({
              playing: movesRef.current,
              previewVisible: true,
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
    })();

    return () => {
      cancelled = true;
      estimator.stop();
      if (estimatorRef.current === estimator) estimatorRef.current = null;
    };
  }, [streamToken]);

  useEffect(() => {
    if (streamToken === 0) return;
    let frame = 0;
    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      const pose = poseRef.current;
      const reading = phoneBodyReading({
        poseCount: pose.poseCount,
        landmarks: estimatorRef.current?.latestLandmarks() ?? null,
        framingCode: pose.framingCode,
      });
      const next = stepPhoneCalibration(calibRef.current, {
        now: performance.now(),
        signal: reading.signal,
        guidance: reading.guidance,
        framingPause: pose.framingPause,
      });
      calibRef.current = next;
      const handle = handleRef.current;
      if (next.startCourse) pendingCourseRef.current = "start";
      if (next.resumeCourse) pendingCourseRef.current = "resume";
      if (pendingCourseRef.current === "start" && handle && !courseBegunRef.current) {
        courseBegunRef.current = true;
        pendingCourseRef.current = null;
        handle.beginCourse();
        const estimator = estimatorRef.current;
        estimator?.setMode("play");
        estimator?.setCoaching(false);
        estimator?.setRaceLive(true);
        playingRef.current = true;
        setPlaying(true);
      } else if (pendingCourseRef.current === "resume" && handle && courseBegunRef.current) {
        pendingCourseRef.current = null;
        estimatorRef.current?.resumeTracking();
        estimatorRef.current?.setRaceLive(true);
        handle.setPaused(false);
        trackingPauseRef.current = false;
        playingRef.current = true;
      }
      if (courseBegunRef.current && handle && next.coursePaused !== trackingPauseRef.current) {
        trackingPauseRef.current = next.coursePaused;
        handle.setPaused(next.coursePaused);
      }
      movesRef.current = (next.phase === "running" || next.phase === "warning") && !next.coursePaused;
      setCalib((current) => (sameCalib(current, next) ? current : next));
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [streamToken]);

  useEffect(() => {
    return () => {
      estimatorRef.current?.stop();
      estimatorRef.current = null;
      releaseCamera(streamRef.current, videoRef.current);
      streamRef.current = null;
    };
  }, []);

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
  }, [streamToken, runId]);

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
      const canvas = canvasRef.current;
      diagRef.current.buffer = canvas && canvas.width > 0 && canvas.height > 0 ? `${canvas.width}x${canvas.height}` : null;
      const frameDiag = frameDiagRef.current;
      setDiagLines([...phoneMotionDiagLines(diagRef.current), ...phoneFrameDiagLines(frameDiag)]);
      if (frameDiag.longFrame) frameDiagRef.current = { frameMs: frameDiag.frameMs, longFrame: false };
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

  async function startFromTap() {
    const video = videoRef.current;
    const root = rootRef.current;
    if (!video || !root || startingRef.current) return;
    startingRef.current = true;
    const repeat = phoneSessionEngaged();
    const play = startPhonePlay({
      requestCamera: () => openCamera(video),
      stage: repeat ? null : phoneStageCaps(root),
      onLeaveIntro: () => {
        engagePhoneSession();
        setCameraError("");
        setStarted(true);
        if (phoneAsksForLandscape(window.innerWidth, window.innerHeight)) setStageNote(PHONE_STAGE_NOTE);
      },
      onStage: (stage) => {
        if (!aliveRef.current || repeat) return;
        setStageNote(stage.note);
      },
    });
    try {
      const stream = await play.camera;
      if (!aliveRef.current) {
        releaseCamera(stream, null);
        return;
      }
      const previous = streamRef.current;
      streamRef.current = stream;
      if (previous && previous !== stream) releaseCamera(previous, null);
      poseRef.current = { poseCount: 0, framingCode: null, framingPause: false };
      calibRef.current = createPhoneCalibration();
      setCalib(calibRef.current);
      setPoseCount(0);
      setStreamToken((value) => value + 1);
    } catch (error) {
      if (!aliveRef.current) return;
      setCameraError(phoneCameraFailure(error));
    } finally {
      startingRef.current = false;
    }
  }

  startFromTapRef.current = startFromTap;

  function runTest(movementType: (typeof PHONE_TEST_CONTROLS)[number]["movementType"]) {
    const handle = handleRef.current;
    if (!handle || !motionDiagRef.current) return;
    dispatchLocalGesture(movementType, {
      jump: () => {
        diagRef.current.confirmed = "jump";
        handle.localJump();
      },
      roll: () => {
        diagRef.current.confirmed = "squat";
        handle.localRoll();
      },
      stepLane: (direction) => {
        diagRef.current.confirmed = direction < 0 ? "lean_left" : "lean_right";
        handle.localStep(direction);
      },
    });
  }

  const cameraLarge = started && calib.phase !== "running" && calib.phase !== "warning";
  const guidanceLine = poseCount > 1 ? "One person at a time" : calib.guidance;
  const showCourseHud = playing && calib.phase !== "reposition" && calib.phase !== "countdown" && calib.phase !== "ready" && calib.phase !== "finding" && calib.phase !== "adjust" && calib.phase !== "calibrating";

  return (
    <div ref={rootRef} className="phone-play fixed inset-0 overflow-hidden bg-[#8ec8ea] text-white" data-phone-play="" data-phone-orient="landscape" data-phone-phase={calib.phase}>
      <canvas ref={canvasRef} data-fitrunner-v2="" aria-label="Fit Run" className="h-full w-full" hidden={Boolean(graphicsError)} />
      <div className={cameraLarge ? "phone-cal-stage" : "phone-camera-park"} data-phone-preview={cameraLarge ? "shown" : "hidden"}>
        <div className="phone-cal-flip">
          <video ref={videoRef} className="phone-cal-media" muted playsInline aria-label="Camera preview" />
          <canvas ref={poseCanvasRef} className="phone-cal-media" aria-hidden="true" />
        </div>
        {cameraLarge ? (
          <>
            <CalibGuide />
            <div className="phone-calib-copy" data-phone-ready={calib.phase === "ready" ? "1" : "0"} role="status">
              {calib.status && calib.phase !== "countdown" ? (
                <p className="phone-calib-status" data-phone-status="">
                  {calib.status}
                </p>
              ) : null}
              {calib.phase === "ready" ? <p className="phone-calib-ready">{PHONE_PLAYER_READY}</p> : null}
              {calib.phase === "countdown" && calib.countdown && calib.countdown !== "GO" ? (
                <p className="phone-calib-count" data-phone-countdown="">
                  {calib.countdown}
                </p>
              ) : null}
              {guidanceLine ? (
                <p className="phone-calib-guidance" data-phone-guidance="">
                  {guidanceLine}
                </p>
              ) : null}
              {stageNote ? <p className="phone-calib-note">{stageNote}</p> : null}
              {cameraError ? (
                <p className="phone-calib-note" role="alert">
                  {cameraError}
                </p>
              ) : null}
              {startError ? <p className="phone-calib-note">{startError}</p> : null}
              {cameraError ? (
                <button type="button" className="phone-start" onClick={() => void startFromTap()}>
                  Try again
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {calib.countdown === "GO" ? (
        <p className="phone-go" data-phone-countdown="">
          GO
        </p>
      ) : null}
      <div className="phone-hud-layer" hidden={!showCourseHud}>
          <div className="phone-hud-top">
            <div className="phone-banners">
              {calib.phase === "warning" ? (
                <p data-phone-frame="" role="status" className="phone-frame">
                  {BODY_LEFT_MESSAGE}
                </p>
              ) : null}
            </div>
            <div className="phone-score-row">
              <PlayScoreCard
                hidden={Boolean(gameOver)}
                scoreRef={playScoreRef}
                distanceRef={distanceRef}
                timeRef={timeRef}
                calories={calorieText}
                note={calorieNote}
                keyboard={false}
                className="phone-score"
              />
            </div>
          </div>
          <div className="phone-hud-spacer" />
          <div className="phone-hud-bottom">
            <div className="phone-controls">
              <LivesHearts hidden={Boolean(gameOver)} lives={lives} />
              {!gameOver && !demoOver ? (
                <div className="phone-actions">
                  <button
                    type="button"
                    aria-pressed={paused}
                    onClick={() => {
                      if (calib.coursePaused) return;
                      handleRef.current?.setPaused(!paused);
                    }}
                  >
                    {paused ? "Resume" : "Pause"}
                  </button>
                  <button type="button" aria-pressed={!muted} onClick={() => handleRef.current?.setMuted(!muted)}>
                    {muted ? "Sound off" : "Sound on"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      {!started && !graphicsError && !gameOver && !demoOver ? (
        <div className="phone-mirror-screen" data-phone-mirror="">
          <div className="phone-mirror-copy">
            <p className="text-xs tracking-[0.16em] text-[#d6ff4a]">Fit Run</p>
            <h1 className="mt-3 font-display text-4xl text-white">Play on this phone</h1>
            <p className="mt-3 max-w-md text-base text-white/80">{PHONE_MIRROR_NOTE}</p>
            <ul className="mt-4 space-y-1 text-sm text-[#d6ff4a]">
              {PHONE_MIRROR_GUIDE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <PhoneLaptopQr />
            {cameraError ? <p className="mt-4 max-w-md text-base text-white">{cameraError}</p> : null}
            {startError ? <p className="mt-4 max-w-md text-base text-white">{startError}</p> : null}
            <button type="button" className="phone-start" onClick={() => void startFromTap()}>
              {cameraError ? "Try again" : "Play"}
            </button>
          </div>
        </div>
      ) : null}
      {motionDiag ? (
        <aside data-phone-motiondiag="" className="phone-motion-diag rounded-xl border border-white/15 bg-[#10141ce6] p-3 text-[11px] leading-relaxed text-[#d5deea]">
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
            clearPhoneSession();
            window.location.assign("/games");
          }}
        />
      ) : null}
    </div>
  );
}
