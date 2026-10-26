# 云底扰动分层线修复

- Type: standalone plan
- Status: completed; owner accepted the layer-seam correction on 2026-10-26
- Author: implementation / architecture self-review; created 2026-10-26
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Preceding: [high temporal support](2026-10-26-high-cloud-temporal-support.md)
- Policy: [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Review: [implementation and validation](../reviews/2026-10-26-cloud-bottom-turbulence-continuity.md)
- Scope: shared cloud material remap and focused GPU Specs; no API / upstream increment.

## 根因与方案

负责人低空 Globe high 视角复现水平切线，原始 cloud trace 已有切线；隔离 resolve、
空气透视和高度雾仍复现。云底 turbulence 使用 `remap(heightFraction, 0.3, 0.0)`，
但 `sceneGISGlobeCloudRemap` 用正 epsilon 截断负分母，使权重在 0.3 处由 0 跳成 1。
第一层底高 750 m、厚度 650 m，对应错误切面为 945 m，与当前相机约 937 m 的近水平
切线吻合。参考材质使用允许递减区间的 remapClamped，意图是底部向上连续衰减扰动。

保留 remap 分母符号及原 epsilon 幅度，修正递减范围；递增范围保持原公式。
Globe / Planar 共用材质，双方都应修正，不改纹理、步数、光照、混合和公共配置。
前两轮 history 修复及启动优化保持现状，不创建分支、不自动提交。

## 验证

- GPU 验证递增 / 递减 remap 的端点、中点和 clamp；旧公式负控重现跳变。
- GPU 用真实 cloud material 验证 30% 高度附近 turbulence 的连续性，覆盖两世界，
  采用受控非恒定 shape texture，避免仅验证公式而漏掉材质调用。
- 原视角实际画面、临界高度及移动观察；真实 trace GPU 成本、诊断资源回收。
- scoped lint、build-release、文档验证；记录 review 并更新索引。

风险：修复会恢复云底原有扰动分布，云底轮廓会变化；有限采样噪声仍是独立视觉事项。

## 执行结果

产品只修改共享材质 remap 分母，保留符号与 epsilon。两个 strict-WebGL GPU Specs
通过，覆盖升降区间及两世界 visible / shadow density；旧公式负控在 945 m 附近出现
约 0.00452 的单步密度跳变，新公式在相同 half-metre 采样下全部小于 0.001。
当前低空视角切线消失；24 对 trace GPU 中位数为 6.58 / 7.98 ms，具体条件及风险见 review。

负责人以“ok”接受分层线修复，并转入中质量颗粒反馈；该独立事项见
[medium reconstruction](2026-10-26-medium-cloud-reconstruction.md)。本项有限视觉 gate 关闭，
不表示所有档位采样噪声均已解决。2026-10-26 负责人要求提交当前云优化，本项纳入
画质检查点；不推送。
