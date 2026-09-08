import assert from "node:assert/strict";
import test from "node:test";
import { runtimeViewerBackgroundPresentation } from "../../lib/runtime-viewer-background.ts";

test("inspection swaps backgrounds without affecting the school used for operation", () => {
  assert.deepEqual(runtimeViewerBackgroundPresentation("school", false), {
    schoolVisible: true, gridVisible: false, schoolMuted: true,
  });
  assert.deepEqual(runtimeViewerBackgroundPresentation("grid", false), {
    schoolVisible: false, gridVisible: true, schoolMuted: true,
  });
  for (const preference of ["school", "grid"]) {
    assert.deepEqual(runtimeViewerBackgroundPresentation(preference, true), {
      schoolVisible: true, gridVisible: false, schoolMuted: false,
    });
  }
});
