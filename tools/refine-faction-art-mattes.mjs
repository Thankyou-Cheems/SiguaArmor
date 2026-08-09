import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART_ROOT = path.join(ROOT, "public", "images", "faction-art");
const VALIDATION_PATH = path.join(ROOT, "generated", "faction-art-matte-validation.json");
const EXPECTED_NAMES = [
  "adf",
  "afu",
  "baf",
  "caf",
  "crf",
  "gfi",
  "imf",
  "ins",
  "pla",
  "plaagf",
  "planmc",
  "rgf",
  "tlf",
  "usa",
  "usmc",
  "vdv",
  "wpmc",
];
const SOURCE_WIDTH = 1024;
const SOURCE_HEIGHT = 1536;
const OUTPUT_WIDTH = 640;
const OUTPUT_HEIGHT = 960;
const EDGE_DEPTH_LIMIT = 18;
const SPATIAL_FEATHER_END = 2.8;
const BACKGROUND_DISTANCE_START = 3;
const BACKGROUND_DISTANCE_END = 120;
const INTERIOR_OVERRIDE_START = 8;
const INTERIOR_OVERRIDE_END = 18;
const TRUSTED_COLOR_CONFIDENCE = 0.55;
const TRUSTED_COLOR_ALPHA = 128;
const FEATHER_SIGMA = 0.6;
const WEBP_QUALITY = 92;
const LOCALIZED_CORRECTION_CONFIG = {
  imf: {
    type: "restore-source-pixels",
    region: [267, 118, 273, 127],
    minimumSourceAlpha: 128,
    maximumCleanAlpha: 191,
    minimumAlphaLoss: 20,
    expectedPixelRange: [10, 30],
    reason: "restore-small-nose-notch",
  },
  pla: {
    type: "remove-neutral-background-component",
    region: [328, 136, 362, 192],
    seed: [338, 160],
    minimumAlpha: 32,
    minimumChannel: 140,
    maximumChroma: 35,
    expectedPixelRange: [240, 320],
    reason: "remove-white-patch-beside-neck-antenna",
  },
  plaagf: {
    type: "remove-neutral-background-component",
    region: [225, 95, 310, 195],
    seed: [270, 160],
    minimumAlpha: 32,
    minimumChannel: 140,
    maximumChroma: 35,
    expectedPixelRange: [1450, 1600],
    reason: "remove-white-patch-under-saluting-hand",
  },
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function alphaBounds(alpha, width, height, threshold) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, right, bottom };
}

function labelForegroundComponents(alpha, width, height, threshold = 128) {
  const pixelCount = width * height;
  const labels = new Int32Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  const sizes = [0];
  let label = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (alpha[start] < threshold || labels[start] !== 0) continue;
    label += 1;
    let stackLength = 1;
    let size = 0;
    stack[0] = start;
    labels[start] = label;

    while (stackLength > 0) {
      const pixel = stack[--stackLength];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      size += 1;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const nextY = y + offsetY;
        if (nextY < 0 || nextY >= height) continue;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          if (nextX < 0 || nextX >= width) continue;
          const next = nextY * width + nextX;
          if (alpha[next] < threshold || labels[next] !== 0) continue;
          labels[next] = label;
          stack[stackLength++] = next;
        }
      }
    }
    sizes.push(size);
  }

  assert.ok(label > 0, "source matte has no foreground component");
  let largestLabel = 1;
  for (let index = 2; index < sizes.length; index += 1) {
    if (sizes[index] > sizes[largestLabel]) largestLabel = index;
  }

  const matte = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    if (labels[index] === largestLabel) matte[index] = 1;
  }
  return {
    componentCount: label,
    componentSizes: sizes.slice(1).sort((left, right) => right - left),
    foregroundPixels: sizes[largestLabel],
    matte,
    removedPixels: sizes.reduce((sum, size, index) => (
      index === 0 || index === largestLabel ? sum : sum + size
    ), 0),
  };
}

