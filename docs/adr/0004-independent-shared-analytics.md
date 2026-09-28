# 0004: Independently deployed shared analytics

Accepted 2026-09-28. The user requested one lightweight collector across products and explicitly removed retired Bomana compatibility requirements. This changes ADR 0003's deployment ownership and storage format, not ADR 0002's Armor IP policy.

The private SiguaAnalytics repository owns the Go implementation and one SQLite file per product. Armor retains the existing public DAU and admin overview interfaces, HMAC derivation/key, encrypted IPs and 30-day raw retention. Product counts and secrets are isolated. Historical aggregate totals remain available; no geolocation database is introduced.

Armor's Compose stack and release package now contain only Caddy and content administration. They resolve the independent `sigua-analytics:8081` service over the existing private Docker network. Go is no longer required to build Armor. The first transfer is an explicit host migration; ordinary page rollback rejects an old embedded collector definition so it cannot overwrite current metrics or resurrect a second writer.

Historical Bomana events are archived separately without live compatibility APIs. New startup measurements are not inferred from DAU. See [implementation and evidence](../shared-analytics-design.md); service migrations and binary rollbacks belong to SiguaAnalytics, never to page releases.
