import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const [wikiRoot, cardId, rawName, remoteOrigin = "", imageMode = ""] = process.argv.slice(2);
const sharp = imageMode === "--image-metadata"
  ? (await import("sharp")).default
  : null;
if (!wikiRoot || !cardId || !rawName) {
  throw new Error(
    "Usage: node tools/perf/audit-runtime-visual.mjs <wiki-root> <card-id> <raw-name>",
  );
}

const vehicleCatalog = JSON.parse(
  await readFile(path.join(wikiRoot, "data", "vehicles", "catalog.json"), "utf8"),
);
const binding = vehicleCatalog.identities?.catalogBindings?.find(
  (candidate) =>
    candidate.cardId === cardId && candidate.rawName === rawName,
);
if (!binding) throw new Error(`Missing vehicle binding: ${cardId}/${rawName}`);
const visualArtifactRef = binding.visualArtifactRefs?.international;
if (!visualArtifactRef) throw new Error("Vehicle has no international visual artifact");
const descriptor = JSON.parse(
  await readFile(
    path.join(
      wikiRoot,
      "assets",
      "runtime-probe",
      "visuals",
      `${visualArtifactRef}.json`,
    ),
    "utf8",
  ),
);
const runtimeVehicle = vehicleCatalog.runtime?.vehicles?.find(
  (candidate) => candidate.id === binding.runtimeVehicleRef,
);
const assetUrls = [...new Set(descriptor.placements.map(({ assetUrl }) => assetUrl))];
const assets = [];
const dependencyKinds = new Map();
const dependencyReferenceCounts = new Map();
for (const assetUrl of assetUrls) {
  const filename = path.join(wikiRoot, ...assetUrl.slice(1).split("/"));
  let fileBytes;
  let gltf;
  try {
    const [file, text] = await Promise.all([
      stat(filename),
      readFile(filename, "utf8"),
    ]);
    fileBytes = file.size;
    gltf = JSON.parse(text);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!remoteOrigin) {
      assets.push({ assetUrl, missing: true });
      continue;
    }
    const response = await fetch(new URL(assetUrl, `${remoteOrigin.replace(/\/+$/u, "")}/`));
    if (!response.ok) {
      assets.push({ assetUrl, missing: true, httpStatus: response.status });
      continue;
    }
    const text = await response.text();
    fileBytes = Buffer.byteLength(text);
    gltf = JSON.parse(text);
  }
  assets.push({
    assetUrl,
    fileBytes,
    placements: descriptor.placements.filter(
      (placement) => placement.assetUrl === assetUrl,
    ).length,
    nodes: gltf.nodes?.length ?? 0,
    meshes: gltf.meshes?.length ?? 0,
    primitives: (gltf.meshes ?? []).reduce(
      (count, mesh) => count + (mesh.primitives?.length ?? 0),
      0,
    ),
    materials: gltf.materials?.length ?? 0,
    textures: gltf.textures?.length ?? 0,
    images: gltf.images?.length ?? 0,
    decodedBufferBytes: (gltf.buffers ?? []).reduce(
      (total, buffer) => total + (buffer.byteLength ?? 0),
      0,
    ),
  });
  for (const buffer of gltf.buffers ?? []) {
    if (!buffer.uri || buffer.uri.startsWith("data:")) continue;
    dependencyKinds.set(
      new URL(buffer.uri, new URL(assetUrl, "https://wiki.local/")).pathname,
      "buffer",
    );
    const pathname = new URL(
      buffer.uri,
      new URL(assetUrl, "https://wiki.local/"),
    ).pathname;
    dependencyReferenceCounts.set(
      pathname,
      (dependencyReferenceCounts.get(pathname) ?? 0) + 1,
    );
  }
  for (const image of gltf.images ?? []) {
    if (!image.uri || image.uri.startsWith("data:")) continue;
    dependencyKinds.set(
      new URL(image.uri, new URL(assetUrl, "https://wiki.local/")).pathname,
      "image",
    );
    const pathname = new URL(
      image.uri,
      new URL(assetUrl, "https://wiki.local/"),
    ).pathname;
    dependencyReferenceCounts.set(
      pathname,
      (dependencyReferenceCounts.get(pathname) ?? 0) + 1,
    );
  }
}
assets.sort((left, right) => right.fileBytes - left.fileBytes);
const dependencies = await Promise.all(
  [...dependencyKinds].map(async ([pathname, kind]) => {
    try {
      const filename = path.join(wikiRoot, ...pathname.slice(1).split("/"));
      const file = await stat(filename);
      const metadata = sharp && kind === "image"
        ? await sharp(filename).metadata()
        : null;
      return {
        pathname,
        kind,
        references: dependencyReferenceCounts.get(pathname) ?? 1,
        fileBytes: file.size,
        source: "local",
        width: metadata?.width,
        height: metadata?.height,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      if (!remoteOrigin) return { pathname, kind, missing: true };
      const response = await fetch(
        new URL(pathname, `${remoteOrigin.replace(/\/+$/u, "")}/`),
        { method: sharp && kind === "image" ? "GET" : "HEAD" },
      );
      const bytes = sharp && kind === "image"
        ? Buffer.from(await response.arrayBuffer())
        : null;
      const contentLength = bytes?.length ?? Number(response.headers.get("content-length"));
      const metadata = bytes ? await sharp(bytes).metadata() : null;
      return response.ok && Number.isFinite(contentLength)
        ? {
            pathname,
            kind,
            references: dependencyReferenceCounts.get(pathname) ?? 1,
            fileBytes: contentLength,
            source: "remote-head",
            contentType: response.headers.get("content-type"),
            cacheControl: response.headers.get("cache-control"),
            width: metadata?.width,
            height: metadata?.height,
          }
        : {
            pathname,
            kind,
            references: dependencyReferenceCounts.get(pathname) ?? 1,
            missing: true,
            httpStatus: response.status,
          };
    }
  }),
);
console.log(JSON.stringify({
  cardId,
  rawName,
  visualArtifactRef,
  runtimeVehicle,
  placements: descriptor.placements.length,
  uniqueAssets: assets.length,
  fileBytes: assets.reduce((total, asset) => total + (asset.fileBytes ?? 0), 0),
  decodedBufferBytes: assets.reduce(
    (total, asset) => total + (asset.decodedBufferBytes ?? 0),
    0,
  ),
  primitives: assets.reduce((total, asset) => total + (asset.primitives ?? 0), 0),
  textures: assets.reduce((total, asset) => total + (asset.textures ?? 0), 0),
  missingAssets: assets.filter((asset) => asset.missing).length,
  dependencyFiles: dependencies.length,
  dependencyBytes: dependencies.reduce(
    (total, dependency) => total + (dependency.fileBytes ?? 0),
    0,
  ),
  missingDependencies: dependencies.filter((dependency) => dependency.missing).length,
  imagePixels: dependencies.reduce(
    (total, dependency) =>
      total + (dependency.kind === "image"
        ? (dependency.width ?? 0) * (dependency.height ?? 0)
        : 0),
    0,
  ),
  imageReferencePixels: dependencies.reduce(
    (total, dependency) =>
      total + (dependency.kind === "image"
        ? (dependency.width ?? 0) *
          (dependency.height ?? 0) *
          dependency.references
        : 0),
    0,
  ),
  assets,
  dependencies: dependencies.sort(
    (left, right) => (right.fileBytes ?? 0) - (left.fileBytes ?? 0),
  ),
}, null, 2));
