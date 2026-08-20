import type { WeaponCatalogVehicleEquipment } from "../lib/weapon-catalog";

export type ReferenceWeapon = WeaponCatalogVehicleEquipment;

export interface ReferenceDamageResistance {
  damageClass: string;
  modifier: number | null;
}

export interface ReferenceVehicleBurning {
  state: "observed" | "derived" | "projected" | "unknown";
  sourceBuildId: string;
  startHealthFraction: number;
  healthFractionPerSecond: number;
  tickIntervalSeconds: number;
  startDelaySeconds: number;
  damageClass: string;
}

export interface ReferenceTurretLimitSample {
  yawDegrees: number;
  minPitchDegrees: number;
  maxPitchDegrees: number;
}

export interface ReferenceTurretLimits {
  authority: "editor" | "reference";
  sourceBuildId: string | null;
  observedAt: string | null;
  evidenceSha256?: string;
  yaw: {
    minDegrees: number;
    maxDegrees: number;
    continuous: boolean;
  } | null;
  pitchByYaw: ReferenceTurretLimitSample[];
}

export interface ReferenceTurretArticulation {
  yawComponentName: string | null;
  pitchComponentName: string | null;
  /**
   * Mesh components driven by the yaw component only, and by the pitch
   * component as well, as observed in the editor attachment graph. The yaw and
   * pitch drivers themselves are geometry-free SceneComponents, so these lists
   * are what the runtime visual placements can actually be matched against.
   */
  yawMeshComponentNames?: string[];
  pitchMeshComponentNames?: string[];
  /** Mesh components the pivot offsets below are measured from. */
  yawAnchorMeshComponentName?: string | null;
  pitchAnchorMeshComponentName?: string | null;
  /** glTF-space (metres, X forward / Y up / Z right) offsets from anchor mesh origin to axis. */
  yawPivotOffsetMetres?: [number, number, number] | null;
  pitchPivotOffsetMetres?: [number, number, number] | null;
}

export interface ReferenceTurret {
  maxYawSpeed: number | null;
  maxPitchSpeed: number | null;
  minPitchDegrees: number | null;
  maxPitchDegrees: number | null;
  limits?: ReferenceTurretLimits;
  articulation?: ReferenceTurretArticulation;
}

export interface ReferenceSeat {
  index: number;
  role:
    | "driver"
    | "gunner"
    | "machine-gunner"
    | "grenadier"
    | "missile-operator"
    | "rocket-operator"
    | "commander"
    | "passenger";
  stationKind:
    | "weapon-station"
    | "remote-weapon-station"
    | "observation-station"
    | null;
  kitRequirement: string | null;
  seatHealth: number | null;
  repairToolLimit: number | null;
  turretName: string | null;
  stabilized: boolean | null;
  zoomLevels: number[];
  turret: ReferenceTurret | null;
}

export interface ReferenceComponent {
  displayName: string;
  componentHealth: number | null;
  repairToolLimit: number | null;
  canBeRepairedAfterDestroy: boolean | null;
  damageResistances: ReferenceDamageResistance[];
}

export interface ReferenceData {
  general: {
    rawName: string;
    displayName: string;
    details: string | null;
    type: string;
    vehicleHealth: number | null;
    repairToolLimit: number | null;
    respawnTime: number | null;
    ticketValue: number | null;
    killerPointReward: number | null;
    crewSeatCount: number | null;
    totalSeatCount: number | null;
    amphibious: boolean | null;
    isDamagedByRadial: boolean | null;
    hasConstruction: boolean | null;
    totalResources: number | null;
    constructionResources: number | null;
    ammoResources: number | null;
    hasCommandZone: boolean | null;
    commandZoneRadius: number | null;
  };
  burning: ReferenceVehicleBurning | null;
  weaponBindingIds: string[];
  seats: ReferenceSeat[];
  damageResistances: ReferenceDamageResistance[];
  components: ReferenceComponent[];
}

export type ReferenceGeneralProfile = Omit<
  ReferenceData["general"],
  "rawName"
>;

export type ReferenceComponentProfile = Omit<
  ReferenceComponent,
  "damageResistances"
> & {
  damageProfileRefs: number[];
};

export interface VehicleReferenceProfilePool<T> {
  id: string;
  values: T[];
}

export interface VehicleReferenceProfileDictionaries {
  general: VehicleReferenceProfilePool<ReferenceGeneralProfile>;
  seats: VehicleReferenceProfilePool<ReferenceSeat>;
  damageResistances:
    VehicleReferenceProfilePool<ReferenceDamageResistance>;
  components:
    VehicleReferenceProfilePool<ReferenceComponentProfile>;
}

