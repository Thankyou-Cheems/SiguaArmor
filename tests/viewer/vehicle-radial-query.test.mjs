import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVehicleRadialLayerHitSets,
  resolveVehicleRadialQuery,
  validateVehicleRadialQuerySource,
} from "../../lib/vehicle-radial-query.ts";

function box(componentId, componentName, center) {
  const [cx, cy, cz] = center;
  const half = 0.25;
  const positions = [];
  for (const x of [-half, half]) {
    for (const y of [-half, half]) {
      for (const z of [-half, half]) positions.push(cx + x, cy + y, cz + z);
    }
  }
  return {
    componentId,
    componentName,
    componentClassPath: componentName === "TrackLeftComponent"
      ? "/Script/Squad.SQVehicleTrack"
      : "/Script/Squad.SQArmorMeshComponent",
    collisionProfile: "ComplexVehicleMesh",
    objectChannelIndex: 6,
    bounds: {
      minM: [cx - half, cy - half, cz - half],
      maxM: [cx + half, cy + half, cz + half],
      originM: center,
    },
    shapes: [{
      kind: "triangles",
      positionsM: positions,
      indices: [
        0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5,
        0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6,
        0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
      ],
    }],
  };
}

const source = {
  schemaVersion: "sigua-vehicle-radial-query-source/v1",
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e",
  rawName: "BP_Test",
  targetPackage: "/Game/Test/BP_Test",
  generatedClass: "/Game/Test/BP_Test.BP_Test_C",
  queryContract: { objectMask: 0x47, onlyDamageMeshes: true },
  counts: { admittedComponents: 3 },
  components: [
    box("query-track", "TrackLeftComponent", [0, 0, 0]),
    box("query-hull", "SQArmorMesh", [0, 1, 0]),
    {
      componentId: "query-vehicle-mesh",
      componentName: "Vehicle Mesh",
      componentClassPath: "/Script/AnimationBudgetAllocator.SkeletalMeshComponentBudgeted",
      collisionProfile: "Vehicle",
      objectChannelIndex: 6,
      bounds: { minM: [-0.5, 1.5, -0.5], maxM: [0.5, 2.5, 0.5], originM: [0, 2, 0] },
      shapes: [{ kind: "sphere", centerM: [0, 2, 0], radiusM: 0.5 }],
    },
  ],
};

test("published radial query preserves repeated first-component hits", () => {
  validateVehicleRadialQuerySource(source);
  const result = resolveVehicleRadialQuery({ source, originM: [0, -1, 0], outerRadiusM: 5 });
  assert.equal(result.candidateCount, 3);
  assert.deepEqual(result.hits.map((hit) => hit.hitComponentId), [
    "query-track",
    "query-track",
    "query-track",
  ]);
});

test("layer hit sets retain root ownership when a query-only component is absent from hit geometry", () => {
  const queryOnlySource = structuredClone(source);
  queryOnlySource.counts.admittedComponents = 1;
  queryOnlySource.components = [queryOnlySource.components[2]];
  const model = {
    owners: [{ ownerId: "root", kind: "vehicle-root", parentOwnerIndex: null, healthPoolIndex: 0 }],
    components: [
      {
        componentId: "hit-track",
        componentPath: "/Game/Test.BP_Test_C_0.TrackLeftComponent",
        classPath: "/Script/Squad.SQVehicleTrack",
        semanticKind: "track",
        ownerIndex: 0,
        placementState: "resolved",
        directDamagePoolIndex: { state: "derived", value: 1 },
      },
      {
        componentId: "hit-hull",
        componentPath: "/Game/Test.BP_Test_C_0.SQArmorMesh",
        classPath: "/Script/Squad.SQArmorMeshComponent",
        semanticKind: "armor",
        ownerIndex: 0,
        placementState: "resolved",
        directDamagePoolIndex: { state: "derived", value: 0 },
      },
    ],
  };
  const [hitSet] = buildVehicleRadialLayerHitSets({
    source: queryOnlySource,
    model,
    impactPointM: [0, 2, 0],
    impactNormal: [0, 0, 1],
    layers: [{ layerId: "primary", outerRadiusCm: 500, killZoneRadiusCm: 100, impactNormalOffsetCm: 0 }],
  });
  assert.equal(hitSet.evidence, "native-reconstructed");
  assert.equal(hitSet.componentHits.length, 1);
  assert.equal(hitSet.componentHits[0].componentIndex, null);
  assert.ok(hitSet.componentHits.every((hit) => hit.ownerIndex === 0));
});
