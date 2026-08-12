import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const globalStyles = await readFile(`${root}/app/globals.css`, "utf8");
const manifest = JSON.parse(
  await readFile(`${root}/public/fonts/manifest.json`, "utf8"),
);

test("site display font excludes the CJK bulk from every catalog startup", async () => {
  const match = globalStyles.match(
    /url\("(?<path>\/fonts\/sigua-unbounded-display-[a-f0-9]{16}\.woff2)"\)/u,
  );
  assert.ok(match?.groups?.path, "globals.css must reference a hashed display subset");
  assert.equal(manifest.subset.path, match.groups.path);
  assert.equal(manifest.coverage.strategy, "latin-greek-cyrillic-display-ranges/v1");
  assert.match(globalStyles, /unicode-range:[\s\S]*?U\+0020-024F/u);
  assert.doesNotMatch(globalStyles, /U\+4E00/u);
  assert.doesNotMatch(globalStyles, /sigua-unbounded-site-4542d8a1ac6ce837/u);

  const fontPath = `${root}/public${match.groups.path}`;
  const fontStat = await stat(fontPath);
  assert.equal(fontStat.size, manifest.subset.bytes);
  assert.ok(
    fontStat.size <= 80 * 1024,
    `display subset must stay within 80 KiB, received ${fontStat.size} bytes`,
  );
});
