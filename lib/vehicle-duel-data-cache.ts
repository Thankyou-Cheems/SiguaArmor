import { buildRuntimeAttackSourceShareSlug } from "./runtime-attack-source-share.mjs";
import { wikiVehicleFactionId } from "./wiki-vehicle-identity.ts";
import type { PublicCatalogIndex } from "../app/catalog-types.ts";
import type { ReferenceData } from "../app/catalog-types.ts";
import type { RuntimeVehiclePreview } from "../app/runtime-probe-preview-data.ts";
import type { SiteEdition } from "../app/site-edition.ts";
import type {
  RuntimeAttackSourceLibrary,
  RuntimeAttackSourcePresentation,
} from "../app/runtime-wiki-attack-source.ts";

export interface VehicleDuelOption {
  id: string;
  siteEdition: SiteEdition;
  cardId: string;
  wikiSourceCardId: string;
  wikiFactionId: string;
  rawName: string;
  displayName: string;
  factionName: string;
  typeName: string;
  runtimeVehicleRef: string;
  visualArtifactRef: string;
  attackSourceId: string;
  attackSourcePresentation: RuntimeAttackSourcePresentation;
}

export interface VehicleDuelBundle {
  option: VehicleDuelOption;
  preview: RuntimeVehiclePreview;
  referenceData: ReferenceData;
  attackLibrary: RuntimeAttackSourceLibrary;
}

interface VehicleDuelDataDependencies {
  loadCatalog(siteEdition: SiteEdition): Promise<PublicCatalogIndex>;
  loadVehicle(option: VehicleDuelOption): Promise<VehicleDuelBundle>;
}

export function vehicleDuelOptionsFromCatalog(
  catalog: PublicCatalogIndex,
  siteEdition: SiteEdition,
): VehicleDuelOption[] {
  return catalog.records.flatMap((record): VehicleDuelOption[] => {
    const variant = record.variants.find(
      ({ cardId }) => cardId === record.defaultCardId,
    ) ?? record.variants.find(
      ({ sourceRawName }) => sourceRawName === record.selectedRawName,
    ) ?? record.variants[0];
    if (
      !variant?.sourceRawName ||
      !variant.runtimeVehicleRef ||
      !variant.visualArtifactRef
    ) return [];
    const wikiSourceCardId = record.wikiSourceCardId ?? record.promoEntryId;
    const attackSourceId = buildRuntimeAttackSourceShareSlug({
      groupId: record.official.groupId,
      canonicalRawName: variant.sourceRawName,
    });
    const displayName =
      record.selectedDisplayName ||
      variant.displayName ||
      record.official.nameZh;
    const attackSourcePresentation: RuntimeAttackSourcePresentation = {
      cardId: record.promoEntryId,
      displayName,
      groupId: record.official.groupId,
      groupName: record.official.groupNameZh,
      groupOrder: record.promotionOrder,
      type: record.official.typeZh,
      canonicalRawName: variant.sourceRawName,
    };
    return [{
      id: `${siteEdition}:${record.promoEntryId}:${variant.sourceRawName}`,
      siteEdition,
      cardId: record.promoEntryId,
      wikiSourceCardId,
      wikiFactionId: wikiVehicleFactionId(wikiSourceCardId),
      rawName: variant.sourceRawName,
      displayName,
      factionName: record.official.groupNameZh,
      typeName: record.official.typeNameZh,
      runtimeVehicleRef: variant.runtimeVehicleRef,
      visualArtifactRef: variant.visualArtifactRef,
      attackSourceId,
      attackSourcePresentation,
    }];
  }).sort(
    (left, right) =>
      left.factionName.localeCompare(right.factionName, "zh-CN") ||
      left.displayName.localeCompare(right.displayName, "zh-CN", {
        numeric: true,
      }) ||
      left.id.localeCompare(right.id, "en"),
  );
}

export function createVehicleDuelDataLoader(
  dependencies: VehicleDuelDataDependencies,
) {
  const catalogRequests = new Map<SiteEdition, Promise<VehicleDuelOption[]>>();
  const vehicleRequests = new Map<string, Promise<VehicleDuelBundle>>();
  return {
    loadCatalog(siteEdition: SiteEdition) {
      const cached = catalogRequests.get(siteEdition);
      if (cached) return cached;
      const request = dependencies.loadCatalog(siteEdition)
        .then((catalog) => vehicleDuelOptionsFromCatalog(catalog, siteEdition))
        .catch((error) => {
          if (catalogRequests.get(siteEdition) === request) {
            catalogRequests.delete(siteEdition);
          }
          throw error;
        });
      catalogRequests.set(siteEdition, request);
      return request;
    },
    loadVehicle(option: VehicleDuelOption) {
      const cached = vehicleRequests.get(option.id);
      if (cached) return cached;
      const request = dependencies.loadVehicle(option).catch((error) => {
        if (vehicleRequests.get(option.id) === request) {
          vehicleRequests.delete(option.id);
        }
        throw error;
      });
      vehicleRequests.set(option.id, request);
      return request;
    },
  };
}
