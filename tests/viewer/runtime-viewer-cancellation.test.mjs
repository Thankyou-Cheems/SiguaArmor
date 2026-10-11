import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeRuntimeScene, retainCachedRuntimeSceneResources } from "../../lib/runtime-scene-resources.ts";
import { createRuntimeSkeletalPoseController } from "../../lib/runtime-skeletal-pose.ts";
import { createViewerCleanup, VIEWER_CONTEXT_LOST } from "../fixtures/viewer-cleanup-source.mjs";

// Execute production queue/load callbacks with deferred GLTF transport. This
// keeps cancellation, scene work and error handling real without a GPU/network.
const text = await readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("RuntimeVehicleViewer.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name) {
  let found;
  function visit(node) {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(parsed) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(found, `production declaration: ${name}`);
  return ts.isFunctionDeclaration(found) ? found.getText(parsed) : `const ${found.getText(parsed)};`;
}
function execute(names, context) {
  const source = names.map(declaration).join("\n").replace(/import\(([^)]*)\)/gu, "loadModule($1)") + `\nObject.assign(globalThis, { ${names.join(", ")} });`;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const request = { promise, settled: false,
    resolve(value) { request.settled = true; resolve(value); },
    reject(error) { request.settled = true; reject(error); },
  };
  return request;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ count = 12, concurrency = 3 } = {}) {
  const urls = Array.from({ length: count }, (_, index) => `/model-${index}.glb`);
  const requests = new Map();
  const started = [];
  const sources = new Map();
  const disposed = [];
  const states = [];
  const fatalErrors = [];
  const calls = { scores: 0, projection: 0, clones: 0 };
  const loadAsync = (url) => {
    const request = deferred();
    started.push(url);
    requests.set(url, request);
    return request.promise;
  };
  const placements = urls.map((assetUrl, index) => ({
    assetUrl, stableOccurrenceId: String(index), actor: "fixture", name: String(index),
    matrix: new THREE.Matrix4().elements,
  }));
  const context = {
    THREE, VIEWER_CONTEXT_LOST, performance, cancelled: false, resources: createViewerCleanup(),
    hitLoadController: new AbortController(),
    discardRenderer: false, setFatalRendererError(error) { fatalErrors.push(error); },
    scene: new THREE.Scene(),
    urls, renderPlacements: placements, host: { dataset: {} },
    renderQuality: { assetLoadConcurrency: concurrency, tier: "balanced", textureAnisotropy: 1 },
    modeRef: { current: "armor" }, renderer: { capabilities: { getMaxAnisotropy: () => 1 } },
    analysisLoader: { loadAsync }, sourceAlphaLoader: { loadAsync }, sourceAlphaAssetUrls: new Set(),
    exteriorSources: new Map(), sourceGeometryScores: new Map(), analysisLoaded: 0,
    analysisVisualReady: false, exteriorReady: false, exteriorPromise: null, exteriorLoaded: 0,
    hitLoadSucceeded: false, hitSettled: true, fittedSource: null,
    runtimeTurretStationsRef: { current: [] }, preview: { generatedClass: null },
    analysisVisualDepthGroup: new THREE.Group(), analysisVisualGroup: new THREE.Group(), visualGroup: new THREE.Group(),
    analysisOccurrences: new Map(), exteriorOccurrences: new Map(), analysisMeshesByOccurrence: new Map(),
    analysisSurfaceEvidence: [], stableAnalysisSurfaceOccurrences: new Set(),
    stableAnalysisSurfaceMeshCount: 0, analysisVisualDepthOccluderMeshCount: 0,
    ANALYSIS_VISUAL_DEPTH_OCCLUDER_RENDER_ORDER: 1, ANALYSIS_VISUAL_STABLE_SURFACE_RENDER_ORDER: 2, ANALYSIS_VISUAL_SURFACE_RENDER_ORDER: 3,
    analysisVisualGeometryScore: () => { calls.scores++; return 1; },
    buildRuntimeVehicleTopDownProjection: () => { calls.projection++; return null; },
    cloneSkeleton: (source) => { calls.clones++; return clone(source); },
    registerSkeletalPose() {}, setViewerState(state) { states.push(state); }, setTurretTopDownProjection() {},
    applyTurretPose() {}, syncReferencePlane() {}, syncAnalysisVisualPresentation() {}, render() {}, fitViewToGroup() {},
    isSiguaDProjectedMark: () => false, sourceMeshRequiresStableAnalysisSurface: () => false,
    isStableAnalysisVisualSurfacePlacement: () => false,
    analysisVisualDepthMaterial: () => new THREE.MeshBasicMaterial(),
    replaceAnalysisVisualMaterial() {}, runtimeExteriorVisualAssetUrl: (placement) => placement.assetUrl,
    runtimeWikiAssetUrl: (url) => url, MeshoptDecoder: {},
    GLTFLoader: class { setMeshoptDecoder() {} loadAsync(url) { return loadAsync(url); } },
    dedupeRuntimeSceneTextures: () => ({ reused: 0, unique: 0 }),
    disposeScene: (source) => { disposed.push(source.name); },
  };
  context.scene.add(context.visualGroup, context.analysisVisualGroup, context.analysisVisualDepthGroup);
  context.resources.add(() => disposeRuntimeScene(context.scene));
  execute(["mapWithConcurrency", "cleanup", "onContextLost", "loadAnalysisVisualAssets", "loadExteriorAssets"], context);
  const resolve = (url) => {
    if (requests.get(url).settled) return;
    const source = new THREE.Group();
    source.name = url;
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    sources.set(url, source);
    requests.get(url).resolve({ scene: source });
  };
  const drain = async () => {
    let handled = 0;
    while (handled < started.length) {
      for (const url of started.slice(handled)) { resolve(url); handled++; }
      await flush();
    }
  };
  return { context, started, requests, sources, disposed, states, fatalErrors, calls, resolve, drain };
}

