# Globe 近距离空气透视精度修复

- Type: standalone plan
- Status: completed; implementation verified; owner visual acceptance passed
- Owner / Architecture review: 当前 Agent；confirmed
- Created / Updated: 2026-10-12
- Parent: [环境扩展](2026-08-14-atmosphere-clouds-effects-extension.md)
- Related: ADR-0041、ADR-0043；无 upstream-owned file / SGP 增量
- Review: [技术自审](../reviews/2026-10-12-globe-near-aerial-precision.md)

## 源码与复现

Bistro 格林尼治、春分日 17:33 UTC，相机约 4.94 米高，近处建筑在水平视线附近出现亮线及色带。
关闭空气透视后消失；固定曝光、关闭高度雾、Bloom、Lens Flare 和 TAA 后仍复现。
既有 20.5 km receiver-distance 修复已存在，本次不涉及 receiver 误分类。

GPU 的 20 米有限光程扫描也出现散射跳变。现有代码先把端点加到 6360 km 半径再相减，
并在 LUT 参数中相减半径平方，损失小尺度高度；硬件线性过滤的精度进一步限制两次接近采样的差分。
单独删除 horizon clamp 或增加 sampler2D highp 均不能修复。保持局部方向/距离、分开高度计算及显式
FP32 插值的诊断版本，已在相同街景、相同时刻和固定曝光下消除横线。

## 实现边界

- 仅修正 Globe 有限光程的数值计算，复用既有 Bruneton LUT、相函数、遮光长度和 HDR 合成。
- 保留原始 ray direction / distance，以独立高度及因式分解计算球壳几何；不移动接收点、不关闭效果、
  不引入艺术性距离淡出或近景替代散射模型。
- 有限光程 LUT 采用显式 FP32 插值，复用坐标映射；无限天空保持现有采样路径。
- 不增加 API、pass、texture 或持久资源；只修改 owned GLSL 及对应 Specs。
- 保留 top/bottom clipping、clear-depth、linear/log 和正交语义。若测得显著性能代价，先向负责人说明。

## 验证与退出

1. 真实 LUT 的短距离 GPU 连续性回归：旧实现失败，修复后通过，且散射非零。
2. 真实 opaque receiver 的近距离水平面交叉；既有远距离、depth variants、资源切换回归。
3. 当前用户街景保留相机、Clock 和所有显示参数，开启空气透视核对横线；移动相机检查。
4. 同分辨率、同输入做有限光程 GPU 计时；完整 shader 构建、相关 lint/format、文档及 ownership 检查。
5. 写回验证和自审，经负责人视觉验收后形成独立本地提交；不扩大到历史 strict-WebGL fixture 问题。

## 结果

- `sceneGISGlobeSkyRadianceToPoint` 直接传递局部方向、真实距离和独立径向高度。
  `GetSkyRadianceAlongRay` 用因式分解和有理化计算光程高度、球壳交点，保留 top/bottom clipping。
- 复用 Bruneton scattering 坐标映射，有限光程的 2D/3D LUT 使用 `texelFetch` 和 FP32 插值。
  删除有限光程的经验 horizon-angle clamp；无限天空继续走原来的硬件采样与角度策略。
- 新增两个真实 LUT GPU Specs：街高短光程跨地平线连续性、零距离/地面/大气外裁剪/完整 shadow length。
  原实现的连续性测试失败，最大阶跃约 `2.62e-4`，并有大段错误零散射；新实现通过。
- 新增测试、双世界 depth variant 资源切换、Planar opaque linear/log 均通过严格 WebGL 检查。
  Globe far opaque linear/log 与既有 20.5 km receiver 连续性通过普通 GPU 检查。
- Globe far opaque 的严格模式仍触发已记录的 background draw `INVALID_OPERATION`；不记为通过，
  未为使测试变绿修改背景或上游生命周期。
- 街区原视角和移动后的视角均未见横线，保持空气透视、自动曝光、高度雾及 TAA；浏览器无 warning/error。
  负责人后续自行调整时间和相机，保留其新状态，不再用初始快照覆盖。
- 无新增 pass、texture、持久资源或 API；性能和静态验证见 review。
- 2026-10-12 负责人确认横线消失，视觉验收通过；本修复与记录形成独立本地提交，不推送。

## 剩余边界

本次修复消除已复现的水平亮线及大段散射丢失。原始 RGBA16F LUT 分辨率与量化仍限制极短光程的
微小色彩精度，不宣称解析解或无限精度。未修改透明表面没有独立 resolved depth 的现有边界。
负责人视觉验收通过，此 standalone 关闭；历史严格背景测试问题保留原记录。
