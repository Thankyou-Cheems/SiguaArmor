import { access } from "node:fs/promises";
import path from "node:path";

const publicArtifactRootCache = new Map();

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function safeRepositoryRelativePath(relativePath) {
  const normalized = String(relativePath ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+/u, "");
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`public artifact path must stay relative: ${relativePath}`);
  }
  return normalized;
}

async function publicArtifactRoots(repositoryRoot) {
  const cacheKey = path.resolve(repositoryRoot);
  if (!publicArtifactRootCache.has(cacheKey)) {
    publicArtifactRootCache.set(
      cacheKey,
      Promise.resolve(
        [
          process.env.SIGUA_RELEASE_PUBLIC_DIR?.trim(),
          path.join(cacheKey, ".release", "public"),
          path.join(cacheKey, "public"),
        ]
          .filter(Boolean)
          .map((candidate) => path.resolve(candidate)),
      ),
    );
  }
  return publicArtifactRootCache.get(cacheKey);
}

export async function resolvePublicArtifactPath(repositoryRoot, relativePath) {
  const normalized = safeRepositoryRelativePath(relativePath);
  const searched = [];
  for (const publicRoot of await publicArtifactRoots(repositoryRoot)) {
    const candidate = path.join(publicRoot, ...normalized.split("/"));
    searched.push(candidate);
    if (await exists(candidate)) return candidate;
  }
  throw new Error(
    `public artifact is unavailable without regeneration: ${normalized}\n` +
      searched.map((candidate) => `- ${candidate}`).join("\n"),
  );
}
