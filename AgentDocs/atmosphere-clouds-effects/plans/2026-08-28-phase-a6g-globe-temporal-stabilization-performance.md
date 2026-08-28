# Phase Plan: A6-G Globe Temporal Stabilization and Performance

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture and owner visual gates passed`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md](2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md)
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-28`
- Updated: `2026-08-28`
- Branch: `feature/atmosphere-clouds-effects`
- Frozen predecessor checkpoint: A5-G=`3ead681e7854082b6b9d016fdcd9cd8619087102`
- Architecture decision:
  [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)
- Source discovery:
  [A6-G temporal/performance source discovery](../discussions/2026-08-28-a6g-temporal-performance-source-discovery.md)
- Upstream patches: active `SGP-0008` (`consume only`), active `SGP-0009`
- Open review findings: `none; A6-AR-001 through A6-AR-004 closed`
- Owner visual gate: `passed by project owner on 2026-08-28`

## Goal

Evolve the accepted A4R Cloud history into camera-motion-aware Globe
reprojection so cloud radiance/transmittance, depth/front selection and A5
shadow length remain coherent during bounded camera and caller-owned cloud
motion. Formalize the complete low/medium/high performance and resource budget
without adding an automatic FPS controller or a second temporal authority.

## Frozen predecessor

- A5-G checkpoint
  `3ead681e7854082b6b9d016fdcd9cd8619087102` is immutable. Execution starts
  from the separate A6-G activation checkpoint and does not amend or squash A5.
- A4-G density/material/assets, radiometry, morphology, occupancy, cloud
  distance encoding, low-resolution MRT and 3×3 spatial resolve are frozen.
- A5 Beer atlas, 3×3 Beer PCF, cascade topology, packed shadow-length semantics,
  terrain-depth lifecycle, Globe surface seam and accepted owner visuals are
  frozen.
- A2/A3/Bruneton/fog/cloud-haze equations and all public defaults/ranges are
  frozen.
- Planar product, qualification and calibration remain frozen until after
  A8-G. A7-G bloom/lens flare is not entered.

## Deliverables

### 1. Globe history reprojection in the existing resolve

Modify the existing Cloud resolve and renderer owner only as needed to:

1. preallocate and retain the previous successful Globe camera/frustum/cloud
   state;
2. reconstruct current world anchors from the existing mean/front/scene
   distances and actual Perspective/Orthographic camera rays;
3. project those anchors into the previous frame, with caller-owned wind
   advection for cloud-body history;
4. use current-neighborhood finite min/max plus world/view position, scene edge,
   validity and radiometry compatibility before blending;
5. decode/filter/repack A5 validity and shadow length independently;
6. preserve first-frame and exact-stationary spatial-only output;
7. invalidate before history sampling when ADR-0048 continuity bounds identify
   a cut.

Use the existing two history framebuffer managers and two attachments. Do not
add a velocity attachment, third MRT, history target, pass, command, program
category or GPU readback. Planar keeps its current same-UV behavior.

### 2. Structured compatibility and deterministic tiers

Replace the current per-frame array/map/join Cloud history key with one reusable
structured snapshot and in-place comparisons. Preserve every ADR-0046 reset
cause, adding explicit diagnostics for `stationary`, `continuous-reprojected`
and `camera-cut` only where Test/Specs need direct observation.

Keep public `cloudQuality` unchanged as the sole runtime performance authority.
The exact low/medium/high table in ADR-0048 is frozen; no motion-triggered step
change, automatic FPS sampling, resolution oscillation or new public property is
allowed. Quality changes remain warm, failure-atomic and history-invalidating.

### 3. Budget record and direct Test

Record, per tier, the existing low Cloud MRT dimensions/formula, full-resolution
history bytes, Beer atlas bytes, command ceilings and configured march limits.
The A6 persistent GPU/resource/category delta must be zero.

Extend `Test/高级环境.html` only with one concise Globe high-Sun camera/cloud
motion observation and one quality-switch observation. Show tier and history
mode/reset reason; use ordinary direct visual inspection. Do not add hashes,
replay pairs, convergence/warm-up loops, settling frames, FPS thresholds or a
cross-world matrix.

### 4. Persistent writeback

Update this plan, the extension index, ADR-0048 and the A6 review with actual
implementation deviations, exact resource counts, validation results and
remaining visual risk. Do not overwrite A5 records.

## Expected SceneGIS-owned paths

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `Test/高级环境.html`
- current A6 AgentDocs and ADR-0048

No upstream-owned or generated path is expected. `SceneGISEnvironmentEffects.js`,
all A2/A3/A4/A5 physical shaders, CloudCore assets/generator, `Scene.js`, the
three SGP-0009 files and package barrels remain unchanged unless Architecture
first approves a demonstrated blocker.

## Minimal sufficient validation

Run only the following unless a concrete failure proves a missing boundary:

1. amend one existing actual-GPU Cloud history fixture for smooth
   Perspective camera motion, expected previous UV, continuous cloud-time
   advection, stationary spatial-only and one over-bound cut;
2. in that same fixture cover valid cloud and invalid-positive-shadow-length
   semantics plus a deterministic pre-A6 same-UV mutation;
