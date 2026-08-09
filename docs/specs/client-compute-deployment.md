# Client Compute Deployment Spec

Status: Active
Owner: maintainers
Prefix: `DEPLOY-`

## Scope

This specification governs the public Web/PWA artifact, its EdgeOne and origin delivery
path, release assets, browser-side 3D rendering, ray queries, and impact simulation. It records the
production boundary before implementation so the TencentCloudPublic origin never becomes the
interactive compute tier.

## Non-goals

- Publication authorization is supplied by the release receipt and current maintainer workflow; ignored raw source evidence remains out of scope.
- Cloud changes are limited to the exact `siguad.icu` and `armor.siguad.icu` EdgeOne domains and TencentCloudPublic stack governed by this specification.
- This specification does not select COS for backups; an object store mentioned here is only a
  possible origin for public release assets.
- This specification does not define armor formulas or the viewer's interaction design.
- This specification does not authorize restoring the removed Squad Armor model/texture corpus.

## Normative Clauses

- `DEPLOY-01`: The production browse path MUST be a static artifact that Caddy or an object store
  can serve without request-time Next.js, Vinext, RSC, SSR, server/edge Worker, database, or application-server execution.
- `DEPLOY-02`: Public browser traffic for this site MUST enter through EdgeOne, and direct bypass of
  this site's origin endpoint MUST be disabled and verified with an infrastructure-only origin header.
- `DEPLOY-03`: Catalog browsing, vehicle details, 3D viewing, and impact analysis MUST remain usable
  when every optional dynamic API is unavailable after their required static artifacts have loaded.
- `DEPLOY-04`: 3D frames and protection-map overlay shading MUST execute on the user's GPU through a
  capability-detected WebGL2 baseline or optional WebGPU backend.
- `DEPLOY-05`: BVH intersection queries and detailed impact simulation MUST execute in the user's
  browser from version-pinned public artifacts. The current implementation uses bounded main-thread
  slices and demand rendering; a backend is forbidden and a Web Worker is not required.
- `DEPLOY-06`: The public interaction path MUST NOT call a server or edge function for per-frame
  rendering, per-click ray queries, or per-shot simulation.
- `DEPLOY-07`: The browser MUST fetch only published, version-pinned artifacts and MUST NOT query
  Squad Armor or private raw observations at runtime.
- `DEPLOY-08`: Production GLB, BIN, KTX2, WASM, and versioned JSON assets MUST use content-addressed URLs,
  declare SHA-256 and byte size in the release manifest, and load lazily by vehicle and device profile.
- `DEPLOY-09`: A page load MUST NOT eagerly fetch the 3D asset packs for all promotional vehicles.
- `DEPLOY-10`: Fingerprinted immutable assets MUST receive a one-year browser cache policy and an
  EdgeOne node TTL of at least 30 days; HTML and the mutable release pointer MUST use a short revalidation policy.
- `DEPLOY-11`: Failure to create the 3D context, allocate required memory, or load a model MUST
  preserve the text catalog and a usable 2D fallback. A protection-map budget failure MUST leave
  the map unavailable without blocking exact single-shot analysis.
- `DEPLOY-12`: Optional dynamic endpoints MUST be limited to low-QPS control-plane work such as
  feedback, administration, or short-link persistence and MUST NOT be required to reproduce a scenario.
- `DEPLOY-13`: A release builder MUST accept only the current Editor hit-runtime/visual manifests and MUST
  emit rights-cleared, optimized derivatives enumerated by the release manifest. It MUST fail if an
  old Squad Armor model/texture path is encountered.
- `DEPLOY-14`: The viewer MUST resize decoded exterior textures to the active texture-role budget
  before GPU upload and MUST NOT treat compressed WebP byte size as a GPU-memory budget.
- `DEPLOY-15`: The viewer MUST bound concurrent exterior texture decode work instead of dispatching
  an unbounded vehicle-wide decode fan-out.
- `DEPLOY-16`: The viewer MUST request frames only while camera damping, asset changes, resizing, or
  other visible scene changes require them and MUST stop rendering while the scene is unchanged.
