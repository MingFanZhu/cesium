# Review: R6 Screen-space Reflections

## Metadata

- Type: `review`; status: `completed` technical self-review; owner visual gate passed on 2026-09-19
- Date: `2026-09-19`; owner / reviewer: Current task, architecture and execution self-review
- Target: [R6](../plans/2026-09-19-r6-screen-space-reflections.md)
- ADR: `ADR-0086`; SGP: `SGP-0016`; open discussions: None

## Findings and dispositions

| ID    | Severity | Finding                                                                                                            | Disposition                                                                                                                                                                               |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R6-F1 | P1       | Resolved color/depth cannot recover evaluated material roughness, normal mapping or separate clearcoat directions. | Capture directions and roughness at native base/clearcoat IBL evaluation after custom material changes. Strict GPU tests inspect different lobe directions and roughness.                 |
| R6-F2 | P1       | Adding SSR to final color would duplicate IBL and bypass native material weights.                                  | Blend incoming radiance with the original IBL sample before the native Fresnel, BRDF LUT, IBL factor and AO. Actual colored-hit and rough/missing-ray equality tests pass in both worlds. |
| R6-F3 | P1       | Native log and multiple frusta have incompatible depth ranges.                                                     | Replay the existing native commands far-to-near and merge each range into R32F eye depth. Orthographic multi-frustum testing with native AO/shadows and picking passes.                   |
| R6-F4 | P2       | Color-mip filtering alone leaves an unnaturally hard glossy reflection silhouette.                                 | Add a separable material/depth-aware filter of premultiplied hit radiance and confidence. Inspected the corrected roughness-0.3 result. Sharp surfaces retain the unfiltered sample.      |
| R6-F5 | P2       | Inline property JSDoc tags did not produce class member types.                                                     | Use proper multiline tags. Regenerated public class has typed options/properties and readonly ready; private renderer is omitted. Root/engine TypeScript checks pass.                     |

## Verification

- 27 focused strict WebGL Specs passed in Chrome Headless 153: 6 SSR, 10 AO, 6 sky reflection,
  2 physical model lighting and 3 native IBL pipeline tests.
- SSR coverage: actual red-object hit, authored KTX2 IBL fallback, roughness cutoff, removal of
  a reflected object, large planar coordinates, Globe ENU coordinates, custom material evaluation,
  independent clearcoat, orthographic/multiple frusta, default log depth, AO/shadows, picking,
  lazy allocation, invalid configuration/HDR activation, resize, reuse and explicit/Scene destruction.
- The initial Globe test used a non-unit Camera direction; native Globe setView interpreted it
  differently from the normalized example. Correcting the fixture to the native unit-vector contract
  gives the same reflection result. No Camera implementation or unrelated test expectations changed.
- Development build, release build, declaration generation and root/engine TypeScript checks pass.
  Existing upstream JSDoc warnings remain; no new SSR JSDoc warnings remain.
- Scoped ESLint, upstream diff review and patch audit pass. Only three upstream files changed,
  with paired markers; generated delivery status is zero.
- Scoped Prettier and all-AgentDocs markdownlint pass. The mandatory all-AgentDocs Prettier check
  reports the same 316 pre-existing warnings in untouched files; no R6 file is among them.
- Actual example inspected in both worlds, SSR enabled/disabled and roughness 0.08/0.3.
  No render error is reported. The example uses five local native glTF models and physical sky IBL.
- A real middle-button orbit updates the reflection with the new camera in the current frame.
  The delivered page is restored to its default view and settings after diagnostics.

## Bounded performance and resource evidence

Windows 10, Chrome 153 / ANGLE D3D11, NVIDIA GeForce RTX 3060 Ti, 1185 x 667, Planar example,
five PBR models, native CSM, physical atmosphere/IBL, floor roughness 0.3, 96 traversal steps.
EXT_disjoint_timer_query_webgl2 measured the full frame, with 6 warm and 24 measured frames per state;
disjoint was false. Temporary render-loop and enable settings were restored.

| State        | Median GPU time | P95 GPU time |
| ------------ | --------------- | ------------ |
| SSR disabled | 2.875 ms        | 4.401 ms     |
| SSR enabled  | 4.571 ms        | 5.931 ms     |

The observed median increase is 1.696 ms for this scene, not a general performance guarantee.
Each frame captures six opaque commands (five models and surface), copies depth per frustum,
generates color mips and runs one dual-lobe trace plus two filter draws. Receiver shaders borrow
up to two result samplers; material texture budgets still apply.

Targets use approximately 66.7 bytes per drawing-buffer pixel including color mips:
three RGBA16F capture attachments, depth/stencil, R32F eye depth, two RGBA16F trace targets and
two RGBA16F filter targets. This is about 50.3 MiB here, or 131.8 MiB at 1920 x 1080, excluding
driver metadata and ShaderCache. Disable retains targets; destroy releases them. Replay cost and
full-resolution storage are explicit limits of this first implementation.

## Upstream files

All changes use `SGP-0016`:

- `packages/engine/Source/Scene/Scene.js`: effect preparation, capture scheduling, draw dispatch and destruction.
- `packages/engine/Source/Shaders/Model/ImageBasedLightingStageFS.glsl`: base/clearcoat radiance substitution before BRDF weighting.
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`: evaluated clearcoat direction.

## Remaining limits and handoff

Only opaque native PBR receivers with specular IBL are qualified. Opaque depth-writing terrain and
primitives can supply reflected color/depth; this does not make legacy terrain a PBR mirror.
3D Tiles use the same native Model material path; no separate tileset-specific material system is added.
Transparent surfaces, classification overlays, labels, hidden/offscreen geometry and recursive
reflections are excluded. Screen-edge fades and thin-geometry misses remain intrinsic screen-space
limits. Glossy mip/cone plus spatial filtering is approximate and has no stochastic GGX or temporal
history; no claim of TAA-grade motion stability is made. Medium transport along the reflected segment
is not integrated; the ordinary camera-to-surface environment composition keeps its existing order.

Technical self-review and explicit owner visual acceptance are complete on 2026-09-19.
Create the isolated R6 checkpoint before the requested local-water phase.
