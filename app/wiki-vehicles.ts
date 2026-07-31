import wikiVehiclesJson from "../generated/wiki-vehicles.json";

export interface WikiVehicleEntry {
  catalogBindingRef: string;
  vehicleRef: string;
  runtimeVehicleRef: string;
  cardId: string;
  factionId: string;
  rawName: string;
  displayName: string;
  icon: string;
  factions: string[];
  type: string;
  vehicleTags: string[];
  amphibious: boolean;
  weaponVariantIds: string[];
}

interface WikiVehiclePayload {
  schemaVersion: "sigua-wiki-vehicles/v3";
  vehicleCatalogRevision: string;
  weaponCatalogRevision: string;
  summary: {
    catalogVariants: number;
    sourceVehicles: number;
    runtimeVehicles: number;
    weaponVariantReferences: number;
    armedVariants: number;
  };
  items: WikiVehicleEntry[];
}

const payload = wikiVehiclesJson as unknown as WikiVehiclePayload;

if (payload.schemaVersion !== "sigua-wiki-vehicles/v3") {
  throw new Error("Unsupported Wiki vehicle metadata schema");
}

export const wikiVehicleEntries = payload.items;
export const wikiVehicleByVariant = new Map(
  wikiVehicleEntries.map((entry) => [`${entry.cardId}\u0000${entry.rawName}`, entry]),
);
export const wikiVehicleSummary = payload.summary;

export function wikiVehicleForVariant(cardId: string, rawName: string) {
  return wikiVehicleByVariant.get(`${cardId}\u0000${rawName}`) ?? null;
}

export function wikiVehiclesForCard(cardId: string) {
  return wikiVehicleEntries.filter((entry) => entry.cardId === cardId);
}
