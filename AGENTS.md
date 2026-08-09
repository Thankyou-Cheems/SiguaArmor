# SiguaArmor agent routing

Read `CONTEXT.md` before changing ownership, data, assets, build, release, or deployment behavior.

## Repository role

- This public repository is the sole product repository for the SiguaArmor website. Do not recreate a private product mirror or a two-commit release workflow.
- SiguaWiki owns final reusable Squad data. Product-owned projections may remain here only while the Wiki migration is incomplete; do not treat them as a new authority.
- SiguaResearch owns investigations, extraction tools, raw/uncompressed game assets, source locks, and evidence. Route new extraction work there instead of adding Editor, SDK, runtime-probe, or authoring-vault material here.
- Deployment credentials, API tokens, review credentials, backups, and live operational state stay in the appropriate secret manager or ignored local custody. They do not belong in this public repository or in SiguaResearch.
- The initial browser-ready binary tree is restored from the one-time GitHub Release bootstrap named by `public-assets.json`. Never commit the multi-gigabyte tree to Git, hotlink the GitHub asset in production, or publish routine monthly full snapshots there. Deploy changed content-addressed bytes incrementally to the project-owned origin/CDN.

## Work safely

- Before editing, building, deploying, or cleaning, verify the repository root, branch, upstream, `git status --short --ignored`, registered worktrees, relevant processes, and reparse points.
- Preserve unrelated dirty and untracked work. Do not reset, clean, stash, terminate another session's process, or remove another worktree.
- Do not import history from `SiguaArmor-maintainer-private`. The sanitized migration boundary is recorded in `docs/migrations/2026-08-09-single-public-repository.md`.

## Build and release

- Run `npm run assets:restore` after a fresh clone. It verifies the pinned archive before extracting only `public/assets`, `public/images`, and the prepared public manifest.
- Read `docs/sops/lightweight-public-release.md` before release work. Use the one-repository `--source-commit` contract.
- Use `npm run build` for a complete product build and `npm run build:quick` only when the sealed `.release/public` closure is already present and verified.
- Preserve browser-side protection calculations, lazy loading, and the current no-animation boundary for spaced/additional armor.

## Minimum closure

- Run typecheck, affected focused tests, lint, and `git diff --check`.
- For rendered changes, run a production build and real-browser DOM, visual, interaction, and console QA. For deployment, verify the remote commit, live manifests, probes, and container health.
