import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { fileURLToPath } from "node:url";

import { PUBLIC_DOCUMENT_CACHE } from "./deploy/public-document-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CLIENT_ROOT = path.join(ROOT, "dist", "client");
const DEFAULT_SUMMARY = path.join(ROOT, "generated", "dist-release-summary.json");
const DEFAULT_VISUAL_INDEX = path.join(ROOT, "app", "runtime-probe-visual-release-index.json");
const DEFAULT_SUPPORT_VISUAL_INDEX = path.join(
  ROOT,
  "app",
  "support-air-visual-release-index.json",
);
const DEFAULT_CHINA_VISUAL_INDEX = path.join(
  ROOT,
  "app",
  "china-runtime-probe-visual-release-index.json",
);
const DEFAULT_CHINA_VISUAL_PATCH_INDEX = path.join(
  ROOT,
  "generated",
  "china-runtime-probe-visual-patch-release-index.json",
);
const DEFAULT_HIT_INDEX = path.join(ROOT, "app", "runtime-probe-hit-release-index.json");
const DEFAULT_SUPPORT_HIT_INDEX = path.join(
  ROOT,
  "app",
  "support-air-hit-release-index.json",
);
const DEFAULT_VISUAL_MANIFEST = path.join(ROOT, "generated", "runtime-visual-release-manifest.json");
const DEFAULT_SUPPORT_VISUAL_MANIFEST = path.join(
  ROOT,
  "generated",
  "support-air-runtime-visual-release-manifest.json",
);
const DEFAULT_CHINA_VISUAL_MANIFEST = path.join(
  ROOT,
  "generated",
  "china-runtime-visual-release-manifest.json",
);
const DEFAULT_CHINA_VISUAL_PATCH_AUDIT = path.join(
  ROOT,
  "generated",
  "china-runtime-texture-patch-audit.json",
);
const DEFAULT_RELEASE_PUBLIC = path.resolve(
  process.env.SIGUA_RELEASE_PUBLIC_DIR?.trim() ||
    path.join(ROOT, ".release", "public"),
);
const DEFAULT_PREPARED_MANIFEST = path.join(
  DEFAULT_RELEASE_PUBLIC,
  "release-manifest.json",
);
const EXPECTED_CHINA_VISUAL_PATCH_BINDINGS = 76;
const EXPECTED_CHINA_VISUAL_PATCH_SOURCE_ASSETS = 139;
const EXPECTED_CHINA_TEXTURE_PATCH_PROFILES = 48;
const FOOTER_SOURCE = path.join(ROOT, "app", "CatalogApp.tsx");
const RELEASE_ORIGIN = "https://release.invalid";
const COMPRESSION_CONCURRENCY = 2;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMPRESSIBLE_EXTENSIONS = new Set([
  ".bin",
  ".css",
  ".gltf",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
  ".xml",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".gltf",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
  ".xml",
]);
const FORBIDDEN_LEGACY_TOKEN = /(?:\bHSP\b|\bhsp(?:Read|Written)\b)/i;
const FORBIDDEN_LEGACY_SEMANTIC = /(?:editor-hit-scene-pack|hit-scene-pack-source)/i;
const FORBIDDEN_EXTERNAL_HYPERLINK =
  /(?:\bhref["']?\s*(?:=|:)\s*["']?(?:https?:|mailto:)|["']href["']\s*,\s*["']?(?:https?:|mailto:))/i;
const ALLOWED_EXTERNAL_HYPERLINKS = [
  "https://ajv.js.org/",
  "https://caddyserver.com/",
  "https://cloud.tencent.com/document/product/1552/118985",
  "https://cloud.tencent.com/product/teo",
  "https://github.com/cloudflare/vinext",
  "https://github.com/docker/compose",
  "https://github.com/gkjohnson/three-mesh-bvh",
  "https://github.com/runk/node-maxmind",
  "https://github.com/snowyu/json-canonicalize.ts",
  "https://github.com/zeux/meshoptimizer",
  "https://lucide.dev/",
  "https://nextjs.org/",
  "https://nodejs.org/",
  "https://react.dev/",
  "https://react.dev/reference/react-dom",
  "https://sigua.qq.com/",
  "https://space.bilibili.com/636117",
  "https://squad-armor.com/",
  "https://store.epicgames.com/p/squad?lang=en-US",
  "https://threejs.org/",
  "https://vite.dev/",
  "https://www.tencent.com/legal/html/zh-cn/property.html",
  "https://www.typescriptlang.org/",
];
const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    invariant(token.startsWith("--"), `unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) result[key] = true;
    else {
      result[key] = value;
      index += 1;
    }
  }
  return result;
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

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(stable(value), null, 2)}\n`, "utf8");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function walkFiles(root) {
  const output = [];
  async function visit(directory) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) output.push(absolutePath);
    }
  }
  await visit(root);
  return output;
}

function assertSafeReleaseText(text, label) {
  const textWithoutAllowedExternalHyperlinks = ALLOWED_EXTERNAL_HYPERLINKS.reduce(
    (result, url) => result.replaceAll(url, "[allowed-external-hyperlink]"),
    text,
  );
  invariant(!FORBIDDEN_LEGACY_TOKEN.test(text), `forbidden legacy token in ${label}`);
  invariant(
    !/squad-armor\.com/i.test(textWithoutAllowedExternalHyperlinks),
    `forbidden third-party URL in ${label}`,
  );
  invariant(!FORBIDDEN_LEGACY_SEMANTIC.test(text), `legacy semantic format in ${label}`);
  invariant(
    !/\b(?:publishStatus|accessStatus|visualAcceptanceStatus)["']?\s*:\s*["']blocked["']/i.test(text),
    `blocked data in ${label}`,
  );
  invariant(
    !FORBIDDEN_EXTERNAL_HYPERLINK.test(textWithoutAllowedExternalHyperlinks),
    `external hyperlink in ${label}`,
  );
  invariant(
    !/<!DOCTYPE\b[^>]*(?:SYSTEM|PUBLIC)\b[^>]*https?:/i.test(text),
    `external document type reference in ${label}`,
  );
}

