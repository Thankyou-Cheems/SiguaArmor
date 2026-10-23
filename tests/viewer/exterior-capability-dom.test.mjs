import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../../", import.meta.url));
test("real detail component isolates late capabilities, failure fallback and livery identity", async () => {
  await mkdir(path.join(root, ".local"), { recursive: true });
  const output = await mkdtemp(path.join(root, ".local", "exterior-capability-dom-"));
  try {
    await build({ entryPoints: [path.join(root, "tests/fixtures/exterior-capability-dom.jsx")],
      bundle: true, platform: "node", format: "esm", packages: "external", outdir: output, logLevel: "silent",
      plugins: [{ name: "controlled-exterior-transport", setup(builder) {
        builder.onResolve({ filter: /^\.\/(?:RuntimeVehicleViewer|runtime-probe-preview-data)$/ }, args =>
          args.importer.endsWith("InternationalVehicleViewer.tsx") ? { path: args.path.slice(2), namespace: "controlled" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "controlled" }, args => ({ resolveDir: root,
          contents: args.path === "RuntimeVehicleViewer"
            ? 'export function RuntimeVehicleViewer(props) { globalThis.__exteriorFixture.viewer=props; return null; }'
            : 'export function runtimePreviewForCatalogBinding(...identity) { return new Promise((resolve,reject)=>globalThis.__exteriorFixture.requests.push({identity,resolve,reject})); }' }));
      } }],
    });
    await import(pathToFileURL(path.join(output, "exterior-capability-dom.js")).href);
  } finally { await rm(output, { recursive: true, force: true }); }
});
