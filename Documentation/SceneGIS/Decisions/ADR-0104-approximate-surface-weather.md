# ADR-0104: Approximate forward surface weather

- Status: accepted; date: 2026-09-29
- Parent: ADR-0103; SGP-0028
- Plan: [P3](../../../AgentDocs/gpu-particles/plans/2026-09-29-p3-surface-weather.md)

## Decision

SceneGISSurfaceWeather attaches explicitly to one Scene, which owns destruction. Defaults are disabled/zero coverage. Mutable enabled, wetness, snowCoverage, patchScale and snowColor configure visual coverage independently of SceneGISWeather precipitation. Property setters request a render; there is no automatic accumulation, drying, time integration or request-render convergence loop.

Existing geometry normals, material values and world position determine approximate response. No per-asset properties or new textures are required. Stable periodic 3D noise is evaluated with a CPU-reduced camera origin; geodetic up for Globe and fixed Z for Planar determine slope coverage. Noise is footprint-filtered. No claim is made about porosity, roof shelter, drainage, physical water depth or snow thickness.

Derived color commands modify opaque lit PBR/3D Tiles before native lighting and geometric specular filtering. Wetness darkens rough nonmetal diffuse and narrows rough specular lobes; snow replaces base diffuse/specular and suppresses clearcoat/anisotropy while retaining alpha, emission and visibility. Phong receives an analogous approximation. Native Globe/owned Planar terrain retains its existing diffuse lighting and gains an approximate wet directional highlight; this is not a new terrain PBR/SSR receiver contract. Unlit models, translucent content, classification, particles and explicit water surfaces are excluded.

Apply identical material evaluation in SSR MRT/replay and explicit probe captures. No new geometry pass, buffer, texture, framebuffer, history or runtime readback. Existing AO/SSIL consume the changed material normally. ShaderCache owns derived programs and base-program destruction; the setting owns only CPU state/caches. Disabling or destroying restores original command selection.

## Integration and alternatives

SGP-0028 registers narrow Scene and GLSL seams; owned code implements response and scheduling. Keep Cesium's forward renderer. Post-lighting roughness edits cannot update already-lit direct/indirect terms; DBuffer would add unnecessary storage/passes for this global procedural effect. Full deferred rendering, weather depth capture and hydrological simulation are outside this phase.

References: [UE decals](https://dev.epicgames.com/documentation/en-us/unreal-engine/decal-materials-in-unreal-engine), [NVIDIA wetness](https://docs.omniverse.nvidia.com/kit/docs/omni.avreality.rain/latest/Overview.html), [NVIDIA snow accumulation](https://download.nvidia.com/developer/SDK/Individual_Samples/DEMOS/Direct3D9/src/SnowAccumulation/Docs/SnowAccumulation.pdf). This implementation uses slope/procedural approximation without the reference's overhead exposure map or additional authored wetness maps.

## Validation and upgrade boundary

GPU Specs must verify disabled equivalence, slope/material response, both-world coordinates, terrain/Phong, capture agreement and lifecycle. Review native material layout, lighting order, Globe normals and command selection when upgrading Cesium. Full release/type checks qualify the new export; bounded timings and draw counts qualify the added fragment cost. Visual acceptance uses both the local material fixture and online aerial example.
