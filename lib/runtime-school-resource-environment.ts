import * as THREE from 'three';
import {coordinateAdapter} from './shared/coordinate-basis.js';

type Vec3 = [number, number, number];
export type SchoolWorldTransform = {translationMeters: Vec3; rotationQuaternion: [number, number, number, number]; scale3d: Vec3};
export type SchoolResourceRecord = {
  id: string; kind: 'rigid' | 'surface' | 'vegetation' | 'grass'; resourceIds: string[];
  payloadFrame: string; geometryKind?: number; meshPath?: string;
  placement?: {translationCm: Vec3; rotationQuaternion: [number, number, number, number]; scale3d: Vec3};
};
export type PreparedSchoolResources = {
  view: {source: unknown; coverage: string; scope: {id: string; layerId: string; boundsSourceCm: number[]}; records: SchoolResourceRecord[]; resources: {resourceId: string; transport: {bytes: number}}[]};
  resourceBytes(id: string): ArrayBuffer;
};
export type SchoolDecodedMesh = {positions: Float32Array; colorsRgb: Uint8Array; indices: Uint32Array};
export type SchoolDisplayDecoders = {
  // Implementations retain the accepted producer's stability/spline policy.
  rigid(record: SchoolResourceRecord, bytes: ArrayBuffer): Promise<SchoolDecodedMesh>;
  terrain(record: SchoolResourceRecord, bytes: ArrayBuffer): Promise<SchoolDecodedMesh>;
  vegetation(records: SchoolResourceRecord[], resources: PreparedSchoolResources): Promise<{root: THREE.Group; dispose(): void}>;
};
export type PreparedSchoolDisplay = {
  kind: 'resource-view'; resources: PreparedSchoolResources; anchorSourceMeters: Vec3;
  rigid: {record: SchoolResourceRecord; geometry: SchoolDecodedMesh}[];
  terrain: SchoolDecodedMesh;
  vegetation: {root: THREE.Group; dispose(): void};
};
const sourceToArmor = coordinateAdapter('ue-m', 'gltf-m');
const renderToArmor = coordinateAdapter('render-m', 'gltf-m');

/** Input is an already-composed world pose. This is not UE parent/local
 * FTransform reconstruction; the qualified producer owns that operation. */
export function schoolWorldMatrix(transform: SchoolWorldTransform, anchor: Vec3) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.translationMeters).sub(new THREE.Vector3(...anchor)),
    new THREE.Quaternion(...transform.rotationQuaternion).normalize(), new THREE.Vector3(...transform.scale3d),
  );
  return new THREE.Matrix4().fromArray(sourceToArmor.affine(matrix.elements));
}

export function schoolSceneryMaterial() {
  const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide});
  const inspectionTone = {value: 1};
  material.onBeforeCompile = shader => {
    shader.uniforms.schoolInspectionTone = inspectionTone;
    shader.fragmentShader = `uniform float schoolInspectionTone;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', `
      float schoolLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
      vec3 schoolMuted = mix(vec3(schoolLuminance), outgoingLight, 0.45) * 0.30 + vec3(0.012);
      outgoingLight = mix(outgoingLight, schoolMuted, schoolInspectionTone);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'narva-school-inspection-tone-v1';
  return {material, inspectionTone};
}

/** Candidate display preparation is independent of Query admission. Call the
 * existing strict Query gate before enabling any production interaction. */
export async function prepareSchoolDisplay(resources: PreparedSchoolResources, decoders: SchoolDisplayDecoders, anchorSourceMeters: Vec3): Promise<PreparedSchoolDisplay> {
  if (anchorSourceMeters.length !== 3 || !anchorSourceMeters.every(Number.isFinite)) throw Error('学校锚点无效');
  const rows = resources.view.records, surfaces = rows.filter(r => r.kind === 'surface');
  if (surfaces.length !== 1 || surfaces[0].payloadFrame !== 'render-world-meters') throw Error('学校地形空间不匹配');
  const rigid: PreparedSchoolDisplay['rigid'] = [];
  const decoded = new Map<string, Promise<SchoolDecodedMesh>>();
  for (const record of rows.filter(r => r.kind === 'rigid')) {
    if (record.payloadFrame !== 'source-local-meters' || !record.placement || ![0, 1].includes(record.geometryKind!)) throw Error('学校刚体空间不匹配');
    const key = record.geometryKind === 1 ? record.id : JSON.stringify([record.resourceIds[0], record.meshPath]);
    if (!decoded.has(key)) decoded.set(key, decoders.rigid(record, resources.resourceBytes(record.resourceIds[0])));
    rigid.push({record, geometry: await decoded.get(key)!});
  }
  const terrain = await decoders.terrain(surfaces[0], resources.resourceBytes(surfaces[0].resourceIds[0]));
  const vegetation = await decoders.vegetation(rows.filter(r => r.kind === 'vegetation' || r.kind === 'grass'), resources);
  return {kind: 'resource-view', resources, anchorSourceMeters, rigid, terrain, vegetation};
}

