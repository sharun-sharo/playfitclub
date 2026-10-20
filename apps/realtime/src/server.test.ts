import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createMemoryRepository } from "@fitplay/db/memory";
import { PROTOCOL_VERSION, SERVER_EVENTS } from "@fitplay/shared";
import { io as createClient, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { attachGameServer } from "./server";

const secret = "test-secret-test-secret-test-secret";
const sockets: Socket[] = [];
let closeServer: (() => Promise<void>) | null = null;

afterEach(async () => {
  for (const socket of sockets) socket.disconnect();
  sockets.length = 0;
  if (closeServer) await closeServer();
  closeServer = null;
});

async function boot() {
  const repository = createMemoryRepository();
  const httpServer = createServer();
  attachGameServer(httpServer, {
    repository,
    secret,
    corsOrigins: ["http://localhost:3000"],
    allowShortSessions: true,
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = (httpServer.address() as AddressInfo).port;
  closeServer = () =>
    new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  return { repository, url: `http://127.0.0.1:${port}` };
}

function connect(url: string, auth: Record<string, unknown> = {}) {
  const socket = createClient(url, { auth, transports: ["websocket"], forceNew: true, reconnection: false });
  sockets.push(socket);
  return socket;
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 4000);
    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function waitForPhase(socket: Socket, phase: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${phase}`)), 6000);
    const onSnapshot = (payload: { phase?: string }) => {
      if (payload.phase === phase) {
        clearTimeout(timer);
        socket.off(SERVER_EVENTS.gameSnapshot, onSnapshot);
        resolve();
      }
    };
    socket.on(SERVER_EVENTS.gameSnapshot, onSnapshot);
  });
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 4000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe("realtime sessions", () => {
  it("creates a session, joins a player, and rejects an invalid code", async () => {
    const { url } = await boot();
    const host = connect(url);
    await new Promise<void>((resolve) => host.on("connect", () => resolve()));
    const created = await emitAck<{ ok: boolean; token: string; session: { joinCode: string; id: string } }>(host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      durationSeconds: 30,
      maxPlayers: 2,
    });
    expect(created.ok).toBe(true);
    expect(created.session.joinCode).toHaveLength(6);

    const phone = connect(url);
    await new Promise<void>((resolve) => phone.on("connect", () => resolve()));
    const joined = await emitAck<{ ok: boolean; playerId: string; token: string }>(phone, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: created.session.joinCode,
      displayName: "Ari",
    });
    expect(joined.ok).toBe(true);

    const stranger = connect(url);
    await new Promise<void>((resolve) => stranger.on("connect", () => resolve()));
    const rejected = await emitAck<{ ok: boolean; code: string }>(stranger, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: "ZZZZZZ",
      displayName: "Nope",
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.code).toBe("INVALID_CODE");
  });

  it("enforces player capacity", async () => {
    const { url } = await boot();
    const host = connect(url);
    await new Promise<void>((resolve) => host.on("connect", () => resolve()));
    const created = await emitAck<{ session: { joinCode: string } }>(host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      maxPlayers: 1,
    });
    const first = connect(url);
    await new Promise<void>((resolve) => first.on("connect", () => resolve()));
    const joined = await emitAck<{ ok: boolean }>(first, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: created.session.joinCode,
      displayName: "One",
    });
    expect(joined.ok).toBe(true);
    const second = connect(url);
    await new Promise<void>((resolve) => second.on("connect", () => resolve()));
    const full = await emitAck<{ ok: boolean; code: string }>(second, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: created.session.joinCode,
      displayName: "Two",
    });
    expect(full.ok).toBe(false);
    expect(full.code).toBe("SESSION_FULL");
  });

  it("rejects unauthorized, duplicate, and client-supplied scores", async () => {
    const { url } = await boot();
    const host = connect(url);
    await new Promise<void>((resolve) => host.on("connect", () => resolve()));
    const created = await emitAck<{ session: { id: string; joinCode: string } }>(host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      durationSeconds: 30,
      maxPlayers: 2,
    });
    const alpha = connect(url);
    const beta = connect(url);
    await Promise.all([
      new Promise<void>((resolve) => alpha.on("connect", () => resolve())),
      new Promise<void>((resolve) => beta.on("connect", () => resolve())),
    ]);
    const first = await emitAck<{ playerId: string; token: string }>(alpha, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: created.session.joinCode,
      displayName: "Alpha",
    });
    const second = await emitAck<{ playerId: string }>(beta, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: created.session.joinCode,
      displayName: "Beta",
    });
    alpha.emit("player:ready", { v: PROTOCOL_VERSION, ready: true });
    beta.emit("player:ready", { v: PROTOCOL_VERSION, ready: true });
    await new Promise((resolve) => setTimeout(resolve, 40));
    host.emit("game:start");
    await waitForPhase(host, "running");

    const stolen = waitFor<{ code: string }>(alpha, SERVER_EVENTS.sessionError);
    alpha.emit("movement:event", {
      v: PROTOCOL_VERSION,
      eventId: "event-unauthorized-01",
      playerId: second.playerId,
      sessionId: created.session.id,
      movementType: "lean_left",
      confidence: 0.9,
      clientTimestamp: Date.now(),
      sequenceNumber: 1,
    });
    expect((await stolen).code).toBe("UNAUTHORIZED");

    const rejectedScore = waitFor<{ code: string }>(alpha, SERVER_EVENTS.sessionError);
    alpha.emit("game:score", { score: 999999 });
    expect((await rejectedScore).code).toBe("SCORE_REJECTED");

    alpha.emit("movement:event", {
      v: PROTOCOL_VERSION,
      eventId: "event-own-jump-01",
      playerId: first.playerId,
      sessionId: created.session.id,
      movementType: "jump",
      confidence: 0.9,
      clientTimestamp: Date.now(),
      sequenceNumber: 2,
    });
    const duplicate = waitFor<{ code: string }>(alpha, SERVER_EVENTS.sessionError);
    alpha.emit("movement:event", {
      v: PROTOCOL_VERSION,
      eventId: "event-own-jump-01",
      playerId: first.playerId,
      sessionId: created.session.id,
      movementType: "jump",
      confidence: 0.9,
      clientTimestamp: Date.now(),
      sequenceNumber: 2,
    });
    expect((await duplicate).code).toBe("DUPLICATE_EVENT");
  });

  it("reconnects the same player and removes them when they leave the lobby", async () => {
    const { url } = await boot();
    const host = connect(url);
    await new Promise<void>((resolve) => host.on("connect", () => resolve()));
    const created = await emitAck<{ session: { joinCode: string } }>(host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      maxPlayers: 2,
    });
    const phone = connect(url);
    await new Promise<void>((resolve) => phone.on("connect", () => resolve()));
    const joined = await emitAck<{ token: string; playerId: string }>(phone, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: created.session.joinCode,
      displayName: "Rae",
    });
    phone.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const returned = connect(url, { token: joined.token });
    const state = await waitFor<{ players: Array<{ id: string; connected: boolean }> }>(returned, SERVER_EVENTS.sessionState);
    expect(state.players.some((player) => player.id === joined.playerId && player.connected)).toBe(true);

    const after = await emitAck<{ ok: boolean; players: Array<{ id: string }> }>(returned, "session:leave", {});
    expect(after.ok).toBe(true);
    expect(after.players.some((player) => player.id === joined.playerId)).toBe(false);
  });

  it("rejects an expired session", async () => {
    const { url, repository } = await boot();
    const expired = await repository.createSession({
      gameSlug: "fitrunner",
      durationSeconds: 30,
      lives: 3,
      maxPlayers: 2,
      seed: 4,
      expiresAt: new Date(Date.now() - 1000),
    });
    const phone = connect(url);
    await new Promise<void>((resolve) => phone.on("connect", () => resolve()));
    const response = await emitAck<{ ok: boolean; code: string }>(phone, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: expired.joinCode,
      displayName: "Late",
    });
    expect(response.ok).toBe(false);
    expect(response.code).toBe("EXPIRED");
  });
});
