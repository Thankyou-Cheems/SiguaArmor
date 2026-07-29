import visualDescriptorIndexJson from "./runtime-probe-visual-release-index.json";
import supportAirVisualDescriptorIndexJson from "./support-air-visual-release-index.json";
import visualReviewDescriptorIndexJson from "./runtime-probe-visual-review-index.json";
import chinaVisualDescriptorIndexJson from "./china-runtime-probe-visual-release-index.json";
import visualSelectionPolicyJson from "./runtime-probe-visual-selection-policy.json";
import hitDescriptorIndexJson from "./runtime-probe-hit-release-index.json";
import supportAirHitDescriptorIndexJson from "./support-air-hit-release-index.json";
import type { SiteEdition } from "./site-edition";
import {
  runtimeChassisPoseForGeneratedClass,
  type RuntimeChassisPose,
} from "./runtime-chassis-pose";

export type RuntimePreviewStatus =
  | "visual-ready"
  | "visual-review"
  | "runtime-only"
  | "blocked";

export interface RuntimeVisualPlacement {
  stableOccurrenceId: string;
  name: string;
  actor: string;
  assetUrl: string;
  matrix: number[];
  sourceMeshPath: string;
  componentClassPath: string;
  materialState: "runtime-effective-bindings-baked-parameters-unresolved";
  runtimeBonePoseStatus: "observed" | "not-applicable";
  runtimeBonePoseSha256?: string;
  runtimeBonePoseJointCount?: number;
  runtimeBonePoseNormalTimeSampleCount?: number;
  runtimeBonePoseReferenceEquivalent?: boolean;
}

interface RuntimeVisualSelectionTarget {
  componentName: string;
  actorIncludes: string[];
}

interface RuntimeVisualSelectionRule {
  cardId: string;
  rawName: string;
  selectionMode: string;
  label: string;
  target: RuntimeVisualSelectionTarget;
  suppressComponentNames: string[];
  suppressActorIncludes?: string[];
}

interface RuntimeVisualComponentSuppressionRule {
  id: string;
  label: string;
  reason: string;
  componentNames: string[];
  sourceMeshPaths?: string[];
  actorIncludes?: string[];
}

interface RuntimeVisualSynchronizedWeaponBinding {
  cardId: string;
  rawName: string;
}

interface RuntimeVisualSynchronizedWeaponGroup {
  groupId: string;
  bindings: RuntimeVisualSynchronizedWeaponBinding[];
  sourceMeshPath: string;
  activeActor: string;
  suppressedActors: string[];
}

interface RuntimeVisualSynchronizedWeaponPolicy {
  schemaVersion: "runtime-visual-weapon-synchronization/v1";
  groups: RuntimeVisualSynchronizedWeaponGroup[];
}

interface RuntimeVisualSelectionSummary {
  mode: string;
  label: string;
  componentName: string;
  selectedComponentName: string;
  targetActorIncludes: string[];
  selectedOccurrences: number;
  filteredOccurrences: number;
  selectedRepresentation: "turret-component";
}

export interface RuntimeVehiclePreview {
  cardId: string;
  status: RuntimePreviewStatus;
  statusLabel: string;
  variantRawName: string;
  generatedClass: string | null;
  latestRuntimeVehicleId: string | null;
  latestRuntimeIdentitySha256: string | null;
  visualVehicleId: string | null;
  visualIdentitySha256: string | null;
  note: string;
  chassisPose: RuntimeChassisPose | null;
  runtime: {
    actors: number | null;
    components: number | null;
    stableTargets: number | null;
    residualActors: number | null;
  };
  visual: {
    packageSha256: string;
    requiredOccurrences: number;
    sourceAssets: number;
    totalBytes: number;
    runtimeBonePoseStatus: "observed";
    runtimeBonePoseOccurrenceCount: number;
    runtimeBonePoseJointCount: number;
    runtimeBonePoseReferenceEquivalentOccurrenceCount: number;
    placements: RuntimeVisualPlacement[];
    selection: RuntimeVisualSelectionSummary | null;
  } | null;
  hit: {
    status: "public" | "local-review";
    formatVersion: "hit-scene-runtime/v1";
    vehicleId: string;
    recordUrl: string;
    recordSha256: string;
    recordBytes: number;
    geometryUrl: string;
    geometrySha256: string;
    geometryBytes: number;
    bvhUrl: string;
    bvhSha256: string;
    bvhBytes: number;
    triangles: number;
    components: number;
    surfaceProfiles: number;
    bvhNodes: number;
    reason: string;
  } | null;
}

