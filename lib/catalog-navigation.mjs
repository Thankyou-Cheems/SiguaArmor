import { normalizeSharedShotToken } from "./viewer-shot-share.mjs";
import { normalizeViewerCameraToken } from "./viewer-camera-share.mjs";
import { normalizeViewerTurretToken } from "./viewer-turret-share.mjs";
import { normalizeRuntimeAttackSourceShareSlug } from "./runtime-attack-source-share.mjs";

export const ALL_CATALOG_GROUPS = "all";
export const MAX_VIEWER_TARGET_DISTANCE_M = 4000;
export const DEFAULT_VIEWER_NAVIGATION_STATE = Object.freeze({
  view: "armor",
  protection: false,
  attacker: "",
  weapon: "",
  weaponIndex: null,
  distance: 0,
  yaw: null,
  pitch: null,
  camera: "",
  shots: "",
  turrets: "",
});

const ASSET_VIEW_MODES = new Set(["armor", "interior", "exterior"]);
const VIEW_MODES = new Set([...ASSET_VIEW_MODES, "protection"]);
const VIEW_MODE_CODES = Object.freeze({
  armor: "a",
  interior: "i",
  exterior: "e",
  protection: "p",
});
const CODE_VIEW_MODES = new Map(
  Object.entries(VIEW_MODE_CODES).map(([mode, code]) => [code, mode]),
);

function finiteParam(value, fallback) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundNavigationNumber(value) {
  return Math.round(value * 10) / 10;
}

function normalizeYaw(value) {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return roundNavigationNumber(normalized);
}

function safeToken(value) {
  return typeof value === "string" && value.length <= 256 ? value : "";
}

function compactIndex(value, maximum) {
  if (typeof value !== "string" || !/^[0-9a-z]{1,3}$/u.test(value)) return null;
  const parsed = Number.parseInt(value, 36);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null;
}

function normalizeWeaponIndex(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 4095 ? parsed : null;
}

function expandLegacyCompactAttacker(value, index) {
  const recordIndex = compactIndex(value, index.records.length - 1);
  return recordIndex === null ? "" : index.records[recordIndex]?.promoEntryId ?? "";
}

