# Public Viewer Data Contract

Status: Active (2026-08-01)
Owner: maintainers
Prefix: `VIEWDATA-`

## Scope

This contract governs the public catalog, the exact vehicle identity carried into the
browser viewer, RuntimeProbeMap-derived visual descriptors, and split hit-runtime artifacts.
Canonical vehicle and weapon data remain the source of catalog truth. RuntimeProbeMap evidence
is the source boundary for browser visual and hit-runtime projections; native server behavior
that has not been observed remains `native-unknown`.

## Normative clauses

- `VIEWDATA-01`: Catalog records MUST preserve exact `cardId`, `rawName`, `runtimeVehicleRef`,
  and `visualArtifactRef` identities. A missing or mismatched identity MUST fail closed.
- `VIEWDATA-02`: Faction catalog documents MAY be fetched on demand. Opening a vehicle MUST
  request only the selected vehicle's visual source module and the independently addressed hit
  runtime artifacts; it MUST NOT statically import the complete visual placement indexes.
- `VIEWDATA-03`: `app/runtime-probe-visual-delivery-index.json` is a compact navigation index.
  It MAY contain selector/status/hash metadata, but MUST NOT contain visual placements. The
  selected `app/runtime-probe-visuals/*.visual.json` source MUST be loaded by exact file identity.
- `VIEWDATA-04`: China visual descriptors and localhost review descriptors MUST remain dynamic
  edition/review imports. An international production viewer MUST NOT import either aggregate
  index during module initialization.
- `VIEWDATA-05`: Complete weapon selection remains available through the canonical compact
  weapon/source index. Visual delivery partitioning MUST NOT filter, guess, or silently remove
  valid weapon options. Selected attacker references MUST retain exact source identity.
- `VIEWDATA-06`: The browser hit closure is `hit-scene-runtime/v1`: one record plus separate
  geometry and BVH artifacts, each independently byte/hash verified. Runtime loading MUST keep
  `native-unknown` explicit and MUST NOT promote a cache hit or solver completion to native truth.
- `VIEWDATA-07`: RuntimeProbeMap extraction MUST build hit inputs directly from validated evidence
  in memory. HSP containers, legacy hit-pack adapters, guessed offsets, and external default
  reference roots are not active inputs.
- `VIEWDATA-08`: Static-hit fleet builds MUST receive an explicit hash-verified
  `runtime-probe-reference-input/v1` manifest. The manifest records staging, promotion scope,
  and the builder inputs used for the run; an implicit sibling checkout is invalid.
- `VIEWDATA-09`: Visual placement selection, synchronized weapon suppression, chassis pose, and
  hit geometry MUST use evidence-backed fields. Component-name or material-path regexes MUST NOT
  manufacture gameplay semantics.
- `VIEWDATA-10`: Public release preparation MUST reject legacy semantic tokens and `.hsp` files,
  but it MUST not rewrite old text into a new semantic label. Stale records are rejected or
  regenerated from current RuntimeProbeMap evidence.
- `VIEWDATA-11`: Protection-map and direct-shot computation remain entirely in the user's browser.
  The current implementation uses bounded main-thread frame slices and demand rendering; no
  server computation or browser Worker is required by this contract.
- `VIEWDATA-12`: Every support-air binding MUST resolve through the hash-bound runtime collision
  census and availability index. CAS or UAV actors with disabled, zero-scale, or absent
  projectile-blocking geometry MUST display the exact unavailable reason; a visible aircraft mesh
  MUST NOT be substituted as hit geometry.
- `VIEWDATA-13`: A native primitive MAY enter the hit runtime only when an exact component policy
  binds its promo source, generated class, runtime lifecycle evidence, collision profile/object,
  `ECC_PROJECTILE` block response, shape kind, and dimensions. Its deterministic tessellation MUST
  preserve the Editor component transform. Missing physical-material evidence remains unavailable
  and MUST NOT be inferred from the visible model.

## Generated boundaries

- Canonical vehicle/weapon data: `generated/internal/`, `lib/vehicle-source.mjs`, and
  `lib/weapon-catalog.ts`.
- Catalog projection: `generated/catalog-index.json`, faction documents under `public/catalog-data/`,
  and their versioned data revisions.
- Visual navigation: `app/runtime-probe-visual-delivery-index.json`.
- Visual source records: `app/runtime-probe-visuals/*.visual.json`.
- Hit navigation: `app/runtime-probe-hit-release-index.json` and
  `app/support-air-hit-release-index.json`; payloads remain record/geometry/BVH artifacts.
- Support-air availability: the final public
  `app/support-air-hit-availability-index.json`; its research evidence and extraction
  receipts remain in SiguaResearch.
- Extraction and native reconstruction belong to SiguaResearch. This repository keeps
  only the accepted browser indexes and content-addressed payloads.

## Contract coverage

- `tests/viewer/runtime-visual-lazy-load.test.mjs` and the focused source checks MUST pin that
  appearance resources remain deferred and analysis textures use placeholders.
- `tests/viewer/runtime-weapon-source-index.test.mjs` MUST pin complete source identity and
  selector coverage.
- `tests/tools/support-air-hit-runtime.test.mjs` MUST pin the final split artifact
  declarations, all 44 availability bindings, the 12 hit-runtime bindings, and the 32
  explicit no-hit bindings.
- Release finalization MUST reject retired HSP artifacts and legacy semantic descriptors.

This contract describes current public boundaries. It does not authorize publishing ignored
Editor evidence and does not turn static geometry or browser classification into native server truth.
