import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  runtimeAnalysisVisualUrl,
  runtimeAnalysisVisualTexturePolicy,
  runtimeExteriorVisualAssetUrl,
  runtimeWikiAssetUrl,
} from "../../lib/runtime-visual-lazy-load.ts";
import {
  loadWikiFactionCatalog,
  loadWikiRuntimeVisual,
  loadWikiVehicleCatalog,
  loadWikiVehicleCommunityAliases,
  loadWikiVehicleFactionMechanics,
  loadWikiVehicleFactionPresentation,
  loadWikiVehiclePresentation,
  loadWikiVehicleCrewSeat,
  loadWikiVehicleGunnerSight,
  loadOptionalWikiVehicleGunnerSight,
  loadWikiVehicleStationGraph,
  loadWikiVehicleRuntimeSource,
  loadWikiVehicleRadialQuery,
  loadWikiVehicleVisualAttachment,
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

test("every exterior tier prefers the promoted lightweight model during cache transition", () => {
  const placement = {
    assetUrl: `/assets/runtime-probe/models/${"a".repeat(64)}.gltf`,
    compatibilityAssetUrl: `/assets/runtime-probe/models/${"b".repeat(64)}.gltf`,
  };
  assert.equal(
    runtimeExteriorVisualAssetUrl(placement, "balanced"),
    placement.compatibilityAssetUrl,
  );
  assert.equal(
    runtimeExteriorVisualAssetUrl(placement, "compatibility"),
    placement.compatibilityAssetUrl,
  );
  assert.equal(
    runtimeExteriorVisualAssetUrl(
      { assetUrl: placement.assetUrl },
      "compatibility",
    ),
    placement.assetUrl,
  );
});

test("Armor refuses to turn Wiki weapon impression paths into browser requests", () => {
  assert.throws(
    () => runtimeWikiAssetUrl("/assets/weapons/impressions/visual-test.webp"),
    /Weapon impression assets are not part of SiguaArmor/u,
  );
});

test("analysis mode skips shared appearance textures", () => {
  assert.equal(
    runtimeAnalysisVisualUrl(
      "/assets/runtime-probe/blob/" + "b".repeat(64) + ".webp",
    ),
    RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  );
});

test("analysis mode keeps the alpha-bearing texture for projected vehicle marks", () => {
  const texture = "/assets/runtime-probe/blob/" + "c".repeat(64) + ".webp";
  const projectedMark = {
    name: "SiguaD Watermark",
    sourceMeshPath: "/SiguaWiki/Derived/VehicleWatermark",
    stableOccurrenceId: "watermark-vehicle-test",
  };
  const hull = {
    name: "Vehicle Mesh",
    sourceMeshPath: "/Game/Vehicles/Test/Test_Hull.Test_Hull",
    stableOccurrenceId: "occurrence-hull-test",
  };

  const projectedMarkPolicy = runtimeAnalysisVisualTexturePolicy(projectedMark);
  assert.equal(projectedMarkPolicy, "source-alpha");
  assert.equal(
    runtimeAnalysisVisualUrl(texture, projectedMarkPolicy),
    `https://wiki.siguad.icu${texture}`,
  );

  const hullPolicy = runtimeAnalysisVisualTexturePolicy(hull);
  assert.equal(hullPolicy, "placeholder");
  assert.equal(
    runtimeAnalysisVisualUrl(texture, hullPolicy),
    RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  );
});

test("catalog data uses direct presentation slices while runtime data keeps its cache key", async () => {
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
      : pathname.startsWith("/data/vehicles/factions/")
        ? {
            schemaVersion: "sigua-vehicle-faction-mechanics/v1",
            factionId: "adf",
            identities: { vehicles: [], catalogBindings: [] },
            profiles: {
              general: [],
              burning: [],
              seats: [],
              damageResistances: [],
              components: [],
            },
            runtime: { visualArtifacts: [] },
            editorAvailability: {
              schemaVersion: "sigua-vehicle-editor-availability/v1",
              bindingAvailability: [],
            },
          }
      : pathname.startsWith("/data/vehicles/faction-presentation/")
        ? {
            schemaVersion: "sigua-vehicle-faction-presentation/v1",
            factionId: "adf",
            presentation: {
              editions: {
                international: { records: [] },
                china: { records: [] },
              },
            },
          }
      : pathname.startsWith("/data/factions/")
        ? {
            schemaVersion: "sigua-faction-catalog/v1",
            factions: [],
            catalogGroups: { china: [] },
          }
        : pathname.includes("presentation.json")
          ? {
              schemaVersion: "sigua-vehicle-presentation/v1",
              presentation: {
                editions: {
                  international: { records: [] },
                  china: { records: [] },
                },
              },
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
      loadWikiVehiclePresentation(),
      loadWikiVehicleCatalog(),
      loadWikiVehicleFactionMechanics("adf"),
      loadWikiVehicleFactionPresentation("adf"),
      loadWikiFactionCatalog(),
      loadWikiVehicleCommunityAliases(),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestedUrls, [
    "https://wiki.siguad.icu/data/vehicles/presentation.json",
    "https://wiki.siguad.icu/data/vehicles/catalog.json?presentation=v6",
    "https://wiki.siguad.icu/data/vehicles/factions/adf.json?mechanics=burning-radial-v3",
    "https://wiki.siguad.icu/data/vehicles/faction-presentation/adf.json?presentation=v6",
    "https://wiki.siguad.icu/data/factions/catalog.json?presentation=v6",
    "https://wiki.siguad.icu/data/vehicles/community-aliases.json?presentation=v6",
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
    `https://wiki.siguad.icu/assets/runtime-probe/visuals/${visualId}.json?presentation=v6`,
  );
});

test("3D preview reads an exact per-card vehicle runtime source", async () => {
  const originalFetch = globalThis.fetch;
  const cardId = "test--runtime--mbt";
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      schemaVersion: "sigua-vehicle-runtime-source/v1",
      source: { cardId },
      variants: [{ rawName: "BP_Test" }],
    });
  };
  try {
    await loadWikiVehicleRuntimeSource(cardId);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(
    requestedUrl,
    `https://wiki.siguad.icu/data/vehicles/runtime/${cardId}.json?projection=vehicle-station-graph-v1`,
  );
});

