import * as THREE from "three";
import { wikiMapUrl } from "./wiki-source.ts";

type Vec3 = [number, number, number];
type Resource = { url: string; bytes: number };
type Placement = {
  stableId: number;
  prototypeId: string;
  sourceTransform: {
    translationMeters: Vec3;
    rotationQuaternion: [number, number, number, number];
    scale3d: Vec3;
  };
};
export type SchoolScene = {
  schemaVersion: string;
  id: string;
  sourceBuildId: string;
  fixtures: { footballPitch: { boundsSourceMeters: [number, number, number, number]; goalpostStableIds: number[] } };
  prototypes: Array<{ id: string; meshPath: string }>;
  placements: Placement[];
  terrain: Resource & {
    grid: { width: number; height: number; originSourceMeters: [number, number]; stepMeters: number };
    layerNames: string[];
  };
};
export type FixedDisplay = {
  schemaVersion: string;
  policy: { cameraDistanceLod: boolean };
  prototypes: Array<{
    meshPath: string;
    renderRoute: string;
    geometry: Resource | null;
  }>;
};
type DecodedMesh = { positions: Float32Array; colorsRgb: Uint8Array; indices: Uint32Array };
type Terrain = DecodedMesh & { anchorSourceMeters: Vec3 };
type SchoolPlan = ReturnType<typeof planNarvaSchoolEnvironment>;
type EnvironmentData = { plan: SchoolPlan; terrain: Terrain; meshes: Map<string, DecodedMesh> };

export function planNarvaSchoolEnvironment(scene: SchoolScene, display: FixedDisplay) {
  if (scene.schemaVersion !== "sigua-infantry-narva-scene/v2" ||
      display.schemaVersion !== "sigua-narva-fixed-display/v1" ||
      display.policy.cameraDistanceLod !== false) {
    throw new Error("Narva 学校场景需要无 LOD 的 FixedDisplay 资源");
  }
  const prototypes = new Map(scene.prototypes.map((row) => [row.id, row]));
  const groups = new Map<string, { resource: Resource; placements: Placement[] }>();
  for (const placement of scene.placements) {
    const prototype = prototypes.get(placement.prototypeId);
    // The two publications have different prototype numbering; only the exact
    // source mesh path is shared. Never join their integer indices.
    const matches = display.prototypes.filter((row) => row.meshPath === prototype?.meshPath);
    const record = matches[0];
    if (matches.length !== 1 || record.renderRoute !== "fixed-display-geometry" || !record.geometry) {
      throw new Error(`Narva 场景缺少固定着色模型：${prototype?.meshPath ?? placement.prototypeId}`);
    }
    const group = groups.get(record.geometry.url) ?? { resource: record.geometry, placements: [] };
    group.placements.push(placement);
    groups.set(record.geometry.url, group);
  }
  const pitch = scene.fixtures.footballPitch;
  if (pitch.goalpostStableIds.some((id) => !scene.placements.some((row) => row.stableId === id))) {
    throw new Error("Narva 学校场景未包含完整足球场");
  }
  return {
    id: scene.id,
    centerSourceMeters: [
      (pitch.boundsSourceMeters[0] + pitch.boundsSourceMeters[2]) / 2,
      (pitch.boundsSourceMeters[1] + pitch.boundsSourceMeters[3]) / 2,
    ] as [number, number],
    groups: [...groups.values()],
    placementCount: scene.placements.length,
    resourceBytes: scene.terrain.bytes + [...groups.values()].reduce((sum, row) => sum + row.resource.bytes, 0),
  };
}

// Armor uses metres and [source X, source Z, source Y], unlike the Z-up
// map viewer. Reflect geometry AND conjugate placements exactly once.
const sourceToViewer = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

export function narvaPlacementMatrix(placement: Placement, anchor: Vec3) {
  const transform = placement.sourceTransform;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.translationMeters).sub(new THREE.Vector3(...anchor)),
    new THREE.Quaternion(...transform.rotationQuaternion).normalize(),
    new THREE.Vector3(...transform.scale3d),
  );
  return matrix.premultiply(sourceToViewer).multiply(sourceToViewer);
}

