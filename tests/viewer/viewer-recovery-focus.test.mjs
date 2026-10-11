import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("recovery respects intervening focus, hidden reference overlays and independent consumers", async () => {
  await mkdir(path.join(root, ".local"), { recursive: true });
  const output = await mkdtemp(path.join(root, ".local", "viewer-focus-test-"));
  try {
    await build({
      entryPoints: [path.join(root, "tests/fixtures/viewer-recovery-focus-dom.jsx")],
      bundle: true, platform: "node", format: "esm", packages: "external",
      splitting: true, outdir: output, logLevel: "silent",
    });
    await import(pathToFileURL(path.join(output, "viewer-recovery-focus-dom.js")).href);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
