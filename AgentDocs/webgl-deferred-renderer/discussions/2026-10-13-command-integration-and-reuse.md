# Discussion: DrawCommand 接入与 WebGPU 复用边界

## Metadata

- Status: `resolved` for P1；生产管线覆盖与 MSAA 决策留待 P2
- Owner role: `architecture`
- Created / Updated: `2026-10-13`
- Parent: [总体计划](../plans/2026-10-13-webgl-deferred-renderer-extension.md)
- Resulting ADR / Related SGP: [ADR-0155](../../../Documentation/SceneGIS/Decisions/ADR-0155-webgl-gbuffer-prototype.md) / SGP-0045

## Question and source facts

改延迟不等于重写每一个 `new DrawCommand`。原命令持有的几何、VA、uniform、变换、
包围体、LOD 和生命周期可继续复用。真正需要明确的是每类材质在哪里输出表面属性，
哪些命令参与 G-buffer，派生 pass 怎样组合，以及 opaque 完成后何时求光照。

统一的执行/派生入口可以管理调度，但不能从任意最终颜色 Shader 自动推导 albedo、
法线、roughness、metallic、emission 或其后光照覆盖。实际改动量应按内容/材质家族与
特殊 pass 计量，不能按 DrawCommand 创建点数量估算，也不能承诺只改 Scene.js。

| 内容或 pass                             | 初步处理方向                                             | 必须验证的边界                                              |
| --------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| glTF Model / 走 Model 的 3D Tiles       | 复用原生 geometry/material stages，增加表面输出契约      | PBR、unlit、MASK、clearcoat、style、CustomShader、实例/动画 |
| Globe / Planar 地形影像                 | 在影像/地表材质组合后适配                                | 地形光照模型、日志深度、fill/skirt、透明地表、分类          |
| Primitive / Entity 几何、矢量           | 按 Appearance 与材质族适配；Entity 本身不是统一 GPU 材质 | Phong/unlit、Fabric、贴地覆盖、裁剪与拾取                   |
| 半透明、水面、粒子                      | 可保留配套前向合成                                       | OIT、透明深度、折射快照和 opaque 结果的顺序                 |
| Billboard / Label / 天空 / 后处理       | 不要求成为延迟材质                                       | 遮挡、颜色空间、合成顺序和相关拾取                          |
| shadow / depth / pick / metadata / snap | 继续专用命令，审计与延迟主通道的关系                     | 相同 discard、变形、裁剪、深度和 owner                      |

此表是接入类别审计，尚不是所有内容已支持或所有构造位置已枚举的声明。

## Existing WebGL foundation

ADR-0091/0093 的主 MRT 借用原生颜色/深度、记录反射响应和环境分量；SSIL 还需要
两个 RGBA16F 输出。当前按效果叠加的附件预算存在限制，clearcoat 与 SSIL 组合尤其明显。
要转通用材质 G-buffer，必须重新设计消费者契约，而非只改名称。

ADR-0097 的 SSR 已有六级 reduced min-depth、半分辨率追踪和反射历史重建。
新的“共享 HZB”应评估这些资源可否统一，不得预设项目没有分层追踪。
当前 TAA 只有相机运动重投影；延迟管线不会自动获得物体运动矢量。

## WebGPU audit

参照 `feature/webgpu-renderer` 的源码和资格文档。最后阶段 checkpoint 为 `ec5f98014c`
（P4m）；其工作目录另有未提交 P4n 增量。本轮只读，不迁移或修改。
该分支的 `Documentation/SceneGIS/WebGPURenderer.md` 与
`AgentDocs/webgpu-renderer/reviews/2026-10-12-p4n-bistro-qualification.md` 为范围依据，
以下测试结论来自历史记录，本轮没有重跑。

- 真正的 deferred 已存在：`_SceneGISWebGpuDeferredShaders.js` 输出
  albedo/metallic、normal/roughness、emission/unlit、identity；
  `_SceneGISWebGpuDeferredRenderer.js` 先提交 opaque packets，再执行 fullscreen lighting。
- `Model.buildDrawCommands` 通过 SGP-0031 转入 `_SceneGISWebGpuModel.build`，
  而非复用全部原生 WebGL DrawCommand/GLSL。独立 buffer、texture、WGSL 和异步拾取
  不应搬进仍然使用 WebGL 的本分支。
- 已验证范围包括静态 Model/glTF Tiles、Globe/Planar 地形、方向/局部光、方向阴影、
  环境与透明配套前向、SSIL 和实验世界 GI。
- 明确缺口包括通用 Primitive/Entity visualization、动画/蒙皮/morph、完整 glTF 扩展、
  CustomShader/style/clipping/classification，以及现有 WebGL AO/SSR 等效果对等。
  WebGPU 当前只允许单采样，不能把该资格当作 WebGL MSAA 问题已解决。
- P4n 街区 GI 完整视觉 gate 未通过，WGR-P4N-07 open；不能报告整体已完成，
  也不能把局部回归通过或非同条件耗时作为 WebGL 延迟收益证据。

可借鉴：pass 分工、光照分量边界、资源失效/释放测试、Globe/Planar 精度经验。
须重新证明：原生 GLSL 材质覆盖、现有 MSAA、同步拾取、多视锥、分类和特效组合。

## Direction and open work

负责人允许不保留完整前向模式。优先探索统一混合管线；不能据此删除透明、unlit 或
自定义材质能力，亦不要求每个命令都写 G-buffer。

P1 进入前确认：

1. 原生 material 求值后的最小表面数据，以及 style / custom / clearcoat 等语义是否可表达。
2. 附件数量、格式、精度和少光源时的带宽成本；MSAA 边缘不能独立平均材质后声称等价。
3. 初始限定 profile 与显式错误边界；不以静默降级掩盖尚未覆盖的命令。
4. 派生命令、日志深度、相机相对坐标及后光照覆盖的最小接点。

开放项由当前架构任务在 P1 设计中解决；目前不需要负责人再次批准创建分支。

## P1 resolution

[P1](../plans/2026-10-13-p1-gbuffer-prototype.md) 选择私有诊断重放，四组 RGBA16F 直接保存原生
材质值；继续原生 log/HDR 命令选择，不替换 DrawCommand 构造或 loader。普通 opaque
Model 与 MASK 先验证；特殊材质/样式明确拒绝。1×/4× 已验证附件解析，混合边缘只用于诊断，
不作为正式延迟照明契约。数据、成本和残留风险见 [P1 review](../reviews/2026-10-13-p1-gbuffer-qualification.md)。
