# R34 implementation and technical review

- Type: review; 2026-10-29.
- Status: technical review approved; owner visual gate pending.
- Owner / reviewer: current architecture and implementation task, source-based self-review.
- Target: [R34 plan](../plans/2026-10-29-r34-globe-underwater.md), ADR-0199,
  WaterSurface / Underwater, volume and SSR shaders, GPU Specs and curved example.
- Upstream-owned files: none. SGP-0017 is reused without changes.

## Findings and disposition

| Finding                                                                                                            | Severity | Owner        | Disposition / evidence                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ellipsoid water rejects positive underwater depth and local XY volume assumptions do not follow regional curvature | P1       | execution    | Fixed. Reuse the mesh chart, compute geodetic immersion on CPU and clip camera-relative curved rays on GPU. Tests cover far-from-origin immersion, date line, polar chart, holes and finite caps.                                                                                                                |
| Curved SSR rejects all submerged hits, including legitimate underside reflection                                   | P1       | execution    | Fixed. Qualify reflected hits by the camera's incident medium. A GPU test observes the submerged opaque receiver contribution from a calm curved underside; existing above-water water/river/SSR suites pass.                                                                                                    |
| Naive quadratic roots can lose shallow depths at Earth scale                                                       | P2       | execution    | Fixed before delivery. Use rationalized radius differences and the product-of-roots form. GPU checks include submillimeter depth and an analytic horizontal curved-surface exit. Orthographic origins are separately clipped.                                                                                    |
| Varying levels, curved bathymetry, overlapping layers and exact ellipsoid optical transport                        | P2       | architecture | Accepted scope limits, documented in ADR-0199 and DevelopmentGuide. Constant-height ellipsoid water is supported; invalid variable levels / finite caps explicitly fail. The local sphere model is exact on spheres and an approximation on an oblate ellipsoid. No inferred bathymetry or arbitrary scene scan. |

No unresolved blocking findings. Source review confirms the same WaterFrame
capture and nearest-frustum resolve, no new native hook/framebuffer, lazy
surface-owned texture/program and borrowed wind ownership. Local behavior uses
the shared clipping helper's original planar branch. Pick does not execute the
medium resolve; paused time is reused, disabling depth makes the volume inactive,
and primitive removal releases its texture and shader.

## Verification

- Development: 74 strict GPU Specs pass across GlobeUnderwater, WaterSurface,
  WaterOptics, EllipsoidWater, RiverSurface and ScreenSpaceReflections.
- Release: all 9 new GlobeUnderwater Specs pass with WebGL validation and failure exit.
- `gulp build`, `buildRelease`, `buildTs` and `tsc` pass. Existing unrelated
  type-doclet warnings remain; generated declarations document the extended option.
- Three curved-water browser cases pass on installed Chrome: new underwater
  entry/exit, underside, pause, single resolve, runtime disable and destruction;
  existing lake and variable-height river LOD/animation/lifecycle regressions.
  Near/up/overview screenshots are inspected, with no browser errors.
- Changed JS ESLint, explicit scoped Prettier and diff checks pass. No HTML change
  is needed; controls and example geometry are assembled in the existing JS entry.
  Full AgentDocs markdownlint passes. Full AgentDocs Prettier reports 611 existing
  unrelated files; all changed/new documents pass scoped checks. No unrelated
  repository formatting or lint configuration is changed.

## Cost and resource evidence

Windows / Chrome 156 / RTX 3060 Ti, 1185 × 800, static clock, default clear-water
lake with 11 boundary segments, 369 selected water tiles. Six GPU queries around
only the medium resolve draw measured 0.240–0.243 ms (median about 0.242 ms).
All six frames submit the draw exactly once. This is composition cost, excluding
FFT, geometry, opaque capture and other effects; it is not a device guarantee.
The same six full frames take 8.2–15.0 ms CPU wall time, which cannot be attributed
solely to underwater work. Existing cold mesh construction stalls remain recorded
by the unchanged LOD/browser regressions.

The sample adds one RGBA32F 11 × 1 boundary texture: 176 bytes, plus its shader.
The 256-edge ceiling bounds this texture to 4 KiB. There is no new full-resolution
target, per-frame GPU readback, per-tile volume texture or extra FFT simulation.
Global scene captures retain their existing shared ownership and costs. The Test
example's authored bed and reference columns are example geometry, separate from
the volume's resource figures.

## Delivery and remaining gate

Public use remains `water.underwaterDepth = depthInMeters`, including constant
`geometryMode: "ellipsoid"` water. No SDK or distribution-copy work. The curved
lake exposes underwater near/up views and a disable checkbox; variable-level
river controls remain qualified to their existing above-water behavior.

Technical review approves an independent R34 checkpoint. Owner visual acceptance
is still open, as are the earlier independent R25/R27/R33 findings. Exact wave
immersion/meniscus, translucent submerged objects and overlapping water layers
are outside this delivery. No subsequent phase is activated.
