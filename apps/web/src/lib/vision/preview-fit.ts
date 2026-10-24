export interface ContainFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  /** False until the camera reports its real frame size. */
  known: boolean;
}

/**
 * Largest rectangle of the camera's own aspect that fits in the stage.
 * The picture is never stretched. Empty stage around it is letterboxing, not a crop.
 */
export function containFrame(containerWidth: number, containerHeight: number, mediaWidth: number, mediaHeight: number): ContainFrame {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0, known: false };
  }
  if (mediaWidth <= 0 || mediaHeight <= 0) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight, known: false };
  }
  const scale = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
    known: true,
  };
}

/** MediaPipe can invent a joint past the image. Those points are not in the camera frame. */
export function inCameraFrame(point: { x: number; y: number } | null | undefined) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}
