import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";

import {
  buildRuntimeVehicleTopDownProjection,
} from "../../lib/runtime-vehicle-topdown-projection.ts";

const [viewerSource, controlsSource, styles] = await Promise.all([
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/TurretLimitsDisplay.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
]);

function boxSource(size, offset = [0, 0, 0]) {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
  mesh.position.fromArray(offset);
  root.add(mesh);
  root.updateMatrixWorld(true);
  return root;
}

function occurrence(stableOccurrenceId, source, translation = [0, 0, 0]) {
  return {
    stableOccurrenceId,
    source,
    matrix: new THREE.Matrix4().makeTranslation(...translation).elements.slice(),
  };
}

test("loaded low-poly geometry becomes one compact hull plus movable outlines", () => {
  const projection = buildRuntimeVehicleTopDownProjection({
    occurrences: [
      occurrence("hull", boxSource([6, 1.5, 3])),
      occurrence("turret", boxSource([1.6, 0.8, 1.4]), [0.5, 1, 0]),
      occurrence("gun", boxSource([3.6, 0.18, 0.18], [1.8, 0, 0]), [0.5, 1, 0]),
      occurrence("optic", boxSource([0.5, 0.6, 0.5]), [0.2, 1.5, 0.35]),
    ],
    stations: [{
      id: "f2",
      parentId: null,
      depth: 0,
      placementIds: ["turret", "gun", "optic"],
      barrelPlacementIds: ["gun"],
      yawPivot: [0.5, 1, 0],
    }, {
      id: "f3",
      parentId: "f2",
      depth: 1,
      placementIds: ["optic"],
      barrelPlacementIds: ["optic"],
      yawPivot: [0.2, 1.5, 0.35],
    }],
  });

  assert.ok(projection);
  assert.equal(projection.state, "runtime-geometry");
  assert.deepEqual(projection.viewBox, [0, 0, 100, 100]);
  assert.ok(projection.hull.length >= 4);
  assert.deepEqual(projection.stations.map(({ id }) => id), ["f2", "f3"]);
  assert.equal(projection.stations[1].parentId, "f2");
  assert.ok(projection.stations[0].outline.length >= 3);
  assert.ok(projection.stations[1].outline.length >= 3);
  assert.notDeepEqual(
    projection.stations[0].barrelEnd,
    projection.stations[0].pivot,
  );
  for (const point of [
    ...projection.hull,
    ...projection.stations.flatMap(({ outline, pivot, barrelEnd }) => [
      ...outline,
      pivot,
      barrelEnd,
    ]),
  ]) {
    assert.ok(point[0] >= 0 && point[0] <= 100);
    assert.ok(point[1] >= 0 && point[1] <= 100);
  }
  assert.ok(projection.sampledVertexCount > projection.outputPointCount);
  assert.ok(JSON.stringify(projection).length < 5000);
});

test("missing renderable geometry fails closed without inventing a silhouette", () => {
  assert.equal(buildRuntimeVehicleTopDownProjection({
    occurrences: [{
      stableOccurrenceId: "empty",
      source: new THREE.Group(),
      matrix: new THREE.Matrix4().elements.slice(),
    }],
    stations: [],
  }), null);
});

test("viewer reuses loaded geometry and rotates nested projected station groups", () => {
  assert.match(viewerSource, /buildRuntimeVehicleTopDownProjection/u);
  assert.match(viewerSource, /source:\s*sources\.get|const source = sources\.get/u);
  assert.match(viewerSource, /topDownProjection=\{turretTopDownProjection\}/u);
  assert.match(viewerSource, /turretTopDownPayloadBytes/u);
  assert.match(viewerSource, /turretTopDownBuildDurationMs/u);
  assert.match(controlsSource, /turret-limit-compass__projected-hull/u);
  assert.match(controlsSource, /turret-limit-compass__projected-station/u);
  assert.match(controlsSource, /turret-limit-compass__projected-barrel/u);
  assert.match(controlsSource, /parentId === station\.id/u);
  assert.match(controlsSource, /relativeYawDegrees/u);
  assert.match(controlsSource, /data-topdown-station-id/u);
  assert.match(viewerSource, /querySelectorAll<SVGGElement>\("\[data-topdown-station-id\]"\)/u);
  assert.match(controlsSource, /车头固定朝上/u);
  assert.match(controlsSource, /topDownProjection \? "相对车头" : "方位"/u);
  assert.doesNotMatch(controlsSource, /内圈显示世界朝向/u);
  assert.match(styles, /\.turret-limit-compass__projected-hull\s*\{/u);
  assert.match(styles, /\.turret-limit-compass__projected-station\s*\{/u);
});
