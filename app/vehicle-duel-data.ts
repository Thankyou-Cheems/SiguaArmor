import {
  createVehicleDuelDataLoader,
  type VehicleDuelBundle,
  type VehicleDuelOption,
} from "../lib/vehicle-duel-data-cache.ts";
import { loadWikiVehicleWeaponRuntimeSource } from "../lib/wiki-source.ts";
import { loadPublicCatalog } from "./catalog-bootstrap.ts";
import { runtimePreviewForCatalogBinding } from "./runtime-probe-preview-data.ts";
import {
  createRuntimeAttackSourceLibrary,
  type WikiWeaponRuntimeSourceDocument,
} from "./runtime-wiki-attack-source.ts";

export type {
  VehicleDuelBundle,
  VehicleDuelOption,
} from "../lib/vehicle-duel-data-cache.ts";

async function loadProductionVehicleDuelBundle(
  option: VehicleDuelOption,
): Promise<VehicleDuelBundle> {
  const [preview, weaponValue] = await Promise.all([
    runtimePreviewForCatalogBinding(
      option.cardId,
      option.rawName,
      option.runtimeVehicleRef,
      option.visualArtifactRef,
      option.siteEdition,
    ),
    loadWikiVehicleWeaponRuntimeSource(option.cardId),
  ]);
  const attackLibrary = createRuntimeAttackSourceLibrary(
    weaponValue as WikiWeaponRuntimeSourceDocument,
    option.attackSourcePresentation,
  );
  if (!attackLibrary.runtimeAttackSourceForId(option.attackSourceId)) {
    throw new Error(`载具武器配置与 ${option.displayName} 不匹配`);
  }
  return { option, preview, attackLibrary };
}

export const vehicleDuelData = createVehicleDuelDataLoader({
  loadCatalog: loadPublicCatalog,
  loadVehicle: loadProductionVehicleDuelBundle,
});
