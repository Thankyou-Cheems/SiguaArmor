# Current vehicle root facts

The encyclopedia's current-root section loads shared data through
`loadWikiVehicleRootObservation` in `lib/wiki-source.ts`. The selected card,
raw variant and runtime vehicle must resolve to one exact source vehicle and
generated class. A small Wiki index then names one immutable record by URL,
byte length and SHA-256. A missing record is unavailable; a mismatched record
is an error. There is no bundled fallback.

The section displays selected loaded-CDO health, repair, radial-damage flag,
source seat configurations and damage-type rows. Zero, false, null and unknown
remain distinct. Driver/additional source indexes do not assign F-numbers,
crew roles, Station parents or weapon ownership. The serializer's None reference
is displayed as an unrecorded reference; it does not establish pointer validity
or the absence of a native fallback. Native serializer numbers do not claim
roundtrip precision or game-runtime verification.

This section loads independently of legacy reference data and weapon equipment.
Its observations do not replace the general data passed to hit calculations,
Station Graphs, weapon profiles, camera, models or armor geometry. The index
has a short cache lifetime; immutable records reuse their content identities.
Changing a selected variant clears the previous fact display while it loads.

Publish the compatible Wiki index and its complete record closure before
deploying this consumer. Product source validation and a production build do
not replace the required real-browser and console acceptance in `AGENTS.md`.
