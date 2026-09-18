# ADR-0085: Physical Sky Specular IBL

- Date: `2026-09-19`; status: `accepted; implemented and visually accepted`
- Phase: [R3](../../../AgentDocs/rendering-quality/plans/2026-09-19-r3-sky-reflections.md)
- SGP: `SGP-0015`; extends ADR-0054 / ADR-0055 default physical lighting

## Decision

The active SceneGIS physical atmosphere supplies default specular IBL to native PBR models and
3D Tiles in both worlds. Reuse ImageBasedLighting, the native BRDF LUT, material roughness,
anisotropy and clearcoat. Explicit model KTX2 or scene specular maps win. Explicit SH and native
environmentMapManager.enabled retain caller meaning. No public API is introduced.

The environment renderer owns a lazy, shared regional sky reflection producer. Two 128-square
RGBA16F cubes separate source radiance from GGX output; all eight levels are completed together.
Use native ConvolveSpecularMapFS, supplying alpha = perceptual roughness squared. Extend the
private Framebuffer color attachment API with an optional mip level for direct HDR rendering.
No texture readback, procedural manager clone or final-color reflection overlay is needed.

Capture uses existing Planar / Globe physical atmosphere functions, a neutral atmosphere-lit ground,
and the existing readable night convention. The direct solar disk is excluded to avoid counting
native direct specular lighting twice. Clouds, fog and nearby geometry are not captured in R3.
surfaceRadianceScale calibrates lighting; backgroundRadianceScale remains display-only.

The map frame follows the capture location's east/north/up axes; shaders transform world reflection
directions into that stored frame independently of model rotation, scaling and referenceMatrix.
Refresh above 0.1-degree sun/frame changes, 100-meter altitude changes, or LUT replacement.
Camera orientation alone never refreshes the map. This is a regional sky approximation, not a
spatially varying global probe field. Static frames perform no capture/convolution passes.

## Ownership and upgrade checks

Models borrow the producer through the current world lighting record. Renderer release/destroy frees
both cubes, face/mip framebuffers and shader programs. Native procedural managers skip capture while
their default physical sources are supplied, preserving standalone behavior and ownership elsewhere.
SGP-0015 covers private framebuffer mip attachment, dynamic manager gating, model IBL selection,
and independent specular direction transformation. Recheck these seams and native GGX parameterization
on upstream upgrades. Source/glsl generation and tests use the existing build entry points.
