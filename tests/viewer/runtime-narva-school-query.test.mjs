import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ExtendedTriangle, MeshBVH } from "three-mesh-bvh";
import { createSchoolQuery, schoolQueryPlacementMatrix, sweepSchoolTriangle, decodeSchoolCollision, mergeSchoolPenetrationQueries, selectSchoolSweepFace } from "../../lib/runtime-narva-school-query.ts";
import { schoolCoverageExit } from "../../lib/runtime-school-native-loader.ts";

const profile = { sourceMaterialSlot: 0, physicalMaterialPath: "test-concrete", armorThicknessMm: 5000,
  considerForPenetration: true, allowPenetration: true, damageAbsorbed: 0 };
function wall(x = 10) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([x, -5, -5, x, 5, -5, x, 0, 5], 3));
  geometry.setIndex([0, 2, 1]);
  geometry.computeBoundingBox();
  return { geometry, tree: new MeshBVH(geometry, { indirect: true }), profiles: [profile],
    profileIndices: new Uint16Array([0]), normals: new Float32Array([-1, 0, 0]) };
}
function row(id = "wall", parsed = wall(), matrix = new THREE.Matrix4()) {
  return { id, label: id, simple: parsed, complex: parsed, movementKind: "simple", matrix, surface: p => p };
}
const sweep = (startX = 0, endX = 20, radius = 10) => ({ startCm: { x: startX * 100, y: 0, z: 0 }, endCm: { x: endX * 100, y: 0, z: 0 }, sphereRadiusCm: radius });

test("component refinement preserves the hit without querying unrelated receivers again", () => {
  const native = x => {
    const parsed = wall(x);
    parsed.nativeCooked = { cullsBackFace: false, externalFaceIndices: new Int32Array([0]), elementIndex: 0 };
    return parsed;
  };
  const anchor = { ...row("anchor", native(2)), isInstanced: false };
  const target = { ...row("target", native(10)), simple: native(4), isInstanced: false };
  let neighborContacts = 0;
  const neighbor = { ...row("neighbor", native(15)), isInstanced: true,
    surface: p => { neighborContacts++; return p; } };
  // An ISM contributes only its complex result to this continuation route.
  neighbor.simple = null;
  neighbor.movementKind = "simple";
  const traces = createSchoolQuery([anchor, target, neighbor]).postImpact(
    new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 20,
  );
  const refined = traces.find(({ hit }) => hit.componentId === "target" && hit.nativeHitKey.timeFraction === Math.fround(4 / 20));
  assert.ok(refined, "the simple hit must retain its original native Time");
  assert.equal(refined.hit.point.x, 10);
  assert.equal(refined.hit.distanceM, 10);
  assert.equal(neighborContacts, 2, "only the forward and reverse world queries visit this receiver");
});

test("rotated FKBoxElem scales dimensions without shearing its local axes",()=>{
  const planes=[];
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const p=[0,0,0],n=[0,0,0];p[axis]=[1,2,3][axis]*sign;n[axis]=sign;planes.push(...p,...n);}
  const placement={...row(),matrix:new THREE.Matrix4().makeScale(2,3,4),simpleSurface:profile,
    nativePose:{translationCm:[0,0,0],rotationQuaternion:[0,0,0,1],scale3d:[2,3,4]},
    nativeConvexes:[{isBox:true,elementIndex:0,planes,matrix:new THREE.Matrix4().compose(new THREE.Vector3(1,2,3),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2),new THREE.Vector3(1,1,1))}]};
  const hits=createSchoolQuery([placement]).raycast(new THREE.Vector3(-20,6,12),new THREE.Vector3(1,0,0),40,undefined,"simple");
  assert.equal(hits.length,1);
  assert.ok(hits[0].point.distanceTo(new THREE.Vector3(-4,6,12))<1e-10);
});

test("bounded school coverage stops at absent neighbors without restricting height",()=>{
  const bounds=[9000,-58000,19000,-46000];
  assert.equal(schoolCoverageExit([14000,-52000,0],[18000,-50000,100000],bounds),null);
  assert.equal(schoolCoverageExit([14000,-52000,0],[24000,-52000,0],bounds),.5);
  assert.equal(schoolCoverageExit([14000,-52000,0],[14000,-64000,0],bounds),.5);
  assert.equal(schoolCoverageExit([19500,-52000,0],[14000,-52000,0],bounds),0);
});