3. amend one existing lifecycle/resource fixture for exact three-tier profile,
   quality invalidation/resize and zero resource/category delta;
4. run the focused `SceneGIS/Scene/SceneGISEnvironmentEffects` controller and
   A1 private pipeline;
5. run changed-scope ESLint/Prettier/Markdownlint and `git diff --check`;
6. inspect the two direct Globe Test observations and report remaining motion
   ghosting/shimmer plainly for the owner gate.

Do not run the full repository, Scene aggregate, package/generator/type/build
matrices, Planar qualification, SGP audit without an upstream edit, or any
hash/replay/convergence evidence.

## Acceptance

- Smooth bounded Globe camera translation/rotation and continuous `cloudTime`
  use the same reprojected A4R history rather than same-UV sampling or reset.
- Camera cuts and every frozen ADR-0046 discontinuity publish a complete
  spatial-only first frame with no ghost trail.
- Exact-stationary request-render frames remain current spatial output and do
  not require another frame to settle.
- Cloud body edges, finite terrain silhouettes and clear-sky shadow length do
  not smear across incompatible geometry; validity and packed length remain
  semantic and finite.
- `cloudQuality` remains the only caller-owned performance tier, all configured
  budgets are explicit, and A6 adds zero persistent GPU resources or commands.
- A5 owner-approved terrain, atmosphere, fog, cloud, surface shadow and ray
  appearance remains intact in a fixed frame.
- Architecture review and project-owner Globe motion visual gate pass before an
  A6-G checkpoint or A7-G activation.

## Handoff

Execution implements only this boundary, writes concise evidence, and returns
`review_ready` without committing, pushing, requesting the owner gate, entering
A7-G or touching Planar. Architecture independently reviews and, after the
owner visual gate, creates the isolated A6-G checkpoint.

## Execution result — 2026-08-28

The existing two-target A4R history now owns one reusable structured previous-
frame snapshot. Globe continuous frames reconstruct mean-distance cloud anchors,
finite-scene invalid-cloud anchors or exact-clear directions, project them into
the previous Perspective/Orthographic camera, and apply the existing wind offset
delta. Compatibility is checked before history sampling against the frozen
camera, frustum, `cloudTime` and Sun bounds. Stationary and cut frames still
publish one complete spatial-only result. Planar retains same-UV behavior.

Resolve filters cloud validity and decoded A5 shadow length independently,
checks the current 3x3 finite distance range and position/scene/radiance/
transmittance compatibility, and repacks alpha only after semantic selection.
The old per-frame array/map/join key and the temporary framebuffer array were
removed. GPU delta is zero: the low MRT, two full-resolution RGBA16F history
FBOs, resolve command/program category and A5 atlas remain unchanged. History
storage remains `32 * viewportWidth * viewportHeight` bytes; BSM bytes remain
`2,097,152 / 8,388,608 / 18,874,368`.

The amended GPU history fixture passes with Perspective translate/look,
`cloudTime=0.25`, an in-bounds previous UV, `continuous-reprojected`, a 30 km
cut, valid cloud, invalid-cloud positive shadow length and a failing pre-A6
same-UV mutation. The amended lifecycle fixture confirms the frozen three-tier
table and unchanged resource keys. Focused controller and A1 results are
`76/76` and `7/7` success.

The fixed high-Sun observation measured Sun elevation `67.484068°`, medium
`64/4/3`, three `512` BSM cascades and `continuous-reprojected` at weight
`0.82`; all raw attachments were finite/bounded and maximum raw RGB was
`1.185547`. The fixed medium-to-low observation reported `32/1/2`, detail off,
two `256` cascades and the expected `viewport-resize` spatial-only reset. No
viewport-wide trail or slab was apparent. The deliberately single-frame
observations cannot exclude subtle motion-edge ghosting or shimmer; that remains
the project-owner visual risk.

## Architecture review result — 2026-08-28

The resource/tier and structured-snapshot boundaries are accepted, but A6-G is
not ready for the owner gate. Architecture opened four focused findings:

- `A6-AR-001`: clamp history radiance/transmittance to the finite current 3x3
  neighborhood before compatibility/blending;
- `A6-AR-002`: replace the shared mean-distance shift with semantic
  mean/front/scene position checks using an RGBA16F-aware bound, and prove a
  moved cloud-valid sample actually receives history;
- `A6-AR-003`: decouple cloud radiance from shadow-length compatibility and
  enforce finite/clear scene-edge compatibility for invalid-cloud shadow
  history;
- `A6-AR-004`: reproject the current ray origin for Orthographic exact-clear
  history instead of returning the same UV.

The correction stays inside the existing renderer/resolve/Spec paths and the
one amended GPU fixture. No new resource, public API, test matrix, Test-page
observation, upstream patch, A5 edit, Planar work or broad validation is
authorized.

## Focused correction result — 2026-08-28

