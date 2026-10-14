# Review: P4d 入口审计

## Metadata

- Status: completed；技术、自审、负责人视觉与提交钩子预检通过，批准独立本地提交
- Reviewer role: architecture，当前任务自审
- Target: P4c checkpoint `fbde52dcd5`
- Parent: [P4d](../plans/2026-10-14-p4d-opaque-pipeline-consolidation.md)
- Created / Updated: 2026-10-14
- ADR / SGP: ADR-0161、ADR-0155 / SGP-0045、SGP-0046

## Findings

| ID         | Severity | Status | Owner                  | Evidence / next step                                                                                       |
| ---------- | -------- | ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| WDR-P4D-01 | high     | fixed  | architecture           | A、HDR、默认单采样和自动绑定已落实；参考开关已删除，技术与最终视觉 gate 全部通过。                         |
| WDR-P4D-02 | high     | fixed  | execution              | 主要材质家族、原生专用通道、默认环境与自定义主光已完成技术及负责人视觉验收。                               |
| WDR-P4D-03 | high     | fixed  | architecture-execution | 旧 opaque 重放、接收派生、失效 AO / SSR 宏及 native Globe 延迟大气已移除；消费者审计和定向回归见末节。     |
| WDR-P4D-04 | medium   | fixed  | execution              | 诊断器改为只读主材质，独立重放和采集开关已移除；GPU、街道与交付验证通过，见下文。                          |
| WDR-P4D-05 | high     | fixed  | execution              | Planar 旧 opacity 遮挡后方对象；按负责人决定转透明/OIT，像素、拾取与浏览器通过，负责人已确认画面符合预期。 |
| WDR-P4D-06 | high     | fixed  | execution              | 原生 unlit 地表接收阴影在延迟迁移时漏用可见度；七项相关旧回归复现后修复，见末节。                          |
| WDR-P4D-07 | high     | fixed  | architecture-execution | 标注 alpha 拆分与水面输入隔离已通过 12 项定向 GPU、E2E 和负责人视觉，见最新增量。                          |
| WDR-P4D-08 | high     | fixed  | architecture-execution | 自定义主光推荐方案获批并实现；GPU 生命周期 / 像素、云 / 阴影 E2E 及负责人视觉均通过。                      |

## Evidence and limits

WDR-P4D-08 原因为默认高级环境与自定义 scene.light 的所有权冲突。负责人已接受 [主光讨论](../discussions/2026-10-14-custom-primary-light.md) 推荐方案；两世界现在保留调用方 DirectionalLight，同时统一地表 / 模型 / 云 / 阴影的主光记录。决定、技术与负责人视觉均已通过。

当前状态以末尾最新增量节为准；以下各节保留对应增量时的
验证范围，旧“Scene 尚未自动绑定”等描述不代表当前源码。P4d 整体 gate 已于 2026-10-14 关闭。

Scene 的延迟截获先于旧效果接收链；已适配材质的 capture 宏跳过光照。未发现 P4c
同时再绘制完整前向主颜色，不能承诺删开关便省一遍场景。旧资源和派生成本待按消费者核对。
本审计不构成统一入口或整阶段完成 gate。

## Diagnostic replay removal

WDR-P4D-04 处置为 fixed / execution，architecture 技术复核通过。主 renderer/MRT
改用独立 DeferredLayout 校验；GBuffer 只读主纹理，Scene 删除两个 draw/capture hook，
保留销毁 hook，SGP-0045 已更新。独立 capture GLSL 删除后，官方 glslToJavaScript
生成器清理了旧 JS；未手工编辑生成文件。覆盖字段使用 group != 0，保留负编号的
Phong、Globe 和 color-through 表面，不能以 shadow visibility 或 group > 0 判断占用。

6 项诊断 GPU Specs 通过；延迟回归 71 项直接通过，旧诊断限制的一项测试经契约更新，
所属 7 项样式回归全通过。新增测试实际记录 Model 的 Context.draw 调用，避免把后处理
绘制误计为模型几何。原生 PostProcessStage 初始化后替换 uniforms 描述符，断言读取
真实 uniformMap，不为测试修改产品绑定。

街道 E2E 通过：1280×800、Edge / D3D11 / RTX 3060 Ti，关闭诊断、主画面、法线视图
均 627 次主材质提交，32,768,000 bytes 的同一组材质目标。诊断显示使用既有后处理目标，
不声称整个显示阶段零 GPU 开销。每组 8 次整帧 GPU 时间分别为 14.09–28.77、
11.51–20.38、13.03–18.29 ms，重叠且受时序影响，不推导提速倍率。
四附件数据有限值检查、主画面/法线/自发光/深度截图、相机与 Clock、销毁通过，
无页面或 WebGL 错误。最后的负组 coverage 修正由定向 GPU 用例验证，不重复街道全套。

上游改动仅 Scene/Scene.js：删除诊断重放调度（SGP-0045）及合并其间断开的
SGP-0046 标记；生命周期仍以 SGP-0045 登记。补丁审计通过，current delivery 为 1，
782 marker tokens，generated status 0。尚未达到整个 P4d 的视觉或提交 gate。

development build、完整 release、build-ts 与 tsc 均通过；类型生成保留既有上游 JSDoc
警告。定向 ESLint、Prettier、Markdownlint 与 diff whitespace 检查通过。上述增量暂未
提交，继续属于当前 P4d；不以诊断器清理替代整个单一不透明管线目标。

## Remaining family evidence

WDR-P4D-02 仍 open。当前确认 PlanarSurfaceFS 与独立 EllipsoidFS 有几何阶段光照，
PolylineFS 只有 diffuse + emission 的制图颜色。DynamicEllipsoidGeometryUpdater
创建普通 Primitive/MaterialAppearance，不等同于独立 EllipsoidPrimitive；
后续按实际路径验证动态 alpha 和材质资格，不能因名称相似混作一类。
WDR-P4D-01 的场景范围选择已提交负责人，等待期间未修改 Scene 默认设置。

## Capture flag consolidation

P1 重放移除后，Model 的独立诊断 capture define 没有其他调用方，主材质派生原先总是
同时设置它与 DEFERRED_CAPTURE。已删除前者，以后者同时驱动记录、BRDF 跳过和样式
记录；不再保留“记录材质但仍执行前向光照”的旧诊断组合。未改材质字段、目标容量、
透明/阴影/拾取的命令选择。原生 LightingStageFS.glsl 的两处既有 SGP-0045 hunk
使用统一标记，其余代码未重排。17 项 DeferredLighting 与 7 项 DeferredStyling 真实
GPU Specs 通过，覆盖 MASK、Model 独立光照/IBL、阴影、自发光、样式、透明与拾取。

本增量 development/release 和补丁审计通过；类型没有新增变化，沿用上一增量完整
build-ts/tsc 证据。现阶段实际修改的 upstream-owned files 共两项：
Scene/Scene.js（SGP-0045、SGP-0046）和 Shaders/Model/LightingStageFS.glsl（SGP-0045）。
current delivery 为 2，782 marker tokens，generated status 0。均未提交，主入口范围待确认。

进一步资源审计确认 ShaderBuilder 经 ShaderCache 构造的 ShaderProgram 初始
`_program` 为 undefined；首次 bind 或属性查询才调用 initialize 链接 GL program。
因此不能把 JS ShaderCache 条目数量当作已编译 GPU 前向程序数量。后续收敛原生命令
时须区分源模板、实际链接程序及透明/拾取/阴影消费者；当前没有据此臆测显存收益。

## Approved A scope and LDR display increment

负责人已确认 A：当前只推进 WebGL2 / SCENE3D 延迟路径，目标默认单采样，其他原生
场景模式明确不支持；不扩大到 WebGPU。WDR-P4D-01 的范围问题 resolved，但实现
finding 仍 open：自动 Scene 绑定、默认采样切换及仅供完整前向使用的分支仍待清理。

本轮实现 HDR 关闭的颜色契约（ADR-0161 / SGP-0046）。`highDynamicRange` 表示显示
选择，内部 `_hdr` 仍为延迟材质、天空、透明和主颜色目标提供线性浮点路径。关闭 HDR
时复用原生 tone-mapping 槽位裁剪 RGB 并应用 gamma，跳过曝光/tone curve；开启恢复
原 tone mapper。显式 HDR-only 效果的公开校验保留。显示切换请求帧，但不重新派生
整场材质，也不改变 G-buffer、光照组或透明资源所有权。

