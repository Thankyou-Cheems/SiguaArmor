---
status: accepted
---

# Separate the Site Portal from the Armor Site

## Context

The root domain is becoming a product entry rather than the permanent home of one application.
Keeping Armor on root paths would couple future product navigation, Armor runtime routing, cache
policy, and same-origin operational endpoints in one host-level contract.

## Decision

The product-neutral Site Portal remains at `siguad.icu`. Both Armor Edition Routes move together
to `armor.siguad.icu`, at `/squad` and `/sigua`. The root keeps only the selection document and
permanent redirects for those former Armor paths. Armor HTML may use a short shared cache, while
RSC/Flight, administration, and daily-active responses remain private and uncached.

## Consequences

- Future products can receive their own subdomains without changing the Site Portal's identity.
- Both Armor editions keep one runtime, one cache contract, and one same-origin analytics endpoint.
- Old root Armor paths preserve path and query through a `301`, but the root combined release
  manifest is not part of the public compatibility surface.
- EdgeOne, outer Caddy, inner Caddy, legal metadata, and release tooling must agree on the two-host
  topology; `lib/public-site-topology.mjs` is the source-owned vocabulary for those values.
