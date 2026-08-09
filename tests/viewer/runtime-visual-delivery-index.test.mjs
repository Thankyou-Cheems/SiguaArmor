import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function lfBytes(bytes) {
  return Buffer.from(
    bytes
      .toString("utf8")
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n"),
    "utf8",
  );
}

test("visual delivery index is compact and exact-source-addressable", async () => {
  const index = await readJson("app/runtime-probe-visual-delivery-index.json");
  assert.equal(index.schemaVersion, "runtime-visual-delivery-index/v2");
  assert.match(index.indexRevision, /^[a-f0-9]{64}$/u);
  assert.equal(index.descriptorCount, index.entries.length);
  assert.equal(index.editionCounts.international, index.entries.length);
  assert.ok(index.editionCounts.china > 0);
  assert.ok(index.reviewDescriptorCount > 0);

  const identities = new Set();
  const expectedDeliveryFiles = new Set();
  for (const entry of index.entries) {
    const identity = `${entry.cardId}\u0000${entry.rawName}`;
    assert.equal(identities.has(identity), false, identity);
    identities.add(identity);
    assert.equal(Object.hasOwn(entry, "placements"), false, identity);
    assert.match(
      entry.file,
      /^\.\/runtime-probe-visual-delivery\/[a-f0-9]{64}\.visual\.json$/u,
    );
    assert.match(
      entry.sourceFile,
      /^\.\/runtime-probe-visuals\/.+\.visual\.json$/u,
    );
    assert.match(entry.sourceIndexSha256, /^[a-f0-9]{64}$/u);
    expectedDeliveryFiles.add(path.posix.basename(entry.file));

    const sourcePath = path.join(ROOT, "app", entry.sourceFile.slice("./".length));
    await access(sourcePath);
    const sourceBytes = await readFile(sourcePath);
    assert.equal(
      sha256(lfBytes(sourceBytes)),
      entry.sourceSha256,
      identity,
    );
    const source = JSON.parse(sourceBytes.toString("utf8"));
    for (const field of [
      "generatedClass",
      "vehicleId",
      "identitySha256",
      "packageSha256",
      "runtimeBonePoseStatus",
      "status",
      "visualAcceptanceStatus",
      "webUsable",
    ]) {
      assert.deepEqual(source[field], entry[field], `${identity}: ${field}`);
    }

    const deliveryPath = path.join(ROOT, "app", entry.file.slice("./".length));
    await access(deliveryPath);
    const deliveryBytes = await readFile(deliveryPath);
    assert.equal(sha256(deliveryBytes), entry.deliverySha256, identity);
    const delivery = JSON.parse(deliveryBytes.toString("utf8"));
    assert.equal(delivery.cardId, entry.cardId, identity);
    assert.equal(delivery.rawName, entry.rawName, identity);
    assert.equal(delivery.placements.length, delivery.requiredOccurrences, identity);
    for (const placement of delivery.placements) {
      assert.match(
        placement.assetUrl,
        /^\/assets\/runtime-probe\/models\/[a-f0-9]{64}\.gltf$/u,
        identity,
      );
    }
  }
  const actualDeliveryFiles = (
    await readdir(
      path.join(ROOT, "app", "runtime-probe-visual-delivery"),
    )
  )
    .filter((fileName) => fileName.endsWith(".visual.json"))
    .sort();
  assert.deepEqual(
    actualDeliveryFiles,
    [...expectedDeliveryFiles].sort(),
  );
});

