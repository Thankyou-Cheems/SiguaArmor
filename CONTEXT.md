# SiguaArmor context

SiguaArmor is one public product repository. Its shared-data seam is `lib/wiki-source.ts`.

| Owner | Content |
| --- | --- |
| SiguaArmor | Product UI and behavior, product card/route/group mappings, category-icon and visual selection policy, analytics/admin services, and deployment files |
| SiguaWiki | Final reusable weapons, vehicles, localized names, community search aliases, deployables, factions, maps, pure algorithms, runtime visual descriptors, card thumbnails, and approved compressed shared assets |
| SiguaResearch | Investigations, extraction/update tools, source locks, causal conclusions, raw evidence, and raw or uncompressed assets |
| Server/secret custody | `.env`, credentials, analytics/content data, GeoIP data, backups, and live operational state |

The browser reads Wiki data and assets directly over HTTPS. SiguaArmor does not pin a Wiki release, mirror shared catalogs, verify browser-side content hashes, or fall back to bundled shared data. A failed Wiki request is visible as a product data-loading failure.

`generated/catalog-index.json` and its China counterpart contain only product-owned card topology, grouping order, and routes. Localized labels, search terms/aliases, and card thumbnails come from the Wiki vehicle and faction catalogs; Armor keeps the ranking, fuzzy-pinyin, grouping, and interaction implementations.

The retired Maintainer repository is only historical migration provenance. Do not rebuild its private/public split or its release compiler.
