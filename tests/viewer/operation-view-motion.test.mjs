import assert from "node:assert/strict";
import test from "node:test";

import {
  operationViewMotionStep,
} from "../../lib/operation-view-control.ts";

const accelerated = {
  hasAcceleration: true,
  maxYawSpeedDegreesPerSecond: 90,
  maxPitchSpeedDegreesPerSecond: 60,
  inputAccelerationDegreesPerSecondSquared: { yaw: 80, pitch: 70 },
  noInputDecelerationDegreesPerSecondSquared: 120,
  oppositeDirectionDecelerationDegreesPerSecondSquared: 150,
  maxMoveDeltaTimeSeconds: 0.125,
};

test("accelerated station ramps from rest instead of jumping to maximum speed", () => {
  const result = operationViewMotionStep(
    ["KeyD"],
    1 / 60,
    accelerated,
    { yawVelocityDegreesPerSecond: 0, pitchVelocityDegreesPerSecond: 0 },
  );
  assert.ok(Math.abs(result.yawVelocityDegreesPerSecond - 80 / 60) < 1e-10);
  assert.ok(Math.abs(result.yawDelta - 80 / 3_600) < 1e-10);
  assert.equal(result.pitchDelta, 0);
});

test("screen-relative D remains rightward for a native station with an inverted source yaw axis", () => {
  const result = operationViewMotionStep(
    ["KeyD"],
    1 / 60,
    {
      ...accelerated,
      inputAccelerationDegreesPerSecondSquared: { yaw: -70, pitch: 70 },
    },
    { yawVelocityDegreesPerSecond: 0, pitchVelocityDegreesPerSecond: 0 },
  );
  assert.ok(result.yawVelocityDegreesPerSecond > 0);
  assert.ok(result.yawDelta > 0);
});

test("released accelerated station decelerates across frames before settling", () => {
  const result = operationViewMotionStep(
    [],
    1 / 60,
    accelerated,
    { yawVelocityDegreesPerSecond: 20, pitchVelocityDegreesPerSecond: 0 },
  );
  assert.equal(result.yawVelocityDegreesPerSecond, 18);
  assert.equal(result.yawDelta, 0.3);
  assert.equal(result.settled, false);
});

test("direct-drive station retains immediate maximum speed semantics", () => {
  const direct = {
    ...accelerated,
    hasAcceleration: false,
    inputAccelerationDegreesPerSecondSquared: null,
    noInputDecelerationDegreesPerSecondSquared: null,
    oppositeDirectionDecelerationDegreesPerSecondSquared: null,
  };
  assert.deepEqual(
    operationViewMotionStep(
      ["KeyA", "KeyW"],
      1 / 60,
      direct,
      { yawVelocityDegreesPerSecond: 0, pitchVelocityDegreesPerSecond: 0 },
    ),
    {
      yawDelta: -1.5,
      pitchDelta: 1,
      yawVelocityDegreesPerSecond: -90,
      pitchVelocityDegreesPerSecond: 60,
      settled: false,
    },
  );
});
