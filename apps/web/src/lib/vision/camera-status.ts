export type CameraPermission = "off" | "requesting" | "granted" | "denied" | "unavailable" | "disconnected";

export interface CameraFailure {
  status: "denied" | "unavailable";
  message: string;
}

const DENIED = "Camera access is off. Allow the camera for this site in the browser settings, then try again. The TV keyboard still works.";
const MISSING = "No camera was found on this phone. The TV keyboard still works.";
const BUSY = "The camera is in use by another app. Close it, then try again.";
const INSECURE = "This page is not secure yet. Open the https link, accept the certificate, then try again.";
const GENERIC = "The camera could not start. Try again. The TV keyboard still works.";

export function classifyCameraError(error: unknown, secureContext = true): CameraFailure {
  if (!secureContext) return { status: "unavailable", message: INSECURE };
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return { status: "denied", message: DENIED };
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return { status: "unavailable", message: MISSING };
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return { status: "unavailable", message: BUSY };
  }
  if (name === "SecurityError") return { status: "unavailable", message: INSECURE };
  return { status: "unavailable", message: GENERIC };
}

export function cameraStatusFromTrack(track: { readyState: "live" | "ended" }): "granted" | "disconnected" {
  return track.readyState === "ended" ? "disconnected" : "granted";
}

export const CAMERA_LOST_MESSAGE = "The camera disconnected. Turn it back on to keep playing. The TV keyboard still works.";
export const MODEL_FAILED_MESSAGE = "The movement tracker could not load. Try again.";
export const REALTIME_DOWN_MESSAGE = "The live game is unreachable. Accept the certificate if this phone has not done that yet, then try again.";
export const PHONE_OFF_MESSAGE = "This phone disconnected from the game. Reconnect to keep playing.";
export const TAB_HIDDEN_MESSAGE = "This tab is hidden. Come back to it so the camera can see you.";
export const ROTATE_MESSAGE = "Turn your phone upright.";
export const BODY_LEFT_MESSAGE = "Your body left the frame. Step back into view.";
export const BODY_RETURN_MESSAGE = "Step back into view and hold still.";
export const TRACKING_LOST_MESSAGE = "The camera lost track of you. Step into view and hold still.";

function errorName(error: unknown) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return error.name;
  if (error instanceof Error) return error.name;
  return "";
}
