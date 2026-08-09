import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertInventorySnapshot,
  assertPinnedValue,
} from "../../tools/validation-profile.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function dotColumn(matrix, leftColumn, rightColumn) {
  return [0, 1, 2].reduce(
    (sum, row) =>
      sum +
      matrix[leftColumn * 4 + row] * matrix[rightColumn * 4 + row],
    0,
  );
}

function rotationDeterminant(matrix) {
  const a00 = matrix[0];
  const a01 = matrix[4];
  const a02 = matrix[8];
  const a10 = matrix[1];
  const a11 = matrix[5];
  const a12 = matrix[9];
  const a20 = matrix[2];
  const a21 = matrix[6];
  const a22 = matrix[10];
  return (
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20)
  );
}

test("runtime chassis pose index preserves current fleet coverage and provenance", async () => {
  const [index, visualIndex] = await Promise.all([
    readJson("app/runtime-chassis-pose-index.json"),
    readJson("app/runtime-probe-visual-index.json"),
  ]);

  assert.equal(index.schemaVersion, "runtime-chassis-pose-preview-index/v1");
  assert.equal(index.source.sourceMap, "/Game/RuntimeProbe/RuntimeProbeMap");
  assert.equal(index.source.pieNetworkMode, "standalone");
  assert.equal(index.source.spawnRoute, "real-pie-direct-exact-generated-class-spawn");
  assert.equal(index.recordCount, index.records.length);
  assert.equal(index.coverage.observedTargetCount, index.records.length);
  assert.equal(
    index.coverage.requestedTargetCount,
    index.coverage.observedTargetCount + index.coverage.unavailableTargetCount,
  );
  assert.equal(
    index.coverage.unavailableTargetKeys.length,
    index.coverage.unavailableTargetCount,
  );
  assertPinnedValue(
    assert,
    index.coverage.unavailableTargetKeys,
    [
      "bp-kamaz-5350-logi-ada38c3b645a",
      "bp-ural-4320-logi-gfi-c1793eb32d43",
    ],
    "unavailable chassis targets",
  );
  assertInventorySnapshot(assert, index.recordCount, 468, "runtime chassis poses");
  assertInventorySnapshot(
    assert,
    index.coverage.requestedTargetCount,
    470,
    "requested chassis targets",
  );
  assert.equal(sha256Json(index.records), index.recordsSha256);

  const poseClasses = new Set(index.records.map(({ generatedClass }) => generatedClass));
  assert.equal(poseClasses.size, index.records.length);
  const visualClasses = new Set(
    visualIndex.descriptors.map(({ generatedClass }) => generatedClass),
  );
  assert.equal(
    visualClasses.size,
    index.coverage.requestedTargetCount,
    "the pose plan must cover every exact visual generated class",
  );
  assert.equal(
    [...visualClasses].filter((generatedClass) => !poseClasses.has(generatedClass))
      .length,
    index.coverage.unavailableTargetCount,
    "only explicitly unavailable exact classes may lack a runtime pose",
  );
});

test("every preview matrix is finite, rigid, right-handed, and keeps the captured ground offset", async () => {
  const index = await readJson("app/runtime-chassis-pose-index.json");

  for (const record of index.records) {
    const { gltfMatrix: matrix } = record;
    assert.equal(matrix.length, 16, record.targetKey);
    assert.ok(matrix.every(Number.isFinite), record.targetKey);
    assert.equal(record.wheelCompressionState, "native-unknown", record.targetKey);
    assert.ok(Math.abs(matrix[3]) < 1e-12, record.targetKey);
    assert.ok(Math.abs(matrix[7]) < 1e-12, record.targetKey);
    assert.ok(Math.abs(matrix[11]) < 1e-12, record.targetKey);
    assert.ok(Math.abs(matrix[12]) < 1e-12, record.targetKey);
    assert.ok(
      Math.abs(matrix[13] - record.heightAbovePlaneCm / 100) < 1e-10,
      record.targetKey,
    );
    assert.ok(Math.abs(matrix[14]) < 1e-12, record.targetKey);
    assert.equal(matrix[15], 1, record.targetKey);

    for (let column = 0; column < 3; column += 1) {
      assert.ok(
        Math.abs(dotColumn(matrix, column, column) - 1) < 1e-8,
        `${record.targetKey}: unit column ${column}`,
      );
    }
    assert.ok(Math.abs(dotColumn(matrix, 0, 1)) < 1e-8, record.targetKey);
    assert.ok(Math.abs(dotColumn(matrix, 0, 2)) < 1e-8, record.targetKey);
    assert.ok(Math.abs(dotColumn(matrix, 1, 2)) < 1e-8, record.targetKey);
    assert.ok(
      Math.abs(rotationDeterminant(matrix) - 1) < 1e-8,
      `${record.targetKey}: right-handed rotation`,
    );
  }
});

