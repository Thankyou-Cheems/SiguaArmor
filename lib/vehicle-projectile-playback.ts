import type { CompiledVehicleStationGraph } from "./vehicle-station-graph.ts";
import { wikiUrl } from "./wiki-source.ts";

export interface ProjectileVector3 {
  x: number;
  y: number;
  z: number;
}

interface ProjectileTransform {
  translation: ProjectileVector3;
  rotation: { x: number; y: number; z: number; w: number };
  scale3d: ProjectileVector3;
}

interface WeaponAssignment {
  weaponClassPath: string;
  projectileClassPath: string;
  projectileProfileRef: string;
  muzzleVelocityCmPerSecond: number;
  moaDiameter: number;
  moaCurve: string | null;
  guidanceController: Record<string, unknown> | null;
  launchOriginProfileRef: string;
}

interface LaunchOriginProfile {
  id: string;
  kind: string;
  anchorRole: string;
  componentRole: string;
  sourceMeshPath: string;
  componentRelativeTransform: ProjectileTransform;
  forwardOffsetCm: number;
  shotSelection: string;
  shots: Array<{
    socketName: string;
    socketResolved: boolean;
    translationCm: ProjectileVector3;
    direction: ProjectileVector3;
  }>;
}

interface ProjectileProfile {
  id: string;
  generatedClassPath: string;
  movement: Record<string, unknown>;
  collision: Record<string, unknown>;
  fuze: Record<string, unknown>;
  guided: Record<string, unknown>;
}

interface ProjectileMovementMode {
  assetPath: string;
  fields: Record<string, unknown>;
}

interface ProjectileCurveAsset {
  assetPath: string;
  capture: Record<string, unknown>;
}

interface VehicleMountBinding {
  equipmentBindingId: string;
  cardId: string;
  rawName: string;
  weaponClassPath: string;
  projectileClassPath: string;
  projectileProfileRef: string;
  weaponVariantIds: string[];
  launchConstraintKind: string;
  mountProfileRef: string | null;
  turretClassPath: string | null;
}

export interface WikiWeaponBallisticsDocument {
  schemaVersion: "sigua-weapon-ballistics/v1";
  status: "completed";
  sourceBuildId: string;
  algorithms: { projectile: string };
  physics: {
    worldGravityZCentimetresPerSecondSquared: number;
    serverFrameDeltaSeconds: number;
  };
  launchOriginProfiles: LaunchOriginProfile[];
  projectileProfiles: ProjectileProfile[];
  weaponAssignments: WeaponAssignment[];
  movementModes: ProjectileMovementMode[];
  curveAssets: ProjectileCurveAsset[];
  vehicleMountBindings: VehicleMountBinding[];
}

export interface VehicleProjectileRuntimeWeapon {
  weaponAssignmentId?: string;
  stationEquipmentId?: string;
  sourceCardId: string;
  sourceRawName: string;
  displayNameZh: string;
  displayNameEnglish: string;
}

export interface VehicleProjectilePlaybackBinding {
  evidenceClass: "local-source-derived-playback";
  sourceBuildId: string;
  stationId: string;
  equipmentBindingId: string;
  weaponAssignmentId: string;
  weaponClassPath: string;
  projectileClassPath: string;
  projectileProfileRef: string;
  launchOriginProfileRef: string;
  anchorOccurrenceId: string;
  launchShot: LaunchOriginProfile["shots"][number];
  launchPrecision: "socket-resolved" | "component-origin-fallback";
  forwardOffsetCm: number;
  muzzleVelocityCmPerSecond: number;
  moaDiameter: number;
  moaCurve: string | null;
  physics: WikiWeaponBallisticsDocument["physics"];
  projectileProfile: ProjectileProfile;
  movementMode: ProjectileMovementMode | null;
  curveAssets: ProjectileCurveAsset[];
}

export type VehicleProjectilePlaybackResolution =
  | { state: "ready"; binding: VehicleProjectilePlaybackBinding }
  | {
      state: "unsupported";
      reason:
        | "catalog-invalid"
        | "mount-binding-missing"
        | "mount-binding-ambiguous"
        | "station-binding-missing"
        | "station-binding-ambiguous"
        | "station-mismatch"
        | "launch-origin-missing"
        | "launch-route-unsupported"
        | "launch-frame-unresolved"
        | "launch-anchor-missing"
        | "launch-anchor-ambiguous"
        | "projectile-profile-missing"
        | "movement-mode-unresolved"
        | "guidance-live-input-required";
      detail: string;
    };