function buildEdgeDepths(matte, width, height, depthLimit) {
  let current = matte;
  const depths = new Uint8Array(matte.length);
  for (let iteration = 0; iteration < depthLimit; iteration += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        if (current[pixel] === 0) continue;
        let surrounded = true;
        for (let offsetY = -1; offsetY <= 1 && surrounded; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (current[(y + offsetY) * width + x + offsetX] === 0) {
              surrounded = false;
              break;
            }
          }
        }
        if (surrounded) next[pixel] = 1;
        else depths[pixel] = iteration + 1;
      }
    }
    current = next;
  }
  for (let pixel = 0; pixel < current.length; pixel += 1) {
    if (current[pixel] === 1) depths[pixel] = depthLimit + 1;
  }
  return depths;
}

function estimateNeutralBackgroundLevels(raw, channels) {
  const histogram = new Uint32Array(256);
  for (let offset = 0; offset < raw.length; offset += channels) {
    if (raw[offset + 3] !== 0) continue;
    const red = raw[offset];
    const green = raw[offset + 1];
    const blue = raw[offset + 2];
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 8) continue;
    const level = Math.round((red + green + blue) / 3);
    histogram[level] += 1;
  }

  const ranked = [...histogram.keys()].sort((left, right) => histogram[right] - histogram[left]);
  const levels = [];
  for (const level of ranked) {
    if (histogram[level] === 0) break;
    if (levels.every((selected) => Math.abs(selected - level) >= 6)) levels.push(level);
    if (levels.length === 2) break;
  }
  assert.equal(levels.length, 2, "could not estimate the two checkerboard background levels");
  return levels.sort((left, right) => left - right);
}

function smoothstep(start, end, value) {
  const normalized = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return normalized * normalized * (3 - 2 * normalized);
}

function nearestBackgroundLevel(red, green, blue, levels) {
  let bestLevel = levels[0];
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const level of levels) {
    const distanceSquared = (red - level) ** 2 + (green - level) ** 2 + (blue - level) ** 2;
    if (distanceSquared < bestDistanceSquared) {
      bestLevel = level;
      bestDistanceSquared = distanceSquared;
    }
  }
  return { level: bestLevel, distance: Math.sqrt(bestDistanceSquared) };
}

function bleedForegroundColors(
  sourceRaw,
  matte,
  edgeDepths,
  colorConfidences,
  reconstructedAlpha,
  width,
  height,
) {
  const cleanedRaw = Buffer.alloc(sourceRaw.length);
  const resolved = new Uint8Array(matte.length);
  const queue = new Int32Array(matte.length);
  let queueHead = 0;
  let queueLength = 0;

  for (let pixel = 0; pixel < matte.length; pixel += 1) {
    if (matte[pixel] === 0) continue;
    const trusted = edgeDepths[pixel] > EDGE_DEPTH_LIMIT || (
      reconstructedAlpha[pixel] >= TRUSTED_COLOR_ALPHA
      && colorConfidences[pixel] >= TRUSTED_COLOR_CONFIDENCE
    );
    if (!trusted) continue;
    const offset = pixel * 4;
    cleanedRaw[offset] = sourceRaw[offset];
    cleanedRaw[offset + 1] = sourceRaw[offset + 1];
    cleanedRaw[offset + 2] = sourceRaw[offset + 2];
    resolved[pixel] = 1;
    queue[queueLength++] = pixel;
  }
  assert.ok(queueLength > 0, "matte has no trusted foreground colors");
  const trustedPixelCount = queueLength;

  while (queueHead < queueLength) {
    const pixel = queue[queueHead++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const sourceOffset = pixel * 4;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const nextY = y + offsetY;
      if (nextY < 0 || nextY >= height) continue;
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextX = x + offsetX;
        if (nextX < 0 || nextX >= width) continue;
        const next = nextY * width + nextX;
        if (matte[next] === 0 || resolved[next] === 1) continue;
        const nextOffset = next * 4;
        cleanedRaw[nextOffset] = cleanedRaw[sourceOffset];
        cleanedRaw[nextOffset + 1] = cleanedRaw[sourceOffset + 1];
        cleanedRaw[nextOffset + 2] = cleanedRaw[sourceOffset + 2];
        resolved[next] = 1;
        queue[queueLength++] = next;
      }
    }
  }
  assert.equal(queueLength, matte.reduce((sum, value) => sum + value, 0));
  return { cleanedRaw, trustedPixelCount };
}