interface RuntimeVisualDescriptor {
  schemaVersion: "runtime-visual-preview/v1";
  status: "complete" | "partial";
  visualAcceptanceStatus?: string;
  webUsable?: boolean;
  cardId: string;
  factionId: string;
  targetKey: string;
  rawName: string;
  variant: string;
  generatedClass?: string;
  vehicleId: string;
  identitySha256: string;
  packageSha256: string;
  requiredOccurrences: number;
  sourceAssets: number;
  totalBytes: number;
  runtimeBonePoseStatus: "observed";
  runtimeBonePoseOccurrenceCount: number;
  runtimeBonePoseJointCount: number;
  runtimeBonePoseReferenceEquivalentOccurrenceCount: number;
  placements: RuntimeVisualPlacement[];
  reason: string;
}

export interface RuntimeHitRecordReference {
  cardId: string;
  rawName: string;
  vehicleId: string;
  recordUrl: string;
  recordSha256: string;
  recordBytes: number;
}

interface RuntimeHitDescriptor extends RuntimeHitRecordReference {
  generatedClass: string;
  identitySha256: string;
  formatVersion: "hit-scene-runtime/v1";
  accessStatus: "public" | "local-review";
  reason: string;
  geometryUrl: string;
  geometrySha256: string;
  geometryBytes: number;
  bvhUrl: string;
  bvhSha256: string;
  bvhBytes: number;
  triangles: number;
  components: number;
  surfaceProfiles: number;
  bvhNodes: number;
}

type RuntimeVisualDescriptorIndex = {
  schemaVersion: "runtime-visual-descriptor-index/v1";
  descriptorCount: number;
  descriptors: RuntimeVisualDescriptor[];
};
const coreVisualDescriptorIndex =
  visualDescriptorIndexJson as unknown as RuntimeVisualDescriptorIndex;
const supportAirVisualDescriptorIndex =
  supportAirVisualDescriptorIndexJson as unknown as RuntimeVisualDescriptorIndex;
const visualDescriptorIndex: RuntimeVisualDescriptorIndex = {
  schemaVersion: "runtime-visual-descriptor-index/v1",
  descriptorCount:
    coreVisualDescriptorIndex.descriptorCount +
    supportAirVisualDescriptorIndex.descriptorCount,
  descriptors: [
    ...coreVisualDescriptorIndex.descriptors,
    ...supportAirVisualDescriptorIndex.descriptors,
  ],
};
const chinaVisualDescriptorIndex = chinaVisualDescriptorIndexJson as unknown as {
  schemaVersion: "runtime-visual-descriptor-index/v1";
  descriptorCount: number;
  descriptors: RuntimeVisualDescriptor[];
};
const visualReviewDescriptorIndex =
  visualReviewDescriptorIndexJson as unknown as RuntimeVisualDescriptorIndex;
const visualSelectionRules = visualSelectionPolicyJson.rules as RuntimeVisualSelectionRule[];
const visualComponentSuppressionRules = (visualSelectionPolicyJson.globalSuppressions ?? []) as
  RuntimeVisualComponentSuppressionRule[];
const synchronizedWeaponPolicy = visualSelectionPolicyJson.synchronizedWeaponPolicy as
  RuntimeVisualSynchronizedWeaponPolicy;
type RuntimeHitDescriptorIndex = {
  schemaVersion: "runtime-hit-preview-index/v1";
  descriptorCount: number;
  descriptors: RuntimeHitDescriptor[];
};
const coreHitDescriptorIndex =
  hitDescriptorIndexJson as unknown as RuntimeHitDescriptorIndex;
