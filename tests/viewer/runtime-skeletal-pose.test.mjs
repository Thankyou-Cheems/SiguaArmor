import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import {
  classifyRuntimeChassisJointName,
  createRuntimeSkeletalPoseController,
  isRuntimeWheelOrSuspensionBoneName,
  runtimeSkeletalPoseEvidence,
} from "../../lib/runtime-skeletal-pose.ts";

function createSkeletonFixture({
  observedChanges = true,
  rewriteCommonInverseBindBasis = false,
} = {}) {
  const root = new THREE.Bone();
  root.name = "root";
  root.position.set(1, 2, 3);

  const carrier = new THREE.Bone();
  carrier.name = "carrier";
  carrier.position.set(4, 0, 0);
  root.add(carrier);

  const wheel = new THREE.Bone();
  wheel.name = "Wheel_L1";
  wheel.position.set(0, 5, 0);
  carrier.add(wheel);

  const turret = new THREE.Bone();
  turret.name = "turret";
  turret.position.set(0, 0, 6);
  root.add(turret);

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([root, carrier, wheel, turret]);
  if (rewriteCommonInverseBindBasis) {
    const commonBasis = new THREE.Matrix4().compose(
      new THREE.Vector3(3, -7, 11),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.1, -0.2, 0.3),
      ),
      new THREE.Vector3(2, 2, 2),
    );
    for (const inverse of skeleton.boneInverses) {
      inverse.multiply(commonBasis);
    }
  }

  if (observedChanges) {
    root.position.set(10, 20, 30);
    carrier.position.set(7, 0, 0);
    wheel.position.set(0, 8, 0);
    turret.position.set(0, 0, 9);
    root.updateMatrixWorld(true);
    skeleton.update();
  }

  return { skeleton, root, carrier, wheel, turret };
}

function xyz(object) {
  return object.position.toArray();
}

function assertXyzNear(object, expected, epsilon = 1e-12) {
  const actual = xyz(object);
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= epsilon,
      `${object.name || "bone"}[${index}] ${value} differs from ${expected[index]}`,
    );
  });
}

test("wheel and suspension bone matching is scoped to vehicle rig names", () => {
  for (const name of [
    "Wheel_L1",
    "wheel_roller_R4",
    "WheelTyre_FL",
    "susp_hub_L2",
    "RoadWheel.03",
    "axle-rear",
    "shock_L1",
    "returnroller",
    "swaybar_rear",
  ]) {
    assert.equal(isRuntimeWheelOrSuspensionBoneName(name), true, name);
  }
  for (const name of [
    "root",
    "turret",
    "steeringwheel",
    "steering_wheel_bone",
    "hatch_damper",
    "tire_pressure_gauge",
    "gun_mount",
    "hub",
  ]) {
    assert.equal(isRuntimeWheelOrSuspensionBoneName(name), false, name);
  }
});

test("secondary chassis tokens require primary running gear or structural relation", () => {
  assert.equal(
    classifyRuntimeChassisJointName("shock_L1").status,
    "unknown",
  );
  assert.equal(
    classifyRuntimeChassisJointName("shock_L1", {
      assetHasPrimary: true,
    }).status,
    "include",
  );
  assert.equal(
    classifyRuntimeChassisJointName("hub_L1", {
      assetHasPrimary: true,
      relatedToPrimary: false,
    }).status,
    "unknown",
  );
  assert.deepEqual(
    classifyRuntimeChassisJointName("hub_L1", {
      assetHasPrimary: true,
      relatedToPrimary: true,
    }),
    {
      status: "include",
      role: "suspension-hub",
      ruleId: "include-related-hub-token",
      confidence: "structural",
    },
  );
});

test("pose evidence distinguishes stable, snapshot, and reference-equivalent", () => {
  assert.equal(
    runtimeSkeletalPoseEvidence({
      observedSampleCount: 3,
      referenceEquivalent: false,
    }),
    "observed-stable",
  );
  assert.equal(
    runtimeSkeletalPoseEvidence({
      observedSampleCount: 1,
      referenceEquivalent: false,
    }),
    "observed-snapshot",
  );
  assert.equal(
    runtimeSkeletalPoseEvidence({
      observedSampleCount: 3,
      referenceEquivalent: true,
    }),
    "reference-equivalent",
  );
});

