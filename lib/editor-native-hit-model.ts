import {
  normalizeHitIntersections,
  type HitVector3,
} from "./hit-intersection-ordering.ts";

export type EditorEvidenceState =
  | "observed"
  | "derived"
  | "absent"
  | "unresolved"
  | "unreadable"
  | "native-unknown";

export interface EditorEvidenceLike<T> {
  value: T | null;
  state: EditorEvidenceState;
  reason?: string | null;
}

export type EditorField<T> = T | EditorEvidenceLike<T> | null;

export interface EditorNativeCurveKey {
  time: number;
  value: number;
  interpMode?: string | null;
  tangentMode?: string | null;
  arriveTangent?: number | null;
  leaveTangent?: number | null;
}

export interface EditorNativeCurveRecord {
  curveId: string;
  inputUnit: string;
  outputUnit: string;
  keys: EditorField<readonly EditorNativeCurveKey[]>;
}

export interface EditorNativeDamageModifierRecord {
  damageTypePath: string;
  modifier: EditorField<number>;
  directHitDamageMultiplier?: EditorField<number>;
  directHitRadialDamageMultiplier?: EditorField<number>;
  indirectHitDamageMultiplier?: EditorField<number>;
  onlyPassDamageIfDirectHit?: EditorField<boolean>;
}

export interface EditorNativeHealthPoolRecord {
  poolId: string;
  kind: string;
  ownerIndex: number | null;
  componentIndex: number | null;
  maxHealth: EditorField<number>;
  passDamageToParent?: EditorField<boolean>;
  passPointDamageToParent?: EditorField<boolean>;
  passRadialDamageToParent?: EditorField<boolean>;
  damageModifiers: readonly EditorNativeDamageModifierRecord[];
}

export interface EditorNativeOwnerRecord {
  ownerId: string;
  kind: "vehicle-root" | "seat";
  parentOwnerIndex: number | null;
  healthPoolIndex: number | null;
}

export interface EditorNativeComponentRecord {
  componentId: string;
  semanticKind: string;
  ownerIndex: number;
  placementState: string;
  directDamagePoolIndex: EditorField<number>;
}

export interface EditorNativeSurfaceRecord {
  surfaceProfileId: string;
  componentIndex: number;
  armorThicknessMm: EditorField<number>;
  considerForPenetration: EditorField<boolean>;
  allowPenetration: EditorField<boolean>;
  damageParentActor: EditorField<boolean>;
  armorDamageMultiplier: EditorField<number>;
  damageAbsorbed: EditorField<number>;
}

export interface EditorNativeProjectileRecord {
  projectileId: string;
  role: string;
  damageTypePath: EditorField<string>;
  armorPenetrationDepthMm: EditorField<number>;
  impactDamage: EditorField<number>;
  isExplosive: EditorField<boolean>;
  traceDistanceAfterPenetrationMeters: EditorField<number>;
}

export interface EditorNativeWeaponRecord {
  weaponId: string;
  role: string;
  projectileIndex: EditorField<number>;
  armorPenetrationDepthMm: EditorField<number>;
  armorPenetrationCurveIndex: EditorField<number>;
  damageFalloffCurveIndex: EditorField<number>;
  maxDamage: EditorField<number>;
  minDamage?: EditorField<number>;
  traceDistanceAfterPenetrationMeters: EditorField<number>;
}

export interface EditorNativeCapabilityRecord {
  state: "observed" | "partial" | "native-unknown";
  reason?: string | null;
}

export interface EditorNativeModel {
  owners?: readonly EditorNativeOwnerRecord[];
  healthPools: readonly EditorNativeHealthPoolRecord[];
  components: readonly EditorNativeComponentRecord[];
  surfaceProfiles: readonly EditorNativeSurfaceRecord[];
  weapons: readonly EditorNativeWeaponRecord[];
  projectiles: readonly EditorNativeProjectileRecord[];
  curves: readonly EditorNativeCurveRecord[];
  capabilities?: {
    directHitDamage?: EditorNativeCapabilityRecord;
    finalTargetTakeDamageRouting?: EditorNativeCapabilityRecord;
  };
}

