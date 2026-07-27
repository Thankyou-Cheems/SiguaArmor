# SiguaArmor agent routing

## Start with the real checkout

- Before editing, building, deploying, or cleaning, verify the repository root, branch,
  upstream, `git status --short --ignored`, registered worktrees, relevant processes,
  and reparse points.
- Preserve unrelated dirty and untracked work. Do not reset, clean, stash, terminate
  another session's process, or remove a worktree just because its branch looks old.
- The public monorepo is a source mirror. Build and deployment authority lives in the
  maintainer repository on a clean release worktree. Mirror only the intended public
  application files; do not overwrite public-only work.

## Route builds by invalidation scope

- Read `docs/sops/lightweight-public-release.md` completely before release work. If the
  current public checkout does not contain it, use the maintainer checkout that owns
  `build:quick` and `release:delta`.
- Application-only changes in `app/`, browser-only `lib/` behavior, styles, focused
  tests, or documentation use `npm run build:quick`. Do not run `npm run build`,
  `npm run build:full`, or `release:prepare` for these changes.
- Run `npm run build:full` only when fonts, public/catalog/wiki data, card impressions,
  faction art, 3D/texture/hit runtime assets, visual selection policy, compression
  recipes, dependency locks, or build tooling changed; also use it when the sealed
  `.release/public` closure is absent, stale, or fails bytes/SHA-256 verification.
- A quick build must reuse and verify the sealed public closure, rebuild the Vinext
  client/server, regenerate transfer sidecars and manifests, and emit the quick-release
  receipt. Never copy an old manifest or weaken a failed closure check.
- Keep the complete local WOFF2 font. Font-cache reuse is valid only after exact source
  hash, recipe, output hash/bytes, glyph count, and every source codepoint all verify.

## Preserve runtime performance boundaries

- Protection-map work stays in the user's browser. Do not add server-side protection
  calculation or a runtime dependency on private extraction data.
- Spaced/additional-armor animation stays disabled; do not restore the 2.4-second
  render animation or schedule extra frames for it.
- Preserve lazy loading and do not pull full exterior textures or supplemental geometry
  into the armor-view startup path.

## Deploy and clean safely

- A source push does not require a full release by itself. For eligible changes, fetch
  the exact live combined manifest, build with `release:delta`, verify all uploaded
  hashes, preflight an isolated candidate, and use the atomic switch with rollback.
- Keep the active release, the latest verified rollback, and the current incoming
  receipt/package. Remove older rollback, candidate, failed, or incoming directories
  only after live manifest, public probes, and container health all pass.
- Before local cleanup, inspect ignored assets, unique evidence, active sessions and
  processes, and junction targets. Remove junctions as links only; never recurse into
  their targets. Keep validated extraction checkpoints and current evidence.
- Do not use broad `docker system prune`, recursive deletion at a workspace root, or
  guessed paths. Resolve and verify every destructive target, then recheck retained
  hashes and health after cleanup.

## Minimum closure

- Run typecheck, the affected focused tests, lint, and `git diff --check`.
- For rendered changes, perform a production build and real-browser DOM, visual,
  interaction, and console QA. For deployment, verify the remote commit and live
  manifests before reporting completion.
