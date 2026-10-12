# Globe 近距离空气透视精度评审

- Type: review
- Status: accepted; closed; owner visual acceptance passed
- Owner: 当前 Agent，Architecture / implementation self-review
- Date: 2026-10-12
- Target: [standalone plan](../plans/2026-10-12-globe-near-aerial-precision.md)
- Upstream-owned files / SGP delta: none

## 范围与结论

修改三个 SceneGIS-owned GLSL：`SceneGISBrunetonAtmosphere` 保留局部光线数据，
`SceneGISBrunetonCommon` 复用 LUT 坐标映射，`SceneGISBrunetonRuntime` 修正有限光程的几何与插值。
未修改材质、曝光、示例参数、资源所有权、公开 API 或 upstream-owned 文件。

无限天空保持硬件过滤；有限光程沿用同一 LUT、combined Mie、相函数、Sun direction、shadow length 与
HDR 合成。显式插值使用当前纹理尺寸及 clamp-to-edge，未增加资源或新质量档位。
高度、路径长度和角度计算保持 float 精度而不先构造再相减巨大绝对端点。

## Findings

- **P1 / fixed — 近景水平亮线。** 固定曝光且关闭雾、Bloom、Lens Flare、TAA 后仍可复现。
  短光程真实 LUT 测试在原实现失败；精度修复后通过，原街区同视角亮线消失。
- **P2 / addressed — 修改裁剪与插值的兼容风险。** 新增 GPU case 验证零距离、双端地下、穿出地面、
  截止地面、大气外远离/未抵达/穿入以及完整 shadow length；均通过 strict validation。
  既有远距离 opaque、linear/log、Planar 和资源切换检查通过下列对应模式。
- **P2 / existing, deferred — strict background fixture。** Globe far opaque 测试的 strict 模式在
  `renderBackground` 报 `INVALID_OPERATION: drawArrays`，与
  [既有未解决记录](2026-10-02-cloud-taa-registration.md)处于相同背景绘制路径。
  普通模式通过；本项不声称 strict Globe far fixture 通过，不扩大此修复处理历史背景生命周期问题。

## 验证

Chrome Headless 155 / Windows 的最小相关检查：

- `keeps short Globe aerial rays continuous across the horizon`：旧实现失败，新实现 strict 通过。
- `clips finite Globe aerial rays at the atmosphere boundaries`：strict 通过。
- `selects precompiled linear and log-depth aerial variants without resource churn`：strict 通过。
- `renders real opaque planar depth through linear and log aerial variants`：strict 通过。
- `renders every far opaque Globe pixel through linear and log aerial variants`：普通模式通过；strict 限制如上。
- `keeps Globe aerial color continuous across an elevated opaque receiver`：普通模式通过。

首次连续性断言同时要求整个角度范围小于 `3e-5`，暴露原始半浮点 LUT 在偏离地平线位置的微小色彩误差。
最终把已复现的地平线邻域限定在 `mu ±0.004`，保留 `3e-5` 阶跃约束，外围允许 `1e-4`，
同时要求全部角度的红通道为非零且小于 `5e-4`。原实现仍失败，未通过关闭效果或只比较平均值绕过。

街区在原相机、17:33 UTC、TAA/自动曝光/高度雾开启条件下复核；附加相机移动未见亮线。
Browser warning/error 为空。图像保留于忽略的本地 Build/Specs，不作为版本化二进制提交。

## 性能与交付

在 Windows / Chrome 155 / ANGLE D3D11 / RTX 3060 Ti 上，对同一 1219×826、20 m 有限光程输入
交替执行旧/新 Shader 各 30 次；编译后先等待 GPU 完成，再使用 GPU timer query，`disjoint=false`。
中位耗时从 `0.044 ms` 到 `0.138 ms`，增加约 `0.094 ms`；p95 为 `0.467 / 0.627 ms`。
这是隔离空气透视查询的成本，不代表街区整帧或其他设备表现。不新增 pass、texture、uniform 或持久 allocation。

`npm run build`、scoped ESLint、Specs/改动文档 Prettier、`git diff --check` 通过。
全量 AgentDocs Markdownlint 通过；全量 Prettier 保留相同的 398 个历史文件警告，未顺手格式化。
ownership 根据官方基线逐路径核对：全部为 SceneGIS-owned；无 upstream-owned files 或 SGP 增量。
生成 GLSL JavaScript、bundles、诊断脚本及截图均保持忽略，未进入提交范围。

## 剩余风险与交接

FP32 插值不能恢复原始 RGBA16F 数据已经损失的信息。微小散射精度仍受 LUT 分辨率、量化和 float
运算限制；本次不承诺极端曝光下无任何微小色差。透明表面的 resolved depth 限制保持不变。
2026-10-12 负责人确认横线消失，视觉验收通过；Architecture gate 关闭。
代码、Specs、ADR 和协作记录共同形成独立本地提交；未推送。历史 strict background fixture 问题继续保留。
