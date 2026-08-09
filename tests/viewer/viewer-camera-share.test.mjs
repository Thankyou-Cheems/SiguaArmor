import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeViewerCameraState,
  encodeViewerCameraState,
  normalizeViewerCameraToken,
} from "../../lib/viewer-camera-share.mjs";

test("viewer camera state round-trips through one compact canonical token", () => {
  const token = encodeViewerCameraState({
    yaw: 37.654,
    pitch: -12.346,
    distance: 24.811,
    target: [1.234, -0.456, 7.891],
  });

  assert.match(token, /^[A-Za-z0-9_-]{18}$/u);
  assert.equal(normalizeViewerCameraToken(token), token);
  assert.deepEqual(decodeViewerCameraState(token), {
    yaw: 37.65,
    pitch: -12.35,
    distance: 24.81,
    target: [1.23, -0.46, 7.89],
  });
});

test("viewer camera tokens reject malformed and noncanonical payloads", () => {
  assert.equal(decodeViewerCameraState(""), null);
  assert.equal(decodeViewerCameraState("not-a-camera-token"), null);
  assert.equal(decodeViewerCameraState("AAAAAAAAAAAAAAAAAA"), null);
  assert.equal(normalizeViewerCameraToken("AAAAAAAAAAAAAAAAAA"), "");
});
