# R18 Technical Review: Hierarchical Screen-space Reflections

- Review target: R18 source, public controls, shaders, Specs and examples
- Author / architecture reviewer / execution owner: Current task
- Date: `2026-09-28`; status: `completed`
- Plan: [R18](../plans/2026-09-28-r18-screen-space-reflections.md)
- Decision: ADR-0097; upstream-owned changes: none; SGP: none
- Gate: technical completion confirmed; owner visual acceptance pending

## Findings and disposition

- **Fixed / correctness:** normal reconstruction must use the incident vector actually
  evaluated by native Model lighting, including orthographic views. The shared shader
  now matches `LightingStageFS`; strict perspective/orthographic and both-world Specs pass.
- **Fixed / lifecycle:** history and trace targets have independent resolution ownership;
  resize destroys obsolete targets, disabling retains them, and explicit destroy releases
  all targets/programs. One initial test used the FramebufferManager optional-index contract
  on Framebuffer; corrected to the actual API and the focused lifecycle test passes.
- **Accepted / quality:** half-resolution tracing can undersample thin reflectors and
  normal-map detail. Full resolution is explicit, and bilateral reconstruction rejects
  incompatible receivers. No claim of complete offscreen or moving-object reflections.
- **Accepted / performance:** history adds storage; render-count and native forward/MRT
  contracts stay unchanged. There is no additional geometry submission on qualified MRT.

## Implementation and source review

Six min-depth reduction passes feed AMD-inspired cell-boundary traversal. Reduced-resolution
trace retains each lobe's distance and the representative full-resolution source pixel.
Reflection history uses virtual-image parallax, receiver plane/normal/roughness checks,
bilinear sample validation and bounded HDR neighborhood clipping. Current misses immediately
restore IBL. CPU-double relative camera transforms and actual jittered projection avoid
ECEF precision loss and TAA misregistration. History invalidates on configuration, projection,
layout, resize, interrupted render and explicit reset; no hidden convergence frames.

Full-resolution material-aware reconstruction retains native BRDF replacement, AO separation
and clearcoat. Water's original ray shader is unchanged. AMD SDK revision and MIT notice ship
under `Assets/SceneGIS/Reflections`; no compute, wave dispatch or full FidelityFX port is claimed.

## Bounded evidence

- 39 distinct strict GPU Specs pass: 13 SSR, 14 AO and 12 water. The final SSR suite also
  passes all 13 cases against the release build. New cases cover reduced/odd-size targets,
  history reset/projection change, lifecycle and moving Planar/Globe reflections with TAA.
- Two Chromium E2E checks pass: both-world standalone pages, public quality switches,
  actual wheel zoom, history clearing and unchanged navigation enablement.
- Full release build, type generation, TypeScript check and targeted ESLint pass.
  Upstream patch audit reports zero current-delivery upstream-owned changes and no generated
  changes. Existing global AgentDocs formatting debt is retained; changed documents are checked.
- Independent browser visual inspection uses the original fixed Bistro street pose and
  the colored-object reflection fixture. The owner's existing tab/camera/settings are untouched.

## Performance and memory

Windows Chromium 153, RTX 3060 Ti, ANGLE D3D11, 1185 x 667, unchanged scene settings.
GPU timing uses disjoint timer queries, drops initial warm-up samples and excludes radiance
mipmap generation on both versions. New timing includes all depth reductions, trace,
temporal filtering and reconstruction. Old timing includes trace and both spatial filters.

| Fixture                                       | Previous SSR GPU median | R18 default median | Observation                                                        |
| --------------------------------------------- | ----------------------: | -----------------: | ------------------------------------------------------------------ |
| Bistro fixed street view                      |                0.291 ms |           0.183 ms | About 37% lower SSR time; total CPU frame time remains about 18 ms |
| Colored reflectors, same-frame old/new inputs |                0.760 ms |           0.292 ms | About 62% lower SSR time; 99 samples per implementation            |

These are isolated stage measurements, not whole-frame FPS improvements. Default half-resolution
history adds about 9.33 bytes per full-resolution pixel relative to the old two-filter pipeline
(about 7.0 MiB at this size). Full-resolution mode adds another 72 bytes/pixel. Disabling temporal
filtering before first use avoids its history allocation; already allocated history is retained.

## Remaining limits and next owner action

Owner visual review is pending at `Test/Rendering/反射稳定性.html` and the Bistro controls.
Screen-space omissions, thin reflectors, changing silhouettes and moving objects remain quality
limits; material/light cuts should call `reset()`. No additional probe, GI or AO phase is active.
