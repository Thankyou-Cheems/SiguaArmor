import {
  SIGUA_WIKI_ORIGIN,
  wikiAssetUrl,
} from "./wiki-source.ts";

const RUNTIME_VISUAL_TEXTURE_EXTENSION =
  /\.(?:avif|jpe?g|ktx2?|png|webp)(?:[?#].*)?$/iu;

export { SIGUA_WIKI_ORIGIN };

export function runtimeWikiAssetUrl(url: string) {
  return wikiAssetUrl(url);
}

// Analysis mode only needs source material flags and mesh geometry. Routing
// image requests to one opaque pixel preserves alpha/material metadata for the
// supplemental silhouette pass without downloading vehicle appearance maps.
export const RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12P4DwQACfsD/WMmxY8AAAAASUVORK5CYII=";

export function isRuntimeVisualTextureUrl(url: string) {
  if (/^data:/iu.test(url)) return false;
  return RUNTIME_VISUAL_TEXTURE_EXTENSION.test(url);
}

export function runtimeAnalysisVisualUrl(url: string) {
  return isRuntimeVisualTextureUrl(url)
    ? RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL
    : runtimeWikiAssetUrl(url);
}

export type RuntimeViewerPresentation =
  | "loading"
  | "exterior-placeholder"
  | "scene"
  | "error";

export function runtimeViewerPresentation({
  mode,
  viewerState,
  initialCameraFitReady,
  exteriorPlaceholderReady,
}: {
  mode: "exterior" | "armor" | "interior";
  viewerState: "loading" | "ready" | "error";
  initialCameraFitReady: boolean;
  exteriorPlaceholderReady: boolean;
}): RuntimeViewerPresentation {
  if (viewerState === "error") return "error";
  if (!initialCameraFitReady) return "loading";
  if (
    mode === "exterior" &&
    viewerState === "loading" &&
    exteriorPlaceholderReady
  ) {
    return "exterior-placeholder";
  }
  return viewerState === "loading" ? "loading" : "scene";
}