async function readJsonDocument(filePath, label) {
  const bytes = await readFile(filePath);
  const text = bytes.toString("utf8");
  assertSafeReleaseText(text, label);
  try {
    return {
      bytes,
      document: JSON.parse(text),
    };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function verifyPreparedInputClosure(manifest) {
  const closure = manifest.inputClosure;
  if (closure == null) return 0;
  invariant(
    closure?.algorithm === "sha256-file/v1" &&
      Array.isArray(closure.entries) &&
      closure.entryCount === closure.entries.length &&
      closure.entries.length > 0,
    "prepared release input closure is invalid",
  );
  const paths = new Set();
  for (const entry of closure.entries) {
    invariant(
      typeof entry?.path === "string" &&
        entry.path.length > 0 &&
        !entry.path.includes("\\") &&
        typeof entry.sha256 === "string" &&
        SHA256_PATTERN.test(entry.sha256),
      "prepared release input declaration is invalid",
    );
    invariant(!paths.has(entry.path), `duplicate prepared release input: ${entry.path}`);
    paths.add(entry.path);
    const filePath = path.resolve(ROOT, ...entry.path.split("/"));
    const relativePath = path.relative(ROOT, filePath);
    invariant(
      relativePath &&
        !relativePath.startsWith("..") &&
        !path.isAbsolute(relativePath),
      `prepared release input escaped the checkout: ${entry.path}`,
    );
    const bytes = await readFile(filePath);
    const exactSha256 = sha256(bytes);
    const normalizedTextSha256 = TEXT_EXTENSIONS.has(
      path.extname(entry.path).toLowerCase(),
    )
      ? sha256(
          Buffer.from(
            bytes.toString("utf8").replace(/\r\n?/gu, "\n"),
            "utf8",
          ),
        )
      : null;
    invariant(
      exactSha256 === entry.sha256 || normalizedTextSha256 === entry.sha256,
      `prepared release input changed after preparation: ${entry.path}`,
    );
  }
  return paths.size;
}

function preparedReleaseEntries(clientRoot, manifest) {
  invariant(
    manifest?.schemaVersion === "sigua-public-release/v1" &&
      Array.isArray(manifest.entries) &&
      manifest.entryCount === manifest.entries.length,
    "prepared public release manifest is invalid",
  );
  const declarations = new Map();
  for (const entry of manifest.entries) {
    invariant(
      typeof entry?.path === "string" &&
        entry.path.length > 0 &&
        !entry.path.includes("\\") &&
        Number.isSafeInteger(entry.bytes) &&
        entry.bytes >= 0 &&
        typeof entry.sha256 === "string" &&
        SHA256_PATTERN.test(entry.sha256),
      "prepared public release entry is invalid",
    );
    invariant(!declarations.has(entry.path), `duplicate prepared public release entry: ${entry.path}`);
    const filePath = path.resolve(clientRoot, ...entry.path.split("/"));
    const relativePath = path.relative(clientRoot, filePath).split(path.sep).join("/");
    invariant(
      relativePath === entry.path &&
        !relativePath.startsWith("../") &&
        !path.isAbsolute(relativePath),
      `prepared public release entry escaped the client root: ${entry.path}`,
    );
    declarations.set(entry.path, entry);
  }
  return declarations;
}

function publicArtifact(clientRoot, url, label) {
  invariant(typeof url === "string" && url.startsWith("/") && !url.startsWith("//"), `${label} URL is invalid`);
  const parsed = new URL(url, RELEASE_ORIGIN);
  invariant(parsed.origin === RELEASE_ORIGIN, `${label} URL is external: ${url}`);
  invariant(!parsed.search && !parsed.hash, `${label} URL contains query or fragment: ${url}`);
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    throw new Error(`${label} URL is not valid percent-encoding: ${url}`);
  }
  invariant(!pathname.includes("\\"), `${label} URL contains a backslash: ${url}`);
  const relativePath = pathname.replace(/^\/+/, "");
  const filePath = path.resolve(clientRoot, ...relativePath.split("/"));
  const relative = path.relative(clientRoot, filePath);
  invariant(
    relative &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative),
    `${label} escaped the client root: ${url}`,
  );
  return {
    filePath,
    relativePath: relative.split(path.sep).join("/"),
    url: `/${relative.split(path.sep).join("/")}`,
  };
}

function validateArtifactMetadata(clientRoot, metadata, label) {
  invariant(metadata && typeof metadata === "object", `${label} metadata is missing`);
  invariant(Number.isSafeInteger(metadata.bytes) && metadata.bytes >= 0, `${label} byte count is invalid`);
  invariant(typeof metadata.sha256 === "string" && SHA256_PATTERN.test(metadata.sha256), `${label} SHA-256 is invalid`);
  return {
    ...publicArtifact(clientRoot, metadata.url, label),
    bytes: metadata.bytes,
    sha256: metadata.sha256,
  };
}

function registerArtifact(map, clientRoot, metadata, label) {
  const normalized = validateArtifactMetadata(clientRoot, metadata, label);
  const existing = map.get(normalized.url);
  if (existing) {
    invariant(existing.bytes === normalized.bytes, `${label} byte count conflicts for ${normalized.url}`);
    invariant(existing.sha256 === normalized.sha256, `${label} SHA-256 conflicts for ${normalized.url}`);
    return existing;
  }
  map.set(normalized.url, normalized);
  return normalized;
}

async function readVerifiedArtifact(artifact, label) {
  const bytes = await readFile(artifact.filePath);
  invariant(bytes.byteLength === artifact.bytes, `${label} byte count mismatch: ${artifact.url}`);
  invariant(sha256(bytes) === artifact.sha256, `${label} SHA-256 mismatch: ${artifact.url}`);
  return bytes;
}

function assertSameSet(actual, expected, label) {
  const missing = [...expected].filter((value) => !actual.has(value));
  const extra = [...actual].filter((value) => !expected.has(value));
  invariant(
    missing.length === 0 && extra.length === 0,
    `${label} closure mismatch: missing=${missing.slice(0, 5).join(",") || "none"} extra=${extra.slice(0, 5).join(",") || "none"}`,
  );
}

function assertArtifactDirectoryClosure(relativePaths, prefix, expectedUrls, label) {
  const actual = new Set(
    [...relativePaths]
      .filter((relativePath) => relativePath.startsWith(prefix))
      .map((relativePath) => `/${relativePath}`),
  );
  assertSameSet(actual, new Set(expectedUrls), label);
}

function threeLoaderModelBase(modelUrl) {
  const index = modelUrl.lastIndexOf("/");
  return index === -1 ? "./" : modelUrl.slice(0, index + 1);
}

