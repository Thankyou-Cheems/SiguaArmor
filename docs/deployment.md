# Deployment

This is the maintained release procedure. Commands live in `package.json` and `tools/deploy/`; other documents link here instead of duplicating the procedure. Change the command and this document in the same commit when release behavior changes.

## Publish Armor

Use a committed, clean product checkout with dependencies installed (`npm ci`). Local requirements are Node 24 LTS (24.21.0 or a compatible later 24.x, also declared in `.node-version`), npm, Go 1.25 or newer, Python 3 for release tests, tar and SSH/SCP. The configured x86-64 server needs Python 3, Docker Compose v2 and an existing Armor stack with its `.env` and persistent data. The release packager cross-compiles the analytics service to a static Linux/amd64 executable; the server builds its scratch image from that packaged executable without pulling a Go builder image.

Both public editions use `output: "export"`: the build writes HTML and RSC navigation files into `dist/client/`, and packaging ships only that public output. Product topology enumerates current faction/vehicle routes and existing route aliases. Caddy serves the exported files, retaining `/squad/` and `/sigua/`, deep links, query strings and browser navigation. HTML and explicit `.rsc` URLs use separate short-lived public cache keys; legacy header/query payload variants remain private to avoid mixing them with HTML. Missing routes return 404 and application POST requests return 405. No page-rendering Node service or standalone bundle is deployed. Development and build still use Node/Vinext; `npm start` is a local framework preview, not the production serving path.

Content administration runs the pinned Node 24.21.0 Alpine image through Tencent's registry mirror. Its OCI index digest is checked against the Docker Official Image before changing the template; retain the former image for rollback. Its HTTP health check uses the image's existing BusyBox wget with a three-second timeout, a ten-second interval and five retries. Analytics remains Go; Caddy and static Wiki data do not require a Node runtime. Stage updated runtime images through the domestic mirror before activation; do not assume a mutable image tag is the candidate identity.

```powershell
npm run deploy
npm run deploy:status
```

`deploy` runs the shared `verify` command (typecheck, all tests including Go analytics, lint and production build), then packages and uploads one complete compressed candidate. Run focused tests during editing; use `verify` for local acceptance or `deploy` for publication, without immediately repeating the same complete checks beforehand. Tests are discovered by filename, so a new `*.test.mjs` does not need another script entry.

Service packaging copies tracked source files, excluding local installed dependencies and caches. It compares candidate components with the actual server files and replaces only changed components. Static files use the existing Caddy directory mount; administration, analytics or Caddy changes recreate the affected container. Analytics source/configuration changes rebuild its image. Its Go binary omits repository-wide VCS stamping; `release.json` retains the product commit, so an unrelated product commit alone does not change the analytics executable. Compose configuration changes also recreate affected services. The release switcher supports the explicit retirement/restoration of the former stateless `sigua-international` renderer; other service additions/removals still need a separate host migration.

Analytics now records encrypted IPs for 30 days and publishes IP-deduplicated daily counts only; it neither mounts nor loads the city GeoIP database. Existing v1 city archives remain readable for their daily totals. The former MMDB may remain in private server custody while the previous release is a rollback target; it is outside the active container and consumes no analytics process memory. See [ADR 0002](adr/0002-ip-only-dau-analytics.md).

Analytics runs as a dependency-free Go executable in a scratch image while preserving the existing endpoint and record formats. In an isolated server candidate with a copy of all 74 current analytics files, its idle process RSS was 8.1 MiB and its RSS after 200 distinct IPs from 16 concurrent clients was 10.9 MiB, compared with roughly 160–165 MiB for the then-current production Node/GeoIP process. All 73 completed days matched the live daily totals. This is controlled candidate evidence, not a post-deployment measurement. See [ADR 0003](adr/0003-lightweight-analytics-runtime.md).