for (const reason of ["close", "replacement", "context loss"]) {
  test(`analysis ${reason} starts no queued GLTF, projection or clones after cleanup`, async () => {
    const f = fixture();
    const pending = f.context.loadAnalysisVisualAssets();
    assert.equal(f.started.length, 3);
    if (reason === "context loss") {
      let prevented = false;
      f.context.onContextLost({ preventDefault() { prevented = true; } });
      assert.ok(prevented);
      assert.ok(f.context.discardRenderer);
    } else f.context.cleanup();
    assert.equal(f.context.hitLoadController.signal.aborted, true);
    await f.drain();
    await pending;
    assert.deepEqual({ starts: f.started.length, ...f.calls }, { starts: 3, scores: 0, projection: 0, clones: 0 });
    assert.deepEqual(f.disposed.sort(), f.started.slice().sort());
    assert.equal(f.context.analysisVisualReady, false);
    assert.equal(f.context.analysisVisualGroup.children.length, 0);
  });
}

test("analysis cleanup releases completed but not yet attached sources and skips borrowed exterior sources", async () => {
  const f = fixture();
  const borrowed = new THREE.Group();
  borrowed.name = "borrowed exterior";
  f.context.exteriorSources.set(f.context.urls[0], borrowed);
  const pending = f.context.loadAnalysisVisualAssets();
  f.resolve(f.started[0]);
  await flush();
  f.context.cleanup();
  await f.drain();
  await pending;
  assert.ok(!f.disposed.includes(borrowed.name));
  assert.deepEqual(f.disposed.slice().sort(), f.started.slice().sort());
  assert.equal(new Set(f.disposed).size, f.disposed.length, "each owned source is released once");
  assert.equal(f.calls.projection, 0);
  assert.equal(f.calls.clones, 0);
});

test("exterior cancellation drains only the active GLTFs and does not attach late scenes", async () => {
  const f = fixture();
  f.context.loadExteriorAssets();
  assert.equal(f.started.length, 3);
  f.context.cleanup();
  await f.drain();
  await f.context.exteriorPromise;
  assert.equal(f.started.length, 3);
  assert.deepEqual(f.disposed.sort(), f.started.slice().sort());
  assert.equal(f.context.visualGroup.children.length, 0);
  assert.equal(f.context.exteriorReady, false);
});

test("an active analysis load preserves all placements and full projection work", async () => {
  const f = fixture();
  const pending = f.context.loadAnalysisVisualAssets();
  await f.drain();
  await pending;
  assert.deepEqual({ starts: f.started.length, ...f.calls }, { starts: 12, scores: 12, projection: 1, clones: 24 });
  assert.equal(f.context.analysisVisualGroup.children.length, 12);
  assert.equal(f.context.analysisVisualDepthGroup.children.length, 12);
  assert.equal(f.context.analysisVisualReady, true);
  f.context.cleanup();
  assert.deepEqual(f.disposed, [], "attached resources belong to scene cleanup");
});

