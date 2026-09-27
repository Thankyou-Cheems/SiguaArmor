---
status: accepted
---

# Run IP-only analytics in a small native service

Removing the 125 MiB city database lowered the isolated Node analytics candidate to 68.5 MiB RSS, but most of that was the resident Node runtime. This is disproportionate to a service that records one encrypted client IP per UTC day and serves small DAU summaries.

Replace only the analytics process with a Go standard-library executable in a scratch container. Keep the same service name, HTTP routes, origin and admin authentication, daily HMAC identity, AES-256-GCM raw-record format, 30-day retention, historical total-only compaction, and public/admin response schemas. New records are synchronously appended before they are counted in the response. The existing content-admin and Caddy services continue to address the same analytics service, so rollback to the previous release requires no host service migration.

The release packager cross-compiles Linux/amd64 from local reviewed Go source; production Docker builds require no external builder image. This adds Go 1.25+ to local release requirements and fixes the current x86-64 host architecture in packaging. An isolated server candidate loaded copies of all 74 live analytics files, passed endpoint and deduplication probes, and used 8.1 MiB idle process RSS. After 200 distinct IPs from 16 concurrent clients in 0.36 seconds, it used 10.9 MiB RSS and counted every address once. All 73 completed days matched live daily totals; the current day may change while evidence is collected. The then-current production Node/GeoIP process used roughly 160–165 MiB RSS. Production memory and behavior remain unverified until publication.