export interface EditorNativeIntersection {
  triangleIndex: number;
  componentIndex: number;
  surfaceProfileIndex: number;
  distanceFromRayOriginM: number;
  /** World-space hit point used to reject merely-nearby surfaces during edge de-duplication. */
  point: HitVector3;
  /** Outward world-space face normal; opposite-facing entry/exit faces remain distinct. */
  faceNormal: HitVector3;
  /** Native incidence term: -dot(normalized trace direction, outward impact normal). */
  incidenceFactor: number;
}

export type EditorNativeResolution = "resolved" | "partial" | "native-unknown";

export interface EditorNativeBallistics {
  resolution: EditorNativeResolution;
  weaponIndex: number;
  weaponId: string;
  projectileIndex: number;
  projectileId: string;
  damageTypePath: string | null;
  targetDistanceM: number;
  penetrationAtRangeMm: number | null;
  impactDamageAtRange: number | null;
  traceDistanceAfterPenetrationM: number | null;
  isExplosive: boolean | null;
  unknowns: string[];
}

export interface EditorNativeHitLayer {
  triangleIndex: number;
  componentIndex: number;
  componentId: string;
  semanticKind: string;
  surfaceProfileIndex: number;
  surfaceProfileId: string;
  distanceFromFirstHitM: number;
  incidenceFactor: number;
  postPenetrationTraceFactor: number;
  remainingDamage: number;
  remainingDamageRatio: number;
  availablePenetrationMm: number;
  armorThicknessMm: number | null;
  penetrated: boolean | null;
  damageAbsorbedAfterHit: number | null;
  stopReason: string | null;
}

export interface EditorNativeDamageEvent {
  poolIndex: number;
  poolId: string;
  poolKind: string;
  maxHealth: number | null;
  sourceComponentIndex: number;
  incomingDamage: number;
  modifier: number;
  modifierSourcePoolIndex: number;
  route: "direct" | "seat-forwarded-to-hull";
  /** Damage submitted to this health pool after the matching damage-type modifier. */
  poolDamage: number;
  /** Maximum health loss from a full pool; null only when max health is unreadable. */
  effectiveDamage: number | null;
  certainty: EditorNativeResolution;
}

export interface EditorNativeShotResult {
  resolution: EditorNativeResolution;
  ballistics: EditorNativeBallistics;
  shotDamageMultiplier: number;
  layers: EditorNativeHitLayer[];
  damage: EditorNativeDamageEvent[];
  stoppedAtLayer: number | null;
  radial: "not-requested" | "native-unknown";
  unknowns: string[];
}

export function editorNativeEffectiveDamageAmount(event: EditorNativeDamageEvent) {
  return event.certainty === "resolved" &&
    typeof event.effectiveDamage === "number" &&
    Number.isFinite(event.effectiveDamage)
    ? Math.max(0, event.effectiveDamage)
    : 0;
}

export function isEditorNativeVehicleDamageEvent(event: EditorNativeDamageEvent) {
  if (editorNativeEffectiveDamageAmount(event) <= 0) return false;
  return event.route === "seat-forwarded-to-hull" || event.poolKind !== "seat";
}

export function isEditorNativeComponentOnlyDamageEvent(event: EditorNativeDamageEvent) {
  return editorNativeEffectiveDamageAmount(event) > 0 &&
    event.route === "direct" &&
    event.poolKind === "seat";
}

interface ReadFieldResult<T> {
  value: T | null;
  state: EditorEvidenceState | "literal";
  known: boolean;
  confirmedAbsent: boolean;
  reason: string | null;
}

function readField<T>(field: EditorField<T>): ReadFieldResult<T> {
  if (
    field !== null &&
    typeof field === "object" &&
    Object.hasOwn(field as object, "state") &&
    Object.hasOwn(field as object, "value")
  ) {
    const evidence = field as EditorEvidenceLike<T>;
    return {
      value: evidence.value,
      state: evidence.state,
      known:
        evidence.value !== null &&
        (evidence.state === "observed" || evidence.state === "derived"),
      confirmedAbsent: evidence.state === "absent",
      reason: evidence.reason ?? null,
    };
  }
  return {
    value: field as T | null,
    state: "literal",
    known: field !== null,
    confirmedAbsent: false,
    reason: null,
  };
}

export function editorEvidenceValue<T>(field: EditorField<T>): T | null {
  const result = readField(field);
  return result.known ? result.value : null;
}