function countAlphaLevels(raw, channels) {
  let transparent = 0;
  let partial = 0;
  let opaque = 0;
  let nearOpaque = 0;
  for (let offset = channels - 1; offset < raw.length; offset += channels) {
    const alpha = raw[offset];
    if (alpha === 0) transparent += 1;
    else if (alpha === 255) opaque += 1;
    else partial += 1;
    if (alpha >= 250) nearOpaque += 1;
  }
  return { transparent, partial, opaque, nearOpaque };
}

function boundsFromPixels(pixels, width) {
  if (pixels.length === 0) return null;
  let left = width;
  let top = Number.POSITIVE_INFINITY;
  let right = -1;
  let bottom = -1;
  for (const pixel of pixels) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom };
}

function restoreSourcePixels(cleanRaw, sourceRaw, width, config) {
  const [left, top, right, bottom] = config.region;
  const restoredPixels = [];
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const cleanAlpha = cleanRaw[offset + 3];
      const sourceAlpha = sourceRaw[offset + 3];
      if (sourceAlpha < config.minimumSourceAlpha) continue;
      if (cleanAlpha > config.maximumCleanAlpha) continue;
      if (sourceAlpha - cleanAlpha < config.minimumAlphaLoss) continue;
      sourceRaw.copy(cleanRaw, offset, offset, offset + 4);
      restoredPixels.push(pixel);
    }
  }
  return restoredPixels;
}

function removeNeutralBackgroundComponent(raw, width, height, config) {
  const [left, top, right, bottom] = config.region;
  const [seedX, seedY] = config.seed;
  assert.ok(left >= 0 && top >= 0 && right <= width && bottom <= height);
  assert.ok(seedX >= left && seedX < right && seedY >= top && seedY < bottom);

  const regionWidth = right - left;
  const regionHeight = bottom - top;
  const visited = new Uint8Array(regionWidth * regionHeight);
  const queue = new Int32Array(regionWidth * regionHeight);
  const removedPixels = [];
  let queueHead = 0;
  let queueLength = 0;

  const enqueue = (x, y) => {
    if (x < left || x >= right || y < top || y >= bottom) return;
    const regionPixel = (y - top) * regionWidth + x - left;
    if (visited[regionPixel] === 1) return;
    visited[regionPixel] = 1;
    queue[queueLength++] = y * width + x;
  };
  enqueue(seedX, seedY);

  while (queueHead < queueLength) {
    const pixel = queue[queueHead++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const offset = pixel * 4;
    const red = raw[offset];
    const green = raw[offset + 1];
    const blue = raw[offset + 2];
    const alpha = raw[offset + 3];
    const minimumChannel = Math.min(red, green, blue);
    const chroma = Math.max(red, green, blue) - minimumChannel;
    if (
      alpha < config.minimumAlpha
      || minimumChannel < config.minimumChannel
      || chroma > config.maximumChroma
    ) continue;

    removedPixels.push(pixel);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        enqueue(x + offsetX, y + offsetY);
      }
    }
  }

  for (const pixel of removedPixels) {
    const offset = pixel * 4;
    raw[offset] = 0;
    raw[offset + 1] = 0;
    raw[offset + 2] = 0;
    raw[offset + 3] = 0;
  }
  return removedPixels;
}

function applyLocalizedMatteCorrections(factionId, cleanRaw, sourceRaw, width, height) {
  const config = LOCALIZED_CORRECTION_CONFIG[factionId];
  if (!config) return [];

  let correctedPixels;
  if (config.type === "restore-source-pixels") {
    correctedPixels = restoreSourcePixels(cleanRaw, sourceRaw, width, config);
  } else {
    assert.equal(config.type, "remove-neutral-background-component");
    correctedPixels = removeNeutralBackgroundComponent(cleanRaw, width, height, config);
  }
  const [minimumExpected, maximumExpected] = config.expectedPixelRange;
  assert.ok(
    correctedPixels.length >= minimumExpected && correctedPixels.length <= maximumExpected,
    `${factionId}: localized correction changed ${correctedPixels.length} pixels; expected ${minimumExpected}-${maximumExpected}`,
  );

  return [{
    type: config.type,
    reason: config.reason,
    pixelCount: correctedPixels.length,
    pixelBounds: boundsFromPixels(correctedPixels, width),
    region: config.region,
    ...(config.seed ? { seed: config.seed } : {}),
  }];
}

const sourceNames = (await readdir(ART_ROOT))
  .filter((name) => name.toLocaleLowerCase("en").endsWith(".png"))
  .sort();