The default SSH alias and stack path are shown by `npm run deploy -- --help`. Override them with `--host` / `--root` or `SIGUA_DEPLOY_SSH_HOST` / `SIGUA_DEPLOY_ROOT`. Add `--wiki-ref <commit>` when this release depends on a particular published Wiki change; this is an operational note, not a browser pin. `npm run deploy:package` remains available for inspecting a local candidate; `deploy` always builds its own fresh candidate.

The script validates Compose and Caddy before changing live files, keeps a complete previous version, waits for affected services and checks origin routes plus unauthenticated admin access. Static releases also check HTML/RSC content types, a deep link, missing/server-only paths and POST rejection. Only after these checks does the first static release remove the obsolete renderer container. It then checks public landing, navigator and both Armor editions. A failure during the host switch restores the saved version. A failed public/CDN check happens after activation and reports an error; inspect it and use the rollback command if the release is responsible. A service restart can briefly interrupt requests; this is not a zero-downtime deployment.

Finish with the affected real user flow, checking network failures and the console. Frontend, framework or Node-runtime changes require opening a vehicle, loading its model, entering the Narva school driver/gunner view and firing. An isolated admin change needs the admin session/edit flow; an isolated analytics change needs DAU collection and display. Game-data or calculation changes additionally need their relevant regression/asset checks. A CSS literal or source-text assertion is not visual acceptance. Successful publication ends with the exact source committed/pushed and an annotated product tag; normal commits retain their original timestamps.

For dependency changes, compare `npm audit` with actual shipped browser files, backend sources and build-time use, then run the same release checks and user flow. `--omit=dev` alone is insufficient: build dependencies can emit browser code, although Vinext's renderer and RSC server decoder are no longer production processes. Vinext 0.0.50 pins the vulnerable image-size 2.0.2, so the scoped override selects its same-major [patched 2.0.3](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq); remove it when the selected upstream version resolves a patched dependency itself. Sharp is a local visual-audit tool dependency. Do not use `npm audit fix --force`, hide unresolved advisories, or equate a clean audit with complete security validation. Record material exceptions with the affected code change, rather than adding another approval ledger or permanent gate.

## Roll back and recover

```powershell
npm run deploy:rollback
```

Rollback uses the complete `previous/` version and the same validation/switch procedure. The displaced version becomes `previous/`, so the command can reverse a rollback. A byte-identical deployment updates source metadata without discarding the existing functional rollback. No patch chain is required.

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
| `data/`, `.env` | Live content, analytics, retained rollback-only GeoIP file and secrets; excluded from packaging, switching and rollback |

The static fallback serves only existing public asset routes. It never reads arbitrary historical rollback folders, old HTML or server source. Pages older than the retained build may need a refresh. Preserve the current and previous versions when cleaning; obsolete `candidate-*`, `rollback-*`, retired/failed-release folders and old upload scratch directories may be removed only after checking active mounts/processes and any unique persistent files. Do not prune Docker images as part of directory cleanup.

Local generated candidates and build archives belong in ignored `outputs/`. Routine use overwrites `deployment/`, `deployment.tar.gz` and `deployment-result.json`; unique research evidence or worktree backups belong in private custody rather than accumulating beside release candidates.

## Wiki and runtime content

Shared data and large assets stay in private SiguaWiki; follow its `docs/publishing.md`. Publish named resources first, then their entry documents and matching compression variants. Keep old data paths available when changing a format used by existing clients. Verify the model, material and collision inputs as a compatible set. Only a corresponding product-code change requires an Armor build.

Use the existing `supporters:publish` and `updates:publish` commands for document updates; consult the publisher's help for arguments. Community aliases remain owned by the online content editor. These operations do not rebuild Armor. A deployment never replaces `.env`, content documents, analytics records or Wiki data.

## Outer ingress

Ordinary Armor publication does not modify `/opt/Caddyfile` or restart outer Caddy. If an explicit ingress change replaces that single-file bind mount, recreate the outer container: renaming the host file does not replace the mounted inode. Verify both source and CDN behavior. Wiki missing data must remain `404` with `Cache-Control: no-store`; its `npm run verify:public-cache` checks this separately.
