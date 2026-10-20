import type { Server as HttpServer } from "node:http";
import type { SessionRepository, StoredSession } from "@fitplay/db";
import {
  CLIENT_EVENTS,
  PROTOCOL_VERSION,
  SERVER_EVENTS,
  createSessionSchema,
  joinSessionSchema,
  keyboardPlayerSchema,
  movementEventSchema,
  playerStatusSchema,
  readySchema,
  signClaims,
  verifyClaims,
  type ControlMode,
  type GamePhase,
  type GameSnapshot,
  type HostClaims,
  type PlayerClaims,
  type RunnerSnapshot,
  type UserClaims,
} from "@fitplay/shared";
import { Server, type Socket } from "socket.io";
import { log } from "./logger";
import { createRateLimiter } from "./rate-limit";

interface LivePlayer {
  id: string;
  socketId: string | null;
  displayName: string;
  slot: number;
  control: ControlMode;
  ready: boolean;
  connected: boolean;
  departed: boolean;
  userId: string | null;
  lastSequence: number;
  moves: number[];
}

interface RoundState {
  phase: GamePhase;
  resumePhase: "countdown" | "running";
  time: number;
  countdownRemaining: number;
  endReason?: "forfeit" | "host";
  winnerId: string | null;
  tie: boolean;
  members: string[];
}

interface LiveSession {
  record: StoredSession;
  round: RoundState;
  players: Map<string, LivePlayer>;
  hostSockets: Set<string>;
  statusMessage?: string;
  lastBroadcast: number;
  persisted: boolean;
  disconnectPause: boolean;
}

interface SocketAuth {
  kind: "anonymous" | "host" | "player";
  sessionId?: string;
  playerId?: string;
  joinCode?: string;
  displayName?: string;
  slot?: number;
}

export interface GameServerOptions {
  repository: SessionRepository;
  secret: string;
  corsOrigins: string[];
  allowShortSessions?: boolean;
  resolveGym?: (userId: string, gymSlug: string) => Promise<{ gymId: string } | { error: string }>;
}

const roomFor = (sessionId: string) => `session:${sessionId}`;

