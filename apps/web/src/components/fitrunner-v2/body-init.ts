export type BodyInitKey =
  | "connecting"
  | "camera_starting"
  | "searching"
  | "body_detected"
  | "calibrating"
  | "ready"
  | "countdown"
  | "retry";

export interface BodyInitView {
  key: BodyInitKey;
  title: string;
  detail: string;
  joints: "dim" | "lit";
  /** Scan only while the phone is still looking. A found body does not keep scanning. */
  scan: boolean;
  retry: string;
  /** Server countdown digit. Absent until the server says the round is counting down. */
  countdown: number | null;
}

const TITLE: Record<Exclude<BodyInitKey, "countdown" | "retry">, string> = {
  connecting: "CONNECTING YOUR PHONE...",
  camera_starting: "STARTING BODY TRACKING...",
  searching: "READING YOUR BODY...",
  body_detected: "BODY DETECTED",
  calibrating: "CALIBRATING YOUR MOVEMENTS...",
  ready: "YOU'RE READY!",
};

const SEARCH_DETAIL = "Make sure your body is visible to your phone camera.";

export function bodyInitView(input: {
  phase: string;
  countdown: number;
  countdownPurpose: "start" | "resume" | null;
  phoneConnected: boolean;
  tracking: { status?: string; message?: string } | null;
  stall: string;
}): BodyInitView | null {
  if (input.phase === "running" || input.phase === "paused" || input.phase === "ended") return null;
  if (input.phase === "countdown" && input.countdownPurpose === "resume") return null;
  if (input.phase === "countdown") {
    return {
      key: "countdown",
      title: "",
      detail: "",
      joints: "lit",
      scan: false,
      retry: "",
      countdown: input.countdown > 0 ? input.countdown : null,
    };
  }
  if (!input.phoneConnected) return retryView("Your phone disconnected. Join again to retry.");

  const status = input.tracking?.status ?? "connecting";
  const message = input.tracking?.message?.trim() ?? "";
  if (status === "camera_error" || /denied|blocked|notallowed/i.test(message)) return retryView(cameraRetry(message));

  const key = stageKey(status, message);
  const trouble = calibrationTrouble(key, message);
  const stall = input.stall.trim();
  const retry = trouble || stall;
  const looking = key === "connecting" || key === "camera_starting" || key === "searching";
  return {
    key,
    title: TITLE[key],
    detail: key === "searching" ? SEARCH_DETAIL : "",
    joints: key === "body_detected" || key === "calibrating" || key === "ready" ? "lit" : "dim",
    scan: looking && !retry,
    retry,
    countdown: null,
  };
}

function stageKey(status: string, message: string): Exclude<BodyInitKey, "countdown" | "retry"> {
  if (status === "camera_starting") return "camera_starting";
  if (status === "searching" || /looking for player/i.test(message)) return "searching";
  if (status === "body_detected") return "body_detected";
  if (status === "calibrating") return "calibrating";
  if (status === "ready" || message === "Motion tracking active") return "ready";
  if (status === "tracking") return message === "Player detected" ? "body_detected" : "ready";
  if (message === "Player detected") return "body_detected";
  return "connecting";
}

function calibrationTrouble(key: BodyInitKey, message: string) {
  if (key !== "calibrating") return "";
  if (/too much movement|cannot calibrate|can't calibrate/i.test(message)) return "Hold still, then try again.";
  return "";
}

function cameraRetry(message: string) {
  if (/denied|blocked|notallowed/i.test(message)) return "Allow the camera on your phone, then try again.";
  if (/disconnect|lost|turned off/i.test(message)) return "The phone camera turned off. Turn it back on to try again.";
  if (/no camera/i.test(message)) {
    return process.env.NODE_ENV === "production" ? "This phone has no camera." : "This phone has no camera. You can play with the keyboard.";
  }
  return "Body tracking didn't start. Try again on your phone.";
}

function retryView(line: string): BodyInitView {
  return {
    key: "retry",
    title: line,
    detail: "",
    joints: "dim",
    scan: false,
    retry: "",
    countdown: null,
  };
}
