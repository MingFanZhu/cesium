# Phase Plan: P4d 不透明管线收敛

## Metadata

- Plan type: phase
- Status: completed，技术、自审与负责人视觉 gate 全部通过，批准独立本地提交
- Parent: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Entry checkpoint: P4c `fbde52dcd5`，技术、review、负责人视觉与提交钩子通过
- Owner role: architecture / execution，当前任务
- Created / Updated: 2026-10-14
- Architecture review: passed；WDR-P4D-01 至 08 均已关闭，既定边界与矢量后继范围保留
- Review: [入口审计](../reviews/2026-10-14-p4d-entry-audit.md)
- ADR / SGP: ADR-0161 / 既有 SGP-0046；按实际修改登记，不预先登记未实现 hunk

## Objective and boundary

按负责人既定方向，回查 Entity、Primitive、Model、3D Tiles 和 Globe，移除仅为第二套
完整不透明前向模式保留的调度、派生、资源与 Shader。保留内容准备、动态材质/alpha、
透明、阴影、拾取和资源所有权。不把删几行开关当作统一管线完成，不增加永久兼容 fallback。
独立矢量适配继续由总体计划跟踪，不能当作普通 Primitive 已经通过。

## Entry source facts

1. Scene.executeCommand 在 SSR/局部灯/AO 旧接收链之前调用 DeferredLighting.draw
   并返回；Model、Phong、Globe 的 capture 宏跳过原光照。未发现已适配内容同时执行
   两遍完整主颜色绘制，不能声称删开关即可节省一整遍场景。
2. 材质阶段仍依赖 native log/HDR 派生和 shadow receiver；后者提供几何法线偏移、
   过滤与直接光可见度。共享透明、阴影、拾取代码不能一并删除。
3. DeferredLighting 仍由示例/测试显式绑定，初始 disabled。Scene 默认
   `msaaSamples=4`、`highDynamicRange=false`，当前延迟要求单采样、HDR、
   WebGL2、浮点附件与 3D。直接全局启用会使默认 Scene 失败。
4. GBuffer 同时承载 P1 诊断重放与延迟校验，主延迟入口禁止两者同时启用。若替换
   诊断器，应读取真实主 G-buffer；不能把独立诊断成本计入当前主通道。
5. 非 Model/Phong/Globe opaque 仍有已光照色 passthrough。先识别实际家族，
   区分有意保留制图颜色的 unlit 和尚未拆分的受光表面。
6. 当前校验还拒绝 clearcoat、anisotropy、specular 扩展、部分 Model 裁剪/轮廓/点云
   样式、voxel、2D/Columbus、WebVR 与部分调试状态。Globe 裁剪通过不代表 Model
   同名能力已支持，不得因统一入口而静默丢失原有 API 语义。

图谱已有索引但函数行号落后于 P4c，snippet 返回错位内容；上述事实已核对当前提交源码。
构建使用既有 gulp build/release/types，GLSL 模块仍由生成器生成；测试沿用 owned Specs
与独立 deferred Playwright 配置，不手工改生成文件。

## Implementation order

负责人随后明确保留上游共享源码，以提前返回截断旧不透明执行链；清理目标是没有必要
消费者的运行时工作、资源与 Shader 变体，不是整体删除 Cesium 前向源码。下一增量由
Scene 自动创建和销毁控制器、默认单采样，并在 main render 的资源准备前检查设备与
场景模式；空场景也不得绕过限制。页面借用 Scene 控制器，移除重复构造。现有私有参考
开关仅在本阶段材质/专用通道资格回归期间暂存，阶段退出前须移除；不增加公开选择 API。

2026-10-14 负责人选择 A：当前只推进 WebGL 延迟渲染，限定 WebGL2 / SCENE3D，
默认单采样；WebGL1、2D、Columbus View、WebVR 明确不支持，不恢复完整前向 fallback。
HDR 关闭仍使用相同线性材质、光照与透明合成，最终显示不应用曝光或 tone curve，
只进行范围裁剪与显示 gamma；HDR 开启保留现有曝光、tone mapper 与颜色调整。
该契约避免把 HDR 关闭误解为关闭延迟或把未编码线性颜色直接交给画布。
内部浮点颜色和 G-buffer 不因显示 HDR 关闭改成低精度。已有声明要求 HDR 的可选效果
继续明确验证其公开前提，不静默修改用户设置。

