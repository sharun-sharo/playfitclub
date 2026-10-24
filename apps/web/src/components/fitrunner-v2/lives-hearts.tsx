"use client";

import { RUN_LIVES } from "@fitplay/shared";

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-7 w-7 ${filled ? "text-[#ff5a6a]" : "text-white/25"}`} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 20s-7-4.4-7-9.1C5 8 6.8 6.2 9 6.2c1.3 0 2.4.6 3 1.6.6-1 1.7-1.6 3-1.6 2.2 0 4 1.8 4 4.7C19 15.6 12 20 12 20z"
      />
    </svg>
  );
}

export function LivesHearts({ hidden, lives }: { hidden: boolean; lives: number }) {
  const shown = Math.max(0, Math.min(RUN_LIVES, lives));
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-4 z-10 flex -translate-x-1/2 gap-1 rounded-full bg-[#10141ccc] px-3 py-2"
      data-fitrunner-hearts=""
      data-lives={shown}
      hidden={hidden}
      aria-label={`${shown} of ${RUN_LIVES} lives`}
    >
      {Array.from({ length: RUN_LIVES }, (_, index) => (
        <span key={index} data-heart={index < shown ? "full" : "dim"}>
          <Heart filled={index < shown} />
        </span>
      ))}
    </div>
  );
}
