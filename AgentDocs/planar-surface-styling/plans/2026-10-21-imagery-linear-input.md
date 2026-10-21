# 平面影像线性输入修复

- Type: standalone plan
- Status: completed
- Author role: architecture / execution
- Updated: 2026-10-21
- Parent: None；S1–S4 后续缺陷修复
- Related ADR: ADR-0031、ADR-0032、ADR-0161
- Related review: [颜色空间评审](../reviews/2026-10-21-imagery-linear-input.md)
- SGP: None；只修改 SceneGIS-owned files

## 已确认问题与边界

综合环境两页使用同一 EPSG:3857 World Imagery，图层滤镜为 identity。
Planar 的 `sceneGISComposeLayers` 把显示编码 RGB 直接交给线性材质缓冲；Globe 默认
通过 `czm_gammaCorrect` 解码。ADR-0161 的 LDR 输出仍执行 `1 / scene.gamma`，
因此 Planar 中灰 0.5 被错误显示为约 0.73。关闭雾、空气透视或环境仍可复现。
既有 Surface 数值测试使用 gamma=1，不能发现这个问题。

本次不修改大气参数、光照倍率、曝光、最终输出 gamma、瓦片选择、Material 或矢量颜色。
`baseColor` 保持既有线性输入语义；只修复栅格影像的输入边界。

## 实施

1. 在现有 Surface Specs 添加 gamma=2.2 的真实像素回归，先确认旧代码失败。
2. 保持 raw color-to-alpha 和五个艺术滤镜顺序，在每层 alpha 合成前调用
   `czm_gammaCorrect`。滤镜可产生负通道，解码前限制为非负，保留大于 1 的 HDR 值。
3. 补充 ADR-0031 的线性渲染修订，明确取代旧的“不做解码”前提；不改变 API 或 shader key。
4. 验证中灰、彩色、半透明层、非默认滤镜、Material 线性输入与 HDR/LDR 共用边界。
   保留原有 gamma=1 测试；检查 command / texture / VA 身份与释放。
5. 构建并运行相关 Specs，在两页原视角、相同时间及环境开关下对比，记录有限帧性能样本。

## 退出条件

- 默认 gamma 的影像不再重复编码，透明层在线性域混合；Material 不重复解码。
- 无新增 draw、纹理、RTT、shader variant 或逐帧 CPU 工作。
- 相关自动化与视觉检查完成，记录剩余差异和项目负责人视觉验收状态。

## 完成记录

- 唯一产品修改为 `_SceneGISPlanarSurfaceShader.js` 的每层 RGB 解码；无 upstream 修改。
- 新增 4 个实际 GPU 回归在修复前全部失败（中灰 128 → 186），修复后通过；
  Surface / Shader 全部 52 Specs 通过，完整 build 与相关 ESLint 通过。
- 旧 Surface 用例原本会受到默认环境的时刻、天空及薄雾影响，导致透明背景和纯红像素
  断言失败；测试 helper 现显式关闭环境，隔离被测 Surface 合成，不修改产品环境默认值。
- 已在综合示例原视角与同步时刻检查两页，开启 / 关闭环境均验证，无浏览器错误。
  关闭环境后同源影像颜色接近；开启后仍保留平面 / 球面几何与空气透视的正常差异。
- 固定原视角、1001×826、IAB / Windows、60 次强制绘制并 `gl.finish()`：
  同步帧耗时中位数 1.0 → 1.1 ms，P95 1.8 → 1.9 ms。仅是有限 wall-time 样本，
  非独立 GPU timer。两次均为 140 terrain commands、141 累计 imagery textures（已释放 1），
  2 Surface shaders；无新增 draw、缓存或分配。
- 两页已恢复原时刻与环境开关，平面页保留新代码；项目负责人最终视觉验收待反馈。