颜色边界与 Scene 自动绑定现已实现并验证，Scene/CesiumWidget/Viewer 默认单采样。
私有参考开关及依赖它的比较 Specs/旧示例仍待收敛，不能报告为唯一入口已全部完成。

1. 核对 passthrough 家族、Entity 动态 alpha、Model/Tile 样式及辅助 pass 的消费者；
   列出可删与必须保留的旧路径，明确实际资源和派生成本。
2. 明确默认 MSAA、HDR/LDR 和未适配模式的处理。优先保持现有 API；改变默认画面、
   设备门槛或废弃能力时，先以具体方案请求负责人确认。
3. 在已确认边界内收敛调度、材质派生和屏幕效果输入。不复制主循环，不增加平行的
   shadow/pick/透明实现。更新 ADR/SGP 和依赖旧模式的示例/Specs。

## Validation and exit

- 按实际删除风险验证材质、动态透明、阴影、同步拾取和资源释放。
- 用街道及混合 Globe 固定场景检查提交数、程序/附件驻留和 GPU 成本，不以代码量代替收益。
- 管线/Shader 改动完成 build/release/types、定向回归和补丁审计，避免重复无关验证。
- 负责人视觉、review 与独立提交通过后再进入后继阶段。
- 未适配能力必须有明确待办或获准范围，不以宽泛 passthrough 宣称单一管线完成。

## Handoff

负责人未接受原 opacity 画面，已确认真正透明，并允许半透明地表使用 OIT 专用
受光；不透明部分继续延迟。当前增量按
[透明语义讨论](../discussions/2026-10-14-planar-transparency.md) 完成修改与验证，
74 项相关 Specs、浏览器与交付检查有通过证据；负责人随后确认新画面符合预期，
允许继续 P4d。该项视觉 gate 已通过，完整阶段仍未完成或提交。
下面的 opacity 验证是旧背景混色契约的历史证据，不代表新透明行为通过。

P4c 已提交，P4d 保持 active 且未提交。A 范围、HDR 关闭、默认单采样和 Scene 自动
绑定已实现。独立 EllipsoidPrimitive 与 Planar 地表已接入真正的材质/屏幕光照：
Planar 保留受光、物理环境、天气、局部灯、裁剪、影像/Fabric 与 opacity 语义。
107 项延迟/GBuffer/Planar clipping GPU 用例通过（106 项回归及剩余一项修正断言后
复验），新增 Planar 浏览器验证通过，具体证据见 review。
下一步清理私有参考开关及仅供完整前向使用的效果路径/派生，完成负责人视觉与阶段
gate 后再独立提交。新验收页为 Test/Rendering/延迟平面验收.html。以下保留原增量
历史，旧“等待范围决定”和“Scene 尚未自动绑定”均已由本节的当前状态取代。

## First implementation increment

默认入口范围已提交负责人选择，等待期间不修改默认配置。先移除 P1 独立材质重放：
将校验迁入私有布局 helper，GBuffer 诊断器只借用真实 DeferredLighting 材质与线性深度，
删除 Scene 的诊断 draw/capture 调度和专用 capture Shader。保留一个显示阶段与诊断器
销毁 hook，诊断开关不再分配/释放材质目标或改变主渲染。旧 MSAA 诊断控件取消，页面
显式使用已确认的单采样延迟。覆盖主颜色/拾取不变、无额外几何提交、借用所有权、
resize、MASK/空场景和实际街道通道显示；此增量不宣称完成整个 P4d。

该增量已实现。6 项真实 GPU 诊断 Specs 通过，覆盖正/负光照组、MASK、空场景、
主颜色/拾取/几何提交和借用生命周期。72 项延迟回归中 71 项直接通过；余下一项仍
断言旧重放器拒绝 feature style，更新为新诊断契约后，包含它的 7 项样式回归全部通过。
没有为产品保留已取消的诊断限制。独立街道 E2E 通过；三个显示状态均为 627 次主材质
提交、同一组 31.25 MiB 材质纹理，无额外材质目标或几何重放。GPU 时序受短测波动影响，
不作普遍提速声明；截图与法线/自发光/深度、移动、Clock 和销毁均已检查。

