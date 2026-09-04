import type {
  CompiledVehicleStationGraph,
  StationGraphTransform,
  VehicleStationGraphVisualPlacement,
} from "./vehicle-station-graph.ts";
import { wikiProjectileAlgorithmUrl } from "./wiki-source.ts";

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
    socketTransformComponentSpace: ProjectileTransform;
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

export interface VehicleGuidanceAimPose {
  aimLocationCm: ProjectileVector3;
  aimDirection: ProjectileVector3;
}

export interface VehicleProjectileMagazineState {
  shotsFiredInMagazine: number;
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
  launchOriginEvidence: {
    evidenceLevel: string;
    nativeFunctions: Record<string, string>;
    coverage: Record<string, number>;
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
  operationOwner:
    | {
        kind: "station";
        stationId: string;
      }
    | {
        kind: "vehicle-attitude";
        sourceVehicleRef: string;
      };
  stationId: string | null;
  equipmentBindingId: string;
  weaponAssignmentId: string;
  weaponClassPath: string;
  projectileClassPath: string;
  projectileProfileRef: string;
  launchOriginProfileRef: string;
  launchAnchor:
    | {
        kind: "visual-occurrence";
        occurrenceId: string;
      }
    | {
        kind: "vehicle-attitude-occurrence";
        occurrenceId: string;
        componentName: string;
      }
    | {
        kind: "station-weapon-attachment";
        stationId: string;
        meshRole: "WeaponMesh1P";
        componentName: string;
        referenceFrame: StationGraphTransform;
        motionChannels: Array<"yaw" | "pitch">;
      };
  launchSelection:
    | { kind: "single-barrel-socket" }
    | { kind: "runtime-indexed-launch-pod"; podCount: number };
  launchShots: LaunchOriginProfile["shots"];
  launchPrecision: "socket-resolved" | "component-origin-fallback";
  forwardOffsetCm: number;
  muzzleVelocityCmPerSecond: number;
  moaDiameter: number;
  moaCurve: string | null;
  physics: WikiWeaponBallisticsDocument["physics"];
  projectileProfile: ProjectileProfile;
  movementMode: ProjectileMovementMode | null;
  movementModes: ProjectileMovementMode[];
  guidanceController: Record<string, unknown> | null;
  guidanceInputPolicy: "none" | "launch-time-operation-camera-clear-los";
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
  bodyDirection?: ProjectileVector3;
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
  simulateGuidedProjectile(
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

function componentSpaceLaunchShot(
  shot: LaunchOriginProfile["shots"][number],
): LaunchOriginProfile["shots"][number] | null {
  const transform = shot.socketTransformComponentSpace;
  if (
    !transform ||
    ![
      transform.translation.x,
      transform.translation.y,
      transform.translation.z,
      transform.rotation.x,
      transform.rotation.y,
      transform.rotation.z,
      transform.rotation.w,
    ].every(Number.isFinite)
  ) return null;
  const { x, y, z, w } = transform.rotation;
  const direction = normalize({
    x: 1 - 2 * (y * y + z * z),
    y: 2 * (x * y + w * z),
    z: 2 * (x * z - w * y),
  });
  return {
    ...shot,
    translationCm: { ...transform.translation },
    direction,
  };
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

function guidanceLossBehaviours(guided: Record<string, unknown>) {
  const source = guided.guidanceLossBehaviours;
  return Array.isArray(source) ? source : source ? [source] : [];
}

function guidedPlaybackSupported(
  projectileProfile: ProjectileProfile,
  movementModes: ProjectileMovementMode[],
) {
  if (
    movementModes.length === 0 ||
    movementModes[0]?.fields.bIsHoming !== true ||
    !(finite(projectileProfile.guided.aimMaxDistanceCm) > 0)
  ) return false;
  return guidanceLossBehaviours(projectileProfile.guided).every((entry) => {
    const value = entry && typeof entry === "object"
      ? (entry as { Value?: Record<string, unknown> }).Value
      : null;
    const behaviour = value?.Behaviour;
    if (finite(value?.TimeBeforeDetonationAfterGuidanceLoss) !== 0) return false;
    if (behaviour === "ContinueLastKnownTarget") return true;
    if (behaviour !== "ChangeMovementMode") return false;
    const index = value?.NewMovementModeIndex;
    return typeof index === "number" && Number.isInteger(index) &&
      movementModes[index] !== undefined;
  });
}

function projectileMovementModePaths(value: unknown) {
  const candidates = Array.isArray(value) ? value : [value];
  return [
    ...new Set(candidates.map(stripObjectPath).filter(Boolean)),
  ];
}

function runtimeActorClass(value: string) {
  return (value.split(/[/.]/u).at(-1) ?? value).replace(/_\d+$/u, "");
}

function unsupported(
  reason: Exclude<VehicleProjectilePlaybackResolution, { state: "ready" }>["reason"],
  detail: string,
): VehicleProjectilePlaybackResolution {
  return { state: "unsupported", reason, detail };
}

function stationWeaponLaunchAnchor(
  station: CompiledVehicleStationGraph["stations"][number],
): Extract<
  VehicleProjectilePlaybackBinding["launchAnchor"],
  { kind: "station-weapon-attachment" }
> | null {
  const attachment = station.weaponAttachments?.firstPerson;
  const frame = attachment?.referenceFrame;
  const value = frame?.value;
  if (
    attachment?.state !== "derived-seat-pawn-component" ||
    attachment.meshRole !== "WeaponMesh1P" ||
    attachment.attachmentRule !== "SnapToTargetIncludingScale" ||
    attachment.sourceFunction !== "ASQVehicleWeapon::Equip@0x1808abd20" ||
    attachment.parent.kind !== "station-component" ||
    attachment.parent.stationId !== station.id ||
    !attachment.parent.componentName ||
    !["observed", "derived", "derived-with-fallback"].includes(
      frame?.state ?? "unresolved",
    ) ||
    !value ||
    ![
      value.translationCm.x,
      value.translationCm.y,
      value.translationCm.z,
      value.rotationQuaternion.x,
      value.rotationQuaternion.y,
      value.rotationQuaternion.z,
      value.rotationQuaternion.w,
      value.scale3D.x,
      value.scale3D.y,
      value.scale3D.z,
    ].every(Number.isFinite) ||
    new Set(attachment.motionChannels).size !==
      attachment.motionChannels.length ||
    attachment.motionChannels.some(
      (channel) => channel !== "yaw" && channel !== "pitch",
    )
  ) {
    return null;
  }
  return {
    kind: "station-weapon-attachment",
    stationId: station.id,
    meshRole: "WeaponMesh1P",
    componentName: attachment.parent.componentName,
    referenceFrame: value,
    motionChannels: [...attachment.motionChannels],
  };
}

export function compileVehicleProjectilePlaybackBinding({
  catalog,
  stationGraph,
  stationId,
  visualPlacements = [],
  weapon,
}: {
  catalog: WikiWeaponBallisticsDocument;
  stationGraph: CompiledVehicleStationGraph;
  stationId: string | null;
  visualPlacements?: readonly VehicleStationGraphVisualPlacement[];
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
  const vehicleAttitudeOwned = mountBinding.launchConstraintKind ===
      "vehicle-attitude" &&
    graphStations.length === 0 &&
    stationGraph.vehicleEquipmentRefs.includes(equipmentBindingId);
  if (!vehicleAttitudeOwned) {
    if (graphStations.length === 0) {
      return unsupported("station-binding-missing", "当前 equipment 没有 Station 归属");
    }
    if (graphStations.length !== 1) {
      return unsupported("station-binding-ambiguous", "当前 equipment 同时属于多个 Station");
    }
    if (graphStations[0]!.id !== stationId) {
      return unsupported("station-mismatch", "所选武器不属于当前真实操作 Station");
    }
  } else if (stationId !== null) {
    return unsupported("station-mismatch", "载具姿态武器不能伪装为普通 Station 武器");
  }
  const graphStation = graphStations[0] ?? null;
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
  const invalidCommonLaunchRoute =
    launchOrigin.anchorRole !== "weapon-actor-root" ||
    launchOrigin.componentRole !== "WeaponMesh1P";
  const singleBarrelRoute =
    launchOrigin.kind === "weapon-mesh1p-socket" &&
    launchOrigin.shotSelection === "single-barrel-socket" &&
    launchOrigin.shots.length === 1;
  const runtimeMultipodRoute =
    launchOrigin.kind === "multipod-socket-forward-offset" &&
    launchOrigin.shotSelection === "runtime-indexed-launch-pod" &&
    launchOrigin.shots.length >= 2 &&
    launchOrigin.shots.every((shot) => shot.socketResolved);
  if (invalidCommonLaunchRoute || (!singleBarrelRoute && !runtimeMultipodRoute)) {
    return unsupported(
      "launch-route-unsupported",
      "发射点不是已闭合的单炮口或原生运行时多筒 WeaponMesh1P 路线",
    );
  }
  const projectileProfile = catalog.projectileProfiles.find(
    (candidate) => candidate.id === assignment.projectileProfileRef,
  );
  if (!projectileProfile) {
    return unsupported("projectile-profile-missing", "武器缺少 projectile profile");
  }
  const movementModePaths = projectileMovementModePaths(
    projectileProfile.movement.MovementModes,
  );
  const movementModes = movementModePaths.map((path) =>
    catalog.movementModes.find((mode) => mode.assetPath === path) ?? null,
  );
  if (movementModes.some((mode) => mode === null)) {
    return unsupported(
      "movement-mode-unresolved",
      "弹丸引用了未收录的运行时 movement mode",
    );
  }
  const resolvedMovementModes = movementModes.filter(
    (mode): mode is ProjectileMovementMode => mode !== null,
  );
  const isGuided =
    hasGuidanceValue(assignment.guidanceController) ||
    guidedProjectile(projectileProfile) ||
    resolvedMovementModes.some((mode) => mode.fields.bIsHoming === true);
  if (!isGuided && resolvedMovementModes.length > 1) {
    return unsupported(
      "movement-mode-unresolved",
      "非制导弹丸存在多个未选择的运行时 movement mode",
    );
  }
  if (isGuided && (
    !hasGuidanceValue(assignment.guidanceController) ||
    !guidedPlaybackSupported(projectileProfile, resolvedMovementModes)
  )) {
    return unsupported(
      "guidance-live-input-required",
      "制导档案缺少可验证的 controller、loss behaviour 或 movement mode",
    );
  }
  let anchorOccurrenceIds: string[] = [];
  let launchAnchor: VehicleProjectilePlaybackBinding["launchAnchor"] | null = null;
  if (vehicleAttitudeOwned) {
    const vehicleActorClass = runtimeActorClass(
      stationGraph.crewSeat.generatedClass,
    );
    const candidates = visualPlacements.filter(
      (placement) =>
        placement.sourceMeshPath === launchOrigin.sourceMeshPath &&
        runtimeActorClass(placement.actor) === vehicleActorClass,
    );
    anchorOccurrenceIds = [
      ...new Set(candidates.map(({ stableOccurrenceId }) => stableOccurrenceId)),
    ];
    if (anchorOccurrenceIds.length === 1) {
      launchAnchor = {
        kind: "vehicle-attitude-occurrence",
        occurrenceId: anchorOccurrenceIds[0]!,
        componentName: candidates[0]!.name,
      };
    }
  } else if (graphStation) {
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
    const exactEquipmentAndSourceAnchors = exactEquipmentAnchors.filter(
      (candidate) => candidate.sourceMeshPath === launchOrigin.sourceMeshPath,
    );
    const anchorCandidates = exactEquipmentAndSourceAnchors.length > 0
      ? exactEquipmentAndSourceAnchors
      : exactEquipmentAnchors.length > 0
        ? exactEquipmentAnchors
        : visualMembers.filter(
            (candidate): candidate is NonNullable<typeof candidate> =>
              candidate.sourceMeshPath === launchOrigin.sourceMeshPath,
          );
    anchorOccurrenceIds = [
      ...new Set(anchorCandidates.map((candidate) => candidate.stableOccurrenceId)),
    ];
    launchAnchor = anchorOccurrenceIds.length === 1
      ? {
          kind: "visual-occurrence",
          occurrenceId: anchorOccurrenceIds[0]!,
        }
      : stationWeaponLaunchAnchor(graphStation);
  }
  if (!launchAnchor) {
    return unsupported(
      anchorOccurrenceIds.length === 0
        ? "launch-anchor-missing"
        : "launch-anchor-ambiguous",
      anchorOccurrenceIds.length === 0
        ? vehicleAttitudeOwned
          ? "车辆 Actor 中没有与 WeaponMesh1P 同源的姿态炮口锚点"
          : "Station 中没有与 WeaponMesh1P 同源的炮口锚点"
        : vehicleAttitudeOwned
          ? "车辆 Actor 中存在多个同源姿态炮口锚点"
          : "Station 中存在多个同源炮口锚点",
    );
  }
  const launchShots = launchAnchor.kind === "station-weapon-attachment"
    ? launchOrigin.shots
    : launchOrigin.shots.map(componentSpaceLaunchShot);
  if (launchShots.some((shot) => shot === null)) {
    return unsupported(
      "launch-route-unsupported",
      "组件锚点缺少可验证的插槽组件空间变换",
    );
  }
  return {
    state: "ready",
    binding: {
      evidenceClass: "local-source-derived-playback",
      sourceBuildId: catalog.sourceBuildId,
      operationOwner: vehicleAttitudeOwned
        ? {
            kind: "vehicle-attitude",
            sourceVehicleRef: stationGraph.sourceVehicleRef,
          }
        : { kind: "station", stationId: graphStation!.id },
      stationId: graphStation?.id ?? null,
      equipmentBindingId,
      weaponAssignmentId,
      weaponClassPath: assignment.weaponClassPath,
      projectileClassPath: assignment.projectileClassPath,
      projectileProfileRef: assignment.projectileProfileRef,
      launchOriginProfileRef: assignment.launchOriginProfileRef,
      launchAnchor,
      launchSelection: runtimeMultipodRoute
        ? {
            kind: "runtime-indexed-launch-pod",
            podCount: launchOrigin.shots.length,
          }
        : { kind: "single-barrel-socket" },
      launchShots: launchShots.filter(
        (shot): shot is LaunchOriginProfile["shots"][number] => shot !== null,
      ),
      launchPrecision: launchOrigin.shots.every((shot) => shot.socketResolved)
        ? "socket-resolved"
        : "component-origin-fallback",
      forwardOffsetCm: launchOrigin.forwardOffsetCm,
      muzzleVelocityCmPerSecond: assignment.muzzleVelocityCmPerSecond,
      moaDiameter: assignment.moaDiameter,
      moaCurve: assignment.moaCurve,
      physics: catalog.physics,
      projectileProfile,
      movementMode: resolvedMovementModes[0] ?? null,
      movementModes: resolvedMovementModes,
      guidanceController: assignment.guidanceController,
      guidanceInputPolicy: isGuided
        ? "launch-time-operation-camera-clear-los"
        : "none",
      curveAssets: catalog.curveAssets,
    },
  };
}

export function selectVehicleProjectileLaunchShot(
  binding: VehicleProjectilePlaybackBinding,
  state: VehicleProjectileMagazineState,
) {
  if (
    !Number.isInteger(state.shotsFiredInMagazine) ||
    state.shotsFiredInMagazine < 0
  ) {
    throw new Error("弹仓已发射计数必须是非负整数");
  }
  const shotIndex = binding.launchSelection.kind ===
      "runtime-indexed-launch-pod"
    ? state.shotsFiredInMagazine % binding.launchSelection.podCount
    : 0;
  const shot = binding.launchShots[shotIndex];
  if (!shot) throw new Error("当前发射筒索引没有源锁定插槽");
  return {
    shotIndex,
    shot,
    launchPrecision: shot.socketResolved
      ? "socket-resolved" as const
      : "component-origin-fallback" as const,
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
  guidanceAim: VehicleGuidanceAimPose | null = null,
) {
  const movement = binding.projectileProfile.movement;
  const collision = binding.projectileProfile.collision;
  const fuze = binding.projectileProfile.fuze;
  const lifespan = finite(fuze.initialLifeSpanSeconds);
  const base = {
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
    movementModes: binding.movementModes,
    movementModeCurves: new Map(
      binding.curveAssets.map((curve) => [curve.assetPath, curve]),
    ),
  };
  if (binding.guidanceInputPolicy === "none") return base;
  if (!guidanceAim) {
    throw new Error("制导弹体需要当前真实操作视角的瞄准线");
  }
  const frozenAim = {
    aimLocationCm: { ...guidanceAim.aimLocationCm },
    aimDirection: normalize(guidanceAim.aimDirection),
  };
  return {
    ...base,
    guided: binding.projectileProfile.guided,
    guidanceController: binding.guidanceController,
    guidanceInputAt: () => ({
      ...frozenAim,
      fireOriginDisplacementCm: 0,
      // ExactQuery is intentionally absent from this viewer slice. The only
      // admissible local presentation is an explicit clear-LOS scenario.
      connectionBlockReason: null,
      guidanceBlockReason: null,
    }),
    guidanceScenario: "controlled-clear-los-launch-time-aim",
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
    ...(left.bodyDirection && right.bodyDirection ? {
      bodyDirection: interpolate(left.bodyDirection, right.bodyDirection),
    } : {}),
    phase: alpha < 0.5 ? left.phase : right.phase,
  };
}

let projectileAlgorithmRequest: Promise<NativeProjectileAlgorithm> | null = null;

export function loadWikiNativeProjectileAlgorithm(pathname: string) {
  if (!pathname.startsWith("/algorithms/ballistics/")) {
    throw new Error(`Invalid projectile algorithm path: ${pathname}`);
  }
  if (projectileAlgorithmRequest) return projectileAlgorithmRequest;
  const source = wikiProjectileAlgorithmUrl(pathname);
  projectileAlgorithmRequest = import(/* @vite-ignore */ source)
    .then((module) => {
      const candidate = module as Partial<NativeProjectileAlgorithm>;
      if (
        typeof candidate.simulateNonGuidedProjectile !== "function" ||
        typeof candidate.simulateGuidedProjectile !== "function" ||
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
