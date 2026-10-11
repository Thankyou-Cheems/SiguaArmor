import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("real OrbitControls root listeners are released before React detaches the viewer", async () => {
  await mkdir(path.join(root, ".local"), { recursive: true });
  const output = await mkdtemp(path.join(root, ".local", "viewer-teardown-test-"));
  const mockThree = path.join(root, "tests/fixtures/runtime-viewer-failure-three.mjs");
  try {
    await build({
      entryPoints: [path.join(root, "tests/fixtures/runtime-viewer-teardown-dom.jsx")],
      bundle: true, platform: "node", format: "esm", packages: "external",
      splitting: true, outdir: output, logLevel: "silent",
      plugins: [{ name: "renderer-only-probe", setup(build) {
        build.onResolve({ filter: /^three$/ }, (args) => args.importer === mockThree
          ? { path: "three", external: true } : { path: mockThree });
      } }],
    });
    await import(pathToFileURL(path.join(output, "runtime-viewer-teardown-dom.js")).href);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