进一步源码核对：PlanarSurfaceFS 仍自行计算基础/高级地表光照，独立 EllipsoidPrimitive
的 EllipsoidFS 仍在射线交点计算 Phong，属于受光 passthrough 待适配。DynamicEllipsoidGeometryUpdater
实际创建 MaterialAppearance + Primitive，并非调用 EllipsoidPrimitive；不沿用早期把两者
混称的假设。PolylineFS 直接输出 diffuse + emission，应与受光表面分别处理。
阶段提交和主入口收敛尚未完成；默认模式范围的负责人问题仍待答复。

## Native material flag cleanup

负责人进一步明确 Planar 保留地表受光，仅移除几何阶段光照并统一交给延迟阶段。
保留 enableLighting、Lambert 参数、物理 Sun/sky、影像/Fabric、裁剪边缘及 opacity 的
背景合成语义。复用四个材质附件的 Planar group，光照/天气/局部灯在屏幕阶段求值，
不新增几何提交或材质附件。自动入口的 LDR 仍须以内部线性精度选择背景/水面资源。

移除 P1 独立诊断后，唯一 Model 材质提交会同时开启 GBUFFER_MODEL_CAPTURE 和
DEFERRED_CAPTURE；前者已无独立调用方。统一用已有 DEFERRED_CAPTURE 驱动材质记录、
BRDF 跳过和要素样式记录，删除这组失效的独立组合状态。只改变内部 Shader 协议，
保留原生材质处理、同一四/五附件、透明/阴影/拾取所用分支和默认入口。
复用 SGP-0045 的原生记录 hunk；以 Model 光照与样式 GPU 回归验证，不增加同义测试。

该标记收敛已完成；17 项光照与 7 项样式 GPU Specs、development/release 与上游补丁
审计通过，当前仍未提交。后续入口/旧分支清理取决于待确认的场景范围；没有修改 Scene
默认配置或以静默前向 fallback 绕过此选择。

## Existing feature qualification decision

2026-10-14 负责人明确：P4d 保持未提交，补齐 glTF clearcoat、anisotropy、specular
扩展及 Model 裁剪平面、轮廓、点云样式等既有能力，再关闭阶段。A 仅确认 WebGL2 /
3D 与采样范围，不授权缩减材质与场景 API。先完成当前唯一入口与共享效果清理的
技术回归，再依据实际材质字段和消费者设计接入；新增设备门槛或资源预算仍需具体
方案确认。不得将旧能力回归改成期望拒绝来关闭 gate。

私有 renderer.enabled 和原型页面前向控件已删除。原前向比较 Specs 正迁移为
材质值、无直射光颜色、样式乘数、分类叠加、透明层数和资源所有权断言。
AO / SSR / water 几何重放、几何接收派生、效果自有 depth-stencil 快照与 MRT
多采样分支已移除；LightingMrt.command 保留，真实消费者是延迟屏幕光照组。
当前改动仍在回归中，尚不构成技术通过或阶段完成证据。

## Model clipping increment

保留原生 ModelClippingPlanesStage 的 discard、union/intersection 与 edgeWidth 求值。
在 edge 分支用 SGP-0045 窄 hook 记录原生无光照边缘色，材质最终写入时使用已有
passthrough group（-1），并清零其间接光响应；其余表面仍为 Model BRDF group。
不新增材质纹理、几何重放或公共 API。共享效果允许已适配的 HAS_CLIPPING_PLANES。
Specs 覆盖裁剪移动、MASK/AO、边缘色不随光强变化、拾取、resize 与销毁。

Model silhouette 同样复用原生 stencil 扩边专用命令；不透明扩边只写既有 unlit
group，透明扩边继续原生透明通道。Model 实体继续 BRDF group，不新增材质附件。

扩展字段预算已由负责人批准，见
[材质容量讨论](../discussions/2026-10-14-extended-material-budget.md)。
先实现 specular / clearcoat / anisotropy 材质采集、屏幕恢复、按需附件与溢出提交；
再覆盖 inverse 分类、轮廓 coverage、点云和组合屏幕输出，逐项以 Specs 验证。

## Point cloud color qualification

