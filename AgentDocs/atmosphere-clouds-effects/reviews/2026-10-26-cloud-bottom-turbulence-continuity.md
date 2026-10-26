# 云底扰动分层线评审

- Type: review
- Status: completed; owner accepted the layer-seam correction on 2026-10-26
- Author: implementation / architecture self-review; created 2026-10-26
- Target: [standalone plan](../plans/2026-10-26-cloud-bottom-turbulence-continuity.md)
- Policy: [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Product delta: `SceneGISGlobeClouds.glsl` remap denominator only
- Upstream / SGP increment: none; preceding startup / temporal changes preserved.

## Findings

- **CBT-001 / high / fixed / implementation:** 递减 remap 的负分母被正 epsilon 替代，
  bottomWeights 在 heightFraction 0.3 处从 0 跳成 1，导致 turbulence 位移不连续。
  第一层 750 + 650 * 0.3 = 945 m，与负责人约 937 m 相机的近水平切面吻合。
  原始 cloud trace 就有切线，关闭空气透视和高度雾后仍在。修复保留 range 符号；
  原视角切线消失，GPU 材质负控重现旧缺陷。
- **CBT-002 / medium / observed / implementation:** 同视角 trace GPU 中位数增加约
  1.40 ms，详见测量。未改变采样上限或资源，恢复的位移分布会改变实际密度和步进路径。
  此测量不能把增量分别归因于 remap 运算和内容变化；保留为本次质量修复的性能代价。
- **CBT-003 / medium / accepted / project owner:** 负责人以“ok”接受分层线修复，
  并转入中质量颗粒反馈。该修复恢复底部扰动向上衰减，云底轮廓会变化；有限采样噪声
  由 [medium reconstruction](../plans/2026-10-26-medium-cloud-reconstruction.md) 继续处理。

## GPU 与源码证据

新增 `SceneGISCloudMaterialSpec.js` 两项 strict-WebGL Specs 通过（合计 1.004 s）：

- 升序 / 降序 remap 的端点、中点、区间外 clamp。
- 实际共享 density 函数配合非恒定 shape texture 与非零 turbulence，Globe / Planar
  的 visible 和 shadow density 均在 945 m 附近连续，二者输出一致。每 0.5 m 密度变化
  小于 0.001；恢复旧公式时出现约 0.00452 的跳变，超过同一个连续性阈值。

最初对负控跳变幅值的预估 0.005 高于实测，最终负控采用产品连续性断言的同一阈值
0.001；修复后的连续性断言未放宽。所有测试 textures / framebuffers / program 引用释放。
参考本地 `three-geospatial/packages/clouds/src/shaders/clouds.glsl` 的 bottom turbulence
同样使用 `remapClamped(heightFraction, 0.3, 0.0)`；现有来源与许可证不变。

## 实际页面与性能

Windows / Chromium 155 / ANGLE D3D11 / RTX 3060 Ti，1001x826，Globe high、积云、
coverage 0.3、density 1、base 750 m、thickness 4500 m、cloudTime 0，暂停时钟。
原低空相机高度约 936.66 m；原始采样和实际完整合成均复现切线，修复后完整画面消失。
临时隐式纹理 LOD 对照不消除切线，没有纳入产品改动。

同帧 uniforms / depth / STBN 下，旧版旁路与修复版实际 trace 交替 draw 顺序，24 对查询：

| GPU trace | 原版     | 修复版   |
| --------- | -------- | -------- |
| Median    | 6.582 ms | 7.981 ms |
| P90       | 8.844 ms | 8.882 ms |

Timer 无 disjoint，GL error 0。不是整场景 FPS，也不是固定密度场上的纯算术成本。
诊断脚本、测量和截图仅保存在 ignored `Build/`，不进入 AgentDocs；无产品 CPU readback。

## 交付检查

- `npm run build-release` 通过（14 s），scoped ESLint、修改记录 / Spec 的 Prettier、
  全 AgentDocs Markdownlint 和 whitespace 通过。全 AgentDocs Prettier 仍有 594 个
  既有文件告警；未格式化无关文档。
- 实际页面重新加载正式构建，原视角切线消失。相机由约 936.66 m 移到 957.30 m，
  穿过原 945 m 切面后画面仍连续，再恢复原相机、暂停日期、high 和 cloudTime 0。
  最终 ready，GL error 0，控制台无 warning/error。
- 临时 wrappers、program 引用、framebuffers / textures、timer queries 和回调已清理。
  没有新增运行时资源或 API；没有改 SDK、提交或推送。
- 本轮 upstream-owned files 为零。此前未提交的 `Renderer/ShaderProgram.js` / SGP-0069
  启动优化及 high temporal 修复保留，不纳入本项新增修改。

2026-10-26 负责人要求提交当前云优化，本项纳入画质检查点；保留 CBT-002 的性能观察。
