# ADR-0175: Local model flattening through CustomShader

- Status: implemented and automatically qualified; visual acceptance pending
- Date: 2026-10-20
- Amended: 2026-10-22, inverse vertex selection
- Plan: [model-flatten](../../../AgentDocs/model-flatten/plans/2026-10-20-flatten.md)
- Upstream integration: SGP-0064

## Decision

`SceneGISModelFlatten` extends native `CustomShader`. Assign it explicitly to
`Cesium3DTileset.customShader`. It owns one immutable local XY polygon with direct
holes, an immutable rigid local-to-world matrix, and mutable target local Z and
enabled state. A globe ENU horizontal plane is not a constant ellipsoid-height
surface. Planar world XYZ is never projected automatically.

The qualified first profile is static triangle mesh 3D Tiles in SCENE3D. Existing
vertices move; topology, UVs, object IDs and source data stay unchanged. Crossing
triangles form slopes and LOD can change boundary appearance. Exact polygon
cutting, CPU mesh queries/export, skinning, legacy i3dm, classification and
composing independent CustomShaders are not part of this contract.

## Implementation and alternatives

Native ModelVS already runs vertexMain before final geometry. TextureUniform
supports typed arrays and SAMPLER_2D. Fixed-capacity RGBA32F edge data avoids
variable-length uniform hacks and shader generation on polygon changes. Maximum
256 edges bounds the first profile's per-vertex loop. Reuse owned planar polygon
validation; no copied Cesium geometry implementation. Local points are rounded
to Float32 before topology validation, matching the texture representation.

Custom uniform callbacks compose current command model-to-local matrices on the
CPU. This avoids ECEF float cancellation and works independently of camera or
shadow view. Affected triangles use derivative geometric normals before native
lighting; original scanned shadows remain in textures.

Raw CustomShader alone does not update bounds. SGP-0064 adds only calls into
owned code from Cesium3DTile and ModelDrawCommand. Conservative spheres include
both original and projected positions, including partially changed triangles.
Original volumes remain untouched and are restored when disabled or detached.
Distance/SSE retains native calculations using conservative bounds; selection
may become more conservative. No global registry, monkey patch, request bypass
or disabling culling.

Raster masks are deferred until complex-region performance warrants their
resolution tradeoff. Mesh splitting is a different capability.

## Inverse selection amendment

Constructor option and mutable boolean `inverse` default to false. True preserves
the polygon body and outer boundary, while its exterior, holes and hole boundaries
flatten to the same local `height`. This exactly complements the existing vertex
membership test. It operates only on consuming models, with no fragment clipping,
topology change or additional pass. A uniform toggle preserves shader and texture
identity; the bounds revision changes so native traversal sees current volumes.

In inverse mode, the owned bounds helper cannot reject spheres outside the polygon
AABB. It conservatively unions every source sphere with its height projection,
including possibly protected content. No inside-AABB containment shortcut is safe
for arbitrary concavity and holes. This can increase selected content and reduce
culling efficiency; native SSE and scheduling remain unchanged. The existing
SGP-0064 seams suffice without modifying upstream files.

Maintenance plan: [inverse flattening](../../../AgentDocs/model-flatten/plans/2026-10-22-inverse.md).

## Ownership, delivery and validation

The caller owns the shader and destroys it after detaching consumers; a shader
is restricted to one Context. No worker, extra draw pass, framebuffer or build
change. GLSL follows ADR-0030; generated modules and barrels stay untracked.
Specs and GPU E2E cover bounds, transforms, holes, picking and restoration.
Local AGI HQ imagery supplies manual acceptance; source license stays with the
existing fixture. Run full builds and type checks for the new public API.

Upgrade checkpoints: CustomShader lifecycle, UniformState model matrix,
ModelVS order, tile bounds access and ModelDrawCommand bounds sharing.
