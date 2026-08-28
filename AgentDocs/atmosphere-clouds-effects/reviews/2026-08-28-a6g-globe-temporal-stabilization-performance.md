# A6-G Globe Temporal Stabilization and Performance Review

## Status

- Phase: `A6-G`
- State: `accepted; closed`
- Reviewer: Architecture Agent
- Open findings: `none; A6-AR-001 through A6-AR-004 closed`
- Owner visual gate: `passed on 2026-08-28`
- Phase plan:
  [A6-G phase plan](../plans/2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md)
- Decision:
  [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)

## Review boundary

Review the in-place evolution of the A4R Cloud history for bounded Globe
camera/cloud-motion reprojection, semantic A5 shadow-length filtering, exact
stationary/cut behavior, structured no-allocation compatibility state and the
frozen three-tier resource/performance budget.

Planar temporal work, a separate Beer-shadow history, velocity/third MRT,
automatic FPS adaptation, A7-G bloom/lens flare and A8-G qualification are
outside this review.

## Findings

### A6-AR-001 — History color is not clipped to the current neighborhood

`SceneGISEnvironmentEffectsCloudResolveFS.glsl` computes a 3x3 minimum and
maximum only for `distanceSample.xyz`. It then samples `historyColor`, applies
the broad radiance/transmittance compatibility thresholds, and blends that
unclipped value directly. This does not implement ADR-0048's required finite
current-neighborhood range for premultiplied radiance and transmittance, so a
temporally compatible but locally absent value can survive as a motion trail.

Execution must accumulate the finite 3x3 color/transmittance bounds and clamp
the sampled history color to those bounds before compatibility and blending.
The existing fixture must demonstrate the clamp with one controlled outlier;
no new standalone test or variance matrix is required.

### A6-AR-002 — The distance gate does not prove semantic reprojection

For a valid cloud the shader obtains one expected previous distance from the
mean cloud anchor, converts it to one scalar shift, and applies that same shift
to mean, front and scene distance. Those three values describe different world
positions and do not share one distance delta under camera translation or
rotation. The fixed `2 / 65535` tolerance also models integer normalization,
not RGBA16F distance storage; around an encoded distance of `0.5`, one half-float
step represents about `97.7 m`, while the current tolerance represents about
`6.1 m`. The gate can therefore reject the history that A6-G is intended to
reuse, or test the wrong front/scene correspondence.

The amended GPU fixture does not close this gap: its expected UV is calculated
from an arbitrary `5 km` point rather than the actual resolved mean anchor, and
it proves only that product and same-UV mutation attachments differ. It never
proves that a moved cloud-valid pixel retains a nonzero temporal contribution.

Execution must compare the actual mean/front/scene semantics in previous-frame
world or view space, with an explicit RGBA16F-aware bound, rather than reusing
one mean-distance shift. Amend the same fixture to expose the actual anchor/UV
and prove at least one moved cloud-valid sample survives the compatibility gate;
do not add a new test matrix or proxy score.

### A6-AR-003 — Shadow semantics are not independent

The cloud `distanceCompatible` predicate includes the shadow-length delta even
though ADR-0048 requires cloud validity/radiance and decoded A5 shadow length to
be selected independently. Conversely, `shadowHistoryWeight` checks only the
length delta and in-bounds reprojection. For invalid-cloud finite geometry it
does not compare the previous scene distance to the reprojected finite anchor;
for exact clear it does not reject a prior finite-scene sample. Shadow length
can therefore cross a terrain silhouette while an unrelated length change can
discard otherwise valid cloud radiance history.

Remove shadow length from the cloud-radiance compatibility predicate. Gate the
independent shadow history with the matching finite-scene distance or exact-
clear classification before repacking. Extend the same existing fixture with
one cloud-valid/changed-length case and one invalid-cloud scene-edge mismatch;
no separate suite is authorized.

### A6-AR-004 — Orthographic exact-clear motion remains same-UV

