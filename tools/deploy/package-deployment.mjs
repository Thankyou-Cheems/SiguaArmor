import { cp, rm, stat } from "node:fs/promises";
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

export async function packageDeployment(outputRoot) {
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
    cp(services, path.join(outputRoot, "services"), { recursive: true }),
  ]);
  return outputRoot;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(await packageDeployment(parseOutputRoot(process.argv.slice(2))));
}
