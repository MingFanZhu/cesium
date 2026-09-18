# Review: R2 Ambient Occlusion

## Metadata

- Type: `review`; status: `completed` technical self-review and owner acceptance
- Reviewer / implementation owner: Current task, architecture and execution self-review
- Date: `2026-09-18`
- Target: [R2 phase](../plans/2026-09-18-r2-ambient-occlusion.md)
- ADR: `ADR-0084`; SGP: `SGP-0014`; no open discussion
- Owner visual acceptance: Confirmed by owner continuation on 2026-09-19; R1 checkpoint is `4ea24b89ef`

## Findings and dispositions

| ID    | Severity | Finding                                                                                                                        | Disposition and evidence                                                                                                                                                                         |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R2-F1 | P1       | Native inverseProjection is deliberately zero for orthographic cameras; direct inversion reconstruction produced a black mask. | Fixed: use native window-to-eye reconstruction and parallel view rays. Perspective and orthographic real GPU contact/exposed-plane tests pass.                                                   |
| R2-F2 | P1       | Final-color modulation would attenuate direct light, emissive and atmosphere.                                                  | Fixed by current-frame prepass plus ambient/IBL receiver seams. Pixel test measures only the 0.3 terrain ambient fraction; native glTF test preserves direct/emissive HDR and attenuates SH IBL. |
| R2-F3 | P2       | Finite angular quadrature made exposed slopes sensitive to the spatial sampling phase.                                         | Fixed by normalizing each pixel's slice sum against its analytic open-hemisphere sum; inspected pure AO perspective/orthographic views. No history or frame settling.                            |

## Verification

- 72 targeted Specs passed with Chrome Headless 153 and WebGL validation: 10 new AO tests,
  9 accepted Planar shadow tests and 53 native PostProcessStageCollection/Library tests.
- New tests cover actual contacts, exposed planes, perspective/orthographic, same-frame removal and
  camera movement, non-log multiple frustums, native logarithmic depth, terrain clipping and model
  fragment discard, HDR direct/emissive/IBL, Globe contacts and sky, picking exclusion, target reuse,
  resize/destruction, zero intensity, native uniform callbacks and invalid radius.
- Visual inspection: deterministic wall/stair/stacked-box scene, pure AO and shaded output, both camera
  projections. Native physical atmosphere Globe and Planar pages also render with AO enabled and disabled under strict GL error checking; no draw errors.
- Full build and buildRelease passed; buildTs passed (existing upstream JSDoc warnings remain). Root and engine TypeScript checks and scoped JS ESLint passed. Upstream patch audit passes with exactly five current delivery upstream-owned files and no generated files.

- Scoped delivery formatting and all-AgentDocs markdownlint passed. The mandatory all-AgentDocs Prettier check reports 316 existing warnings in untouched files; none belong to this delivery. Those files were not reformatted.

## Bounded performance evidence

Windows 10, Chrome 153 / ANGLE D3D11, NVIDIA GeForce RTX 3060 Ti, 1185 x 667 drawing buffer.
Local example has native cascaded shadows enabled, radius 6 m, 8 directions x 8 samples, intensity 1.5.
EXT_disjoint_timer_query_webgl2, 6 warm frames and 24 measured frames per state:

| State  | Median GPU time | P95 GPU time | Disjoint |
| ------ | --------------- | ------------ | -------- |
| AO off | 0.535 ms        | 3.538 ms     | false    |
| AO on  | 1.906 ms        | 4.324 ms     | false    |

Observed median increment is 1.371 ms for this small static scene. This is not a general frame-budget
guarantee; additional opaque draw cost scales with scene complexity. Temporary profiling state was restored.
Targets occupy approximately 21 bytes/pixel including the native half-float pass-through output, excluding
driver padding and cached shader variants. Disable preserves owned targets; destruction releases them.

## Upstream files

All five files use `SGP-0014`, paired markers and the manifest entry:

| File                                                          | Seam                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/engine/Source/Scene/Scene.js`                       | Frame preparation, depth prepass, receiver dispatch               |
| `packages/engine/Source/Scene/PostProcessStageCollection.js`  | Native composite controls, context/lifetime, documented semantics |
| `packages/engine/Source/Shaders/Builtin/Functions/phong.glsl` | Ambient-only visibility                                           |
| `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`   | Base and clearcoat IBL visibility                                 |
| `packages/engine/Source/Shaders/GlobeFS.glsl`                 | Native lit terrain ambient floors                                 |

## Remaining limits and handoff

- Screen-space AO cannot recover hidden/offscreen occluders; thin geometry and disocclusion can change
  the estimate. Spatial filtering reduces noise without introducing temporal trails.
- SCENE3D / WebGL2 floating-point support is required explicitly. Transparent, classification, vector,
  labels, unlit materials and PBR models without normals do not gain AO receiver qualification.
- Native geometry shadows still modulate final surface color; changing that prior shadow convention,
  temporal accumulation and bent-normal specular occlusion are outside R2.
- Defaults are deliberately tuned for GTAO (1.5 / 0.03 / 1 m / 8 x 8); field names remain native.
  randomTexture is accepted but unused. The separate native private library factory remains unchanged.
- Owner acceptance confirmed on 2026-09-19. Save the isolated R2 checkpoint before R3 work. The previously reproduced lint-staged failure with Chinese filenames requires bypassing that hook for this checkpoint; scoped lint, formatting and validation passed directly.