验证结果：

- 75 项 Deferred GPU Specs 全部通过，含新增 LDR 透明合成、亮部裁剪/拾取/销毁、
  请求帧、Globe 地表大气与多视锥资源复用。其余原生材质、样式、分类/反色、水面、
  局部光与共享屏幕效果回归均通过。
- 66 项 GBuffer、ColorGrading、AutoExposure 与原生 PostProcessStageCollection
  回归通过。显示比较读取 tone-mapping 的真实输入，涵盖 OIT 之后的组合颜色。
- Edge 155 / Windows、1280×800 的 Globe LDR E2E 通过，无页面或 WebGL 错误；
  HDR 往返切换仍使用同一 renderer/材质纹理，截图已检查。该流式页面关闭高级环境
  后会重新选取 terrain，不能用前后连续帧 draw count 相等作为管线性能 gate；固定
  GPU fixture 已验证相同提交数、材质字节数和光照程序 identity。
- development、完整 release、build-ts、tsc 通过；类型生成保留既有上游 JSDoc 警告。
  ESLint、格式/Markdown 和上游补丁审计通过，无生成文件进入 delivery。

当前 P4d 相对 entry 的 upstream-owned files 共三项：Scene.js（SGP-0045/0046）、
LightingStageFS.glsl（SGP-0045），以及本轮新增的 PostProcessStageCollection.js
（SGP-0046；沿用 SGP-0044 的颜色调整/曝光 variant 协调接点）。全部保持未提交。
WDR-P4D-02/03 与阶段视觉/提交 gate 均未关闭；PlanarSurface、独立 EllipsoidPrimitive、
自动入口和前向冗余审计继续由同一 P4d plan 承接，不宣称已完成整阶段。

## Automatic entry / native families

2026-10-14 后续增量：Scene 构造时持有唯一私有 renderer，默认 msaaSamples=1；
main render 在资源准备前检查 WebGL2/浮点附件、3D、无 WebVR、单采样等前提。
空场景同样拒绝不支持的模式；Scene/CesiumWidget/Viewer JSDoc 同步默认值。
开发页面借用实例，Scene 销毁负责释放。7 项 Entry GPU Specs 覆盖默认配置、
无显式 HDR/renderer 组装、拒绝 2D/CV/morph/WebVR/WebGL1/MSAA 与销毁。

独立 EllipsoidPrimitive 使用真射线交点的 Phong 材质及显式 gl_FragDepth；
sun-only Phong 分成 -4 组，普通 Phong 为 -2。屏幕阶段归一化半浮点重建法线。
真实用例发现原生显式 log depth 未扣当前视锥 near，以及 sun-only 透明 OIT 的
字符串替换丢失 czm_private_phong 所在 builtin；以 SGP-0049 最小修正共享接点。
两项 GPU Specs 覆盖线性/log depth、多视锥、材质/颜色、Sun-only、动态透明、
拾取和资源移除，不把 Entity 动态椭球误认成同一原生路径。

负责人明确 Planar 保留受光，只迁移几何阶段光照。Planar 使用 -5 组复用四张材质
附件，记录影像/Fabric 后的原色、opacity、光照/几何法线、Lambert/模式参数及
阴影可见度；基础/物理光照、天气、局部灯和背景合成统一在屏幕阶段。保留 unlit
开关与裁剪边缘的颜色覆盖，光照 Shader 借用原生 Planar 环境 uniformMap。
新增四项 GPU Specs 覆盖平滑地形、真实 Sun/sky、Lambert、天气/灯后置、shadow
仅影响直接光、AO/SSR/SSIL 共用附件、影像/Fabric、LDR opacity、深度与销毁。
SSR 是同开时 MRT 的所有者；测试读取其 indirect 附件，不能以帧末已复位的
mainActive 标记断言绘制发生。Planar background、sky 与 water 内部输入采用线性
存储标记，防止公共 HDR=false 时错误降为字节纹理或更改内部编码。

107 项 Deferred/GBuffer/PlanarClipping GPU 用例中 106 项一次通过；剩余新增用例
修正对共享附件所有者/帧末临时状态的断言后定向复验通过。未放宽颜色容差或添加
产品测试分支。首次 Karma 启动被本机其他程序占用 9876 阻断，之后仅改用 9879 与
127.0.0.1，保留同一 Specs 构建、ChromeHeadless/Edge 和 webglValidation。

新增 Test/Rendering/延迟平面验收.html 与定向 E2E。1280×800 / Edge / D3D11：
地形、box、独立 ellipsoid 共 3 次材质、2 次屏幕光照，4 个材质附件和 32,768,000
bytes（31.25 MiB）。基础/物理、光源方向、HDR/LDR、opacity/裁剪切换保持这些计数；
天气、相机移动与幂等销毁通过，无页面/WebGL 错误。已检查基础、物理与 LDR 裁剪
三张截图；阴影和裁剪边缘可见。本轮成本证据是提交数与附件容量，未测 GPU 时序，
不声称普遍提速。页面与截图供负责人视觉判断，尚未收到该增量视觉确认。

development、release、build-ts、tsc 与上游补丁审计通过。类型生成仍有已有上游
JSDoc 警告。审计：current delivery upstream-owned=8、828 marker tokens、generated
status=0。本阶段相对 P4c 的上游文件如下；Planar 实现及新 Shader 均在自有路径。

| Upstream-owned file                                         | SGP                            |
| ----------------------------------------------------------- | ------------------------------ |
| packages/engine/Source/Scene/Scene.js                       | 0045 / 0046                    |
| packages/engine/Source/Scene/PostProcessStageCollection.js  | 0046（协调既有 0044）          |
| packages/engine/Source/Shaders/Model/LightingStageFS.glsl   | 0045                           |
| packages/engine/Source/Widget/CesiumWidget.js               | 0046（拆分既有 0001 注释边界） |
| packages/widgets/Source/Viewer/Viewer.js                    | 0046（拆分既有 0002 注释边界） |
| packages/engine/Source/Shaders/Builtin/Functions/phong.glsl | 0049                           |
| packages/engine/Source/Shaders/EllipsoidFS.glsl             | 0049                           |
| packages/engine/Source/Scene/OIT.js                         | 0049                           |

架构/代码复核：上述增量的材质职责、早返回、借用所有权与测试风险对应关系通过。
WDR-P4D-01/02/03 及整阶段 gate 仍 open：保留中的私有 enabled 参考开关、旧页面
比较控件和仅为完整前向兼容存在的效果分支还未删除；Model/Tile 既有未资格扩展及
独立矢量仍须按实际消费者继续推进。不得将自动入口或 Planar 完成称为 P4d 完成。
所有改动未提交，无生成文件进入交付；后续阶段须等完整 P4d gate 与本地提交。

## Planar true transparency

负责人未接受旧 opacity 画面，随后明确要求透过地表看到后方物体，并接受半透明
使用 OIT 专用受光、不透明继续延迟。ADR-0073 / ADR-0161 / Architecture 已同步；
[讨论](../discussions/2026-10-14-planar-transparency.md) 记录新的契约。

同一 tile command 按 opacity 选择 GLOBE 或 TRANSLUCENT。半透明只测试深度，
不写不透明深度，输出真实 alpha；零 opacity discard。旧背景 helper、复制、
sampler 和延迟背景混色已删除。显式地形查询和正常帧发布机制保持；普通 ID pick
跳过无 ID 的透明地表，避免覆盖后方对象，pickTranslucentDepth 仍可重放非零地表。
天气接收只为该 Planar 透明族扩大资格，普通透明内容资格不变。

GPU 复现了 ID pick 被地表颜色覆盖的问题，修复后线性/log、多视锥、前后遮挡、
opacity 往返与显式透明深度拾取通过。阴影回归发现 unlit 地表遗漏 shadow visibility，
已在屏幕阶段恢复原生通用阴影含义，并区分 lit/unlit 裁剪边缘；不让该修复重新引入
不透明几何光照。原阴影 fixture 采用 gamma=1 检查线性衰减，显示转换另有 GPU Specs。

73 项 Planar/Surface/Clipping/Shadows Specs 中 71 项一次通过；两项失败分别是测试
误用不存在的 LightCollection.enabled 和旧 vertex Shader 字符串断言，修正后两项
定向复验通过。再增加两侧透明层 OIT 像素 oracle，并扩展两个前后遮挡用例验证
pickTranslucentDepth，三项通过；当前共 74 项相关用例具备通过证据。真实平滑地形
物理光照、透明天气/局部灯/阴影、地形多层与多视锥、资源复用/resize/destroy 均覆盖。

