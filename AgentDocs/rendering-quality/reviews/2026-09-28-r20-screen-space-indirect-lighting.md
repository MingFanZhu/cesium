# R20 Technical Review: Screen-space Indirect Lighting

- Type: `review`; date: `2026-09-28`; status: `completed`
- Target: R20 API, main-pass material capture, integration, resources and examples
- Architecture reviewer / execution owner: Current task, source-based self-review
- Technical gate: `confirmed`; owner visual acceptance: `pending`
- Plan: [R20](../plans/2026-09-28-r20-screen-space-indirect-lighting.md)
- Decision: ADR-0099; seam: SGP-0026; no next phase active

## Findings and disposition

- **Fixed / high / GPU mask:** a dynamic right-shift interval construction produced
  zero sectors on ANGLE D3D11 despite nonzero CPU intervals. Equivalent left-shift
  prefix masks produce the intended interval. A real GPU assertion covers both
  angular sides, all 32 bits including bit 31, and repeated-sector rejection.
- **Fixed / integration:** empty native loading views have no frustum. Skip this
  observed state before layout qualification; do not add settling frames or retry.
- **Fixed / tests:** compare geometry submissions rather than the initial command
  list, which also contains temporary native loading/compute work. Camera checks
  tolerate ordinary floating-point recomputation. Water fixtures use local z = 0
  and modelMatrix placement, matching the existing API.
- **Accepted / prototype scope:** final image color is not a diffuse source. Capture
  directional/local diffuse plus emission, and multiply the receiver material only
  once. Exclude IBL, highlights, previous SSIL, unlit and missing-normal receivers.
  Non-PBR opaque geometry still blocks visibility. Use stable spatial sampling;
  independent history and dynamic probes remain out of scope.
- **Accepted / platform limits:** single-frustum qualified HDR MRT is required.
  Explicitly reject classification/unsupported post-lighting stages and clearcoat
  SSR attachment overflow; no geometry replay or automatic quality downgrade.
  Resolved MSAA auxiliary normals are approximate at coverage edges. Fixed thickness,
  low sample counts, normal-map detail and screen edges can cause leaks or noise.
  These limitations require owner visual review, not additional numerical gates.

## Implementation and ownership

Original visibility-bitmask implementation follows the cited Therrien et al. v2
paper. Two RGBA16F attachments hold diffuse source/response and octahedral normals.
Estimate at half resolution by default and reconstruct bilaterally to full size.
Add the correction in linear HDR before SSR/water/transparency and atmosphere;
preserve native alpha and direct/specular terms. GTAO does not multiply the bounce
again. No new geometry prepass, hidden convergence loop or effect-owned history.

The complete changed upstream-owned set is **SGP-0026**:

- `packages/engine/Source/Scene/Scene.js`: scheduling, receiver and destruction.
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`: source and coat response.
- `packages/engine/Source/Shaders/Model/ModelColorStageFS.glsl`: linear model styling.
- `packages/engine/Source/Shaders/Model/CPUStylingStageFS.glsl`: linear feature styling.

All algorithms, resources, Specs and examples remain in owned paths. Generated
GLSL modules, barrels, bundles and declarations are regenerated, not committed.

## Validation

- Thirteen new real-GPU cases pass, with WebGL validation: both worlds at large
  coordinates, perspective/orthographic, direct/local/emissive sources, metallic
  and unlit exclusion, opaque blockers, final framebuffer color/alpha, no feedback,
  AO/SSR sharing, MSAA, range, styling, resize/disable/destroy, layout rejection and
  standalone water borrowing. The twelve original cases and added water case also
  pass against release; the water fixture contract was corrected before its pass.
- Existing AO 14, SSR 13 and water 12 Specs pass: 39 bounded regressions.
- Two Chromium E2E cases pass: both worlds, GUI toggles, camera preservation,
  AO/SSR sharing, four MSAA samples, resize, wheel navigation and destruction.
- Full release build, declaration generation and TypeScript check pass; existing
  unrelated JSDoc warnings remain. Scoped ESLint and formatting are checked.
- Patch audit passes: four delivery upstream files, SGP-0026, no generated dirt.
  Global AgentDocs Prettier reports 318 existing unformatted files; changed phase,
  review, index and roadmap are formatted. Global AgentDocs markdownlint passes.
  No historical cleanup.
- Separate browser copies inspect the colored-corner fixture and Bistro at fixed
  cameras. The original owner's browser camera/settings are untouched. With lower
  direct fixture lighting, red and green diffuse transfer is visible on gray
  surfaces; the metal block remains dark. Final visual acceptance belongs to owner.

## Bounded performance and memory

Windows Chromium 153, RTX 3060 Ti, ANGLE D3D11, 1185 x 667. Bistro fixed street view,
physical atmosphere, shadows, AO, SSR and TAA. Alternate off/on/off/on GPU query
blocks, collect 45 valid frame times per block after measurement warm-up (90 per
state). No application convergence frames are introduced.

| SSIL | GPU frame median | Main geometry submissions | Command-list entries | MRT outputs |
| ---- | ---------------: | ------------------------: | -------------------: | ----------: |
| Off  |       15.9534 ms |                      1409 |                 1591 |           5 |
| On   |       17.0583 ms |                      1409 |                 1591 |           7 |

Increment is approximately 1.1 ms, about 7% in this measurement. AO prepass and
SSR capture both remain zero. This is a platform-specific GPU cost, not a promise
of browser FPS or a universal GIS budget. Bistro's visual change is modest because
its visible nearby diffuse/emissive sources contribute limited bounced energy.

Additional persistent targets with existing AO/SSR are 26 bytes/pixel at one
sample (two full material targets, quarter-area estimate, full correction), or
90 at four samples. At this viewport that is approximately 19.6 / 67.8 MiB.
Standalone SSIL also owns opaque color/depth and linear depth; active water needs
the existing radiance mip chain. Disabled retains allocations; destruction releases.

## Handoff

Use the independent `Test/Rendering/屏幕空间间接光.html` in either world, then enable
the optional Bistro experimental switch at a fixed camera. Inspect colored bounce,
occluder leakage, thin features and motion. Full GI, offscreen reconstruction,
automatic probes and a deferred renderer remain unimplemented. No next phase is
authorized; any follow-up quality work starts from owner observations.
