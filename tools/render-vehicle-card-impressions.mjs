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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_MANIFEST = path.join(ROOT, "generated", "editor-visual-scene-manifest.json");
const CATALOG_PATH = path.join(ROOT, "generated", "catalog.json");
const OUTPUT_MANIFEST = path.join(ROOT, "generated", "vehicle-card-impressions.json");
const OUTPUT_ROOT = path.join(ROOT, "public", "images", "vehicle-impressions");
const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const SAFE_VEHICLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/u;
const SETTINGS = Object.freeze({
  width: 640,
  height: 360,
  format: "webp",
  quality: 82,
  alphaQuality: 88,
  effort: 5,
  cameraDirection: [1.7, -2.7, 1.25],
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
  const vehicleIds = [];
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--vehicle") {
      invariant(argv[index + 1], "--vehicle requires an exact card ID");
      vehicleIds.push(argv[index + 1]);
      index += 1;
    } else if (argument.startsWith("--vehicle=")) {
      vehicleIds.push(argument.slice("--vehicle=".length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { vehicleIds };
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
      if (error?.code !== "EBUSY" && error?.code !== "EPERM" && error?.code !== "ENOTEMPTY") {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function browserProfileProcessCount(profilePath) {
  if (process.platform !== "win32") return 0;
  const script = [
    "$needle = $env:SIGUA_CARD_BROWSER_PROFILE",
    "$items = @(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' OR Name='chrome.exe'\" |",
    "  Where-Object { $_.CommandLine -like ('*' + $needle + '*') })",
    "Write-Output $items.Count",
  ].join("\n");
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      env: { ...process.env, SIGUA_CARD_BROWSER_PROFILE: profilePath },
    }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Number.parseInt(stdout.trim(), 10) || 0);
    });
  });
}