test("positive sweep contact selects the most opposing face within strict one centimetre", () => {
  const mesh = wall();
  mesh.nativeCooked = { cullsBackFace: true, externalFaceIndices: new Int32Array([0]), elementIndex: 0, triangleVisitRanks: new Uint32Array([0]) };
  assert.equal(selectSchoolSweepFace(mesh, new THREE.Matrix4(), new THREE.Vector3(9.995, 0, 0), new THREE.Vector3(1, 0, 0), 99), 0);
  assert.equal(selectSchoolSweepFace(mesh, new THREE.Matrix4(), new THREE.Vector3(9.98, 0, 0), new THREE.Vector3(1, 0, 0), 99), 99);
  // The search radius is physical distance, not unscaled mesh units.
  const scale = new THREE.Matrix4().makeScale(2, 3, 4);
  assert.equal(selectSchoolSweepFace(mesh, scale, new THREE.Vector3(19.995, 0, 0), new THREE.Vector3(1, 0, 0), 99), 0);
  assert.equal(selectSchoolSweepFace(mesh, scale, new THREE.Vector3(19.98, 0, 0), new THREE.Vector3(1, 0, 0), 99), 99);
});

test("fast source-radius projectiles hit a thin face between frames at the sphere contact, not its endpoint", () => {
  const query = createSchoolQuery([row()]);
  const hit = query.sweepSphere(sweep());
  assert.ok(Math.abs(hit.timeFraction - .495) < 1e-8);
  assert.ok(hit.sceneHit.point.distanceTo(new THREE.Vector3(10, 0, 0)) < 1e-7);
  assert.ok(hit.impactNormal.x < -.9999);
  assert.equal(hit.sceneHit.surface.armorThicknessMm, 5000);
  assert.equal(query.sweepSphere(sweep(0, 9)), null);
});

test("source position stays aligned after the viewer translates the pitch to another vehicle center", () => {
  const query = createSchoolQuery([row()]);
  const offset = new THREE.Vector3(2, 3, 4);
  const input = { startCm: { x: 200, y: 400, z: 300 }, endCm: { x: 2200, y: 400, z: 300 }, sphereRadiusCm: 10 };
  const hit = query.sweepSphere(input, offset);
  assert.ok(Math.abs(hit.timeFraction - .495) < 1e-8);
  assert.ok(hit.sceneHit.point.distanceTo(new THREE.Vector3(12, 3, 4)) < 1e-7);
});

test("movement source shape and direct complex material geometry remain separate", () => {
  const placement = { ...row(), complex: wall(12) };
  const query = createSchoolQuery([placement]);
  assert.equal(query.sweepSphere(sweep(), new THREE.Vector3(), false).sceneHit.point.x, 10);
  assert.equal(query.sweepSphere(sweep()).sceneHit.point.x, 12);
  const hits = query.raycast(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 20);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].point.x, 12);
  assert.equal(hits[0].incidenceFactor, 1);
});

test("sphere sweep includes edges/corners missed by a center ray, preserves clear gaps and ignores separating bounces", () => {
  const tri = new ExtendedTriangle(new THREE.Vector3(10, -1, -1), new THREE.Vector3(10, 1, -1), new THREE.Vector3(10, 0, 1));
  const hit = sweepSchoolTriangle(tri, new THREE.Vector3(0, 0, 1.05), new THREE.Vector3(20, 0, 1.05), .1);
  assert.ok(hit && hit.timeFraction < .5);
  assert.equal(sweepSchoolTriangle(tri, new THREE.Vector3(0, 0, 1.2), new THREE.Vector3(20, 0, 1.2), .1), null);
  assert.equal(sweepSchoolTriangle(tri, new THREE.Vector3(9.9, 0, 0), new THREE.Vector3(0, 0, 0), .1), null);
});

test("query normalization and authored pose compose once without borrowing display geometry", () => {
  const placement = { sourceTransform: { translationMeters: [135, -515, 2], rotationQuaternion: [0, 0, 0, 1], scale3d: [2, 3, 4] } };
  const matrix = schoolQueryPlacementMatrix(placement, { sourceCenterMeters: { x: 5, y: 6 }, sourceBaseZMeters: 7, scale: 2 }, [135, -515, 2]);
  assert.deepEqual(new THREE.Vector3(2, 4, 6).applyMatrix4(matrix).toArray(), [12, 40, 24]);
});

