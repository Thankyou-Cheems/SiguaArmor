import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import {
  RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  isRuntimeVisualTextureUrl,
  runtimeAnalysisVisualUrl,
  runtimeViewerPresentation,
} from "../../lib/runtime-visual-lazy-load.ts";
import {
  RUNTIME_PROTECTION_MAP_FRAME_BUDGET_MS,
  RUNTIME_PROTECTION_MAP_MAX_BATCH_RAYS,
  RUNTIME_PROTECTION_MAP_MAX_BATCH_VISITS,
  RUNTIME_PROTECTION_MAP_MIN_BATCH_RAYS,
  runtimeProtectionMapFrameHasBudget,
} from "../../lib/runtime-protection-map.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

test("analysis visual URL routing blocks real appearance texture requests", () => {
  for (const url of [
    "/assets/runtime-probe/blob/vehicle-albedo.webp",
    "/assets/runtime-probe/blob/vehicle-normal.png?immutable=1",
    "/assets/runtime-probe/blob/vehicle-packed.JPG#texture",
    "/assets/runtime-probe/blob/vehicle.ktx2",
  ]) {
    assert.equal(isRuntimeVisualTextureUrl(url), true, url);
    assert.equal(runtimeAnalysisVisualUrl(url), RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL);
  }
  for (const url of [
    "/assets/runtime-probe/models/vehicle.gltf",
    "/assets/runtime-probe/blob/vehicle.bin",
    RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  ]) {
    assert.equal(isRuntimeVisualTextureUrl(url), false, url);
    assert.equal(runtimeAnalysisVisualUrl(url), url);
  }
});

test("analysis visual placeholder is a browser-decodable opaque 1x1 PNG", () => {
  const prefix = "data:image/png;base64,";
  assert.ok(RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL.startsWith(prefix));
  const png = Buffer.from(
    RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL.slice(prefix.length),
    "base64",
  );
  assert.deepEqual(
    png.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );

  const imageDataChunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      assert.equal(data.readUInt32BE(0), 1);
      assert.equal(data.readUInt32BE(4), 1);
      assert.equal(data[9], 6, "placeholder must retain opaque RGBA material metadata");
    } else if (type === "IDAT") {
      imageDataChunks.push(data);
    }
    offset += length + 12;
  }

  assert.equal(inflateSync(Buffer.concat(imageDataChunks)).length, 5);
});

test("viewer loading presentation hides an unfitted camera and then yields to the exterior silhouette", () => {
  const presentation = (overrides = {}) => runtimeViewerPresentation({
    mode: "exterior",
    viewerState: "loading",
    initialCameraFitReady: false,
    exteriorPlaceholderReady: false,
    ...overrides,
  });

  assert.equal(presentation(), "loading");
  assert.equal(
    presentation({ viewerState: "ready" }),
    "loading",
    "a completed transfer must not expose the default camera before its first fit",
  );
  assert.equal(
    presentation({ initialCameraFitReady: true }),
    "loading",
    "the loading screen remains until a texture-free exterior silhouette is ready",
  );
  assert.equal(
    presentation({
      initialCameraFitReady: true,
      exteriorPlaceholderReady: true,
    }),
    "exterior-placeholder",
  );
  assert.equal(
    presentation({
      viewerState: "ready",
      initialCameraFitReady: true,
    }),
    "scene",
  );
  assert.equal(presentation({ viewerState: "error" }), "error");
});

