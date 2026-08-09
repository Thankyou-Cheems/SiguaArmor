import assert from "node:assert/strict";
import test from "node:test";

import { spacedArmorSurfaceInfo } from "../../lib/hit-scene-render-batches.ts";

function observed(value) {
  return { state: "observed", value };
}

const armorComponent = { semanticKind: "armor" };

function surface(physicalMaterialPath) {
  return {
    surfaceProfileId: `surface:${physicalMaterialPath}`,
    allowPenetration: observed(true),
    damageParentActor: observed(false),
    damageAbsorbed: observed(30),
    physicalMaterialPath: observed(physicalMaterialPath),
  };
}

test("native add-on material identity is required for the attached-armor marker", () => {
  assert.equal(
    spacedArmorSurfaceInfo(
      armorComponent,
      surface("/Game/Vehicles/Common/Armor/PhysMat_AddOn_NoPass"),
    ).isSpacedArmor,
    true,
  );
  assert.equal(
    spacedArmorSurfaceInfo(
      armorComponent,
      surface("/Game/Environments/PhysicalMaterials/PhysMat_Wood"),
    ).isSpacedArmor,
    false,
    "generic wood/body surfaces must not be labeled as attached armor",
  );
});

test("missing material identity fails closed even when damage absorption fields match", () => {
  const profile = surface("/Game/Vehicles/Common/Armor/PhysMat_AddOn");
  profile.physicalMaterialPath = { state: "absent", value: null, reason: "unresolved" };
  assert.equal(spacedArmorSurfaceInfo(armorComponent, profile).isSpacedArmor, false);
});
