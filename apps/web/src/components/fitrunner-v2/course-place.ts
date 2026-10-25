/**
 * Which scheduled obstacles sit on one recycled road tile.
 * The tile index keeps climbing for the whole run. A finite prefix leaves the road empty.
 */
export const PROVISIONAL_COURSE_SEED = 1;

export function tileOriginZ(spawn: number, tileSize: number) {
  return tileSize * 2 - spawn * tileSize;
}

export function obstaclesForTile<T extends { distanceM: number; depthM: number }>(
  obstacles: readonly T[],
  spawn: number,
  runDistance: number,
  tileSize: number,
): T[] {
  const worldZ = tileOriginZ(spawn, tileSize);
  const half = tileSize / 2;
  return obstacles.filter((item) => {
    if (item.distanceM < runDistance - 0.5) return false;
    const centerZ = -item.distanceM - item.depthM / 2;
    return centerZ >= worldZ - half && centerZ < worldZ + half;
  });
}
