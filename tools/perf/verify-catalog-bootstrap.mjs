import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const clientRoot = path.join(repositoryRoot, "dist", "client");
const manifestPath = path.join(clientRoot, ".vite", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const catalogEntryKey = "app/CatalogApp.tsx";
const catalogEntry = manifest[catalogEntryKey];

assert(catalogEntry, `Missing ${catalogEntryKey} in ${manifestPath}`);

const staticKeys = new Set();
function visitStaticImports(key) {
  if (staticKeys.has(key)) return;
  staticKeys.add(key);
  const entry = manifest[key];
  assert(entry, `Manifest import ${key} is missing`);
  for (const importedKey of entry.imports ?? []) visitStaticImports(importedKey);
}
visitStaticImports(catalogEntryKey);

const staticEntries = await Promise.all(
  [...staticKeys].map(async (key) => {
    const entry = manifest[key];
    const filePath = path.join(clientRoot, entry.file);
    return {
      file: entry.file,
      key,
      name: entry.name ?? key,
      size: (await stat(filePath)).size,
    };
  }),
);
const forbidden = staticEntries.filter(({ key, name }) =>
  key.includes("weapon-catalog") || name === "weapon-catalog",
);
const totalBytes = staticEntries.reduce((total, entry) => total + entry.size, 0);

console.log(JSON.stringify({
  catalogEntry: catalogEntry.file,
  staticJavaScriptBytes: totalBytes,
  staticFiles: staticEntries
    .sort((left, right) => right.size - left.size)
    .map(({ file, name, size }) => ({ file, name, size })),
  forbiddenStaticWeaponCatalogFiles: forbidden.map(({ file }) => file),
}, null, 2));

assert.equal(
  forbidden.length,
  0,
  "CatalogApp statically reaches the full weapon catalog; keep weapon mechanics behind the viewer or encyclopedia interaction",
);
