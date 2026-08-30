import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [viewerSource, overlaySource, controlsSource, styles] = await Promise.all([
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/GunnerSightOverlay.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/TurretLimitsDisplay.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
]);

test("gunner view renders the exact Station sidecar as screen and reticle layers", () => {
  assert.match(viewerSource, /activeGunnerSightStation/u);
  assert.match(viewerSource, /activeCrewViewStationId === activeTurretStation\.id/u);
  assert.match(viewerSource, /<GunnerSightOverlay/u);
  assert.match(overlaySource, /layer\.role === "viewport-screen"/u);
  assert.match(overlaySource, /layer\.role === "reticle"/u);
  assert.match(overlaySource, /wikiUrl\(projection\.assetUrl\)/u);
  assert.doesNotMatch(overlaySource, /damage-overlay.*<img/su);
  assert.match(styles, /\.gunner-sight-overlay__screen/u);
  assert.match(styles, /\.gunner-sight-overlay__reticle/u);
});

test("weapon and zoom controls switch only observed Station-owned routes", () => {
  assert.match(overlaySource, /station\.weaponModes/u);
  assert.match(overlaySource, /mode\.equipmentRef/u);
  assert.match(overlaySource, /切换当前站位武器分划/u);
  assert.match(overlaySource, /切换炮镜倍率/u);
  assert.match(controlsSource, /显示炮镜遮罩与分划/u);
  assert.match(controlsSource, /炮镜遮罩已开启/u);
  assert.match(viewerSource, /gunnerSightOverlayEnabled/u);
});

test("gunner overlay copy preserves the presentation-only evidence boundary", () => {
  assert.match(overlaySource, /不表示光学损坏、失明或命中机制/u);
  assert.doesNotMatch(overlaySource, /摧毁炮镜|致盲敌方|损伤光学设备/u);
});

test("source-authored UMG layout positions both screen and reticle layers", () => {
  assert.match(overlaySource, /gunnerSightLayerPlacement/u);
  assert.match(overlaySource, /transform=\{placement\.transform\}/u);
  assert.match(overlaySource, /viewBox=\{placement\.viewBox\.join/u);
  assert.match(overlaySource, /data-layout-role=\{role\}/u);
  assert.match(overlaySource, /role="reticle"/u);
  assert.doesNotMatch(
    styles,
    /\.gunner-sight-overlay__screen\s*\{[^}]*inset:\s*0[^}]*width:\s*100%/u,
  );
});

test("zoom stages change the crew camera FOV as well as the reticle asset", () => {
  assert.match(overlaySource, /onZoomStageChange/u);
  assert.match(viewerSource, /applyCrewViewZoomRef/u);
  assert.match(viewerSource, /crewViewHorizontalFovForZoom/u);
  assert.match(viewerSource, /host\.dataset\.cameraZoomIndex/u);
});

test("active crew view fills only the 3D viewport with compact corner controls", () => {
  assert.match(
    viewerSource,
    /data-crew-view-active=\{activeCrewViewStationId !== null \|\| undefined\}/u,
  );
  assert.match(viewerSource, /crew-view-immersive-controls/u);
  assert.match(
    viewerSource,
    /const exitOnEscape = \(event: KeyboardEvent\) => \{[^}]*event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\)/u,
  );
  assert.doesNotMatch(
    styles,
    /\.detail-panel--viewer:has\(\s*\.runtime-vehicle-viewer\[data-crew-view-active="true"\]\s*\)\s*\{[^}]*position:\s*fixed/u,
  );
  assert.match(
    styles,
    /\.runtime-vehicle-viewer\[data-crew-view-active="true"\]\s*>\s*:not\(\.viewer-canvas\)[^{]*\{[^}]*display:\s*none/u,
  );
  assert.doesNotMatch(
    styles,
    /body:has\(\.runtime-vehicle-viewer\[data-crew-view-active="true"\]\)\s*\{[^}]*overflow:\s*hidden/u,
  );
  assert.match(
    styles,
    /\.gunner-sight-overlay__controls\s*\{[\s\S]*?top:\s*8px;[\s\S]*?left:\s*8px;[\s\S]*?transform:\s*none;/u,
  );
  assert.match(
    styles,
    /\.crew-view-immersive-controls\s*\{[\s\S]*?top:\s*8px;[\s\S]*?right:\s*8px;/u,
  );
});
