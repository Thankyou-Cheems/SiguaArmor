import factionPayload from "../../generated/wiki-factions.json";
import {
  weaponCatalogCurves,
  weaponCatalogSummary,
  weaponCatalogWikiConfigurations,
  weaponCatalogWikiFamilies,
  weaponCatalogWikiTemplates,
  type WeaponCatalogJsonObject,
  type WeaponCatalogJsonValue,
  type WeaponCatalogWikiConfiguration,
  type WeaponCatalogWikiFamily,
  type WeaponCatalogWikiTemplate,
} from "../../lib/wiki-weapon-catalog";

import { factionDisplayName } from "../faction-display-name";

export interface WikiFaction {
  code: string;
  imagePath: string;
  name: string;
  order: number;
  setupCount: number;
}

export type WikiWeapon = WeaponCatalogWikiFamily;

export type WikiJsonValue =
  WeaponCatalogJsonValue;

export type WikiJsonObject = WeaponCatalogJsonObject;

export type WikiWeaponConfiguration =
  WeaponCatalogWikiConfiguration;

export type WikiWeaponTemplate = WeaponCatalogWikiTemplate;

interface WikiFactionPayload {
  schemaVersion: "sigua-wiki-factions/v1";
  items: WikiFaction[];
}

const factions = factionPayload as unknown as WikiFactionPayload;

if (factions.schemaVersion !== "sigua-wiki-factions/v1") {
  throw new Error("Unsupported Wiki faction metadata schema");
}

export const wikiFactions = factions.items;
export const wikiWeapons = weaponCatalogWikiFamilies;
export const wikiWeaponConfigurations =
  weaponCatalogWikiConfigurations;
export const wikiWeaponTemplates = weaponCatalogWikiTemplates;
export const wikiWeaponDamageCurves = weaponCatalogCurves;
export const wikiWeaponDataRevision =
  weaponCatalogSummary.dataRevision;
export const wikiWeaponSummary = {
  groups: weaponCatalogSummary.counts.wikiFamilies,
  configurations:
    weaponCatalogSummary.counts.wikiConfigurations,
  templates: weaponCatalogSummary.counts.wikiTemplates,
  damageCurves: weaponCatalogSummary.counts.exactCurves,
};
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
