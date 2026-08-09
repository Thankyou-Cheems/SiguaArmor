# Faction Selector Contract

Status: Amended (2026-07)
Owner: maintainers
Prefix: `FSELECT-`

## Scope

This specification governs the homepage faction entry experience in `app/CatalogApp.tsx`, its
responsive presentation in `app/globals.css`, and the local-preview derivative of the official
five-faction impression image.

## Pinned Asset Evidence

- Source page: `https://sigua.qq.com/`, 游戏特色 / 玩法展示 / 第二栏.
- Source asset: `https://game.gtimg.cn/images/squad/cp/a20260407zsxd/feature-img/bg4-14.jpg`.
- Local preview: `public/local-preview/official/faction-impression.jpg`, 2560×1440, 453,653 bytes,
  SHA-256 `9074b147576a681bd251638c62db142f80a18a3957b32fd2e4f1885c749854f7`.
- Hover foregrounds: `public/local-preview/official/factions/*-foreground-<sha12>.webp`; five cropped,
  alpha-bearing derivatives whose visible RGB pixels come from the pinned official image. Final alpha
  edges are source-registered local segmentations, with enclosed transparent regions filled before
  export, then contracted by at least one source pixel and feathered only inward by approximately one source
  pixel; image generation may identify semantic scope but MUST NOT supply an
  unregistered final matte or redraw visible artwork.
- Dock Logos: `public/local-preview/official/factions/*-logo.webp`; five 360×440 derivatives built
  as full-bleed official flag crops with complete source Logos. Source-fabric edge extension may fill
  the lower inverted-house tip, but inset crops, picture-in-picture rectangles, and blurred backings
  are forbidden.
- Selected catalog backgrounds: `public/local-preview/official/factions/*-catalog-background.jpg`;
  five unchanged 2560×1440 official JPEGs mapped as `bg4-41 → agesi`, `bg4-42 → ekeqie`,
  `bg4-43 → shenzhou`, `bg4-44 → arctic-union`, and `bg4-45 → kaweier`.
- Derivative dimensions, source coordinates, byte sizes, and SHA-256 values are pinned in
  `public/local-preview/official/factions/manifest.json`.
- Shared display typography for the first viewport, vehicle-encyclopedia titles, dock return label,
  footer identity, filing link, and help heading uses the OFL-1.1 `LogoSCUnboundedSans.ttf` v1.100
  source, reduced to the 14,376-byte subset
  `public/fonts/sigua-unbounded-first-viewport-2f132be9.woff2`; source and subset hashes, included
  text, and license path are pinned in `public/fonts/manifest.json`.
- Access is `public / authorized / publish public` following the 2026-07-17 release approval.

## Non-goals

- This specification does not change promotional catalog membership, faction identity, or vehicle data.
- This specification does not authorize publication while the image provenance remains
  `public / authorized`.
- This specification does not permit five duplicated full-canvas hover photographs; foreground
  derivatives must remain tightly cropped so transparent pixels do not create five 2560×1440 GPU surfaces.

## Normative Clauses

- `FSELECT-01`: With no faction selected, the homepage MUST devote the first viewport to a five-way
  faction selector rendered from `/local-preview/official/faction-impression.jpg`.
- `FSELECT-02`: The selector MUST map the official image from left to right to `ekeqie`, `agesi`,
  `shenzhou`, `arctic-union`, and `kaweier`.
- `FSELECT-03`: Pointer hover or keyboard focus on a faction MUST brighten and enlarge an alpha-masked
  foreground containing that faction's complete visible person, weapon, equipment, and matching flag;
  the matte MUST stay registered to the source pixels and MUST preserve the flag's Logo, emblem, stripes,
  folds, and other fabric details as opaque visible source pixels while dimming the remaining image;
  its alpha MUST retain fully transparent and fully opaque interiors while contracting the exterior
  edge by at least one source pixel and feathering only inside that registered silhouette; it MUST NOT contain
  enclosed transparent components inside the registered foreground silhouette or extend a bright
  source-background fringe beyond it; visible weapons or equipment
  MUST NOT be accepted as background merely because a transparent component reaches the asset edge,
  and source-space opaque samples for such edge-connected details MUST be pinned in the derivative
  manifest and decoded from the exported WebP; any previously observed exterior flag-background
  fringe MUST likewise have source-space transparent samples pinned and decoded from the derivative;
  fixed-width column clips,
  rectangular highlight masks, generated-but-unregistered final mattes, and tight artificial edge
  outlines or bright diffuse outer glows MUST NOT be used, while a restrained dark separation shadow
  MAY be applied.
