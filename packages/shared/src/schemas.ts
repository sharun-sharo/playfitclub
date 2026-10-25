import { z } from "zod";
import { MOVEMENT_TYPES, PROTOCOL_VERSION } from "./types";

export const movementTypeSchema = z.enum(MOVEMENT_TYPES);

export const movementEventSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  eventId: z.string().min(8).max(80),
  playerId: z.string().min(1).max(80),
  sessionId: z.string().min(1).max(80),
  movementType: movementTypeSchema,
  confidence: z.number().min(0).max(1),
  clientTimestamp: z.number().finite(),
  sequenceNumber: z.number().int().nonnegative(),
});

export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(18)
  .regex(/^[\p{L}\p{N} _.'-]+$/u, "Use letters, numbers, and simple punctuation");

export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{6}$/, "Enter the 6-character session code");

export const createSessionSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  gameSlug: z.string().min(2).max(40).default("fitrunner"),
  durationSeconds: z.number().int().min(8).max(600).optional(),
  maxPlayers: z.number().int().min(1).max(2).optional(),
  gymSlug: z.string().min(2).max(60).optional(),
});

export const joinSessionSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  joinCode: joinCodeSchema,
  displayName: displayNameSchema,
  /** Stable id for this phone. The same phone can replace its old socket. */
  installId: z.string().trim().min(8).max(80).optional(),
});

export const readySchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  ready: z.boolean(),
});

export const poseDiagnosticsSchema = z.object({
  phase: z.string().max(32),
  confidence: z.number().min(0).max(1).finite(),
  leftElbow: z.number().finite(),
  rightElbow: z.number().finite(),
  leftLateral: z.number().finite(),
  rightLateral: z.number().finite(),
  hipDrop: z.number().finite(),
  kneeAngle: z.number().finite(),
  riseSpeed: z.number().finite(),
  ankleRise: z.number().finite(),
  reject: z.string().max(40).nullable(),
  leftPhase: z.string().max(32).optional(),
  rightPhase: z.string().max(32).optional(),
  squatPhase: z.string().max(32).optional(),
  jumpPhase: z.string().max(32).optional(),
  lastGesture: z.string().max(40).nullable().optional(),
  torsoNeutral: z.number().finite().optional(),
  torsoLean: z.number().finite().optional(),
  leanDirection: z.enum(["left", "right", "neutral"]).optional(),
  leanPhase: z.string().max(32).optional(),
});

export const movementResultSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  eventId: z.string().min(8).max(80),
  playerId: z.string().min(1).max(80),
  sessionId: z.string().min(1).max(80),
  movementType: movementTypeSchema,
  accepted: z.boolean(),
  reason: z.string().max(40).nullable(),
  /** TV clock at the moment the game accepted or rejected the action. Not the phone clock. */
  executedAtMs: z.number().finite().optional(),
});

export const PLAYER_STATUSES = [
  "joined",
  "connecting",
  "camera_starting",
  "searching",
  "body_detected",
  "calibrating",
  "ready",
  "tracking",
  "camera_error",
] as const;

export type PlayerStatusName = (typeof PLAYER_STATUSES)[number];

export const playerStatusSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  status: z.enum(PLAYER_STATUSES),
  confidence: z.number().min(0).max(1).optional(),
  message: z.string().max(180).optional(),
  diagnostics: poseDiagnosticsSchema.optional(),
});

export const keyboardPlayerSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  displayName: displayNameSchema,
});

export const obstacleHitSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    sessionId: z.string().min(1).max(80),
    obstacleId: z.string().min(1).max(80),
    clientTimestamp: z.number().finite(),
  })
  .strict();

export const courseDifficultySchema = z.enum(["easy", "steady", "hard", "beginner", "intermediate", "advanced"]);

export const runBeginSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    /** Saved fitness profile. Omitted for a new player, which starts at beginner. */
    difficulty: courseDifficultySchema.optional(),
  })
  .strict();

export const sessionErrorSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  code: z.string(),
  message: z.string(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(200),
});

export const registerSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(200),
  displayName: displayNameSchema,
});

export const brandingSchema = z.object({
  name: z.string().trim().min(2).max(60),
  tagline: z.string().trim().min(2).max(80),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoText: z.string().trim().min(1).max(4),
});

export const staffSchema = z.object({
  email: z.string().trim().email().max(180),
  role: z.enum(["STAFF", "MEMBER"]),
});

export const flagSchema = z.object({
  enabled: z.boolean(),
});

export const gameToggleSchema = z.object({
  enabled: z.boolean(),
});

export const subscriptionSchema = z.object({
  subscriptionStatus: z.enum(["ACTIVE", "TRIALING", "EXPIRED"]),
});
