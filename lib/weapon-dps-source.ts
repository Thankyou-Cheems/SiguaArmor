import type {
  WeaponDpsOverheatProfile,
  WeaponDpsWeapon,
} from "./weapon-dps-model";

type UnknownRecord = Record<string, unknown>;

export type WeaponDpsCatalogDocument = UnknownRecord;

export interface WeaponDpsCatalogResult {
  weapons: WeaponDpsWeapon[];
  sourceRevision: string | null;
  overheatProfileCount: number;
}

export interface RuntimeWeaponDpsCoordinates {
  weaponAssignmentId: string | null;
  sourceCardId: string;
  sourceRawName: string;
  weaponId: string;
}

export function resolveWeaponDpsWeaponForRuntimeAssignment(
  candidates: readonly WeaponDpsWeapon[],
  coordinates: RuntimeWeaponDpsCoordinates,
): WeaponDpsWeapon | null {
  const separator = coordinates.weaponAssignmentId?.indexOf(":") ?? -1;
  const bindingId = coordinates.weaponAssignmentId
    ? separator >= 0
      ? coordinates.weaponAssignmentId.slice(0, separator)
      : coordinates.weaponAssignmentId
    : null;
  const variantId = coordinates.weaponAssignmentId && separator >= 0
    ? coordinates.weaponAssignmentId.slice(separator + 1)
    : null;
  const exact = candidates.filter((candidate) =>
    candidate.sourceCardId === coordinates.sourceCardId &&
    (bindingId
      ? candidate.assignmentId === bindingId &&
        candidate.sourceRawName === coordinates.sourceRawName &&
        (!variantId || candidate.variantIds?.includes(variantId))
      : candidate.variantIds?.includes(coordinates.weaponId)),
  );
  return exact.length === 1 ? exact[0] : null;
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegative(value: unknown) {
  const number = numberValue(value);
  return number !== null && number >= 0 ? number : null;
}

function positive(value: unknown) {
  const number = numberValue(value);
  return number !== null && number > 0 ? number : null;
}

function totalRounds(numberOfMags: unknown, magazineSize: unknown) {
  const magazines = positive(numberOfMags);
  const roundsPerMagazine = positive(magazineSize);
  if (magazines === null || roundsPerMagazine === null) return null;
  return Math.max(1, Math.floor(magazines * roundsPerMagazine));
}

function canonicalProfile(profile: UnknownRecord): WeaponDpsOverheatProfile | null {
  const state = profile.state;
  if (state !== "observed" && state !== "projected" && state !== "unknown") {
    return null;
  }
  return {
    state,
    heatPerShot: positive(profile.heatPerShot),
    temperatureMin: numberValue(profile.temperatureMin),
    temperatureMax: numberValue(profile.temperatureMax),
    coolingRatePerSecond: positive(profile.coolingRatePerSecond),
    triggerStep: positive(profile.triggerStep),
    shutdownTemperature: numberValue(profile.shutdownTemperature),
    triggerAt: numberValue(profile.triggerAt),
    unlockTemperature: numberValue(profile.unlockTemperature),
    effectTriggerLower: numberValue(profile.effectTriggerLower),
    effectTriggerUpper: numberValue(profile.effectTriggerUpper),
    networkTriggerDelayState:
      profile.networkTriggerDelayState === "deferred" ||
      profile.networkTriggerDelayState === "observed" ||
      profile.networkTriggerDelayState === "unknown"
        ? profile.networkTriggerDelayState
        : undefined,
    sourceBuildId: stringValue(profile.sourceBuildId) ?? undefined,
    sourceAssetPaths: Array.isArray(profile.sourceAssetPaths)
      ? profile.sourceAssetPaths.filter((value): value is string => typeof value === "string")
      : undefined,
    propertyNames: Array.isArray(profile.propertyNames)
      ? profile.propertyNames.filter((value): value is string => typeof value === "string")
      : undefined,
    evidence: stringValue(profile.evidence),
  };
}

function profileFromVariant(variant: UnknownRecord | null) {
  if (!variant) return null;
  const candidate =
    record(variant.overheat) ??
    record(variant.overheatProfile) ??
    record(record(variant.mechanics)?.overheat);
  return candidate ? canonicalProfile(candidate) : null;
}

function profileIdentity(profile: WeaponDpsOverheatProfile) {
  return JSON.stringify([
    profile.state,
    profile.heatPerShot,
    profile.temperatureMin,
    profile.temperatureMax,
    profile.coolingRatePerSecond,
    profile.triggerStep,
    profile.shutdownTemperature,
    profile.triggerAt,
    profile.unlockTemperature,
    profile.effectTriggerLower,
    profile.effectTriggerUpper,
  ]);
}

function overheatForBinding(
  binding: UnknownRecord,
  variantsById: Map<string, UnknownRecord>,
) {
  const directProfile = canonicalProfile(record(binding.overheat) ?? {});
  if (directProfile) return directProfile;
  const variantIds = Array.isArray(binding.weaponVariantIds)
    ? binding.weaponVariantIds.filter((value): value is string => typeof value === "string")
    : [];
  const profiles = variantIds
    .map((variantId) => profileFromVariant(variantsById.get(variantId) ?? null))
    .filter((profile): profile is WeaponDpsOverheatProfile => profile !== null);
  const uniqueProfiles = new Map(profiles.map((profile) => [profileIdentity(profile), profile]));
  // A binding may point at several delivery variants. If their thermal facts
  // disagree, the adapter deliberately returns no profile rather than taking
  // the first one and creating a false comparison.
  return uniqueProfiles.size === 1 ? [...uniqueProfiles.values()][0] : null;
}

function evidenceNumber(value: unknown) {
  return numberValue(record(value)?.value) ?? numberValue(value);
}

function runtimeDamagePerShot(profile: UnknownRecord) {
  const ballistics = record(profile.ballisticsModel);
  const weapons = Array.isArray(ballistics?.weapons)
    ? ballistics.weapons
    : [];
  const weaponIndex = Math.max(
    0,
    Math.floor(nonNegative(profile.ballisticsWeaponIndex) ?? 0),
  );
  const weapon = record(weapons[weaponIndex]);
  const projectiles = Array.isArray(ballistics?.projectiles)
    ? ballistics.projectiles
    : [];
  const projectileIndex = Math.max(
    0,
    Math.floor(evidenceNumber(weapon?.projectileIndex) ?? 0),
  );
  const projectile = record(projectiles[projectileIndex]);
  const maxDamage = evidenceNumber(weapon?.maxDamage);
  const impactDamage = evidenceNumber(projectile?.impactDamage);
  return positive(maxDamage) ?? positive(impactDamage) ??
    nonNegative(maxDamage) ?? nonNegative(impactDamage);
}

/**
 * Builds the timing fact for one exact vehicle loadout from its already-loaded
 * runtime slice. This keeps the normal 3D hit path on the per-vehicle query;
 * the full weapon catalog remains reserved for an explicitly opened global
 * source selector.
 */
export function weaponDpsWeaponsFromVehicleRuntimeDocument(
  document: WeaponDpsCatalogDocument,
  sourceRawName: string,
): WeaponDpsCatalogResult {
  const source = record(document.source);
  const sourceCardId = stringValue(source?.cardId);
  const loadouts = Array.isArray(document.loadouts) ? document.loadouts : [];
  const loadout = loadouts
    .map((value) => record(value))
    .find((candidate) => stringValue(candidate?.rawName) === sourceRawName);
  const profiles = Array.isArray(document.weaponProfiles)
    ? document.weaponProfiles
    : [];
  const profilesById = new Map(
    profiles
      .map((value) => record(value))
      .filter((value): value is UnknownRecord => value !== null)
      .map((profile) => [stringValue(profile.weaponProfileId), profile] as const)
      .filter((entry): entry is [string, UnknownRecord] => entry[0] !== null),
  );
  const stationEquipment = Array.isArray(loadout?.stationEquipment)
    ? loadout.stationEquipment
    : [];
  const equipmentById = new Map(
    stationEquipment
      .map((value) => record(value))
      .filter((value): value is UnknownRecord => value !== null)
      .map((equipment) => [stringValue(equipment.id), equipment] as const)
      .filter((entry): entry is [string, UnknownRecord] => entry[0] !== null),
  );
  const assignments = Array.isArray(loadout?.weapons) ? loadout.weapons : [];
  const weapons: WeaponDpsWeapon[] = [];
  let overheatProfileCount = 0;
  for (const value of assignments) {
    const assignment = record(value);
    const equipmentId = stringValue(assignment?.stationEquipmentId);
    const profileId = stringValue(assignment?.weaponProfileId);
    const variantId = stringValue(assignment?.selectorVariantId);
    const equipment = equipmentId ? equipmentById.get(equipmentId) : null;
    const profile = profileId ? profilesById.get(profileId) : null;
    const operation = record(equipment?.operation);
    if (
      !assignment ||
      !equipmentId ||
      !variantId ||
      !equipment ||
      !profile ||
      !operation
    ) continue;
    const interval = positive(operation.timeBetweenShotsSeconds) ??
      (positive(operation.roundsPerMinute)
        ? 60 / (operation.roundsPerMinute as number)
        : null);
    const selectorVariant = record(profile.selectorVariant);
    const overheat = profileFromVariant(selectorVariant);
    if (overheat) overheatProfileCount += 1;
    weapons.push({
      id: equipmentId,
      assignmentId: equipmentId,
      label:
        stringValue(equipment.displayName) ??
        stringValue(profile.displayName) ??
        stringValue(equipment.gunName) ??
        equipmentId,
      sourceLabel: [sourceCardId, sourceRawName].filter(Boolean).join(" · "),
      sourceCardId,
      sourceRawName,
      variantIds: [variantId],
      damagePerShot: runtimeDamagePerShot(profile),
      timeBetweenShotsSeconds: interval,
      magazineSize: positive(operation.magazineSize),
      totalRounds: totalRounds(
        operation.numberOfMags,
        operation.magazineSize,
      ),
      tacticalReloadSeconds: positive(operation.tacticalReloadSeconds),
      dryReloadSeconds: positive(operation.dryReloadSeconds),
      overheat,
    });
  }
  return {
    weapons,
    sourceRevision:
      stringValue(document.sourceBuildId) ??
      stringValue(document.dataRevision) ??
      stringValue(document.generatedAtUtc) ??
      weapons.find((weapon) => weapon.overheat?.sourceBuildId)?.overheat
        ?.sourceBuildId ??
      null,
    overheatProfileCount,
  };
}

export function weaponDpsWeaponsFromWikiDocument(
  document: WeaponDpsCatalogDocument,
): WeaponDpsCatalogResult {
  const selector = record(document.selector);
  const selectorVariants: unknown[] = Array.isArray(selector?.variants)
    ? selector.variants
    : [];
  const variantsById = new Map(
    selectorVariants
      .map((value) => record(value))
      .filter((value): value is UnknownRecord => value !== null)
      .map((variant) => [stringValue(variant.id), variant] as const)
      .filter((entry): entry is [string, UnknownRecord] => entry[0] !== null),
  );
  const relations = record(document.relations);
  const bindings: unknown[] = Array.isArray(relations?.vehicleEquipmentBindings)
    ? relations.vehicleEquipmentBindings
    : [];
  const weapons: WeaponDpsWeapon[] = [];
  const assignmentIds = new Set<string>();
  let overheatProfileCount = 0;
  for (const value of bindings) {
    const binding = record(value);
    const equipment = record(binding?.equipment);
    const assignmentId = stringValue(binding?.id);
    const cardId = stringValue(binding?.cardId);
    const rawName = stringValue(binding?.rawName);
    if (!binding || !equipment || !assignmentId) continue;
    const mechanics = record(equipment.mechanics);
    const projectile = record(equipment.projectile);
    const interval = positive(mechanics?.timeBetweenShotsSeconds)
      ?? (positive(equipment.roundsPerMinute)
        ? 60 / (equipment.roundsPerMinute as number)
        : null);
    const profile = overheatForBinding(binding, variantsById);
    if (profile) overheatProfileCount += 1;
    assignmentIds.add(assignmentId);
    weapons.push({
      id: assignmentId,
      assignmentId,
      label: stringValue(equipment.displayName) ?? stringValue(equipment.gunName) ?? assignmentId,
      sourceLabel: [cardId, rawName].filter(Boolean).join(" · ") || "Wiki 武器绑定",
      sourceCardId: cardId,
      sourceRawName: rawName,
      variantIds: Array.isArray(binding.weaponVariantIds)
        ? binding.weaponVariantIds.filter((value): value is string => typeof value === "string")
        : [],
      damagePerShot:
        positive(equipment.maxDamageToApply) ??
        positive(projectile?.impactDamage) ??
        nonNegative(equipment.maxDamageToApply),
      timeBetweenShotsSeconds: interval,
      magazineSize: positive(equipment.magSize),
      totalRounds: totalRounds(equipment.numberOfMags, equipment.magSize),
      tacticalReloadSeconds: positive(equipment.tacticalReloadDurationSeconds),
      dryReloadSeconds: positive(equipment.dryReloadDurationSeconds),
      overheat: profile,
    });
  }

  // Infantry and other non-vehicle delivery records carry the same cadence
  // facts under wiki.configurations.weaponInfo rather than a vehicle binding.
  // Keep those as their own exact configuration assignments; never merge them
  // into a vehicle binding just because the display name is shared.
  const configurations = Array.isArray(record(document.wiki)?.configurations)
    ? record(document.wiki)?.configurations as unknown[]
    : [];
  for (const value of configurations) {
    const configuration = record(value);
    const weaponKey = stringValue(configuration?.weaponKey);
    const weaponInfo = record(configuration?.weaponInfo);
    const variant = weaponKey
      ? [...variantsById.values()].find((candidate) =>
          Array.isArray(candidate.configurationKeys) &&
          candidate.configurationKeys.includes(weaponKey) &&
          candidate.selectorVisibility === "shipping",
        ) ?? null
      : null;
    if (!configuration || !weaponKey || !weaponInfo || !variant) continue;
    const assignmentId = `wiki-config:${weaponKey}`;
    if (assignmentIds.has(assignmentId)) continue;
    const projectileInfo = record(weaponInfo.projectileInfo);
    const interval = positive(weaponInfo.timeBetweenShots)
      ?? (positive(weaponInfo.roundsPerMinute)
        ? 60 / (weaponInfo.roundsPerMinute as number)
        : null);
    const profile = profileFromVariant(variant);
    if (profile) overheatProfileCount += 1;
    assignmentIds.add(assignmentId);
    weapons.push({
      id: assignmentId,
      assignmentId,
      label: stringValue(configuration.displayName) ?? weaponKey,
      sourceLabel: Array.isArray(configuration.factions)
        ? configuration.factions.filter((faction): faction is string => typeof faction === "string").join(" · ") || "Wiki 配置"
        : "Wiki 配置",
      sourceCardId: null,
      sourceRawName: weaponKey,
      variantIds: [variant.id as string],
      damagePerShot:
        positive(weaponInfo.maxDamageToApply) ??
        positive(projectileInfo?.impactDamage) ??
        nonNegative(weaponInfo.maxDamageToApply),
      timeBetweenShotsSeconds: interval,
      magazineSize: positive(weaponInfo.magSize),
      totalRounds: totalRounds(weaponInfo.numberOfMags, weaponInfo.magSize),
      tacticalReloadSeconds: positive(weaponInfo.tacticalReloadDuration),
      dryReloadSeconds: positive(weaponInfo.dryReloadDuration),
      overheat: profile,
    });
  }
  weapons.sort((left, right) =>
    left.label.localeCompare(right.label, "zh-CN", { numeric: true }) ||
    left.sourceLabel.localeCompare(right.sourceLabel, "en") ||
    left.assignmentId.localeCompare(right.assignmentId, "en"),
  );
  return {
    weapons,
    sourceRevision:
      stringValue(document.sourceBuildId) ??
      stringValue(document.dataRevision) ??
      stringValue(document.generatedAtUtc) ??
      weapons.find((weapon) => weapon.overheat?.sourceBuildId)?.overheat?.sourceBuildId ??
      null,
    overheatProfileCount,
  };
}
