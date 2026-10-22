# Standalone Plan: 平面原生 Entity 聚类

## Metadata

- Plan type: `standalone`
- Status: `completed`
- Parent plan / Phase: None
- Owner role: `architecture / execution`
- Architecture review: `confirmed`
- Architecture reviewer: 当前维护 Agent
- Created / Updated: `2026-10-22`
- Related discussions: None
- Review: [技术验收](../reviews/2026-10-22-clustering-review.md)
- ADR: [ADR-0183](../../../Documentation/SceneGIS/Decisions/ADR-0183-planar-clustering.md)
- SGP: `SGP-0066`

## Objective and non-goals

开放原生 dataSource.clustering，覆盖 CustomDataSource、显式绑定 World 的 GeoJSON/CZML 和默认 entities。
保留原生 KDBush、clusterEvent、pools、拾取和生命周期。只聚合 Point / Billboard / Label，不引入 MVT、几何聚类或地形遮挡分析。

## Source facts and design

- EntityCluster 的椭球遮挡和 cartographic height 历史复用不适用于米制平面；源码只增加显式实例策略缝隙。
- 平面策略使用相机前向半空间，按真实投影聚类，重新聚类时不复用高度历史。
- 相机矩阵、投影、视口变更标脏；忽略 camera.changed 同步重聚类，在 collection update 读取实际变化。
- Anchor 在 position/show/屏幕包围盒属性变化时标脏，静态帧不重复建索引；动态 Property 即使 clock 冻结仍读取。
- 所有类型开关关闭以及单独关闭类型均恢复原 graphic clusterShow，不能留下旧 cluster。
- 不修改默认 Globe policy；不接管 DataSource / collection 所有权。destroy 清理策略引用，保留原生可重用生命周期。

## Affected paths and steps

1. EntityCluster.js 的 SGP-0066 hook；SceneGIS-owned spatial policy、Anchor、callback gate。
2. owned Specs 更新旧 disabled-only 契约，并增加 GPU 聚类、动态显隐、位置、投影/视口、类型开关、remove/re-add。
3. 本地 Test 页面和 Viewer E2E；开发/发布 bundle 截图、拾取、同机静态/重聚类开销。
4. Architecture / compatibility / guide 与 ADR/SGP、review 同步，形成独立本地提交检查点。

## Validation and completion criteria

运行 focused Anchor/gate/cluster Specs、原生 EntityCluster 回归、dev/release E2E、release build、类型检查、scoped lint/format、upstream audit。
默认 disabled 行为不变；World 绑定错误明确拒绝；静止帧不重聚类；冻结时间动态变化生效；重复移除销毁无监听/资源残留。
截图只作自动化与维护者检查，最终视觉质量仍由负责人验收。

## Risks, deviations and results

原生 screen-space clustering 不是遮挡分析；不提供跨 DataSource 合并或稳定 cluster ID。

开发版 10 聚类 + 11 Anchor + 10 gate + 16 原生回归通过；发布版 10 聚类 + 16 原生回归通过。
开发/发布 Viewer E2E 均通过；完整 release build、build-ts、tsc、scoped lint/format、upstream audit 通过。
同机性能与截图、生命周期证据见 review；唯一 upstream-owned file 为 EntityCluster.js / SGP-0066。
实施中发现原生 Point public screen projection 的额外 Y 翻转，增加窄 projection hook 与混合类型离中心回归。
DataSourceDisplay.ready 为 sticky 状态，E2E 明确完成原有 deferred gate 激活，再等待 atlas readiness。
负责人视觉验收待确认，代码仍在 feature/planar-clustering；未合并或推送。

AgentDocs 全量 markdownlint 通过；全量 Prettier 保留 572 个既有文件告警，与开始基线一致。
本轮扩展全部文档和修改的正式文档通过 scoped 格式检查；没有批量格式化历史资料。