1280×800 / Edge 浏览器 E2E 通过。验收页新增完全埋入地表的黄色横梁，基础/LDR
与物理/HDR 半透明截图均已检查，横梁及椭球被埋部分可见；opacity=1 恢复遮挡。
不透明时 4 次材质 / 2 次延迟光照；半透明时 3 次不透明材质 / 1 次延迟光照，地表
进入原生透明提交。主材质四附件仍 31.25 MiB；原生 OIT 原已分配并复用，删除的
RGBA16F 背景快照为 8,192,000 bytes（7.8125 MiB）及一次每帧复制。未测 GPU 时序，
不作普遍提速声明。全部截图无 WebGL/page error，幂等销毁通过。

本增量全部修改在 SceneGIS-owned 路径，未新增上游修改或 SGP；整个 P4d 上游清单
仍为上一节八项。development、release、build-ts、tsc、ESLint、Prettier、Markdownlint、
diff whitespace 与补丁审计通过；generated status=0。OIT 保持加权近似，关闭 OIT
时是原生排序透明；透明地表不作为 AO/SSR/SSIL 的不透明接收层。

负责人于 2026-10-14 确认新画面符合预期，Planar 修正的视觉 gate 通过，并要求继续
P4d。本项不构成整阶段提交许可或完成声明；WDR-P4D-01/02/03 继续处理。

## Consolidation and existing-feature qualification in progress

2026-10-14 负责人要求保留既有扩展材质、裁剪、轮廓与点云样式，P4d 保持未提交。
资源预算与容量溢出提交方案已获批，见
[讨论](../discussions/2026-10-14-extended-material-budget.md)。

私有前向开关、AO / SSR / water 几何重放与旧接收派生已移除；共享 LightingMrt.command
仍服务屏幕光照。移除效果自有 raw depth-stencil，单一活跃共享 owner 在 1280×800
少一张 D24S8（3.90625 MiB），不是把三种可互斥 owner 的节省相加。
旧 MSAA 分支原本在单采样配置不会分配，不能算作本配置新增节省。

- 入口/Globe/分类/材质/样式等 97 项初始回归为 94 通过；三个 Globe 测试迁移后分别通过。
- 共享效果首轮 60 项为 50 通过；失败含旧 prepass/MSAA/HDR 断言和待补能力。
  之后 19 项定向回归中 18 通过，唯一借用深度对象断言修正后单项通过。
- 裁剪边缘、silhouette 和光照/clearcoat SSR 等 24 项组合 GPU Specs 已通过。
  裁剪/不透明 silhouette 使用已有 unlit group，不新增附件；半透明 silhouette
  保留原生透明通道。inverse 的 unlit group 也已加入，独立定向用例通过。
- 原生 specular / clearcoat / anisotropy 纹理和 BRDF 的 GPU 原生命令对照已通过。
  自定义全部字段、MASK、容量切换和释放定向验证已通过；完整组合还在验证。
- clearcoat SSR + SSIL（以及 AO）按容量拆屏幕输出的用例已通过，无几何重放。
- 三个迁移后的 E2E（Bistro、Primitive/Entity、3D Tiles 要素样式）通过，截图已检查。
  Bistro：627 material、1 light、31.25 MiB，SSR capture 0；GPU 八次 13.69–60.04 ms，
  存在高样本，不给出普遍提速结论。图元：10 material、3 light、31.25 MiB，
  12 次样本 GPU 中位约 10.80 ms；样式：2 material / 2 light、39.0625 MiB，
  12 次 GPU 7.38–8.80 ms。此证据先于扩展材质增量，不冒充新能力的浏览器验收。

当前新增 upstream-owned 接缝：ModelClippingPlanesStageFS.glsl、ModelSilhouetteStageFS.glsl
和 PrimitiveOutlineStageFS.glsl（均 SGP-0045）。这些是原生后光照颜色/coverage 的
显式记录 hook；未复制整套原生 BRDF。新增扩展字段 helper 与控制器均 SceneGIS-owned。
尚待：inverse/分类/多视锥扩展组合、primitive outline 完整验证、点云样式、最终静态/
release 检查、成本/浏览器及负责人视觉 gate。WDR-P4D-01/02/03 和整体 gate 仍 open。

## Extended material and point-cloud qualification

10 项定向 GPU Specs 通过：原生 specular / clearcoat / anisotropy 的纹理与 BRDF、
全字段 CustomShader + MASK、合并/溢出布局与释放、primitive outline coverage、
inverse 独立字段与 classified 合并、clearcoat SSR/AO/SSIL 输出拆分，以及点云
颜色/show/pointSize/透明/拾取、PBR/AO gamma 顺序和共享效果/resize。
原生命令只在 Specs 的独立测试目标中作为 oracle，不恢复产品前向开关。

点精灵中心坐标缺失曾导致原生颜色误差约 0.022；按原生 positionEC 契约保存点中心屏幕偏移 x/y
后，原生 HDR 对照通过 0.006 绝对误差门槛。AO oracle 使用实际 Model uniforms，
覆盖 mix 与固定色通道；不得把点样式 gamma 提前到材质输入。点坐标占两个字段，
最大扩展并集仍为 16 scalar / 四张 RGBA16F；无受光点则不分配这些字段。

新增上游路径仍是上述三个 native 颜色 stage，LightingStageFS 的既有 SGP-0045
hook 同时传入 positionEC。完整 P4d upstream-owned 清单当前为 11 项：
Scene.js、PostProcessStageCollection.js、LightingStageFS.glsl、CesiumWidget.js、
Viewer.js（SGP-0046；Scene / LightingStage 另含 SGP-0045，PostProcess 与 SGP-0044 协调）；
phong.glsl、EllipsoidFS.glsl、OIT.js（SGP-0049）；ModelClippingPlanesStageFS.glsl、
ModelSilhouetteStageFS.glsl、PrimitiveOutlineStageFS.glsl（SGP-0045）。

当前仍未提交。多视锥扩展回归、最终交付/补丁检查、浏览器/成本与负责人视觉待完成。
旧节中的未完成点云/outline 描述由本节覆盖；整体 gate 继续 open。

## Additional native annotation boundary — open

扩展浏览器页的文字标签复现 LabelCollection.showBackground 的既有独立边界：
LabelCollection 强制 glyph/background 为 BlendOption.TRANSLUCENT，而 BillboardCollection
在该模式把 alpha blend + depthMask 的命令放在 Pass.OPAQUE；当前材质资格拒绝它。
普通 opaque/MASK 标签不能代表此混色写深度路径已支持。WDR-P4D-07（high / open /
architecture-execution）跟踪该专用标注合成语义，须保留原生覆盖/拾取/遮挡而非把
混色写入 G-buffer。新材质验收页暂用无背景标签以隔离材质画面，不作为此能力通过证据。
Bentley planar fill / edge visibility 与 voxel 等资格边界也需在最终矩阵中明确，不能
将完成本次五类既有材质功能等同于整套 API 全部替换完成。

## Current combined evidence

166 项延迟/GBuffer/AO/SSR/SSIL/水面 GPU Specs 首轮 165 通过，唯一失败是旧
Model style alpha=1 断言；该槽现保存 outline coverage，Globe Fabric alpha 不变。
修正后所属用例及点云、扩展多视锥共五项定向复验通过。之后 mixed Primitive +
outline 浏览器复现共享字段写入未声明 Model 变量，改为按 HAS_PRIMITIVE_OUTLINE
写入 coverage，混合 GPU 回归通过。新增远距离点中心偏移的四项点云回归全部通过；
该表示仍占两个 half-float scalar，不新增附件。当前相关用例共 167 项有通过证据。

扩展材质浏览器 E2E 通过，包括合并/溢出、分类、裁剪移动、点云颜色/半透明/隐藏/
尺寸、HDR 开关、效果开关、拾取、resize 与离页释放。1280×800、Edge / D3D11：
合并为 9 material / 0 extra / 16 screen light / 1 point correction，主材质 62.5 MiB；
分类后为 9 / 6 / 16 / 1，主材质 70.3125 MiB。增加的 7.8125 MiB 是分类附件，
扩展存储仍为四张 RGBA16F。SSR geometry capture 始终 0。GPU 八次样本合并
1.94–25.74 ms、分类后 6.48–9.48 ms；含初始化/短测波动及分类本身工作，不把差值
解释为纯附加材质成本或普遍提速。截图已检查；点字段表示后续调整由新增 Specs 验证。

