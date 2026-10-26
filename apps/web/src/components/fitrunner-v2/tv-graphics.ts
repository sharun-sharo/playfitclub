import type { GraphicsQuality } from "@/components/fitrunner-v2/tuning";

export type GraphicsFailure = "no-webgl2" | "context-lost" | "shader";

const PACKAGED_APP =
  "A Tizen packaged app with a current WebView is a different runtime and could run this same game. This browser page will not substitute a screenshot.";

const FAILURE_COPY: Record<GraphicsFailure, string> = {
  "no-webgl2":
    "This browser cannot create a WebGL 2 context, so FitRunner cannot draw the live game. Samsung Internet on many Tizen TVs does not provide WebGL 2. " +
    PACKAGED_APP,
  "context-lost":
    "This browser lost the WebGL 2 graphics context, so the live game stopped. That is a limit of this TV browser, not a paused match. " +
    PACKAGED_APP,
  shader:
    "This browser failed to compile a FitRunner shader, so the live game cannot draw. That is a limit of this TV browser's WebGL 2 implementation. " +
    PACKAGED_APP,
};

export function graphicsFailureMessage(kind: GraphicsFailure) {
  return FAILURE_COPY[kind];
}

const LIVING_ROOM_UA = /tizen|smart[-\s]?tv|web0s|bravia|hbbtv|googletv|android tv|aft[a-z]|crkey|vidaa|tv safari/i;

/**
 * Samsung, Tizen, Web0S, BRAVIA, Fire TV (AFT), Android TV, and SmartTV browsers.
 * A desktop Chrome string is not a TV. A Galaxy phone names Samsung and includes Mobile.
 */
export function isTelevisionUserAgent(userAgent: string) {
  if (LIVING_ROOM_UA.test(userAgent)) return true;
  return /samsung/i.test(userAgent) && !/mobile/i.test(userAgent);
}

/** 1080p and larger. A 1440×900 laptop, and a phone, are smaller than a living-room panel. */
export function isLivingRoomScreen(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return Math.max(width, height) >= 1920 && Math.min(width, height) >= 1080;
}

export type TelevisionSignals = {
  userAgent: string;
  pointerCoarse: boolean;
  screenWidth: number;
  screenHeight: number;
};

/**
 * User-agent match, or a coarse pointer on a living-room screen.
 * A fine pointer keeps a 4K laptop on the desktop path.
 */
export function isTelevisionBrowser(signals: TelevisionSignals) {
  if (isTelevisionUserAgent(signals.userAgent)) return true;
  return signals.pointerCoarse && isLivingRoomScreen(signals.screenWidth, signals.screenHeight);
}

/**
 * Laptop stays on the existing cap of 2.
 * A television stays at 1. The drawing buffer is capped separately; pixel ratio must not scale it back up.
 */
export function fitRunnerPixelRatio(devicePixelRatio: number, television: boolean) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, television ? 1 : 2);
}

/** CSS pixels passed to setSize. The canvas element stays full-viewport; only the bitmap is capped. */
export const TV_DRAW_WIDTH = 1280;
export const TV_DRAW_HEIGHT = 720;

export function fitRunnerDrawingSize(viewportWidth: number, viewportHeight: number, television: boolean) {
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0;
  if (!television || width < 2 || height < 2) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = Math.min(1, TV_DRAW_WIDTH / width, TV_DRAW_HEIGHT / height);
  return {
    width: Math.min(TV_DRAW_WIDTH, Math.max(1, Math.round(width * scale))),
    height: Math.min(TV_DRAW_HEIGHT, Math.max(1, Math.round(height * scale))),
  };
}

/** WebGL drawing buffer after setPixelRatio. Mirrors WebGLRenderer.setSize's floor(size * ratio). */
export function fitRunnerDrawingBuffer(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  television: boolean,
) {
  const pixelRatio = fitRunnerPixelRatio(devicePixelRatio, television);
  const layout = fitRunnerDrawingSize(viewportWidth, viewportHeight, television);
  return {
    width: Math.floor(layout.width * pixelRatio),
    height: Math.floor(layout.height * pixelRatio),
    pixelRatio,
  };
}

export function fitRunnerQuality(television: boolean): GraphicsQuality {
  return television ? "low" : "high";
}