test("controller restores observed and parent-relative bind locals without deltas", () => {
  const { skeleton, root, carrier, wheel, turret } =
    createSkeletonFixture();
  const controller = createRuntimeSkeletalPoseController(skeleton, {
    observedSampleCount: 3,
    referenceEquivalent: false,
  });

  assert.ok(controller);
  assert.deepEqual(controller.selectedBoneNames, ["carrier", "Wheel_L1"]);
  assert.deepEqual(controller.changedBoneNames, ["carrier", "Wheel_L1"]);

  // Deriving the parent-relative bind pose must not modify unrelated bones.
  assert.deepEqual(xyz(root), [10, 20, 30]);
  assert.deepEqual(xyz(carrier), [7, 0, 0]);
  assert.deepEqual(xyz(wheel), [0, 8, 0]);
  assert.deepEqual(xyz(turret), [0, 0, 9]);

  controller.apply("reference");
  assert.deepEqual(xyz(root), [10, 20, 30]);
  assert.deepEqual(xyz(carrier), [4, 0, 0]);
  assert.deepEqual(xyz(wheel), [0, 5, 0]);
  assert.deepEqual(xyz(turret), [0, 0, 9]);

  controller.apply("observed");
  controller.apply("observed");
  assert.deepEqual(xyz(root), [10, 20, 30]);
  assert.deepEqual(xyz(carrier), [7, 0, 0]);
  assert.deepEqual(xyz(wheel), [0, 8, 0]);
  assert.deepEqual(xyz(turret), [0, 0, 9]);

  controller.apply("reference");
  controller.apply("reference");
  assert.deepEqual(xyz(carrier), [4, 0, 0]);
  assert.deepEqual(xyz(wheel), [0, 5, 0]);

  controller.apply("reference", {
    Wheel_L1: { x: 1, y: -2, z: 3 },
  });
  controller.apply("reference", {
    Wheel_L1: { x: 1, y: -2, z: 3 },
  });
  assert.deepEqual(xyz(carrier), [4, 0, 0]);
  assert.deepEqual(xyz(wheel), [0, 5, 0]);

  controller.apply("native-planar", {
    Wheel_L1: { x: 1, y: -2, z: 3 },
  });
  controller.apply("native-planar", {
    Wheel_L1: { x: 1, y: -2, z: 3 },
  });
  // The native wheel starts from the parent-relative bind reference; an auxiliary
  // selected carrier without a native record retains its live-PIE pose.
  assert.deepEqual(xyz(carrier), [7, 0, 0]);
  assert.deepEqual(xyz(wheel), [1, 3, 3]);

  controller.apply("observed", {
    Wheel_L1: { x: 100, y: 100, z: 100 },
  });
  assert.deepEqual(xyz(wheel), [0, 8, 0]);
});

test("common optimized inverse-bind basis keeps the observed root and exact local bind pose", () => {
  const { skeleton, root, carrier, wheel } = createSkeletonFixture({
    rewriteCommonInverseBindBasis: true,
  });
  const controller = createRuntimeSkeletalPoseController(skeleton, {
    observedSampleCount: 3,
    referenceEquivalent: false,
  });

  assert.ok(controller);
  controller.apply("reference");
  assertXyzNear(root, [10, 20, 30]);
  assertXyzNear(carrier, [4, 0, 0]);
  assertXyzNear(wheel, [0, 5, 0]);

  controller.apply("native-planar", {
    Wheel_L1: { x: 0.25, y: -0.5, z: 0.75 },
  });
  assertXyzNear(root, [10, 20, 30]);
  assertXyzNear(carrier, [7, 0, 0]);
  assertXyzNear(wheel, [0.25, 4.5, 0.75]);
});

test("reference-equivalent rigs report no invented visual change", () => {
  const { skeleton, wheel } = createSkeletonFixture({
    observedChanges: false,
  });
  const before = xyz(wheel);
  const controller = createRuntimeSkeletalPoseController(skeleton, {
    observedSampleCount: 3,
    referenceEquivalent: true,
  });

  assert.ok(controller);
  assert.equal(controller.evidence, "reference-equivalent");
  assert.deepEqual(controller.changedBoneNames, []);
  assert.equal(controller.declaredReferenceEquivalentMismatch, false);
  controller.apply("reference");
  controller.apply("observed");
  assert.deepEqual(xyz(wheel), before);
});

test("controller exposes the exact component-space wheel pose delta", () => {
  const componentRoot = new THREE.Group();
  const root = new THREE.Bone();
  root.name = "root";
  root.rotation.z = Math.PI / 2;
  componentRoot.add(root);
  const wheel = new THREE.Bone();
  wheel.name = "Wheel_L1";
  wheel.position.set(2, 0, 0);
  root.add(wheel);
  const skeleton = new THREE.Skeleton([root, wheel]);
  skeleton.calculateInverses();
  const controller = createRuntimeSkeletalPoseController(skeleton, {
    observedSampleCount: 3,
    referenceEquivalent: true,
  });
  assert.ok(controller);

  controller.apply("native-planar", {
    Wheel_L1: { x: 0.25, y: 0, z: 0 },
  });
  const componentPose = controller.componentPoseMatrixForBone(
    "Wheel_L1",
    componentRoot,
  );
  assert.ok(componentPose);
  const translation = new THREE.Vector3().setFromMatrixPosition(componentPose);
  assert.ok(Math.abs(translation.x) < 1e-10);
  assert.ok(Math.abs(translation.y - 0.25) < 1e-10);
  assert.ok(Math.abs(translation.z) < 1e-10);

  controller.apply("reference");
  assert.ok(
    controller
      .componentPoseMatrixForBone("Wheel_L1", componentRoot)
      ?.equals(new THREE.Matrix4()),
  );
});
