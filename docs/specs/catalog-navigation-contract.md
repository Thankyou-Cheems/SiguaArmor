# Catalog Navigation Contract

Status: Active (2026-07-18)
Owner: maintainers
Prefix: `NAV-`

## Scope

This specification governs public catalog deep links, browser-history restoration, and Viewer analysis
query state.

## Non-goals

- This specification does not change catalog membership, vehicle identifiers, armor semantics, or
  the content of Editor-derived runtime assets.
- It does not add a request-time router, redirect service, short-link database, SSR, or edge function.
- It does not require camera position to update browser history continuously while the pointer is moving.

## Normative Clauses

- `NAV-01`: A selected faction MUST use `/factions/<group-id>` and a selected vehicle MUST use
  `/vehicles/<route-slug>` as its canonical same-origin path; route slugs MUST map uniquely to one
  exact card ID.
- `NAV-02`: Initial load, refresh, and `popstate` MUST restore the same faction and exact vehicle;
  legacy `/?faction=<group-id>&vehicle=<card-id>` URLs MUST remain readable.
- `NAV-03`: Vehicle URLs MUST accept and restore bounded legacy `view`, `attacker`, `weapon`,
  `distance`, `yaw`, and `pitch` query parameters as well as the canonical compact aliases `v`, `a`,
  `w`, `d`, `y`, and `p`. Faction/vehicle selections MUST create history entries, while high-frequency
  analysis and camera changes MUST replace the current entry.
- `NAV-04`: `view` MUST be one of `armor`, `interior`, `exterior`, or `protection`; `distance` MUST
  be clamped to `0..4000`, yaw MUST be normalized to `-180..180`, pitch MUST be clamped to
  `-85..85`, and malformed values MUST fall back without preventing catalog or Viewer loading.
- `NAV-05`: TencentCloudPublic Caddy MUST serve the same application document for desktop and
  mobile requests to `/factions/*` and `/vehicles/*`; user-agent or client-hint routing MUST NOT
  replace those routes with a separate document.
- `NAV-06`: Newly generated vehicle URLs MUST omit default Viewer state, use one-character mode and
  base-36 catalog/weapon indices when those indices are available, and remain readable without a
  request-time short-link service or server-side state.
- `NAV-07`: Up to five retained hit paths MUST be shareable in the `s` parameter as one versioned,
  URL-safe token containing each quantized entry point, octahedrally encoded direction, and shot
  distance plus the active-path index. Five paths MUST require no more than 82 token characters;
  malformed, unknown-version, or out-of-bounds tokens MUST be ignored without blocking Viewer load.