Execution repaired `A6-AR-001` through `A6-AR-004` in the existing resolve and
single history fixture; the renderer and Test page did not change in this
correction. The shader now accumulates finite current 3x3 premultiplied RGB and
transmittance limits and clamps sampled history before compatibility and blend.
It reconstructs independent previous mean/front/scene distances and compares
each using the sum of the two RGBA16F quantization radii instead of a shared
integer-normalized shift.

Invalid-cloud publications retain the current encoded scene distance. Shadow
length no longer participates in cloud-radiance compatibility: finite invalid
samples require semantic scene-distance agreement, while exact-clear samples
reject a previous finite scene. Orthographic exact-clear uses the current ray
origin in the previous Orthographic plane; Perspective retains direction
reprojection.

The amended actual-GPU fixture exposes the real resolved UV/distances and
proves one moved valid-cloud sample with `cloudTime=0.25` survives, a controlled
history outlier is clipped, changed shadow length does not discard cloud
radiance, finite/clear invalid-cloud history is rejected, and both Perspective
and Orthographic same-UV mutations fail. Exact results are history `1/1`,
controller `76/76`, and A1 `7/7` success. Resource, public API, upstream-owned,
generated and SGP deltas remain zero; no browser evidence was rerun.

## Architecture correction re-review — 2026-08-28

`A6-AR-001`, `A6-AR-003` and `A6-AR-004` are closed. `A6-AR-002` remains open
because front/scene UVs are computed and discarded while all three history
distance channels are read at the mean UV, and raw previous-camera distances
are then mixed into the current-frame attachment. The uniform-distance,
single-motion-frame fixture cannot expose either defect.

The next correction is limited to coordinate-aligned semantic checks and
current-frame `xyz` publication in the existing resolve. The same fixture may
use nonuniform distance data and one second bounded motion frame to prove the
published history remains reusable. No new lookup/resource/test/browser/
renderer/API/A5/Planar/upstream work or broad validation is authorized.

## Architecture second A6-AR-002 result — 2026-08-28

Previous-ray semantic reconstruction, the bounded `16 m` float floor and
current-frame `xyz` publication are accepted. `A6-AR-002` remains open only
because valid-cloud exact-clear scene compatibility still compares diverging
`200 km` synthetic world points, and the fixture narrowed the original motion
while its same-UV mutation also zeroes the anchors.

The final correction restores a meaningful fixed camera motion, treats exact
clear as a classification while retaining finite-scene world checks, isolates
only the UV mutation, proves different NEAREST texels, and applies one further
bounded camera/cloud move. It stays in the same resolve/fixture/record boundary
with no sweep, loop, resource, lookup, browser or broader validation.

## Architecture code closure — 2026-08-28

All A6 findings are closed. Independent review and the existing GPU fixture
confirm exact-clear versus finite-scene authority, coordinate-aligned
mean/front semantics, current-frame distance publication, distinct NEAREST
texel reprojection and two consecutive bounded `100 m / 0.1 rad` camera/cloud
transitions. The history fixture passes `1/1`; execution's final controller and
A1 results remain `76/76` and `7/7`.

No resource/API/tier/continuity/upstream/A5/Planar boundary changed. The phase
now waits only for the project-owner interactive Globe motion visual gate; no
checkpoint or A7-G activation is authorized before that decision.

## A6-AR-002 continuation execution — 2026-08-28

The resolve now selects one semantic history coordinate, reconstructs the
previous ray there, and derives sampled mean/front/scene positions from that
coordinate-aligned ray. Existing cloud advection applies only to mean/front.
The bound combines binary16 ULP radii with the directly observed 16 m float
reconstruction floor. Output distance `xyz` stays equal to the current spatial
record, so no previous-camera distance enters the next successful history.

The amended existing fixture uses a nonuniform distance texture and verifies
the selected coordinate, current-domain publication, and nonzero reuse across
two bounded transitions (`cloudTime` `0.0` to `0.25` to `0.26`). It passes
`1/1`; the final controller and A1 checks pass `76/76` and `7/7`. No browser,
resource, API, renderer, upstream, SGP, A5 or Planar surface changed.

## A6-AR-002 final continuation execution — 2026-08-28

Valid clouds now use exact-clear code compatibility for an exact-clear scene,
avoiding synthetic `200 km` scene-point divergence. Finite scenes continue to
use coordinate-aligned scene world positions; the accepted mean/front and
invalid-cloud checks are unchanged.

The existing GPU fixture restores fixed `100 m / 0.1 rad` Perspective motion,
then repeats that bounded camera move with cloud time `0.25 -> 0.26`. It asserts
different projected/current NEAREST texels, more than `16 m` nonuniform semantic
separation, a UV-only same-UV mutation failure, exact current `xyz`, and nonzero
history reuse after the second publication. Exact results are `1/1`, `76/76`
and `7/7`; no frozen surface changed.

## Project-owner visual acceptance — 2026-08-28

The project owner exercised the prepared live Globe state and explicitly
reported `通过`. The accepted gate covers bounded orbit/pan without cloud or
shadow trails across terrain and sky silhouettes, immediate stability after
motion stops, and one clean `medium -> low` quality reset without stale history.
Architecture therefore closes A6-G. The phase-closing local commit containing
this record is the isolated A6-G checkpoint; it is not pushed.
