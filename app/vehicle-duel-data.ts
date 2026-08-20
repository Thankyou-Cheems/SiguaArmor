import {
  createVehicleDuelDataLoader,
  type VehicleDuelBundle,
  type VehicleDuelOption,
} from "../lib/vehicle-duel-data-cache.ts";
import {
  loadWikiVehicleFactionMechanics,
  loadWikiVehicleWeaponRuntimeSource,
} from "../lib/wiki-source.ts";
import { loadPublicCatalog } from "./catalog-bootstrap.ts";
import { runtimePreviewForCatalogBinding } from "./runtime-probe-preview-data.ts";
import {
  createRuntimeAttackSourceLibrary,
  type WikiWeaponRuntimeSourceDocument,
} from "./runtime-wiki-attack-source.ts";
import { referenceDataForWikiVehicleBinding } from "./wiki-vehicle-catalog.ts";

export type {
  VehicleDuelBundle,
  VehicleDuelOption,
} from "../lib/vehicle-duel-data-cache.ts";

async function loadProductionVehicleDuelBundle(
  option: VehicleDuelOption,
): Promise<VehicleDuelBundle> {
  const [preview, weaponValue, mechanics] = await Promise.all([
    runtimePreviewForCatalogBinding(
      option.cardId,
      option.rawName,
      option.runtimeVehicleRef,
      option.visualArtifactRef,
      option.siteEdition,
    ),
    loadWikiVehicleWeaponRuntimeSource(option.cardId),
    loadWikiVehicleFactionMechanics(option.wikiFactionId),
  ]);
  const attackLibrary = createRuntimeAttackSourceLibrary(
    weaponValue as WikiWeaponRuntimeSourceDocument,
    option.attackSourcePresentation,
  );
  if (!attackLibrary.runtimeAttackSourceForId(option.attackSourceId)) {
    throw new Error(`载具武器配置与 ${option.displayName} 不匹配`);
  }
  const referenceData = referenceDataForWikiVehicleBinding(
    mechanics,
    option.wikiSourceCardId,
    option.rawName,
  );
  return { option, preview, referenceData, attackLibrary };
}

export const vehicleDuelData = createVehicleDuelDataLoader({
  loadCatalog: loadPublicCatalog,
  loadVehicle: loadProductionVehicleDuelBundle,
});
