import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogNavigationGate } from "../../lib/catalog-navigation-intent.ts";

test("a cached choice supersedes an older pending navigation", () => {
  const gate = createCatalogNavigationGate();
  const pending = gate.begin();
  const cached = gate.begin();
  assert.equal(pending.isCurrent(), false);
  assert.equal(cached.isCurrent(), true);
});

test("cancelling a request does not invalidate its newer successor", () => {
  const gate = createCatalogNavigationGate();
  const first = gate.begin();
  const next = gate.begin();
  first.cancel();
  assert.equal(first.isCurrent(), false);
  assert.equal(next.isCurrent(), true);
  next.cancel();
  assert.equal(next.isCurrent(), false);
});

test("teardown invalidates every outstanding navigation", () => {
  const gate = createCatalogNavigationGate();
  const pending = gate.begin();
  gate.invalidate();
  assert.equal(pending.isCurrent(), false);
  assert.equal(gate.begin().isCurrent(), true);
});
