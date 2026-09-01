import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  viewerSource,
  overlaySource,
  controlsSource,
  styles,
  wikiSource,
  projectileThreeRuntimeSource,
] = await Promise.all([
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/GunnerSightOverlay.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/TurretLimitsDisplay.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../../lib/wiki-source.ts", import.meta.url), "utf8"),
  readFile(
    new URL("../../lib/vehicle-projectile-three-runtime.ts", import.meta.url),
    "utf8",
  ),
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
  assert.doesNotMatch(controlsSource, /显示炮镜遮罩与分划/u);
  assert.match(viewerSource, /显示炮镜遮罩与分划/u);
  assert.match(viewerSource, /crew-view-immersive-controls/u);
  assert.match(viewerSource, /gunnerSightOverlayEnabled/u);
});

test("operation view exposes direct ring control and keyboard-only camera input", () => {
  assert.match(viewerSource, /operationOverlay/u);
  assert.match(viewerSource, /crew-view-operation-panel/u);
  assert.match(viewerSource, /operationViewKeyAction/u);
  assert.match(viewerSource, /controls\.enabled = false/u);
  assert.match(
    viewerSource,
    /const onPointerDown = \(event: PointerEvent\) => \{\s*if \(activeCrewViewStationIdRef\.current !== null\)/u,
  );
  assert.match(
    viewerSource,
    /const onExplosionWheel = \(event: WheelEvent\) => \{\s*if \(activeCrewViewStationIdRef\.current !== null\)/u,
  );
  assert.match(viewerSource, /WASD/u);
  assert.match(viewerSource, /<kbd>Q<\/kbd>/u);
  assert.match(controlsSource, /切换可操控位置/u);
  assert.match(controlsSource, /进入真实操作视角/u);
});

test("held WASD input stays frame-based while synchronizing every rendered layer", () => {
  assert.match(viewerSource, /const heldOperationKeys = new Set<string>\(\)/u);
  assert.match(viewerSource, /const stepOperationMovement = \(frameTime: number\) =>/u);
  assert.match(viewerSource, /requestAnimationFrame\(stepOperationMovement\)/u);
  assert.match(viewerSource, /operationViewContinuousPoseDelta/u);
  assert.match(
    viewerSource,
    /updateTurretStationPose\([\s\S]*?\{ transient: true \},\s*\);/u,
  );
  const applyStart = viewerSource.indexOf("const applyTurretPose = (");
  const applyEnd = viewerSource.indexOf(
    "applyTurretPoseRef.current = applyTurretPose",
    applyStart,
  );
  const applySource = viewerSource.slice(applyStart, applyEnd);
  assert.match(applySource, /operationInputMode = "continuous-raf"/u);
  assert.match(applySource, /setHitSceneThreeModelComponentPoses\(/u);
  assert.doesNotMatch(
    applySource.slice(
      applySource.indexOf("if (interactive)"),
      applySource.indexOf("setHitSceneThreeModelComponentPoses("),
    ),
    /render\(\);\s*return;/u,
  );
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
  assert.match(viewerSource, /operationViewHorizontalFovForMagnification/u);
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

test("gunner operation view preserves one 16:9 combat frame with black UI gutters", () => {
  assert.match(
    styles,
    /\.runtime-vehicle-viewer\[data-crew-view-active="true"\]\s*\{[^}]*background:\s*#000\s*!important;/u,
  );
  assert.match(
    styles,
    /\.runtime-vehicle-viewer\[data-crew-view-active="true"\][\s\S]*?\.viewer-canvas\s*\{[^}]*container-type:\s*size;/u,
  );
  assert.match(
    styles,
    /\.runtime-vehicle-viewer\[data-crew-view-active="true"\][\s\S]*?\.runtime-vehicle-viewer__host\s*\{[^}]*width:\s*min\(100cqw,\s*calc\(100cqh \* 16 \/ 9\)\);[^}]*height:\s*min\(100cqh,\s*calc\(100cqw \* 9 \/ 16\)\);/u,
  );
  assert.match(
    styles,
    /\.gunner-sight-overlay__layers\s*\{[^}]*width:\s*min\(100cqw,\s*calc\(100cqh \* 16 \/ 9\)\);[^}]*height:\s*min\(100cqh,\s*calc\(100cqw \* 9 \/ 16\)\);/u,
  );
  assert.match(
    styles,
    /\.crew-view-operation-panel\s*\{[^}]*top:\s*42px;[^}]*right:\s*8px;/u,
  );
  assert.match(viewerSource, /camera\.aspect = OPERATION_VIEW_STANDARD_ASPECT_RATIO/u);
  assert.match(overlaySource, /standard-16:9-90-horizontal-baseline/u);
});

test("operation fire shares one equipment identity and uses a pooled projectile layer", () => {
  assert.match(overlaySource, /activeEquipmentRef/u);
  assert.match(overlaySource, /onEquipmentChange/u);
  assert.doesNotMatch(overlaySource, /useState\(defaultEquipmentRef\)/u);
  assert.match(viewerSource, /compileVehicleProjectilePlaybackBinding/u);
  assert.match(viewerSource, /presentation-sample-native-cone/u);
  assert.match(viewerSource, /散布为网页样本/u);
  assert.match(viewerSource, /event\.code === "Space"/u);
  assert.match(viewerSource, /buildVehicleProjectileSimulationInput/u);
  assert.match(projectileThreeRuntimeSource, /new THREE\.InstancedMesh/u);
  assert.match(projectileThreeRuntimeSource, /DEFAULT_MAX_ACTIVE_PROJECTILES/u);
  assert.match(viewerSource, /spawnVehicleProjectileVisualRef/u);
  assert.match(wikiSource, /loadWikiWeaponBallistics/u);
  assert.match(wikiSource, /launchOriginProfiles\.length === 0/u);
});
