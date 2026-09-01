import { editorNativeDamageWeaponIndices, type EditorNativeModel } from "../lib/editor-native-hit-model.ts";
import { buildRuntimeAttackSourceShareSlug } from "../lib/runtime-attack-source-share.mjs";
import type { RuntimeExplosiveCategory } from "../lib/runtime-explosive-catalog.ts";
import { weaponNameZh } from "../lib/weapon-display-name.ts";
import type { WeaponCatalogVariant } from "../lib/weapon-catalog.ts";
import type {
  RuntimeAttackSource,
  RuntimeAttackSourceWeapon,
} from "./runtime-probe-weapon-labels.ts";

export interface WikiWeaponRuntimeSourceDocument {
  schemaVersion: "sigua-weapon-runtime-source/v2";
  source: {
    kind: "vehicle";
    cardId: string;
    rawNames: string[];
    factionIds: string[];
    displayNames: string[];
    types: string[];
  };
  weaponProfiles: Array<{
    weaponProfileId: string;
    weaponId: string;
    runtimeAssetPath: string | null;
    gunName: string;
    displayName: string;
    projectileName: string | null;
    matchBasis: string;
    ballisticsId: string;
    ballisticsWeaponIndex: 0;
    ballisticsModel: EditorNativeModel;
    directFireRoute: boolean;
    explosiveCategory: string | null;
    explosiveCategoryLabel: string | null;
    explosiveLayerOrderEvidence: string | null;
    explosiveLayerCount: number | null;
    selectorVariant: WeaponCatalogVariant;
  }>;
  loadouts: Array<{
    loadoutId: string;
    rawName: string;
    factionId: string;
    runtimeVehicleRef: string | null;
    stationEquipment: Array<{
      id: string;
      rawName: string;
      sourceIndex: number;
      gunName: string;
      displayName: string;
      turretName: string | null;
      operation: {
        numberOfMags: number;
        magazineSize: number;
        tacticalReloadSeconds: number;
        dryReloadSeconds: number;
        roundsPerMinute: number;
        timeBetweenShotsSeconds: number;
      };
    }>;
    weapons: Array<{
      weaponAssignmentId: string;
      stationEquipmentId: string;
      sourceIndex: number;
      turretName: string | null;
      weaponProfileId: string;
      selectorVariantId: string;
    }>;
  }>;
}

export interface WikiWeaponRuntimeIndexEntry {
  cardId: string;
  rawNames: string[];
  factionIds: string[];
  displayNames: string[];
  types: string[];
  loadoutCount: number;
  weaponProfileCount: number;
  weaponAssignmentCount: number;
  pathname: string;
}

export interface WikiWeaponRuntimeIndexDocument {
  schemaVersion: "sigua-weapon-runtime-index/v2";
  vehicleSources: WikiWeaponRuntimeIndexEntry[];
}

export interface RuntimeAttackSourcePresentation {
  cardId: string;
  displayName: string;
  groupId: string;
  groupName: string;
  groupOrder: number;
  type: string;
  canonicalRawName: string;
}

export interface RuntimeAttackSourceLibrary {
  runtimeAttackSources: readonly RuntimeAttackSource[];
  runtimeAttackSourceForId(id: string): RuntimeAttackSource | null;
  runtimeAttackWeaponSupportsHitAnalysis(weapon: RuntimeAttackSourceWeapon): boolean;
}

export interface RuntimeStationEquipmentBinding {
  equipment: {
    gunName: string;
    displayName: string;
    turretName: string | null;
  };
  operation: {
    numberOfMags: number;
    magazineSize: number;
    tacticalReloadSeconds: number;
    dryReloadSeconds: number;
    roundsPerMinute: number;
    timeBetweenShotsSeconds: number;
  };
}

export type RuntimeStationEquipmentResolver = (
  bindingId: string,
) => RuntimeStationEquipmentBinding | null;

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

function safeShareSlug(groupId: string, rawName: string) {
  try {
    return buildRuntimeAttackSourceShareSlug({
      groupId,
      canonicalRawName: rawName,
    });
  } catch {
    return "";
  }
}

export function resolveRuntimeAttackSourceIndexEntry(
  document: WikiWeaponRuntimeIndexDocument,
  id: string,
): {
  entry: WikiWeaponRuntimeIndexEntry;
  presentation: RuntimeAttackSourcePresentation;
} | null {
  if (document.schemaVersion !== "sigua-weapon-runtime-index/v2") return null;
  for (const entry of document.vehicleSources) {
    if (entry.cardId === id) {
      const canonicalRawName = entry.rawNames.length === 1 ? entry.rawNames[0] : null;
      const groupId = entry.factionIds[0];
      if (!canonicalRawName || !groupId) return null;
      return {
        entry,
        presentation: {
          cardId: entry.cardId,
          displayName: entry.displayNames[0] ?? canonicalRawName,
          groupId,
          groupName: groupId,
          groupOrder: Number.MAX_SAFE_INTEGER,
          type: entry.types[0] ?? "载具",
          canonicalRawName,
        },
      };
    }
    for (const groupId of entry.factionIds) {
      for (const canonicalRawName of entry.rawNames) {
        if (safeShareSlug(groupId, canonicalRawName) !== id) continue;
        return {
          entry,
          presentation: {
            cardId: entry.cardId,
            displayName: entry.displayNames[0] ?? canonicalRawName,
            groupId,
            groupName: groupId,
            groupOrder: Number.MAX_SAFE_INTEGER,
            type: entry.types[0] ?? "载具",
            canonicalRawName,
          },
        };
      }
    }
  }
  return null;
}

