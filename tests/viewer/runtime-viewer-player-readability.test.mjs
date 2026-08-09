import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ARMOR_THICKNESS_LEGEND_STOPS,
  ARMOR_THICKNESS_LEGEND_TICKS,
  ARMOR_THICKNESS_MAX_MM,
  armorThicknessLegendPosition,
} from "../../lib/armor-thickness-ramp.ts";
import { playerHitComponentLabel } from "../../lib/runtime-component-labels.ts";

test("hit-preview component names are localized for players", async () => {
  const cases = [
    ["armor", "SQArmorMesh", "车体装甲"],
    ["armor", "SQArmorMeshSkirt_L", "左侧裙装甲"],
    ["armor", "Turret_ArmorMesh", "炮塔装甲"],
    ["armor", "SQArmorMeshWaterShieldR", "右侧防浪板"],
    ["engine", "Non_Pen_Wall", "发动机"],
    ["ammo-rack", "AmmoRackComponent", "弹药架"],
    ["track", "TrackRightComponent", "右侧履带"],
    ["wheel", "Wheel_L2", "左侧车轮"],
    ["gun-collision", "SQArmorMeshShield", "武器护盾"],
    ["gun-collision", "MisslePod_Collision", "导弹发射器"],
    ["penetration-blocker", "NoPenetrationBlock", "不可穿透区"],
    ["other", "TailRotorComponent", "尾桨"],
  ];

  for (const [semanticKind, componentId, expected] of cases) {
    const label = playerHitComponentLabel({
      semanticKind,
      componentId,
      componentPath: `/Game/Test.Vehicle_C_0.${componentId}`,
    });
    assert.equal(label, expected);
    assert.doesNotMatch(label, /SQArmor|Component|Collision|Mesh|[_/]/u);
  }

  const viewerSource = await readFile(
    new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(viewerSource, /playerHitComponentLabel\(component\)/u);
  assert.doesNotMatch(viewerSource, /componentLabel\(component\.componentPath/u);
});

test("absolute armor legend uses the fleet-calibrated log-like axis", () => {
  const expectedTickValues = [0, 10, 20, 50, 100, 300, 890];
  const axisDenominator = Math.log1p(ARMOR_THICKNESS_MAX_MM);
  assert.deepEqual(
    ARMOR_THICKNESS_LEGEND_TICKS.map(({ thicknessMm, normalizedPosition }) => [
      thicknessMm,
      normalizedPosition,
    ]),
    expectedTickValues.map((thicknessMm) => [
      thicknessMm,
      Math.log1p(thicknessMm) / axisDenominator,
    ]),
  );

  for (const stop of ARMOR_THICKNESS_LEGEND_STOPS) {
    assert.equal(
      stop.normalizedPosition,
      Math.log1p(stop.thicknessMm) / axisDenominator,
    );
  }
  assert.equal(
    armorThicknessLegendPosition(100),
    Math.log1p(100) / axisDenominator,
  );
  assert.equal(
    armorThicknessLegendPosition(700),
    Math.log1p(700) / axisDenominator,
  );
});
