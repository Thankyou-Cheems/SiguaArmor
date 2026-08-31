export const SIGUA_WIKI_ORIGIN =
  process.env.NEXT_PUBLIC_SIGUA_WIKI_ORIGIN?.replace(/\/+$/u, "") ||
  "https://wiki.siguad.icu";

const WIKI_PRESENTATION_QUERY = "?presentation=v6";
const WIKI_VEHICLE_MECHANICS_QUERY = "?mechanics=burning-radial-v3";
const WIKI_VEHICLE_RUNTIME_QUERY = "?projection=vehicle-station-graph-v1";
const WIKI_WEAPON_CATALOG_QUERY = "?mechanics=overheat-v1";
const WIKI_WEAPON_RUNTIME_QUERY = "?projection=exact-assignment-radial-v4";
const WIKI_WEAPON_PROJECTILE_QUERY = "?mechanics=projectile-playback-v1";

const requests = new Map<
  string,
  { expiresAt: number; request: Promise<unknown> }
>();

export function wikiUrl(pathname: string) {
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
    `/data/weapons/catalog.json${WIKI_WEAPON_CATALOG_QUERY}`,
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

export async function loadWikiWeaponBallistics() {
  const pathname = `/data/weapons/ballistics.json${WIKI_WEAPON_PROJECTILE_QUERY}`;
  const value = await loadWikiDataset(
    pathname,
    "sigua-weapon-ballistics/v1",
  );
  const document = value as {
    status?: string;
    sourceBuildId?: string;
    algorithms?: { projectile?: string };
    physics?: {
      worldGravityZCentimetresPerSecondSquared?: number;
      serverFrameDeltaSeconds?: number;
    };
    launchOriginProfiles?: unknown[];
    projectileProfiles?: unknown[];
    weaponAssignments?: unknown[];
    movementModes?: unknown[];
    curveAssets?: unknown[];
    vehicleMountBindings?: unknown[];
  };
  if (
    document.status !== "completed" ||
    typeof document.sourceBuildId !== "string" ||
    !/^\/algorithms\/ballistics\/[a-z0-9-]+\.js$/u.test(
      document.algorithms?.projectile ?? "",
    ) ||
    typeof document.physics?.worldGravityZCentimetresPerSecondSquared !==
      "number" ||
    typeof document.physics?.serverFrameDeltaSeconds !== "number" ||
    !Array.isArray(document.launchOriginProfiles) ||
    document.launchOriginProfiles.length === 0 ||
    !Array.isArray(document.projectileProfiles) ||
    !Array.isArray(document.weaponAssignments) ||
    !Array.isArray(document.movementModes) ||
    !Array.isArray(document.curveAssets) ||
    !Array.isArray(document.vehicleMountBindings)
  ) {
    throw new Error(
      `SiguaWiki ${pathname} does not contain the source-locked launch contract`,
    );
  }
  return value;
}

export async function loadWikiVehicleWeaponRuntimeSource(cardId: string) {
  if (!/^[a-z0-9-]+$/u.test(cardId)) {
    throw new Error(`Invalid vehicle weapon runtime card id: ${cardId}`);
  }
  const pathname = `/data/weapons/runtime/vehicles/${cardId}.json${WIKI_WEAPON_RUNTIME_QUERY}`;
  const value = await loadWikiDataset(
    pathname,
    "sigua-weapon-runtime-source/v2",
  );
  const document = value as {
    source?: { kind?: string; cardId?: string; rawNames?: unknown[] };
    weaponProfiles?: unknown[];
    loadouts?: unknown[];
  };
  if (
    document.source?.kind !== "vehicle" ||
    document.source.cardId !== cardId ||
    !Array.isArray(document.source.rawNames) ||
    !Array.isArray(document.weaponProfiles) ||
    !Array.isArray(document.loadouts) ||
    document.loadouts.length === 0
  ) {
    throw new Error(`SiguaWiki ${pathname} has an unsupported shape`);
  }
  return value;
}

export async function loadWikiVehicleWeaponRuntimeIndex() {
  const pathname = `/data/weapons/runtime/vehicles/index.json${WIKI_WEAPON_RUNTIME_QUERY}`;
  const value = await loadWikiDataset(
    pathname,
    "sigua-weapon-runtime-index/v2",
  );
  const document = value as {
    vehicleSources?: unknown[];
  };
  if (!Array.isArray(document.vehicleSources)) {
    throw new Error(`SiguaWiki ${pathname} has an unsupported shape`);
  }
  return value;
}

export async function loadWikiVehicleRuntimeSource(cardId: string) {
  if (!/^[a-z0-9-]+$/u.test(cardId)) {
    throw new Error(`Invalid vehicle runtime card id: ${cardId}`);
  }
  const pathname = `/data/vehicles/runtime/${cardId}.json${WIKI_VEHICLE_RUNTIME_QUERY}`;
  const value = await loadWikiDataset(
    pathname,
    "sigua-vehicle-runtime-source/v1",
  );
  const document = value as {
    source?: { cardId?: string };
    variants?: unknown[];
  };
  if (
    document.source?.cardId !== cardId ||
    !Array.isArray(document.variants) ||
    document.variants.length === 0
  ) {
    throw new Error(`SiguaWiki ${pathname} has an unsupported shape`);
  }
  return value;
}

export async function loadWikiVehicleRadialQuery(recordPath: string) {
  if (!/^\/assets\/runtime-probe\/radial-query\/records\/[a-f0-9]{64}\.json$/u.test(recordPath)) {
    throw new Error(`Invalid vehicle radial query path: ${recordPath}`);
  }
  return loadWikiDataset(
    recordPath,
    "sigua-vehicle-radial-query-source/v1",
  );
}

export async function loadWikiVehicleVisualAttachment(recordPath: string) {
  if (!/^\/data\/vehicles\/visual-attachments\/vehicle-[a-f0-9]+\.json$/u.test(recordPath)) {
    throw new Error(`Invalid vehicle visual-attachment path: ${recordPath}`);
  }
  const value = await loadWikiDataset(
    recordPath,
    "sigua-vehicle-visual-attachment/v2",
  );
  const document = value as {
    sourceVehicleRef?: string;
    stations?: unknown[];
    visualBindings?: unknown[];
  };
  if (
    !/^vehicle-[a-f0-9]+$/u.test(document.sourceVehicleRef ?? "") ||
    !Array.isArray(document.stations) ||
    !Array.isArray(document.visualBindings)
  ) {
    throw new Error(`SiguaWiki ${recordPath} has an unsupported shape`);
  }
  return value;
}

export async function loadWikiVehicleCrewSeat(recordPath: string) {
  if (!/^\/data\/vehicles\/crew-seats\/vehicle-[a-f0-9]+\.json$/u.test(recordPath)) {
    throw new Error(`Invalid vehicle crew-seat path: ${recordPath}`);
  }
  const value = await loadWikiDataset(
    recordPath,
    "sigua-vehicle-crew-seat/v1",
  );
  const document = value as {
    sourceVehicleRef?: string;
    runtimeVehicleRefs?: unknown[];
    seats?: unknown[];
  };
  if (
    !/^vehicle-[a-f0-9]+$/u.test(document.sourceVehicleRef ?? "") ||
    !Array.isArray(document.runtimeVehicleRefs) ||
    !Array.isArray(document.seats)
  ) {
    throw new Error(`SiguaWiki ${recordPath} has an unsupported shape`);
  }
  return value;
}

export async function loadWikiVehicleStationGraph(recordPath: string) {
  if (!/^\/data\/vehicles\/station-graphs\/vehicle-[a-f0-9]+\.json$/u.test(recordPath)) {
    throw new Error(`Invalid vehicle station-graph path: ${recordPath}`);
  }
  const value = await loadWikiDataset(
    recordPath,
    "sigua-vehicle-station-graph/v1",
  );
  const document = value as {
    sourceVehicleRef?: string;
    runtimeVehicleRefs?: unknown[];
    stations?: unknown[];
    visualBindings?: unknown[];
  };
  if (
    !/^vehicle-[a-f0-9]+$/u.test(document.sourceVehicleRef ?? "") ||
    !Array.isArray(document.runtimeVehicleRefs) ||
    !Array.isArray(document.stations) ||
    !Array.isArray(document.visualBindings)
  ) {
    throw new Error(`SiguaWiki ${recordPath} has an unsupported shape`);
  }
  return value;
}

export async function loadWikiVehicleGunnerSight(sourceVehicleRef: string) {
  if (!/^vehicle-[a-f0-9]+$/u.test(sourceVehicleRef)) {
    throw new Error(`Invalid vehicle gunner-sight source: ${sourceVehicleRef}`);
  }
  const recordPath = `/data/vehicles/gunner-sights/${sourceVehicleRef}.json`;
  const value = await loadWikiDataset(
    recordPath,
    "sigua-vehicle-gunner-sight/v1",
  );
  const document = value as {
    sourceVehicleRef?: string;
    runtimeVehicleRefs?: unknown[];
    stations?: unknown[];
    projections?: unknown[];
  };
  if (
    document.sourceVehicleRef !== sourceVehicleRef ||
    !Array.isArray(document.runtimeVehicleRefs) ||
    !Array.isArray(document.stations) ||
    !Array.isArray(document.projections)
  ) {
    throw new Error(`SiguaWiki ${recordPath} has an unsupported shape`);
  }
  return value;
}

export async function loadOptionalWikiVehicleGunnerSight(
  sourceVehicleRef: string,
) {
  try {
    return await loadWikiVehicleGunnerSight(sourceVehicleRef);
  } catch (error) {
    if (
      error instanceof Error &&
      /returned HTTP 404$/u.test(error.message)
    ) return null;
    throw error;
  }
}

export async function loadWikiVehicleDriverView(sourceVehicleRef: string) {
  if (!/^vehicle-[a-f0-9]+$/u.test(sourceVehicleRef)) {
    throw new Error(`Invalid vehicle driver-view source: ${sourceVehicleRef}`);
  }
  const recordPath = `/data/vehicles/driver-views/${sourceVehicleRef}.json`;
  const value = await loadWikiDataset(
    recordPath,
    "sigua-vehicle-driver-view/v1",
  );
  const document = value as {
    sourceVehicleRef?: string;
    seatKey?: string;
    camera?: unknown;
    mask?: unknown;
  };
  if (
    document.sourceVehicleRef !== sourceVehicleRef ||
    document.seatKey !== `${sourceVehicleRef}:catalog-seat:1` ||
    !document.camera ||
    !document.mask
  ) throw new Error(`SiguaWiki ${recordPath} has an unsupported shape`);
  return value;
}

export async function loadWikiVehicleFactionMechanics(factionId: string) {
  if (!/^[a-z0-9-]+$/u.test(factionId)) {
    throw new Error(`Invalid vehicle mechanics faction id: ${factionId}`);
  }
  const pathname = `/data/vehicles/factions/${factionId}.json${WIKI_VEHICLE_MECHANICS_QUERY}`;
  const value = await loadWikiDataset(
    pathname,
    "sigua-vehicle-faction-mechanics/v1",
  );
  const document = value as {
    factionId?: string;
    identities?: { vehicles?: unknown[]; catalogBindings?: unknown[] };
    profiles?: {
      general?: unknown[];
      burning?: unknown[];
      seats?: unknown[];
      damageResistances?: unknown[];
      components?: unknown[];
    };
    runtime?: { visualArtifacts?: unknown[] };
    editorAvailability?: { schemaVersion?: string; bindingAvailability?: unknown[] };
  };
  if (
    document.factionId !== factionId ||
    !Array.isArray(document.identities?.vehicles) ||
    !Array.isArray(document.identities?.catalogBindings) ||
    !Array.isArray(document.profiles?.general) ||
    !Array.isArray(document.profiles?.burning) ||
    !Array.isArray(document.profiles?.seats) ||
    !Array.isArray(document.profiles?.damageResistances) ||
    !Array.isArray(document.profiles?.components) ||
    !Array.isArray(document.runtime?.visualArtifacts) ||
    document.identities.vehicles.some(
      (vehicle) =>
        typeof (vehicle as { burningProfileRef?: unknown }).burningProfileRef !== "string",
    ) ||
    document.editorAvailability?.schemaVersion !== "sigua-vehicle-editor-availability/v1" ||
    !Array.isArray(document.editorAvailability?.bindingAvailability)
  ) {
    throw new Error(`SiguaWiki ${pathname} has an unsupported shape`);
  }
  return value;
}

export async function loadWikiVehicleFactionPresentation(factionId: string) {
  if (!/^[a-z0-9-]+$/u.test(factionId)) {
    throw new Error(`Invalid vehicle presentation faction id: ${factionId}`);
  }
  const pathname = `/data/vehicles/faction-presentation/${factionId}.json${WIKI_PRESENTATION_QUERY}`;
  const value = await loadWikiDataset(
    pathname,
    "sigua-vehicle-faction-presentation/v1",
  );
  const document = value as {
    factionId?: string;
    presentation?: {
      editions?: {
        international?: { records?: unknown[] };
        china?: { records?: unknown[] };
      };
    };
  };
  if (
    document.factionId !== factionId ||
    !Array.isArray(document.presentation?.editions?.international?.records) ||
    !Array.isArray(document.presentation?.editions?.china?.records)
  ) {
    throw new Error(`SiguaWiki ${pathname} has an unsupported shape`);
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

export async function loadWikiVehiclePresentation() {
  const value = await loadWikiDataset(
    "/data/vehicles/presentation.json",
    "sigua-vehicle-presentation/v1",
  );
  const document = value as {
    schemaVersion?: string;
    presentation?: {
      editions?: {
        international?: { records?: unknown[] };
        china?: { records?: unknown[] };
      };
    };
  };
  if (
    document.schemaVersion !== "sigua-vehicle-presentation/v1" ||
    !Array.isArray(document.presentation?.editions?.international?.records) ||
    !Array.isArray(document.presentation?.editions?.china?.records)
  ) {
    throw new Error("SiguaWiki vehicle presentation has an unsupported shape");
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
    `/assets/runtime-probe/visuals/${visualArtifactRef}.json${WIKI_PRESENTATION_QUERY}`,
  );
  const descriptor = value as {
    schemaVersion?: string;
    id?: string;
    runtimeVehicleRef?: string;
    generatedClass?: string;
    placements?: Array<{
      assetUrl?: string;
      compatibilityAssetUrl?: string;
      matrix?: unknown[];
    }>;
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
        (placement.compatibilityAssetUrl !== undefined &&
          !/^\/assets\/runtime-probe\/models\/[a-f0-9]{64}\.gltf$/u.test(
            placement.compatibilityAssetUrl,
          )) ||
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
  const normalizedPathname = new URL(url).pathname;
  if (!normalizedPathname.startsWith("/assets/")) {
    throw new Error(`Invalid SiguaWiki asset path: ${pathname}`);
  }
  if (normalizedPathname.startsWith("/assets/weapons/impressions/")) {
    throw new Error("Weapon impression assets are not part of SiguaArmor");
  }
  return url;
}
