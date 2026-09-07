# Deployment

This is the maintained release procedure. Commands live in `package.json` and `tools/deploy/`; other documents link here instead of duplicating the procedure. Change the command and this document in the same commit when release behavior changes.

## Publish Armor

Use a committed, clean product checkout with dependencies installed (`npm ci`). Local requirements are Node/npm, Python 3 for release tests, tar and SSH/SCP. The configured server needs Python 3, Docker Compose v2 and an existing Armor stack with its `.env` and persistent data.

```powershell
npm run deploy
npm run deploy:status
```

`deploy` runs typecheck, all tests, lint, production build and packaging, then uploads one complete compressed candidate. Service packaging copies tracked source files, excluding local installed dependencies and caches. It compares candidate components with the actual server files and replaces only changed components. Static files use the existing Caddy directory mount; changes to the Node runtime, administration service, analytics service or Caddy configuration recreate the affected container. Analytics source/configuration changes rebuild its image. Compose service configuration changes also recreate affected services. Service additions/removals need a separate host migration.

The default SSH alias and stack path are shown by `npm run deploy -- --help`. Override them with `--host` / `--root` or `SIGUA_DEPLOY_SSH_HOST` / `SIGUA_DEPLOY_ROOT`. Add `--wiki-ref <commit>` when this release depends on a particular published Wiki change; this is an operational note, not a browser pin. `npm run deploy:package` remains available for inspecting a local candidate; `deploy` always builds its own fresh candidate.

The script validates Compose and Caddy before changing live files, keeps a complete previous version, waits for affected services and checks origin routes plus unauthenticated admin access. It then checks public landing, navigator and both Armor editions. A failure during the host switch restores the saved version. A failed public/CDN check happens after activation and reports an error; inspect it and use the rollback command if the release is responsible. A service restart can briefly interrupt requests; this is not a zero-downtime deployment.

Finish with a real browser: open a vehicle, load its model, enter the Narva school driver/gunner view and fire, and check network failures and the console. When game data or calculation rules change, also run the relevant regression/asset checks. Successful publication ends with the exact source committed/pushed and an annotated product tag; normal commits retain their original timestamps.

## Roll back and recover

```powershell
npm run deploy:rollback
```

Rollback uses the complete `previous/` version and the same validation/switch procedure. The displaced version becomes `previous/`, so the command can reverse a rollback. A byte-identical deployment updates source metadata without discarding the existing functional rollback. No patch chain is required.

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
| `data/`, `.env` | Live content, analytics, GeoIP and secrets; excluded from packaging, switching and rollback |

The static fallback serves only existing public asset routes. It never reads arbitrary historical rollback folders, old HTML or server source. Pages older than the retained build may need a refresh. Preserve the current and previous versions when cleaning; obsolete `candidate-*`, `rollback-*`, retired/failed-release folders and old upload scratch directories may be removed only after checking active mounts/processes and any unique persistent files. Do not prune Docker images as part of directory cleanup.

Local generated candidates and build archives belong in ignored `outputs/`. Routine use overwrites `deployment/`, `deployment.tar.gz` and `deployment-result.json`; unique research evidence or worktree backups belong in private custody rather than accumulating beside release candidates.

## Wiki and runtime content

Shared data and large assets stay in private SiguaWiki; follow its `docs/publishing.md`. Publish named resources first, then their entry documents and matching compression variants. Keep old data paths available when changing a format used by existing clients. Verify the model, material and collision inputs as a compatible set. Only a corresponding product-code change requires an Armor build.

Use the existing `supporters:publish` and `updates:publish` commands for document updates; consult the publisher's help for arguments. Community aliases remain owned by the online content editor. These operations do not rebuild Armor. A deployment never replaces `.env`, content documents, analytics records or Wiki data.

## Outer ingress

Ordinary Armor publication does not modify `/opt/Caddyfile` or restart outer Caddy. If an explicit ingress change replaces that single-file bind mount, recreate the outer container: renaming the host file does not replace the mounted inode. Verify both source and CDN behavior. Wiki missing data must remain `404` with `Cache-Control: no-store`; its `npm run verify:public-cache` checks this separately.
