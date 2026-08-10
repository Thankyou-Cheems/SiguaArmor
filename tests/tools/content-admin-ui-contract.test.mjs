import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

test("admin UI keeps a stable editor identity and sends its loaded ETag explicitly", async () => {
  const source = await readFile(path.join(ROOT, "app", "SiteContentAdminModal.tsx"), "utf8");

  assert.match(source, /etag:\s*result\.value\.etag/u);
  assert.match(source, /"If-Match":\s*current\.etag/u);
  assert.match(source, /expectedEtag:\s*current\.etag/u);
  assert.match(source, /key=\{index\}/u);
  assert.match(source, /key=\{segmentIndex\}/u);
  assert.doesNotMatch(source, /key=\{`\$\{entry\.id\}/u);
  assert.doesNotMatch(source, /key=\{`\$\{segmentIndex\}-\$\{segment\.text\}`\}/u);
});
