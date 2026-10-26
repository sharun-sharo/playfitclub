/** Phone runs Fit Run here. A TV or laptop shows this screen through the phone's own mirror. */
export const PHONE_PLAY_PATH = "/play/phone";
export const PHONE_PLAY_URL = "https://playfitclub.com/play/phone";

export const PHONE_MIRROR_LINE =
  "Mirror this phone to your TV or laptop (Smart View, Cast, or Screen Mirroring). The game is on this phone.";

/** Drawing-buffer cap for /play/phone only. Laptop and TV sessions keep their own caps. */
export const PHONE_PIXEL_RATIO_CAP = 1.5;

export type PhoneBodyPhase = "looking" | "detected" | "ready";

export const PHONE_BODY_LABEL: Record<PhoneBodyPhase, string> = {
  looking: "Looking",
  detected: "Detected",
  ready: "Ready",
};

export type LocalGameCall =
  | { call: "jump" }
  | { call: "roll" }
  | { call: "stepLane"; direction: -1 | 1 };

/**
 * The keyboard on a laptop calls jump, roll, and stepLane.
 * A confirmed phone gesture uses that same call. Nothing here is a socket event.
 */
export const KEYBOARD_GAME_ACTIONS = {
  jump: { call: "jump" },
  squat: { call: "roll" },
  lean_left: { call: "stepLane", direction: -1 },
  lean_right: { call: "stepLane", direction: 1 },
} as const;

export function phonePixelRatio(devicePixelRatio: number) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, PHONE_PIXEL_RATIO_CAP);
}

export function phoneBodyPhase(input: { poseCount: number; calibrated: boolean }): PhoneBodyPhase {
  if (input.calibrated) return "ready";
  if (input.poseCount > 0) return "detected";
  return "looking";
}

export function confirmedLocalGesture(movementType: string): LocalGameCall | null {
  if (movementType === "jump") return { call: "jump" };
  if (movementType === "squat") return { call: "roll" };
  if (movementType === "lean_left") return { call: "stepLane", direction: -1 };
  if (movementType === "lean_right") return { call: "stepLane", direction: 1 };
  return null;
}

export type LocalGameControls = {
  jump: () => void;
  roll: () => void;
  stepLane: (direction: -1 | 1) => void;
};

/** One confirmed gesture, one game call, in this turn. */
export function dispatchLocalGesture(movementType: string, game: LocalGameControls) {
  const action = confirmedLocalGesture(movementType);
  if (!action) return false;
  if (action.call === "jump") game.jump();
  else if (action.call === "roll") game.roll();
  else game.stepLane(action.direction);
  return true;
}

/** Camera copy for this page. The laptop join page keeps its own lines. */
export function phoneCameraFailure(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Allow the camera on your phone, then try again.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "No camera was found on this phone.";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "The camera is in use by another app. Close it, then try again.";
  if (name === "SecurityError") return "This page is not secure yet. Open the https link, then try again.";
  return "The camera could not start. Try again.";
}
