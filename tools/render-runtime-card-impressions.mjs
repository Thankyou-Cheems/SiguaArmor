import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { chinaRuntimeVisualCacheRoot } from "./china-runtime-visual-paths.mjs";
import { resolvePublicArtifactPath } from "./worktree-runtime-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BROWSER_PROCESS_HELPER = path.join(
  ROOT,
  "tools",
  "card-browser-profile-processes.ps1",
);
const EDITION_CONFIGS = Object.freeze({
  international: Object.freeze({
    edition: "international",
    catalogPath: path.join(ROOT, "generated", "catalog-index.json"),
    visualIndexPath: path.join(ROOT, "app", "runtime-probe-visual-review-index.json"),
    selectionPolicyPath: path.join(ROOT, "app", "runtime-probe-visual-selection-policy.json"),
    outputManifest: path.join(ROOT, "generated", "runtime-probe-card-impressions.json"),
    outputRoot: path.join(ROOT, "public", "images", "vehicle-impressions"),
    outputUrlRoot: "/images/vehicle-impressions",
    assetUrlPrefixes: ["/assets/runtime-probe/visuals/"],
  }),
  china: Object.freeze({
    edition: "china",
    catalogPath: path.join(ROOT, "generated", "china-catalog-index.json"),
    visualIndexPath: path.join(ROOT, "app", "china-runtime-probe-visual-release-index.json"),
    selectionPolicyPath: path.join(
      ROOT,
      "generated",
      "china-runtime-probe-visual-patch-selection-policy.json",
    ),
    outputManifest: path.join(
      ROOT,
      "generated",
      "china-runtime-probe-card-impressions.json",
    ),
    outputRoot: path.join(ROOT, "public", "images", "china-vehicle-impressions"),
    outputUrlRoot: "/images/china-vehicle-impressions",
    assetUrlPrefixes: ["/assets/runtime-probe/models/"],
  }),
});
const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const SETTINGS = Object.freeze({
  width: 640,
  height: 360,
  format: "webp",
  quality: 82,
  alphaQuality: 88,
  effort: 5,
  // The published z-up camera is mirrored across the vehicle's longitudinal
  // plane, then converted to RuntimeProbe's y-up glTF coordinates. This puts
  // the vehicle's front toward the lower-right of the card.
  cameraDirection: [1.7, 1.25, 2.7],
  cameraFovDeg: 32,
  framingScale: 1.08,
  helicopterFramingScale: 0.62,
  lighting: {
    exposure: 1.18,
    hemisphere: { sky: 0xeaf2ff, ground: 0x342c24, intensity: 1.8 },
    key: { color: 0xffefd8, intensity: 4.35, position: [6.5, -8.5, 10.5] },
    fill: { color: 0x9fc6ff, intensity: 1.55, position: [-7, 2.5, 5.5] },
    rim: { color: 0xffc978, intensity: 1.75, position: [-4.5, 8, 8] },
    front: { color: 0xffffff, intensity: 0.55, position: [3, 5, 4] },
  },
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalTextBytes(bytes) {
  return Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"), "utf8");
}

function identityKey(cardId, rawName) {
  return `${cardId}\u0000${rawName}`;
}

export function runtimeCardImpressionEditionConfig(edition) {
  const config = EDITION_CONFIGS[edition];
  invariant(config, `unsupported card impression edition: ${edition}`);
  return config;
}

function renderSourceSha256(entry) {
  return sha256(Buffer.from(JSON.stringify({
    packageSha256: entry.packageSha256,
    identitySha256: entry.identitySha256,
    sourceDescriptorSha256: entry.sourceDescriptorSha256,
    sourceAssetCount: entry.sourceAssetCount,
    sourceOccurrenceCount: entry.sourceOccurrenceCount,
    selection: entry.selection,
    isHelicopter: entry.isHelicopter,
    placements: entry.placements,
  }), "utf8"));
}

function mimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".bin": return "application/octet-stream";
    case ".gltf": return "model/gltf+json";
    case ".js": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

function parseOptions(argv) {
  const cardIds = [];
  const variantKeys = [];
  let edition = "international";
  let outputRoot = null;
  let outputManifest = null;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--edition") {
      invariant(argv[index + 1], "--edition requires international or china");
      edition = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("--edition=")) {
      edition = argument.slice("--edition=".length);
    } else if (argument === "--card") {
      invariant(argv[index + 1], "--card requires an exact card ID");
      cardIds.push(argv[index + 1]);
      index += 1;
    } else if (argument.startsWith("--card=")) {
      cardIds.push(argument.slice("--card=".length));
    } else if (argument === "--variant") {
      invariant(argv[index + 1], "--variant requires cardId::rawName");
      variantKeys.push(argv[index + 1]);
      index += 1;
    } else if (argument.startsWith("--variant=")) {
      variantKeys.push(argument.slice("--variant=".length));
    } else if (argument === "--output-root") {
      invariant(argv[index + 1], "--output-root requires a directory");
      outputRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument.startsWith("--output-root=")) {
      outputRoot = path.resolve(argument.slice("--output-root=".length));
    } else if (argument === "--output-manifest") {
      invariant(argv[index + 1], "--output-manifest requires a file");
      outputManifest = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument.startsWith("--output-manifest=")) {
      outputManifest = path.resolve(argument.slice("--output-manifest=".length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  const config = runtimeCardImpressionEditionConfig(edition);
  return {
    edition,
    cardIds: [...new Set(cardIds)],
    variantKeys: [...new Set(variantKeys)],
    outputRoot: outputRoot ?? config.outputRoot,
    outputManifest: outputManifest ?? config.outputManifest,
  };
}

async function firstExistingFile(candidates) {
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Microsoft Edge or Google Chrome was not found");
}

async function removeDirectoryWithRetry(directoryPath, attempts = 12) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(directoryPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function renameWithWindowsRetry(sourcePath, destinationPath, attempts = 12) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      if (!["EACCES", "EBUSY", "EPERM"].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function browserProfileProcessCount(profilePath) {
  if (process.platform !== "win32") return 0;
  return new Promise((resolve, reject) => {
    execFile("pwsh.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", BROWSER_PROCESS_HELPER], {
      windowsHide: true,
      env: {
        ...process.env,
        SIGUA_CARD_BROWSER_PROCESS_MODE: "count",
        SIGUA_CARD_BROWSER_PROFILE: profilePath,
      },
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(Number.parseInt(JSON.parse(stdout).count, 10) || 0);
    });
  });
}

async function stopBrowserProfileProcesses(profilePath) {
  if (process.platform !== "win32") return;
  await new Promise((resolve, reject) => {
    execFile("pwsh.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", BROWSER_PROCESS_HELPER], {
      windowsHide: true,
      env: {
        ...process.env,
        SIGUA_CARD_BROWSER_PROCESS_MODE: "stop",
        SIGUA_CARD_BROWSER_PROFILE: profilePath,
      },
    }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function readRequestBody(request, maxBytes = 16 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.byteLength;
    invariant(total <= maxBytes, "card impression capture exceeds byte limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function matchesSuppression(rule, placement) {
  return rule.componentNames.includes(placement.name) &&
    (!rule.sourceMeshPaths || rule.sourceMeshPaths.includes(placement.sourceMeshPath)) &&
    (!rule.actorIncludes || rule.actorIncludes.some((needle) => placement.actor.includes(needle)));
}

function applyVisualSelection(descriptor, policy) {
  const globalSuppressionRules = policy.globalSuppressions ?? [];
  const globallySuppressed = new Set(
    descriptor.placements
      .filter((placement) => globalSuppressionRules.some((rule) => matchesSuppression(rule, placement)))
      .map((placement) => placement.stableOccurrenceId),
  );
  const globallyFiltered = descriptor.placements.filter(
    (placement) => !globallySuppressed.has(placement.stableOccurrenceId),
  );
  const rule = (policy.rules ?? []).find(
    (candidate) => candidate.cardId === descriptor.cardId && candidate.rawName === descriptor.rawName,
  );
  if (!rule) return { placements: globallyFiltered, selection: null };

  const managedNames = new Set(rule.suppressComponentNames);
  const targetPlacements = globallyFiltered.filter(
    (placement) => placement.name === rule.target.componentName &&
      rule.target.actorIncludes.some((needle) => placement.actor.includes(needle)),
  );
  const managedPlacements = globallyFiltered.filter(
    (placement) => managedNames.has(placement.name) &&
      (!rule.suppressActorIncludes || rule.suppressActorIncludes.some((needle) => placement.actor.includes(needle))),
  );
  invariant(
    targetPlacements.length > 0 && (rule.suppressActorIncludes || managedPlacements.length > 0),
    `visual selection matched no target for ${descriptor.cardId} / ${descriptor.rawName}`,
  );
  const selected = targetPlacements[0];
  const selectedIds = new Set([selected.stableOccurrenceId]);
  const managedIds = new Set(managedPlacements.map((placement) => placement.stableOccurrenceId));
  const placements = globallyFiltered.filter(
    (placement) => !managedIds.has(placement.stableOccurrenceId) || selectedIds.has(placement.stableOccurrenceId),
  );
  return {
    placements,
    selection: {
      mode: rule.selectionMode,
      label: rule.label,
      selectedOccurrences: 1,
      filteredOccurrences: managedPlacements.filter(
        (placement) => !selectedIds.has(placement.stableOccurrenceId),
      ).length,
    },
  };
}

export function flattenCatalog(catalog) {
  const entries = [];
  const cards = [];
  if (Array.isArray(catalog.factions)) {
    for (const faction of catalog.factions) {
      for (const card of faction.cards ?? []) {
        const variants = card.variants ?? [];
        invariant(variants.length > 0, `catalog card has no variants: ${card.cardId}`);
        cards.push({
          cardId: card.cardId,
          displayName: card.displayName,
          type: card.type,
          factionId: faction.id,
          defaultVariantRawName: variants[0].rawName,
        });
        for (const variant of variants) {
          entries.push({
            key: identityKey(card.cardId, variant.rawName),
            cardId: card.cardId,
            rawName: variant.rawName,
            variant: variant.label,
            displayName: card.displayName,
            type: card.type,
            factionId: faction.id,
            isHelicopter: card.type === "UH" || card.type === "AH",
          });
        }
      }
    }
    return { entries, cards };
  }

  invariant(Array.isArray(catalog.records), "catalog has neither factions nor China records");
  for (const record of catalog.records) {
    const variants = record.variants ?? [];
    invariant(variants.length > 0, `China catalog card has no variants: ${record.promoEntryId}`);
    invariant(
      variants.some((variant) => variant.sourceRawName === record.selectedRawName),
      `China catalog default variant is absent: ${record.promoEntryId}/${record.selectedRawName}`,
    );
    const type = record.official?.typeZh ?? "";
    const displayName = record.official?.nameZh ?? record.selectedDisplayName;
    const factionId = record.official?.groupId ?? "";
    cards.push({
      cardId: record.promoEntryId,
      displayName,
      type,
      factionId,
      defaultVariantRawName: record.selectedRawName,
    });
    for (const variant of variants) {
      entries.push({
        key: identityKey(record.promoEntryId, variant.sourceRawName),
        cardId: record.promoEntryId,
        rawName: variant.sourceRawName,
        variant: variant.displayName,
        displayName,
        type,
        factionId,
        isHelicopter: type === "UH" || type === "AH",
      });
    }
  }
  return { entries, cards };
}

export function buildRenderEntries({
  catalogEntries,
  visualIndex,
  selectionPolicy,
  assetUrlPrefixes = EDITION_CONFIGS.international.assetUrlPrefixes,
}) {
  invariant(visualIndex.schemaVersion === "runtime-visual-descriptor-index/v1", "unsupported runtime visual index");
  invariant(visualIndex.descriptorCount === visualIndex.descriptors.length, "runtime visual index count mismatch");
  const descriptorByKey = new Map();
  visualIndex.descriptors.forEach((descriptor, index) => {
    const key = identityKey(descriptor.cardId, descriptor.rawName);
    invariant(!descriptorByKey.has(key), `duplicate runtime visual identity: ${key}`);
    invariant(
      descriptor.status === "complete" && descriptor.visualAcceptanceStatus === "web-usable" && descriptor.webUsable === true,
      `non-web-usable descriptor cannot be rendered: ${key}`,
    );
    const sourceRow = visualIndex.sources?.[index];
    descriptorByKey.set(key, {
      ...descriptor,
      sourceDescriptorSha256: sourceRow?.sha256 ?? null,
    });
  });
  const catalogKeys = new Set(catalogEntries.map((entry) => entry.key));
  invariant(descriptorByKey.size === catalogKeys.size, `catalog/visual variant count mismatch: ${catalogKeys.size}/${descriptorByKey.size}`);
  for (const key of catalogKeys) invariant(descriptorByKey.has(key), `catalog variant has no visual descriptor: ${key}`);
  for (const key of descriptorByKey.keys()) invariant(catalogKeys.has(key), `visual descriptor has no catalog variant: ${key}`);

  return catalogEntries.map((catalogEntry) => {
    const descriptor = descriptorByKey.get(catalogEntry.key);
    const selected = applyVisualSelection(descriptor, selectionPolicy);
    const placements = selected.placements.map((placement) => ({
      stableOccurrenceId: placement.stableOccurrenceId,
      name: placement.name,
      actor: placement.actor,
      assetUrl: placement.assetUrl,
      matrix: placement.matrix,
    }));
    invariant(placements.length > 0, `visual descriptor has no renderable placements: ${catalogEntry.key}`);
    for (const placement of placements) {
      invariant(
        typeof placement.assetUrl === "string" &&
          assetUrlPrefixes.some((prefix) => placement.assetUrl.startsWith(prefix)),
        `unsupported visual asset URL: ${catalogEntry.key} / ${placement.assetUrl}`,
      );
      invariant(Array.isArray(placement.matrix) && placement.matrix.length === 16, `invalid placement matrix: ${catalogEntry.key}`);
    }
    const renderEntry = {
      ...catalogEntry,
      packageSha256: descriptor.packageSha256,
      identitySha256: descriptor.identitySha256,
      sourceDescriptorSha256: descriptor.sourceDescriptorSha256,
      sourceAssetCount: new Set(placements.map(({ assetUrl }) => assetUrl)).size,
      sourceOccurrenceCount: placements.length,
      selection: selected.selection,
      placements,
    };
    return {
      ...renderEntry,
      renderSourceSha256: renderSourceSha256(renderEntry),
    };
  });
}

function rendererPage() {
  const settings = JSON.stringify(SETTINGS);
  return `<!doctype html>
<meta charset="utf-8">
<title>SiguaArmor runtime card impression renderer</title>
<style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/repo/node_modules/three/build/three.module.js","three/addons/":"/repo/node_modules/three/examples/jsm/"}}</script>
<canvas id="render" width="${SETTINGS.width}" height="${SETTINGS.height}"></canvas>
<script type="module">
import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const settings = ${settings};
const canvas = document.querySelector("#render");
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(settings.width, settings.height, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = settings.lighting.exposure;

const camera = new PerspectiveCamera(settings.cameraFovDeg, settings.width / settings.height, 0.01, 1000);
camera.up.set(0, 1, 0);
const scene = new Scene();
scene.add(new HemisphereLight(
  settings.lighting.hemisphere.sky,
  settings.lighting.hemisphere.ground,
  settings.lighting.hemisphere.intensity,
));
for (const lightSettings of [
  settings.lighting.key,
  settings.lighting.fill,
  settings.lighting.rim,
  settings.lighting.front,
]) {
  const light = new DirectionalLight(lightSettings.color, lightSettings.intensity);
  light.position.set(...lightSettings.position);
  scene.add(light);
}

const sceneManifest = await fetch("/scene-manifest.json").then((response) => response.json());
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cameraDirection = new Vector3(...settings.cameraDirection).normalize();

async function loadGltf(assetUrl) {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error("visual glTF HTTP " + response.status + ": " + assetUrl);
  const document = await response.json();
  const resourcePath = new URL(".", new URL(assetUrl, window.location.href)).href;
  return loader.parseAsync(JSON.stringify(document), resourcePath);
}

function disposeObjectResources(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function frameVehicle(root, helicopter) {
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error("vehicle exterior has empty bounds");
  const center = bounds.getCenter(new Vector3());
  const verticalFov = settings.cameraFovDeg * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const right = new Vector3().crossVectors(cameraDirection, new Vector3(0, 1, 0)).normalize();
  const screenUp = new Vector3().crossVectors(right, cameraDirection).normalize();
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vector3(x, y, z));
    }
  }
  const framingScale = helicopter ? settings.helicopterFramingScale : settings.framingScale;
  let distance = 0;
  let minimumForward = Infinity;
  let maximumForward = -Infinity;
  for (const corner of corners) {
    const offset = corner.sub(center);
    const forward = offset.dot(cameraDirection);
    minimumForward = Math.min(minimumForward, forward);
    maximumForward = Math.max(maximumForward, forward);
    distance = Math.max(
      distance,
      forward + Math.abs(offset.dot(right)) * framingScale / Math.tan(horizontalFov / 2),
      forward + Math.abs(offset.dot(screenUp)) * framingScale / Math.tan(verticalFov / 2),
    );
  }
  camera.position.copy(center).addScaledVector(cameraDirection, distance);
  camera.near = Math.max((distance - maximumForward) * 0.2, 0.01);
  camera.far = Math.max(distance - minimumForward + Math.max(bounds.getSize(new Vector3()).length(), 10), 100);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

async function renderEntry(entry) {
  const root = new Group();
  root.name = entry.key;
  scene.add(root);
  const sources = new Map();
  try {
    for (const placement of entry.placements) {
      let sourcePromise = sources.get(placement.assetUrl);
      if (!sourcePromise) {
        sourcePromise = loadGltf(placement.assetUrl);
        sources.set(placement.assetUrl, sourcePromise);
      }
      const gltf = await sourcePromise;
      const occurrence = new Group();
      occurrence.name = placement.stableOccurrenceId;
      occurrence.matrixAutoUpdate = false;
      occurrence.matrix.fromArray(placement.matrix);
      occurrence.matrixWorldNeedsUpdate = true;
      occurrence.add(cloneSkeleton(gltf.scene));
      root.add(occurrence);
    }
    frameVehicle(root, entry.isHelicopter);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    renderer.render(scene, camera);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("canvas capture failed")), "image/png");
    });
    const response = await fetch("/capture/" + encodeURIComponent(entry.key), {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: png,
    });
    if (!response.ok) throw new Error(await response.text());
  } finally {
    scene.remove(root);
    for (const sourcePromise of sources.values()) {
      try {
        const source = (await sourcePromise).scene;
        disposeObjectResources(source);
      } catch {
        // The original render error is more useful than cleanup noise.
      }
    }
  }
}

try {
  for (const entry of sceneManifest.entries) await renderEntry(entry);
  await fetch("/done", { method: "POST" });
  document.title = "done";
} catch (error) {
  await fetch("/failed", { method: "POST", body: String(error?.stack ?? error) });
  document.title = "failed";
}
</script>`;
}

function buildManifest({
  catalog,
  renderEntries,
  cards,
  visualIndexSha256,
  catalogSha256,
  selectionPolicySha256,
  selectedKeys,
  captures,
  previousEntries,
}) {
  const sourceByKey = new Map(renderEntries.map((entry) => [entry.key, entry]));
  const preserved = previousEntries.filter((entry) => !selectedKeys.has(identityKey(entry.cardId, entry.rawName)));
  const variants = [...preserved, ...captures.values()].map((entry) => {
    const source = sourceByKey.get(identityKey(entry.cardId, entry.rawName));
    invariant(source, `manifest entry has no current render source: ${entry.cardId}/${entry.rawName}`);
    return {
      ...entry,
      variant: source.variant,
      displayName: source.displayName,
      type: source.type,
      factionId: source.factionId,
      sourcePackageSha256: source.packageSha256,
      sourceIdentitySha256: source.identitySha256,
      sourceDescriptorSha256: source.sourceDescriptorSha256,
      sourceAssetCount: source.sourceAssetCount,
      sourceOccurrenceCount: source.sourceOccurrenceCount,
      selection: source.selection,
      renderSourceSha256: source.renderSourceSha256,
      sourceCatalogVariant: source.variant,
    };
  });
  variants.sort((left, right) => {
    const cardOrder = left.cardId.localeCompare(right.cardId, "en");
    return cardOrder || left.rawName.localeCompare(right.rawName, "en");
  });
  const byKey = new Map(variants.map((entry) => [identityKey(entry.cardId, entry.rawName), entry]));
  const complete = variants.length === renderEntries.length;
  const cardRows = cards
    .filter((card) => complete || variants.some((entry) => entry.cardId === card.cardId))
    .map((card) => {
    const defaultEntry = byKey.get(identityKey(card.cardId, card.defaultVariantRawName)) ??
      variants.find((entry) => entry.cardId === card.cardId);
    invariant(defaultEntry, `manifest has no image for ${card.cardId}`);
    return { ...card, impressionPath: defaultEntry.path, impressionSha256: defaultEntry.sha256 };
    });
  return {
    schemaVersion: "runtime-probe-card-impressions/v1",
    complete,
    source: {
      catalogId: catalog.catalogId,
      catalogSha256,
      visualIndexSha256,
      selectionPolicySha256,
    },
    settings: SETTINGS,
    cards: cardRows,
    variants,
    summary: {
      cards: cardRows.length,
      variants: variants.length,
      bytes: variants.reduce((total, entry) => total + entry.bytes, 0),
      maxBytes: Math.max(...variants.map((entry) => entry.bytes)),
    },
  };
}

async function loadPreviousEntries(outputManifest, renderEntries) {
  try {
    const previous = JSON.parse(await readFile(outputManifest, "utf8"));
    invariant(previous.schemaVersion === "runtime-probe-card-impressions/v1", "unsupported previous impression manifest");
    invariant(JSON.stringify(previous.settings) === JSON.stringify(SETTINGS), "impression settings changed; rerender the complete exact variant set");
    const currentByKey = new Map(renderEntries.map((entry) => [entry.key, entry]));
    const reusable = [];
    const seen = new Set();
    for (const entry of previous.variants ?? []) {
      const key = identityKey(entry.cardId, entry.rawName);
      invariant(!seen.has(key), `duplicate previous impression entry: ${key}`);
      seen.add(key);
      const current = currentByKey.get(key);
      if (!current) continue;
      const matchesCurrentSource = entry.renderSourceSha256
        ? entry.renderSourceSha256 === current.renderSourceSha256
        : entry.sourcePackageSha256 === current.packageSha256 &&
          entry.sourceIdentitySha256 === current.identitySha256 &&
          entry.sourceDescriptorSha256 === current.sourceDescriptorSha256 &&
          entry.sourceAssetCount === current.sourceAssetCount &&
          entry.sourceOccurrenceCount === current.sourceOccurrenceCount &&
          entry.type === current.type &&
          JSON.stringify(entry.selection) === JSON.stringify(current.selection);
      if (!matchesCurrentSource) continue;
      const sourcePath = await resolvePublicArtifactPath(
        ROOT,
        entry.path.replace(/^\//u, ""),
      );
      let bytes;
      try {
        bytes = await readFile(sourcePath);
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      invariant(
        bytes.byteLength === entry.bytes && sha256(bytes) === entry.sha256,
        `previous impression bytes do not match its declaration: ${key}`,
      );
      reusable.push(entry);
    }
    return reusable;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeManifestAndPrune({ outputRoot, outputManifest, manifest }) {
  const temporaryManifest = `${outputManifest}.tmp-${process.pid}`;
  await mkdir(path.dirname(outputManifest), { recursive: true });
  await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await renameWithWindowsRetry(temporaryManifest, outputManifest);
  const liveFiles = new Set(manifest.variants.map(({ path: assetPath }) => path.basename(assetPath)));
  for (const fileName of await readdir(outputRoot)) {
    if (fileName.endsWith(".webp") && !liveFiles.has(fileName)) {
      await rm(path.join(outputRoot, fileName), { force: true });
    }
  }
}

async function installResults({ stagingRoot, outputRoot, outputManifest, manifest }) {
  await mkdir(outputRoot, { recursive: true });
  for (const entry of manifest.variants) {
    const fileName = path.basename(entry.path);
    await cp(path.join(stagingRoot, fileName), path.join(outputRoot, fileName));
  }
  await writeManifestAndPrune({ outputRoot, outputManifest, manifest });
}

async function statIfPresent(filePath) {
  try {
    return await stat(filePath, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function materializeReusableResults({ outputRoot, manifest }) {
  await mkdir(outputRoot, { recursive: true });
  for (const entry of manifest.variants) {
    const sourcePath = await resolvePublicArtifactPath(
      ROOT,
      entry.path.replace(/^\//u, ""),
    );
    const destinationPath = path.join(outputRoot, path.basename(entry.path));
    const resolvedSourcePath = path.resolve(sourcePath);
    const resolvedDestinationPath = path.resolve(destinationPath);
    const isSamePath =
      process.platform === "win32"
        ? resolvedSourcePath.toLocaleLowerCase("en-US") ===
          resolvedDestinationPath.toLocaleLowerCase("en-US")
        : resolvedSourcePath === resolvedDestinationPath;
    const [sourceStat, destinationStat] = isSamePath
      ? [null, null]
      : await Promise.all([
          stat(sourcePath, { bigint: true }),
          statIfPresent(destinationPath),
        ]);
    const isSameFile =
      isSamePath ||
      (destinationStat !== null &&
        sourceStat.dev === destinationStat.dev &&
        sourceStat.ino !== 0n &&
        sourceStat.ino === destinationStat.ino);
    if (isSameFile) continue;
    await cp(sourcePath, destinationPath);
  }
}

async function resolveRendererAssetPath(config, requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  if (decodedPath.startsWith("/repo/")) {
    const absolutePath = path.resolve(ROOT, decodedPath.slice("/repo/".length));
    invariant(absolutePath.startsWith(`${ROOT}${path.sep}`), "repository asset request escaped root");
    return absolutePath;
  }
  if (config.edition === "china") {
    const cacheRoot = chinaRuntimeVisualCacheRoot(ROOT);
    for (const [prefix, directory] of [
      ["/assets/runtime-probe/models/", "models"],
      ["/assets/runtime-probe/blob/", "blobs"],
    ]) {
      if (!decodedPath.startsWith(prefix)) continue;
      const fileName = decodedPath.slice(prefix.length);
      invariant(
        /^[a-f0-9]{64}\.(?:bin|gltf|webp)$/u.test(fileName),
        `invalid China runtime asset path: ${decodedPath}`,
      );
      const candidates = [
        path.join(cacheRoot, directory, fileName),
        path.join(
          process.env.SIGUA_PUBLIC_RELEASE_CACHE_ROOT?.trim() ||
            path.join(ROOT, "outputs", "public-release-cache"),
          "visuals",
          directory,
          fileName,
        ),
      ];
      for (const candidate of candidates) {
        try {
          if ((await stat(candidate)).isFile()) return candidate;
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      throw new Error(`China runtime asset is absent from patched and shared caches: ${decodedPath}`);
    }
    throw new Error(`unsupported China renderer asset path: ${decodedPath}`);
  }
  invariant(decodedPath.startsWith("/assets/"), `unsupported renderer asset path: ${decodedPath}`);
  return resolvePublicArtifactPath(ROOT, decodedPath.slice(1));
}

export async function renderRuntimeCardImpressions(options = parseOptions(process.argv)) {
  const config = runtimeCardImpressionEditionConfig(options.edition ?? "international");
  const [catalogBytes, visualIndexBytes, selectionPolicyBytes] = await Promise.all([
    readFile(config.catalogPath),
    readFile(config.visualIndexPath),
    readFile(config.selectionPolicyPath),
  ]);
  const catalog = JSON.parse(catalogBytes);
  const visualIndex = JSON.parse(visualIndexBytes);
  const selectionPolicy = JSON.parse(selectionPolicyBytes);
  const { entries: catalogEntries, cards } = flattenCatalog(catalog);
  const renderEntries = buildRenderEntries({
    catalogEntries,
    visualIndex,
    selectionPolicy,
    assetUrlPrefixes: config.assetUrlPrefixes,
  });
  const byKey = new Map(renderEntries.map((entry) => [entry.key, entry]));
  const requestedKeys = new Set();
  for (const cardId of options.cardIds) {
    const matches = renderEntries.filter((entry) => entry.cardId === cardId);
    invariant(matches.length > 0, `unknown exact card ID: ${cardId}`);
    matches.forEach((entry) => requestedKeys.add(entry.key));
  }
  for (const variantKey of options.variantKeys) {
    const separator = variantKey.indexOf("::");
    invariant(separator > 0, `--variant must be cardId::rawName: ${variantKey}`);
    const key = identityKey(variantKey.slice(0, separator), variantKey.slice(separator + 2));
    invariant(byKey.has(key), `unknown exact card variant: ${variantKey}`);
    requestedKeys.add(key);
  }
  const sourceHashes = {
    visualIndexSha256: sha256(canonicalTextBytes(visualIndexBytes)),
    catalogSha256: sha256(canonicalTextBytes(catalogBytes)),
    selectionPolicySha256: sha256(canonicalTextBytes(selectionPolicyBytes)),
  };
  const previousEntries = await loadPreviousEntries(
    options.outputManifest,
    renderEntries,
  );
  const reusableKeys = new Set(
    previousEntries.map((entry) => identityKey(entry.cardId, entry.rawName)),
  );
  const staleKeys = new Set(
    renderEntries
      .filter((entry) => !reusableKeys.has(entry.key))
      .map((entry) => entry.key),
  );
  if (requestedKeys.size > 0) {
    for (const key of staleKeys) {
      invariant(
        requestedKeys.has(key),
        `partial render would preserve a stale impression; also request ${key.replace("\u0000", "::")}`,
      );
    }
  }
  const selectedEntries = renderEntries.filter((entry) =>
    requestedKeys.size === 0 ? staleKeys.has(entry.key) : requestedKeys.has(entry.key)
  );
  const selectedKeys = new Set(selectedEntries.map((entry) => entry.key));
  await mkdir(path.dirname(options.outputRoot), { recursive: true });
  if (selectedEntries.length === 0) {
    const manifest = buildManifest({
      catalog,
      renderEntries,
      cards,
      visualIndexSha256: sourceHashes.visualIndexSha256,
      catalogSha256: sourceHashes.catalogSha256,
      selectionPolicySha256: sourceHashes.selectionPolicySha256,
      selectedKeys,
      captures: new Map(),
      previousEntries,
    });
    await materializeReusableResults({
      outputRoot: options.outputRoot,
      manifest,
    });
    await writeManifestAndPrune({
      outputRoot: options.outputRoot,
      outputManifest: options.outputManifest,
      manifest,
    });
    process.stdout.write(`${JSON.stringify(manifest.summary)}\n`);
    return manifest;
  }
  const stagingRoot = await mkdtemp(path.join(path.dirname(options.outputRoot), ".runtime-card-impressions-tmp-"));
  const browserProfile = await mkdtemp(path.join(os.tmpdir(), "sigua-runtime-card-render-browser-"));
  const captures = new Map();
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const sceneManifest = JSON.stringify({
    schemaVersion: "runtime-card-impression-scene/v1",
    entries: selectedEntries,
  });
  const page = rendererPage();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(page);
        return;
      }
      if (request.method === "GET" && url.pathname === "/scene-manifest.json") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(sceneManifest);
        return;
      }
      if (request.method === "GET" && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/repo/"))) {
        const absolutePath = await resolveRendererAssetPath(config, url.pathname);
        const bytes = await readFile(absolutePath);
        response.writeHead(200, { "content-type": mimeType(absolutePath), "cache-control": "no-store" });
        response.end(bytes);
        return;
      }
      if (request.method === "POST" && url.pathname.startsWith("/capture/")) {
        const key = decodeURIComponent(url.pathname.slice("/capture/".length));
        invariant(selectedKeys.has(key), `unexpected capture: ${key}`);
        invariant(!captures.has(key), `duplicate capture: ${key}`);
        const png = await readRequestBody(request);
        const { data: rgba, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        invariant(info.width === SETTINGS.width && info.height === SETTINGS.height, `capture size mismatch: ${key}`);
        let visiblePixels = 0;
        for (let offset = 3; offset < rgba.length; offset += info.channels) {
          if (rgba[offset] > 8) visiblePixels += 1;
        }
        const coverage = visiblePixels / (info.width * info.height);
        invariant(coverage > 0.015 && coverage < 0.82, `invalid alpha coverage ${coverage.toFixed(4)}: ${key}`);
        const webp = await sharp(png).webp({
          quality: SETTINGS.quality,
          alphaQuality: SETTINGS.alphaQuality,
          effort: SETTINGS.effort,
          smartSubsample: true,
        }).toBuffer();
        const digest = sha256(webp);
        const source = byKey.get(key);
        invariant(source, `missing source entry: ${key}`);
        await writeFile(path.join(stagingRoot, `${digest}.webp`), webp);
        captures.set(key, {
          cardId: source.cardId,
          rawName: source.rawName,
          variant: source.variant,
          displayName: source.displayName,
          type: source.type,
          factionId: source.factionId,
          path: `${config.outputUrlRoot}/${digest}.webp`,
          sha256: digest,
          bytes: webp.byteLength,
          width: SETTINGS.width,
          height: SETTINGS.height,
          alphaCoverage: Number(coverage.toFixed(6)),
          sourcePackageSha256: source.packageSha256,
          sourceIdentitySha256: source.identitySha256,
          sourceDescriptorSha256: source.sourceDescriptorSha256,
          sourceAssetCount: source.sourceAssetCount,
          sourceOccurrenceCount: source.sourceOccurrenceCount,
          selection: source.selection,
          renderSourceSha256: source.renderSourceSha256,
        });
        process.stdout.write(`\rruntime card impressions ${captures.size}/${selectedEntries.length}`);
        response.writeHead(204).end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/done") {
        invariant(captures.size === selectedEntries.length, `capture count mismatch ${captures.size}/${selectedEntries.length}`);
        response.writeHead(204).end();
        resolveDone();
        return;
      }
      if (request.method === "POST" && url.pathname === "/failed") {
        const errorText = (await readRequestBody(request, 64 * 1024)).toString("utf8");
        response.writeHead(204).end();
        rejectDone(new Error(`browser renderer failed: ${errorText}`));
        return;
      }
      response.writeHead(404).end("not found");
    } catch (error) {
      process.stderr.write(`[runtime-card-render-server] ${request.method} ${request.url}: ${String(error?.stack ?? error)}\n`);
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(String(error?.stack ?? error));
      rejectDone(error);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  invariant(address && typeof address === "object", "renderer server did not bind a TCP port");
  const browserPath = await firstExistingFile(EDGE_PATHS);
  const child = spawn(browserPath, [
    "--headless=new",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-angle=swiftshader",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    `--user-data-dir=${browserProfile}`,
    `http://127.0.0.1:${address.port}/`,
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let browserErrors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    browserErrors = `${browserErrors}${chunk}`.slice(-16_384);
  });
  const browserExit = new Promise((resolve) => child.once("exit", resolve));
  child.once("exit", async (code) => {
    if (captures.size === selectedEntries.length) return;
    if (code !== 0 || process.platform !== "win32") {
      rejectDone(new Error(`card renderer exited early (${code})\n${browserErrors}`));
      return;
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (captures.size !== selectedEntries.length && await browserProfileProcessCount(browserProfile) === 0) {
        rejectDone(new Error(`card renderer exited early (${code})\n${browserErrors}`));
      }
    } catch (error) {
      rejectDone(error);
    }
  });
  const timeout = setTimeout(() => {
    rejectDone(new Error(`runtime card impression render timed out\n${browserErrors}`));
  }, 60 * 60 * 1000);
  try {
    await done;
    for (const previous of previousEntries) {
      const key = identityKey(previous.cardId, previous.rawName);
      if (selectedKeys.has(key)) continue;
      const sourcePath = await resolvePublicArtifactPath(
        ROOT,
        previous.path.replace(/^\//u, ""),
      );
      await cp(sourcePath, path.join(stagingRoot, path.basename(previous.path)));
    }
    const manifest = buildManifest({
      catalog,
      renderEntries,
      cards,
      visualIndexSha256: sourceHashes.visualIndexSha256,
      catalogSha256: sourceHashes.catalogSha256,
      selectionPolicySha256: sourceHashes.selectionPolicySha256,
      selectedKeys,
      captures,
      previousEntries,
    });
    await installResults({
      stagingRoot,
      outputRoot: options.outputRoot,
      outputManifest: options.outputManifest,
      manifest,
    });
    process.stdout.write(`\n${JSON.stringify(manifest.summary)}\n`);
    return manifest;
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill();
    await stopBrowserProfileProcesses(browserProfile);
    await Promise.race([browserExit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    server.close();
    await removeDirectoryWithRetry(browserProfile);
    await removeDirectoryWithRetry(stagingRoot);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await renderRuntimeCardImpressions();
}
