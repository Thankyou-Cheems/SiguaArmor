import path from "node:path";

export const CHINA_RUNTIME_VISUAL_CACHE_DIRECTORY = "china-visuals-v6";

export function chinaRuntimeVisualCacheRoot(repositoryRoot) {
  return path.join(
    process.env.SIGUA_PUBLIC_RELEASE_CACHE_ROOT?.trim() ||
      path.join(repositoryRoot, "outputs", "public-release-cache"),
    CHINA_RUNTIME_VISUAL_CACHE_DIRECTORY,
  );
}
