# Validation modes and gate scheduling

Status: Accepted; owner: maintainers
Environment: `SIGUA_VALIDATION_MODE=dev|strict|release`
This is the only document that schedules project validation. Domain contracts define
behavior and evidence; they do not add implicit per-edit gates.

## Modes

Unset means `dev`.

| Mode | Use it for | Scope |
| --- | --- | --- |
| `dev` | ordinary edits | smallest check that can expose the changed behavior |
| `strict` | integration, broad refactor, explicit pre-merge review | typecheck, affected suites, touched-source lint, scoped browser check |
| `release` | an actual deployable candidate | affected gates, selected production build, candidate/live QA |

Modes are not cumulative bundles. `release` validates changed inputs and reuses valid
receipts for unchanged inputs; it does not run every historical fleet.

## Dev

- Documentation-only work normally needs only diff review/`git diff --check`.
- Run one focused test, typecheck target, local repro, or browser interaction. Widen
  only to the nearest owning suite after a failure.
- A dev server is enough for rendering; production builds are not inner-loop gates.
- Do not start Editor, rebuild release assets, hash all artifacts, or run fleet tests as
  generic confidence checks.

## Strict

Use typecheck, affected contract/tool/viewer suites, touched-source lint,
`git diff --check`, and one affected browser path plus one control when rendering
changed. Full fleets and release-asset generation remain explicit audits.

## Release

Set `SIGUA_VALIDATION_MODE=release`, then follow
`docs/sops/lightweight-public-release.md`. Choose `build:quick` or `build:full` from
actual invalidated inputs. A release still does not rerun unrelated extraction fleets.
Use `build:full` only when source 3D/texture/font/hit bytes, their
generator/compression/toolchain, or a required sealed artifact actually changed.
Metadata/index updates may regenerate their own derivatives while reusing unchanged
blobs. A branch, commit, merge, worktree, or missing local cache copy is not itself an
invalidation.

## Invalidation and receipt reuse

A receipt is reusable across tasks/worktrees while its named inputs remain unchanged.

| Changed input | Invalidate |
| --- | --- |
| component/style/browser logic | affected app/viewer test and route |
| shared API or schema | typecheck and consumers |
| catalog/JSON metadata | owning generator/contract and consuming page |
| one vehicle descriptor/source | that vehicle and derivatives it changes |
| generator/compression/toolchain | outputs of that generator |
| Editor build/extraction schema | affected evidence; resume valid shards |
| no named receipt input | nothing in that receipt |

Do not use timestamps, worktree paths, or commit existence as invalidation signals.

## Hash and assertion policy

- Hash content-addressed blobs, immutable evidence, release manifests, uploads, and
  other trust-boundary artifacts.
- Store current hashes in generated receipts/manifests, not prose or ordinary tests.
- Tests assert semantics, identity, input-derived counts, and compatibility. Do not pin
  aggregate hashes merely to force acknowledgement of routine data changes.
- Consumers may trust one verified artifact chain; they need not rehash unchanged bytes
  at every phase.
- Never weaken provenance, destructive-operation, security, or deployment checks.

## Cache and worktree policy

- Research-owned DDC, extraction, and raw compression caches remain outside this
  product repository.
- Release validation reads only this checkout's restored `public/` or prepared
  `.release/public` closure. It does not discover assets in former sibling repositories.
- Normal development serves the current worktree `public/` directly. Sealed public
  closures and `SIGUA_RELEASE_PUBLIC_DIR` are release-only inputs.
- A fresh worktree installs only missing compatible dependencies; it does not rebuild 3D.
- Preserve checkpoints/current caches and resume only invalidated targets/shards.
- Keep failed/partial evidence explicit; never promote it through a fallback model.

## Document classes

- **Contract:** behavior/data shape; `MUST` applies to implementation, not scheduling.
- **Extraction SOP:** active only during an intentional extraction.
- **Evidence snapshot/retrospective:** historical facts; commands/hashes are not gates.
- **Release SOP:** active only in `release`.

If another document appears broader, this scheduling spec wins unless it protects an
explicit provenance, security, destructive-operation, or deployment trust boundary.
