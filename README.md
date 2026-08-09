# SiguaArmor

SiguaArmor is the public source repository for the vehicle and weapon reference website at [armor.siguad.icu](https://armor.siguad.icu/).

- `https://siguad.icu/` and `https://armor.siguad.icu/` open the same Armor edition selector.
- `https://siguad.icu/navigator` (and `/navigator/`) opens the SiguaD.icu product navigator.
- `/sigua/` opens the China edition.
- `/squad/` opens the international edition.

## Repository boundary

- Product UI, product behavior, build tooling, deployment tooling, and product-specific presentation assets belong here.
- Final reusable Squad data and shared browser-ready runtime assets belong to SiguaWiki and are consumed over its stable HTTPS paths.
- Research methods, Editor/SDK extraction, raw or uncompressed game assets, source locks, and evidence remain in the private SiguaResearch repository.

The initial large browser-ready asset tree remains attached once as a GitHub Release
bootstrap for the transitional build. It is only for developer/CI restoration; vehicle
models and hit-runtime files are served from `https://wiki.siguad.icu/assets/runtime-probe/`,
never from GitHub. Routine shared-asset updates add only new hash-named files to SiguaWiki.
After cloning, run:

```powershell
npm ci
npm run assets:restore
npm run build
```

See `CONTEXT.md` for the ownership model and `docs/migrations/2026-08-09-single-public-repository.md` for the private/public consolidation boundary.

Public visibility and approved website distribution do not relicense third-party game names, trademarks, or assets; those remain the property of their respective owners.
