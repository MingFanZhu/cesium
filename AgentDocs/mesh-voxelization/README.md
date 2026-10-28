# Static mesh voxelization

## Metadata

- Extension slug: `mesh-voxelization`
- Status: `completed`
- Planning model: `extension`
- Active extension plan: [Roadmap](plans/2026-10-28-extension.md)
- Current phase: V2, completed
- Active phase plan: [V2](plans/2026-10-28-v2-tiles.md)
- Architecture / execution contact: current engine agent
- Last updated: `2026-10-29`

## Scope and engineering links

显式三角网格及指定区域的静态 3D Tiles → 米制规则网格。提供独立结果供 SDK、风场等消费；不修改 SDK，不从屏幕深度重建体积，不抽取任意场景对象。

- Source: `packages/engine/Source/SceneGIS/Core/SceneGISVoxelizer.js`
- Adapter (V2): `packages/engine/Source/SceneGIS/Scene/SceneGIS3DTilesVoxelizer.js`
- Specs: `packages/engine/Specs/SceneGIS/Core/SceneGISVoxelizerSpec.js`
- Adapter Specs: `packages/engine/Specs/SceneGIS/Scene/SceneGIS3DTilesVoxelizerSpec.js`
- SDK guide: [StaticVoxelization](../../Documentation/SceneGIS/StaticVoxelization.md)
- Example: `Test/Voxel/?world=globe` and `?world=planar`; no new Sandcastle entry.
- Branch: `feature/urban-wind`
- ADR: [ADR-0194](../../Documentation/SceneGIS/Decisions/ADR-0194-static-mesh-voxelization.md)
- SGP: `SGP-0071` (V2 native loading and static geometry seams).

## Current handoff

- V1 core/Worker committed as `4f17f2cc05`; ten Specs and build/release/types/tsc pass.
- V2 regional loading, static geometry snapshots and SDK/sample delivery are complete. The V2 checkpoint contains its implementation, Specs, documentation and review.
- V2 actively loads tiles intersecting an explicit region, independently of the display camera. Owner confirmed this loading mode.
- Open discussions: None.
- Latest review: [V2 approved](reviews/2026-10-29-v2-tiles.md); 11 Core and 13 adapter Specs pass, plus full release and type checks.
- Risks: nonclosed geometry, coarse-grid hole sealing, source LOD accuracy, CPU snapshot/readback and memory budgets.