function addUnknown(unknowns: string[], message: string) {
  if (!unknowns.includes(message)) unknowns.push(message);
}

function resolutionForUnknowns(unknowns: readonly string[], hasResolvedWork: boolean) {
  if (unknowns.length === 0) return "resolved" as const;
  return hasResolvedWork ? ("partial" as const) : ("native-unknown" as const);
}

function curveMode(value: string | null | undefined) {
  return (value ?? "linear").toLocaleLowerCase("en");
}

const f32 = Math.fround;

/** Evaluates the observed UE rich-curve keys without legacy 50 m bucketing. */
export function sampleEditorNativeCurve(
  curve: EditorNativeCurveRecord,
  input: number,
): number | null {
  const keyEvidence = readField(curve.keys);
  if (!keyEvidence.known || !keyEvidence.value || keyEvidence.value.length === 0) return null;
  if (!Number.isFinite(input)) return null;

  const keys = [...keyEvidence.value].sort((left, right) => left.time - right.time);
  if (keys.some((key) => !Number.isFinite(key.time) || !Number.isFinite(key.value))) return null;
  if (input <= keys[0].time) return keys[0].value;
  if (input >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const left = keys[index];
    const right = keys[index + 1];
    if (input > right.time) continue;
    const duration = right.time - left.time;
    if (!(duration > 0)) return null;
    const alpha = f32(f32(input - left.time) / f32(duration));
    const mode = curveMode(left.interpMode);
    if (mode.includes("constant")) return left.value;
    if (!mode.includes("cubic")) {
      return f32(f32(left.value) + f32(f32(right.value - left.value) * alpha));
    }
    if (!Number.isFinite(left.leaveTangent) || !Number.isFinite(right.arriveTangent)) {
      return null;
    }
    const alpha2 = alpha * alpha;
    const alpha3 = alpha2 * alpha;
    const h00 = 2 * alpha3 - 3 * alpha2 + 1;
    const h10 = alpha3 - 2 * alpha2 + alpha;
    const h01 = -2 * alpha3 + 3 * alpha2;
    const h11 = alpha3 - alpha2;
    return f32(
      h00 * left.value +
      h10 * duration * (left.leaveTangent as number) +
      h01 * right.value +
      h11 * duration * (right.arriveTangent as number)
    );
  }
  return null;
}

function curveIndex(
  field: EditorField<number>,
  curves: readonly EditorNativeCurveRecord[],
  label: string,
  unknowns: string[],
) {
  const value = readField(field);
  if (value.confirmedAbsent) return null;
  if (!value.known || value.value === null || !curves[value.value]) {
    addUnknown(unknowns, `${label} is not readable for this Editor build`);
    return undefined;
  }
  return value.value;
}

function preferredNumber(
  primary: EditorField<number>,
  secondary: EditorField<number>,
  label: string,
  unknowns: string[],
) {
  const primaryValue = readField(primary);
  if (primaryValue.known && primaryValue.value !== null) return primaryValue.value;
  const secondaryValue = readField(secondary);
  if (secondaryValue.known && secondaryValue.value !== null) return secondaryValue.value;
  addUnknown(unknowns, `${label} is not readable for this Editor build`);
  return null;
}