图元/Entity E2E 在去掉遗留 checkbox 事件绑定后再次通过，12 个 GPU 样本中位
9.97 ms。此前静态文案删除同时需要移除该绑定，不能按纯文本改动跳过页面启动检查。
release、build-ts/tsc、上游补丁审计通过（11 个本阶段 upstream-owned 路径，generated
status 0）；最终新增 Shader/页面后的静态与 release 收尾仍待结束。
WDR-P4D-07 标注边界继续 open，P4d 保持未提交。

## Owner visual acceptance and delivery checks

2026-10-14 负责人确认扩展材质、裁剪/轮廓与点云验收画面符合预期，要求继续 P4d
剩余项。本增量视觉 gate 通过；WDR-P4D-07 与最终兼容矩阵仍 open，不提交 P4d。
最终扩展浏览器在点中心像素偏移和完整可见视角下通过，提交数/显存与上一轮相同；
八次 GPU 范围合并 15.10–28.64 ms、分类溢出 9.13–11.39 ms，仍不解释为性能收益。

最新 release 通过；57 个修改的 JS/HTML 文件 ESLint、diff whitespace、owned AgentDocs
Prettier、全 AgentDocs Markdownlint 通过。要求运行的全 AgentDocs Prettier 检查提示
九个未修改的旧 Planar 文档表格格式问题；已撤销本轮工具对这些无关文件的纯格式改动，
不把无关文档格式清理混入 P4d。build-ts / tsc 和上游审计通过，当前没有生成文件改动。

## Native annotation implementation and evidence

负责人已批准条件 R32F / RG32F 标注深度。WDR-P4D-07 实现与技术回归已完成，
状态为 implemented / owner visual pending；阶段仍 active，未提交。带背景 Label
与混色写深度 Billboard 按原生命令在 per-frustum 专用颜色尾部绘制；材质采集排除
此家族，原生拾取不改。原物理深度与标注合成深度分离；多段更近表面优先，Globe
清深度、禁用深度测试距离、TAA、水面折射/最终深度与共享 AO 组合均有 GPU 证据。

为了保留设备前提，避免 alpha blend 与 R32F MRT 对 EXT_float_blend 的新依赖，
改为每个有标注提交的段增加一次无混色全屏深度复制；同一次复制同步发布 TAA /
water final-depth。无新增几何重放；水面只刷新其已有颜色目标。详见已更新 ADR-0161。

新增五项标注 Specs 及一项 Globe 标注 Specs。标注/Globe/TAA/water 66 项首轮
65 通过；余下一项旧 TAA 测试显式使用 4× MSAA，与已确认的 A 范围冲突。将其
“不会改写 AA”断言限定于支持的单采样（不改变产品），定向复验通过。完整六项新增
用例也有通过证据，包含真正前后透明遮挡、近面 override、resize 与按需释放。

独立 Test/Rendering/延迟标注验收.html 与 E2E 通过：背景开关、不透明度 0/0.5/1、
透明蓝板与水面前后位置、多段、TAA/AO、原生文字拾取与销毁。字体背景原生不可拾取，
E2E 在文字 glyph 笔画取样。990×800 canvas，单段 2 次标注原提交 + 1 次深度复制；
标注纹理 3,168,000 bytes（约 3.02 MiB），多段 6,336,000 bytes（约 6.04 MiB）。
开启前的材质深度仍有一次初始化复制；报价不隐去该屏幕操作。GPU 六次为
0.37–2.92 ms，仅是该小场景整帧范围，不是标注单项耗时或性能收益声明。截图已检查。

本增量 upstream-owned 只有 Scene.js 的 SGP-0046 调度接缝；累计 P4d 仍为前述
11 个上游路径。release、build-ts / tsc、ESLint、diff whitespace、Markdownlint 与上游补丁审计通过；
本扩展 Prettier 通过，全 AgentDocs 仍仅有既存九项无关格式提示。下一步：负责人
本增量视觉，继续 Bentley planar fill / edge visibility 与 voxel 兼容矩阵，不提交 P4d。

## Remaining specialized channel audit

- Bentley planar fill：MaterialPipelineStage 请求原生 feature-ID pre-pass，ModelFS
  在光照之后只修改 gl_FragDepth，backgroundFill 在材质前置阶段转成 unlit 背景色。
  当前 HAS_PLANAR_FILL_DEPTH 在 DeferredLayout / LightingMrt 都被排除。下一步
  用已有 PlanarFill glTF 的 same-feature / different-feature 重叠面资格验证，保留
  原 ID pre-pass 和 proportional depth；非 LOG_DEPTH 的 gl_FragDepth 初始化还需
  以 GPU 用例核对，不能只删除拒绝条件。该名称与 SceneGIS Planar 地表无关。
- 原生 edge visibility：Scene 已保留 edge metadata pre-pass 及 EDGES_ONLY direct
  pass；Model 的 edgeDetectionStage 在材质后替换颜色。需要记录这个最终制图色
  到现有 unlit group，保留原生命令及像素覆盖，再解除 HAS_EDGE_VISIBILITY 拒绝。
- Voxel：已有 premultiplied-alpha、无硬件深度写入的体积 ray-march 专用 pass。
  当前校验显式拒绝；Scene 调用位于延迟 material / light 之前，简单移除拒绝会让
  后续光照覆盖其颜色。下一步核对并验证体积与 Tiles / ordinary opaque 的合成
  及 native scene-depth 采样，不将其伪装成物理表面或泛化 opaque passthrough。
- Gaussian splats 的专用调用仍位于材料/光照之后；本轮只确认调度保留，未冒充
  已完成其真实资产视觉回归。最终兼容矩阵继续 open。

## Annotation visual rejection and revised direction

2026-10-14 负责人指出半透明 Label 背景使蓝色透明板和水面出现矩形缺口，
本增量视觉验收不通过。WDR-P4D-07 重新标记 high / open，责任为 architecture-execution。
此前 GPU / E2E 仅证明原生混色写深度的实现一致，不能作为目标视觉正确的证据；
其中“背景阻挡后方透明物”的断言需要按这次反馈修正。

根因已定位：标注虽已独立于 G-buffer，却在水面与透明合成之前混色并写入硬件深度，
后续透明板和水面被整个背景矩形拒绝。新增标注深度纹理不会修复颜色合成顺序。
修正设计采用独立无光照标注通道，半透明背景不作为不透明遮挡面；世界空间标记
仍需协调其他透明层的前后关系，不能简单改成最后无条件覆盖的 HUD。字体覆盖率、
alpha=1、原生拾取、Globe 清深度、多视锥以及 TAA / water 的契约须分别核对。
已批准按需深度预算是上限，不构成保留旧分配和复制的理由。

Bentley 资格试验暂缓：新 NativeModelStagesSpec 的重叠面测试仍失败，
ModelFS 的非对数深度初始化假设未证明是根因；临时调试输出及相关源修改均未通过 gate。
优先完成标注修正、像素回归和负责人重新验收，再继续该项。P4d 保持未提交。

## Accepted annotation correction and native planar-fill qualification

2026-10-14 负责人批准实心 / 透明拆分及标注不参与水面折射，并在更新页面视觉确认
通过。WDR-P4D-07 为 fixed / owner visual accepted；以下记录取代上面的视觉拒绝
与待确认状态。P4d 阶段仍 active，剩余 native edge / voxel / Gaussian 资格未关闭。

- owned 标注准备在 culling / derived commands 前执行；沿用 native alpha cutoff，
  实心颜色独立 MRT 写深度，半透明背景 / 字体边缘共用原 OIT 或排序透明且不写深度。
  原生拾取不变；普通无背景 Label 的实心命令也走同一独立标注 pass。
- 移除每段全屏深度发布及标注到水面输入的颜色复制 / mipmap 刷新。物理材质深度、
  折射深度和最终 TAA 深度不混用；无新增纹理或 EXT_float_blend 设备前提。
