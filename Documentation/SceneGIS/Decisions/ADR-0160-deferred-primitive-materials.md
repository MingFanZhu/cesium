# ADR-0160: Native Phong materials in the deferred experiment

- Status: accepted; technical qualification and owner visual gate passed
- Date: 2026-10-13
- Parent: [ADR-0156](ADR-0156-webgl-deferred-lighting-experiment.md)
- Plan: [P4b](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-13-p4b-primitive-materials.md)
- Upstream integration: SGP-0049, SGP-0050, SGP-0055, SGP-0056, SGP-0057, SGP-0058, SGP-0059

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

P4d extends the same material protocol to the independent ray-cast
`EllipsoidPrimitive`. SGP-0049 marks EllipsoidFS explicitly and captures
`czm_private_phong` as well as `czm_phong`. Its sun-only mode uses a separate
screen-lighting group with the original lighting function. Material depth reads
the shader-written intersection depth, including non-logarithmic multi-frustum
rendering; bounding-box fragment depth is not the visible surface. No extra
attachment or geometry submission is introduced. Opaque material and native
transparent composition continue to follow Material.isTranslucent().

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

P4g's complete command-producer audit reproduced another pass/state mismatch:
PointPrimitiveCollection with BlendOption.TRANSLUCENT assigns its alpha-blended,
non-depth-writing command to OPAQUE. SGP-0055 selects the pass from the existing
opaque-command flag. Translucent-only and mixed collections therefore use native
forward OIT or sorted transparency; their opaque portions retain deferred capture.
No attachment, extra submission or public option is added. Verify actual blending,
front/back opaque occlusion, picking and collection destruction, rather than only
checking the number of commands produced by update.

P4g also covers the independent PointCloud used by TimeDynamicPointCloud.
SGP-0056 exposes its styled source color and decoded eye-space normal before
vertex lighting. Opaque points with normalShading capture these fields; one
screen group evaluates the native Lambert response, 0.4 ambient floor and gamma
conversion in the original order. Clipping-edge colors remain unlit, and shadow
visibility is retained. Normal-free or normalShading=false points remain unlit;
translucent points keep native forward lighting. ShaderCache owns capture
variants and the deferred instance releases its point lighting group when unused.
No attachment or geometry submission is added for this material separation.
The owner approved the separate [EDL point-depth budget](../../../AgentDocs/webgl-deferred-renderer/discussions/2026-10-15-point-edl-depth-budget.md).
SGP-0057 registers each visible opaque point with its native EDL processor and
returns before native lit offscreen rendering. A private full-view depth pass
preserves styled point size, clipping, discard and TAA, deduplicating commands
across frustums. Each active processor owns R32F linear depth and a depth-stencil
attachment, eight bytes per pixel. Disabled, hidden or destroyed processors
release these targets. Both native processor owners explicitly destroy EDL.
The four-neighbor response runs in the corresponding deferred lighting group;
no EDL screen composite is added. Native transparent points remain forward.
Point color correction and shared lighting data receive the same EDL factor.

SGP-0058 keys the native style-function cache by function signature and variable
substitution map. Model pnts and independent PointCloud can share one style while
requiring different GLSL function definitions. This prevents incompatible cached
color, show or point-size functions without changing the public styling API.
Real GPU coverage, native style regression and the owner-approved point-cloud
page qualify this increment; P4g's other producers remain separately reviewed.

## P4g extended-material sampler capacity

Feature styling, all three glTF material extensions, physical environment,
cloud shadows and local lights consume sixteen fragment samplers before debug
tint. Store the existing extension attachments as separate RGBA16F layers of an
owned WebGL2 2D-array texture. Material MRT writes keep the same attachment
locations; screen lighting and inverse-classification copies use one array
sampler instead of up to four samplers. Preserve format, per-layer precision,
allocated bytes, draw counts and the existing WebGL2 device requirement.

`_SceneGISMaterialArray` owns allocation, resize and destruction. Its layer
views are borrowed attachments and never delete their parent storage.
SGP-0059 adds only explicit layer attachment in Framebuffer and native sampler
binding in createUniform; no public API or additional resource budget is added.
On upstream upgrades, verify layered MRT completeness, array sampler binding,
borrowed view lifetime and ordinary 2D / cube-map attachment behavior.