function threeLoaderResolveUrl(uri, basePath) {
  if (typeof uri !== "string" || uri === "") return "";
  let pathValue = basePath;
  if (/^https?:\/\//i.test(pathValue) && /^\//.test(uri)) {
    pathValue = pathValue.replace(/(^https?:\/\/[^/]+).*/i, "$1");
  }
  if (/^(https?:)?\/\//i.test(uri)) return uri;
  if (/^data:.*,.*$/i.test(uri)) return uri;
  if (/^blob:.*$/i.test(uri)) return uri;
  return pathValue + uri;
}

export function resolveThreeModelResourcePath(modelUrl, uri, label = "glTF resource") {
  invariant(typeof modelUrl === "string" && modelUrl.startsWith("/"), `${label} model URL is invalid`);
  const loaderResolved = threeLoaderResolveUrl(uri, threeLoaderModelBase(modelUrl));
  invariant(loaderResolved.length > 0, `${label} has an empty URI`);
  const resolved = new URL(loaderResolved, RELEASE_ORIGIN);
  invariant(resolved.origin === RELEASE_ORIGIN, `${label} references an external URI: ${uri}`);
  invariant(!resolved.search && !resolved.hash, `${label} URI contains query or fragment: ${uri}`);
  return resolved.pathname;
}

export function resolveGltfExternalUri(modelUrl, uri, label = "glTF resource") {
  invariant(typeof uri === "string" && uri.length > 0, `${label} has an empty URI`);
  if (/^data:/i.test(uri)) return null;
  invariant(
    /^\.\.\/blob\/[0-9a-f]{64}\.[a-z0-9]+$/.test(uri),
    `${label} must use a content-addressed URI relative to the model directory: ${uri}`,
  );
  return resolveThreeModelResourcePath(modelUrl, uri, label);
}

function gltfExternalUris(document, modelUrl, label) {
  const uris = new Set();
  for (const [kind, records] of [
    ["buffer", document.buffers ?? []],
    ["image", document.images ?? []],
  ]) {
    invariant(Array.isArray(records), `${label} ${kind} collection is invalid`);
    for (const record of records) {
      if (typeof record?.uri !== "string") continue;
      const resolved = resolveGltfExternalUri(modelUrl, record.uri, `${label} ${kind}`);
      if (resolved) uris.add(resolved);
    }
  }
  return uris;
}

async function verifyFooterAttributionSource() {
  const source = await readFile(FOOTER_SOURCE, "utf8");
  const declaredExternalHyperlinks = [
    ...source.matchAll(/\bhref="(https?:\/\/[^"]+)"/g),
  ].map((match) => match[1]);
  invariant(
    declaredExternalHyperlinks.length === ALLOWED_EXTERNAL_HYPERLINKS.length &&
      new Set(declaredExternalHyperlinks).size === ALLOWED_EXTERNAL_HYPERLINKS.length &&
      ALLOWED_EXTERNAL_HYPERLINKS.every((url) => declaredExternalHyperlinks.includes(url)),
    "footer external hyperlinks do not match the exact release allowlist",
  );
  invariant(
    /<a\s+href="https:\/\/space\.bilibili\.com\/636117"\s+target="_blank"\s+rel="noreferrer">\s*@猹Cheems\s*<\/a>/.test(
      source,
    ),
    "footer maintainer attribution must link the allowed Bilibili profile",
  );
  const occurrences = source.match(/Squad Armor/g)?.length ?? 0;
  invariant(occurrences === 1, `footer source must contain one Squad Armor attribution, got ${occurrences}`);
  const attributionItems = [
    ...source.matchAll(/<li>(?:(?!<\/li>)[\s\S])*Squad Armor(?:(?!<\/li>)[\s\S])*<\/li>/g),
  ];
  invariant(attributionItems.length === 1, "Squad Armor must occur in exactly one footer acknowledgement item");
  const attribution = attributionItems[0][0];
  const allowedLink =
    /<a\s+href="https:\/\/squad-armor\.com\/"\s+target="_blank"\s+rel="noreferrer">\s*Squad Armor\s*<\/a>/;
  invariant(
    allowedLink.test(attribution) &&
      /启发了作者制作本项目。/.test(attribution),
    "Squad Armor footer acknowledgement text is not the allowed attribution",
  );
  invariant(
    !/<a\b|\bhref\s*=|https?:|mailto:/i.test(attribution.replace(allowedLink, "")),
    "Squad Armor footer attribution contains an unexpected link",
  );
  invariant(
    /<footer[\s\S]*?<SiteFooterCopy\b/.test(source) &&
      /className="site-footer__acknowledgements"/.test(source),
    "allowed acknowledgement is not owned by the site footer",
  );
  return {
    source: path.relative(ROOT, FOOTER_SOURCE).split(path.sep).join("/"),
    occurrences,
    externalHyperlinks: declaredExternalHyperlinks.length,
  };
}

function verifyBuiltFooterAttribution(text, relativePath) {
  const offsets = [...text.matchAll(/Squad Armor/g)].map((match) => match.index);
  for (const offset of offsets) {
    const context = text.slice(Math.max(0, offset - 2048), Math.min(text.length, offset + 2048));
    invariant(
      /site-footer__acknowledgements/.test(context) ||
        /启发了作者制作本项目。/.test(context) ||
        /\\u542f\\u53d1\\u4e86\\u4f5c\\u8005\\u5236\\u4f5c\\u672c\\u9879\\u76ee/.test(context),
      `Squad Armor is not attributable to the allowed footer in built output: ${relativePath}`,
    );
    invariant(
      /href:"https:\/\/squad-armor\.com\/"[^}]{0,192}children:"Squad Armor"/.test(context) ||
        /href="https:\/\/squad-armor\.com\/"[^>]*>\s*Squad Armor\s*</.test(context),
      `Squad Armor footer attribution does not use the exact allowed link in built output: ${relativePath}`,
    );
  }
  return offsets.length;
}

