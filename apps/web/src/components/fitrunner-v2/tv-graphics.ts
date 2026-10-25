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

/** Samsung Internet, Tizen, and other living-room browsers. A desktop Chrome string is not a TV. */
export function isTelevisionUserAgent(userAgent: string) {
  return /tizen|smart-?tv|web0s|bravia|hbbtv|googletv|android tv|aft[a-z]|crkey|vidaa|tv safari/i.test(userAgent);
}

/**
 * Laptop stays on the existing cap of 2.
 * A 4K television at devicePixelRatio 2 or 3 allocates an 8K buffer and drops the context.
 */
export function fitRunnerPixelRatio(devicePixelRatio: number, television: boolean) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, television ? 1 : 2);
}

export function fitRunnerQuality(television: boolean): GraphicsQuality {
  return television ? "low" : "high";
}
