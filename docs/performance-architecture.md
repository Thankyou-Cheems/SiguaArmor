# Performance architecture

This document records the current browser path from product navigation through SiguaWiki and CDN delivery. It is an acceptance map, not a second source of game data.

## Ownership and request flow

| Stage | Owner | Default request depth | Failure boundary |
| --- | --- | --- | --- |
| Catalog route and grouping | SiguaArmor | small product topology index, then one selected faction group | UI shows the catalog loading/error state; no bundled shared-data fallback |
| Names, aliases, thumbnails, faction flags | SiguaWiki through EdgeOne | faction index plus only the selected faction presentation; approved flags are browser-ready Wiki assets | a Wiki HTTP/schema failure remains visible to the player |
| Vehicle details | SiguaWiki through EdgeOne | one faction mechanics document after expansion | the card remains navigable while unavailable detail data is reported |
| 3D exterior | SiguaWiki through EdgeOne | one vehicle runtime record, one visual descriptor, then its content-addressed glTF/blob closure | exterior reports loading/error; immutable assets are never guessed or mirrored in Armor |
| Hit analysis | SiguaWiki through EdgeOne | one vehicle hit record/geometry/BVH closure | exterior viewing remains distinct from unavailable hit analysis |
| Default weapon analysis | SiguaWiki through EdgeOne | one current-vehicle weapon-runtime slice | no full weapon or vehicle catalog is allowed in the default 3D path |
| Global weapon search | SiguaWiki through EdgeOne | global library only after the player opens the global selector | search can fail independently without blocking the current vehicle source |
| Fonts | third-party font host | full display family begins after load/idle; system fonts render first | the page remains readable if the font host is unavailable |
| Administration | Armor content-admin to a narrow Wiki vehicle-data mount | ETag-protected update of community aliases only | it cannot regenerate weapon/runtime assets or write outside the named document |

The deep browser modules are the catalog bootstrap (route to one faction), the Wiki source adapter (URL/schema/cache behavior), the runtime visual descriptor (placement identity plus optional compatibility asset), and the vehicle weapon-runtime slice. Removing any one of these modules would spread request selection and failure behavior back into several UI callers. Product layout, interaction, route state, quality admission, and visual selection stay in Armor; reusable facts and approved browser-ready assets stay in Wiki; extraction and derivation tools stay in Research.

## 3D admission and acceptance contract

The compatibility profile is selected for integrated/mobile renderers or constrained memory/CPU. It uses DPR 1, two concurrent model loads, anisotropy 1, no generated mipmaps, and the descriptor's half-resolution exterior texture projection. Geometry, nodes, placements, hit-query assets, and balanced-quality models are unchanged.

The release gate is `tools/perf/Run-RuntimeViewerIgpuProbe.ps1`. It temporarily sets Edge's Windows per-executable preference to power saving, uses an isolated hidden profile, verifies the actual renderer through both CDP and WebGL, restores the prior registry value, and stops only its own profile processes. Its default acceptance budgets are 12 seconds to exterior ready, 25 ms continuous-orbit p95, 160 ms for one isolated worst interval, at most one drag Long Task, zero context losses, no failed requests, and no default request for a full vehicle or weapon catalog. Detailed machine receipts and causal conclusions belong to the SiguaResearch `vehicle-runtime-compatibility-textures` Case rather than this product repository.

## Rendering locality

OrbitControls owns pointer state and camera math. One viewer-local request-render scheduler coalesces control changes and shot-animation changes to at most one WebGL render request per animation frame. Protection-map work is cancelled while controls are active and resumes after interaction. Continuous distance input updates local values; route publication happens after interaction rather than rerendering the full catalog tree on every slider event.

## Release order

Reusable Wiki bytes are published before Armor references them. New immutable hashes need no purge; changed descriptor and data URLs are purged precisely and verified from the public origin. Armor then builds one candidate, switches the server release atomically, retains one rollback, and receives browser/console QA. This request flow remains direct static delivery until a separately validated product requirement justifies a dynamic service.

## Remaining performance guardrails

- Keep the default 3D network assertion against `/data/weapons/catalog.json` and `/data/vehicles/catalog.json`; a future summary must not claim this optimization was newly added unless the gate regressed and was fixed again.
- Keep representative tracked, many-placement, and image-free exterior receipts in the owning SiguaResearch Case after fleet compatibility changes.
- Treat production network bytes separately from Vite development traffic; uncompressed development modules are not a CDN payload regression.
- Do not broaden compatibility generation to hit geometry, BVH, or analysis materials. The quality alternative is only an exterior presentation adapter.
