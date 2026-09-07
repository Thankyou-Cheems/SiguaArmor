import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const editions = [
  ["international", "catalog-index.json"],
  ["china", "china-catalog-index.json"],
];

async function writeIfChanged(pathname, value) {
  const next = `${JSON.stringify(value)}\n`;
  const current = await readFile(pathname, "utf8").catch(() => null);
  if (current === next) return false;
  await writeFile(pathname, next, "utf8");
  return true;
}

async function writeTextIfChanged(pathname, next) {
  const current = await readFile(pathname, "utf8").catch(() => null);
  if (current === next) return false;
  await writeFile(pathname, next, "utf8");
  return true;
}

for (const [edition, sourceFilename] of editions) {
  const source = JSON.parse(
    await readFile(path.join(root, "generated", sourceFilename), "utf8"),
  );
  const outputDirectory = path.join(root, "generated", "catalog-bootstrap", edition);
  const groupDirectory = path.join(outputDirectory, "groups");
  await mkdir(groupDirectory, { recursive: true });
  const changed = [];
  const index = { ...source, records: [] };
  const routes = {
    schemaVersion: "1.0.0",
    routes: source.records.map((record) => ({
      groupId: record.official.groupId,
      routeSlugs: [record.routeSlug, ...record.variants.map((variant) => variant.routeSlug)],
      cardIds: [record.promoEntryId, record.defaultCardId, ...record.variants.map((variant) => variant.cardId)],
    })),
  };
  if (await writeIfChanged(path.join(outputDirectory, "index.json"), index)) {
    changed.push(`generated/catalog-bootstrap/${edition}/index.json`);
  }
  if (await writeIfChanged(path.join(outputDirectory, "routes.json"), routes)) {
    changed.push(`generated/catalog-bootstrap/${edition}/routes.json`);
  }
  const expectedFiles = new Set();
  for (const group of source.groups) {
    const filename = `${group.id}.json`;
    expectedFiles.add(filename);
    const document = {
      ...source,
      records: source.records.filter((record) => record.official.groupId === group.id),
    };
    if (await writeIfChanged(path.join(groupDirectory, filename), document)) {
      changed.push(`generated/catalog-bootstrap/${edition}/groups/${filename}`);
    }
  }
  const staleFiles = (await readdir(groupDirectory))
    .filter((filename) => filename.endsWith(".json") && !expectedFiles.has(filename));
  if (staleFiles.length > 0) {
    throw new Error(`Remove stale ${edition} catalog bootstrap files explicitly: ${staleFiles.join(", ")}`);
  }
  console.log(`${edition}: ${source.groups.length} group slices, ${changed.length} changed files`);
}

const loaderLines = [
  "import type { CatalogTopologyIndex } from \"../app/catalog-types\";",
  "",
  "export async function loadCatalogBootstrapIndex(edition: \"international\" | \"china\"): Promise<CatalogTopologyIndex> {",
  "  return edition === \"china\"",
  "    ? (await import(\"./catalog-bootstrap/china/index.json\")).default as CatalogTopologyIndex",
  "    : (await import(\"./catalog-bootstrap/international/index.json\")).default as CatalogTopologyIndex;",
  "}",
  "",
  "export async function loadCatalogBootstrapRoutes(edition: \"international\" | \"china\") {",
  "  return edition === \"china\"",
  "    ? (await import(\"./catalog-bootstrap/china/routes.json\")).default",
  "    : (await import(\"./catalog-bootstrap/international/routes.json\")).default;",
  "}",
  "",
  "export async function loadCatalogBootstrapGroup(",
  "  edition: \"international\" | \"china\",",
  "  groupId: string,",
  "): Promise<CatalogTopologyIndex> {",
  "  const key = `${edition}:${groupId}`;",
  "  switch (key) {",
];
for (const [edition, sourceFilename] of editions) {
  const source = JSON.parse(await readFile(path.join(root, "generated", sourceFilename), "utf8"));
  for (const group of source.groups) {
    loaderLines.push(
      `    case ${JSON.stringify(`${edition}:${group.id}`)}: return (await import(${JSON.stringify(`./catalog-bootstrap/${edition}/groups/${group.id}.json`)})).default as CatalogTopologyIndex;`,
    );
  }
}
loaderLines.push(
  "    default: throw new Error(`Unknown catalog bootstrap group ${key}`);",
  "  }",
  "}",
);
await writeTextIfChanged(
  path.join(root, "generated", "catalog-bootstrap-loaders.ts"),
  `${loaderLines.join("\n")}\n`,
);
