export const CLIENT_EVENTS = {
  sessionCreate: "session:create",
  sessionJoin: "session:join",
  sessionLeave: "session:leave",
  sessionReconnect: "session:reconnect",
  playerReady: "player:ready",
  playerStatus: "player:status",
  keyboardPlayer: "player:keyboard",
  gameStart: "game:start",
  gamePause: "game:pause",
  gameResume: "game:resume",
  gameEnd: "game:end",
  movement: "movement:event",
} as const;

export const SERVER_EVENTS = {
  sessionCreated: "session:created",
  sessionState: "session:state",
  sessionError: "session:error",
  playerJoined: "player:joined",
  playerLeft: "player:left",
  gameCountdown: "game:countdown",
  gameSnapshot: "game:snapshot",
  gameScore: "game:score",
  gameEnded: "game:ended",
} as const;