const supportAirHitDescriptorIndex =
  supportAirHitDescriptorIndexJson as unknown as RuntimeHitDescriptorIndex;
const hitDescriptorIndex: RuntimeHitDescriptorIndex = {
  schemaVersion: "runtime-hit-preview-index/v1",
  descriptorCount:
    coreHitDescriptorIndex.descriptorCount +
    supportAirHitDescriptorIndex.descriptorCount,
  descriptors: [
    ...coreHitDescriptorIndex.descriptors,
    ...supportAirHitDescriptorIndex.descriptors,
  ],
};
if (visualDescriptorIndex.schemaVersion !== "runtime-visual-descriptor-index/v1") {
  throw new Error("Unsupported runtime visual descriptor index schema");
}
for (const [label, index] of [
  ["core", coreVisualDescriptorIndex],
  ["support-air", supportAirVisualDescriptorIndex],
] as const) {
  if (
    index.schemaVersion !== "runtime-visual-descriptor-index/v1" ||
    index.descriptorCount !== index.descriptors.length
  ) {
    throw new Error(`Unsupported ${label} runtime visual descriptor index`);
  }
}
if (visualDescriptorIndex.descriptorCount !== visualDescriptorIndex.descriptors.length) {
  throw new Error("Runtime visual descriptor count does not match the generated index");
}
if (chinaVisualDescriptorIndex.schemaVersion !== "runtime-visual-descriptor-index/v1") {
  throw new Error("Unsupported China runtime visual descriptor index schema");
}
if (
  chinaVisualDescriptorIndex.descriptorCount !==
  chinaVisualDescriptorIndex.descriptors.length
) {
  throw new Error("China runtime visual descriptor count does not match the generated index");
}
if (visualReviewDescriptorIndex.schemaVersion !== "runtime-visual-descriptor-index/v1") {
  throw new Error("Unsupported runtime visual review descriptor index schema");
}
if (
  visualReviewDescriptorIndex.descriptorCount !==
  visualReviewDescriptorIndex.descriptors.length
) {
  throw new Error(
    "Runtime visual review descriptor count does not match the generated index",
  );
}
for (const [label, index] of [
  ["core", coreHitDescriptorIndex],
  ["support-air", supportAirHitDescriptorIndex],
] as const) {
  if (
    index.schemaVersion !== "runtime-hit-preview-index/v1" ||
    index.descriptorCount !== index.descriptors.length
  ) {
    throw new Error(`Unsupported ${label} runtime hit descriptor index`);
  }
}
if (hitDescriptorIndex.descriptorCount !== hitDescriptorIndex.descriptors.length) {
  throw new Error("Runtime hit descriptor count does not match the generated index");
}

function descriptorIdentity(cardId: string, rawName: string) {
  return `${cardId}\u0000${rawName}`;
}

function applySynchronizedWeaponPolicy(
  descriptor: RuntimeVisualDescriptor,
  placements: RuntimeVisualPlacement[],
) {
  if (
    synchronizedWeaponPolicy.schemaVersion !==
      "runtime-visual-weapon-synchronization/v1" ||
    !Array.isArray(synchronizedWeaponPolicy.groups)
  ) {
    throw new Error("Unsupported runtime visual synchronized weapon policy");
  }
  const groups = synchronizedWeaponPolicy.groups.filter((group) =>
    group.bindings.some(
      (binding) =>
        binding.cardId === descriptor.cardId && binding.rawName === descriptor.rawName,
    ),
  );
  let filteredPlacements = placements;
  const selectedActors: string[] = [];
  let filteredOccurrences = 0;
  for (const group of groups) {
    const candidates = filteredPlacements.filter(
      (placement) =>
        placement.name === "WeaponMesh3P" &&
        placement.sourceMeshPath === group.sourceMeshPath &&
        (placement.actor === group.activeActor ||
          group.suppressedActors.includes(placement.actor)),
    );
    if (candidates.length === 0) continue;
    const active = candidates.filter(
      (placement) => placement.actor === group.activeActor,
    );
    const suppressedIds = new Set(
      candidates
        .filter((placement) => group.suppressedActors.includes(placement.actor))
        .map((placement) => placement.stableOccurrenceId),
    );
    if (suppressedIds.size === 0) continue;
    if (active.length !== 1) {
      throw new Error(
        `Synchronized weapon selection expected one active occurrence for ${descriptor.cardId} / ${descriptor.rawName} / ${group.groupId}, got ${active.length}`,
      );
    }
    selectedActors.push(group.activeActor);
    filteredOccurrences += suppressedIds.size;
    filteredPlacements = filteredPlacements.filter(
      (placement) => !suppressedIds.has(placement.stableOccurrenceId),
    );
  }
  return {
    placements: filteredPlacements,
    selectedActors,
    filteredOccurrences,
  };
}

