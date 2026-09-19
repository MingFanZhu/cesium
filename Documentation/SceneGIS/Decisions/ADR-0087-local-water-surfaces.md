# ADR-0087: Local Water Surfaces

- Date: `2026-09-19`; status: `accepted; implemented, owner visual gate pending`
- Phase: [R8](../../../AgentDocs/rendering-quality/plans/2026-09-19-r8-local-water.md)
- SGP: `SGP-0017`; dependencies: ADR-0085 and ADR-0086

## Decision

Preserve native Fabric Water. It cannot express depth-based transmission or access current opaque
HDR inputs through its existing material contract. Add SceneGISWaterSurface as an explicit native
primitive-compatible object, with PolygonHierarchy in local XY meters and rigid modelMatrix.
This keeps Globe ENU and Planar placement consistent without changing Entity field meanings.

A narrow Scene seam captures non-water opaque color/depth and schedules water after opaque
geometry in every native frustum. When active SSR already captured the frame, borrow those inputs;
otherwise a lazy Scene-owned capture uses one HDR color/depth target and one linear-depth target.
Water draws scene-linear transmission, absorption/scattering, Fresnel sky/scene reflection and
direct specular lighting, writes depth and full coverage, then participates in normal postprocessing.
Constant-alpha OIT cannot express RGB Beer transmission and would use the wrong medium depth.

Native CoplanarPolygonGeometry triangulates holes. Renderer resources belong to the surface;
PrimitiveCollection removes/destroys it normally. Shared capture belongs to Scene and is released
before Context; no attached water means no capture work. Frame-local references never own R3/R6
textures. No source asset, registration side effect, new pass enum or global singleton is introduced.

Analytic multi-scale normals are filtered by pixel footprint. Time follows Scene simulation time,
not frame count. Wave displacement and hydrodynamics are excluded. Water is excluded from AO
and opaque reflection capture, preventing self-feedback and false bottom absorption.

## Alternatives and limits

Changing native Water would silently change all Fabric consumers and still require render seams.
A full deferred renderer or planar mirrored scene capture is unnecessary for the accepted local
screen-space scope. A glTF-only shader would restrict geometry authoring and conceal a new water
protocol inside unrelated material fields. This explicit primitive is the smallest owned API.

Qualification is above-water, one non-overlapping local layer with opaque bottom/objects. The
opaque snapshot omits translucent objects and classification overlays. Refraction is a bounded
screen-space approximation with foreground rejection, not recursive Snell ray tracing. Reflected
misses use the shared physical sky, or an explicit constant reflectionColor without that environment.
Foam is a depth-contact approximation. Native whole-color geometry shadow reception is disabled
on water; opaque reflected/transmitted sources retain their lighting and shadows.

## Integration and validation

SGP-0017 changes only Scene scheduling, draw deferral and lifecycle. Implementations and GLSL
stay in owned roots and use existing build/type/Spec generation. On upgrades recheck log/pick/HDR
derived-command order, frustum pass ordering, depth copying and Scene destruction order.
Strict GPU contract tests, SSR regression, both-world visual inspection, bounded GPU measurement,
build/release/types and patch audit are required before delivery.

Water-owned scattering, foam and GGX direct specular reuse the established physical beam/sky/cloud
source libraries in both worlds. Captured transmission is never relit. Without an active physical
environment the explicit tint/constant-reflection and native light contract applies.