- 12 项真实 GPU Specs 通过：8 项标注、1 项 Globe 标注、3 项 Bentley planar fill。
  新像素回归覆盖半透明背景透出蓝板 / 水面、前方水面对实心与半透明标注的完整遮挡，
  原生排序透明也通过。排序测试首轮误读 OIT 专属目标，定位后改取 native 实际目标；
  产品无需额外分支。resize / release、log multi-frustum、pick、TAA / AO 均有证据。
- 独立标注 E2E 通过；背景 0/0.5/1、前后蓝板 / 水面、多视锥、TAA/AO、拾取与销毁
  均无 GL / browser error。已检查两张截图，前方水面不再出现零散文字实心亮点。
- 990×800 canvas 为 3 次物理材质、2 次实心标注 + 2 次透明标注、1 次初始化深度复制。
  标注目标单段 3,168,000 bytes，多段 6,336,000 bytes；无标注时释放。GPU 六次
  0.34–7.78 ms，短测波动明显，只记录整帧范围，不声明提速或标注单项耗时。

Bentley planar fill 的先前失败已定位：夹具相机朝向背面，修正后复现非 LOG_DEPTH
下 gl_FragDepth 未初始化导致偏移错误。SGP-0045 在 ModelFS.main 入口仅为
HAS_PLANAR_FILL_DEPTH / 非 LOG_DEPTH 初始化 gl_FragDepth=gl_FragCoord.z，同时覆盖
原生 feature-ID pre-pass 与普通颜色；材质采集记录最终偏移深度。两种深度模式下
同 feature behind / 异 feature overlap、多视锥、pick 与 backgroundFill + AO 三项
GPU 用例通过，无额外附件；原生边线和浏览器资格仍继续，不视为所有 Bentley 已完成。

本轮新增上游修改为 Scene.js / SGP-0046 的命令准备接缝，以及 ModelFS.glsl /
SGP-0045 的深度初始化。P4d 累计 upstream-owned 清单为以下 12 项：

| Path (packages/ prefix)                                     | SGP         |
| ----------------------------------------------------------- | ----------- |
| engine/Source/Scene/Scene.js                                | 0045 / 0046 |
| engine/Source/Scene/PostProcessStageCollection.js           | 0046 / 0044 |
| engine/Source/Widget/CesiumWidget.js                        | 0046        |
| widgets/Source/Viewer/Viewer.js                             | 0046        |
| engine/Source/Shaders/Model/LightingStageFS.glsl            | 0045 / 0046 |
| engine/Source/Shaders/Builtin/Functions/phong.glsl          | 0049        |
| engine/Source/Shaders/EllipsoidFS.glsl                      | 0049        |
| engine/Source/Scene/OIT.js                                  | 0049        |
| engine/Source/Shaders/Model/ModelClippingPlanesStageFS.glsl | 0045        |
| engine/Source/Shaders/Model/ModelSilhouetteStageFS.glsl     | 0045        |
| engine/Source/Shaders/Model/PrimitiveOutlineStageFS.glsl    | 0045        |
| engine/Source/Shaders/Model/ModelFS.glsl                    | 0045        |

## Native edge and voxel follow-up

Native edge visibility 接入已有 unlit overlay，并使用 CESIUM_REDIRECTED_COLOR_OUTPUT 避免原 edge MRT 与材质附件冲突。真实像素回归进一步复现正交投影漏线；EdgeDetectionStageFS 改用当前投影还原 packed raster depth。10 项 GPU / 原生边线回归通过，包括三种显示模式、AO、拾取、log multi-frustum 与近物遮挡。新增 upstream-owned EdgeDetectionStageFS.glsl，SGP-0045。

Voxel render 专用提交已移到 material / light 之后；颜色派生通过 IntersectDepth 的窄 hook 读取统一物理线性深度，原生 picking 不改。17 项定向 / 原生回归通过，包括体积前 / 内 / 后普通几何、depthTest、log multi-frustum、pick 与销毁。新增 upstream-owned Shaders/Voxels/IntersectDepth.glsl，SGP-0046；累计 P4d upstream-owned 共 14 个。

水面组合另有新像素失败：后方水面会覆盖前方体积。当前不能关闭 Voxel 资格。该失败已按下节获批方案修正；复现及预算记录见 [讨论](../discussions/2026-10-14-voxel-water-depth.md)。标注视觉 gate 已通过，不重复请求。

## Approved voxel/water composition and native-channel qualification

2026-10-14 负责人接受体素按专用透明内容合成及按需 R32F 预算。render 的原生 voxel
提交位于水面与 TAA depth capture 之后，沿原视线采样最终不透明 / 标注 / 水面线性
深度；native picking 不变。体素在水前可见、水后被遮挡、不进入物理水下折射输入。
沿用 depthTest=false 的不截断语义，不把体积加入 G-buffer 或新增几何重放。

TAA 活跃时借用其最终深度，否则使用现有 water final-depth。仅可见水面与 voxel
同时存在且没有可复用目标时，按需激活同一个 R32F（4 bytes/pixel；1280×800 为
3.90625 MiB）及每帧一次初始化复制；原水面提交同步输出深度。开关 / 隐藏 / resize
与 TAA 转借均释放旧所有权，不新增独立 voxel FBO 或颜色快照。

- 44 项联合 GPU 回归全部通过，覆盖 annotations、native model stages、voxel、TAA、
  water 及 final-depth 消费；原生边线合计 10 项、原生 Voxel 基础合计 17 项另有通过
  证据。水面新增像素用例验证前 / 内 / 后体积及按需深度生命周期。
- 原生 GaussianSplatPrimitive 九项回归通过，包含真实资产与颜色；尚未替代最终
  混合场景资格，不声明已完成全部 Gaussian 视觉组合。
- 新增独立原生通道页面及 E2E 通过：Bentley 填充、三种 edge 模式、透视 / 正交、
  多视锥、普通遮挡面、体素 depthTest、前 / 中 / 后水面、AO / TAA 及体积隐藏。
  截图已检查，未裁掉验收对象，无 browser / WebGL error。
- 990×800，单段为 5 material / 3 screen-light、1 native edge pre-pass / 1 voxel。
  EDGES_ONLY 改为 1 direct edge，三段 voxel 仍为 1 次。水面无 TAA 时按需深度
  3,168,000 bytes；隐藏 voxel 或切换 TAA 后为 0。该记录为提交 / 资源成本证据，
  未测独立体素 GPU 耗时，不推导整帧提速。

本增量 architecture 自审确认专用 pass 不进入物理材质、借用深度不转移所有权，
ShaderCache 管理原 shader 的派生生命周期。新增上游路径为
engine/Source/Shaders/Model/EdgeDetectionStageFS.glsl（SGP-0045）与
engine/Source/Shaders/Voxels/IntersectDepth.glsl（SGP-0046），均带 packages/ 前缀；
加上上一节表格 12 项，累计 P4d 为 14 项。Scene.js 继续复用 SGP-0046 调度接缝。
原生填充 / 边线 / 体素增量负责人视觉待完成；P4d 最终矩阵仍 open，保持未提交。

本增量完整 release、build-ts / tsc、定向 ESLint、全 AgentDocs Markdownlint、diff whitespace 与补丁审计通过；current delivery upstream-owned 为 14，generated status 为 0。全 AgentDocs Prettier 仍仅提示九个既存无关 Planar 文档，本扩展文档通过。已向负责人提供原生通道页面，等待本增量视觉反馈，同时继续最终混合场景回查。

## Native-channel visual rejection: TAA planar-fill occlusion

负责人在原生通道页指出开启 TAA 后填充面的遮挡关系异常，并提供截图。本增量视觉 gate 未通过；此前静态交互 E2E 不能替代连续抖动与前后深度像素正确性。优先复现并核对 feature-ID pre-pass、材质采集和 TAA 投影一致性。Gaussian 混合资格暂缓（新用例仍在调试）；P4d 保持未提交。

## TAA coplanar fill correction — implemented, visual pending

已在相同页面复现：八个亚像素采样中部分原始 material 输出由紫变红，最大影响约
3,971 pixels，早于 TAA history resolve。逐提交读取 depth 显示同平面不同三角形
误差约 5e-7 且随 jitter 换号，属于共面 raster depth fighting；feature-ID 投影一致。
仅从 gl_FragCoord.w 重算 log depth 不能修复，试验已撤销，不保留无效分支。