test("failed queue stops admission and consumes later active task failures", async () => {
  const f = fixture();
  const failure = new Error("first GLTF failure");
  const pending = f.context.loadAnalysisVisualAssets();
  const rejected = assert.rejects(pending, (error) => error === failure);
  f.requests.get(f.started[0]).reject(failure);
  await rejected;
  f.requests.get(f.started[1]).reject(new Error("second GLTF failure"));
  f.resolve(f.started[2]);
  await flush();
  assert.equal(f.started.length, 3);
  assert.equal(f.calls.projection, 0);
  assert.equal(f.calls.scores, 0);
  assert.deepEqual(f.disposed, [f.started[2]]);
});

test("already cancelled loaders and queues do no work", async () => {
  const f = fixture();
  f.context.cleanup();
  const pending = f.context.loadAnalysisVisualAssets();
  await f.drain();
  await pending;
  f.context.loadExteriorAssets();
  await f.drain();
  await f.context.exteriorPromise;
  assert.equal(f.started.length, 0);
  assert.equal(f.calls.projection, 0);
});

for (const target of ["reference soldier", "crew occupants", "school query"]) {
  test(`${target} import resolving after close does not begin the asset load`, async () => {
    const moduleRequest = deferred();
    let assetLoads = 0;
    const load = () => { assetLoads++; throw new Error("should not start after close"); };
    const f = fixture();
    Object.assign(f.context, {
      loadModule: () => moduleRequest.promise,
      referenceSoldierIdleCallback: 0, referenceSoldierLoadTimer: 0,
      referenceSoldier: null, activeCrewViewStationIdRef: { current: null },
      crewOccupantHolder: new THREE.Group(), crewOccupantLayer: null,
      crewOccupantPlan: [{}], crewOccupantLoadRequest: null,
      renderRef: { current: null }, schoolQueryRequest: null,
    });
    execute(["loadReferenceSoldierAsset", "applyCrewOccupantVisibility", "ensureSchoolQuery"], f.context);
    if (target === "reference soldier") f.context.loadReferenceSoldierAsset();
    if (target === "crew occupants") f.context.applyCrewOccupantVisibility(true);
    if (target === "school query") f.context.ensureSchoolQuery();
    f.context.cleanup();
    moduleRequest.resolve({ loadRuntimeReferenceSoldier: load, createRuntimeCrewOccupantLayer: load, loadNarvaSchoolQuery: load });
    await flush();
    assert.equal(assetLoads, 0);
  });
}

test("a visual-only preview never starts an unconsumed radial query promise", async () => {
  let requests = 0;
  const context = {
    hit: null, radialQuery: { recordUrl: "/radial.json" },
    loadWikiVehicleRadialQuery: () => { requests++; return Promise.resolve(null); },
    validateVehicleRadialQuerySource: (value) => value,
  };
  execute(["radialQueryPromise"], context);
  await context.radialQueryPromise;
  assert.equal(requests, 0);
});


test("an exterior failure remains visible when sibling GLTFs succeed or reject late", async () => {
  const f = fixture();
  f.context.modeRef.current = "exterior";
  f.context.loadExteriorAssets();
  const attempt = f.context.exteriorPromise;
  f.requests.get(f.started[0]).reject(new Error("exterior GLTF unavailable"));
  await attempt;
  assert.equal(f.states.at(-1).kind, "error");
  f.resolve(f.started[1]);
  f.requests.get(f.started[2]).reject(new Error("late exterior failure"));
  await flush();
  assert.equal(f.started.length, 3);
  assert.equal(f.states.at(-1).kind, "error", "late success must not replace error with loading");
  assert.equal(f.context.visualGroup.children.length, 0);
  assert.deepEqual(f.disposed, [f.started[1]]);
});

test("retry after a partially completed exterior failure loads only missing sources without duplicate occurrences", async () => {
  const f = fixture();
  f.context.modeRef.current = "exterior";
  f.context.loadExteriorAssets();
  const firstAttempt = f.context.exteriorPromise;
  const firstUrl = f.started[0];
  f.resolve(firstUrl);
  await flush();
  assert.equal(f.context.visualGroup.children.length, 1);
  const failedUrl = f.started[1];
  f.requests.get(failedUrl).reject(new Error("first attempt failed"));
  await firstAttempt;
  for (const url of f.started.slice(2)) f.requests.get(url).reject(new Error("late failure"));
  await flush();
  assert.equal(f.states.at(-1).kind, "error");
  assert.equal(f.context.exteriorPromise, null);
  f.context.loadExteriorAssets();
  const retry = f.context.exteriorPromise;
  await f.drain();
  await retry;
  assert.equal(f.started.filter((url) => url === firstUrl).length, 1);
  assert.equal(f.context.visualGroup.children.length, 12);
  assert.equal(new Set(f.context.visualGroup.children.map((child) => child.userData.stableOccurrenceId)).size, 12);
  assert.equal(f.context.exteriorLoaded, 12);
  assert.equal(f.context.exteriorReady, true);
  assert.equal(f.states.at(-1).kind, "ready");
});