test("M1A2 release evidence keeps its expensive WebP closure outside armor startup", async () => {
  const [visualIndex, hitIndex, releaseManifest] = await Promise.all([
    readJson("app/runtime-probe-visual-release-index.json"),
    readJson("app/runtime-probe-hit-release-index.json"),
    readJson("generated/runtime-visual-release-manifest.json"),
  ]);
  const visual = visualIndex.descriptors.find(
    ({ cardId, rawName }) => cardId === "usa--m1a2--mbt" && rawName === "BP_M1A2",
  );
  const hit = hitIndex.descriptors.find(
    ({ cardId, rawName }) => cardId === "usa--m1a2--mbt" && rawName === "BP_M1A2",
  );
  assert.ok(visual, "M1A2 visual descriptor");
  assert.ok(hit, "M1A2 hit descriptor");

  const releaseByModelUrl = new Map(
    Object.values(releaseManifest.entries).map((entry) => [entry.modelUrl, entry]),
  );
  const modelUrls = [...new Set(visual.placements.map(({ assetUrl }) => assetUrl))];
  const resourceUrls = new Set();
  let modelBytes = 0;
  let textureBytes = 0;
  let geometryBytes = 0;
  for (const modelUrl of modelUrls) {
    const entry = releaseByModelUrl.get(modelUrl);
    assert.ok(entry, `release entry for ${modelUrl}`);
    modelBytes += entry.modelBytes;
    for (const resource of entry.resources) {
      if (resourceUrls.has(resource.url)) continue;
      resourceUrls.add(resource.url);
      if (/^(?:avif|jpe?g|ktx2?|png|webp)$/iu.test(resource.extension)) {
        textureBytes += resource.bytes;
      } else {
        geometryBytes += resource.bytes;
      }
    }
  }
  const visualBytes = modelBytes + textureBytes + geometryBytes;
  const hitBytes = hit.recordBytes + hit.geometryBytes + hit.bvhBytes;
  assert.equal(visualBytes, visual.totalBytes);
  assert.ok(visualBytes > hitBytes * 40, "appearance closure must not block split hit runtime");
  assert.ok(textureBytes > visualBytes * 0.9, "appearance textures dominate M1A2 transfer bytes");
  assert.ok(modelBytes + geometryBytes < textureBytes / 10);
});

