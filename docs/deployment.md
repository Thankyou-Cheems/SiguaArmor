# Deployment

SiguaArmor uses one ordinary build and one small deployment candidate. Shared game data and large runtime assets are not included; browsers read them from `https://wiki.siguad.icu`.

```powershell
npm ci
npm run check
npm run lint
npm run build
npm run deploy:package
```

`outputs/deployment/` contains the static client, standalone Node server, selector and navigator pages, Caddy/Compose configuration, and the two small operational services. It never contains `.env`, analytics data, content data, GeoIP data, or bulk Wiki assets. The content-admin container receives a narrow writable mount for the Wiki vehicle-data directory so the small community-alias document can be updated with the existing Armor management key.

Upload this directory to a new server-side candidate. Keep the existing `data/` and `.env`, validate `docker compose config`, then switch the `release/` directory and configuration together. `SIGUA_WIKI_VEHICLE_DATA_ROOT` may override the default `/opt/Website/sigua-wiki/data/vehicles` host path. The outer Wiki Caddy route proxies only `/__admin/content*` to `sigua-public:8080`; every public Wiki data path remains a normal static file. Start or rebuild the affected services, verify container health, `/`, `/navigator`, `/sigua/`, `/squad/`, a vehicle page, one Wiki catalog request, one model request, and the browser console. Retain the immediately previous release directory as the single rollback.

The candidate switch replaces the deployment-owned `services/` directory as well as `release/`. Recreate `sigua-content-admin` in the same switch even when its source did not change; otherwise its existing bind-mounted working directory points at the retired directory and Docker health checks fail. The analytics data directory stays outside the candidate, but rebuild `sigua-analytics` whenever its service source or image definition changes.

Routine releases upload only changed candidate files directly to the server. They do not pull a multi-gigabyte asset archive through GitHub and do not create manifests, receipts, consumer pins, or browser hash checks.
