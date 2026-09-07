import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { editorDamageCardEffect } from "../../lib/editor-damage-card-effects.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("damage cards distinguish degraded and destroyed component states", () => {
  assert.equal(editorDamageCardEffect("track", 499, 500), null);
  assert.deepEqual(editorDamageCardEffect("track", 500, 500), {
    id: "track-destroyed",
    label: "断履",
  });
  assert.deepEqual(editorDamageCardEffect("engine", 600, 600), {
    id: "engine-destroyed",
    label: "发动机摧毁",
  });
  assert.deepEqual(editorDamageCardEffect("ammo-rack", 2000, 2000), {
    id: "ammo-rack-destroyed",
    label: "弹药架摧毁",
  });
  assert.equal(editorDamageCardEffect("seat", 499, 1000), null);
  assert.deepEqual(editorDamageCardEffect("seat", 500, 1000), {
    id: "stabilization-lost",
    label: "炮塔失稳",
  });
  assert.deepEqual(editorDamageCardEffect("seat", 1000, 1000), {
    id: "turret-locked",
    label: "锁死",
  });
  assert.equal(editorDamageCardEffect("seat", 1000, 0), null);
  assert.equal(editorDamageCardEffect("hull", 2000, 1000), null);
});

test("component effects stay centralized while causal settlements remount for replay", async () => {
  const [source, styles, settlementSource] = await Promise.all([
    readFile(path.join(root, "app", "RuntimeVehicleViewer.tsx"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
    readFile(path.join(root, "lib", "editor-damage-settlement.ts"), "utf8"),
  ]);

  assert.match(
    source,
    /setDamageAnimationRevision\(\(revision\) => revision \+ 1\)/u,
  );
  assert.match(
    source,
    /const damageAnimationKey = `\$\{activeShotId\}:\$\{damageAnimationRevision\}`/u,
  );
  assert.match(
    source,
    /animationKey=\{`\$\{damageAnimationKey\}:layer:\$\{index\}`\}/u,
  );
  assert.match(
    settlementSource,
    /function summarizeEditorDamageSettlements\([\s\S]*?effectiveDamage:\s*target\.effectiveDamage/u,
  );
  assert.match(
    source,
    /outcome\.effect \? <em>\{outcome\.effect\.label\}<\/em> : null/u,
  );
  assert.match(source, /data-damage-effect=\{outcome\.effect\?\.id\}/u);
  assert.match(
    source,
    /const remainingHealth = outcome\.maxHealth === null[\s\S]*?Math\.max\(0, outcome\.maxHealth - outcome\.poolDamage\)[\s\S]*?组件剩余血量/u,
  );
  assert.match(source, /车体剩余血量[\s\S]*?hullRemainingHealth[\s\S]*?总血量/u);
  assert.match(
    source,
    /className="viewer-damage-effect"[\s\S]*?<i \/>[\s\S]*?<i \/>[\s\S]*?<i \/>/u,
  );
  assert.match(
    styles,
    /\.viewer-causal-spine__settlement\[data-damage-kind="radial"\]\s*\{[^}]*--spine-accent:\s*var\(--explosion-type-color, var\(--analysis-damage\)\);/u,
  );
  assert.match(
    styles,
    /\.viewer-shot-outcome-summary__targets > li\[data-damage-effect\][\s\S]*?animation:\s*viewer-damage-card-impact/u,
  );
  assert.match(styles, /@keyframes viewer-damage-sweep/u);
  assert.match(styles, /@keyframes viewer-track-shear/u);
  assert.match(styles, /@keyframes viewer-wheel-wobble/u);
  assert.match(styles, /@keyframes viewer-engine-breathe/u);
  assert.match(styles, /@keyframes viewer-stabilizer-drift/u);
  assert.match(styles, /@keyframes viewer-turret-lock-frame/u);
  assert.doesNotMatch(source, /viewer-damage-target|viewer-damage-outcome/u);
});
