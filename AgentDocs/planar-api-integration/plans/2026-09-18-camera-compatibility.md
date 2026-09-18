# 平面 Camera API 兼容性复核

- Type: standalone plan
- Status: completed；CA-R007 修复后负责人验收通过
- Created / Updated: 2026-09-18
- Owner / architecture review: 当前 Agent；未启用独立评审 Agent
- Parent: None；I1–I5 已完成，本项为兼容性增量
- Decision: ADR-0037；补充同一 fixed-axis Camera contract
- SGP: SGP-0004；唯一预期 upstream-owned file 为 packages/engine/Source/Scene/Camera.js
- Review: [技术自审](../reviews/2026-09-18-camera-compatibility.md)

## 目标与事实

负责人要求检查全部常用 Camera 属性和方法在平面模式下的兼容性，保持原 API。
现有 HPR、setView、lookAt、sphere framing 和 flight 已有 fixed-axis dispatch。
源码复核发现 lookAtWorldPosition 仍读取 ellipsoid normal，正交 width 和 changed 位移阈值仍读取
Cartographic.height，public getPickRay 错判直接 PerspectiveOffCenter 并忽略偏心视锥中心。

## 实施与验收

1. 使用真实 Camera 的 SceneGIS Specs 复现四类遗漏，并资格确认 HPR / setView / flyTo、transform 和 Cartesian 基础操作。
2. 在既有 SceneGIS private helper 实现 fixed +Z lookAtWorldPosition、平面正交尺度与 changed 位移尺度；
   public getPickRay 复用已有四视锥 ray helper。Camera.js 仅增加 SGP-0004 窄 dispatch。
3. 正交 move / rotate 保持显式 frustum 宽度；zoom 明确改变宽度。投影切换不产生零宽度或地球半径尺度。
4. 保留 positionCartographic 的内部基底边界，继续拒绝 Rectangle / Ellipsoid 专用入口；
   不改 Cesium 类型语义，不改 Globe 分支，不扩展碰撞或 CRS 转换。
5. 更新既有相机示例和兼容矩阵。运行相关 Camera / flight / controller 与 Globe 回归，必要构建、类型和上游审计。

## 风险与交接

非 identity transform 使用 Camera reference frame；HPR getters / setView 使用固定 world axes。
正交缩放行为必须与 controller 手势、lookAt、flight framing 共存，不能复用错误的地球高度。
公开位置语义仍为 Cartesian3 米制；测试应使用非零原点以揭露错误的 radial 假设。

## 实施与验证结果

首轮 8 项真实 Camera Specs 复现 6 项失败，修复后通过；追加 frame boundary 用例复现直接 OffCenter 被拒绝，
继而通过实际 Context 验证两种直接 OffCenter 渲染与 ray 命中。另将 public 负 roll 读取归一到 Cesium 的非负一周范围。
没有修改 CameraFlightPath、Scene、Renderer 或 controller；所有 runtime 主体在既有 owned helper。
326 项 focused Specs 包括 Camera API、原 helper / flight / controller、real Widget 与 upstream Camera / CameraFlightPath，全部通过。
build / buildRelease / buildTs / buildDocs 和 root / engine TypeScript 通过。示例增加中文控件与实时 HPR / positionWC / width 读数，
浏览器操作确认 setView、flyTo + completeFlight、正交切换、move / zoom / lookAtWorldPosition；未发现 console error。
完整证据与保留边界见 review；本项为 standalone，不新增 phase，不提交或 push 混合工作区。

负责人复测捕获接近 nadir 的正常正交姿态被 HPR getter 拒绝：asin(direction.z) 因 Z 舍入到 -1 而失去
约 1.49e-8 的倾角，随后 getAxes 覆写验证原方向使用的 scratch，误报 orthogonalityError。
本次修复保留原方向用于验证，方向转 pitch 使用 atan2(Z, hypot(X,Y))，同步修复 direction/up flight 与 Cartesian lookAt 的同类换算。
补充真实 Camera near-vertical round-trip 和 Home 末段逐帧 HPR / changed 回归，再复测实际页面。
新增三项用例在修复前均失败，修复后 329 项相关 Specs 通过；实际页面自然完成 Home 飞行，render loop 保持运行，
flight 和 controller suspension 正常清零，没有新增 console error。本次没有新增 upstream-owned 修改。

2026-09-18 负责人确认验收通过，本 standalone 完成；后续 Entity API 审计单独记录。
