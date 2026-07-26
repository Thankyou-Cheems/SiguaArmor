export const INTERNATIONAL_BASE_PATH = "/squad";

export function internationalPath(pathname = "/") {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized === "/"
    ? `${INTERNATIONAL_BASE_PATH}/`
    : `${INTERNATIONAL_BASE_PATH}${normalized}`;
}

export function stripInternationalBasePath(pathname: string) {
  if (
    pathname === INTERNATIONAL_BASE_PATH ||
    pathname === `${INTERNATIONAL_BASE_PATH}/`
  ) {
    return "/";
  }
  return pathname.startsWith(`${INTERNATIONAL_BASE_PATH}/`)
    ? pathname.slice(INTERNATIONAL_BASE_PATH.length)
    : pathname;
}
