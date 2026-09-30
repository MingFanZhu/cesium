# ADR-0107：物理大气星空背景

- Status: accepted; procedural implementation; owner visual acceptance pending
- Date: 2026-09-30
- Owner: 当前 Agent（架构与实现）
- Plan: [程序星空](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-30-procedural-stars.md)
- Related: ADR-0040 / ADR-0041 / ADR-0042 / ADR-0050
- Upstream-owned files / SGP delta: none; existing SGP-0008 consume-only

## 决策

SceneGISEnvironmentEffects 增加 showStars（默认 true）和 starIntensity（默认 1，范围 0–64）。
星空属于 showAtmosphere 背景；强度是 scene-linear 星光亮度，不跟随 backgroundRadianceScale
重复放大，不参与地表照明、反射探针或 readable night fill。

采用固定 xorshift32 seed 生成 4096 个均匀球面方向，给定模拟亮度和轻微冷暖变化。
生成在同步 publishResources 内完成，96 KiB instance buffer 和 32 bytes quad buffer
由一个 VAO 持有，生命周期/异常回收沿用既有原子发布。CPU 数组上传后不保留。
无星图下载或纹理，不增加异步请求；ready 仍等待原有大气/云资产与 GPU 发布。
失败沿用 errorEvent，不静默回退；昼夜和显示开关复用数据。

透视相机使用一个 instanced quad draw；关闭星空或强度为零不提交。正交射线没有角视场，
不绘制离散远距星点。星点 PSF 使用 separable cubic B-spline，四像素支持域由五像素 quad
包围；亚像素平移时离散权重和为一，避免阈值式程序星点的亮度跳动。不增加 framebuffer/history。

Globe 使用 simulation time 的 TEME→fixed 矩阵的逆。Planar 天文模式额外使用其显式
WGS84 参考的 ENU→fixed 旋转；手动模式为固定世界 XYZ 星点，不假定地理位置或恒星时。
相机旋转仅改变观察方向，不移动星位。两种模式均保持已有 Moon 绘制顺序。

星光为线性 RGB，乘视线大气 transmittance；地面遮挡显式使用 Globe 光学求交
（散射背景会 clamp 到地平线，不能用其 transmittance 代替实际地面相交测试），
Planar 屏蔽向下射线。地表暮光在太阳高度 −6° 至 −12° 间渐显，超出大气层后允许太空星空。
背景先绘制散射与雾，随后加上经大气和雾衰减的星光，不重复添加雾散射，也不改变背景 alpha。
后续几何与云合成自然遮挡；不提高背景黑位、不添加闪烁动画。

## 边界

这是模拟星空，不对应真实星座；天文旋转不意味着目录星位准确。不增加银河、行星、光污染、
月光耀斑或恒星照明。色调映射和曝光仍由现有系统控制。双世界独立示例用于视觉验收。

## 被替代方案

同日初版使用原生 Tycho 六面星图，下载合计 867,538 bytes（约 0.83 MiB），解码显存 24 MiB。
负责人接受模拟星位，现以程序星点替代；原生 SkyBox 资产保留供原生管线使用。
初版实现与测试见 [历史记录](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-30-night-stars.md)。

## 验证

8 个程序星空 GPU/API/lifecycle Specs 与 5 个既有资源回归覆盖昼夜、遮挡、旋转、暖开关、
确定性重建、亚像素能量和销毁；双世界 E2E 检查零星图请求和示例可用性。
性能与最终验证见 [程序星空自审](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-30-procedural-stars.md)。
