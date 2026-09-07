import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalogAppSource = readFileSync(
  new URL("../../app/CatalogApp.tsx", import.meta.url),
  "utf8",
);
const vehicleSearchSource = readFileSync(
  new URL("../../app/vehicle-search.ts", import.meta.url),
  "utf8",
);
const runtimeViewerSource = readFileSync(
  new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
  "utf8",
);
const runtimePreviewSource = readFileSync(
  new URL("../../app/runtime-probe-preview-data.ts", import.meta.url),
  "utf8",
);
const runtimeSuspensionSource = readFileSync(
  new URL("../../app/runtime-planar-suspension-pose.ts", import.meta.url),
  "utf8",
);
const catalogBootstrapSource = readFileSync(
  new URL("../../app/catalog-bootstrap.ts", import.meta.url),
  "utf8",
);

test("catalog bootstrap does not statically load the full weapon catalog", () => {
  assert.doesNotMatch(
    catalogAppSource,
    /from\s+["']\.\/runtime-vehicle-equipment(?:\.ts)?["']/u,
  );
  assert.doesNotMatch(
    vehicleSearchSource,
    /from\s+["']\.\/runtime-vehicle-equipment(?:\.ts)?["']/u,
  );
  assert.match(
    catalogAppSource,
    /import\(["']\.\/runtime-vehicle-equipment["']\)/u,
  );
});

test("vehicle reference data mounts only after the encyclopedia is opened", () => {
  assert.match(
    catalogAppSource,
    /encyclopediaOpen\s*\?\s*<ReferenceDataView\s+data=\{data\}\s*\/>\s*:\s*null/u,
  );
});

test("3D startup does not statically wait for the full weapon catalog", () => {
  assert.doesNotMatch(
    runtimeViewerSource,
    /import\s*\{[^}]*runtimeVehicleEquipmentBindingForId[^}]*\}\s*from\s*["']\.\/runtime-vehicle-equipment["']/su,
  );
  assert.doesNotMatch(
    runtimeViewerSource,
    /import\(["']\.\/runtime-vehicle-equipment["']\)/u,
  );
  assert.match(
    runtimeViewerSource,
    /loadWikiVehicleWeaponRuntimeSource\(preview\.cardId\)/u,
  );
  assert.match(
    runtimeViewerSource,
    /onRequestGlobalLibrary=\{requestGlobalAttackLibrary\}/u,
  );
  assert.doesNotMatch(
    runtimeViewerSource,
    /className="viewer-search-select__global-load"/u,
  );
  assert.match(
    runtimeViewerSource,
    /const openSelector = \(\) => \{[\s\S]*?onRequestGlobalLibrary\(\)[\s\S]*?changeOpen\(true\)/u,
  );
  const defaultSourceLoad = runtimeViewerSource.slice(
    runtimeViewerSource.indexOf("loadWikiVehicleWeaponRuntimeSource(preview.cardId)"),
    runtimeViewerSource.indexOf("const attackSource ="),
  );
  assert.doesNotMatch(
    defaultSourceLoad,
    /import\(["']\.\/runtime-probe-weapon-labels["']\)/u,
  );
});

test("3D preview resolves one vehicle runtime source instead of the full vehicle catalog", () => {
  assert.match(runtimePreviewSource, /loadWikiVehicleRuntimeSource/u);
  assert.doesNotMatch(runtimePreviewSource, /loadWikiVehicleCatalog/u);
  assert.doesNotMatch(runtimePreviewSource, /await loadWikiVehicleCatalog/u);
  assert.doesNotMatch(runtimePreviewSource, /runtime-chassis-pose/u);
  assert.doesNotMatch(runtimePreviewSource, /chassis-poses\.json/u);
  assert.match(runtimePreviewSource, /chassisPose: runtimeVariant\.chassisPose/u);
  assert.doesNotMatch(runtimePreviewSource, /suspension-poses\.json/u);
  assert.match(runtimePreviewSource, /suspension: runtimeVariant\.suspension/u);
  assert.doesNotMatch(runtimeSuspensionSource, /loadWikiDataset/u);
  assert.doesNotMatch(runtimeSuspensionSource, /suspension-poses\.json/u);
  assert.match(runtimeViewerSource, /preview\.suspension\.records/u);
  assert.match(runtimePreviewSource, /geometry:\s*artifact\.geometry/u);
  assert.match(runtimePreviewSource, /geometryUrl:\s*artifact\.geometryUrl/u);
});

test("active catalog groups resolve faction mechanics without the full vehicle catalog", () => {
  assert.match(catalogAppSource, /loadWikiVehicleFactionMechanics/u);
  assert.match(catalogAppSource, /wikiVehicleFactionIdsForGroup/u);
  assert.doesNotMatch(catalogAppSource, /loadWikiVehicleCatalog/u);
});

test("deep links use one faction presentation slice and reserve the full presentation for global search", () => {
  const initialLoader = catalogBootstrapSource.slice(
    catalogBootstrapSource.indexOf("export async function loadInitialPublicCatalog"),
    catalogBootstrapSource.indexOf("export async function loadPublicCatalog("),
  );
  const fullLoader = catalogBootstrapSource.slice(
    catalogBootstrapSource.indexOf("export async function loadPublicCatalog("),
  );

  assert.match(initialLoader, /loadCatalogBootstrapRoutes/u);
  assert.match(initialLoader, /loadPublicCatalogGroup/u);
  assert.doesNotMatch(initialLoader, /loadWikiVehiclePresentation/u);
  assert.match(fullLoader, /loadWikiVehiclePresentation/u);
});
