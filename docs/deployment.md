# Deployment

SiguaArmor uses one ordinary build and one small deployment candidate. Shared game data and large runtime assets are not included; browsers read them from `https://wiki.siguad.icu`.

```powershell
npm ci
npm run check
npm run lint
npm run build
npm run deploy:package
```

`outputs/deployment/` contains the static client, standalone Node server, selector and navigator pages, Caddy/Compose configuration, and the two small operational services. It never contains `.env`, analytics data, content data, GeoIP data, or Wiki assets.

Upload this directory to a new server-side candidate. Keep the existing `data/` and `.env`, validate `docker compose config`, then switch the `release/` directory and configuration together. Start or rebuild the affected services, verify container health, `/`, `/navigator`, `/sigua/`, `/squad/`, a vehicle page, one Wiki catalog request, one model request, and the browser console. Retain the immediately previous release directory as the single rollback.

Routine releases upload only changed candidate files directly to the server. They do not pull a multi-gigabyte asset archive through GitHub and do not create manifests, receipts, consumer pins, or browser hash checks.
