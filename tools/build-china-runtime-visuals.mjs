import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  link,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { chinaRuntimeVisualCacheRoot } from "./china-runtime-visual-paths.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_ROOT = path.join(ROOT, "public");
const OUTPUT_ROOT = path.join(ROOT, "outputs");
const STAGED_PUBLIC_ROOT = path.join(OUTPUT_ROOT, "china-runtime-source");
const CACHE_ROOT = chinaRuntimeVisualCacheRoot(ROOT);
const RAW_INDEX_PATH = path.join(ROOT, "app", "runtime-probe-visual-index.json");
const DEFAULT_RELEASE_INDEX_PATH = path.join(
  ROOT,
  "app",
  "runtime-probe-visual-release-index.json",
);
const DEFAULT_RELEASE_MANIFEST_PATH = path.join(
  ROOT,
  "generated",
  "runtime-visual-release-manifest.json",
);
const PATCH_CONFIG_PATH = path.join(
  ROOT,
  "config",
  "china-runtime-texture-patches.json",
);
const PATCH_SOURCE_INDEX_PATH = path.join(
  ROOT,
  "generated",
  "china-runtime-probe-visual-patch-source-index.json",
);
const PATCH_SELECTION_POLICY_PATH = path.join(
  ROOT,
  "generated",
  "china-runtime-probe-visual-patch-selection-policy.json",
);
const PATCH_RELEASE_INDEX_PATH = path.join(
  ROOT,
  "generated",
  "china-runtime-probe-visual-patch-release-index.json",
);
const PATCH_RELEASE_MANIFEST_PATH = path.join(
  ROOT,
  "generated",
  "china-runtime-visual-release-manifest.json",
);
const CHINA_RELEASE_INDEX_PATH = path.join(
  ROOT,
  "app",
  "china-runtime-probe-visual-release-index.json",
);
const PATCH_AUDIT_PATH = path.join(
  ROOT,
  "generated",
  "china-runtime-texture-patch-audit.json",
);
const OPTIMIZER_PATH = path.join(ROOT, "tools", "optimize-runtime-visuals.mjs");
const CHINA_SOURCE_FACTIONS = new Set(["PLA", "RGF", "USA", "TLF", "GFI"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, stable(value[key])]),
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(stable(value), null, 2)}\n`, "utf8");
}

function inside(parent, candidate, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  invariant(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} escaped ${parent}`,
  );
}

function filePathForUrl(root, url, label) {
  invariant(
    /^\/[A-Za-z0-9_./%+ -]+$/u.test(url) && !url.includes(".."),
    `${label} is unsafe: ${url}`,
  );
  const resolved = path.resolve(root, ...decodeURIComponent(url.slice(1)).split("/"));
  inside(root, resolved, label);
  return resolved;
}

async function hardlinkOrCopy(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await link(source, destination);
  } catch (error) {
    if (["EXDEV", "EPERM", "EACCES"].includes(error?.code)) {
      await copyFile(source, destination);
      return;
    }
    if (error?.code !== "EEXIST") throw error;
    const [sourceBytes, destinationBytes] = await Promise.all([
      readFile(source),
      readFile(destination),
    ]);
    invariant(
      sourceBytes.equals(destinationBytes),
      `staged resource identity conflict: ${destination}`,
    );
  }
}

function descriptorIdentity(cardId, rawName) {
  return `${cardId}\u0000${rawName}`;
}

function occurrenceIdentity(cardId, rawName, stableOccurrenceId) {
  return `${descriptorIdentity(cardId, rawName)}\u0000${stableOccurrenceId}`;
}

function isNearWhite(red, green, blue) {
  return (
    red > 160 &&
    green > 160 &&
    blue > 160 &&
    Math.max(red, green, blue) - Math.min(red, green, blue) < 60
  );
}

function isMutedWhite(red, green, blue) {
  return (
    red > 112 &&
    green > 112 &&
    blue > 112 &&
    Math.max(red, green, blue) - Math.min(red, green, blue) < 60
  );
}

function isStrongRed(red, green, blue) {
  return (
    red > 105 &&
    red - green > 40 &&
    red - blue > 40 &&
    red > green * 1.4 &&
    red > blue * 1.4
  );
}