- `DEPLOY-17`: The viewer MUST preserve the last presented frame after its demand-render loop stops.
- `DEPLOY-18`: Hover BVH ray queries MUST run at most once per animation frame and MUST be suspended
  while pointer buttons indicate an active camera drag.
- `DEPLOY-19`: Exterior texture and component readiness MUST be reported only after texture GPU
  initialization and material shader compilation have completed, so mode selection does not batch
  first-use work into one blocking frame.
- `DEPLOY-20`: Protection-map batch BVH queries and damage classification MUST execute in the user's
  browser with bounded frame-budget slices and MUST NOT use a network fallback. Worker migration is
  explicitly deferred and is not a release prerequisite.
- `DEPLOY-21`: Protection-map work MUST be cancelled and hidden during camera interaction, restarted
  after a quiet period, and bounded by progressive coarse/fine sample budgets.
- `DEPLOY-22`: A completed protection-map overlay MUST preserve demand rendering and MUST NOT keep the
  WebGL scene in a continuous animation loop.
- `DEPLOY-23`: Opening an Editor-backed vehicle in armor, interior, or protection-map mode MUST NOT
  request its native exterior textures. The hit-runtime record, geometry, BVH, and texture-free analysis adjuncts MUST become usable
  independently of the exterior scene.
- `DEPLOY-24`: Native exterior loading MUST begin only after an explicit exterior selection, a hover
  prefetch on a visible control, or an idle prefetch on a visible document with Save-Data disabled and
  a measured fast connection. Vehicle replacement or viewer closure MUST cancel obsolete fetch work.
- `DEPLOY-25`: Exterior component fetch, decode, GPU upload, and shader compilation MUST use bounded
  concurrency and progressive readiness. A vehicle-wide unbounded `Promise.all` is forbidden.
- `DEPLOY-26`: A release builder MUST emit a lightweight index, independently addressable per-vehicle
  manifests, and one global SHA-256 blob store. Identical geometry or texture bytes MUST resolve to the
  same immutable URL across vehicles and variants.
- `DEPLOY-27`: Rights-cleared release textures MUST use offline mipmapped KTX2 derivatives. Color
  textures use a color profile, data textures use a linear profile, and occlusion/roughness/metallic
  channels SHOULD be packed into one ORM texture when channel provenance is complete. Source PNGs and
  authoring patches remain immutable inputs rather than runtime payloads.
- `DEPLOY-28`: Release geometry SHOULD use Meshopt compression and MUST load without initializing a
  Draco decoder unless a selected glTF actually declares `KHR_draco_mesh_compression`.
- `DEPLOY-29`: Browser runtime caches for immutable blobs MUST be keyed by content hash and bounded by
  an explicit byte/LRU budget. Mutable HTML and release pointers remain short-lived; public immutable
  blobs use one-year browser and CDN caching, while private research routes remain `no-store`.
- `DEPLOY-30`: Exterior release components MUST provide a base-color preview stage that shares the
  same content-addressed geometry and color texture blobs as the full PBR stage. The viewer MUST
  display those previews with bounded concurrency before progressively replacing them with normal,
  ORM, and emissive materials; the full-PBR stage MUST NOT block the first recognizable exterior.
- `DEPLOY-31`: Editor/hit-runtime-backed vehicles MUST load a compact attacker-and-weapon reference manifest
  instead of the aggregate legacy geometry manifest. The aggregate legacy geometry manifest MUST
  NOT be requested by any production browser path.
- `DEPLOY-32`: The release index MUST carry deployable cache policy metadata: mutable index pointers
  revalidate after a short lifetime, while content-addressed vehicle manifests and blobs use a
  one-year immutable browser cache and support byte ranges. Private research routes remain no-store.
- `DEPLOY-33`: A verified hit-runtime record, geometry artifact, and BVH artifact MUST each be fetched
  once by the browser and retained for the current analysis revision. The current main-thread
  frame-budget path MUST NOT refetch the normal viewer payload. Verified external glTF resources
  MUST use the actual Three.js FileLoader cache namespace so prefetching cannot double the BIN/KTX2
  transfer.