assert.deepEqual(sourceNames, EXPECTED_NAMES.map((name) => `${name}.png`));

const assets = [];
for (const sourceName of sourceNames) {
  const factionId = path.basename(sourceName, ".png");
  const sourcePath = path.join(ART_ROOT, sourceName);
  const outputName = `${factionId}-clean.webp`;
  const outputPath = path.join(ART_ROOT, outputName);
  const { data: sourceRaw, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.equal(info.width, SOURCE_WIDTH, `${sourceName}: unexpected source width`);
  assert.equal(info.height, SOURCE_HEIGHT, `${sourceName}: unexpected source height`);
  assert.equal(info.channels, 4, `${sourceName}: expected RGBA source`);

  const sourceAlpha = new Uint8Array(SOURCE_WIDTH * SOURCE_HEIGHT);
  for (let pixel = 0; pixel < sourceAlpha.length; pixel += 1) {
    sourceAlpha[pixel] = sourceRaw[pixel * 4 + 3];
  }

  const componentResult = labelForegroundComponents(sourceAlpha, SOURCE_WIDTH, SOURCE_HEIGHT);
  const edgeDepths = buildEdgeDepths(
    componentResult.matte,
    SOURCE_WIDTH,
    SOURCE_HEIGHT,
    EDGE_DEPTH_LIMIT,
  );
  const backgroundLevels = estimateNeutralBackgroundLevels(sourceRaw, info.channels);
  const reconstructedAlpha = Buffer.alloc(componentResult.matte.length);
  const colorConfidences = new Float32Array(componentResult.matte.length);
  for (let pixel = 0; pixel < componentResult.matte.length; pixel += 1) {
    if (componentResult.matte[pixel] === 0) continue;
    const sourceOffset = pixel * 4;
    const red = sourceRaw[sourceOffset];
    const green = sourceRaw[sourceOffset + 1];
    const blue = sourceRaw[sourceOffset + 2];
    const { distance: backgroundDistance } = nearestBackgroundLevel(
      red,
      green,
      blue,
      backgroundLevels,
    );
    const depth = edgeDepths[pixel];
    const spatialConfidence = smoothstep(0, SPATIAL_FEATHER_END, depth);
    const colorConfidence = smoothstep(
      BACKGROUND_DISTANCE_START,
      BACKGROUND_DISTANCE_END,
      backgroundDistance,
    );
    colorConfidences[pixel] = colorConfidence;
    const interiorConfidence = smoothstep(
      INTERIOR_OVERRIDE_START,
      INTERIOR_OVERRIDE_END,
      depth,
    );
    const alpha = Math.round(
      255 * spatialConfidence * Math.max(colorConfidence, interiorConfidence),
    );
    reconstructedAlpha[pixel] = alpha;
  }
  const { cleanedRaw, trustedPixelCount } = bleedForegroundColors(
    sourceRaw,
    componentResult.matte,
    edgeDepths,
    colorConfidences,
    reconstructedAlpha,
    SOURCE_WIDTH,
    SOURCE_HEIGHT,
  );
  const { data: featheredAlpha, info: featheredAlphaInfo } = await sharp(reconstructedAlpha, {
    raw: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, channels: 1 },
  })
    .blur(FEATHER_SIGMA)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(featheredAlphaInfo.channels, 1, `${sourceName}: feathered alpha must stay single-channel`);

  for (let pixel = 0; pixel < componentResult.matte.length; pixel += 1) {
    const sourceOffset = pixel * 4;
    cleanedRaw[sourceOffset + 3] = featheredAlpha[pixel];
  }

  let localizedCorrections = [];
  if (LOCALIZED_CORRECTION_CONFIG[factionId]) {
    const { data: resizedCleanRaw, info: resizedCleanInfo } = await sharp(cleanedRaw, {
      raw: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, channels: 4 },
    })
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data: resizedSourceRaw, info: resizedSourceInfo } = await sharp(sourceRaw, {
      raw: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, channels: 4 },
    })
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(resizedCleanInfo.channels, 4, `${sourceName}: resized clean image must be RGBA`);
    assert.equal(resizedSourceInfo.channels, 4, `${sourceName}: resized source image must be RGBA`);
    localizedCorrections = applyLocalizedMatteCorrections(
      factionId,
      resizedCleanRaw,
      resizedSourceRaw,
      OUTPUT_WIDTH,
      OUTPUT_HEIGHT,
    );

    await sharp(resizedCleanRaw, {
      raw: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 4 },
    })
      .webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toFile(outputPath);
  } else {
    await sharp(cleanedRaw, {
      raw: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, channels: 4 },
    })
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toFile(outputPath);
  }

  const outputBytes = await readFile(outputPath);
  const { data: outputRaw, info: outputInfo } = await sharp(outputBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(outputInfo.width, OUTPUT_WIDTH, `${outputName}: unexpected output width`);
  assert.equal(outputInfo.height, OUTPUT_HEIGHT, `${outputName}: unexpected output height`);
  assert.equal(outputInfo.channels, 4, `${outputName}: expected RGBA output`);
  const outputLevels = countAlphaLevels(outputRaw, outputInfo.channels);
  assert.ok(outputLevels.partial > 0, `${outputName}: antialiased alpha is missing`);
  assert.ok(outputLevels.nearOpaque > 10000, `${outputName}: subject core became translucent`);
  for (const corner of [0, OUTPUT_WIDTH - 1, (OUTPUT_HEIGHT - 1) * OUTPUT_WIDTH, OUTPUT_WIDTH * OUTPUT_HEIGHT - 1]) {
    assert.equal(outputRaw[corner * 4 + 3], 0, `${outputName}: corner must be transparent`);
  }
  const outputAlpha = new Uint8Array(OUTPUT_WIDTH * OUTPUT_HEIGHT);
  for (let pixel = 0; pixel < outputAlpha.length; pixel += 1) {
    outputAlpha[pixel] = outputRaw[pixel * 4 + 3];
  }
  const outputComponents = labelForegroundComponents(
    outputAlpha,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT,
    32,
  );
  assert.ok(outputComponents.foregroundPixels > 10000, `${outputName}: main subject component is too small`);

  assets.push({
    factionId,
    source: `/images/faction-art/${sourceName}`,
    output: `/images/faction-art/${outputName}`,
    outputBytes: outputBytes.length,
    outputSha256: sha256(outputBytes),
    sourceComponentCount: componentResult.componentCount,
    removedComponentCount: componentResult.componentCount - 1,
    removedPixels: componentResult.removedPixels,
    estimatedBackgroundLevels: backgroundLevels,
    trustedColorPixels: trustedPixelCount,
    localizedCorrections,
    outputAlphaLevels: outputLevels,
    outputComponentCountAlpha32: outputComponents.componentCount,
    outputComponentSizesAlpha32: outputComponents.componentSizes,
    outputDetachedPixelsAlpha32: outputComponents.componentSizes
      .slice(1)
      .reduce((sum, size) => sum + size, 0),
    outputBoundsAlpha32: alphaBounds(outputAlpha, OUTPUT_WIDTH, OUTPUT_HEIGHT, 32),
  });
}

