import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  runtimeExplosiveCanonicalName,
  runtimeExplosiveLayerOrderIsClosed,
} from "../../lib/runtime-explosive-catalog.ts";

const [adapterSource, viewerSource] = await Promise.all([
  readFile(new URL("../../app/runtime-probe-weapon-labels.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
]);

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
