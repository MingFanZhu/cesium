# Review: Depth and Shadow Submission Cost

- Type: `review`; status: `completed`; updated: `2026-09-19`
- Reviewer / owner: Current task, architecture and execution self-review
- Target: [R13](../plans/2026-09-19-r13-pass-submission.md), after R12 `3df2db9e84`
- Decision: `ADR-0092`; seams: `SGP-0013/0014/0021`

## Findings and disposition

- P1, fixed: Native floating arrays compare JS doubles with Float32 cache values. Static fractional
  cascade matrices, spherical harmonics and cloud transforms repeatedly upload. Seven native float
  upload sites now consult an owned cache of the actual packed bits. Nine strict GPU regressions
  verify reuse, callback evaluation, new object identity, in-place mutation and restoration, across
  float/vec/mat types and Color. Native packing, validation, integers and samplers remain unchanged.
- P1, fixed: Native depth derivation retains ModelFS for discard and log depth, including lighting.
  An explicit AO depth define skips only lightingStage. Real linked depth programs contain none of
  the cloud/cascade/spherical-harmonic lighting uniforms. Alpha-mask and clipping tests compare the
  complete AO debug image with the original lighting path; pixels match. Custom discard, moving
  occluders, direct/emissive separation, both Worlds and resource lifetime pass existing tests.
- P1, fixed: Tile model camera culling is delegated to traversal, leaving `command.cull=false`.
  Applying it to each light volume sends every caster to all four cascades. Tile-owned commands now
  test their world bounds independently against each cascade. Unit coverage includes non-nested
  volumes; a real tileset verifies membership after camera motion and identical final pixels against
  the original submission path. Ordinary caller culling and point/single-pass lights remain native.
- P2, retained existing failure: Native ShadowMap's simulated no-depth-texture test raises
  `INVALID_ENUM` while creating the Context default CubeMap. A temporary restoration of all three
  changed upstream files to checkpoint `3df2db9e84`, followed by a development rebuild and isolated
  run, reproduces the same failure before shadow drawing. Changes are restored afterward. This
  unsupported-context initialization issue is outside the verified submission fixes and remains a
  renderer-compatibility follow-up; it is not reported as a passing test.

## Ownership and resources

Upstream-owned files changed:

- `packages/engine/Source/Renderer/createUniformArray.js`: SGP-0021 import and seven upload guards.
- `packages/engine/Source/Shaders/Model/ModelFS.glsl`: SGP-0014 depth-only lighting guard.
- `packages/engine/Source/Scene/Scene.js`: SGP-0013 tile cascade insertion dispatch and import.

The packed-bit cache adds one four-byte CPU word per floating uniform array component and one view
of existing packed storage. It belongs to the uniform/ShaderProgram. AO variants use weak source
keys and the native ShaderCache lifecycle. No new texture, framebuffer, shadow atlas, temporal
history or public API is added. R12's MRT memory cost remains unchanged. Native float packing and
callback work still happen; only identical GL uploads are eliminated.

## Verification

- Development and final release strict WebGL: 9 SceneGISUniformArray, 12 SceneGISAmbientOcclusion
  and 7 SceneGISShadowQuality tests pass.
- Release strict WebGL: 33 native Uniform, 9 SceneGISPlanarShadows, 9 SSR and 46 native shadow
  tests pass; the one native failure above reproduces on the previous checkpoint.
- Full release build, declarations (`buildTs`), full `tsc`, scoped ESLint/format, AgentDocs-wide
  markdownlint, diff check and upstream audit pass. The audit finds exactly three upstream delivery
  files and no dirty generated file. The required AgentDocs-wide Prettier check retains 316 existing
  formatting failures; changed AgentDocs files pass their explicit scoped check.
- Real Globe Viewer has no console error and preserves saved JSON, rendering settings, captured
  near camera, 4x MSAA, resolution and all effects. Temporary diagnostic functions are restored and
  the page is reloaded afterward to release diagnostic shader variants. Viewer source is unchanged.

## Real-scene evidence

RTX 3060 Ti / ANGLE D3D11, 1097 x 822, 14 layers, 1701 scene commands, 1574 main MRT opaque draws.
AO, SSR, four-cascade shadows and the physical environment remain enabled. Shadow pass membership
changes from `[1579, 1579, 1579, 1579]` to `[480, 1209, 1554, 1579]`: 6316 to 4822, saving 1494
draws per frame (23.7%). AO still submits geometry; this is not removal of the depth prepass.

Three-frame upload probes before/after the change:

| Uniform group         | Before, uploads/frame | After, uploads/static frame |
| --------------------- | --------------------- | --------------------------- |
| Cloud shadow matrices | 3149                  | 0                           |
| Spherical harmonics   | 2904                  | 0                           |
| Cascade matrices      | 1574                  | 0                           |
| Cascade splits        | 1574                  | 0                           |

Changed inputs still upload, as the GPU regressions demonstrate. Remaining native model-view and
terrain transforms legitimately vary by draw and are not suppressed.

An unchanged-view pre-reload sample measures 154.8–160.8 ms. For stronger comparison, one page then
alternates reconstructed previous work and optimized work: native float uploads, full Model depth
lighting, and original cascade submission are restored temporarily through private diagnostic
hooks/derived shaders. Each sample contains 24 natural frame intervals after three transition
frames; no instrumentation of draw functions is active during timing. All hooks are restored.

| Work                    | Mean frame time | Median frame time | FPS   |
| ----------------------- | --------------- | ----------------- | ----- |
| Previous work, sample 1 | 164.9 ms        | 162.7 ms          | 6.06  |
| Optimized, sample 1     | 53.7 ms         | 54.2 ms           | 18.63 |
| Previous work, sample 2 | 167.8 ms        | 166.2 ms          | 5.96  |
| Optimized, sample 2     | 53.1 ms         | 50.9 ms           | 18.83 |

Paired frame time falls about 68%, approximately tripling FPS. Scheduling makes absolute FPS vary;
do not combine this session's measurements with R12's earlier timings as a single benchmark.
The visible counter after measurement is 19 FPS. Quality settings and geometry selection are equal.

## Gate and remaining work

Technical review is complete with the existing compatibility failure explicitly retained. Owner
visual acceptance remains pending. Preserve an independent R13 commit before further work. Remaining
cost includes AO geometry, visible shadow geometry, terrain/draw state submission and effect passes;
19 FPS is not acceptance of overall performance. More aggressive AO pass sharing or shadow history
requires a separate phase and exact lighting/invalidation contracts. R7 night acceptance and the
Viewer's saved startup-camera configuration remain separate follow-ups.