修正只作用于延迟 planar-fill 主材质：读取原 feature-ID pre-pass 已有 depth-stencil，
有有效 feature 且深度差不超过 raster subpixel grid / depth24 量化误差时，统一到
该参考深度，再应用原 PLANAR_DEPTH_PULL 和 same-feature BEHIND_DEPTH_PUSH。
误差边界由实际 SUBPIXEL_BITS 和当前深度导数计算；不使用固定场景距离或随意大
bias，不关闭 TAA，不改相机世界坐标，不新增几何或纹理。此类 capture 增加一个
已有 depth sampler；预通道、拾取和原生非材质专用路径不采样该 attachment。

18 项 native model-stage / TAA GPU 用例通过。新增回归在修复前明确失败，修复后
遍历全部八采样，并验证真实前 / 后分离 0.02、log / 非 log、正交和多视锥；原同
feature behind 规则保留。原生通道 E2E 增加全部八采样的原始材质和最终显示像素
断言并通过，连续截图中紫面覆盖完整。完整 release 与定向 ESLint 通过；此前
类型检查通过，本次未修改 JS 公共类型或接口。ModelFS 仍为原 SGP-0045 路径，
累计 P4d upstream-owned 仍 14。负责人需重新检查此修正，尚不关闭视觉 gate。

## Gaussian mixed-scene result

新增真实 sh_unit_cube GPU 场景通过：专用 splat 颜色在普通不透明物前可见、后被遮挡，
log multi-frustum 保留该关系，水前可见、水后遮挡，show=false 去掉颜色，无 GL error。
沿用原 pass 和 native premultiplied alpha，未修改 Gaussian 源码、纹理或提交调度。
此前测试夹具把刚创建时 isStable 当作内容加载完成，已改为先等真实 tilesLoaded；
另外该资产中心可能为黑色，改用全部像素的非红颜色检测，在前方红面下应完全消失。
这些是实际加载和可见性断言，不加入产品 retry / settling 分支。

Gaussian primitive 的资源仍由其原 destroy 释放。定向用例显式销毁该 primitive 后
移除 tileset；原生 tileset.remove 不会自动调用它的 destroy，是本阶段未修改源码
中已有的生命周期边界，不把手动清理断言写成自动所有权已修复。后续审计须记录该
问题的归属，不能将九项原生回归概括为所有生命周期场景已通过。

TAA 修正后的补丁审计、Markdownlint 与 diff whitespace 通过；未扩大上游路径。
已提供 revision=taa-planar-fill-depth 页面，负责人本增量视觉反馈待完成。

## Voxel overlap picking correction

负责人确认左侧 TAA 填充修正正确；右侧点击可见体积与后方红面的重叠区域却返回红面。本次不能关闭整体原生通道视觉 gate。浏览器同坐标复现前 / 内 / 后关系，并以隐藏红面恢复体积 ID 排除页面文案和 TAA；拾取代码先执行不写硬件深度的体积，再执行普通不透明命令，后者覆盖体积 ID。

修正复用 Scene.js / SGP-0046：普通不透明拾取之后，仅对有 voxel 命令的拾取视锥复制当前硬件深度到已有 packed depth，再执行原 voxel pick。保留非零 alpha 命中、depthTest=false 与 pickVoxel 元数据路径。每个受影响 pick 视锥增加一次受原拾取 scissor 限制的深度复制；无新增纹理、颜色帧绘制或几何重放。不使用上一颜色帧的 TAA 深度。Architecture 自审确认改动限于拾取调度，颜色次序和原 Shader 所有权不变。

新增断言修复前失败，修复后 ordinary surface 前 / 内 / 后、depthTest=false、log multi-frustum、pickVoxel 元数据、水面前 / 内 / 后与 TAA 组合通过。20 项 voxel / native model-stage / TAA GPU 回归通过；原生通道 E2E 实际点击验证体积在前选体积、红面在前选红面、水面在前选水面，通过。当前增量 upstream-owned 仅 Scene.js（SGP-0046）；累计 P4d 清单仍为上述 14 项。负责人对拾取修正的页面确认待完成；最终矩阵及阶段提交仍 open。

本修正另通过原生 pickVoxel 的 8 项回归；定向 ESLint 通过。左侧 TAA 视觉已通过，仅右侧拾取修正待负责人确认。

## Owner acceptance and scope correction

负责人已在 revision=voxel-pick-depth 页确认拾取符合预期，允许继续 P4d；该增量视觉 gate 通过。原生通道页此前的左侧 TAA 修正也已确认，不重复申请。本次补丁审计、Markdownlint 与 whitespace 通过。

随后负责人纠正兼容范围：不补回 native Fog / atmosphere / legacy lighting，高级渲染已有对应能力。刚才对 Model HAS_ATMOSPHERE 的调查未修改产品或新增测试；将其从“待补齐能力”改为“需确认被高级路径取代的旧入口”。后续按 phase plan 的 advanced environment authority 增量核对门禁。P4d 保持 active、未提交。

## Default advanced environment — technical verification complete

已按负责人批准实现只读 scene.environmentEffects、Scene 自有轻量默认与显式实例接管。
默认大气 / 空气透视 / 高度雾开启；云、云影、光束、bloom、lens flare 关闭。关闭默认
环境不会恢复原生视觉效果。Fog 仍保留瓦片剔除；原生材质 / 阴影 / 拾取基础继续共享。
自动实例使用 surfaceRadianceScale=1，避免默认 LDR 地表过曝；手动构造器默认值不变。
Planar 高级环境活跃时，原轻量天空准备提前返回，避免重复绘制；调用方设置保留。

冷启动只请求三个大气 LUT，没有云纹理 / shader / shadow atlas。首次开启云加载五项
云资产，沿用同一组 LUT；关闭云保留已热启动资源直到环境断开 / 销毁。World 更换前
释放 Scene 默认资源；显式实例（含 disabled）优先，移除后恢复默认原有状态。新增
六项 DefaultEnvironment GPU Specs 的通过证据覆盖真实分配、接管、销毁、World 更换、
失败锁存与 requestRender、默认 Planar 光源接管，以及云关闭时的地表雾 / 空气透视。
旧 native gate 用例已迁移；候选资源创建失败清理、延迟启云等定向回归通过。

浏览器发现 Planar 大气 / 雾开关同时开启时，地表像素仍等于全部关闭；深度与 uniform
检查正常，原分散的复合条件在本机 Edge 155 / ANGLE D3D11 路径产生异常结果。
将同一非背景深度判断提到外层、效果开关保留在内层后，真实浏览器回归由失败转为
通过；不改变物理公式、深度或资源预算。该证据定位到等价 Shader 分支结构，不据此
声称已经证明驱动内部原因。Globe / Planar 两项 E2E 均通过，包含实际 receiver 像素、
HDR 往返、环境关闭 / 恢复、无云请求以及无 WebGL / page error；最终截图已自检。

1280×800 固定页面：大气 LUT 8,527,872 bytes，空气透视合成目标 8,192,000 bytes，
星点 buffer 98,336 bytes；默认 cloud / shadow atlas / bloom 分配均为零。该 Primitive
夹具未请求 Model sky-reflection cubemap，不把它的零分配外推到所有模型。环境开关
前后材质提交分别保持 Globe 87 / Planar 13；没有新增几何重放。上述为实际资源与提交
成本，不包含 driver / shader 内存，也没有新增 GPU 时序结论。

development、完整 release、build-ts、tsc 与定向 ESLint 通过；类型生成仍保留上游
JSDoc 警告。Architecture 自审确认资源所有权、云冷启动、旧环境门禁和错误锁存符合
已批准契约。新增默认画面仍须负责人视觉确认；P4d 整体 gate 和独立提交保持 open。

本增量修改的 upstream-owned files 为 Scene.js、Globe.js（SGP-0046）。Scene.js
此前还包含 SGP-0045 调度调整；Globe.js 为本阶段新增上游路径。累计 P4d 清单如下，
最新补丁审计通过，876 marker tokens，generated status 0；不包含其他工作区或生成文件。

