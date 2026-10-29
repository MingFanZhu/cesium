# R38 indexed underwater boundary review

- Type: review; status: technically approved; owner visual gate pending; 2026-10-29.
- Owner/reviewer: current engine task, architecture/code self-review.
- Target: [R38](../plans/2026-10-29-r38-water-boundary-bvh.md), ADR-0204,
  boundary preparation, underwater queries, public budget, Specs and example.
- Upstream-owned changes: none; SGP-0017 unchanged. SDK/distribution untouched.

## Findings and disposition

| Finding                                                                          | Severity | Owner        | Disposition / evidence                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every pixel scans every edge, requiring a restrictive 256-edge ceiling           | P1       | execution    | Fixed. One stackless BVH traversal jointly culls parity and nearest-ray candidates; up to four original edges per leaf. Replace edge count with an explicit padded byte budget; no geometry simplification or visit cutoff.             |
| Curved rays require rational chart intervals, not a straight local slab test     | P1       | execution    | Fixed. Share the existing profile halfplane inequalities; constrain positive chart denominators. Original local/curved edge tests remain. Independent analytic/brute GPU tests and existing cap/profile tests pass.                     |
| Orthographic origins and nested holes need origin parity independent of camera   | P1       | execution    | Fixed. Candidate positive-X crossings share traversal with ray candidates. CPU membership uses original double edges. Concavity, nested islands, many holes, axis/tangent/near-edge queries and independent origins are covered.        |
| FP32 bounds can otherwise prune an exact leaf near an edge                       | P2       | execution    | Fixed. Conservative bounds-only margin for FP32 chart/slab rounding; no geometric inflation. Existing leaf formulas remain. Near-edge and large rational/local comparison tests pass.                                                   |
| Deep-imported test helpers see a different uninitialized ContextLimits singleton | P2       | test fixture | Fixed. Harnesses import the private underwater alias from the same root runtime as Context, rather than mixing resource module graphs. No product fallback or native change.                                                            |
| Example surface-navigation pitch reset the Planar camera to home                 | P2       | execution    | Fixed example pose to satisfy the existing five-degree surface-navigation limit. Add the required caller-owned wind source for ellipsoid water and destroy it after surfaces. No camera/controller algorithm change or settling frames. |
| Overlapping bounds and many crossings can still cause linear work                | P2       | architecture | Accepted/documented. Byte budget limits storage, not every possible ray's execution time. Representative timing does not establish a logarithmic worst-case guarantee. Profile triangle budget remains independent.                     |

No blocking technical findings remain. Nodes contain bounds and escape/edge-offset/
leaf-count metadata; ordered edges follow in the same tiled nearest RGBA32F texture.
The original source geometry and even-odd membership are preserved, independently
of visible LOD. Underwater owns one lazy index texture and existing cached programs;
no new pass, full-resolution target, field, CPU readback or native hook. Camera,
placement, style and depth reuse the index. Surface removal destroys it once.

## Validation

- 36 focused development GPU cases pass, including eight new boundary cases and
  existing Globe/profile/screen effects. A final fifteen-case boundary/profile
  run additionally verifies RiverSurface's public custom budget forwarding.
- Final related release selection passes all 94 cases, with WebGL validation and
  failure exit: boundaries, local/Globe/profile/river optics, reflection, caustics,
  wind whitecaps, source ownership, pause and disposal.
- Original CPU concave/multi-island input exceeds 10000 edges. GPU indexed queries
  match independent parity and physical-time first-hit references for local and
  rational charts. Axis/parallel/tangent/near-edge, finite limits, shell/cap,
  orthographic and source-profile regressions pass. Byte limits include padding.
- Two browser cases pass with 5120 authored edges in Planar/ellipsoid Globe.
  Fixed-camera/time captures are byte-identical at the documented views; rebuilt
  surfaces release the prior index, and final destruction releases index and
  caller-owned waves. Above-water source and underwater pictures were inspected.
- Full build, buildRelease, buildTs and tsc pass. Generated public declarations
  expose budget/allocated bytes on both WaterSurface and RiverSurface. Generated
  files are excluded. Scoped ESLint/format, Markdown and ownership/diff checks pass;
  full AgentDocs formatting retains unrelated historical debt.

## Measured query cost

Chrome 156 / ANGLE D3D11 / RTX 3060 Ti. Three timer queries per command, medians.
384 x 256 output pixels, fixed interior origin and a fan of horizontal chart rays,
64..4096-edge circular source. The linear reference reads identical leaf edges
without BVH culling. Local and rational receiver images have zero maximum difference
for this distribution. These isolate shoreline queries, excluding medium optics,
scene rendering, FFT, texture upload and shader compilation.

| Edges | Index bytes | Planar BVH / linear ms | Rational BVH / linear ms |
| ----- | ----------- | ---------------------- | ------------------------ |
| 64    | 2112        | 0.0584 / 0.0737        | 0.0645 / 0.0849          |
| 256   | 8464        | 0.0758 / 0.2744        | 0.0829 / 0.3152          |
| 1024  | 33120       | 0.0981 / 1.0834        | 0.1074 / 1.2493          |
| 4096  | 131040      | 0.1219 / 4.2957        | 0.1352 / 4.9357          |

The 4096-edge CPU index build measured 1.4-1.7 ms, excluding source projection,
triangulation, uploads and first-use GPU compilation. The real example's 4096-point
concave outer shore plus two 512-point islands uses 213440 index bytes (208.44 KiB).
CPU source/index objects, surface geometry, profile and scene/wave resources are
additional. Storage budget defaults to 8 MiB, maximum 64 MiB, covering only the
padded GPU index. Allocated bytes remain zero until an actual underwater draw.

Reproduce Test/Rendering/岸线索引.html?world=globe or planar and choose 4096.
The retained browser test emits ignored benchmark JSON/captures under
Build/Specs/e2e/water-boundary. No final owner visual acceptance is inferred from
numerical results; earlier R33-R37 findings remain independently traceable.
The separate 1024-triangle profile ceiling, local curvature approximation and
mean-wave immersion remain. Form the independent R38 checkpoint; no next phase.
