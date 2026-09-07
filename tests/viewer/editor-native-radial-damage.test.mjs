import assert from "node:assert/strict";
import test from "node:test";

import {
  editorNativeRadialDamageAtDistance,
  editorNativeRadialDamageScale,
  simulateEditorNativeShot,
} from "../../lib/editor-native-hit-model.ts";

const damageTypePath =
  "/Game/Gameplay/DamageTypes/BP_Explosives_Damagetype.BP_Explosives_Damagetype_C";

const radialDamageModel = {
  schemaVersion: "sigua-vehicle-radial-damage-model/v2",
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e",
  sourceCase: "radial-query-payload-v10.5.3",
  algorithmPath: "/algorithms/explosion/editor-radial-damage.js",
  queryAlgorithmPath: "/algorithms/explosion/vehicle-radial-query.js",
  evidenceBoundary: "native-query-static-closed-runtime-placement-required",
  query: {
    objectMask: 71,
    onlyDamageMeshes: true,
    candidateMode: "native-sphere-overlap-by-object-type",
    killZoneMode: "strict-point-to-component-aabb",
    visibilityMode: "multi-hit-object-trace-to-bounds-origin",
    hitMultiplicity: "preserved",
    payloadSchemaVersion: "sigua-vehicle-radial-query-source/v1",
    sourceDataRevision: "a".repeat(64),
    artifactCount: 470,
  },
  receiver: {
    rootActorDeliveriesPerLayer: 1,
    driveTrainClassPaths: [
      "/Script/Squad.SQDriveTrainComponent",
      "/Script/Squad.SQVehicleTrack",
      "/Script/Squad.SQVehicleWheel",
    ],
    driveTrainDispatch: "once-per-component-hit",
    nonDriveTrainComponentFanout: "none",
    seatForwarding: "pass-damage-and-pass-radial",
  },
};

function routeModifier(
  incomingDamageTypePath,
  modifier,
  directHitRadialDamageMultiplier = 1,
  indirectHitDamageMultiplier = 1,
  onlyPassDamageIfDirectHit = false,
) {
  return {
    damageTypePath: incomingDamageTypePath,
    modifier,
    directHitRadialDamageMultiplier,
    indirectHitDamageMultiplier,
    onlyPassDamageIfDirectHit,
  };
}

function damageModifier(modifier) {
  return routeModifier(damageTypePath, modifier);
}

