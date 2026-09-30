# 程序星空替换星图

- Type: standalone plan; status: implemented, technical review passed; owner visual acceptance pending; date: 2026-09-30
- Owner: 当前 Agent（实现与架构自审）
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Supersedes: [夜晚星空的图像资源方案](2026-09-30-night-stars.md)
- ADR: [ADR-0107](../../../Documentation/SceneGIS/Decisions/ADR-0107-atmosphere-stars.md)
- Upstream-owned files / SGP delta: none

## 事实与边界

现有六张 JPEG 合计 867,538 bytes（约 0.83 MiB），24 MiB 是解码后的 cubemap 显存。
负责人接受模拟星位，要求省去星图资源。保留 showStars / starIntensity、天文旋转、暮光和
大气/地面/高度雾/云遮挡；不添加星座、银河贴图或逐帧闪烁。

## 实施设计

一次生成固定种子的 4096 个均匀球面方向及线性亮度/色温变化，上传静态 instance buffer。
用已有 Renderer 抽象绘制一个 instanced quad batch，透视投影后保持像素大小。
采用总能量不随亚像素位移变化的 separable cubic B-spline 滤波，避免硬阈值星点闪烁。
在物理背景之后、场景几何与后续云合成之前叠加经过大气与雾衰减的星光；不重复增加雾散射。
无星图请求/纹理/额外 framebuffer/history；新增约 96 KiB 静态顶点和一个稀疏 draw。
正交射线没有角视场，不绘制离散远距星点；透视球面和平面共享实现。
关闭 showStars 或 starIntensity=0 不提交星点 draw，暖切换复用资源。
buffer、VAO、shader 纳入既有原子创建与销毁，删除六张星图的异步加载和失败路径。
保留原生 SkyBox 资产，以免影响原生 Cesium 用户。

## 验证与退出

1. API/零星图请求/热切换/释放测试，保留既有 LUT generation 失败回归。
2. 两种世界 GPU 测试暮光、地面、大气、雾、星位旋转；像素位移能量稳定性测试。
3. 两种世界本地示例 E2E；夜景与相机移动视觉检查；背景 GPU timer 对照。
4. release build、相关 release Specs、scoped lint，文档检查和 ownership 核对。
5. 更新 ADR、自审和索引，独立本地检查点；负责人视觉验收保留 pending。

## 实现结果

实现遵循上述设计，无 upstream-owned 文件或 SGP 变化。原生 SkyBox 资源未删除。
8 项星空 Specs 与 5 项既有资源回归在 development/release 全部通过；两种世界示例 E2E 通过。
完整 release build、类型生成/检查和 scoped ESLint 通过。
球面/平面夜空及云遮挡已检查，星点亚像素能量稳定；GPU 背景增量约 0.0041 ms（仅本机固定场景）。
详细证据、生命周期审查和剩余边界见 [技术自审](../reviews/2026-09-30-procedural-stars.md)。

当前 14 个改动路径与官方基线逐项核对，upstream-owned=0、generated=0，diff whitespace 检查通过。
所有 AgentDocs 的 Markdownlint 通过；全量 Prettier 仍报告 319 个既有未格式化文件，
本次文档均已格式化并单独检查，不扩散修改历史文档。
