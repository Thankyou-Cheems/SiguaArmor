import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  runtimeAnalysisVisualUrl,
  runtimeWikiAssetUrl,
} from "../../lib/runtime-visual-lazy-load.ts";
import {
  loadWikiFactionCatalog,
  loadWikiRuntimeVisual,
  loadWikiVehicleCatalog,
  loadWikiVehicleCommunityAliases,
} from "../../lib/wiki-source.ts";

test("shared runtime files resolve directly to SiguaWiki", () => {
  const model = "/assets/runtime-probe/models/" + "a".repeat(64) + ".gltf";
  assert.equal(
    runtimeWikiAssetUrl(model),
    `https://wiki.siguad.icu${model}`,
  );
  const blob = "/assets/runtime-probe/models/../blob/" + "b".repeat(64) + ".bin";
  assert.equal(
    runtimeWikiAssetUrl(blob),
    `https://wiki.siguad.icu/assets/runtime-probe/blob/${"b".repeat(64)}.bin`,
  );
  assert.throws(
    () => runtimeWikiAssetUrl("/assets/../../data/vehicles/catalog.json"),
    /Invalid SiguaWiki asset path/,
  );
  assert.equal(runtimeWikiAssetUrl("/images/product.webp"), "/images/product.webp");
});

test("analysis mode skips shared appearance textures", () => {
  assert.equal(
    runtimeAnalysisVisualUrl(
      "/assets/runtime-probe/blob/" + "b".repeat(64) + ".webp",
    ),
    RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  );
});

test("presentation datasets use one stable v3 cache key after the vehicle visual refresh", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    const pathname = new URL(url).pathname;
    const value = pathname.includes("community-aliases")
      ? {
          schemaVersion: "sigua-vehicle-community-aliases/v1",
          updatedAt: "2026-08-11T00:00:00Z",
          groups: [],
        }
      : pathname.includes("factions")
        ? {
            schemaVersion: "sigua-faction-catalog/v1",
            factions: [],
            catalogGroups: { china: [] },
          }
        : {
            schemaVersion: "sigua-vehicle-catalog/v3.1",
            identities: { catalogBindings: [] },
            runtime: { visualArtifacts: [] },
            presentation: {
              editions: {
                international: { records: [] },
                china: { records: [] },
              },
            },
          };
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await Promise.all([
      loadWikiVehicleCatalog(),
      loadWikiFactionCatalog(),
      loadWikiVehicleCommunityAliases(),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestedUrls, [
    "https://wiki.siguad.icu/data/vehicles/catalog.json?presentation=v3",
    "https://wiki.siguad.icu/data/factions/catalog.json?presentation=v3",
    "https://wiki.siguad.icu/data/vehicles/community-aliases.json?presentation=v3",
  ]);
});

test("runtime visual descriptors use the presentation cache key", async () => {
  const originalFetch = globalThis.fetch;
  const visualId = `visual-artifact-${"a".repeat(64)}`;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      schemaVersion: "sigua-runtime-visual/v1",
      id: visualId,
      runtimeVehicleRef: `vehicle-${"b".repeat(64)}`,
      generatedClass: "/Game/Vehicles/Test.Test_C",
      placements: [],
    });
  };
  try {
    await loadWikiRuntimeVisual(visualId);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(
    requestedUrl,
    `https://wiki.siguad.icu/assets/runtime-probe/visuals/${visualId}.json?presentation=v3`,
  );
});