点云保留原生顶点 color / show / pointSize 求值、透明通道和拾取。原生受光点云在
BRDF 后执行 gammaCorrect，随后才应用 feature / model / outline / classification
颜色。因此延迟光照保持该顺序；共享效果的线性增量不能直接加在校正后的颜色上。
有共享效果的受光点云组复用 MRT 已有颜色快照，追加一次屏幕颜色校正，将原生
线性增量变换为同一 gamma / 后置颜色响应下的差值；不增加纹理或几何提交。
零颜色响应通道保持固定覆盖色。该命令只对相应可见组执行，销毁随 MRT 派生缓存。
以原生 HDR 命令作为 GPU oracle，验证默认颜色、样式切换、show / size / picking、
AO 非线性增量和共享 SSR / SSIL；记录新增屏幕提交成本。

## Native annotation increment

扩展材质本增量已获负责人视觉验收。随后负责人批准
[标注深度预算](../discussions/2026-10-14-depth-writing-annotations.md)。仅识别原生
BillboardCollection 的 Pass.OPAQUE 混色写深度命令（含带背景 Label），从材质采集
排除，使用原生 Shader 在每段水面/透明前执行。保留原生 picking；原提交以 MRT
同步输出 annotation opaque depth 与已有 TAA / water final-depth，无几何重放。
共享 AO/SSR/SSIL 继续读取物理表面深度；后续遮挡、环境深度与水面读取合成深度。
覆盖 label background / alpha / 前后遮挡、单/多段、Globe clear、TAA、水面和释放；
然后完成浏览器/成本与负责人视觉。Bentley / voxel 剩余资格继续 open。

实现偏差：R32F / RG32F 与 alpha blend 同次 MRT 写入依赖 EXT_float_blend，原生
标注并无该设备要求。改为每个实际提交标注的视锥段在颜色后执行一次无混色的全屏
硬件深度复制，同时更新已有 TAA / water final-depth；不新增几何提交或纹理，
不扩大设备门槛。物理深度保持独立。费用记录同时列 annotation 与 depth-copy 次数。

## Bentley native model-stage increment

标注本增量技术检查完成、视觉待反馈；同属 P4d 的下一项为已有 Bentley planar
fill / edge visibility。先用现有 PlanarFill 资产隔离 feature-ID depth pull / behind
语义以及 backgroundFill，不复制预通道。之后记录原 edgeDetectionStage 替换色到
已有 unlit group，保留 edge metadata 与 direct 专用命令。任何显式深度初始化
修复必须先由 GPU 失败定位；上游接缝复用 SGP-0045 并登记实际文件。不新增纹理预算。

## Annotation composition correction

负责人视觉反馈否决半透明背景阻挡后方蓝板 / 水面的旧语义。当前独立颜色尾部仍写
不透明深度，需调整其透明合成契约；详见 review 的 Annotation visual rejection。
下一步先确认专用标注与原生透明合成、字体覆盖率及水面调度的接缝，再实现像素回归。
验收必须覆盖背景内仍能看到后方蓝板 / 水面、前方物体与标注的正确关系，以及 alpha
0/0.5/1；不能仅用命令数量、拾取和 GL error 通过替代。重新核查条件深度纹理及
每段复制的必要性。Bentley / voxel 回查在本项修正后继续，不关闭阶段。

## Accepted annotation correction

2026-10-14 负责人已批准实心 / 透明拆分、标注不参与水面折射，并在更新页面视觉确认通过。原背景矩形阻挡透明物及水下文字亮点已修正；12 项定向 GPU 用例和标注 E2E 通过。仅复制物理深度一次，实心提交同步写 MRT，半透明部分共用 native OIT / 排序透明；不再复制每段硬件深度或刷新水面折射颜色。成本、资源和上游清单见最新 review。Bentley planar fill 三项 GPU 资格也已通过；继续 edge visibility / voxel / Gaussian 的剩余资格，P4d 未提交。

## Voxel composition implementation step

