# ADR-0103: Aerial GIS weather on programmable particles

- Status: accepted; date: 2026-09-29
- Parent: ADR-0102; [P2 plan](../../../AgentDocs/gpu-particles/plans/2026-09-29-p2-aerial-weather.md)
- Upstream-owned files/SGP: none planned

## Decision

SceneGISWeather is a collection-owned primitive using two owned SceneGISGpuParticleSystem pools for near/far rain or snow. Explicit mode selects Planar fixed-Z versus Globe camera-local ENU. Public intensity/type/wind transitions reuse fixed allocations. Quality and radius change the volume and reset its pools. Wind, terminal fall speed and drift live in weather GLSL, not the generic particle engine. Weather skips pick passes and does not change the Scene environment, clock or render policy.

Extend the generic API with optional initialParticles (initial/reset fill) and renderShader defining void styleParticle(inout SceneGISParticle). The latter consumes the same uniformMap and modifies only a vertex-local state copy. It addresses view-dependent presentation during frozen simulation without extra GPU updates or exposing weather flags. Bounds remain caller-owned and must include render styling. Defaults retain P1 behavior.

Rebase persistent particle positions from their last simulation frame to current camera translation/ENU before integrating. With unchanged time, apply the same transform only when drawing. Periodic wrapping fills newly entered volume while preserving overlapping positions. Near/far distance fades hide boundary recycling; projected motion orients rain, bounded pixel footprints keep distant precipitation visible. Local tangent altitude/vertical is an approximation over bounded regional volumes, not a global cloud simulation.

## Environment and performance

Reuse existing atmosphere/height fog as caller composition in examples. Do not add fullscreen haze, geometry replay, shadow/occlusion capture, automatic quality changes or per-particle CPU queries. Low/medium/high total budgets are 16K/32K/64K, with two MRT updates and two translucent submissions while active; native OIT may derive additional draws. State is 128 bytes per allocated slot including padding. Normal depth testing handles visible opaque occlusion; it does not establish roof shelter.

Intensity is visual 0..1, not mm/hour. Rain/snow are unlit sprites tinted by caller color; surface wetness, puddles, splashes, accumulation, shelter and motion vectors are outside this phase. Images/assets are not required. Shader generation, exports and public types reuse ADR-0030 and native build entries. Validation includes exact GPU coordinates, frozen-camera behavior, both-world rendering, lifecycle, budget evidence and release/types.
