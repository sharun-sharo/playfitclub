import type { Landmark } from "./movement-types";

export interface Vec {
  x: number;
  y: number;
}

export function point(landmarks: Array<Landmark | null | undefined>, index: number): Vec | null {
  const landmark = landmarks[index];
  if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return null;
  return { x: landmark.x, y: landmark.y };
}

export function midpoint(a: Vec | null, b: Vec | null): Vec {
  if (!a || !b) return { x: 0.5, y: 0.5 };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angleDegrees(a: Vec, b: Vec, c: Vec): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (mag === 0) return 180;
  const cosine = Math.min(1, Math.max(-1, dot / mag));
  return (Math.acos(cosine) * 180) / Math.PI;
}
