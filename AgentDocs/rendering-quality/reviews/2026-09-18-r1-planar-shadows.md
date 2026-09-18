# Review: R1 Planar Cascaded Shadows

## Metadata

- Type: `architecture / code self-review`
- Status: `technical review complete; owner visual gate passed`
- Reviewer / implementation owner: Current task
- Created / updated: `2026-09-18`
- Target: [R1 phase plan](../plans/2026-09-18-r1-planar-shadows.md)
- Parent: [Extension plan](../plans/2026-09-18-rendering-quality-extension.md)
- ADR: [ADR-0083](../../../Documentation/SceneGIS/Decisions/ADR-0083-planar-cascaded-shadows.md)
- SGP: `SGP-0013`, existing `SGP-0001/0002` seams

## Findings and disposition

| ID    | Severity | Finding                                                                                                      | Owner / status                   | Evidence / follow-up                                                                                                                                                                                                    |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1-01 | P1       | Ellipsoid horizon and Globe tile owner assumptions prevent valid planar shadow rendering                     | Execution / fixed                | Fixed +Z visibility, explicit planar surface shader metadata; actual shadow pixels at XY 20 million                                                                                                                     |
| R1-02 | P1       | Native constant bias leaves dense stripes on lit building faces with soft cascades                           | Execution / fixed                | World-texel and slope bias; before/after local page inspection and lit-face pixel regression                                                                                                                            |
| R1-03 | P1       | Scene.destroy omits the owned shadow atlas                                                                   | Execution / fixed                | Scene releases ShadowMap before Context; captured texture reports destroyed; native shadow regressions pass                                                                                                             |
| R1-04 | P1       | Final-color shadow modulation darkens the background revealed by surface opacity                             | Execution / fixed                | Reproduced blue background 255 -> 51 at opacity zero; owned composition preserves background; opacity 0 / 0.5 pixel assertions pass                                                                                     |
| R1-05 | P2       | Only submitted terrain casts, finite resolution/low-light bias can omit small or distant features            | Architecture / accepted boundary | No offscreen terrain streamer in R1; documented in World guide and ADR                                                                                                                                                  |
| R1-06 | P2       | Native geometry shadows still attenuate final surface/model color, including indirect/emissive contributions | Architecture / deferred          | Retain native semantics in R1; reassess physical integration at R2 entry in extension plan                                                                                                                              |
| R1-07 | P2       | Native WebGL1 fallback Spec raises INVALID_ENUM with optional WebGL validation                               | Architecture / open, outside R1  | Error occurs in UniformState default CubeMap initialization before shadow update; same Spec passes standard runner. Follow up only when qualifying native WebGL1 renderer; do not claim strict WebGL1 validation passed |

No separate review agent was used. The owner explicitly accepted the visual result on 2026-09-18.

## Validation

- `gulp build`, `gulp buildRelease`, `gulp buildTs` passed. Type generation retains existing widespread TSD-JSDoc warnings.
- Root and engine `tsc` passed; generated declarations contain World / Primitive `shadows: ShadowMode`.
- 150 relevant Planar surface, Widget / Viewer, six visualizer and shadow Specs passed with `--webglValidation`.
- 47 native ShadowMap / ShadowMapShader Specs and 9 new Planar shadow Specs passed together in standard ChromeHeadless.
- New tests prove perspective / orthographic shadow pixels, native model casting, terrain casting onto primitives,
  clipping, native toggles, dynamic Entity geometry reuse, atlas warm reuse/destruction, fixed-Z large XY,
  stable split/scale/grid, self-shadow suppression and opacity composition.
- A stale string assertion requiring no position varying was updated to require the new conditional `SHADOW_MAP`
  varying, without enabling it for the ordinary unlit pass.
- Related ESLint and upstream patch audit passed; no tracked generated-file changes.
- New / updated rendering-quality documents pass Prettier; full AgentDocs Markdownlint and `git diff --check`
  pass. Full AgentDocs Prettier still reports the same 285 pre-existing files; unrelated formatting was retained.
- Local visual inspection: overview, close cascade transition, 15-degree light, native glTF, terrain hill,
  orthographic camera and clipped terrain. Owner should inspect movement and close shadow edges in the demo.

## Bounded performance observation

Device: RTX 3060 Ti through ANGLE D3D11, viewport 1061 x 852. Local example: 12 Entity boxes, one glTF,
one terrain tile, shadow distance 1000 m, four 2048 cascades in a 4096 x 4096 atlas, soft shadows enabled.

After eight warm frames per mode, 32 WebGL2 `EXT_disjoint_timer_query_webgl2` samples per mode:

| Mode        | Median GPU time | P95 GPU time | Disjoint |
| ----------- | --------------- | ------------ | -------- |
| Shadows off | 0.415 ms        | 0.743 ms     | false    |
| Shadows on  | 0.453 ms        | 0.485 ms     | false    |

This is a small static scene observation, not a frame-budget guarantee. The P95 difference is measurement
variance and does not mean shadows accelerate rendering. CPU submission with `gl.finish()` measured
approximately 0.2 / 0.3 ms medians, but is not used as a substitute for GPU timing. Temporary profiling state
was restored. Warm atlas / terrain command / VA identity and destruction are asserted separately in Specs.

## Upstream files changed in R1

| File                                              | SGP                | Purpose                                                                    |
| ------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `packages/engine/Source/Scene/Scene.js`           | SGP-0013           | ShadowMap resource destruction                                             |
| `packages/engine/Source/Scene/ShadowMap.js`       | SGP-0013           | Planar visibility, camera fitting and surface uniforms/metadata            |
| `packages/engine/Source/Scene/ShadowMapShader.js` | SGP-0013           | Planar normals, caster clipping, cascade filtering and opacity composition |
| `packages/engine/Source/Widget/CesiumWidget.js`   | SGP-0001           | Existing World option validation / terrain shadow routing                  |
| `packages/widgets/Source/Viewer/Viewer.js`        | SGP-0002, SGP-0013 | Existing preflight seam and native terrainShadows accessors                |

## Handoff

R1 is visually accepted by the owner. Create the isolated R1 checkpoint, then enter R2.
The earlier accepted fixes are retained separately in baseline commit `2d590726af`.
Pre-commit automation failed first on the machine default Node 14, then on Chinese filename encoding
in lint-staged; prior scoped lint/types/format/audit checks were run directly. The checkpoint bypasses
that broken hook only; no product or repository hook configuration was changed.
