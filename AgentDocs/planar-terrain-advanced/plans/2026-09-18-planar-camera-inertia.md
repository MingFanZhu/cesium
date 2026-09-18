# 平面相机惯性

- Type: standalone plan
- Status: completed（技术验收与负责人验收通过）
- Created / Updated: 2026-09-18
- Owner / architecture review: 当前 Agent；confirmed，负责人要求平面相机具有球面相同的惯性体验
- Baseline: `scenegis/develop@a7a6e8650a`
- Related: [扩展索引](../README.md)、[ADR-0079](../../../Documentation/SceneGIS/Decisions/ADR-0079-planar-camera-inertia.md)
- Review: [技术自审](../reviews/2026-09-18-planar-camera-inertia.md)
- Upstream-owned files / SGP: None

## 源码事实与设计

Cesium 1.144 `ScreenSpaceCameraController.reactToInput → maintainInertia → decay`
采用 0.4 秒短拖动门槛、末次 movement 半幅与 `exp(-25 * (1-coefficient) * elapsedSeconds)` 衰减，
小于 0.5 pixel 停止。默认 spin/translate 为 0.9、zoom 为 0.8；Clock time 不参与计算。
`CameraEventAggregator` 已提供 press/release identity 与 wheel normalized movement。
Planar `ControllerHost.update` 位于 Scene camera-change 检查之前，requestRenderMode 可由实际 Camera 变化唤醒。

在既有 controller 中增加三个同名可写属性与 controller-owned 可复用 inertia state；最后实际消费的输入决定余速类型。
Pan/rotate 延续已有 anchor/target/distance snapshot，zoom 保存 wheel pointer/anchor，不对每个惯性帧重新拾取地形。
真实输入优先，保持 middle > left、wheel last。快速 release 启动衰减，长拖动或参数为 0 时立即停止。
新 press、禁用对应输入、mode 切换、Home、flight/tracking suspension、disconnect 清除惯性，不能在恢复后重放。
外部 Camera pose 修改优先于剩余惯性。既有 pitch/extent/clearance、underground crossing 不变。

## 范围

- 产品：`SceneGISPlanarCameraController.js`，无新模块/上游 seam/Shader/Worker。
- Specs：既有 controller suite；真实 terrain/navigation fixture 回归。
- 文档：ADR-0079、ADR-0004 历史契约 successor、Architecture、DevelopmentGuide、PlanarWorldGuide、AgentDocs。
- 不增加 touch、pinch、惯性物理体、swept collision 或新输入映射。

## 验证

1. 默认值/参数验证/0 禁用；短拖动释放后平移、旋转、缩放继续且逐渐停止，Clock 暂停不冻结惯性。
2. 新 press 与 feature/mode/enable/Home/flight/tracking/remove 的取消及不复活。
3. 地形锚点不重新拾取、surface clearance、地下穿越与低俯角边界不发散。
4. Perspective 与 Orthographic 代表；当前基础平面页真实鼠标松手观察。
5. focused Specs、完整 build/build-ts/tsc（新增 public properties）、scoped lint/format、AgentDocs 检查及 upstream audit。
6. 回写技术自审与交接；负责人视觉反馈独立于自动化证据。

## 执行与交接

- 已实现默认三类惯性与公开系数，真实输入接管、取消/不复活、anchor 复用、固定 orbit distance。
- 实现中发现 Camera getter 对 axes 的归一化会干扰精确 pose 比较，改为 EPSILON12 axes 比较，
  见 INERTIA-R01；未改变计划范围。
- 自动化：controller 59/59、真实 terrain navigation 1/1、depth/navigation 4/4，共 64 项通过。
- 浏览器：三类真实鼠标输入释放后继续且收敛；requestRenderMode 下随余速渲染并在结束后停止，
  地图正常且 error/warn 为零。临时后台验证页已关闭。
- 完整 `npm run build`、`npm run build-ts`、`npm run tsc` 通过；生成声明包含三个新属性。
  build-ts 输出全库 TSD-JSDoc parent/type warnings，但 exit 0，未手工编辑生成文件。
- 产品与 Specs ESLint、本次文件 Prettier、全 AgentDocs 与相关规范 Markdownlint、`git diff --check` 通过。
  全 AgentDocs Prettier 仍报告 296 个历史文件格式问题，与上一修复一致，不扩散格式化。
- Upstream audit 通过：current delivery upstream-owned entries 0、generated status 0，无新增 SGP。
- 2026-09-18 负责人验收通过；形成本项独立本地 checkpoint，未 push。
