"use client";

import { PROTOCOL_VERSION, resolvePublicAppUrl, SERVER_EVENTS } from "@fitplay/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { io, type Socket } from "socket.io-client";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { Button } from "@/components/ui/button";
import { browserRealtimeUrl, clientEnv, socketUsesPageOrigin } from "@/lib/env";

interface LobbyPlayer {
  id: string;
  displayName: string;
  ready: boolean;
  connected: boolean;
  control?: "camera" | "keyboard";
}

interface LobbySession {
  id: string;
  joinCode: string;
  players: LobbyPlayer[];
}

export function PlayLobby() {
  const socketRef = useRef<Socket | null>(null);
  const hostToken = useRef("");
  const [session, setSession] = useState<LobbySession | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [trustUrl, setTrustUrl] = useState("");
  const [copied, setCopied] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);

  const joinUrl = useMemo(() => {
    if (!session || typeof window === "undefined") return "";
    const base = resolvePublicAppUrl({
      configuredUrl: clientEnv().appUrl,
      requestOrigin: window.location.origin,
      production: process.env.NODE_ENV === "production",
    });
    return `${base}/join/${session.joinCode}`;
  }, [session]);

  useEffect(() => {
    if (!joinUrl) return;
    void QRCode.toDataURL(joinUrl, { margin: 1, width: 480, color: { dark: "#0B0F10", light: "#ffffff" } }).then(setQr);
  }, [joinUrl]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/play/access")
      .then((response) => response.json())
      .then(async (access: { allowed?: boolean; message?: string }) => {
        if (cancelled) return;
        if (access.allowed === false) {
          setBlocked(access.message ?? "Play is paused until the PlayFit Club team renews this subscription.");
          return;
        }
        const me = (await fetch("/api/me").then((response) => response.json())) as { socketToken?: string };
        if (cancelled) return;
        const body = me;
        const realtimeUrl = browserRealtimeUrl(window.location.origin);
        const socket = io(realtimeUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
          auth: body.socketToken ? { userToken: body.socketToken } : {},
        });
        socketRef.current = socket;
        socket.on("connect_error", () => {
          const separateServer = !socketUsesPageOrigin(window.location.origin);
          setTrustUrl(separateServer ? `${realtimeUrl}/health` : "");
          setError(separateServer ? "The session server needs a one-time certificate approval." : "Could not reach the game connection.");
        });
        socket.on("connect", () => {
          setError("");
          const token = hostToken.current;
          if (token) socket.emit("session:reconnect", { token });
        });
        socket.on(SERVER_EVENTS.sessionCreated, (payload: { token?: string; session?: LobbySession }) => {
          if (!payload?.session?.joinCode) return;
          if (payload.token) {
            hostToken.current = payload.token;
            window.localStorage.setItem("fitplay.host.token", payload.token);
            const currentAuth = socket.auth;
            socket.auth = {
              ...(typeof currentAuth === "object" && currentAuth ? currentAuth : {}),
              token: payload.token,
            };
          }
          setSession(payload.session);
        });
        socket.on(SERVER_EVENTS.sessionState, (payload: LobbySession) => {
          if (!payload?.joinCode) return;
          setSession(payload);
        });
        socket.on(SERVER_EVENTS.sessionError, (payload: { message?: string }) => {
          if (payload?.message) setError(payload.message);
        });
        socket.emit("session:create", {
          v: PROTOCOL_VERSION,
          gameSlug: "fitrunner",
          durationSeconds: 180,
          maxPlayers: 1,
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the PlayFit Club server.");
      });
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("");
    }
  }

  if (blocked) return <SubscriptionExpired message={blocked} />;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">
      <p className="font-display text-sm tracking-[0.06em] text-primary">PlayFit Club</p>
      <h1 className="mt-2 font-display text-4xl text-white">The game is being rebuilt</h1>
      <p className="mt-3 text-muted-foreground">
        A new game will replace this screen. Until then, this page opens a session so a phone can join and run pose detection.
      </p>

      {session ? (
        <section className="mt-8 space-y-4" aria-label="Phone session">
          <p className="font-display text-5xl tracking-[0.28em] text-white">{session.joinCode}</p>
          {qr ? <img src={qr} alt={`QR code for join code ${session.joinCode}`} className="w-56 rounded-2xl bg-white p-3" /> : null}
          <p className="break-all text-sm text-muted-foreground">{joinUrl}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => void copy(session.joinCode, "code")}>
              {copied === "code" ? "Code copied" : "Copy code"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void copy(joinUrl, "link")}>
              {copied === "link" ? "Link copied" : "Copy link"}
            </Button>
          </div>
          <div>
            <h2 className="font-display text-xl text-white">Phone in this session</h2>
            {session.players.filter((player) => player.control !== "keyboard").length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Waiting for a phone. Open the join link and turn the camera on.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-white">
                {session.players.filter((player) => player.control !== "keyboard").map((player) => (
                  <li key={player.id}>
                    {player.displayName}
                    {player.connected ? "" : " · disconnected"}
                    {player.ready ? " · ready" : ""}
                  </li>
                ))}
              </ul>
            )}
            {session.players.some((player) => player.control === "keyboard") ? (
              <p className="mt-2 text-sm text-muted-foreground">Keyboard on this screen is the fallback, not another player.</p>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="mt-8 text-muted-foreground">{error ? "Session not opened yet." : "Opening a session…"}</p>
      )}

      {error ? (
        <p className="mt-4 text-rose-300">
          {error}
          {trustUrl ? (
            <>
              {" "}
              <a className="underline" href={trustUrl}>
                Open the server health page
              </a>
              , accept the warning, then reload.
            </>
          ) : null}
        </p>
      ) : null}
    </main>
  );
}