const IRAN_ROSE_STENCIL_COLORS = new Set([
  "129,88,82", "129,89,79", "134,79,74", "134,90,82", "134,91,82",
  "134,92,82", "134,93,85", "137,93,85", "137,94,88", "143,96,88",
  "143,97,88", "145,98,90", "148,81,82", "148,85,82", "148,89,82",
  "148,101,90", "156,85,82",
]);

function evidencePredicate(kind) {
  switch (kind) {
    case "pla-red-yellow":
      return (red, green, blue) =>
        (red > 150 && green < 145 && blue < 85) ||
        (red > 170 && green > 90 && green < 210 && blue < 90);
    case "iran-roundel":
      return (red, green, blue) => isStrongRed(red, green, blue) || isNearWhite(red, green, blue);
    case "iran-white":
      return isNearWhite;
    case "iran-white-muted":
      return isMutedWhite;
    case "iran-rose-stencil":
      return (red, green, blue) =>
        IRAN_ROSE_STENCIL_COLORS.has(`${red},${green},${blue}`);
    case "soviet-red-star":
      return isStrongRed;
    case "turkey-red-white":
      return (red, green, blue) =>
        isStrongRed(red, green, blue) || isNearWhite(red, green, blue);
    case "matv-weathered-star":
      return (red, green, blue) =>
        blue > 105 && blue - red > 8 && blue - green > 3;
    case "matv-chevron-dark":
      return (red, green, blue) =>
        Math.max(red, green, blue) < 58 &&
        Math.max(red, green, blue) - Math.min(red, green, blue) < 24;
    case "matv-chevron-tan":
      return (red, green, blue) =>
        red > 130 && green > 115 && blue < 115 && red - blue > 28;
    case "matv-chevron-double":
      return (red, green, blue) =>
        (Math.max(red, green, blue) < 58 &&
          Math.max(red, green, blue) - Math.min(red, green, blue) < 24) ||
        (red > 135 && green > 135 && blue > 135 &&
          Math.max(red, green, blue) - Math.min(red, green, blue) < 38);
    case "matv-chevron-light":
      return (red, green, blue) =>
        red > 112 && green > 112 && blue > 108 &&
        Math.max(red, green, blue) - Math.min(red, green, blue) < 38;
    default:
      throw new Error(`unsupported China texture evidence kind: ${kind}`);
  }
}

function pixelOffset(width, channels, x, y) {
  return (y * width + x) * channels;
}

function overlaps(left, top, width, height, region, padding = 0) {
  return (
    left < region.x + region.width + padding &&
    left + width + padding > region.x &&
    top < region.y + region.height + padding &&
    top + height + padding > region.y
  );
}

function desiredBorderColor(data, info, region, localX, localY) {
  const sampleX = Math.min(region.width - 1, Math.max(0, localX));
  const sampleY = Math.min(region.height - 1, Math.max(0, localY));
  const points = [
    [region.x + sampleX, region.y - 1, 1 / (sampleY + 1)],
    [region.x + sampleX, region.y + region.height, 1 / (region.height - sampleY)],
    [region.x - 1, region.y + sampleY, 1 / (sampleX + 1)],
    [region.x + region.width, region.y + sampleY, 1 / (region.width - sampleX)],
  ];
  const result = [0, 0, 0];
  let totalWeight = 0;
  for (const [x, y, weight] of points) {
    const offset = pixelOffset(info.width, info.channels, x, y);
    for (let channel = 0; channel < 3; channel += 1) {
      result[channel] += data[offset + channel] * weight;
    }
    totalWeight += weight;
  }
  return result.map((value) => value / totalWeight);
}

function tileStatistics(data, info, x, y, width, height, isEvidenceColor) {
  const sums = [0, 0, 0];
  let evidence = 0;
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      const offset = pixelOffset(info.width, info.channels, xx, yy);
      sums[0] += data[offset];
      sums[1] += data[offset + 1];
      sums[2] += data[offset + 2];
      if (isEvidenceColor(data[offset], data[offset + 1], data[offset + 2])) {
        evidence += 1;
      }
    }
  }
  const pixels = width * height;
  return { mean: sums.map((value) => value / pixels), evidence };
}

