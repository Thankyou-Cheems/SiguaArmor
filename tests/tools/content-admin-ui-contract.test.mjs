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
  assert.match(source, /notices: "蓝色提示"/u);
  assert.match(source, /<DataAccuracyNoticesEditor/u);
});

test("footer keeps supporter notes on a smaller second line without the old inner rule", async () => {
  const styles = await readFile(path.join(ROOT, "app", "globals.css"), "utf8");
  const listRule = styles.match(/\.site-footer__supporters-list \{(?<rule>[\s\S]*?)\n\}/u);
  const itemRule = styles.match(/\.site-footer__supporters-list li \{(?<rule>[\s\S]*?)\n\}/u);
  assert.ok(listRule?.groups?.rule);
  assert.ok(itemRule?.groups?.rule);
  assert.doesNotMatch(listRule.groups.rule, /border-left/u);
  assert.match(itemRule.groups.rule, /flex-direction: column/u);
  assert.match(styles, /\.site-footer__supporter-note \{[\s\S]*?font-size: 8px/u);
});
