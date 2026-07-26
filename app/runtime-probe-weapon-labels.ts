import {
  infantryWeaponDisplayNameZh,
  weaponDisplayNameZh,
} from "../lib/weapon-display-name.ts";
import type {
  RuntimeWeaponLabel,
  RuntimeWeaponLabelMatchBasis,
} from "../lib/runtime-weapon-label-options.ts";
import {
  editorNativeDirectWeaponIndices,
  resolveEditorNativeBallistics,
  type EditorNativeModel,
} from "../lib/editor-native-hit-model.ts";
import {
  distinctInfantryHitAnalysisWeaponGroups,
} from "../lib/infantry-hit-analysis-weapons.ts";
import { runtimeHitRecordReferenceForVariant } from "./runtime-probe-preview-data";
import wikiInfantryWeaponIndexJson from "./wiki-infantry-weapon-ballistics-index.json";
import weaponLabelIndexJson from "./runtime-probe-weapon-label-index.json";

export type {
  RuntimeWeaponLabel,
  RuntimeWeaponLabelMatchBasis,
} from "../lib/runtime-weapon-label-options.ts";

interface RuntimeWeaponLabelRecord {
  weaponIndex: number;
  weaponId: string;
  runtimeAssetPath: string;
  gunName: string;
  displayName: string;
  projectileName: string | null;
  matchBasis: RuntimeWeaponLabelMatchBasis;
}

interface RuntimeWeaponLabelBinding {
  bindingKey: string;
  cardId: string;
  rawName: string;
  recordSha256: string;
  weapons: RuntimeWeaponLabelRecord[];
  unmatchedWeaponIndices: number[];
}

interface RuntimeAttackSourceRecord {
  cardId: string;
  cardIds: string[];
  displayName: string;
  groupId: string;
  groupName: string;
  groupOrder: number;
  type: string;
  types: string[];
  canonicalRawName: string;
  catalogSelectedRawName: string;
  canonicalSelectionBasis:
    | "max-distinct-direct-encyclopedia-weapons-then-card-id-within-faction-display-name"
    | "wiki-infantry-configuration-order";
  variantRawNames: string[];
  vehicleId: string;
  recordUrl: string;
  recordSha256: string;
  recordBytes: number;
  directWeaponCount: number;
  runtimeBackedWeaponCount: number;
  catalogCompletedWeaponCount: number;
  baseCurveFallbackWeaponCount: number;
  weapons: RuntimeAttackSourceWeaponRecord[];
}

interface RuntimeAttackBallisticsSource {
  kind: "exact-runtime-record" | "encyclopedia-weapon-closure";
  catalogFingerprintSha256: string;
  runtimeRecordSha256?: string;
  runtimeWeaponIndex?: number;
  projectileEvidence: {
    recordSha256: string;
    projectileIndex: number;
    assetPath: string;
  } | null;
  curveEvidence: {
    role: "armor-penetration" | "impact-damage";
    recordSha256: string;
    curveIndex: number;
    assetPath: string;
  }[];
  baseCurveFallbacks: {
    role: "armor-penetration" | "impact-damage";
    assetName: string;
  }[];
}

interface RuntimeAttackSourceWeaponRecord
  extends Omit<RuntimeWeaponLabelRecord, "runtimeAssetPath"> {
  runtimeAssetPath: string | null;
  ballisticsId: string;
  ballisticsWeaponIndex: 0;
  ballisticsModel: EditorNativeModel;
  ballisticsSource: RuntimeAttackBallisticsSource;
  sourceCardId: string;
  sourceRawName: string;
  sourceVehicleId: string;
  sourceRecordUrl: string;
  sourceRecordSha256: string;
  sourceRecordBytes: number;
}

