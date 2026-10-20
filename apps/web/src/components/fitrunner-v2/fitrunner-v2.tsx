"use client";

import { useEffect, useRef, useState } from "react";
import type { FitRunnerHandle } from "@/components/fitrunner-v2/create-fitrunner";
import { fitRunnerTuning as tuning } from "@/components/fitrunner-v2/tuning";

const CLIP_BUTTONS = ["StandUp", "WipeSweat", "LongJump"] as const;

export function FitRunnerV2() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<FitRunnerHandle | null>(null);
  const clipRef = useRef<HTMLElement>(null);
  const laneRef = useRef<HTMLElement>(null);
  const motionRef = useRef<HTMLElement>(null);
  const speedRef = useRef<HTMLElement>(null);
  const scoreRef = useRef<HTMLElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [camera, setCamera] = useState({ ...tuning.camera });

  function setCameraValue(key: keyof typeof tuning.camera, value: number) {
    tuning.camera[key] = value;
    setCamera((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: FitRunnerHandle | null = null;

    void import("@/components/fitrunner-v2/create-fitrunner")
      .then(({ startFitRunner }) =>
        startFitRunner(canvas, {
          clip: clipRef.current,
          lane: laneRef.current,
          motion: motionRef.current,
          speed: speedRef.current,
          score: scoreRef.current,
        }),
      )
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        handle = next;
        handleRef.current = next;
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "FitRunner V2 failed to start.");
      });

    return () => {
      cancelled = true;
      handle?.dispose();
      handleRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#8eacbf] text-white">
      <canvas
        ref={canvasRef}
        data-fitrunner-v2=""
        aria-label="FitRunner V2 prototype"
        className="h-full w-full"
      />
      <aside className="absolute left-4 top-4 z-10 w-[19rem] rounded-2xl border border-white/15 bg-[#10141ce6] p-4 text-sm shadow-xl">
        <p className="font-display text-xs tracking-[0.14em] text-[#7ef0ff]">DEV ONLY</p>
        <h1 className="mt-1 font-display text-2xl">FitRunner V2</h1>
        <p className="mt-1 text-xs text-[#c5d0e0]">
          {error ? error : ready ? "X Bot on a three-lane Kenney road." : "Loading X Bot and the track…"}
        </p>
        <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-y-1 text-xs" data-fitrunner-hud="">
          <dt className="text-[#9aa8bd]">Clip</dt>
          <dd ref={clipRef} data-field="clip">
            —
          </dd>
          <dt className="text-[#9aa8bd]">Lane</dt>
          <dd ref={laneRef} data-field="lane">
            —
          </dd>
          <dt className="text-[#9aa8bd]">Motion</dt>
          <dd ref={motionRef} data-field="motion">
            —
          </dd>
          <dt className="text-[#9aa8bd]">Speed</dt>
          <dd ref={speedRef} data-field="speed">
            —
          </dd>
          <dt className="text-[#9aa8bd]">Score</dt>
          <dd ref={scoreRef} data-field="score">
            —
          </dd>
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-[#c5d0e0]">
          A / Left and D / Right change lanes. Space or Up jumps. S or Down rolls. C plays the sweat wipe.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CLIP_BUTTONS.map((clip) => (
            <button
              key={clip}
              type="button"
              tabIndex={-1}
              className="rounded-full border border-white/20 px-3 py-1 text-xs"
              onClick={() => handleRef.current?.playClip(clip)}
            >
              {clip}
            </button>
          ))}
        </div>
        <fieldset className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[11px]" data-fitrunner-camera="">
          <legend className="text-[#9aa8bd]">Camera</legend>
          {(
            [
              ["distance", 2.2, 9, 0.05],
              ["height", 0.6, 4.5, 0.05],
              ["lookAhead", 2, 14, 0.1],
              ["lookHeight", 0.2, 2.4, 0.05],
              ["fov", 30, 75, 1],
            ] as const
          ).map(([key, min, max, step]) => (
            <label key={key} className="grid grid-cols-[5.4rem_1fr_2.2rem] items-center gap-2">
              <span className="text-[#9aa8bd]">{key}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={camera[key]}
                aria-label={`Camera ${key}`}
                onChange={(event) => setCameraValue(key, Number(event.target.value))}
              />
              <span>{key === "fov" ? camera[key].toFixed(0) : camera[key].toFixed(2)}</span>
            </label>
          ))}
        </fieldset>
      </aside>
    </div>
  );
}
