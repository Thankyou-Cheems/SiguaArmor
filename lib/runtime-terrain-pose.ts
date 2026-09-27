import type { RuntimeGroundedPose } from "./runtime-grounded-pose.ts";

export type TerrainPose = {
  id: string; label: string; originSourceCm: number[];
  chassis: { gltfMatrix: number[]; pitchDeg: number; rollDeg: number };
  rigs: RuntimeGroundedPose["rigs"]; bindings: RuntimeGroundedPose["bindings"];
  result: { status: "friction-unknown"; bodyCoverage: "complete"; blocked: false;
    bodyShapeCount: number; relativeResidual: number; maxPenetrationM: number;
    supportMarginM: number; activeSupports: number; totalSupports: number; stationaryCandidate: false };
};
export type TerrainPoseSet = {
  schemaVersion: "sigua-vehicle-terrain-poses/v1"; sourceBuildId: string; generatedClass: string;
  method: "quasi-static-vertical-reactions/v1"; basis: "gltf-y-up-metres-parent-local";
  flatReferenceSha256: string;
  scene: { id: "narva-school"; sourceBuildId: string; anchorSourceCm: number[];
    query: { url: string; sha256: string }; display: { url: string; sha256: string } };
  presets: TerrainPose[];
};
const hash = (value: string) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const vector = (v: number[], n: number) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const matrix = (v: number[]) => vector(v,16) && [v[3],v[7],v[11],v[15]-1].every(x=>Math.abs(x)<1e-9) &&
  Math.abs(v[0]*(v[5]*v[10]-v[9]*v[6])-v[4]*(v[1]*v[10]-v[9]*v[2])+v[8]*(v[1]*v[6]-v[5]*v[2]))>1e-12;

/** Separate admission: a terrain reduction cannot enter the native flat-pose
 * importer. Existing model occurrence bindings still apply without guessing. */
export function validateTerrainPoseSet(value: unknown, generatedClass: string): TerrainPoseSet {
  const set = value as TerrainPoseSet;
  if (set?.schemaVersion !== "sigua-vehicle-terrain-poses/v1" || set.generatedClass !== generatedClass ||
    set.method !== "quasi-static-vertical-reactions/v1" || set.basis !== "gltf-y-up-metres-parent-local" ||
    !hash(set.flatReferenceSha256) || set.scene?.id !== "narva-school" || typeof set.sourceBuildId!=="string" || !set.sourceBuildId || set.sourceBuildId !== set.scene.sourceBuildId ||
    !vector(set.scene.anchorSourceCm,3) || set.scene.query?.url !== "/data/maps/narva/native-query.json" ||
    set.scene.display?.url !== "/data/maps/narva/school-display.json" || !hash(set.scene.query.sha256) || !hash(set.scene.display.sha256) ||
    !Array.isArray(set.presets) || !set.presets.length || new Set(set.presets.map(p=>p.id)).size !== set.presets.length) {
    throw new Error("地形姿态来源或场景身份不匹配");
  }
  for (const pose of set.presets) {
    const r=pose.result;
    if (!/^[a-z0-9-]+$/u.test(pose.id) || !pose.label || !vector(pose.originSourceCm,3) || !matrix(pose.chassis?.gltfMatrix) ||
      ![pose.chassis.pitchDeg,pose.chassis.rollDeg].every(Number.isFinite) || r?.status !== "friction-unknown" ||
      r.bodyCoverage !== "complete" || r.blocked !== false || r.stationaryCandidate !== false ||
      !Number.isInteger(r.bodyShapeCount) || r.bodyShapeCount < 1 || !Number.isFinite(r.relativeResidual) || r.relativeResidual < 0 || r.relativeResidual >= 1e-4 ||
      !Number.isFinite(r.maxPenetrationM) || r.maxPenetrationM < 0 || r.maxPenetrationM > .0005 || !(r.supportMarginM>0) ||
      !Number.isInteger(r.activeSupports) || !Number.isInteger(r.totalSupports) || r.activeSupports < 3 || r.activeSupports > r.totalSupports ||
      !Array.isArray(pose.rigs) || !pose.rigs.length || !Array.isArray(pose.bindings) || !pose.bindings.length) throw new Error("地形姿态未通过完整车体与支撑检查");
    for (const rig of pose.rigs) {
      if (!Array.isArray(rig.boneNames) || !rig.boneNames.length || !rig.boneNames.every(n=>typeof n==="string"&&n.length>0) ||
        new Set(rig.boneNames).size!==rig.boneNames.length || rig.localMatrices?.length!==rig.boneNames.length*16) throw new Error("地形骨骼绑定不完整");
      for(let i=0;i<rig.boneNames.length;i++)if(!matrix(rig.localMatrices.slice(i*16,i*16+16)))throw new Error("地形骨骼矩阵无效");
    }
    const ids=new Set<string>();
    for(const b of pose.bindings){const id=`${b.stableOccurrenceId}\0${b.assetUrl}`;
      if(!b.stableOccurrenceId||!b.sourceMeshPath||!/^\/assets\/runtime-probe\/models\/[a-f0-9]{64}\.gltf$/u.test(b.assetUrl)||
        !Number.isInteger(b.rigIndex)||!pose.rigs[b.rigIndex]||ids.has(id))throw new Error("地形模型绑定无效");ids.add(id);
    }
  }
  return set;
}

export function terrainPoseLocalMatrices(pose: TerrainPose | null, placement: {stableOccurrenceId:string;assetUrl:string;sourceMeshPath:string}) {
  if (!pose) return undefined;
  const matches=pose.bindings.filter(b=>b.stableOccurrenceId===placement.stableOccurrenceId&&b.assetUrl===placement.assetUrl&&b.sourceMeshPath===placement.sourceMeshPath);
  if(matches.length!==1)return undefined;
  const rig=pose.rigs[matches[0].rigIndex];
  return Object.fromEntries(rig.boneNames.map((name,i)=>[name,rig.localMatrices.slice(i*16,i*16+16)]));
}

export function terrainEnvironmentOffset(set: TerrainPoseSet, pose: TerrainPose) {
  const delta=set.scene.anchorSourceCm.map((v,i)=>(v-pose.originSourceCm[i])/100);
  return [delta[0],delta[2],delta[1]];
}