test("viewer makes hit runtime interactive before supplemental geometry and gates full textures on exterior", async () => {
  const source = await readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8");
  assert.match(
    source,
    /analysisLoadingManager\.setURLModifier\(runtimeAnalysisVisualUrl\)/u,
  );
  assert.match(
    source,
    /const analysisVisualPromise = hitPromise\.then\(async \(parsed\) =>/u,
  );
  assert.match(
    source,
    /if \(nextMode === "exterior"\) \{\s+if \(analysisVisualReady && fittedSource !== null\) \{\s+loadExteriorAssets\(\);/u,
  );
  assert.match(source, /const exteriorLoader = new GLTFLoader\(\);/u);
  assert.match(source, /const attachExteriorSource = \(url: string, source: THREE\.Object3D\) =>/u);
  assert.match(source, /attachExteriorSource\(url, gltf\.scene\);/u);
  assert.match(source, /visualGroup\.add\(occurrence\);/u);
  assert.match(source, /host\.dataset\.exteriorLoadedAssetCount = String\(exteriorLoaded\);/u);
  assert.match(source, /host\.dataset\.exteriorLoadedOccurrenceCount = String\(visualGroup\.children\.length\);/u);
  assert.match(source, /const showSceneLoadingOverlay = viewerPresentation === "loading"/u);
  assert.match(source, /data-viewer-presentation=\{viewerPresentation\}/u);
  assert.match(source, /setInitialCameraFitReady\(true\)/u);
  assert.match(
    source,
    /exteriorPlaceholder \? "#ffffff" : "#89949a"/u,
    "texture-free exterior geometry uses a translucent white presentation",
  );
  assert.match(
    source,
    /!exteriorPlaceholderActive \|\| !exteriorOccurrences\.has\(stableOccurrenceId\)/u,
    "completed textured occurrences replace their matching white placeholders",
  );
  assert.match(
    source,
    /setExteriorPlaceholderReady\(true\);[\s\S]{0,240}if \(modeRef\.current === "exterior"\) \{[\s\S]{0,120}if \(fittedSource !== null\) \{[\s\S]{0,80}loadExteriorAssets\(\);/u,
    "full appearance textures wait for both the texture-free silhouette and initial camera fit",
  );
  assert.doesNotMatch(source, /className="viewer-texture-streaming"/u);
  assert.match(source, /onExteriorStreamingChange/u);
  assert.doesNotMatch(source, /const exteriorSources = new Map/u);
  assert.doesNotMatch(source, /Promise\.all\(\[visualPromise,\s*hitPromise\]\)/u);
  assert.match(source, /visualTexturePolicy = "exterior-tab-only"/u);
});

test("protection-map work stays client-side and adapts each frame to a time budget", async () => {
  assert.equal(runtimeProtectionMapFrameHasBudget({
    sampledRays: 0,
    visitedCells: 0,
    elapsedMs: RUNTIME_PROTECTION_MAP_FRAME_BUDGET_MS * 2,
  }), true, "a small minimum batch guarantees progress");
  assert.equal(runtimeProtectionMapFrameHasBudget({
    sampledRays: RUNTIME_PROTECTION_MAP_MIN_BATCH_RAYS,
    visitedCells: RUNTIME_PROTECTION_MAP_MIN_BATCH_RAYS,
    elapsedMs: RUNTIME_PROTECTION_MAP_FRAME_BUDGET_MS - 0.1,
  }), true);
  assert.equal(runtimeProtectionMapFrameHasBudget({
    sampledRays: RUNTIME_PROTECTION_MAP_MIN_BATCH_RAYS,
    visitedCells: RUNTIME_PROTECTION_MAP_MIN_BATCH_RAYS,
    elapsedMs: RUNTIME_PROTECTION_MAP_FRAME_BUDGET_MS,
  }), false, "the frame yields as soon as its time budget is spent");
  assert.equal(runtimeProtectionMapFrameHasBudget({
    sampledRays: RUNTIME_PROTECTION_MAP_MAX_BATCH_RAYS,
    visitedCells: RUNTIME_PROTECTION_MAP_MAX_BATCH_RAYS,
    elapsedMs: 0,
  }), false);
  assert.equal(runtimeProtectionMapFrameHasBudget({
    sampledRays: 0,
    visitedCells: RUNTIME_PROTECTION_MAP_MAX_BATCH_VISITS,
    elapsedMs: 0,
  }), false, "seeded super-grid cells cannot cause an unbounded scan");

  const source = await readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8");
  assert.match(source, /protectionMapCompute = "client-frame-budget"/u);
  assert.match(source, /runtimeProtectionMapFrameHasBudget\(\{/u);
  assert.match(source, /RUNTIME_PROTECTION_MAP_UI_UPDATE_INTERVAL_MS/u);
  assert.match(source, /仅在当前浏览器分帧执行，不占用服务器算力/u);
});

test("spaced-armor animation stays disabled and never schedules extra frames", async () => {
  const source = await readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8");
  assert.match(source, /host\.dataset\.spacedArmorAnimation = "disabled"/u);
  assert.doesNotMatch(source, /setHitSceneThreeModelSpacedArmorAnimationTime\(/u);
  assert.doesNotMatch(source, /requestAnimationFrame\(animateSpacedArmor\)/u);
});

test("shot playback uses a bounded trace timeline and exact radial impact inputs", async () => {
  const source = await readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8");
  assert.match(source, /requestAnimationFrame\(animateShot\)/u);
  assert.match(source, /cancelAnimationFrame\(shotAnimationFrameRef\.current\)/u);
  assert.match(source, /prefers-reduced-motion: reduce/u);
  assert.match(source, /const radialLayer = result\.radial\.layers\[layerIndex\]/u);
  assert.match(
    source,
    /impactPoint\.clone\(\)\.addScaledVector\(\s*impactNormal,\s*radialLayer\.explosionOriginOffsetCm \/ 100/u,
  );
  assert.match(source, /result\.radial\.layerOrderResolved === true/u);
  assert.match(
    source,
    /shotExplosionIndicator =[\s\S]{0,180}radialVisualization\.geometry/u,
  );
  assert.match(
    source,
    /shotExplosionVisualClip =[\s\S]{0,180}radialVisualization\?\.visualClip/u,
  );
  assert.match(source, /shotExplosionSurfaceHemisphere/u);
  assert.match(source, /shotExplosionLegendPlacement/u);
  assert.match(source, /shotExplosionExpansionDurationMs/u);
  assert.match(source, /shotExplosionFadeDurationMs/u);
  assert.match(source, /shotExplosionRadiusBasis =[\s\S]{0,180}"outer-radius-true-scale-surface-and-ring"/u);
  assert.match(source, /shotExplosionRadiusPresentation/u);
  assert.match(source, /shotExplosionSurfaceLifecycle = radialVisualization[\s\S]{0,120}"true-scale-expand-fade-to-ring"/u);
  assert.match(
    source,
    /shotExplosionExactRadiusReference[\s\S]{0,180}exactRadiusReference/u,
  );
  assert.match(source, /normal: impactNormal/u);
  assert.match(
    source,
    /new THREE\.SphereGeometry\(1, 48, 32\)/u,
  );
  assert.match(source, /visual\.root\.quaternion\.identity\(\)/u);
  assert.match(source, /editor-native-shot-explosion-pressure-surface/u);
  assert.match(source, /createShotExplosionPressureSurfaceMaterial/u);
  assert.match(source, /farHemisphere <= 0\.001/u);
  assert.match(source, /uCameraDirectionLocal/u);
  assert.match(source, /ringCameraDirection\.negate\(\)\.applyAxisAngle/u);
  assert.match(source, /damageTypeIcon\.position[\s\S]{0,100}multiplyScalar\(radiusM\)/u);
  assert.match(source, /damageTypeIcon\.position\.y = 0/u);
  assert.match(source, /camera-opposite-staggered-on-exact-ring/u);
  assert.match(source, /exact-outer-ring/u);
  assert.match(source, /cameraWorldPosition\.distanceTo\(iconWorldPosition\) \* 0\.036/u);
  assert.doesNotMatch(source, /legendRadiusM|camera-readable-capped/u);
  assert.match(source, /radialDamageLegendPlacement\(layerIndex\)/u);
  assert.doesNotMatch(source, /wireframe:\s*true/u);
  assert.doesNotMatch(source, /editor-native-shot-explosion-outer-sphere/u);
  assert.doesNotMatch(source, /editor-native-shot-explosion-full-damage-sphere/u);
  assert.match(source, /editor-native-shot-explosion-origin-tether/u);
  assert.match(source, /editor-native-shot-explosion-origin-label/u);
  assert.match(source, /editor-native-shot-explosion-damage-type-icon/u);
  assert.match(source, /paintVehicleDamageTypeIconCanvas\(context, kind, accent\)/u);
  assert.match(source, /vehicleDamageTypeIconShortLabel\(kind\)/u);
  assert.match(source, /vehicleDamageTypeIconColorNumber\(kind \?\? "generic"\)/u);
  assert.match(source, /"--explosion-type-color":[\s\S]{0,120}vehicleDamageTypeIconColor\(kind\)/u);
  assert.match(source, /hitExplosionColors[\s\S]{0,220}\.map\(vehicleDamageTypeIconColor\)/u);
  assert.match(source, /shotExplosionIconSource[\s\S]{0,120}"damage-type-legend-svg-paths"/u);
  assert.match(source, /damageTypeIconKind,\s*outerRadiusM/u);
  assert.match(source, /visual\.outerRadiusM = Math\.max\(0, outerRadiusM\)/u);
  assert.match(
    source,
    /visual\.pressureSurface\.scale\.setScalar\(\s*Math\.max\(0\.001, visual\.outerRadiusM\)/u,
  );
  assert.match(source, /visual\.outerRadiusM \* expansion/u);
  assert.match(source, /surfaceVisibility \* \(0\.105/u);
  assert.match(source, /ringReveal \* 0\.72/u);
  assert.match(source, /settledComponentIndices/u);
  assert.match(source, /settledShotExplosionDamageHighlight/u);
  assert.match(source, /SHOT_EXPLOSION_SETTLED_HIGHLIGHT_STRENGTH/u);
  assert.match(
    source,
    /localElapsedMs >= SHOT_EXPLOSION_DURATION_MS[\s\S]{0,180}SHOT_EXPLOSION_SETTLED_HIGHLIGHT_STRENGTH/u,
  );
  assert.match(source, /applySettledShotDamageHighlight\(record\.shotId\)/u);
  assert.match(source, /shotExplosionHighlightState/u);
  assert.match(source, /setHitSceneThreeModelDamageHighlight/u);
  assert.match(source, /clearHitSceneThreeModelDamageHighlight/u);
  assert.match(source, /if \(!visual\.configured \|\| !selected\)/u);
  assert.match(source, /hitExplosionOuterRadiiM/u);
  assert.match(source, /hitExplosionInnerRadiiM/u);
  assert.match(source, /per-component-native-overlap-visibility/u);
  assert.match(source, /shotExplosionOriginComponent/u);
  assert.doesNotMatch(source, /surface-normal-pressure-hemisphere|surface-normal-outward/u);
  assert.doesNotMatch(source, /new THREE\.TorusGeometry\(/u);
  assert.match(source, /new THREE\.LineLoop\(/u);
  assert.match(
    source,
    /editor-native-shot-explosion-exact-radius-ring/u,
  );
  assert.doesNotMatch(source, /setAnimationLoop\(animateShot\)/u);
});

test("ground scale starts at the reference soldier and covers both vehicle axes", async () => {
  const source = await readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8");
  assert.match(
    source,
    /REFERENCE_SOLDIER_PRODUCTION_BASE_PATH = "\/squad"/u,
  );
  assert.match(
    source,
    /localPreview[\s\S]{0,220}REFERENCE_SOLDIER_PRODUCTION_BASE_PATH/u,
  );
  assert.match(
    source,
    /loadAsync\(referenceSoldierUrl\)/u,
  );
  assert.match(source, /origin\.name = "runtime-ground-scale-origin"/u);
  assert.match(
    source,
    /host\.dataset\.groundScaleOrigin = referenceSoldierBounds[\s\S]{0,120}"reference-soldier-feet"/u,
  );
  assert.match(
    source,
    /groundScaleOriginWorldX = referenceSoldierBounds[\s\S]{0,180}referenceSoldierBounds\.min\.x \+ referenceSoldierBounds\.max\.x/u,
  );
  assert.match(
    source,
    /groundScaleOriginWorldZ = referenceSoldierBounds[\s\S]{0,180}referenceSoldierBounds\.min\.z \+ referenceSoldierBounds\.max\.z/u,
  );
  assert.match(
    source,
    /host\.dataset\.groundScaleDirection =[\s\S]{0,80}"toward-vehicle-positive-x-positive-z"/u,
  );
  assert.match(
    source,
    /runtimeGroundReferenceClearanceM\([\s\S]{0,160}RUNTIME_GROUND_REFERENCE_MIN_CLEARANCE_M/u,
  );
  assert.match(
    source,
    /bounds\.min\.x[\s\S]{0,100}groundReferenceClearanceM[\s\S]{0,100}soldierSize\.x \/ 2/u,
  );
  assert.match(source, /host\.dataset\.groundScaleLayout = "two-axis"/u);
  assert.match(
    source,
    /host\.dataset\.groundScaleSpanBasis =[\s\S]{0,80}"reference-origin-to-opposite-vehicle-bounds"/u,
  );
  assert.match(source, /host\.dataset\.groundScaleDepthMode = "overlay"/u);
  assert.match(
    source,
    /depthTest: false,[\s\S]{0,260}baseline\.name = "runtime-ground-scale-baseline"/u,
  );
  assert.match(source, /RUNTIME_GROUND_SCALE_TICK_INTERVAL_M/u);
  assert.match(source, /widthAxis\.rotation\.y = -Math\.PI \/ 2/u);
});

test("exterior streaming waits for the complete vehicle and never frames a partial asset", async () => {
  const source = await readFile(path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"), "utf8");
  assert.doesNotMatch(
    source,
    /if \(fittedSource === null && visualGroup\.children\.length > 0\) \{\s+fitViewToGroup\(visualGroup, "exterior"\);/u,
  );
  const exteriorPromiseStart = source.indexOf("exteriorPromise = Promise.all");
  const completionStart = source.indexOf(".then(() => {", exteriorPromiseStart);
  const completionEnd = source.indexOf(".catch((error: unknown)", completionStart);
  assert.ok(exteriorPromiseStart >= 0 && completionStart >= 0 && completionEnd > completionStart);
  const completion = source.slice(completionStart, completionEnd);
  assert.match(completion, /host\.dataset\.exteriorAssetState = "ready";/u);
  assert.match(completion, /setViewerState\(\{ kind: "ready"/u);
  assert.match(
    completion,
    /fittedSource === null &&\s+hitSettled &&\s+visualGroup\.children\.length > 0/u,
  );
  assert.match(completion, /fitViewToGroup\(visualGroup, "exterior"\);/u);
  assert.match(completion, /lowerReferencePlaneToGroup\(visualGroup, "exterior"\);/u);
});
