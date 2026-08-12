import {
  isEditorNativeComponentForwardedDamageEvent,
  type EditorNativeDamageEvent,
} from "./editor-native-hit-model.ts";
import {
  explosiveDamageTypeIconKinds,
  type VehicleDamageTypeIconKind,
} from "./vehicle-damage-type-icons.ts";

export interface EditorDamageSettlementSummary {
  key: string;
  damageKind: EditorNativeDamageEvent["damageKind"];
  damageTypeKind: VehicleDamageTypeIconKind | null;
  incomingDamage: number;
  damageTypeModifier: number;
  routeMultiplier: number;
  effectiveDamage: number;
  targets: EditorDamageSettlementTarget[];
}

export interface EditorDamageSettlementTarget {
  poolId: string;
  poolKind: string;
  effectiveDamage: number;
  forwarded: boolean;
}

function editorDamageChainAmount(event: EditorNativeDamageEvent) {
  return event.certainty === "resolved" && Number.isFinite(event.poolDamage)
    ? Math.max(0, event.poolDamage)
    : 0;
}

export function summarizeEditorDamageSettlements(
  events: readonly EditorNativeDamageEvent[],
) {
  const summaries = new Map<string, EditorDamageSettlementSummary>();
  events.forEach((event) => {
    const damageTypeKind = event.damageKind === "radial"
      ? explosiveDamageTypeIconKinds(true, event.damageTypePath ?? null)[0] ?? "generic"
      : null;
    const key = [
      event.damageKind,
      damageTypeKind,
      event.incomingDamage,
      event.damageTypeModifier,
      event.routeMultiplier,
    ].join(":");
    const target = {
      poolId: event.poolId,
      poolKind: event.poolKind,
      // The chain shows the full damage submitted to each node. The outcome
      // summary separately uses effectiveDamage, capped by that pool's health.
      effectiveDamage: editorDamageChainAmount(event),
      forwarded: isEditorNativeComponentForwardedDamageEvent(event),
    };
    const existing = summaries.get(key);
    if (existing) {
      existing.effectiveDamage = Math.max(existing.effectiveDamage, target.effectiveDamage);
      existing.targets.push(target);
      return;
    }
    summaries.set(key, {
      key,
      damageKind: event.damageKind,
      damageTypeKind,
      incomingDamage: event.incomingDamage,
      damageTypeModifier: event.damageTypeModifier,
      routeMultiplier: event.routeMultiplier,
      effectiveDamage: target.effectiveDamage,
      targets: [target],
    });
  });
  return [...summaries.values()].map((summary) => ({
    ...summary,
    targets: summary.targets.toSorted(
      (left, right) => Number(left.forwarded) - Number(right.forwarded),
    ),
  }));
}
