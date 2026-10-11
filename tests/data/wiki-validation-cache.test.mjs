import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

let moduleRevision = 0;
const freshSource = () => import(`../../lib/wiki-source.ts?validation-cache=${++moduleRevision}`);
const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const deferred = () => Promise.withResolvers();
const vehicle = `vehicle-${"a".repeat(64)}`;
const visual = `visual-artifact-${"b".repeat(64)}`;
const factionCatalog = { schemaVersion: "sigua-faction-catalog/v1", factions: [], catalogGroups: { china: [] } };
const aliases = { schemaVersion: "sigua-vehicle-community-aliases/v1", updatedAt: "2026-10-11", groups: [] };
const editions = { international: { records: [] }, china: { records: [] } };

const shapeCases = [
  ["loadWikiFactionCatalog", [], factionCatalog],
  ["loadWikiWeaponCatalog", [], { schemaVersion: "sigua-weapon-catalog/v2", selector: { variants: [] }, mechanics: { directDamageModels: [] } }],
  ["loadWikiWeaponBallistics", [], { schemaVersion: "sigua-weapon-ballistics/v1", status: "completed", sourceBuildId: "build", algorithms: { projectile: "/algorithms/ballistics/test.js" }, physics: { worldGravityZCentimetresPerSecondSquared: -980, serverFrameDeltaSeconds: 0.03 }, launchOriginProfiles: [{}], projectileProfiles: [], weaponAssignments: [], movementModes: [], curveAssets: [], vehicleMountBindings: [] }],
  ["loadWikiVehicleWeaponRuntimeSource", ["adf-test"], { schemaVersion: "sigua-weapon-runtime-source/v2", source: { kind: "vehicle", cardId: "adf-test", rawNames: [] }, weaponProfiles: [], loadouts: [{}] }],
  ["loadWikiVehicleWeaponRuntimeIndex", [], { schemaVersion: "sigua-weapon-runtime-index/v2", vehicleSources: [] }],
  ["loadWikiVehicleRuntimeSource", ["adf-test"], { schemaVersion: "sigua-vehicle-runtime-source/v1", source: { cardId: "adf-test" }, variants: [{}] }],
  ["loadWikiVehicleVisualAttachment", [`/data/vehicles/visual-attachments/${vehicle}.json`], { schemaVersion: "sigua-vehicle-visual-attachment/v2", sourceVehicleRef: vehicle, stations: [], visualBindings: [] }],
  ["loadWikiVehicleCrewSeat", [`/data/vehicles/crew-seats/${vehicle}.json`], { schemaVersion: "sigua-vehicle-crew-seat/v1", sourceVehicleRef: vehicle, runtimeVehicleRefs: [], seats: [] }],
  ["loadWikiVehicleStationGraph", [`/data/vehicles/station-graphs/${vehicle}.json`], { schemaVersion: "sigua-vehicle-station-graph/v1", sourceVehicleRef: vehicle, runtimeVehicleRefs: [], stations: [], visualBindings: [] }],
  ["loadWikiVehicleGunnerSight", [vehicle], { schemaVersion: "sigua-vehicle-gunner-sight/v1", sourceVehicleRef: vehicle, runtimeVehicleRefs: [], stations: [], projections: [] }],
  ["loadWikiVehicleDriverView", [vehicle], { schemaVersion: "sigua-vehicle-driver-view/v1", sourceVehicleRef: vehicle, seatKey: `${vehicle}:catalog-seat:1`, camera: {}, mask: {} }],
  ["loadWikiVehicleFactionMechanics", ["adf"], { schemaVersion: "sigua-vehicle-faction-mechanics/v1", factionId: "adf", identities: { vehicles: [], catalogBindings: [] }, profiles: { general: [], burning: [], seats: [], damageResistances: [], components: [] }, runtime: { visualArtifacts: [] }, editorAvailability: { schemaVersion: "sigua-vehicle-editor-availability/v1", bindingAvailability: [] } }],
  ["loadWikiVehicleFactionPresentation", ["adf"], { schemaVersion: "sigua-vehicle-faction-presentation/v1", factionId: "adf", presentation: { editions } }],
  ["loadWikiVehicleCatalog", [], { schemaVersion: "sigua-vehicle-catalog/v3.1", identities: { catalogBindings: [] }, runtime: { visualArtifacts: [] }, presentation: { editions } }],
  ["loadWikiVehiclePresentation", [], { schemaVersion: "sigua-vehicle-presentation/v1", presentation: { editions } }],
  ["loadWikiVehicleCommunityAliases", [], aliases],
  ["loadWikiRuntimeVisual", [visual], { schemaVersion: "sigua-runtime-visual/v1", id: visual, runtimeVehicleRef: vehicle, generatedClass: "/Game/Vehicle", placements: [] }],
];

