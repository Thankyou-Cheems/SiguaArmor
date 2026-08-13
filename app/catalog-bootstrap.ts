import {
  loadWikiFactionCatalog,
  loadWikiVehicleCommunityAliases,
  loadWikiVehicleFactionPresentation,
  loadWikiVehiclePresentation,
} from "../lib/wiki-source";
import {
  loadCatalogBootstrapGroup,
  loadCatalogBootstrapIndex,
  loadCatalogBootstrapRoutes,
} from "../generated/catalog-bootstrap-loaders";
import type {
  CatalogTopologyIndex,
  PublicCatalogIndex,
} from "./catalog-types";
import type { SiteEdition } from "./site-edition";
import {
  buildCatalogIndexFromWiki,
  buildCatalogSummaryFromWiki,
  mergeWikiVehicleFactionPresentation,
} from "./wiki-vehicle-catalog";
import { wikiVehicleFactionId } from "../lib/wiki-vehicle-identity.ts";

async function loadFullCatalogTopology(
  siteEdition: SiteEdition,
): Promise<CatalogTopologyIndex> {
  const topologyModule =
    siteEdition === "china"
      ? await import("../generated/china-catalog-index.json")
      : await import("../generated/catalog-index.json");
  return topologyModule.default as unknown as CatalogTopologyIndex;
}

function routeGroupId(
  href: string,
  basePath: string,
  groups: readonly { id: string }[],
  routes: readonly {
    groupId: string;
    routeSlugs: string[];
    cardIds: string[];
  }[],
) {
  const pathname = new URL(href).pathname
    .slice(basePath.length)
    .replace(/^\/+|\/+$/gu, "");
  const [kind, id] = pathname.split("/").map(decodeURIComponent);
  if (kind === "factions" && groups.some((group) => group.id === id)) return id;
  if (kind !== "vehicles" || !id) return null;
  return routes.find(
    (route) => route.routeSlugs.includes(id) || route.cardIds.includes(id),
  )?.groupId ?? null;
}

export async function loadPublicCatalogGroup(
  siteEdition: SiteEdition,
  groupId: string,
): Promise<PublicCatalogIndex> {
  const topology = await loadCatalogBootstrapGroup(siteEdition, groupId);
  const factionIds = [...new Set(
    topology.records.map((record) => wikiVehicleFactionId(record.promoEntryId)),
  )];
  const [presentationValues, factions, aliases] = await Promise.all([
    Promise.all(factionIds.map(loadWikiVehicleFactionPresentation)),
    loadWikiFactionCatalog(),
    loadWikiVehicleCommunityAliases(),
  ]);
  return buildCatalogIndexFromWiki(
    mergeWikiVehicleFactionPresentation(presentationValues),
    factions,
    topology,
    siteEdition,
    aliases,
  );
}

export async function loadInitialPublicCatalog(
  siteEdition: SiteEdition,
  href: string,
): Promise<PublicCatalogIndex> {
  const [topology, factions] = await Promise.all([
    loadCatalogBootstrapIndex(siteEdition),
    loadWikiFactionCatalog(),
  ]);
  const basePath = process.env.NODE_ENV === "development"
    ? siteEdition === "china" ? "/china" : ""
    : siteEdition === "china" ? "/sigua" : "/squad";
  const pathname = new URL(href).pathname.slice(basePath.length);
  if (!/^\/(?:vehicles|factions)\//u.test(pathname)) {
    return buildCatalogSummaryFromWiki(factions, topology, siteEdition);
  }
  const { routes } = await loadCatalogBootstrapRoutes(siteEdition);
  const groupId = routeGroupId(href, basePath, topology.groups, routes);
  if (!groupId) return buildCatalogSummaryFromWiki(factions, topology, siteEdition);
  return loadPublicCatalogGroup(siteEdition, groupId);
}

export async function loadPublicCatalog(
  siteEdition: SiteEdition,
): Promise<PublicCatalogIndex> {
  const [topology, vehicles, factions, aliases] = await Promise.all([
    loadFullCatalogTopology(siteEdition),
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
