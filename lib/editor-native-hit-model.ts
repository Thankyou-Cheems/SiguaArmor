import {
  normalizeHitIntersections,
  type HitVector3,
} from "./hit-intersection-ordering.ts";
import {
  editorNativeDidPenetrateArmor,
  editorNativePenetrationPrefilter,
  editorNativeTraceIncludesDistance,
  resolveEditorNativePenetrationArithmetic,
} from "./editor-native-penetration.ts";
import type { VehicleRadialDamageModel } from "./vehicle-radial-damage-model.ts";

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
  componentPath?: string;
  classPath?: string;
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

export interface EditorNativeExplosiveLayerRecord {
  layerId: string;
  label: string;
  shortLabel?: string;
  damageTypePath: EditorField<string>;
  baseDamage: EditorField<number>;
  minimumDamage: EditorField<number>;
  killZoneRadiusCm?: EditorField<number>;
  innerRadiusCm: EditorField<number>;
  outerRadiusCm: EditorField<number>;
  falloff: EditorField<number>;
  impactNormalOffsetCm: EditorField<number>;
  onlyDamageMeshes?: EditorField<boolean>;
  orderEvidence?: string;
}

export type EditorNativeImpactRadialOrder =
  | "point-before-radial"
  | "secondary-radial-before-point-before-primary-radial";

export interface EditorNativeProjectileRecord {
  projectileId: string;
  role: string;
  damageTypePath: EditorField<string>;
  armorPenetrationDepthMm: EditorField<number>;
  impactDamage: EditorField<number>;
  isExplosive: EditorField<boolean>;
  traceDistanceAfterPenetrationMeters: EditorField<number>;
  explosiveBaseDamage?: EditorField<number>;
  explosiveMinimumDamage?: EditorField<number>;
  explosiveKillZoneRadiusCm?: EditorField<number>;
  explosiveInnerRadiusCm?: EditorField<number>;
  explosiveOuterRadiusCm?: EditorField<number>;
  explosiveFalloff?: EditorField<number>;
  impactNormalOffsetCm?: EditorField<number>;
  explosiveLayers?: readonly EditorNativeExplosiveLayerRecord[];
  explosiveLayerOrderEvidence?: string;
  impactRadialOrder?: EditorField<EditorNativeImpactRadialOrder>;
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
  vehicleId?: string;
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
  penetrationTraceDistanceM: number | null;
  impactDamageAtRange: number | null;
  traceDistanceAfterPenetrationM: number | null;
  isExplosive: boolean | null;
  explosive: EditorNativeExplosiveBallistics | null;
  explosiveLayers: readonly EditorNativeExplosiveLayerBallistics[];
  explosiveLayerOrderEvidence: string | null;
  explosiveLayerOrderResolved: boolean | null;
  impactRadialOrder: EditorNativeImpactRadialOrder | null;
  unknowns: string[];
}

export interface EditorNativeExplosiveBallistics {
  baseDamage: number;
  minimumDamage: number;
  killZoneRadiusCm: number;
  innerRadiusCm: number;
  outerRadiusCm: number;
  falloff: number;
  impactNormalOffsetCm: number;
}

export interface EditorNativeExplosiveLayerBallistics
  extends EditorNativeExplosiveBallistics {
  layerId: string;
  label: string;
  shortLabel: string;
  damageTypePath: string;
  onlyDamageMeshes: boolean | null;
  orderEvidence: string | null;
}

export interface EditorNativeRadialComponentHit {
  componentIndex: number | null;
  ownerIndex?: number;
  queryComponentId?: string;
  nativeClassPath?: string;
  impactPointCm: HitVector3;
}

export interface EditorNativeRadialLayerHitSet {
  layerId: string;
  evidence: "native-observed" | "native-reconstructed";
  sourceBuildId: string;
  originCm?: HitVector3;
  componentHits: readonly EditorNativeRadialComponentHit[];
}

export interface EditorNativeHitLayer {
  triangleIndex: number;
  componentIndex: number;
  componentId: string;
  semanticKind: string;
  surfaceProfileIndex: number;
  surfaceProfileId: string;
  distanceFromFirstHitM: number;
  distanceFromPenetrationTraceStartM: number;
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
  damageTypeModifier: number;
  routeMultiplier: number;
  modifierSourcePoolIndex: number;
  route:
    | "direct"
    | "seat-forwarded-to-hull"
    | "radial-direct"
    | "radial-indirect"
    | "radial-direct-seat-forwarded-to-hull";
  damageKind: "point" | "radial";
  damageTypePath?: string;
  radialLayerId?: string;
  radialLayerLabel?: string;
  radialLayerIndex?: number;
  radialComponentHitCount?: number;
  radialDispatchCount?: number;
  nearestImpactDistanceCm?: number;
  /** Damage submitted to this health pool after the matching damage-type modifier. */
  poolDamage: number;
  /** Maximum health loss from a full pool; null only when max health is unreadable. */
  effectiveDamage: number | null;
  certainty: EditorNativeResolution;
}

export interface EditorNativeRadialLayerResult {
  layerId: string;
  label: string;
  shortLabel: string;
  damageTypePath: string;
  orderEvidence: string | null;
  orderResolved: boolean | null;
  explosionOriginOffsetCm: number;
  nearestImpactDistanceCm: number;
  falloffFactor: number;
  baseDamage: number;
  minimumDamage: number;
  rawDamage: number;
  guaranteedPoolIndices: number[];
}

export interface EditorNativeRadialResult {
  state:
    | "not-requested"
    | "not-explosive"
    | "resolved"
    | "partial"
    | "native-unknown";
  order: EditorNativeImpactRadialOrder | null;
  directHit: boolean | null;
  explosionOriginOffsetCm: number | null;
  nearestImpactDistanceCm: number | null;
  falloffFactor: number | null;
  baseDamage: number | null;
  minimumDamage: number | null;
  rawDamage: number | null;
  layers: EditorNativeRadialLayerResult[];
  layerOrderEvidence: string | null;
  layerOrderResolved: boolean | null;
  guaranteedPoolIndices: number[];
  componentFanout:
    | "root-hull-resolved"
    | "drivetrain-resolved"
    | "native-query-required"
    | "vehicle-radial-disabled"
    | "native-unknown";
}

