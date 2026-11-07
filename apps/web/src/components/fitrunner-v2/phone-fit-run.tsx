"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyObstacleHit, beginRun, emptyRun, HIT_INVULNERABILITY_MS, RUN_LIVES, type RunLives } from "@fitplay/shared";
import { createFitRunAudio, fitRunBedAction, hearFitRunMove, type FitRunAudio } from "@/components/fitrunner-v2/fit-run-audio";
import { GameOverScreen } from "@/components/fitrunner-v2/game-over";
import { LivesHearts } from "@/components/fitrunner-v2/lives-hearts";
import {
  createPhoneCalibration,
  phoneBodyReading,
  phoneCalibMachine,
  phoneFullscreenKeepsPlay,
  phoneStageCaps,
  phoneStandGuidance,
  phoneStandHolding,
  startPhonePlay,
  stepPhoneCalibration,
  stepPhoneKeyboardCalibration,
  PHONE_MOBILE_STAGE_NOTE,
  PHONE_PLAYER_READY,
  PHONE_STABLE_MS,
  PHONE_STAGE_NOTE,
  PHONE_STAND_OK,
  PHONE_STAND_QUIET,
  PHONE_STAND_SENTENCE,
  PHONE_VISIBILITY_FLOOR,
  type PhoneCalibState,
  type PhoneStandZones,
} from "@/components/fitrunner-v2/phone-calibration";
import {
  applyLocalPose,
  applyPhonePlayViewport,
  confirmToGameMs,
  dispatchLocalGesture,
  phoneAsksForLandscape,
  phoneCourseStartStalled,
  phoneHudCardWidth,
  phoneMotionLogText,
  phonePendingCourseAfterEdge,
  phonePlayViewportBox,
  phoneCameraFailure,
  phoneGestureCandidate,
  phoneKeyboardTestEnabled,
  phoneMotionDiagEnabled,
  phoneMotionDiagLines,
  phoneObstacleCounts,
  phonePlayCalories,
  phonePrefersLandscape,
  phoneRunSeed,
  phoneShouldEnterCourse,
  phoneShowsCalibrationStage,
  FIT_RUN_HOW_TO_PLAY,
  LAPTOP_PLAY_NOTE,
  PHONE_COURSE_STARTING_LINE,
  PHONE_COURSE_START_STALL_MESSAGE,
  PHONE_MIRROR_NOTE,
  PHONE_ROTATE_LINE,
  PHONE_TV_MIRROR_GUIDES,
  PHONE_TV_MIRROR_NOTE,
  PHONE_TEST_CONTROLS,
  PHONE_TEST_CONTROLS_LABEL,
  renderLoopFps,
  type PhoneCourseStartIntent,
  type PhoneDisplayMode,
  type PhoneMotionDiag,
  type PhoneMotionLogRecord,
} from "@/components/fitrunner-v2/phone-local-play";
import { neutralFromLandmarks } from "@fitplay/game";
import { PlayScoreCard } from "@/components/fitrunner-v2/play-score-card";
import type { FitRunnerHandle } from "@/components/fitrunner-v2/create-fitrunner";
import { notePhoneFrameGap, phoneFrameDiagLines, type PhoneFrameDiag } from "@/components/fitrunner-v2/runner-clock";
import { parseWeightKg } from "@/lib/fitrunner-v2/calories";
import { cameraActiveStep } from "@/lib/fitrunner-v2/play-calories";
import { whatsappUrl } from "@/lib/whatsapp";
import {
  BODY_LEFT_MESSAGE,
  BODY_LEFT_SHORT_MESSAGE,
  MODEL_FAILED_MESSAGE,
  TRACKER_LOADING_MESSAGE,
} from "@/lib/vision/camera-status";
import type { FramingCode } from "@/lib/vision/framing";
import { openCamera, PoseEstimator, preloadPoseLandmarker, releaseCamera } from "@/lib/vision/pose-estimator";
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

function sameZones(current: PhoneStandZones, next: PhoneStandZones) {
  return current.head === next.head && current.shoulders === next.shoulders && current.knees === next.knees;
}

