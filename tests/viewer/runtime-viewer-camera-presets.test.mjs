import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RUNTIME_VIEWER_CAMERA_VIEWS,
  RUNTIME_VIEWER_INFANTRY_DISTANCES_M,
  SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG,
  SQUAD_INFANTRY_STANDING_EYE_HEIGHT_M,
  runtimeViewerCameraPose,
  runtimeViewerInfantryCameraPosition,
  verticalFovForHorizontalFov,
} from "../../lib/runtime-viewer-camera-presets.ts";

const viewerSource = await readFile(
  new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
  "utf8",
);
const viewerStyles = await readFile(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

test("camera presets remain clickable views but no longer own number keys", () => {
  assert.deepEqual(
    RUNTIME_VIEWER_CAMERA_VIEWS.map(({ id }) => id),
    ["front", "left", "rear", "right", "top"],
  );
  assert.equal(
    RUNTIME_VIEWER_CAMERA_VIEWS.some((view) => "shortcut" in view),
    false,
  );
  assert.doesNotMatch(viewerSource, /applyNumberedCameraView/u);
  assert.doesNotMatch(viewerSource, /数字键 1–5/u);
  assert.equal(RUNTIME_VIEWER_CAMERA_VIEWS.some(({ id }) => id === "bottom"), false);
  assert.deepEqual(
    RUNTIME_VIEWER_CAMERA_VIEWS
      .filter(({ id }) => id !== "top")
      .map(({ pitchDegrees }) => pitchDegrees),
    [0, 0, 0, 0],
    "ground-level directional views must not look down from an inspection angle",
  );
});

test("direction, observation distance, and free view share one camera state", () => {
  assert.equal(
    /data-active=\{activeView === view\.id\}/u.test(viewerSource),
    true,
    "choosing a distance must not clear the selected direction",
  );
  assert.equal(/>自由<\/button>/u.test(viewerSource), true);
  assert.equal(/>适配<\/button>/u.test(viewerSource), false);
  assert.equal(
    /applySquadPerspective\(distanceM, activeCameraViewRef\.current\)/u
      .test(viewerSource),
    true,
  );
  assert.equal(
    /infantryPreviewDistanceRef\.current \?\?[\s\S]*?RUNTIME_VIEWER_INFANTRY_DISTANCES_M\[0\]/u
      .test(viewerSource),
    true,
  );
});

test("opening either attack selector collapses the upper option rail with a visible cue", () => {
  assert.equal(/onOpenChange=\{setWeaponSelectorOpen\}/u.test(viewerSource), true);
  assert.equal(/onSourceOpenChange=\{setSourceSelectorOpen\}/u.test(viewerSource), true);
  assert.equal(/onOpenChange=\{onSourceOpenChange\}/u.test(viewerSource), true);
  assert.equal(
    /const attackSelectorOpen = sourceSelectorOpen \|\| weaponSelectorOpen/u
      .test(viewerSource),
    true,
  );
  assert.equal(/data-selector-open=\{attackSelectorOpen\}/u.test(viewerSource), true);
  assert.equal(/"展开上方选项栏"/u.test(viewerSource), true);
  assert.equal(
    /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/u
      .test(viewerSource),
    true,
  );
  assert.equal(
    /closest\('\[data-viewer-control-cue="weapon-selector"\]'\)/u
      .test(viewerSource),
    true,
  );
  assert.equal(
    /\.viewer-protection-controls\[data-selector-open="true"\][\s\S]*?translateX/u
      .test(viewerStyles),
    true,
  );
});

test("Squad's 90 degree horizontal FOV is converted for the Three.js viewport", () => {
  assert.equal(SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG, 90);
  assert.ok(
    Math.abs(verticalFovForHorizontalFov(90, 16 / 9) - 58.71550708558255) < 1e-10,
  );
  assert.ok(
    Math.abs(verticalFovForHorizontalFov(90, 4 / 3) - 73.73979529168804) < 1e-10,
  );
});

test("distance preview keeps real scale and uses the derived standing viewpoint", () => {
  assert.deepEqual(RUNTIME_VIEWER_INFANTRY_DISTANCES_M, [8, 50, 100, 200]);
  assert.equal(SQUAD_INFANTRY_STANDING_EYE_HEIGHT_M, 1.6);
  const [x, y, z] = runtimeViewerInfantryCameraPosition({
    yawDegrees: 90,
    distanceM: 100,
    groundY: -1,
  });
  assert.ok(Math.abs(x - 100) < 1e-12);
  assert.ok(Math.abs(y - 0.6) < 1e-12);
  assert.ok(Math.abs(z) < 1e-12);
});

test("directional camera pose keeps the vehicle centered at soldier eye height", () => {
  const front = runtimeViewerCameraPose({
    viewId: "front",
    distanceM: 50,
    groundY: -1,
    vehicleTarget: [2, 3, -4],
  });
  assert.ok(Math.abs(front.target[0] - 2) < 1e-12);
  assert.ok(Math.abs(front.target[1] - 0.6) < 1e-12);
  assert.ok(Math.abs(front.target[2] + 4) < 1e-12);
  assert.ok(Math.abs(front.position[0] - 52) < 1e-12);
  assert.ok(Math.abs(front.position[1] - 0.6) < 1e-12);
  assert.ok(Math.abs(front.position[2] + 4) < 1e-12);

  const top = runtimeViewerCameraPose({
    viewId: "top",
    distanceM: 50,
    groundY: -1,
    vehicleTarget: [2, 3, -4],
  });
  assert.deepEqual(top.target, [2, 3, -4]);
  assert.ok(top.position[1] > 52.99);
  assert.ok(Math.abs(top.position[0] - 2) < 0.5);
  assert.ok(Math.abs(top.position[2] + 4) < 0.5);
});

test("every ground direction composes with every observation distance", () => {
  for (const viewId of ["front", "left", "rear", "right"]) {
    for (const distanceM of RUNTIME_VIEWER_INFANTRY_DISTANCES_M) {
      const pose = runtimeViewerCameraPose({
        viewId,
        distanceM,
        groundY: -0.25,
        vehicleTarget: [3, 2, -6],
      });
      assert.ok(Math.abs(pose.position[1] - 1.35) < 1e-12);
      assert.ok(Math.abs(pose.target[1] - 1.35) < 1e-12);
      assert.ok(
        Math.abs(
          Math.hypot(
            pose.position[0] - pose.target[0],
            pose.position[2] - pose.target[2],
          ) - distanceM,
        ) < 1e-10,
      );
    }
  }
});

test("exterior mode lets the vehicle occlude the ground scale", () => {
  assert.match(
    viewerSource,
    /function setRuntimeGroundScaleVehicleOcclusion\([\s\S]*?material\.depthTest = vehicleOccluded;/u,
  );
  assert.match(
    viewerSource,
    /setRuntimeGroundScaleVehicleOcclusion\(\s*groundScaleRef\.current,\s*mode === "exterior",?\s*\)/u,
  );
  assert.match(
    viewerSource,
    /groundScaleDepthMode = mode === "exterior"\s*\? "vehicle-occluded"\s*:\s*"overlay"/u,
  );
});
