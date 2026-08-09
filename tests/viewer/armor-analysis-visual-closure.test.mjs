import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ANALYSIS_VISUAL_DEPTH_BIAS_FACTOR,
  ANALYSIS_VISUAL_DEPTH_BIAS_UNITS,
  analysisVisualStableSurfaceReasons,
  isStableAnalysisVisualSurfacePlacement,
} from "../../lib/analysis-visual-surface-policy.ts";
import {
  assertInventorySnapshot,
  isStrictValidation,
} from "../../tools/validation-profile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STRICT_VALIDATION = isStrictValidation();

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

async function visualAssetSource() {
  const candidates = [
    {
      kind: "sealed",
      indexPath: "app/runtime-probe-visual-release-index.json",
      publicRoot: path.join(ROOT, ".release", "public"),
      probePath: path.join(
        ROOT,
        ".release",
        "public",
        "assets",
        "runtime-probe",
        "models",
      ),
    },
    {
      kind: "raw",
      indexPath: "app/runtime-probe-visual-index.json",
      publicRoot: path.join(ROOT, "public"),
      probePath: path.join(ROOT, "public", "assets", "runtime-probe", "visuals"),
    },
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate.probePath);
      return {
        kind: candidate.kind,
        index: await readJson(candidate.indexPath),
        publicRoot: candidate.publicRoot,
      };
    } catch {
      // A fresh worktree may intentionally have neither the sealed closure nor raw assets.
    }
  }
  return null;
}

