import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runtimeRenderQualityProfile } from "../../lib/runtime-render-quality.ts";

const viewerSource = await readFile(
  new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
  "utf8",
);
const globalStyles = await readFile(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

test("runtime render quality lowers fill-rate cost on integrated and constrained devices", () => {
  assert.deepEqual(
    runtimeRenderQualityProfile({
      devicePixelRatio: 1.5,
      rendererName: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)",
      deviceMemoryGb: 8,
      hardwareConcurrency: 16,
    }),
    {
      tier: "compatibility",
      reason: "integrated-or-mobile-gpu",
      pixelRatio: 1,
      assetLoadConcurrency: 2,
      textureAnisotropy: 1,
      textureMipmaps: false,
    },
  );
  assert.deepEqual(
    runtimeRenderQualityProfile({
      devicePixelRatio: 2,
      rendererName: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)",
      deviceMemoryGb: 16,
      hardwareConcurrency: 12,
    }),
    {
      tier: "compatibility",
      reason: "integrated-or-mobile-gpu",
      pixelRatio: 1,
      assetLoadConcurrency: 2,
      textureAnisotropy: 1,
      textureMipmaps: false,
    },
  );
  assert.deepEqual(
    runtimeRenderQualityProfile({
      devicePixelRatio: 2,
      rendererName: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER)",
      deviceMemoryGb: 32,
      hardwareConcurrency: 24,
    }),
    {
      tier: "balanced",
      reason: "default",
      pixelRatio: 1.25,
      assetLoadConcurrency: 4,
      textureAnisotropy: 4,
      textureMipmaps: true,
    },
  );
  assert.deepEqual(
    runtimeRenderQualityProfile({
      devicePixelRatio: 1,
      rendererName: null,
      deviceMemoryGb: null,
      hardwareConcurrency: null,
    }),
    {
      tier: "balanced",
      reason: "default",
      pixelRatio: 1,
      assetLoadConcurrency: 4,
      textureAnisotropy: 4,
      textureMipmaps: true,
    },
  );
  assert.deepEqual(
    runtimeRenderQualityProfile(
      {
        devicePixelRatio: 2,
        rendererName: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER)",
        deviceMemoryGb: 32,
        hardwareConcurrency: 24,
      },
      "compatibility",
    ),
    {
      tier: "compatibility",
      reason: "forced",
      pixelRatio: 1,
      assetLoadConcurrency: 2,
      textureAnisotropy: 1,
      textureMipmaps: false,
    },
  );

  for (const rendererName of [
    "ANGLE (AMD, AMD Radeon(TM) 780M Graphics Direct3D11)",
    "ANGLE (AMD, AMD Radeon 890M Graphics Direct3D11)",
    "ANGLE (Intel, Intel(R) Arc(TM) Graphics Direct3D11)",
  ]) {
    const profile = runtimeRenderQualityProfile({
      devicePixelRatio: 2,
      rendererName,
      deviceMemoryGb: 32,
      hardwareConcurrency: 24,
    });
    assert.equal(profile.tier, "compatibility", rendererName);
    assert.equal(profile.reason, "integrated-or-mobile-gpu", rendererName);
  }

  for (const rendererName of [
    "ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11)",
    "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)",
  ]) {
    const profile = runtimeRenderQualityProfile({
      devicePixelRatio: 2,
      rendererName,
      deviceMemoryGb: 32,
      hardwareConcurrency: 24,
    });
    assert.equal(profile.tier, "balanced", rendererName);
    assert.equal(profile.reason, "default", rendererName);
  }

  assert.equal(
    runtimeRenderQualityProfile({
      devicePixelRatio: 2,
      rendererName: null,
      deviceMemoryGb: 4,
      hardwareConcurrency: 16,
    }).reason,
    "low-memory",
  );
  assert.equal(
    runtimeRenderQualityProfile({
      devicePixelRatio: 2,
      rendererName: null,
      deviceMemoryGb: 16,
      hardwareConcurrency: 4,
    }).reason,
    "low-core-count",
  );
});