function model() {
  return {
    owners: [{
      ownerId: "vehicle-root",
      kind: "vehicle-root",
      parentOwnerIndex: null,
      healthPoolIndex: 0,
    }],
    healthPools: [
      {
        poolId: "hull",
        kind: "hull",
        ownerIndex: 0,
        componentIndex: null,
        maxHealth: 1250,
        damageModifiers: [damageModifier(1)],
      },
      {
        poolId: "left-track",
        kind: "track",
        ownerIndex: 0,
        componentIndex: 1,
        maxHealth: 600,
        damageModifiers: [damageModifier(1.25)],
      },
      {
        poolId: "engine",
        kind: "engine",
        ownerIndex: 0,
        componentIndex: 2,
        maxHealth: 600,
        damageModifiers: [damageModifier(1)],
      },
    ],
    components: [
      {
        componentId: "hull-armor",
        classPath: "/Script/Squad.SQArmorMeshComponent",
        semanticKind: "armor",
        ownerIndex: 0,
        placementState: "observed",
        directDamagePoolIndex: 0,
      },
      {
        componentId: "left-track",
        classPath: "/Script/Squad.SQVehicleTrack",
        semanticKind: "track",
        ownerIndex: 0,
        placementState: "observed",
        directDamagePoolIndex: 1,
      },
      {
        componentId: "engine",
        classPath: "/Script/Squad.SQVehicleEngine",
        semanticKind: "engine",
        ownerIndex: 0,
        placementState: "observed",
        directDamagePoolIndex: 2,
      },
    ],
    surfaceProfiles: [{
      surfaceProfileId: "hull-surface",
      componentIndex: 0,
      armorThicknessMm: 10,
      considerForPenetration: true,
      allowPenetration: true,
      damageParentActor: true,
      armorDamageMultiplier: 1,
      damageAbsorbed: 0,
    }],
    weapons: [{
      weaponId: "test-explosive",
      role: "test",
      projectileIndex: 0,
      armorPenetrationDepthMm: 0,
      armorPenetrationCurveIndex: { state: "absent", value: null },
      damageFalloffCurveIndex: { state: "absent", value: null },
      maxDamage: 0,
      traceDistanceAfterPenetrationMeters: 0,
    }],
    projectiles: [{
      projectileId: "test-projectile",
      role: "test",
      damageTypePath,
      armorPenetrationDepthMm: 0,
      impactDamage: 0,
      isExplosive: true,
      traceDistanceAfterPenetrationMeters: 0,
      explosiveLayerOrderEvidence: "runtime-observed",
      impactRadialOrder: "point-before-radial",
      explosiveLayers: [{
        layerId: "primary",
        label: "Primary",
        shortLabel: "Primary",
        damageTypePath,
        baseDamage: 100,
        minimumDamage: 0,
        killZoneRadiusCm: 0,
        innerRadiusCm: 0,
        outerRadiusCm: 1000,
        falloff: 1,
        impactNormalOffsetCm: 75.9413833618164,
        onlyDamageMeshes: true,
        orderEvidence: "runtime-observed",
      }],
    }],
    curves: [],
    capabilities: {
      directHitDamage: { state: "observed" },
      finalTargetTakeDamageRouting: { state: "observed" },
    },
  };
}

const intersection = {
  triangleIndex: 0,
  componentIndex: 0,
  surfaceProfileIndex: 0,
  distanceFromRayOriginM: 1,
  point: [0, 0, 0],
  faceNormal: [1, 0, 0],
  incidenceFactor: 1,
};

function simulate(overrides = {}) {
  const target = model();
  return simulateEditorNativeShot({
    model: target,
    weaponModel: target,
    weaponIndex: 0,
    targetDistanceM: 0,
    shotDamageMultiplier: 1,
    intersections: [intersection],
    includeRadial: true,
    vehicleDamagedByRadial: true,
    radialDamageModel,
    ...overrides,
  });
}

function configureModuleDamageType(target, incomingDamageTypePath) {
  target.projectiles[0].damageTypePath = incomingDamageTypePath;
  target.projectiles[0].explosiveLayers[0].damageTypePath = incomingDamageTypePath;
}

function addWheelPool(target, incomingDamageTypePath, modifier) {
  const componentIndex = target.components.length;
  const poolIndex = target.healthPools.length;
  target.healthPools.push({
    poolId: "left-wheel",
    kind: "wheel",
    ownerIndex: 0,
    componentIndex,
    maxHealth: 300,
    damageModifiers: [routeModifier(incomingDamageTypePath, modifier)],
  });
  target.components.push({
    componentId: "left-wheel",
    classPath: "/Script/Squad.SQVehicleWheel",
    semanticKind: "wheel",
    ownerIndex: 0,
    placementState: "observed",
    directDamagePoolIndex: poolIndex,
  });
  return componentIndex;
}

test("locked radial arithmetic clamps native inputs and excludes the outer boundary", () => {
  assert.equal(editorNativeRadialDamageScale({
    distanceCm: 500,
    innerRadiusCm: 250,
    outerRadiusCm: 500,
    falloff: 1,
  }), 0);
  assert.equal(editorNativeRadialDamageScale({
    distanceCm: -1,
    innerRadiusCm: -1,
    outerRadiusCm: -1,
    falloff: 1,
  }), 0);
  assert.deepEqual(editorNativeRadialDamageAtDistance({
    baseDamage: 500,
    minimumDamage: 200,
    killZoneRadiusCm: 0,
    distanceCm: 500,
    innerRadiusCm: 250,
    outerRadiusCm: 500,
    falloff: 1,
    impactNormalOffsetCm: 0,
  }), { falloffFactor: 0, rawDamage: 200 });
});

