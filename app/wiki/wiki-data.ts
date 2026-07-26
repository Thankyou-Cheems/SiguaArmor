import factionPayload from "../../generated/wiki-factions.json";
import weaponPayload from "../../generated/wiki-weapons.json";

import { factionDisplayName } from "../faction-display-name";

export interface WikiFaction {
  code: string;
  imagePath: string;
  name: string;
  order: number;
  setupCount: number;
}

export interface WikiWeapon {
  displayName: string;
  factions?: string[];
  fullName: string;
  imagePath: string;
  order: number;
  type: string;
  variantCount: number;
  weaponKeys?: string[];
}

export type WikiJsonValue =
  | boolean
  | number
  | string
  | null
  | WikiJsonValue[]
  | { [key: string]: WikiJsonValue };

export type WikiJsonObject = { [key: string]: WikiJsonValue };

export type WikiWeaponConfiguration = WikiJsonObject & {
  displayName: string;
  factions: string[];
  weaponKey: string;
};

export type WikiWeaponTemplate = WikiJsonObject & {
  weaponKey: string;
};

interface WikiFactionPayload {
  schemaVersion: "sigua-wiki-factions/v1";
  items: WikiFaction[];
}

interface WikiWeaponPayload {
  schemaVersion: "sigua-wiki-weapons/v2";
  dataRevision: string;
  summary: {
    configurations: number;
    damageCurves: number;
    groups: number;
    templates: number;
  };
  items: WikiWeapon[];
  configurations: WikiWeaponConfiguration[];
  templates: WikiWeaponTemplate[];
  damageCurves: Record<string, WikiJsonValue>;
}

const factions = factionPayload as unknown as WikiFactionPayload;
const weapons = weaponPayload as unknown as WikiWeaponPayload;

if (factions.schemaVersion !== "sigua-wiki-factions/v1") {
  throw new Error("Unsupported Wiki faction metadata schema");
}
if (weapons.schemaVersion !== "sigua-wiki-weapons/v2") {
  throw new Error("Unsupported Wiki weapon metadata schema");
}

export const wikiFactions = factions.items;
export const wikiWeapons = weapons.items;
export const wikiWeaponConfigurations = weapons.configurations;
export const wikiWeaponTemplates = weapons.templates;
export const wikiWeaponDamageCurves = weapons.damageCurves;
export const wikiWeaponDataRevision = weapons.dataRevision;
export const wikiWeaponSummary = weapons.summary;
export const wikiWeaponConfigurationByKey = Object.fromEntries(
  wikiWeaponConfigurations.map((configuration) => [configuration.weaponKey, configuration]),
) as Record<string, WikiWeaponConfiguration>;

export const factionLabels: Record<string, string> = Object.fromEntries(
  [
    ...wikiFactions.map(({ code }) => [code, factionDisplayName(code)] as const),
    ...["OpFor", "USMC_Coop", "WPMC_CoOp"].map((code) => [code, factionDisplayName(code)] as const),
  ],
);

export const weaponFactionOptions = [
  ["ADF", factionDisplayName("ADF")],
  ["AFU", factionDisplayName("AFU")],
  ["BAF", factionDisplayName("BAF")],
  ["CAF", factionDisplayName("CAF")],
  ["CRF", factionDisplayName("CRF")],
  ["GFI", factionDisplayName("GFI")],
  ["IMF", factionDisplayName("IMF")],
  ["MEI", factionDisplayName("MEI")],
  ["OpFor", factionDisplayName("OpFor")],
  ["PLA", factionDisplayName("PLA")],
  ["PLAAGF", factionDisplayName("PLAAGF")],
  ["PLANMC", factionDisplayName("PLANMC")],
  ["RGF", factionDisplayName("RGF")],
  ["TLF", factionDisplayName("TLF")],
  ["USA", factionDisplayName("USA")],
  ["USMC", factionDisplayName("USMC")],
  ["USMC_Coop", factionDisplayName("USMC_Coop")],
  ["VDV", factionDisplayName("VDV")],
  ["WPMC", factionDisplayName("WPMC")],
  ["WPMC_CoOp", factionDisplayName("WPMC_CoOp")],
] as const;

export const weaponTypes = [
  "Binoculars",
  "Detonator",
  "Dmr",
  "Explosives",
  "Fielddressing",
  "Fraggrenade",
  "Grenadelauncher",
  "Knife",
  "Lat",
  "Machinegun",
  "Medkit",
  "Pistol",
  "Rally",
  "Repair",
  "Resupply",
  "Rifle",
  "Shovel",
  "Smokegrenade",
  "Unknown",
] as const;
