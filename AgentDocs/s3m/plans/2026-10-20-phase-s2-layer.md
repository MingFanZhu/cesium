# Phase Plan: S2 layer, LOD and dual World

## Metadata

- Plan type: phase
- Status: completed
- Parent plan: [S3M loading](2026-10-20-s3m-loading.md)
- Phase: S2
- Owner role: execution
- Architecture review: confirmed（当前任务自检）
- Created / Updated: 2026-10-20
- Predecessor checkpoint: `1a15263a2b`
- ADR: ADR-0174
- SGP: None planned
- Review: [S2 review](../reviews/2026-10-20-s2-review.md)

## Confirmed design

- `SceneGISS3MLayer.fromUrl` loads JSON SCP or an iServer layer config. It owns a
  bounded request/decode pipeline, one Worker, an LRU content cache and native Models.
- Planar placement requires a live explicit World and affine local-metre-to-World
  matrix. Globe defaults to Degree-position ENU. Validate actual Scene / World /
  Context before mutation. No implicit projection or global registration.
- Use native Resource / RequestScheduler. Preserve credentials and query parameters
  in derived resources. Every memory GLB receives a layer/tile/page-unique cache key.
- Range modes retain distance / projected radius / geometric error semantics.
  Child readiness includes all its native Model resources. Parent remains until then;
  render and pick replay the same selected Models without parent/child overlap.
- Leaf bounds in legacy samples are placeholders; use native Model bounds for leaf
  culling, as the official loader also recomputes pre-3.0 leaf bounds.
- Ordinary render frames own selection and cache mutation. Pick-only passes replay.
  Late completions are invalidated, native error events preserve parent coverage,
  and destruction releases models, worker and outstanding requests.
- Public bounds support native Camera framing. Native ModelFeature properties retain
  original `s3mId`, `idKind` and geometry; model.id points to the owning layer.
- Examples use local official mesh/instance fixtures. The public oblique service is
  bounded by an explicit depth cap; its external data is cached only under ignored
  Build for deterministic qualification, not redistributed without a data license.

## Steps and acceptance

Implement layer/config/selection and a globe/planar sample. Add focused Specs for
World contract, range modes, failure/lifecycle and atomic replacement. Real WebGL
tests exercise three sample categories in both Worlds, LOD/picking/framing,
cache eviction and disposal. Record actual sample costs, run full release build,
type generation/checks and scoped lint. Review, document residual format/material
limits and create the S2 checkpoint.

S2 checkpoint: `ec2d5fc702`. The owner confirmed visual acceptance on
2026-10-20; the initial qualified profile is complete.

## Results and deviations

8 focused Specs and six dual-World scenarios passed. Both development and release
runtimes render and pick the three categories; release checks additionally enable
advanced environment and verify steady requests/GPU bytes over twelve frames.
Full release build, type generation, full tsc and scoped lint passed.
See the review for exact limits and memory observations.

The official CBD repository omits a referenced depth-3 file; the example explicitly
caps depth at 2. The oblique service is downloaded into an ignored, bounded
qualification cache, avoiding redistribution of externally hosted data. No
runtime renderer fallback or additional upstream integration seam was needed.