test("viewer preview module does not statically import aggregate visual placement indexes", async () => {
  const [previewSource, viewerSource] = await Promise.all([
    readFile(path.join(ROOT, "app", "runtime-probe-preview-data.ts"), "utf8"),
    readFile(path.join(ROOT, "app", "InternationalVehicleViewer.tsx"), "utf8"),
  ]);
  assert.doesNotMatch(previewSource, /from ["']\.\/runtime-probe-visual-release-index\.json["']/u);
  assert.doesNotMatch(previewSource, /from ["']\.\/runtime-probe-visual-review-index\.json["']/u);
  assert.doesNotMatch(previewSource, /from ["']\.\/china-runtime-probe-visual-release-index\.json["']/u);
  assert.match(previewSource, /\.glob<RuntimeVisualDescriptor>\("\.\/runtime-probe-visual-delivery\/\*\.visual\.json"/u);
  assert.match(viewerSource, /runtimePreviewForCatalogBinding\(/u);
});

test("viewer keeps the complete weapon selector behind its own lazy module", async () => {
  const [
    equipmentIndex,
    viewerSource,
    catalogSource,
    catalogBytes,
    weaponLabelsSource,
  ] = await Promise.all([
    readJson("app/runtime-vehicle-equipment-index.json"),
    readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8"),
    readFile(path.join(ROOT, "app", "CatalogApp.tsx"), "utf8"),
    readFile(path.join(ROOT, "generated", "internal", "weapon-catalog.json")),
    readFile(path.join(ROOT, "app", "runtime-probe-weapon-labels.ts"), "utf8"),
  ]);
  assert.equal(
    equipmentIndex.schemaVersion,
    "sigua-runtime-vehicle-equipment-index/v2",
  );
  assert.equal(
    equipmentIndex.counts.bindings,
    equipmentIndex.bindings.length,
  );
  assert.equal(equipmentIndex.catalog.sha256, sha256(catalogBytes));
  assert.match(
    equipmentIndex.projectionRevision,
    /^[a-f0-9]{64}$/u,
  );
  assert.equal(
    new Set(equipmentIndex.bindings.map(({ id }) => id)).size,
    equipmentIndex.bindings.length,
  );
  assert.ok(
    equipmentIndex.bindings.every(
      ({ equipment }) =>
        equipment &&
        typeof equipment.gunName === "string" &&
        typeof equipment.displayName === "string" &&
        equipment.projectile &&
        equipment.mechanics,
    ),
  );
  const weaponCatalog = JSON.parse(catalogBytes.toString("utf8"));
  const variantById = new Map(
    weaponCatalog.selector.variants.map((variant) => [variant.id, variant]),
  );
  const directDamageModelById = new Map(
    weaponCatalog.mechanics.directDamageModels.map((model) => [model.id, model]),
  );
  const canonicalBallisticsByBindingId = new Map(
    weaponCatalog.relations.vehicleEquipmentBindings.flatMap((binding) => {
      if (binding.weaponVariantIds.length !== 1) return [];
      const variant = variantById.get(binding.weaponVariantIds[0]);
      const directDamageModel = variant?.directDamageModelId
        ? directDamageModelById.get(variant.directDamageModelId)
        : null;
      return directDamageModel
        ? [[binding.id, {
            penetrationMm: directDamageModel.penetrationMm,
            traceDistanceAfterPenetrationM:
              directDamageModel.traceDistanceAfterPenetrationM,
          }]]
        : [];
    }),
  );
  assert.ok(canonicalBallisticsByBindingId.size > 0);
  for (const binding of equipmentIndex.bindings) {
    const canonicalBallistics = canonicalBallisticsByBindingId.get(binding.id);
    if (canonicalBallistics === undefined) continue;
    assert.equal(
      binding.equipment.armorPenetrationMm,
      canonicalBallistics.penetrationMm,
      `${binding.id} must expose canonical projectile penetration`,
    );
    assert.equal(
      binding.equipment.traceDistanceAfterPenM,
      canonicalBallistics.traceDistanceAfterPenetrationM,
      `${binding.id} must expose canonical projectile aftereffect distance`,
    );
  }
  const frag100mmBindings = equipmentIndex.bindings.filter(
    ({ equipment }) =>
      equipment.projectileName === "BP_Projectile_100mm_Frag_C",
  );
  assert.ok(frag100mmBindings.length > 0);
  for (const binding of frag100mmBindings) {
    assert.equal(
      binding.equipment.armorPenetrationMm,
      10,
      `${binding.id} must use the projectile's native armor input`,
    );
    assert.equal(
      binding.equipment.traceDistanceAfterPenM,
      0.10000000149011612,
      `${binding.id} must keep the projectile's native aftereffect distance`,
    );
  }
  assert.match(catalogSource, />\s*后效距离\s*</u);
  assert.doesNotMatch(catalogSource, /killZoneRadius|Kill Zone/u);
  assert.match(
    weaponLabelsSource,
    /directModel\.weaponTraceDistanceAfterPenetrationM\s*\?\?\s*directModel\.traceDistanceAfterPenetrationM/u,
  );
  assert.match(viewerSource, /import\(["']\.\/runtime-probe-weapon-labels["']\)/u);
  assert.doesNotMatch(viewerSource, /from ["'][^"']*lib\/weapon-catalog/u);
  assert.match(viewerSource, /正在加载完整武器选择器/u);
});
