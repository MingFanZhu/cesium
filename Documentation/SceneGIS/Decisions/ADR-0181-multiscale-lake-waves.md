# ADR-0181: Multiscale lake wind waves

- Date: 2026-10-21
- Status: Accepted for implementation
- Plan: [R27](../../../AgentDocs/rendering-quality/plans/2026-10-21-r27-lake-wave-quality.md)
- Predecessors: ADR-0101, ADR-0179, ADR-0180
- Upstream integration: SGP-0017, unchanged

## Context

The existing JONSWAP/TMA lake simulation concentrates all wavelengths in one narrow
angular distribution. Two FFT periods leave nearby small ripples under-resolved.
The curved-lake example is the owner's primary acceptance case. Preserve its
geometry, water optics and physical wind/fetch/depth interpretation.

## Decision

Extend the existing `SceneGISWindWaves`, rather than introduce another water class.
`directionalSpread` defaults to 0.7 in [0, 1]. It mixes separately normalized broad
and narrow angular distributions, increasingly broad above the spectral peak. Zero
retains the old angular distribution. `rippleIntensity` defaults to 1 in [0, 4]
and scales only the added fine band's amplitude.

Use three commensurate periods L, 4L and L/8 with complementary radial energy
windows. Reuse the FFT commands and scratch targets. Every band provides both
displacement and surface normals; existing continuous geometry/pixel LOD filtering
suppresses unresolved wavelengths. The existing 4L tile-phase origin remains valid.

WindWaves remains caller-owned, lazily context-bound and driven by the Scene clock.
Parameter changes regenerate the spectrum; a paused unchanged clock reuses outputs.
RiverSurface's private two-band random spectrum remains unchanged. Rivers explicitly
borrowing public WindWaves receive the lake wind improvements as an optional overlay.

The approach follows the independent wave-band and directional-control principles
described in [Unity HDRP water simulation](https://docs.unity.cn/Packages/com.unity.render-pipelines.high-definition%4016.0/manual/WaterSystem-simulation.html).
Implementation is independently written; no Unity or upstream Cesium source is copied.

## Consequences

At resolution 128, one extra band adds 16 small FFT draw calls and one initial plus
two output textures; the two scratch targets remain shared. Record actual storage
and GPU timing in the phase review. No new Scene pass or upstream patch is needed.

This is regional above-water rendering with uniform authored depth/fetch, periodic
spectra and existing SSR constraints. It does not simulate hydraulic flow or surf.
Inherited synchronous curved-mesh construction remains a separate open limitation.
