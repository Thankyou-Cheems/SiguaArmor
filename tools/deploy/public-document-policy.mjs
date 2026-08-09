import {
  ARMOR_EDITIONS,
  ARMOR_ORIGIN,
  LANDING_ORIGIN,
  landingArmorRedirectUrl,
  originHostname,
} from "../../lib/public-site-topology.mjs";

export const PUBLIC_DOCUMENT_CACHE = Object.freeze({
  landing: "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
  armorHtml: "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
  private: "private, no-store",
});

export const RSC_REQUEST_HEADERS = Object.freeze([
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "x-vinext-rsc-render-mode",
]);

const LANDING_HOST = originHostname(LANDING_ORIGIN);
const ARMOR_HOST = originHostname(ARMOR_ORIGIN);
const ARMOR_BASE_PATHS = Object.values(ARMOR_EDITIONS).map(({ basePath }) => basePath);

function normalizeHeaders(headers) {
  return new Map(
    Object.entries(headers ?? {}).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(",") : String(value ?? ""),
    ]),
  );
}

function isArmorPath(pathname) {
  return ARMOR_BASE_PATHS.some(
    (basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`),
  );
}

export function isRscRequest({ pathname, search = "", headers = {} }) {
  const normalizedHeaders = normalizeHeaders(headers);
  if (pathname.endsWith(".rsc")) return true;
  if (new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).has("_rsc")) {
    return true;
  }
  if ((normalizedHeaders.get("accept") ?? "").includes("text/x-component")) {
    return true;
  }
  return RSC_REQUEST_HEADERS.some((name) => normalizedHeaders.has(name));
}

export function classifyPublicDocumentRequest({
  host,
  pathname,
  search = "",
  method = "GET",
  headers = {},
}) {
  const normalizedHost = host.toLowerCase().replace(/:\d+$/u, "");
  const normalizedMethod = method.toUpperCase();
  const normalizedHeaders = normalizeHeaders(headers);

  if (normalizedHost === LANDING_HOST) {
    const redirect = landingArmorRedirectUrl(pathname, search);
    if (redirect) {
      return Object.freeze({ kind: "armor-redirect", status: 301, location: redirect });
    }
    if (pathname === "/" || pathname === "/index.html") {
      return Object.freeze({
        kind: "landing-html",
        cacheControl: PUBLIC_DOCUMENT_CACHE.landing,
      });
    }
    return Object.freeze({ kind: "not-found", status: 404 });
  }

  if (normalizedHost !== ARMOR_HOST) {
    return Object.freeze({ kind: "not-found", status: 404 });
  }
  if (pathname === "/__analytics/dau" || pathname.startsWith("/__admin/")) {
    return Object.freeze({
      kind: "dynamic-control",
      cacheControl: PUBLIC_DOCUMENT_CACHE.private,
    });
  }
  if (!isArmorPath(pathname)) {
    return Object.freeze({ kind: "armor-static-or-pointer" });
  }
  if (isRscRequest({ pathname, search, headers })) {
    return Object.freeze({
      kind: "armor-rsc",
      cacheControl: PUBLIC_DOCUMENT_CACHE.private,
    });
  }
  const acceptsHtml = (normalizedHeaders.get("accept") ?? "").includes("text/html");
  if (["GET", "HEAD"].includes(normalizedMethod) && acceptsHtml) {
    return Object.freeze({
      kind: "armor-html",
      cacheControl: PUBLIC_DOCUMENT_CACHE.armorHtml,
    });
  }
  return Object.freeze({
    kind: "armor-runtime",
    cacheControl: PUBLIC_DOCUMENT_CACHE.private,
  });
}