export function resolveEditorNativeBallistics(
  model: EditorNativeModel,
  weaponIndex: number,
  targetDistanceM: number,
): EditorNativeBallistics {
  const unknowns: string[] = [];
  const weapon = model.weapons[weaponIndex];
  if (!weapon) {
    return {
      resolution: "native-unknown",
      weaponIndex,
      weaponId: "unknown",
      projectileIndex: -1,
      projectileId: "unknown",
      damageTypePath: null,
      targetDistanceM,
      penetrationAtRangeMm: null,
      impactDamageAtRange: null,
      traceDistanceAfterPenetrationM: null,
      isExplosive: null,
      unknowns: ["weapon index is outside the Editor evidence table"],
    };
  }

  const projectileIndexField = readField(weapon.projectileIndex);
  const projectileIndex =
    projectileIndexField.known && projectileIndexField.value !== null
      ? projectileIndexField.value
      : -1;
  const projectile = model.projectiles[projectileIndex];
  if (!projectile) addUnknown(unknowns, `${weapon.weaponId} projectile lineage is unresolved`);

  const penetrationCurve = curveIndex(
    weapon.armorPenetrationCurveIndex,
    model.curves,
    `${weapon.weaponId} penetration curve`,
    unknowns,
  );
  let penetrationAtRangeMm: number | null = null;
  if (penetrationCurve === null) {
    const rawPenetration = preferredNumber(
      weapon.armorPenetrationDepthMm,
      projectile?.armorPenetrationDepthMm ?? null,
      `${weapon.weaponId} armor penetration`,
      unknowns,
    );
    // GetArmorPenetrationForTarget uses cvttss2si/cvtdq2ps when no curve is set.
    penetrationAtRangeMm = rawPenetration === null ? null : Math.trunc(rawPenetration);
  } else if (penetrationCurve !== undefined) {
    penetrationAtRangeMm = sampleEditorNativeCurve(
      model.curves[penetrationCurve],
      targetDistanceM,
    );
    if (penetrationAtRangeMm === null) {
      addUnknown(unknowns, `${weapon.weaponId} penetration curve keys are incomplete`);
    }
  }

  const damageCurve = curveIndex(
    weapon.damageFalloffCurveIndex,
    model.curves,
    `${weapon.weaponId} damage curve`,
    unknowns,
  );
  let impactDamageAtRange: number | null = null;
  if (damageCurve === null) {
    impactDamageAtRange = preferredNumber(
      projectile?.impactDamage ?? null,
      weapon.maxDamage,
      `${weapon.weaponId} impact damage`,
      unknowns,
    );
  } else if (damageCurve !== undefined) {
    // GetDamageAtTargetLocation receives physical target distance in Unreal centimeters.
    impactDamageAtRange = sampleEditorNativeCurve(
      model.curves[damageCurve],
      targetDistanceM * 100,
    );
    if (impactDamageAtRange === null) {
      addUnknown(unknowns, `${weapon.weaponId} damage curve keys are incomplete`);
    }
  }

  const projectileTrace = readField(
    projectile?.traceDistanceAfterPenetrationMeters ?? null,
  );
  const weaponTrace = readField(weapon.traceDistanceAfterPenetrationMeters);
  let traceDistanceAfterPenetrationM: number | null = null;
  if (
    projectileTrace.known &&
    projectileTrace.value !== null &&
    projectileTrace.value > 0
  ) {
    traceDistanceAfterPenetrationM = projectileTrace.value;
  } else if (weaponTrace.known && weaponTrace.value !== null) {
    traceDistanceAfterPenetrationM = weaponTrace.value;
  } else if (projectileTrace.known && projectileTrace.value !== null) {
    traceDistanceAfterPenetrationM = projectileTrace.value;
  } else {
    addUnknown(unknowns, `${weapon.weaponId} post-penetration trace distance is unreadable`);
  }

  const damageType = readField(projectile?.damageTypePath ?? null);
  if (!damageType.known) addUnknown(unknowns, `${weapon.weaponId} damage type is unresolved`);
  const explosive = readField(projectile?.isExplosive ?? null);
  if (!explosive.known) addUnknown(unknowns, `${weapon.weaponId} explosive flag is unresolved`);

  const hasBallistics =
    penetrationAtRangeMm !== null &&
    impactDamageAtRange !== null &&
    traceDistanceAfterPenetrationM !== null;
  return {
    resolution: resolutionForUnknowns(unknowns, hasBallistics),
    weaponIndex,
    weaponId: weapon.weaponId,
    projectileIndex,
    projectileId: projectile?.projectileId ?? "unknown",
    damageTypePath: damageType.known ? damageType.value : null,
    targetDistanceM,
    penetrationAtRangeMm,
    impactDamageAtRange,
    traceDistanceAfterPenetrationM,
    isExplosive: explosive.known ? explosive.value : null,
    unknowns,
  };
}

