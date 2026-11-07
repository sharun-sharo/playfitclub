import { roadLayout } from "@/components/fitrunner-v2/road-width";
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
 * Extra asphalt beyond each road edge in the portrait frustum.
 * Hybrid: roadEdge ± a thin margin (0–0.1). Slight lip crop is OK for presence.
 */
export const PORTRAIT_ROAD_MARGIN_M = 0.05;

/** Prefer a short pull-back; raise FOV before pushing distance past the cap. */
export const PORTRAIT_FOV_PREF = 70;
export const PORTRAIT_FOV_MAX = 78;
export const PORTRAIT_DISTANCE_MIN = 11.5;
export const PORTRAIT_DISTANCE_MAX = 14;

/**
 * Full road span plus a small margin. Lane centers stay at ±laneSpacing;
 * asphalt reaches roadEdge from center (historically ~4.45 m).
 */
export function portraitRequiredWidthM(laneSpacing = tuning.laneSpacing) {
  const road = roadLayout(laneSpacing);
  return (road.roadEdge + PORTRAIT_ROAD_MARGIN_M) * 2;
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
 * Hybrid cover: road edge ± thin margin, short distance (~12–14 m) and wide FOV (~70+)
 * so the runner reads larger. Look-ahead stays ~1× distance (not 18 m).
 */
export function portraitFollowCamera(aspect: number, laneSpacing = tuning.laneSpacing): FollowCameraTuning {
  const safeAspect = aspect > 0.05 && aspect < 1 ? aspect : 9 / 16;
  const need = portraitRequiredWidthM(laneSpacing);

  let fov = PORTRAIT_FOV_PREF;
  let distance = distanceForHorizontalWidth(safeAspect, fov, need);

  if (distance > PORTRAIT_DISTANCE_MAX) {
    distance = PORTRAIT_DISTANCE_MAX;
    fov = clamp(fovForHorizontalWidth(safeAspect, distance, need), PORTRAIT_FOV_PREF, PORTRAIT_FOV_MAX);
  } else if (distance < PORTRAIT_DISTANCE_MIN) {
    distance = PORTRAIT_DISTANCE_MIN;
  }

  const lookAhead = clamp(distance * 1.0, 9, 14);
  const lookHeight = 1.05;
  // Softer than the first portrait ship so near asphalt is less empty/foreshortened.
  const height = lookHeight + (distance + lookAhead) * 0.055;

  return {
    fov: Math.round(fov * 10) / 10,
    distance: Math.round(distance * 100) / 100,
    height: Math.round(height * 100) / 100,
    lookAhead: Math.round(lookAhead * 100) / 100,
    lookHeight,
    smooth: tuning.camera.smooth,
    fovGain: Math.min(tuning.camera.fovGain, 2.5),
    landingDip: tuning.camera.landingDip,
    jumpLook: tuning.camera.jumpLook,
  };
}

export function shouldUsePortraitFollowCamera(framing: "landscape" | "portrait-when-tall" | undefined, aspect: number) {
  return framing === "portrait-when-tall" && Number.isFinite(aspect) && aspect > 0 && aspect < 1;
}

export function resolveFollowCamera(
  framing: "landscape" | "portrait-when-tall" | undefined,
  aspect: number,
): FollowCameraTuning {
  if (shouldUsePortraitFollowCamera(framing, aspect)) return portraitFollowCamera(aspect);
  return landscapeFollowCamera();
}