function camouflagePatch(data, info, region, allRegions, isEvidenceColor) {
  const patch = Buffer.alloc(region.width * region.height * info.channels);
  const cellSize = region.cellSize ?? 4;
  const sampleRadius = region.sampleRadius ?? 84;
  for (let tileY = 0; tileY < region.height; tileY += cellSize) {
    for (let tileX = 0; tileX < region.width; tileX += cellSize) {
      const copyWidth = Math.min(cellSize, region.width - tileX);
      const copyHeight = Math.min(cellSize, region.height - tileY);
      const desired = desiredBorderColor(
        data,
        info,
        region,
        tileX + Math.floor(copyWidth / 2),
        tileY + Math.floor(copyHeight / 2),
      );
      const left = Math.max(0, region.x - sampleRadius);
      const top = Math.max(0, region.y - sampleRadius);
      const right = Math.min(info.width - copyWidth, region.x + region.width + sampleRadius);
      const bottom = Math.min(info.height - copyHeight, region.y + region.height + sampleRadius);
      const step = Math.max(3, Math.floor(cellSize / 2));
      let selected = null;
      for (let y = top; y <= bottom; y += step) {
        for (let x = left; x <= right; x += step) {
          if (
            allRegions.some((candidate) =>
              overlaps(x, y, copyWidth, copyHeight, candidate, 5),
            )
          ) {
            continue;
          }
          const statistics = tileStatistics(
            data,
            info,
            x,
            y,
            copyWidth,
            copyHeight,
            isEvidenceColor,
          );
          if (statistics.evidence > 0) continue;
          const score =
            statistics.mean.reduce(
              (sum, value, channel) => sum + (value - desired[channel]) ** 2,
              0,
            ) +
            Math.hypot(x - region.x, y - region.y) * 0.08;
          if (!selected || score < selected.score) {
            selected = { x, y, mean: statistics.mean, score };
          }
        }
      }
      invariant(selected, `no safe camouflage sample around ${region.x},${region.y}`);
      for (let y = 0; y < copyHeight; y += 1) {
        for (let x = 0; x < copyWidth; x += 1) {
          const sourceOffset = pixelOffset(
            info.width,
            info.channels,
            selected.x + x,
            selected.y + y,
          );
          const targetOffset = ((tileY + y) * region.width + tileX + x) * info.channels;
          for (let channel = 0; channel < info.channels; channel += 1) {
            patch[targetOffset + channel] =
              channel < 3
                ? Math.max(
                    0,
                    Math.min(
                      255,
                      Math.round(
                        selected.mean[channel] +
                          (data[sourceOffset + channel] - selected.mean[channel]) * 0.3,
                      ),
                    ),
                  )
                : data[sourceOffset + channel];
          }
        }
      }
    }
  }
  return patch;
}

function clonePatch(data, info, region) {
  const patch = Buffer.alloc(region.width * region.height * info.channels);
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const sourceOffset = pixelOffset(
        info.width,
        info.channels,
        region.cloneSourceX + x,
        region.cloneSourceY + y,
      );
      const targetOffset = (y * region.width + x) * info.channels;
      data.copy(patch, targetOffset, sourceOffset, sourceOffset + info.channels);
    }
  }
  return patch;
}

function countEvidence(data, info, region, isEvidenceColor) {
  let count = 0;
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const offset = pixelOffset(
        info.width,
        info.channels,
        region.x + x,
        region.y + y,
      );
      if (isEvidenceColor(data[offset], data[offset + 1], data[offset + 2])) {
        count += 1;
      }
    }
  }
  return count;
}