export function maxEditorNativeWeaponDistanceM(
  model: EditorNativeModel,
  weaponIndex: number,
) {
  const weapon = model.weapons[weaponIndex];
  if (!weapon) return 0;
  const distances: number[] = [];
  for (const [field, expectedInputUnit] of [
    [weapon.armorPenetrationCurveIndex, "meters"],
    [weapon.damageFalloffCurveIndex, "unreal-centimeters"],
  ] as const) {
    const index = readField(field);
    if (!index.known || index.value === null) continue;
    const curve = model.curves[index.value];
    const keys = curve ? readField(curve.keys) : null;
    if (!curve || !keys?.known || !keys.value || curve.inputUnit !== expectedInputUnit) continue;
    const lastTime = Math.max(...keys.value.map((key) => key.time));
    if (Number.isFinite(lastTime)) {
      distances.push(expectedInputUnit === "unreal-centimeters" ? lastTime / 100 : lastTime);
    }
  }
  return Math.max(0, ...distances);
}

/**
 * Return only weapons that can produce a fully specified direct penetration
 * result at the muzzle.  The Editor owner graph also exposes utility weapons
 * such as smoke generators; their zero-penetration projectile records remain
 * in the evidence pack but must not be presented as direct-hit analysis input
 * while radial damage is disabled.
 */
export function editorNativeDirectWeaponIndices(model: EditorNativeModel) {
  return model.weapons.flatMap((_, weaponIndex) => {
    const ballistics = resolveEditorNativeBallistics(model, weaponIndex, 0);
    return ballistics.penetrationAtRangeMm !== null &&
      ballistics.penetrationAtRangeMm > 0 &&
      ballistics.impactDamageAtRange !== null &&
      ballistics.impactDamageAtRange > 0 &&
      ballistics.traceDistanceAfterPenetrationM !== null &&
      ballistics.damageTypePath !== null
      ? [weaponIndex]
      : [];
  });
}

interface DirectDamageFactors {
  modifier: number;
  modifierSourcePoolIndex: number;
}

function normalizedDamageTypePath(damageTypePath: string) {
  return damageTypePath.trim().replaceAll("\\", "/").toLowerCase();
}

function damageTypeClassName(damageTypePath: string) {
  const normalized = normalizedDamageTypePath(damageTypePath);
  const separator = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("."),
  );
  return normalized.slice(separator + 1);
}

function damageTypePathsMatch(
  allowableDamageTypePath: string,
  incomingDamageTypePath: string,
) {
  const allowable = normalizedDamageTypePath(allowableDamageTypePath);
  const incoming = normalizedDamageTypePath(incomingDamageTypePath);
  if (allowable === incoming) return true;

  // Wiki infantry snapshots expose the generated class name while native hit
  // records retain the complete Unreal object path. Treat that short name as
  // the same class identity, but never collapse two different qualified paths
  // merely because their object basenames happen to match.
  if (allowable.startsWith("/") && incoming.startsWith("/")) return false;
  return damageTypeClassName(allowable) === damageTypeClassName(incoming);
}

function directDamageFactors(
  model: EditorNativeModel,
  poolIndex: number,
  damageTypePath: string,
  unknowns: string[],
): DirectDamageFactors | null {
  const pool = model.healthPools[poolIndex];
  if (!pool) {
    addUnknown(unknowns, `health pool ${poolIndex} is missing`);
    return null;
  }

  let modifierSourcePoolIndex = poolIndex;
  if (pool.kind === "seat") {
    const owner = pool.ownerIndex === null ? null : model.owners?.[pool.ownerIndex];
    const parentOwner =
      owner?.parentOwnerIndex === null || owner?.parentOwnerIndex === undefined
        ? null
        : model.owners?.[owner.parentOwnerIndex];
    const parentPoolIndex = parentOwner?.healthPoolIndex ?? null;
    if (parentPoolIndex === null || !model.healthPools[parentPoolIndex]) {
      addUnknown(unknowns, `${pool.poolId} parent vehicle damage modifiers are unresolved`);
      return null;
    }
    modifierSourcePoolIndex = parentPoolIndex;
  }

  const modifierPool = model.healthPools[modifierSourcePoolIndex];
  // USQVehicleComponent::TakeDamage: an empty allow-list accepts full incoming damage.
  if (modifierPool.damageModifiers.length === 0) {
    return { modifier: 1, modifierSourcePoolIndex };
  }
  const match = modifierPool.damageModifiers.find(
    (candidate) => damageTypePathsMatch(candidate.damageTypePath, damageTypePath),
  );
  // A non-empty allow-list without a matching damage type rejects this damage.
  if (!match) return { modifier: 0, modifierSourcePoolIndex };
  const modifier = readField(match.modifier);
  if (!modifier.known || modifier.value === null) {
    addUnknown(unknowns, `${modifierPool.poolId} damage modifier is unreadable`);
    return null;
  }
  return {
    modifier: modifier.value,
    modifierSourcePoolIndex,
  };
}