`sceneGISCloudProjectPreviousDirection` returns the current UV unchanged when
the previous projection is Orthographic. A translated Orthographic camera has a
different per-pixel ray origin, so this path is neither direction nor origin
reprojection and can smear the clear-sky shadow-length field. This also
contradicts the phase plan's explicit Perspective/Orthographic ray boundary.

Use the current Orthographic ray origin to recover the previous Orthographic
plane coordinates; retain direction projection for Perspective. Add one
Orthographic exact-clear case to the already amended GPU fixture and make the
same-UV mutation fail there. Do not create an Orthographic matrix.

## Execution handoff — 2026-08-28

State: `review_ready`, uncommitted and unpushed.

Implementation evolves only the existing A4R two-target history. It replaces
the allocating string key with a reusable structured snapshot, adds bounded
Globe camera/cloud-motion reprojection, preserves Planar same-UV behavior, and
resolves cloud validity and A5 shadow length independently before repacking.
There is no texture/FBO/attachment/pass/command/program-category/API/asset or
GPU-byte delta.

Focused evidence:

- actual-GPU amended history fixture: `1/1 SUCCESS`;
- amended Globe lifecycle/tier fixture: `1/1 SUCCESS`;
- `SceneGIS/Scene/SceneGISEnvironmentEffects`: `76/76 SUCCESS`;
- A1 private pipeline: `7/7 SUCCESS`;
- fixed Test observations: high-Sun medium motion entered
  `continuous-reprojected`; medium-to-low quality switched to the exact low
  profile and reset with `viewport-resize`; both raw captures were finite,
  bounded and storage-safe.

Residual review risk is visual only: the bounded single-frame observation did
not show a broad trail/slab, but it cannot prove absence of subtle edge ghosting
or shimmer during owner interaction.

## Architecture review — 2026-08-28

State: `changes requested`.

Architecture independently inspected the renderer, compiled resolve source and
amended fixture, then reran the two directly relevant focused Specs. The history
fixture and lifecycle/tier fixture both pass `1/1`, confirming compilation,
mode selection and the zero-resource tier boundary. They do not cover the four
semantic gaps above, so their green result does not close A6-G.

Execution is assigned only A6-AR-001 through A6-AR-004. Renderer resources,
quality profiles, continuity thresholds, A5 product paths, public API, Planar,
Test observations and upstream patches remain frozen. Reuse the one existing
GPU history fixture and the existing lifecycle fixture; after focused checks,
return an uncommitted/unpushed `review_ready` candidate. Owner gate, checkpoint,
A7-G and Planar remain blocked.

## Execution correction handoff — 2026-08-28

State: `review_ready`, uncommitted and unpushed.

- `A6-AR-001`: finite current 3x3 premultiplied RGB/transmittance bounds now
  clamp history before compatibility and blending; the controlled GPU outlier
  remains inside the current maximum while still contributing nonzero history.
- `A6-AR-002`: actual mean/front/scene previous distances are computed
  independently and compared with an explicit binary16 quantization-radius
  bound. The fixture exposes the compiled helper's resolved UV and distances
  and proves a moved valid-cloud sample survives.
- `A6-AR-003`: cloud radiance no longer depends on shadow-length delta. Invalid
  finite shadow history requires the reprojected scene distance, exact clear
  rejects prior finite scene state, and positive length remains separately
  decoded and repacked.
- `A6-AR-004`: Orthographic exact-clear reconstructs previous plane coordinates
  from the current ray origin; its same-UV mutation fails in the same fixture.

Focused results: amended history fixture `1/1 SUCCESS`, final controller
`76/76 SUCCESS`, A1 private pipeline `7/7 SUCCESS`. No renderer/Test/resource/
API/upstream/generated/SGP delta was introduced by the correction; Planar and
the accepted A5 paths remain frozen.

## Architecture correction re-review — 2026-08-28

State: `changes requested`; only `A6-AR-002` remains open.

Architecture independently reran the amended history fixture (`1/1 SUCCESS`)
and inspected the compiled resolve path. The following corrections are accepted:

