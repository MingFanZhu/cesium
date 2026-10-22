# R28 directional environment occlusion review

## Metadata

- Type: review; status: technical review complete, owner visual gate pending.
- Updated: 2026-10-22; architecture / execution / reviewer: current task, self-review.
- Target: [R28](../plans/2026-10-22-r28-directional-occlusion.md), ADR-0184 / SGP-0014.
- Parent: [rendering quality](../plans/2026-09-18-rendering-quality-extension.md).
- Baseline: `b31f09bdff`; branch: `feature/directional-environment-occlusion`.

## Result and source review

Implemented default-off directional environment specular occlusion in shared
Globe / Planar deferred lighting. The existing GTAO depth samples also accumulate
an analytic visibility moment. Geometry-normal/depth weights guide filtering;
material normal maps remain native. Base and coat use their independent native
reflection directions, including the native anisotropy calculation, and native
perceptual roughness is converted to alpha for cone overlap. No diffuse sky LUT,
view-angle threshold, color compensation, history or geometry replay was added.

PBR diffuse uses identical scalar visibility before native layering. Already
occluded PBR indirect energy is excluded from late scalar correction. SSR records
the occluded environment and unchanged material weights, so confidence replaces
the environment without dimming a resolved hit twice. Other lighting families
retain their scalar correction. Source review includes native color/coat layering,
explicit IBL, emission, SSIL source composition and inverse classification scope.

The three upstream-owned files changed are:

- `packages/engine/Source/Shaders/Model/ImageBasedLightingStageFS.glsl`:
  base/coat environment and diffuse integration, SGP-0014.
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`:
  independent coat ray and no duplicate indirect correction, SGP-0014.
- `packages/engine/Source/Scene/PostProcessStageCollection.js`:
  new uniform and resource-lifetime JSDoc inside the existing SGP-0014 seam.

All renderer work remains owned; the main opaque depth is borrowed. Directional
estimate/filter targets are released on layout switch, disable, resize or destroy.
Derived lighting programs follow native source ShaderCache lifetime; weak caches
avoid repeated full-source-key lookups even when native groups replace commands.

## Verification

- Development GPU: 4 mathematical fixtures, 16 AO and 15 SSR tests pass with WebGL
  validation on Chrome Headless 155 / Windows. Directional fixtures verify actual
  estimator/filter GLSL, open-plane identity, one-sided direction, scalar equivalence,
  roughness/cone limits and production SSR replacement composition.
- AO/SSR integration checks protected diffuse/direct/emission, explicit IBL,
  independent clearcoat, clipping/MASK, orthographic multiple frusta, shadows,
  picking, callbacks, warm shader reuse, layout/resize/disable/destroy.
- Release GPU: the same 4 + 16 + 15 tests pass against minified shader output.
  Complete `gulp buildRelease` and `npm run tsc` pass. Development `gulp build`
  and the normal test build also pass. No generated file is committed.
- Two-world E2E passes (38.7 s): matched camera/noon/exposure/physical lighting,
  off/scalar/directional/debug screenshots, 12 continuous camera steps, SSR + SSIL
  coexistence, one estimator execution per frame, zero extra geometry, resource
  release and no page errors. User browser pages were not changed by the tests.
- Evidence: `Build/Specs/e2e/directional-occlusion/` contains screenshots and
  `comparison.json`; logs are `Build/Specs/directional-occlusion-*.log`.
  These are ignored local artifacts, not versioned documentation.

Scoped ESLint / Prettier, full AgentDocs Markdown lint, `git diff --check` and the
upstream patch audit pass (three current upstream-owned files, generated status 0).
The mandatory full AgentDocs Prettier scan reports 564 pre-existing style issues
outside this delivery; no unrelated documents are mass-formatted.

The original Globe AO sky test sampled the final display, whose default solar
white balance maps white to red 246. Disable white balance explicitly in that
sky-identity assertion; it now tests AO independently instead of weakening its
threshold or modifying runtime color handling.

## Cost and visual assessment

RTX 3060 Ti / ANGLE D3D11, Chrome Headless 155, 1280×800; 8 alternating samples per
mode, 8×8 depth taps, radius 0.7 m, intensity 0.8, Bistro noon. SSR/SSIL/AA disabled
for timing; no simultaneous build/test jobs during the final measurement. Other
user tabs remain open; numbers describe this machine/session, not a GPU guarantee.

| Median elapsed time (ms)             | Globe scalar | Globe directional | Planar scalar | Planar directional |
| ------------------------------------ | -----------: | ----------------: | ------------: | -----------------: |
| Isolated estimate + filter GPU query |        2.579 |             2.765 |         2.925 |              3.139 |
| Whole-frame GPU elapsed query        |       49.700 |            52.615 |        33.885 |             37.098 |
| CPU `viewer.render()`                |       50.300 |            52.850 |        34.150 |             36.250 |

Estimator increment is 0.19–0.21 ms. Whole-frame increment is about 2.9–3.2 ms,
**above the 0.5 ms investigation target**; it cannot be reported as estimator-only
cost. GPU elapsed intervals can include command-submission starvation, visible
here in the comparable CPU durations. Native material groups can replace commands
when their uniform maps change; the new shader weak cache fixes duplicate source
lookups, but this phase does not redesign deferred grouping or submission.

Geometry/light draw counts stay 627/627 in both modes. Direction layout owns
12,288,000 bytes versus 5,120,000 scalar bytes: +7,168,000 bytes = 6.84 MiB, excluding
driver padding and shader cache. Pass count stays two; the filter adds moment
texture taps. No new LUT construction cost.

Inspected both-world scalar/directional pictures: changes are localized around
material contacts and occluded environmental reflections; direct sun and emission
remain stable. The Bistro view is dominated by diffuse material and its gain is
subtle. This is not evidence of a general whole-scene quality improvement. Keep
this opt-in until the owner judges useful gains on the target GIS assets.

## Findings and handoff

| Finding                                                                                           | Severity / owner                  | Disposition / evidence                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 repeated source-key lookup on recreated native commands                                        | P2 / execution                    | Fixed by shader-instance weak cache; warm-source regression passes.                                                                                                   |
| F2 end-to-end increment exceeds 0.5 ms target                                                     | P2 / architecture + product owner | Measured and open as a performance limitation; default remains off. No claim that the cost target is achieved; a later optimization requires separate approval/phase. |
| F3 one-layer depth and one-cone visibility omit hidden/offscreen occluders and multiple apertures | P2 / rendering + product owner    | Accepted screen-space boundary from ADR-0184; no fallback or quality guarantee.                                                                                       |
| F4 owner visual acceptance                                                                        | Gate / product owner              | Pending; use the PBR page AO and directional toggles, with fixed camera/light/exposure.                                                                               |

Technical implementation is ready for a local checkpoint and owner evaluation.
Do not merge, enable by default, activate full directional diffuse or any later
phase on the basis of this review. R27 historical findings remain unchanged.
