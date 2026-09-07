import assert from "node:assert/strict";
import test from "node:test";

import {
  gunnerSightDynamicPresentationSettled,
  interpolateGunnerSightDynamicPresentation,
  resolveGunnerSightDynamicBinding,
  resolveGunnerSightDynamicBindingGroup,
} from "../../lib/gunner-sight-runtime-state.ts";

const liveState = {
  rangeMeters: 1842.9,
  roundsRemaining: 7,
  magazineCapacity: 22,
  magazinesRemaining: 10,
  reloadProgress: 0.35,
  weaponReady: false,
  weaponReloading: true,
  stabilized: true,
  guidanceActive: false,
  currentWeaponLabel: "3OF26 125mm Fragmentation",
  currentFireModeSourceValue: 2,
  currentWeaponClassPath: "/Game/Vehicles/T72/Weapons/BP_3OF26.BP_3OF26_C",
  commanderOverride: false,
  weaponOverheated: false,
  stationRelativeYawDegrees: -35.5,
  stationPitchDegrees: 8.25,
  relatedStationRelativeYawDegrees: new Map([["BP_T72_Commander_C", 17.75]]),
};

test("resolves live rangefinder and magazine text instead of authored placeholders", () => {
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "rangefinder-distance-meters",
        property: "text",
        valueModel: {
          kind: "range-meters-integer",
          minimum: 0,
          maximum: 9999,
          emptyWhenNegative: true,
        },
      },
      liveState,
    ),
    { text: "1842" },
  );

  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "magazine-rounds-remaining",
        property: "text",
        valueModel: { kind: "integer" },
      },
      liveState,
    ),
    { text: "7" },
  );
});

test("preserves source-authored dynamic ammunition text color", () => {
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "magazine-rounds-display-color",
        property: "color-and-opacity",
        valueModel: {
          kind: "constant-linear-color",
          color: { R: 1, G: 0.648075, B: 0, A: 1 },
        },
      },
      liveState,
    ),
    { color: { R: 1, G: 0.648075, B: 0, A: 1 }, opacity: 1 },
  );
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "magazine-rounds-display-color",
        property: "color-and-opacity",
        valueModel: {
          kind: "boolean-linear-color-select",
          falseColor: { R: 0.1, G: 0, B: 0, A: 1 },
          trueColor: { R: 0, G: 1, B: 0, A: 1 },
        },
      },
      liveState,
    ),
    { color: { R: 0, G: 1, B: 0, A: 1 }, opacity: 1 },
  );
});

test("updates combined weapon, operation status and zoom labels", () => {
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      { semantic: "weapon-and-ammo-label", property: "text" },
      liveState,
    ),
    { text: "3OF26 125mm Fragmentation · 7" },
  );
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      { semantic: "weapon-fire-mode-label", property: "text" },
      liveState,
    ),
    { text: "2" },
  );
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      { semantic: "weapon-ready-status", property: "text" },
      liveState,
    ),
    { text: "RELOAD" },
  );
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      { semantic: "zoom-stage-label", property: "text" },
      { ...liveState, activeZoomIndex: 1 },
    ),
    { text: "Z2" },
  );
});

test("resolves ready, reload and stabilization indicators from live state", () => {
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "weapon-ready-indicator",
        property: "visibility",
        valueModel: { kind: "boolean-visibility" },
      },
      liveState,
    ),
    { visible: false },
  );
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "weapon-reloading-indicator",
        property: "visibility",
        valueModel: { kind: "boolean-visibility" },
      },
      liveState,
    ),
    { visible: true },
  );
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "stabilization-indicator",
        property: "color-and-opacity",
        valueModel: {
          kind: "boolean-linear-color-select",
          falseColor: { R: 0.09, G: 0.01, B: 0.18, A: 1 },
          trueColor: { R: 0.3, G: 0.05, B: 1, A: 1 },
        },
      },
      liveState,
    ),
    { color: { R: 0.3, G: 0.05, B: 1, A: 1 }, opacity: 1 },
  );
});

