import visualDeliveryIndexJson from "./runtime-probe-visual-delivery-index.json";
import visualArtifactIndexJson from "./runtime-probe-visual-artifact-index.json";
import visualSelectionPolicyJson from "./runtime-probe-visual-selection-policy.json";
import hitDescriptorIndexJson from "./runtime-probe-hit-release-index.json";
import supportAirHitDescriptorIndexJson from "./support-air-hit-release-index.json";
import supportAirHitAvailabilityIndexJson from "./support-air-hit-availability-index.json";
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
    artifactRef: string | null;
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
  hitAvailability: {
    status: "hit-runtime" | "runtime-no-hit-geometry";
    reasonCode: string;
    reason: string;
    runtimeEvidenceSha256: string;
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

type RuntimeVisualDeliveryEntry = Omit<RuntimeVisualDescriptor, "placements"> & {
  file: string;
  sourceFile: string;
  sourceIndexSha256: string;
  sourceSha256: string;
  deliverySha256: string;
  siteEdition: SiteEdition;
};

interface RuntimeVisualDeliveryIndex {
  schemaVersion: "runtime-visual-delivery-index/v2";
  indexRevision: string;
  descriptorCount: number;
  editionCounts: Record<SiteEdition, number>;
  reviewDescriptorCount: number;
  entries: RuntimeVisualDeliveryEntry[];
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

interface RuntimeVisualArtifactProjection {
  cardId: string;
  rawName: string;
  visualArtifactRef: string;
  runtimeVehicleRef: string;
  generatedClass: string;
  identitySha256: string;
  packageSha256: string;
}

interface RuntimeVisualArtifactIndex {
  schemaVersion: "sigua-runtime-visual-artifact-index/v1";
  catalogRevision: string;
  editions: Record<SiteEdition, RuntimeVisualArtifactProjection[]>;
}

const visualDeliveryIndex = visualDeliveryIndexJson as unknown as RuntimeVisualDeliveryIndex;
const visualArtifactIndex =
  visualArtifactIndexJson as unknown as RuntimeVisualArtifactIndex;
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
type SupportAirHitAvailabilityIndex = {
  schemaVersion: "support-air-hit-availability-index/v1";
  sourceBuildId: string;
  entryCount: number;
  entries: Array<{
    cardId: string;
    rawName: string;
    generatedClass: string;
    status: "hit-runtime" | "runtime-no-hit-geometry";
    reasonCode: string;
    reason: string;
    runtimeEvidenceSha256: string;
  }>;
};
const coreHitDescriptorIndex =
  hitDescriptorIndexJson as unknown as RuntimeHitDescriptorIndex;
const supportAirHitDescriptorIndex =
  supportAirHitDescriptorIndexJson as unknown as RuntimeHitDescriptorIndex;
const supportAirHitAvailabilityIndex =
  supportAirHitAvailabilityIndexJson as unknown as SupportAirHitAvailabilityIndex;
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
if (
  visualDeliveryIndex.schemaVersion !== "runtime-visual-delivery-index/v2" ||
  !/^[a-f0-9]{64}$/u.test(visualDeliveryIndex.indexRevision) ||
  visualDeliveryIndex.descriptorCount !== visualDeliveryIndex.entries.length ||
  !visualDeliveryIndex.editionCounts ||
  visualDeliveryIndex.editionCounts.international !== visualDeliveryIndex.entries.length
) {
  throw new Error("Unsupported runtime visual delivery index");
}
for (const entry of visualDeliveryIndex.entries) {
  if (
    entry.siteEdition !== "international" ||
    entry.schemaVersion !== "runtime-visual-preview/v1" ||
    !entry.file.startsWith("./runtime-probe-visual-delivery/") ||
    !entry.sourceFile.startsWith("./runtime-probe-visuals/") ||
    !/^[a-f0-9]{64}$/u.test(entry.sourceIndexSha256) ||
    !/^[a-f0-9]{64}$/u.test(entry.sourceSha256) ||
    !/^[a-f0-9]{64}$/u.test(entry.deliverySha256)
  ) {
    throw new Error(`Invalid runtime visual delivery entry: ${entry.cardId} / ${entry.rawName}`);
  }
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
if (
  supportAirHitAvailabilityIndex.schemaVersion !==
    "support-air-hit-availability-index/v1" ||
  supportAirHitAvailabilityIndex.entryCount !==
    supportAirHitAvailabilityIndex.entries.length
) {
  throw new Error("Unsupported support-air hit availability index");
}

function descriptorIdentity(cardId: string, rawName: string) {
  return `${cardId}\u0000${rawName}`;
}

type RuntimeVisualIdentityDescriptor = RuntimeVisualDescriptor | RuntimeVisualDeliveryEntry;

const visualDescriptorLoaders = (import.meta as ImportMeta & {
  glob<T>(
    pattern: string,
    options?: { eager?: boolean; import?: string },
  ): Record<string, () => Promise<T>>;
}).glob<RuntimeVisualDescriptor>("./runtime-probe-visual-delivery/*.visual.json", {
  import: "default",
});
const visualDeliveryByIdentity = new Map<string, RuntimeVisualDeliveryEntry>();
const expectedVisualDeliveryFiles = new Set<string>();
for (const entry of visualDeliveryIndex.entries) {
  const identity = descriptorIdentity(entry.cardId, entry.rawName);
  if (
    visualDeliveryByIdentity.has(identity) ||
    expectedVisualDeliveryFiles.has(entry.file)
  ) {
    throw new Error(`Duplicate runtime visual delivery identity: ${entry.cardId} / ${entry.rawName}`);
  }
  visualDeliveryByIdentity.set(identity, entry);
  expectedVisualDeliveryFiles.add(entry.file);
}
const actualVisualDeliveryFiles = Object.keys(
  visualDescriptorLoaders,
);
if (
  actualVisualDeliveryFiles.length !==
    expectedVisualDeliveryFiles.size ||
  actualVisualDeliveryFiles.some(
    (file) => !expectedVisualDeliveryFiles.has(file),
  )
) {
  throw new Error(
    "Runtime visual delivery loader set does not exactly match the delivery index",
  );
}
const materializedVisualDescriptorCache = new Map<
  string,
  Promise<RuntimeVisualDescriptor>
>();

async function loadMaterializedVisualDescriptor(
  entry: RuntimeVisualDeliveryEntry,
): Promise<RuntimeVisualDescriptor> {
  const cached = materializedVisualDescriptorCache.get(entry.file);
  if (cached) return cached;
  const loader = visualDescriptorLoaders[entry.file];
  if (!loader) {
    throw new Error(`Runtime visual source module is missing: ${entry.file}`);
  }
  const promise = loader().then((source) => {
    if (!source || !Array.isArray(source.placements)) {
      throw new Error(`Runtime visual source module is incomplete: ${entry.file}`);
    }
    for (const field of [
      "generatedClass",
      "vehicleId",
      "identitySha256",
      "packageSha256",
      "runtimeBonePoseStatus",
      "status",
      "visualAcceptanceStatus",
      "webUsable",
    ] as const) {
      if (source[field] !== entry[field]) {
        throw new Error(
          `Runtime visual delivery identity mismatch for ${entry.cardId} / ${entry.rawName}: ${field}`,
        );
      }
    }
    for (const placement of source.placements) {
      if (!/^\/assets\/runtime-probe\/models\/[a-f0-9]{64}\.gltf$/u.test(placement.assetUrl)) {
        throw new Error(
          `Runtime visual delivery record does not reference a published model: ${entry.cardId} / ${entry.rawName}`,
        );
      }
    }
    return {
      ...entry,
      reason: source.reason,
      placements: source.placements,
    };
  });
  materializedVisualDescriptorCache.set(entry.file, promise);
  return promise;
}

function validateVisualDescriptorIndex(
  label: string,
  index: RuntimeVisualDescriptorIndex,
) {
  if (
    index.schemaVersion !== "runtime-visual-descriptor-index/v1" ||
    index.descriptorCount !== index.descriptors.length
  ) {
    throw new Error(`Unsupported ${label} runtime visual descriptor index`);
  }
}

let chinaVisualDescriptorIndexPromise: Promise<RuntimeVisualDescriptorIndex> | null = null;
async function loadChinaVisualDescriptorIndex() {
  chinaVisualDescriptorIndexPromise ??= import("./china-runtime-probe-visual-release-index.json")
    .then((module) => {
      const index = module.default as unknown as RuntimeVisualDescriptorIndex;
      validateVisualDescriptorIndex("China", index);
      setChinaRuntimeVisualArtifactProjection(index.descriptors);
      return index;
    });
  return chinaVisualDescriptorIndexPromise;
}

let reviewVisualDescriptorIndexPromise: Promise<RuntimeVisualDescriptorIndex> | null = null;
async function loadReviewVisualDescriptorIndex() {
  reviewVisualDescriptorIndexPromise ??= import("./runtime-probe-visual-review-index.json")
    .then((module) => {
      const index = module.default as unknown as RuntimeVisualDescriptorIndex;
      validateVisualDescriptorIndex("review", index);
      return index;
    });
  return reviewVisualDescriptorIndexPromise;
}

const VISUAL_ARTIFACT_REF_PATTERN = /^visual-artifact-[a-f0-9]{64}$/;
const RUNTIME_VEHICLE_REF_PATTERN = /^vehicle-[a-f0-9]{64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

if (
  visualArtifactIndex.schemaVersion !==
    "sigua-runtime-visual-artifact-index/v1" ||
  !SHA256_PATTERN.test(visualArtifactIndex.catalogRevision) ||
  !visualArtifactIndex.editions ||
  typeof visualArtifactIndex.editions !== "object" ||
  Array.isArray(visualArtifactIndex.editions) ||
  Object.keys(visualArtifactIndex.editions)
    .sort((left, right) => left.localeCompare(right, "en"))
    .join("\n") !== "china\ninternational"
) {
  throw new Error("Unsupported runtime visual artifact index");
}

function buildRuntimeVisualArtifactProjection(
  edition: SiteEdition,
  descriptors: RuntimeVisualIdentityDescriptor[],
) {
  const entries = visualArtifactIndex.editions[edition];
  if (!Array.isArray(entries) || entries.length !== descriptors.length) {
    throw new Error(
      `${edition} runtime visual artifact projection count does not match its descriptor index`,
    );
  }
  const descriptorByIdentity = new Map<string, RuntimeVisualIdentityDescriptor>();
  for (const descriptor of descriptors) {
    const identity = descriptorIdentity(
      descriptor.cardId,
      descriptor.rawName,
    );
    if (descriptorByIdentity.has(identity)) {
      throw new Error(
        `Duplicate ${edition} runtime visual descriptor identity: ${descriptor.cardId} / ${descriptor.rawName}`,
      );
    }
    descriptorByIdentity.set(identity, descriptor);
  }

  const projectionByIdentity =
    new Map<string, RuntimeVisualArtifactProjection>();
  const artifactRefs = new Set<string>();
  for (const entry of entries) {
    const identity = descriptorIdentity(entry?.cardId, entry?.rawName);
    const descriptor = descriptorByIdentity.get(identity);
    if (
      !descriptor ||
      projectionByIdentity.has(identity) ||
      typeof entry.cardId !== "string" ||
      entry.cardId.length === 0 ||
      typeof entry.rawName !== "string" ||
      entry.rawName.length === 0 ||
      !VISUAL_ARTIFACT_REF_PATTERN.test(entry.visualArtifactRef) ||
      artifactRefs.has(entry.visualArtifactRef) ||
      !RUNTIME_VEHICLE_REF_PATTERN.test(entry.runtimeVehicleRef) ||
      !SHA256_PATTERN.test(entry.identitySha256) ||
      !SHA256_PATTERN.test(entry.packageSha256) ||
      entry.runtimeVehicleRef !== `vehicle-${entry.identitySha256}` ||
      typeof entry.generatedClass !== "string" ||
      entry.generatedClass.length === 0 ||
      entry.runtimeVehicleRef !== descriptor.vehicleId ||
      entry.generatedClass !== descriptor.generatedClass ||
      entry.identitySha256 !== descriptor.identitySha256 ||
      entry.packageSha256 !== descriptor.packageSha256
    ) {
      throw new Error(
        `Invalid ${edition} runtime visual artifact projection: ${entry?.cardId ?? "missing"} / ${entry?.rawName ?? "missing"}`,
      );
    }
    projectionByIdentity.set(identity, entry);
    artifactRefs.add(entry.visualArtifactRef);
  }
  if (
    projectionByIdentity.size !== descriptorByIdentity.size ||
    [...descriptorByIdentity.keys()].some(
      (identity) => !projectionByIdentity.has(identity),
    )
  ) {
    throw new Error(
      `${edition} runtime visual artifact projection is not an exact descriptor closure`,
    );
  }
  return projectionByIdentity;
}

const runtimeVisualArtifactProjectionByEdition: Record<
  SiteEdition,
  Map<string, RuntimeVisualArtifactProjection>
> = {
  international: buildRuntimeVisualArtifactProjection(
    "international",
    visualDeliveryIndex.entries,
  ),
  china: new Map(),
};

const runtimeVisualArtifactRefs = new Set<string>();
for (const projection of [runtimeVisualArtifactProjectionByEdition.international]) {
  for (const { visualArtifactRef } of projection.values()) {
    if (runtimeVisualArtifactRefs.has(visualArtifactRef)) {
      throw new Error(
        `Runtime visual artifact ref is shared across editions: ${visualArtifactRef}`,
      );
    }
    runtimeVisualArtifactRefs.add(visualArtifactRef);
  }
}

function setChinaRuntimeVisualArtifactProjection(
  descriptors: RuntimeVisualDescriptor[],
) {
  const projection = buildRuntimeVisualArtifactProjection("china", descriptors);
  for (const { visualArtifactRef } of projection.values()) {
    if (runtimeVisualArtifactRefs.has(visualArtifactRef)) {
      throw new Error(
        `Runtime visual artifact ref is shared across editions: ${visualArtifactRef}`,
      );
    }
    runtimeVisualArtifactRefs.add(visualArtifactRef);
  }
  runtimeVisualArtifactProjectionByEdition.china = projection;
  return projection;
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
const supportAirHitAvailabilityByIdentity = new Map(
  supportAirHitAvailabilityIndex.entries.map((entry) => {
    const identity = descriptorIdentity(entry.cardId, entry.rawName);
    if (
      !entry.reason ||
      !entry.reasonCode ||
      !/^[a-f0-9]{64}$/u.test(entry.runtimeEvidenceSha256)
    ) {
      throw new Error(`Invalid support-air hit availability: ${identity}`);
    }
    return [identity, entry] as const;
  }),
);
if (
  supportAirHitAvailabilityByIdentity.size !==
  supportAirHitAvailabilityIndex.entryCount
) {
  throw new Error("Duplicate support-air hit availability identity");
}
for (const [identity, availability] of supportAirHitAvailabilityByIdentity) {
  const hasDescriptor = hitDescriptorByIdentity.has(identity);
  if ((availability.status === "hit-runtime") !== hasDescriptor) {
    throw new Error(`Support-air hit availability mismatch: ${identity}`);
  }
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
  siteEdition: SiteEdition | null = null,
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
  const visualArtifactProjection =
    siteEdition === null
      ? null
      : runtimeVisualArtifactProjectionByEdition[siteEdition].get(
          descriptorIdentity(descriptor.cardId, descriptor.rawName),
        );
  if (siteEdition !== null && !visualArtifactProjection) {
    throw new Error(
      `Runtime visual artifact projection is missing for ${siteEdition} ${descriptor.cardId} / ${descriptor.rawName}`,
    );
  }
  const hitDescriptor = hitDescriptorByIdentity.get(
    descriptorIdentity(descriptor.cardId, descriptor.rawName),
  );
  const hitAvailability = supportAirHitAvailabilityByIdentity.get(
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
      artifactRef:
        visualArtifactProjection?.visualArtifactRef ?? null,
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
    hitAvailability: hitAvailability
      ? {
          status: hitAvailability.status,
          reasonCode: hitAvailability.reasonCode,
          reason: hitAvailability.reason,
          runtimeEvidenceSha256: hitAvailability.runtimeEvidenceSha256,
        }
      : null,
  };
}

function isWebUsableDescriptor(
  descriptor: RuntimeVisualIdentityDescriptor,
) {
  return (
    descriptor.status === "complete" &&
    descriptor.visualAcceptanceStatus === "web-usable" &&
    descriptor.webUsable === true
  );
}

export const runtimeVisualDescriptorCount = visualDeliveryIndex.editionCounts.international;
export const chinaRuntimeVisualDescriptorCount = visualDeliveryIndex.editionCounts.china;
export const runtimeReviewVisualDescriptorCount = visualDeliveryIndex.reviewDescriptorCount;


const internationalPreviewCache = new Map<
  string,
  Promise<RuntimeVehiclePreview | null>
>();
const chinaPreviewCache = new Map<string, Promise<RuntimeVehiclePreview | null>>();
const reviewPreviewCache = new Map<string, Promise<RuntimeVehiclePreview | null>>();

function descriptorFromIndex(
  descriptors: RuntimeVisualDescriptor[],
  cardId: string,
  rawName: string,
) {
  return descriptors.find(
    (descriptor) => descriptor.cardId === cardId && descriptor.rawName === rawName,
  ) ?? null;
}

async function loadInternationalPreview(cardId: string, rawName: string) {
  const identity = descriptorIdentity(cardId, rawName);
  const cached = internationalPreviewCache.get(identity);
  if (cached) return cached;
  const entry = visualDeliveryByIdentity.get(identity);
  const promise = entry
    ? (async () => {
        if (!isWebUsableDescriptor(entry)) {
          throw new Error(`Public runtime visual entry is not web-usable: ${identity}`);
        }
        return toRuntimePreview(
          await loadMaterializedVisualDescriptor(entry),
          false,
          "international",
        );
      })()
    : Promise.resolve(null);
  internationalPreviewCache.set(identity, promise);
  return promise;
}

async function loadChinaPreview(cardId: string, rawName: string) {
  const identity = descriptorIdentity(cardId, rawName);
  const cached = chinaPreviewCache.get(identity);
  if (cached) return cached;
  const promise = (async () => {
    const index = await loadChinaVisualDescriptorIndex();
    const descriptor = descriptorFromIndex(index.descriptors, cardId, rawName);
    if (!descriptor) return null;
    if (!isWebUsableDescriptor(descriptor)) {
      throw new Error(`China runtime visual entry is not web-usable: ${identity}`);
    }
    return toRuntimePreview(descriptor, false, "china");
  })();
  chinaPreviewCache.set(identity, promise);
  return promise;
}

async function loadReviewPreview(cardId: string, rawName: string) {
  const identity = descriptorIdentity(cardId, rawName);
  const cached = reviewPreviewCache.get(identity);
  if (cached) return cached;
  const promise = (async () => {
    const index = await loadReviewVisualDescriptorIndex();
    const descriptor = descriptorFromIndex(index.descriptors, cardId, rawName);
    if (!descriptor) return null;
    return toRuntimePreview(descriptor, !visualDeliveryByIdentity.has(identity));
  })();
  reviewPreviewCache.set(identity, promise);
  return promise;
}

export async function runtimePreviewForVariant(
  cardId: string,
  rawName: string,
  siteEdition: SiteEdition = "international",
) {
  return siteEdition === "china"
    ? loadChinaPreview(cardId, rawName)
    : loadInternationalPreview(cardId, rawName);
}

export async function runtimePreviewForCatalogBinding(
  cardId: string,
  rawName: string,
  expectedRuntimeVehicleId: string | null,
  expectedVisualArtifactRef: string | null,
  siteEdition: SiteEdition = "international",
) {
  const preview = await runtimePreviewForVariant(cardId, rawName, siteEdition);
  if (!preview) return null;
  if (
    expectedVisualArtifactRef === null ||
    !VISUAL_ARTIFACT_REF_PATTERN.test(expectedVisualArtifactRef)
  ) {
    throw new Error(
      `Vehicle catalog visual artifact identity is missing for ${cardId} / ${rawName}`,
    );
  }
  if (preview.visual?.artifactRef !== expectedVisualArtifactRef) {
    throw new Error(
      `Vehicle catalog/visual artifact identity mismatch for ${cardId} / ${rawName}`,
    );
  }
  if (
    expectedRuntimeVehicleId !== null &&
    (preview.latestRuntimeVehicleId !== expectedRuntimeVehicleId ||
      (preview.hit !== null && preview.hit.vehicleId !== expectedRuntimeVehicleId))
  ) {
    throw new Error(
      `Vehicle catalog/runtime identity mismatch for ${cardId} / ${rawName}`,
    );
  }
  return preview;
}

export function loadRuntimePreviewForVariant(
  cardId: string,
  rawName: string,
  siteEdition: SiteEdition = "international",
) {
  return runtimePreviewForVariant(cardId, rawName, siteEdition);
}

export function runtimeReviewPreviewForVariant(cardId: string, rawName: string) {
  return loadReviewPreview(cardId, rawName);
}
