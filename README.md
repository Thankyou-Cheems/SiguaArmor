# SiguaArmor

SiguaArmor is the public source repository for the vehicle and weapon reference website at [armor.siguad.icu](https://armor.siguad.icu/).

- `/` opens the SiguaD.icu site selector.
- `/sigua/` opens the China edition.
- `/squad/` opens the international edition.

## Repository boundary

- Product UI, product behavior, build tooling, deployment tooling, and browser-ready release assets belong here.
- Final reusable Squad data is moving to SiguaWiki and is consumed over its stable HTTPS paths.
- Research methods, Editor/SDK extraction, raw or uncompressed game assets, source locks, and evidence remain in the private SiguaResearch repository.

The initial large browser-ready asset tree is attached once as a GitHub Release bootstrap
rather than stored in Git history. It is only for developer/CI restoration; the website
serves assets from the project-owned origin and CDN, never from GitHub. Routine asset
updates use content-addressed deployment deltas and do not publish another full archive.
After cloning, run:

```powershell
npm ci
npm run assets:restore
npm run build
```

See `CONTEXT.md` for the ownership model and `docs/migrations/2026-08-09-single-public-repository.md` for the private/public consolidation boundary.

Public visibility and approved website distribution do not relicense third-party game names, trademarks, or assets; those remain the property of their respective owners.
