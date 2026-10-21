# M4 平面折线 Fabric 材质

- Type: phase; status: technical completed, owner visual pending; updated: 2026-10-22.
- Parent: [Planar materials](2026-10-21-planar-materials.md).
- Owner / architecture review: current task, confirmed from current source.
- ADR: [ADR-0182](../../../Documentation/SceneGIS/Decisions/ADR-0182-planar-polyline-materials.md).
- SGP: None expected; native geometry, appearance and Material are reused.

## Source facts and scope

M1–M3 are committed on develop. Ordinary lines reuse native PolylineGeometry with
ArcType.NONE, whose s coordinate is vertex-index based. Ground lines have one
depth-clipped volume draw per VA, without the area stencil cleanup requirement.
They currently copy Material.color into an instance attribute and never evaluate
Fabric. The Entity adapter rejects non-Color properties and does not own its Color
Material. The existing fill bridge and PrimitiveOwner provide property/ownership
building blocks. Viewer/DataSourceDisplay calls visualizers on clock ticks, including
unchanged simulation times; no new global scheduler is required.

Support ordinary and ground PolylineGraphics and public planar Primitive batches.
Preserve width in pixels, original IDs, visibility, distance attributes, geometry
replacement and existing World binding. No SDK renderer, thin polygon surrogate,
terrain sampling or upstream shader edit. PathGraphics and polygon outline property
APIs remain outside this phase; their existing Color lines must keep working.

## Implementation

1. Ordinary geometry remaps native st.s to cumulative XYZ length / total length.
   Preserve native t and pixel expansion; join explicitly closed endpoints using
   their previous/next attributes. No copied native tessellator.
2. Ground volumes carry per-segment cumulative XY start/span. Reconstruct st from
   the surface depth: s interpolates normalized distances to the miter end planes,
   t maps the signed lateral distance to [0, 1]. Normalize end-plane distances by
   their forward projection so the centerline uses metric distance. Closed lines
   have one documented 1-to-0 seam, and every batch instance restarts its own UV.
3. Ordinary PolylineMaterialAppearance borrows caller Material and uses an internal
   opaque base render state, letting native material alpha choose blending/pass.
   Ground Fabric uses the existing single-volume queue, premultiplied output,
   native gamma convention and a screen-angle varying for native PolylineDash.
   Line discard is allowed because line draws do not clean stencil; area rules stay.
4. Entity captures material type in signature, evaluates same-type properties on
   every update (even frozen time), reuses geometry, and owns every generated
   Material. Type replacement and candidate failure release only derived resources.
5. Add a deterministic example with ordinary, ground and closed lines, native
   Arrow/Dash and a seconds-based custom Fabric, color/alpha/effect/clock controls,
   picking and repeated add/remove. Use actual terrain for ground qualification.

## Verification

CPU geometry tests cover unequal segments, closure and stable metric UV. GPU tests
cover ST, native Arrow/Dash, transparency transitions, batch show/pick and geometry
replacement at large meter coordinates. Entity tests cover frozen dynamic callbacks,
type switches, failure/ownership and repeated removal. Browser tests use a real
Viewer and local terrain, with dev/release shader builds and screenshots. Measure
warm command/VA/program identity and bounded update/render cost. Run focused existing
line/ground/fill regressions, full release/types, scoped lint and patch audit. Record
self-review and a local phase checkpoint; owner visual acceptance remains explicit.

## Closure

Implementation follows the planned scope; no upstream source edit or SGP was needed.
Color PolylineMaterialAppearance now uses Fabric directly, while explicit per-instance
colors retain PolylineColorAppearance. Ordinary native miter interpolation is documented
as vertex-metric, rather than exact per-pixel world arc length.

[Architecture review and evidence](../reviews/2026-10-22-m4-polyline-materials.md) records
86 development Specs, 27 release Specs, both Viewer/browser builds and screenshots,
resource lifecycles, 128-line batching and warm submission costs. Full release/types
and patch audit passed. Owner visual acceptance remains pending; no next phase activated.
