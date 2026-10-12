# WebGL Deferred Renderer

## Metadata

| Field                 | Value                                                             |
| --------------------- | ----------------------------------------------------------------- |
| Extension slug        | `webgl-deferred-renderer`                                         |
| Status                | `active`                                                          |
| Planning model        | `extension`                                                       |
| Active extension plan | [总体计划](plans/2026-10-13-webgl-deferred-renderer-extension.md) |
| Current phase         | P0 隔离与接入审计完成；P1 尚未激活                                |
| Active phase plan     | None；[P0 记录](plans/2026-10-13-p0-isolation-and-audit.md)       |
| Architecture contact  | Current task                                                      |
| Execution contact     | Current task                                                      |
| Last updated          | `2026-10-13`                                                      |

## Scope

探索 WebGL2 统一表面数据、不透明延迟光照，以及共享数据支撑的多光源、AO、SSR、SSIL
画质和性能改进。它是渲染管线扩展；既有效果和街道调校仍属于 `rendering-quality`。
不因新分支自动宣布产品改为延迟，也不在本阶段修改运行时代码。

负责人明确解除“必须长期保留完整前向模式”的约束。可以评估不透明延迟为主、透明等
内容使用配套前向通道的统一管线；无需预设公开的 forward/deferred 切换 API。
旧版本的回退依靠独立分支与提交，不能据此增加永久双管线维护负担。

## Engineering links

- Branch: `feature/webgl-deferred-rendering`。
- Base: `feature/webgl-rendering-quality` 的 `5688deaeeb`；不是 WebGPU 分支或旧官方主线。
- 复用源码入口：[Scene](../../packages/engine/Source/Scene/Scene.js)、
  [Model](../../packages/engine/Source/Scene/Model/Model.js)、
  [ModelFS](../../packages/engine/Source/Shaders/Model/ModelFS.glsl)、
  [共享 MRT](../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISLightingMrt.js)。
- 测试入口：[SceneGIS Specs](../../packages/engine/Specs/SceneGIS/)、
  [E2E](../../Specs/e2e/)；新测试尚未创建。
- 验收资产：[PBR 综合街道](../../Test/Rendering/PBR综合验收.html)；尚无新演示页面。
- 相关设计：[ADR-0091](../../Documentation/SceneGIS/Decisions/ADR-0091-main-pass-reflection-mrt.md)、
  [ADR-0093](../../Documentation/SceneGIS/Decisions/ADR-0093-main-pass-ambient-occlusion.md)、
  [ADR-0097](../../Documentation/SceneGIS/Decisions/ADR-0097-hierarchical-screen-space-reflections.md)、
  [ADR-0099](../../Documentation/SceneGIS/Decisions/ADR-0099-screen-space-indirect-lighting.md)。
- 本扩展 ADR / SGP：尚无。具体管线决策和上游集成在实现前登记。

## Current handoff

- 已从上述干净提交建立独立 managed worktree 和分支，原 WebGL 验收目录与 WebGPU
  未提交工作均保留。独立目录尚未安装构建依赖或启动新的演示服务。
- [P0 评审](reviews/2026-10-13-p0-isolation-and-audit.md) 只确认分支与源码审计，
  不代表渲染、性能或视觉 gate 通过。
- [接入与复用讨论](discussions/2026-10-13-command-integration-and-reuse.md) 记录
  DrawCommand 分类、WebGPU 完成边界和 P1 必须解决的问题。
- 下一步：P0 独立提交后，依据当前源码细化 P1 的 G-buffer 材质/深度契约和有限 GPU 原型。
  优先复用已有 GLSL 材质和 Renderer，不复制 WebGPU loader / WGSL / 异步拾取体系。
- 重大选择：MSAA 语义、支持设备/场景范围、公共 API 或旧能力削减，先提供证据再询问负责人。
  目前没有需要负责人回答的阻塞问题。