test("root damage remains exact while an unpublished native hit multiset stays explicit", () => {
  const result = simulate();
  const radial = result.damage.filter(({ damageKind }) => damageKind === "radial");
  assert.equal(radial.length, 1);
  assert.equal(radial[0].poolKind, "hull");
  assert.ok(Math.abs(radial[0].poolDamage - 92.4058609008789) < 1e-5);
  assert.equal(result.radial.componentFanout, "native-query-required");
  assert.equal(result.radial.state, "partial");
  assert.ok(result.unknowns.includes("native radial component-hit multiset is not published"));
});

test("one native hit multiset resolves root plus repeated drivetrain dispatches only", () => {
  const repeatedTrackHits = Array.from({ length: 8 }, () => ({
    componentIndex: 1,
    impactPointCm: [0, 0, 0],
  }));
  const result = simulate({
    radialLayerHitSets: [{
      layerId: "primary",
      evidence: "native-observed",
      sourceBuildId: radialDamageModel.sourceBuildId,
      componentHits: [
        { componentIndex: 0, impactPointCm: [0, 0, 0] },
        ...repeatedTrackHits,
        { componentIndex: 2, impactPointCm: [0, 0, 0] },
      ],
    }],
  });
  const radial = result.damage.filter(({ damageKind }) => damageKind === "radial");
  assert.deepEqual(radial.map(({ poolKind }) => poolKind), ["hull", "track"]);
  const track = radial[1];
  assert.equal(track.radialComponentHitCount, 8);
  assert.equal(track.radialDispatchCount, 8);
  assert.equal(track.poolDamage, 924.05859375);
  assert.equal(track.effectiveDamage, 600);
  assert.equal(radial.some(({ poolKind }) => poolKind === "engine"), false);
  assert.equal(result.radial.componentFanout, "drivetrain-resolved");
  assert.equal(result.radial.state, "resolved");
});

test("HAT radial routing keeps tracked direct damage at zero but allows exact indirect drivetrain hits", () => {
  const hatDamageTypePath =
    "/Game/Gameplay/DamageTypes/BP_HAT_DamageType.BP_HAT_DamageType_C";
  const target = model();
  configureModuleDamageType(target, hatDamageTypePath);
  target.healthPools[0].damageModifiers = [
    routeModifier(hatDamageTypePath, 0.625, 0, 1, true),
  ];
  target.healthPools[1].damageModifiers = [
    routeModifier(hatDamageTypePath, 1, 0, 1),
  ];
  target.healthPools[2].damageModifiers = [
    routeModifier(hatDamageTypePath, 1),
  ];
  const wheelComponentIndex = addWheelPool(target, hatDamageTypePath, 2);
  const radialLayerHitSets = [{
    layerId: "primary",
    evidence: "native-reconstructed",
    sourceBuildId: radialDamageModel.sourceBuildId,
    originCm: [0, 0, 0],
    componentHits: [
      { componentIndex: 0, impactPointCm: [0, 0, 0] },
      { componentIndex: 1, impactPointCm: [0, 0, 0] },
      { componentIndex: 2, impactPointCm: [0, 0, 0] },
      { componentIndex: wheelComponentIndex, impactPointCm: [0, 0, 0] },
    ],
  }];
  const input = {
    model: target,
    weaponModel: target,
    weaponIndex: 0,
    targetDistanceM: 0,
    shotDamageMultiplier: 1,
    intersections: [intersection],
    includeRadial: true,
    vehicleDamagedByRadial: true,
    radialDamageModel,
    radialLayerHitSets,
  };
  const direct = simulateEditorNativeShot(input);
  const directRadial = direct.damage.filter(({ damageKind }) => damageKind === "radial");
  assert.equal(
    directRadial.find(({ poolKind }) => poolKind === "track")?.poolDamage ?? 0,
    0,
  );
  const directWheel = directRadial.find(({ poolKind }) => poolKind === "wheel");
  assert.ok(directWheel, JSON.stringify(directRadial));
  assert.ok(directWheel.poolDamage > 0);
  assert.equal(directRadial.some(({ poolKind }) => poolKind === "engine"), false);

  const indirect = simulateEditorNativeShot({
    ...input,
    radialOriginOverrideCm: [0, 0, 0],
  });
  const indirectRadial = indirect.damage.filter(({ damageKind }) => damageKind === "radial");
  assert.ok(indirectRadial.find(({ poolKind }) => poolKind === "track").poolDamage > 0);
  assert.ok(indirectRadial.find(({ poolKind }) => poolKind === "wheel").poolDamage > 0);
  assert.equal(indirectRadial.some(({ poolKind }) => poolKind === "engine"), false);
});

