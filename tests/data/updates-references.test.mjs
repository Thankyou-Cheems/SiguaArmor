import assert from "node:assert/strict";
import test from "node:test";
import { splitUpdateReferences } from "../../lib/updates-references.ts";

test("update references preserve surrounding copy and resolve explicit HTTPS citations", () => {
  assert.deepEqual(splitUpdateReferences("参考 [论文](https://doi.org/10.1111/1467-8659.00508)，保持精度。"), [
    { text: "参考 " }, { text: "论文", href: "https://doi.org/10.1111/1467-8659.00508" }, { text: "，保持精度。" },
  ]);
});

test("unsupported and malformed references remain literal text", () => {
  for (const text of ["原有更新日志。", "[x](javascript:alert(1))", "[x](http://example.com)", "[x](https://)", "[x](https://user:pass@example.com)", "<script>alert(1)</script>"]) {
    assert.deepEqual(splitUpdateReferences(text), [{ text }]);
  }
});
