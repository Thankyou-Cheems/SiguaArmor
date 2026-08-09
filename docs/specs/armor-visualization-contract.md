# Armor Visualization Contract

Status: Amended (2026-07)
Owner: maintainers
Prefix: `ARMVIS-`

## Scope

This specification governs how Editor-derived hit-runtime armor surfaces are classified and rendered in
the browser armor view, including the continuous nominal-thickness scale, spaced-armor markings,
hover disclosure, and categorical legend entries.

## Non-goals

- This specification does not define penetration, damage, ricochet, or fragmentation formulas.
- This specification does not govern exterior PBR materials or interior component colors.
- This specification does not authorize guessed surface semantics when Editor evidence is missing.

## Normative Clauses

- `ARMVIS-01`: A surface with a finite `armorThicknessMm` MUST retain the RGB and nominal thickness
  produced by `armorThicknessStyle()` when any additional semantic marking is applied. The base
  per-vertex opacity MUST remain the value from `armorThicknessStyle()`; the renderer MAY apply the
  dedicated spaced-armor alpha scale at composition time so surfaces behind an add-on plate remain
  readable.
- `ARMVIS-02`: A surface MUST be classified as spaced armor only when its component
  `semanticKind` is `armor`, `allowPenetration` is explicitly `true`, `damageParentActor` is
  explicitly `false`, and `damageAbsorbed` is a finite value greater than zero.
- `ARMVIS-03`: Spaced armor MUST use `patternCode=3` as a screen-space dashed emissive outline on
  its topology boundaries and sharp creases in the existing hit-runtime draw, MUST leave the face interior
  unpatterned, and MUST NOT add a mesh, draw call, texture, or geometry copy.
- `ARMVIS-04`: Hovering a spaced-armor surface MUST strengthen only that surface profile's outline
  and disclose its nominal thickness, `damageAbsorbed`, and that it does not directly reduce hull
  health.
- `ARMVIS-05`: The armor legend MUST show a separate spaced-armor dashed-outline sample without changing
  the continuous thickness bar or its ticks.
- `ARMVIS-06`: A NoPen blocker MUST use the blocker presentation when either its component semantic
  is `penetration-blocker`, or its observed effective physical material identifies NoPenetration and
  `allowPenetration=false`. A generic `gun-collision` component name MUST NOT suppress that material
  evidence. Ordinary gun collision using `PhysMat_Default` MUST retain its quiet adjunct presentation.
  NoPen blockers, unknown surfaces, tracks, wheels, and gun-collision geometry MUST NOT be classified
  as spaced armor.
- `ARMVIS-07`: In armor mode, spaced armor MUST use the dedicated alpha scale while remaining in the
  translucent overlay, so non-spaced armor and component surfaces behind it are rendered instead of
  being visually buried by the add-on plate; its dashed topology-outline core MUST remain opaque.
- `ARMVIS-08`: The thickness legend MUST use a presentation-only piecewise axis that assigns 55% of
  the bar to 0–150 mm and the remaining 45% to 150–800 mm. Legend colors and ticks MUST use that
  same presentation axis, and this compression MUST NOT alter `armorThicknessStyle()`, surface RGB,
  or the normalized thickness stored for rendering.

## Contract Coverage

- [behavioral] `tests/viewer/hit-scene-render-batches.test.mjs` enforces `ARMVIS-01`,
  `ARMVIS-02`, `ARMVIS-03`, and `ARMVIS-06` against real ZVT-9A, M1A2, M1126, M60T, and ZLB-08 hit-runtime records,
  including generically named NoPen meshes, add-on armor, and ordinary gun-collision exclusions.
- [behavioral] `tests/viewer/armor-thickness-ramp.test.mjs` enforces `ARMVIS-08` by pinning the
  independent legend axis while preserving the surface-rendering normalization.
- [static] `tests/viewer/hit-scene-three-renderer.test.mjs` enforces the one-draw shader path,
  profile-specific hover uniform, hover disclosure, and legend required by `ARMVIS-03..ARMVIS-05`.
- [manual] Browser smoke on ZVT-9A side skirts and turret spaced ERA covers the final dashed glow
  outline, unpatterned face interior, unchanged thickness colors, hover emphasis, and readable disclosure for
  `ARMVIS-01`, `ARMVIS-03`, and `ARMVIS-04`.
