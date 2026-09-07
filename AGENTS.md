# SiguaArmor

Read `CONTEXT.md` before changing data ownership, shared assets, or deployment.

- This is the single product repository for the SiguaArmor website. Keep product UI, routes, product-specific card grouping and category-icon mappings, visual selection policy, DAU analytics, and content administration here. Reusable localized names, community search aliases, and approved card thumbnails belong to SiguaWiki.
- Read final reusable Squad data and shared browser-ready assets from `https://wiki.siguad.icu` through `lib/wiki-source.ts`. Do not add a product-local fallback or authoritative shared snapshot.
- Put investigations, extraction tools, source locks, evidence, and raw or uncompressed game assets in SiguaResearch. Publish only reviewed reusable outputs to SiguaWiki.
- Keep credentials, `.env`, runtime data, backups, and deployment state outside Git.
- For parallel work, branch retirement or resuming a candidate, read [workspaces](docs/workspaces.md). Use `.local/worktrees/<task>` for temporary worktrees; preserve exact tips, every dirty/untracked file and ignored custody, and verify process ownership before removal. Keep unrelated tasks' work intact.
- Use the package scripts. Run typecheck, tests, lint, `git diff --check`, and a production build for rendered changes; then perform real-browser and console QA.
- For deployment, rollback or release-directory cleanup, follow [deployment](docs/deployment.md) and use its package commands. Keep the command implementation and that procedure in the same change.
