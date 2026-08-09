import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART_ROOT = path.join(ROOT, "public", "images", "faction-art");
const SOURCE_WIDTH = 1024;
const SOURCE_HEIGHT = 1536;
const OUTPUT_WIDTH = 640;
const OUTPUT_HEIGHT = 960;

const sourceNames = (await readdir(ART_ROOT))
  .filter((name) => name.toLocaleLowerCase("en").endsWith(".png"))
  .sort();
assert.equal(sourceNames.length, 17, "expected exactly 17 faction character PNGs");

let sourceBytes = 0;
let outputBytes = 0;
const outputs = [];

for (const sourceName of sourceNames) {
  const sourcePath = path.join(ART_ROOT, sourceName);
  const outputName = sourceName.replace(/\.png$/i, ".webp");
  const outputPath = path.join(ART_ROOT, outputName);
  const sourceMetadata = await sharp(sourcePath).metadata();
  assert.equal(sourceMetadata.width, SOURCE_WIDTH, `${sourceName}: unexpected source width`);
  assert.equal(sourceMetadata.height, SOURCE_HEIGHT, `${sourceName}: unexpected source height`);
  assert.equal(sourceMetadata.hasAlpha, true, `${sourceName}: source alpha channel missing`);

  await sharp(sourcePath)
    .resize({
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 84,
      alphaQuality: 95,
      effort: 6,
      smartSubsample: true,
    })
    .toFile(outputPath);

  const outputMetadata = await sharp(outputPath).metadata();
  assert.equal(outputMetadata.format, "webp", `${outputName}: output is not WebP`);
  assert.equal(outputMetadata.width, OUTPUT_WIDTH, `${outputName}: unexpected output width`);
  assert.equal(outputMetadata.height, OUTPUT_HEIGHT, `${outputName}: unexpected output height`);
  assert.equal(outputMetadata.hasAlpha, true, `${outputName}: output alpha channel missing`);

  const sourceSize = (await stat(sourcePath)).size;
  const outputSize = (await stat(outputPath)).size;
  sourceBytes += sourceSize;
  outputBytes += outputSize;
  outputs.push({ source: sourceName, output: outputName, bytes: outputSize });
}

console.log(JSON.stringify({
  status: "built",
  assets: outputs.length,
  dimensions: `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
  sourceBytes,
  outputBytes,
  savingsPercent: Number(((1 - outputBytes / sourceBytes) * 100).toFixed(1)),
  outputs,
}, null, 2));
