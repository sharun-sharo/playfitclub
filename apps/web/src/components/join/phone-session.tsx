"use client";

import { armMappingVerdict, COMMAND_STALE_MS, type MovementDraft } from "@fitplay/game";
import { CLIENT_EVENTS, PROTOCOL_VERSION, SERVER_EVENTS } from "@fitplay/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { phoneBodyStatus, readinessInProgress } from "@/components/join/body-status";
import { appendMotionDiag, armDiagnosticLabel, authoritativeMoveLabel, candidateLabel, enqueueMovement, flushMovementQueue, framingStatusCue, gameplaySendAllowed, liveGestureName, motionDebugLines, motionDiagDownload, motionDiagnosticsEnabled, readMotionDiagFlag, trackingStatusLine, type MotionDiagSample, type QueuedMovement } from "@/components/join/phone-commands";
import {
  CameraSetup,
  connectionCopy,
  DiagnosticsSheet,
  JoinPanel,
  LeaveConfirm,
  PhoneAlert,
  PlayControls,
  QuietButton,
  roundCopy,
  type PhoneNotice,
  type RecoveryAction,
} from "@/components/join/phone-panels";
import { friendlyJoinError, JOIN_EXPIRED, joinNameMessage } from "@/components/join/join-name";
import { browserRealtimeConnection, devCertificateHost, GAME_SERVER_DISCONNECTED, socketUsesPageOrigin } from "@/lib/env";
import {
  BODY_LEFT_MESSAGE,
  BODY_RETURN_MESSAGE,
  CAMERA_LOST_MESSAGE,
  cameraStatusFromTrack,
  classifyCameraError,
  MODEL_FAILED_MESSAGE,
  PHONE_OFF_MESSAGE,
  REALTIME_DOWN_MESSAGE,
  ROTATE_MESSAGE,
  TAB_HIDDEN_MESSAGE,
  TRACKING_LOST_MESSAGE,
  type CameraPermission,
} from "@/lib/vision/camera-status";
import {
  FRAMING_DISTANCE_HINT,
  plainCalibrationCue,
  plainFramingCue,
  plainLimbCue,
  type FramingCode,
} from "@/lib/vision/framing";
import { createHandsFree, STEP_BACK_INTO_FRAME, type CountdownPurpose, type HandsFreeView } from "@/lib/vision/hands-free";
import { readMotionThresholds } from "@/lib/vision/motion-thresholds";
import { containFrame } from "@/lib/vision/preview-fit";
import { gestureLabel, openCamera, PoseEstimator, releaseCamera, type PoseDiagnostics, type PoseUiState } from "@/lib/vision/pose-estimator";

const EMPTY_RATES = { cameraFps: null, poseFps: null, inferenceMs: null };
const PHONE_INSTALL_KEY = "fitplay.phone.install";

function phoneInstallId() {
  try {
    const existing = window.localStorage.getItem(PHONE_INSTALL_KEY);
    if (existing && existing.length >= 8) return existing;
    const created = crypto.randomUUID().replaceAll("-", "");
    window.localStorage.setItem(PHONE_INSTALL_KEY, created);
    return created;
  } catch {
    return `phone${Date.now().toString(36)}`;
  }
}

interface MotionTrace {
  lastGesture: string;
  gestureType: string | null;
  lastSent: string;
  lastAck: string;
  lastApplied: string;
  commandId: string;
  poseAtMs: number | null;
  gestureAtMs: number | null;
  sentPhoneMs: number | null;
  serverMs: number | null;
  tvMs: number | null;
  phoneRoundTripMs: number | null;
  runnerReason: string;
  serverAck: string;
  tvState: string;
}

type MovementPacket = {
  v: number;
  eventId: string;
  playerId: string;
  sessionId: string;
  movementType: MovementDraft["movementType"];
  confidence: number;
  clientTimestamp: number;
  sequenceNumber: number;
};

const EMPTY_TRACE: MotionTrace = {
  lastGesture: "",
  gestureType: null,
  lastSent: "",
  lastAck: "",
  lastApplied: "",
  commandId: "",
  poseAtMs: null,
  gestureAtMs: null,
  sentPhoneMs: null,
  serverMs: null,
  tvMs: null,
  phoneRoundTripMs: null,
  runnerReason: "",
  serverAck: "",
  tvState: "",
};
const EMPTY_UI: PoseUiState = {
  guidance: "",
  confidence: 0,
  framingReady: false,
  calibrated: false,
  movement: null,
  actionsEnabled: false,
  diagnostics: null,
  framing: null,
  rates: EMPTY_RATES,
  landmarksLabel: null,
  poseCount: 0,
  calibrationCue: null,
};

interface Preview {
  ok: boolean;
  code?: string;
  message?: string;
  session?: { gameName: string; status: string; playerCount: number; maxPlayers: number; gymName?: string | null };
}

type Stage = "join" | "setup" | "calibrate" | "tutorial" | "play";

