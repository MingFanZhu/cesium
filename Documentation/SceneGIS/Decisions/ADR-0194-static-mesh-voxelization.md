# ADR-0194: Explicit static mesh voxelization

- Status: accepted
- Date: 2026-10-28
- Scope: SceneGIS-owned Core / Scene, explicit Worker entry
- Related: ADR-0193; [extension plan](../../../AgentDocs/mesh-voxelization/plans/2026-10-28-extension.md)
- Upstream patches: SGP-0071 in V2; none in V1

## Decision

`SceneGISVoxelizer` is independent preprocessing, not a wind solver or renderer. It snapshots explicit static triangle meshes into a caller-defined local metric grid. Grid placement is rigid (ENU or planar World); mesh transforms may be affine. Positions are transformed in double precision before cell tests. Output is a caller-owned x-fastest Uint8 array with 0 empty, 1 conservative surface, 2 grid-enclosed interior; cell centers are `minimum + (ijk + 0.5) * cellSize`.

Surface coverage uses triangle/box separating-axis tests (box axes, triangle normal, edge/box-axis cross products). Touching counts as occupied; degenerate triangles are rejected. This follows the geometric method of [Akenine-Möller, Fast 3D Triangle-Box Overlap Testing (2001)](https://fileadmin.cs.lth.se/cs/Personal/Tomas_Akenine-Moller/pubs/tribox.pdf); implementation is independent, not copied source.

Contact tests include a floating-point roundoff allowance scaled by the grid and mesh world translations and cell width. This compensates for cancellation when subtracting ECEF coordinates and preserves exact cell-face contacts under ENU placement. It is not physical dilation, a configurable surface thickness or hole repair. An exact-contact regression compares identity and ENU occupancy arrays.

`fillMode: "surface"` is the default. Explicit `"enclosed"` floods non-surface cells from all six domain boundaries using 6-neighbor connectivity, then marks unreachable cells. It does not prove a mesh is watertight or infer physical building interiors. A coarse grid can close openings; open/cut geometry can leak. Results at different cell sizes need independent assessment. No depth-map, bounding-box-as-solid or automatic hole-repair fallback is allowed.

## Ownership, scheduling and budgets

One `SceneGISVoxelizer` owns one lazy TaskProcessor and at most one in-flight job. Caller mesh buffers are copied before transfer; caller matrices and grid metadata are construction snapshots. Output buffers belong to the caller, independent of the worker and source. `cancel` terminates the owned Worker and rejects the job; the instance can be reused. `destroy` cancels and releases it permanently. No rendering or continuous readback is involved.

Explicit ceilings bound cells, snapshot bytes, triangles and candidate cell tests. Exceeding a budget fails instead of changing resolution or silently dropping geometry. Statistics report counts, output bytes and Worker computation time. Generic occupancy can be converted to a 0/1 mask for wind but Core does not depend on wind.

## Build and upgrade boundary

Approve exactly `packages/engine/Source/Workers/SceneGISVoxelizeWorker.js` as a new SceneGIS-owned entry. It only wraps the Core private handler with native `createTaskProcessorWorker`. Existing worker globs and TaskProcessor URLs cover development, release, IIFE and npm `Build/Workers`; no build-file changes or manually edited generated files. Verify full build and generated declarations when public APIs are added.

## 3D Tiles adapter

`SceneGIS3DTilesVoxelizer` is a one-shot primitive attached to the same Scene as an explicitly supplied tileset. It actively loads an explicit grid region at a source geometric-error ceiling, independently of camera SSE. Source `geometricError` and cell size are distinct. Preserve [OGC 3D Tiles refinement semantics](https://docs.ogc.org/cs/22-025r4/22-025r4.html): ADD retains ancestor content, REPLACE substitutes selected descendants. Containers (empty, external, implicit) are traversed; missing or failed geometry rejects the complete result, never becomes empty. A terminal tile above the requested error also fails. The result reports selected URLs/errors and timing rather than using `tilesLoaded`, which only describes a view.

SGP-0071 exposes two private integration seams: `Cesium3DTileset._requestSceneGISGeometryTile` calls its existing request pipeline; `Model3DTileContent._sceneGISVisitStaticTriangles` delegates to an owned ModelReader adapter. The public entry is the SceneGIS job, not those private hooks. No change to display selection arrays, main camera, request scheduler, native decoders or cache ownership. The bounded region walk pins required native content; processing remains in native prePassesUpdate. Snapshot updates content with a temporary command list restored in finally, then reads the decoded static positions/indices and native node/instance transforms once. No every-frame mesh readback.

Qualify static Model-backed glTF/GLB, b3dm and i3dm triangle content, including native Draco/quantized input and composite/multiple-content containers. Non-TRIANGLES modes, point clouds, skins, morph targets, animations, custom shaders and vertical exaggeration are explicit errors. Source geometry includes hidden/transparent triangles and ignores visual clipping and styling. This is a geometry snapshot, not a reconstruction of shader-deformed or visually filtered output.

The job snapshots root placement and requires static sources throughout. It owns its Worker, result promise and timeout, and borrows the tileset. Cancel/destroy releases owned work; it does not destroy source buffers or forcibly cancel requests also needed by rendering. Cache budgets, tile/visit counts, snapshot bytes/triangles and total load time are explicit bounds; exhaustion fails without changing resolution. Per-frame tile snapshot budgets cannot prevent an individual large GPU buffer read from stalling the main thread. Results survive job/source destruction and can feed wind via the independent binary-mask conversion.
