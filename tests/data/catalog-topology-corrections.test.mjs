import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const topology = JSON.parse(
  await readFile(new URL("../../generated/catalog-index.json", import.meta.url), "utf8"),
);

test("USMC CAS topology selects the F/A-18 instead of the A-10", () => {
  const usmcCas = topology.records.filter(
    ({ promoEntryId }) => promoEntryId.startsWith("usmc--") && promoEntryId.endsWith("--cas"),
  );
  assert.deepEqual(usmcCas.map(({ promoEntryId }) => promoEntryId), ["usmc--fa18--cas"]);
  assert.deepEqual(
    usmcCas[0].variants.map(({ sourceRawName }) => sourceRawName),
    ["BP_CommandActor_FA18_Strafe"],
  );
});
