# Phase Plan: A7-G Globe HDR Bloom and Lens Flare

## Metadata

- Plan type: `phase`
- Status: `active; formally assigned from isolated Architecture activation checkpoint`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md](2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md)
- Frozen predecessor checkpoint:
  A6-G=`201f6edada8fe2738bf9eb3277a30ea3b519e7d7`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-28`
- Updated: `2026-08-28`
- Branch: `feature/atmosphere-clouds-effects`
- Decision:
  [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)
- Source discovery:
  [A7-G HDR bloom/lens flare source discovery](../discussions/2026-08-28-a7g-hdr-bloom-lens-flare-source-discovery.md)
- Upstream patches: active `SGP-0008` (`consume only`), active `SGP-0009` (`unchanged`)
- Open review findings: `none; implementation pending`
- Owner visual gate: `required after Architecture review`

## Goal

Complete the Globe advanced visual stack with scene-linear HDR bright-source
bloom and Sun-aligned ghost/halo lens artifacts. Preserve the accepted A2-A6
optical result, resolved terrain depth, one display-transfer authority and
caller-owned lifecycle.

## Frozen predecessor

- A6-G checkpoint `201f6edada8fe2738bf9eb3277a30ea3b519e7d7` is immutable.
- A2-A6 atmosphere, fog, clouds, BSM, shadow length, terrain lighting, haze,
  temporal reprojection and all existing defaults/ranges are frozen.
- `SGP-0008` HDR ordering and `SGP-0009` Globe surface seam are consume-only.
- No A8-G qualification, Planar execution/calibration, native Sun body,
  `SunPostProcess`, raw WebGL, third-party postprocess runtime or new asset.

## Deliverables

### 1. Minimal public controls

Add the ADR-0049 properties to `SceneGISEnvironmentEffects`:

- `showBloom=true`
- `showLensFlare=true`
- `bloomThreshold=10.0`, finite `[0,65504]`
- `bloomIntensity=0.05`, finite `[0,64]`
- `lensFlareIntensity=1.0`, finite `[0,64]`

They are warm setters that request rendering without touching cloud history.
Globe consumes them in A7-G; Planar runtime remains exact unchanged.

### 2. Reference-shaped HDR implementation

Add SceneGIS-owned GLSL for:

1. half-resolution luminance threshold/downsample using threshold range `1.0`;
2. one fixed symmetric separable blur program executed horizontally and
   vertically;
3. one full-resolution composite that adds scene-wide bloom and the fixed
   MIT-reference ghost/halo pattern in scene-linear HDR.

The composite preserves input alpha, has no screen blend/tone mapping and uses
the existing RGBA16F finite guard. New GLSL must retain exact MIT provenance for
the adapted `three-geospatial@b012ad06` source paths.

### 3. Occlusion and ordering

- Execute after the complete current Aerial/cloud result in the existing
  `_executeHdr` delegation and before Cesium postprocess/tone mapping.
- Gate lens artifacts by Sun projection in front/in viewport, exact raw clear
  depth at the Sun coordinate, and the thresholded final HDR Sun signal.
- Let the existing final HDR signal carry cloud attenuation. Do not sample or
  reinterpret Cloud MRT/BSM/history for A7.
- Keep general bloom independent of Sun visibility.

### 4. Deterministic resources and lifecycle

Use exactly:

- three new programs;
- four new commands;
- two half-resolution and one full-resolution color-only RGBA16F framebuffer
  managers/textures;
- zero depth attachment, history, readback, asset or external dependency.

The viewport budget is
`8*W*H + 16*ceil(W/2)*ceil(H/2)` bytes. Both toggles false returns the incoming
texture before allocation/commands. First use and resize are failure-atomic;
allocated resources remain warm until normal controller release/destroy.

### 5. Native conflict boundary

Keep the existing unconditional Globe `scene.sunBloom === false` contract. If
SceneGIS bloom is shown, require Cesium
`scene.postProcessStages.bloom.enabled === false`; never rewrite it. Active
external mutation enters the existing fail-closed controller error path. Do not
modify `Scene.js`, `PostProcessStageCollection`, `SunPostProcess` or
`PostProcessStageLibrary`.

### 6. Direct owner page

Extend `Test/高级环境.html` only with visible A7 controls and three direct fixed
Globe observations:

- visible high-Sun bloom plus ghost/halo;
- the same stack with lens artifacts disabled;
- an occluded/below-horizon Sun state with no lens artifact.

Report current toggles, threshold/intensities, Sun elevation and existing
finite/display summaries. Do not add replay, hashes, convergence, retries,
settling renders, parameter sweeps or FPS gates.

## Expected product paths

- `packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- new SceneGIS-owned GLSL under
  `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `Test/高级环境.html`
- `scripts/scenegis/verify-planar-packages.mjs` only for public default/package
  expectations, if required
- active A7 plan/review, extension README, ADR-0049 and reference source map

No upstream-owned or generated path is authorized.

## Minimal sufficient validation

1. One actual-GPU A7 fixture proving threshold/blur/additive result, alpha
   identity, finite/storage bounds and clear-versus-finite-depth lens occlusion.
2. Amend one existing lifecycle/public fixture for defaults/ranges, both-off
   zero work, resize/destroy and built-in bloom conflict.
3. Focused `SceneGISEnvironmentEffects` aggregate and A1 private pipeline.
4. `packages/engine` TypeScript check and installed-package verification because
   the public JSDoc surface changes.
5. Focused ESLint, formatting, Markdownlint and `git diff --check`.
6. The three direct Globe page observations, followed by Architecture review and
   project-owner visual judgment.

Do not run the full repository Spec, Scene aggregate, unrelated generators,
docs build or cross-product matrix unless a concrete failure expands the risk.

## Stop conditions

Execution stops and reports evidence before expanding scope if any of these is
required:

- a new upstream hook/SGP or ordinary public `PostProcessStage`;
- another full-resolution scene owner, depth texture, history, static asset or
  runtime dependency beyond the frozen budget;
- changing A2-A6 radiometry, tone mapping, exposure, A6 history, native effects,
  A8-G or Planar behavior;
- hiding an invisible/overbright result with Test-only state, screen blend,
  clamp, retry or settling frame.

## Handoff

Execution implements this plan, records exact resource deltas and minimal
evidence in the A7 review, then returns an uncommitted/unpushed `review_ready`
candidate. Architecture performs independent review before any owner gate,
checkpoint or A8-G activation.