export function attachGameServer(httpServer: HttpServer, options: GameServerOptions) {
  const io = new Server(httpServer, {
    cors: { origin: options.corsOrigins, credentials: true },
    connectionStateRecovery: { maxDisconnectionDuration: 120_000 },
  });
  const sessions = new Map<string, LiveSession>();
  const createLimit = createRateLimiter(12, 60_000);
  const joinLimit = createRateLimiter(30, 60_000);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length === 0) {
      socket.data.auth = { kind: "anonymous" } satisfies SocketAuth;
      return next();
    }
    try {
      const claims = await verifyClaims<HostClaims | PlayerClaims>(token, options.secret);
      if (claims.kind !== "host" && claims.kind !== "player") return next(new Error("Invalid session token"));
      socket.data.auth = claims;
      next();
    } catch {
      next(new Error("Invalid session token"));
    }
  });

  io.on("connection", (socket) => {
    void attachFromToken(socket);

    socket.on(CLIENT_EVENTS.sessionCreate, async (payload, ack) => {
      const parsed = createSessionSchema.safeParse(payload);
      if (!parsed.success) return reply(socket, ack, "INVALID_PAYLOAD", "Check the session options and try again.");
      const ip = socket.handshake.address || socket.id;
      if (!createLimit(ip)) return reply(socket, ack, "RATE_LIMITED", "Too many sessions were created from this network. Wait a minute.");
      const requested = parsed.data.durationSeconds ?? 180;
      const minimum = options.allowShortSessions ? 8 : 30;
      if (requested < minimum || requested > 600) {
        return reply(socket, ack, "INVALID_DURATION", `Duration must be between ${minimum} and 600 seconds.`);
      }
      let ownerId: string | null = null;
      let gymId: string | null = null;
      const userToken = socket.handshake.auth?.userToken;
      if (typeof userToken === "string" && userToken.length > 0) {
        try {
          const user = await verifyClaims<UserClaims>(userToken, options.secret);
          if (user.kind !== "user" || !user.sub) throw new Error("bad user");
          ownerId = user.sub;
        } catch {
          return reply(socket, ack, "UNAUTHORIZED", "Sign in again before creating a gym session.");
        }
      }
      if (parsed.data.gymSlug) {
        if (!ownerId || !options.resolveGym) return reply(socket, ack, "UNAUTHORIZED", "A gym session requires a signed-in gym account.");
        const resolved = await options.resolveGym(ownerId, parsed.data.gymSlug);
        if ("error" in resolved) return reply(socket, ack, "GYM_FORBIDDEN", resolved.error);
        gymId = resolved.gymId;
      }
      try {
        const record = await options.repository.createSession({
          gameSlug: parsed.data.gameSlug,
          ownerId,
          gymId,
          durationSeconds: requested,
          lives: 3,
          maxPlayers: parsed.data.maxPlayers ?? 2,
          seed: crypto.getRandomValues(new Uint32Array(1))[0]! || 1,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        });
        const token = await signClaims({ kind: "host", sessionId: record.id, joinCode: record.joinCode }, options.secret, "2h");
        socket.data.auth = { kind: "host", sessionId: record.id, joinCode: record.joinCode } satisfies SocketAuth;
        const live = hydrate(record);
        live.hostSockets.add(socket.id);
        await socket.join(roomFor(record.id));
        log("info", "session created", { sessionId: record.id, joinCode: record.joinCode });
        const body = { v: PROTOCOL_VERSION, token, session: publicSession(live) };
        socket.emit(SERVER_EVENTS.sessionCreated, body);
        broadcast(live);
        if (typeof ack === "function") ack({ ok: true, ...body });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not create the session";
        reply(socket, ack, "CREATE_FAILED", message);
      }
    });

    socket.on(CLIENT_EVENTS.sessionJoin, async (payload, ack) => {
      const parsed = joinSessionSchema.safeParse(payload);
      if (!parsed.success) return reply(socket, ack, "INVALID_PAYLOAD", "Enter a name and the 6-character code.");
      const ip = socket.handshake.address || socket.id;
      if (!joinLimit(`${ip}:${parsed.data.joinCode}`)) return reply(socket, ack, "RATE_LIMITED", "Too many join attempts. Wait a minute.");
      const record = await options.repository.findByCode(parsed.data.joinCode);
      if (!record) return reply(socket, ack, "INVALID_CODE", "That session code does not exist.");
      if (record.status === "EXPIRED" || record.status === "CLOSED" || new Date(record.expiresAt).getTime() <= Date.now()) {
        if (record.status === "LOBBY") await options.repository.updateStatus(record.id, "EXPIRED");
        return reply(socket, ack, "EXPIRED", "This session has expired. Start a new one on the TV.");
      }
      if (record.status !== "LOBBY") return reply(socket, ack, "NOT_JOINABLE", "This game has already started.");
      if (record.players.length >= record.maxPlayers) return reply(socket, ack, "SESSION_FULL", "This TV already has the maximum number of players.");
      try {
        let userId: string | null = null;
        const userToken = socket.handshake.auth?.userToken;
        if (typeof userToken === "string" && userToken.length > 0) {
          try {
            const user = await verifyClaims<UserClaims>(userToken, options.secret);
            if (user.kind === "user") userId = user.sub ?? null;
          } catch {
            userId = null;
          }
        }
        const player = await options.repository.addPlayer({
          sessionId: record.id,
          displayName: parsed.data.displayName,
          control: "camera",
          userId,
        });
        const fresh = (await options.repository.findById(record.id)) ?? record;
        const live = hydrate(fresh);
        rememberPlayer(live, {
          id: player.id,
          socketId: socket.id,
          displayName: player.displayName,
          slot: player.slot,
          control: "camera",
          ready: false,
          connected: true,
          departed: false,
          userId,
          lastSequence: -1,
          moves: [],
        });
        if (!live.round.members.includes(player.id)) live.round.members.push(player.id);
        const token = await signClaims(
          { kind: "player", sessionId: record.id, playerId: player.id, slot: player.slot, displayName: player.displayName },
          options.secret,
          "2h",
        );
        socket.data.auth = {
          kind: "player",
          sessionId: record.id,
          playerId: player.id,
          displayName: player.displayName,
          slot: player.slot,
        } satisfies SocketAuth;
        await socket.join(roomFor(record.id));
        const body = { v: PROTOCOL_VERSION, token, playerId: player.id, slot: player.slot, session: publicSession(live) };
        io.to(roomFor(record.id)).emit(SERVER_EVENTS.playerJoined, body);
        broadcast(live);
        if (typeof ack === "function") ack({ ok: true, ...body });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not join";
        const code = message.includes("full") ? "SESSION_FULL" : "JOIN_FAILED";
        reply(socket, ack, code, code === "SESSION_FULL" ? "This TV already has the maximum number of players." : message);
      }
    });

    socket.on(CLIENT_EVENTS.sessionReconnect, async (payload, ack) => {
      const token = typeof payload?.token === "string" ? payload.token : socket.handshake.auth?.token;
      if (typeof token !== "string") return reply(socket, ack, "UNAUTHORIZED", "Missing session token.");
      try {
        socket.data.auth = await verifyClaims<HostClaims | PlayerClaims>(token, options.secret);
      } catch {
        return reply(socket, ack, "UNAUTHORIZED", "That session token is no longer valid.");
      }
      const attached = await attachFromToken(socket);
      if (!attached) return reply(socket, ack, "SESSION_NOT_FOUND", "The session is no longer available.");
      if (typeof ack === "function") ack({ ok: true, v: PROTOCOL_VERSION });
    });

    socket.on(CLIENT_EVENTS.keyboardPlayer, async (payload, ack) => {
      const live = hostLive(socket);
      if (!live) return reply(socket, ack, "UNAUTHORIZED", "Only the TV can add keyboard fallback players.");
      if (live.round.phase !== "lobby") return reply(socket, ack, "NOT_JOINABLE", "Keyboard players can only be added before the countdown.");
      const parsed = keyboardPlayerSchema.safeParse(payload);
      if (!parsed.success) return reply(socket, ack, "INVALID_PAYLOAD", "Choose a short player name.");
      if (live.players.size >= live.record.maxPlayers) return reply(socket, ack, "SESSION_FULL", "This session is full.");
      const player = await options.repository.addPlayer({
        sessionId: live.record.id,
        displayName: parsed.data.displayName,
        control: "keyboard",
        ready: true,
      });
      rememberPlayer(live, {
        id: player.id,
        socketId: null,
        displayName: player.displayName,
        slot: player.slot,
        control: "keyboard",
        ready: true,
        connected: true,
        departed: false,
        userId: null,
        lastSequence: -1,
        moves: [],
      });
      if (!live.round.members.includes(player.id)) live.round.members.push(player.id);
      broadcast(live);
      if (typeof ack === "function") ack({ ok: true, playerId: player.id, slot: player.slot });
    });

    socket.on("player:fallback", async () => {
      const auth = authOf(socket);
      if (auth.kind !== "player" || !auth.playerId || !auth.sessionId) return reply(socket, undefined, "UNAUTHORIZED", "Join the session first.");
      const live = sessions.get(auth.sessionId);
      const player = live?.players.get(auth.playerId);
      if (!live || !player) return reply(socket, undefined, "SESSION_NOT_FOUND", "Session not found.");
      if (live.round.phase !== "lobby") return reply(socket, undefined, "INVALID_STATE", "The round has already started.");
      player.control = "keyboard";
      player.ready = true;
      player.connected = true;
      await options.repository.setPlayerControl(live.record.id, player.id, "keyboard", true);
      live.statusMessage = `${player.displayName} is using the TV keyboard fallback.`;
      broadcast(live);
    });

    socket.on(CLIENT_EVENTS.playerReady, async (payload) => {
      const auth = authOf(socket);
      if (auth.kind !== "player" || !auth.playerId || !auth.sessionId) return reply(socket, undefined, "UNAUTHORIZED", "Join the session before readying up.");
      const parsed = readySchema.safeParse(payload);
      if (!parsed.success) return reply(socket, undefined, "INVALID_PAYLOAD", "Ready state was not understood.");
      const live = sessions.get(auth.sessionId);
      const player = live?.players.get(auth.playerId);
      if (!live || !player) return reply(socket, undefined, "SESSION_NOT_FOUND", "Session not found.");
      player.ready = parsed.data.ready;
      await options.repository.setPlayerReady(live.record.id, player.id, player.ready);
      broadcast(live);
    });

    socket.on(CLIENT_EVENTS.playerStatus, (payload) => {
      const auth = authOf(socket);
      if (auth.kind !== "player" || !auth.sessionId) return;
      const parsed = playerStatusSchema.safeParse(payload);
      if (!parsed.success) return;
      const live = sessions.get(auth.sessionId);
      if (!live) return;
      live.statusMessage = parsed.data.message;
      io.to(roomFor(live.record.id)).emit(SERVER_EVENTS.sessionState, { v: PROTOCOL_VERSION, ...publicSession(live), tracking: parsed.data });
    });

    socket.on(CLIENT_EVENTS.gameStart, async () => {
      const live = hostLive(socket);
      if (!live) return reply(socket, undefined, "UNAUTHORIZED", "Only the TV can start the game.");
      if (live.round.phase !== "lobby" && live.round.phase !== "ended") return reply(socket, undefined, "INVALID_STATE", "The game cannot be started right now.");
      const active = [...live.players.values()].filter((player) => !player.departed);
      if (active.length === 0) return reply(socket, undefined, "NOT_READY", "Add a player before starting.");
      if (active.some((player) => !player.ready || !player.connected)) return reply(socket, undefined, "NOT_READY", "Every connected player needs to be ready.");
      if (live.round.phase === "ended") {
        live.round.endReason = undefined;
        live.round.winnerId = null;
        live.round.tie = false;
      }
      live.round.phase = "running";
      live.round.resumePhase = "running";
      live.round.time = 0;
      live.round.countdownRemaining = 0;
      live.persisted = false;
      live.disconnectPause = false;
      await options.repository.updateStatus(live.record.id, "RUNNING", { startedAt: new Date() });
      broadcast(live);
    });

    socket.on(CLIENT_EVENTS.gamePause, async () => {
      const live = controllable(socket);
      if (!live) return reply(socket, undefined, "UNAUTHORIZED", "You cannot pause this session.");
      if (live.round.phase === "running" || live.round.phase === "countdown") {
        live.round.resumePhase = live.round.phase;
        live.round.phase = "paused";
        live.statusMessage = "The round is on hold.";
        await options.repository.updateStatus(live.record.id, "PAUSED");
      }
      live.disconnectPause = false;
      broadcast(live);
    });

    socket.on(CLIENT_EVENTS.gameResume, async () => {
      const live = controllable(socket);
      if (!live) return reply(socket, undefined, "UNAUTHORIZED", "You cannot resume this session.");
      if (!everyoneNeeded(live)) return reply(socket, undefined, "NOT_READY", "Wait until the players reconnect.");
      if (live.round.phase === "paused") {
        live.round.phase = live.round.resumePhase;
        live.statusMessage = undefined;
        await options.repository.updateStatus(live.record.id, live.round.phase === "countdown" ? "COUNTDOWN" : "RUNNING");
      }
      live.disconnectPause = false;
      broadcast(live);
    });

    socket.on(CLIENT_EVENTS.gameEnd, async () => {
      const live = hostLive(socket);
      if (!live) return reply(socket, undefined, "UNAUTHORIZED", "Only the TV can end the session.");
      live.round.phase = "ended";
      live.round.endReason = "host";
      await finishLive(live);
    });

    socket.on("game:score", () => {
      reply(socket, undefined, "SCORE_REJECTED", "Scores are calculated by the server from validated movements.");
    });

    socket.on(CLIENT_EVENTS.movement, (payload) => {
      const parsed = movementEventSchema.safeParse(payload);
      if (!parsed.success) return reply(socket, undefined, "INVALID_PAYLOAD", "Movement event was rejected.");
      const live = sessions.get(parsed.data.sessionId);
      if (!live) return reply(socket, undefined, "SESSION_NOT_FOUND", "Session not found.");
      const auth = authOf(socket);
      const player = live.players.get(parsed.data.playerId);
      if (!player || player.departed) return reply(socket, undefined, "UNAUTHORIZED", "That player is not in this session.");
      const ownsPlayer = auth.kind === "player" && auth.playerId === player.id;
      const hostKeyboard = auth.kind === "host" && auth.sessionId === live.record.id && player.control === "keyboard";
      if (!ownsPlayer && !hostKeyboard) return reply(socket, undefined, "UNAUTHORIZED", "You can only send movements for your own player.");
      if (parsed.data.sequenceNumber <= player.lastSequence) return reply(socket, undefined, "DUPLICATE_EVENT", "That movement was already processed.");
      const now = Date.now();
      player.moves = player.moves.filter((stamp) => now - stamp < 1000);
      if (player.moves.length >= 12) return reply(socket, undefined, "RATE_LIMITED", "Movement events are arriving too quickly.");
      player.moves.push(now);
      player.lastSequence = parsed.data.sequenceNumber;
      if (live.round.phase !== "running" && live.round.phase !== "countdown") {
        return reply(socket, undefined, "MOVEMENT_REJECTED", "The round is not running.");
      }
      broadcast(live, true);
    });

    socket.on(CLIENT_EVENTS.sessionLeave, async (_payload, ack) => {
      const auth = authOf(socket);
      if (auth.kind !== "player" || !auth.playerId || !auth.sessionId) {
        return reply(socket, ack, "UNAUTHORIZED", "Join before leaving.");
      }
      const live = sessions.get(auth.sessionId);
      const player = live?.players.get(auth.playerId);
      if (!live || !player) return;
      player.departed = true;
      player.connected = false;
      player.socketId = null;
      if (live.round.phase === "lobby") {
        live.players.delete(player.id);
        live.round.members = live.round.members.filter((id) => id !== player.id);
        await options.repository.removePlayer(live.record.id, player.id);
      } else {
        await options.repository.setPlayerConnection(live.record.id, player.id, false);
      }
      socket.leave(roomFor(live.record.id));
      io.to(roomFor(live.record.id)).emit(SERVER_EVENTS.playerLeft, { v: PROTOCOL_VERSION, playerId: player.id });
      broadcast(live);
      if (typeof ack === "function") ack({ ok: true, players: publicSession(live).players });
    });

    socket.on("disconnect", () => {
      for (const live of sessions.values()) {
        if (live.hostSockets.delete(socket.id) && live.hostSockets.size === 0 && live.round.phase !== "ended" && live.round.phase !== "lobby") {
          live.statusMessage = "TV disconnected. It can reconnect with the same session.";
          broadcast(live);
        }
        for (const player of live.players.values()) {
          if (player.socketId !== socket.id) continue;
          player.connected = false;
          player.socketId = null;
          void options.repository.setPlayerConnection(live.record.id, player.id, false);
          if ((live.round.phase === "running" || live.round.phase === "countdown") && player.control === "camera") {
            live.round.resumePhase = live.round.phase;
            live.round.phase = "paused";
            live.disconnectPause = true;
            live.statusMessage = `${player.displayName} disconnected. The game is paused.`;
            void options.repository.updateStatus(live.record.id, "PAUSED");
          }
          broadcast(live);
        }
      }
    });
  });

  const expiry = setInterval(() => {
    void options.repository.expireDue(new Date()).then((count) => {
      if (count > 0) log("info", "expired abandoned sessions", { count });
    });
  }, 30_000);
  expiry.unref?.();

  function hydrate(record: StoredSession): LiveSession {
    const existing = sessions.get(record.id);
    if (existing) {
      existing.record = { ...record, players: record.players };
      return existing;
    }
    const phase = phaseFromStatus(record.status);
    const live: LiveSession = {
      record,
      round: {
        phase,
        resumePhase: phase === "countdown" ? "countdown" : "running",
        time: 0,
        countdownRemaining: 0,
        winnerId: null,
        tie: false,
        members: record.players.map((player) => player.id),
      },
      players: new Map(),
      hostSockets: new Set(),
      lastBroadcast: 0,
      persisted: record.status === "ENDED",
      disconnectPause: false,
    };
    for (const player of record.players) {
      rememberPlayer(live, {
        id: player.id,
        socketId: null,
        displayName: player.displayName,
        slot: player.slot,
        control: player.control,
        ready: player.ready,
        connected: player.connected,
        departed: false,
        userId: player.userId,
        lastSequence: -1,
        moves: [],
      });
    }
    sessions.set(record.id, live);
    return live;
  }

  function rememberPlayer(live: LiveSession, player: LivePlayer) {
    live.players.set(player.id, player);
  }

  async function attachFromToken(socket: Socket): Promise<boolean> {
    const auth = authOf(socket);
    if ((auth.kind !== "host" && auth.kind !== "player") || !auth.sessionId) return false;
    const record = await options.repository.findById(auth.sessionId);
    if (!record) return false;
    const live = hydrate(record);
    await socket.join(roomFor(record.id));
    if (auth.kind === "host") live.hostSockets.add(socket.id);
    if (auth.kind === "player" && auth.playerId) {
      const player = live.players.get(auth.playerId);
      if (!player || player.departed) return false;
      player.connected = true;
      player.socketId = socket.id;
      await options.repository.setPlayerConnection(record.id, player.id, true);
      if (live.disconnectPause && everyoneNeeded(live) && live.hostSockets.size > 0 && live.round.phase === "paused") {
        live.round.phase = live.round.resumePhase;
        live.disconnectPause = false;
        live.statusMessage = undefined;
        await options.repository.updateStatus(record.id, live.round.phase === "countdown" ? "COUNTDOWN" : "RUNNING");
      }
    }
    broadcast(live);
    return true;
  }

  async function finishLive(live: LiveSession) {
    broadcast(live, true);
    if (live.persisted) return;
    live.persisted = true;
    const results = await options.repository.saveResults(
      live.record.id,
      [...live.players.values()].map((player) => ({
        playerId: player.id,
        score: 0,
        movementsCompleted: 0,
        rewardsCollected: 0,
        misses: 0,
        maxCombo: 0,
        durationSeconds: Math.round(live.round.time),
      })),
    );
    await options.repository.updateStatus(live.record.id, "ENDED", { endedAt: new Date() });
    io.to(roomFor(live.record.id)).emit(SERVER_EVENTS.gameEnded, {
      v: PROTOCOL_VERSION,
      endReason: live.round.endReason,
      winnerId: live.round.winnerId,
      tie: live.round.tie,
      results,
    });
    log("info", "game ended", { sessionId: live.record.id, reason: live.round.endReason });
  }

  function broadcast(live: LiveSession, force = false) {
    const now = Date.now();
    if (!force && now - live.lastBroadcast < 60) return;
    live.lastBroadcast = now;
    const meta: Record<string, { displayName: string; slot: number; connected: boolean; ready: boolean; control: ControlMode }> = {};
    for (const player of live.players.values()) {
      meta[player.id] = {
        displayName: player.displayName,
        slot: player.slot,
        connected: player.connected,
        ready: player.ready,
        control: player.control,
      };
    }
    io.to(roomFor(live.record.id)).emit(SERVER_EVENTS.sessionState, { v: PROTOCOL_VERSION, ...publicSession(live) });
    io.to(roomFor(live.record.id)).emit(SERVER_EVENTS.gameSnapshot, snapshotOf(live, meta));
  }

  function publicSession(live: LiveSession) {
    return {
      id: live.record.id,
      joinCode: live.record.joinCode,
      gameSlug: live.record.gameSlug,
      gameName: live.record.gameName,
      status: live.record.status,
      phase: live.round.phase,
      maxPlayers: live.record.maxPlayers,
      durationSeconds: live.record.durationSeconds,
      expiresAt: live.record.expiresAt,
      gymName: live.record.gymName,
      branding: live.record.branding,
      statusMessage: live.statusMessage ?? null,
      players: [...live.players.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((player) => ({
          id: player.id,
          displayName: player.displayName,
          slot: player.slot,
          ready: player.ready,
          connected: player.connected,
          control: player.control,
          score: 0,
        })),
    };
  }

  function hostLive(socket: Socket): LiveSession | null {
    const auth = authOf(socket);
    if (auth.kind !== "host" || !auth.sessionId) return null;
    const live = sessions.get(auth.sessionId);
    if (!live || !live.hostSockets.has(socket.id)) return null;
    return live;
  }

  function controllable(socket: Socket): LiveSession | null {
    const host = hostLive(socket);
    if (host) return host;
    const auth = authOf(socket);
    if (auth.kind !== "player" || !auth.sessionId || !auth.playerId) return null;
    const live = sessions.get(auth.sessionId);
    if (!live?.players.has(auth.playerId)) return null;
    return live;
  }

  function everyoneNeeded(live: LiveSession): boolean {
    return [...live.players.values()].filter((player) => !player.departed).every((player) => player.connected);
  }

  return io;
}

