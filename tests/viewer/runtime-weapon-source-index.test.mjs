import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildRuntimeAttackSourceShareSlug,
  normalizeRuntimeAttackSourceShareSlug,
} from "../../lib/runtime-attack-source-share.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const [catalogBytes, sourceIndexBytes, adapterSource] =
  await Promise.all([
    readFile(
      path.join(
        ROOT,
        "generated",
        "internal",
        "weapon-catalog.json",
      ),
    ),
    readFile(
      path.join(
        ROOT,
        "app",
        "runtime-weapon-source-index.json",
      ),
    ),
    readFile(
      path.join(ROOT, "app", "runtime-probe-weapon-labels.ts"),
      "utf8",
    ),
  ]);
const catalog = JSON.parse(catalogBytes.toString("utf8"));
const sourceIndex = JSON.parse(sourceIndexBytes.toString("utf8"));

test("the compact runtime source index is pinned to the canonical catalog", () => {
  assert.equal(
    sourceIndex.schemaVersion,
    "sigua-runtime-weapon-source-index/v1",
  );
  assert.equal(
    sourceIndex.catalog.schemaVersion,
    catalog.schemaVersion,
  );
  assert.equal(
    sourceIndex.catalog.catalogRevision,
    catalog.catalogRevision,
  );
  assert.equal(sourceIndex.catalog.bytes, catalogBytes.length);
  assert.equal(
    sourceIndex.catalog.sha256,
    createHash("sha256").update(catalogBytes).digest("hex"),
  );
  assert.equal(sourceIndex.counts.bindings, 604);
  assert.equal(sourceIndex.counts.attackSources, 174);
  assert.equal(sourceIndex.counts.attackWeapons, 521);
  assert.equal(sourceIndex.counts.resolvedCatalogVariants, 521);
  assert.equal(
    sourceIndex.counts.attackWeapons,
    sourceIndex.attackSources.reduce(
      (total, source) => total + source.weapons.length,
      0,
    ),
  );
});

test("every runtime weapon resolves to one canonical variant without copying mechanics", () => {
  const variantById = new Map(
    catalog.selector.variants.map((variant) => [
      variant.id,
      variant,
    ]),
  );
  const profileIds = new Set(
    catalog.mechanics.ballisticProfiles.map(({ id }) => id),
  );
  for (const source of sourceIndex.attackSources) {
    for (const weapon of source.weapons) {
      const variant = variantById.get(weapon.weaponVariantId);
      assert.ok(variant, `${source.cardId}/${weapon.gunName}`);
      assert.ok(
        variant.ballisticProfileIds.includes(weapon.ballisticsId),
        `${weapon.weaponVariantId}/${weapon.ballisticsId}`,
      );
      assert.ok(profileIds.has(weapon.ballisticsId));
      assert.ok(
        source.cardIds.includes(weapon.sourceCardId),
        `${source.id}/${weapon.weaponVariantId}`,
      );
      assert.equal("ballisticsModel" in weapon, false);
      assert.equal("directImpactDamage" in weapon, false);
      assert.equal("penetrationMm" in weapon, false);
      assert.equal("radialAsset" in weapon, false);
    }
  }
});

test("runtime attack-source slugs remain unique and stable", () => {
  const slugs = sourceIndex.attackSources.map(
    buildRuntimeAttackSourceShareSlug,
  );
  assert.equal(slugs.length, 174);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(
    slugs.every(
      (slug) =>
        normalizeRuntimeAttackSourceShareSlug(slug) === slug,
    ),
  );
  const lav6 = sourceIndex.attackSources.find(({ cardIds }) =>
    cardIds.includes("caf--lav-6--ifv"),
  );
  assert.ok(lav6);
  assert.equal(buildRuntimeAttackSourceShareSlug(lav6), "caf-lav6");
});

test("the Runtime Viewer adapter joins the source index with canonical mechanics", () => {
  assert.match(
    adapterSource,
    /from "\.\.\/lib\/weapon-catalog\.ts"/u,
  );
  assert.match(
    adapterSource,
    /runtime-weapon-source-index\.json/u,
  );
  assert.match(
    adapterSource,
    /weaponCatalogBallisticProfileForId/u,
  );
  assert.match(
    adapterSource,
    /weaponCatalogRadialAssetForVariant/u,
  );
  assert.match(
    adapterSource,
    /weaponCatalogShippingVariants/u,
  );
  assert.doesNotMatch(
    adapterSource,
    /wiki-infantry-weapon-ballistics-index\.json|infantry-explosive-catalog\.json|runtime-probe-weapon-label-index\.json/u,
  );
});
