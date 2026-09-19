# Review: R8 Local Water

- Type: `review`; status: `completed`; owner accepted and moved on to the public-data comparison scene
- Date: `2026-09-19`; owner / reviewer: Current task, architecture and execution self-review
- Target: [R8](../plans/2026-09-19-r8-local-water.md)
- ADR: `ADR-0087`; SGP: `SGP-0017`; open discussions: None

## Findings and dispositions

| ID    | Severity | Finding                                                                                                          | Disposition                                                                                                                                                                   |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R8-F1 | P1       | Constant-alpha blending cannot express RGB absorption and would leave bottom depth for later medium composition. | Water composes opaque HDR transmission/reflection after opaque draws, writes full coverage and water depth, before native translucency. GPU bottom/occlusion/pick tests pass. |
| R8-F2 | P1       | Native pick derivation requires a declared pick-color uniform.                                                   | Added the declaration; actual water and occluder picking pass in Globe and Planar, including multiple frusta.                                                                 |
| R8-F3 | P1       | Eye depth alone does not prove a refracted sample lies below the water plane.                                    | Reconstruct the candidate point and reject above-plane samples. A strict GPU test verifies that red foreground pixels never leak into the water.                              |
| R8-F4 | P2       | Periodic foam creates obvious shoreline stripes.                                                                 | Replaced the periodic intensity with filtered irregular noise; inspected contact transitions at banks and submerged objects.                                                  |
| R8-F5 | P2       | Constant scattering/foam color would remain bright when the physical light changes.                              | Reuse existing physical beam/sky/cloud libraries for water-owned lighting, without relighting the captured bottom. Both-world GPU source-scaling and transmission tests pass. |
| R8-F6 | P2       | A water ray must clip at the camera near plane, not the current native frustum near plane.                       | Shared ray library receives the full-camera near distance explicitly; native SSR regressions and water orthographic/multiple-frustum tests pass.                              |

## Verification

Owner follow-up R8-F7 (P2, fixed): the initial foam remained a continuous gray band and broadly
whitened shallow object tops. The owned shader now combines sparse depth-dependent clusters,
varied small bubble openings, fine grain and two flow velocities for gradual breakup. Individual
frequency bands are filtered by pixel footprint; unresolved bubbles preserve mean coverage while
larger patches remain visible. Perpendicular bottom distance fixes the orthographic depth range.
No API, texture, capture, pass or upstream change was added for this refinement.

- 30 distinct focused strict GPU Specs passed across bounded runs: 12 final water, 6 SSR,
  10 AO and 2 physical model lighting tests. No full-engine rerun was required.
- The foam follow-up reran the 12 water Specs. New Globe/Planar GPU cases cover shallow coverage
  and openings, deep-water exclusion, changing/frozen simulation time, exact zero-width/strength
  disable and unchanged shader/target ownership. Missing-bottom scattering stays foam-free.
  The first Globe test accidentally let native setView widen the orthographic frustum to camera
  height; applying the intended width after setView fixes the fixture without a runtime workaround.
- Water covers actual transmission/absorption, colored reflected geometry, holes, foreground
  rejection, real picking, large Planar and Globe ENU placement, orthographic/multiple frusta,
  default log depth, simulation time, resize, remove/destroy, unsupported HDR/configuration,
  physical lighting transitions and borrowing/releasing SSR resources.
- Native SSR capture remains unchanged in meaning after extracting the owned ray library.
  Water is explicitly excluded from SSR/AO opaque sources, preventing self-feedback and false
  bottom depth. Visible-frustum gating avoids captures for fully culled water.
- Development/release builds, generated declarations and root/engine TypeScript checks pass.
  The generated class exposes typed constructor options, mutable properties and readonly ready;
  private frame helpers remain absent from public declarations. Existing unrelated JSDoc warnings remain.
- Scoped ESLint/Prettier, upstream diff review and patch audit pass. All-AgentDocs markdownlint
  passes; all-AgentDocs Prettier retains 316 pre-existing warnings in untouched files.
- The deterministic example was inspected in Globe and Planar with physical sky, real bank depth,
  opaque submerged objects, reflection enabled/disabled, paused animation and middle-button orbit.
  The follow-up reload preserves the owner's current camera and foam intensity 0.1;
  no render error is reported.

## Bounded GPU and resource evidence

Windows 10, Chrome 153 / ANGLE D3D11, NVIDIA RTX 3060 Ti, 1185 x 667. The local example uses
six native PBR boxes, four bank primitives, a Planar surface, native CSM and physical sky.
Water uses 64 reflected steps, roughness 0.12 and 0.06 m normal-wave amplitude.
EXT_disjoint_timer_query_webgl2 measured 6 warm and 24 measured frames per state; disjoint=false.
Temporary loop/clock/effect settings were restored. These are local diagnostic timings.

| State                                               | Median GPU time | P95 GPU time |
| --------------------------------------------------- | --------------- | ------------ |
| Water hidden, model SSR disabled                    | 1.764 ms        | 3.347 ms     |
| Water visible, own opaque capture                   | 2.501 ms        | 2.570 ms     |
| Water visible, model SSR enabled and capture shared | 3.300 ms        | 4.478 ms     |

Standalone water adds 0.736 ms to the measured median. Its capture replays 11 opaque commands,
copies depth once per frustum and builds HDR color mips; the water draws once per visible native
frustum. When model SSR is active there are zero additional water capture draws. That mode also
runs the native-model SSR trace/filter work, so its total cost is not a water-only increment.

Standalone targets use about 18.7 bytes/pixel: RGBA16F color including mips, depth/stencil and
R32F common eye depth. This is 14.1 MiB here or 36.9 MiB at 1920 x 1080, excluding driver metadata,
ShaderCache and geometry. First-use sharing adds no water screen targets; switching from an
already allocated standalone capture retains it for reuse. R3 sky resources remain environment-owned.
Hiding/removing all water skips capture work; targets are released with Scene before Context.

The foam refinement was compared in the same Planar default view, 1185 x 667, foam intensity 0.35,
at fixed simulation time, using the same 6 warm / 24 measured GPU-query method (disjoint=false).
Before: median 2.516 ms, P95 4.837 ms. After: median 2.618 ms, P95 3.478 ms. The observed median
increment is 0.102 ms for this scene, not a universal budget. Bubble evaluation has a fixed 3 x 3
neighborhood and skips disabled/deep regions. No new GPU targets, textures or capture draws.
Near/default/distant Planar views and the equivalent Globe view were inspected. Fine openings
resolve nearby, and distant shorelines retain broken clusters instead of a uniform noise band.

## Upstream files

Only `packages/engine/Source/Scene/Scene.js` changes, under paired `SGP-0017` markers:
frame reset, opaque snapshot scheduling, water-color deferral, per-frustum composition and destruction.
No upstream material, Model shader, pass enum, framebuffer layout or Entity API changes.

## Limits and handoff

Above-water viewing and a single non-overlapping local water layer are qualified. Geometry remains
a flat local plane; waves perturb normals only. No FFT ocean, underwater camera/medium, caustics,
transparent submerged objects, classification overlays in transmission, recursive or offscreen scene
reflections. Refraction is a bounded screen approximation; missing bottom becomes deep-water color.
Foam is an artistic depth-contact approximation. Native whole-color water shadow reception is off;
captured opaque geometry keeps its shadows and physical cloud attenuation applies to water lighting.
SSR remains limited by screen edges, hidden geometry, thickness tolerance and approximate glossy mips.

Technical self-review and owner acceptance are complete. Create the isolated R8 checkpoint before
the public-data comparison scene. Previous accepted R6 checkpoint: `f9301bf8cd`.
