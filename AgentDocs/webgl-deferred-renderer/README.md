# WebGL Deferred Renderer

## Metadata

| Field                            | Value                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| Extension slug                   | `webgl-deferred-renderer`                                         |
| Status                           | `active`                                                          |
| Planning model                   | `extension`                                                       |
| Active extension plan            | [总体计划](plans/2026-10-13-webgl-deferred-renderer-extension.md) |
| Current phase                    | P2 completed，技术与视觉 gate 已通过                              |
| Active phase plan                | 暂无；[最近完成 P2](plans/2026-10-13-p2-deferred-lighting.md)     |
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
批准形成 P2 阶段提交后继续。当前架构任务确认 P2 completed，详见 P2 review；P3 尚未激活。