test("all current catalog bindings retain accepted visual occurrences in analysis modes", async () => {
  const [visualIndex, catalog, viewerSource] = await Promise.all([
    readJson("app/runtime-probe-visual-index.json"),
    readJson("generated/international-catalog.json"),
    readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8"),
  ]);

  assert.equal(visualIndex.schemaVersion, "runtime-visual-descriptor-index/v1");
  assert.equal(visualIndex.descriptors.length, catalog.summary.factionVehicleRecords);
  assertInventorySnapshot(
    assert,
    visualIndex.descriptors.length,
    604,
    "visual catalog bindings",
  );
  assertInventorySnapshot(
    assert,
    new Set(visualIndex.descriptors.map((entry) => entry.rawName)).size,
    470,
    "unique visual sources",
  );

  let placementCount = 0;
  for (const descriptor of visualIndex.descriptors) {
    assert.equal(descriptor.webUsable, true, `${descriptor.cardId}/${descriptor.rawName}`);
    assert.ok(
      descriptor.attachmentClosureStatus == null
        || descriptor.attachmentClosureStatus === "passed",
      `${descriptor.cardId}/${descriptor.rawName}: attachment closure`,
    );
    const capturedOccurrences = descriptor.capturedVisibleOccurrences == null
      ? descriptor.placements.length
      : Number(descriptor.capturedVisibleOccurrences);
    assert.ok(
      capturedOccurrences >= Number(descriptor.requiredOccurrences),
      `${descriptor.cardId}/${descriptor.rawName}: captured occurrence closure`,
    );
    assert.ok(
      descriptor.placements.length >= Number(descriptor.requiredOccurrences),
      `${descriptor.cardId}/${descriptor.rawName}: placement closure`,
    );
    assert.match(descriptor.visualRecipeSha256, /^[0-9a-f]{64}$/i);
    assert.equal(
      new Set(descriptor.placements.map((placement) => placement.stableOccurrenceId)).size,
      descriptor.placements.length,
      `${descriptor.cardId}/${descriptor.rawName}: stable occurrence uniqueness`,
    );
    for (const placement of descriptor.placements) {
      assert.match(placement.assetUrl, /^\/assets\/runtime-probe\/visuals\//);
      assert.match(placement.stableOccurrenceId, /^occurrence-[0-9a-f]{64}$/);
    }
    placementCount += descriptor.placements.length;
  }
  assertInventorySnapshot(assert, placementCount, 3894, "visual placements");

  assert.match(viewerSource, /runtime-analysis-visual-occurrences/);
  assert.match(viewerSource, /analysisOccurrence\.userData\.analysisVisualOnly = true/);
  assert.match(viewerSource, /analysisVisualGroup\.add\(analysisOccurrence\)/);
  assert.match(viewerSource, /analysisVisualGroup\.visible = mode !== "exterior" && Boolean\(hitGroup\)/);
  assert.match(viewerSource, /analysisVisualOccurrenceCount/);
});

test("thin decoration and glass surfaces use the fleet-wide stable analysis overlay policy", async () => {
  const visualIndex = await readJson("app/runtime-probe-visual-index.json");
  const stablePlacements = visualIndex.descriptors.flatMap((descriptor) =>
    descriptor.placements
      .filter(isStableAnalysisVisualSurfacePlacement)
      .map((placement) => ({
        cardId: descriptor.cardId,
        rawName: descriptor.rawName,
        placement,
      })),
  );

  assertInventorySnapshot(assert, stablePlacements.length, 468, "stable analysis surfaces");
  for (const rawName of [
    "BP_LAV2_Coyote",
    "BP_LAV2_Coyote_Woodland",
    "BP_LAV2_Coyote_CRF",
  ]) {
    assert.ok(
      stablePlacements.some(({ rawName: candidate, placement }) =>
        candidate === rawName && placement.name === "HullDecoration"
      ),
      `${rawName}: HullDecoration stable surface`,
    );
  }
  assert.ok(
    stablePlacements.some(({ rawName, placement }) =>
      rawName === "BP_BRDM-2_MIL" && placement.name === "HullDecoration"
    ),
    "BRDM-2 HullDecoration stable surface",
  );
  assert.ok(
    stablePlacements.some(({ rawName, placement }) =>
      rawName === "BP_BRDM-2_MIL" && placement.name === "Glass"
    ),
    "BRDM-2 Glass stable surface",
  );
  assert.equal(
    isStableAnalysisVisualSurfacePlacement({
      name: "Vehicle Mesh",
      sourceMeshPath: "/Game/Vehicles/Coyote/Meshes/Coyote.Coyote",
    }),
    false,
    "the primary hull must retain ordinary depth-tested silhouette rendering",
  );
  for (const rawName of ["BP_M60T", "BP_M60T_Desert"]) {
    assert.ok(
      stablePlacements.some(({ rawName: candidate, placement }) =>
        candidate === rawName
        && placement.name === "Decoration"
        && /SM_M60T_Turret_Deco/i.test(placement.sourceMeshPath)
      ),
      `${rawName}: M60T turret decoration stable surface`,
    );
  }
  const wpmcM60 = visualIndex.descriptors.find(
    ({ cardId, rawName }) => cardId === "wpmc--m60t--mbt" && rawName === "BP_M60T_WPMC",
  );
  assert.ok(wpmcM60, "WPMC M60T visual descriptor");
  assert.equal(
    wpmcM60.placements.some(({ name }) => name === "Decoration"),
    false,
    "WPMC source recipe does not claim a decoration occurrence that was not captured",
  );
});

test("reported T-72A and BMP-1 loose-part silhouettes are present in accepted recipes", async () => {
  const visualIndex = await readJson("app/runtime-probe-visual-index.json");
  const descriptorFor = (rawName) => {
    const matches = visualIndex.descriptors.filter((entry) => entry.rawName === rawName);
    assert.equal(matches.length, 1, `${rawName}: exact visual descriptor`);
    return matches[0];
  };

  const t72 = descriptorFor("BP_T72A_IMF");
  assert.ok(t72.placements.some((placement) => placement.name === "NSV_Turret"));
  assert.ok(t72.placements.some((placement) => placement.name === "WeaponMesh3P"));

  const bmp1 = descriptorFor("BP_BMP1_MIL");
  assert.ok(
    bmp1.placements.some((placement) =>
      placement.sourceMeshPath.includes("bmp1_commander_hatch"),
    ),
  );
  assert.ok(
    bmp1.placements.some((placement) => placement.sourceMeshPath.includes("bmp1_gun")),
  );
  assert.ok(
    bmp1.placements.some((placement) => placement.sourceMeshPath.includes("AT3_Rocket")),
  );
});

test("stable analysis evidence is generic and keeps structural actor meshes ordinary", () => {
  const placements = [
    {
      stableOccurrenceId: "hull",
      actor: "BP_Test_C_0",
      name: "Vehicle Mesh",
      sourceMeshPath: "/Game/Test/Hull",
      geometryScore: 100,
      materialRequiresStableSurface: false,
    },
    {
      stableOccurrenceId: "opaque-accessory",
      actor: "BP_Test_C_0",
      name: "StaticMesh",
      sourceMeshPath: "/Game/Test/Accessory",
      geometryScore: 2,
      materialRequiresStableSurface: false,
    },
    {
      stableOccurrenceId: "masked-sheet",
      actor: "BP_Test_C_0",
      name: "StaticMesh",
      sourceMeshPath: "/Game/Test/Sheet",
      geometryScore: 20,
      materialRequiresStableSurface: true,
    },
    {
      stableOccurrenceId: "child-weapon",
      actor: "BP_Test_Weapon_C_0",
      name: "WeaponMesh3P",
      sourceMeshPath: "/Game/Test/Weapon",
      geometryScore: 10,
      materialRequiresStableSurface: false,
    },
  ];
  const reasons = analysisVisualStableSurfaceReasons(
    placements,
    ["/Game/Test/Map.Map:PersistentLevel.BP_Test_C_0.SQArmorMesh"],
  );
  assert.equal(reasons.has("hull"), false);
  assert.deepEqual(reasons.get("opaque-accessory"), ["subordinate-geometry"]);
  assert.deepEqual(
    reasons.get("masked-sheet"),
    ["source-material", "subordinate-geometry"],
  );
  assert.deepEqual(reasons.get("child-weapon"), ["actor-absent-from-hit"]);
});

test("analysis surfaces use a minimal raster depth bias without moving vertices", () => {
  assert.ok(ANALYSIS_VISUAL_DEPTH_BIAS_FACTOR > 0);
  assert.ok(ANALYSIS_VISUAL_DEPTH_BIAS_FACTOR <= 1);
  assert.ok(ANALYSIS_VISUAL_DEPTH_BIAS_UNITS > 0);
  assert.ok(ANALYSIS_VISUAL_DEPTH_BIAS_UNITS <= 1);
});

test("T64BM2 retains the intersecting exterior components used for orbit validation", async () => {
  const visualIndex = await readJson("app/runtime-probe-visual-index.json");
  const descriptor = visualIndex.descriptors.find(
    ({ cardId, rawName }) =>
      cardId === "afu--t-64bm2--mbt" && rawName === "BP_T64BM2_Cage",
  );
  assert.ok(descriptor);
  assertInventorySnapshot(assert, descriptor.placements.length, 10, "T64BM2 placements");
  assert.ok(descriptor.placements.some(({ name }) => name === "StaticCage"));
  assert.ok(descriptor.placements.some(({ name }) => name === "Hull_Decoration"));
  assert.ok(descriptor.placements.some(({ name }) => name === "TurretStatic"));
});

test("representative visual assets remain readable during development", async (context) => {
  const source = await visualAssetSource();
  if (!source) {
    context.skip("no sealed or raw visual asset closure is present");
    return;
  }
  const visualIndex = source.index;
  const representativeUrls = [
    ...new Set(
      [
        visualIndex.descriptors[0],
        visualIndex.descriptors[Math.floor(visualIndex.descriptors.length / 2)],
        visualIndex.descriptors.at(-1),
      ].flatMap((descriptor) =>
        (descriptor?.placements ?? []).slice(0, 1).map(({ assetUrl }) => assetUrl),
      ),
    ),
  ];
  assert.ok(representativeUrls.length > 0);
  for (const assetUrl of representativeUrls) {
    const gltf = JSON.parse(
      await readFile(path.join(source.publicRoot, assetUrl.replace(/^\//u, "")), "utf8"),
    );
    assert.ok(Array.isArray(gltf.scenes), `${assetUrl}: glTF scenes`);
    assert.ok(Array.isArray(gltf.nodes), `${assetUrl}: glTF nodes`);
  }
});

test("all masked and blended fleet glTF assets are readable material evidence", {
  skip: STRICT_VALIDATION
    ? false
    : "full glTF fleet scan is reserved for strict/release validation",
}, async () => {
  const source = await visualAssetSource();
  assert.ok(source, "strict/release validation requires a sealed or raw visual asset closure");
  const visualIndex = source.index;
  const referencesByUrl = new Map();
  for (const descriptor of visualIndex.descriptors) {
    for (const placement of descriptor.placements) {
      const references = referencesByUrl.get(placement.assetUrl) ?? [];
      references.push({ descriptor, placement });
      referencesByUrl.set(placement.assetUrl, references);
    }
  }

  let maskAssets = 0;
  let blendAssets = 0;
  const affectedBindings = new Set();
  for (const [assetUrl, references] of referencesByUrl) {
    const gltf = JSON.parse(
      await readFile(path.join(source.publicRoot, assetUrl.replace(/^\//u, "")), "utf8"),
    );
    const modes = new Set((gltf.materials ?? []).map(({ alphaMode = "OPAQUE" }) => alphaMode));
    if (modes.has("MASK")) maskAssets += 1;
    if (modes.has("BLEND")) blendAssets += 1;
    if (modes.has("MASK") || modes.has("BLEND")) {
      references.forEach(({ descriptor }) => {
        affectedBindings.add(`${descriptor.cardId}\0${descriptor.rawName}`);
      });
    }
  }

  const expected = source.kind === "sealed"
    ? {
        assets: 1813,
        maskAssets: 342,
        blendAssets: 369,
      }
    : {
        assets: 2558,
        maskAssets: 465,
        blendAssets: 414,
      };
  assertInventorySnapshot(assert, referencesByUrl.size, expected.assets, "visual assets");
  assertInventorySnapshot(assert, maskAssets, expected.maskAssets, "masked assets");
  assertInventorySnapshot(assert, blendAssets, expected.blendAssets, "blended assets");
  assertInventorySnapshot(assert, affectedBindings.size, 552, "alpha-affected bindings");
});
