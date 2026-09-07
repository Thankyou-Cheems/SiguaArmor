# Protection Map Contract

Status: Accepted
Owner: maintainers
Prefix: `PROTMAP-`

## Scope

This specification governs the browser-side protection distribution view, its camera-relative ray
sampling, Squad Armor-compatible direct-damage classification, browser frame scheduling, and GPU overlay.

## Non-goals

- This specification does not add ricochet, deflection, secondary fragments, or new hit rules.
- Protection-map cells do not include radial blast damage.
- The protection map is a bounded screen-space sample, not a per-pixel proof of every sub-cell weak spot.
- This specification does not authorize server-side simulation or publication of research assets.

## Normative Clauses

- `PROTMAP-01`: Every protection-map sample MUST use the current perspective camera ray and the
  currently selected weapon, ammunition, and engagement distance.
- `PROTMAP-02`: A cell MUST remain unmarked unless the compatible rule core reports at least one
  penetrated layer and at least one positive direct-damage result.
- `PROTMAP-03`: Positive `Engine` and `Ammo Rack` damage MUST be classified separately from general
  damage, and a ray damaging both MUST retain a distinct combined classification.
- `PROTMAP-04`: Protection-map rays MUST contain armor and interior intersections in their observed
  order, MUST exclude exterior meshes, and MUST remain unmarked when no armor mesh intersects the
  current screen-space ray.
- `PROTMAP-05`: Protection-map BVH queries and compatible-rule evaluation MUST execute in the user's
  browser with bounded main-thread frame slices and MUST NOT use a network API. A Web Worker is a
  deferred optimization, not a current requirement or fallback boundary.
- `PROTMAP-06`: Camera interaction MUST hide and cancel stale map work; analysis MUST restart only
  after a 150 ms quiet period and MUST reject results from older request or scene revisions.
- `PROTMAP-07`: The precision control MUST expose five integer levels and MUST start every new
  camera/configuration revision at level 1 without resetting the user-selected target level.
  Level 1 MUST sample one representative cell from each
  8x8 block of an output grid bounded by 384x256 and project that result across the unsampled block.
  Levels 2 through 5 MUST cover the remaining 63 disjoint positions in every 8x8 block, cache both
  partial cursors and completed snapshots under the same analysis revision, and MUST NOT resample a
  previously evaluated ray. Each refinement slice MUST stop after 300 ms, preserve its partial
  cursor, distribute newly sampled offsets across the viewport before concentrating them locally,
  and resume only after at least 600 ms of continued stable viewing. Until an 8x8 block is fully
  sampled, its visible categorical cells MUST be reconstructed from the block's evaluated samples
  instead of exposing sparse sample pixels as isolated holes; fully sampled level-5 cells MUST
  preserve the exact per-ray classifications. Across all five levels,
  the cumulative sample count MUST equal at most one 384x256 output grid rather than five full passes.
  The UI MUST distinguish the requested precision from the last fully completed precision while
  refinement remains in progress and MUST display completed/target sample counts. Idle continuation
  MUST stop at the selected target and MUST NOT raise or compute beyond that target.
- `PROTMAP-08`: Map cells MUST be uploaded as a GPU texture and composited by a single static overlay
  draw without creating a continuous animation loop after the scene becomes unchanged. Because cell
  codes are categorical, edge smoothing MUST interpolate per-class coverage after nearest-code
  decoding and MUST NOT linearly interpolate raw code values or brighten an entire boundary cell.
- `PROTMAP-09`: Protection-map analysis MUST pass an empty radial-candidate set. This contract does
  not require a dedicated radial-damage disclosure in the compact Viewer UI.
- `PROTMAP-10`: A protection-map frame-budget or client-compute failure MUST leave 3D viewing and
  exact single-shot analysis usable while reporting the distribution map as unavailable.
- `PROTMAP-11`: Track and wheel damageable components resolved through `Armor_tracks` or `Rubber`
  MUST participate in armor and protection views as visible geometry. They MUST render with lower
  opacity and without depth writing so that they remain legible without obscuring hull protection;
  this presentation rule MUST NOT promote their component damage into hull damage.

## Contract Coverage

- [behavioral] `tests/viewer/protection-map.test.mjs` enforces `PROTMAP-02`, `PROTMAP-03`, and
  `PROTMAP-07` through deterministic classification and scheduling-budget tests.
- [static] `tests/viewer/protection-map-contract.test.mjs` enforces `PROTMAP-04..PROTMAP-10` through
  source-boundary checks for mesh scope, client frame budget, cancellation, GPU overlay, and radial exclusion.
- [behavioral] `tests/viewer/protection-map-geometry.test.mjs` enforces `PROTMAP-01` and
  `PROTMAP-04` with camera-angle, off-screen, and interior-only geometry fixtures.
- [behavioral] `tests/viewer/viewer-component-appearance.test.mjs` and
  `tests/contracts/viewer-data-contract.test.mjs` enforce `PROTMAP-11` through low-opacity rendering
  and exposed-mobility projection fixtures; `tests/rules/squad-armor-rules.test.mjs` pins the
  component-only damage result.
- [manual] Browser profiling of camera drag, five-level idle refinement, idle rendering, client
  compute budget failure, and exact-click continuity covers `PROTMAP-05..PROTMAP-10` until a
  deterministic browser performance harness exists.
