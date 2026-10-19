# 近地文字与填充边缘尺度修复

- Type: standalone plan
- Status: completed; owner visual gate passed
- Created / updated: 2026-10-19
- Owner: 当前 Agent，Architecture / implementation self-review
- Architecture review: revised after method review; implementation self-review complete
- Baseline: `scenegis/develop@729dc4bbd0`
- Discussion: [已复现问题](../discussions/2026-10-19-near-view-style-scale.md)
- Review: [方法与实现复审](../reviews/2026-10-19-near-view-style-scale.md)
- Related: ADR-0062、ADR-0065、ADR-0070、ADR-0030；SGP 增量：无

## 目标与边界

负责人确认修复近处文字放大和面边缘模糊，保留现有 SSE 选级，不增加俯角阈值，
在当前相机和连续倾角变化下验证。沿用当前分支，仅修改 SceneGIS-owned paths。
Style zoom、minzoom/maxzoom、source cover、Worker 协议、环境与深度/层序保持既有契约。
D2 动态规则的人工 gate 独立保留。

## 实现

1. 方法复审推翻首轮深度比例 clamp：它在宽 FOV 的离轴位置仍把 8 px quad 拉长到 14.09 px。
   透视 map-pitch 使用局部地表到 CSS 屏幕 Jacobian，取
   `min(referenceMpp, 1 / sigmaMax(J))`。投影矩阵求导包含透视除法的离轴项；局部地表基向量
   使用既有 terrainPoint 的相邻一个地图米采样。近景限制局部最大伸长，远景保留自然透视缩小，
   移除旧 0.5 blend；正交和 viewport 对齐不变。
   Geometry、沿线 advance 与 collision 使用同一 helper，缓存继续按实际比例失效。
2. Fill fringe 保留已有保守几何包络，以覆盖函数的实际屏幕导数把被放大的过渡带收紧到
   一个 device pixel；不足一像素的原远景包络保持。Core coverage 为 1，颜色与 pick 共用
   覆盖函数。不增加 sampler、uniform、pass、VA、纹理或 Worker 数据。
3. 修订 ADR-0062 / ADR-0065，明确新的尺度语义和有限地面包络边界。

Globe GPU 用例揭示的必要数值修正：独立边逆投影生成的 barycentric weights 之和有微小
残差，原 `dot(weights, vec3(1))` 的 core 不严格等于 1；新的窄覆盖会放大此误差。
GroundFS 改用保持常值的 affine interpolation；复审又复现 flat 的常值 1 插值舍入，
因此 shader 改为插值距 core 的距离，core 精确为零，最终覆盖精确为 1，
不以扩大分母、放宽核心颜色容差或隐藏问题代替修正。

## 验证

- 先让新增近景文字尺寸与 fill fringe GPU 用例在旧实现上失败，保留失败证据。
- Symbol：近/中/远和正交、实际投影尺寸、沿线碰撞包络、颜色/pick、静态 atlas/VA 复用。
- Fill：Planar flat/ground 与 Globe，近景边缘的实际像素带、alpha/核心颜色、pick、远景与 DPR。
- 相关 Symbols / Styles / Globe Specs；dev/release Shader 构建及定向静态检查。
  未修改 public API / 类型 / 构建入口，不重复无关发布矩阵。
- 保存当前公开页相机和显示配置，记录相同连续倾角轨迹的修复前/后字号、cover、失败与
  有界 warm CPU 数据，复验画面并恢复原相机。最终画面由负责人判断。
- 回写结果、review、风险与 handoff；不推送、不混入其他扩展阶段。

## 当前状态

负责人更换模型后要求重新 review，并明确应先质疑方法。尺寸方案已替换为实际二维投影
约束，原深度比例方案的 14.09 px 反例恢复为 7.74 px；远景按负责人选择继续透视缩小。
53 项 Symbols Specs 通过。复核发现新增 fill
导数位于非一致 `discard` 之后，不符合 GLSL ES 3.00 §6.4 的导数使用条件。
修正为 flat 在裁剪前计算，ground 仅对变化的 fringe 延后逐片元裁剪，先求覆盖梯度；
常值 core 不求导并保留提前剔除。原有判定、边界归属与资源协议保持。
另将新增 DPR 测试改为固定 CSS 尺寸、实际 1×/2× drawing buffer，补充倾斜边缘验证。
实际缓冲区及 roll 用例复现 flat 核心红色由 128 降为 120；改为零距离插值后恢复 128，
未放宽颜色容差，4 项 fill 专项通过。受 Shader 修改影响的 Styles 12、Ground 18、
Globe 34、Patterns 12 项通过，合计 129 项相关开发版 Specs（不重复累计专项）。
无新增上游集成缝隙或资源所有者。

最终 dev/release 构建及 7 项发布版专项通过。当前公开页原视角与 121 帧连续倾角往返
已验证：26 块可见瓦片保持，无整层停绘或标注失败，被测近景首字形边长最大 1.0301 倍。
相机与显示配置已恢复，截图、性能与限制见 review。2026-10-19 负责人确认效果并明确要求
提交本修复，人工 gate 通过。Architecture 将代码、Specs、ADR 和 AgentDocs 形成独立本地
checkpoint，提交号由本文件 Git 历史定位；不推送。D2 gate 仍独立保留。
