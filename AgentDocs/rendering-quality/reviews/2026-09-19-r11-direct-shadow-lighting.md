# Review: R11 Direct Shadow Lighting

- Type: `review`; status: `approved; owner advanced to the next phase`
- Created: `2026-09-19`; reviewer / owner: current task, architecture self-review
- Target: [R11 phase](../plans/2026-09-19-r11-direct-shadow-lighting.md)
- ADR: `ADR-0089`; SGP: `SGP-0018`
- Previous isolated checkpoint: R10 `c2e8127dcc`

## Findings and disposition

| Finding                                                                  | Severity | Disposition and evidence                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R11-F1: Final-color modulation darkens IBL and emission                  | High     | Fixed. Visibility is computed before material main. Direct PBR/clearcoat, Phong and lit terrain consume it before tone mapping. Seven GPU tests cover both Worlds, HDR/LDR, unlit models and terrain ambient.                                             |
| R11-F2: Native shadow tests assume indirect color must vary with shadows | Medium   | Fixed fixtures, unchanged assertions. Three tests now supply a direct receiver light; point-map directions light the wall under test. Original scene light is restored after each case. All 47 native tests pass.                                         |
| R11-F3: Test readiness and coarse Globe bounds                           | Low      | Fixed fixture. Wait for model readiness and a visible shadow range. The local building casts and receives; native fitting deliberately excludes coarse Globe tiles whose bounds surround the camera. No runtime range change or arbitrary settling frame. |
| R11-F4: Emissive example also had a direct specular term                 | Low      | Fixed material to pure emission. Both-world E2E now requires exact emission/reflection pixel equality when appropriate, rather than increasing tolerance.                                                                                                 |

## Validation

- GPU Specs in development: new lighting 7, native shadow 47, existing Planar shadow 9,
  ambient occlusion 10, screen-space reflections 6; all pass.
- Release lighting GPU tests: 7 pass. Root TypeScript check passes.
- Example E2E: new lighting 2 pass; existing reference/detail 5 pass. Native controls,
  shadow toggles, HDR, geometric zoom, both Worlds, atlas/model/IBL destruction are covered.
- Development/release builds and `buildTs` pass; existing upstream JSDoc warnings remain.
- Scoped ESLint / Prettier, full AgentDocs markdownlint and upstream patch audit pass.
  Full AgentDocs Prettier still reports the same 316 pre-existing unrelated files; scoped R11
  documents are clean. Audit reports five current upstream files and generated status zero.
- Manual visual inspection: independent three-panel example and AGI HQ close view in both
  Worlds. Lit portions retain their color; shadows retain sky/IBL, the metal environment and
  emission remain visible. No new shader/resource/render errors in the examples.

## Performance and lifecycle

Same RTX 3060 Ti / ANGLE D3D11, actual buffer 1185 x 667, R10 detail page at its default
close view, 14 local models, shadow size 2048, maximumDistance 350, soft shadows enabled.
Forty whole-frame GPU queries per measurement, eight warmup renders; disjoint is false.
R10 loaded page median 0.500736 ms; R11 median 0.507904 ms. P95 was 0.509952 versus
2.924544 ms, so this short shared-desktop sample establishes a stable median, not a tail-latency
guarantee. Discarded a measurement overlapping automated GPU tests. No extra texture, render
pass or atlas allocation; reuse and destruction are checked by GPU Specs and E2E.

## Upstream-owned changes

All changes below use `SGP-0018`; existing SGP-0009 marker boundaries in GlobeFS are split
to avoid nesting, with no additional behavior change.

- `packages/engine/Source/Scene/ShadowMapShader.js`
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`
- `packages/engine/Source/Shaders/Builtin/Functions/phong.glsl`
- `packages/engine/Source/Shaders/GlobeFS.glsl`
- `packages/engine/Specs/Scene/ShadowMapSpec.js`

## Remaining scope and handoff

No probe/GI implementation. Geometry visibility does not estimate sky occlusion or bounced
light, and cannot remove baked photogrammetry shadows. Phong retains its native approximate
lighting model. Plain unlit terrain and arbitrary final-color custom shaders retain their
existing receiver behavior. Material lighting explicitly opts into direct shadow composition.

The owner advanced to multi-light night rendering after reviewing [阴影光照](../../../Test/Rendering/阴影光照.html) and the shared
[实景对比](../../../Test/Rendering/实景对比.html). Checkpoint R11 before activating the next phase. No unresolved implementation finding remains.
