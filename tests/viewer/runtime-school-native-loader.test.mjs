import test from "node:test";
import assert from "node:assert/strict";
import { loadNarvaSchoolQuery } from "../../lib/runtime-school-native-loader.ts";

test("school query shares concurrent loading and retries a failed source request", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response("unavailable", { status: 503 });
  });
  assert.equal(requests, 0, "importing the query loader must not fetch data");
  const first = loadNarvaSchoolQuery();
  assert.equal(loadNarvaSchoolQuery(), first);
  await assert.rejects(first, /503/);
  assert.equal(requests, 1);
  const retry = loadNarvaSchoolQuery();
  assert.notEqual(retry, first);
  await assert.rejects(retry, /503/);
  assert.equal(requests, 2);
});