export interface VehicleReferenceProjection {
  rawName: string;
  weaponBindingIds: string[];
  generalProfileRef: number;
  seatProfileRefs: number[];
  hullDamageProfileRefs: number[];
  componentProfileRefs: number[];
}

export interface VehicleReferencePool {
  id: string;
  values: VehicleReferenceProjection[];
}

export interface CatalogVariant {
  sourceRawName: string;
  catalogBindingRef: string | null;
  vehicleRef: string | null;
  runtimeVehicleRef: string | null;
  visualArtifactRef: string | null;
  alias: string;
  searchTerms?: string[];
  searchAliases?: string[];
  presentation?: {
    vehicleNameZh?: string | null;
    liveryZh: string | null;
    configurationZh: string | null;
  };
  thumbnail: {
    path: string;
    width: number;
    height: number;
  } | null;
  data: ReferenceData | null;
  editorAvailability?: {
    state: "observed" | "livery-alias" | "absent-current-editor";
    mechanicsSignatureId: string;
    mechanicalBindingId: string;
    mechanicalRawName: string;
    setupIds: string[];
    configurationIds: string[];
    vehicleSettingsPaths: string[];
  };
}

export interface CatalogRecord {
  promoEntryId: string;
  wikiSourceCardId?: string;
  promotionOrder: number;
  searchTerms?: string[];
  searchAliases?: string[];
  official: {
    groupId: string;
    groupNameZh: string;
    nameZh: string;
    typeZh: string;
    typeNameZh: string;
    presentation?: {
      vehicleNameZh: string;
      configurationZh: string | null;
    };
  };
  mapping: {
    selectedRawName: string | null;
  };
  data: ReferenceData | null;
  variants: CatalogVariant[];
}

export interface CatalogFactionSummary {
  id: string;
  name: string;
  order: number;
  recordCount: number;
}

export interface CatalogSearchVariant {
  sourceRawName: string;
  catalogBindingRef: string | null;
  vehicleRef: string | null;
  runtimeVehicleRef: string | null;
  visualArtifactRef: string | null;
  alias: string;
  displayName: string;
  searchTerms?: string[];
  searchAliases?: string[];
  presentation?: {
    vehicleNameZh?: string | null;
    liveryZh: string | null;
    configurationZh: string | null;
  };
  cardId: string;
  routeSlug: string;
}

export interface CatalogSearchRecord {
  promoEntryId: string;
  wikiSourceCardId?: string;
  promotionOrder: number;
  searchTerms?: string[];
  searchAliases?: string[];
  official: {
    groupId: string;
    groupNameZh: string;
    nameZh: string;
    typeZh: string;
    typeNameZh: string;
    presentation?: {
      vehicleNameZh: string;
      configurationZh: string | null;
    };
  };
  selectedRawName: string | null;
  selectedDisplayName: string | null;
  defaultCardId: string;
  routeSlug: string;
  variants: CatalogSearchVariant[];
}

export interface PublicCatalogIndex {
  schemaVersion: "1.0.0";
  catalogId: string;
  groups: CatalogFactionSummary[];
  records: CatalogSearchRecord[];
}

export interface CatalogTopologyVariant {
  sourceRawName: string;
  catalogBindingRef: string | null;
  vehicleRef: string | null;
  runtimeVehicleRef: string | null;
  visualArtifactRef: string | null;
  cardId: string;
  routeSlug: string;
}

export interface CatalogTopologyRecord {
  promoEntryId: string;
  wikiSourceCardId?: string;
  promotionOrder: number;
  official: { groupId: string };
  selectedRawName: string | null;
  defaultCardId: string;
  routeSlug: string;
  variants: CatalogTopologyVariant[];
}

export interface CatalogTopologyGroup {
  id: string;
  order: number;
  recordCount: number;
}

export interface CatalogTopologyIndex {
  schemaVersion: "1.0.0";
  catalogId: string;
  groups: CatalogTopologyGroup[];
  records: CatalogTopologyRecord[];
}

export interface PublicFactionCatalog {
  schemaVersion: "1.0.0";
  catalogId: string;
  group: CatalogFactionSummary;
  records: CatalogRecord[];
}

export type CompactCatalogVariant = Omit<
  CatalogVariant,
  "data"
> & {
  vehicleReferenceRef: number;
};

export type CompactCatalogRecord = Omit<
  CatalogRecord,
  "data" | "variants"
> & {
  data: null;
  variants: CompactCatalogVariant[];
};

export type ProfiledPublicFactionCatalog = Omit<
  PublicFactionCatalog,
  "records"
> & {
  vehicleReferenceSchemaVersion: string;
  vehicleProfiles: VehicleReferenceProfileDictionaries;
  vehicleReferences: VehicleReferencePool;
  records: CompactCatalogRecord[];
};
