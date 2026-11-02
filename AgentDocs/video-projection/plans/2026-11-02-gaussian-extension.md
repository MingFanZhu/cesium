# 自有分段高斯视频投射

- Type: extension plan
- Status: active
- Date: 2026-11-02
- Owner: current task, architecture / execution / review
- Architecture review: confirmed
- Related: ADR-0177, ADR-0188, ADR-0208; SGP-0065

## Stable scope

Extend SceneGISVideoProjection to target SceneGISGaussianSegmentedPrimitive explicitly.
Reuse its MCI4/GSP loader, Active Cut, Workers, GPU atlas and ownership. Do not add native
Cesium Gaussian support, convert data, train splats, modify SDK or copy a renderer.
An explicit nonempty gaussianTargets list selects Gaussian receivers; empty retains opaque
surface projection. Sources remain mesh occluders; the targets also occlude one another.
Each target supports at most four simultaneous projectors in post-process collection order.

Main and projector cameras jointly select one budgeted cut, including offscreen occluders.
Depth capture reuses current GPU pages with independent camera transforms and no sorting
or streaming tick. Missing coverage suppresses projection. Transparent Gaussian coverage
uses a public per-fragment alpha threshold; it is an approximate surface, not solid geometry.
Projector/video handles remain owned by the stage; targets and media remain borrowed.

## Roadmap

| Phase | Scope                                                   | Exit                                                                               | State     |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| G1    | Shared multi-view Active Cut / observation              | Union visibility, maximum SSE, freshness / budget tests; reviewed local checkpoint | completed |
| G2    | Target API, GPU projection, observer depth and lifetime | Real video / depth / occlusion / transforms / teardown Specs; reviewed checkpoint  | pending   |
| G3    | Both-world example, SDK guide and qualification         | Reproducible images, bounded costs, full build / types / regressions; checkpoint   | pending   |

## Global acceptance

Video follows the three-dimensional Gaussian receiver while the main camera moves.
Front Gaussian and mesh occluders block rear receivers; projector-only geometry loads.
View edits / transforms / LOD publication / source removal cannot reuse stale coverage.
Paused video is stable, disabled / destroyed projection restores the original appearance,
and Scene destruction releases all owned programs/targets without stopping borrowed media.
No per-frame field readback or second loader/atlas. Record threshold approximation,
existing budget / inter-primitive sorting limits and measured target / texture / draw costs.
