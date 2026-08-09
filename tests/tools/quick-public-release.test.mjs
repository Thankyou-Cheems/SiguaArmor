import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  publicReleaseBuildMode,
} from "../../tools/build-public-release.mjs";
import {
  parseUnifiedPublicDeltaOptions,
  readReleaseOverlayEntries,
} from "../../tools/build-unified-public-delta.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("public release build mode is explicit and fails closed", () => {
  assert.equal(publicReleaseBuildMode([]), "full");
  assert.equal(publicReleaseBuildMode(["--quick"]), "quick");
  assert.throws(
    () => publicReleaseBuildMode(["--quick", "--unknown"]),
    /unsupported public release build arguments/u,
  );
  assert.throws(
    () => publicReleaseBuildMode(["--unknown"]),
    /unsupported public release build arguments/u,
  );
});

test("quick release reuses a sealed public closure and emits a receipt", async () => {
  const [packageDocument, builderSource] = await Promise.all([
    readFile(path.join(ROOT, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "tools", "build-public-release.mjs"), "utf8"),
  ]);

  assert.equal(
    packageDocument.scripts["build:quick"],
    "node tools/build-public-release.mjs --quick",
  );
  assert.equal(
    packageDocument.scripts["build:full"],
    "node tools/build-public-release.mjs",
  );
  assert.match(builderSource, /if \(buildMode === "full"\) \{/u);
  assert.match(
    builderSource,
    /reuse and verify the existing prepared public closure/u,
  );
  assert.match(builderSource, /snapshotPreparedPublicClosure\(\)/u);
  assert.match(builderSource, /assertPreparedPublicClosureUnchanged/u);
  assert.match(builderSource, /writeQuickReleaseReceipt/u);
  assert.match(builderSource, /sigua-quick-release-receipt\/v1/u);
});

test("release input closure tolerates Windows line endings for text inputs", async () => {
  const source = await readFile(
    path.join(ROOT, "tools", "finalize-public-release.mjs"),
    "utf8",
  );
  assert.match(source, /normalizedTextSha256/u);
  assert.match(source, /replace\(\/\\r\\n\?\/gu, "\\n"\)/u);
  assert.match(
    source,
    /exactSha256 === entry\.sha256 \|\| normalizedTextSha256 === entry\.sha256/u,
  );
});

test("full builds consume approved public assets without Research tooling", async () => {
  const source = await readFile(
    path.join(ROOT, "tools", "build-public-release.mjs"),
    "utf8",
  );

  assert.match(source, /public-assets["'], ["']restore\.mjs/u);
  assert.match(source, /public-assets["'], ["']prepare\.mjs/u);
  assert.doesNotMatch(source, /prepare-public-release\.mjs/u);
  assert.doesNotMatch(source, /tools["'], ["']editor/u);
  assert.doesNotMatch(source, /tools["'], ["']runtime-probe/u);
});

test("delta packaging requires one exact source commit and a named live base", () => {
  const options = parseUnifiedPublicDeltaOptions([
    "--base-manifest",
    "outputs/live-release-manifest.json",
    "--release-id",
    "20260727-quick-ui-1234567",
    "--source-commit",
    "1".repeat(40),
  ]);

  assert.equal(options.releaseId, "20260727-quick-ui-1234567");
  assert.equal(options.sourceCommit, "1".repeat(40));
  assert.match(
    options.baseManifestPath.replaceAll("\\", "/"),
    /outputs\/live-release-manifest\.json$/u,
  );
  assert.equal(options.overlayManifestPath, null);
  assert.throws(
    () => parseUnifiedPublicDeltaOptions([
      "--base-manifest",
      "outputs/live-release-manifest.json",
      "--release-id",
      "unsafe/id",
      "--source-commit",
      "1".repeat(40),
    ]),
    /invalid release ID/u,
  );
});

test("delta packaging accepts a bounded non-generated release overlay", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "sigua-overlay-"));
  context.after(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  await writeFile(path.join(temporaryRoot, "mobile.html"), "new domain\n", "utf8");
  const overlayPath = path.join(temporaryRoot, "overlay.json");
  await writeFile(
    overlayPath,
    JSON.stringify({
      schemaVersion: "sigua-unified-public-overlay/v1",
      entries: [{ path: "sigua/mobile.html", source: "mobile.html" }],
    }),
    "utf8",
  );

  const overlay = await readReleaseOverlayEntries(overlayPath);
  assert.equal(overlay.entries.length, 1);
  assert.deepEqual(overlay.removePaths, []);
  assert.deepEqual(overlay.entries[0].entry, {
    path: "sigua/mobile.html",
    bytes: 11,
    sha256: "fcaa64b465d14ae7d3d78d6379f506875f3b24e22f5fc8c3f3bc7831d0d83e4b",
  });
  assert.equal(overlay.entries[0].create, false);

  await writeFile(
    overlayPath,
    JSON.stringify({
      schemaVersion: "sigua-unified-public-overlay/v1",
      entries: [
        {
          path: "navigator/index.html",
          source: "mobile.html",
          create: true,
        },
      ],
    }),
    "utf8",
  );
  const creationOverlay = await readReleaseOverlayEntries(overlayPath);
  assert.equal(creationOverlay.entries[0].create, true);
  assert.equal(creationOverlay.entries[0].entry.path, "navigator/index.html");

  await writeFile(
    overlayPath,
    JSON.stringify({
      schemaVersion: "sigua-unified-public-overlay/v1",
      entries: [
        {
          path: "navigator/index.html",
          source: "mobile.html",
          create: "yes",
        },
      ],
    }),
    "utf8",
  );
  await assert.rejects(
    readReleaseOverlayEntries(overlayPath),
    /create flag must be boolean/u,
  );

  await writeFile(
    overlayPath,
    JSON.stringify({
      schemaVersion: "sigua-unified-public-overlay/v1",
      entries: [{ path: "squad/index.html", source: "mobile.html" }],
    }),
    "utf8",
  );
  await assert.rejects(
    readReleaseOverlayEntries(overlayPath),
    /authoritative generated path/u,
  );

  await writeFile(
    overlayPath,
    JSON.stringify({
      schemaVersion: "sigua-unified-public-overlay/v1",
      entries: [],
      removePaths: ["sigua/mobile.html"],
    }),
    "utf8",
  );
  const removalOverlay = await readReleaseOverlayEntries(overlayPath);
  assert.deepEqual(removalOverlay.removePaths, ["sigua/mobile.html"]);
  assert.deepEqual(removalOverlay.entries, []);
});
