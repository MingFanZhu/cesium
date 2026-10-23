# Planar model polygon clipping review

- Type: architecture and code review
- Status: completed; technical acceptance with documented baseline exception; project owner authorized commit
- Author / owner: Current agent, architecture and execution (self-review)
- Date: 2026-10-23
- Target: native Model / Cesium3DTileset planar clipping, owned adapter and Specs
- Plan: [Planar polygons](../plans/2026-10-23-planar-polygons.md)
- ADR: ADR-0189; SGP: SGP-0068

## Findings and disposition

| Finding                                                                                       | Severity | Owner               | Disposition and evidence                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spherical packing and shader coordinates misinterpret planar world metres.                    | P1       | Execution           | Fixed: native Model pixels and picking failed before the adapter and pass with two disjoint regions and inverse mode at a 13,000,000 metre offset.                                                                          |
| Tileset prePassesUpdate can observe the previous picking pass flags and miss a region update. | P2       | Execution           | Fixed: publish the planar snapshot in queueCommands before traversal; the real tileset test renders inverse changes immediately after picks.                                                                                |
| Detaching tileset.clippingPolygons retains the destroyed collection in a borrowed tile model. | P2       | Execution           | Fixed: dirty tile content clears the reference even when the collection is undefined; removal restores picking and destroys the data texture.                                                                               |
| Existing terrain coplanar-skirt pixel assertions fail in this environment.                    | P2       | Terrain maintenance | Deferred outside this model integration: the same single spec fails identically with all three modified upstream files restored to HEAD. See the baseline exception below before changing terrain behavior or expectations. |

## Verification

- `SceneGISPlanarModelClipping`: 7 real WebGL Specs pass with WebGL validation enabled.
  Covers disjoint regions/inverse, normal-render publication, mutable positions, empty/enabled/replaced
  collections, node/model/camera movement, linear/logarithmic depth, tileset ownership and model shadows.
- Stable-frame evidence: 20 renders retain the same texture and pipeline resources, with no additional
  clipping uploads or spherical distance compute. Region and inverse edits do not rebuild the shader.
- `--includeName ClippingPolygon`: 54 native polygon/collection/pipeline Specs pass.
- `--includeName 'clipping polygons'`: 9 selected Specs pass, including native Model ownership/rendering.
- `SceneGISPlanarClipping`: 12 pass, one baseline exception. Passing cases include concave polygons,
  multiple regions, inverse, dynamic publication, depth, validation and destruction; this is the exact
  CPU packer and fragment evaluator reused by models.
- Development and release builds, type generation and type checking: results recorded in the plan.
- Scoped ESLint/Prettier, Markdown lint, `git diff --check` and upstream patch audit pass.
  Audit identifies exactly three upstream-owned paths for this delivery; generated status is zero.
- Repository-wide AgentDocs Markdown lint passes. Its required full Prettier check reports 597
  existing files outside this change; the new `model-clipping` documents pass the scoped check.
- Local example verified in the browser with both real Model and tileset loading, two regions,
  normal/inverse rendering and no console errors. Project owner subsequently authorized the commit.

## Baseline exception and remaining boundaries

`SceneGISPlanarClippingSpec` case `discards a terrain skirt coplanar with a clipping plane without fragment speckles`
reports 169 non-background pixels instead of zero and `[255, 16, 23, 255]` instead of pure red.
The same values occur using pre-change source at `e1dc28d796051bd372b74c1ac533b1549418a2a6`. No terrain assertion or implementation was
changed to hide this result. The next terrain maintenance action is to compare the current atmosphere /
color pipeline and skirt image against the earlier accepted
[terrain clipping review](../../planar-terrain-advanced/reviews/2026-09-18-terrain-clipping.md).
This exception is not evidence of a newly introduced model-clipping regression.

Active planar tiles conservatively return INTERSECTING; native frustum culling remains active, but
polygon-based tile rejection is not optimized. Fragment cost scales with the number of edges.
Large production tilesets and high-edge-count datasets require representative profiling before a
throughput claim. No cap geometry, Entity ModelGraphics extension or classification support expansion.

## Handoff

The project owner requested committing the delivered implementation and example on `scenegis/develop`.
No independent review agent was requested. The existing terrain failure and large-scene profiling
boundary remain explicit; this commit does not close those maintenance follow-ups.
