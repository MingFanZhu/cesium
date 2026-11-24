# TAA 夜景亮度修复评审

- 类型：Architecture/code review
- 状态：approved
- 日期：2026-11-24
- 关联：[修复计划](../plans/2026-11-24-taa-night-luminance.md)、ADR-0094
- 范围：SceneGIS-owned TAA resolve 与属性说明，沿用 SGP-0022

## 发现与处置

- TAA-01（已修复）：当裁剪后的历史比本帧亮纹暗时，旧亮度权重继续降低当前样本贡献。
  暗历史在多轮 jitter 中累积并压低亮纹。仅在低亮度邻域按亮度一致性降低历史贡献。
  首个全亮度版本让发行版掠视纹理和细栏杆重新闪烁。原算法同一套发行版 13 项通过。
  最终方案由 3×3 邻域亮度上界连续过渡，在 18% 参考灰及以上保留原防闪烁权重。
- TAA-02（保留限制）：亚像素边缘的采样覆盖随抗锯齿变化。相机重投影仍无法完全消除独立运动或透明内容的拖影。

## GPU 对照

Chrome Headless 158，RTX 3060 Ti，ANGLE D3D11。固定相机、曝光和时间，使用 400×250
程序化暗色表面。对中心区域的 8-bit 灰度按八帧 jitter 周期取平均。

| 图案       | 关闭 TAA | 仅空间重建 | 旧版完整 TAA | 修复后完整 TAA |
| ---------- | -------: | ---------: | -----------: | -------------: |
| 夜间细亮纹 |     6.52 |       7.65 |         3.68 |           7.05 |
| 均匀暗部   |     5.00 |       5.00 |         5.00 |           5.00 |
| 白天粗纹   |    62.32 |      62.31 |        62.19 |          62.24 |

开发版与发行版的球面、平面读数一致。试验场为负责人指定的本地文件，留在工作区。
800×500 时交替执行同输入旧、新 resolve，18 组/版本，每组 12 次提交，
单次 GPU 中位数分别约 0.04471 ms 与 0.04510 ms，查询无 disjoint。
修改局限于混合算术，无新增纹理、绘制、回读或着色器变体。

开发版与发行版各 13 项严格 WebGL TAA Specs 通过，覆盖静态纹理、亚像素栏杆、
移动视角、拾取、深度、失败恢复及资源生命周期。

## three.js 对照

WebGL `TAARenderPass` 对静止场景使用等权抖动采样累积。WebGPU `TRAANode` 使用
深度和运动向量重投影，再按压缩后的亮度分别调整当前帧和历史帧权重，并归一化线性 RGB 混合。
在同一个平面试验场仅对照 `TRAANode` 的混合公式，复用 SceneGIS 的空间重建、重投影与裁剪。
该对照测得 5.02，关闭 TAA 为 6.52，本次暗部权重为 7.05。继续采用本次方案。
[TAARenderPass](https://threejs.org/docs/pages/TAARenderPass.html)
[TRAANode](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/tsl/display/TRAANode.js#L454-L479)
[TAAUtils](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/tsl/utils/TAAUtils.js#L44-L55)

完整发行构建、类型生成和 TypeScript 检查通过。类型生成有既有 JSDoc 警告。
