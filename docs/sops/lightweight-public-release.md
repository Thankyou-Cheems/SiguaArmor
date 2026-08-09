# Lightweight public release SOP

This SOP is active only for a real deployment candidate:

```powershell
$env:SIGUA_VALIDATION_MODE = 'release'
```

Normal development and integration use
`docs/specs/quality-gate-scheduling.md`. A source commit or push does not require a
release.

## 1. Release principles

- `build:quick` reuses an existing sealed closure; `build`/`build:full` rebuilds the
  product around the pinned public asset release.
- `release:delta` transports a verified target closure and activates it atomically.
- Reuse unchanged content-addressed 3D, texture, font, hit-runtime, and compressed blobs.
- Serve shared vehicle runtime assets from the SiguaWiki origin/CDN and product-specific
  assets from the Armor origin/CDN. The GitHub Release in
  `public-assets.json` is a low-frequency developer/CI bootstrap and must not be
  hotlinked by the website or replaced with monthly full snapshots.
- A new worktree or missing local cache copy is not asset invalidation. Recover a
  compatible verified cache or sealed closure before considering regeneration.
- Hash at artifact and trust boundaries. Do not repeatedly hash the same unchanged 3D
  corpus in each build, packaging, and handoff step when its receipt remains valid.

## 2. Choose the build lane

Use `npm run build:quick` for:

- application components, interaction, styles, and browser-only `lib/` behavior;
- JSON/catalog/index changes that do not change referenced binary bytes;
- focused tests, documentation, and display formatting;
- visual selection or suppression changes that only regenerate descriptors/indexes and
  continue to reference existing verified blobs.

Use `npm run build` or `npm run build:full` when the complete product closure must be
rebuilt from the pinned public asset release:

- the checkout is fresh or its sealed closure is absent;
- the pinned public asset release changed;
- the dependency lock or product build toolchain changed; or
- the sealed public closure fails verification.

New shared 3D, texture, or hit-runtime bytes must first complete their Research-to-Wiki
approval route. Publish only new content-hashed browser-ready files to SiguaWiki; do not
append shared runtime bytes to `public-assets.json`. Product-specific card-impression or
faction-art bytes continue through the Armor origin/CDN. The original GitHub bootstrap
remains frozen. Do not regenerate assets from raw Research inputs here or publish another
full GitHub snapshot.

Do not choose `build:full` merely because public data changed, an index was regenerated,
a branch was merged, or the release checkout is new.

## 3. Prepare the candidate

Work in a clean checkout of this public repository. Confirm:

- repository root, branch, upstream, and intended source commit;
- no competing build/deploy process;
- unrelated dirty work will not enter the candidate;
- a globally unique release ID;
- the current sealed closure or shared cache receipt is valid for unchanged inputs.

Do not reset, clean, stash, terminate another session, or overwrite unrelated files.
Run `npm run assets:restore` to recover the exact browser-ready asset closure from the
one-time GitHub Release bootstrap pinned by `public-assets.json`. Raw Research inputs
are not release dependencies here. Routine production changes go through
`release:delta`, whose archive contains only bytes absent from the live baseline.
If an active development server holds `.release/public`, set
`SIGUA_RELEASE_PUBLIC_DIR` to a task-specific `.release/<candidate>/public` and
`SIGUA_REUSE_SEALED_PUBLIC_DIR` to the existing verified closure. This keeps the
candidate atomic without terminating another session's preview.
On Windows hosts that cannot rename a completed large directory, the same task-specific
target may additionally set `SIGUA_DIRECT_ISOLATED_RELEASE_TARGET=1`. It is forbidden
for the shared `.release/public`; only the isolated candidate is written in place, and
its manifest remains the completion marker.

Run the selected build and affected gates:

```powershell
npm run build:quick # or: npm run build:full
npm run test:public-release
```

Add only suites whose invalidation set intersects the release. For example, a changed
hit-runtime index may need its focused fleet/semantic audit; an unchanged hit fleet may
reuse its existing receipt. Explicit full/fleet commands are audits, not a mandatory
release prelude.

Rendered changes get local browser QA on the affected route plus one representative
control. Do not cold-load every vehicle unless the release actually replaces the full
visual fleet.

## 4. Fetch the live baseline and create the delta