- `FSELECT-04`: Selecting a faction MUST filter the visible catalog to that faction, clear any open
  vehicle detail, collapse the first viewport into the top faction dock, and reveal the catalog from below.
- `FSELECT-05`: The selected-state dock MUST expose five inverted-house flag controls using dedicated,
  full-bleed official-image Logo derivatives that keep the complete Logo visible without cropping at
  the narrow viewport, and every control MUST switch factions.
- `FSELECT-06`: The dock cancel control and `Escape` with no vehicle detail open MUST clear faction,
  query, and vehicle selection and restore the initial five-person selector; `Escape` MUST move focus
  to the selector title rather than the full-height faction hit area so keyboard focus does not draw a
  viewport-spanning outline.
- `FSELECT-07`: Every faction choice MUST be a keyboard-operable button and all selector transitions
  MUST collapse to effectively instant state changes under `prefers-reduced-motion: reduce`.
- `FSELECT-08`: The active dock control MUST be immediately distinguishable through a bright enclosing
  outline, stronger luminance, and a larger silhouette while inactive controls remain visibly subdued;
  hover and keyboard focus MUST reveal inactive controls without matching the active emphasis.
- `FSELECT-09`: After selection, the catalog MUST use the matching official faction scene as its
  darkened, vertically fading background while referencing only the active faction's scene URL in the
  rendered style so the browser does not fetch all five backgrounds on initial page load.
- `FSELECT-10`: When same-document view transitions are available, entering or leaving the selected
  state MUST use the selected alpha foreground and its matching dock flag as a single shared visual
  that contracts into, or expands out of, the compact flag control while the surrounding shell
  crossfades; implementations without that API MUST retain a coordinated stage/dock fallback, and
  reduced-motion preference MUST bypass the shared animation.
- `FSELECT-11`: The selected-state dock MUST overlay the active catalog scene through a translucent,
  blurred mask and MUST NOT reserve an opaque spacer band above the catalog.
- `FSELECT-12`: Every dock flag MUST remain fully visible at its active emphasis scale without being
  clipped by the collapsed selector or dock container.
- `FSELECT-13`: The active faction name MUST appear once as the prominent dock heading, and the catalog
  controls MUST NOT render a second visible faction or feature heading below it.
- `FSELECT-14`: With no faction selected, the selector header MUST provide a global vehicle search in
  place of a static catalog-count block; it MUST search all 25 promotional records by official name,
  selected third-party display name, curated common name, full pinyin, and pinned pinyin-initial
  abbreviations for those common names without requiring a full pinyin dictionary in the initial client
  bundle. Common abbreviated callouts such as `bldl` MUST resolve to the corresponding vehicle.
- `FSELECT-15`: Global-search results MUST identify both vehicle and faction so duplicate names remain
  distinct; activating a result by button or `Enter` MUST select its faction and open that exact vehicle,
  `ArrowDown` MUST move from the input to the first result, and `Escape` MUST clear the global query.
- `FSELECT-16`: Initial-selector faction labels MUST omit ordinal numbers and vehicle-count captions,
  render the full faction name as large CSS gradient text using the self-hosted faction-name WOFF2
  subset, and form a downward arrow arrangement by raising the two edge labels above the two inner
  labels while leaving the center label lowest. The edge labels MUST be allowed to visually stack above
  the inner labels (with a higher visual stacking order) without clipping their text; these visual offsets
  MUST NOT change the five equal-width pointer and keyboard hit areas.
- `FSELECT-17`: The initial selector MUST show only the text “选择你的阵营” as its centered heading,
  position that heading at the top of the first viewport, and render it with the same self-hosted WOFF2
  display-font/gradient rule as the faction names with sufficient line height and bottom padding to keep
  the complete glyph visible; kicker and instructional copy MUST be absent.
- `FSELECT-18`: Every change to first-viewport font-subset bytes or glyph coverage MUST change the
  content-addressed WOFF2 filename used by both `@font-face` and preload so a cached older subset cannot
  silently force newly added text onto a fallback font.
- `FSELECT-19`: The selected-state dock brand MUST retain the complete 铁皮饭堂 wordmark without
  cropping and MUST render the active faction name with the same self-hosted display font, gradient,
  and non-clipping line-box treatment used by the initial selector faction names.
- `FSELECT-20`: The selected-state dock MUST group a global vehicle search with the return control;
  that search MUST retain the all-faction name, common-name, and pinned-pinyin behavior and MUST open
  an exact result even when it belongs to another faction. The return control MUST visibly identify
  `ESC`, while the catalog body MUST NOT render a second faction-only search control.
