# 液面法线细线

- Type: standalone plan
- Status: completed
- Author: current task / architecture and execution
- Updated: 2026-10-23
- Parent: [首版](2026-10-23-native-fluid.md)（已完成）
- Related: [大小与地平线](2026-10-23-size-horizon.md)（已完成）
- ADR: ADR-0187
- SGP: None
- Review: [法线细线评审](../reviews/2026-10-23-normal-seam.md)

## 复现与根因

用户预览在 1001×826、0.75 重建比例（751×620）下出现固定横向细线。
暂停并关闭折射后仍在，法线诊断确认整行断层；提高 sampler 精度无效。
合成 shader 用连续屏幕 UV ± reconstruction texel 采样 nearest 深度。
例如屏幕像素恰好落在 UV=0.25，对应低分辨率纹理整数边界，浮点舍入使邻居跳行；
同时差分位置使用屏幕中心而深度来自重建像素，空间位置不一致。

## 实现与验证

- 用 integer texelFetch 获取中心及四邻域深度；相邻位置统一从纹理像素中心重建。
  最终水面位置和输出深度仍使用实际屏幕像素，保持遮挡和 picking 契约。
- 添加缩放重建的解析斜平面法线回归，覆盖 UV 边界；修改前失败、修改后通过。
- 运行 FluidPrimitive 严格 WebGL Specs（包含地平线、Globe、遮挡、TAA、资源）。
- 对暂停状态同一水体进行修复前后视觉比对；不增加 draw、纹理或 CPU 回读。
- 不修改 SDK、上游文件和共享 SSR shader；前一轮未提交修改保留。

## 退出条件

斜平面在跨行边界保持一致法线，实际画面细线消失，相关 Specs 通过并记录 review。

## 完成证据

- 原正交斜平面未触发 headless 驱动误差，改用透视解析平面覆盖位置与采样中心一致性。
  回归在修改前失败（法线最大误差 0.000358，容差 0.0002），修复后通过。
- 严格 WebGL FluidPrimitive Specs 9/9，含 Globe / Planar、地平线、遮挡、TAA 与资源释放。
- 用户实际页面同一暂停状态下对比确认横线消失；正式 shader 刷新后核对加载成功，
  恢复原相机、发射参数、折射和运行状态，清理临时诊断 shader。
- 5 次重建深度读取保持不变，新增一次像素中心位置重建；无新增 draw / texture / CPU readback。
- 前一轮未提交修改完整保留，无 SDK / upstream-owned 文件修改，无新增 SGP。
