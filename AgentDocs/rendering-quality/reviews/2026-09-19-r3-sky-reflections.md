# Review: R3 Physical Sky Reflections

## Metadata

- Type: `review`; status: `completed`; technical self-review and owner visual gate passed
- Date: `2026-09-19`; reviewer / owner: Current task, architecture and execution self-review
- Target: [R3](../plans/2026-09-19-r3-sky-reflections.md)
- ADR: `ADR-0085`; SGP: `SGP-0015`; open discussions: None

## Findings and dispositions

| ID    | Severity | Finding                                                                                                                                     | Disposition                                                                                                                                                                              |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R3-F1 | P1       | Native RGBA8 capture loses HDR radiance; float framebuffer copies are explicitly unsupported.                                               | Fixed with owned RGBA16F input/output cubes and direct native framebuffer mip attachments. GPU tests preserve values above one through all GGX levels.                                   |
| R3-F2 | P1       | Native IBL reference matrices rotate with authored model/reference transforms.                                                              | Fixed with a separate stored world-to-capture rotation for base, anisotropic and clearcoat reflection directions. Real native PBR tests change referenceMatrix without rotating the sky. |
| R3-F3 | P1       | Scene-authored maps are bypassed by native procedural atlas selection; the fallback reads a flag from Model rather than ImageBasedLighting. | Physical variant now honors scene-map selection. Actual KTX2 model and scene map load/switch/restore GPU tests pass for both worlds; unrelated native selection remains unchanged.       |
| R3-F4 | P2       | Reusing the native convolution with unsquared perceptual roughness over-blurs polished materials.                                           | Supply alpha = roughness squared. Inspected five material roughnesses and GPU mip filtering; native shader is imported without copying or editing it.                                    |
| R3-F5 | P2       | Native clearcoat does not apply the caller's specular IBL factor.                                                                           | Physical lighting clearcoat now uses the same factor as the base layer, including authored maps. Native nonphysical behavior is preserved.                                               |

## Verification

- 50 focused Specs pass with Chrome Headless 153 and WebGL validation: 6 new sky reflection tests,
  2 existing physical-model tests, 3 native IBL pipeline tests and 39 native Framebuffer tests.
- Coverage: both atmosphere capture modes, HDR, all eight mip levels, horizon filtering, night floor,
  sun/altitude/frame/LUT invalidation, static reuse, ownership/destruction, native glTF clearcoat,
  large Planar coordinates, world-fixed referenceMatrix, actual model/scene KTX2 precedence and restore.
- Native DynamicEnvironmentMapManager suite: 43 passed, 4 failed. Running the pre-R3 manager gives
  the same four failures and numeric results (three color ratios, one groundAlbedo SH comparison).
  These are existing baseline failures, not attributed to R3. No upstream test expectations changed.
- An initially overbroad suite filter also selected FramebufferManager's unrelated invalid
  RGBA/UNSIGNED_INT allocation test; strict WebGL rejects its texImage2D before any Framebuffer seam.
  The final focused run targets Framebuffer exactly.
- Visual example: ten native glTF spheres, metallic and clearcoat rows, roughness 0.04–0.9,
  native shadows, both worlds. Inspected default, reflection off, sunset and night.
- Real Planar controller disable/re-enable releases the old probe and restores a shared new probe;
  controlled rendering and destruction pass strict GL checks with error zero. A pre-existing sticky
  INVALID_OPERATION was cleared before that isolated check, as in R2 browser diagnostics; it was not
  reproduced by the controlled reflection lifecycle or the strict GPU Specs.
- Native procedural capture gating still drains its existing command queue, allowing canceled captures to release queued owner references.
- Scoped delivery ESLint/format and all-AgentDocs markdownlint pass. The mandatory all-AgentDocs Prettier check reports 316 existing warnings in untouched files; none belong to R3.
- Full build, buildRelease, buildTs, root and engine TypeScript checks pass. Existing upstream JSDoc
  warnings remain. Scoped lint/format, AgentDocs checks and patch audit are recorded at handoff.

## Bounded performance evidence

Windows 10, Chrome 153 / ANGLE D3D11, NVIDIA GeForce RTX 3060 Ti, 1185 x 667.
The Planar ten-sphere example includes physical atmosphere and native CSM. EXT_disjoint_timer_query_webgl2,
6 warm frames and 24 measured frames per state, disjoint false:

| State                                                                 | Median GPU time | P95 GPU time |
| --------------------------------------------------------------------- | --------------- | ------------ |
| Reflection disabled                                                   | 3.616 ms        | 4.493 ms     |
| Cached sky reflections                                                | 0.663 ms        | 0.692 ms     |
| Sun advanced five minutes on every frame, forcing full capture/filter | 0.893 ms        | 0.948 ms     |

The disabled run was unexpectedly slower; these observations do not establish an off-to-on speedup.
Cached/refresh runs show bounded work in this small scene, not a universal performance guarantee.
Static scenes perform no producer draws; a refresh performs 6 capture and 48 output-face/mip draws.
Two cubes consume about 1.75 MiB, excluding driver metadata, cached programs and existing atmosphere LUTs.
All models in the example share one producer. Temporary profiling and validation settings were restored.

## Upstream files

All five modified upstream-owned files use paired `SGP-0015` markers and the manifest entry:

- `packages/engine/Source/Renderer/Framebuffer.js`: optional color attachment mip level.
- `packages/engine/Source/Scene/DynamicEnvironmentMapManager.js`: physical-source capture gating.
- `packages/engine/Source/Scene/Model/ImageBasedLightingPipelineStage.js`: source priority and borrowed uniforms.
- `packages/engine/Source/Shaders/Model/ImageBasedLightingStageFS.glsl`: independent world directions and physical scale.
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`: clearcoat direction and IBL factor.

## Remaining limits and handoff

This is one camera-region sky probe, with a neutral atmosphere-lit ground approximation. Nearby models,
terrain details, clouds, fog and SSR are outside R3; enormous views do not have spatially varying probes.
Solar disk specular remains native direct light. The existing physical diffuse/night convention remains.
Updates require 0.1-degree sun/frame or 100-meter altitude changes; rapid time scrubbing incurs full
refresh cost. Native manager procedural tuning applies to its native source, not this physical LUT source.
The owner explicitly accepted the visual result on 2026-09-19. Architecture self-review confirms the R3 exit gate; create its isolated checkpoint before activating the next phase. The owner now prioritizes scene reflections and asks to assess roughness-buffer availability and forward versus deferred integration.
