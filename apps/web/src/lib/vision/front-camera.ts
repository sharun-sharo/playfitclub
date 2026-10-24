/** Selfie camera only. A bare facingMode is exact, so this never asks for the rear camera. */
export function frontCameraConstraints(): MediaTrackConstraints {
  return {
    facingMode: "user",
    width: { ideal: 720 },
    height: { ideal: 1280 },
    aspectRatio: { ideal: 9 / 16 },
    frameRate: { ideal: 30, max: 30 },
  };
}

/**
 * Preference order for the selfie camera. Sizes stay ideal, never required.
 * The last entry drops size so a phone that cannot do portrait still opens.
 */
export function frontCameraAttempts(): MediaTrackConstraints[] {
  return [
    frontCameraConstraints(),
    {
      facingMode: "user",
      aspectRatio: { ideal: 9 / 16 },
      frameRate: { ideal: 30, max: 30 },
    },
    frontCameraFallback(),
  ];
}

/** Same selfie camera, without a size the phone cannot meet. Still never the rear camera. */
export function frontCameraFallback(): MediaTrackConstraints {
  return { facingMode: "user", frameRate: { ideal: 30, max: 30 } };
}

/** Taller frames score higher. Unknown size scores 0 so a working stream is still usable. */
export function portraitScore(width: number, height: number) {
  if (width <= 0 || height <= 0) return 0;
  return height / width;
}
