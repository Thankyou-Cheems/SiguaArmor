import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [viewerSource, controlsSource, styles] = await Promise.all([
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/TurretLimitsDisplay.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
]);
const markerFactorySource = viewerSource.match(
  /function createCrewViewpointMarker[\s\S]*?function referenceTurretFromStationControl/u,
)?.[0] ?? "";

test("selected weapon station exposes an exact viewpoint marker and camera toggle", () => {
  assert.match(viewerSource, /createCrewViewpointMarker/u);
  assert.match(viewerSource, /crewViewBasePose/u);
  assert.match(viewerSource, /transformCrewViewPose/u);
  assert.match(viewerSource, /activeCrewViewStationId/u);
  assert.match(viewerSource, /cameraViewKind = "crew-station"/u);
  assert.match(controlsSource, /进入真实操作视角/u);
  assert.match(controlsSource, /退出真实操作视角/u);
  assert.match(controlsSource, /持续命中该视点产生的火花可干扰操作手观察/u);
  assert.match(styles, /\.turret-preview-controls__viewpoint/u);
  assert.match(viewerSource, /viewer-crew-viewpoint-hud__copy/u);
  assert.match(viewerSource, /<span>观察点<\/span>/u);
  assert.doesNotMatch(viewerSource, /炮镜观察点/u);
  assert.match(
    styles,
    /\.viewer-crew-viewpoint-hud__copy\s*\{[\s\S]*?display:\s*grid;/u,
  );
});

test("viewpoint marker is an optional camera-facing optic billboard", () => {
  assert.match(viewerSource, /crewViewpointMarkerEnabled/u);
  assert.match(controlsSource, /viewpointMarkerEnabled/u);
  assert.match(controlsSource, /role="switch"/u);
  assert.match(controlsSource, /观察点标记/u);
  assert.match(controlsSource, /viewpointMarkerEnabled \? "显示" : "隐藏"/u);
  assert.match(controlsSource, /viewer-state-switch/u);
  assert.match(controlsSource, /viewer-state-switch__track/u);
  assert.match(styles, /\.viewer-state-switch__track/u);
  assert.match(markerFactorySource, /new THREE\.CanvasTexture/u);
  assert.match(markerFactorySource, /new THREE\.Sprite/u);
  assert.doesNotMatch(
    markerFactorySource,
    /TorusGeometry|LineSegments|new THREE\.Line\(/u,
  );
});

test("viewpoint copy never claims a damage, blindness, or optic-destruction mechanic", () => {
  assert.doesNotMatch(controlsSource, /炮镜损坏|摧毁炮镜|致盲机制/u);
});
