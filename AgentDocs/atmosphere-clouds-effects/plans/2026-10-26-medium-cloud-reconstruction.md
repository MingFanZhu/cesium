# 中质量云重建去颗粒

- Type: standalone plan
- Status: completed; owner approved the current result for commit on 2026-10-26
- Author: implementation / architecture self-review; created 2026-10-26
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Preceding: [cloud material continuity](2026-10-26-cloud-bottom-turbulence-continuity.md)
- Policy: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)
- Review: [implementation and verification](../reviews/2026-10-26-medium-cloud-reconstruction.md)
- Scope: Globe medium phased reconstruction and focused GPU regression; no SDK / API / upstream increment.

## 事实与方案

负责人接受分层线修复后反馈 Globe medium 颗粒。当前静止低空视角中，160 × 160 云体
区域连续 32 帧的 819,200 个样本全部通过 history / receiver gate，透明度大幅裁剪只占
104 个；不能归因于历史不断重置。medium 每帧追踪四分之一像素，tent 重建在已采样像素
直接使用单射线，在其余位置融合 2 / 4 射线；随机噪声幅度随四相位变化。high 已使用
邻域滤波，中质量这一处缺少相当的去噪。

在现有 3 × 3 几何合格邻域内评估按真实 full-pixel 距离计算的 Gaussian 核，让各相位
都有邻域融合。只对 Globe phased 路径应用；保留 receiver / 前景剔除、透明样本、
当前 metadata、历史权重、方差裁剪、STBN 序列和追踪预算。用同帧双历史输出对照
颗粒、波动、边缘细节与 GPU 成本，验证后固定最小有效 footprint。

## 验证与退出

- 受控 GPU 噪声样本覆盖全部相位，检查空间方差、常量保持、透明边及不相容 receiver。
- 回归现有 high history / thin-edge Specs，确保新核不影响全分辨率路径。
- 负责人当前中质量画面、移动视角，实际 resolve GPU 对照；清理临时 GPU 资源。
- scoped lint、build-release、文档检查；更新 review / ADR / 索引，保留视觉判断 gate。

风险：额外空间融合可能略软化小于数像素的云细节；不得以提高 history 权重掩盖噪声，
也不将中质量暗中提升到全分辨率。2026-10-26 负责人要求本地提交当前结果。

## 执行结果

采用 1.5 full-pixel Gaussian，3 像素轴向开区间保证四相位对称。只改变 Globe phased
路径的权重；其他统计和筛选保持现状。实景同输入高频残差下降 50.1%，帧间亮度差下降
38.7%，resolve GPU 中位数 1.200 / 1.214 ms。七项 focused GPU 回归在两次运行中通过，
包含两项新增 medium 用例；详细验证、剩余细节软化风险与最终视觉 gate 见 review。
