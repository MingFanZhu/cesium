# ADR-0189: Planar model polygon clipping

- Status: approved
- Date: 2026-10-23
- Owner: Current agent
- Plan: [Planar polygons](../../../AgentDocs/model-clipping/plans/2026-10-23-planar-polygons.md)
- SGP: SGP-0068

## Context

Cesium 1.144 Model and Cesium3DTileset use spherical collection packing, bounding-volume conversion
and shader coordinates for ClippingPolygonCollection. Planar terrain already implements exact XY
edges under ADR-0081, but models never enter that implementation.

## Decision

Retain `Model.clippingPolygons` and `Cesium3DTileset.clippingPolygons`. The owning collection selects
the planar backend from the actual SceneGISPlanarWorld at update, independently of lighting.
Positions are absolute world metres, Z is ignored, simple concave rings are supported, regions form
a union and inverse retains that union. The region remains fixed when a model or tileset moves.
Terrain clipping remains separately attached to World; one collection has one owner, as in Cesium.

An owned adapter reuses the terrain CPU packing/validation and fragment edge evaluator. It owns one
lazy float data texture per collection, shared by tile models. Dynamic positions, region count and
inverse update data/uniforms without generating per-count shader variants. Normal render publishes
the data; pick/depth/shadow consume it. No spherical distance texture compute is scheduled.
Tile intersection is conservative in planar space and never converts bounds to an ellipsoid.

The model vertex stage uses its final eye position, including node, instance and custom deformation,
and an inverse-view matrix whose translation is rebased in CPU double precision to the clipping origin.
Native color, picking, depth and shadow commands retain the same fragment discard.
Classification models keep their native pipeline limitations. No cap geometry or CPU mesh cutting is added.

Native collection ownership and replacement/destruction release the planar runtime. No registry,
prototype patch, extra scene pass, worker or public parallel clipping type is introduced.
The existing Globe backend remains the default for non-planar scenes. `quality` and
`debugShowDistanceTexture` remain spherical distance-field controls and have no effect on XY edge clipping.

## Integration and alternatives

SGP-0068 covers narrow hooks in ClippingPolygonCollection, ModelClippingPolygonsPipelineStage and
Model3DTileContent. Removing a tileset collection explicitly detaches its borrowed model reference.
Planar upload occurs in collection queueCommands before traversal: tileset prePassesUpdate precedes
Scene pass initialization and can still see the previous pick flags.
Using CustomShader alone would leave spherical collection compute and tile selection active and would
conflict with caller shaders. Duplicating the polygon parser would diverge from terrain semantics.
The existing GLSL build chain generates modules; generated outputs are not committed.

## Validation and upgrade

Use real Model and tileset pixels, inverse/disjoint/concave polygons, dynamic edits, large coordinates,
pick/depth, resource release and stable-frame upload/program checks. Re-run native Globe clipping and
terrain Specs. Build/release/types verify existing delivery paths.
At upgrades review collection update order, tile state propagation, shader stage signatures and
derived command discard preservation. Fragment cost scales with edge count; no unbounded throughput promise.
