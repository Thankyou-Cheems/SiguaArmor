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
  weaponHudSource,
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
  readFile(new URL("../../app/VehicleWeaponHud.tsx", import.meta.url), "utf8"),
]);

test("gunner view renders the exact Station sidecar as screen and reticle layers", () => {
  assert.match(viewerSource, /activeGunnerSightStation/u);
  assert.match(viewerSource, /activeCrewViewStationId === activeTurretStation\.id/u);
  assert.match(viewerSource, /<GunnerSightOverlay/u);
  assert.match(overlaySource, /layer\.role === "reticle"/u);
  assert.match(overlaySource, /compileGunnerSightRenderLayers/u);
  assert.match(overlaySource, /station\.textLayers/u);
  assert.match(overlaySource, /instrument-text/u);
  assert.match(overlaySource, /observed-solid-brush/u);
  assert.match(overlaySource, /wikiUrl\(projection\.assetUrl\)/u);
  assert.doesNotMatch(overlaySource, /damage-overlay.*<img/su);
  assert.match(styles, /\.gunner-sight-overlay__screen/u);
  assert.match(styles, /\.gunner-sight-overlay__reticle/u);
});

test("weapon and zoom controls switch only observed Station-owned routes", () => {
  assert.match(overlaySource, /station\.weaponModes/u);
  assert.match(overlaySource, /mode\.equipmentRef/u);
  assert.match(weaponHudSource, /游戏内武器栏/u);
  assert.match(weaponHudSource, /inventorySlotNumbers/u);
  assert.match(viewerSource, /onSelect=\{selectOperationEquipment\}/u);
  assert.match(overlaySource, /切换炮镜倍率/u);
  assert.doesNotMatch(controlsSource, /显示炮镜遮罩与分划/u);
  assert.match(viewerSource, /显示炮镜遮罩与分划/u);
  assert.match(viewerSource, /crew-view-immersive-controls/u);
  assert.match(viewerSource, /gunnerSightOverlayEnabled/u);
  assert.doesNotMatch(
    overlaySource,
    /onEquipmentChange\(defaultEquipmentRef\)/u,
    "a reticle fallback must not switch the active weapon back after a number-key selection",
  );
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
  assert.match(viewerSource, /operationViewMotionStep/u);
  assert.match(
    viewerSource,
    /visualAttachment\?\.motion\.inputDynamics/u,
  );
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
  assert.match(viewerSource, /operationPoseCommitScheduler\.schedule/u);
  assert.match(viewerSource, /flushOperationPoseCommitRef/u);
  assert.doesNotMatch(viewerSource, /setVehicleWeaponOperationClockMs/u);
  assert.match(overlaySource, /useLiveGunnerSightOperationState/u);
});

test("operation indicators subscribe to transient turret poses", () => {
  assert.match(viewerSource, /useSyncExternalStore/u);
  assert.match(
    viewerSource,
    /liveTurretPoseStore\.publish\(nextPoseStates\)/u,
  );
  assert.match(viewerSource, /<LiveOperationTurretControls/u);
  assert.match(viewerSource, /crew-view-operation-panel__toggle/u);
  assert.match(viewerSource, /aria-expanded=\{expanded\}/u);
  assert.match(
    viewerSource,
    /operationAngleLabel\(yawDegrees\)[\s\S]*operationAngleLabel\(pitchDegrees\)/u,
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
  assert.match(overlaySource, /role === "reticle"/u);
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
    /\.crew-view-operation-dock\s*\{[^}]*top:\s*8px;[^}]*right:\s*8px;/u,
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
    /\.crew-view-operation-dock\s*\{[^}]*flex-direction:\s*column;[^}]*max-height:\s*calc\(100% - 16px\);[^}]*overflow-y:\s*auto;/u,
  );
  assert.doesNotMatch(styles, /\.crew-view-operation-panel\s*\{[^}]*(position:\s*absolute|top:)/u,
    "posture controls must flow below wrapped actions/notices, not overlap at a fixed offset");
  assert.match(
    styles,
    /\.crew-view-operation-panel\[data-expanded="false"\]\s*\{[^}]*width:\s*max-content;/u,
  );
  assert.match(viewerSource, /camera\.aspect = OPERATION_VIEW_STANDARD_ASPECT_RATIO/u);
  assert.match(overlaySource, /standard-16:9-90-horizontal-baseline/u);
});

