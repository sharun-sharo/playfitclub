"use client";

import { CLIENT_EVENTS, PLAYER_STATUSES, PROTOCOL_VERSION, RUN_LIVES, resolvePublicAppUrl, SERVER_EVENTS, type PlayerStatusName } from "@fitplay/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { io, type Socket } from "socket.io-client";
import type { PoseCommand, PoseReport } from "@/components/fitrunner-v2/create-fitrunner";
import { tutorialGestureFor } from "@/components/fitrunner-v2/tutorial-actions";
import {
  clearStoredHostToken,
  hostBootAction,
  readStoredHostToken,
  shouldApplyHostSession,
  writeStoredHostToken,
} from "@/components/fitrunner-v2/host-session-boot";
import { noteTvDiagnostic } from "@/components/tv/tv-diagnostics";
import { browserRealtimeConnection, clientEnv, devCertificateHost, GAME_SERVER_DISCONNECTED, socketUsesPageOrigin } from "@/lib/env";
import type { PoseDiagnostics } from "@/lib/vision/pose-estimator";

export { HOST_TOKEN_KEY } from "@/components/fitrunner-v2/host-session-boot";

export type LivesAck = {
  ok?: boolean;
  accepted?: boolean;
  lives?: number;
  hits?: number;
  gameOver?: boolean;
  resumed?: boolean;
  code?: string;
};

function emitWithAck<T>(socket: Socket, event: string, payload: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 4000);
    socket.emit(event, payload, (response: T) => {
      window.clearTimeout(timer);
      resolve(response);
    });
  });
}

const MOVEMENTS = new Set(["lean_left", "lean_right", "squat", "jump", "punch", "hold"]);
const TRACKING_STATUSES = new Set<string>(PLAYER_STATUSES);

export type TvPlayer = {
  id: string;
  displayName: string;
  ready: boolean;
  connected: boolean;
  control: "camera" | "keyboard";
};

export type TvTracking = {
  status: PlayerStatusName;
  confidence?: number;
  message?: string;
  diagnostics?: PoseDiagnostics;
};

function commandFrom(payload: unknown): PoseCommand | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.eventId !== "string" || record.eventId.length < 8) return null;
  if (typeof record.movementType !== "string") return null;
  const gesture = tutorialGestureFor(record.movementType);
  const mapped =
    gesture === "left" ? "lean_left" : gesture === "right" ? "lean_right" : gesture === "squat" ? "squat" : gesture === "jump" ? "jump" : record.movementType;
  if (!MOVEMENTS.has(mapped)) return null;
  if (typeof record.confidence !== "number" || !Number.isFinite(record.confidence)) return null;
  if (typeof record.playerId !== "string" || typeof record.sessionId !== "string") return null;
  if (typeof record.sequenceNumber !== "number" || typeof record.clientTimestamp !== "number") return null;
  return {
    eventId: record.eventId,
    movementType: mapped as PoseCommand["movementType"],
    confidence: record.confidence,
    clientTimestamp: record.clientTimestamp,
    sequenceNumber: record.sequenceNumber,
    playerId: record.playerId,
    sessionId: record.sessionId,
    source: record.source === "keyboard" ? "keyboard" : "camera",
  };
}

function readPlayers(value: unknown): TvPlayer[] {
  if (!Array.isArray(value)) return [];
  const players: TvPlayer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    players.push({
      id: record.id,
      displayName: typeof record.displayName === "string" ? record.displayName : "Player",
      ready: record.ready === true,
      connected: record.connected === true,
      control: record.control === "keyboard" ? "keyboard" : "camera",
    });
  }
  return players;
}

function readTracking(value: unknown): TvTracking | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string" || !TRACKING_STATUSES.has(record.status)) return null;
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence) ? record.confidence : undefined;
  const message = typeof record.message === "string" ? record.message : undefined;
  const diagnostics = record.diagnostics && typeof record.diagnostics === "object" ? (record.diagnostics as PoseDiagnostics) : undefined;
  return { status: record.status as TvTracking["status"], confidence, message, diagnostics };
}

/**
 * Opens one phone-join session for this page load.
 * Refresh and navigation mint a new code. Play Again and a socket reconnect stay on it.
 * Movement events stay on movement:event. Scores are ignored.
 */
