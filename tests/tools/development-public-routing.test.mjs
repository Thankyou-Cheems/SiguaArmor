import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const [
  packageDocument,
  devServerSource,
  viteSource,
  catalogAppSource,
  releaseBuildSource,
] =
  await Promise.all([
    readFile(path.join(ROOT, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "tools", "run-dev-server.mjs"), "utf8"),
    readFile(path.join(ROOT, "vite.config.ts"), "utf8"),
    readFile(path.join(ROOT, "app", "CatalogApp.tsx"), "utf8"),
    readFile(path.join(ROOT, "tools", "build-public-release.mjs"), "utf8"),
  ]);

test("development serves the mutable worktree public directory", () => {
  assert.equal(packageDocument.scripts["dev:prepare"], undefined);
  assert.match(
    devServerSource,
    /const DEVELOPMENT_PUBLIC = path\.join\(ROOT, "public"\)/u,
  );
  assert.match(
    devServerSource,
    /SIGUA_DEVELOPMENT_PUBLIC_DIR: DEVELOPMENT_PUBLIC/u,
  );
  assert.doesNotMatch(
    devServerSource,
    /resolveDevelopmentPublicDirectory|development-public-closure/u,
  );
  assert.match(
    catalogAppSource,
    /process\.env\.NODE_ENV === "development" \? "no-store" : "force-cache"/u,
  );
});

test("development uses application-native catalog routes", () => {
  assert.match(
    catalogAppSource,
    /process\.env\.NODE_ENV === "development"[\s\S]*siteEdition === "china"[\s\S]*"\/china"[\s\S]*siteEditionBasePath\(siteEdition\)/u,
  );
  assert.doesNotMatch(viteSource, /developmentEditionRoutes/u);
});

test("sealed public roots remain the release default", () => {
  const developmentIndex = viteSource.indexOf(
    "process.env.SIGUA_DEVELOPMENT_PUBLIC_DIR",
  );
  const releaseIndex = viteSource.indexOf(
    "process.env.SIGUA_RELEASE_PUBLIC_DIR",
  );
  const sealedDefaultIndex = viteSource.indexOf('".release/public"');
  assert.ok(developmentIndex >= 0);
  assert.ok(releaseIndex > developmentIndex);
  assert.ok(sealedDefaultIndex > releaseIndex);
  assert.match(
    releaseBuildSource,
    /SIGUA_RELEASE_PUBLIC_DIR: RELEASE_PUBLIC/u,
  );
});
