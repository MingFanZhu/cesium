# Static mesh voxelization

## Metadata

- Extension slug: `mesh-voxelization`
- Status: `completed`
- Planning model: `extension`
- Active extension plan: [Roadmap](plans/2026-10-28-extension.md)
- Current phase: V3 nested Scene membership, completed
- Active phase plan: None; [completed V3](plans/2026-10-29-v3-scene-membership.md)
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
- Branch: `scenegis/develop`
- ADR: [ADR-0198](../../Documentation/SceneGIS/Decisions/ADR-0198-static-mesh-voxelization.md)
- SGP: `SGP-0072` (V2 native loading and static geometry seams).

## Current handoff

- V3 [review](reviews/2026-10-29-v3-scene-membership.md) approves nested native
  source membership, same-Scene validation and lifecycle tests. All 19 adapter
  Specs plus build/types pass; SGP-0072 unchanged. No next voxel phase is active.

- Integrated V1 `4f17f2cc05` and V2 `52350f32a7` into `scenegis/develop` on 2026-10-29. During integration, the voxel ADR/patch were renumbered to ADR-0198 / SGP-0072 because develop independently assigned ADR-0194 / SGP-0071 to water optics / screen splitting. All references and patch markers follow the new IDs; runtime behavior is unchanged.
- Integration validation: build, generated types, TypeScript and upstream audit pass; ADR/SGP IDs are unique. The combined wind/particles/voxel selection passed 56 of 57 Specs initially. The remaining native Draco case passed after refreshing the ignored WASM to match develop's installed Draco 1.5.9 dependency; the prior local binary was stale. No decoder code or package manifest changed.

- V1 core/Worker committed as `4f17f2cc05`; ten Specs and build/release/types/tsc pass.
- V2 regional loading, static geometry snapshots and SDK/sample delivery are complete. The V2 checkpoint contains its implementation, Specs, documentation and review.
- V2 actively loads tiles intersecting an explicit region, independently of the display camera. Owner confirmed this loading mode.
- Open discussions: None.
- Latest review: [V2 approved](reviews/2026-10-29-v2-tiles.md); 11 Core and 13 adapter Specs pass, plus full release and type checks.
- Risks: nonclosed geometry, coarse-grid hole sealing, source LOD accuracy, CPU snapshot/readback and memory budgets.