test("viewer bounds parallel model decoding and lowers texture pressure on iGPUs", () => {
  assert.match(viewerSource, /mapWithConcurrency\(/u);
  assert.match(viewerSource, /renderQuality\.assetLoadConcurrency/u);
  assert.match(viewerSource, /texture\.generateMipmaps = renderQuality\.textureMipmaps/u);
  assert.match(viewerSource, /texture\.anisotropy = Math\.min\(\s*renderQuality\.textureAnisotropy/su);
  assert.match(viewerSource, /viewerRoot\.dataset\.renderQuality = renderQuality\.tier/u);
  assert.match(viewerSource, /host\.dataset\.renderQualityReason = renderQuality\.reason/u);
  assert.match(
    globalStyles,
    /runtime-vehicle-viewer\[data-render-quality="compatibility"\][\s\S]*?backdrop-filter: none !important/u,
  );
});

test("default exterior mode skips the duplicate analysis GLTF pass", () => {
  const modeActivation = viewerSource.slice(
    viewerSource.indexOf("activateAssetModeRef.current = (nextMode) =>"),
    viewerSource.indexOf("activateAssetModeRef.current(modeRef.current)"),
  );
  assert.match(
    modeActivation,
    /if \(nextMode === "exterior"\) \{\s*loadExteriorAssets\(\);\s*return;/su,
  );
  assert.match(modeActivation, /startAnalysisVisualAssets\?\.\(\)/u);
  assert.doesNotMatch(modeActivation, /waiting-for-placeholder/u);
  assert.match(viewerSource, /const exteriorSources = new Map<string, THREE\.Object3D>\(\)/u);
  assert.match(viewerSource, /const exteriorSource = exteriorSources\.get\(url\)/u);
});

test("viewer camera fit uses a real-silhouette outline while deferring the detailed soldier", () => {
  assert.match(viewerSource, /function createReferenceSoldierOutlineProxy\(/u);
  assert.match(viewerSource, /reference-soldier-outline\.webp/u);
  assert.match(viewerSource, /new THREE\.Sprite\(/u);
  assert.doesNotMatch(viewerSource, /new THREE\.(?:Sphere|Box|Cylinder)Geometry\([^)]*\)[\s\S]{0,160}reference-soldier-proxy/u);
  assert.match(viewerSource, /host\.dataset\.referenceSoldierState = "outline"/u);
  assert.match(viewerSource, /startReferenceSoldierAsset\?\.\(\)/u);
  assert.match(viewerSource, /import\("\.\/runtime-reference-soldier"\)/u);
  assert.doesNotMatch(viewerSource, /await loadWikiDataset\(/u);
  assert.doesNotMatch(viewerSource, /infantryPostureRuntime/u);
  assert.doesNotMatch(viewerSource, /if \(!referenceSoldierSettled\)/u);
  assert.match(
    viewerSource,
    /if \(renderQuality\.tier === "compatibility"\) \{\s*host\.dataset\.referenceSoldierState = "outline-compatibility";\s*return;/u,
  );
});

test("orbit redraws rely on Three.js dirty matrices instead of forcing the whole scene", () => {
  const renderLoop = viewerSource.slice(
    viewerSource.indexOf("const render = () =>"),
    viewerSource.indexOf("renderRef.current = render"),
  );
  assert.match(renderLoop, /renderer\.render\(scene, camera\)/u);
  assert.doesNotMatch(renderLoop, /scene\.updateMatrixWorld\(true\)/u);
});

test("orbit redraws coalesce noisy control events to one render per animation frame", () => {
  const renderLoop = viewerSource.slice(
    viewerSource.indexOf("const render = () =>"),
    viewerSource.indexOf("let rendererWidth = 0"),
  );
  assert.match(renderLoop, /const requestRender = \(\) =>/u);
  assert.match(renderLoop, /requestAnimationFrame\(\(\) =>/u);
  assert.match(renderLoop, /const onControlsChange = \(\) => \{\s*requestRender\(\);/su);
  assert.doesNotMatch(renderLoop, /const onControlsChange = \(\) => \{\s*render\(\);/su);
  const controlsChange = renderLoop.slice(
    renderLoop.indexOf("const onControlsChange = () =>"),
    renderLoop.indexOf("const onControlsStart = () =>"),
  );
  assert.doesNotMatch(controlsChange, /scheduleProtectionMap/u);
  assert.match(renderLoop, /const onControlsStart = \(\) =>[\s\S]*cancelProtectionMap\(true, false\)/u);
  assert.match(renderLoop, /const onControlsEnd = \(\) =>[\s\S]*scheduleProtectionMap\(\{ invalidate: true \}\)/u);
});

test("shot animation and orbit share the same per-frame render scheduler", () => {
  const animationFrame = viewerSource.slice(
    viewerSource.indexOf("const animateShot = (timestamp: number) =>"),
    viewerSource.indexOf("shotAnimationFrameRef.current = requestAnimationFrame(animateShot);"),
  );
  assert.match(viewerSource, /requestRenderRef\.current = requestRender/u);
  assert.match(animationFrame, /requestRenderRef\.current\?\.\(\)/u);
  assert.doesNotMatch(animationFrame, /renderRef\.current\?\.\(\)/u);
});

test("distance dragging resolves only rendered weapon metrics", () => {
  const optionProjection = viewerSource.slice(
    viewerSource.indexOf("const runtimeWeaponOptions = useMemo"),
    viewerSource.indexOf("const quickDistanceTicks"),
  );
  assert.match(optionProjection, /effectsAtDistance/u);
  assert.match(optionProjection, /\[attackLibrary\]/u);
  assert.doesNotMatch(optionProjection, /\[attackLibrary, targetDistanceM\]/u);
  assert.match(viewerSource, /const distancePreferenceRef = useRef\(DEFAULT_TARGET_DISTANCE_M\)/u);
  assert.match(viewerSource, /distancePreferenceRef\.current = nextDistance/u);
  assert.match(viewerSource, /const requestedDistance = distancePreferenceRef\.current/u);
  assert.doesNotMatch(viewerSource, /useState\(\s*navigationState\?\.distance/u);
});
