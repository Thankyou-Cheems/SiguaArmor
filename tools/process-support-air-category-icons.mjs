import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionId = process.argv[2];
if (!sessionId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(sessionId)) {
  throw new Error("Pass the exact support-air icon export session ID");
}

const sessionRoot = path.join(root, "outputs", "support-air-icons", sessionId);
const sourceManifestPath = path.join(sessionRoot, "manifest.json");
const sourceManifestBytes = await readFile(sourceManifestPath);
const sourceManifest = JSON.parse(sourceManifestBytes.toString("utf8"));
if (
  sourceManifest.schemaVersion !== "support-air-category-icon-editor-export/v1" ||
  sourceManifest.status !== "completed" ||
  sourceManifest.assetCount !== 5 ||
  sourceManifest.assets?.length !== 5
) {
  throw new Error("Support-air category icon Editor export is incomplete");
}

const outputRoot = path.join(
  root,
  "public",
  "images",
  "game-ui",
  "vehicle-categories",
);
await mkdir(outputRoot, { recursive: true });
const outputs = [];
for (const source of sourceManifest.assets) {
  const sourcePath = path.resolve(source.output);
  if (!sourcePath.startsWith(`${sessionRoot}${path.sep}`)) {
    throw new Error(`Support-air icon source escapes its session: ${sourcePath}`);
  }
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  if (sourceSha256 !== source.sha256 || sourceBytes.byteLength !== source.bytes) {
    throw new Error(`Support-air icon source hash differs: ${source.assetId}`);
  }
  const outputPath = path.join(outputRoot, `${source.assetId}.webp`);
  await sharp(sourceBytes)
    .resize(128, 128, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ lossless: true, alphaQuality: 100 })
    .toFile(outputPath);
  const outputBytes = await readFile(outputPath);
  outputs.push({
    assetId: source.assetId,
    sourceObjectPath: source.sourceObjectPath,
    sourcePngSha256: source.sha256,
    path: path.relative(root, outputPath).split(path.sep).join("/"),
    width: 128,
    height: 128,
    bytes: outputBytes.byteLength,
    sha256: createHash("sha256").update(outputBytes).digest("hex"),
  });
}

outputs.sort((left, right) => left.assetId.localeCompare(right.assetId, "en"));
const result = {
  schemaVersion: "support-air-category-icons/v1",
  status: "complete",
  sessionId,
  sourceManifest: {
    path: path.relative(root, sourceManifestPath).split(path.sep).join("/"),
    sha256: createHash("sha256").update(sourceManifestBytes).digest("hex"),
  },
  assetCount: outputs.length,
  assets: outputs,
};
const outputManifest = path.join(root, "generated", "support-air-category-icons.json");
await writeFile(outputManifest, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result)}\n`);
