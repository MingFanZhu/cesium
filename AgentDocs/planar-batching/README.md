# Planar Batching

## Metadata

- Extension slug: `planar-batching`
- Status: `completed`
- Planning model: `extension`
- Active extension plan: None；[已完成批量渲染计划](plans/2026-10-19-planar-batching.md)
- Current phase: None
- Active phase plan: None
- Latest completed phase: [B3 贴地线 draw call 合批](plans/2026-10-19-b3-ground-line-draws.md)
- Active standalone plan: None
- Architecture / Execution contact: 当前任务
- Last updated: `2026-10-19`

## Scope and engineering links

- SDK 大量静态图形的平面公开合批路径，复用原生 Primitive。
- Source: `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarPrimitive.js`、`SceneGISPlanarGroundPrimitive.js`
- Specs: `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarPrimitiveSpec.js`、`SceneGISPlanarGroundBatchSpec.js`
- Guide: `Documentation/SceneGIS/PlanarContentGuide.md`
- Branch: `feature/planar-batching`
- ADR: [ADR-0168](../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None；目标 upstream-owned files 为 0。
- Example: [平面图形合批](../../Test/平面图形合批.html)

## Current handoff

- 任务开始时普通与 ground wrapper 均为单实例，Entity 线面逐对象持有 wrapper；vector tile 私有 batch 不是通用公开入口。
- 原生 PrimitivePipeline 的 scene3DOnly、多实例 DOUBLE transform/combine/high-low encoding 可以复用。
- B1 已提交 `7165674fd6`、B2 已提交 `caa02fbfd2`；B3 按原生 GroundPolylinePrimitive 方法实现 line 每 VA 一条命令。
- Open discussions: None。
- Latest review: [B3 review](reviews/2026-10-19-b3-ground-line-draws.md)
- Unresolved reviews: None。
- 已知风险：同步首帧构建、整批剔除与重建；不自动合并 Entity。Ground 透明/异色面仍保留逐实例命令。
- Line 要求 depth texture，draw 数按 VA/frustum；现有实例 API 无需更换。
