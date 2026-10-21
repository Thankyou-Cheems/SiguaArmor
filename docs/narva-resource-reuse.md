# Narva school resource reuse — 2026-10-21

`lib/runtime-school-resource-view.ts` is an additive reader for Wiki's bounded-resource algorithm and Calc's future `map-data/views/narva-school.json` entry. This follows the owner's explicit request to reuse Calc Narva objects. It does not bundle a map snapshot or change the active school renderer.

The adapter fixes the school Source-cm rectangle and exact `Narva_AAS_v1` Layer. It checks the caller's accepted Query identity against the complete view before allowing use; partial display proofs or mixed source/display/server identities fail. The shared reader verifies downloaded byte lengths and SHA-256, deduplicates geometry requests within a session and revalidates the stable entry on a new open. No automatic mid-shot update occurs.

The generator and contract are [owned by Wiki](https://github.com/Thankyou-Cheems/SiguaWiki/blob/main/docs/map-resource-view.md). Its central Calc producer hook awaits the currently refreshed complete World/display/terrain census and exact Query publication. The current full-school display/native-query loaders remain active. Their native material/BVH/Actor/terrain semantics cannot be replaced by a display-only mesh reference.

Activation requires publishing the Wiki reader and Calc view, verifying Armor-origin CORS/authorization, testing the full new scope in the actual school renderer and checking firing/collision with the matching Query. The old dedicated files are served by Wiki; retire them only after a cross-consumer reference audit and preserve rollback. This code is framework preparation, not a claim of production migration or old-data removal.

Observed current blocker: the exact Calc goal geometry responds 200 but omits `Access-Control-Allow-Origin` for `https://armor.siguad.icu`. Configure scoped origin access with the view's publication; do not add an unrestricted proxy or silently fall back to a duplicate school snapshot.
