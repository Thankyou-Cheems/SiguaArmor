import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWeaponCatalogIdentityResolver } from "../lib/weapon-catalog-identity.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CATALOG_PATH = path.join(
  ROOT,
  "generated",
  "internal",
  "weapon-catalog.json",
);
const EVIDENCE_PATH = path.resolve(
  process.env.SIGUA_RUNTIME_WEAPON_EVIDENCE_PATH ??
    path.join(
      ROOT,
      "outputs",
      "weapon-catalog-evidence",
      "runtime-weapon-labels.json",
    ),
);
const OUTPUT_PATH = path.join(
  ROOT,
  "app",
  "runtime-weapon-source-index.json",
);
const checkOnly = process.argv.includes("--check");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--check");
if (unknownArguments.length > 0) {
  throw new Error(
    `Runtime weapon source index: unsupported arguments ${unknownArguments.join(", ")}`,
  );
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(`Runtime weapon source index: ${message}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function withoutKeys(record, keys) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.has(key)),
  );
}
function validateOutput(output, outputBytes, catalog, catalogBytes) {
  invariant(
    output.schemaVersion ===
      "sigua-runtime-weapon-source-index/v1",
    `output schema is ${output.schemaVersion}`,
  );
  invariant(
    output.catalog.schemaVersion === catalog.schemaVersion &&
      output.catalog.catalogRevision ===
        catalog.catalogRevision &&
      output.catalog.bytes === catalogBytes.length &&
      output.catalog.sha256 === sha256(catalogBytes),
    "output catalog reference is stale",
  );
  const variantIds = new Set(
    catalog.selector.variants.map(({ id }) => id),
  );
  const weapons = output.attackSources.flatMap(
    ({ weapons: sourceWeapons }) => sourceWeapons,
  );
  invariant(
    output.counts.attackSources ===
      output.attackSources.length &&
      output.counts.attackWeapons === weapons.length &&
      output.counts.resolvedCatalogVariants ===
        weapons.filter(({ weaponVariantId }) =>
          variantIds.has(weaponVariantId),
        ).length &&
      output.counts.resolvedCatalogVariants ===
        output.counts.attackWeapons,
    "output count or variant closure drifted",
  );
  const serialized = outputBytes.toString("utf8");
  for (const forbidden of [
    '"ballisticsModel"',
    '"maxDamage"',
    '"armorPenetrationDepthMm"',
    '"impactDamage"',
    '"explosiveBaseDamage"',
  ]) {
    invariant(
      !serialized.includes(forbidden),
      `output repeats mechanics field ${forbidden}`,
    );
  }
}

async function main() {
  const catalogBytes = await readFile(CATALOG_PATH);
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  invariant(
    catalog.schemaVersion === "sigua-weapon-catalog/v2" &&
      catalog.audit.referenceClosure === true,
    "canonical catalog is invalid",
  );

  if (checkOnly) {
    const outputBytes = await readFile(OUTPUT_PATH);
    const output = JSON.parse(outputBytes.toString("utf8"));
    validateOutput(
      output,
      outputBytes,
      catalog,
      catalogBytes,
    );
    process.stdout.write(
      `${JSON.stringify({
        status: "current",
        outputPath: path
          .relative(ROOT, OUTPUT_PATH)
          .split(path.sep)
          .join("/"),
        bytes: outputBytes.length,
        sha256: sha256(outputBytes),
        counts: output.counts,
      })}\n`,
    );
    return;
  }

  const sourceBytes = await readFile(EVIDENCE_PATH);
  const source = JSON.parse(sourceBytes.toString("utf8"));
  invariant(
    source.schemaVersion ===
      "runtime-hit-weapon-label-index/v4",
    `evidence schema is ${source.schemaVersion}`,
  );

  const identityResolver =
    createWeaponCatalogIdentityResolver(catalog);
  const unmatched = [];
  const attackSources = source.attackSources.map(
    (attackSource) => ({
      ...attackSource,
      weapons: attackSource.weapons.map((weapon) => {
        const variant =
          identityResolver.variantForRuntimeWeapon(weapon);
        if (!variant) {
          unmatched.push({
            cardId: weapon.sourceCardId,
            rawName: weapon.sourceRawName,
            ballisticsId: weapon.ballisticsId,
            gunName: weapon.gunName,
            projectileName: weapon.projectileName,
          });
        }
        return {
          ...withoutKeys(
            weapon,
            new Set([
              "ballisticsModel",
              "ballisticsSource",
            ]),
          ),
          weaponVariantId: variant?.id ?? null,
          evidence: {
            kind: weapon.ballisticsSource.kind,
            runtimeRecordSha256:
              weapon.ballisticsSource.runtimeRecordSha256 ??
              null,
            runtimeWeaponIndex:
              weapon.ballisticsSource.runtimeWeaponIndex ??
              null,
            catalogFingerprintSha256:
              weapon.ballisticsSource
                .catalogFingerprintSha256,
          },
        };
      }),
    }),
  );

  invariant(
    unmatched.length === 0,
    `catalog does not resolve ${unmatched.length} runtime weapons: ${JSON.stringify(unmatched.slice(0, 8))}`,
  );

  const output = {
    schemaVersion: "sigua-runtime-weapon-source-index/v1",
    catalog: {
      schemaVersion: catalog.schemaVersion,
      catalogRevision: catalog.catalogRevision,
      bytes: catalogBytes.length,
      sha256: sha256(catalogBytes),
    },
    sourceEvidence: {
      schemaVersion: source.schemaVersion,
      bytes: sourceBytes.length,
      sha256: sha256(sourceBytes),
    },
    counts: {
      bindings: source.bindings.length,
      attackSources: attackSources.length,
      attackWeapons: attackSources.reduce(
        (total, attackSource) =>
          total + attackSource.weapons.length,
        0,
      ),
      resolvedCatalogVariants: attackSources.reduce(
        (total, attackSource) =>
          total +
          attackSource.weapons.filter(
            ({ weaponVariantId }) =>
              weaponVariantId !== null,
          ).length,
        0,
      ),
    },
    bindings: source.bindings,
    attackSources,
  };
  const outputBytes = Buffer.from(
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  validateOutput(
    output,
    outputBytes,
    catalog,
    catalogBytes,
  );
  await writeFile(OUTPUT_PATH, outputBytes);
  process.stdout.write(
    `${JSON.stringify({
      status: "written",
      outputPath: path
        .relative(ROOT, OUTPUT_PATH)
        .split(path.sep)
        .join("/"),
      bytes: outputBytes.length,
      sha256: sha256(outputBytes),
      counts: output.counts,
    })}\n`,
  );
}

await main();
