import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHitIntersections } from "../../lib/hit-intersection-ordering.ts";

const hit = (sourceFaceId, changes = {}) => ({
  sourceFaceId, distanceM: 10, point: [0, 0, 0], faceNormal: [0, 0, 1],
  componentId: "plate", surfaceProfileIndex: 0, ...changes,
});

test("a shared edge or vertex contributes one geometric contact and retains every source face", () => {
  const contacts = normalizeHitIntersections([hit(4), hit(1), hit(9)]);
  assert.equal(contacts.length, 1);
  assert.deepEqual(contacts[0].sourceFaceIds, [4, 1, 9]);
});

test("coincident components and material boundaries remain separate contacts", () => {
  const contacts = normalizeHitIntersections([
    hit(0), hit(1, { componentId: "second-plate" }), hit(2, { surfaceProfileIndex: 1 }),
  ]);
  assert.equal(contacts.length, 3);
  assert.deepEqual(contacts.map(({ hit: value }) => value.sourceFaceId), [0, 1, 2]);
});

test("opposed entry and exit faces of a sub-tolerance plate are not collapsed", () => {
  const contacts = normalizeHitIntersections([
    hit(0), hit(1, { distanceM: 10.000005, point: [0, 0, -0.000005], faceNormal: [0, 0, -1] }),
  ]);
  assert.equal(contacts.length, 2);
});

test("parallel layers separated by a real gap retain both contacts inside the distance tolerance", () => {
  const contacts = normalizeHitIntersections([
    hit(0), hit(1, { distanceM: 10.00005, point: [0, 0, -0.00005] }),
  ]);
  assert.equal(contacts.length, 2);
});

test("exact ray distance orders layers while equal-distance contacts retain source order", () => {
  const contacts = normalizeHitIntersections([
    hit(7, { distanceM: 12, componentId: "rear" }),
    hit(3, { componentId: "first-at-ten" }),
    hit(1, { componentId: "second-at-ten" }),
  ]);
  assert.deepEqual(contacts.map(({ hit: value }) => value.sourceFaceId), [3, 1, 7]);
});

test("normal magnitude does not change shared-edge identity and opposed normals stay distinct", () => {
  const contacts = normalizeHitIntersections([
    hit(0, { faceNormal: [0, 0, 3] }), hit(1, { faceNormal: [0, 0, 0.25] }),
    hit(2, { faceNormal: [0, 0, -2] }),
  ]);
  assert.deepEqual(contacts.map(value => value.sourceFaceIds), [[0, 1], [2]]);
});