| Upstream-owned file                                                  | SGP                       |
| -------------------------------------------------------------------- | ------------------------- |
| packages/engine/Source/Scene/Scene.js                                | 0045 / 0046               |
| packages/engine/Source/Scene/Globe.js                                | 0046                      |
| packages/engine/Source/Scene/PostProcessStageCollection.js           | 0046 / 0044               |
| packages/engine/Source/Widget/CesiumWidget.js                        | 0046                      |
| packages/widgets/Source/Viewer/Viewer.js                             | 0046                      |
| packages/engine/Source/Shaders/Model/LightingStageFS.glsl            | 0014 / 0016 / 0045 / 0046 |
| packages/engine/Source/Shaders/Builtin/Functions/phong.glsl          | 0014 / 0049               |
| packages/engine/Source/Shaders/EllipsoidFS.glsl                      | 0049                      |
| packages/engine/Source/Scene/OIT.js                                  | 0049                      |
| packages/engine/Source/Shaders/Model/ModelClippingPlanesStageFS.glsl | 0045                      |
| packages/engine/Source/Shaders/Model/ModelSilhouetteStageFS.glsl     | 0045                      |
| packages/engine/Source/Shaders/Model/PrimitiveOutlineStageFS.glsl    | 0045                      |
| packages/engine/Source/Shaders/Model/ModelFS.glsl                    | 0045                      |
| packages/engine/Source/Shaders/Model/EdgeDetectionStageFS.glsl       | 0045                      |
| packages/engine/Source/Shaders/Voxels/IntersectDepth.glsl            | 0046                      |
| packages/engine/Source/Scene/Cesium3DTileset.js                      | 0054                      |
| packages/engine/Source/Shaders/Model/ImageBasedLightingStageFS.glsl  | 0016                      |
| packages/engine/Source/Shaders/GlobeFS.glsl                          | 0014                      |

## Current adaptation matrix and remaining work

此表替代上文各历史增量的待办描述；“已接入”指已验证能力，不等同于任意自定义命令
或全部可能的组合均通过。P4d 已通过技术与负责人视觉 gate，本次形成独立 checkpoint；P4c checkpoint 为 fbde52dcd5。

| 内容入口                | 当前证据 / 行为                                                                                                                           | 仍未完成                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity / Primitive      | P4b 面图元、Phong / Fabric、批处理与动态 alpha；P4d 独立 Ellipsoid、制图线色已验证                                                        | 阶段 gate 通过；任意自定义 framebuffer / 不写深度的 opaque DrawCommand 不在普通材质资格内                                                      |
| glTF Model              | PBR / MASK、CustomShader 材质字段、clearcoat / anisotropy / specular、裁剪、silhouette / outline、Bentley fill / edge 已验证              | 当前没有另列未接入的上述材质家族；最终矩阵与阶段 gate 已通过，不声称任意 Shader 绕过材质协议也受支持                                           |
| 3D Tiles                | Model 内容、要素样式 / 分类 / inverse、多视锥、点云样式，以及 Gaussian 混合遮挡已有证据；tileset 移除的共享 Gaussian 资源释放已修复并验证 | 当前没有另列未接入的上述内容家族；阶段 gate 已通过                                                                                             |
| Globe                   | P4c 已提交地形 / 影像、Fabric / 海洋、分类 / 裁剪、原生矢量覆盖、多视锥与透明专用通道；默认环境已验收                                     | 独立矢量 direct overlay 与透明 Globe 组合仍明确拒绝；自定义主光已获负责人视觉确认                                                              |
| Planar                  | 不透明地表延迟受光、透明地表 OIT、影像 / Fabric / 阴影 / 天气；默认大气 / 雾与开云修正已验收                                              | 自定义主光已获负责人视觉确认                                                                                                                   |
| 标注 / Voxel            | 标注实心独立 unlit pass + 半透明 OIT；体素专用合成、水面遮挡 / 拾取 / TAA 修正已验收                                                      | 不要求转成 G-buffer 表面；没有本轮新增未接入项                                                                                                 |
| SceneGISVectorTileLayer | 独立于普通 Primitive 和原生 HAS_VECTOR_LAYER                                                                                              | flat、Globe / Planar ground、fill-extrusion、circle / symbol，及 alpha / 层序 / 遮挡 / pick 尚未完成独立资格与必要适配；P4d 提交后进入后继阶段 |

共同剩余边界：WebGL1、2D、Columbus View、WebVR 和多采样不在获准 A 范围；部分
原生 debug overrides、非零 viewport origin 仍明确拒绝。透明、阴影、拾取、标注和
体积的必要专用通道有意保留，不构成第二套完整不透明前向管线。自定义 scene.light
已按获批方案接入统一主光，保留对象 / 方向 / 颜色 / 强度，SunLight 恢复自动太阳 /
月亮；天空继续按星历，物理地表仍应用既有大气透射和 BRDF，不保证旧前向逐像素等价。
WDR-P4D-01 至 08 均已关闭；独立矢量切片范围继续由后继 phase 跟踪。

文档检查：本扩展修改文件格式化通过，全 AgentDocs Markdownlint 通过；全目录 Prettier 仍只报告九个既存无关 Planar 文档，未改写这些文件。该格式遗留不作为本轮运行时验证通过的替代，不影响已通过的 P4d 阶段 gate。

## Default environment visual rejection: cloud-enabled sky

负责人反馈开启体积云后天空变黑，本增量视觉 gate 未通过。已在 Planar 默认页面复现：云层正常提交、天空为黑，无 WebGL error。冷资源分配测试没有覆盖天空像素，不能作为开云画面正确的证据。当前修复核对天空 clear-depth 的视线重建，新增实际开云背景像素回归；修复和重新验收完成前不得关闭默认环境增量或 P4d。

已确认根因：延迟线性深度以零表示天空；Planar aerial 在开启云后不再跳过天空，
却使用这个零重建表面 eye=(0,0,0)，随后 normalize 产生无效视线并把背景输出为黑。
Globe 已有独立天空视线，不受此缺陷影响。修正为 Planar clear-depth 从已有 frustum
生成视线，实际地表保持原精度重建；不修改 depth sentinel，也不增加纹理 / 绘制。

新增真实 GPU Spec 在修复前的普通 / log depth 两种模式均以天空 blue=0 失败；修复后
通过，另一个无云地表大气 / 雾回归也通过。扩展后的两项 Globe / Planar 浏览器 E2E
通过，实际首次启云、五项按需请求、LDR / HDR 天空像素和开关恢复均有断言；两张
Planar 开云截图已自检，天空恢复正常。完整 release、定向 ESLint / Prettier 通过；
本修正仅改 owned GLSL 与 Specs，无公共类型变化，沿用本增量已通过的 build-ts / tsc。
当前新增回归后共七项默认环境 GPU Specs 有通过证据。无新增 upstream-owned 路径，
该开云修正未增加当时十五项上游清单；后续所有权 / Shader 清理使最新累计清单增至上表十八项。本增量负责人重新视觉确认待完成，P4d 仍未提交。

## Gaussian ownership repair and final consumer audit

真实 mixed-scene GPU 用例先取消手动清理，在未修复版本复现 tileset 移除后 primitive、Gaussian texture、SH texture 和 vertex array 均未释放、owner 引用仍残留。SGP-0054 在 Cesium3DTileset.destroy 调用既有 primitive.destroy 并清空引用；单 tile unload 不动共享资源，已显式销毁也不重复调用。修复后两项 owned 与九项 native Gaussian Specs 全部通过。新增资源 / 绘制均为零；异步快照继续由原 _pendingSnapshot 身份校验阻止销毁后的 GPU 发布。

当前生产者审计：SCENEGIS_AMBIENT_OCCLUSION / SCENEGIS_SSR_RECEIVE 已无 define 发出点；SCENEGIS_SSR_CAPTURE 原来始终与 SSR_MAIN 一起发出。移除这三项冗余与失效 AO 接收代码，保留屏幕光照实际使用的 AO_MAIN / SSR_MAIN 材质记录及原生 BRDF。按已批准高级环境权威删除 owned Globe 的 native 大气重算 helper、捕获标志和旧 daylight 屏幕分支；保留共享 Cesium 原生实现。glslToJavaScript 自动清理删除 helper 的生成 JS，没有手工修改生成文件。

Scene.executeCommand 的 deferred.draw 成功后提前返回，主不透明没有再次进入旧 receiver 颜色链。GBuffer 只读现有材质目标。WaterFrame 只借用 deferred / 屏幕效果已发布的颜色和深度，不重放几何；保留的 Shadow / HDR / log、透明及专用对象派生仍有真实消费者。因此 WDR-P4D-03 技术复核为 fixed，不将源码模板数量误报为 GPU 程序或显存收益，也不承诺透明 / 拾取代码已经删除。

