# Phase Plan: P4b 普通面图元与 Entity 材质

## Metadata

- Plan type: phase
- Status: completed
- Parent: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Entry checkpoint: P4a `b6a1f17178`，技术、review、负责人视觉与提交钩子通过
- Owner role: architecture / execution，当前任务
- Architecture review: confirmed，保留现有 API 与原生 Phong 语义
- Created / Updated: 2026-10-13
- ADR / SGP: [ADR-0160](../../../Documentation/SceneGIS/Decisions/ADR-0160-deferred-primitive-materials.md) / SGP-0049

## Reproduced integration correction

实际动态 Entity GPU 测试复现 DynamicGeometryUpdater 的不透明 pass 仍开启 blending：
先创建默认透明 PerInstanceColorAppearance，再仅修改 translucent，底层初始混合状态仍保留。
SGP-0050 让离地分支以不透明 base state 创建，贴地分支保留原始状态，实际实例 alpha 仍决定 translucent；原生
getRenderState 会为半透明重新开启混合。修正这一处初始化，保持透明语义及严格材质校验。

## Source facts and scope

当前延迟 Model 已覆盖 glTF 与网格 Tiles；非 Model 不透明内容仅传递最终颜色和 AO 响应。
GeometryVisualizer 经 StaticGeometryColorBatch / StaticGeometryPerMaterialBatch / DynamicGeometryBatch
生成普通 Primitive；Entity 本身不是一个独立 Shader 家族。原生 PerInstanceColorAppearance、
MaterialAppearance（BASIC / TEXTURED / ALL）和 EllipsoidSurfaceAppearance 共用 czm_phong。
其材质已提供 diffuse、normal、specular、shininess、emission 和 alpha，不需要转换为 PBR。

本阶段将这些原生 lit appearances 的普通不透明面接入材质与屏幕光照分离；保留 Fabric 求值、
批处理、动态 Entity 更新、原生 pick、show 与透明分流。flat、线、点、标注、billboard 仍走既有
兼容合成，不宣称获得表面光照；自定义外层 fragment shader 不按名称猜测材质语义。

GlobeFS 还有 imagery 多 pass alpha 混合、native/physical 光照、天气、雾、海洋和裁剪边缘。
Scene 在 depthTestAgainstTerrain=false 时清除地表深度，贴地面走 TERRAIN_CLASSIFICATION；
现有单视锥材质实验会拒绝这些组合。Globe 与贴地分类作为后继独立阶段，不能通过自动改用户
开关或把地表的已光照颜色当 albedo 来声称接入。本阶段不改变这些已有资格限制。

## Implementation

1. Primitive shader 构造阶段显式标记原生 lit appearance 家族；owned helper 用默认 shader
   和原生组装方法识别，不标记替换过外层 shader 的内容。标记不改变默认前向输出。
2. czm_phong 在天气修改材质之后提供条件 capture hook；原生 shader 继续材质 alpha/discard，
   不重复计算光源。SGP-0049 仅覆盖 Primitive.js 的窄小标记调用和 phong.glsl capture 接点。
3. 复用四附件：diffuse/alpha、normal/shininess、specular/group、emission/shadow。
   材质家族由 group 区分，Phong 不冒充 PBR roughness。共享一个 Phong 屏幕光照组，
   复用 czm_phong、现有光源表、间接 AO 与直接阴影；天气只在材质阶段应用一次。
4. Model 与第五附件语义不变；混合内容与重建共享既有深度和调度，不新增 API 或附件。

## Qualification and exit

- 真实 GPU 对比 native HDR：实例颜色、三种 MaterialSupport 与椭球面外观，法线/高光/
  自发光、动态 uniform、透明/flat 切换、同步 pick、AO、局部灯、阴影和天气。
- Entity 真实 visualizer/batch 更新，显示/隐藏、颜色及动态几何；避免仅测手工 Primitive。
- 混合 PBR/Phong、resize、disable/remove/Scene destroy、四/五附件共存和 shared group 数。
- 独立中文示例与一次浏览器验收，记录同条件 GPU 成本及画面证据。相关 Specs、受影响
  回归、build/release/types、上游审计与自审；负责人视觉通过后独立提交。

## Technical handoff

实现完成，101 项相关 Specs、三项浏览器场景与完整构建/类型/上游审计通过。
审阅结论、实际成本与边界见 [P4b review](../reviews/2026-10-13-p4b-primitive-qualification.md)。
负责人于 2026-10-13 确认图元页面通过并要求继续；技术、review 与视觉 gate 均已通过。
形成 P4b 独立 checkpoint 后，依据源码审计进入 Globe 后继阶段。