const hitDescriptorByIdentity = new Map<string, RuntimeHitDescriptor>();
for (const descriptor of hitDescriptorIndex.descriptors) {
  const identity = descriptorIdentity(descriptor.cardId, descriptor.rawName);
  if (hitDescriptorByIdentity.has(identity)) {
    throw new Error(`Duplicate runtime hit identity: ${descriptor.cardId} / ${descriptor.rawName}`);
  }
  if (
    descriptor.formatVersion !== "hit-scene-runtime/v1" ||
    !/^vehicle-[0-9a-f]{64}$/.test(descriptor.vehicleId) ||
    descriptor.identitySha256 !== descriptor.vehicleId.slice("vehicle-".length)
  ) {
    throw new Error(`Invalid runtime hit identity: ${descriptor.cardId} / ${descriptor.rawName}`);
  }
  hitDescriptorByIdentity.set(identity, descriptor);
}

export function runtimeHitRecordReferenceForVariant(
  cardId: string,
  rawName: string,
): RuntimeHitRecordReference | null {
  return hitDescriptorByIdentity.get(descriptorIdentity(cardId, rawName)) ?? null;
}

function applyVisualSelection(descriptor: RuntimeVisualDescriptor) {
  const globallySuppressedPaths = new Set(
    descriptor.placements
      .filter((placement) =>
        visualComponentSuppressionRules.some((rule) =>
          rule.componentNames.includes(placement.name) &&
          (!rule.sourceMeshPaths || rule.sourceMeshPaths.includes(placement.sourceMeshPath)) &&
          (!rule.actorIncludes || rule.actorIncludes.some((needle) => placement.actor.includes(needle))),
        ),
      )
      .map((placement) => placement.stableOccurrenceId),
  );
  const globallyFilteredPlacements = descriptor.placements.filter(
    (placement) => !globallySuppressedPaths.has(placement.stableOccurrenceId),
  );
  const globallySuppressedSkeletalOccurrenceCount = descriptor.placements.filter(
    (placement) =>
      globallySuppressedPaths.has(placement.stableOccurrenceId) &&
      placement.componentClassPath.includes("SkeletalMeshComponent"),
  ).length;
  const synchronizedWeaponSelection = applySynchronizedWeaponPolicy(
    descriptor,
    globallyFilteredPlacements,
  );
  const rule = visualSelectionRules.find(
    (candidate) =>
      candidate.cardId === descriptor.cardId && candidate.rawName === descriptor.rawName,
  );
  if (!rule) {
    return {
      placements: synchronizedWeaponSelection.placements,
      selection:
        synchronizedWeaponSelection.filteredOccurrences > 0
          ? {
              mode: "actor-parent-transform-synchronization",
              label: "保留与挂载父级同步的武器组件",
              componentName: "WeaponMesh3P",
              selectedComponentName: "WeaponMesh3P",
              targetActorIncludes: synchronizedWeaponSelection.selectedActors,
              selectedOccurrences:
                synchronizedWeaponSelection.selectedActors.length,
              filteredOccurrences:
                synchronizedWeaponSelection.filteredOccurrences,
              selectedRepresentation: "turret-component" as const,
          }
          : null,
      globallySuppressedSkeletalOccurrenceCount,
    };
  }

  const managedComponentNames = new Set(rule.suppressComponentNames);
  const targetPlacements = synchronizedWeaponSelection.placements.filter(
    (placement) =>
      placement.name === rule.target.componentName &&
      rule.target.actorIncludes.some((needle) => placement.actor.includes(needle)),
  );
  const managedPlacements = synchronizedWeaponSelection.placements.filter((placement) =>
    managedComponentNames.has(placement.name) &&
    (!rule.suppressActorIncludes ||
      rule.suppressActorIncludes.some((needle) => placement.actor.includes(needle))),
  );
  if (targetPlacements.length === 0 || (!rule.suppressActorIncludes && managedPlacements.length === 0)) {
    throw new Error(
      `Turret component selection matched no ${rule.target.componentName} occurrence for ${descriptor.cardId} / ${descriptor.rawName}`,
    );
  }

  const selectedTargetPlacements = targetPlacements.slice(0, 1);
  const selectedPaths = new Set(
    selectedTargetPlacements.map((placement) => placement.stableOccurrenceId),
  );
  const managedPaths = new Set(
    managedPlacements.map((placement) => placement.stableOccurrenceId),
  );
  return {
    placements: synchronizedWeaponSelection.placements.filter(
      (placement) =>
        !managedPaths.has(placement.stableOccurrenceId) ||
        selectedPaths.has(placement.stableOccurrenceId),
    ),
    selection: {
      mode: rule.selectionMode,
      label: rule.label,
      componentName: rule.target.componentName,
      selectedComponentName: rule.target.componentName,
      targetActorIncludes: rule.target.actorIncludes,
      selectedOccurrences: selectedTargetPlacements.length,
      filteredOccurrences: managedPlacements.filter(
        (placement) => !selectedPaths.has(placement.stableOccurrenceId),
      ).length + synchronizedWeaponSelection.filteredOccurrences,
      selectedRepresentation: "turret-component" as const,
    },
    globallySuppressedSkeletalOccurrenceCount,
  };
}