export function useTvSession(
  ready: boolean,
  onCommand: (event: PoseCommand) => PoseReport | undefined,
  onDiagnostics: (diagnostics: PoseDiagnostics) => void,
) {
  const commandRef = useRef(onCommand);
  const diagnosticsRef = useRef(onDiagnostics);
  const pending = useRef<PoseCommand | null>(null);
  const started = useRef("");
  const socketRef = useRef<Socket | null>(null);
  const wantKeyboard = useRef(false);
  const sessionReady = useRef(false);
  const keyboardSent = useRef(false);
  const requestKeyboard = useRef(() => {});
  const raceWanted = useRef<boolean | null>(null);
  const pushRaceRef = useRef(() => {});
  const sessionIdRef = useRef("");
  const pageToken = useRef("");
  const acceptedSessionId = useRef("");
  const opening = useRef(false);
  commandRef.current = onCommand;
  diagnosticsRef.current = onDiagnostics;
  const [connected, setConnected] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [phase, setPhase] = useState("lobby");
  const [players, setPlayers] = useState<TvPlayer[]>([]);
  const [tracking, setTracking] = useState<TvTracking | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const [keyboardChosen, setKeyboardChosen] = useState(false);
  const [trackingSeq, setTrackingSeq] = useState(0);
  const [trustUrl, setTrustUrl] = useState("");
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [countdownPurpose, setCountdownPurpose] = useState<"start" | "resume" | null>(null);
  const [lives, setLives] = useState(RUN_LIVES);
  const [hits, setHits] = useState(0);
  const [runOver, setRunOver] = useState(false);

  const joinUrl = joinCode
    ? `${resolvePublicAppUrl({
        configuredUrl: clientEnv().appUrl,
        requestOrigin: typeof window === "undefined" ? "" : window.location.origin,
        production: process.env.NODE_ENV === "production",
      })}/join/${joinCode}`
    : "";

  useEffect(() => {
    if (!joinUrl) return;
    let cancel = false;
    void QRCode.toDataURL(joinUrl, { margin: 1, width: 480, color: { dark: "#1c1f24", light: "#ffffff" } }).then((url) => {
      if (!cancel) setQr(url);
    });
    return () => {
      cancel = true;
    };
  }, [joinUrl]);

  useEffect(() => {
    let socket: Socket | null = null;
    let stopped = false;
    let minted = false;
    if (!pageToken.current) {
      opening.current = false;
      acceptedSessionId.current = "";
      setJoinCode("");
      setQr("");
    }
    const storedAtBoot = pageToken.current ? null : readStoredHostToken(window.localStorage);
    const realtime = browserRealtimeConnection(window.location.origin);
    if (!realtime.ok) {
      setTrustUrl("");
      setConnected(false);
      setJoinCode("");
      setQr("");
      setError(GAME_SERVER_DISCONNECTED);
      noteTvDiagnostic({ realtime: "error", session: "error", lastError: GAME_SERVER_DISCONNECTED });
      return () => {
        stopped = true;
      };
    }

    const deliver = (event: PoseCommand) => {
      const report = commandRef.current(event);
      pending.current = report ? null : event;
    };

    const applyState = (payload: {
      id?: string;
      joinCode?: string;
      phase?: string;
      statusMessage?: string | null;
      players?: unknown;
      tracking?: unknown;
      countdown?: number;
      countdownPurpose?: "start" | "resume" | null;
      lives?: number;
      hits?: number;
      runOver?: boolean;
    }) => {
      if (payload.id) sessionIdRef.current = payload.id;
      if (typeof payload.lives === "number") setLives(payload.lives);
      if (typeof payload.hits === "number") setHits(payload.hits);
      if (typeof payload.runOver === "boolean") setRunOver(payload.runOver);
      if (payload.joinCode) {
        setJoinCode(payload.joinCode);
        noteTvDiagnostic({ session: "ready", lastError: "" });
      }
      if (payload.phase) setPhase(payload.phase);
      if (typeof payload.countdown === "number") setCountdown(payload.countdown);
      if (payload.countdownPurpose === "start" || payload.countdownPurpose === "resume" || payload.countdownPurpose === null) {
        setCountdownPurpose(payload.countdownPurpose ?? null);
      }
      if (typeof payload.statusMessage === "string" || payload.statusMessage === null) setStatusMessage(payload.statusMessage ?? "");
      const nextPlayers = readPlayers(payload.players);
      if (payload.players) {
        setPlayers(nextPlayers);
        setKeyboardChosen(nextPlayers.some((player) => player.connected && player.control === "keyboard"));
      }
      const nextTracking = readTracking(payload.tracking);
      if (payload.tracking) {
        setTracking(nextTracking);
        setTrackingSeq((value) => value + 1);
      }
      if (nextTracking?.diagnostics) diagnosticsRef.current(nextTracking.diagnostics);
      if (payload.phase === "lobby") started.current = "";
    };

    void fetch("/api/me")
      .then((response) => response.json())
      .then((body: { socketToken?: string }) => {
        if (stopped) return;
        const realtimeUrl = realtime.url;
        socket = io(realtimeUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
          auth: body.socketToken ? { userToken: body.socketToken } : {},
        });
        socketRef.current = socket;
        noteTvDiagnostic({ realtime: "connecting", session: "creating", lastError: "" });
        socket.on("connect_error", () => {
          const separateServer = !socketUsesPageOrigin(window.location.origin);
          const approveCertificate = separateServer && devCertificateHost(realtimeUrl);
          setTrustUrl(approveCertificate ? `${realtimeUrl}/health` : "");
          const message = approveCertificate ? "The session server needs a one-time certificate approval." : "Could not reach the game connection.";
          setError(message);
          noteTvDiagnostic({ realtime: "error", session: "error", lastError: message });
        });
        const sendKeyboard = () => {
          const current = socketRef.current;
          if (!wantKeyboard.current || !sessionReady.current || !current?.connected || keyboardSent.current) return;
          keyboardSent.current = true;
          current.emit(
            "player:keyboard",
            { v: PROTOCOL_VERSION, displayName: "Keyboard" },
            (response: { ok?: boolean; message?: string }) => {
              if (response?.ok) {
                setKeyboardChosen(true);
                setError("");
                return;
              }
              keyboardSent.current = false;
              setError(response?.message ?? "Keyboard fallback did not start.");
            },
          );
        };
        requestKeyboard.current = sendKeyboard;
        const startFresh = () => {
          if (stopped || minted || pageToken.current) return;
          minted = true;
          socket?.emit("session:create", { v: PROTOCOL_VERSION, gameSlug: "fitrunner", durationSeconds: 180, maxPlayers: 1 });
        };
        const retireStoredSession = (token: string) => {
          const current = socket;
          if (!current) {
            startFresh();
            return;
          }
          void emitWithAck<{ ok?: boolean }>(current, CLIENT_EVENTS.sessionReconnect, { token }).then((response) => {
            if (stopped) return;
            if (!response?.ok) {
              startFresh();
              return;
            }
            void emitWithAck(current, CLIENT_EVENTS.sessionClose, { v: PROTOCOL_VERSION }).finally(() => {
              if (!stopped) startFresh();
            });
          });
        };
        socket.on("connect", () => {
          if (stopped) return;
          setConnected(true);
          setError("");
          noteTvDiagnostic({ realtime: "connected", lastError: "" });
          sessionReady.current = false;
          keyboardSent.current = false;
          const plan = hostBootAction({
            pageToken: pageToken.current || null,
            storedToken: storedAtBoot,
          });
          if (plan.kind === "resume") {
            socket?.emit(CLIENT_EVENTS.sessionReconnect, { token: plan.token }, (response: { ok?: boolean }) => {
              if (stopped) return;
              if (response?.ok) {
                sessionReady.current = true;
                requestKeyboard.current();
                pushRaceRef.current();
                return;
              }
              pageToken.current = "";
              acceptedSessionId.current = "";
              clearStoredHostToken(window.localStorage);
              minted = false;
              opening.current = false;
              startFresh();
            });
            return;
          }
          if (opening.current) return;
          opening.current = true;
          clearStoredHostToken(window.localStorage);
          if (plan.kind === "retire") {
            retireStoredSession(plan.token);
            return;
          }
          startFresh();
        });
        socket.on("disconnect", () => setConnected(false));
        socket.on("movement:event", (payload: unknown) => {
          const command = commandFrom(payload);
          if (command) deliver(command);
        });
        socket.on(SERVER_EVENTS.sessionError, (payload: { code?: string; message?: string }) => {
          if (payload?.code === "NOT_READY") started.current = "";
          if (payload?.message) {
            setError(payload.message);
            noteTvDiagnostic({ session: "error", lastError: payload.message });
          }
        });
        socket.on(SERVER_EVENTS.sessionCreated, (payload: { token?: string; session?: { id?: string; joinCode?: string; phase?: string; players?: unknown } }) => {
          if (payload.session?.id) acceptedSessionId.current = payload.session.id;
          if (payload.token) {
            pageToken.current = payload.token;
            writeStoredHostToken(window.localStorage, payload.token);
            const currentAuth = socket?.auth;
            if (socket) {
              socket.auth = { ...(typeof currentAuth === "object" && currentAuth ? currentAuth : {}), token: payload.token };
            }
          }
          if (payload.session) applyState(payload.session);
          sessionReady.current = true;
          setError("");
          requestKeyboard.current();
          pushRaceRef.current();
        });
        socket.on(SERVER_EVENTS.sessionState, (payload: { id?: string; joinCode?: string; phase?: string; players?: unknown; tracking?: unknown; statusMessage?: string | null }) => {
          if (!shouldApplyHostSession(acceptedSessionId.current, payload?.id)) return;
          applyState(payload);
        });
      })
      .catch(() => {
        if (!stopped) {
          const message = "Could not reach the PlayFit Club server.";
          setError(message);
          noteTvDiagnostic({ realtime: "error", session: "error", lastError: message });
        }
      });

    return () => {
      stopped = true;
      socket?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [connectAttempt]);

  const retryRealtime = useCallback(() => {
    setError("");
    setConnectAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!ready || !pending.current) return;
    const report = commandRef.current(pending.current);
    if (report) pending.current = null;
  }, [ready]);

  const chooseKeyboard = useCallback(() => {
    wantKeyboard.current = true;
    requestKeyboard.current();
  }, []);

  pushRaceRef.current = () => {
    const socket = socketRef.current;
    if (!socket?.connected || !sessionReady.current || raceWanted.current === null) return;
    socket.emit(raceWanted.current ? CLIENT_EVENTS.gameLive : CLIENT_EVENTS.gameHold);
  };

  const markRaceHeld = useCallback(() => {
    raceWanted.current = false;
    pushRaceRef.current();
  }, []);

  const markRaceLive = useCallback(() => {
    raceWanted.current = true;
    pushRaceRef.current();
  }, []);

  const startKeyboardRound = useCallback(() => {
    socketRef.current?.emit(CLIENT_EVENTS.gameStart, { v: PROTOCOL_VERSION });
  }, []);

  const beginRun = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve(null);
    return emitWithAck<LivesAck>(socket, CLIENT_EVENTS.runBegin, { v: PROTOCOL_VERSION }).then((body) => {
      if (body?.ok) {
        if (typeof body.lives === "number") setLives(body.lives);
        if (typeof body.hits === "number") setHits(body.hits);
        setRunOver(body.gameOver === true);
      }
      return body;
    });
  }, []);

  const emitRoundReset = useCallback(() => {
    socketRef.current?.emit(CLIENT_EVENTS.roundReset, { v: PROTOCOL_VERSION });
  }, []);

  const restartRun = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve(null);
    return emitWithAck<LivesAck>(socket, CLIENT_EVENTS.runAgain, { v: PROTOCOL_VERSION }).then((body) => {
      if (body?.ok) {
        if (typeof body.lives === "number") setLives(body.lives);
        if (typeof body.hits === "number") setHits(body.hits);
        setRunOver(false);
        setError("");
      }
      return body;
    });
  }, []);

  const reportHit = useCallback((hit: { obstacleId: string; clientTimestamp: number }) => {
    const socket = socketRef.current;
    const sessionId = sessionIdRef.current;
    if (!socket?.connected || !sessionId) return Promise.resolve(null);
    return emitWithAck<LivesAck>(socket, CLIENT_EVENTS.obstacleHit, {
      v: PROTOCOL_VERSION,
      sessionId,
      obstacleId: hit.obstacleId,
      clientTimestamp: hit.clientTimestamp,
    }).then((body) => {
      if (!body) return null;
      if (typeof body.lives === "number") setLives(body.lives);
      if (typeof body.hits === "number") setHits(body.hits);
      if (typeof body.gameOver === "boolean") setRunOver(body.gameOver);
      return body;
    });
  }, []);

  const leaveSession = useCallback(() => {
    const socket = socketRef.current;
    pageToken.current = "";
    acceptedSessionId.current = "";
    clearStoredHostToken(window.localStorage);
    if (!socket?.connected) return Promise.resolve();
    return emitWithAck(socket, CLIENT_EVENTS.sessionClose, { v: PROTOCOL_VERSION }).finally(() => {
      socket.disconnect();
    });
  }, []);

  const notifyApplied = useCallback((report: PoseReport) => {
    if (!report.eventId || !report.playerId || !report.sessionId || report.reason === "buffered") return;
    if (report.movementType !== "lean_left" && report.movementType !== "lean_right" && report.movementType !== "squat" && report.movementType !== "jump") return;
    socketRef.current?.emit(CLIENT_EVENTS.movementResult, {
      v: PROTOCOL_VERSION,
      eventId: report.eventId,
      playerId: report.playerId,
      sessionId: report.sessionId,
      movementType: report.movementType,
      accepted: report.accepted,
      reason: report.reason,
      executedAtMs: Date.now(),
    });
  }, []);

  return {
    connected,
    joinCode,
    joinUrl,
    qr,
    phase,
    countdown,
    countdownPurpose,
    players,
    tracking,
    statusMessage,
    error,
    keyboardChosen,
    trackingSeq,
    trustUrl,
    retryRealtime,
    chooseKeyboard,
    startKeyboardRound,
    notifyApplied,
    markRaceHeld,
    markRaceLive,
    lives,
    hits,
    runOver,
    beginRun,
    restartRun,
    emitRoundReset,
    reportHit,
    leaveSession,
  };
}