源码已确认 Voxel 为 premultiplied-alpha ray-march 专用通道，depthMask=false 且 executeInClosestFrustum=true。现调用位于不透明材质与光照前，后续 light 会覆盖体积颜色；原 IntersectDepth 只读当段 packed Globe / Tiles 深度。改为 render 时在 material / light 之后、annotation / water / transparency 之前保留原 voxel 专用提交，原生 picking 调度不变。通过显式 Shader 深度接缝，颜色 ray-march 借用统一物理线性深度并沿原 view ray 求截断位置，不新增纹理、BRDF 或几何重放。Specs 先复现拒绝 / 覆盖，再验证 ordinary opaque 在体积前 / 内 / 后、depthTest 开关、log multi-frustum 与释放。水面 / 体积合成及浏览器仍需核对，不提前宣称通过。

## Approved voxel/water contract and current gate

上一节的水面前调度经组合像素用例复现失败，已由负责人批准的新契约替代：render
保留原 voxel 专用提交，在水面与 TAA depth capture 之后读取最终表面线性深度。
水前可见、水后遮挡、不参与水下折射，native pick / depthTest 不改。无可复用最终
深度时，仅可见水面与 voxel 同时存在才按需增加同一个 R32F 和每帧一次初始化复制；
1280×800 为 3.90625 MiB，不增加几何提交。详见已解决的 voxel-water-depth 讨论。

实现、44 项相关 GPU 回归与原生通道 E2E 通过。资源复用、释放、resize 和水面穿过
体积已验证；负责人仍需检查本增量填充 / 边线 / 体素页面。标注视觉已通过，不重复
请求。最终兼容矩阵（包括 Gaussian 混合场景证据）和 P4d 本地提交 gate 继续 open。

## Gaussian mixed-scene qualification

原生九项回归已有真实资产颜色与生命周期证据；新增最小定向 GPU 场景验证原专用 pass 在唯一延迟入口下与普通不透明物前后遮挡、透视 / 多视锥及水面组合。复用已有 sh_unit_cube 数据，只补行为资格；若出现真实失败再定位窄集成接缝，不预先扩张渲染协议或预算。

## TAA coplanar depth correction

连续八个抖动采样中，异要素共面填充的原始材质颜色已复现错误，排除 TAA history。GPU 逐提交深度显示红 / 紫自然共面深度相差约 5e-7，并随亚像素采样改变符号。优先复用原 feature-ID pre-pass 已有深度，在 raster 亚像素精度及 depth24 量化误差内把同一深度归一到该参考，再沿用原 PLANAR_DEPTH_PULL / same-feature BEHIND_DEPTH_PUSH；不调低 TAA、不增加 epsilon 级全局深度放宽，不影响超出该误差范围的真正前后几何。仅主材质的 planar fill 使用这一窄接缝，不新增纹理或绘制；增加一个既有 pre-pass depth sampler，并检查容量。八采样原始材质、前方遮挡及连续浏览器画面验证后再请负责人重新验收。

## Voxel pick consistency correction

负责人已确认左侧 TAA 填充修正正确；右侧体积与红面重叠区域却返回红面，视觉 gate 继续 open。浏览器同坐标对照已复现：红面在后仍覆盖体积 pick ID，隐藏红面后恢复体积。源码确认 pick 先执行 depthMask=false 的 voxel，再执行普通不透明命令，且 ray-march 只获得旧 Globe / Tiles 深度。修复仅调整拾取专用调度：完成普通不透明 / 水面 pick 后，按需复制当前拾取深度到已有 packed depth，再执行原 voxel pick。维持原非零 alpha 命中、depthTest 与 pickVoxel 元数据约定，不借用可能带 TAA 抖动的上一颜色帧深度，不增加颜色帧资源或几何提交。Specs 先复现前 / 内 / 后及多视锥，再验证 water 与浏览器点击；复用 SGP-0046。

## Owner clarification: advanced environment authority

2026-10-14 负责人再次明确：原生雾、原生大气和旧原生光照效果不属于 P4d 需要补齐的兼容目标，已有高级渲染功能负责这些能力。此前对 HAS_ATMOSPHERE 的排查只读源码，没有新增原生雾实现；取消该适配方向。保留材质 BRDF、内容准备、阴影、透明和拾取内核，不将其等同于恢复原生环境或第二套完整前向管线。高级环境仍遵循现有显式启用和资源所有权，不自动创建 Controller；关闭高级环境不得恢复被替代的原生视觉效果。

