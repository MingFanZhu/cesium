# WebGL Deferred Renderer

## Metadata

| Field                            | Value                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| Extension slug                   | `webgl-deferred-renderer`                                         |
| Status                           | `active`                                                          |
| Planning model                   | `extension`                                                       |
| Active extension plan            | [总体计划](plans/2026-10-13-webgl-deferred-renderer-extension.md) |
| Current phase                    | P4c completed：技术、review 与负责人视觉验收通过，形成独立提交    |
| Active phase plan                | 无；[P4c](plans/2026-10-13-p4c-globe-integration.md) 已完成       |
| Architecture / execution contact | 当前任务                                                          |
| Last updated                     | `2026-10-14`                                                      |

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

2026-10-14 负责人反馈密集分段蓝色贴地面不完整；SGP-0053 已修复自动日志深度错误
discard 分类体的问题。新增覆盖/拾取回归修复前失败、修复后通过；72 项延迟、119 项
原生分类/贴地图元与一项 GPU 深度契约通过，Globe E2E、单段/20 段截图、release/types
及静态/补丁审计通过。负责人确认“缺口已消失，通过并提交 P4c”；WDR-P4C-08
技术与视觉验证完成，P4c gate 通过。本轮形成独立提交后，再进入不透明前向冗余审计。

最新增量：跨段半透明 inverse 已按批准的 12 bytes/pixel 每额外 Tiles 段缓存实现，
71 项延迟 Specs 通过；远近透明层、分类深度/归属、近物体遮挡、拾取和动态释放有 GPU 证据。
独立 [Globe 验收页](../../Test/Rendering/延迟地球验收.html) 的八附件、多视锥、高级环境、
海洋/Fabric、分类/反色、共享屏幕效果组合 E2E 通过。真实 Bistro 单段到三段的 GPU 中位数
13.45→16.93 ms；原生分段导致材质提交 1537→1818，不能当作单纯缓存或光照成本。

高级空气透视/高度雾和 medium 云接收使用统一深度；无 TAA 的多段可见水面按批准预算
增加条件 R32F，原水面 MRT 写入最终深度，折射仍读 opaque。TAA 活跃时复用原目标，
单段/隐藏/关闭效果/resize 的释放已验证。原生 GlobeTranslucencyState 16 项与 TAA 13 项回归通过。
不扩大已有高级替代效果的重复原生视觉适配，未删除公共参数。完整 release/types 已通过；
最终 Globe/要素样式/图元三个浏览器场景和定向静态检查已通过，自审确认技术 gate 完成。
2026-10-14 负责人视觉验收通过，批准独立 P4c 提交；后继阶段须在该提交之后激活。
以下为按增量保留的历史证据；当前状态以本节和 [P4c review](reviews/2026-10-13-p4c-globe-entry-audit.md) 的最新结论为准。

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
技术、review 和视觉 gate 均通过，P4a checkpoint 为 `b6a1f17178`，提交钩子通过。

当前 [P4b](plans/2026-10-13-p4b-primitive-materials.md) 已激活：普通原生 Phong 面图元与对应
Entity 批处理进入延迟光照；Globe、多视锥和贴地分类保持后继独立范围。
决定见 [ADR-0160](../../Documentation/SceneGIS/Decisions/ADR-0160-deferred-primitive-materials.md) / SGP-0049。

P4b 技术验证完成：101 项相关 Specs 与三项浏览器场景通过；SGP-0050 同时修复实测动态
Entity 不透明状态残留 blending。详见 [P4b review](reviews/2026-10-13-p4b-primitive-qualification.md)。
[独立图元页面](../../Test/Rendering/延迟图元验收.html) 于 2026-10-13 获负责人确认通过，
技术、review 与视觉 gate 均通过；形成 P4b 独立 checkpoint 后继续 Globe 接入审计。

P4b checkpoint 为 `5bde0722ba`，提交钩子通过。
[P4c draft](plans/2026-10-13-p4c-globe-integration.md) 与
[入口审计](reviews/2026-10-13-p4c-globe-entry-audit.md) 记录真实 Globe 的深度清除、分类、
影像混合、多视锥、AO/大气和局部灯 sampler 问题。当前
[讨论](discussions/2026-10-13-globe-scheduling-boundary.md) 已解决：负责人选择 A 后进一步明确
不必兼容前向，取消临时 Globe 前向调度方案，转为统一不透明延迟的材质与调度设计。
[ADR-0161](../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md)
记录长期方向；保留现有 API 与场景语义，不要求旧前向绘制顺序和逐像素等价。
首个增量已实现真实 Globe G-buffer、多层影像独立底色合成、原生/物理/局部光照及天气，
新增 [Globe GPU Specs](../../packages/engine/Specs/SceneGIS/Scene/SceneGISDeferredGlobeSpec.js)。
后续默认地表深度清除、TAA/water、原生地表大气/雾、基础 terrain/Tiles 分类和裁剪已接入；
当前 64 项延迟 GPU Specs、12 项天气 Specs 与此前 13 项 TAA 通过。分类按负责人选择 A 按需增加 RGBA16F；
海洋/Fabric 按后续批准的 A 保存独立水掩码/波纹法线及覆盖色，与分类和要素样式共存时
最多七附件；裁剪不增加附件。两项既有夜间/云影大测试在 P4b 原源码
隔离构建上复现相同失败，保留为遗留测试问题。多视锥与整阶段 gate 待完成，
详见入口审计的增量证据。