test("fragmentation radial routing damages exact wheel hits but not tracks, engines, or ammo racks", () => {
  const fragmentationDamageTypePath =
    "/Game/Gameplay/DamageTypes/BP_Fragmentation_DamageType.BP_Fragmentation_DamageType_C";
  const target = model();
  configureModuleDamageType(target, fragmentationDamageTypePath);
  target.healthPools[0].damageModifiers = [
    routeModifier(fragmentationDamageTypePath, 1, 0, 1, true),
  ];
  target.healthPools[1].damageModifiers = [
    routeModifier(fragmentationDamageTypePath, 1, 0, 1, true),
  ];
  target.healthPools[2].damageModifiers = [
    routeModifier(fragmentationDamageTypePath, 4),
  ];
  const wheelComponentIndex = addWheelPool(
    target,
    fragmentationDamageTypePath,
    1,
  );
  const result = simulateEditorNativeShot({
    model: target,
    weaponModel: target,
    weaponIndex: 0,
    targetDistanceM: 0,
    shotDamageMultiplier: 1,
    intersections: [intersection],
    includeRadial: true,
    radialOriginOverrideCm: [0, 0, 0],
    vehicleDamagedByRadial: true,
    radialDamageModel,
    radialLayerHitSets: [{
      layerId: "primary",
      evidence: "native-reconstructed",
      sourceBuildId: radialDamageModel.sourceBuildId,
      originCm: [0, 0, 0],
      componentHits: [
        { componentIndex: 1, impactPointCm: [0, 0, 0] },
        { componentIndex: 2, impactPointCm: [0, 0, 0] },
        { componentIndex: wheelComponentIndex, impactPointCm: [0, 0, 0] },
      ],
    }],
  });
  const radial = result.damage.filter(({ damageKind }) => damageKind === "radial");
  assert.equal(radial.find(({ poolKind }) => poolKind === "track")?.poolDamage ?? 0, 0);
  const wheel = radial.find(({ poolKind }) => poolKind === "wheel");
  assert.ok(wheel, JSON.stringify(radial));
  assert.ok(wheel.poolDamage > 0);
  assert.equal(radial.some(({ poolKind }) => poolKind === "engine"), false);
  assert.equal(radial.some(({ poolKind }) => poolKind === "ammo-rack"), false);
});

test("a vehicle that rejects radial explosions receives neither hull nor drivetrain damage", () => {
  const result = simulate({
    vehicleDamagedByRadial: false,
    radialLayerHitSets: [{
      layerId: "primary",
      evidence: "native-observed",
      sourceBuildId: radialDamageModel.sourceBuildId,
      componentHits: [{ componentIndex: 1, impactPointCm: [0, 0, 0] }],
    }],
  });
  assert.equal(result.damage.some(({ damageKind }) => damageKind === "radial"), false);
  assert.equal(result.radial.componentFanout, "vehicle-radial-disabled");
  assert.equal(result.radial.state, "resolved");
});

