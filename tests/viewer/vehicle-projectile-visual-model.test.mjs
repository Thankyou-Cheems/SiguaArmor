import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createVehicleProjectileThreeRuntime } from "../../lib/vehicle-projectile-three-runtime.ts";

const frame = { translationCm: { x: -100, y: 0, z: 20 }, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 }, scale3D: { x: 1, y: 2, z: 3 } };
const samples = [{ timeSeconds: 0, positionCm: { x: 1000, y: 0, z: 0 }, velocityCmPerSecond: { x: 100, y: 0, z: 0 }, phase: "ascending" },
  { timeSeconds: 10, positionCm: { x: 2000, y: 0, z: 0 }, velocityCmPerSecond: { x: 100, y: 0, z: 0 }, phase: "ascending" }];

test("only the latest actual impact persists, even when a frame jumps past the projectile's terminal time", t => {
  let nextFrame;
  const oldRequest = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = fn => { nextFrame = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { globalThis.requestAnimationFrame = oldRequest; globalThis.cancelAnimationFrame = oldCancel; });
  const scene = new THREE.Scene(), published = [];
  const runtime = createVehicleProjectileThreeRuntime({ scene, render() {}, onImpactTrace: trace => published.push(trace.summary) });
  const visual = { bodies: [], effects: [], nativeTracer: {} };
  const trace = (x, timeSeconds, summary) => ({ timeSeconds, summary,
    pointsCm: [{ x: 0, y: 0, z: 0 }, { x, y: 0, z: 0 }, { x: x + 100, y: 0, z: 0 }],
    contacts: [{ pointCm: { x, y: 0, z: 0 }, penetrated: true }, { pointCm: { x: x + 100, y: 0, z: 0 }, penetrated: false }] });
  const start = performance.now();
  const rounds = samples.map((s, i) => ({ ...s, timeSeconds: i * .1 }));
  runtime.spawn({ weaponAssignmentId: 'a', weaponLabel: 'test', samples: rounds, visual, impactTrace: trace(1000, .1, 'older') });
  const impactRoot = scene.getObjectByName('runtime-last-projectile-impact');
  nextFrame(start + 20);
  assert.equal(impactRoot.visible, false, 'do not reveal a future impact at trigger time');
  nextFrame(start + 200);
  assert.equal(impactRoot.visible, true);
  assert.deepEqual(published, ['older']);
  assert.equal(scene.getObjectByName('runtime-source-locked-projectiles').visible, false);
  const positions = impactRoot.children[0].geometry.attributes.instanceStart.data.array;
  assert.equal(positions[9], 11);
  runtime.spawn({ weaponAssignmentId: 'b', weaponLabel: 'test', samples: rounds, visual, impactTrace: trace(2000, .1, 'newer') });
  nextFrame(performance.now() + 200);
  assert.deepEqual(published, ['older', 'newer']);
  assert.equal(impactRoot.children[0].geometry.attributes.instanceStart.data.array, positions);
  assert.equal(positions[9], 21);
  assert.equal(impactRoot.children.length, 2, 'no per-shot geometry accumulation');
  runtime.dispose();
  assert.equal(scene.children.length, 0);
});

