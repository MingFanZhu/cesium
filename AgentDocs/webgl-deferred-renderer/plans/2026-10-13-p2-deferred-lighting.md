# Phase Plan: P2 不透明延迟光照与混合合成

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Phase: `P2`
- Owner role: `architecture / execution`
- Architecture review: `confirmed`，以下限定实现与验证范围
- Architecture reviewer: Current task
- Created / Updated: `2026-10-13`
- Related discussion: [AA 与光照接入](../discussions/2026-10-13-deferred-lighting-and-aa.md)
- Related review: [P2 技术与视觉资格](../reviews/2026-10-13-p2-deferred-lighting-qualification.md)
- ADR / SGP: [ADR-0156](../../../Documentation/SceneGIS/Decisions/ADR-0156-webgl-deferred-lighting-experiment.md) / SGP-0046；依赖 P1 ADR-0155 / SGP-0045

## Objective and entry conditions

P1 checkpoint `0a48afdd65` 已形成，技术与负责人视觉 gate 通过。负责人确认首版采用
单采样 G-buffer，复用 TAA / FXAA；实验入口对 `msaaSamples > 1` 明确报错，不自动更改设置。
在同一街道场景以一次 opaque 材质提交和后续屏幕光照替代模型原前向光照与 P1 诊断重放。
保留已有直接光、物理天空 IBL、几何阴影、AO/SSR/SSIL、透明、水和 HDR 后处理的语义。

本阶段不是全部 Cesium 内容替换、灯光分块或更高质量 SSR；不新增公共后端选择 API，
不迁入主线，不把算法迁移本身报告为画质或性能收益。

## Source facts

- `Scene.executeCommand` 在 log/HDR 与 pick/depth 分支之后选择颜色命令；原生 Model
  命令的 owner 是 Model，资源可继续借用，不需要重写 loader 或 DrawCommand 构造。
- `LightingStageFS` 先处理天气与几何高光过滤，再执行 PBR 和 IBL。四张 RGBA16F 已可
  保存 diffuse、occlusion、normalEC、roughness、F0、emission；不能从最终颜色反推材质。
- IBL stage 的 SH、cubemap、factor、reference matrix 以及 `Model.lightColor` 可按模型不同。
  屏幕光照须保留 Model 绑定和变体，不能只使用一个 scene-wide 环境设置。
- 原生 shadow receive shader 使用插值几何法线与位置，先求 visibility，再进入材质光照。
  P1 只有扰动后的材质法线，直接拿它替换阴影偏移法线会改变原阴影。
- AO/SSR/SSIL 的共享 MRT 保存求值后的响应。`SceneGISLightingMrt.command` 可包装屏幕
  命令，后续 resolve 仍能执行原有估计与合成；不能让材质缓冲冒充这些响应。
- Bistro 默认 TAA、AO、SSR 和 specular AA 开启。必须在这些设置下对照，不以关闭效果
  换取表面的性能或正确性通过。

## Detailed design

### Submission and material data

增加私有 Scene-bound 实验控制器；未绑定/关闭时不接管原管线。正常 render 在效果预检前
验证 profile，原生 opaque 命令在已有 log/HDR 选择之后转到材质目标。pick、depth、shadow
caster 保留原专用通道；透明和水面仍由原 native / owned 排序与合成负责。

模型保留原材质采样、MASK discard、形变和深度，只跳过颜色光照求值。材质 pass 继续
借用原生 shadow receive，保存当前片元的方向阴影 visibility；屏幕光照只将它乘在直接光。
这保留原几何法线、PCF 和偏移，暂不声称阴影查询也迁到屏幕 pass。

四张 RGBA16F 暂用 diffuse/occlusion、normalEC/roughness、F0/lighting-group、emission/shadow。
正 group 指示 Model 光照上下文，零表示背景；普通 opaque 非 Model 保留现有颜色/间接响应
并使用明确的 passthrough 标记。它们同样写共享深度，避免前景普通图元露出后方模型材质。
分组编码容量先按实际格式检查，超容量显式失败；不把此私有编码变为长期公共协议。

借用原生主深度，不拥有或销毁它；单独复制 R32F eye depth 后再用于屏幕光照，避免同一
depth texture 同时采样和附着。几何只提交一次；清理、resize、空场景与异常恢复必须明确。

### Lighting and composition

复用原生 IBL / Lighting pipeline stage 的设置、GLSL 和 native BRDF，不复制一套 PBR。
按 Model 及实际光照变体缓存屏幕命令；同一模型的材质纹理差异不能导致逐 primitive 全屏
照明。Model 设置变化沿用原 shader/source 失效依据，借用的资源和 uniform 保持原所有权。

在 opaque 完成、原 AO/SSR/SSIL resolve 之前输出线性 HDR 和消费者所需的求值响应。
共享 MRT 的布局、估计器、反射替换及间接合成继续复用。光照的输出不再重复经过材质纹理、
天气覆盖和粗糙度过滤。局部灯仍使用现有 collection 与 PBR 计算；分块/剔除属于 P3。

保留 opaque → AO/SSIL/SSR → water → transparency/OIT → environment → TAA → exposure/
tone mapping 的先后关系。主缓冲背景和透明 alpha 不得被全屏光照覆盖。

