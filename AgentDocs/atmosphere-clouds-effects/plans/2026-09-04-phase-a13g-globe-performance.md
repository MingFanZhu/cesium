# Phase Plan: A13-G Globe Performance

## Metadata

- Plan type: `phase`
- Status: `active; diagnosis only; implementation not authorized`
- Created / updated: `2026-09-04`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Branch: `feature/atmosphere-clouds-effects`
- Frozen product predecessor: A12-G `fd868387d4c38d6faf67a9395434cc9fccc6384c`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Discussion: [performance source discovery](../discussions/2026-09-04-a13g-globe-performance-source-discovery.md)
- Review: [A13-G review](../reviews/2026-09-04-a13g-globe-performance.md)
- Governing decisions: ADR-0040, ADR-0046, ADR-0047, ADR-0048, ADR-0049, ADR-0053
- Upstream / generated / new SGP delta: `0; SGP-0008/0009 consume only`

## Goal and entry gate

The owner accepted A12's current grain strength and requested performance
investigation. Keep that image-quality baseline, including cloud structure,
internal lighting, terrain depth, fixed-world cloud shadows, low-angle light,
night/Moon behavior and the accepted temporal resolve. A12 is independently
committed before this phase starts. P1 remains deferred.

The first assignment is diagnostic, not permission to trade quality for speed.
Do not change resolution, primary/secondary samples, noise, material, lighting,
history weights, temporal cadence or public defaults to manufacture a gain.

## Confirmed starting facts

The linked discussion records current-source locations and the bounded live
baseline. Globe medium/high render clouds at full input resolution; their
progressive march cap is 500, not the historical 64-step uniform grid. The
active high path also performs local light/ground sampling and atlas queries.
Cloud resolve is full resolution. Beer producer cascades and its temporal
resolve are distinct from the native geometry ShadowMap. Bloom performs six
half-resolution blur executions in addition to threshold and composite.

The current page is high/mixed with OSM Buildings. A short stationary window
observed about 20.65 rendered frames/s. A separate short CPU profile does not
show continuous main-thread saturation. These observations do not establish
per-pass GPU time or identify a unique bottleneck.

## First assignment: source-backed cost diagnosis

1. Trace actual controller publication, background/Beer, Cloud MRT/resolve,
   aerial/fog and Bloom call paths from current source. Separate CPU work,
   GPU command executions, pixel dimensions, texture dependencies and
   persistent allocations. Count executed work, not merely command objects.
   Include native geometry shadows as a separate consumer, not a Beer alias.
2. Inspect the dominant cloud/Beer shader paths: primary traversal,
   conservative empty-space tests, density/noise evaluation, local light and
   ground rays, shadow queries and view-ray shadow length. Identify repeated
   calculation or unnecessary work with exact dependency reasoning. Existing
   early termination and frame/time caches must be acknowledged, not proposed
   as if absent. Caps are upper bounds, not measured iterations.
3. Consult the existing pinned three-geospatial source where it informs those
   paths. Confirm the reference revision and actual implementation; explain
   sampling/resolution/temporal differences instead of attributing any speed
   to an unmeasured reference FPS. No copying or asset replacement is assigned.
4. Return at most three ranked candidates. Each needs source evidence,
   measured versus inferred benefit, semantic dependencies, invalidation and
   resource implications, smallest affected paths, and a minimal correctness
   plus cost witness. Rank truly equivalent work removal before quality
   tradeoffs. Any atlas reuse must account for world coverage, light,
   cloud motion/material, noise phase and temporal-history evolution.
5. Propose the smallest next measurement that would distinguish the leading
   hypothesis. No GPU-time assertion may come from JavaScript submission
   timing, FPS, `gl.finish`, readback latency or configured step count. Do not
   add profiling infrastructure merely because per-pass timing is unavailable.

Stop and return `review_ready` after the diagnostic report. Architecture must
approve a concrete optimization and amend this plan before product work.

## Scope and ownership

Read-only inspection may cover current SceneGIS environment source/Specs,
related Cesium callers and renderer abstractions, build/test entry points,
existing Test assembly and the local pinned reference. Use graph discovery
first; its stale snippets must be checked against current source.

Only these records may be edited by this assignment:

- This phase plan and its linked discussion/review.
- Extension README/current handoff and extension plan status writeback.

Product JS/GLSL, Specs, Test executable/UI, assets/importers, dependencies,
build/package configuration, upstream files, SGP manifests and generated
outputs are frozen. No runtime monkey patch, raw `Context._gl`, PBO, new
timer/readback resource, persistent profiler or new benchmark framework.
No commit, push, next phase or Planar work.

Architecture owns the current accessible browser observation. Execution need
not reopen or repeatedly discover a missing tab, change owner settings or run
another browser matrix for this source-analysis assignment. The baseline
below is supplied as diagnostic evidence, not a replacement for future
optimization comparison.

## Validation and subsequent gate

For this records-only diagnosis, run explicit scoped Prettier, Markdownlint
and `git diff --check`. Do not run GPU/controller/package/build/type suites;
no executable behavior changes. Review checks source accuracy, risk and
whether the proposed measurement can actually discriminate the hypothesis.

The eventual implementation assignment must separately specify allowed
product paths, relevant ADR/SGP changes if necessary, one bounded before/after
performance comparison under matching workload conditions, focused behavior
and resource/lifecycle tests, and owner visual regression judgment. Matching
performance workload is not a renewed same-view cloud-noise acceptance gate.
No absolute cross-device FPS target or expected speedup is promised.

## Exit conditions

Diagnosis alone does not complete A13-G optimization. The phase can close
after a reviewed evidence-backed bounded change, adequate correctness/cost
evidence and required owner acceptance, or after the owner explicitly accepts
a diagnostic-only conclusion. At present, no product optimization is selected
and no performance improvement is claimed.
