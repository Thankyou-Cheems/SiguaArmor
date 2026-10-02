# Interface localization

The first localization slice supports Simplified Chinese (`zh-CN`), Traditional Chinese (`zh-Hant`), and English (`en`) using pinned i18next 26.4.2. This is a progressive rollout, not a claim that every product screen or shared data label is translated.

## Covered surfaces

- Catalog edition/tool navigation, language selector, global vehicle search, faction selection, empty/error/retry states, accessibility labels and usage help
- Vehicle detail wrapper and 3D-data loading indicator
- Shared international header, duel/ranking entry links and daily-active display

The detailed encyclopedia, protection-analysis controls, duel/ranking screens, administrator interface, footer legal prose and runtime announcements remain outside this slice. Shared vehicle/faction/weapon names and community aliases retain the existing Wiki-authoritative values. Approved multilingual names must be added to the Wiki contract by stable identity before consumers display them; do not derive IDs or routing from translated text or make a product-local name registry.

## Runtime contract

`SiteLanguageProvider` owns one i18next instance per mounted root. Static HTML and the first hydration render use the same Chinese resources. Browser preference detection runs after hydration; an explicit stored preference wins over `navigator.languages`. Language preference is stored per origin under `sigua.ui-language`, independently of the China/international edition and of any Squad source version. This does not synchronize localStorage across separate product origins.

English and Traditional Chinese resources are emitted as separate, lazy language/namespace chunks. The Chinese fallback stays bundled so missing translations do not produce blank labels. Namespaces are requested by their mounted UI consumers. Failed chunk loads retain the current language and can be retried. Concurrent selections are latest-request-wins, including superseded failures. A namespace mounted during a pending selection is loaded before committing that selection.

Locale updates only notify translation consumers. They do not mutate URLs, stable IDs, data caches, underlying numerical values, query inputs or the selected vehicle/faction. The root does not use a locale-dependent React key. Analytics display uses `Intl.NumberFormat` for presentation only; the original stored count is unchanged. i18next interpolation is rendered through React text nodes, with no translated HTML or remote translation service.

## Verification

- `npm run typecheck`
- `npm test`, including dictionary parity/interpolation, normalization, fallback, lazy-cache, concurrency, offline retry and non-remount dependency tests in `tests/viewer/site-i18n.test.mjs`
- React SSR/hydration DOM regression via jsdom: persisted locale, no recoverable hydration errors, input and numeric state, canvas-node identity, URL and blocked-storage behavior (`tests/viewer/site-i18n-dom.test.mjs`); this is not a real-browser/WebGL test
- `npm run lint` (for a constrained runner, lint changed source files separately and report that limitation)
- `npm run build` and `git diff --check`

Before release, use a real browser to verify all three languages on desktop and narrow screens, keyboard selection, persistent preference after reload, both edition routes, search and faction state, Back/Forward, rapid selections, offline language chunks, storage unavailable, and switching with an already-loaded 3D scene. Confirm there are no hydration/console errors, scene replacements or repeated Wiki/catalog requests caused by language changes. Static/unit checks do not replace this browser release gate.