async function verifyVisualClosure({
  clientRoot,
  relativePaths,
  visualIndexPath,
  visualManifestPath,
  expectedBindingCount = 604,
  expectedSourceAssetCount = 2475,
  assertDirectoryClosure = true,
}) {
  const [{ document: index }, { document: manifest }] = await Promise.all([
    readJsonDocument(visualIndexPath, "visual release index"),
    readJsonDocument(visualManifestPath, "visual release manifest"),
  ]);
  invariant(index.schemaVersion === "runtime-visual-descriptor-index/v1", "unsupported visual release index");
  invariant(Array.isArray(index.descriptors), "visual release descriptors are missing");
  invariant(index.descriptorCount === index.descriptors.length, "visual release descriptor count mismatch");
  invariant(
    index.descriptors.length === expectedBindingCount,
    `expected ${expectedBindingCount} visual bindings, got ${index.descriptors.length}`,
  );
  invariant(manifest.schemaVersion === "runtime-visual-release-manifest/v1", "unsupported visual release manifest");
  invariant(manifest.complete === true, "visual release manifest is incomplete");
  invariant(
    manifest.sourceAssetCount === manifest.expectedSourceAssetCount &&
      manifest.expectedSourceAssetCount === expectedSourceAssetCount,
    `visual source closure is incomplete: ${manifest.sourceAssetCount}/${manifest.expectedSourceAssetCount}`,
  );
  invariant(manifest.entries && typeof manifest.entries === "object", "visual release manifest entries are missing");
  const sourceEntries = Object.entries(manifest.entries);
  invariant(sourceEntries.length === manifest.sourceAssetCount, "visual source asset count disagrees with manifest entries");

  const models = new Map();
  const blobs = new Map();
  for (const [sourceUrl, entry] of sourceEntries) {
    invariant(typeof sourceUrl === "string" && sourceUrl.startsWith("/"), "visual source URL is invalid");
    invariant(entry && typeof entry === "object", `visual manifest entry is invalid: ${sourceUrl}`);
    const model = registerArtifact(models, clientRoot, {
      url: entry.modelUrl,
      sha256: entry.modelSha256,
      bytes: entry.modelBytes,
    }, `visual model for ${sourceUrl}`);
    invariant(
      model.url === `/assets/runtime-probe/models/${model.sha256}.gltf`,
      `visual model URL is not content-addressed: ${model.url}`,
    );
    invariant(Array.isArray(entry.resources), `visual resources are missing: ${sourceUrl}`);
    const entryResources = new Map();
    for (const resource of entry.resources) {
      invariant(typeof resource?.extension === "string" && /^[a-z0-9]+$/i.test(resource.extension), `visual resource extension is invalid: ${sourceUrl}`);
      const blob = registerArtifact(blobs, clientRoot, {
        url: resource.url,
        sha256: resource.sha256,
        bytes: resource.bytes,
      }, `visual blob for ${sourceUrl}`);
      invariant(
        blob.url === `/assets/runtime-probe/blob/${blob.sha256}.${resource.extension}`,
        `visual blob URL is not content-addressed: ${blob.url}`,
      );
      entryResources.set(blob.url, blob);
    }
    const resourceBytes = [...entryResources.values()].reduce((total, resource) => total + resource.bytes, 0);
    invariant(resourceBytes === entry.resourceBytes, `visual resource byte count mismatch: ${sourceUrl}`);
    const resourceSignature = JSON.stringify(
      [...entryResources.values()]
        .map(({ url, sha256: digest, bytes }) => ({ url, sha256: digest, bytes }))
        .sort((left, right) => left.url.localeCompare(right.url, "en")),
    );
    if (model.resourceSignature !== undefined) {
      invariant(model.resourceSignature === resourceSignature, `visual model resource closure conflicts: ${model.url}`);
    } else {
      model.resourceSignature = resourceSignature;
      model.resources = new Set(entryResources.keys());
    }
  }

  invariant(models.size === manifest.uniqueModelCount, "visual model count disagrees with manifest");
  invariant(blobs.size === manifest.uniqueBlobCount, "visual blob count disagrees with manifest");
  invariant(
    [...models.values()].reduce((total, model) => total + model.bytes, 0) === manifest.modelBytes,
    "visual model byte total disagrees with manifest",
  );
  invariant(
    [...blobs.values()].reduce((total, blob) => total + blob.bytes, 0) === manifest.blobBytes,
    "visual blob byte total disagrees with manifest",
  );

  const bindingIdentities = new Set();
  const referencedModels = new Set();
  for (const descriptor of index.descriptors) {
    invariant(descriptor?.schemaVersion === "runtime-visual-preview/v1", "unsupported visual descriptor");
    invariant(typeof descriptor.cardId === "string" && typeof descriptor.rawName === "string", "visual binding identity is invalid");
    const identity = `${descriptor.cardId}\u0000${descriptor.rawName}`;
    invariant(!bindingIdentities.has(identity), `duplicate visual binding: ${identity}`);
    bindingIdentities.add(identity);
    invariant(Array.isArray(descriptor.placements), `visual placements are missing: ${identity}`);
    invariant(descriptor.requiredOccurrences === descriptor.placements.length, `visual occurrence count mismatch: ${identity}`);
    const descriptorModels = new Set();
    for (const placement of descriptor.placements) {
      const asset = publicArtifact(clientRoot, placement?.assetUrl, `visual placement ${identity}`);
      invariant(models.has(asset.url), `visual placement references an undeclared model: ${asset.url}`);
      descriptorModels.add(asset.url);
      referencedModels.add(asset.url);
    }
    invariant(descriptor.sourceAssets === descriptorModels.size, `visual source asset count mismatch: ${identity}`);
  }
  assertSameSet(referencedModels, new Set(models.keys()), "visual index/model");

  let externalResourceCount = 0;
  for (const model of models.values()) {
    const bytes = await readVerifiedArtifact(model, "visual model");
    const text = bytes.toString("utf8");
    assertSafeReleaseText(text, `visual model ${model.url}`);
    let document;
    try {
      document = JSON.parse(text);
    } catch (error) {
      throw new Error(`visual model is not valid glTF JSON (${model.url}): ${error.message}`);
    }
    invariant(document.asset?.version === "2.0", `visual model is not glTF 2.0: ${model.url}`);
    const resolvedUris = new Set(
      [...gltfExternalUris(document, model.url, `visual model ${model.url}`)]
        .map((url) => publicArtifact(clientRoot, url, `visual model ${model.url} resource`).url),
    );
    assertSameSet(resolvedUris, model.resources, `visual glTF resource ${model.url}`);
    externalResourceCount += resolvedUris.size;
  }
  for (const blob of blobs.values()) await readVerifiedArtifact(blob, "visual blob");

  if (assertDirectoryClosure) {
    assertArtifactDirectoryClosure(
      relativePaths,
      "assets/runtime-probe/models/",
      models.keys(),
      "visual model directory",
    );
    assertArtifactDirectoryClosure(
      relativePaths,
      "assets/runtime-probe/blob/",
      blobs.keys(),
      "visual blob directory",
    );
  }
  return {
    bindingCount: index.descriptors.length,
    sourceAssetCount: manifest.sourceAssetCount,
    modelCount: models.size,
    blobCount: blobs.size,
    externalResourceCount,
    modelUrls: [...models.keys()],
    blobUrls: [...blobs.keys()],
  };
}

async function verifyChinaVisualBindingClosure({
  clientRoot,
  chinaVisualIndexPath,
  allowedModelUrls,
  requiredPatchModelUrls,
}) {
  const { document: index } = await readJsonDocument(
    chinaVisualIndexPath,
    "China visual release index",
  );
  invariant(
    index.schemaVersion === "runtime-visual-descriptor-index/v1" &&
      Array.isArray(index.descriptors) &&
      index.descriptorCount === index.descriptors.length &&
      index.descriptors.length === 213,
    "China visual release binding closure is invalid",
  );
  const identities = new Set();
  const referencedPatchModels = new Set();
  for (const descriptor of index.descriptors) {
    const identity = `${descriptor.cardId}\u0000${descriptor.rawName}`;
    invariant(!identities.has(identity), `duplicate China visual binding: ${identity}`);
    identities.add(identity);
    invariant(
      descriptor?.schemaVersion === "runtime-visual-preview/v1" &&
        descriptor.requiredOccurrences === descriptor.placements?.length,
      `China visual occurrence count mismatch: ${identity}`,
    );
    const descriptorModels = new Set();
    for (const placement of descriptor.placements) {
      const asset = publicArtifact(
        clientRoot,
        placement?.assetUrl,
        `China visual placement ${identity}`,
      );
      invariant(
        allowedModelUrls.has(asset.url),
        `China visual placement references an undeclared model: ${asset.url}`,
      );
      descriptorModels.add(asset.url);
      if (requiredPatchModelUrls.has(asset.url)) {
        referencedPatchModels.add(asset.url);
      }
    }
    invariant(
      descriptor.sourceAssets === descriptorModels.size,
      `China visual source asset count mismatch: ${identity}`,
    );
  }
  assertSameSet(
    referencedPatchModels,
    requiredPatchModelUrls,
    "China visual patch model/index",
  );
  return { bindingCount: index.descriptors.length };
}