function CalibGuide({ zones, holding }: { zones: PhoneStandZones; holding: boolean }) {
  const shown = holding ? PHONE_STAND_OK : zones;
  return (
    <svg
      className="phone-calib-guide"
      viewBox="-80 0 980 608"
      role="img"
      aria-label="Standing guide. Fit your head, shoulders, and knees inside the figure."
      data-phone-stand={holding ? "hold" : "place"}
    >
      <g className="phone-stand-body" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round">
        <path d="M400 124 V158" />
        <path d="M292 178 L258 268" />
        <path d="M508 178 L542 268" />
        <path d="M400 178 V300" />
        <path d="M400 300 L318 400" />
        <path d="M400 300 L482 400" />
        <path d="M318 468 L286 578" />
        <path d="M482 468 L514 578" />
        <path d="M254 578 H318" />
        <path d="M482 578 H546" />
      </g>
      <g data-phone-zone="head" data-phone-zone-state={shown.head}>
        <ellipse className="phone-zone-spot" cx="400" cy="70" rx="62" ry="66" />
        <ellipse cx="400" cy="70" rx="46" ry="50" fill="none" stroke="currentColor" strokeWidth="18" />
        <path d="M450 70 H548" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <text x="560" y="86">Head</text>
      </g>
      <g data-phone-zone="shoulders" data-phone-zone-state={shown.shoulders}>
        <rect className="phone-zone-spot" x="276" y="150" width="248" height="52" rx="26" />
        <path d="M292 178 H508" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
        <path d="M508 178 H548" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <text x="560" y="190">Shoulders</text>
      </g>
      <g data-phone-zone="knees" data-phone-zone-state={shown.knees}>
        <rect className="phone-zone-spot" x="286" y="400" width="228" height="68" rx="34" />
        <circle cx="318" cy="434" r="22" fill="none" stroke="currentColor" strokeWidth="12" />
        <circle cx="482" cy="434" r="22" fill="none" stroke="currentColor" strokeWidth="12" />
        <path d="M508 434 H548" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <text x="560" y="446">Knees</text>
      </g>
    </svg>
  );
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

export function PhoneFitRun({
  demoLimitSeconds,
  surface = "phone",
  display = "phone",
}: {
  demoLimitSeconds: number | null;
  surface?: "phone" | "laptop";
  /** Phone route only: `tv` shows mirror-to-TV steps; Mobile Only keeps the plain intro. */
  display?: PhoneDisplayMode;
}) {
  const showTvMirror = surface === "phone" && display === "tv";
  /** Mobile Only stays portrait. TV + laptop still request landscape on Play. */
  const wantsLandscape = surface === "laptop" || phonePrefersLandscape(display);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const baselineSamplesRef = useRef<NonNullable<ReturnType<typeof neutralFromLandmarks>>[]>([]);
  const motionLogRef = useRef<PhoneMotionLogRecord[]>([]);
  const handleRef = useRef<FitRunnerHandle | null>(null);
  const audioRef = useRef<FitRunAudio | null>(null);
  const mutedRef = useRef(false);
  const endedRef = useRef(false);
  const estimatorRef = useRef<PoseEstimator | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playScoreRef = useRef<HTMLParagraphElement>(null);
  const distanceRef = useRef<HTMLElement>(null);
  const timeRef = useRef<HTMLElement>(null);
  const jumpCountRef = useRef<HTMLElement>(null);
  const squatCountRef = useRef<HTMLElement>(null);
  const rightCountRef = useRef<HTMLElement>(null);
  const leftCountRef = useRef<HTMLElement>(null);
  const coinsCountRef = useRef<HTMLElement>(null);
  const caloriesRef = useRef<HTMLElement>(null);
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
  const pendingCourseRef = useRef<PhoneCourseStartIntent>(null);
  const pendingCourseSinceRef = useRef<number | null>(null);
  const trackingPauseRef = useRef(false);
  const movesRef = useRef(false);
  const startingRef = useRef(false);
  const aliveRef = useRef(true);
  const poseRef = useRef<{ poseCount: number; framingCode: FramingCode | null; framingPause: boolean }>({
    poseCount: 0,
    framingCode: null,
    framingPause: false,
  });
  const [runId, setRunId] = useState(0);
  const [calib, setCalib] = useState<PhoneCalibState>(() => createPhoneCalibration());
  const [standZones, setStandZones] = useState<PhoneStandZones>(PHONE_STAND_QUIET);
  const [streamToken, setStreamToken] = useState(0);
  const [started, setStarted] = useState(false);
  const [stageNote, setStageNote] = useState<string | null>(null);
  const [poseCount, setPoseCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lives, setLives] = useState(RUN_LIVES);
  const [cameraError, setCameraError] = useState("");
  const [trackerReady, setTrackerReady] = useState(false);
  const [graphicsError, setGraphicsError] = useState("");
  const [startError, setStartError] = useState("");
  const [gameOver, setGameOver] = useState<{ score: number; coins: number; distanceM: number; obstaclesHit: number } | null>(null);
  const [demoOver, setDemoOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [weightKg, setWeightKg] = useState<number | null | undefined>(undefined);
  const [calorieNote, setCalorieNote] = useState<string | null>(null);
  const [motionDiag, setMotionDiag] = useState(false);
  const [keyboardTest, setKeyboardTest] = useState(false);
  const keyboardTestRef = useRef(false);
  const [diagLines, setDiagLines] = useState<string[]>(() => [
    ...phoneMotionDiagLines(emptyDiag()),
    ...phoneFrameDiagLines({ frameMs: null, longFrame: false }),
  ]);
  weightRef.current = weightKg;
  mutedRef.current = muted;
  endedRef.current = Boolean(gameOver) || demoOver;

  function readKeyboardTestFlag() {
    if (typeof window === "undefined") return false;
    return phoneKeyboardTestEnabled(window.location.search, window.location.hostname);
  }

  function cameraStreamLive() {
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    return tracks.some((track) => track.readyState === "live");
  }

  /** Latch GO → beginCourse. Also used when the WebGL handle arrives after countdown. */
  function enterPhoneCourse(handle: FitRunnerHandle, intent: "start" | "resume") {
    if (intent === "start") {
      courseBegunRef.current = true;
      pendingCourseRef.current = null;
      pendingCourseSinceRef.current = null;
      handle.beginCourse();
      estimatorRef.current?.setMode("play");
      estimatorRef.current?.setCoaching(false);
      estimatorRef.current?.setRaceLive(true);
      playingRef.current = true;
      setPlaying(true);
      setStartError("");
      return;
    }
    pendingCourseRef.current = null;
    pendingCourseSinceRef.current = null;
    estimatorRef.current?.resumeTracking();
    estimatorRef.current?.setRaceLive(true);
    handle.setPaused(false);
    trackingPauseRef.current = false;
    playingRef.current = true;
  }

  function latchPendingCourse(edge: { startCourse: boolean; resumeCourse: boolean }, now: number) {
    const next = phonePendingCourseAfterEdge(pendingCourseRef.current, edge);
    if (next === "start" && pendingCourseRef.current !== "start") pendingCourseSinceRef.current = now;
    else if (next !== "start") pendingCourseSinceRef.current = null;
    pendingCourseRef.current = next;
  }

  /** After a WebGL remount, startCourse edge is gone but calib still says the run began. */
  function rearmPendingStartFromCalib(now: number) {
    if (courseBegunRef.current || playingRef.current) return;
    if (!calibRef.current.runStarted) return;
    if (pendingCourseRef.current === "start") return;
    pendingCourseRef.current = "start";
    pendingCourseSinceRef.current = now;
  }

  function flushPendingCourse(handle: FitRunnerHandle | null, now = performance.now()) {
    rearmPendingStartFromCalib(now);
    const intent = phoneShouldEnterCourse({
      pending: pendingCourseRef.current,
      hasHandle: Boolean(handle),
      courseBegun: courseBegunRef.current,
    });
    if (!intent || !handle) {
      if (
        phoneCourseStartStalled({
          pending: pendingCourseRef.current,
          courseBegun: courseBegunRef.current,
          pendingSince: pendingCourseSinceRef.current,
          now,
        })
      ) {
        setStartError((current) => (current === PHONE_COURSE_START_STALL_MESSAGE ? current : PHONE_COURSE_START_STALL_MESSAGE));
      }
      return;
    }
    enterPhoneCourse(handle, intent);
  }

  const publishCaloriesRef = useRef<(ms: number, cameraLive: boolean) => void>(() => {});
  publishCaloriesRef.current = (ms, cameraLive) => {
    const view = phonePlayCalories({ weightKg: weightRef.current, cameraActiveMs: ms, cameraLive });
    const cal = caloriesRef.current;
    if (cal && cal.textContent !== view.text) cal.textContent = view.text;
    setCalorieNote((current) => (current === view.note ? current : view.note));
  };

  useLayoutEffect(() => {
    const keys = readKeyboardTestFlag();
    keyboardTestRef.current = keys;
    setKeyboardTest(keys);
  }, []);

  useEffect(() => {
    const search = window.location.search;
    const host = window.location.hostname;
    const on = phoneMotionDiagEnabled(search, host);
    motionDiagRef.current = on;
    setMotionDiag(on);
    const keys = phoneKeyboardTestEnabled(search, host);
    keyboardTestRef.current = keys;
    setKeyboardTest(keys);
  }, []);

  useLayoutEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current ?? createFitRunAudio();
    audioRef.current = audio;
    audio.preload();
    return () => {
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, []);

  /** Warm MediaPipe WASM + lite model while the intro is on screen. */
  useEffect(() => {
    void preloadPoseLandmarker();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const soundOn = !muted;
    audio.setSoundOn(soundOn);
    audio.syncBed(
      fitRunBedAction({
        phase: calib.phase,
        coursePaused: calib.coursePaused,
        buttonPaused: paused,
        soundOn,
        ended: Boolean(gameOver) || demoOver,
      }),
    );
  }, [calib.phase, calib.coursePaused, paused, muted, gameOver, demoOver]);

  useLayoutEffect(() => {
    let pinnedW = 0;
    let pinnedH = 0;
    let pinnedLeft = 0;
    let pinnedTop = 0;
    const apply = () => {
      const root = rootRef.current;
      const canvas = canvasRef.current;
      const viewport = window.visualViewport;
      const box = phonePlayViewportBox({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        visualWidth: viewport?.width,
        visualHeight: viewport?.height,
        offsetLeft: viewport?.offsetLeft,
        offsetTop: viewport?.offsetTop,
      });
      if (root) applyPhonePlayViewport(root, box);
      if (canvas) applyPhonePlayViewport(canvas, box);
      const card = root?.querySelector("[data-fitrunner-play-hud]");
      if (card instanceof HTMLElement) {
        if (card.dataset.hudLayout === "compact") {
          card.style.width = "";
          card.style.maxWidth = "";
        } else {
          const width = phoneHudCardWidth(box.width);
          card.style.width = `${width}px`;
          card.style.maxWidth = `${width}px`;
        }
      }
      // After the CSS box or visualViewport offset changes, nudge Fit Run so buffer/attrs catch up.
      const moved =
        box.width !== pinnedW ||
        box.height !== pinnedH ||
        box.left !== pinnedLeft ||
        box.top !== pinnedTop;
      if (moved) {
        pinnedW = box.width;
        pinnedH = box.height;
        pinnedLeft = box.left;
        pinnedTop = box.top;
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
        });
      }
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
    };
  }, [playing, calib.phase]);

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
  }, [wantsLandscape]);

  useEffect(() => {
    const mark = () => {
      if (!phoneFullscreenKeepsPlay(true)) return;
      const node = rootRef.current;
      if (!node) return;
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const active = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      node.dataset.phoneFullscreen = active ? "1" : "0";
    };
    document.addEventListener("fullscreenchange", mark);
    document.addEventListener("webkitfullscreenchange", mark);
    return () => {
      document.removeEventListener("fullscreenchange", mark);
      document.removeEventListener("webkitfullscreenchange", mark);
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
    pendingCourseSinceRef.current = null;
    trackingPauseRef.current = false;
    poseRef.current = { poseCount: 0, framingCode: null, framingPause: false };
    calibRef.current = createPhoneCalibration();
    setCalib(calibRef.current);
    setStandZones(PHONE_STAND_QUIET);
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
            tokens: coinsCountRef.current,
            jumps: jumpCountRef.current,
            squats: squatCountRef.current,
            laneLeft: leftCountRef.current,
            laneRight: rightCountRef.current,
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
              const bytes = new Uint32Array(1);
              crypto.getRandomValues(bytes);
              const seed = phoneRunSeed(bytes[0] ?? 1);
              const started = beginRun(emptyRun());
              const run = { ...started.run, courseSeed: seed, courseCeiling: "beginner" as const };
              runRef.current = run;
              hitsRef.current = 0;
              handleRef.current?.applyCourse({ seed, ceiling: run.courseCeiling });
              handleRef.current?.setLives(run.lives);
              if (!cancelled) setLives(run.lives);
            },
            onHit: (hit) => {
              const run = runRef.current;
              if (!phoneObstacleCounts(run.courseSeed ?? 0, run.courseCeiling, hit.obstacleId)) {
                const current = handleRef.current;
                current?.dropHit(hit.obstacleId);
                current?.releaseLivesHold();
                return;
              }
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
          {
            holdCourse: true,
            demoLimitSeconds,
            drawProfile: "phone",
            /** Local `?keyboard=1` only. Production phone path keeps keyboard off. */
            acceptKeyboard: keyboardTest,
            /** Mobile Only portrait framing. Laptop + Play on TV keep landscape. */
            cameraFraming: wantsLandscape ? "landscape" : "portrait-when-tall",
          },
        ),
      )
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        handle = next;
        handleRef.current = next;
        // iPhone Safari often finishes GLB load after countdown GO. Flush immediately.
        flushPendingCourse(next);
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
  }, [demoLimitSeconds, keyboardTest, runId, wantsLandscape]);

  useEffect(() => {
    if (streamToken === 0) return;
    const video = videoRef.current;
    const poseCanvas = poseCanvasRef.current;
    const stream = streamRef.current;
    /** Keyboard test can run with no stream; pose pipeline stays off until a camera opens. */
    if (!video || !poseCanvas || !stream) return;
    let cancelled = false;
    setTrackerReady(false);
    const estimator = new PoseEstimator();
    estimatorRef.current = estimator;
    estimator.setCoaching(false);
    estimator.setRaceLive(false);
    estimator.setDeferBaseline(true);
    estimator.setDiagnosticsLog(motionDiagRef.current);

    void (async () => {
      try {
        await estimator.load();
      } catch {
        if (!cancelled) {
          setTrackerReady(false);
          setCameraError(MODEL_FAILED_MESSAGE);
        }
        return;
      }
      if (cancelled) return;
      setTrackerReady(true);
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
            diagRef.current.inferStartMs = state.rates.inferenceStartMs;
            diagRef.current.inferEndMs = state.rates.inferenceEndMs;
            diagRef.current.poseAtMs = state.diagnostics?.poseAtMs ?? null;
            diagRef.current.gestureAtMs = state.diagnostics?.gestureAtMs ?? null;
            diagRef.current.candidateAtMs = state.diagnostics?.candidateAtMs ?? null;
            diagRef.current.candidateToEmitMs = confirmToGameMs(
              state.diagnostics?.candidateAtMs,
              state.diagnostics?.gestureAtMs ?? Number.NaN,
            );
            diagRef.current.recognition = state.diagnostics?.recognition ?? null;
            if (state.movement && typeof diagRef.current.callAtMs === "number") {
              diagRef.current.endToCallMs = confirmToGameMs(state.rates.inferenceEndMs, diagRef.current.callAtMs);
            }
            diagRef.current.candidate = phoneGestureCandidate(state.diagnostics);
            diagRef.current.reject = state.diagnostics?.reject || "none";
            if (state.movement) diagRef.current.confirmed = state.movement;
            else if (state.diagnostics?.lastGesture) diagRef.current.confirmed = state.diagnostics.lastGesture;
            if (state.diagnostics) {
              diagRef.current.hip = state.diagnostics.hipDrop;
              diagRef.current.shoulder = state.diagnostics.torsoLean;
              const leftKnee = state.diagnostics.joints?.includes("L knee");
              const rightKnee = state.diagnostics.joints?.includes("R knee");
              diagRef.current.knee = leftKnee && rightKnee ? state.diagnostics.kneeAngle : null;
            }
          },
          onMovement: (draft) => {
            const current = handleRef.current;
            if (!current) return;
            const note = (action: string) => {
              if (!motionDiagRef.current) return;
              const called = performance.now();
              diagRef.current.confirmed = action;
              diagRef.current.callAtMs = called;
              diagRef.current.confirmToCallMs = confirmToGameMs(draft.clientTimestamp, called);
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
                  hearFitRunMove(audioRef.current, {
                    call: "jump",
                    direction: 0,
                    accepted: current.localJump(draft.confidence, draft.eventId),
                    soundOn: !mutedRef.current,
                  });
                },
                roll: () => {
                  note("squat");
                  hearFitRunMove(audioRef.current, {
                    call: "roll",
                    direction: 0,
                    accepted: current.localRoll(draft.confidence, draft.eventId),
                    soundOn: !mutedRef.current,
                  });
                },
                stepLane: (direction) => {
                  note(direction < 0 ? "lean_left" : "lean_right");
                  hearFitRunMove(audioRef.current, {
                    call: "step",
                    direction,
                    accepted: current.localStep(direction, draft.confidence, draft.eventId),
                    soundOn: !mutedRef.current,
                  });
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
      setTrackerReady(false);
      estimator.stop();
      if (estimatorRef.current === estimator) estimatorRef.current = null;
      void preloadPoseLandmarker();
    };
  }, [streamToken]);

  useEffect(() => {
    if (streamToken === 0) return;
    let frame = 0;
    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      const pose = poseRef.current;
      const marks = estimatorRef.current?.latestLandmarks() ?? null;
      const reading = phoneBodyReading({
        poseCount: pose.poseCount,
        landmarks: marks,
        framingCode: pose.framingCode,
      });
      const now = performance.now();
      const estimator = estimatorRef.current;
      const keyboardBypass = keyboardTestRef.current || readKeyboardTestFlag();
      const holdStarted = calibRef.current.holdStartedAt;
      const stableFor = holdStarted === null ? 0 : now - holdStarted;
      if (!keyboardBypass) {
        if (reading.signal === "none") baselineSamplesRef.current = [];
        else if (estimator && !estimator.hasSessionBaseline() && stableFor >= PHONE_STABLE_MS && reading.standing && marks) {
          const poseSample = neutralFromLandmarks(marks);
          if (poseSample) {
            baselineSamplesRef.current.push(poseSample);
            if (baselineSamplesRef.current.length > 11) baselineSamplesRef.current.shift();
          }
          if (baselineSamplesRef.current.length >= 5) estimator.commitSessionBaseline(baselineSamplesRef.current);
        }
      }
      const collecting = !keyboardBypass && stableFor >= PHONE_STABLE_MS && !estimator?.hasSessionBaseline();
      const next = keyboardBypass
        ? stepPhoneKeyboardCalibration(calibRef.current, now)
        : stepPhoneCalibration(calibRef.current, {
            now,
            signal: reading.signal,
            guidance: reading.guidance,
            framingPause: pose.framingPause,
            baselineReady: collecting ? false : undefined,
          });
      if (!keyboardBypass && (next.phase === "finding" || next.phase === "reposition") && estimator?.hasSessionBaseline()) {
        estimator.clearSessionBaseline();
        baselineSamplesRef.current = [];
      }
      calibRef.current = next;
      const handle = handleRef.current;
      latchPendingCourse({ startCourse: next.startCourse, resumeCourse: next.resumeCourse }, now);
      flushPendingCourse(handle, now);
      if (courseBegunRef.current && handle && next.coursePaused !== trackingPauseRef.current) {
        trackingPauseRef.current = next.coursePaused;
        handle.setPaused(next.coursePaused);
      }
      movesRef.current = (next.phase === "running" || next.phase === "warning") && !next.coursePaused;
      setCalib((current) => (sameCalib(current, next) ? current : next));
      setStandZones((current) => (sameZones(current, reading.zones) ? current : reading.zones));
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
      const keysOnly = keyboardTestRef.current || !live;
      const delta = cameraActiveStep({ deltaMs: now - last, keyboardOnly: keysOnly, courseLive: !keysOnly && courseLive });
      last = now;
      if (!keysOnly && live && delta > 0) cameraActiveRef.current += delta;
      publishCaloriesRef.current(keysOnly ? 0 : live ? cameraActiveRef.current : 0, !keysOnly && live);
    }, 200);
    return () => window.clearInterval(timer);
  }, [playing, paused, demoOver, runId]);

  useEffect(() => {
    if (!motionDiag) return;
    const timer = window.setInterval(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const marks = estimatorRef.current?.latestLandmarks() ?? null;
      const leftKnee = marks?.[25];
      const rightKnee = marks?.[26];
      const kneesSeen = Boolean(
        leftKnee && rightKnee && (leftKnee.visibility ?? 0) >= PHONE_VISIBILITY_FLOOR && (rightKnee.visibility ?? 0) >= PHONE_VISIBILITY_FLOOR,
      );
      diagRef.current.buffer = canvas && canvas.width > 0 && canvas.height > 0 ? `${canvas.width}x${canvas.height}` : null;
      diagRef.current.camera = video && video.videoWidth > 0 ? `${video.videoWidth}x${video.videoHeight}` : null;
      diagRef.current.stability = calibRef.current.phase;
      diagRef.current.calibration = calibRef.current.machine ?? phoneCalibMachine(calibRef.current);
      if (marks) {
        const indexes = [0, 11, 12, 23, 24, 25, 26];
        let total = 0;
        let count = 0;
        for (const index of indexes) {
          const point = marks[index];
          if (!point || !Number.isFinite(point.x)) continue;
          total += point.visibility ?? 0;
          count += 1;
        }
        if (count > 0) diagRef.current.confidence = total / count;
      }
      const baseline = estimatorRef.current?.sessionBaseline();
      diagRef.current.baseline = baseline
        ? `torso ${baseline.torso.toFixed(3)} hip ${baseline.hipY.toFixed(3)} shoulder ${baseline.shoulderWidth.toFixed(3)} center ${baseline.centerX.toFixed(3)}`
        : null;
      if (!kneesSeen) diagRef.current.knee = null;
      else if (diagRef.current.knee === undefined) diagRef.current.knee = null;
      const frameDiag = frameDiagRef.current;
      const lines = [...phoneMotionDiagLines(diagRef.current), ...phoneFrameDiagLines(frameDiag)];
      setDiagLines(lines);
      const log = motionLogRef.current;
      log.push({
        t: Math.round(performance.now()),
        camera: diagRef.current.camera ?? null,
        confidence: diagRef.current.confidence ?? null,
        calibration: diagRef.current.calibration ?? null,
        candidate: diagRef.current.candidate,
        confirmed: diagRef.current.confirmed,
        reject: diagRef.current.reject,
        hip: diagRef.current.hip ?? null,
        shoulder: diagRef.current.shoulder ?? null,
        knee: kneesSeen ? (diagRef.current.knee ?? null) : null,
        gameFps: diagRef.current.renderFps,
        poseFps: diagRef.current.poseFps,
        inferenceMs: diagRef.current.inferenceMs,
        confirmToCallMs: diagRef.current.confirmToCallMs,
        inferStartMs: diagRef.current.inferStartMs ?? null,
        inferEndMs: diagRef.current.inferEndMs ?? null,
        callAtMs: diagRef.current.callAtMs ?? null,
        poseAtMs: diagRef.current.poseAtMs ?? null,
        gestureAtMs: diagRef.current.gestureAtMs ?? null,
        candidateToEmitMs: diagRef.current.candidateToEmitMs ?? null,
        endToCallMs: diagRef.current.endToCallMs ?? null,
        recognition: diagRef.current.recognition ?? null,
      });
      if (log.length > 240) log.shift();
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

  function gestureAudio(next: { buttonPaused: boolean; soundOn: boolean }) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.unlock();
    audio.setSoundOn(next.soundOn);
    audio.syncBed(
      fitRunBedAction({
        phase: calib.phase,
        coursePaused: calib.coursePaused,
        buttonPaused: next.buttonPaused,
        soundOn: next.soundOn,
        ended: endedRef.current,
      }),
    );
  }

  function beginPhoneSession(keyboardBypass = false) {
    poseRef.current = { poseCount: 0, framingCode: null, framingPause: false };
    const initial = createPhoneCalibration();
    calibRef.current = keyboardBypass ? stepPhoneKeyboardCalibration(initial, performance.now()) : initial;
    setCalib(calibRef.current);
    setStandZones(keyboardBypass ? PHONE_STAND_OK : PHONE_STAND_QUIET);
    setPoseCount(0);
    setStreamToken((value) => value + 1);
  }

  function attachPhoneCamera(stream: MediaStream) {
    const previous = streamRef.current;
    streamRef.current = stream;
    if (previous && previous !== stream) releaseCamera(previous, null);
  }

  async function startFromTap() {
    const audio = audioRef.current ?? createFitRunAudio();
    audioRef.current = audio;
    audio.preload();
    audio.unlock();
    const video = videoRef.current;
    const root = rootRef.current;
    if (!video || !root || startingRef.current) return;
    startingRef.current = true;
    /** Keep model init overlapping the permission prompt / camera open. */
    void preloadPoseLandmarker();
    const keys = keyboardTestRef.current || readKeyboardTestFlag();
    keyboardTestRef.current = keys;
    const play = startPhonePlay({
      requestCamera: () => openCamera(video),
      stage: phoneStageCaps(root, {
        lockTo: wantsLandscape ? "landscape" : false,
        incompleteNote: wantsLandscape ? PHONE_STAGE_NOTE : PHONE_MOBILE_STAGE_NOTE,
      }),
      onLeaveIntro: () => {
        setCameraError("");
        setStarted(true);
        setStageNote(wantsLandscape ? PHONE_STAGE_NOTE : PHONE_MOBILE_STAGE_NOTE);
      },
      onStage: (stage) => {
        if (!aliveRef.current) return;
        setStageNote(stage.note);
      },
    });
    try {
      /**
       * Local `?keyboard=1`: start countdown immediately. Camera is best-effort and
       * must not block on permission, Finding Player, or framing.
       */
      if (keys) {
        beginPhoneSession(true);
        void play.camera.then(
          (stream) => {
            if (!aliveRef.current) {
              releaseCamera(stream, null);
              return;
            }
            attachPhoneCamera(stream);
            setStreamToken((value) => value + 1);
          },
          () => {
            /* keyboard play continues without a camera */
          },
        );
        return;
      }
      try {
        const stream = await play.camera;
        if (!aliveRef.current) {
          releaseCamera(stream, null);
          return;
        }
        attachPhoneCamera(stream);
      } catch (error) {
        if (!aliveRef.current) return;
        setCameraError(phoneCameraFailure(error, surface));
        return;
      }
      if (!aliveRef.current) return;
      beginPhoneSession();
    } finally {
      startingRef.current = false;
    }
  }

  function runTest(movementType: (typeof PHONE_TEST_CONTROLS)[number]["movementType"]) {
    const handle = handleRef.current;
    if (!handle || !motionDiagRef.current) return;
    dispatchLocalGesture(movementType, {
      jump: () => {
        diagRef.current.confirmed = "jump";
        hearFitRunMove(audioRef.current, {
          call: "jump",
          direction: 0,
          accepted: handle.localJump(),
          soundOn: !mutedRef.current,
        });
      },
      roll: () => {
        diagRef.current.confirmed = "squat";
        hearFitRunMove(audioRef.current, {
          call: "roll",
          direction: 0,
          accepted: handle.localRoll(),
          soundOn: !mutedRef.current,
        });
      },
      stepLane: (direction) => {
        diagRef.current.confirmed = direction < 0 ? "lean_left" : "lean_right";
        hearFitRunMove(audioRef.current, {
          call: "step",
          direction,
          accepted: handle.localStep(direction),
          soundOn: !mutedRef.current,
        });
      },
    });
  }

  const cameraLarge = phoneShowsCalibrationStage({ started, playing, phase: calib.phase });
  const waitingForCourse = !playing && (calib.phase === "running" || calib.countdown === "GO");
  const holding = poseCount <= 1 && phoneStandHolding(calib);
  const guidanceLine = phoneStandGuidance(calib, poseCount);
  const showCourseHud = playing && calib.phase !== "reposition" && calib.phase !== "countdown" && calib.phase !== "ready" && calib.phase !== "finding" && calib.phase !== "adjust" && calib.phase !== "calibrating";

  return (
    <div
      ref={rootRef}
      className="phone-play fixed inset-0 overflow-hidden bg-[#8ec8ea] text-white"
      data-phone-play=""
      data-phone-orient="landscape"
      data-phone-phase={calib.phase}
      data-phone-keyboard={keyboardTest ? "1" : "0"}
      data-phone-display={surface === "phone" ? display : undefined}
      data-phone-landscape={wantsLandscape ? "1" : "0"}
    >
      <canvas ref={canvasRef} data-fitrunner-v2="" aria-label="Fit Run" className="h-full w-full" hidden={Boolean(graphicsError)} />
      <div className="phone-camera-park" data-phone-preview="sliver">
        <div className="phone-cal-flip">
          <video ref={videoRef} className="phone-cal-media" muted playsInline aria-hidden="true" />
          <canvas ref={poseCanvasRef} className="phone-cal-media" aria-hidden="true" />
        </div>
      </div>
      {cameraLarge ? (
        <div className="phone-cal-stage" data-phone-calibration="black">
          <div className="phone-stand">
            <CalibGuide zones={standZones} holding={holding} />
            <p className="phone-stand-line">{PHONE_STAND_SENTENCE}</p>
            <div className="phone-calib-copy" data-phone-ready={calib.phase === "ready" ? "1" : "0"} data-phone-holding={holding ? "1" : "0"} role="status">
              {!trackerReady ? (
                <p className="phone-calib-status" data-phone-status="" data-phone-tracker="loading">
                  {TRACKER_LOADING_MESSAGE}
                </p>
              ) : waitingForCourse ? (
                <p className="phone-calib-status" data-phone-status="starting">
                  {PHONE_COURSE_STARTING_LINE}
                </p>
              ) : calib.status && calib.phase !== "countdown" ? (
                <p className="phone-calib-status" data-phone-status="">
                  {calib.status}
                </p>
              ) : null}
              {trackerReady && !waitingForCourse && calib.phase === "ready" ? <p className="phone-calib-ready">{PHONE_PLAYER_READY}</p> : null}
              {trackerReady && !waitingForCourse && calib.phase === "countdown" && calib.countdown && calib.countdown !== "GO" ? (
                <p className="phone-calib-count" data-phone-countdown="">
                  {calib.countdown}
                </p>
              ) : null}
              {trackerReady && !waitingForCourse && guidanceLine ? (
                <p className="phone-calib-guidance" data-phone-guidance="">
                  {guidanceLine}
                </p>
              ) : null}
              {stageNote && !waitingForCourse ? <p className="phone-calib-note">{stageNote}</p> : null}
              {cameraError ? (
                <p className="phone-calib-note" role="alert">
                  {cameraError}
                </p>
              ) : null}
              {startError ? (
                <p className="phone-calib-note" role="alert">
                  {startError}
                </p>
              ) : null}
              {cameraError || (startError && waitingForCourse) ? (
                <button
                  type="button"
                  className="phone-start"
                  onClick={() => {
                    if (cameraError) {
                      void startFromTap();
                      return;
                    }
                    // Stall retry: remount WebGL; flushPendingCourse rearms from runStarted.
                    setStartError("");
                    setRunId((value) => value + 1);
                  }}
                >
                  Try again
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {calib.countdown === "GO" ? (
        <p className="phone-go" data-phone-countdown="">
          GO
        </p>
      ) : null}
      <div className="phone-hud-layer" hidden={!showCourseHud}>
          <div className="phone-hud-top">
            <div className="phone-banners">
              {wantsLandscape ? (
                <p className="phone-rotate" role="status">
                  {PHONE_ROTATE_LINE}
                </p>
              ) : null}
              {calib.phase === "warning" ? (
                <p data-phone-frame="" role="status" className="phone-frame">
                  {wantsLandscape ? BODY_LEFT_MESSAGE : BODY_LEFT_SHORT_MESSAGE}
                </p>
              ) : null}
            </div>
            <div className="phone-score-row">
              <PlayScoreCard
                hidden={Boolean(gameOver)}
                scoreRef={playScoreRef}
                distanceRef={distanceRef}
                timeRef={timeRef}
                jumpRef={jumpCountRef}
                squatRef={squatCountRef}
                rightRef={rightCountRef}
                leftRef={leftCountRef}
                coinsRef={coinsCountRef}
                caloriesRef={caloriesRef}
                note={calorieNote}
                keyboard={keyboardTest}
                className="phone-score"
                layout={wantsLandscape ? "full" : "compact"}
              />
            </div>
            {!wantsLandscape && !gameOver && !demoOver ? (
              <button
                type="button"
                className="phone-pause-fab"
                aria-label={paused ? "Resume" : "Pause"}
                aria-pressed={paused}
                onClick={() => {
                  if (calib.coursePaused) return;
                  const nextPaused = !paused;
                  gestureAudio({ buttonPaused: nextPaused, soundOn: !muted });
                  handleRef.current?.setPaused(nextPaused);
                }}
              >
                {paused ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M8 5.5v13l11-6.5L8 5.5Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M7 5h3.5v14H7V5Zm6.5 0H17v14h-3.5V5Z" />
                  </svg>
                )}
              </button>
            ) : null}
          </div>
          <div className="phone-hud-spacer" />
          <div className="phone-hud-bottom">
            <div className="phone-controls">
              <LivesHearts hidden={Boolean(gameOver)} lives={lives} />
              {!gameOver && !demoOver ? (
                <div className="phone-actions">
                  {wantsLandscape ? (
                    <button
                      type="button"
                      aria-pressed={paused}
                      onClick={() => {
                        if (calib.coursePaused) return;
                        const nextPaused = !paused;
                        gestureAudio({ buttonPaused: nextPaused, soundOn: !muted });
                        handleRef.current?.setPaused(nextPaused);
                      }}
                    >
                      {paused ? "Resume" : "Pause"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-pressed={!muted}
                    onClick={() => {
                      const nextMuted = !muted;
                      gestureAudio({ buttonPaused: paused, soundOn: !nextMuted });
                      handleRef.current?.setMuted(nextMuted);
                    }}
                  >
                    {muted ? "Sound off" : "Sound on"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      {!started && !graphicsError && !gameOver && !demoOver ? (
        <div
          className="phone-mirror-screen"
          data-phone-mirror=""
          data-play-surface={surface}
          data-phone-display={surface === "phone" ? display : undefined}
        >
          <div className="phone-mirror-copy">
            <p className="text-xs tracking-[0.16em] text-[#d6ff4a]">Fit Run</p>
            <h1 className="mt-3 font-display text-4xl text-white">
              {surface === "laptop" ? "Play on this laptop" : showTvMirror ? "Play on TV" : "Play on this phone"}
            </h1>
            <p className="mt-3 max-w-md text-base text-white/80">
              {surface === "laptop" ? LAPTOP_PLAY_NOTE : showTvMirror ? PHONE_TV_MIRROR_NOTE : PHONE_MIRROR_NOTE}
            </p>
            <button type="button" className="phone-start phone-start-top" onClick={() => void startFromTap()}>
              {cameraError ? "Try again" : "PLAY NOW"}
            </button>
            <section className="phone-howto" aria-label="How to play Fit Run">
              <h2 className="phone-howto-title">How to play</h2>
              <ol className="phone-howto-grid">
                {FIT_RUN_HOW_TO_PLAY.map((line, index) => (
                  <li key={line} className="phone-howto-item">
                    <span className="phone-howto-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="phone-howto-text">{line}</span>
                  </li>
                ))}
              </ol>
            </section>
            {showTvMirror ? (
              <section className="phone-tv-mirror" aria-label="How to mirror this phone to a TV">
                <h2 className="phone-tv-mirror-title">Mirror phone to TV</h2>
                <p className="phone-tv-mirror-lead">
                  Use your phone&apos;s built-in screen mirror. The game stays on this phone.
                </p>
                <div className="phone-tv-mirror-list">
                  {PHONE_TV_MIRROR_GUIDES.map((guide) => (
                    <article key={guide.title} className="phone-tv-mirror-card">
                      <h3 className="phone-tv-mirror-platform">{guide.title}</h3>
                      <ol className="phone-tv-mirror-steps">
                        {guide.steps.map((step, index) => (
                          <li key={step} className="phone-tv-mirror-step">
                            <span className="phone-tv-mirror-index" aria-hidden="true">
                              {index + 1}
                            </span>
                            <span className="phone-tv-mirror-text">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </article>
                  ))}
                </div>
              </section>
            ) : surface === "laptop" ? (
              <p className="phone-intro-tip">
                Allow camera access, stand in frame, then wait for the countdown.
              </p>
            ) : null}
            {cameraError ? <p className="mt-4 max-w-md text-base text-white">{cameraError}</p> : null}
            {startError ? <p className="mt-4 max-w-md text-base text-white">{startError}</p> : null}
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
          <button
            type="button"
            className="mt-2 rounded-full border border-white/20 px-2 py-1"
            onClick={() => {
              const blob = new Blob([phoneMotionLogText(motionLogRef.current)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "playfit-motion-log.json";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download log
          </button>
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
