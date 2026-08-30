function invariant(condition, message) {
  if (!condition) throw new Error(`Invalid local Wiki preview config: ${message}`);
}

export function createWikiHybridViteConfig({
  wikiRoot,
  localAssetOrigin,
  upstreamWikiOrigin = "https://wiki.siguad.icu",
}) {
  invariant(typeof wikiRoot === "string" && wikiRoot.length > 0, "Wiki root is missing");
  invariant(/^https?:\/\/[^/]+$/u.test(localAssetOrigin), "local asset origin is invalid");
  invariant(/^https:\/\/[^/]+$/u.test(upstreamWikiOrigin), "upstream Wiki origin is invalid");
  return {
    root: wikiRoot.replaceAll("\\", "/"),
    server: {
      cors: true,
      proxy: {
        "/assets/vehicle-crew": {
          target: localAssetOrigin,
          changeOrigin: true,
          secure: false,
        },
        "/assets/vehicle-gunner-sights": {
          target: localAssetOrigin,
          changeOrigin: true,
          secure: false,
        },
        "/assets": {
          target: upstreamWikiOrigin,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
}