async function verifyChinaTexturePatchAudit({
  auditPath,
  visualClosure,
}) {
  const { document: audit } = await readJsonDocument(
    auditPath,
    "China texture patch audit",
  );
  invariant(
    audit.schemaVersion === "sigua-china-runtime-texture-patch-audit/v1",
    "unsupported China texture patch audit",
  );
  invariant(
    audit.activeProfileCount === EXPECTED_CHINA_TEXTURE_PATCH_PROFILES &&
      audit.inactiveProfileCount === 0,
    `China texture patch profiles are incomplete: ${audit.activeProfileCount}/${EXPECTED_CHINA_TEXTURE_PATCH_PROFILES} active, ${audit.inactiveProfileCount} inactive`,
  );
  invariant(
    audit.affectedRawSourceCount === visualClosure.sourceAssetCount,
    "China texture patch source count disagrees with the visual closure",
  );
  invariant(
    Array.isArray(audit.applications) &&
      audit.applications.length >= audit.affectedRawSourceCount,
    "China texture patch applications are incomplete",
  );
  const sourceUrls = new Set();
  const sourceHashes = new Set();
  for (const application of audit.applications) {
    invariant(
      typeof application?.sourceUrl === "string" &&
        typeof application?.sourceSha256 === "string" &&
        SHA256_PATTERN.test(application.sourceSha256) &&
        typeof application?.patchedSha256 === "string" &&
        SHA256_PATTERN.test(application.patchedSha256),
      "China texture patch application identity is invalid",
    );
    sourceUrls.add(application.sourceUrl);
    sourceHashes.add(application.sourceSha256);
  }
  invariant(
    sourceUrls.size === audit.affectedRawSourceCount,
    "China texture patch audit does not cover every affected visual source",
  );
  invariant(
    sourceHashes.size === audit.activeProfileCount,
    "China texture patch audit does not cover every active source hash",
  );
  return {
    activeProfileCount: audit.activeProfileCount,
    affectedSourceCount: audit.affectedRawSourceCount,
    applicationCount: audit.applications.length,
  };
}

async function verifyHitClosure({
  clientRoot,
  relativePaths,
  hitIndexPath,
  expectedBindingCount = 604,
  assertDirectoryClosure = true,
  label = "hit",
}) {
  const { document: index } = await readJsonDocument(
    hitIndexPath,
    `${label} release index`,
  );
  invariant(
    index.schemaVersion === "runtime-hit-preview-index/v1",
    `unsupported ${label} release index`,
  );
  invariant(Array.isArray(index.descriptors), `${label} release descriptors are missing`);
  invariant(
    index.descriptorCount === index.descriptors.length,
    `${label} release descriptor count mismatch`,
  );
  invariant(
    index.descriptors.length === expectedBindingCount,
    `expected ${expectedBindingCount} ${label} bindings, got ${index.descriptors.length}`,
  );

  const records = new Map();
  const geometry = new Map();
  const bvh = new Map();
  const bindingIdentities = new Set();
  for (const descriptor of index.descriptors) {
    invariant(descriptor?.accessStatus === "public", `non-public hit descriptor: ${descriptor?.cardId ?? "unknown"}`);
    invariant(descriptor.formatVersion === "hit-scene-runtime/v1", `unsupported hit descriptor format: ${descriptor.cardId}`);
    invariant(typeof descriptor.cardId === "string" && typeof descriptor.rawName === "string", "hit binding identity is invalid");
    const identity = `${descriptor.cardId}\u0000${descriptor.rawName}`;
    invariant(!bindingIdentities.has(identity), `duplicate hit binding: ${identity}`);
    bindingIdentities.add(identity);
    const record = registerArtifact(records, clientRoot, {
      url: descriptor.recordUrl,
      sha256: descriptor.recordSha256,
      bytes: descriptor.recordBytes,
    }, `hit record ${identity}`);
    const geometryArtifact = registerArtifact(geometry, clientRoot, {
      url: descriptor.geometryUrl,
      sha256: descriptor.geometrySha256,
      bytes: descriptor.geometryBytes,
    }, `hit geometry ${identity}`);
    const bvhArtifact = registerArtifact(bvh, clientRoot, {
      url: descriptor.bvhUrl,
      sha256: descriptor.bvhSha256,
      bytes: descriptor.bvhBytes,
    }, `hit BVH ${identity}`);
    invariant(
      record.url === `/assets/runtime-probe/hit-runtime/records/${record.sha256}.json`,
      `hit record URL is not content-addressed: ${record.url}`,
    );
    invariant(
      geometryArtifact.url === `/assets/runtime-probe/hit-runtime/geometry/${geometryArtifact.sha256}.bin`,
      `hit geometry URL is not content-addressed: ${geometryArtifact.url}`,
    );
    invariant(
      bvhArtifact.url === `/assets/runtime-probe/hit-runtime/bvh/${bvhArtifact.sha256}.bin`,
      `hit BVH URL is not content-addressed: ${bvhArtifact.url}`,
    );
    record.references ??= [];
    record.references.push({
      identity,
      vehicleId: descriptor.vehicleId,
      geometry: geometryArtifact,
      bvh: bvhArtifact,
      counts: {
        triangles: descriptor.triangles,
        components: descriptor.components,
        surfaceProfiles: descriptor.surfaceProfiles,
        bvhNodes: descriptor.bvhNodes,
      },
    });
  }

  for (const record of records.values()) {
    const bytes = await readVerifiedArtifact(record, "hit record");
    const text = bytes.toString("utf8");
    assertSafeReleaseText(text, `hit record ${record.url}`);
    let document;
    try {
      document = JSON.parse(text);
    } catch (error) {
      throw new Error(`hit record is not valid JSON (${record.url}): ${error.message}`);
    }
    invariant(document.schemaVersion === "1.0.0", `unsupported hit record schema: ${record.url}`);
    invariant(document.formatVersion === "hit-scene-runtime/v1", `unsupported hit record format: ${record.url}`);
    invariant(document.header?.formatVersion === "hit-scene-record/v1", `hit record was not neutralized: ${record.url}`);
    invariant(document.header?.staticExtraction === undefined, `private extraction metadata remains: ${record.url}`);
    const geometryUrl = publicArtifact(
      clientRoot,
      `/${String(document.geometry?.path ?? "").replace(/^\/+/, "")}`,
      `hit record geometry ${record.url}`,
    ).url;
    const bvhUrl = publicArtifact(
      clientRoot,
      `/${String(document.bvh?.path ?? "").replace(/^\/+/, "")}`,
      `hit record BVH ${record.url}`,
    ).url;
    for (const reference of record.references) {
      invariant(document.vehicleId === reference.vehicleId, `hit record vehicle identity mismatch: ${reference.identity}`);
      invariant(geometryUrl === reference.geometry.url, `hit record geometry URL mismatch: ${reference.identity}`);
      invariant(document.geometry?.sha256 === reference.geometry.sha256, `hit record geometry SHA-256 mismatch: ${reference.identity}`);
      invariant(document.geometry?.bytes === reference.geometry.bytes, `hit record geometry byte count mismatch: ${reference.identity}`);
      invariant(bvhUrl === reference.bvh.url, `hit record BVH URL mismatch: ${reference.identity}`);
      invariant(document.bvh?.sha256 === reference.bvh.sha256, `hit record BVH SHA-256 mismatch: ${reference.identity}`);
      invariant(document.bvh?.bytes === reference.bvh.bytes, `hit record BVH byte count mismatch: ${reference.identity}`);
      for (const [field, expected] of Object.entries(reference.counts)) {
        invariant(document.header?.counts?.[field] === expected, `hit record ${field} count mismatch: ${reference.identity}`);
      }
    }
  }
  for (const artifact of geometry.values()) await readVerifiedArtifact(artifact, "hit geometry");
  for (const artifact of bvh.values()) await readVerifiedArtifact(artifact, "hit BVH");

  if (assertDirectoryClosure) {
    assertArtifactDirectoryClosure(
      relativePaths,
      "assets/runtime-probe/hit-runtime/records/",
      records.keys(),
      `${label} record directory`,
    );
    assertArtifactDirectoryClosure(
      relativePaths,
      "assets/runtime-probe/hit-runtime/geometry/",
      geometry.keys(),
      `${label} geometry directory`,
    );
    assertArtifactDirectoryClosure(
      relativePaths,
      "assets/runtime-probe/hit-runtime/bvh/",
      bvh.keys(),
      `${label} BVH directory`,
    );
  }
  return {
    bindingCount: index.descriptors.length,
    recordCount: records.size,
    geometryCount: geometry.size,
    bvhCount: bvh.size,
    recordUrls: [...records.keys()],
    geometryUrls: [...geometry.keys()],
    bvhUrls: [...bvh.keys()],
  };
}

