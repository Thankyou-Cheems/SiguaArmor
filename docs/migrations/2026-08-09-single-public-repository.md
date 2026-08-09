# Single public repository consolidation

## Decision

`Thankyou-Cheems/SiguaArmor` is the only continuing SiguaArmor product repository. The former private maintainer repository is a migration source and temporary recovery archive, not a second product authority.

The consolidation starts from public commit `8cdf00b7c51fdb8ab2f989b819b5d6f90b89b101` and imports a sanitized product snapshot from private commit `7005b4232cb22b581a390936559a3b06e17a2c1f`. The private and public repositories have unrelated histories, so the private history is deliberately not merged.

## Migrated

- The latest product application and browser behavior used by the live site.
- The SiguaD.icu portal template and public deployment configuration.
- Product build, validation, delta, release, and deployment tools.
- Final configuration and generated snapshots still required by the current application.
- Product-facing tests and operating documentation.
- The exact browser-ready `public/assets` and `public/images` closure as the one-time GitHub Release bootstrap pinned by `public-assets.json`.

The generated data copied here is transitional. SiguaWiki is the continuing authority for reusable final data; the next refactor replaces these local snapshots with Wiki HTTPS reads.

## Not migrated

| Private source family | Continuing owner | Reason |
| --- | --- | --- |
| `authoring-vault/` | SiguaResearch | Research process and staging records |
| `data/vehicles/` | SiguaResearch / SiguaWiki | Raw records stay in Research; accepted final vehicles live in Wiki |
| `private/` | SiguaResearch | Evidence and controlled runtime material |
| `generated/runtime-probe/capture/` and research audits | SiguaResearch | Evidence, not a product dependency |
| `tools/runtime-probe/` | SiguaResearch | Controlled-runtime research tooling |
| `tools/editor/`, `tools/squad-editor/`, `tools/static-hit-extract/` | SiguaResearch | Editor/SDK extraction and static research tooling |
| Raw or uncompressed game assets and local caches | SiguaResearch ignored custody | Not suitable for Git or the public web repository |
| Deployment credentials, API tokens, review credentials, backups, and live state | External secret/backup custody | Operational secrets are neither product source nor Research data |

The SiguaResearch custody snapshot is locked to private commit `2e08b1b25dcfcde2f6a3c1e8e9ddbf7a9e3f6602`. No tracked changes occurred in the excluded research path families between that lock and the imported private commit.

## Release contract change

Release deltas now carry one `sourceCommit`. The former `publicCommit` plus
`privateCommit` pair is removed. GitHub stores one migration bootstrap for clean
developer/CI restoration; it is not the production origin or CDN. Routine releases
compare against the live manifest and upload only new content-addressed bytes to the
project-owned server. Git retains only the small bootstrap lock and restoration tool.

## Retirement gate

Do not delete the former private repository or its local checkout yet. It can be archived read-only after all of the following are true:

1. this consolidation is merged into public `main`;
2. the pinned public asset archive is independently downloadable and verifies;
3. a clean public clone restores assets and passes the production build;
4. a later production deployment succeeds from the single public repository; and
5. any remaining Research-owned bytes are confirmed in SiguaResearch custody.

No software or content license is introduced by this migration. Public visibility and approved website distribution are separate from relicensing third-party game material.
