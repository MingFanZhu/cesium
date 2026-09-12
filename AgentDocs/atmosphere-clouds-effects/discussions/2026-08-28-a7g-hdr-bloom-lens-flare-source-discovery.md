# A7-G HDR Bloom and Lens Flare Source Discovery

## Metadata

- Status: `resolved; A7-G completed`
- Date: `2026-08-28`
- Owner: Architecture Agent
- Scope: Globe A7-G only; A8-G and Planar deferred
- Predecessor checkpoint:
  A6-G=`201f6edada8fe2738bf9eb3277a30ea3b519e7d7`
- Phase plan:
  [A7-G Globe HDR bloom and lens flare](../plans/2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md)
- Decision:
  [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)

## Current SceneGIS facts

- `SGP-0008` already invokes the SceneGIS-owned HDR slot after resolved scene
  color/depth and before Cesium ambient occlusion, built-in bloom, tone mapping,
  custom stages and FXAA. A7-G needs no new `Scene.js` seam.
- A2-A6 return one final scene-linear HDR texture from
  `_SceneGISEnvironmentEffectsRenderer.executeHdr`. A7-G can consume that texture
  after aerial/fog/cloud composition without relighting or changing depth.
- Globe activation already requires native `scene.sunBloom === false` and hides
  the native Sun body. Cesium's `SunPostProcess` is therefore outside the active
  authority. The separate `scene.postProcessStages.bloom` remains caller-owned
  and must not run together with SceneGIS bloom.
- Existing SceneGIS renderer ownership uses `FramebufferManager`, `DrawCommand`,
  `ShaderProgram`, preallocated pass state and failure-atomic candidate
  replacement. No raw WebGL or public `PostProcessStage` is needed.

## Audited references

Architecture rechecked the already downloaded fixed references:

- `yuwoniu03/cesium-clouds-atmosphere@1f38602b84ab5c3f2bc289f9e4464df3db917155`
  - `src/AtmosphereFromThreeGeospatial/LensFlareBloomStage.js`
- `takram-design-engineering/three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`
  - `packages/effects/src/LensFlareEffect.ts`
  - `packages/effects/src/DownsampleThresholdMaterial.ts`
  - `packages/effects/src/LensFlareFeaturesMaterial.ts`
  - `packages/effects/src/shaders/downsampleThreshold.frag`
  - `packages/effects/src/shaders/lensFlareFeatures.frag`
  - `packages/effects/src/shaders/lensFlareEffect.frag`
  - `packages/effects/LICENSE`

The upstream `packages/effects` license is MIT, copyright 2024 Shota Matsuda.
The fixed sources establish a half-resolution bright threshold, blurred bright
field, mirrored chromatic ghosts, aspect-correct halo and additive HDR
composition. Their defaults establish threshold level `10`, range `1`, bloom
intensity `0.05`, and procedural ghost/halo source amplitudes `1e-5`.

The Cesium fork demonstrates Sun projection plus terrain-depth occultation but
uses a normal public `PostProcessStage`, single-pixel synthetic Sun bloom,
screen blend and post-stack ordering. Cesium's own `SunPostProcess` and
`PostProcessStageLibrary` provide useful blur/resource comparisons but are not
the SceneGIS runtime owner.

## Adopted topology

1. Run after the complete A2-A6 HDR composition inside the existing SceneGIS
   slot.
2. Downsample and smooth-threshold scene-linear luminance into one half-size
   RGBA16F target.
3. Apply the fixed separable blur as three progressive horizontal/vertical
   octaves with direction radii `1`, `2` and `4` through the same two half-size
   RGBA16F targets.
4. Composite scene-wide bloom and reference-derived ghost/halo samples into one
   full-size RGBA16F output, preserving input alpha.
5. Gate only the Sun lens artifacts by an in-front/in-viewport Sun projection,
   exact raw clear depth at the Sun coordinate, and the thresholded final HDR
   Sun signal. Terrain and opaque geometry therefore block the flare; cloud
   attenuation is already present in the final HDR input. Bloom remains a
   general visible-bright-source effect.

This is four commands, three programs and three color-only framebuffer
managers. It needs no history, readback, depth attachment, static texture or
runtime dependency. Approximate persistent bytes at viewport `W x H` are
`8*W*H + 16*ceil(W/2)*ceil(H/2)`, or about `12*W*H` bytes.

