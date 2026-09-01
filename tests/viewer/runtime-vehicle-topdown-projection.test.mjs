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

function occurrence(
  stableOccurrenceId,
  source,
  translation = [0, 0, 0],
  bodyCandidate = false,
) {
  return {
    stableOccurrenceId,
    source,
    matrix: new THREE.Matrix4().makeTranslation(...translation).elements.slice(),
    bodyCandidate,
  };
}

function polygonArea(points) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}

function outlinesArea(outlines) {
  return outlines.reduce((sum, outline) => sum + polygonArea(outline), 0);
}

function outlinesBounds(outlines) {
  const points = outlines.flat();
  return {
    minimumX: Math.min(...points.map((point) => point[0])),
    maximumX: Math.max(...points.map((point) => point[0])),
    minimumY: Math.min(...points.map((point) => point[1])),
    maximumY: Math.max(...points.map((point) => point[1])),
  };
}

function uShapedWeaponStationSource() {
  const root = new THREE.Group();
  const addBox = (size, offset) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
    mesh.position.fromArray(offset);
    root.add(mesh);
  };
  addBox([0.35, 0.7, 2.2], [-0.85, 0, 0]);
  addBox([0.35, 0.7, 2.2], [0.85, 0, 0]);
  addBox([1.7, 0.7, 0.35], [0, 0, -0.925]);
  root.updateMatrixWorld(true);
  return root;
}

function skinnedBodySource() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const vertexCount = geometry.getAttribute("position").count;
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    skinWeights[index * 4] = 1;
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4),
  );
  const mesh = new THREE.SkinnedMesh(geometry);
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  bone.scale.set(6, 1, 3);
  const root = new THREE.Group();
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.skeleton.update();
  return root;
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

test("vehicle and station silhouettes preserve concavity while every gun stays explicit", () => {
  const projection = buildRuntimeVehicleTopDownProjection({
    occurrences: [
      occurrence("hull", boxSource([7, 1.5, 3.4])),
      occurrence("rws", uShapedWeaponStationSource(), [0.4, 1.4, 0]),
      occurrence("left-gun", boxSource([3.8, 0.14, 0.14], [1.9, 0, 0]), [0.4, 1.4, -0.35]),
      occurrence("right-gun", boxSource([3.2, 0.14, 0.14], [1.6, 0, 0]), [0.4, 1.4, 0.35]),
    ],
    stations: [{
      id: "f3-rws",
      parentId: null,
      depth: 0,
      placementIds: ["rws", "left-gun", "right-gun"],
      barrelPlacementIds: ["left-gun", "right-gun"],
      yawPivot: [0.4, 1.4, 0],
    }],
  });

  assert.ok(projection);
  assert.ok(projection.hullOutlines.length >= 1);
  const station = projection.stations[0];
  assert.ok(station.outlines.length >= 1);
  assert.equal(station.barrels.length, 2);

  const stationBounds = outlinesBounds(station.outlines);
  const stationBoundsArea =
    (stationBounds.maximumX - stationBounds.minimumX) *
    (stationBounds.maximumY - stationBounds.minimumY);
  assert.ok(
    outlinesArea(station.outlines) / stationBoundsArea < 0.78,
    "the open center of a U-shaped RWS must not be filled by a convex hull",
  );
  assert.ok(
    outlinesArea(projection.hullOutlines) > outlinesArea(station.outlines),
    "the vehicle body must remain a distinct, dominant silhouette",
  );
  for (const barrel of station.barrels) {
    assert.ok(Math.hypot(
      barrel.end[0] - barrel.start[0],
      barrel.end[1] - barrel.start[1],
    ) > 8, "each weapon barrel must remain visibly projected");
  }
});

test("the chassis remains in the hull layer when articulation membership overreaches", () => {
  const projection = buildRuntimeVehicleTopDownProjection({
    occurrences: [
      occurrence("chassis", boxSource([7.2, 1.5, 3.4]), [0, 0, 0], true),
      occurrence("turret", boxSource([1.8, 0.8, 1.6]), [0.4, 1.4, 0]),
      occurrence("gun", boxSource([4, 0.16, 0.16], [2, 0, 0]), [0.4, 1.4, 0]),
    ],
    stations: [{
      id: "f2",
      parentId: null,
      depth: 0,
      placementIds: ["chassis", "turret", "gun"],
      barrelPlacementIds: ["gun"],
      yawPivot: [0.4, 1.4, 0],
    }],
  });

  assert.ok(projection);
  const hullArea = outlinesArea(projection.hullOutlines);
  const stationArea = outlinesArea(projection.stations[0].outlines);
  assert.ok(
    stationArea < hullArea * 0.65,
    "the largest chassis footprint must not be duplicated into the movable turret fill",
  );
});

test("skinned vehicle bodies use posed vertices instead of collapsed bind geometry", () => {
  const projection = buildRuntimeVehicleTopDownProjection({
    occurrences: [
      occurrence("skinned-chassis", skinnedBodySource(), [0, 0, 0], true),
    ],
    stations: [],
  });

  assert.ok(projection);
  const bounds = outlinesBounds(projection.hullOutlines);
  const width = bounds.maximumX - bounds.minimumX;
  const height = bounds.maximumY - bounds.minimumY;
  assert.ok(
    height / width > 1.7,
    "the projected hull must retain the bone-scaled 6:3 footprint",
  );
});

test("viewer reuses loaded geometry and rotates nested projected station groups", () => {
  assert.match(viewerSource, /buildRuntimeVehicleTopDownProjection/u);
  assert.match(viewerSource, /source:\s*sources\.get|const source = sources\.get/u);
  assert.match(viewerSource, /topDownProjection=\{turretTopDownProjection\}/u);
  assert.match(viewerSource, /turretTopDownPayloadBytes/u);
  assert.match(viewerSource, /turretTopDownBuildDurationMs/u);
  assert.match(viewerSource, /bodyCandidate:/u);
  assert.match(viewerSource, /placement\.actor\.replace\(\/_\\d\+\$\/u/u);
  assert.match(controlsSource, /turret-limit-compass__projected-hull/u);
  assert.match(controlsSource, /turret-limit-compass__projected-station/u);
  assert.match(controlsSource, /turret-limit-compass__projected-barrel/u);
  assert.match(controlsSource, /projection\.hullOutlines/u);
  assert.match(controlsSource, /station\.outlines/u);
  assert.match(controlsSource, /station\.barrels/u);
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
