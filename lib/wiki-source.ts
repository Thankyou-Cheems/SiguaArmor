export const SIGUA_WIKI_ORIGIN = "https://wiki.siguad.icu";

const requests = new Map<string, Promise<unknown>>();

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

async function fetchJson(pathname: string) {
  const existing = requests.get(pathname);
  if (existing) return existing;
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
      requests.delete(pathname);
      throw error;
    });
  requests.set(pathname, request);
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
    "/data/vehicles/catalog.json",
    "sigua-vehicle-catalog/v3.1",
  );
  const catalog = value as {
    schemaVersion?: string;
    identities?: { catalogBindings?: unknown[] };
    runtime?: { visualArtifacts?: unknown[] };
  };
  if (
    catalog.schemaVersion !== "sigua-vehicle-catalog/v3.1" ||
    !Array.isArray(catalog.identities?.catalogBindings) ||
    !Array.isArray(catalog.runtime?.visualArtifacts)
  ) {
    throw new Error("SiguaWiki vehicle catalog has an unsupported shape");
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
