/**
 * Phone Fit Run bed and move cues. Served from /audio/fit-run.
 * The loop follows the run. A cue plays only after localJump, localRoll, or localStep accepts.
 */

export const FIT_RUN_AUDIO_DIR = "/audio/fit-run";

export const FIT_RUN_BED_FILE = "PlayFit_Club_Arcade_Background_Loop.mp3";

export const FIT_RUN_CUE_FILE = {
  jump: "01_jump_arcade.wav",
  squat: "02_squat_arcade.wav",
  left: "03_left_hand_arcade.wav",
  right: "04_right_hand_arcade.wav",
} as const;

export type FitRunCueName = keyof typeof FIT_RUN_CUE_FILE;

export type FitRunBedAction = "play" | "pause" | "stop";

export function fitRunAudioUrl(file: string) {
  return `${FIT_RUN_AUDIO_DIR}/${file}`;
}

/**
 * One accepted local move, one cue. Player left is direction -1; the game already mirrored the camera.
 * A rejected, cooldown, or muted result stays silent.
 */
export function cueAfterLocalCall(
  call: "jump" | "roll" | "step",
  direction: -1 | 1 | 0,
  accepted: boolean,
  soundOn: boolean,
): FitRunCueName | null {
  if (!accepted || !soundOn) return null;
  if (call === "jump") return "jump";
  if (call === "roll") return "squat";
  return direction < 0 ? "left" : "right";
}

/**
 * Loop only while the phone run is going.
 * Phase running starts at GO. Warning is still the run, before tracking loss pauses it.
 * Mute and either pause hold the bed. Game over and time before the first GO stop it.
 */
export function fitRunBedAction(input: {
  phase: string;
  coursePaused: boolean;
  buttonPaused: boolean;
  soundOn: boolean;
  ended: boolean;
}): FitRunBedAction {
  if (input.ended) return "stop";
  const running = input.phase === "running" || input.phase === "warning";
  if (!running) {
    if (input.coursePaused || input.buttonPaused) return "pause";
    return "stop";
  }
  if (input.coursePaused || input.buttonPaused || !input.soundOn) return "pause";
  return "play";
}

export type FitRunCueSink = {
  playCue: (cue: FitRunCueName) => void;
};

/** Plays the cue file when the local call was accepted and sound is on. */
export function hearFitRunMove(
  audio: FitRunCueSink | null,
  input: { call: "jump" | "roll" | "step"; direction: -1 | 1 | 0; accepted: boolean; soundOn: boolean },
) {
  const cue = cueAfterLocalCall(input.call, input.direction, input.accepted, input.soundOn);
  if (!cue || !audio) return null;
  audio.playCue(cue);
  return cue;
}

export type FitRunAudio = FitRunCueSink & {
  preload: () => void;
  unlock: () => void;
  /** Sound toggle. Off silences cues immediately, including one already started. */
  setSoundOn: (on: boolean) => void;
  syncBed: (action: FitRunBedAction) => void;
  dispose: () => void;
};

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const webkit = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return window.AudioContext ?? webkit ?? null;
}

export function createFitRunAudio(): FitRunAudio {
  const bed = new Audio(fitRunAudioUrl(FIT_RUN_BED_FILE));
  bed.loop = true;
  bed.preload = "auto";
  bed.setAttribute("aria-hidden", "true");
  bed.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none";
  if (typeof document !== "undefined") document.body.appendChild(bed);

  const cueUrls: Record<FitRunCueName, string> = {
    jump: fitRunAudioUrl(FIT_RUN_CUE_FILE.jump),
    squat: fitRunAudioUrl(FIT_RUN_CUE_FILE.squat),
    left: fitRunAudioUrl(FIT_RUN_CUE_FILE.left),
    right: fitRunAudioUrl(FIT_RUN_CUE_FILE.right),
  };
  const buffers: Partial<Record<FitRunCueName, AudioBuffer>> = {};
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let audible = true;
  let intent: FitRunBedAction = "stop";
  let preloaded = false;
  let disposed = false;
  const looseCues: HTMLAudioElement[] = [];

  function ensureContext() {
    if (context || disposed) return context;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = audible ? 1 : 0;
    master.connect(context.destination);
    return context;
  }

  function setAudible(on: boolean) {
    audible = on;
    if (!on) {
      for (const node of looseCues) node.pause();
    }
    if (!master || !context) return;
    master.gain.setValueAtTime(on ? 1 : 0, context.currentTime);
  }

  function preload() {
    if (preloaded || disposed) return;
    preloaded = true;
    bed.load();
    const ctx = ensureContext();
    if (!ctx) return;
    for (const name of Object.keys(cueUrls) as FitRunCueName[]) {
      const url = cueUrls[name];
      void fetch(url)
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .then((bytes) => (bytes && !disposed ? ctx.decodeAudioData(bytes) : null))
        .then((buffer) => {
          if (buffer && !disposed) buffers[name] = buffer;
        })
        .catch(() => undefined);
    }
  }

  function unlock() {
    if (disposed) return;
    const ctx = ensureContext();
    if (ctx && ctx.state === "suspended") void ctx.resume();
    if (!bed.paused && intent === "play") return;
    bed.volume = 0;
    const pending = bed.play();
    void pending
      ?.then(() => {
        if (disposed) return;
        if (intent === "play") {
          bed.volume = 1;
          return;
        }
        bed.pause();
        if (intent === "stop") bed.currentTime = 0;
        bed.volume = 1;
      })
      .catch(() => {
        bed.volume = 1;
      });
  }

  function setSoundOn(on: boolean) {
    if (disposed) return;
    setAudible(on);
  }

  function syncBed(action: FitRunBedAction) {
    if (disposed) return;
    intent = action;
    if (action === "play") {
      bed.volume = 1;
      if (bed.paused) void bed.play().catch(() => undefined);
      return;
    }
    bed.pause();
    if (action === "stop") {
      try {
        if (bed.currentTime !== 0) bed.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
    }
  }

  function playCue(cue: FitRunCueName) {
    if (disposed || !audible) return;
    const ctx = ensureContext();
    const buffer = buffers[cue];
    if (ctx && master && buffer) {
      if (ctx.state === "suspended") void ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      source.start();
      return;
    }
    const node = new Audio(cueUrls[cue]);
    looseCues.push(node);
    node.addEventListener("ended", () => {
      const index = looseCues.indexOf(node);
      if (index >= 0) looseCues.splice(index, 1);
    });
    void node.play().catch(() => undefined);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    intent = "stop";
    audible = false;
    for (const node of looseCues) node.pause();
    looseCues.length = 0;
    bed.pause();
    bed.removeAttribute("src");
    bed.load();
    bed.remove();
    const closing = context;
    context = null;
    master = null;
    if (closing) void closing.close().catch(() => undefined);
  }

  return { preload, unlock, setSoundOn, syncBed, playCue, dispose };
}
