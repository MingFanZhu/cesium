# 平面 Camera 兼容性技术自审

- Type: implementation / architecture self-review
- Status: approved；CA-R007 修复后负责人验收通过
- Created / Updated: 2026-09-18
- Author / owner: 当前 Agent；未启用独立评审 Agent
- Target: codex/planar-camera-api 的 Camera 兼容性增量
- Parent: [standalone plan](../plans/2026-09-18-camera-compatibility.md)
- Decision: ADR-0037 补充、ADR-0039 同步更新
- Upstream-owned files: packages/engine/Source/Scene/Camera.js
- SGP: SGP-0004

## Findings

| ID      | 严重度 / 状态 | 事实、修复与证据                                                                                                                                                                       |
| ------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-R001 | P1 / fixed    | lookAtWorldPosition 用椭球 normal 导致平面倾斜；改为 fixed +Z，保留世界位置与 reference transform。大坐标、垂直、同位置与 invalid input 原子性 Specs 通过                              |
| CA-R002 | P1 / fixed    | 正交切换和 move 使用 Cartographic.height，可得到 width=0；使用 planar range / surface height，move / rotate 保宽度，zoom 显式缩放。正负高程、水平朝向、两类正交及 near 下限 Specs 通过 |
| CA-R003 | P1 / fixed    | public getPickRay 错判 PerspectiveOffCenter、忽略中心偏移；复用现有四视锥 helper。API ray 数值与 real Context 两类 OffCenter 像素 / world.pick 命中通过                                |
| CA-R004 | P2 / fixed    | changed 位移除以负球面高度而不触发，纯正交 zoom 没有位置变化；使用 planar scale 并比较最近报告的 frustum span。terrain / Z=0 / underground / zoom / stable state Specs 通过            |
| CA-R005 | P2 / fixed    | Camera.update 拒绝直接 OffCenter，虽 private helper 已支持却无法正常渲染；SCENE3D planar 分派到四视锥 validation。复现失败后真实 frame / GPU 通过                                      |
| CA-R006 | P2 / fixed    | public roll 返回 signed angle，与 Cesium 非负一周范围不一致；仅归一 public HPR helper，不改 controller signed roll 检测。负 roll 与飞行 round-trip 通过                                |

## 验证

- 326 项 ChromeHeadless focused Specs 通过；包括 15 项新增真实 Camera API 用例、4 项 Camera Widget 用例、
  原 planar helper / flight / controller 和 upstream Camera / CameraFlightPath。
- Widget 原有 warm terrain mesh / command / shader / vertex array / imagery texture identity、飞行 input suspension
  与 next-frame clearance 回归继续通过；新增 direct OffCenter 实际白色地表像素与偏心 ray 命中通过。
  无新 GPU 资源或 timer，新增 ray 数学使用已有 scratch；changed snapshot 在报告事件时复用。
- 完整 build / buildRelease / buildTs / buildDocs、root / engine TypeScript 通过。
  公共 Camera.frustum 类型补入 OrthographicOffCenterFrustum；构建保留已有 TSD-JSDoc warning。
- 本次源码 ESLint、修改文件 Prettier / Markdownlint、git diff --check 通过；全 AgentDocs Markdownlint 通过。
  全 AgentDocs Prettier 仍有 285 份既有无关文档未通过，本次涉及的索引和记录全部通过。
- 上游审计通过：14 registered upstream-owned entries，current delivery=1（Camera.js / SGP-0004），generated status=0。
- 浏览器中文示例验证 setView 后 HPR 25 / -40 / 10 度，flyTo + completeFlight 恢复同一姿态；
  正交 width 为正，move 保持 width，zoom 减少 1000 米，lookAtWorldPosition 保留位置且消除 roll；console errors 为空。

## 保留边界

### 负责人复测 CA-R007：Home 末段误报坐标轴不正交（P1 / fixed）

负责人点击全域视图后发生渲染停止，堆栈来自 Camera._updateCameraChanged → heading → getHeadingPitchRoll。
现场 direction.y 约 1.48556e-8、direction.z=-1，而实际 direction / up / right 仍正交。
根因是 asin(Z) 在 Z 舍入到 -1 后丢失水平倾角，且 getAxes 复用了保存原 direction 的 scratch，
使正交检查拿重新构造的垂直方向与实际 up 比较，产生超过 EPSILON8 的伪误差。

修复保留独立的原 direction scratch，用 atan2(Z, hypot(X,Y)) 获取 pitch；同步修正 Cartesian lookAt
和 direction/up flight 的同类方向换算。没有放宽阈值、吞掉异常或增加重试。
新增三项测试在修复前全部失败，修复后 329 项 focused Specs 全部通过，覆盖接近 nadir / zenith、
Cartesian offset / direction-up 终态、Home 最后数帧的 HPR 与 changed。之前仅在中点和终点验证飞行，遗漏了这一数值区间。
实际页面从 HPR 25 / -40 / 10 度自然飞到 Home，终态 pitch=-π/2，renderLoop=true、flight=false、suspension=0；
历史报错保留在浏览器日志中，刷新修复后没有新增错误。本次只修改两个 SceneGIS-owned helper 与 Specs / 记录，
没有新增 upstream-owned 修改，既有 Camera.js 仍属于 SGP-0004。
修复后的 buildRelease、定向 ESLint、修改文件格式与 git diff --check 通过；全 AgentDocs Markdownlint 通过，
Prettier 仍仅报告前述 285 份既有无关文档。

positionCartographic 仍为内部 ellipsoid substrate；应用使用 positionWC.z 或 world terrain query。
Rectangle / Ellipsoid 专用 Camera 方法继续 fail-fast。原地朝向使用 fixed +Z，ellipsoid 参数在 planar 中忽略。
正交 zoom 的 amount 表示水平 span 的米制变化，position 不移动；rotate 仍围绕 reference frame 原点。
垂直方向 HPR 不唯一，以 roll=0 表示等价姿态。没有 CRS 转换、碰撞范围扩展或新的平行 Camera API。
upstream-owned 修改只有 Camera.js，全部为 paired SGP-0004；没有改生成文件，也未提交或 push 混合工作区。
