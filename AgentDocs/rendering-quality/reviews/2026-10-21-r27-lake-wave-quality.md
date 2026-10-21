# R27 lake wind-wave review

## Metadata

- Type: implementation and architecture review; date: 2026-10-21.
- Target: R27 changes after `32dc94f984`, on `feature/lake-wave-quality`.
- Reviewer / implementation owner: current task, self-review.
- Plan: [R27](../plans/2026-10-21-r27-lake-wave-quality.md).
- ADR: [ADR-0181](../../../Documentation/SceneGIS/Decisions/ADR-0181-multiscale-lake-waves.md).
- Upstream: no upstream-owned files changed; SGP-0017 reused without modification.
- Disposition: technical checks complete; owner visual acceptance pending.

## Findings and disposition

1. **Medium, resolved — narrow short-wave directions.** Replace the fixed angular
   profile with a normalized narrow/broad mixture, controlled by `directionalSpread`.
   The cross-wind energy test verifies greater directional diversity without changing
   seeded phases or the JONSWAP/TMA radial spectrum. No water-color or lighting change.
2. **Medium, resolved — missing fine ripple bandwidth.** Add a third domain at L/8,
   with complementary radial windows. `rippleIntensity` scales only that band. CPU
   tests verify isolation from the larger bands; all three GPU outputs match an
   independent direct Fourier sum. The production vertex shader fixture verifies
   third-band filtering at both interior and shared-edge vertices.
3. **Medium, resolved — shared lifecycle and accepted river behavior.** Allocate
   the spectrum's actual number of bands. The private RiverSurface spectrum still
   supplies two bands. Frozen clock reuse, destruction of every initial/output
   texture and existing river/water regressions pass. No extra Scene capture/pass.
4. **Medium, open — inherited cold mesh construction.** Curved-lake first-frame
   CPU submission at grazing/near/close views was 263 / 209 / 120 ms with 380 / 326 /
   212 newly built tiles. Warm medians were 10.3 / 11.2 / 9.0 ms. High view's first
   frame was 7.3 ms, but a subsequent warm sample reached 316 ms; warm medians do
   not establish a stutter-free contract. Synchronous construction and driver/JIT
   outliers remain in the existing R25 follow-up; this phase does not change mesh
   scheduling. Owner: architecture; track through the extension roadmap.
5. **Visual gate, open — owner acceptance.** Agent inspected curved-lake close,
   near, grazing and high captures. The closer view has broken directional crests
   and separate fine ripples; no new tile seams were observed. Final appearance is
   subject to the owner's judgment in the curved-lake example. Periodic repetition,
   uniform authored depth/fetch and screen-space reflection limitations remain.

## Verification

- WindWaves: 6 Specs pass in development and release, with WebGL validation.
- Release regressions: WaterSurface 17, EllipsoidWater 7, RiverSurface 10 pass.
- Browser: curved-lake E2E passes four explicit views and 25 continuous camera
  samples, bounded leaf/cache checks and disposal. Local Xuanwu Lake passes in
  both Globe and Planar, including wind changes, clock pause, holes and disposal.
- `build-release`, `build-ts`, `tsc` pass. Type generation retains existing native
  JSDoc warnings; no new WindWaves warnings.
- Scoped Prettier, ESLint and Markdown lint pass. Full AgentDocs Markdown lint
  passes; full AgentDocs Prettier still reports 562 unchanged baseline files.
  Do not mass-format unrelated documents. Upstream audit passes with zero current
  upstream-owned edits and zero generated-file changes. Generated outputs and
  screenshots stay untracked.

## Cost evidence

Chromium, ANGLE D3D11, RTX 3060 Ti, 1185 x 800, 128-square simulation. Paired GPU
timers drain previously submitted work, alternate two/three-band order and discard
disjoint samples. Eight samples give medians of **0.171 ms** for two bands and
**0.253 ms** for three bands; the added work is approximately **0.082 ms** on this
device. The representative close-view full frame measured **5.33 ms GPU**. These
are device/context observations, not a universal frame-time promise.

Three bands execute 48 small draws versus 32, with shared scratch targets. Texture
storage is **2,883,580 bytes (2.75 MiB)** versus 2,271,912 bytes (2.17 MiB), an increase
of 611,668 bytes (0.58 MiB). Vertex and fragment water stages each add one filtered
texture sample. No per-frame CPU mesh regeneration or texture readback is added.