export interface NativeProjectileTrajectorySample {
  timeSeconds: number;
  positionCm: ProjectileVector3;
  velocityCmPerSecond: ProjectileVector3;
  phase: string;
}

export interface NativeProjectileSimulationResult {
  status: string;
  elapsedSeconds: number;
  samples: NativeProjectileTrajectorySample[];
}

export interface NativeProjectileAlgorithm {
  simulateNonGuidedProjectile(
    input: Record<string, unknown>,
  ): NativeProjectileSimulationResult;
  moaDiameterToHalfAngleRadians(moaDiameter: number): number;
  sampleNativeConeDirection(input: {
    direction: ProjectileVector3;
    halfAngleRadians: number;
    azimuthUnit: number;
    cosineUnit: number;
  }): ProjectileVector3;
}

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const stripObjectPath = (value: unknown) =>
  typeof value === "string" ? value.replace(/^uobject:/u, "") : "";

function magnitude(value: ProjectileVector3) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: ProjectileVector3): ProjectileVector3 {
  const length = magnitude(value);
  if (!(length > 1e-9)) throw new Error("Projectile direction must be non-zero");
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function add(left: ProjectileVector3, right: ProjectileVector3) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function scale(value: ProjectileVector3, amount: number) {
  return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

function cross(left: ProjectileVector3, right: ProjectileVector3) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function identityTransform(transform: ProjectileTransform | null | undefined) {
  if (!transform) return false;
  const epsilon = 1e-6;
  return (
    Math.abs(transform.translation.x) <= epsilon &&
    Math.abs(transform.translation.y) <= epsilon &&
    Math.abs(transform.translation.z) <= epsilon &&
    Math.abs(transform.rotation.x) <= epsilon &&
    Math.abs(transform.rotation.y) <= epsilon &&
    Math.abs(transform.rotation.z) <= epsilon &&
    Math.abs(transform.rotation.w - 1) <= epsilon &&
    Math.abs(transform.scale3d.x - 1) <= epsilon &&
    Math.abs(transform.scale3d.y - 1) <= epsilon &&
    Math.abs(transform.scale3d.z - 1) <= epsilon
  );
}

function hasGuidanceValue(value: Record<string, unknown> | null) {
  return Boolean(
    value && Object.values(value).some((entry) => entry !== null && entry !== undefined),
  );
}

function guidedProjectile(profile: ProjectileProfile) {
  const guided = profile.guided ?? {};
  return (
    finite(guided.aimMaxDistanceCm) > 0 ||
    finite(guided.guidanceDelaySeconds) > 0 ||
    guided.guidanceLossBehaviours !== null &&
      guided.guidanceLossBehaviours !== undefined ||
    guided.trackedFovByDistanceCurve !== null &&
      guided.trackedFovByDistanceCurve !== undefined
  );
}

function unsupported(
  reason: Exclude<VehicleProjectilePlaybackResolution, { state: "ready" }>["reason"],
  detail: string,
): VehicleProjectilePlaybackResolution {
  return { state: "unsupported", reason, detail };
}

export function compileVehicleProjectilePlaybackBinding({
  catalog,
  stationGraph,
  stationId,
  weapon,
}: {
  catalog: WikiWeaponBallisticsDocument;
  stationGraph: CompiledVehicleStationGraph;
  stationId: string;
  weapon: VehicleProjectileRuntimeWeapon;
}): VehicleProjectilePlaybackResolution {
  if (
    catalog.schemaVersion !== "sigua-weapon-ballistics/v1" ||
    catalog.status !== "completed" ||
    !Array.isArray(catalog.launchOriginProfiles) ||
    !Array.isArray(catalog.weaponAssignments) ||
    !Array.isArray(catalog.vehicleMountBindings)
  ) {
    return unsupported("catalog-invalid", "弹道目录缺少源锁定发射点关系");
  }
  const equipmentBindingId = weapon.stationEquipmentId;
  if (!equipmentBindingId) {
    return unsupported("mount-binding-missing", "当前武器没有 Station equipment 标识");
  }
  const weaponAssignmentId = weapon.weaponAssignmentId;
  if (!weaponAssignmentId) {
    return unsupported("mount-binding-missing", "当前武器没有 runtime assignment 标识");
  }
  const variantId = weaponAssignmentId.startsWith(`${equipmentBindingId}:`)
    ? weaponAssignmentId.slice(equipmentBindingId.length + 1)
    : "";
  let mountBindings = catalog.vehicleMountBindings.filter(
    (binding) =>
      binding.equipmentBindingId === equipmentBindingId &&
      binding.cardId === weapon.sourceCardId &&
      binding.rawName === weapon.sourceRawName,
  );
  if (mountBindings.length > 1 && variantId) {
    const variantBindings = mountBindings.filter((binding) =>
      binding.weaponVariantIds.includes(variantId),
    );
    if (variantBindings.length > 0) mountBindings = variantBindings;
  }
  if (mountBindings.length === 0) {
    return unsupported("mount-binding-missing", "当前载具配置没有精确武器挂载记录");
  }
  if (mountBindings.length !== 1) {
    return unsupported("mount-binding-ambiguous", "当前 equipment 对应多个武器挂载记录");
  }
  const [mountBinding] = mountBindings;
  const graphStations = stationGraph.stations.filter((station) =>
    station.equipmentRefs.includes(equipmentBindingId),
  );
  if (graphStations.length === 0) {
    return unsupported("station-binding-missing", "当前 equipment 没有 Station 归属");
  }
  if (graphStations.length !== 1) {
    return unsupported("station-binding-ambiguous", "当前 equipment 同时属于多个 Station");
  }
  const [graphStation] = graphStations;
  if (graphStation.id !== stationId) {
    return unsupported("station-mismatch", "所选武器不属于当前真实操作 Station");
  }
  const assignment = catalog.weaponAssignments.find(
    (candidate) => candidate.weaponClassPath === mountBinding.weaponClassPath,
  );
  if (!assignment) {
    return unsupported("mount-binding-missing", "武器挂载无法连接到 projectile assignment");
  }
  const launchOrigin = catalog.launchOriginProfiles.find(
    (candidate) => candidate.id === assignment.launchOriginProfileRef,
  );
  if (!launchOrigin) {
    return unsupported("launch-origin-missing", "武器缺少 WeaponMesh1P 发射点档案");
  }
  if (
    launchOrigin.kind !== "weapon-mesh1p-socket" ||
    launchOrigin.anchorRole !== "weapon-actor-root" ||
    launchOrigin.componentRole !== "WeaponMesh1P" ||
    launchOrigin.shotSelection !== "single-barrel-socket" ||
    launchOrigin.shots.length !== 1 ||
    !identityTransform(launchOrigin.componentRelativeTransform)
  ) {
    return unsupported(
      "launch-route-unsupported",
      "当前版本只播放已闭合的单炮口 WeaponMesh1P 路线",
    );
  }
  const projectileProfile = catalog.projectileProfiles.find(
    (candidate) => candidate.id === assignment.projectileProfileRef,
  );
  if (!projectileProfile) {
    return unsupported("projectile-profile-missing", "武器缺少 projectile profile");
  }
  const movementModePaths = Array.isArray(projectileProfile.movement.MovementModes)
    ? projectileProfile.movement.MovementModes.map(stripObjectPath).filter(Boolean)
    : [];
  const movementModes = movementModePaths.map((path) =>
    catalog.movementModes.find((mode) => mode.assetPath === path) ?? null,
  );
  if (movementModes.some((mode) => mode === null) || movementModes.length > 1) {
    return unsupported(
      "movement-mode-unresolved",
      "弹丸需要当前网页尚未选择的运行时 movement mode",
    );
  }
  if (
    hasGuidanceValue(assignment.guidanceController) ||
    guidedProjectile(projectileProfile) ||
    movementModes.some((mode) => mode?.fields.bIsHoming === true)
  ) {
    return unsupported(
      "guidance-live-input-required",
      "制导段需要实时 aim、LOS 与 controller 输入",
    );
  }
  const visualStation = stationGraph.visualAttachment.stations.find(
    (candidate) => candidate.catalogSeatIndex === graphStation.catalogSeatIndex,
  );
  if (!visualStation || visualStation.state !== "closed") {
    return unsupported("launch-frame-unresolved", "Station 的视觉运动链未闭合");
  }
  const visualMembers = [
    visualStation.pitchAnchor,
    visualStation.yawAnchor,
    ...visualStation.pitchMembers,
    ...visualStation.yawMembers,
  ].filter((candidate): candidate is NonNullable<typeof candidate> =>
    candidate !== null
  );
  const exactEquipmentAnchors = visualMembers.filter((candidate) =>
    candidate.equipmentRefIds?.includes(equipmentBindingId)
  );
  const anchorCandidates = exactEquipmentAnchors.length > 0
    ? exactEquipmentAnchors
    : visualMembers.filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate.sourceMeshPath === launchOrigin.sourceMeshPath,
    );
  const anchorOccurrenceIds = [
    ...new Set(anchorCandidates.map((candidate) => candidate.stableOccurrenceId)),
  ];
  if (anchorOccurrenceIds.length !== 1) {
    return unsupported(
      anchorOccurrenceIds.length === 0
        ? "launch-anchor-missing"
        : "launch-anchor-ambiguous",
      anchorOccurrenceIds.length === 0
        ? "Station 中没有与 WeaponMesh1P 同源的炮口锚点"
        : "Station 中存在多个同源炮口锚点",
    );
  }
  return {
    state: "ready",
    binding: {
      evidenceClass: "local-source-derived-playback",
      sourceBuildId: catalog.sourceBuildId,
      stationId,
      equipmentBindingId,
      weaponAssignmentId,
      weaponClassPath: assignment.weaponClassPath,
      projectileClassPath: assignment.projectileClassPath,
      projectileProfileRef: assignment.projectileProfileRef,
      launchOriginProfileRef: assignment.launchOriginProfileRef,
      anchorOccurrenceId: anchorOccurrenceIds[0]!,
      launchShot: launchOrigin.shots[0]!,
      launchPrecision: launchOrigin.shots[0]!.socketResolved
        ? "socket-resolved"
        : "component-origin-fallback",
      forwardOffsetCm: launchOrigin.forwardOffsetCm,
      muzzleVelocityCmPerSecond: assignment.muzzleVelocityCmPerSecond,
      moaDiameter: assignment.moaDiameter,
      moaCurve: assignment.moaCurve,
      physics: catalog.physics,
      projectileProfile,
      movementMode: movementModes[0] ?? null,
      curveAssets: catalog.curveAssets,
    },
  };
}

export function localProjectileAccelerationToWorld(
  local: Record<string, unknown>,
  direction: ProjectileVector3,
): ProjectileVector3 {
  const forward = normalize(direction);
  const worldUp = { x: 0, y: 0, z: 1 };
  let right = cross(worldUp, forward);
  if (!(magnitude(right) > 1e-9)) right = { x: 0, y: -1, z: 0 };
  right = normalize(right);
  const up = normalize(cross(forward, right));
  return add(
    add(scale(forward, finite(local.X)), scale(right, finite(local.Y))),
    scale(up, finite(local.Z)),
  );
}

export function buildVehicleProjectileSimulationInput(
  binding: VehicleProjectilePlaybackBinding,
  launch: { positionCm: ProjectileVector3; direction: ProjectileVector3 },
  direction = launch.direction,
) {
  const movement = binding.projectileProfile.movement;
  const collision = binding.projectileProfile.collision;
  const fuze = binding.projectileProfile.fuze;
  const lifespan = finite(fuze.initialLifeSpanSeconds);
  return {
    positionCm: launch.positionCm,
    direction: normalize(direction),
    muzzleVelocityCmPerSecond: binding.muzzleVelocityCmPerSecond,
    gravityZCmPerSecondSquared:
      binding.physics.worldGravityZCentimetresPerSecondSquared,
    gravityScale: finite(movement.ProjectileGravityScale, 1),
    constantAccelerationWorld: localProjectileAccelerationToWorld(
      (movement.ConstantAcceleration ?? {}) as Record<string, unknown>,
      direction,
    ),
    constantAccelerationTimeoutSeconds: finite(
      movement.ConstantAccelerationTimeout,
    ),
    maxSpeedCmPerSecond: finite(movement.MaxSpeed),
    frameDeltaSeconds: binding.physics.serverFrameDeltaSeconds,
    maxSimulationTimeStep: finite(movement.MaxSimulationTimeStep, 0.05),
    maxSimulationIterations: finite(movement.MaxSimulationIterations, 4),
    maximumTimeSeconds: lifespan > 0 ? Math.min(lifespan, 12) : 12,
    initialLifeSpanSeconds: lifespan,
    minFlightTimeSeconds: finite(fuze.minFlightTimeSeconds),
    sphereRadiusCm: finite(collision.sphereRadiusCm),
    shouldBounce: movement.bShouldBounce === true,
    bounciness: finite(movement.Bounciness, 0.6),
    friction: finite(movement.Friction, 0.2),
    bounceAngleAffectsFriction:
      movement.bBounceAngleAffectsFriction !== false,
    minFrictionFraction: finite(movement.MinFrictionFraction),
    bounceVelocityStopSimulatingThresholdCmPerSecond: finite(
      movement.BounceVelocityStopSimulatingThreshold,
      5,
    ),
    bounceAdditionalIterations: finite(movement.BounceAdditionalIterations, 1),
    movementMode: binding.movementMode,
    movementModeCurves: new Map(
      binding.curveAssets.map((curve) => [curve.assetPath, curve]),
    ),
  };
}

function hashSeed(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function xorshift(value: number) {
  let next = value || 0x9e3779b9;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

// The native cone formula is closed, but the same-shot native rand() state is
// not available to the browser. Keep this pair stable for presentation only.
export function presentationProjectileSpreadSample(
  weaponAssignmentId: string,
  shotSequence: number,
) {
  const first = xorshift(hashSeed(`${weaponAssignmentId}:${shotSequence}`));
  const second = xorshift(first);
  return {
    azimuthUnit: first / 0x1_0000_0000,
    cosineUnit: second / 0x1_0000_0000,
  };
}

export function sampleProjectileTrajectory(
  samples: NativeProjectileTrajectorySample[],
  timeSeconds: number,
) {
  if (samples.length === 0) return null;
  if (timeSeconds <= samples[0]!.timeSeconds) return samples[0]!;
  if (timeSeconds >= samples.at(-1)!.timeSeconds) return samples.at(-1)!;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle]!.timeSeconds <= timeSeconds) low = middle;
    else high = middle;
  }
  const left = samples[low]!;
  const right = samples[high]!;
  const span = right.timeSeconds - left.timeSeconds;
  const alpha = span > 0 ? (timeSeconds - left.timeSeconds) / span : 0;
  const interpolate = (
    start: ProjectileVector3,
    end: ProjectileVector3,
  ): ProjectileVector3 => ({
    x: start.x + (end.x - start.x) * alpha,
    y: start.y + (end.y - start.y) * alpha,
    z: start.z + (end.z - start.z) * alpha,
  });
  return {
    timeSeconds,
    positionCm: interpolate(left.positionCm, right.positionCm),
    velocityCmPerSecond: interpolate(
      left.velocityCmPerSecond,
      right.velocityCmPerSecond,
    ),
    phase: alpha < 0.5 ? left.phase : right.phase,
  };
}

let projectileAlgorithmRequest: Promise<NativeProjectileAlgorithm> | null = null;

export function loadWikiNativeProjectileAlgorithm(pathname: string) {
  if (!pathname.startsWith("/algorithms/ballistics/")) {
    throw new Error(`Invalid projectile algorithm path: ${pathname}`);
  }
  if (projectileAlgorithmRequest) return projectileAlgorithmRequest;
  const source = wikiUrl(pathname);
  projectileAlgorithmRequest = import(/* @vite-ignore */ source)
    .then((module) => {
      const candidate = module as Partial<NativeProjectileAlgorithm>;
      if (
        typeof candidate.simulateNonGuidedProjectile !== "function" ||
        typeof candidate.moaDiameterToHalfAngleRadians !== "function" ||
        typeof candidate.sampleNativeConeDirection !== "function"
      ) {
        throw new Error("SiguaWiki projectile algorithm has an unsupported shape");
      }
      return candidate as NativeProjectileAlgorithm;
    })
    .catch((error) => {
      projectileAlgorithmRequest = null;
      throw error;
    });
  return projectileAlgorithmRequest;
}