后续 fill highlight / opaque underground 增量的 20 项 Globe Specs 通过（含新增两项）；
保留原生显示顺序和距离渐变，不新增附件或绘制。跨视锥、inverse classification 与其余
未资格确认分支仍待完成，不能将这些内部增量视为 P4c 整阶段验收。

不透明 inverse classification 已复用同一分类附件与原生 IGNORE_SHOW stencil；保留
feature/Model 着色、拾取及 AO/SSR/SSIL 乘色，不新增材质绘制或纹理。半透明 inverse
已按负责人选择 A 接通按需 Tiles 材质缓存，保留主背景并复用延迟光照及原生透明/OIT。
64 项延迟 Specs 通过，另补强七附件与原生深度拾取比较，缓存上限 60 bytes/pixel，
关闭/resize/卸载会解除原生深度复制目标的借用引用。Bistro 的材质提交保持 1537 次，
屏幕光照 2→3 次；1280×800 无要素样式缓存约 50.78 MiB，GPU 中位数 12.57→13.02 ms，
区间交叠，不外推普遍性能。多视锥仍保留显式限制；按需 RG32F/最多八附件与额外透明层
缓存的具体预算已获负责人选择 A 批准，布局与跨段时序尚待实施验证，见 ADR-0161。

资源审计同时修复原生 PixelFormat.isColorFormat 遗漏已存在的 RG 格式（SGP-0052）；
混合 RG32F/RGBA16F 的真实 GPU Spec 通过。原生 Framebuffer 回归 69 项通过、1 项非法
RGBA/UNSIGNED_INT 夹具失败，已在 P4b 原源码隔离构建复现，不是本轮回归。此修复
不分配新场景纹理，也不批准多视锥额外附件。当前阶段 upstream 文件增至五项，见 review。

原生 Globe 矢量面/线已接入同一覆盖附件，保留光照后语义和原生分类顺序；八个矢量
sampler 与 Fabric 共同计入影像分批。两项新增 GPU Specs 与街道多影像/TAA 检查通过，
最多七附件的已批准边界不变，具体证据见 P4c review。独立 SceneGISVectorTileLayer
仍为后续阶段；原生透明 Globe 已通过后续独立验证，多视锥仍未完成资格确认。

原生透明 Globe 保留其透明面、分类深度 peel 和拾取通道，不透明面进入同一 G-buffer。
新增三项 Specs 覆盖前后面、真正的地下透明相机、分类、AO/TAA，以及实测 sampler 溢出的
修复：透明配套通道在影像分批前计入当前灯表与物理天空纹理，未改变 API 或增加附件。
街道材质附件仍为 39.0625 MiB、两次延迟光照，整帧 GPU 中位数 13.27 → 14.58 ms，
波动区间交叠；代价来自原生透明绘制与资源，不能据此声称总显存不变或普遍性能结论。
独立矢量 direct surface overlay 与透明地球的提前合成组合仍待矢量阶段适配。

负责人已要求作为持续目标推进：先完成 Globe，阶段验收/提交后再清理已接入 Entity、
Primitive、glTF 与 3D Tiles 的不透明前向兼容冗余。清理覆盖调度、Shader、资源与测试，
不把必要的透明/阴影/拾取专用路径误当冗余；重大选择仍先确认。

负责人已将独立矢量切片 `SceneGISVectorTileLayer` 的适配纳入持续目标，见总体计划末尾。
Globe 阶段之后单独验证自有 flat/ground/extrusion/symbol 绘制，不以普通 Primitive 的
资格或原生 experimental `HAS_VECTOR_LAYER` 支持替代。Fabric 的纹理槽预算与一次材质合成
已有 GPU 证据：递归计入子材质贴图、影像按剩余容量分批，普通无水 Fabric 不新增附件或
材质绘制。海洋与 Fabric 的顺序、水掩码排除天气、五/六/七附件组合及释放已有 GPU 证据；
真实街道 1280×800 开启海洋与双纹理 Fabric 增加 15.625 MiB，不增加材质/光照绘制，
整帧 GPU 中位数约 14.90 → 15.40 ms。其余 Globe 分支与整阶段 gate 尚未完成。
