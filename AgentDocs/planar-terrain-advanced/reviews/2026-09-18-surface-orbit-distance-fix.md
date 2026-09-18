# 地表低俯角旋转距离修复评审

- Type: review
- Status / decision: approved（技术自审）
- Created / Updated: 2026-09-18
- Reviewer: 当前 Agent，非独立评审
- Target: `scenegis/develop@a2b58e798d` 上的 controller、Specs 与维护交接文档
- Plan: [修复计划](../plans/2026-09-18-surface-orbit-distance-fix.md)
- ADR: consume ADR-0004、ADR-0024、ADR-0026；不改变公共契约
- Upstream-owned files / SGP: None

## Finding 与处置

| ID        | Severity | Status | Finding / disposition                                                                                                                                                                                               |
| --------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORBIT-R01 | major    | fixed  | Surface held rotate 将 extent clamp 平移后的 Camera 距离用于下一帧旋转，在低俯角产生指数式后退。复用 held distance，仅在新 drag 或显式 wheel 后更新；回归 Spec 在旧实现失败、修复后通过，当前页面相同输入确认收敛。 |

修复仅改变 `SceneGISPlanarCameraController` 的私有距离采样时序。抽取的 helper 复用原有 scratch，
无新逐帧分配、terrain/depth 查询、资源或 public state。仍按 press-time pivot/window anchor 旋转，
center target 仍限制在 extent 内，surface endpoint clearance 和地下双向穿越保持。
显式 wheel 后同步 surface orbit 距离，避免下一次旋转撤销缩放；地下仍消费既有固定 snapshot。

## 验证证据

通过 `npm run test -- --production --includeName "<suite>" --browsers ChromeHeadless --failTaskOnError --suppressPassed`
分别执行以下三组，使用本轮 `gulp test` 生成的 development bundle（非 release 资格）：

| Suite                                                         | Result | Risk                                                                                                             |
| ------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `SceneGIS/Scene/SceneGISPlanarCameraController`               | 49/49  | 低俯角边界连续拖动、反向恢复、wheel continuation；已有 mode、clearance、地下 tangent crossing 与 input lifecycle |
| `SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget` | 1/1    | 真实非平坦地形 pivot、地下穿越、terrain state 无 mutation                                                        |
| `SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget`        | 4/4    | depth picking、cached commands、non-log depth、大坐标                                                            |

当前基础平面页 1061×852 viewport、默认视角、中键 (530,600) 每次向上 3 pixels、65 次：
旧实现到 pivot 距离由 12196 米增长到 1.92e13 米；新实现 `_rotateDistance` 保持 12196 米，
到达 5° pitch 后 Camera 位置不再变化。实际距离约 24168 米，差值来自保留的 center-target clamp，
不再产生逐帧反馈。浏览器 error/warn 为零，地图保持可见；完成后刷新到默认视角。

- 产品/Specs ESLint、Prettier、全 AgentDocs Markdownlint、`git diff --check` 与 upstream audit 通过。
- 全 AgentDocs Prettier 报告 296 个既有文件格式问题；本轮修改的五个文档已单独格式化并通过检查，
  不扩散整理历史记录。
- Audit：本轮 upstream-owned entries 0、generated status 0；未新增 SGP。
- 不触及渲染管线、资源生命周期、公共 API 或构建接入，因此未重复完整 release/types/package 矩阵。

## 剩余边界与交接

- 5° pitch 限制和优先约束 center target 的既有行为保留；边界处 pivot 不保证继续停留在 press pixel。
- Surface clearance 仍是 resident height 的 endpoint 检查，不扩大为 swept collision。
- 当前页已由 Agent 实际复测；2026-09-18 负责人确认并要求进入下一项相机惯性修复。
- 本修复形成独立本地 checkpoint，提交号由本文件 Git 历史定位；未 push。A1–A7 的已完成状态不变。
