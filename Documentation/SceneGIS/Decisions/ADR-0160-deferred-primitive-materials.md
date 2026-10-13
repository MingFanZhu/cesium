# ADR-0160: Native Phong materials in the deferred experiment

- Status: accepted; technical qualification and owner visual gate passed
- Date: 2026-10-13
- Parent: [ADR-0156](ADR-0156-webgl-deferred-lighting-experiment.md)
- Plan: [P4b](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-13-p4b-primitive-materials.md)
- Upstream integration: SGP-0049, SGP-0050

## Decision

Extend the private experiment to native lit PerInstanceColorAppearance,
MaterialAppearance (BASIC/TEXTURED/ALL) and EllipsoidSurfaceAppearance on ordinary
opaque Primitive commands. Entity visualizers retain their native geometry,
batching, properties and picking; the resulting appearance selects the material
path. Do not reinterpret all Entity types or arbitrary custom fragment shaders.

Mark the native appearance during Primitive shader assembly through an owned
helper. In czm_phong, capture evaluated material after optional surface weather
and before lighting. Reuse the four material targets with a distinct group:
diffuse/alpha, normal/shininess, scalar specular/group and emission/shadow.
One shared screen group invokes native czm_phong with reconstructed position and
the existing punctual-light table. Preserve its camera-facing diffuse terms,
ambient floor, emission, direct-only shadow and AO semantics; no PBR conversion.
Do not imply new SSR or SSIL reception for Phong surfaces.

Native flat and transparent content retain their existing behavior. The optional
feature-style target remains neutral for Phong. No additional attachment, public
API, light limit or geometry pass is introduced. Native ShaderCache owns material
variants; the deferred instance owns and releases its shared lighting program.

## Boundaries and verification

Globe imagery, depth clearing, terrain classification, multiple frustums, dynamic
ellipsoid impostors and arbitrary post-lighting shaders remain separately scoped.
Do not change native Globe settings to bypass qualification. Native HDR comparison,
actual Entity batching, material updates, local lights, shadows/weather, resource
lifetime and mixed-content costs precede owner visual acceptance.

SGP-0049 affects only Primitive.js shader marking and phong.glsl capture. Retire it
when native rendering exposes equivalent material capture or the experiment ends.

GPU qualification reproduced an existing DynamicGeometryUpdater mismatch: it
constructs a translucent color appearance, then switches translucent to false from
instance alpha, retaining enabled blending in the base render state. SGP-0050 starts
the off-ground appearance with an opaque base state, retaining the native
translucent default for ground classification. Native getRenderState enables blending
when the subsequently selected alpha is translucent. This preserves native alpha
behavior and makes ordinary opaque state consistent without weakening deferred
validation. Test opaque/translucent transitions through actual dynamic Entity batches.
