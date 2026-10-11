import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const mocks = {
  "next-link": `import React from "react"; export default function Link({children, href, prefetch: _prefetch, ...props}) { return React.createElement("a", {...props, href}, children); }`,
  "catalog-bootstrap": `export const loadInitialPublicCatalog = (...args) => globalThis.__armorCatalogHarness.initial(...args);
    export const loadPublicCatalogGroup = (...args) => globalThis.__armorCatalogHarness.group(...args);
    export const loadPublicCatalog = (...args) => globalThis.__armorCatalogHarness.full(...args);`,
  "wiki-vehicle-catalog": `export const wikiVehicleFactionIdsForGroup = () => [];
    export const mergeWikiVehicleFactionMechanics = () => ({});
    export const buildFactionCatalogFromWiki = () => new Promise(() => {});`,
  "InternationalVehicleViewer": "export default function Viewer(props) { globalThis.__armorViewerProps = props; return null; }",
};

test("real catalog React handlers keep the newest faction, failure and history intent", async () => {
  await mkdir(path.join(root, ".local"), { recursive: true });
  const output = await mkdtemp(path.join(root, ".local", "catalog-navigation-dom-"));
  try {
    await build({
      entryPoints: [path.join(root, "tests/fixtures/catalog-navigation-dom.jsx")],
      bundle: true, platform: "node", format: "esm", packages: "external",
      splitting: true, outdir: output, logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{ name: "catalog-network-fixtures", setup(builder) {
        builder.onResolve({ filter: /^next\/link$/ }, () => ({path: "next-link", namespace: "catalog-fixture"}));
        builder.onResolve({ filter: /^\.\/(?:catalog-bootstrap|wiki-vehicle-catalog|InternationalVehicleViewer)$/ }, args => {
          if (!args.importer.endsWith("app/CatalogApp.tsx")) return;
          return { path: args.path.slice(2), namespace: "catalog-fixture" };
        });
        builder.onLoad({ filter: /.*/, namespace: "catalog-fixture" }, args => ({ contents: mocks[args.path], loader: "js", resolveDir: root }));
      } }],
    });
    for (const edition of ["international", "china"]) {
      for (const scenario of ["latest", "search-location-first", "search-full-first", "search-failure", "initial-history", "initial-failure", "current-failure", "history-failure", "viewer-history"]) {
        await import(`${pathToFileURL(path.join(output, "catalog-navigation-dom.js")).href}?edition=${edition}&scenario=${scenario}`);
        await globalThis.__cleanupArmorCatalogDom?.();
      }
    }
  } finally {
    await globalThis.__cleanupArmorCatalogDom?.();
    delete globalThis.__cleanupArmorCatalogDom;
    await rm(output, { recursive: true, force: true });
  }
});
