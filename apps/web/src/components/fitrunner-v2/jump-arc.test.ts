import { describe, expect, it } from "vitest";
import { fitRunnerTuning as tuning } from "./tuning";
import {
  AGILITY_HURDLE,
  AIRBORNE_SECONDS,
  beginJumpArc,
  bodyHitsObstacle,
  CLEARANCE_CASES,
  CLEARANCE_MARGIN_M,
  courseSpeed,
  JUMP_GRAVITY,
  JUMP_VELOCITY,
  jumpClipTime,
  OBSTACLE_SPACING_M,
  PEAK_HEIGHT_M,
  PLYO_BOX,
  PLAYER_COLLISION_DEPTH_M,
  PREVIOUS_JUMP,
  requiredTravel,
  sampleJump,
  stepJumpArc,
  sweepClearance,
  travelMeters,
} from "./jump-arc";

describe("fitrunner jump arc", () => {
  it("records the old arc and lengthens airborne travel by about 30–40%", () => {
    expect(PREVIOUS_JUMP.fallGravity).toBe(28);
    expect(PREVIOUS_JUMP.airborneSeconds).toBe(0.45);
    expect(PREVIOUS_JUMP.peakHeightMeters).toBe(0.651);
    expect(PREVIOUS_JUMP.hipLiftMeters).toBe(0.574);
    expect(JUMP_VELOCITY).toBe(5.6);
    expect(JUMP_GRAVITY).toBe(18);
    expect(AIRBORNE_SECONDS).toBeCloseTo(0.622222, 4);
    expect(PEAK_HEIGHT_M).toBeCloseTo(0.871111, 4);

    const oldLow = PREVIOUS_JUMP.airborneSeconds * tuning.forwardSpeed;
    const oldMax = PREVIOUS_JUMP.airborneSeconds * tuning.maxSpeed;
    expect(oldLow).toBeCloseTo(2.7675, 4);
    expect(oldMax).toBeCloseTo(3.69, 4);
    expect(travelMeters(tuning.forwardSpeed)).toBeCloseTo(3.826667, 4);
    expect(travelMeters(tuning.maxSpeed)).toBeCloseTo(5.102222, 4);

    for (const speed of [tuning.forwardSpeed, tuning.maxSpeed]) {
      const ratio = travelMeters(speed) / (PREVIOUS_JUMP.airborneSeconds * speed);
      expect(ratio).toBeGreaterThanOrEqual(1.3);
      expect(ratio).toBeLessThanOrEqual(1.4);
    }
  });

  it("peaks above the hurdle and the plyo box, rises quickly, and lands without floating", () => {
    expect(PEAK_HEIGHT_M).toBeGreaterThan(AGILITY_HURDLE.top + 0.25);
    expect(PEAK_HEIGHT_M).toBeGreaterThan(PLYO_BOX.top + 0.2);
    expect(PEAK_HEIGHT_M - PREVIOUS_JUMP.peakHeightMeters).toBeGreaterThan(0.15);
    expect(PEAK_HEIGHT_M - PREVIOUS_JUMP.peakHeightMeters).toBeLessThan(0.35);

    const hurdleTime = timeAbove(AGILITY_HURDLE.top);
    const boxTime = timeAbove(PLYO_BOX.top);
    expect(hurdleTime).toBeLessThan(0.12);
    expect(boxTime).toBeLessThan(0.18);

    let nearPeak = 0;
    const dt = 0.001;
    for (let t = dt; t < AIRBORNE_SECONDS; t += dt) {
      const sample = sampleJump(t);
      expect(sample.airborne).toBe(true);
      expect(sample.height).toBeGreaterThan(0);
      if (sample.height > PEAK_HEIGHT_M - 0.05) nearPeak += dt;
    }
    expect(nearPeak / AIRBORNE_SECONDS).toBeLessThan(0.3);

    const landed = sampleJump(AIRBORNE_SECONDS);
    expect(landed.airborne).toBe(false);
    expect(landed.height).toBe(0);
    expect(landed.phase).toBe("ground");
    expect(landed.verticalSpeed).toBe(-JUMP_VELOCITY);
    const later = sampleJump(AIRBORNE_SECONDS + 0.25);
    expect(later.airborne).toBe(false);
    expect(later.height).toBe(0);
  });

  it("clears a hurdle and a plyo box at low and max speed, close and early, without shrinking boxes", () => {
    expect(tuning.forwardSpeed).toBe(6.15);
    expect(tuning.maxSpeed).toBe(8.2);
    expect(tuning.speedGain).toBe(0.045);
    expect(tuning.props.log).toMatchObject({ y: 0.4, z: 0.16 });
    expect(tuning.props.blocker).toMatchObject({ x: 2.2, y: 2.78, z: 1.18 });
    expect(AGILITY_HURDLE.top).toBe(0.4);
    expect(AGILITY_HURDLE.depth).toBe(0.16);
    expect(PLYO_BOX.top).toBe(0.61);
    expect(PLYO_BOX.depth).toBe(0.61);
    expect(PLAYER_COLLISION_DEPTH_M).toBeCloseTo(0.7, 5);
    expect(OBSTACLE_SPACING_M).toBe(9);
    expect(travelMeters(tuning.maxSpeed)).toBeLessThan(OBSTACLE_SPACING_M);

    for (const obstacle of [AGILITY_HURDLE, PLYO_BOX]) {
      expect(travelMeters(tuning.forwardSpeed)).toBeGreaterThan(requiredTravel(obstacle));
      expect(travelMeters(tuning.maxSpeed)).toBeGreaterThan(requiredTravel(obstacle));
    }

    for (const item of CLEARANCE_CASES) {
      const speed = courseSpeed(item.speed);
      const sweep = sweepClearance({ obstacle: item.obstacle, speed, lead: item.lead });
      expect(sweep.travel).toBeGreaterThan(sweep.required);
      expect(sweep.hits).toBe(0);
      expect(sweep.landedGap).toBeGreaterThanOrEqual(CLEARANCE_MARGIN_M);
    }

    const noseOnBox = sweepClearance({ obstacle: PLYO_BOX, speed: tuning.maxSpeed, lead: 0 });
    expect(noseOnBox.hits).toBeGreaterThan(0);
  });

  it("does not count a collision once the body has cleared the hit volume", () => {
    expect(
      bodyHitsObstacle({
        footHeight: PLYO_BOX.top + 0.05,
        bodyMinZ: -0.4,
        bodyMaxZ: 0.2,
        obstacleMinZ: -PLYO_BOX.depth,
        obstacleMaxZ: 0,
        obstacleTop: PLYO_BOX.top,
      }),
    ).toBe(false);
    expect(
      bodyHitsObstacle({
        footHeight: AGILITY_HURDLE.top - 0.05,
        bodyMinZ: -0.2,
        bodyMaxZ: 0.2,
        obstacleMinZ: -AGILITY_HURDLE.depth,
        obstacleMaxZ: 0,
        obstacleTop: AGILITY_HURDLE.top,
      }),
    ).toBe(true);
    expect(
      bodyHitsObstacle({
        footHeight: 0,
        bodyMinZ: 0.2,
        bodyMaxZ: 0.9,
        obstacleMinZ: -AGILITY_HURDLE.depth,
        obstacleMaxZ: 0,
        obstacleTop: AGILITY_HURDLE.top,
      }),
    ).toBe(false);
  });

  it("plays one arc per command and returns the JumpUp clip to the ground with the body", () => {
    const first = beginJumpArc(null);
    expect(first?.active).toBe(true);
    let arc = first!;
    arc = stepJumpArc(arc, 0.12);
    expect(arc.active).toBe(true);
    expect(beginJumpArc(arc)).toBeNull();
    let steps = 0;
    while (arc.active) {
      arc = stepJumpArc(arc, 1 / 60);
      steps += 1;
      expect(steps).toBeLessThan(80);
    }
    expect(sampleJump(arc.elapsed).height).toBe(0);
    expect(sampleJump(arc.elapsed).airborne).toBe(false);
    const next = beginJumpArc(arc);
    expect(next?.active).toBe(true);
    expect(next?.elapsed).toBe(0);

    const takeoff = 0.5;
    const apex = 0.766667;
    const start = jumpClipTime(0, takeoff, apex);
    const peak = jumpClipTime(AIRBORNE_SECONDS / 2, takeoff, apex);
    const falling = jumpClipTime(AIRBORNE_SECONDS * 0.75, takeoff, apex);
    const grounded = jumpClipTime(AIRBORNE_SECONDS, takeoff, apex);
    expect(start.grounded).toBe(false);
    expect(start.time).toBeCloseTo(takeoff, 4);
    expect(peak.grounded).toBe(false);
    expect(peak.time).toBeCloseTo(apex, 3);
    expect(falling.time).toBeLessThan(peak.time);
    expect(falling.time).toBeGreaterThan(takeoff);
    expect(grounded.grounded).toBe(true);
    expect(grounded.time).toBe(takeoff);
    for (let t = 0; t < AIRBORNE_SECONDS; t += 0.02) {
      const clip = jumpClipTime(t, takeoff, apex);
      expect(clip.grounded).toBe(false);
      expect(clip.time).toBeGreaterThanOrEqual(takeoff);
      expect(clip.time).toBeLessThanOrEqual(apex + 1e-6);
    }
  });
});

function timeAbove(height: number) {
  const discriminant = JUMP_VELOCITY * JUMP_VELOCITY - 2 * JUMP_GRAVITY * height;
  return (JUMP_VELOCITY - Math.sqrt(discriminant)) / JUMP_GRAVITY;
}