const terrainPalette: Record<string, number> = {
  NoGrass: 0x597344, Mud: 0x5c4c38, Gravel: 0x8a8273,
  Stones: 0x6e6b66, Grass: 0x526c3e, Asphalt: 0x41433f,
};

export function decodeSchoolTerrain(scene: SchoolScene, buffer: ArrayBuffer, center: [number, number]): Terrain {
  const view = new DataView(buffer);
  const { width, height, originSourceMeters: [originX, originY], stepMeters: step } = scene.terrain.grid;
  const layers = scene.terrain.layerNames.length;
  const vertices = width * height;
  if (buffer.byteLength !== 32 + vertices * (4 + layers) ||
      String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== "SGNT" || view.getUint32(4, true) !== 3 ||
      view.getUint32(8, true) !== width || view.getUint32(12, true) !== height ||
      view.getInt32(16, true) !== originX || view.getInt32(20, true) !== originY ||
      view.getFloat32(24, true) !== step || view.getUint32(28, true) !== layers) {
    throw new Error("Narva 学校地形格式或范围不匹配");
  }
  const x = (center[0] - originX) / step, y = (center[1] - originY) / step;
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) throw new Error("足球场中心不在地形内");
  const column = Math.floor(x), row = Math.floor(y), fx = x - column, fy = y - row;
  const at = (dx: number, dy: number) => view.getFloat32(32 + ((row + dy) * width + column + dx) * 4, true);
  const elevation = fx >= fy
    ? at(0, 0) * (1 - fx) + at(1, 0) * (fx - fy) + at(1, 1) * fy
    : at(0, 0) * (1 - fy) + at(1, 1) * fx + at(0, 1) * (fy - fx);
  const anchorSourceMeters: Vec3 = [center[0], center[1], elevation];
  const positions = new Float32Array(vertices * 3), colorsRgb = new Uint8Array(vertices * 3);
  const weights = new Uint8Array(buffer, 32 + vertices * 4);
  const palette = scene.terrain.layerNames.map((name) => new THREE.Color(terrainPalette[name] ?? 0x526c3e));
  const color = new THREE.Color();
  for (let index = 0; index < vertices; index++) {
    // SGNT heights already contain the Landscape actor translation.
    positions.set([originX + (index % width) * step - center[0],
      view.getFloat32(32 + index * 4, true) - elevation,
      originY + Math.floor(index / width) * step - center[1]], index * 3);
    color.setRGB(0, 0, 0);
    let total = 0;
    for (let layer = 0; layer < layers; layer++) {
      const weight = weights[index * layers + layer];
      total += weight;
      color.r += palette[layer].r * weight;
      color.g += palette[layer].g * weight;
      color.b += palette[layer].b * weight;
    }
    if (total) color.multiplyScalar(1 / total);
    else color.copy(palette[0]);
    colorsRgb.set([color.r, color.g, color.b].map((channel) => Math.round(channel * 255)), index * 3);
  }
  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < height - 1; row++) for (let column = 0; column < width - 1; column++) {
    const a = row * width + column, b = a + 1, c = a + width, d = c + 1;
    indices.set([a, d, b, a, c, d], cursor);
    cursor += 6;
  }
  return { positions, colorsRgb, indices, anchorSourceMeters };
}

let schoolRequest: Promise<EnvironmentData> | null = null;
let sourceRequest: Promise<{ scene: SchoolScene; terrainBuffer: ArrayBuffer }> | null = null;

export async function fetchNarvaSchoolResource(path: string) {
  const response = await fetch(wikiMapUrl(path), { credentials: "omit" });
  if (!response.ok) throw new Error(`Narva 场景资源 ${path} 返回 HTTP ${response.status}`);
  return response;
}

