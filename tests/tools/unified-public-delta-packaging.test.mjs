import test from "node:test";
import assert from "node:assert/strict";
import { canonicalLfBytes } from "../../tools/build-unified-public-delta.mjs";

test("delta packaging canonicalizes the shell preflight helper to LF", () => {
  const source = Buffer.from("#!/bin/sh\r\nset -eu\r\n", "utf8");
  assert.deepEqual(
    canonicalLfBytes(source),
    Buffer.from("#!/bin/sh\nset -eu\n", "utf8"),
  );
});