Fetch the combined and `/squad/` manifests with a unique cache-busting query. Record raw
response SHA-256, entry count, and byte total. HTTP 200 alone is not a baseline identity.

```powershell
./tools/deploy/fetch-live-release-manifest.ps1 `
  -Uri 'https://armor.siguad.icu/release-manifest.json' `
  -OutputPath 'outputs/live-release-manifest-before-<release-id>.json' `
  -CacheBust '<release-id>'

./tools/deploy/fetch-live-release-manifest.ps1 `
  -Uri 'https://armor.siguad.icu/squad/release-manifest.json' `
  -OutputPath 'outputs/live-squad-release-manifest-before-<release-id>.json' `
  -CacheBust '<release-id>' `
  -SchemaVersion 'sigua-cdn-release/v1'
```

Push the intended source commit, then generate the delta from its full commit ID:

```powershell
npm run release:delta -- `
  --base-manifest 'outputs/live-release-manifest-before-<release-id>.json' `
  --release-id '<release-id>' `
  --source-commit '<current-public-repository-40-char-sha>'
```

When a release also replaces an existing root or China-site file that is outside the
generated `/squad/` closure, pass `--overlay-manifest <path>`. The manifest schema is
`sigua-unified-public-overlay/v1`; each entry supplies the release-relative `path` and a
`source` path resolved from the overlay manifest. Overlays fail closed for missing live
replacement targets. A deliberately new non-generated path must set `"create": true`;
creation fails closed if that path already exists. Overlays cannot replace `/squad/`, the
international server runtime, or the combined release manifest.

Refetch the live baseline immediately before upload. If it changed, discard the delta and
regenerate against the new baseline.

Verify the generated metadata, target manifest, archive, and helper scripts once. Upload
those exact files and compare their remote hashes. The target manifest covers the whole
release; the archive contains only bytes absent from the baseline.

Linux helper scripts must pass `sh -n` and contain no CR bytes.

## 5. Candidate preflight and activation

1. Apply the delta in an isolated candidate directory, never directly in `release/`.
2. Verify the candidate target manifest, entry count, byte total, and source commit.
3. Start isolated candidate services and wait for final health.
4. Probe the changed routes and representative static/runtime assets.
5. Verify unauthenticated admin access returns `401`.
6. Atomically move current release to rollback and candidate to release.
7. Wait for production health and verify cache-busted public manifests.

Successful activation reports:

```text
ACTIVATION_STATUS=success
TARGET_MANIFEST=<expected-target-sha256>
CANDIDATE_ADMIN_STATUS=401
ADMIN_UNAUTHENTICATED_STATUS=401
```

On failure, preserve the candidate evidence and restore rollback. Do not weaken a
manifest, provenance, health, or authorization check.

## 6. Live QA

Verify:

- remote release manifest equals the target;
- cache-busted combined and `/squad/` manifests match local metadata;
- changed routes and content-addressed assets return expected responses;
- production containers are healthy;
- the affected user path works in a real browser;
- the console has no new errors or warnings attributable to this release.

For a shared international/China policy change, open one affected descriptor in each
edition. Otherwise test only the changed edition and a representative control.

## 7. Retention and cleanup

Keep:

- active release;
- latest verified rollback;
- current incoming receipt/package;
- base/target manifests and deployment receipt.

After live manifests, probes, browser QA, and container health pass, remove older exact
rollback/candidate/incoming paths. Never use broad `docker system prune`, guessed paths,
or recursive deletion at a workspace root. Inspect junction/reparse targets before local
cleanup and remove links as links.

Large local caches are not disposable merely because their worktree is. Preserve or move
the newest compatible dependency, DDC, extraction, compression, and release-blob caches
before removing a worktree.

## 8. Common failure boundaries

| Symptom | Correct response |
| --- | --- |
| CDN returns an old manifest | use a unique query and hash raw response bytes |
| candidate helper has CRLF | regenerate/canonicalize, run `sh -n`, then upload a new exact file |
| one visual/index changed | rebuild that derivative; do not recompress the unchanged fleet |
| a new worktree lacks `.release/public` | restore a verified sealed closure/cache; do not assume full rebuild |
| a focused test fails | fix or report that boundary; do not launch unrelated exhaustive suites |
| browser reveals a layout/3D issue | fix and retest the affected route plus a control |
| candidate/provenance/hash check fails | stop and preserve evidence; never edit receipts to force success |
