import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogSource = await readFile(
  new URL("../../app/CatalogApp.tsx", import.meta.url),
  "utf8",
);

function sourceBetween(start, end, from = 0) {
  const startIndex = catalogSource.indexOf(start, from);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  const endIndex = catalogSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return catalogSource.slice(startIndex, endIndex);
}

test("returning to faction selection restores the homepage catalog", () => {
  const clearFactionSelection = sourceBetween(
    "const clearFactionSelection = useCallback(",
    "useEffect(() => {\n    const onKeyDown",
  );

  assert.match(
    clearFactionSelection,
    /onRequestLocation\(window\.location\.href\)/u,
    "the homepage URL must reload its all-faction summary after the in-place return",
  );
});

test("global search does not treat a single-faction index as the full catalog", () => {
  const requestFullCatalog = sourceBetween(
    "const requestFullCatalog = useCallback(async () => {",
    "const requestCatalogLocation = useCallback",
  );

  assert.match(
    requestFullCatalog,
    /fullCatalogCacheRef\.current\.get\(siteEdition\)/u,
    "only an explicitly cached full catalog can skip the global load",
  );
  assert.doesNotMatch(
    requestFullCatalog,
    /current\?\.groups\.reduce/u,
    "group-local counts do not establish full-catalog completeness",
  );
});