async function patchTextureBytes(sourceBytes, profile) {
  const source = sharp(sourceBytes, { failOn: "error" });
  const metadata = await source.metadata();
  invariant(metadata.format === "png", `${profile.label}: source texture must be PNG`);
  invariant(
    metadata.width === 1024 && metadata.height === 1024,
    `${profile.label}: source texture must be 1024x1024`,
  );
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const original = Buffer.from(data);
  for (const region of profile.regions) {
    invariant(
      region.x > 0 &&
        region.y > 0 &&
        region.x + region.width < info.width &&
        region.y + region.height < info.height,
      `${profile.label}: patch region is outside the source texture`,
    );
    const kind = region.evidenceKind ?? "pla-red-yellow";
    const isEvidenceColor = evidencePredicate(kind);
    const evidenceBefore = countEvidence(original, info, region, isEvidenceColor);
    invariant(
      evidenceBefore >= (region.minimumEvidencePixels ?? 100),
      `${profile.label}: expected ${kind} evidence is absent at ${region.x},${region.y}`,
    );
    const patch =
      Number.isInteger(region.cloneSourceX) && Number.isInteger(region.cloneSourceY)
        ? clonePatch(original, info, region)
        : camouflagePatch(original, info, region, profile.regions, isEvidenceColor);
    for (let y = 0; y < region.height; y += 1) {
      for (let x = 0; x < region.width; x += 1) {
        const edgeDistance = Math.min(
          x + 0.5,
          y + 0.5,
          region.width - x - 0.5,
          region.height - y - 0.5,
        );
        const linear = Math.max(
          0,
          Math.min(1, (edgeDistance - 0.5) / (region.feather ?? 5)),
        );
        const weight = linear * linear * (3 - 2 * linear);
        const patchOffset = (y * region.width + x) * info.channels;
        const destinationOffset = pixelOffset(
          info.width,
          info.channels,
          region.x + x,
          region.y + y,
        );
        for (let channel = 0; channel < 3; channel += 1) {
          data[destinationOffset + channel] = Math.round(
            data[destinationOffset + channel] * (1 - weight) +
              patch[patchOffset + channel] * weight,
          );
        }
        if (
          isEvidenceColor(
            data[destinationOffset],
            data[destinationOffset + 1],
            data[destinationOffset + 2],
          )
        ) {
          for (let channel = 0; channel < 3; channel += 1) {
            data[destinationOffset + channel] = patch[patchOffset + channel];
          }
        }
      }
    }
    invariant(
      countEvidence(data, info, region, isEvidenceColor) === 0,
      `${profile.label}: evidence remains after patching`,
    );
  }
  return sharp(data, { raw: info })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

function gltfResourceUris(document) {
  return [
    ...(document.buffers ?? []).map((entry) => entry.uri),
    ...(document.images ?? []).map((entry) => entry.uri),
  ].filter((uri) => typeof uri === "string" && !uri.startsWith("data:"));
}

function gltfImageUris(document) {
  return (document.images ?? [])
    .map((entry) => entry.uri)
    .filter((uri) => typeof uri === "string" && !uri.startsWith("data:"));
}

function resolveResourcePath(gltfPath, uri, publicRoot) {
  const resolved = path.resolve(path.dirname(gltfPath), decodeURIComponent(uri));
  inside(publicRoot, resolved, "runtime visual resource");
  return resolved;
}

function adjustedPatchDescriptor(descriptor, placements) {
  const skeletalPlacements = placements.filter((placement) =>
    placement.componentClassPath.includes("SkeletalMeshComponent"),
  );
  return {
    ...descriptor,
    placements,
    requiredOccurrences: placements.length,
    sourceAssets: new Set(placements.map((placement) => placement.assetUrl)).size,
    runtimeBonePoseOccurrenceCount: skeletalPlacements.length,
    runtimeBonePoseJointCount: skeletalPlacements.reduce(
      (total, placement) => total + (placement.runtimeBonePoseJointCount ?? 0),
      0,
    ),
    runtimeBonePoseReferenceEquivalentOccurrenceCount: skeletalPlacements.filter(
      (placement) => placement.runtimeBonePoseReferenceEquivalent === true,
    ).length,
  };
}

function projectChinaDescriptor(
  descriptor,
  rawUrlByOccurrence,
  defaultManifest,
  patchManifest,
) {
  const models = new Map();
  const resources = new Map();
  const placements = descriptor.placements.map((placement) => {
    const occurrence = occurrenceIdentity(
      descriptor.cardId,
      descriptor.rawName,
      placement.stableOccurrenceId,
    );
    const rawUrl = rawUrlByOccurrence.get(occurrence);
    invariant(rawUrl, `China release placement lacks raw source mapping: ${occurrence}`);
    const entry = patchManifest.entries[rawUrl] ?? defaultManifest.entries[rawUrl];
    invariant(entry, `China release placement lacks optimized source mapping: ${rawUrl}`);
    models.set(entry.modelUrl, { bytes: entry.modelBytes, sha256: entry.modelSha256 });
    for (const resource of entry.resources) {
      resources.set(resource.url, { bytes: resource.bytes, sha256: resource.sha256 });
    }
    return { ...placement, assetUrl: entry.modelUrl };
  });
  return {
    ...descriptor,
    placements,
    sourceAssets: models.size,
    totalBytes: [...models.values(), ...resources.values()].reduce(
      (total, artifact) => total + artifact.bytes,
      0,
    ),
  };
}

async function main() {
  const jobs = process.env.SIGUA_RELEASE_VISUAL_JOBS || "2";
  const [rawIndex, defaultReleaseIndex, defaultManifest, patchConfig] =
    await Promise.all([
      readJson(RAW_INDEX_PATH),
      readJson(DEFAULT_RELEASE_INDEX_PATH),
      readJson(DEFAULT_RELEASE_MANIFEST_PATH),
      readJson(PATCH_CONFIG_PATH),
    ]);
  invariant(
    rawIndex.schemaVersion === "runtime-visual-descriptor-index/v1" &&
      rawIndex.descriptorCount === rawIndex.descriptors.length,
    "raw runtime visual index is invalid",
  );
  invariant(
    defaultReleaseIndex.schemaVersion === "runtime-visual-descriptor-index/v1" &&
      defaultReleaseIndex.descriptorCount === defaultReleaseIndex.descriptors.length,
    "default runtime visual release index is invalid",
  );
  invariant(defaultManifest.complete === true, "default runtime visual release is incomplete");
  invariant(
    patchConfig.schemaVersion === "sigua-china-runtime-texture-patches/v1",
    "China texture patch config is invalid",
  );
  const profileBySourceHash = new Map();
  for (const profile of patchConfig.profiles) {
    invariant(
      /^[0-9a-f]{64}$/u.test(profile.expectedSourceSha256) &&
        !profileBySourceHash.has(profile.expectedSourceSha256),
      `duplicate or invalid China texture source hash: ${profile.expectedSourceSha256}`,
    );
    invariant(Array.isArray(profile.regions) && profile.regions.length > 0, `${profile.label}: no regions`);
    for (const region of profile.regions) {
      evidencePredicate(region.evidenceKind ?? "pla-red-yellow");
    }
    profileBySourceHash.set(profile.expectedSourceSha256, profile);
  }

  const rawDescriptorByIdentity = new Map(
    rawIndex.descriptors.map((descriptor) => [
      descriptorIdentity(descriptor.cardId, descriptor.rawName),
      descriptor,
    ]),
  );
  const chinaReleaseDescriptors = defaultReleaseIndex.descriptors.filter((descriptor) =>
    CHINA_SOURCE_FACTIONS.has(descriptor.factionId),
  );
  invariant(chinaReleaseDescriptors.length === 213, "China runtime descriptor closure changed");
  const rawUrlByOccurrence = new Map();
  const selectedOccurrenceIds = new Set();
  for (const descriptor of chinaReleaseDescriptors) {
    const rawDescriptor = rawDescriptorByIdentity.get(
      descriptorIdentity(descriptor.cardId, descriptor.rawName),
    );
    invariant(rawDescriptor, `China descriptor has no raw source: ${descriptor.cardId}`);
    const rawPlacementById = new Map(
      rawDescriptor.placements.map((placement) => [placement.stableOccurrenceId, placement]),
    );
    for (const placement of descriptor.placements) {
      const rawPlacement = rawPlacementById.get(placement.stableOccurrenceId);
      invariant(
        rawPlacement,
        `China release occurrence has no raw placement: ${descriptor.cardId} / ${placement.stableOccurrenceId}`,
      );
      const occurrence = occurrenceIdentity(
        descriptor.cardId,
        descriptor.rawName,
        placement.stableOccurrenceId,
      );
      rawUrlByOccurrence.set(occurrence, rawPlacement.assetUrl);
      selectedOccurrenceIds.add(occurrence);
    }
  }
  const selectedRawUrls = [...new Set(rawUrlByOccurrence.values())].sort((left, right) =>
    left.localeCompare(right, "en"),
  );

  const affectedResourcesBySourceUrl = new Map();
  const matchedSourceHashes = new Set();
  for (const sourceUrl of selectedRawUrls) {
    const gltfPath = filePathForUrl(PUBLIC_ROOT, sourceUrl, "runtime visual source URL");
    const gltf = await readJson(gltfPath);
    for (const uri of gltfImageUris(gltf)) {
      const imagePath = resolveResourcePath(gltfPath, uri, PUBLIC_ROOT);
      const imageBytes = await readFile(imagePath);
      const digest = sha256(imageBytes);
      const profile = profileBySourceHash.get(digest);
      if (!profile) continue;
      invariant(
        path.basename(imagePath) === profile.fileName,
        `${profile.label}: source hash matched unexpected file ${path.basename(imagePath)}`,
      );
      matchedSourceHashes.add(digest);
      const resources = affectedResourcesBySourceUrl.get(sourceUrl) ?? new Map();
      resources.set(imagePath, { digest, profile });
      affectedResourcesBySourceUrl.set(sourceUrl, resources);
    }
  }
  invariant(affectedResourcesBySourceUrl.size > 0, "no China texture patch sources were found");
  invariant(
    matchedSourceHashes.size === patchConfig.profiles.length,
    `China texture patch closure is incomplete: matched ${matchedSourceHashes.size}/${patchConfig.profiles.length} profiles`,
  );

  inside(OUTPUT_ROOT, STAGED_PUBLIC_ROOT, "China staged runtime root");
  await rm(STAGED_PUBLIC_ROOT, { recursive: true, force: true });
  await mkdir(STAGED_PUBLIC_ROOT, { recursive: true });
  const patchedBytesBySourceHash = new Map();
  const auditApplications = [];
  for (const [sourceUrl, affectedResources] of affectedResourcesBySourceUrl) {
    const sourceGltfPath = filePathForUrl(PUBLIC_ROOT, sourceUrl, "runtime visual source URL");
    const stagedGltfPath = filePathForUrl(
      STAGED_PUBLIC_ROOT,
      sourceUrl,
      "staged runtime visual source URL",
    );
    const gltf = await readJson(sourceGltfPath);
    await hardlinkOrCopy(sourceGltfPath, stagedGltfPath);
    for (const uri of gltfResourceUris(gltf)) {
      const sourceResourcePath = resolveResourcePath(sourceGltfPath, uri, PUBLIC_ROOT);
      const stagedResourcePath = path.resolve(
        path.dirname(stagedGltfPath),
        decodeURIComponent(uri),
      );
      inside(STAGED_PUBLIC_ROOT, stagedResourcePath, "staged runtime visual resource");
      const affected = affectedResources.get(sourceResourcePath);
      if (!affected) {
        await hardlinkOrCopy(sourceResourcePath, stagedResourcePath);
        continue;
      }
      let patchedBytes = patchedBytesBySourceHash.get(affected.digest);
      if (!patchedBytes) {
        const sourceBytes = await readFile(sourceResourcePath);
        invariant(
          sha256(sourceBytes) === affected.digest,
          `${affected.profile.label}: source texture changed during staging`,
        );
        patchedBytes = await patchTextureBytes(sourceBytes, affected.profile);
        patchedBytesBySourceHash.set(affected.digest, patchedBytes);
      }
      await mkdir(path.dirname(stagedResourcePath), { recursive: true });
      await writeFile(stagedResourcePath, patchedBytes);
      auditApplications.push({
        label: affected.profile.label,
        sourceUrl,
        sourceFile: path.relative(PUBLIC_ROOT, sourceResourcePath).split(path.sep).join("/"),
        sourceSha256: affected.digest,
        patchedSha256: sha256(patchedBytes),
        regionCount: affected.profile.regions.length,
      });
    }
  }

  const patchDescriptors = rawIndex.descriptors
    .filter((descriptor) => CHINA_SOURCE_FACTIONS.has(descriptor.factionId))
    .map((descriptor) => {
      const placements = descriptor.placements.filter((placement) => {
        const occurrence = occurrenceIdentity(
          descriptor.cardId,
          descriptor.rawName,
          placement.stableOccurrenceId,
        );
        return (
          selectedOccurrenceIds.has(occurrence) &&
          affectedResourcesBySourceUrl.has(placement.assetUrl)
        );
      });
      return placements.length > 0 ? adjustedPatchDescriptor(descriptor, placements) : null;
    })
    .filter(Boolean);
  const patchSourceUrls = new Set(
    patchDescriptors.flatMap((descriptor) =>
      descriptor.placements.map((placement) => placement.assetUrl),
    ),
  );
  invariant(
    patchSourceUrls.size === affectedResourcesBySourceUrl.size &&
      [...affectedResourcesBySourceUrl.keys()].every((url) => patchSourceUrls.has(url)),
    "China patch source index does not exactly cover affected source models",
  );
  await writeJson(PATCH_SOURCE_INDEX_PATH, {
    schemaVersion: "runtime-visual-descriptor-index/v1",
    descriptorCount: patchDescriptors.length,
    descriptors: patchDescriptors,
  });
  await writeJson(PATCH_SELECTION_POLICY_PATH, {
    schemaVersion: "runtime-visual-selection-policy/v1",
    globalSuppressions: [],
    rules: [],
    synchronizedWeaponPolicy: {
      schemaVersion: "runtime-visual-weapon-synchronization/v1",
      groups: [],
    },
  });

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      OPTIMIZER_PATH,
      "--source-index",
      PATCH_SOURCE_INDEX_PATH,
      "--selection-policy",
      PATCH_SELECTION_POLICY_PATH,
      "--public-root",
      STAGED_PUBLIC_ROOT,
      "--cache-root",
      CACHE_ROOT,
      "--release-index",
      PATCH_RELEASE_INDEX_PATH,
      "--manifest",
      PATCH_RELEASE_MANIFEST_PATH,
      "--jobs",
      jobs,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  const patchManifest = await readJson(PATCH_RELEASE_MANIFEST_PATH);
  invariant(
    patchManifest.complete === true &&
      patchManifest.sourceAssetCount === affectedResourcesBySourceUrl.size,
    "China runtime visual patch optimization is incomplete",
  );
  const chinaDescriptors = chinaReleaseDescriptors.map((descriptor) =>
    projectChinaDescriptor(
      descriptor,
      rawUrlByOccurrence,
      defaultManifest,
      patchManifest,
    ),
  );
  await writeJson(CHINA_RELEASE_INDEX_PATH, {
    schemaVersion: "runtime-visual-descriptor-index/v1",
    descriptorCount: chinaDescriptors.length,
    descriptors: chinaDescriptors,
  });
  const inactiveProfiles = patchConfig.profiles
    .filter((profile) => !matchedSourceHashes.has(profile.expectedSourceSha256))
    .map((profile) => ({
      label: profile.label,
      sourceSha256: profile.expectedSourceSha256,
      status: "not-present-in-current-five-faction-runtime-closure",
    }));
  await writeJson(PATCH_AUDIT_PATH, {
    schemaVersion: "sigua-china-runtime-texture-patch-audit/v1",
    sourceBuildId: patchConfig.sourceBuildId,
    chinaDescriptorCount: chinaDescriptors.length,
    selectedRawSourceCount: selectedRawUrls.length,
    affectedRawSourceCount: affectedResourcesBySourceUrl.size,
    activeProfileCount: matchedSourceHashes.size,
    inactiveProfileCount: inactiveProfiles.length,
    applications: auditApplications,
    inactiveProfiles,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "china-runtime-visuals-complete",
      chinaDescriptorCount: chinaDescriptors.length,
      selectedRawSourceCount: selectedRawUrls.length,
      affectedRawSourceCount: affectedResourcesBySourceUrl.size,
      activeProfileCount: matchedSourceHashes.size,
      inactiveProfileCount: inactiveProfiles.length,
      releaseIndexPath: CHINA_RELEASE_INDEX_PATH,
      auditPath: PATCH_AUDIT_PATH,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