test("enhanced flight cues make non-tracer shots visible with bounded screen-sized markers and curved history", (t) => {
  let nextFrame;
  const oldRequest = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = fn => { nextFrame = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { globalThis.requestAnimationFrame = oldRequest; globalThis.cancelAnimationFrame = oldCancel; });
  const scene = new THREE.Scene();
  const runtime = createVehicleProjectileThreeRuntime({ scene, render() {}, maxActiveProjectiles: 3 });
  const visual = { bodies: [], effects: [], nativeTracer: { effect: null, isTracer: false } };
  const curved = [
    { timeSeconds: 0, positionCm: { x: 0, y: 0, z: 0 }, velocityCmPerSecond: { x: 100000, y: 0, z: 0 } },
    { timeSeconds: .1, positionCm: { x: 10000, y: 0, z: -100 }, velocityCmPerSecond: { x: 100000, y: 0, z: -2000 } },
    { timeSeconds: .2, positionCm: { x: 20000, y: 0, z: -400 }, velocityCmPerSecond: { x: 100000, y: 0, z: -4000 } },
  ];
  const unchanged = JSON.stringify(curved);
  const start = performance.now();
  for (let i = 0; i < 6; i++) runtime.spawn({ weaponAssignmentId: "mg", weaponLabel: "test", samples: curved, visual });
  nextFrame(start + 150);
  const markers = scene.getObjectByName("runtime-projectile-visibility-markers");
  const trails = scene.getObjectByName("runtime-projectile-visibility-trails");
  assert.ok(markers?.isPoints, "all rounds need an explicit presentation cue, even without a native tracer");
  assert.equal(markers.geometry.drawRange.count, 3);
  assert.ok(markers.material.vertexShader.includes("gl_PointSize"));
  assert.ok(trails?.isLineSegments2, "a one-pixel native line is not a readable enhanced trail");
  assert.ok(trails.material.linewidth >= 2);
  assert.ok(trails.geometry.instanceCount > 3 && trails.geometry.instanceCount <= 30);
  assert.equal(markers.material.depthTest, true, "markers must not see through vehicles");
  const markerArray = markers.geometry.attributes.position.array;
  const trailArray = trails.geometry.attributes.instanceStart.data.array;
  assert.equal(trailArray.length, 3 * 10 * 6);
  assert.ok(Math.abs(markerArray[0] - 150) < 1);
  assert.ok(Math.abs(markerArray[1] + 2.5) < .1);
  nextFrame(start + 160);
  assert.equal(markers.geometry.attributes.position.array, markerArray);
  assert.equal(trails.geometry.attributes.instanceStart.data.array, trailArray);
  runtime.setVisibilityEnhanced(false);
  nextFrame(start + 170);
  assert.equal(markers.visible, false);
  assert.equal(trails.visible, false);
  assert.equal(scene.getObjectByName("runtime-source-locked-projectile-trails").geometry.drawRange.count, 0);
  assert.equal(JSON.stringify(curved), unchanged, "presentation never mutates ballistic samples");
  let disposed = 0;
  for (const item of [markers.geometry, markers.material, trails.geometry, trails.material]) item.addEventListener("dispose", () => disposed++);
  runtime.dispose();
  assert.equal(disposed, 4);
});

test("meshless source projectiles do not receive an invented cylinder", () => {
  const scene = new THREE.Scene();
  const runtime = createVehicleProjectileThreeRuntime({ scene, render() {} });
  assert.equal(Boolean(scene.getObjectByName("runtime-source-locked-projectile-bodies")), false);
  runtime.dispose();
});

test("source models are shared, remain metre-scaled and apply the component frame once", async (t) => {
  let nextFrame;
  const oldRequest = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = fn => { nextFrame = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { globalThis.requestAnimationFrame = oldRequest; globalThis.cancelAnimationFrame = oldCancel; });
  const scene = new THREE.Scene();
  let loads = 0;
  const source = new THREE.Group();
  const geometry = new THREE.BoxGeometry(2, .1, .1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.x = .25;
  source.add(mesh);
  const runtime = createVehicleProjectileThreeRuntime({ scene, render() {}, maxActiveProjectiles: 3,
    loadModel: async () => { loads++; return source; } });
  const visual = { bodies: [{ name: "missile", model: "/source.glb", componentToActor: frame }], effects: [], nativeTracer: { effect: null, isTracer: false } };
  await Promise.all([runtime.prepare(visual), runtime.prepare(visual)]);
  assert.equal(loads, 1);
  for (let i = 0; i < 5; i++) runtime.spawn({ weaponAssignmentId: "a", weaponLabel: "test", samples, visual });
  nextFrame(performance.now());
  const batches = [];
  scene.traverse(o => { if (o.isInstancedMesh) batches.push(o); });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].count, 3);
  const matrix = new THREE.Matrix4();
  batches[0].getMatrixAt(0, matrix);
  assert.ok(Math.abs(matrix.elements[12] - 9.25) < .03);
  assert.ok(Math.abs(matrix.elements[13] - .2) < .001);
  assert.deepEqual([matrix.elements[0], matrix.elements[5], matrix.elements[10]], [1, 3, 2]);
  let disposed = 0;
  geometry.addEventListener("dispose", () => { disposed++; });
  runtime.dispose();
  assert.equal(disposed, 1);
  assert.equal(scene.children.length, 0);
});

