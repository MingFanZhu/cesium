# ADR-0107：物理大气星空背景

- Status: accepted; implementation and technical verification complete; owner visual acceptance pending
- Date: 2026-09-30
- Owner: 当前 Agent（架构与实现）
- Plan: [夜晚星空](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-30-night-stars.md)
- Related: ADR-0040 / ADR-0041 / ADR-0042 / ADR-0050
- Upstream-owned files / SGP delta: none; existing SGP-0008 consume-only

## 决策

SceneGISEnvironmentEffects 增加 showStars（默认 true）和 starIntensity（默认 1，范围 0–64）。
星空属于 showAtmosphere 背景；强度是 scene-linear 星图亮度，不跟随 backgroundRadianceScale
重复放大，不参与地表照明、反射探针或 readable night fill。复用原生 Assets/Textures/SkyBox
的六张 tycho2t3_80 JPEG，保持原有资源归属与发布路径。

六张图与 LUT 一起参与既有 generation 加载，ready 表示全部发布成功。采用 HTMLImageElement
CPU 解码，GPU 对象只在同步 publishResources 创建；过期结果由既有 generation 检查丢弃。
失败沿用 errorEvent，不静默回退。开启后保留 cubemap，切换昼夜/显示不重新请求。
纹理为 1024² × 6 RGBA8、无 mipmap，24 MiB；保持原生线性采样。
新增一张纹理和背景中一次 cube sample，无额外 draw / framebuffer / history。

Globe 使用 simulation time 的 TEME→fixed 矩阵的逆。Planar 天文模式额外使用其显式
WGS84 参考的 ENU→fixed 旋转；手动模式为固定世界 XYZ 星图，不假定地理位置或恒星时。
相机旋转仅改变观察方向，不移动星图。两种模式均保持已有 Moon 绘制顺序。

星图从 sRGB 解码到线性后乘视线大气 transmittance；地面遮挡显式使用 Globe 光学求交
（散射背景会 clamp 到地平线，不能用其 transmittance 代替实际地面相交测试），
Planar 屏蔽向下射线。地表暮光在太阳高度 −6° 至 −12° 间渐显，超出大气层后允许太空星空。
星光在高度雾之前加入，后续现有云透射自然遮挡；不提高背景黑位、不添加闪烁动画。

## 边界

这是静态星图背景，不是逐颗恒星的光度/视星等模拟；不增加星座、行星、光污染、月光耀斑
或恒星照明。色调映射和曝光仍由现有系统控制。新增独立双世界示例用于视觉验收。

## 验证

7 个新 GPU/API/lifecycle Specs、5 个既有资源回归、12 个 release Specs 和两个本地示例 E2E
通过；完整 release build、类型生成和类型检查通过。固定背景 GPU 开销及资源预算见
[技术自审](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-30-night-stars.md)。
