export type HitSceneRecordFormatVersion = "hit-scene-record/v1";

export type EvidenceState =
  | "observed"
  | "derived"
  | "absent"
  | "unresolved"
  | "unreadable"
  | "native-unknown";

export interface EvidenceSource {
  assetPath: string;
  propertyPath?: string;
  method: string;
  jsonPointer: string;
}

export interface Evidence<T> {
  value: T | null;
  state: EvidenceState;
  source?: EvidenceSource;
  reason?: string;
}

export type HitScenePublishStatus = "public" | "blocked";
export type HitScenePlacementState = "resolved" | "unresolved";
export type HitSceneSemanticKind =
  | "armor"
  | "penetration-blocker"
  | "gun-collision"
  | "engine"
  | "ammo-rack"
  | "track"
  | "wheel"
  | "other";

export interface HitSceneRecordSection {
  byteOffset: number;
  byteLength: number;
  elementCount: number;
  componentType: "float32" | "uint16" | "uint32" | "bytes";
  itemSize: number;
}

export interface HitSceneRecordSource {
  sourceKind: "international-mod-sdk";
  sourceBuildId: string;
  targetPackage: string;
  promotionScopeSha256: string;
  nativeModuleSha256: string;
}

export interface HitSceneCoordinateSystem {
  source: "unreal-centimeters-x-forward-y-right-z-up";
  target: "viewer-meters-x-forward-y-left-z-up";
  mapping: "[ueX/100, -ueY/100, ueZ/100]";
  determinant: -1;
  matrixOrder: "column-major";
  triangleWinding: "editor-source-preserved";
  faceNormals: "recomputed-from-editor-source-winding";
}

export interface HitSceneOwner {
  ownerId: string;
  kind: "vehicle-root" | "seat";
  parentOwnerIndex: number | null;
  seatIndex: number | null;
  socketName: Evidence<string>;
  placementState: HitScenePlacementState;
  ownerToVehicle: Evidence<readonly number[]>;
  healthPoolIndex: number | null;
}

export interface HitSceneDamageModifier {
  damageTypePath: string;
  modifier: Evidence<number>;
  directHitDamageMultiplier: Evidence<number>;
  directHitRadialDamageMultiplier: Evidence<number>;
  indirectHitDamageMultiplier: Evidence<number>;
  onlyPassDamageIfDirectHit: Evidence<boolean>;
}

export type HitSceneHealthPoolKind =
  | "hull"
  | "seat"
  | "engine"
  | "ammo-rack"
  | "track"
  | "wheel"
  | "other";

export interface HitSceneHealthPool {
  poolId: string;
  kind: HitSceneHealthPoolKind;
  ownerIndex: number | null;
  componentIndex: number | null;
  maxHealth: Evidence<number>;
  constructedHealth?: Evidence<number>;
  passDamageToParent: Evidence<boolean>;
  passPointDamageToParent: Evidence<boolean>;
  passRadialDamageToParent: Evidence<boolean>;
  damageModifiers: HitSceneDamageModifier[];
  lifecycle?: Record<string, Evidence<unknown>>;
}

export interface HitSceneComponent {
  componentId: string;
  componentPath: string;
  classPath: string;
  ownerIndex: number;
  semanticKind: HitSceneSemanticKind;
  placementState: HitScenePlacementState;
  geometryAssetIndex: number | null;
  directDamagePoolIndex: Evidence<number>;
  collisionProfile: Evidence<string>;
}

export interface HitSceneGeometryAsset {
  geometryAssetId: string;
  componentIndex: number;
  sourceAssetPath: string;
  sourceGeometrySha256: string;
  vertexOffset: number;
  vertexCount: number;
  triangleOffset: number;
  triangleCount: number;
}

export interface HitSceneSurfaceProfile {
  surfaceProfileId: string;
  componentIndex: number;
  sourceMaterialSlot: number;
  physicalMaterialPath: Evidence<string>;
  armorThicknessMm: Evidence<number>;
  considerForPenetration: Evidence<boolean>;
  allowPenetration: Evidence<boolean>;
  damageParentActor: Evidence<boolean>;
  armorDamageMultiplier: Evidence<number>;
  damageAbsorbed: Evidence<number>;
}

export interface HitSceneCurveKey {
  time: number;
  value: number;
  interpMode?: string;
  tangentMode?: string;
  arriveTangent?: number;
  leaveTangent?: number;
}