## Rejected mechanics

- Public/custom `PostProcessStage` insertion after SceneGIS display ordering.
- Native `SunPostProcess`, native general bloom running simultaneously, or a
  second Sun/bloom authority.
- Raw `_gl`, third-party renderer/pass objects, runtime fetch, lens dirt/star
  assets, mipmap-history chains or temporal flare buffers.
- Screen blend, gamma, exposure, ACES or any second tone mapper.
- Radial blur, A5 crepuscular-ray changes, A6 history changes, A8 qualification
  work or any Planar execution.

## Minimal evidence boundary

One controlled actual-GPU fixture is sufficient to prove threshold/blur/HDR
composition, alpha preservation and terrain/cloud visibility semantics. One
existing lifecycle/public fixture may be amended for allocation, resize,
destroy and native-bloom conflict. The live page needs only fixed visible-Sun,
occluded-Sun and toggle observations; no replay, hash, convergence, FPS gate or
parameter sweep is authorized.

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

## A7-AR-004 reference re-audit — 2026-08-28

The fixed `three-geospatial` implementation does not use a single small blur for
the complete effect: `LensFlareEffect.ts` uses an eight-level
`MipmapBlurPass` for bloom and a separate small `KawaseBlurPass` before ghost/
halo extraction. The first A7 adaptation collapsed both scale domains into one
horizontal/vertical finite-support convolution. The project-owner image now
demonstrates the consequence: the extreme HDR Sun exposes the rectangular
support as a white square, while transformed lens features inherit the narrow
source footprint.

SceneGIS will not import the third-party pass graph or add a mip chain in this
phase. The accepted bounded adaptation uses three fixed octave radii `1/2/4`
through the existing two ping-pong targets and command objects. It preserves the
current normalized kernel energy and all radiometric/public/resource contracts
while restoring a materially broader source for both bloom and features.

## A7-AR-004 execution result — 2026-08-28

SceneGIS now applies the existing normalized separable kernel progressively at
fixed radii `1/2/4`, ping-ponging through the same two half-resolution targets.
The final broad field supplies both general bloom and lens features. The focused
GPU mutation confirms support beyond the former single-octave footprint, and
the one fixed high-Sun inspection no longer shows its saturated square while
the ghost/halo field is materially broader.

Architecture independently reran the focused GPU fixture with `1/1 SUCCESS`
and closed the product finding. The later `A7-AR-005` concerns only the Test
owner camera: the named high-Sun witness does not currently place the Sun in the
viewport, so it cannot validate the accepted product visually.

## A7-AR-005 execution result — 2026-08-28

The Test witness now derives heading and pitch from the current WGS84 local Sun
after the high-Sun clock update, without changing the fixed ground destination.
The single required click placed the Sun in the Globe viewport and exposed the
accepted broad, circular bloom/halo field without the former square footprint.
No product or reference adaptation changed.

## A7-AR-006 reference balance audit — 2026-08-30

The project-owner image distinguishes a reasonable horizon-crossing Bloom from
an underpowered lens halo. The former is an additive screen-space point-spread
function and must not be clipped by terrain at each blurred destination pixel.

The latter has a direct coefficient mismatch. The fixed reference combines
overall intensity `0.005` with ghost/halo coefficients `0.001`, so its
feature-to-bloom ratio is `0.001`. SceneGIS currently combines internal feature
amplitude `1e-5`, public lens intensity `1.0` and bloom intensity `0.05`, so its
ratio is `0.0002`. A public default of `5.0` restores the reference ratio exactly
without changing the internal shader coefficient, topology, resources or Bloom.
This analytic mapping replaces any parameter sweep.

## A7-AR-006 execution result — 2026-08-30

The analytic ratio is now realized by the public default `5.0`; the internal
`1e-5` feature amplitude and `0.05` Bloom default remain unchanged. The one
fixed high-Sun observation showed the expected stronger broad halo/ghost
balance without changing the accepted screen-space Bloom behavior.

Architecture independently confirmed the complete default chain and reran the
single constructor-contract Spec with `1/1 SUCCESS`. The analytic reference
mapping is accepted without a sweep; only the project-owner visual re-gate
remains.