function directDamageCertainty(
  model: EditorNativeModel,
  unknowns: string[],
): EditorNativeResolution {
  const capability = model.capabilities?.directHitDamage;
  if (!capability) {
    addUnknown(unknowns, "direct-hit damage capability evidence is missing");
    return "native-unknown";
  }
  if (capability.state === "observed") return "resolved";
  addUnknown(
    unknowns,
    `direct-hit damage is ${capability.state}${capability.reason ? `: ${capability.reason}` : ""}`,
  );
  return capability.state;
}

function parentHealthPoolIndex(
  model: EditorNativeModel,
  pool: EditorNativeHealthPoolRecord,
): number | null {
  const owner = pool.ownerIndex === null ? null : model.owners?.[pool.ownerIndex];
  if (!owner || owner.parentOwnerIndex === null) return null;
  return model.owners?.[owner.parentOwnerIndex]?.healthPoolIndex ?? null;
}

function isDetachedZeroHealthWeaponStationEntry(
  model: EditorNativeModel,
  component: EditorNativeComponentRecord | undefined,
) {
  if (!component || component.semanticKind !== "gun-collision") return false;
  const owner = model.owners?.[component.ownerIndex];
  if (!owner || owner.kind !== "seat") return false;
  const poolIndex = owner.healthPoolIndex;
  if (typeof poolIndex !== "number" || !Number.isInteger(poolIndex)) return false;
  const pool = model.healthPools[poolIndex];
  if (!pool || pool.kind !== "seat") return false;
  const maxHealth = readField(pool.maxHealth);
  const directDamagePool = readField(component.directDamagePoolIndex);
  return maxHealth.known && maxHealth.value === 0 && directDamagePool.confirmedAbsent;
}

