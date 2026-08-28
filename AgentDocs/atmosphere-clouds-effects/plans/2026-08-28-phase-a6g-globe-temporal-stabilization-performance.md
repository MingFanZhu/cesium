# Phase Plan: A6-G Globe Temporal Stabilization and Performance

## Metadata

- Plan type: `phase`
- Status: `active; assigned to Execution`
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
- Open review findings: `none; implementation pending`
- Owner visual gate: `pending after Architecture review`

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