function toRuntimePreview(
  descriptor: RuntimeVisualDescriptor,
  reviewOnly = false,
): RuntimeVehiclePreview {
  if (descriptor.schemaVersion !== "runtime-visual-preview/v1") {
    throw new Error(`Unsupported runtime visual descriptor for ${descriptor.cardId}`);
  }
  if (!descriptor.cardId || !descriptor.rawName || !descriptor.packageSha256) {
    throw new Error(`Incomplete runtime visual descriptor for ${descriptor.cardId || "unknown-card"}`);
  }
  if (descriptor.runtimeBonePoseStatus !== "observed") {
    throw new Error(`Runtime bone pose is not observed for ${descriptor.cardId} / ${descriptor.rawName}`);
  }
  const {
    placements,
    selection,
    globallySuppressedSkeletalOccurrenceCount,
  } = applyVisualSelection(descriptor);
  const skeletalPlacements = placements.filter((placement) =>
    placement.componentClassPath.includes("SkeletalMeshComponent"),
  );
  const expectedRuntimeBonePoseOccurrenceCount =
    descriptor.runtimeBonePoseOccurrenceCount - globallySuppressedSkeletalOccurrenceCount;
  if (
    (!selection && expectedRuntimeBonePoseOccurrenceCount !== skeletalPlacements.length) ||
    skeletalPlacements.some(
      (placement) =>
        placement.runtimeBonePoseStatus !== "observed" ||
        !placement.runtimeBonePoseSha256 ||
        (placement.runtimeBonePoseNormalTimeSampleCount ?? 0) < 3,
    )
  ) {
    throw new Error(`Runtime bone pose inventory is incomplete for ${descriptor.cardId} / ${descriptor.rawName}`);
  }
  const runtimeBonePoseJointCount = skeletalPlacements.reduce(
    (total, placement) => total + (placement.runtimeBonePoseJointCount ?? 0),
    0,
  );
  const runtimeBonePoseReferenceEquivalentOccurrenceCount = skeletalPlacements.filter(
    (placement) => placement.runtimeBonePoseReferenceEquivalent === true,
  ).length;
  const sourceAssets = new Set(placements.map(({ assetUrl }) => assetUrl)).size;
  const hitDescriptor = hitDescriptorByIdentity.get(
    descriptorIdentity(descriptor.cardId, descriptor.rawName),
  );
  const chassisPose = runtimeChassisPoseForGeneratedClass(
    descriptor.generatedClass,
  );
  if (
    hitDescriptor &&
    (hitDescriptor.vehicleId !== descriptor.vehicleId ||
      hitDescriptor.generatedClass !== descriptor.generatedClass)
  ) {
    throw new Error(
      `Runtime hit/visual identity mismatch for ${descriptor.cardId} / ${descriptor.rawName}`,
    );
  }

  return {
    cardId: descriptor.cardId,
    status: reviewOnly ? "visual-review" : "visual-ready",
    statusLabel: reviewOnly
      ? "LOCAL REVIEW / NOT YET WEB-USABLE"
      : "WEB-USABLE / SOURCE-NATIVE",
    variantRawName: descriptor.rawName,
    generatedClass: descriptor.generatedClass ?? null,
    latestRuntimeVehicleId: descriptor.vehicleId,
    latestRuntimeIdentitySha256: descriptor.identitySha256,
    visualVehicleId: descriptor.vehicleId,
    visualIdentitySha256: descriptor.identitySha256,
    chassisPose,
    note: `${reviewOnly
      ? "该 exact card / variant 正在本机六视角复核，尚未标记 web-usable。"
      : "该 exact card / variant 已接入官方运行时生成、DX11 稳定后导出的 source-native 视觉包。"}${
      selection
        ? `当前预览直接使用 ${selection.label}，过滤 ${selection.filteredOccurrences} 个同炮塔武器 occurrence。`
        : ""
    }${descriptor.reason}`,
    runtime: {
      actors: null,
      components: null,
      stableTargets: null,
      residualActors: null,
    },
    visual: {
      packageSha256: descriptor.packageSha256,
      requiredOccurrences: placements.length,
      sourceAssets,
      totalBytes: descriptor.totalBytes,
      runtimeBonePoseStatus: descriptor.runtimeBonePoseStatus,
      runtimeBonePoseOccurrenceCount: skeletalPlacements.length,
      runtimeBonePoseJointCount,
      runtimeBonePoseReferenceEquivalentOccurrenceCount,
      placements,
      selection,
    },
    hit: hitDescriptor
      ? {
          status: hitDescriptor.accessStatus,
          formatVersion: hitDescriptor.formatVersion,
          vehicleId: hitDescriptor.vehicleId,
          recordUrl: hitDescriptor.recordUrl,
          recordSha256: hitDescriptor.recordSha256,
          recordBytes: hitDescriptor.recordBytes,
          geometryUrl: hitDescriptor.geometryUrl,
          geometrySha256: hitDescriptor.geometrySha256,
          geometryBytes: hitDescriptor.geometryBytes,
          bvhUrl: hitDescriptor.bvhUrl,
          bvhSha256: hitDescriptor.bvhSha256,
          bvhBytes: hitDescriptor.bvhBytes,
          triangles: hitDescriptor.triangles,
          components: hitDescriptor.components,
          surfaceProfiles: hitDescriptor.surfaceProfiles,
          bvhNodes: hitDescriptor.bvhNodes,
          reason: hitDescriptor.reason,
        }
      : null,
  };
}