下一增量核对并在执行入口禁用 native Fog 视觉、SkyAtmosphere / SkyBox / Sun bloom、Globe ground atmosphere 和旧 Globe daylight 分支，保留 Fog 的瓦片剔除用途以及高级 Globe 仍使用的 Moon body / 星历 / shadow light authority。仅对 WebGL 延迟入口建立显式门禁，不删除共享上游实现、不修改调用方持有对象或把材质基础函数整块删除。同步高级环境的冲突检查、有效能力说明与定向 Specs；独立矢量仍留后继阶段。

## Default advanced environment direction

负责人随后允许自动创建高级环境，物理大气 / 空气透视 / 指数高度雾默认开启，体积云等高开销部分默认关闭。本决定替代上一节“不自动创建 Controller”的限制。源码发现 showClouds=false 仍加载 / 分配云资产，必须先实现真正的按需云资源。公开访问与显式控制器接管的具体方案见 [默认环境讨论](../discussions/2026-10-14-default-advanced-environment.md)；公共 API / 所有权安排待负责人按既定重大选择规则确认。当前 native gate 已改 Scene.js、Globe.js 与 owned conflict guard；Entry 新门禁用例已复现旧行为，Globe 回归中 30 通过、9 项旧 native atmosphere / daylight 断言待按新契约迁移，不报告整组通过。

## Approved default environment implementation

负责人已批准 scene.environmentEffects 只读访问与显式实例接管 / 移除恢复。Scene 的默认实例只在拥有 Globe / Planar world 时创建，getter 不分配 GPU 或网络；正常帧先让位再更新显式控制器，随后激活默认。World 变更前释放 Scene 自有资源；显式控制器不由 Scene 销毁。Planar 无既有 light authority 时创建 Scene 自有固定 Z authority，显式注册时让位。冷启动只请求三个大气 LUT；首次 showClouds=true 才请求五项云资产、分配云纹理 / shader 并替换 aerial 变体，保留同一 LUT；云阴影图集也按需创建。新增生命周期 / 失败锁存 / 云冷启真实 GPU Specs，验证中。38 项 native-gate 回归通过，余下一项只读夹具方向已修正，等待定向复验。体积拾取已获负责人确认，不重复请求该画面验收。

## Current handoff after default environment verification

默认环境实现、六项专用 GPU Specs 的通过证据、Globe / Planar 两项 E2E 与完整 release / types / tsc 已完成。旧夹具方向及候选资源清理回归已定向复验通过。自动实例 surfaceRadianceScale=1；高级 Planar 天空优先于旧轻量天空。真实浏览器复现的 Planar 大气 / 高度雾组合失效已用等价 Shader 条件结构修正，浏览器回归由失败转为通过。当前待负责人确认新默认画面，既有 Planar 透明、扩展材质、标注、原生通道视觉不重复申请。

