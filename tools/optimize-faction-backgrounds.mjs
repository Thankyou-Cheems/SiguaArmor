import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = path.join(ROOT, "public", "images", "faction-bg");
const EXPECTED_STEMS = [
  "ADF",
  "AFU",
  "BAF",
  "CAF",
  "CRF",
  "GFI",
  "IMF",
  "INS",
  "PLA",
  "PLAAGF",
  "PLANMC",
  "RGF",
  "TLF",
  "USA",
  "USMC",
  "VDV",
  "WPMC",
];
const LEGACY_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const OUTPUT_WIDTH = 1024;
const OUTPUT_HEIGHT = 576;
const BLUR_SIGMA = 0.8;
const WEBP_QUALITY = 54;
const MAX_OUTPUT_BYTES = 96 * 1024;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    assert.match(token, /^--[a-z-]+$/, `unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    assert.ok(value && !value.startsWith("--"), `${token} requires a value`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function assertInsideRoot(candidate, label) {
  const relative = path.relative(ROOT, candidate);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${label} escaped repository root`);
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readDirectoryOrEmpty(directory) {
  if (!(await pathExists(directory))) return [];
  return readdir(directory, { withFileTypes: true });
}

function sourceCandidates(entries, stem) {
  return entries
    .filter((entry) => {
      if (!entry.isFile()) return false;
      const parsed = path.parse(entry.name);
      return parsed.name.toLocaleUpperCase("en") === stem
        && LEGACY_EXTENSIONS.has(parsed.ext.toLocaleLowerCase("en"));
    })
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
}

async function validateWebp(outputPath, sourceBytes = null) {
  const [metadata, outputStat] = await Promise.all([
    sharp(outputPath).metadata(),
    stat(outputPath),
  ]);
  assert.equal(metadata.format, "webp", `${outputPath}: output is not WebP`);
  assert.equal(metadata.width, OUTPUT_WIDTH, `${outputPath}: unexpected width`);
  assert.equal(metadata.height, OUTPUT_HEIGHT, `${outputPath}: unexpected height`);
  if (sourceBytes !== null) {
    assert.ok(outputStat.size < sourceBytes, `${outputPath}: output is not smaller than its source`);
  }
  assert.ok(outputStat.size <= MAX_OUTPUT_BYTES, `${outputPath}: output exceeds ${MAX_OUTPUT_BYTES} bytes`);
  return outputStat.size;
}

async function optimizeBackgrounds() {
  const entries = await readDirectoryOrEmpty(SOURCE_ROOT);
  if (entries.length === 0) {
    console.log(JSON.stringify({
      status: "skipped",
      reason: "faction background source directory is absent",
      sourceRoot: SOURCE_ROOT,
    }));
    return;
  }

  await mkdir(SOURCE_ROOT, { recursive: true });
  const sourceCount = EXPECTED_STEMS.reduce(
    (total, stem) => total + sourceCandidates(entries, stem).length,
    0,
  );
  if (sourceCount === 0) {
    let outputBytes = 0;
    for (const stem of EXPECTED_STEMS) {
      const outputPath = path.join(SOURCE_ROOT, `${stem}.webp`);
      assert.ok(await pathExists(outputPath), `${outputPath}: optimized WebP is missing`);
      outputBytes += await validateWebp(outputPath);
    }
    console.log(JSON.stringify({
      status: "verified",
      assets: EXPECTED_STEMS.length,
      dimensions: `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
      outputBytes,
    }, null, 2));
    return;
  }
  assert.equal(sourceCount, EXPECTED_STEMS.length, `expected ${EXPECTED_STEMS.length} source backgrounds, found ${sourceCount}`);

  const outputs = [];
  let sourceBytes = 0;
  let outputBytes = 0;

  for (const stem of EXPECTED_STEMS) {
    const candidates = sourceCandidates(entries, stem);
    assert.equal(candidates.length, 1, `${stem}: expected exactly one PNG/JPEG source, found ${candidates.join(", ") || "none"}`);
    const sourceName = candidates[0];
    const sourcePath = path.join(SOURCE_ROOT, sourceName);
    const outputName = `${stem}.webp`;
    const outputPath = path.join(SOURCE_ROOT, outputName);
    const [sourceStat, sourceMetadata] = await Promise.all([
      stat(sourcePath),
      sharp(sourcePath).metadata(),
    ]);
    assert.ok(
      (sourceMetadata.width ?? 0) >= OUTPUT_WIDTH && (sourceMetadata.height ?? 0) >= OUTPUT_HEIGHT,
      `${sourceName}: source is smaller than the optimized output`,
    );

    const optimizedBytes = await sharp(await readFile(sourcePath))
      .rotate()
      .resize({
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .blur(BLUR_SIGMA)
      .webp({
        quality: WEBP_QUALITY,
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer();
    await writeFile(outputPath, optimizedBytes);

    const outputSize = await validateWebp(outputPath, sourceStat.size);
    sourceBytes += sourceStat.size;
    outputBytes += outputSize;
    outputs.push({
      source: sourceName,
      output: outputName,
      sourceBytes: sourceStat.size,
      outputBytes: outputSize,
    });
  }

  console.log(JSON.stringify({
    status: "optimized",
    assets: outputs.length,
    dimensions: `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
    blurSigma: BLUR_SIGMA,
    webpQuality: WEBP_QUALITY,
    sourceBytes,
    outputBytes,
    savingsPercent: Number(((1 - outputBytes / sourceBytes) * 100).toFixed(1)),
    outputs,
  }, null, 2));
}

async function pruneBuiltLegacySources(distValue) {
  const distRoot = path.resolve(ROOT, distValue);
  assertInsideRoot(distRoot, "distribution faction background directory");
  const entries = await readDirectoryOrEmpty(distRoot);
  if (entries.length === 0) {
    console.log(JSON.stringify({
      status: "skipped",
      reason: "distribution faction background directory is absent",
      distRoot,
    }));
    return;
  }

  for (const stem of EXPECTED_STEMS) {
    const outputPath = path.join(distRoot, `${stem}.webp`);
    assert.ok(await pathExists(outputPath), `${outputPath}: optimized WebP is missing; refusing to prune source assets`);
  }

  let removedBytes = 0;
  const removed = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parsed = path.parse(entry.name);
    if (!EXPECTED_STEMS.includes(parsed.name.toLocaleUpperCase("en"))) continue;
    if (!LEGACY_EXTENSIONS.has(parsed.ext.toLocaleLowerCase("en"))) continue;
    const targetPath = path.join(distRoot, entry.name);
    assertInsideRoot(targetPath, "legacy faction background");
    removedBytes += (await stat(targetPath)).size;
    await rm(targetPath);
    removed.push(entry.name);
  }

  console.log(JSON.stringify({
    status: "pruned",
    distRoot,
    removed,
    removedBytes,
  }, null, 2));
}

const args = parseArgs(process.argv.slice(2));
if (args["prune-dist"]) await pruneBuiltLegacySources(args["prune-dist"]);
else await optimizeBackgrounds();
