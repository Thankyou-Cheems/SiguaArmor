export type ViewerAssetMode = "exterior" | "armor" | "interior";

export interface ViewerNavigationState {
  view: ViewerAssetMode;
  protection: boolean;
  attacker: string;
  weapon: string;
  weaponIndex: number | null;
  distance: number;
  yaw: number | null;
  pitch: number | null;
  camera: string;
  shots: string;
}

export interface DamageTypeModifier {
  damageClass: string;
  modifier: number | null;
  forwardDamageToSoldier: boolean | null;
  forwardDamageToSoldierModifier: number | null;
  onlyPassIfDirectHit: boolean | null;
  directHitModifier: number | null;
  indirectHitModifier: number | null;
  directHitRadialDamageModifier: number | null;
}

export interface ViewerMaterial {
  materialName: string;
  considerForPen: boolean | null;
  allowPen: boolean | null;
  damageAbsorbed: number | null;
  damageMultiplier: number | null;
  damageParent: boolean | null;
  armorThicknessMm: number | null;
  rgba: Array<number | null> | null;
}

export interface ViewerWeapon {
  gunName: string;
  displayName: string;
  turretName: string | null;
  projectileName: string | null;
  muzzleVelocityMps: number | null;
  armorPenetrationMm: number | null;
  armorPenetrationCurve: string | null;
  traceDistanceAfterPenM: number | null;
  maxDamageToApply: number | null;
  minDamageToApply: number | null;
  distanceToStartDamageFallOffM: number | null;
  damageFallOffRate: number | null;
  damageFallOffType: string | null;
  maxTraceDistanceM: number | null;
  projectile: {
    impactDamage: number | null;
    damageType: string | null;
    isExplosive: boolean | null;
    explosiveBaseDamage: number | null;
    explosiveMinDamage: number | null;
    explosiveKillZoneRadiusM: number | null;
    explosiveDamageOuterRadiusM: number | null;
    explosiveDamageInnerRadiusM: number | null;
    explosiveDamageFalloff: number | null;
    armorPenetrationMm: number | null;
    traceDistanceAfterPenM: number | null;
  };
}

export interface ViewerComponent {
  componentId: string;
  kind: "mesh" | "damageable";
  mode: ViewerAssetMode;
  displayName: string;
  pathName: string;
  attachedTo: string | null;
  transform: {
    locationCm: [number, number, number];
    rotationDeg: [number, number, number];
    scale: [number, number, number];
  };
  componentHealth: number | null;
  repairToolLimit: number | null;
  canBeRepairedAfterDestroy: boolean | null;
  materialsDefined: boolean;
  materials: Array<{
    materialName: string | null;
    overriddenThicknessMm: number | null;
  }>;
  damageTypes: DamageTypeModifier[];
  exteriorMaterialSlots: Array<{
    slotIndex: number;
    gltfMaterialName: string | null;
    sourceSlotName: string | null;
    materialPath: string | null;
    resolution: "override" | "original-fallback" | "unavailable";
    textures: Array<{
      parameterName: string;
      role: "albedo" | "normal" | "packed" | "emissive" | "other";
      texturePath: string | null;
      localPath: string | null;
      sha256: string | null;
      bytes: number | null;
      captureStatus: "captured" | "unavailable";
    }>;
  }>;
  asset: {
    localPath: string;
    sha256: string;
    bytes: number;
  };
}

export interface ViewerVehicle {
  promoEntryId: string;
  promotionOrder: number;
  officialNameZh: string;
  rawName: string;
  displayName: string;
  vehicleHealth: number | null;
  repairToolLimit: number | null;
  isDamagedByRadial: boolean | null;
  transform: {
    locationCm: [number, number, number];
    rotationDeg: [number, number, number];
    scale: [number, number, number];
  };
  damageTypes: DamageTypeModifier[];
  turrets: Array<{
    turretName: string;
    seatHealth: number | null;
    passDamageToVehicle: boolean | null;
    passPointDamageToVehicle: boolean | null;
  }>;
  components: ViewerComponent[];
  weapons: ViewerWeapon[];
  curves: Record<string, number[]>;
}

export interface ViewerReferenceManifest {
  schemaVersion: "1.0.0";
  catalogId: string;
  accessPolicy: { publishStatus: "public" };
  materials: ViewerMaterial[];
  vehicles: ViewerVehicle[];
}
