# 粒子大小与地平线透射

- Type: standalone plan
- Status: completed
- Author: current task / architecture and execution
- Updated: 2026-10-23
- Parent: [首版](2026-10-23-native-fluid.md)（已完成）
- ADR: ADR-0187
- SGP: None; SceneGIS-owned only
- Review: [修复评审](../reviews/2026-10-23-size-horizon.md)

## 源码事实与设计

- `renderRadius` 目前只在构造时读取。公开可写属性，沿用 spacing 的
  0.5–1.5 倍约束；更新重建半径与包围体，不重置模拟、不重新分配纹理。
- Scene 已在 opaque 之前绘制真实背景；Deferred 的 water color copy
  却把 clear-depth 颜色清零，SSR/SSIL 的借用颜色也仅含 opaque radiance。
- Fluid 声明需要背景透射。Deferred 复用现有 water color target，复制完整
  HDR scene color（包括天空），在共享 lighting MRT 时也执行该捕获；WaterFrame
  现有优先级继续借用此纹理。保留真实 opaque depth，遮挡与 SSR 命中判定不变。
- 不使用天空反射 cubemap 代替可见背景，避免太阳、星空、背景亮度和隐藏状态差异。
- SDK 不在本任务范围。预览只增加半径控件。

## 步骤与验收

1. 增加运行时半径、暂停可调、非法值、资源复用与包围体 Specs。
2. 增加 clear-depth 彩色背景透射 Specs，覆盖独立捕获与共享 SSR 输入。
3. 实现属性与完整背景捕获，保持 water-only 场景既有协议。
4. 原有遮挡、TAA、销毁测试及 WaterSurface 回归；release build、类型生成与 tsc。
5. 低视角跨地平线视觉验证；记录捕获 draw/纹理开销，更新 ADR/开发指南与 review。

## 风险

- Fluid 与共享 SSR 同场景时多一次全屏 HDR copy 和一个 water color target；
  普通无共享 MRT 的喷泉沿用已有 copy/target。
- 屏幕空间折射仍是首层近似，透明物体递归折射仍不在范围。

## 完成证据

- 新增 3 项 Specs 在修改前失败（大小无效、独立捕获/共享 SSR 的天空透射为黑）；
  修复后 FluidPrimitive 严格 WebGL 8/8，WaterSurface 回归 17/17。
- 暂停半径变更覆盖可见面积、包围体伸缩、非法值、无 reset/step/纹理分配。
  两条捕获路径覆盖每帧一次 copy、纹理复用和 Scene 销毁释放。
- Chrome 155 / Windows headless 验证；实际预览低视角复现并确认地平线黑块消失。
  示例增加粒子半径控件，运行时修改已核对。默认捕获 draw 从 1 保持 1；共享 SSR 从 0 变 1。
- `build-release`、`build-ts`、`tsc`、修改文件 ESLint 通过；既有 JSDoc 类型生成 warning 无新增失败。
- 无 upstream-owned 改动，无新增 SGP；无 SDK 改动。
- 全量 AgentDocs markdownlint 通过；全量 Prettier 报 569 个既有文件格式问题，
  本次修改文件单独检查通过，未扩大格式化范围。
