import { infantryWeaponDisplayNameZh } from "./weapon-display-name.ts";

export interface InfantryHitAnalysisWeaponRecord {
  weaponKey: string;
  displayName: string;
  groupDisplayName: string;
  type: string;
  factions: string[];
  projectileName: string | null;
  maxDistanceM: number;
  penetrationMm: number;
  traceDistanceAfterPenetrationM: number;
  directImpactDamage: number;
  damageTypePath: string;
  isExplosive: boolean;
  damageCurveName: string | null;
  searchAliases: string[];
}

export interface InfantryHitAnalysisWeaponGroup<
  T extends InfantryHitAnalysisWeaponRecord,
> {
  canonical: T;
  configurationKeys: string[];
  factions: string[];
  searchAliases: string[];
}

function playerFacingName(record: InfantryHitAnalysisWeaponRecord) {
  return infantryWeaponDisplayNameZh({
    displayName: record.displayName,
    gunName: record.groupDisplayName,
    projectileName: record.projectileName,
    type: record.type,
  });
}

export function infantryHitAnalysisWeaponIdentity(
  record: InfantryHitAnalysisWeaponRecord,
  damageCurves: Readonly<Record<string, readonly number[]>>,
) {
  const damageCurve = record.damageCurveName
    ? damageCurves[record.damageCurveName]
    : null;
  if (record.damageCurveName && !damageCurve) {
    throw new Error(`Missing infantry damage curve: ${record.damageCurveName}`);
  }
  return JSON.stringify({
    playerFacingName: playerFacingName(record),
    maxDistanceM: record.maxDistanceM,
    penetrationMm: record.penetrationMm,
    traceDistanceAfterPenetrationM: record.traceDistanceAfterPenetrationM,
    directImpactDamage: record.directImpactDamage,
    damageTypePath: record.damageTypePath,
    isExplosive: record.isExplosive,
    damageCurve,
  });
}

function compareCanonicalConfiguration(
  left: InfantryHitAnalysisWeaponRecord,
  right: InfantryHitAnalysisWeaponRecord,
) {
  const lengthDifference = left.weaponKey.length - right.weaponKey.length;
  if (lengthDifference !== 0) return lengthDifference;
  if (left.weaponKey < right.weaponKey) return -1;
  if (left.weaponKey > right.weaponKey) return 1;
  return 0;
}

function appendUnique(target: string[], values: readonly (string | null)[]) {
  const seen = new Set(target);
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    target.push(normalized);
  }
}

/**
 * The Wiki snapshot contains loadout configurations rather than one row per
 * player-facing weapon. Magazine-count, faction and kit variants can therefore
 * share the exact inputs consumed by the hit calculator. Collapse only those
 * calculator-equivalent rows; raw configuration identities remain in aliases.
 *
 * Muzzle velocity is deliberately absent from the identity because the static
 * hit-analysis model does not consume it.
 */
export function distinctInfantryHitAnalysisWeaponGroups<
  T extends InfantryHitAnalysisWeaponRecord,
>(
  records: readonly T[],
  damageCurves: Readonly<Record<string, readonly number[]>>,
): InfantryHitAnalysisWeaponGroup<T>[] {
  const groupsByIdentity = new Map<string, InfantryHitAnalysisWeaponGroup<T>>();
  for (const record of records) {
    const identity = infantryHitAnalysisWeaponIdentity(record, damageCurves);
    const existing = groupsByIdentity.get(identity);
    if (!existing) {
      groupsByIdentity.set(identity, {
        canonical: record,
        configurationKeys: [record.weaponKey],
        factions: [...record.factions].sort(),
        searchAliases: [],
      });
    } else {
      existing.configurationKeys.push(record.weaponKey);
      appendUnique(existing.factions, record.factions);
      existing.factions.sort();
      if (compareCanonicalConfiguration(record, existing.canonical) < 0) {
        existing.canonical = record;
      }
    }
    const group = groupsByIdentity.get(identity);
    if (!group) throw new Error("Missing infantry hit-analysis weapon group");
    appendUnique(group.searchAliases, [
      ...record.searchAliases,
      record.weaponKey,
      record.displayName,
      record.groupDisplayName,
      record.projectileName,
      ...record.factions,
    ]);
  }
  return [...groupsByIdentity.values()];
}
