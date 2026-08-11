import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_ACCURACY_NOTICES_DOCUMENT_URL,
  parseDataAccuracyNoticesDocument,
} from "../../lib/data-accuracy-notices-document.mjs";

const VALID_DOCUMENT = {
  version: 1,
  updatedAt: "2026-08-11T00:00:00.000Z",
  editions: {
    china: { title: "国服提示🔧", lines: ["第一段", "第二段"] },
    international: { lines: ["International notice"] },
  },
};

test("blue notice document keeps one small document for both site editions", () => {
  assert.equal(DATA_ACCURACY_NOTICES_DOCUMENT_URL, "/notices.json");
  assert.deepEqual(parseDataAccuracyNoticesDocument(VALID_DOCUMENT), VALID_DOCUMENT);
});

test("blue notice document rejects missing editions and empty lines", () => {
  assert.equal(
    parseDataAccuracyNoticesDocument({
      ...VALID_DOCUMENT,
      editions: { china: VALID_DOCUMENT.editions.china },
    }),
    null,
  );
  assert.equal(
    parseDataAccuracyNoticesDocument({
      ...VALID_DOCUMENT,
      editions: {
        ...VALID_DOCUMENT.editions,
        international: { lines: [""] },
      },
    }),
    null,
  );
});