async function stopBrowserProfileProcesses(profilePath) {
  if (process.platform !== "win32") return;
  const script = [
    "$needle = $env:SIGUA_CARD_BROWSER_PROFILE",
    "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' OR Name='chrome.exe'\" |",
    "  Where-Object { $_.CommandLine -like ('*' + $needle + '*') } |",
    "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("\n");
  await new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      env: { ...process.env, SIGUA_CARD_BROWSER_PROFILE: profilePath },
    }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function renameWithWindowsRetry(sourcePath, destinationPath, attempts = 12) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "EACCES" && error?.code !== "EBUSY" && error?.code !== "EPERM") {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
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

function rendererPage(vehicleIds, helicopterIds) {
  const settings = JSON.stringify(SETTINGS);
  const requested = JSON.stringify(vehicleIds);
  const helicopters = JSON.stringify(helicopterIds);
  return `<!doctype html>
<meta charset="utf-8">
<title>SiguaArmor card impression renderer</title>
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
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const settings = ${settings};
const requestedIds = ${requested};
const helicopterIds = new Set(${helicopters});
const canvas = document.querySelector("#render");
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(settings.width, settings.height, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = settings.lighting.exposure;

const camera = new PerspectiveCamera(settings.cameraFovDeg, settings.width / settings.height, 0.01, 1000);
camera.up.set(0, 0, 1);
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

const manifest = await fetch("/scene-manifest.json").then((response) => response.json());
const byId = new Map(manifest.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]));
const loader = new GLTFLoader();
const cameraDirection = new Vector3(...settings.cameraDirection).normalize();

async function loadGltfWithLocalResources(assetUrl) {
  const assetResponse = await fetch(assetUrl);
  if (!assetResponse.ok) throw new Error("visual glTF HTTP " + assetResponse.status + ": " + assetUrl);
  const document = await assetResponse.json();
  const resourcePath = assetUrl.slice(0, assetUrl.lastIndexOf("/") + 1);
  const objectUrls = [];
  try {
    for (const buffer of document.buffers ?? []) {
      if (!buffer.uri || buffer.uri.startsWith("data:")) continue;
      const response = await fetch(resourcePath + buffer.uri);
      if (!response.ok) throw new Error("visual buffer HTTP " + response.status + ": " + buffer.uri);
      const objectUrl = URL.createObjectURL(await response.blob());
      objectUrls.push(objectUrl);
      buffer.uri = objectUrl;
    }
    for (const image of document.images ?? []) {
      if (!image.uri || image.uri.startsWith("data:")) continue;
      const response = await fetch(resourcePath + image.uri);
      if (!response.ok) throw new Error("visual image HTTP " + response.status + ": " + image.uri);
      const objectUrl = URL.createObjectURL(await response.blob());
      objectUrls.push(objectUrl);
      image.uri = objectUrl;
    }
    return await loader.parseAsync(JSON.stringify(document), "");
  } finally {
    for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
  }
}

function disposeRoot(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
  scene.remove(root);
}

function frameVehicle(root, vehicleId) {
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error("vehicle exterior has empty bounds");
  const center = bounds.getCenter(new Vector3());
  const verticalFov = settings.cameraFovDeg * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const right = new Vector3().crossVectors(cameraDirection, new Vector3(0, 0, 1)).normalize();
  const screenUp = new Vector3().crossVectors(right, cameraDirection).normalize();
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vector3(x, y, z));
    }
  }
  let distance = 0;
  let minimumForward = Infinity;
  let maximumForward = -Infinity;
  const framingScale = helicopterIds.has(vehicleId)
    ? settings.helicopterFramingScale
    : settings.framingScale;
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

async function renderVehicle(vehicle) {
  const root = new Group();
  root.name = vehicle.vehicleId;
  scene.add(root);
  try {
    // Exterior mode loads every Editor visual component. analysisClone controls
    // whether a second material-free copy also appears in analysis modes; it
    // does not hide the native PBR component from the exterior scene.
    const exterior = vehicle.components;
    if (exterior.length === 0) throw new Error("vehicle has no exterior components");
    for (const component of exterior) {
      const assetUrl = "/repo/" + component.assetPath;
      const gltf = await loadGltfWithLocalResources(assetUrl);
      gltf.scene.name = component.componentId;
      gltf.scene.matrixAutoUpdate = false;
      gltf.scene.matrix.fromArray(component.vehicleLocalMatrix);
      gltf.scene.matrixWorldNeedsUpdate = true;
      root.add(gltf.scene);
    }
    frameVehicle(root, vehicle.vehicleId);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    renderer.render(scene, camera);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("canvas capture failed")), "image/png");
    });
    const response = await fetch("/capture/" + encodeURIComponent(vehicle.vehicleId), {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: png,
    });
    if (!response.ok) throw new Error(await response.text());
  } finally {
    disposeRoot(root);
  }
}

try {
  for (const vehicleId of requestedIds) {
    const vehicle = byId.get(vehicleId);
    if (!vehicle) throw new Error("unknown exact card: " + vehicleId);
    await renderVehicle(vehicle);
  }
  await fetch("/done", { method: "POST" });
  document.title = "done";
} catch (error) {
  await fetch("/failed", { method: "POST", body: String(error?.stack ?? error) });
  document.title = "failed";
}
</script>`;
}

async function buildManifest({ sourceManifest, selectedIds, captures, partial }) {
  let previousEntries = [];
  if (partial) {
    try {
      const previous = JSON.parse(await readFile(OUTPUT_MANIFEST, "utf8"));
      invariant(
        JSON.stringify(previous.settings) === JSON.stringify(SETTINGS),
        "card render settings changed; rerender the complete exact-card set",
      );
      invariant(
        previous.sourceBuildId === sourceManifest.sourceBuildId,
        "Editor source build changed; rerender the complete exact-card set",
      );
      previousEntries = previous.vehicles.filter(({ vehicleId }) => !selectedIds.has(vehicleId));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const sourceById = new Map(sourceManifest.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]));
  for (const entry of previousEntries) {
    const source = sourceById.get(entry.vehicleId);
    invariant(source, `preserved card no longer exists: ${entry.vehicleId}`);
    invariant(
      entry.sourceContentSha256 === source.contentSha256,
      `preserved card source changed; rerender ${entry.vehicleId}`,
    );
  }
  const vehicles = [...previousEntries, ...captures.values()].map((entry) => ({
    ...entry,
    sourceContentSha256: sourceById.get(entry.vehicleId)?.contentSha256 ?? entry.sourceContentSha256,
    sourceComponentIds: sourceById.get(entry.vehicleId)?.components
      .map((component) => component.componentId)
      .sort((left, right) => left.localeCompare(right, "en"))
      ?? entry.sourceComponentIds,
  }));
  vehicles.sort((left, right) => left.vehicleId.localeCompare(right.vehicleId, "en"));
  return {
    schemaVersion: "1.0.0",
    sourceBuildId: sourceManifest.sourceBuildId,
    settings: SETTINGS,
    vehicles,
    summary: {
      vehicles: vehicles.length,
      bytes: vehicles.reduce((total, vehicle) => total + vehicle.bytes, 0),
      maxBytes: Math.max(...vehicles.map((vehicle) => vehicle.bytes)),
    },
  };
}

async function installResults({ stagingRoot, manifest }) {
  await mkdir(path.dirname(OUTPUT_MANIFEST), { recursive: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });
  // Windows dev-server watchers can briefly hold the output directory open.
  // Content-addressed files are safe to copy into the stable directory first;
  // the manifest switches only after every new derivative is present.
  await cp(stagingRoot, OUTPUT_ROOT, { recursive: true });
  const temporaryManifest = `${OUTPUT_MANIFEST}.tmp-${process.pid}`;
  await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await renameWithWindowsRetry(temporaryManifest, OUTPUT_MANIFEST);
  const liveFiles = new Set(manifest.vehicles.map(({ path: assetPath }) => path.basename(assetPath)));
  for (const fileName of await readdir(OUTPUT_ROOT)) {
    if (fileName.endsWith(".webp") && !liveFiles.has(fileName)) {
      await rm(path.join(OUTPUT_ROOT, fileName), { force: true });
    }
  }
  await removeDirectoryWithRetry(stagingRoot);
}

export async function renderVehicleCardImpressions(options = parseOptions(process.argv)) {
  const sourceManifest = JSON.parse(await readFile(SOURCE_MANIFEST, "utf8"));
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  invariant(sourceManifest?.accessPolicy?.publishStatus === "public", "source visuals must be publication-approved");
  invariant(Array.isArray(sourceManifest.vehicles) && sourceManifest.vehicles.length > 0, "visual scene is empty");
  const allIds = sourceManifest.vehicles.map(({ vehicleId }) => vehicleId);
  const requestedIds = options.vehicleIds.length > 0 ? [...new Set(options.vehicleIds)] : allIds;
  for (const vehicleId of requestedIds) invariant(SAFE_VEHICLE_ID.test(vehicleId), `unsafe vehicle ID: ${vehicleId}`);
  const knownIds = new Set(allIds);
  for (const vehicleId of requestedIds) invariant(knownIds.has(vehicleId), `unknown vehicle ID: ${vehicleId}`);
  const partial = requestedIds.length !== allIds.length;
  const selectedIds = new Set(requestedIds);
  const helicopterPromoIds = catalog.records
    .filter((record) => record.official?.typeZh?.includes("直升机"))
    .map((record) => record.promoEntryId);
  const helicopterIds = allIds.filter((vehicleId) =>
    helicopterPromoIds.some((promoEntryId) =>
      vehicleId === promoEntryId || vehicleId.startsWith(`${promoEntryId}--`),
    ),
  );
  await mkdir(path.dirname(OUTPUT_ROOT), { recursive: true });
  const stagingRoot = await mkdtemp(
    path.join(path.dirname(OUTPUT_ROOT), ".vehicle-impressions-tmp-"),
  );
  const browserProfile = await mkdtemp(path.join(os.tmpdir(), "sigua-card-render-browser-"));
  const captures = new Map();
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const page = rendererPage(requestedIds, helicopterIds);
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
        response.end(JSON.stringify(sourceManifest));
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/repo/")) {
        const relativePath = decodeURIComponent(url.pathname.slice("/repo/".length));
        const absolutePath = path.resolve(ROOT, relativePath);
        invariant(absolutePath.startsWith(`${ROOT}${path.sep}`), "asset request escaped repository root");
        const bytes = await readFile(absolutePath);
        if (process.env.SIGUA_CARD_RENDER_DEBUG === "1") {
          process.stderr.write(`[card-render-server] 200 ${url.pathname} ${bytes.byteLength}\n`);
        }
        response.writeHead(200, { "content-type": mimeType(absolutePath), "cache-control": "no-store" });
        response.end(bytes);
        return;
      }
      if (request.method === "POST" && url.pathname.startsWith("/capture/")) {
        const vehicleId = decodeURIComponent(url.pathname.slice("/capture/".length));
        invariant(selectedIds.has(vehicleId), `unexpected capture: ${vehicleId}`);
        invariant(!captures.has(vehicleId), `duplicate capture: ${vehicleId}`);
        const png = await readRequestBody(request);
        const { data: rgba, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        invariant(info.width === SETTINGS.width && info.height === SETTINGS.height, `capture size mismatch: ${vehicleId}`);
        let visiblePixels = 0;
        for (let offset = 3; offset < rgba.length; offset += info.channels) {
          if (rgba[offset] > 8) visiblePixels += 1;
        }
        const coverage = visiblePixels / (info.width * info.height);
        invariant(coverage > 0.015 && coverage < 0.82, `invalid alpha coverage ${coverage.toFixed(4)}: ${vehicleId}`);
        const webp = await sharp(png).webp({
          quality: SETTINGS.quality,
          alphaQuality: SETTINGS.alphaQuality,
          effort: SETTINGS.effort,
          smartSubsample: true,
        }).toBuffer();
        const digest = sha256(webp);
        const fileName = `${digest}.webp`;
        await writeFile(path.join(stagingRoot, fileName), webp);
        captures.set(vehicleId, {
          vehicleId,
          path: `/images/vehicle-impressions/${fileName}`,
          sha256: digest,
          bytes: webp.byteLength,
          width: SETTINGS.width,
          height: SETTINGS.height,
          alphaCoverage: Number(coverage.toFixed(6)),
        });
        process.stdout.write(`\rcard impressions ${captures.size}/${requestedIds.length}`);
        response.writeHead(204).end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/done") {
        invariant(captures.size === requestedIds.length, `capture count mismatch ${captures.size}/${requestedIds.length}`);
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
      process.stderr.write(`[card-render-server] ${request.method} ${request.url}: ${String(error?.stack ?? error)}\n`);
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
  const edgePath = await firstExistingFile(EDGE_PATHS);
  const child = spawn(edgePath, [
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
    if (captures.size !== requestedIds.length) {
      if (code !== 0 || process.platform !== "win32") {
        rejectDone(new Error(`card renderer exited early (${code})\n${browserErrors}`));
        return;
      }
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (captures.size !== requestedIds.length && await browserProfileProcessCount(browserProfile) === 0) {
          rejectDone(new Error(`card renderer exited early (${code})\n${browserErrors}`));
        }
      } catch (error) {
        rejectDone(error);
      }
    }
  });
  const timeout = setTimeout(() => {
    rejectDone(new Error(`card impression render timed out\n${browserErrors}`));
  }, 20 * 60 * 1000);
  try {
    await done;
    const manifest = await buildManifest({ sourceManifest, selectedIds, captures, partial });
    await installResults({ stagingRoot, manifest, partial });
    process.stdout.write("\n");
    return manifest;
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill();
    await stopBrowserProfileProcesses(browserProfile);
    await Promise.race([
      browserExit,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    server.close();
    await removeDirectoryWithRetry(browserProfile);
    await removeDirectoryWithRetry(stagingRoot);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await renderVehicleCardImpressions();
  process.stdout.write(`${JSON.stringify(manifest.summary)}\n`);
}
