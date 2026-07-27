import type {
  ReferenceTurret,
  ReferenceTurretArticulation,
  ReferenceTurretLimitSample,
} from "../app/catalog-types";

export interface TurretPitchWindow {
  minPitchDegrees: number;
  maxPitchDegrees: number;
  authority: "editor" | "reference";
  directional: boolean;
}

export interface TurretYawBounds {
  minDegrees: number;
  maxDegrees: number;
  continuous: boolean;
  verified: boolean;
}

export interface RuntimeTurretPlacement {
  stableOccurrenceId: string;
  name: string;
  actor: string;
  sourceMeshPath: string;
  matrix: number[];
}

export interface RuntimeTurretAssembly {
  yawPlacementIds: string[];
  pitchPlacementIds: string[];
  hitYawPlacementIds?: string[];
  hitActorClassNames?: string[];
  yawPivot: [number, number, number];
  pitchPivot: [number, number, number];
  yawComponentPlacementId: string;
  pitchComponentPlacementId: string | null;
}

/**
 * Expand exact parent/child turret assemblies without guessing from names.
 *
 * `resolveRuntimeTurretAssembly` deliberately starts from a bounded spatial
 * cluster. That is enough to identify a nested station's yaw anchor, but a
 * long barrel can extend beyond the parent's carry radius. Once the parent's
 * yaw assembly already contains the child's exact yaw component occurrence,
 * the local visual package has established the attachment relationship. The
 * parent must then carry the child's complete yaw assembly while leaving the
 * child's pitch transform independent.
 */
export function carryNestedRuntimeTurretAssemblies(
  assemblies: readonly (RuntimeTurretAssembly | null)[],
) {
  const expanded = assemblies.map((assembly) =>
    assembly
      ? {
          ...assembly,
          yawPlacementIds: [...assembly.yawPlacementIds],
          pitchPlacementIds: [...assembly.pitchPlacementIds],
          hitYawPlacementIds: assembly.hitYawPlacementIds
            ? [...assembly.hitYawPlacementIds]
            : undefined,
          hitActorClassNames: assembly.hitActorClassNames
            ? [...assembly.hitActorClassNames]
            : undefined,
        }
      : null
  );
  const appendUnique = (target: string[], values: readonly string[]) => {
    let changed = false;
    const known = new Set(target);
    for (const value of values) {
      if (known.has(value)) continue;
      known.add(value);
      target.push(value);
      changed = true;
    }
    return changed;
  };

  let changed = true;
  for (
    let pass = 0;
    changed && pass < Math.max(1, expanded.length);
    pass += 1
  ) {
    changed = false;
    for (let parentIndex = 0; parentIndex < expanded.length; parentIndex += 1) {
      const parent = expanded[parentIndex];
      if (!parent) continue;
      for (let childIndex = 0; childIndex < expanded.length; childIndex += 1) {
        if (parentIndex === childIndex) continue;
        const child = expanded[childIndex];
        if (
          !child ||
          child.yawComponentPlacementId === parent.yawComponentPlacementId ||
          !parent.yawPlacementIds.includes(child.yawComponentPlacementId)
        ) {
          continue;
        }
        changed =
          appendUnique(parent.yawPlacementIds, child.yawPlacementIds) ||
          changed;
        if (child.hitYawPlacementIds) {
          parent.hitYawPlacementIds ??= [];
          changed =
            appendUnique(
              parent.hitYawPlacementIds,
              child.hitYawPlacementIds,
            ) || changed;
        }
        if (child.hitActorClassNames) {
          parent.hitActorClassNames ??= [];
          changed =
            appendUnique(
              parent.hitActorClassNames,
              child.hitActorClassNames,
            ) || changed;
        }
      }
    }
  }
  return expanded;
}

export interface RuntimeTurretFallbackSpec {
  yawAnchorComponentName: string;
  yawAnchorActorName?: string;
  pitchUsesYawAnchor?: boolean;
  hitActorClassNames?: string[];
}

