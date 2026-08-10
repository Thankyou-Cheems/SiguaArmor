import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  runtimeExplosiveCanonicalName,
  runtimeExplosiveLayerOrderIsClosed,
} from "../../lib/runtime-explosive-catalog.ts";

const [adapterSource, viewerSource, catalogIndexText] = await Promise.all([
  readFile(new URL("../../app/runtime-probe-weapon-labels.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../generated/catalog-index.json", import.meta.url), "utf8"),
]);
const catalogIndex = JSON.parse(catalogIndexText);

test("explosive identities and evidence state stay explicit", () => {
  assert.equal(
    runtimeExplosiveCanonicalName("Class'/Game/Weapons/BP_Test.BP_Test_C'"),
    "BP_Test",
  );
  assert.equal(
    runtimeExplosiveLayerOrderIsClosed({ layerOrderEvidence: "editor-verified" }),
    true,
  );
  assert.equal(
    runtimeExplosiveLayerOrderIsClosed({ layerOrderEvidence: "native-unknown" }),
    false,
  );
});

test("the Runtime Viewer builds explosive choices from the Wiki weapon catalog", () => {
  assert.match(adapterSource, /const runtimeExplosiveCatalog = \{/u);
  assert.match(adapterSource, /weaponCatalogShippingVariants/u);
  assert.match(adapterSource, /weaponCatalogRadialModelForAsset/u);
  assert.match(adapterSource, /sourceKind: "explosive-catalog"/u);
  assert.match(viewerSource, /搜索全部武器或弹种/u);
  assert.doesNotMatch(
    adapterSource,
    /generated\/internal|runtime-production-explosive-weapons|infantry-explosive-catalog\.json/u,
  );
});

test("vehicle attack sources join Wiki weapons through the product vehicle id", () => {
  const ztz99 = catalogIndex.records.find(
    ({ promoEntryId }) => promoEntryId === "pla--ztz99a--mbt",
  );
  assert.ok(ztz99, "ZTZ99A product mapping is missing");
  assert.notEqual(
    ztz99.promoEntryId,
    ztz99.variants[0].cardId,
    "the regression fixture must distinguish product and presentation ids",
  );
  assert.match(
    adapterSource,
    /weaponCatalogVariantsForExactVehicle\(\s*record\.promoEntryId,\s*variant\.sourceRawName,\s*\)/u,
  );
  assert.match(
    adapterSource,
    /weapon\.exactCardIds\.includes\(record\.promoEntryId\)/u,
  );
});

test("vehicle weapon distance keeps the exact Wiki ballistic profile", () => {
  assert.match(adapterSource, /weaponCatalogBallisticProfileForVariant/u);
  assert.match(
    adapterSource,
    /profileWeapon\.armorPenetrationCurveIndex/u,
  );
  assert.match(
    adapterSource,
    /profileWeapon\.damageFalloffCurveIndex/u,
  );
  assert.match(adapterSource, /\.\.\.ballisticProfile!\.model\.curves/u);
});
