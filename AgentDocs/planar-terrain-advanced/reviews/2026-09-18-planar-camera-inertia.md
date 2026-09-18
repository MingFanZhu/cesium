# 平面相机惯性评审

- Type: review
- Status / decision: approved（技术自审）
- Created / Updated: 2026-09-18
- Reviewer / implementation owner: 当前 Agent，非独立评审
- Target: `scenegis/develop@a7a6e8650a` 上的 controller、Specs、公共契约文档
- Plan: [惯性计划](../plans/2026-09-18-planar-camera-inertia.md)
- ADR: [ADR-0079](../../../Documentation/SceneGIS/Decisions/ADR-0079-planar-camera-inertia.md)
- Upstream-owned files / SGP: None

## Finding 与处置

| ID          | Severity | Status | Finding / disposition                                                                                                                                                                                                 |
| ----------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INERTIA-R01 | major    | fixed  | Camera 的 world-coordinate getter 会归一化 axes；精确比较会把其舍入误差视为外部修改并重置地下 held pivot。Axes 使用 EPSILON12 比较，position 保持精确比较；原地下双向 crossing Spec 与新增惯性 crossing Spec 均通过。 |

只在自有 controller 内参考 Globe 的系数、短手势门槛与衰减公式，不复制 Globe 状态机。
最后消费的输入拥有余速；pan 累积虚拟 pointer，rotate 保持固定 distance，wheel 复用 pointer/anchor。
真实输入保持 middle > left、wheel last 的顺序。余速复用现有约束，无新增 timer/listener/GPU resource，
每帧复用 Cartesian/movement/pose。禁用、Home、mode、flight/tracking 与移除按既有取消入口清理，恢复不重放。

## 验证证据

Controller suite 用普通 `npm run test -- --includeName "<suite>" --browsers ChromeHeadless --failTaskOnError --suppressPassed`
重建 development bundle；后两组增加 `--production` 跳过重复构建（不是 release 资格）。

| Suite                                                         | Result | Risk                                                                                                                                                                    |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SceneGIS/Scene/SceneGISPlanarCameraController`               | 59/59  | 三类输入衰减与停止、真实时间/暂停 Clock、0 与非法参数、长拖动、新 press/新 wheel 接管、取消不复活、外部 pose、地形锚点、clearance、地下穿越、低俯角稳定；含原 49 项回归 |
| `SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget` | 1/1    | 真实地形 pivot、地下穿越、terrain state 无 mutation                                                                                                                     |
| `SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget`        | 4/4    | depth/cached command/non-log depth/大坐标                                                                                                                               |

基础平面示例在 1185×667 viewport 用真实 CDP mouse input 验证：

- 中键短拖松开，pitch 从约 −30.8° 继续到 −17.5°，90 与 150 帧 Camera pose 相同。
- 临时启用 requestRenderMode：左键释放后 X 从约 −296 米继续到 −905 米，60 与 120 帧相同；
  Scene render frame 停在 48，确认余速驱动画面并在结束后停止刷新。
- 滚轮 −120 后 Z 从约 8070 米继续到 4493 米，60 与 120 帧相同；render frame 停在 81。
- 地图显示正常，error/warn 为零。使用独立后台验证页，完成后关闭，临时配置未留在用户页面。

构建、类型、静态检查与审计结果由本轮 plan 记录。

## 剩余边界与交接

- 技术验收通过；2026-09-18 负责人验收通过。
- 与 Globe 一样，仅小于 0.4 秒的短拖动触发余速；实际累计移动仍与 update 频率有关。
- 既有 extent/pitch/endpoint clearance 保持，未扩展 touch、pinch 或 swept collision。
- 本项形成独立本地 checkpoint，未 push。原低俯角修复已独立提交为 `a7a6e8650a`。
