import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalogAppSource = readFileSync(
  new URL("../../app/CatalogApp.tsx", import.meta.url),
  "utf8",
);
const vehicleSearchSource = readFileSync(
  new URL("../../app/vehicle-search.ts", import.meta.url),
  "utf8",
);

test("catalog bootstrap does not statically load the full weapon catalog", () => {
  assert.doesNotMatch(
    catalogAppSource,
    /from\s+["']\.\/runtime-vehicle-equipment(?:\.ts)?["']/u,
  );
  assert.doesNotMatch(
    vehicleSearchSource,
    /from\s+["']\.\/runtime-vehicle-equipment(?:\.ts)?["']/u,
  );
  assert.match(
    catalogAppSource,
    /import\(["']\.\/runtime-vehicle-equipment["']\)/u,
  );
});

test("vehicle reference data mounts only after the encyclopedia is opened", () => {
  assert.match(
    catalogAppSource,
    /encyclopediaOpen\s*\?\s*<ReferenceDataView\s+data=\{data\}\s*\/>\s*:\s*null/u,
  );
});