export function createRuntimeAttackSourceLibrary(
  document: WikiWeaponRuntimeSourceDocument,
  presentation: RuntimeAttackSourcePresentation,
): RuntimeAttackSourceLibrary {
  if (
    document.schemaVersion !== "sigua-weapon-runtime-source/v2" ||
    document.source.kind !== "vehicle" ||
    document.source.cardId !== presentation.cardId ||
    document.loadouts.length === 0
  ) {
    throw new Error(`载具武器分片与 ${presentation.cardId} 不匹配`);
  }
  const canonicalRawName = presentation.canonicalRawName;
  const loadout = document.loadouts.find(({ rawName }) => rawName === canonicalRawName);
  if (!loadout) throw new Error(`载具武器分片 ${presentation.cardId} 缺少精确配置 ${canonicalRawName}`);
  const profiles = new Map(document.weaponProfiles.map((profile) => [profile.weaponProfileId, profile]));
  const shareSlug = buildRuntimeAttackSourceShareSlug({
    groupId: presentation.groupId,
    canonicalRawName,
  });
  const weapons = loadout.weapons.map(
    (assignment, weaponIndex): RuntimeAttackSourceWeapon => {
      const weapon = profiles.get(assignment.weaponProfileId);
      if (!weapon) throw new Error(`载具武器分片缺少配置 ${assignment.weaponProfileId}`);
      if (weapon.selectorVariant.id !== assignment.selectorVariantId) {
        throw new Error(`载具武器分片选择器身份不匹配：${assignment.weaponAssignmentId}`);
      }
      return ({
      weaponIndex,
      weaponAssignmentId: assignment.weaponAssignmentId,
      stationEquipmentId: assignment.stationEquipmentId,
      weaponId: weapon.weaponId,
      runtimeAssetPath: weapon.runtimeAssetPath,
      gunName: weapon.gunName,
      displayName: weapon.displayName,
      projectileName: weapon.projectileName,
      matchBasis: weapon.matchBasis,
      ballisticsId: weapon.ballisticsId,
      ballisticsWeaponIndex: weapon.ballisticsWeaponIndex,
      ballisticsModel: weapon.ballisticsModel,
      ballisticsSource: { kind: "encyclopedia-weapon-closure" },
      sourceCardId: presentation.cardId,
      sourceRawName: canonicalRawName,
      displayNameZh: weaponNameZh(weapon.selectorVariant.displayLabel),
      displayNameEnglish: weapon.selectorVariant.label,
      sourceKind: "vehicle",
      selectorVariant: weapon.selectorVariant,
      explosiveCategory:
        (weapon.explosiveCategory as RuntimeExplosiveCategory | null) ?? undefined,
      explosiveCategoryLabel: weapon.explosiveCategoryLabel ?? undefined,
      explosiveLayerOrderEvidence:
        weapon.explosiveLayerOrderEvidence ?? undefined,
      explosiveLayerOrderClosed:
        weapon.explosiveLayerOrderEvidence === null
          ? undefined
          : !weapon.explosiveLayerOrderEvidence.includes("unknown"),
      explosiveLayerCount: weapon.explosiveLayerCount ?? undefined,
      directFireRoute: weapon.directFireRoute,
      searchAliases: uniqueSorted([
        weapon.selectorVariant.searchText,
        ...weapon.selectorVariant.sourceLabels,
      ]),
      });
    },
  );
  const source: RuntimeAttackSource = {
    cardId: presentation.cardId,
    cardIds: [presentation.cardId],
    shareSlug,
    sourceKind: "vehicle",
    sourceCategory: "vehicle",
    displayName: presentation.displayName,
    groupId: presentation.groupId,
    groupName: presentation.groupName,
    groupOrder: presentation.groupOrder,
    type: presentation.type,
    types: uniqueSorted([presentation.type, ...document.source.types]),
    canonicalRawName,
    variantRawNames: [canonicalRawName],
    catalogCompletedWeaponCount: weapons.length,
    weapons,
  };
  const sourceIds = new Set([
    source.cardId,
    source.shareSlug,
    ...source.cardIds,
  ]);
  return {
    runtimeAttackSources: [source],
    runtimeAttackSourceForId(id) {
      return sourceIds.has(id) ? source : null;
    },
    runtimeAttackWeaponSupportsHitAnalysis(weapon) {
      return editorNativeDamageWeaponIndices(weapon.ballisticsModel).includes(
        weapon.ballisticsWeaponIndex,
      );
    },
  };
}

export function createRuntimeStationEquipmentResolver(
  document: WikiWeaponRuntimeSourceDocument,
): RuntimeStationEquipmentResolver {
  const bindings = new Map(
    document.loadouts.flatMap(({ stationEquipment }) => stationEquipment).map((equipment) => [
      equipment.id,
      {
        equipment: {
          gunName: equipment.gunName,
          displayName: equipment.displayName,
          turretName: equipment.turretName,
        },
        operation: equipment.operation,
      },
    ]),
  );
  return (bindingId) => bindings.get(bindingId) ?? null;
}
