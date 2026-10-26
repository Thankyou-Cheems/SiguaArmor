# Deployment

This is the maintained release procedure. Commands live in `package.json` and `tools/deploy/`; other documents link here instead of duplicating the procedure. Change the command and this document in the same commit when release behavior changes.

## Publish Armor

Use a committed, clean product checkout with dependencies installed (`npm ci`). Local requirements are Node 24 LTS (24.21.0 or a compatible later 24.x, also declared in `.node-version`), npm, Python 3 for release tests, tar and SSH/SCP. The configured x86-64 server needs Python 3, Docker Compose v2 and an existing Armor stack with its `.env` and persistent data. Metrics is independently deployed from SiguaAnalytics; Armor no longer builds or packages it.

Both public editions use `output: "export"`: the build writes HTML and RSC navigation files into `dist/client/`, and packaging ships only that public output. Product topology enumerates current faction/vehicle routes and existing route aliases. Caddy serves the exported files, retaining `/squad/` and `/sigua/`, deep links, query strings and browser navigation. HTML and explicit `.rsc` URLs use separate short-lived public cache keys; legacy header/query payload variants remain private to avoid mixing them with HTML. Missing routes return 404 and application POST requests return 405. No page-rendering Node service or standalone bundle is deployed. Development and build still use Node/Vinext; `npm start` is a local framework preview, not the production serving path.