- `A6-AR-001` is closed: finite current 3x3 premultiplied RGB/transmittance
  bounds clamp Globe history before compatibility and blending.
- `A6-AR-003` is closed: cloud radiance no longer depends on shadow length;
  invalid finite and exact-clear length selection use the required scene-edge
  authority before semantic repacking.
- `A6-AR-004` is closed: Orthographic exact-clear uses the current ray origin
  in the previous Orthographic plane and the same-UV mutation fails.

`A6-AR-002` is not closed. `sceneGISCloudHistoryCoordinates` computes the
front and scene previous UVs into `unusedCoordinates`, discards them, and the
resolve samples only one `historyDistance` texel at the mean-anchor UV. It then
compares that texel's `.y/.z` against distances belonging to the discarded
front/scene UVs. Independent scalar distances with mismatched coordinates do
not establish that mean, front and scene refer to the same semantic world
points.

The resolve also publishes
`mix(spatialDistance.xyz, historyDistance.xyz, historyWeight)`. The sampled
history distances are measured from the previous camera/ray, whereas the output
attachment becomes the successful current-frame history. Directly mixing these
coordinate domains corrupts the current mean/front/scene record and can make
the next continuous frame reject or drift from the history it just published.

The corrected fixture fills the complete history distance texture with the same
three distances, so it cannot expose the discarded semantic UVs. It observes
only one continuous-motion frame and does not assert that published `xyz` are
current-frame distances or that a second bounded motion frame can reuse them.

Execution must finish `A6-AR-002` only:

1. make each compatibility comparison coordinate-aligned. Reconstructing the
   previous ray and semantic world points from the selected history texel is the
   preferred zero-lookup correction; do not compare a channel sampled at the
   mean UV to an expected value from a discarded front/scene UV;
2. publish `xyz` in the current camera/ray domain. Keeping the current spatial
   `xyz` is acceptable; otherwise transform compatible historical world points
   back to current-ray distances before blending. Never mix raw previous-camera
   distances into the current attachment;
3. amend the same fixture with nonuniform semantic distance data and exactly one
   second bounded continuous move. Assert coordinate-aligned selection, current-
   frame `xyz`, and nonzero history reuse on that second move. This is direct
   temporal-state evidence, not a convergence loop or matrix.

No new texture lookup, resource, test, browser observation, renderer state,
public API, A5/Planar/upstream edit or broad validation is authorized. Owner
gate, checkpoint and A7-G remain blocked.

## Architecture second A6-AR-002 re-review — 2026-08-28

State: `changes requested`; `A6-AR-002` remains open with a narrower boundary.

Architecture accepts the zero-lookup previous-ray reconstruction, the bounded
binary16 plus `16 m` position tolerance, and publication of current
`spatialDistance.xyz`. Raw previous-camera distances are no longer stored in
the current attachment. The amended fixture again independently passes `1/1`.

Two directly related gaps remain:

1. For a valid cloud over exact-clear scene depth, `distanceCompatible` still
   compares the two `200 km` synthetic scene points in world space. Rays chosen
   by the mean cloud anchor diverge after that anchor, so this check rejects
   otherwise valid sky-cloud history after only a few metres of lateral camera
   motion. The fixture was narrowed from the established `100 m / 0.005 rad`
   motion to `2 m / 0.0005 rad`, which hides this failure. Exact-clear scene
   compatibility must use the exact clear classification (`z == 1.0`), while
   finite geometry retains the current world-position check.
2. The Perspective same-UV mutation replaces the complete helper call, leaving
   all three current anchors at their zero initialization. It therefore fails
   the position gate even if product and mutation sample the same NEAREST
   history texel. The x-dependent fixture data do not prove otherwise because
   the narrowed projected/current UVs remain inside the same texel.

Execution must keep the accepted product correction and finish the existing
fixture/product branch only:

- restore a meaningful fixed motion at least as strong as the original
  `100 m / 0.005 rad` witness and use exact-clear classification for the valid-
  cloud sky-scene gate;
- make the same-UV mutation overwrite only `historyCoordinates` after the real
  helper computed the current anchors;
