# WebGL Deferred Renderer

## Metadata

| Field                            | Value                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| Extension slug                   | `webgl-deferred-renderer`                                         |
| Status                           | `active`                                                          |
| Planning model                   | `extension`                                                       |
| Active extension plan            | [总体计划](plans/2026-10-13-webgl-deferred-renderer-extension.md) |
| Current phase                    | P4a completed：原生 Model / Tiles 样式，待阶段 checkpoint         |
| Active phase plan                | 无；[P4a](plans/2026-10-13-p4a-model-and-tile-styling.md) 已完成  |
| Architecture / execution contact | 当前任务                                                          |
| Last updated                     | `2026-10-13`                                                      |

## Scope

探索 WebGL2 统一表面数据、不透明延迟光照，以及共享数据支撑的多光源、AO、SSR、SSIL
画质和性能改进。既有效果和街道调校仍属于 `rendering-quality`。
负责人允许不再长期维护完整前向模式；可以采用不透明延迟与透明等配套前向的统一管线。
不预设公开 forward/deferred 切换 API。P1 只交付可观察的材质数据，不接管主光照。

## Engineering links

- Branch: `feature/webgl-deferred-rendering`；基线 `5688deaeeb`；P0 checkpoint `bb9b16eba0`。
- [诊断器](../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISGBuffer.js)、
  [延迟控制器](../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISDeferredLighting.js)、
  [共享 MRT resolve helper](../../packages/engine/Source/SceneGIS/Renderer/_SceneGISResolveMrt.js)。
- [GPU Specs](../../packages/engine/Specs/SceneGIS/Scene/SceneGISGBufferSpec.js)、
  [Bistro E2E](../../Specs/e2e/scenegis-gbuffer.spec.js)、
  [独立 E2E 配置](../../Test/Rendering/playwright.gbuffer.config.mjs)。
- [独立街道原型](../../Test/Rendering/GBuffer原型.html)，复用
  [原 PBR 示例组装](../../Test/Rendering/PBR验收.js)、Clock、资产、环境与右侧面板。
- P2 [延迟街道](../../Test/Rendering/延迟光照原型.html)、
  [GPU Specs](../../packages/engine/Specs/SceneGIS/Scene/SceneGISDeferredLightingSpec.js)、
  [Bistro E2E](../../Specs/e2e/scenegis-deferred-lighting.spec.js)、
  [E2E 配置](../../Test/Rendering/playwright.deferred.config.mjs)。
- [ADR-0155](../../Documentation/SceneGIS/Decisions/ADR-0155-webgl-gbuffer-prototype.md)、
  [SGP-0045](../../.scenegis/upstream-patches.json)。
- [接入与复用讨论](discussions/2026-10-13-command-integration-and-reuse.md)、
  [P0 评审](reviews/2026-10-13-p0-isolation-and-audit.md)、
  [P1 评审](reviews/2026-10-13-p1-gbuffer-qualification.md)。
- [ADR-0156](../../Documentation/SceneGIS/Decisions/ADR-0156-webgl-deferred-lighting-experiment.md) / SGP-0046、
  [P2 评审](reviews/2026-10-13-p2-deferred-lighting-qualification.md)。
- [P3 多光源讨论](discussions/2026-10-13-many-light-scheduling.md)，负责人已选择 A。

## Current handoff

独立工作目录已构建；本地 Bistro 资产只读复用。原 WebGL 验收目录与 WebGPU 未提交工作
均保留。P1 诊断页面仍走现有光照；P2 独立页面开始材质 / 光照分离。范围为单视锥 HDR 3D、
普通 opaque/MASK Model，其他 ordinary opaque 保留颜色与间接响应，透明仍用原专用通道，
未表示的分层材质/样式显式拒绝。

P1 GPU Specs 7 项、既有 AO/SSR/SSIL 回归 40 项及 Bistro E2E 1 项通过。
原生 MASK、普通几何遮挡、同步拾取、日志/正交深度、resize/释放、空场景清理均有证据。
全量 dev/release、类型生成、补丁审计及静态检查结果见 P1 review。