- `FSELECT-21`: The selected catalog footer MUST expose the two-person vehicle-crew artwork as a
  compact, keyboard-operable help trigger in the lower-right corner. It MUST use a transparent,
  optimized derivative no larger than 320 pixels or 25 KB rather than loading the former 1800×900
  catalog composition, MUST add only a subtle feathered alpha-edge treatment, and MUST reveal concise
  usage guidance without reintroducing the crew artwork above the vehicle catalog.
- `FSELECT-22`: Every change to faction-foreground WebP bytes or alpha integrity MUST change the
  foreground URL. Each foreground filename MUST include the first 12 hexadecimal characters of its
  manifest SHA-256; mutable `*-foreground.webp` paths MUST NOT be referenced so corrected mattes cannot
  remain visually stale in browser or delivery caches.
- `FSELECT-23`: The full-height transparent faction-choice button MUST NOT draw a viewport-spanning
  browser focus outline; keyboard focus MUST remain visible through the same bright label, foreground,
  and elevated stacking treatment used by the selector's `:focus-visible` state.

## Contract Coverage

- Test environment: ImageMagick 7's `magick` executable MUST be available on `PATH` for direct WebP
  alpha decoding; a manifest-only assertion is not sufficient evidence for `FSELECT-03`.
- [behavioral] `tests/rendered-html.test.mjs` enforces `FSELECT-01`, `FSELECT-02`, `FSELECT-04`,
  `FSELECT-05`, and `FSELECT-06` through server-rendered structure, full-bleed Logo composition,
  official-image and derivative integrity, source-state assertions, and distinct pointer/keyboard
  exit focus targets.
- [behavioral] `tests/rendered-html.test.mjs` enforces `FSELECT-03` through pinned foreground bytes,
  source-space geometry, direct WebP alpha decoding of every opaque Logo region, alpha-range,
  inward-feather, and enclosed-hole checks, direct opaque-sample checks for visible equipment connected to an asset edge,
  and direct transparent-sample checks for known flag-edge fringes,
  plus static bans on fixed-column clips and tight portrait outlines.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-07` and `FSELECT-08` through hover/focus
  selectors, keyboard buttons, reduced-motion CSS/source contracts, and distinct active/inactive filters.
- [behavioral] `tests/rendered-html.test.mjs` enforces `FSELECT-09` through real background-asset
  byte/hash integrity.
- [static] `tests/rendered-html.test.mjs` enforces the `FSELECT-09` source-to-faction mapping,
  active-only style selection, and fade/size CSS contract.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-10` through a unique active-faction shared
  transition name, synchronous old/new state capture, coordinated shell fallback, and explicit
  unsupported-browser/reduced-motion bypasses.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-11..FSELECT-13` through the zero-height
  transparent selector, fixed translucent/blurred dock, overflow and transform-origin rules, and a
  single prominent `catalog-title` owned by the dock.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-14..FSELECT-15` through the global-search
  source structure, curated alias/pinyin index, removal of the static scope block, duplicate-result
  faction labels, and the exact faction-plus-vehicle transition state update.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-16` through the absence of ordinal/count
  label children, pinned WOFF2 bytes and hash, preload and `font-display: swap`, gradient text CSS,
  edge/inner/center rise values, and the unchanged five-column hit-area grid.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-17` through the single heading copy, absence
  of kicker/instructional children, top-center positioning, shared display-font variable, and gradient
  text declarations with non-clipping line-box padding.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-18` through the hash-suffixed manifest path,
  matching `@font-face` and preload URLs, and a ban on the former mutable WOFF2 URL.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-19..FSELECT-20` through the complete dock
  wordmark source, shared display-font/gradient selector, dock search and return-control grouping,
  visible `ESC` key hint, selected-state cross-faction result update path, and removal of the former
  catalog-body search copy.
- [behavioral] `tests/rendered-html.test.mjs` enforces `FSELECT-21` through the help trigger's expanded
  state and controlled panel, absence of the former catalog crew visual, optimized derivative byte/hash
  manifest pins and size bounds, and the CSS alpha-mask/drop-shadow feather treatment.
- [behavioral] `tests/rendered-html.test.mjs` enforces `FSELECT-22` by matching each foreground
  filename's hash suffix to its manifest SHA-256 and banning former mutable foreground URLs in both the
  rendered page and client source.
- [static] `tests/rendered-html.test.mjs` enforces `FSELECT-23` through a focus-outline reset scoped to
  the full-height choice hit area and the retained label/foreground `:focus-visible` selectors.
- [manual] Desktop and narrow-viewport browser smoke tests cover the visual crop, Logo legibility,
  full edge-faction silhouettes, hover isolation, upward reveal, dock switching, unclipped active flag,
  catalog-scene continuity, global-search result usability, and cancel restoration for
  `FSELECT-01..FSELECT-23`.
