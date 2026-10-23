import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeRuntimeScene } from "../../lib/runtime-scene-resources.ts";
import { validateRuntimeExteriorModel } from "../../lib/runtime-exterior-model.ts";
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
  const capabilities = [], fallbacks = [];
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
    analysisVisualReady: false, exteriorReady: false, exteriorPromise: null, exteriorLoaded: 0, exteriorFailure: null,
    publishExteriorCapability(value) { capabilities.push(value); }, skeletalPoseBindings: new Set(),
    updateSkeletalPoseDataset() {}, physicalPoseEnabledRef: { current: false }, validateRuntimeExteriorModel,
    activateAssetModeRef: { current(mode) { fallbacks.push(mode); } },
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
  return { context, started, requests, sources, disposed, states, fatalErrors, capabilities, fallbacks, calls, resolve, drain };
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



test("exterior-only failure is terminal, preserves hit ownership and ignores late siblings", async () => {
  const f = fixture(); f.context.modeRef.current = "exterior";
  f.context.loadExteriorAssets(); const attempt = f.context.exteriorPromise;
  f.requests.get(f.started[0]).reject(new Error("")); await attempt;
  assert.equal(f.capabilities.at(-1).state, "unavailable");
  assert.ok(f.capabilities.at(-1).message.length > 0);
  assert.deepEqual(f.fallbacks, ["armor"]);
  assert.equal(f.context.hitLoadController.signal.aborted, false);
  assert.equal(f.context.cancelled, false); assert.equal(f.fatalErrors.length, 0);
  f.resolve(f.started[1]); f.requests.get(f.started[2]).reject(new Error("late")); await flush();
  const starts=f.started.length; f.context.loadExteriorAssets(); await flush();
  assert.equal(f.started.length, starts); assert.equal(f.capabilities.length, 1);
  assert.equal(f.context.exteriorOccurrences.size, 0);
});

test("partial registration failure removes exterior pose bindings while preserving other bindings", async () => {
  const f=fixture({count:1,concurrency:1}); f.context.modeRef.current="exterior";
  f.context.renderPlacements.push({...f.context.renderPlacements[0],stableOccurrenceId:"second"});
  const analysis={model:new THREE.Group()}; f.context.skeletalPoseBindings.add(analysis);
  let calls=0; f.context.registerSkeletalPose=(model)=>{f.context.skeletalPoseBindings.add({model});if(++calls===2)throw Error("registration probe");};
  f.context.loadExteriorAssets(); await f.drain(); await f.context.exteriorPromise;
  assert.equal(f.capabilities.at(-1).state,"unavailable");
  assert.deepEqual([...f.context.skeletalPoseBindings],[analysis]);
  assert.equal(f.context.exteriorOccurrences.size,0); assert.equal(f.context.visualGroup.visible,false);
  assert.equal(f.context.hitLoadController.signal.aborted,false);
  assert.equal(f.fatalErrors.length,0); f.context.cleanup();
});

test("missing texture rejects exterior even when the main glTF resolves", async () => {
  const f=fixture({count:1,concurrency:1}); f.context.modeRef.current="exterior";
  f.context.GLTFLoader=class { constructor(manager){manager.onError("controlled-required-texture");} setMeshoptDecoder(){} loadAsync(url){return f.requests.get(url)?.promise??(()=>{const request=deferred();f.started.push(url);f.requests.set(url,request);return request.promise;})();} };
  f.context.loadExteriorAssets(); await f.drain(); await f.context.exteriorPromise;
  assert.equal(f.capabilities.at(-1).state,"unavailable");
  assert.match(f.capabilities.at(-1).message,/controlled-required-texture/);
  assert.equal(f.context.exteriorReady,false); assert.equal(f.fatalErrors.length,0);
});

test("only complete exterior assets become available", async () => {
  const f=fixture({count:2,concurrency:1});f.context.modeRef.current="exterior";
  f.context.loadExteriorAssets(); assert.equal(f.capabilities.length,0);
  f.resolve(f.started[0]);await flush();assert.equal(f.capabilities.length,0);
  await f.drain();await f.context.exteriorPromise;
  assert.equal(f.capabilities.at(-1).state,"available");assert.equal(f.context.exteriorOccurrences.size,2);
});

for(const final of [false,true]) test("actual renderer failure remains fatal (final="+final+")",async()=>{
  const f=fixture({count:1,concurrency:1});f.context.modeRef.current="exterior";
  let renders=0;f.context.render=()=>{if(++renders===(final?2:1))throw Error("GPU render probe");};
  f.context.loadExteriorAssets();await f.drain();await f.context.exteriorPromise;
  assert.equal(f.fatalErrors.length,1);assert.equal(f.context.discardRenderer,true);
  assert.equal(f.context.hitLoadController.signal.aborted,true);
  assert.ok(f.capabilities.every(c=>c.state!=="available"));
});

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
