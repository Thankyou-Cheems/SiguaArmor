import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderPublicSiteConfig } from "./render-public-site-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseOutputRoot(args) {
  if (args.length !== 2 || args[0] !== "--output-root") {
    throw new Error(
      "usage: node tools/deploy/package-deployment.mjs --output-root outputs/<name>",
    );
  }
  const outputRoot = path.resolve(ROOT, args[1]);
  const allowedRoot = path.join(ROOT, "outputs");
  const relative = path.relative(allowedRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`deployment output must stay inside outputs/: ${outputRoot}`);
  }
  return outputRoot;
}

async function requireDirectory(directory) {
  if (!(await stat(directory)).isDirectory()) {
    throw new Error(`required build directory is missing: ${directory}`);
  }
}

export async function copyServiceSources(sourceRoot, outputRoot) {
  const files = execFileSync("git", ["ls-files", "-z", "--", "services"], {
    cwd: sourceRoot, encoding: "utf8",
  }).split("\0").filter(Boolean);
  for (const file of files) {
    const source = path.join(sourceRoot, file);
    try {
      await stat(source);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const target = path.join(outputRoot, file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
}

export function buildAnalyticsExecutable(sourceRoot, outputRoot) {
  const source = path.join(sourceRoot, "services", "analytics");
  const target = path.join(outputRoot, "services", "analytics", "analytics-server");
  // release.json records the product commit; unrelated commits must not restart analytics.
  execFileSync("go", ["build", "-buildvcs=false", "-trimpath", "-ldflags=-s -w", "-o", target, "."], {
    cwd: source,
    stdio: "inherit",
    env: {
      ...process.env,
      CGO_ENABLED: "0",
      GOARCH: "amd64",
      GOOS: "linux",
      GOTOOLCHAIN: "local",
    },
  });
}

export async function packageDeployment(outputRoot, { wikiRef } = {}) {
  const client = path.join(ROOT, "dist", "client");
  const standalone = path.join(ROOT, "dist", "standalone");
  const services = path.join(ROOT, "services");
  await Promise.all([
    requireDirectory(client),
    requireDirectory(standalone),
    requireDirectory(services),
  ]);

  await rm(outputRoot, { recursive: true, force: true });
  await renderPublicSiteConfig(outputRoot);
  await Promise.all([
    cp(client, path.join(outputRoot, "release", "squad"), {
      recursive: true,
    }),
    cp(
      standalone,
      path.join(outputRoot, "release", "international-runtime"),
      { recursive: true },
    ),
    copyServiceSources(ROOT, outputRoot),
  ]);
  buildAnalyticsExecutable(ROOT, outputRoot);
  await writeFile(path.join(outputRoot, "release.json"), JSON.stringify({
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    packagedAt: new Date().toISOString(),
    ...(wikiRef ? { wikiRef } : {}),
  }, null, 2) + "\n", "utf8");
  return outputRoot;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(await packageDeployment(parseOutputRoot(process.argv.slice(2))));
}