export interface EditorNativeShotResult {
  resolution: EditorNativeResolution;
  ballistics: EditorNativeBallistics;
  shotDamageMultiplier: number;
  layers: EditorNativeHitLayer[];
  damage: EditorNativeDamageEvent[];
  stoppedAtLayer: number | null;
  radial: EditorNativeRadialResult;
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
  return event.route === "seat-forwarded-to-hull" ||
    event.route === "radial-direct-seat-forwarded-to-hull" ||
    event.poolKind !== "seat";
}

export function isEditorNativeComponentForwardedDamageEvent(
  event: EditorNativeDamageEvent,
) {
  return editorNativeEffectiveDamageAmount(event) > 0 && (
    event.route === "seat-forwarded-to-hull" ||
    event.route === "radial-direct-seat-forwarded-to-hull"
  );
}

export function isEditorNativeComponentOnlyDamageEvent(event: EditorNativeDamageEvent) {
  return editorNativeEffectiveDamageAmount(event) > 0 &&
    (event.route === "direct" || event.route === "radial-direct") &&
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
      penetrationTraceDistanceM: null,
      impactDamageAtRange: null,
      traceDistanceAfterPenetrationM: null,
      isExplosive: null,
      explosive: null,
      explosiveLayers: [],
      explosiveLayerOrderEvidence: null,
      explosiveLayerOrderResolved: null,
      impactRadialOrder: null,
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

  const damageCurve = curveIndex(
    weapon.damageFalloffCurveIndex,
    model.curves,
    `${weapon.weaponId} damage curve`,
    unknowns,
  );
  const penetrationCurve = curveIndex(
    weapon.armorPenetrationCurveIndex,
    model.curves,
    `${weapon.weaponId} penetration curve`,
    unknowns,
  );
  const projectileImpact = readField(projectile?.impactDamage ?? null);
  const usesProjectileDirectConfig =
    projectileImpact.known &&
    projectileImpact.value !== null &&
    projectileImpact.value > 0;
  let penetrationAtRangeMm: number | null = null;
  if (usesProjectileDirectConfig || penetrationCurve === null) {
    const rawPenetration = preferredNumber(
      usesProjectileDirectConfig
        ? projectile?.armorPenetrationDepthMm ?? null
        : weapon.armorPenetrationDepthMm,
      usesProjectileDirectConfig
        ? weapon.armorPenetrationDepthMm
        : projectile?.armorPenetrationDepthMm ?? null,
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

  let impactDamageAtRange: number | null = null;
  if (usesProjectileDirectConfig || damageCurve === null) {
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

  const weaponTrace = readField(weapon.traceDistanceAfterPenetrationMeters);
  let traceDistanceAfterPenetrationM: number | null = null;
  if (weaponTrace.known && weaponTrace.value !== null) {
    traceDistanceAfterPenetrationM = weaponTrace.value;
  } else {
    addUnknown(
      unknowns,
      `${weapon.weaponId} weapon post-penetration trace distance is unreadable`,
    );
  }
  const projectileTrace = readField(
    projectile?.traceDistanceAfterPenetrationMeters ?? null,
  );
  let penetrationTraceDistanceM: number | null = null;
  const penetrationTrace = usesProjectileDirectConfig
    ? projectileTrace
    : weaponTrace;
  if (penetrationTrace.known && penetrationTrace.value !== null) {
    penetrationTraceDistanceM = penetrationTrace.value;
  } else {
    addUnknown(
      unknowns,
      `${weapon.weaponId} ${
        usesProjectileDirectConfig ? "projectile" : "weapon"
      } penetration trace distance is unreadable`,
    );
  }

  const damageType = readField(projectile?.damageTypePath ?? null);
  if (!damageType.known) addUnknown(unknowns, `${weapon.weaponId} damage type is unresolved`);
  const explosive = readField(projectile?.isExplosive ?? null);
  if (!explosive.known) addUnknown(unknowns, `${weapon.weaponId} explosive flag is unresolved`);
  let explosiveBallistics: EditorNativeExplosiveBallistics | null = null;
  let explosiveLayers: EditorNativeExplosiveLayerBallistics[] = [];
  const explosiveLayerOrderEvidence =
    projectile?.explosiveLayerOrderEvidence ?? null;
  const explosiveLayerOrderResolved = explosiveLayerOrderEvidence === null
    ? null
    : !explosiveLayerOrderEvidence.includes("unknown");
  const impactRadialOrderField = readField(
    projectile?.impactRadialOrder ?? null,
  );
  const impactRadialOrder = impactRadialOrderField.known
    ? impactRadialOrderField.value
    : explosive.known && explosive.value === true
      ? "point-before-radial"
      : null;
  if (explosive.known && explosive.value === true) {
    const readExplosiveNumber = (
      field: EditorField<number>,
      label: string,
    ) => {
      const value = readField(field);
      if (!value.known || value.value === null || !Number.isFinite(value.value)) {
        addUnknown(unknowns, `${weapon.weaponId} ${label} is unresolved`);
        return null;
      }
      return value.value;
    };
    const explicitLayers = projectile?.explosiveLayers ?? [];
    const layerRecords: readonly EditorNativeExplosiveLayerRecord[] =
      explicitLayers.length > 0
        ? explicitLayers
        : [{
            layerId: "primary",
            label: "Primary",
            shortLabel: "Primary",
            damageTypePath: projectile?.damageTypePath ?? null,
            baseDamage: projectile?.explosiveBaseDamage ?? null,
            minimumDamage: projectile?.explosiveMinimumDamage ?? null,
            killZoneRadiusCm: projectile?.explosiveKillZoneRadiusCm ?? 0,
            innerRadiusCm: projectile?.explosiveInnerRadiusCm ?? null,
            outerRadiusCm: projectile?.explosiveOuterRadiusCm ?? null,
            falloff: projectile?.explosiveFalloff ?? null,
            impactNormalOffsetCm: projectile?.impactNormalOffsetCm ?? null,
          }];
    explosiveLayers = layerRecords.flatMap((layer, layerIndex) => {
      const prefix = explicitLayers.length > 0
        ? `explosive layer ${layer.layerId || layerIndex + 1}`
        : "explosive";
      const layerDamageType = readField(layer.damageTypePath);
      if (!layerDamageType.known || layerDamageType.value === null) {
        addUnknown(
          unknowns,
          `${weapon.weaponId} ${prefix} damage type is unresolved`,
        );
        return [];
      }
      const baseDamage = readExplosiveNumber(
        layer.baseDamage,
        `${prefix} base damage`,
      );
      const minimumDamage = readExplosiveNumber(
        layer.minimumDamage,
        `${prefix} minimum damage`,
      );
      const killZoneRadiusCm = readExplosiveNumber(
        layer.killZoneRadiusCm ?? 0,
        `${prefix} kill-zone radius`,
      );
      const innerRadiusCm = readExplosiveNumber(
        layer.innerRadiusCm,
        `${prefix} inner radius`,
      );
      const outerRadiusCm = readExplosiveNumber(
        layer.outerRadiusCm,
        `${prefix} outer radius`,
      );
      const falloff = readExplosiveNumber(
        layer.falloff,
        `${prefix} falloff`,
      );
      const impactNormalOffsetCm = readExplosiveNumber(
        layer.impactNormalOffsetCm,
        `${prefix} impact-normal offset`,
      );
      if (
        baseDamage === null ||
        minimumDamage === null ||
        killZoneRadiusCm === null ||
        innerRadiusCm === null ||
        outerRadiusCm === null ||
        falloff === null ||
        impactNormalOffsetCm === null
      ) {
        return [];
      }
      const onlyDamageMeshes = readField(layer.onlyDamageMeshes ?? null);
      return [{
        layerId: layer.layerId || `layer-${layerIndex + 1}`,
        label: layer.label || `Layer ${layerIndex + 1}`,
        shortLabel: layer.shortLabel || layer.label || `Layer ${layerIndex + 1}`,
        damageTypePath: layerDamageType.value,
        baseDamage,
        minimumDamage,
        killZoneRadiusCm,
        innerRadiusCm,
        outerRadiusCm,
        falloff,
        impactNormalOffsetCm,
        onlyDamageMeshes: onlyDamageMeshes.known
          ? onlyDamageMeshes.value
          : null,
        orderEvidence: layer.orderEvidence ?? explosiveLayerOrderEvidence,
      }];
    });
    const primaryExplosiveLayer = explosiveLayers[0];
    explosiveBallistics = primaryExplosiveLayer
      ? {
          baseDamage: primaryExplosiveLayer.baseDamage,
          minimumDamage: primaryExplosiveLayer.minimumDamage,
          killZoneRadiusCm: primaryExplosiveLayer.killZoneRadiusCm,
          innerRadiusCm: primaryExplosiveLayer.innerRadiusCm,
          outerRadiusCm: primaryExplosiveLayer.outerRadiusCm,
          falloff: primaryExplosiveLayer.falloff,
          impactNormalOffsetCm: primaryExplosiveLayer.impactNormalOffsetCm,
        }
      : null;
    if (
      explicitLayers.length > 0 &&
      explosiveLayers.length !== explicitLayers.length
    ) {
      addUnknown(
        unknowns,
        `${weapon.weaponId} explosive layer table is incomplete`,
      );
    }
  }

  const hasBallistics =
    penetrationAtRangeMm !== null &&
    penetrationTraceDistanceM !== null &&
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
    penetrationTraceDistanceM,
    impactDamageAtRange,
    traceDistanceAfterPenetrationM,
    isExplosive: explosive.known ? explosive.value : null,
    explosive: explosiveBallistics,
    explosiveLayers,
    explosiveLayerOrderEvidence,
    explosiveLayerOrderResolved,
    impactRadialOrder,
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

/**
 * Return weapons for which the browser can resolve at least one native vehicle
 * damage route. This deliberately keeps the narrower direct-only helper above:
 * callers that need a penetration ray must not silently admit radial-only
 * explosives, while the hit-analysis selector may expose them.
 */
export function editorNativeDamageWeaponIndices(model: EditorNativeModel) {
  const direct = new Set(editorNativeDirectWeaponIndices(model));
  return model.weapons.flatMap((_, weaponIndex) => {
    if (direct.has(weaponIndex)) return [weaponIndex];
    const ballistics = resolveEditorNativeBallistics(model, weaponIndex, 0);
    const explosive = ballistics.explosive;
    return ballistics.isExplosive === true &&
      explosive !== null &&
      ballistics.damageTypePath !== null &&
      Math.max(explosive.baseDamage, explosive.minimumDamage) > 0
      ? [weaponIndex]
      : [];
  });
}

interface DirectDamageFactors {
  modifier: number;
  modifierSourcePoolIndex: number;
}

interface RadialDamageFactors extends DirectDamageFactors {
  routeMultiplier: number;
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

function radialDamageFactors(
  model: EditorNativeModel,
  poolIndex: number,
  damageTypePath: string,
  directHit: boolean,
  unknowns: string[],
): RadialDamageFactors | null {
  const pool = model.healthPools[poolIndex];
  if (!pool) {
    addUnknown(unknowns, `health pool ${poolIndex} is missing`);
    return null;
  }
  if (pool.damageModifiers.length === 0) {
    return {
      modifier: 1,
      routeMultiplier: 1,
      modifierSourcePoolIndex: poolIndex,
    };
  }
  const match = pool.damageModifiers.find(
    (candidate) => damageTypePathsMatch(candidate.damageTypePath, damageTypePath),
  );
  if (!match) {
    return {
      modifier: 0,
      routeMultiplier: 0,
      modifierSourcePoolIndex: poolIndex,
    };
  }
  const modifier = readField(match.modifier);
  if (!modifier.known || modifier.value === null) {
    addUnknown(unknowns, `${pool.poolId} radial damage modifier is unreadable`);
    return null;
  }
  const directOnly = readField(match.onlyPassDamageIfDirectHit ?? null);
  if (!directOnly.known && !directOnly.confirmedAbsent) {
    addUnknown(unknowns, `${pool.poolId} direct-only radial flag is unreadable`);
    return null;
  }
  if (!directHit && directOnly.value === true) {
    return {
      modifier: modifier.value,
      routeMultiplier: 0,
      modifierSourcePoolIndex: poolIndex,
    };
  }
  const multiplier = readField(
    directHit
      ? match.directHitRadialDamageMultiplier ?? null
      : match.indirectHitDamageMultiplier ?? null,
  );
  if (!multiplier.known && !multiplier.confirmedAbsent) {
    addUnknown(
      unknowns,
      `${pool.poolId} ${directHit ? "direct radial" : "indirect radial"} multiplier is unreadable`,
    );
    return null;
  }
  return {
    modifier: modifier.value,
    routeMultiplier: multiplier.confirmedAbsent ? 1 : multiplier.value ?? 1,
    modifierSourcePoolIndex: poolIndex,
  };
}

export function editorNativeRadialDamageScale({
  distanceCm,
  innerRadiusCm,
  outerRadiusCm,
  falloff,
}: {
  distanceCm: number;
  innerRadiusCm: number;
  outerRadiusCm: number;
  falloff: number;
}) {
  if (
    !Number.isFinite(distanceCm) ||
    !Number.isFinite(innerRadiusCm) ||
    !Number.isFinite(outerRadiusCm) ||
    !Number.isFinite(falloff)
  ) {
    throw new Error("radial damage scale parameters are invalid");
  }
  const distance = f32(Math.max(0, distanceCm));
  const inner = f32(Math.max(0, innerRadiusCm));
  const outer = f32(Math.max(inner, Math.max(0, outerRadiusCm)));
  const exponent = f32(falloff);
  if (distance >= outer) return 0;
  if (exponent === 0 || distance <= inner) return 1;
  const progress = f32(f32(distance - inner) / f32(outer - inner));
  return f32(Math.pow(f32(Math.max(0, f32(1 - progress))), exponent));
}

export function editorNativeRadialDamageAtDistance({
  baseDamage,
  minimumDamage,
  distanceCm,
  innerRadiusCm,
  outerRadiusCm,
  falloff,
}: EditorNativeExplosiveBallistics & { distanceCm: number }) {
  const falloffFactor = editorNativeRadialDamageScale({
    distanceCm,
    innerRadiusCm,
    outerRadiusCm,
    falloff,
  });
  const damageSpan = f32(f32(baseDamage) - f32(minimumDamage));
  const rawDamage = f32(
    f32(minimumDamage) + f32(f32(falloffFactor) * damageSpan),
  );
  return { falloffFactor, rawDamage };
}

function nativeNearestRadialImpactDistanceCm(
  originCm: HitVector3,
  hits: readonly EditorNativeRadialComponentHit[],
) {
  let nearestSquared = Number.POSITIVE_INFINITY;
  for (const { impactPointCm } of hits) {
    const x = impactPointCm[0] - originCm[0];
    const y = impactPointCm[1] - originCm[1];
    const z = impactPointCm[2] - originCm[2];
    nearestSquared = Math.min(
      nearestSquared,
      f32(x * x + y * y + z * z),
    );
  }
  return f32(Math.sqrt(nearestSquared));
}

function vehicleHullPoolIndex(model: EditorNativeModel) {
  const ownerPoolIndex = model.owners?.find(
    (owner) => owner.kind === "vehicle-root" && owner.healthPoolIndex !== null,
  )?.healthPoolIndex;
  if (
    typeof ownerPoolIndex === "number" &&
    model.healthPools[ownerPoolIndex]?.kind === "hull"
  ) {
    return ownerPoolIndex;
  }
  const fallback = model.healthPools.findIndex((pool) => pool.kind === "hull");
  return fallback >= 0 ? fallback : null;
}

/**
 * Resolve the shared vehicle-Actor radial route without copying projectile
 * identities into the target model.
 *
 * Dedicated M1A1/M830A1 and M1A1/155 mm probes plus the Technical BMP-1
 * matrix agree on this topology: an exact attached armor hit can admit one
 * indirect root-vehicle radial callback, while the child turret pool never
 * receives that radial event. Pure weapon collision is deliberately excluded;
 * this is not passRadialDamageToParent forwarding.
 */
function attachedDamageBearingArmorAdmitsRootVehicle(
  model: EditorNativeModel,
  componentIndex: number,
  component: EditorNativeComponentRecord,
  surface: EditorNativeSurfaceRecord | undefined,
) {
  if (
    component.semanticKind !== "armor" ||
    component.placementState !== "resolved" ||
    !surface ||
    surface.componentIndex !== componentIndex
  ) {
    return false;
  }
  const damageParentActor = readField(surface.damageParentActor);
  if (!damageParentActor.known || damageParentActor.value !== true) {
    return false;
  }
  const owners = model.owners ?? [];
  const firstOwner = owners[component.ownerIndex];
  if (!firstOwner || firstOwner.kind === "vehicle-root") return false;
  const visited = new Set<number>();
  let ownerIndex: number | null = component.ownerIndex;
  while (ownerIndex !== null && !visited.has(ownerIndex)) {
    visited.add(ownerIndex);
    const owner: EditorNativeOwnerRecord | undefined = owners[ownerIndex];
    if (!owner) return false;
    if (owner.kind === "vehicle-root") return true;
    ownerIndex = owner.parentOwnerIndex;
  }
  return false;
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

export function simulateEditorNativeShot({
  model,
  weaponModel = model,
  weaponIndex,
  targetDistanceM,
  shotDamageMultiplier,
  intersections,
  includeRadial = false,
  vehicleDamagedByRadial = null,
  radialDamageModel = null,
  radialLayerHitSets = [],
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
  /** Exact vehicle CDO flag published by the current mechanics slice. */
  vehicleDamagedByRadial?: boolean | null;
  /** Wiki-owned receiver/query contract for the locked native build. */
  radialDamageModel?: VehicleRadialDamageModel | null;
  /** Optional complete native helper hit multisets; never inferred from render geometry. */
  radialLayerHitSets?: readonly EditorNativeRadialLayerHitSet[];
}): EditorNativeShotResult {
  if (!Number.isFinite(shotDamageMultiplier) || shotDamageMultiplier < 0) {
    throw new Error("shotDamageMultiplier must be a finite non-negative scenario input");
  }
  const ballistics = resolveEditorNativeBallistics(weaponModel, weaponIndex, targetDistanceM);
  const unknowns = [...ballistics.unknowns];
  const layers: EditorNativeHitLayer[] = [];
  const damage: EditorNativeDamageEvent[] = [];
  const radialDamageEvents: EditorNativeDamageEvent[] = [];
  const pointDamagedPools = new Set<number>();
  // A ray that lands exactly on a shared triangle edge can report both faces.
  // Normalize those geometry duplicates before any armor, absorption, or damage
  // state is consumed. Opposite-facing thin-plate entry/exit hits are preserved.
  const orderedWithIgnoredSurfaces = normalizeHitIntersections(
    intersections.map((intersection) => ({
      ...intersection,
      distanceM: intersection.distanceFromRayOriginM,
      componentId: intersection.componentIndex,
      sourceFaceId: intersection.triangleIndex,
    })),
  ).map(({ hit }) => hit);
  const ordered = orderedWithIgnoredSurfaces.filter((intersection) => {
    const component = model.components[intersection.componentIndex];
    const surface = model.surfaceProfiles[intersection.surfaceProfileIndex];
    if (
      !component ||
      !surface ||
      surface.componentIndex !== intersection.componentIndex
    ) {
      return true;
    }
    const consider = readField(surface.considerForPenetration);
    return (
      editorNativePenetrationPrefilter(
        consider.known ? consider.value : null,
      ) !== "skip"
    );
  });
  const firstDistance = ordered[0]?.distanceFromRayOriginM ?? 0;
  let cumulativeDamageAbsorbed = 0;
  let stoppedAtLayer: number | null = null;
  let radial: EditorNativeRadialResult = {
    state: includeRadial ? "not-explosive" : "not-requested",
    order: null,
    directHit: null,
    explosionOriginOffsetCm: null,
    nearestImpactDistanceCm: null,
    falloffFactor: null,
    baseDamage: null,
    minimumDamage: null,
    rawDamage: null,
    layers: [],
    layerOrderEvidence: null,
    layerOrderResolved: null,
    guaranteedPoolIndices: [],
    componentFanout: "native-unknown",
  };
  const orderedDamageEvents = () => {
    if (
      ballistics.impactRadialOrder ===
      "secondary-radial-before-point-before-primary-radial"
    ) {
      const secondaryRadial = radialDamageEvents.filter(
        ({ radialLayerIndex }) => (radialLayerIndex ?? 0) > 0,
      );
      const primaryRadial = radialDamageEvents.filter(
        ({ radialLayerIndex }) => (radialLayerIndex ?? 0) === 0,
      );
      return [...secondaryRadial, ...damage, ...primaryRadial];
    }
    return [...damage, ...radialDamageEvents];
  };

  const appendPointDamageEvent = (
    poolIndex: number,
    sourceComponentIndex: number,
    incomingDamage: number,
    route: EditorNativeDamageEvent["route"],
  ) => {
    if (pointDamagedPools.has(poolIndex)) return false;
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
      damageTypeModifier: factors.modifier,
      routeMultiplier: 1,
      modifierSourcePoolIndex: factors.modifierSourcePoolIndex,
      route,
      damageKind: "point",
      damageTypePath,
      poolDamage,
      effectiveDamage:
        maxHealth.known && maxHealth.value !== null
          ? f32(Math.min(Math.max(0, maxHealth.value), poolDamage))
          : null,
      certainty: directDamageCertainty(model, unknowns),
    });
    pointDamagedPools.add(poolIndex);
    return true;
  };

  if (includeRadial && ballistics.isExplosive === null) {
    radial = { ...radial, state: "native-unknown" };
    addUnknown(unknowns, "explosive routing flag is unresolved");
  } else if (includeRadial && ballistics.isExplosive === true) {
    radial = {
      ...radial,
      state: "native-unknown",
      order: ballistics.impactRadialOrder,
    };
    const explosive = ballistics.explosive;
    const explosiveLayers = ballistics.explosiveLayers;
    const firstImpact = ordered[0];
    if (!radialDamageModel) {
      addUnknown(unknowns, "Wiki radial receiver model is unavailable");
    } else if (!explosive || explosiveLayers.length === 0 || !firstImpact) {
      addUnknown(
        unknowns,
        explosive
          ? "direct radial damage requires one exact impact point"
          : "explosive projectile parameters are unresolved",
      );
    } else {
      const hitSetsByLayer = new Map<string, EditorNativeRadialLayerHitSet>();
      for (const hitSet of radialLayerHitSets) {
        if (
          !["native-observed", "native-reconstructed"].includes(hitSet.evidence) ||
          hitSet.sourceBuildId !== radialDamageModel.sourceBuildId ||
          !hitSet.layerId ||
          hitSetsByLayer.has(hitSet.layerId) ||
          hitSet.componentHits.some(
            (hit) =>
              !(
                (Number.isInteger(hit.componentIndex) &&
                  hit.componentIndex !== null &&
                  model.components[hit.componentIndex]) ||
                (hit.componentIndex === null &&
                  Number.isInteger(hit.ownerIndex) &&
                  model.owners?.[hit.ownerIndex ?? -1] &&
                  typeof hit.queryComponentId === "string" &&
                  hit.queryComponentId.length > 0 &&
                  typeof hit.nativeClassPath === "string" &&
                  hit.nativeClassPath.length > 0)
              ) ||
              hit.impactPointCm.length !== 3 ||
              hit.impactPointCm.some((value) => !Number.isFinite(value)) ||
              (hitSet.evidence === "native-reconstructed" &&
                (!hitSet.originCm ||
                  hitSet.originCm.length !== 3 ||
                  hitSet.originCm.some((value) => !Number.isFinite(value)))),
          )
        ) {
          addUnknown(unknowns, "native radial component-hit evidence is invalid");
          continue;
        }
        hitSetsByLayer.set(hitSet.layerId, hitSet);
      }
      const allGuaranteedPools = new Set<number>();
      const firstComponent = model.components[firstImpact.componentIndex];
      const firstSurface = model.surfaceProfiles[firstImpact.surfaceProfileIndex];
      let rootActorDirectHit: boolean | null = null;
      let rootActorAdmitted = false;
      let radialEventOwnerIndex: number | null = null;
      let rootRoute: EditorNativeDamageEvent["route"] = "radial-indirect";
      let vehicleRadialDisabled = false;
      if (!firstComponent) {
        addUnknown(unknowns, "direct radial impact component is unresolved");
      } else {
        const firstOwner = model.owners?.[firstComponent.ownerIndex];
        if (!firstOwner) {
          addUnknown(
            unknowns,
            `${firstComponent.componentId} radial actor owner is unresolved`,
          );
        } else if (firstOwner.kind === "vehicle-root") {
          rootActorDirectHit = true;
          radialEventOwnerIndex = firstComponent.ownerIndex;
          rootRoute = "radial-direct";
          if (vehicleDamagedByRadial === true) {
            rootActorAdmitted = true;
          } else if (vehicleDamagedByRadial === false) {
            vehicleRadialDisabled = true;
          } else {
            addUnknown(unknowns, "vehicle radial-damage enable flag is unresolved");
          }
        } else {
          const directPool = readField(firstComponent.directDamagePoolIndex);
          const seatPool = directPool.known && directPool.value !== null
            ? model.healthPools[directPool.value]
            : null;
          const passDamage = readField(seatPool?.passDamageToParent ?? null);
          const passRadial = readField(seatPool?.passRadialDamageToParent ?? null);
          if (
            seatPool?.kind === "seat" &&
            passDamage.known && passDamage.value === true &&
            passRadial.known && passRadial.value === true
          ) {
            rootActorDirectHit = true;
            rootActorAdmitted = true;
            radialEventOwnerIndex = firstComponent.ownerIndex;
            rootRoute = "radial-direct-seat-forwarded-to-hull";
          } else if (
            vehicleDamagedByRadial === true &&
            attachedDamageBearingArmorAdmitsRootVehicle(
              model,
              firstImpact.componentIndex,
              firstComponent,
              firstSurface,
            )
          ) {
            rootActorDirectHit = false;
            rootActorAdmitted = true;
            radialEventOwnerIndex = model.owners?.findIndex(
              (owner) => owner.kind === "vehicle-root",
            ) ?? null;
            rootRoute = "radial-indirect";
          } else if (!passDamage.known || !passRadial.known) {
            addUnknown(
              unknowns,
              `${seatPool?.poolId ?? firstOwner.ownerId} radial forwarding flags are unresolved`,
            );
          } else {
            addUnknown(
              unknowns,
              `${firstComponent.componentId} radial root-Actor query is unresolved`,
            );
          }
        }
      }
      const hullPoolIndex = vehicleHullPoolIndex(model);
      if (hullPoolIndex === null) {
        addUnknown(unknowns, "vehicle hull radial damage pool is unresolved");
      } else if (rootActorAdmitted) {
        allGuaranteedPools.add(hullPoolIndex);
      }

      const radialLayers: EditorNativeRadialLayerResult[] = [];
      let everyLayerHasNativeHits = explosiveLayers.length > 0;
      for (const [layerIndex, layer] of explosiveLayers.entries()) {
        const computedOriginCm = firstImpact.point.map(
          (value, axis) =>
            value * 100 + firstImpact.faceNormal[axis] * layer.impactNormalOffsetCm,
        ) as unknown as HitVector3;
        const hitSet = hitSetsByLayer.get(layer.layerId) ?? null;
        const originCm = hitSet?.originCm ?? computedOriginCm;
        everyLayerHasNativeHits &&= hitSet !== null;
        const eventHits = hitSet?.componentHits.filter(
          (hit) =>
            (hit.ownerIndex ?? (
              hit.componentIndex === null
                ? null
                : model.components[hit.componentIndex]?.ownerIndex
            )) === radialEventOwnerIndex,
        ) ?? [];
        let nearestImpactDistanceCm = Math.abs(f32(layer.impactNormalOffsetCm));
        if (eventHits.length > 0) {
          nearestImpactDistanceCm = nativeNearestRadialImpactDistanceCm(
            originCm,
            eventHits,
          );
        } else if (hitSet && rootActorAdmitted) {
          addUnknown(
            unknowns,
            `${layer.layerId} native radial event omitted its receiver Actor hits`,
          );
        }
        const radialDamage = editorNativeRadialDamageAtDistance({
          ...layer,
          distanceCm: nearestImpactDistanceCm,
        });
        const layerGuaranteedPools = new Set<number>();
        if (rootActorAdmitted && hullPoolIndex !== null) {
          layerGuaranteedPools.add(hullPoolIndex);
        }
        for (const poolIndex of layerGuaranteedPools) {
          const pool = model.healthPools[poolIndex];
          if (!pool) continue;
          if (rootActorDirectHit === null) {
            addUnknown(
              unknowns,
              `${pool.poolId} radial direct-hit routing is unresolved`,
            );
            continue;
          }
          const factors = radialDamageFactors(
            model,
            poolIndex,
            layer.damageTypePath,
            rootActorDirectHit,
            unknowns,
          );
          if (factors === null) continue;
          const maxHealth = readField(pool.maxHealth);
          const combinedModifier = f32(
            f32(factors.modifier) * f32(factors.routeMultiplier),
          );
          const poolDamage = f32(
            f32(radialDamage.rawDamage) * combinedModifier,
          );
          radialDamageEvents.push({
            poolIndex,
            poolId: pool.poolId,
            poolKind: pool.kind,
            maxHealth: maxHealth.known ? maxHealth.value : null,
            sourceComponentIndex: firstImpact.componentIndex,
            incomingDamage: radialDamage.rawDamage,
            modifier: combinedModifier,
            damageTypeModifier: factors.modifier,
            routeMultiplier: factors.routeMultiplier,
            modifierSourcePoolIndex: factors.modifierSourcePoolIndex,
            route: rootRoute,
            damageKind: "radial",
            damageTypePath: layer.damageTypePath,
            radialLayerId: layer.layerId,
            radialLayerLabel: layer.shortLabel,
            radialLayerIndex: layerIndex,
            radialComponentHitCount: eventHits.length || 1,
            radialDispatchCount: 1,
            nearestImpactDistanceCm,
            poolDamage,
            effectiveDamage:
              maxHealth.known && maxHealth.value !== null
                ? f32(Math.min(Math.max(0, maxHealth.value), poolDamage))
                : null,
            certainty: "resolved",
          });
        }
        if (
          hitSet &&
          rootActorAdmitted &&
          !vehicleRadialDisabled &&
          radialEventOwnerIndex !== null &&
          rootRoute !== "radial-direct-seat-forwarded-to-hull"
        ) {
          const driveTrainClasses = new Set(
            radialDamageModel.receiver.driveTrainClassPaths,
          );
          const hitsByComponent = new Map<number, EditorNativeRadialComponentHit[]>();
          for (const hit of eventHits) {
            if (hit.componentIndex === null) continue;
            const component = model.components[hit.componentIndex];
            if (
              !component ||
              !driveTrainClasses.has(hit.nativeClassPath ?? component.classPath ?? "") ||
              (hit.nativeClassPath !== undefined && hit.nativeClassPath !== component.classPath)
            ) {
              continue;
            }
            const group = hitsByComponent.get(hit.componentIndex) ?? [];
            group.push(hit);
            hitsByComponent.set(hit.componentIndex, group);
          }
          for (const [componentIndex, componentHits] of hitsByComponent) {
            const component = model.components[componentIndex];
            const poolEvidence = readField(component.directDamagePoolIndex);
            if (
              !poolEvidence.known ||
              poolEvidence.value === null ||
              !model.healthPools[poolEvidence.value]
            ) {
              addUnknown(unknowns, `${component.componentId} radial health pool is unresolved`);
              continue;
            }
            const poolIndex = poolEvidence.value;
            const pool = model.healthPools[poolIndex];
            if (pool.kind !== "track" && pool.kind !== "wheel") {
              addUnknown(unknowns, `${component.componentId} drivetrain pool kind drifted`);
              continue;
            }
            const factors = radialDamageFactors(
              model,
              poolIndex,
              layer.damageTypePath,
              rootActorDirectHit === true,
              unknowns,
            );
            if (factors === null) continue;
            const componentDistanceCm = nativeNearestRadialImpactDistanceCm(
              originCm,
              componentHits,
            );
            const componentRadialDamage = editorNativeRadialDamageAtDistance({
              ...layer,
              distanceCm: componentDistanceCm,
            });
            const combinedModifier = f32(
              f32(factors.modifier) * f32(factors.routeMultiplier),
            );
            const damagePerDispatch = f32(
              f32(componentRadialDamage.rawDamage) * combinedModifier,
            );
            const poolDamage = f32(damagePerDispatch * componentHits.length);
            const maxHealth = readField(pool.maxHealth);
            radialDamageEvents.push({
              poolIndex,
              poolId: pool.poolId,
              poolKind: pool.kind,
              maxHealth: maxHealth.known ? maxHealth.value : null,
              sourceComponentIndex: componentIndex,
              incomingDamage: componentRadialDamage.rawDamage,
              modifier: combinedModifier,
              damageTypeModifier: factors.modifier,
              routeMultiplier: factors.routeMultiplier,
              modifierSourcePoolIndex: factors.modifierSourcePoolIndex,
              route: rootActorDirectHit ? "radial-direct" : "radial-indirect",
              damageKind: "radial",
              damageTypePath: layer.damageTypePath,
              radialLayerId: layer.layerId,
              radialLayerLabel: layer.shortLabel,
              radialLayerIndex: layerIndex,
              radialComponentHitCount: componentHits.length,
              radialDispatchCount: componentHits.length,
              nearestImpactDistanceCm: componentDistanceCm,
              poolDamage,
              effectiveDamage:
                maxHealth.known && maxHealth.value !== null
                  ? f32(Math.min(Math.max(0, maxHealth.value), poolDamage))
                  : null,
              certainty: "resolved",
            });
            layerGuaranteedPools.add(poolIndex);
            allGuaranteedPools.add(poolIndex);
          }
        }
        radialLayers.push({
          layerId: layer.layerId,
          label: layer.label,
          shortLabel: layer.shortLabel,
          damageTypePath: layer.damageTypePath,
          orderEvidence: layer.orderEvidence,
          orderResolved: ballistics.explosiveLayerOrderResolved,
          explosionOriginOffsetCm: layer.impactNormalOffsetCm,
          nearestImpactDistanceCm,
          falloffFactor: radialDamage.falloffFactor,
          baseDamage: layer.baseDamage,
          minimumDamage: layer.minimumDamage,
          rawDamage: radialDamage.rawDamage,
          guaranteedPoolIndices: [...layerGuaranteedPools],
        });
      }
      const primaryRadial = radialLayers[0];
      const componentFanout = vehicleRadialDisabled
        ? "vehicle-radial-disabled"
        : everyLayerHasNativeHits
          ? "drivetrain-resolved"
          : rootActorAdmitted
            ? "native-query-required"
            : "native-unknown";
      radial = {
        state:
          vehicleRadialDisabled || (rootActorAdmitted && everyLayerHasNativeHits)
            ? "resolved"
            : "partial",
        order: ballistics.impactRadialOrder,
        directHit: rootActorDirectHit,
        explosionOriginOffsetCm:
          primaryRadial?.explosionOriginOffsetCm ?? null,
        nearestImpactDistanceCm:
          primaryRadial?.nearestImpactDistanceCm ?? null,
        falloffFactor: primaryRadial?.falloffFactor ?? null,
        baseDamage: primaryRadial?.baseDamage ?? null,
        minimumDamage: primaryRadial?.minimumDamage ?? null,
        rawDamage: primaryRadial?.rawDamage ?? null,
        layers: radialLayers,
        layerOrderEvidence: ballistics.explosiveLayerOrderEvidence,
        layerOrderResolved: ballistics.explosiveLayerOrderResolved,
        guaranteedPoolIndices: [...allGuaranteedPools],
        componentFanout,
      };
      if (
        radialLayers.length > 1 &&
        ballistics.explosiveLayerOrderResolved === false
      ) {
        addUnknown(
          unknowns,
          `${weaponModel.weapons[weaponIndex]?.weaponId ?? "weapon"} multi-layer explosion runtime order is unresolved`,
        );
      }
      if (!vehicleRadialDisabled && rootActorAdmitted && !everyLayerHasNativeHits) {
        addUnknown(
          unknowns,
          "native radial component-hit multiset is not published",
        );
      }
    }
  }

  if (
    ballistics.penetrationAtRangeMm === null ||
    ballistics.penetrationTraceDistanceM === null ||
    ballistics.impactDamageAtRange === null ||
    ballistics.traceDistanceAfterPenetrationM === null
  ) {
    const orderedDamage = orderedDamageEvents();
    return {
      resolution: resolutionForUnknowns(unknowns, orderedDamage.length > 0),
      ballistics,
      shotDamageMultiplier,
      layers,
      damage: orderedDamage,
      stoppedAtLayer,
      radial,
      unknowns,
    };
  }

  const baseDamage = f32(
    ballistics.impactDamageAtRange * f32(shotDamageMultiplier),
  );

  for (const intersection of ordered) {
    const component = model.components[intersection.componentIndex];
    const surface = model.surfaceProfiles[intersection.surfaceProfileIndex];
    if (!component || !surface || surface.componentIndex !== intersection.componentIndex) {
      addUnknown(unknowns, `triangle ${intersection.triangleIndex} semantic lookup failed`);
      stoppedAtLayer = layers.length;
      break;
    }

    const traceDistance = ballistics.traceDistanceAfterPenetrationM;
    const {
      distanceFromFirstHitM,
      distanceFromPenetrationTraceStartM,
      postPenetrationTraceFactor,
      remainingDamage,
      remainingDamageRatio,
      availablePenetrationMm,
    } = resolveEditorNativePenetrationArithmetic({
      distanceFromRayOriginM: intersection.distanceFromRayOriginM,
      firstDistanceFromRayOriginM: firstDistance,
      penetrationTraceDistanceM: ballistics.penetrationTraceDistanceM,
      baseDamage,
      cumulativeDamageAbsorbed,
      penetrationAtRangeMm: ballistics.penetrationAtRangeMm,
      incidenceFactor: intersection.incidenceFactor,
    });
    // Native PostImpactBulletTrace only queries the finite segment ending at
    // the weapon's own post-penetration distance. The browser raycaster is
    // infinite, so discard geometry beyond that endpoint before it can become
    // a synthetic stopping layer.
    if (
      !editorNativeTraceIncludesDistance({
        distanceFromFirstHitM,
        traceDistanceAfterPenetrationM: traceDistance,
      })
    ) {
      break;
    }

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
    } else if (!thickness.known || thickness.value === null) {
      addUnknown(unknowns, `${surface.surfaceProfileId} armor thickness is unreadable`);
      stopReason = "armor thickness is native-unknown";
    } else {
      // DidPenetrateArmor uses a strict comparison; equality is a failed penetration.
      penetrated = editorNativeDidPenetrateArmor(
        availablePenetrationMm,
        thickness.value,
      );
      if (!penetrated) {
        stopReason =
          thickness.value === 0 && postPenetrationTraceFactor <= 0
            ? "post-penetration trace distance is exhausted"
            : thickness.value === 0 && remainingDamageRatio <= 0
              ? "remaining damage is exhausted"
              : "available penetration is not greater than thickness";
      }
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
      distanceFromPenetrationTraceStartM,
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
        appendPointDamageEvent(
          poolIndex.value,
          intersection.componentIndex,
          remainingDamage,
          "direct",
        );

        if (pool.kind === "seat") {
          const passDamage = readField(pool.passDamageToParent ?? null);
          const passPoint = readField(pool.passPointDamageToParent ?? null);
          if (!passDamage.known || !passPoint.known) {
            addUnknown(unknowns, `${pool.poolId} point-damage forwarding flags are unreadable`);
          } else if (
            passDamage.value === true &&
            passPoint.value === true
          ) {
            const parentPoolIndex = parentHealthPoolIndex(model, pool);
            if (parentPoolIndex === null || !model.healthPools[parentPoolIndex]) {
              addUnknown(unknowns, `${pool.poolId} parent health pool is unresolved`);
            } else {
              appendPointDamageEvent(
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

  const orderedDamage = orderedDamageEvents();
  return {
    resolution: resolutionForUnknowns(unknowns, layers.length > 0),
    ballistics,
    shotDamageMultiplier,
    layers,
    damage: orderedDamage,
    stoppedAtLayer,
    radial,
    unknowns,
  };
}
