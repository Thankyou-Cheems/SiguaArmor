import assert from "node:assert/strict";
import test from "node:test";

import { runtimeDocumentTargets } from "../../tools/publish-runtime-document.mjs";

test("updates publisher targets both edition-specific public documents", () => {
  assert.deepEqual(runtimeDocumentTargets("updates", "https://example.test"), [
    {
      remoteRelativePath: "updates.json",
      publicUrl: "https://example.test/updates.json",
    },
    {
      remoteRelativePath: "squad/updates.json",
      publicUrl: "https://example.test/squad/updates.json",
    },
  ]);
});

test("supporters publisher retains its shared single-document target", () => {
  assert.deepEqual(runtimeDocumentTargets("supporters", "https://example.test"), [
    {
      remoteRelativePath: "supporters.json",
      publicUrl: "https://example.test/supporters.json",
    },
  ]);
});
