import type { CatalogTopologyIndex } from "../app/catalog-types";

export async function loadCatalogBootstrapIndex(edition: "international" | "china"): Promise<CatalogTopologyIndex> {
  return edition === "china"
    ? (await import("./catalog-bootstrap/china/index.json")).default as CatalogTopologyIndex
    : (await import("./catalog-bootstrap/international/index.json")).default as CatalogTopologyIndex;
}

export async function loadCatalogBootstrapRoutes(edition: "international" | "china") {
  return edition === "china"
    ? (await import("./catalog-bootstrap/china/routes.json")).default
    : (await import("./catalog-bootstrap/international/routes.json")).default;
}

export async function loadCatalogBootstrapGroup(
  edition: "international" | "china",
  groupId: string,
): Promise<CatalogTopologyIndex> {
  const key = `${edition}:${groupId}`;
  switch (key) {
    case "international:adf": return (await import("./catalog-bootstrap/international/groups/adf.json")).default as CatalogTopologyIndex;
    case "international:afu": return (await import("./catalog-bootstrap/international/groups/afu.json")).default as CatalogTopologyIndex;
    case "international:baf": return (await import("./catalog-bootstrap/international/groups/baf.json")).default as CatalogTopologyIndex;
    case "international:caf": return (await import("./catalog-bootstrap/international/groups/caf.json")).default as CatalogTopologyIndex;
    case "international:crf": return (await import("./catalog-bootstrap/international/groups/crf.json")).default as CatalogTopologyIndex;
    case "international:gfi": return (await import("./catalog-bootstrap/international/groups/gfi.json")).default as CatalogTopologyIndex;
    case "international:imf": return (await import("./catalog-bootstrap/international/groups/imf.json")).default as CatalogTopologyIndex;
    case "international:mei": return (await import("./catalog-bootstrap/international/groups/mei.json")).default as CatalogTopologyIndex;
    case "international:pla": return (await import("./catalog-bootstrap/international/groups/pla.json")).default as CatalogTopologyIndex;
    case "international:plaagf": return (await import("./catalog-bootstrap/international/groups/plaagf.json")).default as CatalogTopologyIndex;
    case "international:planmc": return (await import("./catalog-bootstrap/international/groups/planmc.json")).default as CatalogTopologyIndex;
    case "international:rgf": return (await import("./catalog-bootstrap/international/groups/rgf.json")).default as CatalogTopologyIndex;
    case "international:tlf": return (await import("./catalog-bootstrap/international/groups/tlf.json")).default as CatalogTopologyIndex;
    case "international:usa": return (await import("./catalog-bootstrap/international/groups/usa.json")).default as CatalogTopologyIndex;
    case "international:usmc": return (await import("./catalog-bootstrap/international/groups/usmc.json")).default as CatalogTopologyIndex;
    case "international:vdv": return (await import("./catalog-bootstrap/international/groups/vdv.json")).default as CatalogTopologyIndex;
    case "international:wpmc": return (await import("./catalog-bootstrap/international/groups/wpmc.json")).default as CatalogTopologyIndex;
    case "china:shenzhou": return (await import("./catalog-bootstrap/china/groups/shenzhou.json")).default as CatalogTopologyIndex;
    case "china:arctic-union": return (await import("./catalog-bootstrap/china/groups/arctic-union.json")).default as CatalogTopologyIndex;
    case "china:agesi": return (await import("./catalog-bootstrap/china/groups/agesi.json")).default as CatalogTopologyIndex;
    case "china:ekeqie": return (await import("./catalog-bootstrap/china/groups/ekeqie.json")).default as CatalogTopologyIndex;
    case "china:kaweier": return (await import("./catalog-bootstrap/china/groups/kaweier.json")).default as CatalogTopologyIndex;
    default: throw new Error(`Unknown catalog bootstrap group ${key}`);
  }
}
