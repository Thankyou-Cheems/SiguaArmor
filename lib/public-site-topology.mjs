export const LANDING_ORIGIN = "https://siguad.icu";
export const ARMOR_ORIGIN = "https://armor.siguad.icu";

export const ICP_RECORD = Object.freeze({
  number: "黑ICP备2025043874号-2",
  url: "https://beian.miit.gov.cn/",
});

export const ARMOR_EDITIONS = Object.freeze({
  international: Object.freeze({
    id: "international",
    basePath: "/squad",
  }),
  china: Object.freeze({
    id: "china",
    basePath: "/sigua",
  }),
});

function editionProfile(edition) {
  const profile = ARMOR_EDITIONS[edition];
  if (!profile) throw new Error(`unknown Armor edition: ${edition}`);
  return profile;
}

function normalizeSuffix(pathname) {
  if (typeof pathname !== "string") throw new TypeError("pathname must be a string");
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withSlash.includes("\\") || withSlash.split("/").includes("..")) {
    throw new Error(`unsafe Armor pathname: ${pathname}`);
  }
  return withSlash;
}

export function armorPath(edition, pathname = "/") {
  const { basePath } = editionProfile(edition);
  const suffix = normalizeSuffix(pathname);
  return suffix === "/" ? `${basePath}/` : `${basePath}${suffix}`;
}

export function armorUrl(edition, pathname = "/") {
  return new URL(armorPath(edition, pathname), ARMOR_ORIGIN).href;
}

export function landingArmorRedirectUrl(pathname, search = "") {
  const normalizedPath = normalizeSuffix(pathname);
  const edition = Object.values(ARMOR_EDITIONS).find(
    ({ basePath }) =>
      normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`),
  );
  if (!edition) return null;
  const destination = new URL(normalizedPath, ARMOR_ORIGIN);
  destination.search = search;
  return destination.href;
}

export function originHostname(origin) {
  return new URL(origin).hostname;
}