export interface RuntimeTurretHitComponentAssembly {
  yawComponentIndices: number[];
  pitchComponentIndices: number[];
}

interface RuntimeTurretHitComponent {
  componentPath: string;
}

const FULL_TURN_DEGREES = 360;
const HALF_TURN_DEGREES = 180;
const SIBLING_CARRY_RADIUS_METRES = 2.5;

/**
 * Runtime visual packages are exported through the Unreal glTF axis mapping
 * `UE (X, Y, Z) -> glTF (X, Z, Y) / 100` (see the runtime-probe extraction SOP).
 * That leaves the viewer working in metres with X forward, Y up and Z pointing
 * along Unreal's +Y (vehicle right).
 *
 * Turret yaw is therefore a rotation about Y, and turret pitch is a rotation
 * about Z — not about X, which is the vehicle's longitudinal (roll) axis.
 *
 * Signs follow from mapping Unreal's rotations through that axis swap:
 *
 * - Unreal yaw takes forward onto vehicle-right, i.e. UE `+X -> +Y`, which is
 *   glTF `+X -> +Z`. A right-handed rotation about glTF +Y takes `+X -> -Z`,
 *   so the rendered yaw angle is the negation of the Unreal yaw the limit data
 *   and the UI are expressed in. (On the M1A2 the commander's CROWS sits at
 *   `Z = +0.889` and the loader's M240 at `Z = -0.326`, which is right and
 *   left respectively, so +Z is vehicle-right.)
 * - Unreal positive pitch is elevation, taking UE `+X -> +Z`, which is glTF
 *   `+X -> +Y`. That is a positive right-handed rotation about glTF +Z, so
 *   pitch keeps its sign.
 */
export const TURRET_YAW_AXIS = "y" as const;
export const TURRET_PITCH_AXIS = "z" as const;

type Vector3 = [number, number, number];

function identityMatrix(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Column-major 4x4 rotation about `axis` through `pivot`, matching the layout
 * three.js uses for `Matrix4.fromArray`.
 */
function rotationAboutPivot(
  axis: "y" | "z",
  radians: number,
  pivot: Vector3,
): number[] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const matrix = identityMatrix();
  if (axis === "y") {
    matrix[0] = cos;
    matrix[2] = -sin;
    matrix[8] = sin;
    matrix[10] = cos;
  } else {
    matrix[0] = cos;
    matrix[1] = sin;
    matrix[4] = -sin;
    matrix[5] = cos;
  }
  // translate(pivot) * rotation * translate(-pivot)
  matrix[12] = pivot[0] -
    (matrix[0] * pivot[0] + matrix[4] * pivot[1] + matrix[8] * pivot[2]);
  matrix[13] = pivot[1] -
    (matrix[1] * pivot[0] + matrix[5] * pivot[1] + matrix[9] * pivot[2]);
  matrix[14] = pivot[2] -
    (matrix[2] * pivot[0] + matrix[6] * pivot[1] + matrix[10] * pivot[2]);
  return matrix;
}