function viteManifestAssetPaths(document, clientRoot) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return new Set();
  const output = new Set();
  for (const entry of Object.values(document)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidates = [
      ...(typeof entry.file === "string" ? [entry.file] : []),
      ...(Array.isArray(entry.css) ? entry.css : []),
      ...(Array.isArray(entry.assets) ? entry.assets : []),
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      try {
        output.add(publicArtifact(clientRoot, `/${candidate.replace(/^\/+/, "")}`, "Vite manifest asset").relativePath);
      } catch {
        // Server manifests may contain server-only outputs. They are not client cache candidates.
      }
    }
  }
  return output;
}

async function discoverViteImmutableAssets(clientRoot, sourceFiles) {
  const distRoot = path.dirname(clientRoot);
  const preferredManifest = path.join(clientRoot, ".vite", "manifest.json");
  if (await exists(preferredManifest)) {
    const { document } = await readJsonDocument(preferredManifest, "Vite client manifest");
    const paths = viteManifestAssetPaths(document, clientRoot);
    const serverManifest = path.join(distRoot, "server", ".vite", "manifest.json");
    if (await exists(serverManifest)) {
      const { document: serverDocument } = await readJsonDocument(
        serverManifest,
        "Vite server manifest",
      );
      for (const relativePath of viteManifestAssetPaths(serverDocument, clientRoot)) {
        if (await exists(path.join(clientRoot, ...relativePath.split("/")))) {
          paths.add(relativePath);
        }
      }
    }
    invariant(paths.size > 0, "Vite client manifest contains no client assets");
    for (const relativePath of paths) {
      invariant(
        await exists(path.join(clientRoot, ...relativePath.split("/"))),
        `Vite client manifest asset is missing: ${relativePath}`,
      );
    }
    const clientBundlePaths = new Set(
      sourceFiles
        .map((filePath) => path.relative(clientRoot, filePath).split(path.sep).join("/"))
        .filter((relativePath) => /^assets\/.*\.(?:js|css)$/i.test(relativePath)),
    );
    const manifestBundlePaths = new Set(
      [...paths].filter((relativePath) => /^assets\/.*\.(?:js|css)$/i.test(relativePath)),
    );
    assertSameSet(clientBundlePaths, manifestBundlePaths, "Vite client manifest JS/CSS");
    return {
      paths,
      source: path.relative(ROOT, preferredManifest).split(path.sep).join("/"),
      disposableManifestPath: preferredManifest,
    };
  }

  const distFiles = await walkFiles(distRoot);
  const manifestCandidates = distFiles.filter((filePath) => {
    const normalized = filePath.split(path.sep).join("/");
    return /\/\.vite\/[^/]*manifest[^/]*\.json$/i.test(normalized) ||
      /\/vite[^/]*manifest[^/]*\.json$/i.test(normalized);
  });
  let best = null;
  for (const candidate of manifestCandidates) {
    const info = await stat(candidate);
    if (info.size > 16 * 1024 * 1024) continue;
    let document;
    try {
      document = JSON.parse(await readFile(candidate, "utf8"));
    } catch {
      continue;
    }
    const paths = viteManifestAssetPaths(document, clientRoot);
    const existingPaths = new Set();
    for (const relativePath of paths) {
      if (await exists(path.join(clientRoot, ...relativePath.split("/")))) existingPaths.add(relativePath);
    }
    if (existingPaths.size > (best?.paths.size ?? 0)) {
      best = {
        paths: existingPaths,
        source: path.relative(ROOT, candidate).split(path.sep).join("/"),
      };
    }
  }
  if (best?.paths.size > 0) return best;

  const controlled = new Set();
  for (const filePath of sourceFiles) {
    const relativePath = path.relative(clientRoot, filePath).split(path.sep).join("/");
    if (
      /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/i.test(relativePath)
    ) {
      controlled.add(relativePath);
    }
  }
  invariant(controlled.size > 0, "no Vite manifest or controlled content-hash JS/CSS assets were found");
  return {
    paths: controlled,
    source: "controlled-content-hash-js-css-set",
  };
}

async function writeIfUseful(filePath, bytes, sourceBytes) {
  if (bytes.byteLength >= sourceBytes * 0.98) {
    if (await exists(filePath)) await unlink(filePath);
    return null;
  }
  await writeFile(filePath, bytes);
  return {
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function compressFile(filePath, relativePath, bytes) {
  const extension = path.extname(relativePath).toLowerCase();
  if (
    bytes.byteLength < 1024 ||
    !COMPRESSIBLE_EXTENSIONS.has(extension) ||
    relativePath.startsWith("assets/runtime-probe/blob/")
  ) {
    return {};
  }
  let brotliBytes = await brotli(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 9,
      [constants.BROTLI_PARAM_MODE]: extension === ".bin"
        ? constants.BROTLI_MODE_GENERIC
        : constants.BROTLI_MODE_TEXT,
    },
  });
  const br = await writeIfUseful(`${filePath}.br`, brotliBytes, bytes.byteLength);
  brotliBytes = null;
  const gzipBytes = await gzipAsync(bytes, { level: 9 });
  const gz = await writeIfUseful(`${filePath}.gz`, gzipBytes, bytes.byteLength);
  return {
    ...(br ? { br } : {}),
    ...(gz ? { gzip: gz } : {}),
  };
}

