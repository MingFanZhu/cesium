# Phase Plan: A7-G Globe HDR Bloom and Lens Flare

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture and owner visual gates passed`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md](2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md)
- Frozen predecessor checkpoint:
  A6-G=`201f6edada8fe2738bf9eb3277a30ea3b519e7d7`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-28`
- Updated: `2026-08-31`
- Branch: `feature/atmosphere-clouds-effects`
- Decision:
  [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)
- Source discovery:
  [A7-G HDR bloom/lens flare source discovery](../discussions/2026-08-28-a7g-hdr-bloom-lens-flare-source-discovery.md)
- Upstream patches: active `SGP-0008` (`consume only`), active `SGP-0009` (`unchanged`)
- Open review findings: `none; A7-AR-001 through A7-AR-006 closed`
- Owner visual gate: `passed by project owner on 2026-08-31`

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
- `lensFlareIntensity=5.0`, finite `[0,64]`

They are warm setters that request rendering without touching cloud history.
Globe consumes them in A7-G; Planar runtime remains exact unchanged.

### 2. Reference-shaped HDR implementation

Add SceneGIS-owned GLSL for:

1. half-resolution luminance threshold/downsample using threshold range `1.0`;
2. one fixed symmetric separable blur program executed as three progressive
   horizontal/vertical octaves with direction radii `1`, `2` and `4`;
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

## Execution evidence — 2026-08-28

- Implemented the Globe-only half-resolution threshold, shared separable blur and
  full-resolution additive HDR composite. The lens branch uses the fixed
  reference ghost/halo amplitude `1e-5` and is gated by projected Sun visibility,
  exact-clear resolved depth and the final-HDR threshold.
- Added warm public controls with defaults `true/true/10/0.05/1`; all setters
  request render without invalidating A6 history. Planar execution remains an
  exact bypass.
- Lazy A7 topology is exactly three programs, four commands and three color-only
  RGBA16F targets. Bytes are
  `8*W*H + 16*ceil(W/2)*ceil(H/2)`; resource/pass/history/upstream/SGP deltas are
  `3 programs / 4 commands / 3 FBOs / 0 history / 0 upstream / 0 SGP`.
- Focused actual-GPU A7 and lifecycle fixtures pass. Final focused controller,
  A1 pipeline, TypeScript, installed-package and changed-scope checks are listed
  in the A7 review. Browser observations used only the three fixed Globe states;
  render errors were zero.

## A7-AR-001/002 execution correction — 2026-08-28

The two half-resolution targets now explicitly retain the renderer-owned linear
sampler across initial allocation and resize. The existing composite adopts the
fixed mirrored ghost offsets/colors and aspect-correct chromatic halo/ring mask.
The amended single GPU fixture uses one localized nonuniform source, rejects a
forced nearest-sampler mutation, observes a separated ghost and verifies finite
depth suppression. No topology, API, history, upstream, SGP or Planar boundary
changed.

## A7-AR-003 Test layout correction — 2026-08-28

The existing A7 evidence `<pre>` now uses a bounded, scrollable fixed overlay on
the right. One direct `1600 x 900` high-Sun click left `.worlds` and the Globe
viewer height exactly unchanged at `483.6328125 px`; the overlay remained right
of `x=885.5078125 px`. No capture, owner-state or product behavior changed.

## A7-AR-004 Architecture assignment — 2026-08-28

The project owner rejected the fixed high-Sun image because bloom expanded the
Sun into a saturated square and the lens artifacts were too small. The current
single horizontal/vertical finite-support blur is the first causal divergence
from the audited reference multi-scale bloom and pre-blurred feature topology.
The bounded repair retains the existing programs, command objects, targets,
bytes and public values, and executes the shared normalized blur at fixed radii
`1`, `2` and `4` through the existing ping-pong targets. The resulting broad
field feeds both bloom and the accepted ghost/halo mapping. One amended GPU
fixture and one fixed browser observation are sufficient; no sweep, new test,
hash/replay machinery, tone transfer, radiometric change or resource expansion
is authorized.

