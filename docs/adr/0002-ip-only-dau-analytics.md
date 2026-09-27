---
status: accepted
---

# Count Armor DAU by IP without geolocation

Armor keeps its same-origin DAU endpoint and counts one client IP per UTC day, but no longer looks up or records a city or region. The city MMDB was 125 MiB and the Node reader loaded it into an external Buffer, dominating a service whose visit records occupy less than 0.1 MiB. Keeping the GeoIP feature would consume roughly 190 MiB of container memory on the shared 4 GiB host; the owner chose IP-only statistics instead.

New records retain an encrypted IP and a per-day keyed identifier for at most 30 days, then only daily totals remain. The public DAU response is unchanged; the management overview moves to v2 with daily totals only. Historical v1 city aggregates are read solely for their DAU totals, and old raw records are compacted to total-only v2 archives when they expire. The former MMDB remains in private server custody for rollback but is no longer mounted or loaded by the active service.
