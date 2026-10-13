# Review: P4b 普通面图元与 Entity

## Metadata

- Status: approved，技术与负责人视觉 gate 均通过
- Reviewer role: architecture，当前任务自审；未启用独立评审 Agent
- Target: P4a checkpoint `b6a1f17178` 之后的 P4b
- Parent: [P4b plan](../plans/2026-10-13-p4b-primitive-materials.md)
- Decision: [ADR-0160](../../../Documentation/SceneGIS/Decisions/ADR-0160-deferred-primitive-materials.md)
- Upstream integration: SGP-0049、SGP-0050
- Created / Updated: 2026-10-13

## Findings and disposition

| ID         | Severity | Status   | Owner         | Evidence and follow-up                                                                                                                                                                                                  |
| ---------- | -------- | -------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WDR-P4B-01 | high     | fixed    | execution     | 原生普通面图元原先只传递已光照颜色。明确标记五种 native lit appearance，天气之后捕获 Phong 材质，复用四附件与原生 czm_phong；Shader 身份缓存只分类一次，所有 Phong 共用一个光照组。                                     |
| WDR-P4B-02 | high     | fixed    | execution     | 动态 Entity 将默认透明 appearance 改为不透明后仍开启 blending，实测被 G-buffer 拒绝。SGP-0050 以 opaque base state 初始化，实际 alpha 决定 native getRenderState；静态/动态、颜色及双向透明切换通过。                   |
| WDR-P4B-03 | medium   | fixed    | execution     | Entity 材质切换时 DataSourceDisplay.ready 可先于新批次实际进入 commandList；浏览器对照等待每个 Entity 的新颜色和目标 opaque/translucent 命令实际提交。实际材质 draw 从 10 降到 8 再恢复 10，不增加产品 settling/retry。 |
| WDR-P4B-04 | boundary | accepted | architecture  | Entity 不是统一材质家族；本阶段资格确认普通面几何。线、点、标注保留既有兼容合成，透明仍用 native pass；Globe、贴地分类、多视锥与动态椭球 impostor 尚未接入真正延迟光照。                                                |
| WDR-P4B-05 | gate     | approved | project owner | 负责人于 2026-10-13 确认独立图元页面通过并要求继续；形成独立提交后再进入 Globe 阶段。                                                                                                                                   |

## Qualification evidence

Chrome Headless 155、真实 WebGL / webglValidation：

- DeferredLighting 15、DeferredStyling 7、DeferredPrimitives 9，共 31 项。
- GBuffer 7、LightCollection 15、SurfaceWeather 12、ShadowLighting 7，共 41 项相关回归。
- 原生 DataSources/BoxGeometryUpdater 29 项。总计 **101** 项 Specs 通过。

GPU 覆盖实例颜色与 show/pick、Fabric BASIC/TEXTURED/ALL、EllipsoidSurfaceAppearance、
替换外层 shader 的兼容路径、Phong/PBR 混合、AO/SSR/SSIL 共存、局部光表、直接阴影保留
自发光/间接量、天气只求值一次、Entity 真正静态/动态 batch 与资源移除/销毁。
不以手工 DrawCommand 代替 Entity 端到端接入。

浏览器三项场景通过：Bistro 日/夜/SSIL/染色、要素样式四/五布局与新的图元混合场景。
最终图元测试等待实际新批次，覆盖不透明/透明双向切换、动态尺寸后的原生 Entity pick、
TAA 连续相机移动（不逐帧 reset）、resize 与页面离开释放。材质控制与当前 UI 状态一致。

1280×800 图元场景 native/deferred HDR 相对差均值约 0.000025–0.000064，
最大约 0.003532，无非有限值。Bistro 四种对照的误差与 P4a 记录一致；
要素场景因普通底板改为 Phong 材质编码，误差均值约 0.000038–0.000040，最大 0.001073。
已检查图元静止/移动截图，负责人于 2026-10-13 确认可见质量通过。

## Cost and limits

RTX 3060 Ti / Edge 155 / ANGLE D3D11；1280×800，固定视角，单采样、TAA/AO、局部灯和
几何阴影。最终图元 12 个有效 GPU query 样本，中位数按中间两项平均：

- 原生前向 GPU 3.550 ms，CPU 1.50 ms；延迟 GPU 3.629 ms，CPU 1.90 ms。
- 10 次材质提交，3 次屏幕光照（Model、共享 Phong、点线标注兼容组）；2 个材质光照组。
- 四附件 31.25 MiB，借用共享深度；没有第五附件或新增材质纹理。此少光源场景不声明提速。
- 同轮 Bistro GPU 中位数约 14.787 → 14.661 ms；627 次材质 + 1 次光照，短测差异不作普遍提速依据。

Phong 保留原生环境底色和相机方向漫反射，不改成 PBR；本阶段没有新增 Phong SSR/SSIL 接收。
透明、flat、点线标注与自定义外层 Shader 不据此声称已拆分光照。
Globe 的默认 depthTestAgainstTerrain=false、分类和多视锥仍受现有实验限制，未自动修改用户设置。

## Delivery and handoff

本阶段所有改动过的 upstream-owned files：

- `packages/engine/Source/Scene/Primitive.js`：SGP-0049，native appearance 标记的 import 与调用。
- `packages/engine/Source/Shaders/Builtin/Functions/phong.glsl`：SGP-0049，捕获函数声明与材质阶段 early return。
- `packages/engine/Source/DataSources/DynamicGeometryUpdater.js`：SGP-0050，正确初始化 opaque base state。

dev/release、build-ts、根与消费者 TypeScript 检查通过；保留既有上游 JSDoc 警告。
定向 ESLint、补丁审计通过，当前 delivery upstream-owned 为 3，生成文件状态为 0。
全部 AgentDocs Markdownlint 通过；本阶段改动文件格式通过，全目录 Prettier 保留 416 个
未改历史文件的既有问题，不顺带格式化。SGP-0050 仅调整离地几何初始状态，贴地分支仍保留
原始透明 base state；不扩大本阶段分类范围。
P4b 全部 gate 通过，批准形成独立 checkpoint 后继续；视觉入口为 [延迟图元验收](../../../Test/Rendering/延迟图元验收.html)。
