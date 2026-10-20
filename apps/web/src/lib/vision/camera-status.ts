export type CameraPermission = "off" | "requesting" | "granted" | "denied" | "unavailable" | "disconnected";

export interface CameraFailure {
  status: "denied" | "unavailable";
  message: string;
}

const DENIED = "Camera permission was denied. Allow camera access in the browser settings and try again. The TV keyboard still works.";
const MISSING = "No camera was found on this phone. The TV keyboard still works.";
const BUSY = "The camera is in use by another app. Close it and try again. The TV keyboard still works.";
const INSECURE = "The phone browser needs HTTPS, or localhost, before it can open the camera.";
const GENERIC = "The camera could not start. You can still use the keyboard fallback on the TV.";

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

export const CAMERA_LOST_MESSAGE = "The camera disconnected. Body controls stopped. The TV keyboard still works.";

function errorName(error: unknown) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return error.name;
  if (error instanceof Error) return error.name;
  return "";
}
