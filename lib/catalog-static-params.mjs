import international from "../generated/catalog-bootstrap/international/routes.json" with { type: "json" };
import china from "../generated/catalog-bootstrap/china/routes.json" with { type: "json" };

// Build-time route names only. Shared vehicle facts still load from Wiki in the browser.
export function catalogStaticParams(edition, parameter) {
  const catalog = { international, china }[edition];
  if (!catalog) throw new Error(`Unknown catalog edition: ${edition}`);
  if (!["groupId", "cardId"].includes(parameter)) throw new Error(`Unknown route parameter: ${parameter}`);
  const values = catalog.routes.flatMap((route) => parameter === "groupId"
    ? [route.groupId]
    : [...route.routeSlugs, ...route.cardIds]);
  return [...new Set(values)].map((value) => ({ [parameter]: value }));
}
