const SHARE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/u;
const TRAILING_VARIANT_TOKENS = new Set([
  "arid",
  "black",
  "c",
  "camo",
  "desert",
  "forest",
  "gray",
  "green",
  "grey",
  "snow",
  "tan",
  "white",
  "winter",
  "wood",
  "woodland",
]);

export function normalizeRuntimeAttackSourceShareSlug(value) {
  if (typeof value !== "string" || value.length > 64) return "";
  const normalized = value.trim().toLowerCase();
  return SHARE_SLUG_PATTERN.test(normalized) ? normalized : "";
}

export function buildRuntimeAttackSourceShareSlug({
  groupId,
  canonicalRawName,
}) {
  const factionToken = String(groupId ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
  const rawTokens = String(canonicalRawName ?? "")
    .replace(/^BP_/iu, "")
    .split(/[^a-z0-9]+/iu)
    .map((token) => token.toLowerCase())
    .filter((token) => token && token !== factionToken);
  while (
    rawTokens.length > 1 &&
    TRAILING_VARIANT_TOKENS.has(rawTokens.at(-1))
  ) {
    rawTokens.pop();
  }
  const vehicleToken = rawTokens.join("");
  const shareSlug = `${factionToken}-${vehicleToken}`;
  if (!normalizeRuntimeAttackSourceShareSlug(shareSlug)) {
    throw new Error(
      `Cannot build runtime attack source share slug: ${groupId}/${canonicalRawName}`,
    );
  }
  return shareSlug;
}
