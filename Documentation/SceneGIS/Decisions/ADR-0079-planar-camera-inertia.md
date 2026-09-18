# ADR-0079：平面相机惯性

## 状态与背景

- Status: approved
- Date: 2026-09-18
- Decision owner: 当前 Agent，依据负责人明确要求
- Plan: [平面相机惯性](../../../AgentDocs/planar-terrain-advanced/plans/2026-09-18-planar-camera-inertia.md)
- Supersedes: ADR-0004 的 release-without-inertia 阶段性限制
- Upstream-owned files / SGP: None

原平面控制器在 release 后立即停止，负责人要求获得球面相同的惯性体验。
基于官方 1.144 / `6d5d8b1f0725b6f831b336463f4b11c98023427b` 的
`packages/engine/Source/Scene/ScreenSpaceCameraController.js` 中 `maintainInertia`/`decay`：
短拖动门槛 0.4 秒、半幅末次输入、指数衰减率 `25 * (1-coefficient)`、0.5 pixel 截止。
保留这些参数与公式；不复制 Globe control state machine 或调用其私有函数。

## 决策

`SceneGISPlanarCameraController` 增加可写 `inertiaSpin=0.9`、`inertiaTranslate=0.9`、
`inertiaZoom=0.8`，分别控制 middle rotate、left pan、wheel zoom。
只接受 finite `[0,1)`；0 精确关闭对应惯性，并立即取消已有该类余速。
Viewer 应用通过 `viewer.planarCameraController` 配置，无新增 Viewer option。

按真实 elapsed time 衰减，不受 simulation Clock 暂停、倍速或倒放影响。
使用最后实际消费的 movement，释放前 press 时长小于 0.4 秒才继续；wheel 使用 aggregator 的瞬时 press/release。
Controller-owned state 只保留最新输入类型，复用 movement、pointer 和 Camera pose 对象；不增加 timer/listener/GPU resource。
Pan 累积虚拟 pointer 并继续使用原锚点水平面；rotate 沿用原 pivot/window anchor/固定 distance；
zoom 继续使用最后 wheel pointer/anchor 与当前缩放约束，不逐帧重新拾取。

真实输入优先于余速；新 press 可立即停住视角。对应 feature disable、整体 disable、navigationMode 切换、
Home、flight/tracking suspension、disconnect/zero canvas 必须取消待启动及已启动惯性；恢复后不得复活。
外部 Camera pose 修改取消旧惯性。既有 surface endpoint clearance 与 underground crossing 继续适用。
Scene 已在 requestRenderMode 判断前调用 ControllerHost，实际 Camera 变化驱动渲染，不额外逐帧 requestRender。

## 取舍与影响

- 不继续维持无惯性默认值：与负责人要求不符；应用可以显式把三个系数设为 0。
- 不复用整个 Globe controller：它依赖 ellipsoid 地表与不同输入数学；仅参考已核验的衰减策略。
- 不引入 Tween/独立定时器：惯性属于正常 controller update，取消与资源生命周期保持单一入口。
- 不扩展 touch、pinch 或连续物理碰撞，也不改变平面米制坐标和原有鼠标映射。
- 新属性通过原 JSDoc/barrel/types 链发布，生成文件不提交；运行完整 build、build-ts、tsc。

## 验证与升级

Specs 覆盖三类输入释放/收敛、0/无效系数、真实时钟、取消/不复活、地形 snapshot、
低俯角边界及两类投影；现有真实 terrain/navigation fixture 回归。浏览器实际观察松手效果。
升级时核对 native inertia 参数、aggregator press/release/movement 与 ControllerHost 在 requestRenderMode 前的时序。
