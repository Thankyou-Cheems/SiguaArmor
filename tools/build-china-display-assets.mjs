import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const FACTIONS = ["ekeqie", "agesi", "shenzhou", "arctic-union", "kaweier"];

export function fingerprintedDisplayPath(legacyPath, bytes) {
  if (!legacyPath.startsWith("/china-assets/") || legacyPath.includes("..")) {
    throw new Error("China display source must stay under /china-assets/");
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const extension = path.posix.extname(legacyPath);
  return legacyPath.slice(0, -extension.length) + "-" + hash.slice(0, 16) + extension;
}

export async function buildChinaDisplayAssets() {
  const version = async (legacyPath) => {
    const source = path.join(PUBLIC, legacyPath.slice(1));
    const bytes = await readFile(source);
    const publicPath = fingerprintedDisplayPath(legacyPath, bytes);
    const destination = path.join(PUBLIC, publicPath.slice(1));
    try {
      const existing = await readFile(destination);
      if (!existing.equals(bytes)) throw new Error("Content fingerprint collision: " + publicPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await copyFile(source, destination);
    }
    return { path: publicPath, legacyPath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const manifest = {
    base: await version("/china-assets/local-preview/official/faction-impression.jpg"),
    wordmark: await version("/china-assets/local-preview/official/brand/iron-rice-hall-wordmark.png"),
    factions: {},
  };
  for (const id of FACTIONS) {
    manifest.factions[id] = {
      background: await version(`/china-assets/local-preview/official/factions/${id}-catalog-background.jpg`),
      logo: await version(`/china-assets/local-preview/official/factions/${id}-logo.webp`),
    };
  }
  await writeFile(path.join(ROOT, "generated/china-display-assets.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await buildChinaDisplayAssets();
  console.log(JSON.stringify({ assets: 2 + Object.keys(manifest.factions).length * 2, changedImageBytes: false, legacyUrlsRetained: true }));
}