test("a superseded exterior attempt cannot attach late sources during its retry", async () => {
  const f = fixture();
  f.context.modeRef.current = "exterior";
  f.context.loadExteriorAssets();
  const attempt = f.context.exteriorPromise;
  const oldRequests = [...f.requests.values()];
  oldRequests[0].reject(new Error("retryable failure"));
  await attempt;
  f.context.loadExteriorAssets();
  const retry = f.context.exteriorPromise;
  const stale = new THREE.Group();
  stale.name = "superseded source";
  oldRequests[1].resolve({ scene: stale });
  oldRequests[2].reject(new Error("late old failure"));
  await flush();
  assert.equal(f.context.exteriorSources.size, 0);
  assert.equal(f.context.visualGroup.children.length, 0);
  assert.deepEqual(f.disposed, [stale.name]);
  await f.drain();
  await retry;
  assert.equal(f.context.visualGroup.children.length, 12);
  assert.equal(f.context.exteriorLoaded, 12);
  assert.equal(f.states.at(-1).kind, "ready");
});


function addSecondPlacement(fixture) {
  fixture.context.renderPlacements.push({
    ...fixture.context.renderPlacements[0], stableOccurrenceId: "second", name: "second",
  });
}

test("partial synchronous exterior assembly fails locally instead of admitting a half-source on retry", async () => {
  const f = fixture({ count: 1, concurrency: 1 });
  f.context.modeRef.current = "exterior";
  addSecondPlacement(f);
  let registrations = 0;
  f.context.registerSkeletalPose = () => { if (++registrations === 2) throw new Error("controlled skeletal registration failure"); };
  f.context.loadExteriorAssets();
  const first = f.context.exteriorPromise;
  await f.drain();
  await first;
  assert.equal(f.fatalErrors.length, 1);
  assert.match(f.fatalErrors[0].message, /controlled skeletal registration failure/u);
  assert.equal(f.context.cancelled, true);
  assert.equal(f.context.discardRenderer, true);
  assert.equal(f.context.exteriorSources.size, 0, "only complete sources may be reused");
  assert.equal(f.context.exteriorReady, false);
  assert.ok(f.states.every((state) => state.kind !== "ready"));
  f.context.loadExteriorAssets();
  assert.equal(f.started.length, 1, "the failed viewer can only be rebuilt explicitly");

  const rebuilt = fixture({ count: 1, concurrency: 1 });
  rebuilt.context.modeRef.current = "exterior";
  addSecondPlacement(rebuilt);
  rebuilt.context.loadExteriorAssets();
  await rebuilt.drain();
  await rebuilt.context.exteriorPromise;
  assert.equal(rebuilt.context.visualGroup.children.length, 2);
  assert.equal(rebuilt.context.exteriorReady, true);
  assert.equal(rebuilt.states.at(-1).kind, "ready");
});

test("synchronous exterior failure cleans pending resources once, retains cached resources and ignores late callbacks", async () => {
  const f = fixture({ count: 3, concurrency: 3 });
  const other = fixture({ count: 1, concurrency: 1 });
  f.context.modeRef.current = other.context.modeRef.current = "exterior";
  const cached = new THREE.Group();
  const cachedMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  cached.add(cachedMesh);
  retainCachedRuntimeSceneResources(cached);
  other.context.visualGroup.add(cachedMesh.clone());
  let cachedDisposals = 0, ownDisposals = 0, skeletonDisposals = 0;
  cachedMesh.geometry.addEventListener("dispose", () => { cachedDisposals++; });
  cachedMesh.material.addEventListener("dispose", () => { cachedDisposals++; });
  f.context.registerSkeletalPose = () => { throw new Error("assembly probe"); };
  f.context.loadExteriorAssets();
  const attempt = f.context.exteriorPromise;
  const oldRequests = [...f.requests.values()];
  f.resolve(f.started[0]);
  const source = f.sources.get(f.started[0]);
  source.children[0].geometry.addEventListener("dispose", () => { ownDisposals++; });
  source.children[0].material.addEventListener("dispose", () => { ownDisposals++; });
  source.add(cachedMesh.clone());
  const bone = new THREE.Bone();
  const skinned = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  skinned.add(bone);
  skinned.bind(new THREE.Skeleton([bone]));
  source.add(skinned);
  const originalClone = f.context.cloneSkeleton;
  f.context.cloneSkeleton = (root) => {
    const cloned = originalClone(root);
    cloned.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose = () => { skeletonDisposals++; };
    });
    return cloned;
  };
  await flush();
  assert.equal(f.fatalErrors.length, 1);
  assert.equal(ownDisposals, 2);
  assert.equal(skeletonDisposals, 1, "a clone that fails before occurrence attachment is still cleaned");
  assert.equal(cachedDisposals, 0);
  f.context.cleanup();
  assert.equal(ownDisposals, 2, "cleanup stays idempotent");
  assert.equal(skeletonDisposals, 1);
  assert.equal(other.context.cancelled, false);
  assert.equal(other.fatalErrors.length, 0);
  const stale = new THREE.Group();
  stale.name = "late failed-viewer source";
  oldRequests[1].resolve({ scene: stale });
  oldRequests[2].reject(new Error("late failed-viewer rejection"));
  await attempt;
  await flush();
  assert.deepEqual(f.disposed, [stale.name]);
  assert.equal(f.fatalErrors.length, 1);
  assert.ok(f.states.every((state) => state.kind !== "ready"));
  assert.equal(other.context.visualGroup.children.length, 1);
});