材质 / 扩展材质 / Primitive / Planar 45 项中 41 项直接通过；其余四项的旧夹具手动主光被新自动环境接管，显式禁用默认环境后全部定向复验通过，未降低阴影 / 材质断言。Globe 八项定向 GPU 通过，覆盖 native fog / atmosphere 门禁、物理天空与云影、海洋、裁剪边缘、高亮、地下色和 HDR / 多视锥。此次纯清理没有新增资源或提交。当前累计十八项 upstream-owned 路径和 SGP 见上表；默认环境视觉及主光决策仍独立 open，P4d 不能据本节技术通过直接提交。

本次 development / 完整 release、定向 ESLint、代码 Prettier、diff whitespace 与上游补丁审计通过。新增代码未改变公共 API / 类型，沿用默认环境增量的完整 build-ts / tsc 结果。全 AgentDocs Markdownlint 通过；全目录 Prettier 仍为上文九个无关 Planar 既存警告，本扩展修改文档通过。Cesium3DTileset 的格式处理仅统一新 hunk 换行，Git 差异保持八行集成接缝，没有邻近代码重排。

## Commit preparation and outstanding gates

以 P4c fbde52dcd5 为提交父节点，当前实际交付范围为 92 个 tracked 差异和 40 个新文件：补丁清单 1、AgentDocs 10、Architecture / ADR 6、浏览器 Specs 10、验收页面 20、上游集成文件 18、自有实现 43、engine Specs 24。按这些确切路径准备暂存；不使用 git add -A，不把其他目录仅换行导致的 dirty 状态纳入阶段。生成文件没有进入候选清单。后续获准的主光修正须更新此清单和验证证据，不将现在的暂存视为最终提交。

默认环境开云修正的负责人视觉复验与 WDR-P4D-08 主光规则仍待回复。依根 AGENTS.md 的阶段 gate，在这两项完成以及对应 review 关闭前不创建 P4d 提交，也不激活独立矢量后继阶段。当前没有需要继续轮询的构建或测试进程；已有通过证据不重复运行以等待答复。

## Approved custom primary light — implementation and review

负责人已确认开云画面通过，并接受自定义 scene.light 推荐方案；替代上一节的两个待答复状态。新的 DirectionalLight 可在初始或活跃时接管，Globe / Planar 自动权威不再改写它。SunLight 恢复自动主光并重新捕获恢复对象；release 仅在 scene.light 仍为自有实例时恢复。显式环境接管 / 移除、默认环境禁用 / 重启均保留外部替换，不销毁调用方光源。

Renderer 在天体计算之后写统一主方向和 linear RGB × intensity / solarIrradiance；复用地表、模型、云、云影和原生几何阴影记录。自动与自定义光在同帧切换时，以 light identity 使 Globe celestial cache 失效，防止沿用上一主光记录。天空、空气透视太阳散射与月相继续使用真实星历；没有新增纹理、Shader 分支、ShadowMap 或几何提交。ADR-0161 / ADR-0053 与 Planar JSDoc 已同步。

- 修复前两项所有权回归分别复现 Globe 拒绝初始 DirectionalLight 和 Planar 覆盖 / 忽略调用方光源；修复后通过。
- 四项新增真实 GPU Specs 在两种世界覆盖主光对象、方向 / RGB / 强度、零强度、恢复最新 SunLight、禁用 / 重启及显式控制器接管。地表与真实 glTF Box 读取最终像素，红 / 蓝光产生对应通道响应，背向光回到无直接光状态，实际太阳方向保持不变。
- Planar authority 与 Globe lifecycle / conflict 旧回归迁移后通过；Moon identity / texture、几何阴影开关所有权和 bloom 冲突仍有原断言。初次组合运行的一项旧 error-count 断言按新契约改为只计算余下 Moon 冲突，定向复验通过，未降低有效行为要求。
- Globe / Planar 两项浏览器 E2E 通过，云辐射平均值随暖 / 冷主光改变，几何 shadow camera 与主光方向 dot ≥ 0.999999，云影三级级联有效，自动恢复精确回到原主光，太阳方向不变，无 page / WebGL error。
- 固定 1280×800 场景新增一个用于验收的真实 glTF 后，Globe / Planar 分别为 88 / 14 次材质提交、36,864,000 bytes 材质附件；自定义主光颜色切换前后不变。这是固定场景成本证据，不把验收模型带来的基线变化或云采样噪声解释为管线收益。

Architecture 自审检查自动 / 自定义转换、释放条件、默认与显式控制器接管、天空和表面主光分离及现有消费者，没有发现新的技术阻塞。此次产品修改仅三个 SceneGIS-owned JS 文件，没有新增 upstream-owned 路径或 SGP；P4d 累计仍为上表十八项。现有验收页已提供主光模式、颜色、强度、方向及阴影控件，新增主光画面待负责人确认；此前各增量视觉不重复申请。最终交付检查和阶段提交仍由 P4d 统一收口，独立矢量保持后继范围。

最终完整 release、build-ts / tsc、定向 ESLint / Prettier、全 AgentDocs Markdownlint 和上游补丁审计通过。类型生成仍有既有上游 JSDoc 提示；全 AgentDocs Prettier 仍仅报前述九个无关 Planar 文档，本扩展修改文档已格式化。审计仍为十八项当前 upstream-owned、876 marker tokens、generated status 0。补充无云页面截图检查真实地表 / glTF 及主光方位改变后的阴影；验收夹具将 shadowMap.maximumDistance 明确设为 40 km，使约 22 km 视角内的对象处于原生阴影范围，不改变产品默认值。

当前提交候选更新为 134 个确切路径（相对 P4c）：在此前 132 项上增加 PlanarEnvironmentSpec 与 ADR-0053 的决策修订。新建文件仍为 40，上游路径仍为十八项；自定义主光代码、Specs、页面与正式决定一起进入 P4d，不混入下一阶段矢量实现。等待负责人对本次主光画面的答复；没有再次请求开云修正、标注或原生通道的已通过验收。

最终页面补齐阴影范围后，两项自定义主光 E2E 再次通过；新增 glTF 夹具下的两项默认环境 E2E 也通过，验证默认冷资源、首次启云、HDR 往返、环境关闭 / 恢复与错误检查。四项浏览器用例覆盖两世界及两条受影响场景，没有扩大到无关组合。134 项候选已精确暂存并通过 whitespace 检查，生成文件未进入 index；P4d 尚未创建提交，等待上述唯一的新增主光视觉 gate。

提交钩子预检：默认 npx 临时解析到 lint-staged 17.6.0，其 tinyexec 对每个 stdout chunk 独立调用 toString，导致 Git 的中文路径跨 UTF-8 分块时被解码为替代字符，ESLint 因不存在的乱码路径失败；工具已自动回滚，实际文件 / index 路径正常。以 npm exec --yes --package=lint-staged@15.5.2 -- lint-staged 执行相同仓库配置后，完整 ESLint / Prettier / Markdownlint / TypeScript 钩子通过。该版本使用 execa，未修改仓库依赖、钩子或检查项。后续提交通过相同 npm exec 环境调用 git commit，让原 pre-commit 继续执行固定版本；不使用 HUSKY=0 或跳过检查。预检后暂存仍为原 134 个路径，无生成文件或实际 unstaged 差异。

## Final owner acceptance and architecture gate

2026-10-14 负责人明确确认自定义主光画面通过，指示提交 P4d 后继续推进矢量切片适配。该确认关闭最后的视觉 gate，WDR-P4D-01 / 02 / 08 均转 fixed；全部八项 findings 已关闭。此前 Planar、扩展材质、标注、原生通道、默认环境及开云画面的确认保留，不重复请求。

Architecture 最终结论：既定 WebGL2 / 3D 单一不透明 / MASK 入口、默认单采样、HDR 显示语义、材质和专用通道保留、旧重放 / 资源 / Shader 清理均有相应技术与视觉证据。完整构建 / 类型、Specs / 浏览器、资源成本、上游审计和提交钩子预检已通过，允许形成本阶段独立本地 checkpoint。累计 upstream-owned 仍为上表十八项，对应 SGP 不变；关闭文档增量无产品或上游改动。

本次提交仅包含 P4d。独立 SceneGISVectorTileLayer 的 flat、Globe / Planar ground、fill-extrusion、circle / symbol 与透明 Globe direct overlay 组合尚未完成适配，须在 checkpoint 成功后进入下一 phase。既定不支持范围及九个无关既存文档格式提示仍明确保留，不声明任意自定义 Shader / DrawCommand 或所有组合均已通过。