function phaseFromStatus(status: StoredSession["status"]): GamePhase {
  if (status === "COUNTDOWN") return "countdown";
  if (status === "RUNNING") return "running";
  if (status === "PAUSED") return "paused";
  if (status === "ENDED" || status === "EXPIRED" || status === "CLOSED") return "ended";
  return "lobby";
}

function snapshotOf(
  live: LiveSession,
  meta: Record<string, { displayName: string; slot: number; connected: boolean; ready: boolean; control: ControlMode }>,
): GameSnapshot {
  const runners: RunnerSnapshot[] = live.round.members.map((id) => {
    const player = live.players.get(id);
    const info = meta[id];
    return {
      id,
      displayName: info?.displayName ?? player?.displayName ?? "Player",
      slot: info?.slot ?? player?.slot ?? 0,
      lane: 1,
      visualLane: 1,
      action: "run",
      actionElapsed: 0,
      lives: live.record.lives,
      score: 0,
      combo: 0,
      maxCombo: 0,
      rewards: 0,
      successes: 0,
      misses: 0,
      connected: info?.connected ?? player?.connected ?? false,
      ready: info?.ready ?? player?.ready ?? false,
      control: info?.control ?? player?.control ?? "camera",
      eliminated: player?.departed ?? false,
    };
  });
  return {
    v: PROTOCOL_VERSION,
    sessionId: live.record.id,
    phase: live.round.phase,
    time: live.round.time,
    duration: live.record.durationSeconds,
    countdown: Math.ceil(live.round.countdownRemaining),
    speed: 0,
    distance: 0,
    serverTimeMs: Date.now(),
    obstacles: [],
    coins: [],
    runners,
    endReason: live.round.endReason,
    winnerId: live.round.winnerId,
    tie: live.round.tie,
    statusMessage: live.statusMessage,
  };
}

function authOf(socket: Socket): SocketAuth {
  return (socket.data.auth as SocketAuth | undefined) ?? { kind: "anonymous" };
}

function reply(socket: Socket, ack: unknown, code: string, message: string) {
  const body = { v: PROTOCOL_VERSION, code, message };
  socket.emit(SERVER_EVENTS.sessionError, body);
  if (typeof ack === "function") (ack as (value: unknown) => void)({ ok: false, ...body });
}
