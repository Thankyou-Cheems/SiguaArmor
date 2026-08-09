import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { auditRuntimeVisualDuplicateOccurrences } from "../../tools/audit-runtime-visual-duplicate-occurrences.mjs";
import {
  assertInventorySnapshot,
  assertPinnedValue,
} from "../../tools/validation-profile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

test("BRDM-2 UB-32 selects the one turret-mounted weapon occurrence", async () => {
  const [visualIndex, selectionPolicy] = await Promise.all([
    readJson("app/runtime-probe-visual-index.json"),
    readJson("app/runtime-probe-visual-selection-policy.json"),
  ]);
  const descriptors = visualIndex.descriptors.filter(
    (descriptor) =>
      descriptor.cardId === "gfi--brdm-2-ub-32--rsv" &&
      descriptor.rawName === "BP_BRDM-2_GFI",
  );
  assert.equal(descriptors.length, 1);
  const descriptor = descriptors[0];
  const rules = selectionPolicy.rules.filter(
    (rule) =>
      rule.cardId === descriptor.cardId && rule.rawName === descriptor.rawName,
  );
  assert.equal(rules.length, 1);
  const rule = rules[0];
  assert.equal(rule.selectionMode, "exact-active-weapon-occurrence");
  assert.deepEqual(rule.target, {
    componentName: "WeaponMesh3P",
    actorIncludes: ["BP_BRDM2_GFI_KPVT_C_0"],
  });
  assert.deepEqual(rule.suppressComponentNames, ["WeaponMesh3P"]);

  const managed = descriptor.placements.filter((placement) =>
    rule.suppressComponentNames.includes(placement.name),
  );
  const selected = managed.filter(
    (placement) =>
      placement.name === rule.target.componentName &&
      rule.target.actorIncludes.some((needle) => placement.actor.includes(needle)),
  );
  assert.equal(managed.length, 4);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].actor, "BP_BRDM2_GFI_KPVT_C_0");
  assert.deepEqual(selected[0].matrix.slice(12, 15), [
    0.537078389,
    2.149032764,
    0.051988147,
  ]);

  const selectedIds = new Set(selected.map((placement) => placement.stableOccurrenceId));
  const rejected = managed.filter(
    (placement) => !selectedIds.has(placement.stableOccurrenceId),
  );
  assert.deepEqual(
    rejected.map((placement) => placement.actor).sort(),
    [
      "BP_BRDM2_GFI_PKT_C_0",
      "BP_BRDM2_GFI_Smoke_Launcher_C_0",
      "BP_BRDM2_GFI_UB32_C_0",
    ],
  );
  assert.ok(rejected.every((placement) => placement.matrix[13] === 0.551110624));

  const managedIds = new Set(managed.map((placement) => placement.stableOccurrenceId));
  const filtered = descriptor.placements.filter(
    (placement) =>
      !managedIds.has(placement.stableOccurrenceId) ||
      selectedIds.has(placement.stableOccurrenceId),
  );
  assert.equal(filtered.length, 10);
  assert.deepEqual(
    filtered.filter((placement) => placement.name === "WeaponMesh3P").map((placement) => placement.actor),
    ["BP_BRDM2_GFI_KPVT_C_0"],
  );
});

test("the current visual fleet distinguishes safe duplicates from review groups", async () => {
  const visualIndex = await readJson("app/runtime-probe-visual-index.json");
  const audit = auditRuntimeVisualDuplicateOccurrences(visualIndex);

  assertInventorySnapshot(assert, audit.visualDescriptorCount, 604, "visual descriptors");
  assertInventorySnapshot(assert, audit.uniqueSourceVehicleCount, 470, "visual sources");
  assertInventorySnapshot(
    assert,
    audit.sameSourceCrossActorVehicleCount,
    64,
    "cross-actor vehicles",
  );
  assertInventorySnapshot(
    assert,
    audit.sameSourceCrossActorGroupCount,
    65,
    "cross-actor groups",
  );

  assertInventorySnapshot(
    assert,
    audit.exactRenderDuplicateVehicleCount,
    63,
    "duplicate vehicles",
  );
  assertInventorySnapshot(assert, audit.exactRenderDuplicateGroupCount, 63, "duplicate groups");
  assertInventorySnapshot(
    assert,
    audit.exactRenderDuplicateOccurrenceCount,
    179,
    "duplicate occurrences",
  );
  assertInventorySnapshot(
    assert,
    audit.exactRenderRedundantOccurrenceCount,
    116,
    "redundant occurrences",
  );
  assert.equal(audit.exactRenderPayloadMismatchGroupCount, 0);
  assert.ok(
    audit.exactRenderDuplicateGroups.every(
      (group) => group.assetUrls.length === 1 && group.renderPayloadSha256.length === 1,
    ),
  );

  assertInventorySnapshot(
    assert,
    audit.sameSourceDifferentPayloadReviewVehicleCount,
    3,
    "payload-review vehicles",
  );
  assertInventorySnapshot(
    assert,
    audit.sameSourceDifferentPayloadReviewGroupCount,
    3,
    "payload-review groups",
  );
  assertPinnedValue(
    assert,
    audit.sameSourceDifferentPayloadReviewGroups.map((group) => group.rawName).sort(),
    ["BP_BMP2_GFI", "BP_TAPV_C16", "BP_ZBL08_HJ73C_Naval"],
    "payload-review identities",
  );
  assert.ok(
    audit.sameSourceDifferentPayloadReviewGroups.every(
      (group) => group.renderPayloadSha256.length > 1,
    ),
  );

  const brdmDuplicate = audit.exactRenderDuplicateGroups.filter(
    (group) => group.rawName === "BP_BRDM-2_GFI",
  );
  assert.equal(brdmDuplicate.length, 1);
  assert.equal(brdmDuplicate[0].occurrenceCount, 3);
  assert.deepEqual(brdmDuplicate[0].actors, [
    "BP_BRDM2_GFI_PKT_C_0",
    "BP_BRDM2_GFI_Smoke_Launcher_C_0",
    "BP_BRDM2_GFI_UB32_C_0",
  ]);

  assertInventorySnapshot(assert, audit.bindingDriftCount, 1, "binding drift");
  assertPinnedValue(
    assert,
    audit.bindingDrift.map((entry) => entry.rawName),
    ["BP_CSK131_HJ-8ATGM_Naval"],
    "binding-drift identities",
  );
});
