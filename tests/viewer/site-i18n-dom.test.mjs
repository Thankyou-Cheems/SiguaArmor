import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("React hydration preserves search, numeric state, scene nodes and URLs across language changes", async () => {
  await mkdir(path.join(root, ".local"), { recursive: true });
  const output = await mkdtemp(path.join(root, ".local", "i18n-dom-test-"));
  try {
    await build({
      entryPoints: [path.join(root, "tests/fixtures/site-i18n-dom.jsx")],
      bundle: true, platform: "node", format: "esm", packages: "external",
      splitting: true, outdir: output, logLevel: "silent",
    });
    await import(pathToFileURL(path.join(output, "site-i18n-dom.js")).href);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
