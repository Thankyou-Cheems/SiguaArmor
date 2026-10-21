# Narva school resource reuse — 2026-10-21

## Current continuation: renderer accepted locally, resource access published

This section supersedes the preparation-only and CORS-blocked observations below.
The active production school still uses its accepted legacy Query bundle.
Refreshed Query, firing/collision acceptance and dedicated-file retirement wait
for the full-map owner's result.

The deployed view SHA is `1490299d5f3405b91d4a1daffd7af41137dd028350a174e4e98e46c0d1958141`:
138 records, 61 original Calc objects, 2,339,944 referenced transport bytes and
1,460,321 metadata bytes; zero copied binary payloads. A new open observes the
stable entry; no mid-shot update or mixed-version partial scene is admitted.

`prepareSchoolDisplay` and the existing `createNarvaSchoolEnvironment` entry now
accept a verified resource display. The local fixture uses Calc's actual
FixedDisplayStore stability, spline, terrain and SoftVegetationScene readers.
SGFD Source-local metres receive the shared UE-to-Armor conversion once; Calc
vegetation already in render-world metres receives one group conversion. World
poses remain producer inputs; this does not reconstruct UE parent/local
FTransform desired-scale semantics. Geometry is deduplicated, terrain vertices
compacted, crossing fragments clipped at the school rectangle, and resources
and workers disposed with the environment. Viewer clipping follows this kind.

Actual local browser: 113 rigid placements including six splines, one terrain,
source vegetation/grass; direct Source-point versus rendered matrix maximum
error 0.000002516855 metres. The frame has 76 draws, 12,133,889 triangles and no
WebGL error. This full-resident correctness fixture does not qualify production
performance. Clipping fixed visible out-of-scope floating vegetation. Evidence
is in the task worktree's `outputs/school-resource-view/`.

Run `node tools/qa/verify-school-resource-view.mjs <producer-config.json> --serve`
for the local existing-byte fixture. Separately, the real Armor-origin page
imported the published Wiki reader and made 63 unique HTTPS requests (entry,
view, 61 objects). Every identity and preparation passed; the partial-display
Query gate rejected activation. Calc now admits exact Armor GET/HEAD with no
credentials on this finite closure, using no-store until CDN Origin cache-key
behavior is explicitly qualified. See the linked gateway publication record.

Validation: 684 tests, type check and build pass; lint has two existing warnings.
Tests cover signed scale/asymmetric rotation, frame rejection, deduplication,
moved clipping planes and idempotent disposal. This candidate has no Armor
production activation. The future release job must generate its view from the
accepted exact display/Query tuple before changing the stable entry; old Wiki
school files remain until migration, cross-consumer audit and rollback review.

## Historical framework checkpoint (before the continuation above)

`lib/runtime-school-resource-view.ts` is an additive reader for Wiki's bounded-resource algorithm and Calc's future `map-data/views/narva-school.json` entry. This follows the owner's explicit request to reuse Calc Narva objects. It does not bundle a map snapshot or change the active school renderer.

The adapter fixes the school Source-cm rectangle and exact `Narva_AAS_v1` Layer. It checks the caller's accepted Query identity against the complete view before allowing use; partial display proofs or mixed source/display/server identities fail. The shared reader verifies downloaded byte lengths and SHA-256, deduplicates geometry requests within a session and revalidates the stable entry on a new open. No automatic mid-shot update occurs.

The shared generator and contract are [owned by Wiki](https://github.com/Thankyou-Cheems/SiguaWiki/blob/main/docs/map-resource-view.md). Research's offline producer bridge now reuses Calc's actual admitted World/delta/terrain/vegetation readers against a fixed existing publication. Its 138 school records reference 61 existing objects, all length/SHA verified; no payload is copied. The live packaging hook and actual renderer are still not connected. The current full-school display/native-query loaders remain active. Their native material/BVH/Actor/terrain semantics cannot be replaced by a display-only mesh reference.

Activation requires publishing the Wiki reader and Calc view, verifying Armor-origin CORS/authorization, testing the full new scope in the actual school renderer and checking firing/collision with the matching Query. The old dedicated files are served by Wiki; retire them only after a cross-consumer reference audit and preserve rollback. This code is framework preparation, not a claim of production migration or old-data removal.

Observed current blocker: the exact Calc goal geometry responds 200 but omits `Access-Control-Allow-Origin` for `https://armor.siguad.icu`. Configure scoped origin access with the view's publication; do not add an unrestricted proxy or silently fall back to a duplicate school snapshot.

The adapter now prepares every selected dependency before returning a candidate to the caller; failed downloads cannot return a partially prepared scene. The shared reader limits concurrent fetches and deduplicates by resource identity. Fixed-publication offline pairing and preparation pass, while `partial-display` still rejects Query activation. Source quaternions remain raw with explicit display normalization; ordinary SGFD vertices remain Source-local metres and require the display reflection only after Source TRS. This is not a rendered-parity result.

Read-only service inspection found a foreign-Origin gate and no view route in Calc's finite ledger. The [specific gateway/CORS plan](https://github.com/Thankyou-Cheems/SiguaWiki/blob/main/docs/map-resource-view-cors.md) covers the two metadata paths, their finite resource closure, exact Armor origin, GET/HEAD without credentials, cache variants, tests and rollback. No production security setting was changed.
