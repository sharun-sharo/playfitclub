import { fitRunnerTuning as tuning } from "@/components/fitrunner-v2/tuning";

/** Follow-cam knobs shared by landscape and portrait framing. */
export type FollowCameraTuning = {
  fov: number;
  distance: number;
  height: number;
  lookAhead: number;
  lookHeight: number;
  smooth: number;
  fovGain: number;
  landingDip: number;
  jumpLook: number;
};

/** Landscape / laptop / TV numbers from live tuning. Portrait never mutates these. */
export function landscapeFollowCamera(): FollowCameraTuning {
  return { ...tuning.camera };
}

/**
 * Character-centered framing half-width (meters). Camera tracks lane X, so we
 * only need the runner plus a peek of adjacent asphalt — not the full 3-lane
 * static road span.
 */
export const PORTRAIT_FOLLOW_HALF_WIDTH_M = 0.95;

/** Prefer a short pull-back; raise FOV before pushing distance past the cap. */
export const PORTRAIT_FOV_PREF = 68;
export const PORTRAIT_FOV_MAX = 82;
/**
 * Subway-style over-the-shoulder: far nearer than the ~5.5 m sky-heavy
 * baseline so the runner fills the lower frame.
 */
export const PORTRAIT_DISTANCE_MIN = 2.15;
/** Typical phone target for large bottom-near runner. Ultra-tall may ease to HARD_MAX. */
export const PORTRAIT_DISTANCE_MAX = 2.5;
export const PORTRAIT_DISTANCE_HARD_MAX = 2.85;

/** Look-ahead as a fraction of distance — short so the view stays on the near road. */
export const PORTRAIT_LOOK_AHEAD_FACTOR = 0.58;

/**
 * Camera sits above mid-torso. Look-at is above torso height so the nearer
 * runner falls below the look ray → large presence at the bottom of the
 * portrait frame (not mid-frame with empty sky).
 */
export const PORTRAIT_CAMERA_HEIGHT = 1.62;
export const PORTRAIT_LOOK_HEIGHT = 1.32;

/** Lateral follow: damped enough to avoid lane-change judder, still keeps the runner centered. */
export const PORTRAIT_FOLLOW_SMOOTH = 6.8;

/**
 * Horizontal meters the portrait frustum should cover at player depth.
 * Centered on the runner (camera tracks lane X).
 */
export function portraitRequiredWidthM(laneSpacing = tuning.laneSpacing) {
  const half = Math.min(PORTRAIT_FOLLOW_HALF_WIDTH_M, laneSpacing * 0.4);
  return half * 2;
}

/** Horizontal world meters visible at a given depth along the view for a PerspectiveCamera. */
export function horizontalFrustumWidth(aspect: number, fovDeg: number, depth: number) {
  if (!(aspect > 0) || !(fovDeg > 0) || !(Math.abs(depth) > 0)) return 0;
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  return 2 * Math.abs(depth) * Math.tan(hFov / 2);
}

/** Distance from the camera that yields `width` meters of horizontal coverage. */
export function distanceForHorizontalWidth(aspect: number, fovDeg: number, width: number) {
  if (!(aspect > 0) || !(fovDeg > 0) || !(width > 0)) return Infinity;
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const halfTan = Math.tan(hFov / 2);
  if (!(halfTan > 0)) return Infinity;
  return width / 2 / halfTan;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Smallest vertical FOV at a fixed distance that covers `width` meters. */
function fovForHorizontalWidth(aspect: number, depth: number, width: number) {
  if (!(aspect > 0) || !(depth > 0) || !(width > 0)) return PORTRAIT_FOV_MAX;
  const hFov = 2 * Math.atan(width / 2 / depth);
  const vFov = 2 * Math.atan(Math.tan(hFov / 2) / aspect);
  return (vFov * 180) / Math.PI;
}

/**
 * Portrait follow cam for Mobile Only tall viewports.
 * Presence push: short distance (~2.15–2.45 m), OTS height, look-at at torso+
 * so the runner is large near the bottom with less empty sky.
 * Camera tracks the runner's lane X so the character stays centered.
 */
export function portraitFollowCamera(aspect: number, laneSpacing = tuning.laneSpacing): FollowCameraTuning {
  const safeAspect = aspect > 0.05 && aspect < 1 ? aspect : 9 / 16;
  const need = portraitRequiredWidthM(laneSpacing);

  let fov = PORTRAIT_FOV_PREF;
  let distance = distanceForHorizontalWidth(safeAspect, fov, need);

  if (distance > PORTRAIT_DISTANCE_MAX) {
    distance = PORTRAIT_DISTANCE_MAX;
    fov = clamp(fovForHorizontalWidth(safeAspect, distance, need), PORTRAIT_FOV_PREF, PORTRAIT_FOV_MAX);
    // FOV already at the ceiling: ease distance out just enough for character context.
    if (fov >= PORTRAIT_FOV_MAX - 0.05 && horizontalFrustumWidth(safeAspect, fov, distance) < need - 0.05) {
      distance = clamp(
        distanceForHorizontalWidth(safeAspect, fov, need),
        PORTRAIT_DISTANCE_MIN,
        PORTRAIT_DISTANCE_HARD_MAX,
      );
    }
  } else if (distance < PORTRAIT_DISTANCE_MIN) {
    distance = PORTRAIT_DISTANCE_MIN;
  }

  const lookAhead = clamp(distance * PORTRAIT_LOOK_AHEAD_FACTOR, distance * 0.5, distance * 0.65);

  return {
    fov: Math.round(fov * 10) / 10,
    distance: Math.round(distance * 100) / 100,
    height: PORTRAIT_CAMERA_HEIGHT,
    lookAhead: Math.round(lookAhead * 100) / 100,
    lookHeight: PORTRAIT_LOOK_HEIGHT,
    smooth: PORTRAIT_FOLLOW_SMOOTH,
    fovGain: Math.min(tuning.camera.fovGain, 2.5),
    landingDip: tuning.camera.landingDip,
    jumpLook: tuning.camera.jumpLook,
  };
}

export function shouldUsePortraitFollowCamera(framing: "landscape" | "portrait-when-tall" | undefined, aspect: number) {
  return framing === "portrait-when-tall" && Number.isFinite(aspect) && aspect > 0 && aspect < 1;
}

/**
 * Mobile Only portrait and landscape both track the runner's lane X so the
 * character stays centered when switching left / center / right.
 * (Portrait lateral lock at X = 0 was removed — static 3-lane framing rejected.)
 */
export function followCameraTrackX(_portraitMode: boolean, runnerX: number): number {
  return runnerX;
}

export function resolveFollowCamera(
  framing: "landscape" | "portrait-when-tall" | undefined,
  aspect: number,
): FollowCameraTuning {
  if (shouldUsePortraitFollowCamera(framing, aspect)) return portraitFollowCamera(aspect);
  return landscapeFollowCamera();
}
