# Planar Batching

## Metadata

- Extension slug: `planar-batching`
- Status: `active`
- Planning model: `extension`
- Active extension plan: [批量渲染计划](plans/2026-10-19-planar-batching.md)
- Current phase: B1 checkpoint / B2 pending
- Active phase plan: None
- Latest completed phase: [B1 原生实例合批](plans/2026-10-19-b1-native-instances.md)
- Active standalone plan: None
- Architecture / Execution contact: 当前任务
- Last updated: `2026-10-19`

## Scope and engineering links

- SDK 大量静态图形的平面公开合批路径，复用原生 Primitive。
- Source: `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarPrimitive.js`
- Specs: `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarPrimitiveSpec.js`
- Guide: `Documentation/SceneGIS/PlanarContentGuide.md`
- Branch: `feature/planar-batching`
- ADR: [ADR-0168](../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None；目标 upstream-owned files 为 0。
- Example: [平面图形合批](../../Test/平面图形合批.html)

## Current handoff

- 已核对：普通与 ground wrapper 均为单实例，Entity 线面逐对象持有 wrapper；vector tile 私有 batch 不是通用公开入口。
- 原生 PrimitivePipeline 的 scene3DOnly、多实例 DOUBLE transform/combine/high-low encoding 可以复用。
- B1 实现、验证与自审完成，形成独立提交后开始 B2；用户已确认同时覆盖贴地线与面。
- Open discussions: None。
- Latest review: [B1 review](reviews/2026-10-19-b1-native-instances.md)
- Unresolved reviews: None。
- 已知风险：同步首帧构建、整批剔除与重建；不自动合并 Entity。
