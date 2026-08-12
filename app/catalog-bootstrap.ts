import {
  loadWikiFactionCatalog,
  loadWikiVehicleCommunityAliases,
  loadWikiVehiclePresentation,
} from "../lib/wiki-source";
import type {
  CatalogTopologyIndex,
  PublicCatalogIndex,
} from "./catalog-types";
import type { SiteEdition } from "./site-edition";
import { buildCatalogIndexFromWiki } from "./wiki-vehicle-catalog";

async function loadCatalogTopology(
  siteEdition: SiteEdition,
): Promise<CatalogTopologyIndex> {
  const topologyModule =
    siteEdition === "china"
      ? await import("../generated/china-catalog-index.json")
      : await import("../generated/catalog-index.json");
  return topologyModule.default as unknown as CatalogTopologyIndex;
}

export async function loadPublicCatalog(
  siteEdition: SiteEdition,
): Promise<PublicCatalogIndex> {
  const [topology, vehicles, factions, aliases] = await Promise.all([
    loadCatalogTopology(siteEdition),
    loadWikiVehiclePresentation(),
    loadWikiFactionCatalog(),
    loadWikiVehicleCommunityAliases(),
  ]);

  return buildCatalogIndexFromWiki(
    vehicles,
    factions,
    topology,
    siteEdition,
    aliases,
  );
}