const validation = {
  schemaVersion: "faction-art-matte-validation/v1",
  status: "passed",
  sourcePolicy: "preserve-source-pngs-and-apply-source-faithful-localized-matte-repairs",
  parameters: {
    keepLargestConnectedComponent: true,
    edgeDepthLimit: EDGE_DEPTH_LIMIT,
    spatialFeatherEnd: SPATIAL_FEATHER_END,
    backgroundDistanceRange: [BACKGROUND_DISTANCE_START, BACKGROUND_DISTANCE_END],
    interiorOverrideRange: [INTERIOR_OVERRIDE_START, INTERIOR_OVERRIDE_END],
    trustedColorConfidence: TRUSTED_COLOR_CONFIDENCE,
    trustedColorAlpha: TRUSTED_COLOR_ALPHA,
    featherSigma: FEATHER_SIGMA,
    transparentRgb: [0, 0, 0],
    outputDimensions: [OUTPUT_WIDTH, OUTPUT_HEIGHT],
    webpAlphaQuality: 100,
    webpQuality: WEBP_QUALITY,
    localizedCorrectionFactionIds: Object.keys(LOCALIZED_CORRECTION_CONFIG),
  },
  assetCount: assets.length,
  assets,
};
await writeFile(VALIDATION_PATH, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
console.log(JSON.stringify(validation, null, 2));
