# ADR-0088: Directional Shadow Refinement

## Status

- Date: `2026-09-19`
- Status: `accepted for implementation`
- Related phase: [R10](../../../AgentDocs/rendering-quality/plans/2026-09-19-r10-shadow-refinement.md)
- Related SGP: `SGP-0013`; amends [ADR-0083](ADR-0083-planar-cascaded-shadows.md)

## Context and decision

The fixed public photogrammetry scene exposes Globe self-shadow bands. Native Globe cascade
fitting also changes its sampling grid with view bounds, and nearest-sampled 3x3 PCF changes in
visible steps. Increasing atlas resolution alone does not address these causes.

Share the owned stable four-cascade fitter across Globe and Planar. Preserve World-specific
light visibility, native atlas/caster ownership and existing public shadow controls. Planar uses
camera/configured-distance splits. Globe retains visible receiver range utilization: round the
far extent up to a power-of-two distance band, bounded by camera/configured maximum; use camera
near. A fully fixed maximum range failed native cutout and low-resolution small-model tests.
Banding preserves their detail without continuously rescaling for small bound changes; crossing
a band still reallocates sampling. Preserve the native out-of-view test for distant receivers.
Light-fixed spheres, texel snapping and overlap form one directional path; single-pass, point
and spot lights retain their existing paths.

Use a continuous 4x4 tent PCF for `softShadows`, with sample-wise geometric receiver-plane
depth correction. Keep comparisons inside their cascade and blend the existing overlap band.
Hard shadows retain one comparison with corresponding texel-center correction. Native darkness,
normal shading, cast/receive selection, clipping and resource lifecycle continue to apply.

The filtering uses 16 depth reads (32 only in the overlap) instead of 9. It adds no texture,
framebuffer, render pass, temporal history or public property. PCSS/contact hardening and
shadow-only attenuation of direct lighting are deferred; this phase does not claim them.

## Integration, build and validation

Implement fitting and GLSL in SceneGIS-owned files. Reuse the `ShadowMap.js` and
`ShadowMapShader.js` SGP-0013 seams; update the manifest purpose and tests. Owned GLSL continues
through Cesium's existing shader generator and dev/release delivery. Do not edit generated JS.

Verify real GPU pixels for sloped self-shadow receivers, thin occluder contacts, soft edge
continuity, cascade transitions and Globe/Planar stability. Check native shadow regressions,
warm reuse/destroy, development/release compilation, and same-device GPU timing. Record source
and performance limits in the phase review before the owner visual gate.

On upstream upgrades recheck cascade atlas coordinates, shadow compare depth encoding, shader
derivation/cache keys, normal-offset behavior and the private ShadowMap camera contract.

The small normal-shading/darkness expression in the owned GLSL follows
`Source/Shaders/Builtin/Functions/shadowVisibility.glsl` from upstream commit
`6d5d8b1f0725b6f831b336463f4b11c98023427b`. Synchronize this expression if its native semantics
change; using the private function directly does not register a Cesium builtin dependency.

R13 amendment: [ADR-0092](ADR-0092-depth-shadow-submission.md) independently culls tile-owned
commands against each cascade when camera culling was delegated to 3D Tiles traversal. Stable
volume fitting and filtering stay unchanged; no temporal shadow cache is introduced.