test("a model arriving after viewer disposal releases its resources without recreating batches", async () => {
  let finishLoad;
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  let releasedGeometry = 0, releasedMaterial = 0;
  geometry.addEventListener("dispose", () => releasedGeometry++);
  material.addEventListener("dispose", () => releasedMaterial++);
  const runtime = createVehicleProjectileThreeRuntime({ scene, render() {},
    loadModel: () => new Promise(resolve => { finishLoad = resolve; }) });
  const preparing = runtime.prepare({ bodies: [{ model: "/late.glb", componentToActor: frame }], effects: [], nativeTracer: {} });
  runtime.dispose();
  finishLoad(new THREE.Mesh(geometry, material));
  await preparing;
  assert.equal(releasedGeometry, 1);
  assert.equal(releasedMaterial, 1);
  assert.equal(scene.children.length, 0);
});

test("a failed model load can retry on the next selection instead of poisoning the cache", async () => {
  const scene = new THREE.Scene();
  let attempts = 0;
  const runtime = createVehicleProjectileThreeRuntime({ scene, render() {}, loadModel: async () => {
    if (++attempts === 1) throw new Error("interrupted transfer");
    return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  } });
  const visual = { bodies: [{ model: "/retry.glb", componentToActor: frame }], effects: [], nativeTracer: {} };
  await assert.rejects(runtime.prepare(visual), /interrupted transfer/);
  await runtime.prepare(visual);
  assert.equal(attempts, 2);
  runtime.dispose();
});

test("diagonal projectile flight preserves native zero roll rather than shortest-arc roll", async (t) => {
  let nextFrame;
  const oldRequest = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = fn => { nextFrame = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { globalThis.requestAnimationFrame = oldRequest; globalThis.cancelAnimationFrame = oldCancel; });
  const scene = new THREE.Scene();
  const runtime = createVehicleProjectileThreeRuntime({ scene, render() {}, loadModel: async () =>
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()) });
  const visual = { bodies: [{ model: "/orientation.glb", componentToActor: {
    ...frame, translationCm: { x: 0, y: 0, z: 0 }, scale3D: { x: 1, y: 1, z: 1 },
  } }], effects: [], nativeTracer: {} };
  await runtime.prepare(visual);
  const velocity = { x: 50, y: 50 * Math.sqrt(3), z: 100 };
  runtime.spawn({ weaponAssignmentId: "diagonal", weaponLabel: "test", visual,
    samples: samples.map(s => ({ ...s, velocityCmPerSecond: velocity })) });
  nextFrame(performance.now());
  const matrix = new THREE.Matrix4();
  scene.getObjectByName("runtime-source-projectile-model").getMatrixAt(0, matrix);
  assert.ok(Math.abs(matrix.elements[0] - Math.SQRT1_2 / 2) < 1e-6);
  assert.ok(Math.abs(matrix.elements[1] - Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(matrix.elements[2] - Math.SQRT1_2 * Math.sqrt(3) / 2) < 1e-6);
  assert.ok(Math.abs(matrix.elements[9]) < 1e-6, "the projectile right axis remains horizontal");
  runtime.dispose();
});

test("authored fixed body facing is not overwritten by the falling velocity", async (t) => {
  let nextFrame;
  const oldRequest = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = fn => { nextFrame = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { globalThis.requestAnimationFrame = oldRequest; globalThis.cancelAnimationFrame = oldCancel; });
  const scene = new THREE.Scene();
  const runtime = createVehicleProjectileThreeRuntime({ scene, render() {}, loadModel: async () =>
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()) });
  const visual = { bodies: [{ model: "/fixed.glb", componentToActor: {
    ...frame, translationCm: { x: 0, y: 0, z: 0 }, scale3D: { x: 1, y: 1, z: 1 },
  } }], effects: [], nativeTracer: {} };
  await runtime.prepare(visual);
  runtime.spawn({ weaponAssignmentId: "fixed", weaponLabel: "test", visual,
    samples: samples.map(s => ({ ...s, velocityCmPerSecond: { x: 0, y: 0, z: -100 },
      bodyDirection: { x: 1, y: 0, z: 0 } })) });
  nextFrame(performance.now() + 5000);
  const matrix = new THREE.Matrix4();
  scene.getObjectByName("runtime-source-projectile-model").getMatrixAt(0, matrix);
  assert.deepEqual([matrix.elements[0], matrix.elements[1], matrix.elements[2]], [1, 0, 0]);
  runtime.dispose();
});
