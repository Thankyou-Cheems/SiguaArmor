# Performance architecture

This document records the current browser path from product navigation through SiguaWiki and CDN delivery. Shared game data is maintained in SiguaWiki.

## Ownership and request flow

| Stage | Owner | Default request depth | Failure boundary |
| --- | --- | --- | --- |
| Catalog route and grouping | SiguaArmor | small product topology index, then one selected faction group | UI shows the catalog loading/error state; no bundled shared-data fallback |
| Names, aliases, thumbnails, faction flags | SiguaWiki through EdgeOne | faction index plus only the selected faction presentation; approved flags are browser-ready Wiki assets | a Wiki HTTP/schema failure remains visible to the player |
| Vehicle details | SiguaWiki through EdgeOne | one faction mechanics document after expansion | the card remains navigable while unavailable detail data is reported |
| 3D exterior | SiguaWiki through EdgeOne | one vehicle runtime record, one visual descriptor, then its glTF and its referenced buffers | exterior reports loading/error; immutable assets are never guessed or mirrored in Armor |
| Hit analysis | SiguaWiki through EdgeOne | one vehicle hit record, geometry and BVH | exterior viewing remains distinct from unavailable hit analysis |
| Default weapon analysis | SiguaWiki through EdgeOne | one current-vehicle weapon-runtime slice | no full weapon or vehicle catalog is allowed in the default 3D path |
| Global weapon search | SiguaWiki through EdgeOne | global library only after the player opens the global selector | search can fail independently without blocking the current vehicle source |
| Fonts | third-party font host | full display family begins after load/idle; system fonts render first | the page remains readable if the font host is unavailable |
| Administration | Armor content-admin to a narrow Wiki vehicle-data mount | ETag-protected update of community aliases only | it cannot regenerate weapon/runtime assets or write outside the named document |

The deep browser modules are the catalog bootstrap (route to one faction), the Wiki source adapter (URL/schema/cache behavior), the runtime visual descriptor (placement identity plus one approved exterior asset), and the vehicle weapon-runtime slice. Removing any one of these modules would spread request selection and failure behavior back into several UI callers. Product layout, interaction, route state, quality admission, and visual selection stay in Armor; reusable facts and approved browser-ready assets stay in Wiki; extraction and derivation tools stay in Research.

## 3D performance

Every exterior descriptor now points to the reviewed half-resolution texture projection as its single approved model. The compatibility profile, selected for integrated/mobile renderers or constrained memory/CPU, additionally uses DPR 1, two concurrent model loads, anisotropy 1, and no generated mipmaps. Geometry, nodes, placements, and hit-query assets are unchanged.

Use `tools/perf/Run-RuntimeViewerIgpuProbe.ps1` when investigating performance on integrated graphics. It measures load time, interaction frame time, request volume and context loss in an isolated Edge profile, then restores the previous graphics preference.

## Rendering locality

OrbitControls owns pointer state and camera math. One viewer-local request-render scheduler coalesces control changes and shot-animation changes to at most one WebGL render request per animation frame. Protection-map work is cancelled while controls are active and resumes after interaction. Continuous distance input updates local values; route publication happens after interaction rather than rerendering the full catalog tree on every slider event.

## Release order

Reusable Wiki bytes are published before Armor references them. New immutable URLs need no purge; changed descriptor and data URLs are purged precisely and verified from the public origin. Follow [deployment](deployment.md) for the product switch, rollback and browser checks. This request flow remains direct static delivery until a separately validated product requirement justifies a dynamic service.

## Performance checks

Keep default 3D loading limited to the selected vehicle and its weapons. Measure production requests separately from development traffic. Display quality changes must preserve hit geometry and analysis materials.

## School display and exact query

The school remains visible during vehicle inspection. Its 24 fixed-color prototypes use instancing and share immutable decoded arrays across viewer mounts. GPU objects belong to the viewer and are disposed with it. Keep these existing choices; the [Three.js disposal contract](https://threejs.org/manual/en/how-to-dispose-of-objects.html) requires both geometry/material disposal and the separate InstancedMesh disposal already performed here.

ExactQuery is loaded only when entering a driver/gunner operation view. A type-only viewer import keeps the native loader and query kernel out of the initial viewer module graph. The loader owns one shared successful query request and evicts rejected requests; re-entering operation retries failure. The viewer owns readiness, cancellation and its live display offset. A missing query blocks firing, and no visual fallback is admitted.

Preparation resolves component and Actor identity, per-placement material slots, transforms and prototype geometry once. Post-impact world traces still traverse all required native shapes in their original order. Component refinement uses the target component's indexed row and the same query implementation, rather than running another world query and filtering afterward. This keeps the public query interface small and concentrates traversal policy inside the query module. Cached material profiles are treated as immutable.

Typed arrays share one allocation per prototype. Keep per-instance transforms and identity separate from geometry. Preserve query precision and traversal order; display LOD cannot be used for mechanics. The exact query module owns these invariants.

Research owns performance measurements and independent mechanics comparisons. Reconsider workers or a scene-level spatial index when a representative browser workload demonstrates the need. A release must still validate the product's actual loading, operation and shooting behavior.