- `DEPLOY-34`: Every exact-card catalog impression MUST be a 640×360 WebP derived from the complete
  native-PBR component set loaded by that card's current Editor exterior mode. `analysisClone`
  controls an additional material-free analysis copy and MUST NOT exclude the native exterior
  component. The generated manifest MUST bind the output SHA-256, source `contentSha256`, exact
  source component IDs, fixed camera direction, and deterministic studio-light settings.
- `DEPLOY-35`: Each catalog impression WebP MUST NOT exceed 32 KiB and the complete 47-card set MUST
  NOT exceed 640 KiB before HTTP transfer compression or CDN caching.
- `DEPLOY-36`: Catalog cards MUST render impressions through native decorative `<img>` elements with
  lazy loading and low fetch priority; catalog impression display MUST NOT initialize Three.js or
  request a vehicle's 3D runtime pack.
- `DEPLOY-37`: Public DAU measurement MUST be optional to browsing and limited to one same-origin
  beacon. Raw IP and first-seen timestamps MUST be encrypted at rest and retained for at most 30
  days. Older rows MUST be replaced by daily totals and city-level aggregates with a minimum
  anonymity threshold of three; no user credential, cookie identity, or browser fingerprint may be stored.
- `DEPLOY-38`: Desktop and mobile requests to either Armor Edition Route MUST receive the same
  application document; the origin and EdgeOne MUST NOT vary routing by user agent or mobile client hint.
- `DEPLOY-39`: `siguad.icu` MUST remain a product-neutral Site Portal, while both Armor Edition
  Routes and their same-origin optional endpoints MUST be canonical under `armor.siguad.icu`.
- `DEPLOY-40`: Ordinary GET/HEAD HTML navigation MAY use a 60-second shared edge cache, but
  RSC/Flight requests, `_rsc` queries, administration, and DAU responses MUST bypass shared cache;
  immutable release assets retain their existing content-addressed cache policy.
- `DEPLOY-41`: Public footer content MUST use schema-validated same-origin `/supporters.json` and
  `/updates.json` documents stored in one persistent origin mount outside the atomic site-release
  directory, so an authorized maintainer can replace either document without rebuilding or restarting
  the public site.
- `DEPLOY-42`: Runtime footer-document loading MUST remain optional to browsing, MUST reject duplicate
  IDs, unsafe URLs, unknown fields, invalid ordering, and invalid documents before rendering, and MUST
  preserve the last valid document or a usable bundled/empty state when a refresh fails.
- `DEPLOY-43`: `/supporters.json` MUST NOT exceed 32 KiB, `/updates.json` MUST NOT exceed 64 KiB, both
  documents MUST use a browser and EdgeOne TTL no longer than 60 seconds, and each document MAY refresh
  at most once per minute while visible. The maintainer update tool MUST atomically replace only the
  selected origin file and purge only its stable URL. `/release-manifest.json`, `/supporters.json`, and
  `/updates.json` MUST share one short-cache EdgeOne subrule so the complete host rule stays within the
  free-plan limit of three nested rules.
- `DEPLOY-44`: Footer-content writes MUST remain SSH-authenticated maintainer operations; the public
  deployment MUST NOT add a browser-facing write endpoint, database, or client-side administration secret.
- `DEPLOY-45`: `/updates.json` MUST own both the newest-first public change log and the site-update date
  displayed in the lower-left footer. The browser MUST render its last valid document in the update-log
  dialog and MUST fall back to the schema-validated release seed when a runtime refresh fails.
- `DEPLOY-46`: The server-rendered root HTML MUST remain at most 192 KiB, MUST contain exactly one
  shared footer, and MUST NOT serialize complete catalog records or vehicle cards. It MAY carry the
  five faction summaries and the compact search index; complete reference records MUST load from only
  the selected faction document, and the initial page MUST NOT request all five faction documents.
- `DEPLOY-47`: Faction foreground overlays MUST be requested only after their faction receives pointer
  hover, keyboard focus, or selection; the initial page MUST NOT transfer all five foreground WebPs.

## Contract Coverage

