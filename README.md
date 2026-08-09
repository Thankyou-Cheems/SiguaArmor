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

After cloning, run:

```powershell
npm ci
npm run check
npm run build
```

`npm run dev` starts local development. `npm run deploy:package` creates the small server candidate after a successful build; see `docs/deployment.md`.

The browser fetches shared catalogs, visual descriptors, compressed vehicle models, and hit geometry directly from `https://wiki.siguad.icu`. There is no bundled shared-data fallback.

See `CONTEXT.md` for the ownership model.

Public visibility and approved website distribution do not relicense third-party game names, trademarks, or assets; those remain the property of their respective owners.