export function simulateEditorNativeShot({
  model,
  weaponModel = model,
  weaponIndex,
  targetDistanceM,
  shotDamageMultiplier,
  intersections,
  includeRadial = false,
}: {
  /** Target armor, components, health pools, and damage routing. */
  model: EditorNativeModel;
  /** Optional attacker model supplying only weapon/projectile/curve ballistics. */
  weaponModel?: EditorNativeModel;
  weaponIndex: number;
  targetDistanceM: number;
  /** Explicit scenario input passed to native DealDamage; the standard UI fixes this to 1. */
  shotDamageMultiplier: number;
  intersections: readonly EditorNativeIntersection[];
  includeRadial?: boolean;
}): EditorNativeShotResult {
  if (!Number.isFinite(shotDamageMultiplier) || shotDamageMultiplier < 0) {
    throw new Error("shotDamageMultiplier must be a finite non-negative scenario input");
  }
  const ballistics = resolveEditorNativeBallistics(weaponModel, weaponIndex, targetDistanceM);
  const unknowns = [...ballistics.unknowns];
  const layers: EditorNativeHitLayer[] = [];
  const damage: EditorNativeDamageEvent[] = [];
  const damagedPools = new Set<number>();
  // A ray that lands exactly on a shared triangle edge can report both faces.
  // Normalize those geometry duplicates before any armor, absorption, or damage
  // state is consumed. Opposite-facing thin-plate entry/exit hits are preserved.
  const ordered = normalizeHitIntersections(
    intersections.map((intersection) => ({
      ...intersection,
      distanceM: intersection.distanceFromRayOriginM,
      componentId: intersection.componentIndex,
      sourceFaceId: intersection.triangleIndex,
    })),
  ).map(({ hit }) => hit);
  const firstDistance = ordered[0]?.distanceFromRayOriginM ?? 0;
  // A zero-health child weapon station whose direct pool was explicitly detached
  // is a standalone collision target, regardless of noisy native forwarding
  // flags. Penetrating its launcher/shield must not leak a second damage event
  // into the parent vehicle merely because the analysis ray also intersects hull
  // geometry behind it. Component pools physically behind the station remain
  // eligible; only parent hull routing is suppressed.
  const suppressParentHullDamage = isDetachedZeroHealthWeaponStationEntry(
    model,
    ordered.length > 0 ? model.components[ordered[0].componentIndex] : undefined,
  );
  let cumulativeDamageAbsorbed = 0;
  let stoppedAtLayer: number | null = null;

  if (
    ballistics.penetrationAtRangeMm === null ||
    ballistics.impactDamageAtRange === null ||
    ballistics.traceDistanceAfterPenetrationM === null
  ) {
    return {
      resolution: "native-unknown",
      ballistics,
      shotDamageMultiplier,
      layers,
      damage,
      stoppedAtLayer,
      radial: includeRadial ? "native-unknown" : "not-requested",
      unknowns,
    };
  }

  const baseDamage = f32(
    ballistics.impactDamageAtRange * f32(shotDamageMultiplier),
  );

  const appendDamageEvent = (
    poolIndex: number,
    sourceComponentIndex: number,
    incomingDamage: number,
    route: EditorNativeDamageEvent["route"],
  ) => {
    if (damagedPools.has(poolIndex)) return false;
    const pool = model.healthPools[poolIndex];
    const damageTypePath = ballistics.damageTypePath;
    if (!pool) {
      addUnknown(unknowns, `health pool ${poolIndex} is missing`);
      return false;
    }
    if (damageTypePath === null) {
      addUnknown(unknowns, `${pool.poolId} damage type routing is unresolved`);
      return false;
    }
    const factors = directDamageFactors(model, poolIndex, damageTypePath, unknowns);
    if (factors === null) return false;
    const maxHealth = readField(pool.maxHealth);
    const poolDamage = f32(f32(Math.max(0, incomingDamage)) * f32(factors.modifier));
    damage.push({
      poolIndex,
      poolId: pool.poolId,
      poolKind: pool.kind,
      maxHealth: maxHealth.known ? maxHealth.value : null,
      sourceComponentIndex,
      incomingDamage,
      modifier: factors.modifier,
      modifierSourcePoolIndex: factors.modifierSourcePoolIndex,
      route,
      poolDamage,
      effectiveDamage:
        maxHealth.known && maxHealth.value !== null
          ? f32(Math.min(Math.max(0, maxHealth.value), poolDamage))
          : null,
      certainty: directDamageCertainty(model, unknowns),
    });
    damagedPools.add(poolIndex);
    return true;
  };

  for (const intersection of ordered) {
    const component = model.components[intersection.componentIndex];
    const surface = model.surfaceProfiles[intersection.surfaceProfileIndex];
    if (!component || !surface || surface.componentIndex !== intersection.componentIndex) {
      addUnknown(unknowns, `triangle ${intersection.triangleIndex} semantic lookup failed`);
      stoppedAtLayer = layers.length;
      break;
    }

    const distanceFromFirstHitM = f32(intersection.distanceFromRayOriginM - firstDistance);
    const traceDistance = ballistics.traceDistanceAfterPenetrationM;
    const postPenetrationTraceFactor =
      traceDistance > 0
        ? f32(f32(traceDistance - distanceFromFirstHitM) / traceDistance)
        : 0;
    const remainingDamage = f32(
      baseDamage - cumulativeDamageAbsorbed,
    );
    const remainingDamageRatio =
      baseDamage !== 0
        ? f32(remainingDamage / baseDamage)
        : 0;
    const availablePenetrationMm = f32(
      f32(
        f32(ballistics.penetrationAtRangeMm * f32(intersection.incidenceFactor)) *
          postPenetrationTraceFactor,
      ) * remainingDamageRatio,
    );

    const consider = readField(surface.considerForPenetration);
    const allow = readField(surface.allowPenetration);
    const thickness = readField(surface.armorThicknessMm);
    let penetrated: boolean | null = null;
    let stopReason: string | null = null;

    if (component.semanticKind === "penetration-blocker" || (allow.known && allow.value === false)) {
      penetrated = false;
      stopReason = "penetration is disabled by the Editor surface";
    } else if (!consider.known || !allow.known) {
      addUnknown(unknowns, `${surface.surfaceProfileId} penetration flags are unreadable`);
      stopReason = "penetration flags are native-unknown";
    } else if (consider.value === false) {
      addUnknown(
        unknowns,
        `${surface.surfaceProfileId} bConsiderForPenetration=false behavior is not in the ZVT fixture`,
      );
      stopReason = "unobserved penetration bypass semantics";
    } else if (!thickness.known || thickness.value === null) {
      addUnknown(unknowns, `${surface.surfaceProfileId} armor thickness is unreadable`);
      stopReason = "armor thickness is native-unknown";
    } else {
      // DidPenetrateArmor uses a strict comparison; equality is a failed penetration.
      penetrated = availablePenetrationMm > thickness.value;
      if (!penetrated) stopReason = "available penetration is not greater than thickness";
    }

    const absorbed = readField(surface.damageAbsorbed);
    layers.push({
      triangleIndex: intersection.triangleIndex,
      componentIndex: intersection.componentIndex,
      componentId: component.componentId,
      semanticKind: component.semanticKind,
      surfaceProfileIndex: intersection.surfaceProfileIndex,
      surfaceProfileId: surface.surfaceProfileId,
      distanceFromFirstHitM,
      incidenceFactor: intersection.incidenceFactor,
      postPenetrationTraceFactor,
      remainingDamage,
      remainingDamageRatio,
      availablePenetrationMm,
      armorThicknessMm: thickness.known ? thickness.value : null,
      penetrated,
      damageAbsorbedAfterHit: absorbed.known ? absorbed.value : null,
      stopReason,
    });

    if (penetrated !== true) {
      stoppedAtLayer = layers.length - 1;
      break;
    }

    const damageParent = readField(surface.damageParentActor);
    if (!damageParent.known) {
      addUnknown(unknowns, `${surface.surfaceProfileId} damage-parent flag is unreadable`);
    } else if (
      damageParent.value === true &&
      remainingDamage > 0 &&
      component.semanticKind !== "gun-collision"
    ) {
      const poolIndex = readField(component.directDamagePoolIndex);
      if (!poolIndex.known || poolIndex.value === null || !model.healthPools[poolIndex.value]) {
        addUnknown(unknowns, `${component.componentId} direct damage pool is unresolved`);
      } else {
        const pool = model.healthPools[poolIndex.value];
        if (!(suppressParentHullDamage && pool.kind === "hull")) {
          appendDamageEvent(
            poolIndex.value,
            intersection.componentIndex,
            remainingDamage,
            "direct",
          );
        }

        if (pool.kind === "seat") {
          const passDamage = readField(pool.passDamageToParent ?? null);
          const passPoint = readField(pool.passPointDamageToParent ?? null);
          if (!passDamage.known || !passPoint.known) {
            addUnknown(unknowns, `${pool.poolId} point-damage forwarding flags are unreadable`);
          } else if (
            passDamage.value === true &&
            passPoint.value === true &&
            !suppressParentHullDamage
          ) {
            const parentPoolIndex = parentHealthPoolIndex(model, pool);
            if (parentPoolIndex === null || !model.healthPools[parentPoolIndex]) {
              addUnknown(unknowns, `${pool.poolId} parent health pool is unresolved`);
            } else {
              appendDamageEvent(
                parentPoolIndex,
                intersection.componentIndex,
                remainingDamage,
                "seat-forwarded-to-hull",
              );
            }
          }
        }
      }
    }

    // DealDamage increments material absorption after processing the current hit.
    if (!absorbed.known || absorbed.value === null) {
      addUnknown(unknowns, `${surface.surfaceProfileId} damage absorption is unreadable`);
      stoppedAtLayer = layers.length - 1;
      break;
    }
    cumulativeDamageAbsorbed = f32(cumulativeDamageAbsorbed + absorbed.value);
  }

  const radial = includeRadial && ballistics.isExplosive ? "native-unknown" : "not-requested";
  if (radial === "native-unknown") {
    addUnknown(unknowns, "Editor radial target aggregation is native-unknown");
  }
  return {
    resolution: resolutionForUnknowns(unknowns, layers.length > 0),
    ballistics,
    shotDamageMultiplier,
    layers,
    damage,
    stoppedAtLayer,
    radial,
    unknowns,
  };
}