// Display and ExactQuery share the source descriptor and native heightfield,
// not a rendered mesh. Either consumer can load without the other.
export function loadNarvaSchoolSource() {
  sourceRequest ??= (async () => {
    const scene = await (await fetchNarvaSchoolResource("/data/maps/narva/infantry-scene.json")).json() as SchoolScene;
    const terrainBuffer = await (await fetchNarvaSchoolResource(scene.terrain.url)).arrayBuffer();
    return { scene, terrainBuffer };
  })().catch(error => { sourceRequest = null; throw error; });
  return sourceRequest;
}

export function loadNarvaSchoolEnvironment(): Promise<EnvironmentData> {
  if (schoolRequest) return schoolRequest;
  schoolRequest = (async () => {
    const algorithmUrl = wikiMapUrl("/algorithms/maps/fixed-display-format.js");
    const [{ scene, terrainBuffer }, display, algorithm] = await Promise.all([
      loadNarvaSchoolSource(),
      fetchNarvaSchoolResource("/data/maps/narva/fixed-display.json").then((response) => response.json()) as Promise<FixedDisplay>,
      import(/* @vite-ignore */ algorithmUrl) as Promise<{ decodeFixedDisplayMesh(buffer: ArrayBuffer): DecodedMesh }>,
    ]);
    const plan = planNarvaSchoolEnvironment(scene, display);
    const resources = plan.groups.map((group) => group.resource);
    const buffers = new Map<string, ArrayBuffer>();
    let next = 0;
    // Only the school subset is transferred. Four concurrent reads leave room
    // for the vehicle; parsed immutable arrays are reused across viewer mounts.
    await Promise.all(Array.from({ length: Math.min(4, resources.length) }, async () => {
      while (next < resources.length) {
        const resource = resources[next++];
        const buffer = await (await fetchNarvaSchoolResource(resource.url)).arrayBuffer();
        if (buffer.byteLength !== resource.bytes) throw new Error(`Narva 场景资源不完整：${resource.url}`);
        buffers.set(resource.url, buffer);
      }
    }));
    return {
      plan,
      terrain: decodeSchoolTerrain(scene, terrainBuffer, plan.centerSourceMeters),
      meshes: new Map(plan.groups.map(({ resource }) => [resource.url, algorithm.decodeFixedDisplayMesh(buffers.get(resource.url)!)])),
    };
  })().catch((error) => { schoolRequest = null; throw error; });
  return schoolRequest;
}

function geometryFor(data: DecodedMesh, sourceFrame: boolean) {
  const positions = data.positions.slice(), indices = data.indices.slice();
  if (sourceFrame) {
    for (let index = 0; index < positions.length; index += 3) {
      [positions[index + 1], positions[index + 2]] = [positions[index + 2], positions[index + 1]];
    }
    for (let index = 0; index < indices.length; index += 3) {
      [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(data.colorsRgb, 3, true));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function createNarvaSchoolEnvironment(data: EnvironmentData) {
  const root = new THREE.Group();
  root.name = "narva-school-fixed-display";
  root.userData = { sceneId: data.plan.id, cameraDistanceLod: false, collisionAuthority: false,
    anchorSourceMeters: data.terrain.anchorSourceMeters, placementCount: data.plan.placementCount,
    resourceBytes: data.plan.resourceBytes };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0,
    flatShading: true, side: THREE.DoubleSide });
  const terrain = new THREE.Mesh(geometryFor(data.terrain, false), material);
  terrain.name = "narva-school-source-terrain";
  root.add(terrain);
  for (const group of data.plan.groups) {
    const mesh = new THREE.InstancedMesh(geometryFor(data.meshes.get(group.resource.url)!, true), material, group.placements.length);
    mesh.name = `narva-school-${group.placements[0].prototypeId}`;
    mesh.userData.stableIds = group.placements.map((row) => row.stableId);
    group.placements.forEach((placement, index) => mesh.setMatrixAt(index, narvaPlacementMatrix(placement, data.terrain.anchorSourceMeters)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return root;
}