export const INFANTRY_WEAPON_CATEGORIES = [
  {
    id: "anti-armor",
    label: "反装甲",
    description: "专用反装甲武器与弹药",
  },
  {
    id: "high-penetration",
    label: "高穿弹",
    description: "高穿深弹药，可对轻装甲目标造成威胁",
  },
  {
    id: "light-weapons",
    label: "轻武器",
    description: "可对补给载具等轻装车辆造成有限威胁",
  },
  {
    id: "low-penetration",
    label: "低穿武器",
    description: "穿深较低，几乎无法击穿载具",
  },
] as const;

export type InfantryWeaponCategoryId =
  (typeof INFANTRY_WEAPON_CATEGORIES)[number]["id"];

export function infantryWeaponCategoryForPenetration(
  penetrationMm: number,
): InfantryWeaponCategoryId {
  if (penetrationMm >= 300) return "anti-armor";
  if (penetrationMm >= 8) return "high-penetration";
  if (penetrationMm > 2) return "light-weapons";
  return "low-penetration";
}

export interface RuntimeAttackSourceWeapon extends RuntimeAttackSourceWeaponRecord {
  displayNameZh: string;
  displayNameEnglish: string;
  sourceKind: "vehicle" | "wiki-infantry";
  infantryCategory?: InfantryWeaponCategoryId;
  searchAliases?: string[];
}

export interface RuntimeAttackSource extends Omit<RuntimeAttackSourceRecord, "weapons"> {
  sourceKind: "vehicle" | "wiki-infantry";
  weapons: RuntimeAttackSourceWeapon[];
}

interface WikiInfantryWeaponBallisticsRecord {
  weaponKey: string;
  displayName: string;
  groupDisplayName: string;
  groupFullName: string;
  type: string;
  factions: string[];
  projectileName: string | null;
  muzzleVelocityMps: number;
  maxDistanceM: number;
  penetrationMm: number;
  traceDistanceAfterPenetrationM: number;
  directImpactDamage: number;
  damageTypePath: string;
  isExplosive: boolean;
  damageCurveName: string | null;
  searchAliases: string[];
  ballisticsId: string;
}

interface WikiInfantryWeaponBallisticsIndex {
  schemaVersion: "sigua-infantry-weapon-ballistics/v1";
  dataRevision: string;
  sourceDataRevision: string;
  damageCurveSampleIntervalM: number;
  damageCurves: Record<string, number[]>;
  counts: {
    sourceConfigurations: number;
    penetratingConfigurations: number;
    radialOnlyConfigurations: number;
  };
  weapons: WikiInfantryWeaponBallisticsRecord[];
}

interface RuntimeWeaponLabelIndex {
  schemaVersion: "runtime-hit-weapon-label-index/v4";
  counts: {
    bindings: number;
    vehicleCards: number;
    runtimeWeapons: number;
    matchedWeapons: number;
    exactAssetMatches: number;
    exactFingerprintMatches: number;
    unmatchedWeapons: number;
    encyclopediaDirectWeapons: number;
    attackSources: number;
    attackWeapons: number;
    runtimeBackedAttackWeapons: number;
    catalogCompletedAttackWeapons: number;
    baseCurveFallbackAttackWeapons: number;
    multiRecordAttackSources: number;
    armedVehicleCards: number;
    excludedNoDirectWeaponCards: number;
    collapsedVariantBindings: number;
    collapsedSameNameAttackCards: number;
  };
  attackSources: RuntimeAttackSourceRecord[];
  bindings: RuntimeWeaponLabelBinding[];
}

const wikiInfantryWeaponIndex =
  wikiInfantryWeaponIndexJson as unknown as WikiInfantryWeaponBallisticsIndex;
