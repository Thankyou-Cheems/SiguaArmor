export const SIGUA_WIKI_ORIGIN =
  process.env.NEXT_PUBLIC_SIGUA_WIKI_ORIGIN?.replace(/\/+$/u, "") ||
  "https://wiki.siguad.icu";

const WIKI_PRESENTATION_QUERY = "?presentation=v1";

const requests = new Map<
  string,
  { expiresAt: number; request: Promise<unknown> }
>();

function wikiUrl(pathname: string) {
  if (!pathname.startsWith("/")) {
    throw new Error(`Invalid SiguaWiki path: ${pathname}`);
  }
  const url = new URL(pathname, `${SIGUA_WIKI_ORIGIN}/`);
  if (url.origin !== SIGUA_WIKI_ORIGIN) {
    throw new Error(`Invalid SiguaWiki path: ${pathname}`);
  }
  return url.href;
}

async function fetchJson(pathname: string, maxAgeMs = Number.POSITIVE_INFINITY) {
  const existing = requests.get(pathname);
  if (existing && Date.now() < existing.expiresAt) return existing.request;
  const request = fetch(wikiUrl(pathname), {
    credentials: "omit",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`SiguaWiki ${pathname} returned HTTP ${response.status}`);
      }
      return response.json() as Promise<unknown>;
    })
    .catch((error) => {
      if (requests.get(pathname)?.request === request) requests.delete(pathname);
      throw error;
    });
  requests.set(pathname, { expiresAt: Date.now() + maxAgeMs, request });
  return request;
}

export async function loadWikiDataset(
  pathname: string,
  schemaVersion: string,
) {
  const value = await fetchJson(pathname);
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { schemaVersion?: string }).schemaVersion !== schemaVersion
  ) {
    throw new Error(`SiguaWiki ${pathname} has an unsupported shape`);
  }
  return value;
}

export async function loadWikiWeaponCatalog() {
  const value = await loadWikiDataset(
    "/data/weapons/catalog.json",
    "sigua-weapon-catalog/v2",
  );
  const catalog = value as {
    schemaVersion?: string;
    selector?: { variants?: unknown[] };
    mechanics?: { directDamageModels?: unknown[] };
  };
  if (
    catalog.schemaVersion !== "sigua-weapon-catalog/v2" ||
    !Array.isArray(catalog.selector?.variants) ||
    !Array.isArray(catalog.mechanics?.directDamageModels)
  ) {
    throw new Error("SiguaWiki weapon catalog has an unsupported shape");
  }
  return value;
}

export async function loadWikiVehicleCatalog() {
  const value = await loadWikiDataset(
    `/data/vehicles/catalog.json${WIKI_PRESENTATION_QUERY}`,
    "sigua-vehicle-catalog/v3.1",
  );
  const catalog = value as {
    schemaVersion?: string;
    identities?: { catalogBindings?: unknown[] };
    runtime?: { visualArtifacts?: unknown[] };
    presentation?: {
      editions?: {
        international?: { records?: unknown[] };
        china?: { records?: unknown[] };
      };
    };
  };
  if (
    catalog.schemaVersion !== "sigua-vehicle-catalog/v3.1" ||
    !Array.isArray(catalog.identities?.catalogBindings) ||
    !Array.isArray(catalog.runtime?.visualArtifacts) ||
    !Array.isArray(catalog.presentation?.editions?.international?.records) ||
    !Array.isArray(catalog.presentation?.editions?.china?.records)
  ) {
    throw new Error("SiguaWiki vehicle catalog has an unsupported shape");
  }
  return value;
}

export async function loadWikiVehicleCommunityAliases() {
  const value = await fetchJson(
    `/data/vehicles/community-aliases.json${WIKI_PRESENTATION_QUERY}`,
    60_000,
  );
  const document = value as {
    schemaVersion?: string;
    updatedAt?: string;
    groups?: Array<{
      id?: string;
      label?: string;
      terms?: unknown[];
      targets?: unknown[];
    }>;
  };
  if (
    document.schemaVersion !== "sigua-vehicle-community-aliases/v1" ||
    typeof document.updatedAt !== "string" ||
    !Array.isArray(document.groups) ||
    document.groups.some(
      (group) =>
        typeof group.id !== "string" ||
        typeof group.label !== "string" ||
        !Array.isArray(group.terms) ||
        !Array.isArray(group.targets),
    )
  ) {
    throw new Error("SiguaWiki vehicle community aliases have an unsupported shape");
  }
  return value;
}

export async function loadWikiFactionCatalog() {
  const value = await loadWikiDataset(
    `/data/factions/catalog.json${WIKI_PRESENTATION_QUERY}`,
    "sigua-faction-catalog/v1",
  );
  const catalog = value as {
    schemaVersion?: string;
    factions?: Array<{ code?: string; labels?: { zhHans?: string } }>;
    catalogGroups?: {
      china?: Array<{ id?: string; nameZh?: string }>;
    };
  };
  if (
    catalog.schemaVersion !== "sigua-faction-catalog/v1" ||
    !Array.isArray(catalog.factions) ||
    !Array.isArray(catalog.catalogGroups?.china) ||
    catalog.factions.some(
      (faction) =>
        typeof faction.code !== "string" ||
        typeof faction.labels?.zhHans !== "string",
    ) ||
    catalog.catalogGroups.china.some(
      (group) =>
        typeof group.id !== "string" ||
        typeof group.nameZh !== "string",
    )
  ) {
    throw new Error("SiguaWiki faction catalog has an unsupported shape");
  }
  return value;
}

export async function loadWikiRuntimeVisual(visualArtifactRef: string) {
  if (!/^visual-artifact-[a-f0-9]{64}$/u.test(visualArtifactRef)) {
    throw new Error("Vehicle visual artifact reference is invalid");
  }
  const value = await fetchJson(
    `/assets/runtime-probe/visuals/${visualArtifactRef}.json`,
  );
  const descriptor = value as {
    schemaVersion?: string;
    id?: string;
    runtimeVehicleRef?: string;
    generatedClass?: string;
    placements?: Array<{ assetUrl?: string; matrix?: unknown[] }>;
  };
  if (
    descriptor.schemaVersion !== "sigua-runtime-visual/v1" ||
    descriptor.id !== visualArtifactRef ||
    !/^vehicle-[a-f0-9]{64}$/u.test(descriptor.runtimeVehicleRef ?? "") ||
    typeof descriptor.generatedClass !== "string" ||
    !Array.isArray(descriptor.placements) ||
    descriptor.placements.some(
      (placement) =>
        !/^\/assets\/runtime-probe\/models\/[a-f0-9]{64}\.gltf$/u.test(
          placement.assetUrl ?? "",
        ) ||
        !Array.isArray(placement.matrix) ||
        placement.matrix.length !== 16,
    )
  ) {
    throw new Error(`SiguaWiki visual descriptor is invalid: ${visualArtifactRef}`);
  }
  return value;
}

export function wikiAssetUrl(pathname: string) {
  if (!pathname.startsWith("/assets/")) return pathname;
  const url = wikiUrl(pathname);
  if (!new URL(url).pathname.startsWith("/assets/")) {
    throw new Error(`Invalid SiguaWiki asset path: ${pathname}`);
  }
  return url;
}
