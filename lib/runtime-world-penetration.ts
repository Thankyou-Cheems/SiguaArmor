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
import { resolveNativeRepeatingActor, type NativeWeaponArmorCache } from "./editor-native-hit-state.ts";

/** Post-query material accounting only; it neither guesses a building health
 * pool nor turns the finite damage trace into another flying projectile. */
export function resolveWorldPenetration(
  ballistics: EditorNativeBallistics,
  orderedHits: readonly SchoolRayHit[],
  evaluateHit?: (hit: SchoolRayHit) => Pick<EditorNativeBallistics, "penetrationAtRangeMm" | "impactDamageAtRange">,
  armorCache?: NativeWeaponArmorCache,
) {
  const hits = orderedHits.filter(hit => editorNativePenetrationPrefilter(hit.surface.considerForPenetration) !== "skip");
  const layers: Array<{ hit: SchoolRayHit; penetrated: boolean | null; availablePenetrationMm: number | null;
    remainingDamage?: number; dispatchedPointDamage?: number | null }> = [];
  const first = hits[0]?.distanceM ?? 0;
  let absorbed = 0;
  const seenActors = new Set<string>();
  let terminalDistanceM = first;
  let reason = "未取得参与穿透的表面";
  const { penetrationTraceDistanceM, traceDistanceAfterPenetrationM } = ballistics;
  if (penetrationTraceDistanceM === null || traceDistanceAfterPenetrationM === null) {
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
    if (hit.receiver) {
      if (surface.damageParentActor === undefined) {
        layers.push({ hit, penetrated: null, availablePenetrationMm: null });
        return { layers, terminalDistanceM, reason: "材质的 Actor 结算标志尚未确认", complete: false };
      }
      const flags = resolveNativeRepeatingActor(seenActors, hit.receiver, surface.damageParentActor);
      // In DealDamage a cleared actor bit can fall back to SQVehicleComponent.
      // A source-locked static actor has no such receiver: it returns true
      // before range sampling, armor testing, damage dispatch or absorption.
      if (!flags.useActor) {
        if (surface.allowPenetration === false) return { layers, terminalDistanceM,
          reason: "重复 Actor；后续查询已被材质截断", complete: true };
        continue;
      }
    }
    const { penetrationAtRangeMm, impactDamageAtRange } = evaluateHit?.(hit) ?? ballistics;
    if (penetrationAtRangeMm === null || impactDamageAtRange === null) {
      layers.push({ hit, penetrated: null, availablePenetrationMm: null });
      return { layers, terminalDistanceM, reason: "命中层的距离/伤害参数尚未确认", complete: false };
    }
    const arithmetic = resolveEditorNativePenetrationArithmetic({ distanceFromRayOriginM: hit.distanceM,
      firstDistanceFromRayOriginM: first, penetrationTraceDistanceM, baseDamage: impactDamageAtRange,
      cumulativeDamageAbsorbed: absorbed, penetrationAtRangeMm, incidenceFactor: hit.incidenceFactor,
      nativeTraceDistanceM: hit.traceDistanceM });
    let availablePenetrationMm: number | null = arithmetic.availablePenetrationMm;
    let penetrated: boolean | null;
    if (surface.allowPenetration === false) {
      penetrated = false;
      reason = "材质禁止穿透";
    } else if (surface.considerForPenetration !== true || surface.allowPenetration !== true || surface.armorThicknessMm === null) {
      penetrated = null;
      reason = "命中材质尚未确认";
    } else {
      // DidPenetrateArmor only enters incidence/range arithmetic for a positive
      // material threshold. DealDamage still requires positive remaining damage.
      if (arithmetic.remainingDamage <= 0) penetrated = false;
      else {
        const thickness = surface.armorThicknessMm;
        const compute = () => ({ penetrated: thickness <= 0 ||
          editorNativeDidPenetrateArmor(arithmetic.availablePenetrationMm, thickness),
          availablePenetrationMm: arithmetic.availablePenetrationMm });
        const decision = armorCache && hit.nativeHitKey ? armorCache.evaluate(hit.nativeHitKey, compute) : compute();
        penetrated = decision.penetrated;
        availablePenetrationMm = decision.availablePenetrationMm;
      }
      reason = penetrated ? "穿透" : "穿透能力不足";
    }
    const dispatchedPointDamage = penetrated !== true || surface.damageParentActor === false || hit.receiver?.canBeDamaged === false
      ? 0 : hit.receiver?.canBeDamaged === true && surface.damageParentActor === true ? arithmetic.remainingDamage : null;
    layers.push({ hit, penetrated, availablePenetrationMm, remainingDamage:arithmetic.remainingDamage, dispatchedPointDamage });
    if (penetrated !== true) return { layers, terminalDistanceM, reason, complete: penetrated !== null };
    if (surface.damageAbsorbed === null) return { layers, terminalDistanceM, reason: "材质吸收尚未确认", complete: false };
    absorbed = Math.fround(absorbed + surface.damageAbsorbed);
    // Native compares the current absorption with damage remaining BEFORE this
    // layer, strictly. Equality reaches the next receiver's own damage curve.
    if (surface.damageAbsorbed > arithmetic.remainingDamage) return { layers, terminalDistanceM, reason: "剩余伤害耗尽", complete: true };
  }
  if (layers.length) {
    terminalDistanceM = first + traceDistanceAfterPenetrationM;
    reason = "到达穿透查询末端";
  }
  return { layers, terminalDistanceM, reason, complete: layers.length > 0 };
}

