# SiguaArmor context

SiguaArmor is one public product repository. Its shared-data seam is `lib/wiki-source.ts`.

| Owner | Content |
| --- | --- |
| SiguaArmor | Product UI and behavior, product card/route/group mappings, category-icon and visual selection policy, DAU client/display, content admin service, and page deployment files |
| SiguaAnalytics | Independently deployed metrics service, per-product persistence, deduplication, retention and aggregate APIs; Armor's UTC IP policy stays unchanged |
| SiguaWiki | Final reusable weapons, vehicles, localized names, community search aliases, deployables, factions, maps, pure algorithms, runtime visual descriptors, card thumbnails, and approved compressed shared assets |
| SiguaResearch | Investigations, extraction/update tools, source locks, causal conclusions, raw evidence, and raw or uncompressed assets |
| Server/secret custody | `.env`, credentials, analytics/content data, GeoIP data, backups, and live operational state |

The browser reads Wiki data and assets directly over HTTPS. SiguaArmor does not pin a Wiki release, mirror shared catalogs, or fall back to bundled shared data. A failed Wiki request is visible as a product data-loading failure. Observed grounded poses additionally require the catalog's exact class, model binding and record integrity before enabling the physical-state switch; unavailable observations retain the reference display.

Public pages for both editions use build-time static HTML and RSC navigation files. Static RSC is serialized page content, not a running query service. Caddy/EdgeOne serves those files and shared assets; the browser owns interaction and Armor hit calculations. Product-owned topology enumerates faction/vehicle routes, including existing aliases, without fetching or embedding Wiki game data during export. DAU and content administration remain independent backends. Calc's private query service is outside this page-delivery decision.

## Language

**Daily active visitor (DAU)**: One distinct client IP observed by either Armor edition during one UTC day. It counts network addresses rather than people; shared or changing addresses can make it differ from the number of human visitors.

`generated/catalog-index.json` and its China counterpart contain only product-owned card topology, grouping order, and routes. Localized labels, search terms/aliases, and card thumbnails come from the Wiki vehicle and faction catalogs; Armor keeps the ranking, fuzzy-pinyin, grouping, and interaction implementations.

The retired Maintainer repository is only historical migration provenance. Do not rebuild its private/public split or its release compiler.
