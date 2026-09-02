# Phase Plan: P1 Planar Integrated-medium Restoration

## Metadata

- Plan type: `phase`
- Status: `deferred before acceptance; implementation candidate preserved outside committed delivery`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-09-02-phase-a10g-globe-native-moon-composition.md](2026-09-02-phase-a10g-globe-native-moon-composition.md)
- Frozen predecessor checkpoint:
  A10-G=`6afba87af181f3cdb7a20aff09b81af11eb302f4`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-09-02`
- Updated: `2026-09-02`
- Branch: `feature/atmosphere-clouds-effects`
- Source discovery:
  [P1 Planar integrated-medium source discovery](../discussions/2026-09-02-p1-planar-integrated-medium-source-discovery.md)
- Decision:
  [ADR-0052](../../../Documentation/SceneGIS/Decisions/ADR-0052-planar-integrated-medium-restoration.md)
- Upstream patch: active `SGP-0008` consume-only; P1 upstream delta must be zero
- Open review findings: `none; phase suspended before review`
- Owner visual gate: `not opened`

## Goal

Restore and requalify the existing Planar atmosphere, aerial perspective,
exponential height fog and volumetric-cloud composition on the frozen A10
source. Establish the first direct actual-GPU final-composition authority, fix
only a currently reproduced Planar defect, and leave the deterministic direct
sample ready for project-owner judgment.

## Source baseline

- Planar already owns independent flat-slab LUTs, fixed-Z fog integration,
  Planar cloud assets/scheduler and same-UV cloud history.
- Current renderer order is Cloud MRT/Resolve followed by one full-resolution
  aerial/fog/cloud composite.
- The old 2026-08-27 white-fill screenshot is valid rejection history but is not
  a proven present-day root cause.
- The current direct page's plane and boxes are intentional baseline geometry;
  effects must be evaluated as a delta from that same input.

## Required execution

### Final-composition witness first

In `SceneGISEnvironmentEffectsSpec.js`, add or amend one focused actual-GPU
witness in the existing Spec file. It must run the real Planar programs against
immutable resolved HDR color/depth and cover, from the same inputs:

1. all A2/A3/A4 medium components disabled;
2. aerial perspective only;
3. height fog only;
4. clouds only;
5. aerial perspective + height fog + clouds.

Include exact-clear and finite-depth samples. Assert finite RGBA16F output,
unchanged alpha, component-off identity, foreground geometry preservation and a
nonuniform bounded cloud contribution. The witness must expose the first
divergent product value; source-string assertions or screenshot-only evidence
are insufficient.

### Product correction only after reproduction

If the current final source fails, trace the divergence through cloud selection,
mean/front/scene distance, Planar fog segment and final premultiplied composite.
Patch only the first confirmed product owner and add one compiled mutation of
the rejected formula/coordinate/depth authority. Do not tune public or private
intensities to make the witness pass.

If the current source already satisfies the contract, do not manufacture a
runtime change. Retain the focused final-composition evidence and proceed to
direct qualification.

### Direct Planar qualification

Update `Test/AdvancedEnvironment/planar.js` from retained/deferred wording to a
P1 direct observation surface. Keep the existing local plane, boxes, cameras,
lighting and lil-gui controls. Provide fixed actions or a clearly recorded
manual sequence for baseline, aerial, fog, cloud and combined states without
changing camera/geometry between them. Record ready/HDR and browser/render
errors; no retry, sweep, hash, convergence or automatic visual acceptance gate
is added.

## Authorized executable paths

Primary product surface, only after a reproduced failure:

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`

Evidence and direct sample:

- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `Test/AdvancedEnvironment/planar.js`

Persistent records may update the active extension README, this phase plan,
P1 review/source discovery, ADR-0052 and Architecture summary. No other
executable path is authorized without Architecture review.

## Frozen boundaries

- Globe A1–A10 product output, shaders, defaults, tests and direct sample.
- Public `SceneGISEnvironmentEffects` API/defaults/ranges and mode-specific
  calibrations.
- Planar LUT/cloud assets, package delivery, quality table, resource counts,
  history allocation and same-UV history policy.
- A5 Beer atlas/surface lighting/rays, A6 Globe reprojection, A7 bloom/lens,
  A9 readable night and A10 Moon.
- Upstream-owned paths, SGP-0008, SGP-0009, generated modules and Build outputs.

## Validation

- Run the focused new/amended Planar final-composition witness first.
- If product source changes, run only the existing focused Planar fog/cloud
  geometry/MRT fixtures directly affected, followed by the exact controller
  aggregate and private pipeline aggregate needed to catch scheduling/resource
  regressions.
- Run focused ESLint for changed JS/Test, Prettier for every changed executable
  and record, Markdownlint for active records, and `git diff --check`.
- Audit exact program/command/texture/FBO/history/GPU-byte deltas, public API,
  upstream-owned paths, generated files and SGP count.
- After automated evidence passes, perform one fixed direct Planar sequence and
  return review-ready. Do not infer Architecture or owner acceptance.

## Resource and ownership budget

P1 target delta is zero programs, commands, textures, FBOs, attachments,
histories, assets, requests, readbacks, dependencies and GPU bytes. Existing
Planar resources remain owned by the same controller/pipeline and retain their
failure-atomic lifecycle. Public API/default/range delta, upstream-owned delta,
generated delta and new SGP count are all zero.

## Stop conditions

Stop and return to Architecture if the reproduced failure requires a new GPU
resource/pass/history, a public property/default/range change, a Globe product
change, an upstream-owned path/SGP, an asset replacement, Planar shadows/rays,
Globe-style reprojection, a hidden world multiplier, spherical geometry,
Test-only runtime branch or change outside the authorized paths.

## Completion criteria

- Architecture independently closes all implementation findings.
- The final source has one direct actual-GPU Planar integrated-composition
  authority and no unproven product workaround.
- The project owner explicitly accepts the fixed direct Planar medium result.
- Architecture creates one isolated local P1 checkpoint before activating any
  later Planar phase.
