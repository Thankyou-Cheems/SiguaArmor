# Coordinate boundaries

Shared pure axis/unit code is authored in Wiki `algorithms/coordinates/basis.js` and bundled byte-for-byte as `lib/shared/coordinate-basis.js`. This is a few-KB build-time algorithm, with no game-data snapshot, runtime fallback, external dependency or extra request. Wiki remains the reusable algorithm owner. The source receipt binds SHA-256; ordinary tests reject drift. Review source changes, then use:

`npm run sync:coordinate-basis -- --source <reviewed-Wiki-worktree> --write`

`npm run check:coordinate-basis -- --source <reviewed-Wiki-worktree>`

Omitting the source verifies the bundled receipt offline. Do not modify the bundled copy independently. Runtime data and assets still load through wiki-source.ts. This source-only candidate is not a Wiki publication or Armor deployment.

UE cm and UE m retain XYZ, X forward/Y right/Z up. Armor UE-export glTF m uses X/Z/Y, Y up. Wiki render m uses X/-Y/Z, Z up. Named adapters express format boundaries; never select a rule by map/product identity. Directions retain length; affine matrices use column-major column-vector B M B^-1; quaternions use reflection parity. Source normalization remains in callers.

Preserve space/origin/pose/baked state separately: vehicle-local and actor-world cannot be joined by an axis adapter. Anchors are subtracted in source space once. Exported glTF, grounded parent-local matrices and cached display geometry are already converted. Skeleton parent chains, inverse binds, pivots and attachment transforms remain authoritative. A negative determinant requires the existing geometry winding/tangent handling; this helper does not mutate geometry or normal maps. Nonuniform pose normals use inverse-transpose. Camera FOV, UMG pixels, UV and screenshot projection retain their own contracts/calibration.

Adopted boundaries: projectile point/direction/inverse/frame, crew viewpoint, turret kinematics, school placement matrix. School terrain decoding and exported mesh decoding remain format-specific; native float32 sweep and rigid-body arithmetic stay source-space to preserve Engine precision. Existing geometry/pixels and all asset identities must be preserved. No assets are re-exported by this change.

Validation 2026-10-21: npm run typecheck, npm test (673/673), lint (zero errors; two existing runtime-preview-delays fixture warnings), production build and git diff --check passed. The final source receipt matches Wiki exactly. A seeded 1,000-case comparison preserves old serialized pose arrays and has zero projectile matrix difference. No performance gain is claimed without measurement. Local evidence logs are outputs-coordinate-tests.log, outputs-coordinate-lint.log, outputs-coordinate-build.log and outputs-coordinate-equivalence.json (untracked).

Real-browser/console/pixel QA was attempted at an isolated local port 5189 but could not run: in-app browser unavailable and connected browser inventory empty. The preview was stopped. This is the remaining rendered-change acceptance boundary; no production deployment occurred.