if (
  wikiInfantryWeaponIndex.schemaVersion !== "sigua-infantry-weapon-ballistics/v1" ||
  !/^[0-9a-f]{64}$/u.test(wikiInfantryWeaponIndex.dataRevision) ||
  !/^[0-9a-f]{64}$/u.test(wikiInfantryWeaponIndex.sourceDataRevision) ||
  wikiInfantryWeaponIndex.damageCurveSampleIntervalM !== 50 ||
  wikiInfantryWeaponIndex.counts.penetratingConfigurations !==
    wikiInfantryWeaponIndex.weapons.length ||
  new Set(wikiInfantryWeaponIndex.weapons.map(({ weaponKey }) => weaponKey)).size !==
    wikiInfantryWeaponIndex.weapons.length
) {
  throw new Error("Invalid Wiki infantry weapon ballistics index");
}

function wikiInfantryWeaponBallisticsModel(
  record: WikiInfantryWeaponBallisticsRecord,
): EditorNativeModel {
  const sourceCurve = record.damageCurveName
    ? wikiInfantryWeaponIndex.damageCurves[record.damageCurveName]
    : null;
  if (record.damageCurveName && !sourceCurve) {
    throw new Error(`Missing Wiki infantry damage curve: ${record.damageCurveName}`);
  }
  const damageCurveKeys = sourceCurve
    ? sourceCurve.map((value, index) => ({
        time: index *
          wikiInfantryWeaponIndex.damageCurveSampleIntervalM *
          100,
        value,
      }))
    : record.maxDistanceM > 0
      ? [
          { time: 0, value: record.directImpactDamage },
          { time: record.maxDistanceM * 100, value: record.directImpactDamage },
        ]
      : null;
  return {
    healthPools: [],
    components: [],
    surfaceProfiles: [],
    weapons: [{
      weaponId: record.weaponKey,
      role: "wiki-infantry-direct-hit",
      projectileIndex: 0,
      armorPenetrationDepthMm: record.penetrationMm,
      armorPenetrationCurveIndex: { value: null, state: "absent" },
      damageFalloffCurveIndex: damageCurveKeys
        ? 0
        : { value: null, state: "absent" },
      maxDamage: record.directImpactDamage,
      minDamage: sourceCurve?.at(-1) ?? record.directImpactDamage,
      traceDistanceAfterPenetrationMeters: record.traceDistanceAfterPenetrationM,
    }],
    projectiles: [{
      projectileId: record.projectileName ?? `${record.weaponKey}:projectile`,
      role: "wiki-infantry-projectile",
      damageTypePath: record.damageTypePath,
      armorPenetrationDepthMm: record.penetrationMm,
      impactDamage: record.directImpactDamage,
      isExplosive: record.isExplosive,
      traceDistanceAfterPenetrationMeters: record.traceDistanceAfterPenetrationM,
    }],
    curves: damageCurveKeys ? [{
      curveId: record.damageCurveName ?? `${record.weaponKey}:constant-damage`,
      inputUnit: "unreal-centimeters",
      outputUnit: "damage",
      keys: damageCurveKeys,
    }] : [],
  };
}

function bindingKey(cardId: string, rawName: string) {
  return `${cardId}\u0000${rawName}`;
}

const weaponLabelIndex = weaponLabelIndexJson as unknown as RuntimeWeaponLabelIndex;
if (weaponLabelIndex.schemaVersion !== "runtime-hit-weapon-label-index/v4") {
  throw new Error("Unsupported runtime weapon label index schema");
}
if (
  weaponLabelIndex.counts.bindings !== weaponLabelIndex.bindings.length ||
  weaponLabelIndex.counts.attackSources !== weaponLabelIndex.attackSources.length ||
  weaponLabelIndex.counts.attackWeapons !== weaponLabelIndex.attackSources.reduce(
    (total, source) => total + source.weapons.length,
    0,
  ) ||
  weaponLabelIndex.counts.runtimeBackedAttackWeapons +
      weaponLabelIndex.counts.catalogCompletedAttackWeapons !==
    weaponLabelIndex.counts.attackWeapons ||
  weaponLabelIndex.counts.armedVehicleCards +
      weaponLabelIndex.counts.excludedNoDirectWeaponCards !==
    weaponLabelIndex.counts.vehicleCards ||
  weaponLabelIndex.counts.attackSources +
      weaponLabelIndex.counts.collapsedSameNameAttackCards !==
    weaponLabelIndex.counts.armedVehicleCards ||
  weaponLabelIndex.counts.matchedWeapons + weaponLabelIndex.counts.unmatchedWeapons !==
    weaponLabelIndex.counts.runtimeWeapons
) {
  throw new Error("Runtime weapon label index counts are not closed");
}

