import { isCalibrationCue } from "@fitplay/game";
import type { PlayerStatusName } from "@fitplay/shared";
import type { CameraPermission } from "../../lib/vision/camera-status";
import { CALIBRATION_HOLD } from "../../lib/vision/framing";
import { PLAYER_DETECTED } from "../../lib/vision/hands-free";

/** Statuses the phone may emit before the server countdown. */
export type SetupBodyStatus = Exclude<PlayerStatusName, "joined">;

/**
 * True only while the existing still-stance calibration or the hands-free
 * readiness hold is actually running. A visible body is not enough.
 */
export function readinessInProgress(input: {
  calibrated: boolean;
  guidance: string;
  calibrationCue: string | null;
  framingCalibrate: boolean;
  handsPhase: string | null;
  handsCue: string | null;
  poseCount: number;
}) {
  if (input.poseCount < 1) return false;
  const guidance = input.guidance.trim();
  const cue = (input.calibrationCue ?? "").trim();
  if (guidance === CALIBRATION_HOLD || /^hold still\b/i.test(guidance)) return true;
  if (isCalibrationCue(cue) || isCalibrationCue(guidance)) return true;
  if (input.framingCalibrate && !input.calibrated) return true;
  if (input.handsPhase === "POSITIONING" && input.handsCue === PLAYER_DETECTED) return true;
  return false;
}

/**
 * The status the phone has actually reached. Lobby setup is precise.
 * A live round keeps the previous tracking / ready / calibrating buckets.
 */
export function phoneBodyStatus(input: {
  joined: boolean;
  camera: CameraPermission;
  poseCount: number;
  ready: boolean;
  liveRound: boolean;
  actionsEnabled: boolean;
  calibrated: boolean;
  readinessActive: boolean;
}): SetupBodyStatus | null {
  if (!input.joined) return null;
  if (input.camera === "denied" || input.camera === "unavailable" || input.camera === "disconnected") return "camera_error";
  if (input.liveRound) return input.actionsEnabled ? "tracking" : input.calibrated ? "ready" : "calibrating";
  if (input.ready) return "ready";
  if (input.camera === "requesting") return "camera_starting";
  if (input.camera !== "granted") return "connecting";
  if (input.readinessActive) return "calibrating";
  if (input.poseCount > 0) return "body_detected";
  return "searching";
}