test("refill resets all loaded and reserve ammunition without switching view or firing from the button", () => {
  const start = viewerSource.indexOf("const refillVehicleAmmunition = useCallback(");
  const refill = viewerSource.slice(start, viewerSource.indexOf("}, [vehicleWeaponOperationStore]);", start));
  assert.match(refill, /stopVehicleProjectileFireRef\.current\(\);\s*vehicleWeaponOperationStatesRef\.current\.clear\(\);\s*vehicleWeaponOperationStore\.clear\(\);/u);
  assert.match(refill, /vehicleProjectileMagazineStateRef\.current = \{\s*weaponAssignmentId: null,\s*shotsFiredInMagazine: 0,/u);
  assert.doesNotMatch(refill, /setActive|setGuidance|exitCrewViewpoint|spawnVehicleProjectile/u);
  assert.match(viewerSource, /补满当前载具所有武器的装填弹与备弹/u);
  assert.match(viewerSource, /firingPresentation && \(vehicleOperationSource\?\.weapons\.length \?\? 0\) > 0/u,
    "an unarmed observer can also refill the other stations on this vehicle");
  assert.match(viewerSource, /onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}[\s\S]*?refillVehicleAmmunition\(\);\s*e\.currentTarget\.blur\(\);/u);
});

test("sight gutters use visible closed texture footprints underneath the authored layers", () => {
  assert.match(overlaySource, /loadGunnerSightMaskFrame\(source\)/u);
  assert.match(overlaySource, /dynamic\?\.visible === false/u);
  assert.match(overlaySource, /gunnerSightMaskPolygon\(/u);
  assert.match(overlaySource, /<mask[^>]*maskUnits="userSpaceOnUse"/u);
  assert.match(overlaySource, /<polygon[^\n]*fill="black"/u);
  assert.ok(overlaySource.indexOf("gunner-sight-overlay__frame-backdrop") < overlaySource.indexOf("{renderLayers.map"));
});

test("operation fire shares one equipment identity and uses a pooled projectile layer", () => {
  assert.match(overlaySource, /activeEquipmentRef/u);
  assert.match(weaponHudSource, /onSelect\(id\)/u);
  assert.doesNotMatch(overlaySource, /useState\(defaultEquipmentRef\)/u);
  assert.match(viewerSource, /compileVehicleProjectilePlaybackBinding/u);
  assert.match(viewerSource, /presentation-sample-native-cone/u);
  assert.doesNotMatch(viewerSource, /event\.code === "Space"/u);
  assert.match(viewerSource, /event\.button === 0/u);
  assert.match(viewerSource, /createHeldOperationFireController/u);
  assert.match(viewerSource, /<kbd>左键<\/kbd><span>按住开火<\/span>/u);
  assert.match(viewerSource, /event\.code === "KeyR"/u);
  assert.match(viewerSource, /reloadVehicleWeaponOperation/u);
  assert.match(weaponHudSource, /crew-view-weapon-status/u);
  assert.match(viewerSource, /buildVehicleProjectileSimulationInput/u);
  assert.match(projectileThreeRuntimeSource, /new THREE\.InstancedMesh/u);
  assert.match(projectileThreeRuntimeSource, /DEFAULT_MAX_ACTIVE_PROJECTILES/u);
  assert.match(viewerSource, /spawnVehicleProjectileVisualRef/u);
  assert.match(wikiSource, /loadWikiWeaponBallistics/u);
  assert.match(wikiSource, /launchOriginProfiles\.length === 0/u);
});

test("operation input separates canvas fire from UI weapon selection", () => {
  assert.match(
    viewerSource,
    /event\.isPrimary\s*&&\s*event\.target === renderer\.domElement/u,
  );
  assert.match(weaponHudSource, /e\.currentTarget\.blur\(\)/u);
  assert.match(weaponHudSource, /onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/u);
  assert.match(viewerSource, /action\.kind === "weapon"/u);
  assert.match(viewerSource, /selectOperationEquipmentRef\.current/u);
});

test("source HUD uses the same 1080-reference combat frame instead of fixed browser pixels", () => {
  assert.match(weaponHudSource, /source-weapon-hud__frame/u);
  assert.match(weaponHudSource, /100cqh \/ 1080/u);
  assert.match(styles, /\.source-weapon-hud__frame\s*\{[^}]*width:\s*min\(100cqw, calc\(100cqh \* 16 \/ 9\)\);[^}]*container-type:\s*size;/u);
});

test("dynamic sight instruments consume live operation and Wiki station motion", () => {
  assert.match(overlaySource, /data-dynamic-range-meters/u);
  assert.match(overlaySource, /data-dynamic-rounds-remaining/u);
  assert.match(overlaySource, /data-dynamic-yaw-degrees/u);
  assert.match(overlaySource, /data-dynamic-pitch-degrees/u);
  assert.match(overlaySource, /resolveGunnerSightDynamicBinding/u);
  assert.match(
    viewerSource,
    /maxYawSpeedDegreesPerSecond:\s*station\?\.turret\.maxYawSpeed/u,
  );
  assert.match(
    viewerSource,
    /maxPitchSpeedDegreesPerSecond:\s*station\?\.turret\.maxPitchSpeed/u,
  );
  assert.doesNotMatch(viewerSource, /OPERATION_VIEW_YAW_SPEED/u);
  assert.doesNotMatch(viewerSource, /OPERATION_VIEW_PITCH_SPEED/u);
});