export function buildSchoolImpactTrace({ query, offset, hit, direction, timeSeconds, ballistics, armed, terminalImpact, evaluateHit, armorCache }: {
  query: ReturnType<typeof createSchoolQuery>; offset: THREE.Vector3; hit: SchoolRayHit;
  center: THREE.Vector3; direction: THREE.Vector3; timeSeconds: number;
  ballistics: EditorNativeBallistics; armed: boolean; terminalImpact: boolean;
  evaluateHit?: Parameters<typeof resolveWorldPenetration>[2];
  armorCache?: NativeWeaponArmorCache;
}): VehicleProjectileImpactTrace {
  const cm = (p: THREE.Vector3) => ({ x:p.x * 100, y:p.z * 100, z:p.y * 100 });
  const trace: VehicleProjectileImpactTrace = { timeSeconds,
    pointsCm:[cm(hit.point.clone().addScaledVector(direction,-3)),cm(hit.point)],
    contacts:[{pointCm:cm(hit.point),penetrated:null}], summary:"最近命中 · 碰撞点" };
  if (hit.queryUncertainty) { trace.summary=`最近命中 · 穿透未确认 · ${hit.queryUncertainty}`;return trace; }
  if (!terminalImpact) { trace.summary = "最近命中 · 反弹/停驻碰撞"; return trace; }
  if (!armed) { trace.summary = "最近命中 · 引信未解锁，弹体停止"; return trace; }
  const pointBeforeExplosion = ballistics.isExplosive === true &&
    ballistics.impactRadialOrderSourceKnown === true &&
    ballistics.impactRadialOrder === "point-before-radial" &&
    ballistics.penetrationAtRangeMm !== null && ballistics.penetrationAtRangeMm > 0 &&
    ballistics.impactDamageAtRange !== null && ballistics.impactDamageAtRange > 0;
  if (ballistics.isExplosive !== false && !pointBeforeExplosion) {
    trace.summary = "最近命中 · 弹体停止；爆炸与穿透顺序未确认";
    return trace;
  }
  if (ballistics.traceDistanceAfterPenetrationM === null) {
    trace.summary = "最近命中 · 穿透查询距离尚未确认";
    return trace;
  }
  // Start at the contact point, not the swept sphere centre;
  // using the swept sphere centre shifts both ends by the projectile radius.
  const start = hit.point.clone().addScaledVector(direction,-.01);
  // Native converts the authored float metres to float32 centimetres and
  // clamps the forward span; the start independently backsteps one centimetre.
  const queryLengthM = Math.max(Math.fround(Math.fround(ballistics.traceDistanceAfterPenetrationM) * 100), 1) / 100 + .01;
  const sourcePoint = hit.sourcePointCm;
  const sourceDirection = [direction.x,direction.z,direction.y];
  const spanCm = Math.max(Math.fround(Math.fround(ballistics.traceDistanceAfterPenetrationM)*100),1);
  const sourceSegment = sourcePoint ? {
    startCm:sourcePoint.map((v,i)=>v-sourceDirection[i]) as [number,number,number],
    endCm:sourcePoint.map((v,i)=>v+sourceDirection[i]*spanCm) as [number,number,number],
  } : undefined;
  const hits = query.postImpact(start,direction,queryLengthM,offset,sourceSegment).map(row=>row.hit);
  const result = resolveWorldPenetration(ballistics,hits,evaluateHit,armorCache);
  const last = result.layers.at(-1);
  if (last) {
    // Clamp to the actual source query endpoint even when skipped surfaces
    // make the first admitted penetration layer occur farther along the ray.
    const end = start.clone().addScaledVector(direction,Math.min(result.terminalDistanceM,queryLengthM));
    trace.pointsCm = [trace.pointsCm[0], ...result.layers.map(layer=>cm(layer.hit.point)), cm(end)];
    trace.contacts = result.layers.map(layer=>({pointCm:cm(layer.hit.point),penetrated:layer.penetrated,
      remainingDamage:layer.remainingDamage,dispatchedPointDamage:layer.dispatchedPointDamage,receiverActorId:layer.hit.receiver?.actorId}));
  }
  const passed = result.layers.filter(layer=>layer.penetrated === true).length;
  trace.summary = result.complete ? `最近命中 · 穿透参考 ${passed} 层 · ${result.reason}`
    : `最近命中 · 穿透未确认${passed ? `（参考通过 ${passed} 层）` : ""} · ${result.reason}`;
  if (pointBeforeExplosion) trace.summary += "；爆炸范围伤害未模拟";
  if (last?.remainingDamage !== undefined) trace.summary += ` · 末层入射伤害 ${Math.max(0,last.remainingDamage).toFixed(1)}`;
  return trace;
}