1280×800、RTX 3060 Ti、固定 14:00 视角：单采样额外 627 draws / 39.1 MiB；
整帧 GPU 中位数 17.4 → 21.0 ms。4× MSAA 原型目标约 179.7 MiB，解析边缘存在材质混合。
这是诊断重放成本，不构成延迟性能收益或正式附件布局决定。

负责人于 2026-10-13 接受独立街道原型，批准形成 P1 阶段提交；技术与视觉 gate 均通过。
P1 checkpoint 为 `0a48afdd65`。负责人随后选择 P2 单采样 G-buffer + 现有 TAA / FXAA，
实验入口不自动修改 `msaaSamples`。P2 已依据源码建立独立 plan；保留 Model IBL 上下文、
native 阴影可见度与现有 AO/SSR/SSIL 合成，详见
[本轮决定](discussions/2026-10-13-deferred-lighting-and-aa.md)。

P2 GPU Specs 9 项、既有回归 47 项、独立 Bistro E2E 1 项及完整 build / release / types 已通过。
同条件 1280×800、TAA / AO / SSR 下，627 次材质 + 1 次屏幕光照，材质/线性深度约 35.2 MiB，
整帧计时中位数约 16.0 → 15.3 ms；不作普遍提速声明。负责人于 2026-10-13 接受视觉结果，
批准形成 P2 阶段提交后继续。P2 checkpoint 为 `b1c3a8a494`，提交钩子通过。

P3a 已按负责人选择 A 实现：保留灯光 API，容量扩至 256，延迟与配套接收者共享 tile 列表。
一张 RGBA32UI 保存参数 float bits、headers 与索引；解决真实探针组合的 sampler 超限。
局部 Shader 派生缓存与 caster 资格修复，局部灯不投影的既有语义不变。
34 项相关 GPU Specs 与 1 项多灯街道 E2E 通过，详见
[P3a review](reviews/2026-10-13-p3a-tiled-lighting-qualification.md)。
256 灯 / 3 米屏幕光照约 2.746 → 1.771 ms，整帧约 18.33 → 17.42 ms；
6 米密集重叠退化已明确记录。完整交付检查通过，负责人于 2026-10-13 接受视觉结果，批准阶段提交并继续。
P3a checkpoint 为 `085f47e8f7`，提交钩子通过。
[P3b](plans/2026-10-13-p3b-shared-screen-depth.md) 已依据当前源码激活，同语义共享线性深度。

P3b 已完成同语义深度共享并修复移动后旧深度残留，70 项 GPU Specs 与 1 项街道 E2E 通过。
1280×800 少一个 R32F（约 3.9 MiB），固定 HDR 对 P3a 逐像素一致；不声明普遍整帧提速。
[P3b review](reviews/2026-10-13-p3b-shared-depth-qualification.md) 记录证据，负责人已于 2026-10-13 接受视觉结果，批准独立提交并继续。

P3b checkpoint 为 `84aafea838`，工作区与提交钩子检查通过。
当前 [P4a](plans/2026-10-13-p4a-model-and-tile-styling.md) 聚焦原生 Model/网格 Tiles 样式。
已实测默认 10 要素 b3dm 与 Model.color 被原型拒绝；
[附件预算讨论](discussions/2026-10-13-gis-style-buffer-budget.md) 已确认 A，保留原生语义；P4a 已激活，实施按需第五附件。

P4a 已实现，69 项 GPU Specs 与最终街道/要素 E2E（2 项） 通过。原生样式语义、透明分流和拾取保留。
[ADR-0159](../../Documentation/SceneGIS/Decisions/ADR-0159-deferred-feature-styling.md) / SGP-0048；
[P4a review](reviews/2026-10-13-p4a-native-styling-qualification.md) 记录正确性、资源和成本证据。
[街道模型颜色](../../Test/Rendering/延迟光照原型.html) 与
[原生要素样例](../../Test/Rendering/延迟要素样式.html) 已于 2026-10-13 获负责人视觉验收。
技术、review 和视觉 gate 均通过，批准形成 P4a 独立 checkpoint；提交后继续审计 Globe、Entity 与普通图元。
