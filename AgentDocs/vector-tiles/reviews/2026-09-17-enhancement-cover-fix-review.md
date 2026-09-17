# 样式增强页选取范围修复评审

- Type: review
- Status: approved（技术自审与负责人视觉 gate 均通过）
- Date: 2026-09-17
- Target: 相对 V5E checkpoint `e19c707543` 的修复工作树
- Author / owner: 当前 Agent，architecture/execution 自审，非独立评审
- Plan: [修复计划](../plans/2026-09-17-enhancement-cover-fix.md)
- ADR: [0070](../../../Documentation/SceneGIS/Decisions/ADR-0070-globe-vector-ground-rendering.md)
- Upstream-owned files / SGP: 无

## Findings

| ID        | 等级 | 结论与证据                                                                                                                                                                   | 状态  |
| --------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| COVER-R01 | P1   | 默认椭球 mesh 裙边把零高程范围变成 [-1001, 1]，导致固定第 15 级 cover 超过预算并终止 Viewer。已按已知零高程 provider 排除裙边；新增 Specs 在旧实现失败，修复后通过。         | fixed |
| COVER-R02 | P1   | 合成示例只声明第 15 级，拉远不能选择更粗瓦片。已声明 fixture 实际可重复服务的 0–15 级；两个世界拉远 100 km 后持续渲染、可见瓦片不超过 32。                                   | fixed |
| COVER-R03 | P2   | 原页面 E2E 未等待 native Globe 就绪，也未捕获 Cesium 内部处理的 console error。已使用反馈中的 1061×852 视口、原生地形就绪和 render-loop 检查，保留拾取、纹理与图文配对断言。 | fixed |

## 验证与边界

- root build、20 项 Globe Specs、2 项双世界增强页 E2E 通过；后者同时覆盖初始化和拉远。
- 本次修改的 ESLint/Prettier 与全部 AgentDocs Markdownlint 通过。全 AgentDocs Prettier 检查仍报告 237 个未改动历史文件的格式问题，本修复不扩大到历史文档格式化。
- Globe Specs 保留真实地形、provider 切换、透明地表、WebGL/pick 和资源销毁回归。
- 用户当前球面页已刷新并自查画面：8 块可见/绘制、0 失败，高度 [-1, 1]，地形与矢量就绪且渲染循环存活。
- 修改路径与官方基线交集为空，没有 upstream-owned file 或 SGP；Shader、Worker、公共 API 不变，不重复发布矩阵。
- 不增大预算、不限制相机、不吞异常；真实服务必须声明实际层级范围。仅有高 minzoom 的真实服务仍受最低可见覆盖预算契约约束。
- 修复交付时仅确认页面可用性；2026-09-18 负责人明确验收通过，四项增强及本修复的人工 gate 已关闭，见[四项收口](2026-09-17-v5e-icon-fit-review.md)。
