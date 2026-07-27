export interface ReferenceWeapon {
  gunName: string;
  displayName: string;
  turretName: string | null;
  numberOfMags: number | null;
  magSize: number | null;
  muzzleVelocityMps: number | null;
  tacticalReloadDurationSeconds: number | null;
  dryReloadDurationSeconds: number | null;
  roundsPerMinute: number | null;
  projectileName: string | null;
  maxDamageToApply: number | null;
  minDamageToApply: number | null;
  armorPenetrationMm: number | null;
  armorPenetrationCurve: string | null;
  traceDistanceAfterPenM: number | null;
  projectile: {
    impactDamage: number | null;
    damageType: string | null;
    explosiveBaseDamage: number | null;
  };
  mechanics: {
    equipDurationSeconds: number | null;
    timeBetweenShotsSeconds: number | null;
    damageFalloffCurve: string | null;
    minimumRearmSeconds: number | null;
    rearmOneMagazineAtATime: boolean | null;
    rearmByRounds: boolean | null;
    roundsPerRearm: number | null;
  };
}

export interface ReferenceDamageResistance {
  damageClass: string;
  modifier: number | null;
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
  weapons: ReferenceWeapon[];
  seats: ReferenceSeat[];
  damageResistances: ReferenceDamageResistance[];
  components: ReferenceComponent[];
}

export interface CatalogVariant {
  sourceRawName: string;
  alias: string;
  searchTerms?: string[];
  searchAliases?: string[];
  presentation?: {
    vehicleNameZh?: string | null;
    liveryZh: string | null;
    configurationZh: string | null;
  };
  data: ReferenceData;
}

export interface CatalogRecord {
  promoEntryId: string;
  promotionOrder: number;
  searchTerms?: string[];
  searchAliases?: string[];
  official: {
    groupId: string;
    groupNameZh: string;
    nameZh: string;
    typeZh: string;
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
  promotionOrder: number;
  searchTerms?: string[];
  searchAliases?: string[];
  official: {
    groupId: string;
    groupNameZh: string;
    nameZh: string;
    typeZh: string;
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
  dataRevision: string;
  groups: CatalogFactionSummary[];
  records: CatalogSearchRecord[];
}

export interface PublicFactionCatalog {
  schemaVersion: "1.0.0";
  catalogId: string;
  dataRevision: string;
  group: CatalogFactionSummary;
  records: CatalogRecord[];
}
