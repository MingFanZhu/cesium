# 球面近景裁剪根因

- Type: discussion
- Status: resolved
- Author: implementation / architecture
- Date: 2026-10-26
- Plan: [near-field precision](../plans/2026-10-26-near-field-precision.md)
- Decision: [ADR-0191](../../../Documentation/SceneGIS/Decisions/ADR-0191-globe-clipping-precision.md), SGP-0070

## 证据与区分

1. 原始场景无网络依赖，原生 collection 直接复现。关闭 skirts 后主要缺口仍在。
2. 80 m 范围对应的绝对经度约 2.0718 rad，Float32 间隔约 2.38e-7 rad（约 1.3 m）。
   原 SDF 将 4096 个纹素重建为绝对角度，多个相邻纹素落在同一浮点数上。提高质量不能恢复精度。
3. 仅归一化 polygon/SDF，仍能看到明显锯齿：GlobeVS 的 ECEF 合成及球面运算也先舍入，
   后续归一化无法恢复低位。角度先计算后插值还依赖地形三角形尺度。
4. 插值 RTC 并在 fragment 保留高低位后，GPU probe 暴露了 ANGLE 代数优化：补偿低位
   被折叠为 0；部分修复仍有厘米误差，垂直 skirts 将偏移表现成长细条。
5. 对已实测丢失低位的 error-free transforms 加 uniform 舍入屏障后，GPU 对 CPU 的角度
   差折算小于 1 mm，开启 skirts 的两个近景及粗 LOD 回归均通过。没有改变 skirt 生成或开关。

## 选择

保留原生球面、合并区域、凹环和 SDF；先缩小数值尺度，再保证片元投影精度。
未引入 ENU 平面替代、不扩大侧壁，不新增距离纹理或逐帧 GPU 回读。
新增热路径只出现在启用 polygon clipping 的 Globe shader。
