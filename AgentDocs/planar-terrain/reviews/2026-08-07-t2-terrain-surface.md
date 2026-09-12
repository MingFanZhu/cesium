# Review: T2 平面地形 Mesh 与 Surface 集成

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-07`
- Updated: `2026-08-07`
- Review target: `feature/planar-terrain` complete working-tree diff relative to
  `ca55db7c8a6ec8a5c512a40cf20fa223f58635d8`
- Related plan:
  [T2 terrain surface phase plan](../plans/2026-08-07-phase-t2-terrain-surface.md)
- Related ADR:
  [ADR-0008](../../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)
- SGP: None；T2 upstream-owned files=`0`

## Scope

Review `SceneGISPlanarWorld.terrainProvider`, the private Heightmap mesh/runtime, three-dimensional
Tile/Quadtree/Surface integration, terrain/imagery single-command composition, pass discipline,
lifecycle ownership, generated public surface and AgentDocs evidence. T3 fallback/upsampling/seams/
Worker and later query/provider/presentation work are outside this review.

## Implementation summary

- Atomic provider preflight with canonical tiling identity, caller ownership, same-instance no-op,
  replacement and detach back to flat Z=0.
- Private exact Heightmap sample seam and tile-local regular-grid Float32 mesh using the approved
  coordinate-free regular-grid index helper.
- Lazy five-state terrain runtime, `RequestType.TERRAIN`, retry/cancel/generation isolation,
  normal-render-only CPU/GPU mutation and balanced tile-VA/shared-index ownership.
- Stable 3D selection OBB, command sphere and model matrix; closed XYZ distance and effective terrain
  SSE; flat/terrain command switching and exact pick+depth replay.
- Combined terrain/imagery readiness, credits, single Context and one opaque command per ideal tile.

## Validation evidence

- Focused/direct: Heightmap 10/10, mesh 3/3, runtime 6/6, Tile direct 7, Quadtree 12/12,
  Surface direct 21, World 15/15 and terrain Widget 1/1. T2 adds 15 direct unique cases.
- Explicit overlap: Tile aggregate 12/12 includes TileImagery 5; Surface aggregate 23/23 includes
  SurfaceShader 2.
- Regressions: imagery Widget 9/9; navigation/depth Widget 4/4.
- `build`, `build-release`, `build-ts`, `build-docs`, `tsc`, scoped ESLint, Prettier, Markdownlint and
  `git diff --check`: Exit 0. Existing TSD-JSDoc warnings remain unchanged.
- Real Context: four Level-1 terrain tiles share one index buffer, own four VAs, compose imagery in four
  single commands, preserve warm/depth replay references and counters, and balance destroy. A tile-interior
  `Z=30` fixture proves rendered `scene.pickPosition` matches Heightmap interpolation while the same ray's
  `world.pick` remains exactly Z=0.

## Ownership audit

- Upstream-owned files: `0`.
- T2 SGP: `0`; `.scenegis/upstream-patches.json`, SGP-0001 and SGP-0002 unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated/tracked delivery status: `0`; generated declarations/docs/build outputs were verification
  only.
- Product/test paths are under `packages/engine/Source/SceneGIS/**` and
  `packages/engine/Specs/SceneGIS/**`; remaining changes are approved AgentDocs paths.

## Findings

| ID      | Severity | Status | Finding                                                                                                                                                                                                                                                                                                                                                                 | Disposition / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T2-R001 | medium   | fixed  | `SceneGISPlanarTerrainCesiumWidgetSpec` proves that indexed terrain commands render a solid color, but it does not observe terrain depth or a non-zero rendered surface position. The current green-pixel assertion would also pass if the command wrote the old Z=0 depth. The phase plan and extension handoff therefore overstate the real-Context `depth` evidence. | In the existing real-Context case, the Level-1 northwest tile interior point `(-64, 64)` has exact SW→NE Heightmap interpolation `Z=30`. The Spec projects that 3D point to a window position, requires `scene.pickPosition` to be defined, checks its XYZ against the same tile/interpolation within pixel/depth tolerance, then reuses the identical private four-frustum window ray with `world.pick` and requires exact `Z=0`. Existing four commands, four tile VAs/one shared index, warm identity/counters and balanced destroy assertions remain. Focused Widget suite: 1/1, Exit 0; case count unchanged. |

Architecture review found no separate defect in the provider preflight, five-state runtime, three-dimensional
bounds/SSE, command switching, or GPU ownership during this pass. Independent reviewer reruns of the terrain
runtime (6/6), real-Context Widget (1/1), and `git diff --check` passed.

## Accepted risks proposed for review

- Mesh construction remains synchronous on the main thread and CPU mesh retention has no byte budget.
- T2 intentionally has temporary flat pending/failed tiles and no ancestor fallback, upsampling, skirts,
  mixed-LOD seam or crack suppression.
- Public mathematical picking remains the Z=0 reference surface; terrain query/picking is deferred.

## Conclusion

Architecture focused re-review confirms T2-R001 `fixed`; review status is `approved`. The public provider
attachment, private mesh/runtime, three-dimensional bounds/SSE, terrain/imagery single-command rendering,
real terrain depth, lifecycle evidence and zero-upstream/zero-SGP audit satisfy T2. T2 can be marked
`completed` and included in its independent local checkpoint. No push or T3 implementation is authorized
by this approval.
