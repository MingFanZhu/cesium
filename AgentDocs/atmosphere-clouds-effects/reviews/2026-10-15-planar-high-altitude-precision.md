# Planar 超高空大气精度评审

- Type: review
- Status: accepted; technical review and owner visual acceptance passed
- Owner: 当前 Agent，Architecture / implementation self-review
- Created: 2026-10-15; Updated: 2026-10-16
- Target: [standalone plan](../plans/2026-10-15-planar-high-altitude-precision.md)
- Related: ADR-0042；upstream-owned files / SGP 增量：无

## 修改与结论

仅修改 `SceneGISBrunetonAtmosphere.glsl` 的 `sceneGISPlanarRadianceToPoint`。
进入大气的高度使用准确边界；确定已达到出口时直接使用地面或大气顶部高度。
非水平且到达 slab 出口的介质长度由高度差计算，有限端点保留原长度，避免微小高度变化
丢失短光程。保留原 slab 求交接口和近水平路径。
没有扩大地面阈值、关闭效果、引入 fallback 或改变 SDK；Globe、LUT 与资源生命周期不变。

## Findings

- **P1 / fixed：超高空背景蓝白噪点。** 250000 km 俯视，无影像、只开启背景大气仍复现。
  FP32 相消使地面高度在 -16 / 0 / 16 m 跳变。真实 LUT GPU 回归在旧实现的最大差异为
  `0.0411834716796875`，修正后小于 `0.001` 的半浮点输出容差；同时验证地面反射非零。
- **P2 / verified：有限光程与兼容性。** 新增测试保留 slab 内 10 km 接收点、恰好地面端点、
  向上退出、未抵达大气、远离大气及 20 m 近水平短射线语义；现有 horizon、Texture3D warm/lifetime、
  linear/log program reuse 均通过 strict WebGL validation。
- **P2 / existing, deferred：两个既有 fixture 失败。** P5 far-transport 在测试直接调用
  `UniformState.updateCamera` 时缺少 ellipsoid，报 `geodeticSurfaceNormalCartographic`；
  real opaque Planar depth 在 strict background draw 报 `INVALID_OPERATION`。
  同一工作区临时使用 HEAD 原 Shader 后，两项均原样失败，随后恢复修正源码并重建。
  不记为通过，不扩大本次修复；后者与既有 [strict background 记录](2026-10-02-cloud-taa-registration.md)
  属于相同背景绘制路径。后续环境维护负责人独立处理 fixture 初始化与背景附件生命周期。

## 验证与成本

- Chrome Headless 155 / Windows：选取 7 项测试，5 项 strict 通过，2 项上述基线失败；
  两项新增 GPU 回归通过。旧实现的 causal failure 已先记录，未通过修改容差使测试变绿。
- 完整 dev / release 构建通过。实际浏览器检查 dev 的 250000 km 俯视、120 km 斜视、600 m
  近景和 release 的原复现视角，环境保持开启，无页面或渲染错误；原噪点消失。
  诊断页面和截图仅保留在忽略的 `Build/`，不作为产品源码；负责人于 2026-10-16
  明确确认视觉验收通过。
- RTX 3060 Ti / ANGLE D3D11，628×586 原背景 command、相同输入交替各 24 次 GPU timer：
  原 Shader median `0.039936 ms`、p90 `0.039936 ms`；修正后 median `0.039936 ms`、
  p90 `0.040960 ms`，median 相同，p90 差约 `0.001 ms`。无 disjoint；
  只代表本机隔离 pass，不宣称整帧速度。
- 无新增采样、循环、uniform、draw、texture 或持久资源。临时比较程序和 framebuffer 销毁。
- 变更 Specs 的 ESLint、变更文件的 Prettier、`git diff --check` 通过；AgentDocs
  全量 Markdownlint 通过。全量 AgentDocs Prettier 仍有 453 个未修改文件的既有格式警告，
  不扩大到无关格式调整。
- 6 个变更路径均不在 `.scenegis/upstream-base.json` 的基线树内；全部为 SceneGIS-owned，
  upstream-owned files 为 0，SGP 增量为 0，未追踪生成产物。

## 剩余边界

本修复保留已知边界，不能恢复输入 Float32 的有限端点距离本身已丢失的亚 ULP 精度。
云和雾的独立积分路径未扩大修复。两项既有 fixture 失败保持 deferred，视觉验收不关闭这些问题。
2026-10-16 负责人视觉验收通过，Architecture 确认本次 standalone gate 完成；
代码、Specs、ADR 与验收记录形成 `scenegis/develop` 的独立本地提交，未推送。