test("normal fire cadence is not presented as an empty magazine", () => {
  const binding = { semantic: "weapon-ready-status", property: "text" };
  const state = { ...liveState, weaponReloading: false };
  assert.deepEqual(resolveGunnerSightDynamicBinding(binding, state), { text: "" });
  assert.deepEqual(resolveGunnerSightDynamicBinding(binding,
    { ...state, roundsRemaining: 0 }), { text: "EMPTY" });
  assert.deepEqual(resolveGunnerSightDynamicBinding(binding,
    { ...state, weaponReady: true }), { text: "READY" });
  assert.deepEqual(resolveGunnerSightDynamicBinding(binding,
    { ...state, roundsRemaining: null }), { text: "" });
});

test("resolves current and related station dials from the live pose", () => {
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "station-relative-yaw-degrees",
        property: "render-angle-degrees",
        valueModel: { kind: "station-angle-degrees" },
      },
      liveState,
    ),
    { angleDegrees: -35.5 },
  );
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "related-station-relative-yaw-degrees",
        property: "render-angle-degrees",
        relatedSeatPawnClassPaths: ["/Game/Vehicles/T72/BP_T72_Commander.BP_T72_Commander_C"],
        valueModel: { kind: "station-angle-degrees" },
      },
      liveState,
    ),
    { angleDegrees: 17.75 },
  );
});

test("uses the exact T-72A CDO ammunition angle table", () => {
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "magazine-rounds-dial-angle",
        property: "render-angle-degrees",
        valueModel: {
          kind: "authored-magazine-index-angle",
          anglesDegrees: [
            -41, -36, -30, -25, -20, -15, -10, -5.5, -1, 2.5, 6.5, 11,
          ],
          sourceCdoProperty: "AmmoAngles",
        },
      },
      liveState,
    ),
    { angleDegrees: 6.5 },
  );
});

test("selects only the lamp bound to the active weapon class", () => {
  assert.deepEqual(
    resolveGunnerSightDynamicBinding(
      {
        semantic: "current-weapon-selection-indicator",
        property: "color-and-opacity",
        relatedSeatPawnClassPaths: [
          "/Game/Vehicles/T72/Weapons/BP_3OF26.BP_3OF26_C",
        ],
        valueModel: {
          falseColor: { R: 0.18, G: 0.008, B: 0.008, A: 1 },
          trueColor: { R: 1, G: 0.05, B: 0.05, A: 1 },
        },
      },
      liveState,
    ),
    { color: { R: 1, G: 0.05, B: 0.05, A: 1 }, opacity: 1 },
  );
});

test("ORs multiple exact weapon classes that drive one shared source lamp", () => {
  const colors = {
    falseColor: { R: 0.18, G: 0.008, B: 0.008, A: 1 },
    trueColor: { R: 1, G: 0.05, B: 0.05, A: 1 },
  };
  const bindings = [
    {
      id: "smoke",
      semantic: "current-weapon-selection-indicator",
      property: "color-and-opacity",
      targetWidgetName: "SmokeAmmo",
      relatedSeatPawnClassPaths: ["/Game/Weapons/BP_Smoke.BP_Smoke_C"],
      valueModel: colors,
    },
    {
      id: "atgm",
      semantic: "current-weapon-selection-indicator",
      property: "color-and-opacity",
      targetWidgetName: "SmokeAmmo",
      relatedSeatPawnClassPaths: ["/Game/Weapons/BP_ATGM.BP_ATGM_C"],
      valueModel: colors,
    },
  ];
  assert.deepEqual(
    resolveGunnerSightDynamicBindingGroup(bindings, {
      ...liveState,
      currentWeaponClassPath: "/Game/Weapons/BP_ATGM.BP_ATGM_C",
    }),
    { color: colors.trueColor, opacity: 1 },
  );
});

test("matches Unreal InterpTo lamp and dial transitions", () => {
  const current = {
    angleDegrees: -41,
    color: { R: 0.1, G: 0, B: 0, A: 1 },
    opacity: 1,
  };
  const target = {
    angleDegrees: 11,
    color: { R: 1, G: 0.5, B: 0.25, A: 1 },
    opacity: 1,
  };
  const next = interpolateGunnerSightDynamicPresentation(
    current,
    target,
    8,
    1 / 60,
  );
  assert.ok(Math.abs(next.angleDegrees - (-34.06666666666667)) < 1e-10);
  assert.ok(Math.abs(next.color.R - 0.22) < 1e-10);
  assert.equal(gunnerSightDynamicPresentationSettled(next, target), false);
  assert.deepEqual(
    interpolateGunnerSightDynamicPresentation(current, target, 8, 1),
    target,
  );
});