const bindingByIdentity = new Map<string, RuntimeWeaponLabelBinding>();
for (const binding of weaponLabelIndex.bindings) {
  const identity = bindingKey(binding.cardId, binding.rawName);
  if (binding.bindingKey !== identity || bindingByIdentity.has(identity)) {
    throw new Error(`Invalid runtime weapon label identity: ${binding.cardId} / ${binding.rawName}`);
  }
  bindingByIdentity.set(identity, binding);
}

const attackSourceByCardId = new Map<string, RuntimeAttackSource>();
const runtimeVehicleAttackSources: readonly RuntimeAttackSource[] =
  weaponLabelIndex.attackSources.map((source) => {
    const duplicateCardId = source.cardIds.some((cardId) => attackSourceByCardId.has(cardId));
    const canonicalReleaseRecord = runtimeHitRecordReferenceForVariant(
      source.cardId,
      source.canonicalRawName,
    );
    if (
      duplicateCardId ||
      !canonicalReleaseRecord ||
      canonicalReleaseRecord.vehicleId !== source.vehicleId ||
      source.cardIds.length === 0 ||
      new Set(source.cardIds).size !== source.cardIds.length ||
      !source.cardIds.includes(source.cardId) ||
      source.cardIds.some((cardId) => !cardId.startsWith(`${source.groupId}--`)) ||
      !source.variantRawNames.includes(source.canonicalRawName) ||
      source.weapons.length === 0 ||
      source.directWeaponCount !== source.weapons.length ||
      source.runtimeBackedWeaponCount + source.catalogCompletedWeaponCount !==
        source.directWeaponCount ||
      source.baseCurveFallbackWeaponCount > source.catalogCompletedWeaponCount ||
      source.recordBytes <= 0 ||
      !/^vehicle-[0-9a-f]{64}$/.test(source.vehicleId) ||
      !/^[0-9a-f]{64}$/.test(source.recordSha256) ||
      source.recordUrl !==
        `/assets/runtime-probe/hit-runtime/records/${source.recordSha256}.json`
    ) {
      throw new Error(`Invalid runtime attack source: ${source.cardId}`);
    }
    const ballisticsIds = new Set<string>();
    const normalized: RuntimeAttackSource = {
      ...source,
      sourceKind: "vehicle",
      vehicleId: canonicalReleaseRecord.vehicleId,
      recordUrl: canonicalReleaseRecord.recordUrl,
      recordSha256: canonicalReleaseRecord.recordSha256,
      recordBytes: canonicalReleaseRecord.recordBytes,
      weapons: source.weapons.map((weapon) => {
        const sourceIdentity = weapon.ballisticsId;
        const releaseRecord = runtimeHitRecordReferenceForVariant(
          weapon.sourceCardId,
          weapon.sourceRawName,
        );
        if (
          ballisticsIds.has(sourceIdentity) ||
          !releaseRecord ||
          releaseRecord.vehicleId !== weapon.sourceVehicleId ||
          !source.cardIds.includes(weapon.sourceCardId) ||
          !source.variantRawNames.includes(weapon.sourceRawName) ||
          weapon.sourceRecordBytes <= 0 ||
          !/^vehicle-[0-9a-f]{64}$/.test(weapon.sourceVehicleId) ||
          !/^[0-9a-f]{64}$/.test(weapon.sourceRecordSha256) ||
          weapon.sourceRecordUrl !==
            `/assets/runtime-probe/hit-runtime/records/${weapon.sourceRecordSha256}.json` ||
          !/^[0-9a-f]{64}$/.test(weapon.ballisticsId) ||
          weapon.ballisticsWeaponIndex !== 0 ||
          weapon.ballisticsModel.weapons?.length !== 1 ||
          weapon.ballisticsModel.projectiles?.length !== 1 ||
          !Array.isArray(weapon.ballisticsModel.curves) ||
          !/^[0-9a-f]{64}$/.test(weapon.ballisticsSource.catalogFingerprintSha256) ||
          !Array.isArray(weapon.ballisticsSource.curveEvidence) ||
          !Array.isArray(weapon.ballisticsSource.baseCurveFallbacks) ||
          (
            weapon.ballisticsSource.kind === "exact-runtime-record" &&
            (
              weapon.weaponIndex < 0 ||
              !weapon.runtimeAssetPath ||
              weapon.ballisticsSource.runtimeRecordSha256 !==
                weapon.sourceRecordSha256 ||
              weapon.ballisticsSource.runtimeWeaponIndex !== weapon.weaponIndex
            )
          ) ||
          (
            weapon.ballisticsSource.kind === "encyclopedia-weapon-closure" &&
            (weapon.weaponIndex !== -1 || weapon.runtimeAssetPath !== null)
          )
        ) {
          throw new Error(`Invalid runtime attack weapon: ${source.cardId}/${weapon.weaponIndex}`);
        }
        ballisticsIds.add(sourceIdentity);
        return {
          ...weapon,
          sourceKind: "vehicle",
          sourceVehicleId: releaseRecord.vehicleId,
          sourceRecordUrl: releaseRecord.recordUrl,
          sourceRecordSha256: releaseRecord.recordSha256,
          sourceRecordBytes: releaseRecord.recordBytes,
          displayNameZh: weaponDisplayNameZh(weapon),
          displayNameEnglish: weapon.displayName || weapon.gunName,
        };
      }),
    };
    for (const cardId of source.cardIds) attackSourceByCardId.set(cardId, normalized);
    return normalized;
  });

const WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID = "wiki--infantry-weapons";
const wikiInfantryAttackSourceWeaponGroups =
  distinctInfantryHitAnalysisWeaponGroups(
    wikiInfantryWeaponIndex.weapons,
    wikiInfantryWeaponIndex.damageCurves,
  );
const wikiInfantryAttackSourceWeapons: RuntimeAttackSourceWeapon[] =
  wikiInfantryAttackSourceWeaponGroups.map((group) => {
    const record = group.canonical;
    return {
      weaponIndex: -1,
      weaponId: record.weaponKey,
      runtimeAssetPath: null,
      gunName: record.groupDisplayName,
      displayName: record.displayName,
      projectileName: record.projectileName,
      matchBasis: "exact-encyclopedia-weapon-ballistics",
      ballisticsId: record.ballisticsId,
      ballisticsWeaponIndex: 0,
      ballisticsModel: wikiInfantryWeaponBallisticsModel(record),
      ballisticsSource: {
        kind: "encyclopedia-weapon-closure",
        catalogFingerprintSha256: wikiInfantryWeaponIndex.sourceDataRevision,
        projectileEvidence: null,
        curveEvidence: [],
        baseCurveFallbacks: [],
      },
      sourceCardId: WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID,
      sourceRawName: record.groupFullName,
      sourceVehicleId: `wiki-infantry-${wikiInfantryWeaponIndex.dataRevision}`,
      sourceRecordUrl: "/data/wiki-weapons.json",
      sourceRecordSha256: wikiInfantryWeaponIndex.sourceDataRevision,
      sourceRecordBytes: 0,
      displayNameZh: infantryWeaponDisplayNameZh({
        displayName: record.displayName,
        gunName: record.groupDisplayName,
        projectileName: record.projectileName,
        type: record.type,
      }),
      displayNameEnglish: record.displayName,
      sourceKind: "wiki-infantry",
      infantryCategory: infantryWeaponCategoryForPenetration(record.penetrationMm),
      searchAliases: group.searchAliases,
    };
  });

