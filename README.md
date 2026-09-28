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
- Asset authoring tools and private publication metadata live in the private part of SiguaWiki. This repository contains product runtime, build/deployment maintenance and necessary behavior comments.

Install Node.js 24 LTS (see `.node-version`), then run:

```powershell
npm ci
npm run verify
```

`npm run dev` starts local development. Use a focused test while editing; `verify` runs the complete local checks once. For publication, use `deploy`, which already includes `verify`, and follow [deployment](docs/deployment.md).

The browser fetches shared catalogs, visual descriptors, compressed vehicle models, and hit geometry directly from `https://wiki.siguad.icu`. There is no bundled shared-data fallback.

Both Armor editions are statically exported at build time and served by Caddy/EdgeOne. Vehicle routes, 3D interaction and protection analysis run in the browser; no page-rendering Node service is deployed. Only DAU collection and content administration have application backends. Node/Vinext remains a local development/build tool, and Node also runs the independent administrator service.

DAU collection is owned by the separately deployed SiguaAnalytics service. Armor keeps its beacon, public counter and admin overview; ordinary page releases neither package nor restart the collector. See [shared analytics](docs/shared-analytics-design.md).

See [CONTEXT.md](CONTEXT.md) for the ownership model and [workspaces](docs/workspaces.md) for current releases, retained candidates and parallel development. `npm run workspace:status` inventories local worktrees and branch retention without changing them.

Public visibility and approved website distribution do not relicense third-party game names, trademarks, or assets; those remain the property of their respective owners.