function isWebUsableDescriptor(
  descriptor: RuntimeVisualDescriptor,
): descriptor is RuntimeVisualDescriptor & {
  status: "complete";
  visualAcceptanceStatus: "web-usable";
  webUsable: true;
} {
  return (
    descriptor.status === "complete" &&
    descriptor.visualAcceptanceStatus === "web-usable" &&
    descriptor.webUsable === true
  );
}

const webUsableDescriptors = visualDescriptorIndex.descriptors.filter(isWebUsableDescriptor);
if (webUsableDescriptors.length !== visualDescriptorIndex.descriptors.length) {
  throw new Error("Public runtime visual index contains a non-web-usable descriptor");
}
export const runtimeVisualDescriptorCount = webUsableDescriptors.length;
const chinaWebUsableDescriptors =
  chinaVisualDescriptorIndex.descriptors.filter(isWebUsableDescriptor);
if (chinaWebUsableDescriptors.length !== chinaVisualDescriptorIndex.descriptors.length) {
  throw new Error("China public runtime visual index contains a non-web-usable descriptor");
}
export const chinaRuntimeVisualDescriptorCount = chinaWebUsableDescriptors.length;
export const runtimeReviewVisualDescriptorCount =
  visualReviewDescriptorIndex.descriptors.length;

export const runtimePreviewByIdentity: Record<string, RuntimeVehiclePreview> = {};
export const runtimePreviewsByCardId: Record<string, RuntimeVehiclePreview[]> = {};
export const runtimeReviewPreviewByIdentity: Record<string, RuntimeVehiclePreview> = {};
export const runtimeReviewPreviewsByCardId: Record<string, RuntimeVehiclePreview[]> = {};
export const chinaRuntimePreviewByIdentity: Record<string, RuntimeVehiclePreview> = {};