for (const [name, args, valid] of shapeCases) {
  test(`${name}: bad schema and valid-schema bad shape can retry without reloading`, async () => {
    const original = globalThis.fetch;
    try {
      for (const invalid of [{ ...valid, schemaVersion: "wrong-schema" }, { schemaVersion: valid.schemaVersion }, null]) {
        const source = await freshSource();
        let requests = 0;
        globalThis.fetch = async () => json(++requests === 1 ? invalid : valid);
        await assert.rejects(source[name](...args));
        assert.deepEqual(await source[name](...args), valid);
        assert.deepEqual(await source[name](...args), valid);
        assert.equal(requests, 2, "only the rejected value is evicted; valid retries remain cached");
      }
    } finally { globalThis.fetch = original; }
  });
}

test("simultaneous consumers share transport but all reject unusable data, then share one retry", async () => {
  const original = globalThis.fetch;
  try {
    const source = await freshSource();
    const first = deferred();
    let requests = 0;
    globalThis.fetch = () => ++requests === 1 ? first.promise : Promise.resolve(json(factionCatalog));
    const pending = [source.loadWikiFactionCatalog(), source.loadWikiFactionCatalog(), source.loadWikiFactionCatalog()];
    assert.equal(requests, 1);
    first.resolve(json({ schemaVersion: factionCatalog.schemaVersion }));
    assert.ok((await Promise.allSettled(pending)).every(({ status }) => status === "rejected"));
    assert.deepEqual(await Promise.all([source.loadWikiFactionCatalog(), source.loadWikiFactionCatalog()]), [factionCatalog, factionCatalog]);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

test("each consumer validates the shared raw response using its own contract", async () => {
  const original = globalThis.fetch;
  try {
    const source = await freshSource();
    let requests = 0;
    globalThis.fetch = async () => { requests++; return json(factionCatalog); };
    const results = await Promise.allSettled([
      source.loadWikiDataset("/data/test.json", factionCatalog.schemaVersion, (value) => ({ own: value.schemaVersion })),
      source.loadWikiDataset("/data/test.json", factionCatalog.schemaVersion, () => { throw new Error("stricter consumer rejected"); }),
    ]);
    assert.equal(requests, 1);
    assert.deepEqual(results[0], { status: "fulfilled", value: { own: factionCatalog.schemaVersion } });
    assert.equal(results[1].status, "rejected");
    assert.match(results[1].reason.message, /stricter consumer/);
    assert.deepEqual(await source.loadWikiDataset("/data/test.json", factionCatalog.schemaVersion), factionCatalog);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

for (const failure of ["shape", "HTTP", "JSON"]) {
  test(`late ${failure} failure after TTL expiry cannot evict a newer successful response`, async () => {
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    try {
      const source = await freshSource();
      const old = deferred();
      let now = 100_000;
      let requests = 0;
      Date.now = () => now;
      globalThis.fetch = () => ++requests === 1 ? old.promise : Promise.resolve(json(aliases));
      const oldResult = assert.rejects(source.loadWikiVehicleCommunityAliases());
      now += 60_001;
      assert.deepEqual(await source.loadWikiVehicleCommunityAliases(), aliases);
      old.resolve(failure === "HTTP" ? new Response("unavailable", { status: 503 }) : failure === "JSON" ? new Response("{bad JSON") : json({ schemaVersion: aliases.schemaVersion }));
      await oldResult;
      assert.deepEqual(await source.loadWikiVehicleCommunityAliases(), aliases);
      assert.equal(requests, 2, "the old request must not clear the new request's cache entry");
    } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
  });
}

test("HTTP failure and invalid JSON retain their existing retry behavior", async () => {
  const original = globalThis.fetch;
  try {
    for (const bad of [() => new Response("unavailable", { status: 503 }), () => new Response("{bad JSON")]) {
      const source = await freshSource();
      let requests = 0;
      globalThis.fetch = async () => ++requests === 1 ? bad() : json(factionCatalog);
      await assert.rejects(source.loadWikiFactionCatalog());
      assert.deepEqual(await source.loadWikiFactionCatalog(), factionCatalog);
      assert.equal(requests, 2);
    }
  } finally { globalThis.fetch = original; }
});

test("optional missing gunner sight stays null; malformed successful responses still fail and retry", async () => {
  const original = globalThis.fetch;
  try {
    const source = await freshSource();
    const valid = shapeCases.find(([name]) => name === "loadWikiVehicleGunnerSight")[2];
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      if (requests === 1) return new Response("not found", { status: 404 });
      return json(requests === 2 ? { schemaVersion: valid.schemaVersion } : valid);
    };
    assert.equal(await source.loadOptionalWikiVehicleGunnerSight(vehicle), null);
    await assert.rejects(source.loadOptionalWikiVehicleGunnerSight(vehicle), /unsupported shape/);
    assert.deepEqual(await source.loadOptionalWikiVehicleGunnerSight(vehicle), valid);
    assert.equal(requests, 3);
  } finally { globalThis.fetch = original; }
});

test("invalidating one URL does not invalidate other successful cached datasets", async () => {
  const original = globalThis.fetch;
  try {
    const source = await freshSource();
    const requests = new Map();
    globalThis.fetch = async (url) => {
      const count = (requests.get(url) ?? 0) + 1;
      requests.set(url, count);
      return json(String(url).includes("community-aliases") ? aliases : count === 1 ? { schemaVersion: factionCatalog.schemaVersion } : factionCatalog);
    };
    await source.loadWikiVehicleCommunityAliases();
    await assert.rejects(source.loadWikiFactionCatalog());
    await source.loadWikiFactionCatalog();
    await source.loadWikiVehicleCommunityAliases();
    assert.deepEqual([...requests.values()].sort(), [1, 2]);
  } finally { globalThis.fetch = original; }
});

test("bad grounded index retries; valid unavailable poses remain optional and cached", async () => {
  const original = globalThis.fetch;
  try {
    const source = await freshSource();
    const valid = { schemaVersion: "sigua-vehicle-grounded-pose-index/v1", vehicles: [] };
    let requests = 0;
    globalThis.fetch = async () => json(++requests === 1 ? { schemaVersion: valid.schemaVersion } : valid);
    await assert.rejects(source.loadWikiVehicleGroundedPose("/Game/Vehicle"));
    assert.equal(await source.loadWikiVehicleGroundedPose("/Game/Vehicle"), null);
    assert.equal(await source.loadWikiVehicleGroundedPose("/Game/Vehicle"), null);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

test("bad terrain index retries without disabling optional missing poses", async () => {
  const original = globalThis.fetch;
  try {
    const source = await freshSource();
    const valid = { schemaVersion: "sigua-vehicle-terrain-poses-index/v1", vehicles: [] };
    let requests = 0;
    globalThis.fetch = async () => json(++requests === 1 ? { schemaVersion: valid.schemaVersion } : valid);
    await assert.rejects(source.loadWikiVehicleTerrainPoses("/Game/Vehicle"));
    assert.equal(await source.loadWikiVehicleTerrainPoses("/Game/Vehicle"), null);
    assert.equal(await source.loadWikiVehicleTerrainPoses("/Game/Vehicle"), null);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

for (const mode of ["HTTP", "integrity", "schema"]) {
  test(`grounded child ${mode} failure evicts only the child; its valid index stays cached`, async () => {
    const original = globalThis.fetch;
    try {
      const source = await freshSource();
      const value = { schemaVersion: mode === "schema" ? "wrong-schema" : "sigua-vehicle-grounded-pose/v1", sourceBuildId: "build", admission: "rendered-physics-three-stable-samples" };
      const payload = JSON.stringify(value);
      const sha256 = createHash("sha256").update(payload).digest("hex");
      const record = { url: `/data/vehicles/grounded-poses/v1/records/${sha256}.json`, sha256, bytes: Buffer.byteLength(payload) };
      const catalog = { schemaVersion: "sigua-vehicle-grounded-pose-index/v1", sourceBuildId: "build", vehicles: [{ generatedClass: "/Game/Vehicle", status: "observed", record }] };
      let indexRequests = 0;
      let recordRequests = 0;
      globalThis.fetch = async (url) => {
        if (String(url).endsWith("/catalog.json")) { indexRequests++; return json(catalog); }
        recordRequests++;
        return recordRequests === 1 && mode === "HTTP" ? new Response("missing", { status: 404 }) : new Response(recordRequests === 1 && mode === "integrity" ? payload + " " : payload);
      };
      await assert.rejects(source.loadWikiVehicleGroundedPose("/Game/Vehicle"));
      if (mode === "schema") await assert.rejects(source.loadWikiVehicleGroundedPose("/Game/Vehicle"));
      else assert.deepEqual(await source.loadWikiVehicleGroundedPose("/Game/Vehicle"), value);
      assert.equal(indexRequests, 1);
      assert.equal(recordRequests, 2);
    } finally { globalThis.fetch = original; }
  });
}