const wikiInfantryAttackSource: RuntimeAttackSource = {
  sourceKind: "wiki-infantry",
  cardId: WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID,
  cardIds: [WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID],
  displayName: "步兵武器",
  groupId: "infantry-weapons",
  groupName: "步兵",
  groupOrder: Number.MAX_SAFE_INTEGER,
  type: "Infantry Weapon",
  types: ["Infantry Weapon", "Small Arms", "步兵武器"],
  canonicalRawName: "Infantry Weapons",
  catalogSelectedRawName: "Infantry Weapons",
  canonicalSelectionBasis: "wiki-infantry-configuration-order",
  variantRawNames: [
    ...new Set(wikiInfantryWeaponIndex.weapons.map(({ groupDisplayName }) => groupDisplayName)),
  ],
  vehicleId: `wiki-infantry-${wikiInfantryWeaponIndex.dataRevision}`,
  recordUrl: "/data/wiki-weapons.json",
  recordSha256: wikiInfantryWeaponIndex.sourceDataRevision,
  recordBytes: 0,
  directWeaponCount: wikiInfantryAttackSourceWeapons.length,
  runtimeBackedWeaponCount: 0,
  catalogCompletedWeaponCount: wikiInfantryAttackSourceWeapons.length,
  baseCurveFallbackWeaponCount: 0,
  weapons: wikiInfantryAttackSourceWeapons,
};
attackSourceByCardId.set(WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID, wikiInfantryAttackSource);

export const runtimeAttackSources: readonly RuntimeAttackSource[] = [
  ...runtimeVehicleAttackSources,
  wikiInfantryAttackSource,
];

export function runtimeAttackWeaponSupportsHitAnalysis(
  weapon: RuntimeAttackSourceWeapon,
) {
  if (weapon.sourceKind === "vehicle") {
    return editorNativeDirectWeaponIndices(weapon.ballisticsModel).includes(
      weapon.ballisticsWeaponIndex,
    );
  }
  const ballistics = resolveEditorNativeBallistics(
    weapon.ballisticsModel,
    weapon.ballisticsWeaponIndex,
    0,
  );
  return ballistics.penetrationAtRangeMm !== null &&
    ballistics.penetrationAtRangeMm > 0 &&
    ballistics.impactDamageAtRange !== null &&
    ballistics.impactDamageAtRange >= 0 &&
    ballistics.traceDistanceAfterPenetrationM !== null &&
    ballistics.damageTypePath !== null;
}

export function runtimeAttackSourceForCardId(cardId: string) {
  return attackSourceByCardId.get(cardId) ?? null;
}

export function runtimeWeaponLabelFor({
  cardId,
  rawName,
  recordSha256,
  weaponIndex,
  weaponId,
  runtimeAssetPath,
}: {
  cardId: string;
  rawName: string;
  recordSha256: string;
  weaponIndex: number;
  weaponId: string;
  runtimeAssetPath: string;
}): RuntimeWeaponLabel | null {
  const binding = bindingByIdentity.get(bindingKey(cardId, rawName));
  if (!binding || binding.recordSha256 !== recordSha256) return null;
  const weapon = binding.weapons.find((candidate) => candidate.weaponIndex === weaponIndex);
  if (
    !weapon ||
    weapon.weaponId !== weaponId ||
    weapon.runtimeAssetPath !== runtimeAssetPath
  ) {
    return null;
  }
  return {
    displayNameZh: weaponDisplayNameZh(weapon),
    displayNameEnglish: weapon.displayName || weapon.gunName,
    gunName: weapon.gunName,
    projectileName: weapon.projectileName,
    matchBasis: weapon.matchBasis,
  };
}
