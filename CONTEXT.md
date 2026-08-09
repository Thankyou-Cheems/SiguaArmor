# SiguaArmor context

SiguaArmor now has one product repository: this public repository.

| Owner | Keeps |
| --- | --- |
| SiguaArmor | Product code, product tests, product-specific presentation assets, build/release/deploy tooling |
| SiguaWiki | Final reusable weapons, vehicles, deployables, algorithms, maps, and approved shared assets |
| SiguaResearch | Investigations, extraction tools, raw/uncompressed game assets, source locks, evidence, and causal conclusions |
| External secret/backup custody | Deployment credentials, API tokens, review credentials, private backups, and live operational state; never Git content and not Research data |

The checked-in `generated/internal` and related configuration files are a transitional snapshot required by the current application and release compiler. They are public final data, not research authority. Remove them when the application reads the equivalent SiguaWiki HTTPS data during the next architecture refactor.

The initial large public asset tree is reproducible from the one-time GitHub Release
bootstrap pinned by `public-assets.json`; it is intentionally ignored by Git and remains
a transitional build input. This URL is for low-frequency developer/CI restoration, not
production hotlinking. Browser requests for vehicle models, texture/geometry blobs, and
hit runtime resolve directly to `https://wiki.siguad.icu/assets/runtime-probe/`. Routine
shared-asset updates add only new hash-named bytes to SiguaWiki and do not create monthly
full GitHub archives.

The former `SiguaArmor-maintainer-private` Git history is never merged here. It contains mixed product and research history that is broader than the approved public boundary. The old repository remains a read-only recovery source until this branch is merged, a clean clone builds, and the public release asset is independently downloadable.
