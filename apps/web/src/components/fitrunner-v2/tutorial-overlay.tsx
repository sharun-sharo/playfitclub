"use client";

import { DEFAULT_THRESHOLDS, isCalibrationCue } from "@fitplay/game";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent, RefObject } from "react";
import type { FitRunnerHandle, PoseReport } from "@/components/fitrunner-v2/create-fitrunner";
import { GESTURE_STEPS, tutorialGestureFor, type TutorialGesture } from "@/components/fitrunner-v2/tutorial-actions";
import type { TvPlayer, TvTracking } from "@/components/fitrunner-v2/use-tv-session";
import { GAME_SERVER_DISCONNECTED, isLoopbackRealtimeUrl } from "@/lib/env";

/**
 * TV guide only.
 * screen: before any join UI.
 * scan: real join QR from the host session.
 * camera: after a phone player is actually connected.
 * Gesture practice and the countdown still use the same pose events as before.
 */
type Step = "screen" | "scan" | "camera" | "howto" | "gesture" | "practice" | "countdown";

type SessionView = {
  connected: boolean;
  joinCode: string;
  joinUrl: string;
  qr: string;
  phase: string;
  countdown: number;
  countdownPurpose: "start" | "resume" | null;
  players: TvPlayer[];
  tracking: TvTracking | null;
  statusMessage: string;
  error: string;
  keyboardChosen: boolean;
  trackingSeq: number;
  trustUrl: string;
  retryRealtime: () => void;
  chooseKeyboard: () => void;
  startKeyboardRound: () => void;
};

const primary = "rounded-full bg-[#BEFF39] px-7 py-3 text-base font-semibold text-[#1c1f24] disabled:cursor-not-allowed disabled:opacity-40";
const ghost = "rounded-full border border-white/20 px-5 py-3 text-sm text-white";
const panel = "pointer-events-auto w-full max-w-xl rounded-3xl border border-white/10 bg-[#1c1f24] p-6 text-white shadow-2xl";

function livePhone(players: TvPlayer[]) {
  return players.find((player) => player.connected && player.control === "camera") ?? null;
}

function cameraSeeing(tracking: TvTracking | null, players: TvPlayer[]) {
  const phone = livePhone(players);
  if (!phone || !tracking || tracking.status === "camera_error") return false;
  if (tracking.status !== "calibrating" && tracking.status !== "ready" && tracking.status !== "tracking") return false;
  return typeof tracking.confidence === "number" && tracking.confidence >= DEFAULT_THRESHOLDS.minVisibility;
}

function stanceReady(tracking: TvTracking | null, players: TvPlayer[]) {
  const phone = players.find((player) => player.connected && player.control === "camera" && player.ready);
  if (!phone || !tracking) return false;
  if (tracking.status !== "ready" && tracking.status !== "tracking") return false;
  return typeof tracking.confidence === "number" && tracking.confidence >= DEFAULT_THRESHOLDS.minVisibility;
}

function playStepBlip() {
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 740;
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.09);
  oscillator.onended = () => void context.close().catch(() => undefined);
}