## A7-AR-005 execution correction — 2026-08-28

The two existing high-Sun A7 buttons now reuse the accepted local-ENU live-Sun
alignment at the unchanged 15°E/45°N, `500 m` ground destination. A single fresh
high-Sun click visibly contained the `67.484068°` Sun, a broad smooth halo and
no rectangular bloom footprint. The below-horizon state, capture contract,
owner parameters and all product paths remain unchanged.

## A7-AR-004 execution correction — 2026-08-28

The accepted two-target ping-pong graph now reuses its existing horizontal and
vertical commands for fixed progressive radii `1/2/4`, yielding six blur
executions before the unchanged composite. The existing GPU fixture passes and
rejects the former single-octave schedule through direct support outside its
finite footprint. One frozen high-Sun observation showed a broad smooth field
without the former saturated square and with materially larger lens features;
no resource, API, physical-source or Planar boundary changed.

## A7-AR-004 closure / A7-AR-005 assignment — 2026-08-28

Architecture independently accepted the three-octave product scheduling and
reran its single GPU fixture with `1/1 SUCCESS`. A fresh owner-page click then
showed that `A7 可见高日` still uses the north-facing `ground` camera and does
not put the 67.484° Sun or any lens artifact in the viewport. `A7-AR-005` is a
Test-only witness correction: align the unchanged ground destination to the
live local Sun for the two high-Sun A7 states, retain every product/owner value,
and repeat exactly one direct click. No new metric, retry, Spec or product test
is authorized.

## Architecture A7-AR-005 closure — 2026-08-28

The Test refactor preserves the accepted A5 state, applies live-Sun alignment
only to the two A7 high-Sun buttons and leaves the night path unchanged. One
independent fresh `1600 x 900` click now centers the Sun in the complete Globe
viewport; the former rectangular bloom support is absent and the field is broad
and continuous. All code findings are closed. Project-owner judgment of bloom
softness and the ghost/halo balance is now the only remaining phase gate.

## A7-AR-006 Architecture assignment — 2026-08-30

The project owner accepts the horizon-crossing bloom as a plausible optical
result but finds the lens halo too faint. Bloom is already depth-resolved at its
visible source and then deliberately spreads as a screen-space point-spread
function, so its terrain overlap remains frozen.

The fixed reference feature-to-bloom coefficient ratio is `0.001`, while the
current SceneGIS defaults produce `1e-5 / 0.05 = 0.0002`. Set only the public
`lensFlareIntensity` default from `1.0` to `5.0`, which restores
`5e-5 / 0.05 = 0.001`. Update existing default/package expectations and the
visible Test default/range, but do not change GLSL, Bloom, resources, depth,
tone transfer, Planar or A2-A6. Use the existing constructor Spec, package
verifier and one fixed owner observation only; no new test or parameter sweep is
authorized.

## A7-AR-006 execution correction — 2026-08-30

Execution changed only the public/JSDoc/Test/package default from `1.0` to
`5.0`, retaining the `[0,64]` range and shader coefficient. The focused
constructor Spec and installed delivery verifier pass. The single fixed owner
observation showed the intended stronger soft lens field with no new
rectangular support; no Bloom, depth, resource or physical-source path changed.

## Architecture A7-AR-006 closure — 2026-08-30

Architecture verified the complete default chain and unchanged explicit-value,
range, GLSL, Bloom and resource contracts. The existing constructor Spec was
independently rerun with `1/1 SUCCESS`; the sequential installed-package result
is accepted as the direct delivery authority. `A7-AR-006` is closed and the
same fixed default-5 owner image is ready for visual re-gate. No further sweep,
test matrix or product change is authorized before that judgment.

## Project-owner visual acceptance — 2026-08-31

The project owner inspected the final default-5 image and explicitly reported
`通过`. The accepted result retains the broad screen-space Bloom across the
terrain silhouette and the reference-balanced stronger lens halo/ghost field.
Architecture therefore closes A7-G. The phase-closing local commit containing
this record is the isolated A7-G checkpoint; it is not pushed. A8-G requires a
separate Architecture source-discovery and activation.