function cachePolicyFor(relativePath, viteImmutablePaths) {
  if (
    relativePath.startsWith("assets/runtime-probe/") ||
    viteImmutablePaths.has(relativePath) ||
    /^images\/vehicle-impressions\/[0-9a-f]{64}\.webp$/.test(relativePath) ||
    /^images\/china-vehicle-impressions\/[0-9a-f]{64}\.webp$/.test(relativePath) ||
    /^fonts\/[^/]*-[0-9a-f]{8,}\.woff2$/.test(relativePath)
  ) {
    return "public,max-age=31536000,immutable";
  }
  if (relativePath === "updates.json" || relativePath === "supporters.json") {
    return "public,max-age=60,must-revalidate";
  }
  if (/^(?:\.vite\/)?[^/]*manifest[^/]*\.json$/i.test(relativePath)) {
    return "public,max-age=60,must-revalidate";
  }
  if (relativePath.endsWith(".html") || relativePath === "index.html") {
    return PUBLIC_DOCUMENT_CACHE.armorHtml;
  }
  return "public,max-age=3600,must-revalidate";
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const clientRoot = path.resolve(args["client-root"] ?? DEFAULT_CLIENT_ROOT);
  const summaryPath = path.resolve(args.summary ?? DEFAULT_SUMMARY);
  const visualIndexPath = path.resolve(args["visual-index"] ?? DEFAULT_VISUAL_INDEX);
  const supportVisualIndexPath = path.resolve(
    args["support-visual-index"] ?? DEFAULT_SUPPORT_VISUAL_INDEX,
  );
  const chinaVisualIndexPath = path.resolve(
    args["china-visual-index"] ?? DEFAULT_CHINA_VISUAL_INDEX,
  );
  const chinaVisualPatchIndexPath = path.resolve(
    args["china-visual-patch-index"] ?? DEFAULT_CHINA_VISUAL_PATCH_INDEX,
  );
  const hitIndexPath = path.resolve(args["hit-index"] ?? DEFAULT_HIT_INDEX);
  const supportHitIndexPath = path.resolve(
    args["support-hit-index"] ?? DEFAULT_SUPPORT_HIT_INDEX,
  );
  const visualManifestPath = path.resolve(args["visual-manifest"] ?? DEFAULT_VISUAL_MANIFEST);
  const supportVisualManifestPath = path.resolve(
    args["support-visual-manifest"] ?? DEFAULT_SUPPORT_VISUAL_MANIFEST,
  );
  const chinaVisualManifestPath = path.resolve(
    args["china-visual-manifest"] ?? DEFAULT_CHINA_VISUAL_MANIFEST,
  );
  const chinaVisualPatchAuditPath = path.resolve(
    args["china-visual-patch-audit"] ?? DEFAULT_CHINA_VISUAL_PATCH_AUDIT,
  );
  const preparedManifestPath = path.resolve(
    args["prepared-manifest"] ?? DEFAULT_PREPARED_MANIFEST,
  );
  const relativeClientRoot = path.relative(path.join(ROOT, "dist"), clientRoot);
  invariant(
    relativeClientRoot &&
      !relativeClientRoot.startsWith("..") &&
      !path.isAbsolute(relativeClientRoot) &&
      path.basename(clientRoot) === "client",
    `client build root must be a /dist/.../client directory: ${clientRoot}`,
  );
  invariant((await stat(clientRoot)).isDirectory(), `client build root is missing: ${clientRoot}`);

  const manifestPath = path.join(clientRoot, "release-manifest.json");
  invariant(await exists(manifestPath), "built output is missing the prepared release manifest");
  const [builtPreparedManifest, sourcePreparedManifest] = await Promise.all([
    readJsonDocument(manifestPath, "built prepared release manifest"),
    readJsonDocument(preparedManifestPath, "source prepared release manifest"),
  ]);
  invariant(
    builtPreparedManifest.bytes.equals(sourcePreparedManifest.bytes),
    "built and source prepared release manifests are from different preparations",
  );
  const preparedDeclarations = preparedReleaseEntries(
    clientRoot,
    builtPreparedManifest.document,
  );
  const preparedInputCount = await verifyPreparedInputClosure(
    builtPreparedManifest.document,
  );
  const staleSidecars = (await walkFiles(clientRoot)).filter(
    (filePath) => filePath.endsWith(".br") || filePath.endsWith(".gz"),
  );
  for (const filePath of staleSidecars) await unlink(filePath);

  const builtFiles = await walkFiles(clientRoot);
  const footerSource = await verifyFooterAttributionSource();
  const viteImmutable = await discoverViteImmutableAssets(clientRoot, builtFiles);
  const excludedBuildMetadata = new Set([
    path.resolve(manifestPath),
    ...(viteImmutable.disposableManifestPath
      ? [path.resolve(viteImmutable.disposableManifestPath)]
      : []),
  ]);
  const sourceFiles = builtFiles.filter(
    (filePath) => !excludedBuildMetadata.has(path.resolve(filePath)),
  );
  const relativePaths = new Set(
    sourceFiles.map((filePath) =>
      path.relative(clientRoot, filePath).split(path.sep).join("/")
    ),
  );
  const internationalVisualClosure = await verifyVisualClosure({
    clientRoot,
    relativePaths,
    visualIndexPath,
    visualManifestPath,
    assertDirectoryClosure: false,
  });
  const supportVisualClosure = await verifyVisualClosure({
    clientRoot,
    relativePaths,
    visualIndexPath: supportVisualIndexPath,
    visualManifestPath: supportVisualManifestPath,
    expectedBindingCount: 44,
    expectedSourceAssetCount: 23,
    assertDirectoryClosure: false,
  });
  const chinaPatchVisualClosure = await verifyVisualClosure({
    clientRoot,
    relativePaths,
    visualIndexPath: chinaVisualPatchIndexPath,
    visualManifestPath: chinaVisualManifestPath,
    expectedBindingCount: EXPECTED_CHINA_VISUAL_PATCH_BINDINGS,
    expectedSourceAssetCount: EXPECTED_CHINA_VISUAL_PATCH_SOURCE_ASSETS,
    assertDirectoryClosure: false,
  });
  const chinaTexturePatchAudit = await verifyChinaTexturePatchAudit({
    auditPath: chinaVisualPatchAuditPath,
    visualClosure: chinaPatchVisualClosure,
  });
  const combinedModelUrls = new Set([
    ...internationalVisualClosure.modelUrls,
    ...supportVisualClosure.modelUrls,
    ...chinaPatchVisualClosure.modelUrls,
  ]);
  const combinedBlobUrls = new Set([
    ...internationalVisualClosure.blobUrls,
    ...supportVisualClosure.blobUrls,
    ...chinaPatchVisualClosure.blobUrls,
  ]);
  const chinaVisualBindingClosure = await verifyChinaVisualBindingClosure({
    clientRoot,
    chinaVisualIndexPath,
    allowedModelUrls: combinedModelUrls,
    requiredPatchModelUrls: new Set(chinaPatchVisualClosure.modelUrls),
  });
  assertArtifactDirectoryClosure(
    relativePaths,
    "assets/runtime-probe/models/",
    combinedModelUrls,
    "combined visual model directory",
  );
  assertArtifactDirectoryClosure(
    relativePaths,
    "assets/runtime-probe/blob/",
    combinedBlobUrls,
    "combined visual blob directory",
  );
  const visualClosure = {
    bindingCount:
      internationalVisualClosure.bindingCount +
      supportVisualClosure.bindingCount +
      chinaVisualBindingClosure.bindingCount,
    sourceAssetCount:
      internationalVisualClosure.sourceAssetCount +
      supportVisualClosure.sourceAssetCount +
      chinaPatchVisualClosure.sourceAssetCount,
    modelCount: combinedModelUrls.size,
    blobCount: combinedBlobUrls.size,
    externalResourceCount:
      internationalVisualClosure.externalResourceCount +
      supportVisualClosure.externalResourceCount +
      chinaPatchVisualClosure.externalResourceCount,
  };
  const coreHitClosure = await verifyHitClosure({
    clientRoot,
    relativePaths,
    hitIndexPath,
    assertDirectoryClosure: false,
  });
  const supportHitClosure = await verifyHitClosure({
    clientRoot,
    relativePaths,
    hitIndexPath: supportHitIndexPath,
    expectedBindingCount: 12,
    assertDirectoryClosure: false,
    label: "support-air hit",
  });
  const combinedHitRecordUrls = new Set([
    ...coreHitClosure.recordUrls,
    ...supportHitClosure.recordUrls,
  ]);
  const combinedHitGeometryUrls = new Set([
    ...coreHitClosure.geometryUrls,
    ...supportHitClosure.geometryUrls,
  ]);
  const combinedHitBvhUrls = new Set([
    ...coreHitClosure.bvhUrls,
    ...supportHitClosure.bvhUrls,
  ]);
  assertArtifactDirectoryClosure(
    relativePaths,
    "assets/runtime-probe/hit-runtime/records/",
    combinedHitRecordUrls,
    "combined hit record directory",
  );
  assertArtifactDirectoryClosure(
    relativePaths,
    "assets/runtime-probe/hit-runtime/geometry/",
    combinedHitGeometryUrls,
    "combined hit geometry directory",
  );
  assertArtifactDirectoryClosure(
    relativePaths,
    "assets/runtime-probe/hit-runtime/bvh/",
    combinedHitBvhUrls,
    "combined hit BVH directory",
  );
  const hitClosure = {
    bindingCount:
      coreHitClosure.bindingCount + supportHitClosure.bindingCount,
    recordCount: combinedHitRecordUrls.size,
    geometryCount: combinedHitGeometryUrls.size,
    bvhCount: combinedHitBvhUrls.size,
  };
  const entries = new Array(sourceFiles.length);
  let cursor = 0;
  let builtFooterAttributionFiles = 0;
  let builtFooterAttributionOccurrences = 0;
  const verifiedPreparedPaths = new Set();
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= sourceFiles.length) return;
      const filePath = sourceFiles[index];
      const relativePath = path.relative(clientRoot, filePath).split(path.sep).join("/");
      const extension = path.extname(relativePath).toLowerCase();
      invariant(extension !== ".hsp", `forbidden release file: ${relativePath}`);
      const bytes = await readFile(filePath);
      const preparedDeclaration = preparedDeclarations.get(relativePath);
      if (preparedDeclaration) {
        invariant(
          bytes.byteLength === preparedDeclaration.bytes &&
            sha256(bytes) === preparedDeclaration.sha256,
          `prepared public release asset changed during application build: ${relativePath}`,
        );
        verifiedPreparedPaths.add(relativePath);
      }
      if (TEXT_EXTENSIONS.has(extension)) {
        const text = bytes.toString("utf8");
        assertSafeReleaseText(text, `built output: ${relativePath}`);
        if (text.includes("Squad Armor")) {
          builtFooterAttributionFiles += 1;
          builtFooterAttributionOccurrences += verifyBuiltFooterAttribution(text, relativePath);
        }
      }
      const encodings = await compressFile(filePath, relativePath, bytes);
      entries[index] = {
        path: relativePath,
        sha256: sha256(bytes),
        bytes: bytes.byteLength,
        cacheControl: cachePolicyFor(relativePath, viteImmutable.paths),
        encodings,
      };
    }
  }
  await Promise.all(Array.from({ length: COMPRESSION_CONCURRENCY }, () => worker()));
  invariant(
    verifiedPreparedPaths.size === preparedDeclarations.size &&
      [...preparedDeclarations.keys()].every((relativePath) =>
        verifiedPreparedPaths.has(relativePath)
      ),
    "built output does not contain the exact prepared public asset closure",
  );
  invariant(
    builtFooterAttributionOccurrences > 0,
    "built output does not contain the allowed Squad Armor footer attribution",
  );

  invariant(!entries.some((entry) => entry.path.startsWith("assets/runtime-probe/visuals/")), "raw visual assets entered built output");
  invariant(!entries.some((entry) => entry.path.startsWith("runtime-probe/")), "authoring runtime indexes entered built output");
  invariant(!entries.some((entry) => entry.path.includes(".runtime-card-impressions-tmp-")), "temporary card assets entered built output");
  invariant(!entries.some((entry) => entry.path.startsWith("images/faction-impressions/")), "unused faction impressions entered built output");
  invariant(!entries.some((entry) => entry.path === "logo_dark.webp" || entry.path === "sqa_logo.webp"), "legacy logo entered built output");
  invariant(
    !entries.some((entry) => entry.path.startsWith("local-preview/")),
    "local preview content entered built output",
  );

  const totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  const brotliBytes = entries.reduce((total, entry) => total + (entry.encodings.br?.bytes ?? entry.bytes), 0);
  const gzipBytes = entries.reduce((total, entry) => total + (entry.encodings.gzip?.bytes ?? entry.bytes), 0);
  const manifest = {
    schemaVersion: "sigua-cdn-release/v1",
    releaseId: "international-foundation-2026-07-23",
    entryCount: entries.length,
    totalBytes,
    brotliTransferBytes: brotliBytes,
    gzipTransferBytes: gzipBytes,
    closure: {
      visualBindings: visualClosure.bindingCount,
      visualSourceAssets: visualClosure.sourceAssetCount,
      visualModels: visualClosure.modelCount,
      visualBlobs: visualClosure.blobCount,
      visualExternalResources: visualClosure.externalResourceCount,
      chinaTexturePatchProfiles: chinaTexturePatchAudit.activeProfileCount,
      chinaTexturePatchSources: chinaTexturePatchAudit.affectedSourceCount,
      chinaTexturePatchApplications: chinaTexturePatchAudit.applicationCount,
      hitBindings: hitClosure.bindingCount,
      hitRecords: hitClosure.recordCount,
      hitGeometry: hitClosure.geometryCount,
      hitBvh: hitClosure.bvhCount,
      footerAttributionSource: footerSource.source,
      footerAttributionFiles: builtFooterAttributionFiles,
      footerAttributionOccurrences: builtFooterAttributionOccurrences,
      viteImmutableAssets: viteImmutable.paths.size,
      viteImmutableSource: viteImmutable.source,
      preparedInputs: preparedInputCount,
      preparedAssets: preparedDeclarations.size,
    },
    headers: {
      contentEncoding: ["br", "gzip"],
      vary: "Accept-Encoding",
      immutable: "public,max-age=31536000,immutable",
      mutable: "public,max-age=60,must-revalidate",
      html: PUBLIC_DOCUMENT_CACHE.armorHtml,
    },
    entries,
  };
  if (viteImmutable.disposableManifestPath) {
    await unlink(viteImmutable.disposableManifestPath);
  }
  const manifestBytes = jsonBytes(manifest);
  await writeFile(manifestPath, manifestBytes);
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, jsonBytes({
    schemaVersion: manifest.schemaVersion,
    releaseId: manifest.releaseId,
    manifestSha256: sha256(manifestBytes),
    manifestBytes: manifestBytes.byteLength,
    entryCount: manifest.entryCount,
    totalBytes: manifest.totalBytes,
    brotliTransferBytes: manifest.brotliTransferBytes,
    gzipTransferBytes: manifest.gzipTransferBytes,
    closure: manifest.closure,
    headers: manifest.headers,
  }));
  process.stdout.write(`${JSON.stringify({
    clientRoot,
    summaryPath,
    manifestSha256: sha256(manifestBytes),
    entryCount: manifest.entryCount,
    totalBytes: manifest.totalBytes,
    brotliTransferBytes: manifest.brotliTransferBytes,
    gzipTransferBytes: manifest.gzipTransferBytes,
    closure: manifest.closure,
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
