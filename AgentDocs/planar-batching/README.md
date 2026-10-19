# Planar Batching

## Metadata

- Extension slug: `planar-batching`
- Status: `completed`
- Planning model: `extension`
- Active extension plan: None；[已完成批量渲染计划](plans/2026-10-19-planar-batching.md)
- Current phase: None
- Active phase plan: None
- Latest completed phase: [B6 安全范围放宽](plans/2026-10-19-b6-safe-footprint-batching.md)
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
- B1 已提交 `7165674fd6`、B2 已提交 `caa02fbfd2`、B3 已提交 `bcfde86bf9`；line 每 VA 一条命令。
- B4 对照 GroundPrimitive 补齐 extent 片元归属与空间合批，1024 个不相交异色面 render/pick 各两条命令。
- B4 checkpoint `c38d1e86a0`；B5 在 native combine 前按重叠前驱分层，非连续的互不相交面实现真正索引合批。
- 512 个双层栈从 513 对命令降为 2 对，render/pick 均 4 条；透明混色、覆盖顺序、独立 ID/属性与重建通过。
- B5 checkpoint `2c1aa2a22b`；B6 进一步把 bbox 交叠区域在双方填充轮廓中都为空的凹面合组，1024 个对象 render/pick 各 2 条。
- B6 修正包含剪枝，静态缓存最后冲突前驱；Ground 39/39、DataSources 102/102，5° 低视角与构建/交付验证通过。
- Open discussions: None。
- Latest evaluation: [精确轮廓合批](discussions/2026-10-19-exact-footprint-batching-evaluation.md)；B6 已实施不改 Shader 的安全范围放宽。
- Latest review: [B6 review](reviews/2026-10-19-b6-safe-footprint-batching.md)
- Unresolved reviews: None。
- 已知风险：同步首帧构建、整批剔除与重建；不自动合并 Entity。完全重叠的透明/异色面仍保留逐实例命令。
- 线和面均要求 depth texture，draw 数按空间分组/VA/frustum；现有实例 API 无需更换。