export function PhoneSession({ code }: { code: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [previewBox, setPreviewBox] = useState({ x: 0, y: 0, width: 0, height: 0, known: false });
  const socketRef = useRef<Socket | null>(null);
  const estimatorRef = useRef<PoseEstimator | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const identity = useRef<{ playerId: string; sessionId: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [notice, setNotice] = useState<PhoneNotice | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [ui, setUi] = useState<PoseUiState>(EMPTY_UI);
  const [trace, setTrace] = useState<MotionTrace>(EMPTY_TRACE);
  const sentAtRef = useRef<Map<string, number>>(new Map());
  const motionDiagRef = useRef(false);
  const [motionDiag, setMotionDiag] = useState(false);
  const diagLogRef = useRef<MotionDiagSample[]>([]);
  const diagAckRef = useRef("none");
  const outboxRef = useRef<QueuedMovement<MovementPacket>[]>([]);
  const flushMovesRef = useRef<() => void>(() => {});
  const [phase, setPhase] = useState("lobby");
  const [raceLive, setRaceLive] = useState<boolean | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraPermission>("off");
  const [link, setLink] = useState("offline");
  const [controllerOn, setControllerOn] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [lastMove, setLastMove] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [tabHidden, setTabHidden] = useState(false);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [upright, setUpright] = useState(true);
  const readySent = useRef(false);
  const handsRef = useRef(createHandsFree());
  const syncHandsRef = useRef<() => HandsFreeView>(() => handsRef.current.push({
    now: 0,
    cameraGranted: false,
    sessionConnected: false,
    framingCode: null,
    confidence: 0,
    poseCount: 0,
    presenceConfidence: null,
    detectionConfidence: null,
    serverPhase: "lobby",
    serverCountdown: 0,
    countdownPurpose: null,
  }));
  const [handsView, setHandsView] = useState<HandsFreeView | null>(null);
  const countdownRef = useRef(0);
  const purposeRef = useRef<CountdownPurpose>(null);
  const sampleRef = useRef<{ framingCode: FramingCode | null; confidence: number; poseCount: number }>({
    framingCode: null,
    confidence: 0,
    poseCount: 0,
  });
  const cameraStatusRef = useRef<CameraPermission>("off");
  const bodyActionsRef = useRef(false);
  const lastStatusAt = useRef(0);
  const lastBodyStatus = useRef("");
  const openingRef = useRef(false);
  const linkedRef = useRef(false);
  const joinedRef = useRef(false);
  const controllerRef = useRef(false);
  const tuningRef = useRef(false);
  const hiddenRef = useRef(false);
  const uprightRef = useRef(true);
  const phaseRef = useRef("lobby");
  const framingPauseRef = useRef(false);
  const calibratedRef = useRef(false);
  const diagnosticsOpenRef = useRef(false);
  const logRef = useRef<string[]>([]);
  const nameRef = useRef("");
  const joiningRef = useRef(false);
  const openCameraRef = useRef<() => void>(() => {});
  const socketGen = useRef(0);
  const codeRef = useRef(code);
  codeRef.current = code;

  joinedRef.current = joined;
  controllerRef.current = controllerOn;
  tuningRef.current = tuning;
  hiddenRef.current = tabHidden;
  uprightRef.current = upright;
  phaseRef.current = phase;
  cameraStatusRef.current = cameraStatus;
  framingPauseRef.current = Boolean(ui.framing?.pause);
  calibratedRef.current = ui.calibrated;
  diagnosticsOpenRef.current = diagnosticsOpen;
  nameRef.current = name;

  const closePhoneSocket = useCallback((leave: boolean) => {
    const socket = socketRef.current;
    if (!socket) return;
    socketGen.current += 1;
    socketRef.current = null;
    if (leave && socket.connected && joinedRef.current) {
      socket.emit(CLIENT_EVENTS.sessionLeave, { v: PROTOCOL_VERSION });
    }
    socket.disconnect();
  }, []);

  const cameraOn = cameraStatus === "granted";
  const flow = handsView?.phase ?? "WAITING_FOR_CAMERA";
  const roundLive = flow === "PLAYING" || flow === "TRACKING_LOST" || flow === "PAUSED" || flow === "GAME_OVER";
  const stage: Stage = !joined ? "join" : roundLive ? "play" : "setup";

  useEffect(() => {
    const video = videoRef.current;
    let cancel = false;
    setJoined(false);
    setNotice(null);
    setSubmitError(null);
    setNameError(null);
    setJoining(false);
    identity.current = null;
    joinedRef.current = false;
    readySent.current = false;
    void fetch(`/api/sessions/${code}`)
      .then((response) => response.json())
      .then((body: Preview) => {
        if (!cancel) storePreview(body);
      })
      .catch(() => {
        if (!cancel) storePreview({ ok: false, message: "could not reach" });
      });
    return () => {
      cancel = true;
      estimatorRef.current?.stop();
      releaseCamera(streamRef.current, video);
      const switched = codeRef.current !== code;
      closePhoneSocket(switched);
    };
  }, [closePhoneSocket, code]);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse) and (orientation: landscape) and (max-height: 520px)");
    const apply = () => {
      const next = !query.matches;
      uprightRef.current = next;
      setUpright(next);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const onVis = () => {
      const hidden = document.hidden;
      hiddenRef.current = hidden;
      setTabHidden(hidden);
      if (hidden) return;
      const video = videoRef.current;
      if (!video || !streamRef.current) {
        setCameraPaused(false);
        return;
      }
      if (!video.paused) {
        setCameraPaused(false);
        return;
      }
      void video.play().then(() => setCameraPaused(false)).catch(() => setCameraPaused(true));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return;
    const measure = () => {
      const canvas = canvasRef.current;
      if (canvas && video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const box = stage.getBoundingClientRect();
      const next = containFrame(box.width, box.height, video.videoWidth, video.videoHeight);
      setPreviewBox((current) =>
        current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height && current.known === next.known
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    video.addEventListener("loadedmetadata", measure);
    video.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", measure);
      video.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [stage, cameraOn]);

  function noteEvent(line: string) {
    const next = [...logRef.current.slice(-11), line];
    logRef.current = next;
    if (diagnosticsOpenRef.current) setEventLog(next);
  }

  function storePreview(body: Preview) {
    setPreview(body);
    setPreviewError(body.ok ? null : friendlyJoinError(body.code, body.message));
  }

  function reloadPreview() {
    setPreview(null);
    void fetch(`/api/sessions/${code}`)
      .then((response) => response.json())
      .then((body: Preview) => storePreview(body))
      .catch(() => storePreview({ ok: false, message: "could not reach" }));
  }

  function openCertificate() {
    const realtime = browserRealtimeConnection(window.location.origin);
    if (!realtime.ok || !devCertificateHost(realtime.url)) return;
    if (socketUsesPageOrigin(window.location.origin)) return;
    window.open(`${realtime.url}/health`, "_blank", "noopener");
  }

  async function join(event?: React.FormEvent) {
    event?.preventDefault();
    if (joiningRef.current) return;
    const problem = joinNameMessage(nameRef.current);
    if (problem) {
      setNameError(problem);
      return;
    }
    joiningRef.current = true;
    setJoining(true);
    setNameError(null);
    setSubmitError(null);
    setNotice(null);
    noteEvent("session:join");
    const realtime = browserRealtimeConnection(window.location.origin);
    if (!realtime.ok) {
      joiningRef.current = false;
      setJoining(false);
      setSubmitError(GAME_SERVER_DISCONNECTED);
      return;
    }
    const me = await fetch("/api/me").then((response) => response.json()).catch(() => ({ socketToken: undefined }));
    const realtimeUrl = realtime.url;
    closePhoneSocket(true);
    const generation = ++socketGen.current;
    const socket = io(realtimeUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      auth: me.socketToken ? { userToken: me.socketToken } : {},
    });
    socket.on("connect", () => {
      if (generation !== socketGen.current) return;
      linkedRef.current = true;
      setLink("connected");
      setNotice((current) => (current?.id === "link" ? null : current));
      noteEvent("connect");
    });
    socket.on("connect_error", () => {
      if (generation !== socketGen.current) return;
      setLink("disconnected");
      joiningRef.current = false;
      setJoining(false);
      noteEvent("connect_error");
      if (!joinedRef.current) {
        setSubmitError(friendlyJoinError(undefined, "disconnected"));
        setNotice(null);
        return;
      }
      setNotice(linkedRef.current ? phoneNotice() : realtimeNotice(joinedRef.current));
    });
    socketRef.current = socket;
    socket.on(SERVER_EVENTS.sessionState, (payload: { id: string; phase: string; status?: string; raceLive?: boolean | null; countdown?: number; countdownPurpose?: CountdownPurpose }) => {
      const previousPhase = phaseRef.current;
      phaseRef.current = payload.phase;
      if (payload.phase === "lobby" || payload.phase === "countdown") outboxRef.current = [];
      if (payload.phase === "running") flushMovesRef.current();
      if (previousPhase !== payload.phase && (payload.phase === "lobby" || payload.phase === "countdown" || payload.phase === "paused" || payload.phase === "running")) {
        estimatorRef.current?.readyForRound();
      }
      countdownRef.current = typeof payload.countdown === "number" ? payload.countdown : 0;
      purposeRef.current = payload.countdownPurpose === "start" || payload.countdownPurpose === "resume" ? payload.countdownPurpose : null;
      setPhase(payload.phase);
      setRaceLive(payload.raceLive === true ? true : payload.raceLive === false ? false : null);
      if (identity.current) identity.current.sessionId = payload.id;
      if ((payload.status === "CLOSED" || payload.status === "EXPIRED") && joinedRef.current) {
        setNotice((current) =>
          current?.id === "ended"
            ? current
            : {
                id: "ended",
                title: "Disconnected",
                body: JOIN_EXPIRED,
              },
        );
      }
      syncHandsRef.current();
    });
    socket.on(SERVER_EVENTS.roundReset, () => {
      if (generation !== socketGen.current) return;
      estimatorRef.current?.readyForRound();
    });
    socket.on(SERVER_EVENTS.sessionError, (payload: { code?: string; message?: string; serverTimeMs?: number }) => {
      if (generation !== socketGen.current) return;
      const code = payload?.code ?? "";
      if (code === "DUPLICATE_EVENT" || code === "MOVEMENT_REJECTED" || code === "SCORE_REJECTED" || code === "GAME_OVER" || (code === "RATE_LIMITED" && joinedRef.current)) {
        noteEvent(`movement ${code}`);
        if (motionDiagRef.current) console.info(`[motiondiag] ack ${code}`);
        diagAckRef.current = code || "none";
        setTrace((current) => ({
          ...current,
          lastAck: payload.message || code,
          serverAck: code,
          serverMs: typeof payload.serverTimeMs === "number" ? payload.serverTimeMs : current.serverMs,
          runnerReason: code,
        }));
        return;
      }
      noteEvent("session error");
      if (!joinedRef.current) {
        joiningRef.current = false;
        setJoining(false);
        setSubmitError(friendlyJoinError(code, payload?.message));
        setNotice(null);
        return;
      }
      setNotice({ id: "join", title: "Can't join", body: friendlyJoinError(code, payload?.message) });
    });
    socket.on(CLIENT_EVENTS.movementResult, (payload: { eventId?: string; movementType?: string; accepted?: boolean; reason?: string | null; executedAtMs?: number }) => {
      if (!payload || typeof payload.eventId !== "string") return;
      const sent = sentAtRef.current.get(payload.eventId);
      const phoneRoundTripMs = typeof sent === "number" ? Date.now() - sent : null;
      const tvState = payload.accepted ? `applied ${payload.movementType ?? "move"}` : `rejected ${payload.reason || "unknown"}`;
      if (motionDiagRef.current) console.info(`[motiondiag] tv ${tvState}`);
      diagAckRef.current = tvState;
      noteEvent(payload.accepted ? "movement applied" : "movement declined");
      setTrace((current) => ({
        ...current,
        lastApplied: payload.accepted && payload.movementType ? gestureLabel(payload.movementType) : current.lastApplied,
        phoneRoundTripMs: payload.accepted && phoneRoundTripMs !== null && phoneRoundTripMs >= 0 ? phoneRoundTripMs : current.phoneRoundTripMs,
        tvMs: typeof payload.executedAtMs === "number" ? payload.executedAtMs : current.tvMs,
        runnerReason: payload.accepted ? "" : payload.reason ?? "",
        tvState,
      }));
    });
    socket.on("disconnect", () => {
      if (generation !== socketGen.current) return;
      setLink("disconnected");
      noteEvent("disconnect");
      if (joinedRef.current) setNotice(phoneNotice());
      const token = window.sessionStorage.getItem(`fitplay.token.${code}`);
      if (token) {
        socket.emit("session:reconnect", { token }, (response: { ok?: boolean }) => {
          if (generation !== socketGen.current) return;
          if (response?.ok) flushMovesRef.current();
        });
      }
    });
    const storedToken = window.sessionStorage.getItem(`fitplay.token.${code}`);
    const finishJoin = () => {
      socket.emit(
        "session:join",
        { v: PROTOCOL_VERSION, joinCode: code.toUpperCase(), displayName: nameRef.current.trim(), installId: phoneInstallId() },
        (response: { ok: boolean; code?: string; message?: string; token?: string; playerId?: string; session?: { id: string } }) => {
          if (generation !== socketGen.current) return;
          joiningRef.current = false;
          setJoining(false);
          if (!response.ok || !response.token || !response.playerId || !response.session) {
            setSubmitError(friendlyJoinError(response.code, response.message));
            setNotice(null);
            noteEvent("join declined");
            return;
          }
          window.sessionStorage.setItem(`fitplay.token.${code}`, response.token);
          identity.current = { playerId: response.playerId, sessionId: response.session.id };
          socket.auth = { ...socket.auth, token: response.token };
          noteEvent("join accepted");
          joinedRef.current = true;
          setNameError(null);
          setSubmitError(null);
          setPreviewError(null);
          setJoined(true);
          announceJoined();
        },
      );
    };
    if (!storedToken) {
      finishJoin();
      return;
    }
    socket.emit("session:reconnect", { token: storedToken }, (response: { ok?: boolean; playerId?: string; sessionId?: string }) => {
      if (generation !== socketGen.current) return;
      if (response?.ok && response.playerId && response.sessionId) {
        identity.current = { playerId: response.playerId, sessionId: response.sessionId };
        socket.auth = { ...socket.auth, token: storedToken };
        joiningRef.current = false;
        setJoining(false);
        noteEvent("reconnect accepted");
        joinedRef.current = true;
        flushMovesRef.current();
        setNameError(null);
        setSubmitError(null);
        setPreviewError(null);
        setJoined(true);
        announceJoined();
        return;
      }
      window.sessionStorage.removeItem(`fitplay.token.${code}`);
      finishJoin();
    });
  }

  function reconnect() {
    const socket = socketRef.current;
    if (!socket) {
      void join();
      return;
    }
    noteEvent("session:reconnect");
    if (socket.disconnected) socket.connect();
    const token = window.sessionStorage.getItem(`fitplay.token.${code}`);
    if (token) {
      socket.emit("session:reconnect", { token }, (response: { ok?: boolean }) => {
        if (response?.ok) flushMovesRef.current();
      });
    }
  }

  useEffect(() => {
    const apply = () => {
      const stored = readMotionThresholds();
      if (stored) estimatorRef.current?.setThresholds(stored);
    };
    window.addEventListener("storage", apply);
    return () => window.removeEventListener("storage", apply);
  }, []);

  useEffect(() => {
    const on = readMotionDiagFlag(window.location.search);
    motionDiagRef.current = on;
    setMotionDiag(on);
    estimatorRef.current?.setDiagnosticsLog(on);
  }, []);

  function pushBodyStatus(
    status: ReturnType<typeof phoneBodyStatus>,
    confidence: number,
    message: string,
    diagnostics: PoseDiagnostics | null,
    force = false,
  ) {
    if (!identity.current || !status) return;
    const now = Date.now();
    if (!force && status === lastBodyStatus.current && now - lastStatusAt.current < 500) return;
    lastStatusAt.current = now;
    lastBodyStatus.current = status;
    socketRef.current?.emit("player:status", {
      v: PROTOCOL_VERSION,
      status,
      confidence,
      message: message.slice(0, 180),
      ...(diagnostics
        ? {
            diagnostics: {
              phase: diagnostics.phase,
              confidence: finite(confidence),
              leftElbow: finite(diagnostics.leftElbow),
              rightElbow: finite(diagnostics.rightElbow),
              leftLateral: finite(diagnostics.leftLateral),
              rightLateral: finite(diagnostics.rightLateral),
              hipDrop: finite(diagnostics.hipDrop),
              kneeAngle: finite(diagnostics.kneeAngle),
              riseSpeed: finite(diagnostics.riseSpeed),
              ankleRise: finite(diagnostics.ankleRise),
              reject: diagnostics.reject,
              leftPhase: diagnostics.leftPhase,
              rightPhase: diagnostics.rightPhase,
              squatPhase: diagnostics.squatPhase,
              jumpPhase: diagnostics.jumpPhase,
              lastGesture: diagnostics.lastGesture ?? null,
              torsoNeutral: finite(diagnostics.torsoNeutral ?? 0),
              torsoLean: finite(diagnostics.torsoLean ?? 0),
              leanDirection: diagnostics.leanDirection ?? "neutral",
              leanPhase: diagnostics.leanPhase ?? "NEUTRAL",
            },
          }
        : {}),
    });
  }

  function reportCameraError(message: string) {
    pushBodyStatus("camera_error", 0, message, null, true);
  }

  function announceJoined() {
    const liveRound = phaseRef.current === "running" || phaseRef.current === "paused" || phaseRef.current === "countdown";
    pushBodyStatus(
      phoneBodyStatus({
        joined: true,
        camera: cameraStatusRef.current,
        poseCount: sampleRef.current.poseCount,
        ready: readySent.current,
        liveRound,
        actionsEnabled: false,
        calibrated: calibratedRef.current,
        readinessActive: false,
      }),
      sampleRef.current.confidence,
      "",
      null,
      true,
    );
  }

  function publishDiagnostics(
    confidence: number,
    diagnostics: PoseDiagnostics | null,
    calibrated: boolean,
    actionsEnabled: boolean,
    guidance: string,
    readinessActive: boolean,
    poseCount: number,
  ) {
    const liveRound = phaseRef.current === "running" || phaseRef.current === "paused" || phaseRef.current === "countdown";
    pushBodyStatus(
      phoneBodyStatus({
        joined: joinedRef.current,
        camera: cameraStatusRef.current,
        poseCount,
        ready: readySent.current,
        liveRound,
        actionsEnabled,
        calibrated,
        readinessActive,
      }),
      confidence,
      guidance,
      diagnostics,
    );
  }

  async function enableCamera() {
    if (openingRef.current) return;
    openingRef.current = true;
    setNotice((current) => (current?.id === "link" ? current : null));
    const calibratedBefore = calibratedRef.current;
    if (!window.isSecureContext) {
      bodyActionsRef.current = false;
      const failure = classifyCameraError(new DOMException("insecure", "SecurityError"), false);
      cameraStatusRef.current = failure.status;
      setCameraStatus(failure.status);
      setNotice(insecureNotice());
      reportCameraError(failure.message);
      setUi((current) => ({ ...current, guidance: failure.message, actionsEnabled: false }));
      openingRef.current = false;
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      bodyActionsRef.current = false;
      cameraStatusRef.current = "unavailable";
      setCameraStatus("unavailable");
      setNotice({
        id: "camera",
        title: "Camera unavailable",
        body: "The camera preview is not on the page yet. Reload this page and try again.",
        primary: { label: "Try again", action: "camera" },
      });
      reportCameraError("The camera preview is not on the page yet. Reload this page and try again.");
      openingRef.current = false;
      return;
    }
    cameraStatusRef.current = "requesting";
    setCameraStatus("requesting");
    pushBodyStatus("camera_starting", 0, "", null, true);
    let track: MediaStreamTrack | null = null;
    try {
      releaseCamera(streamRef.current, video);
      const stream = await openCamera(video);
      streamRef.current = stream;
      track = stream.getVideoTracks()[0] ?? null;
      if (!track) {
        bodyActionsRef.current = false;
        const message = "No camera was found on this phone. The TV keyboard still works.";
        setCameraStatus("unavailable");
        setNotice(cameraNotice({ status: "unavailable", message }, "missing"));
        reportCameraError(message);
        setUi((current) => ({ ...current, guidance: message, actionsEnabled: false }));
        releaseCamera(stream, video);
        streamRef.current = null;
        return;
      }
      const onTrackEnded = () => {
        if (streamRef.current !== stream) return;
        bodyActionsRef.current = false;
        setCameraStatus("disconnected");
        setNotice(cameraNotice({ status: "disconnected", message: CAMERA_LOST_MESSAGE }, "lost"));
        setUi((current) => ({ ...current, guidance: CAMERA_LOST_MESSAGE, confidence: 0, actionsEnabled: false }));
        estimatorRef.current?.suspend(CAMERA_LOST_MESSAGE);
        reportCameraError(CAMERA_LOST_MESSAGE);
      };
      track.onended = onTrackEnded;
      if (track.readyState === "ended") onTrackEnded();
      setCameraStatus("granted");
      const estimator = estimatorRef.current ?? new PoseEstimator();
      estimatorRef.current = estimator;
      estimator.setDiagnosticsLog(motionDiagRef.current);
      try {
        await estimator.load();
      } catch {
        bodyActionsRef.current = false;
        setNotice({
          id: "model",
          title: "Tracker didn't load",
          body: MODEL_FAILED_MESSAGE,
          primary: { label: "Try again", action: "camera" },
        });
        setUi((current) => ({ ...current, guidance: MODEL_FAILED_MESSAGE, actionsEnabled: false }));
        reportCameraError(MODEL_FAILED_MESSAGE);
        return;
      }
      if (cameraStatusFromTrack(track) === "disconnected") {
        bodyActionsRef.current = false;
        cameraStatusRef.current = "disconnected";
        setCameraStatus("disconnected");
        setNotice(cameraNotice({ status: "disconnected", message: CAMERA_LOST_MESSAGE }, "lost"));
        setUi((current) => ({ ...current, guidance: CAMERA_LOST_MESSAGE, confidence: 0, actionsEnabled: false }));
        reportCameraError(CAMERA_LOST_MESSAGE);
        return;
      }
      estimator.setFacing("user");
      const stored = readMotionThresholds();
      if (stored) estimator.setThresholds(stored);
      bodyActionsRef.current = true;
      estimator.start(video, canvas, {
        onUi: (state) => {
          if (tuningRef.current && state.calibrated) tuningRef.current = false;
          sampleRef.current = {
            framingCode: state.framing?.code ?? null,
            confidence: state.framing?.confidence ?? state.confidence,
            poseCount: state.poseCount,
          };
          setUi(state);
          if (motionDiagRef.current && state.diagnostics) {
            const diagnostics = state.diagnostics;
            diagLogRef.current = appendMotionDiag(diagLogRef.current, {
              t: diagnostics.poseAtMs,
              cameraFps: state.rates.cameraFps,
              poseFps: state.rates.poseFps,
              confidence: diagnostics.confidence,
              hipVelocity: diagnostics.hipVelocity,
              shoulderVelocity: diagnostics.shoulderVelocity,
              kneeExtension: diagnostics.kneeExtension,
              jumpCandidate: diagnostics.takeoffPhase,
              jumpConfirmation: diagnostics.jumpPhase ?? "NEUTRAL",
              squatArbitration: diagnostics.squatArbitration,
              lastJump: diagnostics.lastJump,
              serverAck: diagAckRef.current,
              grounded: diagnostics.grounded,
            });
          }
          const hands = syncHandsRef.current();
          publishDiagnostics(
            state.confidence,
            state.diagnostics,
            state.calibrated,
            state.actionsEnabled,
            state.calibrationCue || hands.cue || state.guidance,
            readinessInProgress({
              calibrated: state.calibrated,
              guidance: state.guidance,
              calibrationCue: state.calibrationCue,
              framingCalibrate: Boolean(state.framing?.calibrate),
              handsPhase: hands.phase,
              handsCue: hands.cue,
              poseCount: state.poseCount,
            }),
            state.poseCount,
          );
        },
        onMovement: (draft) => {
          emitMovement(draft);
          const label = gestureLabel(draft.movementType);
          setLastMove(label);
          setTrace((current) => ({
            ...current,
            lastGesture: label,
            gestureType: draft.movementType,
            commandId: draft.eventId,
            poseAtMs: draft.clientTimestamp,
            gestureAtMs: draft.clientTimestamp,
          }));
        },
        onCameraLost: (message) => {
          bodyActionsRef.current = false;
          setCameraStatus("disconnected");
          setNotice(cameraNotice({ status: "disconnected", message }, "lost"));
          reportCameraError(message);
        },
      }, "calibrate");
      if (calibratedBefore) recalibrate();
      setNotice((current) => (current?.id === "link" ? current : null));
    } catch (cameraError) {
      bodyActionsRef.current = false;
      if (track && cameraStatusFromTrack(track) === "disconnected") return;
      const failure = classifyCameraError(cameraError, true);
      cameraStatusRef.current = failure.status;
      setCameraStatus(failure.status);
      setNotice(failure.message.includes("certificate") ? insecureNotice() : cameraNotice(failure, "camera"));
      reportCameraError(failure.message);
      setUi((current) => ({ ...current, guidance: failure.message, actionsEnabled: false }));
      releaseCamera(streamRef.current, video);
      streamRef.current = null;
    } finally {
      openingRef.current = false;
    }
  }

  flushMovesRef.current = () => {
    const socket = socketRef.current;
    const player = identity.current;
    const canSend = Boolean(socket?.connected && player && phaseRef.current === "running");
    const now = Date.now();
    const step = flushMovementQueue(outboxRef.current, now, canSend, COMMAND_STALE_MS);
    outboxRef.current = step.keep;
    for (const dropped of step.dropped) {
      const label = gestureLabel(dropped.body.movementType);
      if (motionDiagRef.current) console.info(`[motiondiag] dropped unsent ${label} age ${now - dropped.queuedAt}ms reason stale`);
      diagAckRef.current = "stale";
      setTrace((currentTrace) => ({
        ...currentTrace,
        lastAck: "Command was too old to apply",
        runnerReason: "stale",
        serverAck: "stale",
      }));
    }
    if (!socket) return;
    for (const item of step.send) {
      const label = gestureLabel(item.body.movementType);
      sentAtRef.current.set(item.eventId, now);
      noteEvent(`movement ${label}`);
      if (motionDiagRef.current) console.info(`[motiondiag] sent ${label}`);
      socket.emit(
        CLIENT_EVENTS.movement,
        item.body,
        (response: { ok?: boolean; message?: string; code?: string; serverTimeMs?: number }) => {
          const code = response?.ok ? "accepted" : response?.code || "rejected";
          if (motionDiagRef.current) console.info(`[motiondiag] ack ${label} ${code}`);
          diagAckRef.current = code;
          setTrace((currentTrace) => ({
            ...currentTrace,
            lastAck: response?.ok ? `${label} accepted` : response?.message || response?.code || "The server did not accept it.",
            serverAck: code,
            serverMs: typeof response?.serverTimeMs === "number" ? response.serverTimeMs : currentTrace.serverMs,
            lastSent: label,
            sentPhoneMs: now,
          }));
        },
      );
      setTrace((currentTrace) => ({ ...currentTrace, lastSent: label, sentPhoneMs: now, commandId: item.eventId }));
    }
  };

  function emitMovement(draft: MovementDraft) {
    const current = identity.current;
    if (!current) return;
    if (!gameplaySendAllowed({
      controllerOn: controllerRef.current,
      tuning: tuningRef.current,
      hidden: hiddenRef.current,
      upright: uprightRef.current,
      phase: phaseRef.current,
      ready: readySent.current,
      framingPaused: framingPauseRef.current,
      cameraLive: bodyActionsRef.current,
    })) return;
    const eventId = draft.eventId.length >= 8 ? draft.eventId : draft.eventId.padEnd(8, "0");
    const queuedAt = Date.now();
    outboxRef.current = enqueueMovement(outboxRef.current, {
      eventId,
      queuedAt,
      sent: false,
      body: {
        v: PROTOCOL_VERSION,
        eventId,
        playerId: current.playerId,
        sessionId: current.sessionId,
        movementType: draft.movementType,
        confidence: draft.confidence,
        clientTimestamp: queuedAt,
        sequenceNumber: draft.sequenceNumber,
      },
    });
    flushMovesRef.current();
  }

  function commitReady(isReady: boolean, confidence: number) {
    if (readySent.current === isReady) return;
    readySent.current = isReady;
    noteEvent(isReady ? "player:ready" : "player:not-ready");
    socketRef.current?.emit("player:ready", { v: PROTOCOL_VERSION, ready: isReady });
    const liveRound = phaseRef.current === "running" || phaseRef.current === "paused" || phaseRef.current === "countdown";
    if (isReady) {
      pushBodyStatus("ready", confidence, "Motion tracking active", null, true);
      return;
    }
    if (liveRound) {
      pushBodyStatus("calibrating", confidence, "", null, true);
      return;
    }
    pushBodyStatus(
      phoneBodyStatus({
        joined: joinedRef.current,
        camera: cameraStatusRef.current,
        poseCount: sampleRef.current.poseCount,
        ready: false,
        liveRound: false,
        actionsEnabled: false,
        calibrated: calibratedRef.current,
        readinessActive: false,
      }),
      confidence,
      "",
      null,
      true,
    );
  }

  function commitPause() {
    noteEvent("game:pause");
    socketRef.current?.emit("game:pause");
    socketRef.current?.emit("player:status", {
      v: PROTOCOL_VERSION,
      status: "tracking",
      confidence: sampleRef.current.confidence,
      message: STEP_BACK_INTO_FRAME,
    });
  }

  function commitResume() {
    noteEvent("game:resume");
    estimatorRef.current?.resumeTracking();
    socketRef.current?.emit(CLIENT_EVENTS.gameResume);
  }

  function syncHands() {
    const view = handsRef.current.push({
      now: performance.now(),
      cameraGranted: cameraStatusRef.current === "granted",
      sessionConnected: linkedRef.current && joinedRef.current,
      framingCode: sampleRef.current.framingCode,
      confidence: sampleRef.current.confidence,
      poseCount: sampleRef.current.poseCount,
      presenceConfidence: null,
      detectionConfidence: null,
      serverPhase: phaseRef.current,
      serverCountdown: countdownRef.current,
      countdownPurpose: purposeRef.current,
    });
    setHandsView(view);
    if (view.sendReady === true) commitReady(true, sampleRef.current.confidence);
    if (view.sendReady === false) commitReady(false, sampleRef.current.confidence);
    if (view.pause) commitPause();
    if (view.resumeCountdown) commitResume();
    if (view.phase === "PLAYING" && phaseRef.current === "running" && !controllerRef.current) beginControl();
    return view;
  }
  syncHandsRef.current = syncHands;

  function recalibrate() {
    tuningRef.current = true;
    setTuning(true);
    estimatorRef.current?.recalibrate();
    setUi((current) => ({
      ...current,
      calibrated: false,
      guidance: "Stand naturally",
      movement: null,
      actionsEnabled: false,
    }));
  }

  function useKeyboardFallback() {
    noteEvent("player:fallback");
    socketRef.current?.emit("player:fallback");
    setNotice({
      id: "keyboard",
      title: "Using the TV keyboard",
      body: "This phone will not send moves. Play with the keys on the TV.",
    });
  }

  useEffect(() => {
    if (tuning && ui.calibrated) {
      tuningRef.current = false;
      setTuning(false);
    }
    const round = controllerOn && (phase === "running" || phase === "paused" || phase === "countdown");
    if (tuningRef.current && !ui.calibrated) {
      estimatorRef.current?.setRaceLive(false);
      estimatorRef.current?.setMode("calibrate");
      return;
    }
    if (round) {
      estimatorRef.current?.setRaceLive(raceLive !== false);
      estimatorRef.current?.setMode("play");
      return;
    }
    estimatorRef.current?.setRaceLive(false);
    if (cameraOn) estimatorRef.current?.setMode("calibrate");
  }, [phase, raceLive, ui.calibrated, controllerOn, tuning, cameraOn]);

  useEffect(() => {
    estimatorRef.current?.setCoaching(phase !== "running");
  }, [phase]);

  openCameraRef.current = () => {
    void enableCamera();
  };

  useEffect(() => {
    syncHandsRef.current();
    if (!joined || cameraStatus !== "off") return;
    const timer = window.setTimeout(() => openCameraRef.current(), 0);
    return () => window.clearTimeout(timer);
  }, [joined, cameraStatus]);

  function togglePause() {
    const next = phase === "paused" ? "game:resume" : "game:pause";
    noteEvent(next);
    socketRef.current?.emit(next);
  }

  function leaveSession() {
    noteEvent("session:leave");
    socketRef.current?.emit("session:leave");
    bodyActionsRef.current = false;
    controllerRef.current = false;
    estimatorRef.current?.stop();
    releaseCamera(streamRef.current, videoRef.current);
    streamRef.current = null;
    setCameraStatus("off");
    setJoined(false);
    setControllerOn(false);
    readySent.current = false;
    handsRef.current = createHandsFree();
    countdownRef.current = 0;
    purposeRef.current = null;
    sampleRef.current = { framingCode: null, confidence: 0, poseCount: 0 };
    setHandsView(null);
    setLeaveOpen(false);
    setLastMove("");
    setUi(EMPTY_UI);
  }

  async function resumePreview() {
    try {
      await videoRef.current?.play();
      setCameraPaused(false);
    } catch {
      setCameraPaused(true);
    }
  }

  function beginControl() {
    controllerRef.current = true;
    setControllerOn(true);
    estimatorRef.current?.setMode("play");
    const pauseEnabled = raceLive !== false && (phase === "running" || phase === "paused" || phase === "countdown");
    estimatorRef.current?.setRaceLive(pauseEnabled);
  }

  function onAction(action: RecoveryAction) {
    if (action === "camera") void enableCamera();
    if (action === "join") void join();
    if (action === "reconnect") reconnect();
    if (action === "certificate") openCertificate();
    if (action === "resume") void resumePreview();
    if (action === "recalibrate") recalibrate();
    if (action === "keyboard") useKeyboardFallback();
    if (action === "preview") reloadPreview();
  }

  function openDiagnostics() {
    diagnosticsOpenRef.current = true;
    setEventLog(logRef.current);
    setDiagnosticsOpen(true);
  }

  function downloadMotionLog() {
    const blob = new Blob([motionDiagDownload(diagLogRef.current)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fitrunner-motion.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const previewNotice: PhoneNotice | null = preview && !preview.ok && !joined
    ? {
        id: "preview",
        title: "Can't find that game",
        body: friendlyJoinError(preview.code, preview.message),
        primary: { label: "Try again", action: "preview" },
      }
    : null;
  const screenNotice = !upright
    ? null
    : tabHidden
      ? { id: "hidden", title: "Tab hidden", body: TAB_HIDDEN_MESSAGE }
      : cameraPaused
        ? {
            id: "paused-tab",
            title: "Camera paused",
            body: "The camera paused while this tab was hidden.",
            primary: { label: "Resume camera", action: "resume" as const },
          }
        : notice ?? previewNotice;
  const handsCue = handsView?.trackingWarning && !handsView.cue
    ? { line: "Tracking lost", tone: "error" as const }
    : handsView?.cue
      ? { line: handsView.cue, tone: (handsView.cue === "Motion tracking active" || handsView.cue === "Player detected" ? "ready" : handsView.phase === "PAUSED" || handsView.trackingWarning ? "error" : "info") as "ready" | "info" | "error" }
      : null;
  const cue = screenNotice
    ? null
    : ui.calibrationCue
      ? { line: ui.calibrationCue, tone: "info" as const }
      : handsView
        ? handsCue
        : cueFor(stage, cameraOn, ui);
  const showDiagnostics = motionDiag || motionDiagnosticsEnabled();
  const personLine = trackingStatusLine(flow, ui.poseCount, handsView?.cue ?? cue?.line ?? null);
  const adjustment = framingStatusCue(ui.calibrationCue) || framingStatusCue(handsView?.cue) || framingStatusCue(cue?.line);
  const gesture = liveGestureName(lastMove);

  return (
    <main
      data-phone-stage={stage}
      data-phone-flow={flow}
      className={`fixed inset-0 h-dvh w-dvw touch-manipulation overflow-hidden ${stage === "join" ? "bg-white text-[#14211A]" : "bg-black text-white"}`}
    >
      {stage === "join" ? (
        <JoinPanel
          name={name}
          onName={(value) => {
            setName(value);
            setNameError(null);
          }}
          error={nameError ?? submitError ?? previewError}
          joining={joining}
          onSubmit={(event) => void join(event)}
        />
      ) : (
        <div ref={stageRef} data-camera-preview className="absolute inset-0 overflow-hidden bg-black">
          <div
            aria-hidden={cameraOn ? undefined : true}
            className="absolute -scale-x-100"
            style={{
              left: previewBox.width > 0 ? previewBox.x : 0,
              top: previewBox.height > 0 ? previewBox.y : 0,
              width: previewBox.width > 0 ? previewBox.width : "100%",
              height: previewBox.height > 0 ? previewBox.height : "100%",
            }}
          >
            <video
              ref={videoRef}
              className="block h-full w-full"
              style={{ objectFit: previewBox.known ? "fill" : "contain" }}
              playsInline
              muted
              autoPlay
              aria-label="Camera preview"
            />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 block h-full w-full" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
            <div className="max-w-[70%] rounded-2xl bg-black/55 px-3 py-1.5 text-xs leading-snug">
              <p className="text-[#3df0ff]">{connectionCopy(link, trace.phoneRoundTripMs)}</p>
              <p className="font-display tracking-[0.08em] text-[#BEFF39]">{personLine}</p>
              {adjustment ? <p className="text-white">{adjustment}</p> : null}
              {stage === "play" ? <p className="text-white/70">{roundCopy(phase)}</p> : null}
            </div>
            {showDiagnostics ? (
              <div className="pointer-events-auto">
                <QuietButton onClick={openDiagnostics}>Diagnostics</QuietButton>
              </div>
            ) : null}
          </div>
          {showDiagnostics && ui.diagnostics ? (
            <aside
              data-motion-debug=""
              className="pointer-events-none absolute top-24 left-[max(0.75rem,env(safe-area-inset-left))] z-20 max-h-[55dvh] w-60 overflow-y-auto rounded-xl bg-black/70 px-2 py-1.5 font-mono text-[10px] leading-snug text-white/85"
            >
              {motionDebugLines({
                confidence: ui.diagnostics.confidence,
                kneeAngle: ui.diagnostics.kneeAngle,
                hipDrop: ui.diagnostics.hipDrop,
                hipVelocity: ui.diagnostics.hipVelocity,
                recognition: ui.diagnostics.recognition,
                jumpConfidence: ui.diagnostics.jumpConfidence,
                squatConfidence: ui.diagnostics.squatConfidence,
                command: ui.diagnostics.lastGesture,
                shoulderVelocity: ui.diagnostics.shoulderVelocity,
                kneeExtension: ui.diagnostics.kneeExtension,
                jumpCandidate: ui.diagnostics.takeoffPhase,
                jumpConfirmation: ui.diagnostics.jumpPhase,
                squatArbitration: ui.diagnostics.squatArbitration,
                lastJump: ui.diagnostics.lastJump,
                serverAck: authoritativeMoveLabel({ tvState: trace.tvState, serverAck: trace.serverAck }),
                grounded: ui.diagnostics.grounded,
                cameraFps: ui.rates.cameraFps,
              }).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <button type="button" className="pointer-events-auto mt-1 min-h-8 w-full rounded-md bg-white/15 text-left text-white" onClick={downloadMotionLog}>
                Download log
              </button>
              <p>candidate {candidateLabel(ui.diagnostics)}</p>
              <p>confirmed {ui.diagnostics.lastGesture || trace.lastGesture || "none"}</p>
              <p>sent {trace.lastSent || "none"}</p>
              <p>ack {trace.lastAck || "none"}</p>
              <p>rtt {trace.phoneRoundTripMs === null ? "—" : `${trace.phoneRoundTripMs}ms`}</p>
              <p>{authoritativeMoveLabel({ tvState: trace.tvState, serverAck: trace.serverAck })}</p>
            </aside>
          ) : null}
          {gesture ? (
            <p className="pointer-events-none absolute bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+4rem))] left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1 font-display tracking-[0.18em] text-[#BEFF39]">
              {gesture}
            </p>
          ) : null}
          {handsView?.phase === "COUNTDOWN" && handsView.countdown ? (
            <p
              data-countdown={handsView.countdown}
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center font-display text-8xl text-[#BEFF39]"
              role="status"
            >
              {handsView.countdown}
            </p>
          ) : null}
          {stage === "setup" && !cameraOn ? (
            <div className="absolute inset-0 z-10 bg-[#141618]">
              <CameraSetup
                hint={FRAMING_DISTANCE_HINT}
                notice={screenNotice}
                onAction={onAction}
                requesting={cameraStatus === "requesting"}
                onEnable={() => void enableCamera()}
              />
            </div>
          ) : null}
          {cameraOn && (screenNotice || stage === "play") ? (
            <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 px-[max(0.75rem,env(safe-area-inset-left))] pt-2 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {screenNotice ? <PhoneAlert notice={screenNotice} onAction={onAction} /> : null}
              {stage === "play" ? (
                <PlayControls
                  paused={phase === "paused"}
                  bodyOut={Boolean(ui.framing?.pause) || Boolean(handsView?.trackingHold)}
                  hideResume={Boolean(handsView?.trackingHold)}
                  onPause={togglePause}
                  onRecalibrate={recalibrate}
                  onLeave={() => setLeaveOpen(true)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {!upright ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#141618] px-6 text-center">
          <p className="font-display text-3xl text-white" role="status">{ROTATE_MESSAGE}</p>
        </div>
      ) : null}
      {leaveOpen ? <LeaveConfirm onStay={() => setLeaveOpen(false)} onLeave={leaveSession} /> : null}
      {showDiagnostics && diagnosticsOpen ? (
        <DiagnosticsSheet
          rows={diagnosticRows(ui, trace, cameraStatus, link, phase, upright)}
          events={eventLog}
          onDownload={downloadMotionLog}
          onClose={() => {
            diagnosticsOpenRef.current = false;
            setDiagnosticsOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

function cueFor(stage: Stage, cameraOn: boolean, ui: PoseUiState): { line: string; tone: "ready" | "info" | "error" } | null {
  if (!cameraOn) return null;
  const view = ui.framing;
  if (stage === "calibrate") {
    const text = plainCalibrationCue(ui.guidance, view?.code ?? null, view?.confidence ?? ui.confidence);
    return { line: text, tone: text === "Full body detected" ? "ready" : "info" };
  }
  if (view && (view.pause || view.banner)) {
    return { line: view.canResume ? BODY_RETURN_MESSAGE : BODY_LEFT_MESSAGE, tone: "error" };
  }
  if (stage === "play" && ui.diagnostics?.reject === "tracking_lost") {
    return { line: TRACKING_LOST_MESSAGE, tone: "error" };
  }
  if (stage === "tutorial") {
    if (!view || view.code === "good") return null;
    const text = plainFramingCue(view.code, view.confidence);
    return { line: text, tone: "info" };
  }
  if (stage === "play" && view?.code === "good") {
    const limb = plainLimbCue(view.unavailable);
    if (limb) return { line: limb, tone: "info" };
    return null;
  }
  if (view) {
    const text = plainFramingCue(view.code, view.confidence);
    return { line: text, tone: view.code === "good" ? "ready" : "info" };
  }
  return { line: "Looking for you", tone: "info" };
}

function cameraNotice(failure: { status: "denied" | "unavailable" | "disconnected"; message: string }, id: string): PhoneNotice {
  const keyboard = failure.message.toLowerCase().includes("keyboard")
    ? { label: "Use the TV keyboard", action: "keyboard" as const }
    : undefined;
  const title = failure.status === "denied"
    ? "Camera blocked"
    : failure.message.toLowerCase().includes("in use")
      ? "Camera is in use"
      : failure.status === "disconnected"
        ? "Camera disconnected"
        : "Camera unavailable";
  return {
    id,
    title,
    body: failure.message,
    primary: { label: "Try again", action: "camera" },
    secondary: keyboard,
  };
}

function insecureNotice(): PhoneNotice {
  return {
    id: "insecure",
    title: "Accept the certificate",
    body: "This page is not secure yet. Open the https link, accept the certificate, then try again.",
    primary: { label: "Try again", action: "camera" },
    secondary: { label: "Open the secure check", action: "certificate" },
  };
}

function realtimeNotice(alreadyJoined: boolean): PhoneNotice {
  const proxied = socketUsesPageOrigin(window.location.origin);
  return {
    id: "link",
    title: "Game connection is down",
    body: proxied ? "The live game is unreachable. Check the connection, then try again." : REALTIME_DOWN_MESSAGE,
    primary: { label: alreadyJoined ? "Reconnect" : "Try again", action: alreadyJoined ? "reconnect" : "join" },
    secondary: proxied ? undefined : { label: "Accept certificate", action: "certificate" },
  };
}

function phoneNotice(): PhoneNotice {
  return {
    id: "link",
    title: "Phone disconnected",
    body: PHONE_OFF_MESSAGE,
    primary: { label: "Reconnect", action: "reconnect" },
  };
}

function diagnosticRows(
  ui: PoseUiState,
  trace: MotionTrace,
  cameraStatus: CameraPermission,
  link: string,
  phase: string,
  upright: boolean,
): Array<[string, string]> {
  const diagnostics = ui.diagnostics;
  const gesture = trace.gestureType ?? diagnostics?.lastGesture ?? null;
  return [
    ["Camera", cameraStatus],
    ["Link", link],
    ["Round", phase],
    ["Camera fps", ui.rates.cameraFps === null ? "—" : ui.rates.cameraFps.toFixed(1)],
    ["Pose fps", ui.rates.poseFps === null ? "—" : ui.rates.poseFps.toFixed(1)],
    ["Confidence", `${Math.round((diagnostics?.confidence ?? ui.confidence) * 100)}%`],
    ["Orientation", `${upright ? "portrait" : "sideways"} · body ${diagnostics?.orientation ?? "unknown"}`],
    ["Mirror", diagnostics ? (diagnostics.mirrored ? "selfie mirror on" : "mirror off") : "—"],
    ["Full body", diagnostics ? `${Math.round(diagnostics.bodyVisibility * 100)}% of required joints` : "—"],
    ["Joints", diagnostics?.joints || ui.landmarksLabel || "None"],
    ["Torso neutral", diagnostics?.torsoNeutral === undefined ? "—" : diagnostics.torsoNeutral.toFixed(3)],
    ["Body lean", diagnostics ? `${diagnostics.leanDirection ?? "neutral"} ${Math.abs(diagnostics.torsoLean ?? 0).toFixed(3)}` : "—"],
    ["Lean check", diagnostics?.leanPhase ?? "—"],
    ["Left arm", armDiagnosticLabel("left", diagnostics?.leftPhase)],
    ["Right arm", armDiagnosticLabel("right", diagnostics?.rightPhase)],
    ["Wrist height", diagnostics ? `L ${diagnostics.leftHeight.toFixed(2)} · R ${diagnostics.rightHeight.toFixed(2)} torso` : "—"],
    ["Outward", diagnostics ? `L ${diagnostics.leftOutward.toFixed(2)} · R ${diagnostics.rightOutward.toFixed(2)} shoulders` : "—"],
    ["Arm angles", diagnostics ? `L ${diagnostics.leftElevation.toFixed(0)}° reach ${diagnostics.leftReach.toFixed(2)} · R ${diagnostics.rightElevation.toFixed(0)}° reach ${diagnostics.rightReach.toFixed(2)}` : "—"],
    ["Elbows", diagnostics ? `L ${diagnostics.leftElbow.toFixed(0)}° · R ${diagnostics.rightElbow.toFixed(0)}°` : "—"],
    ["Jump", diagnostics ? `${diagnostics.takeoffPhase} · ${diagnostics.grounded} · hip ${diagnostics.hipVelocity.toFixed(2)} · shoulder ${diagnostics.shoulderVelocity.toFixed(2)} torso/s` : "—"],
    ["Knee extension", diagnostics ? `${diagnostics.kneeExtension.toFixed(0)}°` : "—"],
    ["Squat arbitration", diagnostics?.squatArbitration ?? "—"],
    ["Last jump", diagnostics?.lastJump || "none"],
    ["Gesture state", diagnostics?.recognition ?? "—"],
    ["Jump confidence", diagnostics ? `${Math.round(diagnostics.jumpConfidence * 100)}%` : "—"],
    ["Squat confidence", diagnostics ? `${Math.round(diagnostics.squatConfidence * 100)}%` : "—"],
    ["Gesture", diagnostics?.phase ?? "—"],
    ["Cooldown", diagnostics ? `${Math.round(diagnostics.cooldownMs)} ms` : "—"],
    ["Left check", armCheckCopy("left", gesture)],
    ["Right check", armCheckCopy("right", gesture)],
    ["Candidate", candidateLabel({
      squatPhase: diagnostics?.squatPhase,
      jumpPhase: diagnostics?.jumpPhase,
      leanPhase: diagnostics?.leanPhase,
      leftPhase: diagnostics?.leftPhase,
      rightPhase: diagnostics?.rightPhase,
    })],
    ["Confirmed", diagnostics?.lastGesture || trace.lastGesture || "none"],
    ["State", diagnostics?.recognition ?? "—"],
    ["Last command sent", trace.lastSent || "none"],
    ["Gesture detected", clockLabel(trace.gestureAtMs ?? diagnostics?.gestureAtMs, "phone performance")],
    ["Command sent", clockLabel(trace.sentPhoneMs, "phone date")],
    ["Command accepted", clockLabel(trace.serverMs, "server date")],
    ["Command executed", clockLabel(trace.tvMs, "TV date")],
    ["Phone round trip", trace.phoneRoundTripMs === null ? "—" : `${trace.phoneRoundTripMs} ms on the phone clock`],
    ["Command id", trace.commandId || diagnostics?.eventId || "—"],
    ["Last ack", trace.lastAck || "None yet"],
    ["Last applied", trace.lastApplied || "None yet"],
    ["Accept or reject", acceptOrReject(diagnostics?.reject, trace.runnerReason, gesture)],
    ["Authoritative", authoritativeMoveLabel({ tvState: trace.tvState, serverAck: trace.serverAck })],
  ];
}

function armCheckCopy(side: "left" | "right", movement: string | null) {
  const ask = side === "left" ? "Raise your LEFT arm" : "Raise your RIGHT arm";
  const verdict = armMappingVerdict(side, movement);
  if (verdict === "match") return `${ask} · matches ${side}`;
  if (verdict === "mismatch") return `${ask} · mapped to the other side`;
  return `${ask} · waiting`;
}

function clockLabel(value: number | null | undefined, clock: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} · ${clock}`;
}

function acceptOrReject(pose: string | null | undefined, runner: string, gesture: string | null) {
  const text = diagnosticReject(pose, runner);
  if (text !== "None") return text;
  if (gesture) return "Accepted by the detector";
  return "None";
}

function diagnosticReject(pose: string | null | undefined, runner: string) {
  const poseText = rejectLabel(pose);
  const runnerText = rejectLabel(runner);
  if (poseText && runnerText && poseText !== runnerText) return `${poseText}. ${runnerText}`;
  return poseText || runnerText || "None";
}

function rejectLabel(reason: string | null | undefined) {
  if (reason === "both_arms") return "Both arms were out";
  if (reason === "low_confidence") return "Confidence was low";
  if (reason === "tracking_lost") return "Tracking was lost";
  if (reason === "forward_bend") return "Forward bend, not a squat";
  if (reason === "stale") return "Command was too old to apply";
  if (reason === "replaced") return "A newer command replaced it";
  if (reason === "not_ready") return "The runner could not take that action";
  if (reason === "duplicate") return "That command was already used";
  if (reason === "buffered") return "";
  if (!reason) return "";
  return reason;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}
