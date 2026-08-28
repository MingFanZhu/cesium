# A7-G HDR Bloom and Lens Flare Source Discovery

## Metadata

- Status: `resolved; A7-G activated`
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
3. Apply one fixed separable blur through a second half-size RGBA16F target.
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