function geometry(data: SchoolDecodedMesh, frame: 'ue-m' | 'render-m', anchor: Vec3, scope?: number[]) {
  if (data.positions.length % 3 || !data.positions.every(Number.isFinite) || data.colorsRgb.length !== data.positions.length || data.indices.length % 3 || data.indices.some(i => i >= data.positions.length / 3)) throw Error('学校显示几何无效');
  const adapter = frame === 'ue-m' ? sourceToArmor : renderToArmor;
  const selected: number[] = [], positions: number[] = [], colors: number[] = [], remap = new Map<number, number>();
  const origin = sourceToArmor.position(anchor);
  for (let offset = 0; offset < data.indices.length; offset += 3) {
    const triangle = Array.from(data.indices.subarray(offset, offset + 3));
    if (scope) {
      const x = triangle.map(i => data.positions[i * 3] * 100), y = triangle.map(i => -data.positions[i * 3 + 1] * 100);
      if (Math.min(...x) > scope[2] || Math.max(...x) < scope[0] || Math.min(...y) > scope[3] || Math.max(...y) < scope[1]) continue;
    }
    const indices = triangle.map(i => {
      if (!remap.has(i)) {
        remap.set(i, positions.length / 3);
        const p = adapter.position(Array.from(data.positions.subarray(i * 3, i * 3 + 3)));
        positions.push(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
        colors.push(...data.colorsRgb.subarray(i * 3, i * 3 + 3));
      }
      return remap.get(i)!;
    });
    selected.push(...(adapter.reversesWinding ? [indices[0], indices[2], indices[1]] : indices));
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(colors), 3, true));
  result.setIndex(selected); result.computeVertexNormals(); result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

export function createSchoolResourceEnvironment(data: PreparedSchoolDisplay) {
  const {material, inspectionTone} = schoolSceneryMaterial(), root = new THREE.Group(), geometries = new Map<SchoolDecodedMesh, THREE.BufferGeometry>();
  root.name = 'narva-school-shared-resource-display';
  root.userData = {sceneId: data.resources.view.scope.id, source: data.resources.view.source, coverage: data.resources.view.coverage, collisionAuthority: false, cameraDistanceLod: false,
    anchorSourceMeters: data.anchorSourceMeters, placementCount: data.rigid.length, resourceBytes: data.resources.view.resources.reduce((n, r) => n + r.transport.bytes, 0), inspectionTone};
  const terrain = new THREE.Mesh(geometry(data.terrain, 'render-m', data.anchorSourceMeters, data.resources.view.scope.boundsSourceCm), material);
  terrain.name = 'narva-school-shared-terrain'; root.add(terrain);
  const groups = new Map<SchoolDecodedMesh, PreparedSchoolDisplay['rigid']>();
  for (const row of data.rigid) {const group = groups.get(row.geometry) ?? []; group.push(row); groups.set(row.geometry, group);}
  for (const [decoded, rows] of groups) {
    const meshGeometry = geometry(decoded, 'ue-m', [0, 0, 0]); geometries.set(decoded, meshGeometry);
    const mesh = new THREE.InstancedMesh(meshGeometry, material, rows.length); mesh.name = `narva-school-shared-${rows[0].record.id}`;
    mesh.userData.stableIds = rows.map(r => r.record.id);
    rows.forEach(({record}, i) => {
      const p = record.placement!;
      mesh.setMatrixAt(i, schoolWorldMatrix({translationMeters: p.translationCm.map(v => v / 100) as Vec3, rotationQuaternion: p.rotationQuaternion, scale3d: p.scale3d}, data.anchorSourceMeters));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); root.add(mesh);
  }
  // Calc vegetation has already converted SGVF cm into render-local metres.
  // Re-express its whole world group once; never apply Source TRS a second time.
  const vegetation = new THREE.Group(), axis = (v: Vec3) => new THREE.Vector3(...renderToArmor.direction(v));
  vegetation.name = 'narva-school-shared-vegetation-frame'; vegetation.matrixAutoUpdate = false;
  vegetation.matrix.makeBasis(axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1]));
  vegetation.matrix.setPosition(new THREE.Vector3(...sourceToArmor.position(data.anchorSourceMeters)).negate());
  vegetation.add(data.vegetation.root); root.add(vegetation);
  // Selection retains edge-crossing objects. Clip their display fragments to
  // the scope, rather than dropping instances merely because their origins lie
  // outside it. Planes follow the environment's later vehicle-fit translation.
  const b = data.resources.view.scope.boundsSourceCm, a = data.anchorSourceMeters;
  const localPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), a[0] - b[0] / 100), new THREE.Plane(new THREE.Vector3(-1, 0, 0), b[2] / 100 - a[0]),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), a[1] - b[1] / 100), new THREE.Plane(new THREE.Vector3(0, 0, -1), b[3] / 100 - a[1])];
  const worldPlanes = localPlanes.map(p => p.clone());
  root.userData.requiresLocalClipping = true;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(object.material) ? object.material : [object.material]) {m.clippingPlanes = worldPlanes; m.clipShadows = true;}
    const before = object.onBeforeRender;
    object.onBeforeRender = (...args) => {
      worldPlanes.forEach((plane, i) => plane.copy(localPlanes[i]).applyMatrix4(root.matrixWorld));
      before.apply(object, args);
    };
  });
  let disposed = false;
  root.userData.disposeResourceView = () => {
    if (disposed) return; disposed = true; data.vegetation.dispose(); terrain.geometry.dispose();
    for (const g of geometries.values()) g.dispose();
    for (const child of root.children) if (child instanceof THREE.InstancedMesh) child.dispose();
    material.dispose(); root.clear();
  };
  return root;
}