- [static] `tools/build-public-release.mjs`, `tools/public-assets/prepare.mjs`, and
  `tools/finalize-public-release.mjs` enforce the public form of `DEPLOY-01`, `DEPLOY-02`,
  `DEPLOY-07`, `DEPLOY-08`, `DEPLOY-09`, `DEPLOY-10`, `DEPLOY-13`, and `DEPLOY-38..DEPLOY-45`. The builder performs Vinext
  rendering once at release time, emits only static HTML plus exact-manifest assets, includes current
  Editor hit-runtime/native release files, rejects raw research paths, and emits validated mutable footer seeds
  while the production mount and SSH publisher keep subsequent footer-content edits outside releases.
  `tests/tools/public-site-topology.test.mjs` pins Site Portal/Armor topology, mobile-equivalent
  document routing, legal profile, and the HTML-versus-RSC cache seam.
- [behavioral] `tests/contracts/public-analytics-contract.test.mjs` enforces the optional endpoint,
  origin-header boundary, encrypted/deduplicated raw events, 30-day compaction, and thresholded city
  aggregates required by `DEPLOY-03`, `DEPLOY-12`, and `DEPLOY-37`.
- [behavioral] Browser integration tests with dynamic APIs disabled enforce the static artifact,
  client-compute, fallback, and no-backend boundary in `DEPLOY-03`, `DEPLOY-04`, `DEPLOY-05`,
  `DEPLOY-06`, `DEPLOY-11`, and `DEPLOY-12` as the affected viewer path is changed.
- [behavioral] `tests/viewer/runtime-visual-lazy-load.test.mjs` enforces `DEPLOY-14` and
  `DEPLOY-15` by pinning role-specific decode limits, WebP aspect-ratio parsing, DPR, and decode concurrency.
- [manual] Local browser profiling of an exterior-mode switch, drag, and subsequent idle period covers
  `DEPLOY-16..DEPLOY-19` until a deterministic GPU/browser performance harness is available.
- [behavioral] `tests/viewer/runtime-visual-lazy-load.test.mjs` and the runtime protection-map
  module checks enforce the deterministic and static parts of `DEPLOY-20..DEPLOY-22`;
  frame scheduling remains focused browser coverage.
- [behavioral] `tests/viewer/runtime-visual-lazy-load.test.mjs`,
  `tests/viewer/runtime-weapon-source-index.test.mjs`, and the release-asset validation enforce the
  deterministic parts of `DEPLOY-23..DEPLOY-33`; cold-cache browser profiling verifies request
  ordering, byte totals, cancellation, and cross-variant blob reuse.
- [behavioral] The catalog data and release validation paths enforce `DEPLOY-34..DEPLOY-36` by
  comparing exact-card inputs, hashing and decoding generated impressions, enforcing byte budgets,
  and pinning native lazy-image wiring in the catalog.
- [measured, local PC, 2026-07-15] ZVT-9A armor startup transfers 0.65 MiB with three hit-runtime artifact requests and
  no KTX2/raster request. Its complete exterior adds 15.67 MiB versus 48.57 MiB on the former native
  texture path. The heavier CKS-02 QLZ87 cold page is 25.18 MiB versus 71.99 MiB formerly; switching
  in-app to the QJY88 family variant transfers 6.80 MiB because shared content hashes remain cached.
  These are local development-server measurements, not public-network latency claims.
- [manual] A release-candidate EdgeOne test will verify origin-bypass prevention, cache HIT/MISS,
  Range behavior, MIME and encoding headers, release prewarming, and fallback behavior for
  `DEPLOY-02`, `DEPLOY-08`, `DEPLOY-10`, and `DEPLOY-11`.
- [behavioral] The catalog projection and rendered-route validation paths enforce `DEPLOY-46..DEPLOY-47`
  through generated partition closure, initial HTML budgets, active-faction fetch wiring, and deferred
  foreground sources.

The specification is active for the 2026-07-17 public release. Every deployed source and derivative
manifest is publication-approved, while ignored raw Editor/research evidence remains excluded. The
implemented viewer-runtime clauses retain the behavioral and manual coverage listed above.