function routeSegment(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const raw = pathname.slice(prefix.length).split("/", 1)[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function normalizedBasePath(value) {
  if (typeof value !== "string" || value.trim() === "" || value.trim() === "/") {
    return "";
  }
  return `/${value.trim().split("/").filter(Boolean).join("/")}`;
}

function pathnameWithoutBasePath(pathname, basePath) {
  const normalized = normalizedBasePath(basePath);
  if (!normalized) return pathname;
  if (pathname === normalized || pathname === `${normalized}/`) return "/";
  return pathname.startsWith(`${normalized}/`)
    ? pathname.slice(normalized.length)
    : pathname;
}

function pathnameWithBasePath(pathname, basePath) {
  const normalized = normalizedBasePath(basePath);
  if (!normalized) return pathname;
  return pathname === "/" ? `${normalized}/` : `${normalized}${pathname}`;
}

export function findCatalogCard(index, value) {
  if (!value) return null;
  for (const record of index.records) {
    if (
      record.promoEntryId === value ||
      record.defaultCardId === value ||
      record.routeSlug === value
    ) {
      return {
        record,
        variant: null,
        cardId: record.defaultCardId,
        routeSlug: record.routeSlug,
        groupId: record.official.groupId,
      };
    }
    const variant = record.variants.find(
      (candidate) => candidate.cardId === value || candidate.routeSlug === value,
    );
    if (variant) {
      return {
        record,
        variant,
        cardId: variant.cardId,
        routeSlug: variant.routeSlug,
        groupId: record.official.groupId,
      };
    }
  }
  return null;
}

export function normalizeViewerNavigationState(value = {}) {
  const legacyProtectionView = value.view === "protection";
  const view = ASSET_VIEW_MODES.has(value.view) ? value.view : "armor";
  const protection =
    legacyProtectionView ||
    value.protection === true ||
    value.protection === 1 ||
    value.protection === "1";
  const distance = roundNavigationNumber(
    clamp(
      Number.isFinite(Number(value.distance)) ? Number(value.distance) : 0,
      0,
      MAX_VIEWER_TARGET_DISTANCE_M,
    ),
  );
  const yaw = value.yaw === null || value.yaw === undefined || value.yaw === ""
    ? null
    : normalizeYaw(Number.isFinite(Number(value.yaw)) ? Number(value.yaw) : 0);
  const pitch = value.pitch === null || value.pitch === undefined || value.pitch === ""
    ? null
    : roundNavigationNumber(
        clamp(Number.isFinite(Number(value.pitch)) ? Number(value.pitch) : 0, -85, 85),
      );
  return {
    view,
    protection,
    attacker: safeToken(value.attacker),
    weapon: safeToken(value.weapon),
    weaponIndex: normalizeWeaponIndex(value.weaponIndex),
    distance,
    yaw,
    pitch,
    camera: normalizeViewerCameraToken(value.camera),
    shots: normalizeSharedShotToken(value.shots),
    turrets: normalizeViewerTurretToken(value.turrets),
  };
}

export function parseCatalogLocation(input, index, options = {}) {
  const url = input instanceof URL ? input : new URL(input, "https://sigua.local");
  const validGroups = new Set(index.groups.map((group) => group.id));
  const pathname = pathnameWithoutBasePath(url.pathname, options.basePath);
  const factionRoute = routeSegment(pathname, "/factions/");
  const vehicleRoute = routeSegment(pathname, "/vehicles/");
  const routeCard = findCatalogCard(index, vehicleRoute);
  const legacyCard = findCatalogCard(index, url.searchParams.get("vehicle"));
  const selectedCard = routeCard ?? legacyCard;
  const legacyGroup = url.searchParams.get("faction");
  let groupId = ALL_CATALOG_GROUPS;
  if (selectedCard) groupId = selectedCard.groupId;
  else if (factionRoute && validGroups.has(factionRoute)) groupId = factionRoute;
  else if (legacyGroup && validGroups.has(legacyGroup)) groupId = legacyGroup;

  const compactView = CODE_VIEW_MODES.get(url.searchParams.get("v")) ?? null;
  const rawView = compactView ?? url.searchParams.get("view");
  const compactAttacker = url.searchParams.get("a");
  const legacyCompactAttackerId = expandLegacyCompactAttacker(compactAttacker, index);
  const attackerShareSlug = normalizeRuntimeAttackSourceShareSlug(compactAttacker);
  const compactWeaponIndex = compactIndex(url.searchParams.get("w"), 4095);
  const viewer = normalizeViewerNavigationState({
    view: rawView && VIEW_MODES.has(rawView) ? rawView : "armor",
    protection:
      url.searchParams.get("g") === "1" ||
      url.searchParams.get("protection") === "1",
    attacker:
      legacyCompactAttackerId ||
      attackerShareSlug ||
      url.searchParams.get("attacker") ||
      "",
    weapon: compactWeaponIndex === null ? url.searchParams.get("weapon") ?? "" : "",
    weaponIndex: compactWeaponIndex,
    distance: finiteParam(url.searchParams.get("d") ?? url.searchParams.get("distance"), 0),
    yaw:
      url.searchParams.has("y") || url.searchParams.has("yaw")
        ? finiteParam(url.searchParams.get("y") ?? url.searchParams.get("yaw"), 0)
        : null,
    pitch:
      url.searchParams.has("p") || url.searchParams.has("pitch")
        ? finiteParam(url.searchParams.get("p") ?? url.searchParams.get("pitch"), 0)
        : null,
    camera: url.searchParams.get("c") ?? "",
    shots: url.searchParams.get("s") ?? "",
    turrets: url.searchParams.get("t") ?? "",
  });
  return {
    groupId,
    query: (url.searchParams.get("q") ?? "").trim().slice(0, 80),
    selectedId: selectedCard?.cardId ?? null,
    viewer,
  };
}

export function buildCatalogUrl(state, index, options = {}) {
  const selectedCard = findCatalogCard(index, state.selectedId);
  const validGroup = index.groups.some((group) => group.id === state.groupId);
  let pathname = "/";
  if (selectedCard) pathname = `/vehicles/${encodeURIComponent(selectedCard.routeSlug)}`;
  else if (validGroup) pathname = `/factions/${encodeURIComponent(state.groupId)}`;
  pathname = pathnameWithBasePath(pathname, options.basePath);

  const params = new URLSearchParams();
  const query = typeof state.query === "string" ? state.query.trim().slice(0, 80) : "";
  if (query) params.set("q", query);
  if (selectedCard) {
    const viewer = normalizeViewerNavigationState(state.viewer);
    if (viewer.protection && viewer.view === "armor") {
      params.set("v", VIEW_MODE_CODES.protection);
    } else {
      if (viewer.view !== "armor") params.set("v", VIEW_MODE_CODES[viewer.view]);
      if (viewer.protection) params.set("g", "1");
    }
    if (viewer.attacker) {
      const attackerShareSlug = normalizeRuntimeAttackSourceShareSlug(viewer.attacker);
      if (attackerShareSlug) params.set("a", attackerShareSlug);
      else params.set("attacker", viewer.attacker);
    }
    if (viewer.weaponIndex !== null) params.set("w", viewer.weaponIndex.toString(36));
    else if (viewer.weapon) params.set("weapon", viewer.weapon);
    if (viewer.distance > 0) params.set("d", String(viewer.distance));
    if (viewer.camera) {
      params.set("c", viewer.camera);
    } else {
      if (viewer.yaw !== null) params.set("y", String(viewer.yaw));
      if (viewer.pitch !== null) params.set("p", String(viewer.pitch));
    }
    if (viewer.shots) params.set("s", viewer.shots);
    if (viewer.turrets) params.set("t", viewer.turrets);
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