- size/configure the one fixture so projected and current UV select different
  NEAREST texels, assert those integer texel indices differ, and make the
  nonuniform semantic distances differ by more than the compatibility bound;
- on the second transition, perform one further bounded camera plus cloud-time
  move rather than changing `cloudTime` alone, then prove history still
  contributes and current-frame `xyz` remain exact.

No parameter sweep, loop, new metric/test/resource/lookup/browser evidence,
renderer/API/A5/Planar/upstream edit or broad validation is authorized. This is
the final code-evidence correction before the owner motion visual gate.

## Architecture A6-AR-002 closure — 2026-08-28

State: `closed`; all A6 code findings are closed.

Architecture independently inspected the final resolve and fixture and reran
the existing history Spec: `1/1 SUCCESS`. Valid clouds now treat exact-clear
scene depth as the exact stored classification, while finite scenes retain the
coordinate-aligned world-position check. Mean/front checks, the bounded
binary16 plus `16 m` tolerance, invalid-cloud shadow semantics, Orthographic
clear reprojection and current-frame `xyz` publication remain intact.

The fixture restores meaningful bounded Perspective motion: two consecutive
`100 m / 0.1 rad` camera moves with `cloudTime` transitions `0 -> 0.25 -> 0.26`.
Each rotation satisfies the frozen `cos(10°)` continuity bound. It asserts that
projected and current UV choose different NEAREST texels, makes their semantic
distance difference exceed the compatibility floor, and mutates only
`historyCoordinates` after the real helper has produced the anchors. Both the
first and second transitions retain nonzero history while publishing exact
current-frame distances.

Execution's final controller `76/76`, A1 `7/7`, focused lint/format and diff
results remain valid; repeating them would add no evidence for this final
review. Resource/API/upstream/SGP/A5/Planar boundaries are unchanged. A6-G code
review passes. Only the project-owner interactive Globe motion visual gate
remains before the phase checkpoint.

## Execution response — A6-AR-002 continuation

The coordinate defect is removed without another texture lookup. The selected
history UV now owns one reconstructed previous ray; sampled mean/front/scene
channels become positions on that ray and are compared with the corresponding
current anchors. Cloud advection affects mean/front only. The tolerance remains
binary16 ULP-aware and includes the measured 16 m float reconstruction floor.
The published distance `xyz` is the unchanged current spatial result.

The same GPU fixture now supplies nonuniform semantic distances, verifies the
current published `xyz`, and executes exactly one second bounded cloud-motion
transition after the first corrected publication. Both transitions retain
nonzero history reuse; the obsolete same-UV mutation still fails. Results:
history `1/1`, controller `76/76`, A1 `7/7`. No resource, renderer, public API,
upstream, SGP, Test-page, A5 or Planar delta was introduced.

## Execution response — A6-AR-002 final continuation

The valid-cloud scene gate now branches on current exact-clear authority:
exact-clear requires `historyDistance.z == 1.0`, while finite scene depth keeps
the accepted coordinate-aligned world-position tolerance. This removes the
diverging synthetic far-point rejection without changing invalid-cloud shadow
selection or any other accepted resolve path.

The one fixture now executes two fixed `100 m / 0.1 rad` Perspective camera
moves with cloud time advancing to `0.25` and `0.26`. Projected/current UVs are
asserted to select different NEAREST texels, and their nonuniform mean values
are asserted more than `16 m` apart. The mutation changes only
`historyCoordinates` after real anchor construction. Product reuse remains
nonzero on the second transition and output `xyz` remains current-domain.
History `1/1`, controller `76/76`, and A1 `7/7` pass.

## Final disposition — 2026-08-28

The project owner completed the interactive Globe motion gate and explicitly
reported `通过`. No cloud/body or resolved-shadow trail was rejected during
orbit/pan, the stopped view required no settling frame, and the single
`medium -> low` transition produced the accepted clean spatial reset. With all
code findings already closed, A6-G is accepted and closed. Its phase-closing
local commit is the required isolated checkpoint; no push is authorized.
