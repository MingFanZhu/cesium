# Standalone Plan: Observer range guide

## Metadata

- Plan type: standalone
- Status: completed; guide visual acceptance confirmed
- Owner role: execution / architecture self-review
- Architecture review: confirmed
- Created / Updated: 2026-10-21
- Parent context: [extension](2026-10-21-extension.md), V3 checkpoint `62cc7be37e`
- ADR: 0176 amendment; SGP: none added

## Scope and source facts

给 `SceneGISViewshed` 增加实例级 `showFrustum`，默认 false，示例默认开启。
现有距离为径向球形截断，不能用矩形远平面代替分析边界。
原生 DebugCameraPrimitive 同时绘制面、写深度并逐帧重建，不直接采用。
复用原生 Geometry / Primitive / PerInstanceColorAppearance 的线绘制；
私有 helper 使用观察相机局部坐标，球面与平面共用米制矩阵。

## Implementation

- 线框表示 near 平面、四个视角边界与 distance 球面的交集；圆弧有限细分。
- 仅参数改变重建几何，移动 / 旋转只更新矩阵。关闭不提交命令，保留缓存。
- 固定亮黄色线，透明通道、深度测试、不写深度，不拾取、不投影、不参与分析。
- 在既有 prepare hook 更新，独立于分析 enabled，无新增监听或 upstream seam。
- stage 销毁释放 helper；未加入 collection 不分配资源。
- 示例添加中文开关，重建分析时保留 UI 值；同步文档与 ADR。

## Verification and exit

几何 Specs 覆盖普通视角与 near 接近半径的裁切；GPU 覆盖开关、姿态、
两实例隔离、遮挡结果不变、缓存和销毁。双世界街区 E2E 检查控制与画面。
运行相关 Specs、完整 build / 类型检查和 scoped lint；不扩大真实数据矩阵。
记录结果、自审与剩余边界后交付视觉验收。

## Results

14/14 Viewshed Specs、2/2 双世界街区 E2E、完整 build、build-ts、tsc 通过。
测试证明辅助线开启不增加 observer draws，位置 / 朝向变化复用同一 VA，
参数重建和移除释放资源，双实例相互独立。截图已检查，最终视觉判断交负责人。
实现中发现 morphable Scene 的原生 Primitive 会把局部几何做日期变更线切分；
helper 在 update 期间临时指定 3D-only preparation，并在 finally 恢复 FrameState。
复验每实例一条源命令，无新增离屏目标 / Shader / upstream-owned 修改。
详见 [review](../reviews/2026-10-21-frustum-guide.md)。