const publicDescriptorIdentities = new Set(
  visualDescriptorIndex.descriptors.map((descriptor) =>
    descriptorIdentity(descriptor.cardId, descriptor.rawName),
  ),
);

for (const descriptor of visualReviewDescriptorIndex.descriptors) {
  const descriptorKey = descriptorIdentity(descriptor.cardId, descriptor.rawName);
  const reviewOnly = !publicDescriptorIdentities.has(descriptorKey);
  const preview = toRuntimePreview(descriptor, reviewOnly);
  const identity = descriptorIdentity(preview.cardId, preview.variantRawName);
  if (runtimeReviewPreviewByIdentity[identity]) {
    throw new Error(
      `Duplicate runtime visual review identity: ${preview.cardId} / ${preview.variantRawName}`,
    );
  }
  runtimeReviewPreviewByIdentity[identity] = preview;
  (runtimeReviewPreviewsByCardId[preview.cardId] ??= []).push(preview);
}

for (const descriptor of webUsableDescriptors) {
  const preview = toRuntimePreview(descriptor);
  const identity = descriptorIdentity(preview.cardId, preview.variantRawName);
  if (runtimePreviewByIdentity[identity]) {
    throw new Error(`Duplicate runtime visual preview identity: ${preview.cardId} / ${preview.variantRawName}`);
  }
  runtimePreviewByIdentity[identity] = preview;
  (runtimePreviewsByCardId[preview.cardId] ??= []).push(preview);
}
for (const descriptor of chinaWebUsableDescriptors) {
  const preview = toRuntimePreview(descriptor);
  const identity = descriptorIdentity(preview.cardId, preview.variantRawName);
  if (chinaRuntimePreviewByIdentity[identity]) {
    throw new Error(
      `Duplicate China runtime visual preview identity: ${preview.cardId} / ${preview.variantRawName}`,
    );
  }
  chinaRuntimePreviewByIdentity[identity] = preview;
}

for (const previews of Object.values(runtimePreviewsByCardId)) {
  previews.sort((left, right) => left.variantRawName.localeCompare(right.variantRawName));
}
for (const previews of Object.values(runtimeReviewPreviewsByCardId)) {
  previews.sort((left, right) => left.variantRawName.localeCompare(right.variantRawName));
}

export const runtimePreviewByCardId: Record<string, RuntimeVehiclePreview> = Object.fromEntries(
  Object.entries(runtimePreviewsByCardId).map(([cardId, previews]) => [cardId, previews[0]]),
);

export function runtimePreviewForVariant(
  cardId: string,
  rawName: string,
  siteEdition: SiteEdition = "international",
) {
  const previews =
    siteEdition === "china" ? chinaRuntimePreviewByIdentity : runtimePreviewByIdentity;
  return previews[descriptorIdentity(cardId, rawName)] ?? null;
}

export function runtimeReviewPreviewForVariant(cardId: string, rawName: string) {
  return runtimeReviewPreviewByIdentity[descriptorIdentity(cardId, rawName)] ?? null;
}
