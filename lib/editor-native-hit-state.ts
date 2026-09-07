/** SDK v10.5.3 weapon-side state. Actor identity is shared across ISM instances;
 * an instance, triangle or component ID is not an Actor identity. */
export type NativeTraceReceiver = {
  kind: "static-actor";
  actorId: string;
  actorLocationCm: readonly [number, number, number];
  passesDamageToParent: boolean;
  attachParentActorId: string | null;
};

export function resolveNativeRepeatingActor(
  seen: Set<string>, receiver: NativeTraceReceiver, damageParentActor: boolean,
) {
  let useActor = true, forwardDamageToParent = true;
  // PostImpact invokes HandleRepeatingActors only when the material's
  // DamageParentActor flag is set. The flag is not an absorption multiplier.
  if (damageParentActor) {
    if (receiver.passesDamageToParent && receiver.attachParentActorId !== null) {
      if (seen.has(receiver.attachParentActorId)) forwardDamageToParent = false;
      else seen.add(receiver.attachParentActorId);
    }
    if (seen.has(receiver.actorId)) useActor = false;
    else seen.add(receiver.actorId);
  }
  return { useActor, forwardDamageToParent };
}

export type NativeArmorHitKey = {
  distanceCm: number;
  timeFraction: number;
  impactPointCm: readonly [number, number, number];
};
export type NativeArmorDecision = { penetrated: boolean; availablePenetrationMm: number | null };

/** One last-result cache owned by a weapon, not a map of surfaces or a shot.
 * The caller controls its lifetime. Unknown cache history must not be presented
 * as a resumed native weapon. The native zero-initialized key also compares. */
export class NativeWeaponArmorCache {
  private key: NativeArmorHitKey = { distanceCm: 0, timeFraction: 0, impactPointCm: [0, 0, 0] };
  private decision: NativeArmorDecision = { penetrated: false, availablePenetrationMm: null };

  evaluate(key: NativeArmorHitKey, compute: () => NativeArmorDecision) {
    const distanceCm = Math.fround(key.distanceCm), timeFraction = Math.fround(key.timeFraction);
    if (distanceCm === this.key.distanceCm && timeFraction === this.key.timeFraction &&
      key.impactPointCm.every((value, index) => value === this.key.impactPointCm[index])) {
      return { ...this.decision, cached: true };
    }
    const decision = compute();
    this.key = { distanceCm, timeFraction, impactPointCm: [...key.impactPointCm] };
    this.decision = { ...decision };
    return { ...decision, cached: false };
  }
}
