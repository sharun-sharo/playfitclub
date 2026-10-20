"use client";

import type { MovementDraft } from "@fitplay/game";
import { PROTOCOL_VERSION, SERVER_EVENTS } from "@fitplay/shared";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browserRealtimeUrl } from "@/lib/env";
import { CAMERA_LOST_MESSAGE, cameraStatusFromTrack, classifyCameraError, type CameraPermission } from "@/lib/vision/camera-status";
import { gestureLabel, openCamera, PoseEstimator, releaseCamera, type PoseUiState } from "@/lib/vision/pose-estimator";

interface Preview {
  ok: boolean;
  message?: string;
  session?: { gameName: string; status: string; playerCount: number; maxPlayers: number; gymName?: string | null };
}

export function PhoneSession({ code }: { code: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const estimatorRef = useRef<PoseEstimator | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const identity = useRef<{ playerId: string; sessionId: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ui, setUi] = useState<PoseUiState>({ guidance: "Camera is off.", confidence: 0, framingReady: false, calibrated: false, movement: null, actionsEnabled: false });
  const [phase, setPhase] = useState("lobby");
  const [ready, setReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraPermission>("off");
  const [lastSent, setLastSent] = useState("");
  const playingRef = useRef(false);
  const readySent = useRef(false);
  const bodyActionsRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    void fetch(`/api/sessions/${code}`)
      .then((response) => response.json())
      .then((body: Preview) => setPreview(body))
      .catch(() => setPreview({ ok: false, message: "Could not reach PlayFit Club." }));
    return () => {
      estimatorRef.current?.stop();
      releaseCamera(streamRef.current, video);
      socketRef.current?.disconnect();
    };
  }, [code]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const me = await fetch("/api/me").then((response) => response.json()).catch(() => ({ socketToken: undefined }));
    const realtimeUrl = browserRealtimeUrl(window.location.origin);
    const socket = io(realtimeUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      auth: me.socketToken ? { userToken: me.socketToken } : {},
    });
    socket.on("connect_error", () => {
      setError(`The game server needs a one-time certificate approval. Open ${realtimeUrl}/health, accept the warning, then join again.`);
    });
    socketRef.current = socket;
    socket.on(SERVER_EVENTS.sessionState, (payload: { id: string; phase: string }) => {
      setPhase(payload.phase);
      if (identity.current) identity.current.sessionId = payload.id;
    });
    socket.on(SERVER_EVENTS.sessionError, (payload: { message: string }) => setError(payload.message));
    socket.on("disconnect", () => {
      const token = window.sessionStorage.getItem(`fitplay.token.${code}`);
      if (token) socket.emit("session:reconnect", { token });
    });
    socket.emit(
      "session:join",
      { v: PROTOCOL_VERSION, joinCode: code.toUpperCase(), displayName: name },
      (response: { ok: boolean; message?: string; token?: string; playerId?: string; session?: { id: string } }) => {
        if (!response.ok || !response.token || !response.playerId || !response.session) {
          setError(response.message ?? "Could not join.");
          return;
        }
        window.sessionStorage.setItem(`fitplay.token.${code}`, response.token);
        identity.current = { playerId: response.playerId, sessionId: response.session.id };
        socket.auth = { ...socket.auth, token: response.token };
        setJoined(true);
      },
    );
  }

  async function enableCamera() {
    setError("");
    if (!window.isSecureContext) {
      bodyActionsRef.current = false;
      const failure = classifyCameraError(new DOMException("insecure", "SecurityError"), false);
      setCameraStatus(failure.status);
      setError(failure.message);
      setUi((current) => ({ ...current, guidance: failure.message, actionsEnabled: false }));
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      bodyActionsRef.current = false;
      const message = "The camera preview is not on the page yet. Reload the phone page and try again.";
      setCameraStatus("unavailable");
      setError(message);
      setUi((current) => ({ ...current, guidance: message, actionsEnabled: false }));
      return;
    }
    setCameraStatus("requesting");
    let track: MediaStreamTrack | null = null;
    try {
      releaseCamera(streamRef.current, video);
      const stream = await openCamera(video, facing);
      streamRef.current = stream;
      track = stream.getVideoTracks()[0] ?? null;
      if (!track) {
        bodyActionsRef.current = false;
        const message = "No camera track was returned. The TV keyboard still works.";
        setCameraStatus("unavailable");
        setError(message);
        setUi((current) => ({ ...current, guidance: message, actionsEnabled: false }));
        releaseCamera(stream, video);
        streamRef.current = null;
        return;
      }
      const onTrackEnded = () => {
        if (streamRef.current !== stream) return;
        bodyActionsRef.current = false;
        setCameraStatus("disconnected");
        setError(CAMERA_LOST_MESSAGE);
        setUi((current) => ({ ...current, guidance: CAMERA_LOST_MESSAGE, confidence: 0, actionsEnabled: false }));
        estimatorRef.current?.suspend(CAMERA_LOST_MESSAGE);
      };
      track.onended = onTrackEnded;
      if (track.readyState === "ended") onTrackEnded();
      setCameraStatus("granted");
      bodyActionsRef.current = true;
      const estimator = estimatorRef.current ?? new PoseEstimator();
      estimatorRef.current = estimator;
      await estimator.load();
      if (cameraStatusFromTrack(track) === "disconnected") {
        bodyActionsRef.current = false;
        setCameraStatus("disconnected");
        setError(CAMERA_LOST_MESSAGE);
        setUi((current) => ({ ...current, guidance: CAMERA_LOST_MESSAGE, confidence: 0, actionsEnabled: false }));
        return;
      }
      estimator.setFacing(facing);
      estimator.start(video, canvas, {
        onUi: (state) => {
          setUi(state);
          if (state.calibrated && state.framingReady) announceReady(state.confidence);
        },
        onMovement: (draft) => emitMovement(draft),
        onCameraLost: (message) => {
          bodyActionsRef.current = false;
          setCameraStatus("disconnected");
          setError(message);
        },
      }, "calibrate");
    } catch (cameraError) {
      bodyActionsRef.current = false;
      if (track && cameraStatusFromTrack(track) === "disconnected") return;
      const failure = classifyCameraError(cameraError, true);
      setCameraStatus(failure.status);
      setError(failure.message);
      setUi((current) => ({ ...current, guidance: failure.message, actionsEnabled: false }));
      releaseCamera(streamRef.current, video);
      streamRef.current = null;
    }
  }

  function emitMovement(draft: MovementDraft) {
    const current = identity.current;
    if (!current || !playingRef.current || !bodyActionsRef.current) return;
    setLastSent(gestureLabel(draft.movementType));
    socketRef.current?.emit("movement:event", {
      v: PROTOCOL_VERSION,
      eventId: crypto.randomUUID(),
      playerId: current.playerId,
      sessionId: current.sessionId,
      movementType: draft.movementType,
      confidence: draft.confidence,
      clientTimestamp: draft.clientTimestamp,
      sequenceNumber: draft.sequenceNumber,
    });
  }

  function announceReady(confidence: number) {
    if (readySent.current) return;
    readySent.current = true;
    estimatorRef.current?.setMode("calibrate");
    setReady(true);
    socketRef.current?.emit("player:ready", { v: PROTOCOL_VERSION, ready: true });
    socketRef.current?.emit("player:status", { v: PROTOCOL_VERSION, status: "ready", confidence, message: "Body verified" });
  }

  function useKeyboardFallback() {
    setReady(true);
    socketRef.current?.emit("player:fallback");
  }

  useEffect(() => {
    playingRef.current = phase === "running" && ready;
    if (!ready) return;
    estimatorRef.current?.setMode(phase === "running" ? "play" : "calibrate");
  }, [phase, ready]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <p className="font-display text-sm tracking-[0.06em] text-primary">PlayFit Club</p>
      <h1 className="mt-2 font-display text-4xl text-white">Join {code.toUpperCase()}</h1>
      {preview?.session ? (
        <p className="mt-2 text-muted-foreground">
          {preview.session.gameName}
          {preview.session.gymName ? ` · ${preview.session.gymName}` : ""} · {preview.session.playerCount}/{preview.session.maxPlayers} players
        </p>
      ) : null}
      {preview && !preview.ok ? <p className="mt-4 text-rose-300">{preview.message}</p> : null}

      {!joined ? (
        <form className="mt-8 space-y-4" onSubmit={(event) => void join(event)}>
          <div className="space-y-2">
            <Label htmlFor="name">Name on the TV</Label>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={18} required autoComplete="nickname" />
          </div>
          <Button type="submit" className="w-full" size="lg">Join session</Button>
        </form>
      ) : (
        <section className="mt-6 space-y-4">
          <div className={`relative overflow-hidden rounded-3xl border border-white/10 bg-black ${facing === "user" ? "[&_video]:-scale-x-100 [&_canvas]:-scale-x-100" : ""}`}>
            <video ref={videoRef} className="aspect-[3/4] w-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>
          <p className="text-sm uppercase tracking-[0.16em] text-primary" role="status">{cameraStatusLabel(cameraStatus)}</p>
          <p className="text-lg text-white">{ui.guidance}</p>
          <p className="text-sm text-muted-foreground">Tracking confidence {Math.round(ui.confidence * 100)}%{phase === "running" && ready && !ui.actionsEnabled ? " · body controls paused" : ""}</p>
          <p className="text-sm text-white" role="status">{lastSent ? `Last action sent: ${lastSent}` : "No action sent yet."}</p>
          <p className="text-sm text-muted-foreground">
            PlayFit Club estimates movements for gameplay. It does not judge exercise form and it cannot prevent injury. Keep a clear space around you.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" onClick={() => void enableCamera()}>Turn camera on</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const next = facing === "user" ? "environment" : "user";
                setFacing(next);
                estimatorRef.current?.setFacing(next);
                void enableCamera();
              }}
            >
              Switch camera
            </Button>
            <Button type="button" disabled={!ui.calibrated && !ready} onClick={() => announceReady(ui.confidence)}>
              {ready ? "Ready" : "I’m ready"}
            </Button>
            <Button type="button" variant="outline" onClick={useKeyboardFallback}>Use TV keyboard</Button>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={() => socketRef.current?.emit(phase === "paused" ? "game:resume" : "game:pause")}>
              {phase === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                socketRef.current?.emit("session:leave");
                bodyActionsRef.current = false;
                estimatorRef.current?.stop();
                releaseCamera(streamRef.current, videoRef.current);
                streamRef.current = null;
                setCameraStatus("off");
                setJoined(false);
              }}
            >
              Leave
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {ready ? "Your body is verified. Stay in frame — the TV can start the round." : "Stand so your full body is visible. PlayFit Club marks you ready on its own, so you can stay in place."}
          </p>
          <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">TV status · {phase}</p>
        </section>
      )}
      {error ? <p className="mt-4 text-rose-300">{error}</p> : null}
    </main>
  );
}

function cameraStatusLabel(status: CameraPermission) {
  if (status === "requesting") return "Requesting camera access";
  if (status === "granted") return "Camera on";
  if (status === "denied") return "Camera blocked";
  if (status === "unavailable") return "Camera unavailable";
  if (status === "disconnected") return "Camera disconnected";
  return "Camera off";
}
