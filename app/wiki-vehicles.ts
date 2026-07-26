import wikiVehiclesJson from "../generated/wiki-vehicles.json";

export interface WikiVehicleWeapon {
  gunName: string;
  displayName: string;
  turretName: string | null;
  projectileName: string | null;
  muzzleVelocityMps: number | null;
  armorPenetrationMm: number | null;
}

export interface WikiVehicleEntry {
  cardId: string;
  factionId: string;
  rawName: string;
  catalogLabel: string;
  catalogDisplayName: string;
  displayName: string;
  details: string;
  icon: string;
  factions: string[];
  type: string;
  vehicleTags: string[];
  spawnerSize: string | null;
  respawnTime: number | null;
  ticketValue: number | null;
  amphibious: boolean;
  vehicleHealth: number | null;
  repairToolLimit: number | null;
  weapons: WikiVehicleWeapon[];
}

interface WikiVehiclePayload {
  schemaVersion: "sigua-wiki-vehicles/v1";
  summary: {
    catalogVariants: number;
    sourceVehicles: number;
  };
  items: WikiVehicleEntry[];
}

const payload = wikiVehiclesJson as unknown as WikiVehiclePayload;

if (payload.schemaVersion !== "sigua-wiki-vehicles/v1") {
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