test("crew seats read the exact source-vehicle sidecar", async () => {
  const originalFetch = globalThis.fetch;
  const sourceVehicleRef = `vehicle-${"e".repeat(24)}`;
  const pathname = `/data/vehicles/crew-seats/${sourceVehicleRef}.json`;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      schemaVersion: "sigua-vehicle-crew-seat/v1",
      sourceVehicleRef,
      runtimeVehicleRefs: [],
      seats: [],
    });
  };
  try {
    await loadWikiVehicleCrewSeat(pathname);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestedUrl, `https://wiki.siguad.icu${pathname}`);
});

test("visual attachment reads the exact source-vehicle sidecar", async () => {
  const originalFetch = globalThis.fetch;
  const sourceVehicleRef = `vehicle-${"d".repeat(24)}`;
  const pathname = `/data/vehicles/visual-attachments/${sourceVehicleRef}.json`;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      schemaVersion: "sigua-vehicle-visual-attachment/v2",
      sourceVehicleRef,
      stations: [],
      visualBindings: [],
    });
  };
  try {
    await loadWikiVehicleVisualAttachment(pathname);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestedUrl, `https://wiki.siguad.icu${pathname}`);
});

test("station graph reads the exact source-vehicle relationship authority", async () => {
  const originalFetch = globalThis.fetch;
  const sourceVehicleRef = `vehicle-${"f".repeat(24)}`;
  const pathname = `/data/vehicles/station-graphs/${sourceVehicleRef}.json`;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      schemaVersion: "sigua-vehicle-station-graph/v1",
      sourceVehicleRef,
      runtimeVehicleRefs: [],
      stations: [],
      visualBindings: [],
    });
  };
  try {
    await loadWikiVehicleStationGraph(pathname);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestedUrl, `https://wiki.siguad.icu${pathname}`);
});

test("gunner sight reads the exact source-vehicle presentation sidecar", async () => {
  const originalFetch = globalThis.fetch;
  const sourceVehicleRef = `vehicle-${"e".repeat(24)}`;
  const pathname = `/data/vehicles/gunner-sights/${sourceVehicleRef}.json`;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      schemaVersion: "sigua-vehicle-gunner-sight/v1",
      sourceVehicleRef,
      runtimeVehicleRefs: [],
      stations: [],
      projections: [],
    });
  };
  try {
    await loadWikiVehicleGunnerSight(sourceVehicleRef);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestedUrl, `https://wiki.siguad.icu${pathname}`);
});

test("missing optional gunner sight does not block the existing 3D viewer", async () => {
  const originalFetch = globalThis.fetch;
  const sourceVehicleRef = `vehicle-${"9".repeat(24)}`;
  globalThis.fetch = async () => new Response("not found", { status: 404 });
  try {
    assert.equal(
      await loadOptionalWikiVehicleGunnerSight(sourceVehicleRef),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("radial query reads the immutable per-vehicle record directly", async () => {
  const originalFetch = globalThis.fetch;
  const digest = "c".repeat(64);
  const pathname = `/assets/runtime-probe/radial-query/records/${digest}.json`;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      schemaVersion: "sigua-vehicle-radial-query-source/v1",
    });
  };
  try {
    await loadWikiVehicleRadialQuery(pathname);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestedUrl, `https://wiki.siguad.icu${pathname}`);
});