/** Beginner line from the phone's existing framing and calibration messages. No distances. */
function cameraCoach(tracking: TvTracking | null, phoneConnected: boolean) {
  if (!phoneConnected) return "Waiting for your phone.";
  const message = tracking?.message?.trim() ?? "";
  if (isCalibrationCue(message)) return message;
  const upper = message.toUpperCase();
  const confidence = tracking?.confidence;
  const dim = typeof confidence === "number" && confidence < DEFAULT_THRESHOLDS.minVisibility;
  if (tracking?.status === "camera_error" || /denied|blocked/i.test(message)) {
    return "The phone blocked the camera. Allow the camera, then try again.";
  }
  if (/no camera was found|no camera track/i.test(message)) return "This phone has no camera. You can play with the keyboard.";
  if (/disconnected|camera lost/i.test(message)) return "The phone camera turned off. Turn it back on, or play with the keyboard.";
  if (/in use by another app/i.test(message)) return "The phone camera is busy. Close the other app, then try again.";
  if (/https|secure page|insecure/i.test(message)) return "The phone needs a secure page before the camera can turn on.";
  if (upper.includes("MOVE FORWARD") || upper.includes("MOVE CLOSER")) return "Move a little closer to the phone.";
  if (upper.includes("MOVE BACK") || upper.includes("STEP BACK")) return "Move a little farther from the phone.";
  if (upper.includes("MOVE LEFT")) return "Step a little to your left.";
  if (upper.includes("MOVE RIGHT")) return "Step a little to your right.";
  if (upper.includes("ADJUST PHONE ANGLE")) return "Adjust the phone angle until your whole body fits.";
  if (upper.includes("TILT YOUR PHONE UP")) return "Tilt the phone up until your whole body fits.";
  if (upper.includes("TILT YOUR PHONE DOWN")) return "Tilt the phone down until your whole body fits.";
  if (
    upper.includes("KEEP YOUR FEET") ||
    upper.includes("FEET ARE VISIBLE") ||
    upper.includes("FULL BODY") ||
    upper.includes("MAKE SPACE") ||
    upper.includes("NOT IN FRAME") ||
    upper.includes("SHOULDERS") ||
    upper.includes("ANKLES") ||
    upper.includes("HIPS") ||
    upper.includes("KNEES")
  ) {
    return "Show your full body, from your head to your feet.";
  }
  if (upper.includes("HOLD STILL") || upper.includes("STAY STILL") || upper.includes("TOO MUCH MOVEMENT")) {
    return "Hold the phone steady and stand still.";
  }
  if (upper.includes("PERFECT POSITION") || upper.includes("PERFECT") || upper.includes("BODY VERIFIED") || upper.includes("CALIBRATED")) {
    return dim ? "Add more light, then hold still." : "Hold still. The run starts on its own.";
  }
  if (upper.includes("ADJUST THE CAMERA") || upper.includes("LOST YOU") || upper.includes("MOVE BACK")) {
    return dim ? "We can't see you clearly. Add more light and show your whole body." : "Face the phone and show your whole body.";
  }
  if (dim && (tracking?.status === "calibrating" || tracking?.status === "ready" || tracking?.status === "tracking")) {
    return "Add more light, then hold the phone steady.";
  }
  if (!tracking || tracking.status === "joined") return "On your phone, allow the camera when it asks.";
  if (tracking.status === "calibrating") return "Stand in view and hold still.";
  return "Stand so your whole body is in view.";
}

function hostTrouble(error: string, trustUrl: string) {
  if (!error) return "";
  if (error === GAME_SERVER_DISCONNECTED) return GAME_SERVER_DISCONNECTED;
  if (/certificate/i.test(error) && isLoopbackRealtimeUrl(trustUrl)) return GAME_SERVER_DISCONNECTED;
  if (/certificate/i.test(error)) {
    let origin = "the game connection";
    try {
      if (trustUrl) origin = new URL(trustUrl).origin;
    } catch {
      origin = "the game connection";
    }
    return `The QR appears after this browser allows ${origin}. Open the security check, continue past the warning, then try again.`;
  }
  if (/could not reach|server/i.test(error)) return "This screen cannot reach the game yet. Check the connection, then try again.";
  if (/keyboard/i.test(error)) return "Keyboard play did not start. Try again.";
  return "The connection did not finish. Try again.";
}

function MoveDiagram({ kind }: { kind: TutorialGesture }) {
  const arm = kind === "left" ? "M58 78 L34 42" : kind === "right" ? "M86 78 L112 42" : "M58 78 L40 96 M86 78 L104 96";
  const legs = kind === "squat" ? "M70 118 L52 132 M74 118 L96 132 M52 132 L46 150 M96 132 L104 150" : "M70 118 L58 158 M74 118 L88 158";
  const lift = kind === "jump" ? -18 : 0;
  return (
    <svg viewBox="0 0 140 180" className="h-36 w-28" aria-hidden="true">
      <g transform={`translate(0 ${lift})`} fill="none" stroke="#BEFF39" strokeWidth="6" strokeLinecap="round">
        <circle cx="72" cy="36" r="14" />
        <path d="M72 52 L72 118" />
        <path d={arm} />
        <path d={legs} />
      </g>
      {kind === "jump" ? <path d="M36 168 H108" stroke="#ffffff" strokeWidth="3" opacity="0.4" /> : null}
    </svg>
  );
}