export interface HitSceneCurve {
  curveId: string;
  role: "armor-penetration" | "impact-damage";
  assetPath: string;
  inputUnit: "meters" | "unreal-centimeters";
  outputUnit: "millimeters" | "damage";
  sourceSha256: string;
  keys: Evidence<readonly HitSceneCurveKey[]>;
}

export interface HitSceneWeapon {
  weaponId: string;
  role: string;
  assetPath: string;
  projectileIndex: Evidence<number>;
  armorPenetrationDepthMm: Evidence<number>;
  armorPenetrationCurveIndex: Evidence<number>;
  damageFalloffCurveIndex: Evidence<number>;
  maxDamage: Evidence<number>;
  minDamage: Evidence<number>;
  muzzleVelocityCmPerSecond: Evidence<number>;
  traceDistanceAfterPenetrationMeters: Evidence<number>;
}

export interface HitSceneProjectile {
  projectileId: string;
  role: string;
  assetPath: string;
  damageTypePath: Evidence<string>;
  armorPenetrationDepthMm: Evidence<number>;
  impactDamage: Evidence<number>;
  isExplosive: Evidence<boolean>;
  traceDistanceAfterPenetrationMeters: Evidence<number>;
  explosiveBaseDamage: Evidence<number>;
  explosiveMinimumDamage: Evidence<number>;
  explosiveInnerRadiusCm: Evidence<number>;
  explosiveOuterRadiusCm: Evidence<number>;
  explosiveFalloff: Evidence<number>;
  impactNormalOffsetCm: Evidence<number>;
}

export interface HitSceneNativeFunctionPin {
  functionName: string;
  rva: string;
  size: number;
  sha256: string;
}

export type HitSceneCapabilityState = "observed" | "partial" | "native-unknown";

export interface HitSceneCapability {
  state: HitSceneCapabilityState;
  evidence: string[];
  reason?: string;
  omittedComponentCount?: number;
}

export interface HitSceneCapabilities {
  geometry: HitSceneCapability;
  surfaceProfiles: HitSceneCapability;
  penetrationPredicate: HitSceneCapability;
  damageAbsorptionChain: HitSceneCapability;
  directHitDamage: HitSceneCapability;
  finalTargetTakeDamageRouting: HitSceneCapability;
  missingModifierFallback: HitSceneCapability;
  radialDamage: HitSceneCapability;
}

export interface HitSceneRecordCounts {
  vertices: number;
  triangles: number;
  placedComponents: number;
  components: number;
  geometryAssets: number;
  surfaceProfiles: number;
  owners: number;
  healthPools: number;
  weapons: number;
  projectiles: number;
  curves: number;
}

export interface HitSceneRecordHeader {
  formatVersion: HitSceneRecordFormatVersion;
  vehicleId: string;
  officialNameZh: string;
  source: HitSceneRecordSource;
  coordinateSystem: HitSceneCoordinateSystem;
  publishStatus: HitScenePublishStatus;
  counts: HitSceneRecordCounts;
  sections: {
    positions: HitSceneRecordSection;
    indices: HitSceneRecordSection;
    triangleComponentIndex: HitSceneRecordSection;
    triangleSurfaceProfileIndex: HitSceneRecordSection;
    faceNormals: HitSceneRecordSection;
    bvhRoots: HitSceneRecordSection[];
    bvhIndirectBuffer: HitSceneRecordSection;
  };
  bvh: {
    serializationVersion: 1;
    indirect: true;
    indexSection: "indices";
  };
  owners: HitSceneOwner[];
  healthPools: HitSceneHealthPool[];
  components: HitSceneComponent[];
  geometryAssets: HitSceneGeometryAsset[];
  surfaceProfiles: HitSceneSurfaceProfile[];
  weapons: HitSceneWeapon[];
  projectiles: HitSceneProjectile[];
  curves: HitSceneCurve[];
  nativeFunctions: HitSceneNativeFunctionPin[];
  nativeUnknown: string[];
  capabilities: HitSceneCapabilities;
}

export interface HitSceneBvhSerialized {
  version: 1;
  roots: ArrayBuffer[];
  index: Uint32Array;
  indirectBuffer: Uint32Array;
  indirect: true;
}

export interface ParsedHitSceneRecord {
  header: HitSceneRecordHeader;
  positions: Float32Array;
  indices: Uint32Array;
  triangleComponentIndex: Uint16Array | Uint32Array;
  triangleSurfaceProfileIndex: Uint16Array | Uint32Array;
  faceNormals: Float32Array;
  bvh: HitSceneBvhSerialized;
}