最新 [能力矩阵与待办](../reviews/2026-10-14-p4d-entry-audit.md#current-adaptation-matrix-and-remaining-work) 区分已实现、专用通道和未完成项。主要 Entity / Primitive、glTF、3D Tiles 与 Globe 均已有真实延迟接入；独立 SceneGISVectorTileLayer 及透明 Globe direct overlay 组合仍留后继阶段。P4d 还需收尾消费者 / API 边界审计（含高级 Globe 自定义 scene.light 冲突）、归属已有 Gaussian 移除所有权问题、关闭 WDR-P4D-01/02/03，并在负责人视觉完成后形成独立提交。当前未提交，也未激活下一阶段。

负责人随后否决默认环境画面：开启体积云时 Planar 天空变黑。已复现并增加修复前失败的 GPU 用例；clear-depth 为零时不能把它当表面位置来归一化视线。天空改从已有相机 frustum 重建，真实地表仍沿用原深度重建，无额外资源或提交。两项相关 GPU 回归通过，浏览器开云 / HDR 往返和重新视觉确认继续由当前增量跟踪，不能沿用上一轮无云通过记录关闭此缺陷。

## Gaussian tileset ownership closure

源码确认 GaussianSplat3DTileContent 为 tileset 创建唯一共用 GaussianSplatPrimitive；单 tile 卸载只释放内容 loader，不能销毁整个共享图元。Cesium3DTileset.destroy 当前没有调用该图元的 destroy，导致 tileset 移除 / Scene 销毁不释放 splat GPU 资源。P4d 将以 SGP-0054 在 tileset 总体销毁时调用既有图元释放，再清空引用；兼容已有显式提前销毁，不新增资源、渲染分支或 API。将原混合场景 GPU Spec 的手动清理改为验证 tileset 移除自动释放实际纹理 / vertex array，并运行原生 Gaussian 回归。异步快照在图元销毁后因 _pendingSnapshot 解除引用不会再发布 GPU 资源；不扩大到原生排序算法重构。

## Final shader consumer cleanup

当前源码回查确认 SCENEGIS_AMBIENT_OCCLUSION 与 SCENEGIS_SSR_RECEIVE 已无产品 define 发出点；旧接收 shader 已删除。SCENEGIS_SSR_CAPTURE 唯一发出点在 LightingMrt.command，始终与 SCENEGIS_SSR_MAIN 同时使用。清理无消费者的旧 AO 接收代码，以及 SSR 的旧 receive / capture 分叉，保留正在被屏幕光照使用的 AO / SSR_MAIN 记录和原生 BRDF。复用 SGP-0014 / 0016 的既有补丁边界；保留透明 / 阴影 / 拾取共享模板，不删除有实际消费者的 Shader。以既有材质 / 扩展材质 / 共享效果 GPU 回归和发布构建验证，不为等价清理新增重复像素矩阵。

同一回查发现 owned 延迟 Globe shader 仍保存原生大气重算与旧 daylight 的屏幕分支。已获准的 native gate 使其无法启用；移除该 helper、native define 选择及材质中的大气标志，保留 Cesium 原生共享源码、海洋材质、地下色与填充高亮。物理大气继续由高级环境负责。以现有 native gate、物理天空 / 云阴影、海洋和显示色用例验证删除没有改变有效画面或资源成本。旧手动主光 Specs 同时显式关闭自动环境，不修改光照断言或提前决定待确认的自定义主光 API。

上述清理已实现：Gaussian 十一项、材质等四十五项（含四项夹具迁移后的定向复验）、Globe 八项通过；消费者审计关闭 WDR-P4D-03。Gaussian 所有权问题已修复，替代此前待处置状态。主光兼容选择与默认环境开云画面仍待负责人回复，P4d 未提交，不激活独立矢量后继阶段。

## Accepted custom primary light implementation

负责人已确认开云画面通过，并接受自定义 scene.light 推荐方案。Globe / Planar 识别非自动实例的 DirectionalLight 为调用方主光，自动权威不改写它；恢复 SunLight 时重新捕获并使用自动主光，释放只恢复仍归自身持有的对象。Renderer 共享记录在天体状态之后使用自定义方向与 RGB × intensity，sky / ephemeris 保持原计算；既有 cloud / shadow history 按方向和能量变化失效。先以生命周期和真实像素 Specs 复现旧冲突，再补齐两世界、自定义主光地表 / 模型 / 云 / 阴影和自动恢复验证；更新 ADR / review 后按原流程关闭 P4d。独立矢量适配仍须在 P4d 本地提交后进入。

该实现与自审已完成：新增四项 GPU 用例、迁移后的既有 Planar / Globe 所有权回归和两项云 / 阴影 E2E 均有通过证据；实际地表 / glTF 像素与云辐射正确响应自定义颜色 / 强度 / 方向，太阳星历不变。显式环境接管 / 移除另定向复验通过。当前无待决定的 API / 预算事项；只等待本增量负责人画面确认与最终交付检查，随后关闭 P4d findings、形成独立本地提交，再依据当时矢量源码激活后继 phase。

## Phase closure

2026-10-14 负责人明确确认自定义主光画面通过，批准提交 P4d 后继续矢量切片适配。技术、自审、此前各增量及新增主光视觉 gate 全部通过；完整 release / types、定向 Specs / 浏览器、成本证据、补丁审计和完整提交钩子预检均已记录。关闭 WDR-P4D-01 / 02 / 08，阶段转 completed；本次独立本地提交是 P4d checkpoint。独立 SceneGISVectorTileLayer 及透明 Globe direct overlay 组合仍是后继范围，不把 P4d 关闭写成全部矢量能力完成。
