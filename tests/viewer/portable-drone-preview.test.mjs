import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Controlled fixture shaped like the published portable supportAir binding.
// It is not a new official asset or a native runtime/hit qualification.
const bundle = await build({
  stdin: { contents: `export { portableDronePreviewForCatalogBinding } from './app/portable-drone-preview.ts';
    export { fixture } from 'portable-fixture';`, resolveDir: fileURLToPath(new URL("../../", import.meta.url)) },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "portable-wiki", setup(builder) {
    builder.onResolve({ filter: /(?:wiki-source|portable-fixture)$/ }, () => ({ path: "wiki", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      export const fixture = { source: null, descriptor: null, calls: [] };
      export async function loadWikiVehicleFactionMechanics(id) { fixture.calls.push(['faction', id]); return fixture.source; }
      export async function loadWikiRuntimeVisual(id) { fixture.calls.push(['visual', id]); return fixture.descriptor; }
    ` }));
  } }],
});
const { portableDronePreviewForCatalogBinding: load, fixture } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`,
);
const artifact = `visual-artifact-${"a".repeat(64)}`;
const visualId = `vehicle-${"b".repeat(64)}`;
const generatedClass = "/Game/Blueprints/Commander/CommandActors/Drone/BP_FlyingDrone.BP_FlyingDrone_C";
let sequence = 0;
function reset() {
  const cardId = `imf--portable-recon-drone-${sequence++}--drone`;
  const rawName = "BP_FlyingDrone";
  const binding = { type: "DRONE", cardId, rawName, generatedClass, hitRuntimeStatus: "native-unknown",
    visualArtifactRefs: { international: artifact } };
  fixture.source = { extensions: { supportAir: { bindings: [binding] } }, runtime: { visualArtifacts: [
    { id: artifact, edition: "international", cardId, rawName, generatedClass, runtimeVehicleRef: visualId, placementCount: 6 },
  ] } };
  fixture.descriptor = { schemaVersion: "sigua-runtime-visual/v1", id: artifact, edition: "international",
    generatedClass, runtimeVehicleRef: visualId, status: "complete", visualAcceptanceStatus: "web-usable",
    webUsable: true, reason: "fixture: retained initialized visual, native hit unknown", totalBytes: 100,
    placements: ["Body", "Rotor1", "Rotor2", "Rotor3", "Rotor4"].map((name, index) => ({ name, actor: "BP_FlyingDrone_C_0",
      stableOccurrenceId: `occurrence-${String(index).repeat(64)}`, sourceMeshPath: index ? "/Game/Vehicles/Drone/SM_Drone_Rotor.SM_Drone_Rotor" : "/Game/Vehicles/Drone/SM_Drone_Main.SM_Drone_Main",
      componentClassPath: "/Script/Engine.StaticMeshComponent", runtimeBonePoseStatus: "not-applicable",
      materialState: "runtime-effective-bindings-baked-parameters-unresolved", assetUrl: `/assets/runtime-probe/models/${String(index ? 1 : 2).repeat(64)}.gltf`,
      matrix: [1.5,0,0,0,0,1.5,0,0,0,0,1.5,0,index,-.113097372,.000000153,1] })) };
  fixture.descriptor.placements.push({ ...structuredClone(fixture.descriptor.placements[0]),
    stableOccurrenceId: `watermark-${"a".repeat(64)}`, name: "SiguaD Watermark",
    sourceMeshPath: "/SiguaWiki/Derived/VehicleWatermark" });
  fixture.calls = [];
  return { cardId, rawName, visualArtifactRef: artifact, edition: "international" };
}

test("portable exterior uses all exact retained placements without vehicle or hit authority", async () => {
  const input = reset();
  const before = structuredClone(fixture.descriptor.placements);
  const preview = await load(input);
  assert.equal(preview.exteriorOnly, true);
  assert.equal(preview.targetKind, undefined);
  assert.deepEqual(preview.visual.placements, before);
  assert.equal(preview.visualVehicleId, visualId, "existing descriptor identity is preserved, not invented");
  for (const key of ["hit", "radialQuery", "stationGraph", "crewSeat", "gunnerSight", "driverView", "groundedPose", "chassisPose"]) {
    assert.equal(preview[key], null);
  }
  assert.equal(preview.hitAvailability.reasonCode, "native-unknown");
  assert.equal(preview.hitAvailability.status, "native-unknown");
  assert.equal(preview.visual.runtimeBonePoseStatus, "not-applicable");
  assert.deepEqual(fixture.calls.map(([kind]) => kind).sort(), ["faction", "visual"]);
});

for (const [label, mutate] of [
  ["wrong exact visual ref", () => { fixture.source.extensions.supportAir.bindings[0].visualArtifactRefs.international = `visual-artifact-${"f".repeat(64)}`; }],
  ["class mismatch", () => { fixture.descriptor.generatedClass = "/Game/Other.Other_C"; }],
  ["edition mismatch", () => { fixture.descriptor.edition = "china"; }],
  ["ambiguous binding", () => { fixture.source.extensions.supportAir.bindings.push(structuredClone(fixture.source.extensions.supportAir.bindings[0])); }],
  ["ordinary runtime target", () => { fixture.source.extensions.supportAir.bindings[0].runtimeVehicleRef = visualId; }],
  ["nonfinite placement", () => { fixture.descriptor.placements[0].matrix[3] = NaN; }],
  ["another descriptor's watermark", () => { fixture.descriptor.placements[5].stableOccurrenceId = `watermark-${"f".repeat(64)}`; }],
]) {
  test(`portable exterior rejects ${label} without fallback`, async () => {
    const input = reset(); mutate();
    await assert.rejects(load(input), /portable|Portable/u);
  });
}