test("a directly hit seat forwards its radial event through the independent radial flag", () => {
  const target = model();
  target.owners.push({
    ownerId: "turret-seat",
    kind: "seat",
    parentOwnerIndex: 0,
    healthPoolIndex: 3,
  });
  target.healthPools.push({
    poolId: "turret-seat",
    kind: "seat",
    ownerIndex: 1,
    componentIndex: 0,
    maxHealth: 600,
    passDamageToParent: true,
    passPointDamageToParent: false,
    passRadialDamageToParent: true,
    damageModifiers: [damageModifier(1)],
  });
  target.components[0].ownerIndex = 1;
  target.components[0].directDamagePoolIndex = 3;
  const result = simulateEditorNativeShot({
    model: target,
    weaponModel: target,
    weaponIndex: 0,
    targetDistanceM: 0,
    shotDamageMultiplier: 1,
    intersections: [intersection],
    includeRadial: true,
    vehicleDamagedByRadial: false,
    radialDamageModel,
  });
  const radial = result.damage.filter(({ damageKind }) => damageKind === "radial");
  assert.equal(radial.length, 1);
  assert.equal(radial[0].poolKind, "hull");
  assert.equal(radial[0].route, "radial-direct-seat-forwarded-to-hull");
});

test("native radial hit distance rounds the squared sum before the square root", () => {
  const target = model();
  target.projectiles[0].explosiveLayers[0].impactNormalOffsetCm = 0;
  target.projectiles[0].explosiveLayers[0].outerRadiusCm = 200000;
  const result = simulateEditorNativeShot({
    model: target,
    weaponModel: target,
    weaponIndex: 0,
    targetDistanceM: 0,
    shotDamageMultiplier: 1,
    intersections: [intersection],
    includeRadial: true,
    vehicleDamagedByRadial: true,
    radialDamageModel,
    radialLayerHitSets: [{
      layerId: "primary",
      evidence: "native-observed",
      sourceBuildId: radialDamageModel.sourceBuildId,
      componentHits: [{
        componentIndex: 0,
        impactPointCm: [100000, 22.67, 3.25],
      }],
    }],
  });
  const hull = result.damage.find(
    ({ damageKind, poolKind }) => damageKind === "radial" && poolKind === "hull",
  );
  assert.equal(hull?.nearestImpactDistanceCm, 100000.0078125);
});

test("an explicit non-contact origin resolves indirect radial damage without point layers", () => {
  const result = simulate({
    intersections: [],
    radialOriginOverrideCm: [200, 0, 0],
    radialLayerHitSets: [{
      layerId: "primary",
      evidence: "native-reconstructed",
      sourceBuildId: radialDamageModel.sourceBuildId,
      originCm: [200, 0, 0],
      componentHits: [{
        componentIndex: 0,
        impactPointCm: [500, 0, 0],
      }],
    }],
  });
  assert.equal(result.layers.length, 0);
  assert.equal(result.radial.directHit, false);
  assert.equal(result.radial.nearestImpactDistanceCm, 300);
  assert.equal(result.radial.explosionOriginOffsetCm, 0);
  const radial = result.damage.filter(({ damageKind }) => damageKind === "radial");
  assert.equal(radial.length, 1);
  assert.equal(radial[0].route, "radial-indirect");
  assert.equal(radial[0].poolKind, "hull");
  assert.equal(radial[0].poolDamage, 70);
  assert.equal(result.damage.some(({ damageKind }) => damageKind === "point"), false);
});

test("an explicit origin outside every query body delivers no radial Actor event", () => {
  const result = simulate({
    intersections: [],
    radialOriginOverrideCm: [5000, 0, 0],
    radialLayerHitSets: [{
      layerId: "primary",
      evidence: "native-reconstructed",
      sourceBuildId: radialDamageModel.sourceBuildId,
      originCm: [5000, 0, 0],
      componentHits: [],
    }],
  });
  assert.equal(result.layers.length, 0);
  assert.equal(result.damage.length, 0);
  assert.equal(result.radial.state, "resolved");
  assert.equal(result.radial.guaranteedPoolIndices.length, 0);
  assert.equal(result.unknowns.includes(
    "primary native radial event omitted its receiver Actor hits",
  ), false);
});