test("T-64BM2 preview uses the observed 1.32 degree settled pose", async () => {
  const index = await readJson("app/runtime-chassis-pose-index.json");
  const t64 = index.records.find(
    ({ generatedClass }) =>
      generatedClass ===
      "/Game/Vehicles/T64_BM2/BP_T64BM2_Cage.BP_T64BM2_Cage_C",
  );

  assert.ok(t64);
  assert.equal(t64.targetKey, "bp-t64bm2-cage-35291b091a14");
  assert.ok(Math.abs(t64.pitchDeg - 1.3208417799419137) < 1e-12);
  assert.ok(Math.abs(t64.rollDeg - -0.006828242673740729) < 1e-12);
  assert.ok(Math.abs(t64.heightAbovePlaneCm - -9.658217430114691) < 1e-12);
});

test("viewer applies one default-on exact pose parent to visual and hit geometry", async () => {
  const [viewerSource, previewSource] = await Promise.all([
    readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8"),
    readFile(path.join(ROOT, "app", "runtime-probe-preview-data.ts"), "utf8"),
  ]);

  assert.match(
    previewSource,
    /runtimeChassisPoseForGeneratedClass\(\s*descriptor\.generatedClass,\s*\)/u,
  );
  assert.match(viewerSource, /const \[physicalPoseEnabled, setPhysicalPoseEnabled\] = useState\(true\);/u);
  assert.match(viewerSource, /modelGroup\.add\(chassisPoseGroup\);/u);
  assert.match(
    viewerSource,
    /chassisPoseGroup\.add\(visualGroup, analysisVisualGroup\);/u,
  );
  assert.match(viewerSource, /chassisPoseGroup\.add\(hitGroup\);/u);
  assert.match(viewerSource, /aria-label="真实物理状态"/u);
  assert.match(viewerSource, /disabled=\{!chassisPose\}/u);
  assert.match(viewerSource, /referencePlaneAuthority = runtimePoseGroundActive/u);
  assert.match(
    viewerSource,
    /registerSkeletalPose\(depthModel, placement\)/u,
  );
  assert.match(
    viewerSource,
    /registerSkeletalPose\(analysisModel, placement\)/u,
  );
  assert.match(viewerSource, /registerSkeletalPose\(model, placement\)/u);
  assert.match(
    viewerSource,
    /runtimePlanarSuspensionPoseForVisualOccurrence\(\s*preview\.generatedClass,\s*placement\.stableOccurrenceId,\s*\)/u,
  );
  assert.match(viewerSource, /controller\.apply\(\s*"native-planar"/u);
  assert.match(
    viewerSource,
    /resolveRuntimeRunningGearHitComponentPoses\(/u,
  );
  assert.match(
    viewerSource,
    /componentPoseMatrixForBone\(\s*wheel\.boneName,\s*model,\s*\)/u,
  );
  assert.match(viewerSource, /runningGearAppliedHitComponentCount/u);
  assert.match(viewerSource, /mesh\.computeBoundingBox\(\)/u);
  assert.match(viewerSource, /mesh\.computeBoundingSphere\(\)/u);
  assert.match(viewerSource, /suspensionPoseAppliedWheelOffsetCount/u);
  assert.match(viewerSource, /suspensionPoseStableOccurrenceIds/u);
  assert.match(
    viewerSource,
    /data-skeletal-pose-evidence=\{/u,
  );
  assert.match(
    viewerSource,
    /Vehicle Mesh 使用 ODK 原生平面 sweep 关系重建/u,
  );
  assert.match(
    viewerSource,
    /当前 exact occurrence 没有 native-planar 记录/u,
  );
  assert.doesNotMatch(
    previewSource,
    /runtimeChassisPoseForGeneratedClass\(\s*descriptor\.(?:rawName|cardId)/u,
  );
});