for (const stage of ["dedupe", "render", "final render", "final presentation"]) {
  test(`synchronous exterior ${stage} failure uses the same local teardown`, async () => {
    const f = fixture({ count: 1, concurrency: 1 });
    f.context.modeRef.current = "exterior";
    let calls = 0;
    const target = stage === "dedupe" ? "dedupeRuntimeSceneTextures"
      : stage === "final presentation" ? "syncAnalysisVisualPresentation" : "render";
    f.context[target] = () => {
      calls++;
      if (!stage.startsWith("final ") || calls === 2) throw new Error(`${stage} probe`);
    };
    f.context.loadExteriorAssets();
    const attempt = f.context.exteriorPromise;
    await f.drain();
    await attempt;
    assert.equal(f.fatalErrors.length, 1);
    assert.equal(f.context.cancelled, true);
    assert.equal(f.context.exteriorReady, false);
    assert.ok(f.states.every((state) => state.kind !== "ready"));
  });
}


test("an identity pending parent preserves real skeletal registration matrices, bounds and hit poses", () => {
  const source = new THREE.Group();
  const root = new THREE.Bone();
  root.name = "root";
  const wheel = new THREE.Bone();
  wheel.name = "Wheel_L1";
  wheel.position.y = 2;
  root.add(wheel);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.add(root);
  source.add(mesh);
  source.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([root, wheel]));
  wheel.position.y = 3;
  source.updateMatrixWorld(true);
  mesh.skeleton.update();
  for (const physical of [false, true]) {
    const results = [];
    for (const parented of [false, true]) {
      const model = clone(source);
      if (parented) {
        const scene = new THREE.Scene();
        const pending = new THREE.Group();
        pending.visible = false;
        scene.add(pending);
        pending.add(model);
      }
      const context = {
        THREE, preview: { generatedClass: "fixture", suspension: { records: [] } },
        physicalPoseEnabledRef: { current: physical }, activeTerrain: () => null,
        terrainPoseLocalMatrices: () => null, groundedPoseLocalMatrices: () => undefined,
        runtimePlanarSuspensionPoseForVisualOccurrence: () => null,
        createRuntimeSkeletalPoseController, skeletalPoseBindings: new Set(), updateSkeletalPoseDataset() {},
      };
      execute(["registerSkeletalPose"], context);
      context.registerSkeletalPose(model, {
        name: "vehicle mesh", runtimeBonePoseStatus: "observed", stableOccurrenceId: "fixture",
        runtimeBonePoseNormalTimeSampleCount: 3, matrix: new THREE.Matrix4().makeTranslation(5, 2, -3).elements,
      });
      assert.equal(context.skeletalPoseBindings.size, 1);
      const binding = [...context.skeletalPoseBindings][0];
      const skinned = binding.skinnedMeshes[0];
      results.push({
        local: skinned.skeleton.bones.map((bone) => bone.matrix.toArray()),
        world: skinned.skeleton.bones.map((bone) => bone.matrixWorld.toArray()),
        skinMatrices: [...skinned.skeleton.boneMatrices],
        bounds: [skinned.boundingBox.min.toArray(), skinned.boundingBox.max.toArray()],
        sphere: [skinned.boundingSphere.center.toArray(), skinned.boundingSphere.radius],
        hitPose: binding.controller.componentPoseMatrixForBone("Wheel_L1", model).toArray(),
        placement: binding.placementMatrix.toArray(),
      });
    }
    assert.deepEqual(results[1], results[0]);
  }
});
