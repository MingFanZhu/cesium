# 平面原生 Entity 聚类

## Metadata

- Extension slug: `planar-clustering`
- Status: `completed`
- Planning model: `standalone`
- Active standalone plan: [实现与资格](plans/2026-10-22-planar-clustering.md)
- Current phase: 实现与技术验证完成，等待负责人视觉验收
- Architecture / Execution contact: 当前维护 Agent
- Last updated: `2026-10-22`

## Scope

复用 EntityCluster 为平面 Point / Billboard / Label 提供屏幕空间聚类；不增加独立数据模型、SDK 渲染或 MVT 聚类。

## Engineering links

- Source: `packages/engine/Source/SceneGIS/DataSources/_private/`
- Tests: `packages/engine/Specs/SceneGIS/DataSources/`
- Example: `Test/平面聚类.html`
- Branch: `feature/planar-clustering`
- ADR: [ADR-0183](../../Documentation/SceneGIS/Decisions/ADR-0183-planar-clustering.md)
- SGP: `SGP-0066`
- Discussions: 无未决讨论
- Review: [技术验收](reviews/2026-10-22-clustering-review.md)

## Current handoff

实现、构建、Specs、开发/发布 Viewer E2E 和技术 review 完成。等待负责人在示例页视觉验收，再按指示合入 develop。
本轮作为独立本地提交检查点；未推送。