export function turretArticulationMatrices(
  assembly: Pick<RuntimeTurretAssembly, "yawPivot" | "pitchPivot">,
  yawDegrees: number,
  pitchDegrees: number,
) {
  const toRadians = Math.PI / 180;
  return {
    yaw: rotationAboutPivot(
      TURRET_YAW_AXIS,
      -yawDegrees * toRadians,
      assembly.yawPivot,
    ),
    pitch: rotationAboutPivot(
      TURRET_PITCH_AXIS,
      pitchDegrees * toRadians,
      assembly.pitchPivot,
    ),
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeTurretYaw(value: number) {
  if (!Number.isFinite(value)) return 0;
  const normalized = (
    (value + HALF_TURN_DEGREES) % FULL_TURN_DEGREES + FULL_TURN_DEGREES
  ) % FULL_TURN_DEGREES - HALF_TURN_DEGREES;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export const TURRET_YAW_DETENTS = [-180, -90, 0, 90] as const;

export interface TurretYawDetentResult {
  yawDegrees: number;
  detentDegrees: number | null;
}

function turretYawAngularDistance(leftDegrees: number, rightDegrees: number) {
  return Math.abs(normalizeTurretYaw(leftDegrees - rightDegrees));
}

export function turretYawFromCompassVector(
  horizontalOffset: number,
  verticalOffset: number,
) {
  if (
    !Number.isFinite(horizontalOffset) ||
    !Number.isFinite(verticalOffset) ||
    (horizontalOffset === 0 && verticalOffset === 0)
  ) {
    return 0;
  }
  return normalizeTurretYaw(
    Math.atan2(horizontalOffset, -verticalOffset) * HALF_TURN_DEGREES / Math.PI,
  );
}

export function resolveTurretYawDetent(
  rawYawDegrees: number,
  activeDetentDegrees: number | null,
  detents: readonly number[] = TURRET_YAW_DETENTS,
  captureDegrees = 4,
  releaseDegrees = 8,
): TurretYawDetentResult {
  const yawDegrees = normalizeTurretYaw(rawYawDegrees);
  if (detents.length === 0) {
    return { yawDegrees, detentDegrees: null };
  }

  const normalizedDetents = detents.map(normalizeTurretYaw);
  const captureThreshold = Math.max(0, captureDegrees);
  const releaseThreshold = Math.max(captureThreshold, releaseDegrees);
  if (activeDetentDegrees !== null) {
    const activeDetent = normalizeTurretYaw(activeDetentDegrees);
    const stillAvailable = normalizedDetents.some(
      (detent) => turretYawAngularDistance(detent, activeDetent) < 0.001,
    );
    if (
      stillAvailable &&
      turretYawAngularDistance(yawDegrees, activeDetent) <= releaseThreshold
    ) {
      return {
        yawDegrees: activeDetent,
        detentDegrees: activeDetent,
      };
    }
  }

  let nearestDetent = normalizedDetents[0];
  let nearestDistance = turretYawAngularDistance(yawDegrees, nearestDetent);
  for (const candidate of normalizedDetents.slice(1)) {
    const distance = turretYawAngularDistance(yawDegrees, candidate);
    if (distance < nearestDistance) {
      nearestDetent = candidate;
      nearestDistance = distance;
    }
  }
  if (nearestDistance <= captureThreshold) {
    return {
      yawDegrees: nearestDetent,
      detentDegrees: nearestDetent,
    };
  }
  return { yawDegrees, detentDegrees: null };
}

function validSamples(turret: ReferenceTurret) {
  return (turret.limits?.pitchByYaw ?? [])
    .filter(
      (sample): sample is ReferenceTurretLimitSample =>
        finiteNumber(sample?.yawDegrees) &&
        finiteNumber(sample?.minPitchDegrees) &&
        finiteNumber(sample?.maxPitchDegrees) &&
        sample.minPitchDegrees <= sample.maxPitchDegrees,
    )
    .map((sample) => ({
      ...sample,
      yawDegrees: normalizeTurretYaw(sample.yawDegrees),
    }))
    .sort((left, right) => left.yawDegrees - right.yawDegrees);
}

function fallbackPitchWindow(turret: ReferenceTurret): TurretPitchWindow | null {
  if (
    !finiteNumber(turret.minPitchDegrees) ||
    !finiteNumber(turret.maxPitchDegrees) ||
    turret.minPitchDegrees > turret.maxPitchDegrees
  ) {
    return null;
  }
  return {
    minPitchDegrees: turret.minPitchDegrees,
    maxPitchDegrees: turret.maxPitchDegrees,
    authority: turret.limits?.authority ?? "reference",
    directional: false,
  };
}

export function turretPitchWindowAtYaw(
  turret: ReferenceTurret,
  yawDegrees: number,
): TurretPitchWindow | null {
  const samples = validSamples(turret);
  if (samples.length === 0) return fallbackPitchWindow(turret);
  if (samples.length === 1) {
    return {
      minPitchDegrees: samples[0].minPitchDegrees,
      maxPitchDegrees: samples[0].maxPitchDegrees,
      authority: turret.limits?.authority ?? "reference",
      directional: false,
    };
  }

  const target = normalizeTurretYaw(yawDegrees);
  let lower = samples.at(-1)!;
  let upper = samples[0];
  let targetForInterpolation = target;
  for (let index = 0; index < samples.length - 1; index += 1) {
    if (
      target >= samples[index].yawDegrees &&
      target <= samples[index + 1].yawDegrees
    ) {
      lower = samples[index];
      upper = samples[index + 1];
      break;
    }
  }
  if (upper.yawDegrees <= lower.yawDegrees) {
    upper = { ...upper, yawDegrees: upper.yawDegrees + FULL_TURN_DEGREES };
    if (targetForInterpolation < lower.yawDegrees) {
      targetForInterpolation += FULL_TURN_DEGREES;
    }
  }
  const span = upper.yawDegrees - lower.yawDegrees;
  const ratio = span <= 0
    ? 0
    : (targetForInterpolation - lower.yawDegrees) / span;
  const interpolate = (from: number, to: number) => from + (to - from) * ratio;
  return {
    minPitchDegrees: interpolate(
      lower.minPitchDegrees,
      upper.minPitchDegrees,
    ),
    maxPitchDegrees: interpolate(
      lower.maxPitchDegrees,
      upper.maxPitchDegrees,
    ),
    authority: turret.limits?.authority ?? "reference",
    directional: true,
  };
}

export function turretYawBounds(turret: ReferenceTurret): TurretYawBounds {
  const yaw = turret.limits?.yaw;
  if (
    yaw &&
    finiteNumber(yaw.minDegrees) &&
    finiteNumber(yaw.maxDegrees) &&
    yaw.minDegrees < yaw.maxDegrees
  ) {
    return {
      minDegrees: yaw.minDegrees,
      maxDegrees: yaw.maxDegrees,
      continuous: yaw.continuous,
      verified: turret.limits?.authority === "editor",
    };
  }
  return {
    minDegrees: -HALF_TURN_DEGREES,
    maxDegrees: HALF_TURN_DEGREES,
    continuous: true,
    verified: false,
  };
}

export function clampTurretYaw(turret: ReferenceTurret, yawDegrees: number) {
  const bounds = turretYawBounds(turret);
  if (bounds.continuous) return normalizeTurretYaw(yawDegrees);
  return Math.min(Math.max(yawDegrees, bounds.minDegrees), bounds.maxDegrees);
}

export function clampTurretPitch(
  turret: ReferenceTurret,
  yawDegrees: number,
  pitchDegrees: number,
) {
  const window = turretPitchWindowAtYaw(turret, yawDegrees);
  if (!window) return 0;
  return Math.min(
    Math.max(pitchDegrees, window.minPitchDegrees),
    window.maxPitchDegrees,
  );
}

function blueprintStem(value: string | null | undefined) {
  if (!value) return "";
  const leaf = value.split(/[/.]/u).at(-1) ?? value;
  return leaf
    .replace(/_\d+$/u, "")
    .replace(/_C$/iu, "")
    .replace(/^BP_/iu, "")
    .replace(/[^a-z0-9]+/giu, "")
    .toLocaleLowerCase("en");
}

const RUNTIME_TURRET_FALLBACK_SPECS = new Map<
  string,
  RuntimeTurretFallbackSpec
>([
  [
    "pmvmag58x3|pmvturretrearl",
    { yawAnchorComponentName: "Mag58Base_Left" },
  ],
  [
    "pmvmag58x3|pmvturretrearr",
    { yawAnchorComponentName: "Mag58Base_Right" },
  ],
  [
    "lav6desert|lav6commanderturretdesert",
    {
      yawAnchorComponentName: "WeaponMesh3P",
      yawAnchorActorName: "BP_C6_Commander_Turret_Weapon_Desert_C",
      pitchUsesYawAnchor: true,
      hitActorClassNames: ["BP_LAV6_Commander_Turret_Desert_C"],
    },
  ],
  [
    "lav6woodland|lav6commanderturret",
    {
      yawAnchorComponentName: "WeaponMesh3P",
      yawAnchorActorName: "BP_C6_Commander_Turret_Weapon_C",
      pitchUsesYawAnchor: true,
      hitActorClassNames: ["BP_LAV6_Commander_Turret_C"],
    },
  ],
]);

/**
 * Exact local bindings for a visual package where the exported vehicle
 * skeletal mesh contains the mount but Unreal did not emit the child turret
 * actor as a standalone placement. This is deliberately a closed spec: an
 * unknown class stays unavailable instead of falling back to fuzzy names.
 */
export function runtimeTurretFallbackSpec(
  vehicleGeneratedClass: string | null,
  turretName: string,
): RuntimeTurretFallbackSpec | null {
  return RUNTIME_TURRET_FALLBACK_SPECS.get(
    `${blueprintStem(vehicleGeneratedClass)}|${blueprintStem(turretName)}`,
  ) ?? null;
}

function actorMatchesClass(actor: string, className: string | null | undefined) {
  const actorStem = blueprintStem(actor);
  const classStem = blueprintStem(className);
  return actorStem.length > 0 && actorStem === classStem;
}

function placementTranslation(
  placement: RuntimeTurretPlacement,
): [number, number, number] {
  if (
    placement.matrix.length !== 16 ||
    !placement.matrix.every(finiteNumber)
  ) {
    return [0, 0, 0];
  }
  return [placement.matrix[12], placement.matrix[13], placement.matrix[14]];
}

function placementDistance(
  placement: RuntimeTurretPlacement,
  pivot: [number, number, number],
) {
  const translation = placementTranslation(placement);
  return Math.hypot(
    translation[0] - pivot[0],
    translation[1] - pivot[1],
    translation[2] - pivot[2],
  );
}

function normalizedPlacementIdentity(placement: RuntimeTurretPlacement) {
  return `${placement.name} ${placement.actor} ${placement.sourceMeshPath}`
    .toLocaleLowerCase("en");
}

function placementMatchesComponent(
  placement: RuntimeTurretPlacement,
  componentName: string | null | undefined,
) {
  return Boolean(componentName) &&
    placement.name.toLocaleLowerCase("en") ===
      componentName?.toLocaleLowerCase("en");
}

function placementMatchesWeapon(
  placement: RuntimeTurretPlacement,
  weaponNames: string[],
) {
  const actorStem = blueprintStem(placement.actor);
  return weaponNames.some((weaponName) => {
    const weaponStem = blueprintStem(weaponName);
    return weaponStem.length >= 4 && (
      actorStem === weaponStem ||
      actorStem.includes(weaponStem) ||
      weaponStem.includes(actorStem)
    );
  });
}

function likelyYawPlacement(placement: RuntimeTurretPlacement) {
  return /(turret|cupola|rws|crows|mount|periscope)/iu.test(
    normalizedPlacementIdentity(placement),
  );
}

function likelyPitchPlacement(placement: RuntimeTurretPlacement) {
  return /(weaponmesh3p|main.?gun|gun|cannon|barrel|launcher|mortar|tube)/iu.test(
    normalizedPlacementIdentity(placement),
  );
}

function placementMatchesAnyComponent(
  placement: RuntimeTurretPlacement,
  componentNames: string[] | null | undefined,
) {
  if (!componentNames?.length) return false;
  const name = placement.name.toLocaleLowerCase("en");
  return componentNames.some(
    (componentName) => componentName.toLocaleLowerCase("en") === name,
  );
}

function addVectors(
  base: [number, number, number],
  offset: readonly number[] | null | undefined,
): [number, number, number] {
  if (!offset || offset.length !== 3 || !offset.every(finiteNumber)) return base;
  return [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
}

/**
 * Anchor a sibling station so weapon actors shared between identical stations
 * (helicopter door guns, twin remote mounts) attach to the nearest one instead
 * of every station claiming every instance.
 */
function stationAnchorTranslation(
  placements: RuntimeTurretPlacement[],
  turretName: string,
): [number, number, number] | null {
  const actorPlacements = placements.filter((placement) =>
    actorMatchesClass(placement.actor, turretName)
  );
  if (actorPlacements.length === 0) return null;
  const anchor = actorPlacements.find(likelyYawPlacement) ?? actorPlacements[0];
  return placementTranslation(anchor);
}

export function resolveRuntimeTurretAssembly({
  placements,
  vehicleGeneratedClass,
  turretName,
  stationWeaponNames,
  articulation,
  primary,
  siblingTurretNames = [],
  absorbsSiblingStations = primary,
  fallbackYawAnchorComponentName,
  fallbackYawAnchorActorName,
  fallbackPitchUsesYawAnchor = false,
  fallbackHitActorClassNames = [],
  carriedHitActorClassNames = [],
  siblingFallbackYawAnchorComponentNames = [],
}: {
  placements: RuntimeTurretPlacement[];
  vehicleGeneratedClass: string | null;
  turretName: string;
  stationWeaponNames: string[];
  articulation?: ReferenceTurretArticulation;
  primary: boolean;
  siblingTurretNames?: string[];
  /**
   * Whether neighbouring stations ride on this one. A hull-mounted main turret
   * carries its commander cupola and remote mount around with it; peer stations
   * such as a helicopter's left and right door guns do not carry each other.
   */
  absorbsSiblingStations?: boolean;
  fallbackYawAnchorComponentName?: string;
  fallbackYawAnchorActorName?: string;
  fallbackPitchUsesYawAnchor?: boolean;
  fallbackHitActorClassNames?: string[];
  carriedHitActorClassNames?: string[];
  siblingFallbackYawAnchorComponentNames?: string[];
}): RuntimeTurretAssembly | null {
  const exactTurretActorPlacements = placements.filter((placement) =>
    actorMatchesClass(placement.actor, turretName)
  );
  const rootVehiclePlacements = placements.filter((placement) =>
    actorMatchesClass(placement.actor, vehicleGeneratedClass)
  );
  const fallbackAnchorCandidates = fallbackYawAnchorActorName
    ? placements.filter((placement) =>
        actorMatchesClass(placement.actor, fallbackYawAnchorActorName)
      )
    : rootVehiclePlacements;
  const fallbackAnchorPlacements = exactTurretActorPlacements.length === 0 &&
      fallbackYawAnchorComponentName
    ? fallbackAnchorCandidates.filter((placement) =>
        placementMatchesComponent(placement, fallbackYawAnchorComponentName)
      )
    : [];
  const turretActorPlacements = exactTurretActorPlacements.length > 0
    ? exactTurretActorPlacements
    : fallbackAnchorPlacements;
  if (turretActorPlacements.length === 0) return null;
  const usesFallbackAnchor = exactTurretActorPlacements.length === 0;

  // The editor names the yaw/pitch drivers after SceneComponents
  // (`DefaultSceneRoot`, `GunAttachPoint`, `GunMountComponent`) that carry no
  // geometry, so they never appear in the visual placement list. The mesh name
  // lists below are the components those drivers actually move.
  const yawComponentPlacement = turretActorPlacements.find((placement) =>
    placementMatchesComponent(
      placement,
      articulation?.yawAnchorMeshComponentName,
    )
  ) ?? turretActorPlacements.find((placement) =>
    placementMatchesComponent(placement, articulation?.yawComponentName)
  ) ?? turretActorPlacements.find((placement) =>
    placementMatchesAnyComponent(placement, articulation?.yawMeshComponentNames)
  ) ?? turretActorPlacements.find(likelyYawPlacement) ??
    turretActorPlacements[0];
  const yawPivot = addVectors(
    placementTranslation(yawComponentPlacement),
    articulation?.yawPivotOffsetMetres,
  );
  const rootVehiclePlacementIds = new Set(
    rootVehiclePlacements
      .map((placement) => placement.stableOccurrenceId),
  );

  const otherTurretNames = siblingTurretNames.filter(
    (name) => blueprintStem(name) !== blueprintStem(turretName),
  );
  const stationAnchor = stationAnchorTranslation(placements, turretName) ??
    yawPivot;
  const siblingAnchors = otherTurretNames
    .map((name) => stationAnchorTranslation(placements, name))
    .filter((anchor): anchor is [number, number, number] => anchor !== null);
  siblingAnchors.push(
    ...rootVehiclePlacements
      .filter((placement) =>
        siblingFallbackYawAnchorComponentNames.some((componentName) =>
          placementMatchesComponent(placement, componentName)
        )
      )
      .map(placementTranslation),
  );
  const ownsWeaponPlacement = (placement: RuntimeTurretPlacement) => {
    if (!placementMatchesWeapon(placement, stationWeaponNames)) return false;
    if (siblingAnchors.length === 0) return true;
    const ownDistance = placementDistance(placement, stationAnchor);
    return siblingAnchors.every(
      (anchor) => ownDistance <= placementDistance(placement, anchor),
    );
  };
  const belongsToOtherStation = (placement: RuntimeTurretPlacement) =>
    otherTurretNames.some((name) => actorMatchesClass(placement.actor, name));

  const explicitStationPlacements = placements.filter((placement) =>
    actorMatchesClass(placement.actor, turretName) ||
    ownsWeaponPlacement(placement)
  );
  const yawPlacements = primary
    ? placements.filter(
        (placement) => {
          if (rootVehiclePlacementIds.has(placement.stableOccurrenceId)) {
            return false;
          }
          const distance = placementDistance(placement, yawPivot);
          const explicitlyOwned =
            actorMatchesClass(placement.actor, turretName) ||
            ownsWeaponPlacement(placement);
          if (explicitlyOwned) return distance <= 6;
          if (!absorbsSiblingStations) {
            return false;
          }
          return distance <= SIBLING_CARRY_RADIUS_METRES;
        },
      )
    : explicitStationPlacements.filter(
        (placement) => placementDistance(placement, yawPivot) <= 6,
      );
  const yawPlacementIds = new Set(
    [...yawPlacements, ...turretActorPlacements]
      .map((placement) => placement.stableOccurrenceId),
  );
  const hitYawPlacementIds = [...yawPlacementIds].filter(
    (placementId) =>
      !usesFallbackAnchor || !rootVehiclePlacementIds.has(placementId),
  );

  const pitchPlacements = yawPlacements.filter((placement) => {
    if (
      placement.stableOccurrenceId === yawComponentPlacement.stableOccurrenceId &&
      !(usesFallbackAnchor && fallbackPitchUsesYawAnchor)
    ) {
      return false;
    }
    // A neighbouring station's own turret body must never ride this station's
    // pitch axis, even when it sits inside the proximity envelope.
    if (belongsToOtherStation(placement)) return false;
    if (actorMatchesClass(placement.actor, turretName)) {
      if (
        placementMatchesAnyComponent(
          placement,
          articulation?.pitchMeshComponentNames,
        )
      ) {
        return true;
      }
      if (
        placementMatchesAnyComponent(
          placement,
          articulation?.yawMeshComponentNames,
        )
      ) {
        return false;
      }
      return likelyPitchPlacement(placement);
    }
    return ownsWeaponPlacement(placement) && likelyPitchPlacement(placement);
  });

  const pitchAnchorPlacement = pitchPlacements.find((placement) =>
    placementMatchesComponent(
      placement,
      articulation?.pitchAnchorMeshComponentName,
    )
  ) ?? [...pitchPlacements].sort(
    (left, right) =>
      placementDistance(left, yawPivot) - placementDistance(right, yawPivot),
  )[0] ?? null;
  const pitchPivot = pitchAnchorPlacement
    ? addVectors(
        placementTranslation(pitchAnchorPlacement),
        articulation?.pitchPivotOffsetMetres,
      )
    : yawPivot;
  const hitActorClassNames = [
    ...new Set([
      ...(usesFallbackAnchor ? fallbackHitActorClassNames : []),
      ...carriedHitActorClassNames,
    ]),
  ];

  return {
    yawPlacementIds: [...yawPlacementIds],
    pitchPlacementIds: pitchPlacements.map(
      (placement) => placement.stableOccurrenceId,
    ),
    hitYawPlacementIds,
    ...(hitActorClassNames.length > 0 ? { hitActorClassNames } : {}),
    yawPivot,
    pitchPivot,
    yawComponentPlacementId: yawComponentPlacement.stableOccurrenceId,
    pitchComponentPlacementId:
      pitchAnchorPlacement?.stableOccurrenceId ?? null,
  };
}

function hitComponentIdentity(componentPath: string) {
  const segments = componentPath.split(".");
  if (segments.length < 2) return null;
  const componentName = segments.at(-1);
  const actor = segments.at(-2);
  if (!actor || !componentName) return null;
  return { actor, componentName };
}

function runtimeActorClassIdentity(value: string) {
  const leaf = value.split(/[/.]/u).at(-1) ?? value;
  return leaf
    .replace(/_\d+$/u, "")
    .replace(/_C$/iu, "")
    .toLocaleLowerCase("en");
}

/**
 * Bind the editor hit mesh to a visual turret assembly using only exact actor
 * class and component identities already present in the local runtime packages.
 * Unreal can assign different terminal instance numbers to the same Blueprint
 * actor in independent visual and collision captures, so only that generated
 * suffix is normalized. Unmatched components stay fixed instead of falling
 * back to name heuristics.
 */
export function resolveRuntimeTurretHitComponentAssembly({
  placements,
  assembly,
  articulation,
  components,
}: {
  placements: RuntimeTurretPlacement[];
  assembly: RuntimeTurretAssembly;
  articulation?: ReferenceTurretArticulation;
  components: RuntimeTurretHitComponent[];
}): RuntimeTurretHitComponentAssembly {
  const placementById = new Map(
    placements.map((placement) => [placement.stableOccurrenceId, placement]),
  );
  const yawActors = new Set(
    [
      ...(assembly.hitYawPlacementIds ?? assembly.yawPlacementIds)
        .map((placementId) => placementById.get(placementId)?.actor)
        .filter((actor): actor is string => Boolean(actor)),
      ...(assembly.hitActorClassNames ?? []),
    ].map(runtimeActorClassIdentity),
  );
  const pitchPlacements = assembly.pitchPlacementIds
    .map((placementId) => placementById.get(placementId))
    .filter((placement): placement is RuntimeTurretPlacement =>
      placement !== undefined
    );
  const pitchComponentNames = new Set(
    [
      ...pitchPlacements.map((placement) => placement.name),
      ...(articulation?.pitchMeshComponentNames ?? []),
      articulation?.pitchAnchorMeshComponentName,
    ].filter((name): name is string => Boolean(name)),
  );
  const yawComponentIndices: number[] = [];
  const pitchComponentIndices: number[] = [];

  components.forEach((component, componentIndex) => {
    const identity = hitComponentIdentity(component.componentPath);
    if (
      !identity ||
      !yawActors.has(runtimeActorClassIdentity(identity.actor))
    ) {
      return;
    }
    yawComponentIndices.push(componentIndex);
    // Collision meshes for a separately captured gun actor can be attached to
    // the parent turret actor. Exact local component inventory is authoritative
    // for pitch membership once the actor is already in this yaw assembly.
    if (pitchComponentNames.has(identity.componentName)) {
      pitchComponentIndices.push(componentIndex);
    }
  });

  return { yawComponentIndices, pitchComponentIndices };
}
