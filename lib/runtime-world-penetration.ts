import * as THREE from "three";
import type { EditorNativeBallistics } from "./editor-native-hit-model.ts";
import {
  editorNativeDidPenetrateArmor,
  editorNativePenetrationPrefilter,
  editorNativeTraceIncludesDistance,
  resolveEditorNativePenetrationArithmetic,
} from "./editor-native-penetration.ts";
import type { SchoolRayHit } from "./runtime-narva-school-query.ts";
import type { createSchoolQuery } from "./runtime-narva-school-query.ts";
import type { VehicleProjectileImpactTrace } from "./vehicle-projectile-three-runtime.ts";

/** Post-query material accounting only; it neither guesses a building health
 * pool nor turns the finite damage trace into another flying projectile. */
export function resolveWorldPenetration(
  ballistics: EditorNativeBallistics,
  orderedHits: readonly SchoolRayHit[],
) {
  const hits = orderedHits.filter(hit => editorNativePenetrationPrefilter(hit.surface.considerForPenetration) !== "skip");
  const layers: Array<{ hit: SchoolRayHit; penetrated: boolean | null; availablePenetrationMm: number | null }> = [];
  const first = hits[0]?.distanceM ?? 0;
  let absorbed = 0;
  let terminalDistanceM = first;
  let reason = "未取得参与穿透的表面";
  const { penetrationAtRangeMm, penetrationTraceDistanceM, impactDamageAtRange, traceDistanceAfterPenetrationM } = ballistics;
  if (penetrationAtRangeMm === null || penetrationTraceDistanceM === null || impactDamageAtRange === null || traceDistanceAfterPenetrationM === null) {
    if (hits[0]) layers.push({ hit: hits[0], penetrated: null, availablePenetrationMm: null });
    return { layers, terminalDistanceM, reason: "穿透参数尚未确认", complete: false };
  }
  for (const hit of hits) {
    if (!editorNativeTraceIncludesDistance({ distanceFromFirstHitM: hit.distanceM - first, traceDistanceAfterPenetrationM })) break;
    terminalDistanceM = hit.distanceM;
    if (hit.queryUncertainty) {
      layers.push({ hit, penetrated: null, availablePenetrationMm: null });
      return { layers, terminalDistanceM, reason: hit.queryUncertainty, complete: false };
    }
    const surface = hit.surface;
    const arithmetic = resolveEditorNativePenetrationArithmetic({ distanceFromRayOriginM: hit.distanceM,
      firstDistanceFromRayOriginM: first, penetrationTraceDistanceM, baseDamage: impactDamageAtRange,
      cumulativeDamageAbsorbed: absorbed, penetrationAtRangeMm, incidenceFactor: hit.incidenceFactor });
    let penetrated: boolean | null;
    if (surface.allowPenetration === false) {
      penetrated = false;
      reason = "材质禁止穿透";
    } else if (surface.considerForPenetration !== true || surface.allowPenetration !== true || surface.armorThicknessMm === null) {
      penetrated = null;
      reason = "命中材质尚未确认";
    } else {
      penetrated = arithmetic.remainingDamage > 0 && editorNativeDidPenetrateArmor(arithmetic.availablePenetrationMm, surface.armorThicknessMm);
      reason = penetrated ? "穿透" : "穿透能力不足";
    }
    layers.push({ hit, penetrated, availablePenetrationMm: arithmetic.availablePenetrationMm });
    if (penetrated !== true) return { layers, terminalDistanceM, reason, complete: penetrated !== null };
    if (surface.damageAbsorbed === null) return { layers, terminalDistanceM, reason: "材质吸收尚未确认", complete: false };
    absorbed = Math.fround(absorbed + surface.damageAbsorbed);
    if (absorbed >= impactDamageAtRange) return { layers, terminalDistanceM, reason: "剩余伤害耗尽", complete: true };
  }
  if (layers.length) {
    terminalDistanceM = first + traceDistanceAfterPenetrationM;
    reason = "到达穿透查询末端";
  }
  return { layers, terminalDistanceM, reason, complete: layers.length > 0 };
}

export function buildSchoolImpactTrace({ query, offset, hit, center, direction, timeSeconds, ballistics, armed, terminalImpact }: {
  query: ReturnType<typeof createSchoolQuery>; offset: THREE.Vector3; hit: SchoolRayHit;
  center: THREE.Vector3; direction: THREE.Vector3; timeSeconds: number;
  ballistics: EditorNativeBallistics; armed: boolean; terminalImpact: boolean;
}): VehicleProjectileImpactTrace {
  const cm = (p: THREE.Vector3) => ({ x:p.x * 100, y:p.z * 100, z:p.y * 100 });
  const trace: VehicleProjectileImpactTrace = { timeSeconds,
    pointsCm:[cm(hit.point.clone().addScaledVector(direction,-3)),cm(hit.point)],
    contacts:[{pointCm:cm(hit.point),penetrated:null}], summary:"最近命中 · 碰撞点" };
  if (!terminalImpact) { trace.summary = "最近命中 · 反弹/停驻碰撞"; return trace; }
  if (!armed) { trace.summary = "最近命中 · 引信未解锁，弹体停止"; return trace; }
  if (ballistics.isExplosive !== false) {
    trace.summary = "最近命中 · 弹体停止；爆炸后效未模拟";
    return trace;
  }
  if (ballistics.traceDistanceAfterPenetrationM === null) {
    trace.summary = "最近命中 · 穿透查询距离尚未确认";
    return trace;
  }
  // PostImpactBulletTrace starts one centimetre before FHitResult.Location
  // (sphere centre), not before its distinct surface ImpactPoint.
  const start = center.clone().addScaledVector(direction,-.01);
  const queryLengthM = ballistics.traceDistanceAfterPenetrationM + .01;
  const hits = query.postImpact(start,direction,queryLengthM,offset).map(row=>row.hit);
  const result = resolveWorldPenetration(ballistics,hits);
  const last = result.layers.at(-1);
  if (last) {
    // A later surface contact must not extend the source query endpoint by the
    // swept sphere radius, even if material falloff still allows penetration.
    const end = start.clone().addScaledVector(direction,Math.min(result.terminalDistanceM,queryLengthM));
    trace.pointsCm = [trace.pointsCm[0], ...result.layers.map(layer=>cm(layer.hit.point)), cm(end)];
    trace.contacts = result.layers.map(layer=>({pointCm:cm(layer.hit.point),penetrated:layer.penetrated}));
  }
  const passed = result.layers.filter(layer=>layer.penetrated === true).length;
  trace.summary = result.complete ? `最近命中 · 穿透参考 ${passed} 层 · ${result.reason}`
    : `最近命中 · 穿透未确认${passed ? `（参考通过 ${passed} 层）` : ""} · ${result.reason}`;
  return trace;
}
