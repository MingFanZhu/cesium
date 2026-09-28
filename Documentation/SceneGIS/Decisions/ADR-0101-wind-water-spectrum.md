# ADR-0101: Optional spectral wind waves on local water

- Date: 2026-09-28; status: accepted
- Phase: [R22](../../../AgentDocs/rendering-quality/plans/2026-09-28-r22-wind-water.md)
- Existing integration: ADR-0087 / SGP-0017; no additional upstream seam planned

## Decision

Keep SceneGISWaterSurface as the single above-water interface. Add a reusable, caller-owned
SceneGISWindWaves configuration/simulation object as an optional constructor input.
No native Fabric, Entity, World or reflection API changes. Wind direction is the direction
of wave travel in local XY, not a meteorological bearing. Globe uses the existing ENU
placement; Planar uses the same local meter convention.

Implement an independently written JONSWAP/TMA spectral synthesis with finite-depth
dispersion and two complementary FFT domains. GPU fragment passes perform inverse FFT
through native renderer resources; no compute extension, worker or synchronous readback.
Initial random phases are seeded. Evolved displacement and normals share the same wave
field. Geometry uses polygon-clipped tiles with distance-based density and matching edges,
while short waves remain normal detail. Every LOD retains the same finest tile-boundary
vertices; geometry mips vary toward coarse interiors, and pixel-footprint filtering limits
distant vertex shimmer. Each tile keeps at most two LODs; inactive entries have a shared
16 MiB budget per surface. Reuse R8 physical lighting, opaque inputs,
transmission, Fresnel reflections, depth writes, picking and collection ownership.

The waves object allocates lazily, belongs to one Context, can be shared by several water
surfaces with aligned local coordinates, and must be destroyed by the caller after users
are removed and before the Context is destroyed. An unchanged simulation time/configuration reuses GPU results. Surface
destruction releases mesh/commands and never destroys borrowed simulation resources.

This is a rendering approximation driven by physical parameters, not a hydrodynamic
prediction or measured model of Xuanwu Lake. No shore diffraction/refraction, wetting/drying,
underwater camera or flow solver is added. The example labels its bathymetry as illustrative.

## References and ownership

- [NVIDIA GPU Gems: Effective Water Simulation](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models): geometric versus normal scales, wave displacement and analytic normals.
- [Tessendorf, Simulating Ocean Water](https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf): Hermitian spectral evolution and inverse FFT.
- [WMO Guide to Wave Analysis and Forecasting](https://www.jodc.go.jp/info/ioc_doc/JCOMM_Other/WMO702.pdf), sections 1.3 / 7: fetch-dependent JONSWAP and depth-limited TMA. The implementation uses a piecewise TMA transfer approximation.

All implementation, shaders, tests and docs remain SceneGIS-owned. Existing Shader build,
barrel and type generation apply; no generated artifacts are edited or committed.
