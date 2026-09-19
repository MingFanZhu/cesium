# ADR-0089: Direct Shadow Lighting

## Status

- Date: `2026-09-19`
- Status: `accepted for implementation`
- Phase: [R11](../../../AgentDocs/rendering-quality/plans/2026-09-19-r11-direct-shadow-lighting.md)
- SGP: `SGP-0018`; extends [ADR-0088](ADR-0088-directional-shadow-refinement.md)

## Decision

Geometric shadow visibility belongs to direct illumination before tone mapping. Compute the
existing native shadow visibility before calling the receiver's material main; expose the result
through a private GLSL function. Explicitly qualified model, Phong and lit terrain shaders apply
visibility to direct diffuse/specular only. Model clearcoat shares the attenuated direct source.
Indirect sky, IBL/SSR, ambient floors, AO and emission retain their separate meanings.

Use an explicit shader macro to identify these lighting receivers. Unlit glTF remains unlit.
Plain unlit terrain and custom final-color shaders keep their existing native shadow modulation;
there is no material decomposition to apply there. Preserve Planar translucent background
protection on this path. Cascade debug colors remain a final display operation.

Globe and Planar share this contract and the native API. Shadow filtering, darkness, normal
shading, range, caster resources and cache ownership are unchanged. No additional textures,
passes, temporal state or public controls are introduced. This does not implement geometric
sky visibility or bounced lighting, and cannot remove baked shadows from scan textures.

## Integration and upgrade boundary

Owned GLSL stores per-fragment visibility. Minimal paired SGP-0018 seams are required in
`ShadowMapShader.js`, `LightingStageFS.glsl`, `phong.glsl` and `GlobeFS.glsl`. Existing owned
Planar and physical Globe helpers consume the same function. The normal shader generator and
development/release builds generate delivery artifacts; no generated file is edited.

On upgrades verify shader ordering, position/normal varying discovery, early shadow returns,
clipping/discard, clearcoat lighting and AO/SSR derived commands. Validate GPU pixels for
direct-only attenuation, emission/IBL protection and both Worlds, then run native shadow
regressions and inspect the independent example plus the public scan.

Three `ShadowMapSpec.js` fixtures explicitly illuminate the tested receiver: a shadow can no
longer be required to alter pure indirect light. Preserve their assertions and restore the
original scene light after each test. These fixture changes also use SGP-0018.
