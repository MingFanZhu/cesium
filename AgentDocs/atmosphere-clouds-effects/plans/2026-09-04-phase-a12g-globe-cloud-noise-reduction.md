# Phase Plan: A12-G Globe Cloud Noise Reduction

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture approved; owner visual gate passed`
- Created / updated: `2026-09-04`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Branch: `feature/atmosphere-clouds-effects`
- Frozen product predecessor: A11-G `53465cf9bc8f3af1e935b3225c81364e380ea528`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Source discovery:
  [cloud noise analysis](../discussions/2026-09-04-a12g-globe-cloud-noise-source-discovery.md)
- Review: [A12-G review](../reviews/2026-09-04-a12g-globe-cloud-noise-reduction.md)
- Governing decision: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)
- Upstream / new SGP: `none; SGP-0008/0009 consume only`
- Owner visual gate: `passed; current grain strength explicitly accepted`

## Goal

Reduce fine stochastic grain on the owner's accepted Globe cloud shapes while
preserving cloud thickness/lighting, silhouettes, terrain visibility, fixed
world shadows and camera-motion stability. Start with one bounded
reference-derived variance-clipping correction rather than another global
quality or cloud-parameter recalibration.

## Confirmed implementation surface

`executeCloud` runs the current full-resolution Globe cloud MRT, then
`executeCloudResolve` publishes the existing two-target history. Both linear
and log-depth resolve programs assemble
`SceneGISEnvironmentEffectsCloudResolveFS.glsl` through the existing GLSL build
chain. The current resolve already reads a 3x3 raw neighborhood and one color /
distance history sample; it clips history only to the local finite extrema.
Globe stationary/moving history weights are `0.9 / 0.82`. Source facts and the
bounded current-page inspection are recorded in the linked discussion.

## Bounded first implementation

1. In the existing `SCENEGIS_GLOBE` resolve branch, accumulate first and second
   moments from the same finite 3x3 premultiplied radiance/transmittance samples.
   Retain sample count explicitly; do not add texture reads or use non-finite
   neighbors as moment authority.
2. Adapt the pinned reference's mean / standard-deviation AABB history clipping
   with fixed gamma `1.0`. Preserve coherent color clipping rather than
   independent per-channel hue-changing clamps. Keep transmittance in `[0,1]`,
   color finite and RGBA16F-safe, and retain the current-neighborhood range as
   the outer bound. A uniform neighborhood must preserve its exact source.
3. Feed the bounded history into the existing compatibility and blend path.
   Do not change current-frame distance publication, geometry/clear-depth
   rejection, cloud validity, shadow-length decoding/filtering/repacking,
   temporal weights, continuity thresholds or invalid/cut first-frame output.
4. Planar must retain its previous executable formula and behavior. Preserve
   current spatial reconstruction, raymarch/light budgets, reference material
   and all owner parameters. No global/final-scene blur.
5. If this bounded change does not demonstrably reduce the reported grain, or
   it softens silhouettes or causes motion trails, stop and report evidence.
   Do not expand the algorithm, tune coefficients repeatedly or label a merely
   different image as accepted.

## Authorized paths

- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- This plan, A12 discussion/review, extension README/roadmap and ADR-0048
  writeback only.

Renderer/controller, other product GLSL, Test executable/UI, assets/importers,
upstream files, SGP manifests, generated modules, package/build scripts and
Planar product paths are frozen. Any required expansion returns to Architecture.

## Minimum sufficient validation

- Amend the existing actual-GPU history fixture
  `isolates cloud radiance scale transitions from temporal history`. Use one
  controlled nonuniform cloud neighborhood with a known clean color and a
  bounded noisy sample/history outlier. The real product must clip to the
  computed variance bounds and reduce error relative to the exact pre-A12
  extrema-only mutation, not merely produce a different color.
- Within the same fixture, retain all current moved-history, cloud/scene edge,
  packed shadow, current-domain distance, stationary and camera-cut assertions.
  Include a uniform-color identity and a contrasting finite/clear or
  cloud/no-cloud edge so denoising cannot gain its result by crossing a real
  silhouette. Do not add a matrix or standalone replay framework.
- Run that exact GPU filter, then the focused controller include once on final
  source. Run changed-scope ESLint, explicit Prettier and Markdownlint plus
  `git diff --check`. No package, full build, type, upstream or A1 pipeline
  rerun is required because their source/contracts do not change.
- Report unchanged command/program/texture/FBO/attachment/history counts and
  byte budget, unchanged shader lookup count and primary/secondary sample
  budgets. The only intended hot-path delta is fixed moment/AABB arithmetic
  in the existing resolve; do not introduce runtime profiling/readbacks.
- Preserve the owner's current page and camera/parameters before any necessary
  reload. Inspect current appearance and one ordinary motion/stop; a matched
  before/after view is not a gate after the owner's explicit revision. Fine
  near-view grain is acceptable; normal-distance appearance, retained small
  cloud shapes and absence of objectionable flicker/trails are project-owner
  judgments, not screenshot/hash/FPS or zero-noise gates.

## Resource and semantic boundary

New public API/default/range, GPU resources/bytes, commands/passes/program
categories, persistent state, LUT/noise assets, dependencies and network cost:
all `0`. Request-render behavior is unchanged: first invalid/cut frame remains
complete; no timer, forced frame or settling requirement is added. A11 Sun/Moon
lighting, native geometry shadows and A5/A8 fixed-ECEF Beer projection remain
exactly as accepted in the predecessor checkpoint.

## Exit and handoff

Execution returns `review_ready` with source diff, exact executed test counts,
reference adaptation details, fixed-view observation and unresolved visual
risks. It updates the linked records and stops uncommitted/unpushed. Architecture
reviews before requesting the owner's new noise-quality gate. No subsequent
phase or Planar work is authorized.

## Execution candidate — 2026-09-04

Implemented finite first/second moments in the existing nine-sample Globe
loop, explicit count and gamma-1 mean/sigma bounds intersected with the current
extrema. A single center-to-history fraction bounds all premultiplied RGBA
channels together; zero extents require no variance epsilon. Planar and every
existing spatial/temporal semantic remain unchanged.

The one history fixture now compares a known clean neighborhood plus one
outlier against the exact extrema-only mutation, checks clipped RGBA against
an independent scalar solution, and retains uniform identity and a real
cloud/clear boundary. Existing motion, scene-edge, shadow, cut and publication
assertions remain. Its directly connected controller now explicitly receives
the same fixed celestial time as Scene rendering; otherwise A11's retained
initial time caused unrelated primary-light-energy resets.

Browser discovery initially exposed no tabs. After the owner reopened the
original tab, Execution saved the current camera, raw JulianDate, parameters
and image before one reload, then restored them. The same high/mixed view
retains cloud bodies and cavities but still has obvious fine grain; visible
improvement is not established. One ordinary drag/stop showed no obvious large
trail; the page remains ready/HDR with zero errors. No further coefficient or
algorithm change was attempted. Exact validation results are in the linked
review; resources, lookups, sampling and API deltas are zero.

## Architecture correction assignment — 2026-09-04

Base remains `52c21d616c7fa2a3d93e9c562264a16ee92e34dc` with the shared
uncommitted A12 candidate. Findings are
[A12-AR-001..003](../reviews/2026-09-04-a12g-globe-cloud-noise-reduction.md).

1. Correct only the Globe variance helper so the coherent clipping fraction
   is determined by RGB, as in the pinned reference. Bound transmittance
   independently within its finite variance/extrema interval and `[0,1]`;
   an alpha-only discrepancy must not collapse otherwise in-bounds RGB
   history. Preserve gamma, outer bounds, all gates/weights and every original
   resource/sampling/Planar boundary. Add the recorded constant-transmittance,
   one-binary16-ULP history case to the same existing GPU fixture; retain the
   outlier, uniform, edge and original temporal assertions.
2. Triage the existing Beer, readable-night and Moon-primary fixture failures
   without assuming an A12 regression or dismissing them as baseline failures.
   The same Spec file may receive narrowly evidenced setup/oracle corrections
   in those three existing fixtures only. Use exact celestial time for both
   a directly connected controller and its Scene when fixed-time behavior is
   intended; investigate ICRF data-readiness dependence before changing lunar
   expectations. Do not delete mutation checks, weaken tolerances, replace
   numerical expectations with newly observed goldens, or alter shared global
   transform behavior. If a product fix outside CloudResolve is needed, stop
   and return the confirmed cause for a separate Architecture decision.
3. Run the corrected history fixture and each actually corrected regression
   fixture once, sequentially. Only after their evidence is sound, run the
   previously required controller aggregate once. Use assertion totals, not
   shell exit status alone: the local runner has returned exit 0 with failed
   Jasmine assertions. If an unchanged blocker persists, report it; do not
   retry the aggregate or broaden the matrix. Retain focused static checks.
4. After the code/evidence correction, preserve the current owner state before
   any necessary reload and make one same-state grain comparison plus ordinary
   drag/stop observation. If a clear improvement is still not established,
   return that result without tuning or expanding the algorithm. This remains
   a quality blocker, not authority to request acceptance.

Only the two original executable paths and six active Markdown records are
authorized. No runtime diagnostics, Test/UI edits, upstream/generated/SGP
changes, commit, push, checkpoint, next phase or owner-gate request.

## A12 correction execution — 2026-09-04

A12-AR-001 now uses RGB alone for the coherent clipping fraction and clamps
transmittance independently. The existing actual-GPU history fixture retains
the outlier/uniform/edge/motion checks and proves the recorded alpha-only ULP
case returns RGB `0.3125` and alpha `0.75`, not RGB `0.25`.

A12-AR-002 setup/oracle corrections stay in the existing Spec. The Beer
fixture now passes the same fixed time to controller update and Scene render.
The Moon oracle uses rotation-invariant inertial-frame phase instead of
ICRF-readiness-dependent epoch goldens, retaining the mixed-frame mutation
and existing tolerances. The readable-night probe now distinguishes local
`+Z` from its virtual Globe point's `+X` zenith; its controlled surface atlas
uses density `0.0001` so the 6 km zenith path has OD about `0.6`, rather than
OD `60` erasing both direction witnesses in half-float output. Product
lighting/shadow code is unchanged.

All four corrected isolated fixtures passed sequentially on Chrome 152.
A12-AR-003 remains unproven: this correction turn's browser discovery returns
no accessible tab. No replacement page was opened and no refresh, camera,
parameter or live-state mutation was performed. The earlier grain observation
is not superseded by a new visual claim. Resource, lookup, API, upstream,
generated and SGP deltas remain zero; the candidate stays uncommitted/unpushed.

Final controller qualification is `78 SUCCESS, 1 FAILED` (79 executed), not a
pass despite shell exit 0. The remaining unchanged
`loads exact Globe assets and publishes the height/time/projection render matrix`
fixture supplies its selected times only to Scene rendering, not to its
directly connected controller inside the loop; its Sun-direction-change
assertion fails. It is outside the three-fixture repair scope and is left
untouched for Architecture. No rerun or scope expansion. A12-AR-002/003 remain
open; exact commands and failure are appended to the A12 review.

## A12-AR-002 bounded final Spec follow-up — 2026-09-04

Architecture accepts A12-AR-001 and the three setup/oracle corrections after
source/fixture review. They are frozen. Base and shared dirty tree remain
unchanged. The only further executable edit authorized is in the existing
`loads exact Globe assets and publishes the height/time/projection render matrix`
fixture: call `effects.update(scene, time)` before the existing Scene render
inside the selected-time loop, and supply `times[0]` to both update and the
existing final Orthographic render. No new helper, test, loop, assertion
removal, parameter, tolerance or product change is needed.

Run that exact fixture once and focused Spec ESLint/Prettier, changed-record
Markdown checks and diff-check. The preceding aggregate already passed the
other 78 fixtures on this unchanged product candidate; another aggregate,
history/Beer/night/Moon rerun or broader matrix is not required for this
Spec-only follow-up. Report the last aggregate as `78/79` and the final
isolated result separately, never as an unobserved aggregate `79/79`.

A12-AR-003 remains open. If the original browser tab becomes accessible,
perform only the already assigned saved-state comparison and ordinary
drag/stop. If still inaccessible, report that limitation without opening a
replacement or modifying live state. No visual benefit or owner acceptance
may be inferred. Write back the six active records and return for review;
no commit, push, checkpoint, owner gate, next phase or Planar work.

## A12-AR-002 final Spec follow-up execution — 2026-09-04

Added only the two authorized `effects.update` calls before the existing
selected-time and final Orthographic renders. No assertion, parameter or
product change. Exact command
`npm run test -- --includeName "loads exact Globe assets and publishes the height/time/projection render matrix"`
passed `1/1 SUCCESS` on Chrome 152 (36.942 s Spec). The previous aggregate
remains `78 SUCCESS / 1 FAILED`; no new aggregate or other fixture was run.

A12-AR-003 remains open: original-tab discovery still returns zero accessible
tabs. No replacement page, reload or live-state mutation; no visual benefit
is claimed. New executable delta is only these two Spec lines.
Upstream/generated/new SGP/API/resource/Planar deltas are zero. Shared
candidate remains uncommitted/unpushed and returns for Architecture review.

## A12-AR-003 execution access limitation — 2026-09-04

After Architecture reported successful access to the original tab, Execution
performed the required single read-only inventory. Its own browser surface
still returned `tabs=[]`. Thus Architecture's successful access does not
currently extend to this execution context. No tab was selected, opened,
refreshed or polled again; no camera, time, parameter, loop or shader changed.
Current-state capture, loaded-shader verification and a valid same-state
comparison/drag observation could not be performed. A12-AR-003 remains open,
with no visual benefit or acceptance claimed. A12-AR-001/002 stay frozen.
This update changes records only; no tests, product edits, commit or push.

## Owner criterion revision and Architecture observation — 2026-09-04

The owner removed the same-view prerequisite and clarified that close-range
volumetric-cloud grain is expected. This supersedes earlier matching-view,
old-before recovery and visible-relative-improvement prerequisites; it does
not authorize blur, extra samples, parameter tuning or automatic acceptance.
The objective is unobjectionable normal-distance appearance and motion while
retaining cloud shape and internal shading, not a noise-free close-up.

Architecture could access the original page although Execution could not.
The loaded resolve lacked the A12 helper. Architecture saved public settings,
camera/frustum, raw JulianDate and loop state, reloaded once, restored that
state, and verified the final RGB-only helper plus independent transmittance
bound in the loaded program. Public settings were already identical after
reload. Cloud forms/cavities and edge detail remain visible with fine grain.
One ordinary middle-button drag and stopped capture showed no obvious broad
trail; these limited captures cannot exclude subtle interactive shimmer.
The original camera was restored afterward; time/parameters are unchanged,
the default loop is active, ready/HDR and errors zero.

Architecture accepts A12-AR-003 as a revised-criterion residual quality risk
for the explicit owner gate. No numerical before/after benefit or noise-free
result is claimed. Product and automated evidence remain frozen. No further
work or checkpoint is authorized before the owner's explicit pass/fail.
