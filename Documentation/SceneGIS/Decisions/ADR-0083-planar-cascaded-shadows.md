# ADR-0083: Planar Cascaded Shadows

## Status

- Date: `2026-09-18`
- Status: `accepted; implemented, owner visual gate passed`
- Related phase: [R1](../../../AgentDocs/rendering-quality/plans/2026-09-18-r1-planar-shadows.md)
- Related SGP: `SGP-0013`, existing Widget / Viewer seams `SGP-0001/0002`
- Amends the geometry-shadow exclusions in ADR-0039 and ADR-0055.
- R10 amendment: [ADR-0088](ADR-0088-directional-shadow-refinement.md) shares the fitter with Globe
  and replaces slope-expanded bias / nearest PCF with receiver-plane correction / continuous PCF.
  The Globe-only path and original bias statements below describe R1, before this amendment.

## Decision

Reuse native Cesium ShadowMap resources, four-cascade atlas, derived draw commands,
PCF controls and ownership. Dispatch only planar coordinate and cascade fitting to
a SceneGIS-owned helper; Globe keeps its existing path. No prototype patch and no
replacement copy of the upstream shadow engine.

Planar cascades use fixed +Z for light visibility, camera near and bounded far for
splits, a light-fixed basis, sub-frustum spheres and world-space texel snapping.
An overlap band blends adjacent cascade samples. Atlas filtering stays within each
cascade. Receiver bias scales with the world texel footprint and surface slope to suppress
reproduced self-shadow stripes. The implementation supports native perspective and orthographic frusta.

Preserve `Viewer.shadows`, `Viewer.terrainShadows`, `scene.shadowMap`, and the native
`ShadowMode` enum. `SceneGISPlanarWorld.shadows` mirrors `Globe.shadows`, defaulting
to `RECEIVE_ONLY`; explicit Viewer / Widget terrainShadows options target that World.
Model and ordinary Graphics / Primitive shadow controls remain native; Model defaults to ENABLED
and ordinary Graphics / Primitive to DISABLED. Dynamic changes reuse geometry. Planar surface owners and normals
are identified explicitly rather than impersonating Globe tile mesh structures.

Clipping applies to caster and receiver passes. Additional receiver samplers count
against the existing preflight budget. Draw commands, GPU buffers and native shadow
attachments are reused and released through their existing owners. Scene.destroy explicitly releases
its ShadowMap before Context destruction, fixing the observed missing atlas cleanup. Surface opacity
composes an unshadowed background contribution; shadows affect only the surface contribution.

## Boundaries and verification

Only submitted terrain tiles cast; this decision does not add offscreen terrain
streaming. Ground classification, vector tiles and labels gain no new shadow qualification.
Shadow distance remains bounded. Native final-color receiver modulation
is retained for models and surface lighting in this phase; physically separated indirect/emissive shadow
integration is a distinct future change and must not be claimed as completed.

Validate actual shadow pixels, native API toggles, terrain clipping, large planar
coordinates, both camera projections, stable cascade grids, atlas seams, warm resource
reuse and destruction. Run affected native ShadowMap tests plus full build and types.
On upgrades recheck native camera cloning, uniform conventions, caster clipping,
derived command keys, pass ownership and Widget / Viewer option forwarding.

## Reference

[Microsoft Cascaded Shadow Maps](https://learn.microsoft.com/en-us/windows/win32/dxtecharts/cascaded-shadow-maps)
describes stable frustum coverage, texel alignment and cascade blending. The planar
implementation is original code targeting Cesium's existing resource contract.
