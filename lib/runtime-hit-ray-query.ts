import { Matrix3, Vector3, type Mesh, type Object3D, type Raycaster } from "three";
import type { EditorNativeIntersection } from "./editor-native-hit-model.ts";
import type { ParsedHitSceneRecord } from "./hit-scene-record.ts";

export type RuntimeHitRayQuery = (raycaster: Raycaster) => EditorNativeIntersection[];

/**
 * Prepare once for a synchronous set of rays against an unchanged scene.
 * Keep this query inside the current frame callback; prepare again after any
 * camera/vehicle interaction or asynchronous yield. Single clicks prepare their
 * own query. Geometry, all-hit ordering and signed incidence stay unchanged.
 */
export function prepareRuntimeHitRayQuery(
  modelGroup: Object3D,
  parsed: ParsedHitSceneRecord,
  analysisMesh: Mesh,
): RuntimeHitRayQuery {
  modelGroup.updateMatrixWorld(true);
  const normalMatrix = new Matrix3().getNormalMatrix(analysisMesh.matrixWorld);
  return (raycaster) => raycaster.intersectObject(analysisMesh, false)
    .flatMap<EditorNativeIntersection>((intersection) => {
      const triangleIndex = intersection.faceIndex;
      if (triangleIndex === undefined || triangleIndex === null || !intersection.face) return [];
      const componentIndex = parsed.triangleComponentIndex[triangleIndex];
      const surfaceProfileIndex = parsed.triangleSurfaceProfileIndex[triangleIndex];
      if (componentIndex === undefined || surfaceProfileIndex === undefined) return [];
      const normal = new Vector3()
        .fromArray(parsed.faceNormals, triangleIndex * 3)
        .normalize()
        .applyNormalMatrix(normalMatrix)
        .normalize();
      return [{
        triangleIndex,
        componentIndex,
        surfaceProfileIndex,
        distanceFromRayOriginM: intersection.distance,
        point: [intersection.point.x, intersection.point.y, intersection.point.z] as const,
        faceNormal: [normal.x, normal.y, normal.z] as const,
        incidenceFactor: -raycaster.ray.direction.dot(normal),
      }];
    });
}