### Qualified profile and exclusions

沿用 P1 的单视锥、HDR、SCENE3D、WebGL2、浮点/深度目标与 full viewport 限定，增加已确认
的单采样要求。模型首轮仍为基础 PBR、unlit、无 normal 的原生退化分支及 MASK；未编码的
clearcoat/specular extension/anisotropy、后光照样式、分类、剪裁描边等明确拒绝。
不扩大任意 CustomShader、动画或 3D Tiles 的验收声明，尽管原几何 stages 仍被复用。
Globe/Planar 普通地表只保留原颜色语义，不在本阶段宣称已成为延迟 PBR 地表。

## Affected paths and steps

1. 在 owned `Scene/_private` 与 `Shaders/SceneGIS/Rendering` 增加私有材质提交/屏幕光照。
2. 为 `Scene.js` 的预检、提交、resolve 和销毁，以及 `LightingStageFS.glsl` 的 material-only
   与 lighting-library 变体登记独立 SGP；其他上游文件仅在源码证据证明必要时加入。
3. 复用现有共享 MRT，不改变公开效果 API；更新独立街道入口，保留同条件诊断开关。
4. 执行以下最小充分验证，记录实际偏差、成本与剩余缺口，再请求负责人视觉验收。
5. 技术 review 和视觉 gate 完成后形成独立 P2 checkpoint，再进入 P3。

## Validation and completion criteria

- GPU Specs 对照同帧前向/延迟：PBR、unlit、无 normal、MASK、发光，显式 lightColor/SH/
  IBL factor 不串模型；日光与阴影只改 direct，局部灯保持原材质响应。
- 混合深度：普通 opaque 前后遮挡、透明/OIT、水、同步 pick/pickPosition、日志/正交深度。
- AO/SSR/SSIL 开关与组合保持原间接分量契约；不重复反弹或对最终颜色乘 AO。
- 资源：初始关闭、启停、resize、模型卸载、空场景、Scene 销毁；错误配置不静默修改 AA。
- Bistro 固定相机、UTC、1280×800、相同 AA/效果，验证无额外 opaque 几何重放，记录
  Model 光照组数、GPU 帧耗时及可核算存储；运行既有消费者相关回归。
- 新 Shader 走现有生成器；完成 dev/release、类型、补丁审计和相关静态检查。
- 负责人确认日/夜、轮廓、树叶与移动画面。未通过时不标记阶段完成。

## Risks and deviations

多个独立 Model/IBL 上下文可能增加屏幕 pass；P2 必须报告实际组数，不虚构统一一遍照明。
阶段暂保留响应 MRT，存储不会因延迟自动减少；P3 再根据实际消费者证据优化共享数据。
P1 的 39.1 MiB 是诊断重放预算，不可直接当成 P2 增量。

## Implementation and evidence

- 私有 `_SceneGISDeferredLighting` 已接入原生 Scene；基础 PBR / unlit / MASK 使用原材质
  命令和屏幕 BRDF，方向阴影 visibility 仍在原生材质提交中查询。Model IBL / lightColor
  逐组保留，非 Model opaque 通过明确 passthrough 保存颜色与间接响应。
- 复用共享 LightingMrt 输出，保留原 AO / SSR / SSIL resolve。独立水面无消费者可借用时，
  复制已完成 opaque 的颜色与线性深度，替代原先的额外几何重放。
- 9 项 GPU Specs 通过；P1 7 项及 AO 14 / SSR 13 / SSIL 13 项回归通过。独立 Bistro E2E
  通过，覆盖日夜 HDR 对照、相机移动时的 TAA readiness、自动曝光和资源销毁。
  readiness 检查不替代负责人对闪烁或轮廓的视觉判断。
- 日 / 夜同帧 HDR 误差 `abs(actual-reference)/(1+abs(reference))` 的全图均值分别约
  `0.0000199 / 0.00000136`，无非有限值。主颜色与材质值均不是代理视觉 gate。
- 1280×800、Edge 155 / ANGLE D3D11 / RTX 3060 Ti、14:00 UTC、相同 TAA/AO/SSR：
  627 次材质绘制、1 组 / 1 次屏幕光照，SSR captureDraws 为 0。4 个 RGBA16F 与 R32F
  共 35.2 MiB，不包含原场景和现有消费者资源；本例无水，不含可选水颜色 mip 链。
- 首次整帧计时约 17.5 → 43.2 ms，定位到每帧逐命令重复扫描 Shader source。
  按原生 ShaderProgram identity 缓存分类与光照 key 后，同条件重测 8 帧中位数
  约 16.0 → 15.3 ms。命令、材质和效果质量未削减；本机短测不能推导多设备提速。
- 生成物只由既有构建生成；上游改动限定 Scene.js / LightingStageFS.glsl，SGP-0046。

完整 build / release / types、相关静态检查与补丁审计已通过，限定技术资格见 P2 review。
负责人于 2026-10-13 接受视觉结果，批准形成 P2 阶段提交后继续；技术和视觉 gate 均通过。
当前架构任务确认 P2 completed，本次提交仅包含 P2；P3 尚未激活。
