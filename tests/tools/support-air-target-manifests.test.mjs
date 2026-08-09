import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(
  await readFile(new URL("../../config/support-air-assets.json", import.meta.url)),
);

test("support-air mappings are exact, complete, and evidence-bound", () => {
  assert.equal(config.schemaVersion, "sigua-support-air-assets/v1");
  assert.equal(config.evidencePolicy.noFallbackModels, true);
  assert.ok(config.captureTargets.length >= 17);
  assert.ok(config.cards.length >= 30);

  const targets = new Map(config.captureTargets.map((target) => [target.id, target]));
  assert.equal(targets.size, config.captureTargets.length);
  for (const target of targets.values()) {
    assert.match(
      target.captureCardId,
      new RegExp(`^${target.factionId.toLowerCase()}--`),
    );
  }
  const bindings = new Set();
  for (const card of config.cards) {
    assert.match(card.factionId, /^[A-Z0-9]+$/);
    assert.match(card.cardId, new RegExp(`^${card.factionId.toLowerCase()}--`));
    assert.ok(["UAV", "CAS", "DRONE"].includes(card.type));
    assert.ok(card.variants.length > 0);
    for (const variant of card.variants) {
      const target = targets.get(variant.captureTargetId);
      assert.ok(target, `unknown capture target ${variant.captureTargetId}`);
      assert.match(variant.gameplayAuthorityPath, /\.uasset$/);
      const binding = `${card.cardId}\u0000${target.rawName}`;
      assert.ok(!bindings.has(binding), `duplicate support-air binding ${binding}`);
      bindings.add(binding);
    }
  }

  assert.ok(
    config.cards.some((card) => card.type === "UAV"),
    "large reconnaissance UAV cards are required",
  );
  assert.ok(
    config.cards.some((card) => card.type === "CAS"),
    "strike-aircraft cards are required",
  );
  assert.ok(
    config.cards.some((card) => card.type === "DRONE"),
    "portable reconnaissance drone cards are required",
  );
});
