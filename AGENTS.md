# SiguaArmor

Read `CONTEXT.md` before changing data ownership, shared assets, or deployment.

- This is the single product repository for the SiguaArmor website. Keep product UI, routes, product-specific card grouping and category-icon mappings, visual selection policy, DAU analytics, and content administration here. Reusable localized names, community search aliases, and approved card thumbnails belong to SiguaWiki.
- Read final reusable Squad data and shared browser-ready assets from `https://wiki.siguad.icu` through `lib/wiki-source.ts`. Do not add a product-local fallback or authoritative shared snapshot.
- Put investigations, extraction tools, source locks, evidence, and raw or uncompressed game assets in SiguaResearch. Publish only reviewed reusable outputs to SiguaWiki.
- Keep credentials, `.env`, runtime data, backups, and deployment state outside Git.
- Preserve unrelated dirty work and other worktrees. Do not reset, clean, stash, terminate another task's process, or remove another worktree.
- Use the package scripts. Run typecheck, tests, lint, `git diff --check`, and a production build for rendered changes; then perform real-browser and console QA.
- Read `docs/deployment.md` before deployment. Upload only the generated deployment candidate, switch the server release directory atomically, check health and browser behavior, and retain one rollback.
