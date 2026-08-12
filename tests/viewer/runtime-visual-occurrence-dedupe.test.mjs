import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { dedupeIdenticalVisualPlacements } from "../../lib/runtime-visual-occurrence-dedupe.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const IDENTITY = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function placement(stableOccurrenceId, assetUrl, matrix = IDENTITY) {
  return { stableOccurrenceId, assetUrl, matrix };
}

test("only exact render payload and matrix duplicates are suppressed", () => {
  const moved = [...IDENTITY];
  moved[12] = 2;
  const input = [
    placement("occurrence-a", "/a.gltf"),
    placement("occurrence-b", "/a.gltf"),
    placement("occurrence-c", "/a.gltf", moved),
    placement("occurrence-d", "/b.gltf"),
  ];
  const result = dedupeIdenticalVisualPlacements(input);
  assert.deepEqual(
    result.placements.map(({ stableOccurrenceId }) => stableOccurrenceId),
    ["occurrence-a", "occurrence-c", "occurrence-d"],
  );
  assert.deepEqual(
    result.suppressed.map(({ stableOccurrenceId }) => stableOccurrenceId),
    ["occurrence-b"],
  );
});

test("invalid matrices and duplicate occurrence identities fail closed", () => {
  assert.throws(
    () => dedupeIdenticalVisualPlacements([
      placement("occurrence-a", "/a.gltf", [1, 2, 3]),
    ]),
    /Invalid runtime visual matrix/,
  );
  assert.throws(
    () => dedupeIdenticalVisualPlacements([
      placement("occurrence-a", "/a.gltf"),
      placement("occurrence-a", "/b.gltf"),
    ]),
    /Duplicate runtime visual occurrence ID/,
  );
});

test("analysis silhouettes use a visual-shell depth pass and are not angle-culled", async () => {
  const source = await readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8");
  assert.match(
    source,
    /function createAnalysisVisualMaterial\([\s\S]{0,160}stableSurface = false,[\s\S]{0,160}\)[\s\S]*?side: THREE\.DoubleSide,[\s\S]*?depthTest: true,[\s\S]*?depthWrite: false/,
  );
  assert.match(
    source,
    /const analysisModel = cloneSkeleton\(source\);[\s\S]*?object\.frustumCulled = false;/,
  );
  assert.match(
    source,
    /const materialStableSurface =\s+sourceMeshRequiresStableAnalysisSurface\(object\);[\s\S]*?stableSurfacePlacement \|\|\s+materialStableSurface/,
  );
  assert.match(
    source,
    /reset\.onBeforeRender = \(activeRenderer\) => \{\s+activeRenderer\.clearDepth\(\);/,
  );
  assert.match(
    source,
    /object\.renderOrder = ANALYSIS_VISUAL_DEPTH_OCCLUDER_RENDER_ORDER/,
  );
  assert.match(
    source,
    /function analysisVisualDepthMaterial\(source: THREE\.Material\)[\s\S]*?depthTest: true,[\s\S]*?depthWrite: true,[\s\S]*?colorWrite: false/,
  );
  assert.match(
    source,
    /function analysisVisualDepthMaterial[\s\S]*?polygonOffset: true,[\s\S]*?polygonOffsetFactor: ANALYSIS_VISUAL_DEPTH_BIAS_FACTOR,[\s\S]*?polygonOffsetUnits: ANALYSIS_VISUAL_DEPTH_BIAS_UNITS/,
  );
  assert.match(
    source,
    /object\.renderOrder = stableSurface\s+\? ANALYSIS_VISUAL_STABLE_SURFACE_RENDER_ORDER\s+: ANALYSIS_VISUAL_SURFACE_RENDER_ORDER/,
  );
  assert.match(source, /analysisVisualDepthBiasMeshCount/);
  assert.match(source, /analysisVisualDepthBiasFactor/);
  assert.match(source, /analysisVisualDepthBiasUnits/);
  assert.doesNotMatch(source, /analysisVisualSurfaceLift|transformed \+=/);
  assert.match(source, /acceptedVisualOccurrenceCount/);
  assert.match(source, /suppressedExactVisualDuplicates/);
  assert.match(source, /analysisVisualDepthOccluderMeshCount/);
});

test("projected SiguaD marks use a faint alpha-preserving analysis material", async () => {
  const source = await readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8");
  assert.match(source, /function isSiguaDProjectedMark\(material: THREE\.Material\)/);
  assert.match(
    source,
    /if \(sourceMaterials\.some\(isSiguaDProjectedMark\)\) \{[\s\S]*?object\.renderOrder = ANALYSIS_VISUAL_STABLE_SURFACE_RENDER_ORDER \+ 1;[\s\S]*?createAnalysisProjectedMarkMaterial\(material\)[\s\S]*?return;/,
  );
  assert.match(
    source,
    /if \(sourceMaterials\.some\(isSiguaDProjectedMark\)\) \{[\s\S]*?object\.visible = false;[\s\S]*?return;/,
  );
});