test("native merge anchors complex Time and refines only separated non-instanced simple hits", () => {
  const make = (id, distanceM) => ({ componentId:id, distanceM, surface:profile });
  const complex = [make("c1", 20), make("c2", 100)];
  const simple = [make("before", 1), make("near", 21), make("ordinary", 50), make("instance", 70), make("unknown", 80), make("after", 140)];
  const refined = [];
  const merge = anchors => mergeSchoolPenetrationQueries(anchors, simple, 200,
    hit => hit.componentId === "instance" ? true : hit.componentId === "unknown" ? undefined : false,
    hit => { refined.push(hit.componentId); return {...hit,distanceM:hit.distanceM+1}; });
  assert.deepEqual(merge([]), []);
  const result = merge(complex);
  assert.deepEqual(result.map(hit => hit.componentId), ["c1", "ordinary", "unknown", "c2", "after"]);
  assert.deepEqual(refined, ["ordinary", "after"]);
  assert.equal(result[1].distanceM, 51);
  assert.ok(result[2].queryUncertainty);
  // A rejected Complex surface still anchors the raw Time interval.
  assert.deepEqual(merge([{...complex[0],surface:{...profile,considerForPenetration:false}},complex[1]])
    .map(hit => hit.componentId), ["ordinary", "unknown", "c2", "after"]);
});

test("post-impact pairs the far-side exit without charging it as another forward armor layer", () => {
  const parsed = wall();
  const first = parsed.geometry.getAttribute('position').array;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([...first,...first.map((v,i)=>i%3===0?v+2:v)],3));
  geometry.setIndex([0,2,1,3,4,5]);
  geometry.computeBoundingBox();
  parsed.geometry = geometry;
  parsed.tree = new MeshBVH(geometry,{indirect:true});
  parsed.normals = new Float32Array([-1,0,0,1,0,0]);
  parsed.profileIndices = new Uint16Array([0,0]);
  const query = createSchoolQuery([row('single-wall-owner',parsed)]);
  const traces = query.postImpact(new THREE.Vector3(),new THREE.Vector3(1,0,0),20);
  assert.equal(traces.length,1);
  assert.equal(traces[0].hit.point.x,10);
  assert.equal(traces[0].exit.point.x,12);
  assert.equal(traces[0].hit.incidenceFactor,1);
  assert.equal(traces[0].exit.incidenceFactor,1);
  assert.equal(traces[0].hit.queryUncertainty, "原生命中列表尚未确认");
});

test("two different components stay ordered and zero-penetration material remains explicit", () => {
  const second = wall(14);
  second.profiles = [{ ...profile, allowPenetration: false, armorThicknessMm: 0 }];
  const query = createSchoolQuery([row("far", second), row("near")]);
  const hits = query.raycast(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 20);
  assert.deepEqual(hits.map(h => h.componentId), ["near", "far"]);
  assert.equal(hits[1].surface.allowPenetration, false);
  assert.equal(hits[1].surface.armorThicknessMm, 0);
});

test("prebuilt indirect BVH and material FaceIndex survive binary decode", () => {
  const source = wall();
  const arrays = { positions: source.geometry.attributes.position.array, indices: new Uint32Array(source.geometry.index.array),
    triangleSurfaceProfileIndex: new Uint32Array([0]), faceNormals: source.normals };
  const sections = {};
  let bytes = 0;
  for (const [key, value] of Object.entries(arrays)) {
    sections[key] = { byteOffset: bytes, byteLength: value.byteLength, elementCount: value.length, componentType: value instanceof Float32Array ? "float32" : "uint32" };
    bytes += value.byteLength;
  }
  const geometry = new ArrayBuffer(bytes);
  for (const [key, value] of Object.entries(arrays)) new Uint8Array(geometry, sections[key].byteOffset, value.byteLength).set(new Uint8Array(value.buffer));
  const serialized = MeshBVH.serialize(source.tree);
  const rootBytes = serialized.roots[0].byteLength;
  const indirect = new Uint32Array(serialized.indirectBuffer);
  const bvh = new ArrayBuffer(rootBytes + indirect.byteLength);
  new Uint8Array(bvh).set(new Uint8Array(serialized.roots[0]));
  new Uint8Array(bvh, rootBytes).set(new Uint8Array(indirect.buffer));
  const descriptor = { sourceKind: "complex", counts: { vertices: 3, triangles: 1 }, surfaceProfiles: [profile],
    geometry: { bytes, sections }, bvh: { bytes: bvh.byteLength, serializationVersion: 1, indirect: true,
      roots: [{ byteOffset: 0, byteLength: rootBytes }], indirectBuffer: { byteOffset: rootBytes, elementCount: 1 } } };
  const decoded = decodeSchoolCollision(descriptor, geometry, bvh);
  const hits = createSchoolQuery([row("decoded", decoded)]).raycast(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 20);
  assert.equal(hits[0].triangleIndex, 0);
  assert.equal(hits[0].surface.physicalMaterialPath, "test-concrete");
  assert.throws(() => decodeSchoolCollision(descriptor, geometry.slice(0, -1), bvh), /不匹配/);
});