function GuideIcon({ name }: { name: "screen" | "scan" | "camera" }) {
  if (name === "screen") {
    return (
      <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
        <rect x="6" y="10" width="52" height="34" rx="4" fill="none" stroke="#BEFF39" strokeWidth="3" />
        <path d="M24 52h16M32 44v8" fill="none" stroke="#BEFF39" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "scan") {
    return (
      <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
        <path d="M10 22V14h8M46 14h8v8M54 42v8h-8M18 54h-8v-8" fill="none" stroke="#BEFF39" strokeWidth="3" strokeLinecap="round" />
        <path d="M18 32h28" stroke="#BEFF39" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
      <circle cx="32" cy="16" r="7" fill="none" stroke="#BEFF39" strokeWidth="3" />
      <path d="M16 52c2-12 8-18 16-18s14 6 16 18" fill="none" stroke="#BEFF39" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const GUIDE = [
  { id: "screen" as const, n: 1, label: "Big screen", icon: "screen" as const },
  { id: "scan" as const, n: 2, label: "Scan", icon: "scan" as const },
  { id: "camera" as const, n: 3, label: "Camera", icon: "camera" as const },
];

function useNarrowWindow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 780px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function FitRunnerTutorial({
  ready,
  runnerRef,
  canvasRef,
  session,
  poseRef,
  holdStart,
  onPlay,
}: {
  ready: boolean;
  runnerRef: RefObject<FitRunnerHandle | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  session: SessionView;
  poseRef: { current: (report: PoseReport) => void };
  holdStart: boolean;
  onPlay: () => void;
}) {
  const [step, setStep] = useState<Step>(() => (livePhone(session.players) ? "camera" : "screen"));
  const [gestureIndex, setGestureIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [checked, setChecked] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [countLabel, setCountLabel] = useState("GET READY");
  const [returning, setReturning] = useState(false);
  const [practiceMoves, setPracticeMoves] = useState(false);
  const [calibrateTry, setCalibrateTry] = useState(0);
  const [gestureTry, setGestureTry] = useState(0);
  const [freshAfter, setFreshAfter] = useState<number | null>(null);
  const busy = useRef(false);
  const seenPhones = useRef(new Set<string>());
  const sessionRef = useRef(session);
  const onPlayRef = useRef(onPlay);
  const played = useRef(false);
  const trustOpened = useRef(false);
  const narrow = useNarrowWindow();
  sessionRef.current = session;
  onPlayRef.current = onPlay;
  const gesture = GESTURE_STEPS[gestureIndex] ?? GESTURE_STEPS[0];
  const denied = session.tracking?.status === "camera_error" || /denied|blocked/i.test(session.tracking?.message ?? "");
  const seeing = cameraSeeing(session.tracking, session.players);
  const bodySeen = stanceReady(session.tracking, session.players);
  const bodyFresh = bodySeen && (freshAfter === null || session.trackingSeq > freshAfter);
  const phone = livePhone(session.players);
  const [keyboardHere, setKeyboardHere] = useState(false);
  const keyboardOn = keyboardHere || session.keyboardChosen;
  const keyboardOnRef = useRef(false);
  keyboardOnRef.current = keyboardOn;
  const freshAfterRef = useRef<number | null>(null);
  freshAfterRef.current = freshAfter;
  const canStart = Boolean(phone) && bodyFresh;
  const guideStep = step === "screen" || step === "scan" || step === "camera";
  const trouble = hostTrouble(session.error, session.trustUrl);
  const serverDown = trouble === GAME_SERVER_DISCONNECTED;
  const securityCheck = session.trustUrl && !isLoopbackRealtimeUrl(session.trustUrl) && /security check/i.test(trouble) ? session.trustUrl : "";

  useEffect(() => {
    let cancel = false;
    void fetch("/api/me")
      .then((response) => response.json())
      .then(async (body: { user?: { id?: string } | null }) => {
        if (cancel) return;
        if (!body?.user?.id) return;
        const profile = await fetch("/api/me/profile");
        if (!profile.ok || cancel) return;
        const payload = (await profile.json()) as { profile?: { tutorialCompleted?: boolean } };
        if (!cancel) setReturning(Boolean(payload.profile?.tutorialCompleted));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const runner = runnerRef.current;
    if (!ready || !runner) return;
    if (step === "gesture" || step === "practice") runner.previewCourse();
    else {
      if (step === "countdown") runner.resetNeutral();
      runner.holdIdle();
    }
  }, [ready, runnerRef, step]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (keyboardOn && (step === "gesture" || step === "practice")) canvas.dataset.tutorialKeys = "1";
    else delete canvas.dataset.tutorialKeys;
  }, [canvasRef, keyboardOn, step]);

  useEffect(() => {
    if (!keyboardOn || (step !== "gesture" && step !== "practice")) return;
    const blocked = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyS"]);
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!blocked.has(event.code)) return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keyboardOn, step]);

  useEffect(() => {
    const live = new Set(session.players.filter((player) => player.connected && player.control === "camera").map((player) => player.id));
    if (step !== "screen" && step !== "scan" && step !== "howto") {
      for (const id of seenPhones.current) {
        if (!live.has(id)) {
          setNotice("The phone disconnected. Scan the code again before you start.");
          setStep("camera");
          break;
        }
      }
    }
    seenPhones.current = live;
  }, [session.players, step]);

  useEffect(() => {
    if (!phone) return;
    if (step === "screen" || step === "scan" || step === "howto") setStep("camera");
  }, [phone, step]);

  useEffect(() => {
    if (step !== "camera" || keyboardOn || bodyFresh || !phone) return;
    const timer = window.setTimeout(() => {
      setNotice("Still getting you in view. Show your whole body, or play with the keyboard.");
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [bodyFresh, calibrateTry, keyboardOn, phone, step]);

  useEffect(() => {
    if (step !== "gesture") return;
    const timer = window.setTimeout(() => {
      setNotice("We didn't see that move. Try again, or play with the keyboard.");
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [gestureIndex, gestureTry, step]);

  useEffect(() => {
    if (session.phase === "countdown") {
      setStep("countdown");
      setCountLabel(session.countdown > 0 ? String(session.countdown) : "GET READY");
      return;
    }
    if (session.phase === "lobby" && step === "countdown") setStep(phone ? "camera" : "scan");
  }, [phone, session.countdown, session.phase, step]);

  useEffect(() => {
    if (holdStart) return;
    if (session.phase !== "running" || played.current) return;
    const keyboard = keyboardOnRef.current;
    const camera = session.players.some((player) => player.connected && player.control === "camera");
    if (!keyboard && !camera) return;
    played.current = true;
    onPlayRef.current();
  }, [holdStart, session.phase, session.players]);

  function acceptGesture(next: TutorialGesture, source: "detection" | "substitute") {
    if (step !== "gesture" || busy.current || !gesture) return;
    if (next !== gesture.gesture) return;
    if (source === "substitute" && gesture.gesture !== "jump") return;
    busy.current = true;
    setChecked(true);
    setNotice("");
    if (source === "detection") playStepBlip();
    window.setTimeout(() => {
      busy.current = false;
      setChecked(false);
      setGestureIndex((index) => {
        if (index >= GESTURE_STEPS.length - 1) {
          setStep("practice");
          return index;
        }
        return index + 1;
      });
    }, 900);
  }

  useEffect(() => {
    poseRef.current = (report) => {
      if (!report.accepted) return;
      if (report.source === "keyboard" && !keyboardOnRef.current) return;
      const detected = tutorialGestureFor(report.movementType);
      if (!detected) return;
      if (step === "gesture") acceptGesture(detected, "detection");
      if (step === "practice") {
        const label = detected === "left" ? "LEFT DETECTED" : detected === "squat" ? "SQUAT DETECTED" : detected === "jump" ? "JUMP DETECTED" : "GREAT MOVE";
        setFeedback(label === "GREAT MOVE" ? "GREAT MOVE" : `GREAT MOVE · ${label}`);
      }
    };
  });

  function enableKeyboard(event: MouseEvent<HTMLButtonElement>) {
    setKeyboardHere(true);
    const canvas = canvasRef.current;
    if (canvas && (step === "gesture" || step === "practice")) canvas.dataset.tutorialKeys = "1";
    event.currentTarget.blur();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setNotice("");
    session.chooseKeyboard();
  }

  function retryConnection() {
    if (!session.connected) {
      if (process.env.NODE_ENV !== "production" && session.trustUrl && /certificate/i.test(session.error) && !trustOpened.current) {
        trustOpened.current = true;
        window.open(session.trustUrl, "_blank", "noopener");
      }
      session.retryRealtime();
      return;
    }
    if (keyboardOn) session.chooseKeyboard();
    setNotice(denied ? "On your phone, allow the camera, then turn the camera on." : "");
  }

  const coach = cameraCoach(session.tracking, Boolean(phone));
  const calibrationLine = isCalibrationCue(session.tracking?.message) ? session.tracking?.message?.trim() ?? "" : "";
  const narrowHint = narrow
    ? "This window is small. Open the game on a larger display. Casting or desktop mode can work."
    : "";

  return (
    <div
      className={
        guideStep || step === "howto"
          ? "pointer-events-none absolute inset-0 z-30 flex justify-center overflow-hidden bg-[#14171c] p-6 sm:p-10"
          : step === "countdown"
            ? "pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#14171c] p-6"
            : "pointer-events-none absolute inset-0 z-30 flex items-end justify-center p-4 pb-8"
      }
      data-tutorial-step={step}
      data-narrow={narrow ? "yes" : "no"}
    >
      {guideStep ? (
        <section className="pointer-events-auto flex min-h-0 max-h-full w-full max-w-5xl flex-col overflow-y-auto text-white" aria-label="FitRunner setup">
          <ol className="grid grid-cols-3 gap-4">
            {GUIDE.map((item) => {
              const active = item.id === step;
              const done = item.n < (step === "screen" ? 1 : step === "scan" ? 2 : 3);
              return (
                <li key={item.id} aria-current={active ? "step" : undefined} className={active ? "text-[#BEFF39]" : done ? "text-white/80" : "text-white/35"}>
                  <span className={`font-display ${active ? "text-5xl" : "text-3xl"}`}>{item.n}</span>
                  <span className="mt-1 block text-sm tracking-[0.14em] uppercase">{item.label}</span>
                </li>
              );
            })}
          </ol>

          {step === "screen" ? (
            <div className="mt-12 max-w-3xl">
              <GuideIcon name="screen" />
              <h1 className="mt-6 font-display text-5xl leading-none text-[#BEFF39] sm:text-7xl">Play on a big screen</h1>
              <p className="mt-6 max-w-2xl text-2xl leading-snug text-white/90">
                This game runs on a laptop, or in a browser connected to a TV. Your phone is only the controller.
              </p>
              {narrowHint ? (
                <p className="mt-6 max-w-xl text-lg text-[#BEFF39]" role="status">
                  {narrowHint}
                </p>
              ) : null}
              {returning ? <p className="mt-4 text-base text-white/70">You have played before. The camera still needs a quick check.</p> : null}
              <div className="mt-10 flex flex-wrap gap-3">
                <button type="button" className={primary} onClick={() => setStep("scan")}>
                  Continue
                </button>
                {returning ? (
                  <button
                    type="button"
                    className={ghost}
                    onClick={() => {
                      setPracticeMoves(true);
                      setGestureIndex(0);
                      setStep("scan");
                    }}
                  >
                    Practice the moves
                  </button>
                ) : null}
                <button type="button" className={ghost} onClick={() => setStep("howto")}>
                  How to play
                </button>
              </div>
            </div>
          ) : null}

          {step === "scan" ? (
            <div className="mt-8 grid items-start gap-8 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
              <div className="lg:col-start-1 lg:row-start-1">
                <GuideIcon name="scan" />
                <h1 className="mt-4 font-display text-5xl leading-none text-[#BEFF39] sm:text-7xl">Scan with your phone</h1>
                <p className="mt-4 max-w-xl text-2xl leading-snug">Open the camera on your phone and point it at this code.</p>
                {narrowHint ? <p className="mt-4 text-lg text-[#BEFF39]">{narrowHint}</p> : null}
              </div>
              <div className="flex justify-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:justify-end">
                {session.qr ? (
                  <img
                    src={session.qr}
                    alt={session.joinCode ? `QR code for join code ${session.joinCode}` : "QR code to join the game"}
                    className="w-64 rounded-[1.6rem] bg-white p-3 sm:w-80"
                  />
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center rounded-[1.6rem] border border-dashed border-white/20 px-6 text-center text-sm text-white/50 sm:h-80 sm:w-80">
                    {serverDown ? GAME_SERVER_DISCONNECTED : session.error ? "The QR shows here after the connection is allowed." : "Your code is on the way"}
                  </div>
                )}
              </div>
              <div className="lg:col-start-1 lg:row-start-2">
                {session.joinCode || !serverDown ? (
                  <>
                    <p className="text-sm tracking-[0.16em] text-white/50 uppercase">Join code</p>
                    <p className="mt-1 font-display text-4xl tracking-[0.28em]">{session.joinCode || "······"}</p>
                  </>
                ) : null}
                {session.joinUrl ? <p className="mt-3 max-w-md break-all text-sm text-white/45">{session.joinUrl}</p> : null}
                {!session.connected && !session.error ? <p className="mt-4 text-base text-white/70">Getting your code ready…</p> : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  {session.error ? (
                    <button type="button" className={ghost} onClick={retryConnection}>
                      Try again
                    </button>
                  ) : null}
                  <button type="button" className={ghost} onMouseDown={(event) => event.preventDefault()} onClick={enableKeyboard}>
                    Play with keyboard
                  </button>
                </div>
                {keyboardOn ? <p className="mt-4 text-base text-white/80">Keyboard play is on. This uses the keys on this screen, not a camera.</p> : null}
                {keyboardOn ? (
                  <button type="button" className={`${primary} mt-4`} onClick={() => session.startKeyboardRound()}>
                    Start with keyboard
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "camera" ? (
            <div className="mt-12 max-w-3xl">
              <GuideIcon name="camera" />
              <h1 className="mt-6 font-display text-5xl leading-none text-[#BEFF39] sm:text-7xl">Check the camera</h1>
              <p className="mt-6 text-2xl leading-snug" role="status" data-camera-ready={seeing ? "yes" : "no"} data-body-seen={bodySeen ? "yes" : "no"} data-controller={keyboardOn ? "keyboard" : phone ? "camera" : "none"}>
                {phone ? (calibrationLine || (canStart ? "Hold still. The run starts when you stay in position." : coach)) : "Scan the code with your phone. This step opens when the phone connects."}
              </p>
              {narrowHint ? <p className="mt-4 text-lg text-[#BEFF39]">{narrowHint}</p> : null}
              {keyboardOn ? <p className="mt-4 text-base text-white/80">Keyboard play is on. This uses the keys on this screen, not your body.</p> : null}
              <div className="mt-10 flex flex-wrap gap-3">
                {keyboardOn ? (
                  <button type="button" className={primary} onClick={() => session.startKeyboardRound()}>
                    Start with keyboard
                  </button>
                ) : (
                  <button type="button" className={ghost} onMouseDown={(event) => event.preventDefault()} onClick={enableKeyboard}>
                    Play with keyboard
                  </button>
                )}
                {practiceMoves ? (
                  <button type="button" className={ghost} disabled={!canStart} onClick={() => { setNotice(""); setStep("gesture"); }}>
                    Practice the moves
                  </button>
                ) : null}
                {!phone ? (
                  <button type="button" className={ghost} onClick={() => { setNotice(""); setStep("scan"); }}>
                    Show the code
                  </button>
                ) : null}
                {phone && !canStart ? (
                  <button
                    type="button"
                    className={ghost}
                    onClick={() => {
                      setFreshAfter(session.trackingSeq);
                      setCalibrateTry((value) => value + 1);
                      setNotice("Hold still. On your phone, tap Recalibrate, then face the camera.");
                    }}
                  >
                    Try again
                  </button>
                ) : null}
                {session.error || denied ? (
                  <button type="button" className={ghost} onClick={retryConnection}>
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {notice || trouble ? (
            <p className="mt-8 max-w-xl text-base text-rose-200">
              {notice || trouble}{" "}
              {securityCheck ? (
                <a
                  className="text-[#BEFF39] underline"
                  href={securityCheck}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    trustOpened.current = true;
                  }}
                >
                  Open the security check
                </a>
              ) : null}
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "howto" ? (
        <section className="pointer-events-auto max-h-full w-full max-w-3xl overflow-y-auto text-white" aria-label="How to play">
          <h1 className="font-display text-5xl text-[#BEFF39]">How to play</h1>
          <ul className="mt-8 space-y-4">
            {GESTURE_STEPS.map((item) => (
              <li key={item.gesture} className="flex items-center gap-4 text-xl">
                <MoveDiagram kind={item.diagram} />
                <span>{item.prompt}</span>
              </li>
            ))}
          </ul>
          <button type="button" className={`${primary} mt-8`} onClick={() => setStep("screen")}>
            Back
          </button>
        </section>
      ) : null}

      {step === "gesture" && gesture ? (
        <section className={panel} aria-label="FitRunner practice" data-gesture={gesture.gesture}>
          <div className="flex items-center gap-4">
            <MoveDiagram kind={gesture.diagram} />
            <div>
              <h1 className="font-display text-2xl text-white">{gesture.prompt}</h1>
              {checked ? (
                <p className="mt-2 text-2xl text-[#BEFF39]" role="status">Check</p>
              ) : (
                <p className="mt-2 text-sm text-[#d5deea]" data-keyboard={keyboardOn ? "on" : "off"}>
                  {keyboardOn ? "Keyboard is on. Press the key for this move." : "Waiting for your move."}
                </p>
              )}
            </div>
          </div>
          {gesture.gesture === "jump" ? (
            <button type="button" className={`${ghost} mt-4`} onClick={() => acceptGesture("jump", "substitute")}>
              Low-impact substitute
            </button>
          ) : null}
          {gesture.gesture === "jump" ? <p className="mt-2 text-xs text-[#d5deea]">This button is a substitute, not a detected jump.</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={ghost} onClick={() => { setGestureTry((value) => value + 1); setNotice(""); }}>
              Retry
            </button>
            <button type="button" className={ghost} onMouseDown={(event) => event.preventDefault()} onClick={enableKeyboard}>
              Play with keyboard
            </button>
          </div>
          {notice || trouble ? <p className="mt-4 text-sm text-rose-200">{notice || trouble}</p> : null}
        </section>
      ) : null}

      {step === "practice" ? (
        <section className={panel} aria-label="FitRunner practice">
          <h1 className="font-display text-3xl text-[#BEFF39]">Practice</h1>
          <p className="mt-3">No obstacles, no score, no XP, no missions, and no calories. Move when you are ready.</p>
          <p className="mt-4 font-display text-2xl text-[#BEFF39]" role="status">{feedback || "Waiting for a move"}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={ghost}
              onClick={() => {
                setGestureIndex(0);
                setFeedback("");
                setStep("gesture");
              }}
            >
              Repeat practice
            </button>
            <button
              type="button"
              className={ghost}
              onClick={() => {
                setFreshAfter(session.trackingSeq);
                setStep("camera");
              }}
            >
              Check the camera again
            </button>
            <p className="mt-4 text-sm text-white/70">Stay in position on your phone. The run starts on its own.</p>
          </div>
          {notice || trouble ? <p className="mt-4 text-sm text-rose-200">{notice || trouble}</p> : null}
        </section>
      ) : null}

      {step === "countdown" ? (
        <section className="pointer-events-auto text-center" aria-label="Get ready" data-countdown={session.countdown || undefined}>
          <p className="font-display text-8xl text-[#BEFF39]" role="status">{countLabel}</p>
          {calibrationLine ? <p className="mt-6 text-2xl text-white" role="status">{calibrationLine}</p> : null}
          {notice ? <p className="mt-6 text-base text-rose-200">{notice}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
