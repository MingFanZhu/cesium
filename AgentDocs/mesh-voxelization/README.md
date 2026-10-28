# Static mesh voxelization

## Metadata

- Extension slug: `mesh-voxelization`
- Status: `active`
- Planning model: `extension`
- Active extension plan: [Roadmap](plans/2026-10-28-extension.md)
- Current phase: V1, completed; checkpoint pending
- Active phase plan: [V1](plans/2026-10-28-v1-core.md)
- Architecture / execution contact: current engine agent
- Last updated: `2026-10-28`

## Scope and engineering links

显式三角网格及指定区域的静态 3D Tiles → 米制规则网格。提供独立结果供 SDK、风场等消费；不修改 SDK，不从屏幕深度重建体积，不抽取任意场景对象。

- Source: `packages/engine/Source/SceneGIS/Core/SceneGISVoxelizer.js`
- Adapter (V2): `packages/engine/Source/SceneGIS/Scene/SceneGIS3DTilesVoxelizer.js`
- Specs: `packages/engine/Specs/SceneGIS/Core/SceneGISVoxelizerSpec.js`
- Branch: `feature/urban-wind`
- ADR: [ADR-0194](../../Documentation/SceneGIS/Decisions/ADR-0194-static-mesh-voxelization.md)
- SGP: None in V1; V2 must register native integration seams before editing.

## Current handoff

- V1 core/Worker implementation and ten Specs complete; build/release/types/tsc pass. Ready for its local phase checkpoint.
- V2 actively loads tiles intersecting an explicit region, independently of the display camera. Owner confirmed this loading mode.
- Open discussions: None.
- Latest review: [V1 approved](reviews/2026-10-28-v1-core.md).
- Risks: nonclosed geometry, coarse-grid hole sealing, source LOD accuracy, CPU snapshot/readback and memory budgets.
