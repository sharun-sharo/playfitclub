"use client";

const TONE = {
  ready: "#BEFF39",
  info: "#ffffff",
  error: "#FF5A5A",
} as const;

export function FramingOverlay({ line, tone }: { line: string | null; tone: "ready" | "info" | "error" }) {
  if (!line) return null;
  return (
    <p
      className="pointer-events-none max-w-full rounded-full bg-[#141618]/90 px-4 py-2 text-center font-display text-xl leading-tight tracking-[0.04em]"
      style={{ color: TONE[tone] }}
      data-framing-cue={line}
      data-framing-tone={tone}
      role="status"
    >
      {line}
    </p>
  );
}
