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
});

export const readySchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  ready: z.boolean(),
});

export const playerStatusSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  status: z.enum(["joined", "calibrating", "ready", "tracking", "camera_error"]),
  confidence: z.number().min(0).max(1).optional(),
  message: z.string().max(180).optional(),
});

export const keyboardPlayerSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  displayName: displayNameSchema,
});

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
