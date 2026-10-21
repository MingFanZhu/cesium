# Phase R27: Multiscale lake wind waves

## Metadata

- Type: phase; status: implemented, awaiting owner visual acceptance; date: 2026-10-21.
- Parent: [rendering quality](2026-09-18-rendering-quality-extension.md).
- Predecessor: R26 implementation `c6a5da44d2`, owner acceptance `32dc94f984`.
- Architecture, implementation and review: current task.
- Decision: [ADR-0181](../../../Documentation/SceneGIS/Decisions/ADR-0181-multiscale-lake-waves.md).
- Upstream: existing SGP-0017 hooks, unchanged.

## Scope and source facts

The owner selects the lake in the curved rivers/lakes example as the primary visual
acceptance case. Preserve WaterSurface local/ellipsoid geometry, wind/fetch/depth
semantics and physical lighting. The accepted private RiverSurface spectrum stays
unchanged. Oceans, hydraulics and shoreline simulation remain excluded.

The current JONSWAP/TMA spectrum uses a narrow cosine-to-the-eighth angular shape at
every frequency. Its two FFT periods are L and 4L. At the example's 128 samples and
128 m base period, the finest texel is 1 m. The near view exhibits thin, coherent
rows of crests and insufficient independent small-scale detail.

## Implementation

1. Add validated `directionalSpread` in [0, 1], default 0.7. Mix normalized narrow
   and broad angular distributions, with broader short waves; zero retains the old
   angular shape. Keep spectral energy, finite depth and deterministic phases.
2. Add a third period L/8 and complementary radial frequency windows. Expose
   `rippleIntensity` in [0, 4], default 1, as its amplitude multiplier. Do not count
   the same spectral energy twice. All periods divide the existing 4L tile phase.
3. Generalize FFT band allocation; retain shared scratch targets and lazy ownership.
   The private river factory continues producing exactly two bands.
4. Sample the third displacement/normal texture using existing continuous mesh and
   pixel filtering. Retain conservative displacement bounds and resource lifecycle.
5. Add controls to curved-lake and local-lake examples. Keep color and lighting
   stable for comparison. Do not alter accepted river-wave parameters.
6. Add spectrum, GPU output/filter and lifecycle coverage; document API and cost.

## Verification and gates

- CPU deterministic spectrum, angular spread, ripple isolation and finite values.
- GPU direct Fourier reference for every band; actual vertex filtering; paused
  clock reuse and texture disposal. Run existing river/water regression Specs.
- Primary curved-lake near, grazing, overview and high views with continuous camera
  movement. Exercise shared local lake in Globe and Planar.
- Measure isolated FFT GPU time and texture storage, plus representative frame cost.
- Release build, generated types, type check, scoped lint/docs and upstream audit.
- Record self-review and a separate local phase checkpoint. Owner visual acceptance
  is a separate gate. Periodic fields, SSR limitations and inherited synchronous
  mesh construction remain explicitly documented.

## Execution result

Implementation follows the plan. Six wind Specs, 34 shared regression Specs, the
curved-lake browser case and both local-lake Worlds pass. Release build and types
pass. [Review](../reviews/2026-10-21-r27-lake-wave-quality.md) records GPU/storage
cost, inherited cold-build limitations and the pending owner visual gate. No next
phase is active; preserve this work as its own local checkpoint.