Content administration runs the pinned official Node 24.22.1 Alpine image; the public gateway uses Caddy 2.11.7 Alpine. The template records their verified OCI index digests. Stage these exact images before activation and retain the former images for rollback. A domestic mirror is usable only after checking that its index digest equals the selected official image; a mutable tag is not the candidate identity. The admin HTTP health check uses BusyBox wget with a three-second timeout, a ten-second interval and five retries. Analytics remains independently deployed Go; static Wiki data does not require a Node runtime. See the [Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) and [Caddy patch release](https://github.com/caddyserver/caddy/releases/tag/v2.11.7).

The content administrator's existing Wiki access is limited to `${SIGUA_WIKI_VEHICLE_DATA_ROOT:-/opt/Website/sigua-wiki/data/vehicles}` mounted at `/srv/wiki/data/vehicles` with its existing read/write mode. Preserve that exact source, target and mode when recreating it; do not mount the whole Wiki root or widen permissions. The maintained Compose template includes this mount, so a complete package retains it. Compare the candidate's resolved mount list against the running container before activation without printing environment values.

Host-local runtime maintenance may have added an explicit Compose override. The release tool uses the packaged base `docker-compose.yml`; it does not discover override files. Before using `deploy` or `deploy:rollback`, inspect the running containers' `com.docker.compose.project.config_files` labels and account for every active override. A normal deployment can replace the temporary override only when its complete candidate already contains the same runtime pins and exact Wiki mount; verify the resulting image IDs, health and mounts before retiring that override. For a service-only restart or recovery before that handoff, pass the original base file and the existing override explicitly with `docker compose -f ... -f ...`, retaining `--no-deps` and health waiting. An older `previous/` snapshot may lack the Wiki mount or carry older runtime pins: reconcile those runtime-only differences before applying the ordinary rollback procedure, while preserving its application version and persistent data. Keep host-specific override files and maintenance receipts outside Git.

```powershell
npm run deploy
npm run deploy:status
```

`deploy` runs the shared `verify` command (typecheck, all Armor tests, lint and production build), then packages and uploads one complete compressed candidate. Run focused tests during editing; use `verify` for local acceptance or `deploy` for publication, without immediately repeating the same complete checks beforehand. Tests are discovered by filename, so a new `*.test.mjs` does not need another script entry.

Service packaging copies tracked content-admin source files, excluding local dependencies and caches. It compares the candidate with live files and replaces only changed components. Administration or Caddy changes recreate the affected container; static files use the existing Caddy directory mount. The shared analytics service is external to this Compose stack and is never rebuilt, replaced or restarted by page publication. An explicit host migration transfers the former embedded service before using this release tool. Normal page rollback rejects an embedded analytics service so a stale database cannot silently become active again.

Analytics now records encrypted IPs for 30 days and publishes IP-deduplicated daily counts only; it neither mounts nor loads the city GeoIP database. Existing v1 city archives remain readable for their daily totals. The former MMDB may remain in private server custody while the previous release is a rollback target; it is outside the active container and consumes no analytics process memory. See [ADR 0002](adr/0002-ip-only-dau-analytics.md).

SiguaAnalytics owns the Go collector, SQLite product databases and independent release procedure. The existing Armor public and administrator APIs stay unchanged; `/__analytics/dau` still reaches `sigua-analytics:8081` on the private network. See [shared analytics](shared-analytics-design.md) and [ADR 0004](adr/0004-independent-shared-analytics.md) for current storage, validation and historical migration results. Earlier ADR 0003 measurements describe the already-completed city-database removal, not savings from the new unification.

The default SSH alias and stack path are shown by `npm run deploy -- --help`. Override them with `--host` / `--root` or `SIGUA_DEPLOY_SSH_HOST` / `SIGUA_DEPLOY_ROOT`. Add `--wiki-ref <commit>` when this release depends on a particular published Wiki change; this is an operational note, not a browser pin. `npm run deploy:package` remains available for inspecting a local candidate; `deploy` always builds its own fresh candidate.

The script validates Compose and Caddy before changing live files, keeps a complete previous version, waits for affected services and checks origin routes plus unauthenticated admin access. Static releases also check HTML/RSC content types, a deep link, missing/server-only paths and POST rejection. Only after these checks does the first static release remove the obsolete renderer container. It then checks public landing, navigator and both Armor editions. A failure during the host switch restores the saved version. A failed public/CDN check happens after activation and reports an error; inspect it and use the rollback command if the release is responsible. A service restart can briefly interrupt requests; this is not a zero-downtime deployment.

Finish with the affected real user flow, checking network failures and the console. Frontend, framework or Node-runtime changes require opening a vehicle, loading its model, entering the Narva school driver/gunner view and firing. An isolated admin change needs the admin session/edit flow; an isolated analytics change needs DAU collection and display. Game-data or calculation changes additionally need their relevant regression/asset checks. A CSS literal or source-text assertion is not visual acceptance. Successful publication ends with the exact source committed/pushed and an annotated product tag; normal commits retain their original timestamps.

The first static release, `1051a52` on 2026-09-28, passed the full verification (572 JavaScript tests plus Go tests, typecheck, lint and export), origin/public probes, and online vehicle deep-link refresh, Narva driver/gunner firing and China-edition navigation. Only the public Caddy container restarted; admin and analytics retained their PIDs and stayed healthy. The renderer container was removed after checks. Before/after snapshots put total Armor process PSS at approximately 149/93 MiB; the removed renderer alone had used 95 MiB RSS. These are host snapshots, not browser performance measurements. The previous `b69ed6a` runtime and configuration were retained for rollback.

For dependency changes, compare `npm audit` with actual shipped browser files, backend sources and build-time use, then run the same release checks and user flow. `--omit=dev` alone is insufficient: build dependencies can emit browser code, although Vinext's renderer and RSC server decoder are no longer production processes. Vinext 0.0.50 pins the vulnerable image-size 2.0.2, so the scoped override selects its same-major [patched 2.0.3](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq); remove it when the selected upstream version resolves a patched dependency itself. Sharp is a local visual-audit tool dependency. Do not use `npm audit fix --force`, hide unresolved advisories, or equate a clean audit with complete security validation. Record material exceptions with the affected code change, rather than adding another approval ledger or permanent gate.

## Roll back and recover

```powershell
npm run deploy:rollback
```

Rollback uses the complete `previous/` page version and the same validation/switch procedure. Following the metrics ownership transfer, this must be a page release without an embedded collector; older snapshots need a deliberate host migration and must not be restored against stale metrics data. The displaced version becomes `previous/`, so the command can reverse a rollback. A byte-identical deployment updates source metadata without discarding the existing functional rollback. No patch chain is required.

If the previous release predates static export, rollback restores its `release/international-runtime/` and Compose renderer definition together, recreates the renderer before the public gateway, and verifies its routes. Returning to the static version retires it again. Keep its pinned image available while this rollback remains in `previous/`; the stopped service has no persistent user-data volume. New static packages never carry this legacy directory.

If a process stops during activation, `.previous-pending/` retains the pre-switch version. `deploy:status` shows it; `deploy:rollback` restores it before another deployment is allowed. A failed candidate can remain in `incoming/` for inspection and is replaced by the next attempt. Keep the original error output if recovery itself fails.

## Server directories

At the configured stack root:

| Path | Owner and retention |
| --- | --- |
| `release/`, `services/`, `Caddyfile`, `docker-compose.yml` | Current product components; `release/` and `services/` stay as stable parent directories |
| `release.json` | Current source commit, packaging/activation time and optional Wiki reference; outside the web root |
| `previous/` | One complete previous version; automatically rotated after a successful changed release |
| `incoming/`, `.previous-pending/` | Candidate and temporary recovery copy; removed after success |
| `release/previous-assets/` | Only the immediately preceding build's `assets/` and `china-assets/`, for already-open pages; rotated when client files change |
| `data/`, `.env` | Live content and Armor secrets (old analytics files are migration-only custody); excluded from packaging, switching and rollback |

The static fallback serves only existing public asset routes. It never reads arbitrary historical rollback folders, old HTML or server source. Pages older than the retained build may need a refresh. Preserve the current and previous versions when cleaning; obsolete `candidate-*`, `rollback-*`, retired/failed-release folders and old upload scratch directories may be removed only after checking active mounts/processes and any unique persistent files. Do not prune Docker images as part of directory cleanup.

Local generated candidates and build archives belong in ignored `outputs/`. Routine use overwrites `deployment/`, `deployment.tar.gz` and `deployment-result.json`; unique research evidence or worktree backups belong in private custody rather than accumulating beside release candidates.

## Display asset versions

China display images use content-fingerprinted URLs under the existing immutable asset route. After an approved source image changes, run `npm run china:display-assets` and commit the generated manifest and new fingerprinted copies together. The command copies bytes without resizing or re-encoding, and leaves earlier URLs available for already-open pages. The asset regression checks verify the source, copy and URL digest together. No CDN or security configuration change is required.

## Wiki and runtime content

Shared data and large assets stay in private SiguaWiki; follow its `docs/publishing.md`. Publish named resources first, then their entry documents and matching compression variants. Keep old data paths available when changing a format used by existing clients. Verify the model, material and collision inputs as a compatible set. Only a corresponding product-code change requires an Armor build.

Use the existing `supporters:publish` and `updates:publish` commands for document updates; consult the publisher's help for arguments. Community aliases remain owned by the online content editor. These operations do not rebuild Armor. A deployment never replaces `.env`, content documents, analytics records or Wiki data.

## Outer ingress

Ordinary Armor publication does not modify `/opt/Caddyfile` or restart outer Caddy. If an explicit ingress change replaces that single-file bind mount, recreate the outer container: renaming the host file does not replace the mounted inode. Verify both source and CDN behavior. Wiki missing data must remain `404` with `Cache-Control: no-store`; its `npm run verify:public-cache` checks this separately.

## 2026-10-26: portable Drone exterior publication

The actual page source changed from `915586e7e3e06dfb516487e42adcf307bb16f3b3`
to `bbefc6f4205d1adae275f09f31b3ceac53dc46f5` at 06:07 UTC, tagged
`armor-drone-exterior-2026-10-26`. This is the exact ten-file portable exterior
feature on the installed base. It is retained by merged main `75b7e492`;
main's nine other Narva changes were not part of this deployment.

The normal `npm run deploy` passed 703 tests, typecheck, lint (two existing
warnings) and the 1,440-route static export. Only `release/squad` changed;
the public/admin containers, image IDs, PIDs and exact Wiki vehicle mount stayed
unchanged and healthy. Origin matched 3,394 candidate files. All 12 precise
Drone bindings and 42 existing public resources were checked; no Wiki data or
model payload was published. The installed model refresh count remains
1,937 variants / 4,928 contexts.

Public AFU exterior rotation, zoom, grid/school switching and close/reopen passed;
IMF and WPMC exteriors and ordinary ASLAV's three modes and settled physical
controls also passed. Actual requested JavaScript matched the build. This is
exterior-only: it adds no Drone hit, driver, flight or physics authority. It does
not claim driver-school firing coverage. A generic AFU card binding hint still
needs a separate UI correction despite successful exterior loading; the existing
favicon request returns 404. Other functional requests and page/console checks
passed.

The ordinary page rollback retains the actual `915586e7` release (3,388 public
files, three administrator files, configuration and metadata verified). An
independent private pre-release archive also preserves its older predecessor;
its SHA256 is `53514795f257442cbe1da27a288a525c1c53d0a59d04937c26f59e4795b2d6d6`.
No live rollback was performed. Roll back Armor pages separately from the
already installed Wiki model updates. Detailed runtime evidence is held in the
private Research installation receipt; this documentation commit is not a new
page deployment. No Armor Actions workflow is configured for this release.
