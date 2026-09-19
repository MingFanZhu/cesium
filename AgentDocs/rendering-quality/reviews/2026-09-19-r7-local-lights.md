# Review: R7 Local Night Lighting

- Type: `review`; status: `completed`; updated: `2026-09-19`
- Reviewer / owner: Current task, architecture and execution self-review
- Target: [R7 phase](../plans/2026-09-19-r7-local-lights.md), after R11 `a94a3232fb`
- ADR: `ADR-0090`; SGP: `SGP-0019/0020`

## Findings and disposition

- P1, fixed: OIT replaces the opaque Phong builtin. Include `translucentPhong` explicitly;
  retain direct-only directional shadow composition there. A real caster reproduced black
  transparent receivers under Sun shadows despite active local lights in both Worlds.
  The regression now covers opaque/translucent illumination, shadow independence and pick.
- P1, fixed: Native 8-bit bloom intermediates quantize HDR dark gradients and clip emission.
  Match Scene framebuffer precision, clamp negative extracted light, and preserve cache
  invalidation. Actual dark-emission/HDR-LDR/texture-lifecycle test passes.
- P2, accepted scope: Forward collection capacity is 16, including hidden descriptors;
  overflow throws. Local occlusion, GI and glTF light-node import remain deferred.
- P2, accepted scope: Native unlit/missing-normal/custom lighting, local water and vector
  classification are not relit by this phase. Baked scan lighting remains a content limit.

## Validation

- 15 development and 15 release GPU/API tests pass (strict WebGL validation); both Worlds, large planar
  coordinates, PBR/clearcoat, cone/distance/color, native/OIT Phong, lit terrain, unlit,
  emission/AO/Sun-shadow separation, SSR scheduling, API/capacity and lifecycle.
- 4 both-World night/reference E2E pass, including emission versus illumination controls,
  SSR+bloom, A/B restoration and destruction.
- 63 affected regressions pass: 7 direct-shadow, 10 AO, 6 SSR and 40 native post-process
  collection tests, with strict WebGL validation. Total development coverage: 78 tests.
- Manual night and Globe photogrammetry comparison show colored illumination and smooth
  bloom gradients. Independent example has 22 local GLB objects and 6 local lights.
- Development build, buildRelease, buildTs and TypeScript noEmit pass. Public declarations
  expose the three classes and typed mutable fields; private helpers stay private.
- ESLint, changed-file formatting, Markdown lint, diff check and upstream patch audit pass.
  Full AgentDocs Prettier still reports 316 existing unrelated files; no bulk reformat.

## Bounded performance and resources

Night example, Planar, 1185 x 667 drawing buffer, RTX 3060 Ti / ANGLE D3D11, 22 GLBs,
HDR and native bloom on, SSR off. Forty interleaved GPU timer samples per state after
12 warm renders: disabled median 0.518 ms, six lights median 0.571 ms, approximately
0.053 ms incremental whole-frame GPU time. P95 was 0.527 / 1.058 ms; shared desktop
GPU tails are noisy, so this is not a general frame-rate promise. The first separate
measurement had a cold/frequency discrepancy and was replaced by this paired measurement.

Local lights allocate fixed CPU arrays and cached derived shaders, no target or geometry
pass. The scene had 22 cached shaders after both states warmed. GPU tests verify reuse
on light movement, collection detach/recreate, Scene destruction and caller-owned lights.
Native bloom uses three full-resolution RGBA16F intermediates in this example, adding
about 9.05 MiB over their former RGBA8 storage. Native cache handles resize/mode switches;
GPU tests verify stable textures and old/new target destruction.

## Upstream-owned files

SGP-0019: `Scene/Scene.js`, `Shaders/Model/LightingStageFS.glsl`,
`Shaders/Builtin/Functions/phong.glsl`, `Shaders/Builtin/Functions/translucentPhong.glsl`,
`Shaders/GlobeFS.glsl` under `packages/engine/Source/`.

SGP-0020: `Scene/PostProcessStageCollection.js` and
`Shaders/PostProcessStages/ContrastBias.glsl` under the same source root.

## Gate

Technical self-review is complete with no unresolved blocking findings. Owner visual acceptance
has not been explicitly confirmed. On 2026-09-19 the owner redirected work to real-scene
performance; checkpoint the complete R7 implementation independently and retain visual
acceptance as a follow-up, without claiming it has passed.
