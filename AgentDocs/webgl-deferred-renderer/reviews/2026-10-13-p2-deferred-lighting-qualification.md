# Review: P2 不透明延迟光照资格

## Metadata

- Status: `approved`，限定技术资格与负责人视觉 gate 均通过
- Reviewer role: `architecture`，当前任务自审；未启用独立评审 Agent
- Created / Updated: `2026-10-13`
- Review target: P1 checkpoint `0a48afdd65` 后的 P2 实现
- Related plan: [P2](../plans/2026-10-13-p2-deferred-lighting.md)
- Related decision: [ADR-0156](../../../Documentation/SceneGIS/Decisions/ADR-0156-webgl-deferred-lighting-experiment.md)，SGP-0046

## Scope and findings

基础不透明 Model 的材质提交和屏幕光照真正分离；并非对最终颜色重新照明。
复用原生 loader、材质、IBL / BRDF、shadow visibility 和现有消费者，保留透明配套通道。
不新增公共切换 API，不宣称已经替换全部 Cesium DrawCommand 或完成多灯分块。

| ID        | Severity            | Status                 | Owner role    | Finding / evidence                                                                                                                                                              | Follow-up                                                                                      |
| --------- | ------------------- | ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| WDR-P2-01 | high                | fixed                  | execution     | 逐帧反复扫描每个命令的 Shader source 导致整帧约 17.5 → 43.2 ms。按 ShaderProgram identity 缓存 Model 分类和 lighting key 后，同条件 8 帧中位数约 16.0 → 15.3 ms，日夜误差不变。 | 保留真实街区计时，不推导多设备收益                                                             |
| WDR-P2-02 | high                | fixed                  | execution     | 无 AO/SSR/SSIL 的水面原本在 opaque 前重放几何，会与材质接管冲突。改为 opaque 光照完成后复制已绘制颜色、借用线性深度；水面 GPU Spec 证明颜色等价且 captureDraws 为 0。           | 无                                                                                             |
| WDR-P2-03 | high for production | accepted for prototype | architecture  | 首版不保留 MSAA；负责人已选单采样 + 原 TAA / FXAA。大于 1 的配置显式报错且不改设置，GPU Spec 通过。                                                                             | 与 WDR-P1-02 对应，生产 AA 资格仍受此边界限制                                                  |
| WDR-P2-04 | medium              | accepted for prototype | architecture  | 多个 Model / IBL 上下文会增加屏幕组数，半浮点 group 精确容量为 2048。两模型 lightColor / SH / IBL GPU 对照通过；本街区实际一组。                                                | [总体计划后续阶段](../plans/2026-10-13-webgl-deferred-renderer-extension.md)评估规模与数据共享 |
| WDR-P2-05 | gate                | accepted               | project owner | 负责人于 2026-10-13 接受独立街道延迟光照原型，并明确批准形成 P2 提交后继续。                                                                                                    | 形成 P2 独立 checkpoint                                                                        |

## Validation reviewed

- 开发构建、完整 `npm run build-release`、`npm run build-ts`、`npm run tsc` 通过。
  类型生成仍有既有 Cesium JSDoc 警告；不为私有原型改变构建或公共声明。
- Chrome Headless 155 / 真实 WebGL：新 GPU Specs **9/9**；开启 `--webglValidation`
  再验证通过。覆盖 PBR / unlit / no-normal / MASK、两个 Model 的独立 lightColor / SH、
  IBL 变化、局部灯、原几何阴影与不受阴影压暗的自发光、普通 opaque 遮挡、透明合成、
  同步 pick、日志/正交线性深度、resize / disable / empty / destroy、MSAA 错误和独立水面。
- 已有 G-buffer **7/7**、AO **14/14**、SSR **13/13**、SSIL **13/13** 回归通过。
- Edge 155 / ANGLE D3D11 / RTX 3060 Ti，独立 Bistro E2E **1/1**：
  14:00 / 22:00 UTC 同帧原管线/延迟 HDR 对照，保持 AO / SSR 开启；性能与移动保持 TAA。
  日 / 夜全图平均归一化误差约 `0.0000199 / 0.00000136`，最大约 `0.01718 / 0.00945`，
  非有限值为 0；没有 pageerror / renderError。移动及自动曝光截图已查看。
  这些数值与 readiness 只提供定位证据；负责人已独立接受视觉结果。
- 补丁审计通过：本轮 2 个 upstream-owned 文件均登记 SGP-0046，生成物改动为 0。
  改动 JS / HTML 的 ESLint、改动文件 Prettier 和完整 AgentDocs Markdownlint 通过。
  完整 AgentDocs Prettier 仍有 P1 已记录的 415 个既有文件问题；本扩展无格式警告，
  未改无关文件。扩展仓库相对链接及 `git diff --check` 通过。

## Performance and ownership

固定 Bistro、2026-03-20 14:00 UTC、1280×800、同一相机、TAA / AO / SSR 开启，
通过 `EXT_disjoint_timer_query_webgl2` 测量编译完成后的 8 帧，无 disjoint。
原管线中位数约 **16.0 ms**；延迟约 **15.3 ms**。短测有波动，不声明普遍提速。
原先慢版的每帧 source 分类扫描已移除，ShaderProgram 改变自然重新分类；没有减少效果质量。

实际 **627 次材质提交 + 1 次屏幕光照**，SSR captureDraws 为 0，原生 shadow caster
和透明专用通道不计入这 627 次，也未被取消。四个 RGBA16F 与一个 R32F 为 **35.2 MiB**；
借用原生主深度，保留现有响应 MRT。此预算不包括原场景目标、消费者、驱动及可选水颜色
mip 链。大规模多 Model、压缩布局、多灯剔除与消费者进一步共享尚未评估。

上游改动只有以下两个文件，均为 **SGP-0046**：

- `packages/engine/Source/Scene/Scene.js`：预检、材质提交、屏幕光照顺序及生命周期。
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`：原生材质与 lighting-library 变体。

其他实现、GLSL、Specs、E2E、独立页面和文档均属于 SceneGIS。生成物不纳入提交。

## Reproduction and remaining gate

独立入口 `Test/Rendering/延迟光照原型.html?world=globe` 复用原 PBR 组装、Clock、
右侧环境面板和本地 Bistro。左下开关在相同参数下切换当前实验；不自动修改 MSAA。
旧 PBR 与 G-buffer 页面不变。原型范围外的材质层、后光照样式、分类、多视锥等显式拒绝。

GPU: `npm run test -- --includeName SceneGISDeferredLighting --browsers ChromeHeadless --webglValidation --failTaskOnError`。
E2E: `npx playwright test -c Test/Rendering/playwright.deferred.config.mjs`，沿用
`SCENEGIS_TEST_BASE_URL` / `SCENEGIS_TEST_BROWSER_CHANNEL`。输出在 `Build/Specs`，不提交原始图片日志。

限定范围技术资格与负责人视觉 gate 均通过，当前架构任务确认 P2 completed，形成独立本地提交。
后继阶段依据新的源码事实细化；本次验收不扩大未编码材质、多视锥或多设备性能承诺。
