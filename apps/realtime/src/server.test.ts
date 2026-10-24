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

async function boot(extra: { hitInvulnerabilityMs?: number } = {}) {
  const repository = createMemoryRepository();
  const httpServer = createServer();
  attachGameServer(httpServer, {
    repository,
    secret,
    corsOrigins: ["http://localhost:3000"],
    allowShortSessions: true,
    ...extra,
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
    const created = await emitAck<{ ok: boolean; token: string; session: { joinCode: string; id: string; maxPlayers: number } }>(host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      durationSeconds: 30,
      maxPlayers: 2,
    });
    expect(created.ok).toBe(true);
    expect(created.session.joinCode).toHaveLength(6);
    expect(created.session.maxPlayers).toBe(1);

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
    const created = await emitAck<{ session: { id: string; joinCode: string; maxPlayers: number } }>(host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      durationSeconds: 30,
      maxPlayers: 2,
    });
    expect(created.session.maxPlayers).toBe(1);
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
    const second = await emitAck<{ ok: boolean; code: string }>(beta, "session:join", {
      v: PROTOCOL_VERSION,
      joinCode: created.session.joinCode,
      displayName: "Beta",
    });
    expect(second.ok).toBe(false);
    expect(second.code).toBe("SESSION_FULL");
    alpha.emit("player:ready", { v: PROTOCOL_VERSION, ready: true });
    await new Promise((resolve) => setTimeout(resolve, 40));
    host.emit("game:start");
    await waitForPhase(host, "running");

    const stolen = waitFor<{ code: string }>(alpha, SERVER_EVENTS.sessionError);
    alpha.emit("movement:event", {
      v: PROTOCOL_VERSION,
      eventId: "event-unauthorized-01",
      playerId: "not-in-this-session",
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

    const replay = await emitAck<{ ok: boolean; code: string; serverTimeMs: number }>(alpha, "movement:event", {
      v: PROTOCOL_VERSION,
      eventId: "event-own-jump-01",
      playerId: first.playerId,
      sessionId: created.session.id,
      movementType: "jump",
      confidence: 0.9,
      clientTimestamp: Date.now(),
      sequenceNumber: 4,
      score: 999999,
    });
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("DUPLICATE_EVENT");
    expect(replay.serverTimeMs).toBeGreaterThan(0);

    const heard = waitFor<Record<string, unknown>>(host, "movement:event");
    const accepted = await emitAck<{ ok: boolean; serverTimeMs: number }>(alpha, "movement:event", {
      v: PROTOCOL_VERSION,
      eventId: "event-own-jump-02",
      playerId: first.playerId,
      sessionId: created.session.id,
      movementType: "jump",
      confidence: 0.9,
      clientTimestamp: Date.now(),
      sequenceNumber: 5,
      score: 999999,
    });
    expect(accepted.ok).toBe(true);
    expect(typeof accepted.serverTimeMs).toBe("number");
    const relay = await heard;
    expect(relay.eventId).toBe("event-own-jump-02");
    expect(relay.score).toBeUndefined();
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

describe("fitrunner lives authority", () => {
  async function openHost(url: string) {
    const host = connect(url);
    await new Promise<void>((resolve) => host.on("connect", () => resolve()));
    const created = await emitAck<{ ok: boolean; token: string; session: { id: string } }>(host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      durationSeconds: 30,
      maxPlayers: 2,
    });
    const started = await emitAck<{ ok: boolean; lives: number; hits: number; resumed: boolean; gameOver: boolean }>(host, "run:begin", {
      v: PROTOCOL_VERSION,
    });
    return { host, created, started };
  }

  function reportHit(host: Socket, sessionId: string, obstacleId: string, extra: Record<string, unknown> = {}) {
    return emitAck<{ ok: boolean; accepted?: boolean; lives: number; hits: number; gameOver?: boolean; code?: string }>(host, "obstacle:hit", {
      v: PROTOCOL_VERSION,
      sessionId,
      obstacleId,
      clientTimestamp: Date.now(),
      ...extra,
    });
  }

  it("spends one life per obstacle, ignores the sixth, and does not write a second result row", async () => {
    const { url, repository } = await boot({ hitInvulnerabilityMs: 0 });
    let resultSaves = 0;
    const original = repository.saveResults.bind(repository);
    repository.saveResults = async (sessionId, results) => {
      resultSaves += 1;
      return original(sessionId, results);
    };
    const { host, created, started } = await openHost(url);
    expect(started.lives).toBe(5);
    expect(started.resumed).toBe(false);
    const expected = [4, 3, 2, 1, 0];
    for (let index = 0; index < expected.length; index += 1) {
      const decision = await reportHit(host, created.session.id, `hurdle-${index}`);
      expect(decision.ok).toBe(true);
      expect(decision.accepted).toBe(true);
      expect(decision.lives).toBe(expected[index]);
      expect(decision.hits).toBe(index + 1);
      expect(decision.gameOver).toBe(index === 4);
    }
    const sixth = await reportHit(host, created.session.id, "hurdle-5");
    expect(sixth.ok).toBe(false);
    expect(sixth.code).toBe("GAME_OVER");
    expect(sixth.lives).toBe(0);
    expect(sixth.hits).toBe(5);
    const duplicate = await reportHit(host, created.session.id, "hurdle-0");
    expect(duplicate.code).toBe("GAME_OVER");
    expect(resultSaves).toBe(0);
    const stored = await repository.findById(created.session.id);
    expect(stored?.run?.lives).toBe(0);
    expect(stored?.run?.hits).toBe(5);
    expect(stored?.run?.over).toBe(true);

    const again = await emitAck<{ ok: boolean; lives: number; hits: number; resumed: boolean; gameOver: boolean }>(host, "run:begin", {
      v: PROTOCOL_VERSION,
    });
    expect(again.ok).toBe(true);
    expect(again.resumed).toBe(false);
    expect(again.lives).toBe(5);
    expect(again.hits).toBe(0);
    expect(again.gameOver).toBe(false);
    const reset = await repository.findById(created.session.id);
    expect(reset?.run?.lives).toBe(5);
    expect(reset?.run?.obstacleIds).toEqual([]);
    expect(resultSaves).toBe(0);
  });

  it("counts one obstacle id once and rejects a client life count or score", async () => {
    const { url, repository } = await boot({ hitInvulnerabilityMs: 0 });
    const { host, created } = await openHost(url);
    const first = await reportHit(host, created.session.id, "log-a");
    expect(first.lives).toBe(4);
    const again = await reportHit(host, created.session.id, "log-a");
    expect(again.ok).toBe(false);
    expect(again.code).toBe("DUPLICATE_HIT");
    expect(again.lives).toBe(4);
    expect(again.hits).toBe(1);

    const scored = await reportHit(host, created.session.id, "log-b", { score: 999999 });
    expect(scored.ok).toBe(false);
    expect(scored.code).toBe("SCORE_REJECTED");
    const lived = await reportHit(host, created.session.id, "log-c", { lives: 5 });
    expect(lived.ok).toBe(false);
    expect(lived.code).toBe("LIVES_REJECTED");
    const stored = await repository.findById(created.session.id);
    expect(stored?.run?.lives).toBe(4);
    expect(stored?.run?.hits).toBe(1);
    expect(stored?.run?.obstacleIds).toEqual(["log-a"]);
  });

  it("rejects a second obstacle during invulnerability", async () => {
    const { url } = await boot();
    const { host, created } = await openHost(url);
    const first = await reportHit(host, created.session.id, "log-a");
    expect(first.accepted).toBe(true);
    const clipped = await reportHit(host, created.session.id, "log-b");
    expect(clipped.ok).toBe(false);
    expect(clipped.code).toBe("INVULNERABLE");
    expect(clipped.lives).toBe(4);
    expect(clipped.hits).toBe(1);
  });

  it("keeps the remaining lives when the TV reconnects mid-run", async () => {
    const { url, repository } = await boot({ hitInvulnerabilityMs: 0 });
    const { host, created } = await openHost(url);
    const first = await reportHit(host, created.session.id, "rock-1");
    const second = await reportHit(host, created.session.id, "rock-2");
    expect(second.lives).toBe(3);
    expect(first.lives).toBe(4);
    host.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const returned = connect(url);
    await new Promise<void>((resolve) => returned.on("connect", () => resolve()));
    const rejoined = await emitAck<{ ok: boolean }>(returned, "session:reconnect", { token: created.token });
    expect(rejoined.ok).toBe(true);
    const resumed = await emitAck<{ ok: boolean; lives: number; hits: number; resumed: boolean }>(returned, "run:begin", {
      v: PROTOCOL_VERSION,
    });
    expect(resumed.resumed).toBe(true);
    expect(resumed.lives).toBe(3);
    expect(resumed.hits).toBe(2);
    const stored = await repository.findById(created.session.id);
    expect(stored?.run?.lives).toBe(3);
    expect(stored?.run?.obstacleIds).toEqual(["rock-1", "rock-2"]);
  });
});

describe("play again and the same phone", () => {
  async function openLobby(url: string) {
    const host = connect(url);
    await new Promise<void>((resolve) => host.on("connect", () => resolve()));
    const created = await emitAck<{ ok: boolean; token: string; session: { id: string; joinCode: string; maxPlayers: number } }>(host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      durationSeconds: 30,
      maxPlayers: 1,
    });
    return { host, created };
  }

  function joinPhone(url: string, joinCode: string, name: string, installId: string) {
    const phone = connect(url);
    return new Promise<ReturnType<typeof connect>>((resolve) => phone.on("connect", () => resolve(phone))).then(async (socket) => {
      const joined = await emitAck<{ ok: boolean; code?: string; playerId?: string; token?: string; session?: { id: string } }>(socket, "session:join", {
        v: PROTOCOL_VERSION,
        joinCode,
        displayName: name,
        installId,
      });
      return { socket, joined };
    });
  }

  it("restarts an occupied single-player session at 5 lives without a second seat", async () => {
    const { url, repository } = await boot({ hitInvulnerabilityMs: 0 });
    let resultSaves = 0;
    const original = repository.saveResults.bind(repository);
    repository.saveResults = async (sessionId, results) => {
      resultSaves += 1;
      return original(sessionId, results);
    };
    const { host, created } = await openLobby(url);
    expect(created.session.maxPlayers).toBe(1);
    const phone = await joinPhone(url, created.session.joinCode, "Ari", "phone-install-1111");
    expect(phone.joined.ok).toBe(true);
    phone.socket.emit("player:ready", { v: PROTOCOL_VERSION, ready: true });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const started = await emitAck<{ ok: boolean; lives: number }>(host, "run:begin", { v: PROTOCOL_VERSION });
    expect(started.lives).toBe(5);
    for (let index = 0; index < 5; index += 1) {
      const hit = await emitAck<{ ok: boolean; lives: number; gameOver?: boolean }>(host, "obstacle:hit", {
        v: PROTOCOL_VERSION,
        sessionId: created.session.id,
        obstacleId: `again-${index}`,
        clientTimestamp: Date.now(),
      });
      expect(hit.ok).toBe(true);
      expect(hit.lives).toBe(4 - index);
    }
    const supplied = await emitAck<{ ok: boolean; code: string }>(host, "run:again", { v: PROTOCOL_VERSION, lives: 5 });
    expect(supplied.ok).toBe(false);
    expect(supplied.code).toBe("LIVES_REJECTED");
    const again = await emitAck<{ ok: boolean; lives: number; hits: number; gameOver: boolean; sessionId: string }>(host, "run:again", {
      v: PROTOCOL_VERSION,
    });
    expect(again.ok).toBe(true);
    expect(again.sessionId).toBe(created.session.id);
    expect(again.lives).toBe(5);
    expect(again.hits).toBe(0);
    expect(again.gameOver).toBe(false);
    const stored = await repository.findById(created.session.id);
    expect(stored?.run?.lives).toBe(5);
    expect(stored?.run?.hits).toBe(0);
    expect(stored?.run?.over).toBe(false);
    expect(stored?.run?.obstacleIds).toEqual([]);
    const cameras = stored?.players.filter((player) => player.control === "camera") ?? [];
    expect(cameras).toHaveLength(1);
    expect(cameras[0]?.id).toBe(phone.joined.playerId);
    const other = await joinPhone(url, created.session.joinCode, "Bea", "other-phone-2222");
    expect(other.joined.ok).toBe(false);
    expect(other.joined.code).toBe("SESSION_FULL");
    expect(resultSaves).toBe(0);
  });

  it("replaces the same phone socket and frees that seat when the phone joins a new code", async () => {
    const { url, repository } = await boot();
    const firstRoom = await openLobby(url);
    const phone = await joinPhone(url, firstRoom.created.session.joinCode, "Rae", "phone-install-1111");
    expect(phone.joined.ok).toBe(true);
    const replaced = await joinPhone(url, firstRoom.created.session.joinCode, "Rae", "phone-install-1111");
    expect(replaced.joined.ok).toBe(true);
    expect(replaced.joined.playerId).toBe(phone.joined.playerId);
    const blocked = await emitAck<{ ok: boolean; code: string }>(phone.socket, "movement:event", {
      v: PROTOCOL_VERSION,
      eventId: "old-socket-move-01",
      playerId: phone.joined.playerId,
      sessionId: firstRoom.created.session.id,
      movementType: "jump",
      confidence: 0.9,
      clientTimestamp: Date.now(),
      sequenceNumber: 1,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe("UNAUTHORIZED");
    const stranger = await joinPhone(url, firstRoom.created.session.joinCode, "Bea", "other-phone-2222");
    expect(stranger.joined.ok).toBe(false);
    expect(stranger.joined.code).toBe("SESSION_FULL");

    const secondRoom = await openLobby(url);
    const moved = await joinPhone(url, secondRoom.created.session.joinCode, "Rae", "phone-install-1111");
    expect(moved.joined.ok).toBe(true);
    expect(moved.joined.session?.id).toBe(secondRoom.created.session.id);
    const leftBehind = await repository.findById(firstRoom.created.session.id);
    expect(leftBehind?.players.filter((player) => player.control === "camera")).toEqual([]);
    const taken = await repository.findById(secondRoom.created.session.id);
    expect(taken?.players.filter((player) => player.control === "camera")).toHaveLength(1);
    const follower = await joinPhone(url, secondRoom.created.session.joinCode, "Bea", "other-phone-3333");
    expect(follower.joined.ok).toBe(false);
    expect(follower.joined.code).toBe("SESSION_FULL");
    const freed = await joinPhone(url, firstRoom.created.session.joinCode, "Bea", "other-phone-3333");
    expect(freed.joined.ok).toBe(true);
  });

  it("closes the previous code when the host leaves and mints a different one", async () => {
    const { url, repository } = await boot();
    const first = await openLobby(url);
    const phone = await joinPhone(url, first.created.session.joinCode, "Rae", "phone-install-1111");
    expect(phone.joined.ok).toBe(true);
    const ended = new Promise<{ status?: string; phase?: string; joinCode?: string; statusMessage?: string | null }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for the closed session")), 4000);
      const onState = (payload: { status?: string; phase?: string; joinCode?: string; statusMessage?: string | null }) => {
        if (payload.status !== "CLOSED") return;
        clearTimeout(timer);
        phone.socket.off(SERVER_EVENTS.sessionState, onState);
        resolve(payload);
      };
      phone.socket.on(SERVER_EVENTS.sessionState, onState);
    });
    const closed = await emitAck<{ ok: boolean }>(first.host, "session:close", { v: PROTOCOL_VERSION });
    expect(closed.ok).toBe(true);
    const state = await ended;
    expect(state.phase).toBe("ended");
    expect(state.joinCode).toBe(first.created.session.joinCode);
    expect(state.statusMessage).toMatch(/ended/i);
    const stored = await repository.findById(first.created.session.id);
    expect(stored?.status).toBe("CLOSED");
    const second = await emitAck<{ ok: boolean; session: { id: string; joinCode: string; maxPlayers: number } }>(first.host, "session:create", {
      v: PROTOCOL_VERSION,
      gameSlug: "fitrunner",
      durationSeconds: 30,
      maxPlayers: 1,
    });
    expect(second.ok).toBe(true);
    expect(second.session.id).not.toBe(first.created.session.id);
    expect(second.session.joinCode).not.toBe(first.created.session.joinCode);
    expect(second.session.maxPlayers).toBe(1);
    const moved = await joinPhone(url, second.session.joinCode, "Rae", "phone-install-1111");
    expect(moved.joined.ok).toBe(true);
    expect(moved.joined.session?.id).toBe(second.session.id);
    const stranger = await joinPhone(url, second.session.joinCode, "Bea", "other-phone-3333");
    expect(stranger.joined.ok).toBe(false);
    expect(stranger.joined.code).toBe("SESSION_FULL");
    const next = await repository.findById(second.session.id);
    expect(next?.players.filter((player) => player.control === "camera")).toHaveLength(1);
  });

  it("accepts a new jump and squat after pause and after play again", async () => {
    const { url } = await boot({ hitInvulnerabilityMs: 0 });
    const { host, created } = await openLobby(url);
    const phone = await joinPhone(url, created.session.joinCode, "Ari", "phone-install-1111");
    expect(phone.joined.ok).toBe(true);
    phone.socket.emit("player:ready", { v: PROTOCOL_VERSION, ready: true });
    await new Promise((resolve) => setTimeout(resolve, 40));
    host.emit("game:start");
    await waitForPhase(host, "running");

    const send = (eventId: string, movementType: "jump" | "squat", sequenceNumber: number) =>
      emitAck<{ ok: boolean; code?: string }>(phone.socket, "movement:event", {
        v: PROTOCOL_VERSION,
        eventId,
        playerId: phone.joined.playerId,
        sessionId: created.session.id,
        movementType,
        confidence: 0.9,
        clientTimestamp: Date.now(),
        sequenceNumber,
      });

    expect((await send("round-jump-01", "jump", 1)).ok).toBe(true);
    expect((await send("round-squat-01", "squat", 2)).ok).toBe(true);

    host.emit("game:pause");
    await waitForPhase(host, "paused");
    const duringPause = await send("pause-jump-01", "jump", 3);
    expect(duringPause.ok).toBe(false);
    expect(duringPause.code).toBe("MOVEMENT_REJECTED");

    host.emit("game:resume");
    await waitForPhase(host, "running");
    const replay = await send("pause-jump-01", "jump", 3);
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("DUPLICATE_EVENT");
    expect((await send("resume-jump-01", "jump", 4)).ok).toBe(true);
    expect((await send("resume-squat-01", "squat", 5)).ok).toBe(true);

    const begun = await emitAck<{ ok: boolean }>(host, "run:begin", { v: PROTOCOL_VERSION });
    expect(begun.ok).toBe(true);
    for (let index = 0; index < 5; index += 1) {
      const hit = await emitAck<{ ok: boolean; gameOver?: boolean }>(host, "obstacle:hit", {
        v: PROTOCOL_VERSION,
        sessionId: created.session.id,
        obstacleId: `reset-${index}`,
        clientTimestamp: Date.now(),
      });
      expect(hit.ok).toBe(true);
    }
    const again = await emitAck<{ ok: boolean; lives: number; hits: number; gameOver: boolean; sessionId: string }>(host, "run:again", {
      v: PROTOCOL_VERSION,
    });
    expect(again.ok).toBe(true);
    expect(again.sessionId).toBe(created.session.id);
    expect(again.lives).toBe(5);
    expect(again.hits).toBe(0);
    expect(again.gameOver).toBe(false);
    await waitForPhase(host, "running");
    expect((await send("again-jump-01", "jump", 6)).ok).toBe(true);
    expect((await send("again-squat-01", "squat", 7)).ok).toBe(true);
    const lane = await emitAck<{ ok: boolean; code?: string }>(phone.socket, "movement:event", {
      v: PROTOCOL_VERSION,
      eventId: "again-left-01",
      playerId: phone.joined.playerId,
      sessionId: created.session.id,
      movementType: "lean_left",
      confidence: 0.9,
      clientTimestamp: Date.now(),
      sequenceNumber: 8,
    });
    expect(lane.ok).toBe(true);
  });
});
