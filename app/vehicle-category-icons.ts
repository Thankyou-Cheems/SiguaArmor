import categoryIconConfig from "../config/vehicle-category-icons.json" with { type: "json" };

const SOURCE_ICON_TO_ASSET: Record<string, string> = {
  map_antiair: "antiair",
  map_apc: "apc",
  map_attackhelo: "attackhelo",
  map_boat: "boat",
  map_handhelddrone: "handhelddrone",
  map_ifv: "ifv",
  map_jeep: "jeep",
  map_jeep_antitank: "jeep_antitank",
  map_jeep_artillery: "jeep_artillery",
  map_jeep_logistics: "jeep_logistics",
  map_jeep_transport: "jeep_transport",
  map_jeep_turret: "jeep_turret",
  map_jet_a10: "jet_a10",
  map_jet_su25: "jet_su25",
  map_jet_tornado: "jet_tornado",
  map_motorcycle: "motorcycle",
  map_tank: "tank",
  map_trackedapc: "trackedapc",
  map_trackedifv: "trackedifv",
  map_trackedjeep: "trackedjeep",
  map_transporthelo: "transporthelo",
  map_truck_antiair: "truck_antiair",
  map_truck_logistics: "truck_logistics",
  map_truck_transport: "truck_transport",
  map_truck_transport_armed: "truck_transport_armed",
  map_uav: "uav",
  T_map_apc_open_turret: "apc",
  T_map_boat_openturret: "boat",
  T_map_boat_logistics: "boat",
  T_map_helicopter_lightcas: "helicopter_lightcas",
  T_map_helicopter_scout: "helicopter_scout",
  T_map_jeep_antiair: "SPAA_Car",
  T_map_mgs: "mgs",
  T_map_trackedapc_artillery: "SPA_Tracked",
  T_map_trackedapc_logistics: "trackedapc_logistics",
  T_map_trackedapc_msv: "trackedapc_msv",
  T_map_trackedapc_noturret: "trackedapc_noturret",
  T_map_trackedrecon: "trackedifv",
  T_map_truck_artillery: "SPA_Truck",
  T_map_wheeledrecon: "ifv",
};
const DIRECT_ASSET_NAMES = new Set(Object.values(SOURCE_ICON_TO_ASSET));

const CATEGORY_ICON_BY_PROMO_ENTRY = categoryIconConfig.promoEntryIcons as Record<string, string>;
const CATEGORY_ICON_BY_CARD_ID =
  (categoryIconConfig.variantIconsByCardId as Record<string, string> | undefined) ?? {};

export function resolveVehicleCategoryIconAsset(iconId: string) {
  const assetName = SOURCE_ICON_TO_ASSET[iconId] ?? iconId;
  if (!DIRECT_ASSET_NAMES.has(assetName)) {
    throw new Error(`Unknown vehicle category icon: ${iconId}`);
  }
  return assetName;
}

export function resolveCatalogVehicleCategoryIconAsset({
  cardId,
  promoEntryId,
  vehicleType,
}: {
  cardId: string;
  promoEntryId: string;
  vehicleType: string;
}) {
  const iconId =
    CATEGORY_ICON_BY_CARD_ID[cardId] ?? CATEGORY_ICON_BY_PROMO_ENTRY[promoEntryId];
  if (!iconId) return null;
  return resolveVehicleCategoryIconAsset(iconId);
}
