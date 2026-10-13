# Phase Plan: P4c Globe 接入

## Metadata

- Plan type: phase
- Status: completed，技术、review 与负责人视觉验收通过，批准独立提交
- Parent: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Entry checkpoint: P4b `5bde0722ba`
- Owner role: architecture / execution，当前任务
- Architecture review: direction confirmed；不实现临时 Globe 前向调度层
- Created: 2026-10-13
- Updated: 2026-10-14
- Discussion: [Globe 调度边界](../discussions/2026-10-13-globe-scheduling-boundary.md)
- Review: [接入审计](../reviews/2026-10-13-p4c-globe-entry-audit.md)
- ADR / SGP: [ADR-0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md) / SGP-0051；已有 SGP-0046、SGP-0009 是依赖

## Source facts

进入本阶段时 Globe 仍是已光照颜色 passthrough。已在真实 GPU 上复现默认地表深度清除、terrain
classification、多层影像 alpha passes、原生多视锥和 ground atmosphere/AO 的现有拒绝。
另复现 Globe 多影像与局部灯的 sampler 预算遗漏。细节与源文件调用顺序见讨论，不重录日志。

## Accepted direction and implementation order

负责人先选择 A，随后明确取消完整前向兼容目标。后续指示替代尚未实现的 A 过渡方案；
保留公共 API 与内容设施，按统一不透明延迟的需要设计调度，不要求复制原生每次绘制/清深度
或逐像素复现前向结果。透明、阴影、拾取、天空保留各自专用通道。

1. 先明确 Globe 材质入口：原生 imagery/terrain/Fabric 数据准备继续复用，材质阶段仅求值
   表面数据；方向光、环境光和局部灯在后续屏幕光照执行。Globe 不再以已光照颜色冒充材质。
2. 普通瓦片一次材质提交；影像超出实际材质采样槽时沿用资源分批能力，合成 albedo 并保留
   法线、深度和身份等独立字段。不得绑定灯表补救材质采样上限，不重绘整场景做影像预合成。
   核对首 pass / 后续 pass 的颜色、覆盖和 attachment 写入规则后落实具体编码。
3. 依据统一 surface/depth 定义 Globe、Model、Phong 和 classification 的输入与合成顺序。
   多视锥精度、`depthTestAgainstTerrain` 的可见性与贴地覆盖是产品语义，不能因取消前向
   兼容而默默删除；如需要改变这些语义或增加实际资源预算，提供具体方案再确认。
4. AO/SSR/SSIL 消费已资格确认的共享表面数据，TAA/water/后处理消费正确不透明结果。
   现有 AO/SSR replay 不扩写成永久过渡调度；SSIL 原本就没有 replay，不把校验删除当作
   新支持。Globe 天气、大气、海洋和覆盖需按材质/光照后效果分工审计。
5. 独立 Globe 页面与 GPU Specs 验证材质和统一光照；逐项接入地形遮挡、影像、分类和
   屏幕效果。旧前向画面作为诊断参考，新增行为以明确语义和负责人视觉验收为准。

目前只确认方向与实施顺序；不提前冻结尚未验证的附件编码、数量或声称已支持上述所有组合。

## Qualification and exit

当前深度调度增量复用 P3b 的单张 R32F：Globe 绘制后、原生清深度前保存地表深度；
普通 opaque 结束后依据 G-buffer 材质覆盖，仅写入非 Globe 的可见表面深度。
四张材质附件一直保留到统一光照，不提前光照 Globe，不新增附件或第二套前向绘制。
TAA 在 water 之前复制统一不透明深度；water 原绘制通过双附件同时写颜色与 TAA 自有深度，
不采样正在写入的目标、不重绘 water、不恢复会改变透明物体遮挡规则的 native terrain depth。
该增量先验证现有单视锥；后续基础分类已接入，inverse classification 与跨视锥仍保留检查。

原生地表大气/雾的后续增量复用 `AtmosphereCommon` / `GroundAtmosphere`，在屏幕光照末尾
按已重建的可见地表位置求值，保留 Globe 的大气参数、日夜衰减和逐瓦片 fog 选择。以现有
lighting mode 的空闲整数位保存 fog/ground 标记，不增加附件；屏幕阶段不再依赖地形网格
对大气颜色的插值。HDR 合成是仿射变换，AO 的间接光响应同步经过其线性部分，散射不计入
可遮蔽分量。真实 GPU 测试与成本检查通过前不声称资格完成。合成公式依据官方基线
`6d5d8b1f0725b6f831b336463f4b11c98023427b` 的 `GlobeFS.glsl` 大气段代数整理；
升级时随原生公式/参数语义核对，散射积分本身直接复用上游库，不复制实现。

- GPU Specs：真实 Globe 的深度开关、跨视锥遮挡、原生分类、影像 alpha、native/physical
  日夜光照与 pick；验证材质值、受光分量和可见对象，同条件前向 HDR 仅用于定位变化。
- 单个混合 Globe 浏览器场景：近地到地平线移动、原生拾取、TAA/效果开关及 Clock；
  仅按风险选择必要用例，不做无依据的全组合矩阵。
- 资源/成本：resize、卸载/disable/destroy、借用深度所有权、材质与光照 draw 数、固定
  视角 GPU 耗时与新增附件字节；P4a/P4b 已验收场景定向回归。
- 渲染管线变更须完整 build/release/types、定向静态检查、SGP 审计及自审；负责人视觉
  通过后形成独立 checkpoint，再进入后继阶段。

## Handoff

多视锥资源方案待负责人选择期间，先完成不依赖该决定的独立 Globe 人工验收页面。
仅组装当前已验证的原生 API 与延迟控制器：本地确定性高度/水掩码、影像分批、Fabric、
Globe 透明与分类、Tiles 反向分类、Clock、共享屏幕效果和拾取；链接既有 Bistro 页面。
页面不改变产品布局或资格，不为其隐藏多视锥错误。用一项浏览器 E2E 验证实际控件、
场景准备与销毁，已有材质/光照行为的 GPU Specs 不重复扩张。完整阶段视觉仍在剩余
多视锥完成后统一提交负责人，不在预算待决期间宣布 P4c 完成。

页面最初启用原生雾，暴露 Model HAS_ATMOSPHERE 的兼容缺口。负责人随后提出收缩已有
高级替代效果的重复原生适配；这项临时、尚未交付的 Model 雾实现与两项配套测试已撤回。
原生 Model 雾仍明确未资格确认，不静默忽略参数；本页改为既有高级物理环境，关闭原生
天空/雾/地表光照输出。提供物理天空、空气透视、高度雾控制；高级环境按既有契约持有
地形深度测试，关闭环境后才允许切换地形遮挡。单视锥混合场景的浏览器 E2E 已通过，
包括 17 层影像、Fabric、分类与半透明反色、日夜、SSR/SSIL/TAA、移动、resize、资源释放。
后续多视锥仍需核对高级环境的深度消费者，不能沿用单视锥证明。

负责人已批准半透明 inverse 的 A 路线：按需缓存 Tiles 材质，最多 60 bytes/pixel，
保持一次几何材质提交并复用延迟光照/原生透明和 OIT。先落实独立 Tiles 深度、分类遮罩、
主 G-buffer 的已分类表面并入和未分类 HDR 输出；验证 show/style、背景保留、透明排序、
深度拾取与资源生命周期，再解除 alpha<1 限制。多视锥资源方案尚未冻结，不能套用此预算。

多视锥资源审计实际复现 RG32F attachment 在 Framebuffer 构造时被拒绝：原生 PixelFormat
的 validate、componentsLength、toInternalFormat 已支持 RG，isColorFormat 却遗漏它。
先用 SGP-0052 补齐该现有颜色格式资格，并以真实 RG32F/RGBA16F 混合绘制和采样验证；
不自动分配 RG 目标，不提前批准跨段数据布局或增加场景预算。后续附件方案仍需负责人选择。

透明 Globe 接入沿用原生前/背面透明命令、分类深度 peel 与拾取。只将有颜色写入的
不透明 Globe 面纳入 G-buffer；原生分类 framebuffer 内的深度/分类命令继续写原目标，
不转接到共享 MRT。透明表面在原透明阶段执行，不新增缓存或扩展附件预算。独立矢量
direct surface overlay 会提前合成 Globe，保留其资格限制直到矢量阶段单独适配；
不能将该提前合成路径误认为普通透明 Globe。先验证前后面、地下、分类和 AO/TAA，
遇到实测资源或语义变化再确认，不因首个组合通过就解除所有限制。

该接入实际复现透明 Globe + 17 层影像 + 局部灯的 16 sampler 链接失败；原生分批没有
计入灯表。通过 LocalLights.prepare 显式发布当帧 0/1 纹理数，已有 SGP-0051 hook 将
FrameState 传给自有预算 helper，仅在保留的透明 Globe 通道预留该槽位。物理地表的
transmittance/irradiance/cloud-shadow 三槽也在相同入口计入，分别验证开关状态。
不改变影像层数、灯光 API 或纹理分配，不为已取消的完整不透明前向模式保留实现。

上述透明增量的三项新增 GPU Specs 已通过；最新整组 62 项延迟 Specs（含 25 项 Globe）
通过。真实街道的材质附件和两次延迟光照不变，透明命令和整帧成本已记录在 review；
原生地下/分类/拾取与动态采样槽均有证据。多视锥与半透明 inverse 仍未完成，独立矢量
direct overlay 仍在后继阶段，不能将本增量通过视为 P4c 整阶段完成或自动开始清理阶段。

原生 `HAS_VECTOR_LAYER` 增量复用已批准的分类 RGBA16F，保留 `VectorCommon` 的面再线
预乘覆盖以及位于地表光照/大气/地下显示之后、terrain classification 之前的顺序。
首批材质提交求值矢量覆盖，后续影像仅合成 albedo；无分类命令但存在可见原生矢量时
仍按需分配同一覆盖附件，最多七附件的已批准预算不变。原生 VectorProvider 的八个
sampler 在 imagery batching 前预留，与 Fabric 纹理共同检查剩余容量。验证真实
BufferPolygon/BufferPolyline、动态颜色/移除、多影像、遮挡/分类、AO 与资源释放；
这不等同于后续独立 SceneGISVectorTileLayer 的接入。半透明 inverse 分支继续等待选择。

负责人方向已明确，不再等待原 A/B 选择。首个实现增量建立 GlobeFS 显式材质 hook（SGP-0051），
复用四附件并以独立材质家族编码 native 地表参数：albedo/alpha、normal/fade、lighting 参数/identity、
geometry normal/shadow visibility。分批影像的后续 pass 仅绑定 albedo attachment，保留首 pass 的其他数据；
共用原生深度和影像 alpha blend，不新增纹理。局部灯只进入屏幕光照。

已用无后光照大气的原生 Globe 验证真实材质、局部光与多影像分批。物理天空复用既有
Bruneton/云影库与 frame-local uniforms；天空环境光保留 AO 响应，云影只影响直射。
Globe 第四附件原先空闲的 RGB 保存几何法线，屏幕天气据此在影像合成后统一求值；
避免分批重复湿润/积雪以及屏幕物体边缘的跨表面法线差分，不增加附件。

当前增量的 35 项延迟 Specs、12 项既有天气 Specs 与物理地表 radiance/空气透视端点测试通过；
定向 ESLint 与上游补丁审计通过。两项较大的既有夜间/云影测试失败，已用 P4b `5bde0722ba`
原源码隔离构建复现相同失败，不是本次增量引入；未隐藏或计入通过数，遗留事项见 review。
完整 release/types、性能与负责人视觉 gate 待阶段完成。

单视锥原生地表清深度、TAA/water、原生地表大气/雾已有后续验证；本轮覆盖 39 项延迟与
13 项 TAA 唯一用例，开发构建/ESLint/上游审计通过，详细证据和成本边界见 review。
高级环境控制器与 terrain depth=false 的组合仍受其既有深度契约限制，不冒充已经接通。

尚未表达的 inverse classification、多视锥等显式保留资格限制，
随后逐项接入；这只是阶段内部实现顺序，不是新的
完成边界。原前向 sampler 缺陷保留记录但不优先补过渡层；不把首个增量通过报告为完整 Globe。

下一分类增量已有源码方案：复用 native shadow-volume/stencil 与预乘 alpha 绘制，按需
增加 RGBA16F 覆盖附件，在统一光照末尾合成；后画的物体随原材质提交清除它覆盖的分类值。
负责人已选择 A，批准按需 RGBA16F 附件及 5/6 附件门槛，已写入 ADR-0161。
接入顺序为普通 terrain/Tiles classification 的原生 stencil/颜色绘制、物体覆盖清除、统一
光照与 AO/SSR/SSIL 响应合成、真实 Entity/Tiles Specs、资源生命周期和容量错误验证。
invertClassification 与跨视锥的资格不会随基本分类检查一并解除。

下一原生裁剪增量复用既有 clipping plane/polygon 的剔除与几何准备。平面边缘颜色是
光照后的替换色，不能当作普通受光 albedo；用 Globe mode 的空闲位标记，现有颜色槽
保存边缘色，屏幕光照跳过该像素的光照/天气、保留后续原生大气。多边形片元剔除在材质
提交前执行。保持四附件，不新增资源或 API；真实 GPU 验证裁剪区域、边缘受光隔离、
AO、拾取与动态更新后才移除对应资格限制。

分类和裁剪实现后的 45 项延迟 GPU Specs 通过，含真实 Entity/Tiles、非零 AO/SSR/SSIL
响应、容量拒绝、生命周期、裁剪边缘与区域的深度拾取。实现与评审证据见 review；
完整阶段的剩余分支、独立页面、完整交付检查和负责人视觉 gate 尚未完成。

Fabric 增量依据 `GlobeFS` 现状只使用 `czm_material.diffuse/alpha`，继续复用原生的
ST、height、slope、aspect 输入。水掩码还影响积雪/湿润的排除范围，已在后续海洋增量单独接入。
无海洋时，按 tile owner 与原 uniform properties 找到最后
一批影像，仅在该批合成一次 Fabric，采用 straight-alpha 的 source-over 以正确接回
已有 imagery blending；保持已批准的“先完整材质、后统一光照”方向，不重复旧多 pass
叠材质的结果。不增加附件或绘制，动态 uniforms 继续由原生 Material 更新。
`Globe.render` 已在瓦片提交前更新 Material 及子材质纹理；原 tile provider 未计入其
sampler 数量。通过窄 hook 在 imagery 分批前扣除这些已准备的纹理槽，容量不足明确报错，
不限制用户的影像层数。验证颜色/alpha、实时 uniform 更新、嵌套贴图材质、超槽多影像、
AO/局部光与卸载；保留原生需要 terrain normals 的材质资格判断。

Fabric 纹理预算与一次材质合成已通过 48 项延迟 GPU Specs（含新增 3 项 Fabric 用例）。
本机 16 个 sampler、两个子材质贴图与 17 层影像时，每批影像最多 14 层；底色只合成一次，
保留四附件和原材质提交次数。真实动态换图、uniform/alpha、容量错误及借用纹理生命周期
通过。矢量切片后继适配已加入总体目标；当前不提前修改其自有渲染路径。

海洋后续增量已获负责人 A 批准，见 ADR-0161 与讨论：按需 RGBA16F 保留海面法线/water
mask；海洋+Fabric 的覆盖 RGBA 与要素样式附件按材质家族复用，最多七附件。首批地形
写入海面数据及必要覆盖，后续影像仍只合成底色；屏幕阶段按原生顺序计算海面与 Fabric，
不重复提交地形或求值 Fabric。现有 mode 空闲整数位记录逐像素 water/ocean/wave/Fabric
分支，不压缩连续字段。复用原生波纹准备，少量屏幕端光照代数注明来源和同步条件。
weather albedo 与 wet-film 都使用 water mask 排除，物理地表函数消费已经求值的 wetness，
避免丢失该掩码。验证真实水掩码地形、波纹、alpha/超槽影像、日夜与 Fabric 顺序、天气、
五/六/七附件组合、容量与释放，再进行浏览器成本检查。不因方向获批而提前宣称资格通过。

海洋增量已完成技术验证：53 项延迟 GPU Specs 与 12 项既有天气 Specs 通过，含真实
Heightmap water mask、平静海面原生 HDR 对照、动态波纹、Fabric 覆盖/水掩码、超槽影像、
天气排除、与 Tiles 样式及原生分类共存、容量拒绝和释放。真实街道浏览器检查无
page/WebGL 错误；新增两张附件的字节数与批准预算一致，原材质及光照 draw 数保持不变。
性能采样和自审证据见 review；仍不代表整阶段完成，完整 release/types 与负责人视觉
gate 在剩余 Globe 语义接入后执行。

下一显示覆盖增量依据原生源码接入 fill highlight 和 opaque underground color。
`GlobeSurfaceTileProvider` 已准备统一颜色与 NearFarScalar；材质只保存逐像素 fill/
back-face 标记，屏幕端依次执行光照→裁剪边缘→fill highlight→原生大气→underground。
使用 mode 剩余两位后最大值 2047，仍是 RGBA16F 可精确保存的整数；不新增附件、
采样槽或绘制。地下距离按已重建可见表面求值，保留原生椭球高度扣除和距离渐变参数。
覆盖色相应衰减间接光响应，不能当作受光底色。验证真实 fill mesh 与地下相机、动态参数、
拾取和附件不变后移除这两项限制；透明 Globe、原生 vector 分支与多视锥仍单独处理。

该显示覆盖增量已通过 20 项 Globe GPU Specs（新增两项），验证原生参考色、距离渐变、
背面限定、AO 响应、动态设置、数据与附件保持不变、地下拾取。真实街道与海洋/Fabric
组合检查通过，314 条 fill commands、总材质/光照 draws 与显存不变，移动后 TAA 和
WebGL 状态正常。详见 review；下一步继续审计 inverse classification 与多视锥调度。

反向分类源码确认原生 alpha=1 使用主深度/stencil，alpha<1 使用独立 Tiles 深度并在
透明通道合成未分类表面，二者不能只按颜色 alpha 等同处理。先接通不透明反色：Tiles
仍只提交一次材质；复用原生 IGNORE_SHOW stencil commands，在普通分类前将未分类的
Tiles 像素写入现有 classification 附件，负 alpha 表示乘色，其余值仍为预乘覆盖色。
分类/未分类互斥，后画物体继续清除旧字段；屏幕光照在 Model/feature 着色后乘色，并
同步变换 AO/SSR/SSIL 响应。使用已批准的 5/6/7 附件布局，不增加纹理或几何重放。
Scene 窄 hook 选择该调度，并跳过无用的 native invert color FBO 分配。验证隐藏分类
要素的 IGNORE_SHOW、分类与反色顺序、样式/拾取、响应、resize/关闭与容量。
半透明反色仍保留显式资格限制，属于未完成的阶段范围；随后依据背景表面保存与透明
通道事实确定方案，不将 alpha=1 的通过当作完整 invertClassification 支持。

不透明 inverse 增量的 57 项延迟 Specs 通过，含新增两项分类用例，真实隐藏实例
IGNORE_SHOW、样式、原生参考、动态反色、四类响应、前景覆盖清除、容量与释放均有证据。
真实 Bistro 以 glTF 内容放入原生 Cesium3DTileset，GPU 成本与资源结果见 review；
半透明路线的具体资源/绘制预算已在讨论记录并提交负责人选择，当前不实施待决路线。

半透明 inverse 已按负责人 A 路线完成单视锥技术验证：64 项延迟 Specs 与七附件、拾取
补强用例通过；原生排序透明/OIT、背景保留、样式、屏幕效果与资源解除借用有证据。
真实 Bistro 保持一次材质提交，缓存字节数在批准上界内，成本记录见 review。
当前 alpha<1 限制已基于验证移除；多视锥仍有显式限制，不能以本增量代替整阶段 gate。
新增 GlobeDepth 窄生命周期 hook 复用 SGP-0046，RGBA/RG 格式缺口修复登记 SGP-0052。
下一步冻结多视锥材质/深度归属与透明阶段时序；涉及超出七附件或 cache 上限的方案
已单独提交负责人并获 A 批准：按需 RG32F 深度/视锥标记、最多八附件，每额外实际含 Tiles
的段增加 12 bytes/pixel 半透明反色缓存；普通单视锥保持原预算。下一步据此实现统一表面
与逐段透明调度，验证遮挡、拾取和资源回收后才解除多视锥资格限制。原生环境重复兼容范围
另见讨论末尾的替代评估，不将其与这次已批准的深度/透明预算混为一项选择。

多视锥首个实现已完成：对全部 ranges 预检并归并材质光照组；多段材质提交同时输出
RG32F eye depth / frustum tag，后续影像批仍只混合 albedo。已启用的共享 MRT owner
拥有 RG32F，Deferred 只借用；无共享效果时由 Deferred 所有。原 Scene 循环分为材质和
透明两个阶段，不重绘 opaque：最近段材质结束后统一 light / AO / SSR / SSIL / TAA depth，
再按原远到近顺序执行 water、透明和 pick depth。逐段重建 depth-test 状态，保留
clearGlobeDepth 的同段地表规则；更近段的表面阻挡远段透明。单视锥恢复 R32F 和原附件数。

验证证据见 review。当前跨段半透明 inverse 和透明 Globe 仍显式拒绝，后续分别接缓存层
和透明分类 peel 时序；高级环境的空气透视/云/镜头深度，以及 water 与最终深度的衔接仍需
独立资格验证。此增量不是 P4c 退出 gate，也不授权跳过这些剩余语义。

高级环境接入按当前真实缺口使用共享线性 depth，重建依据完整 camera frustum 的透视/
正交 planes 与当前 jitter，不能使用最后一个分段的 inverse projection。空气透视、
云 march/resolve/历史接收点和镜头遮挡保持同一深度约定，线性 clear=0，1 米是合法表面。
TAA 已捕获时借用其含水面的最终 R32F。负责人已选择 A，批准无 TAA 的多视锥可见水面
按需分配最终深度，条件 4 bytes/pixel。由 WaterFrame 管理，完成 opaque 后复制一次深度，
原始水面绘制通过既有 MRT 派生逻辑写入；环境读取此目标，折射继续读取 opaque 输入。
无可见水面、无高级深度消费者、单段或 TAA 已拥有目标时释放；验证深度内容、resize、
显隐/消费者切换与无重复几何提交，不通过隐式开启 TAA 或覆盖 opaque 输入来规避。

多视锥透明 Globe 继续复用原生分类 framebuffer：材质阶段仅执行 opaque faces 与其分类，
完整光照后逐段重新清空同一个透明分类目标，执行该段专用 depth peel 与透明面分类，
再进入既有透明排序/OIT。`GlobeTranslucencyState.executeGlobeClassificationCommands`
增加内部可选阶段参数，默认仍执行原来的两部分；Scene 显式传入阶段，不能通过窥探全局
active 状态改变该原生函数的含义。复用 SGP-0046 登记新的上游路径，不复制原生实现。
验证前/后透明面、分类目标隔离、普通前后物体、多段切换、拾取、共享效果及 resize；
其中 native manual-depth Shader 的 packed 深度也必须属于当前透明段，不能保留最近段数据。

上述透明 Globe 增量与无 TAA 的最终水面深度已完成定向验证，69 项延迟回归、16 项原生
GlobeTranslucencyState 与 13 项 TAA 回归通过。水面最终深度按批准的 4 bytes/pixel 分配，
原始水面 MRT 与 TAA 共用同一 helper；动态资源释放已有真实 GPU 证据，详见 review。
下一待实现项仍是跨段半透明 inverse 的独立颜色/深度层，尚未进入阶段视觉 gate。

跨段 inverse 实现按实际 Tiles command ranges 分配 RGBA16F/R32F 层；基础层复用原有
color/depth，多一层只增加批准的 12 bytes/pixel。每段开始清空同一材质/depth-stencil/
mask 工作集，IGNORE_SHOW 后将 classified 材质与 eye depth/tag 并入完整 G-buffer，
立即复用该段光照组写入该层颜色，光照时丢弃 classified 像素，免去逐层 mask。完整主光照
仍在全部材质结束后执行。透明阶段选择当前段颜色/线性深度，按该段实际 near/far 重建
硬件深度并剔除 opaque near overlap，避免跨段重复透明层；空 Tiles 段不得复用上一层。
Globe packed 深度在透明阶段从当前段恢复，不能继续读取最后一段材质缓存。保留现有
排序透明/OIT 调度；测试实际远近 Tiles 重叠、部分分类、近物体遮挡、拾取、日志/非日志、
共享效果及层数减少/关闭/resize 的资源释放，确认每条 Tiles 材质命令没有额外重放。

上述跨段 inverse 已完成技术验证，71 项延迟 Specs 与八附件 Globe 浏览器组合通过；
真实 Bistro 的层预算、原生分段提交与整帧成本记录见 review。完整 release/types 和
镜头线性深度两项 GPU 回归通过。最终页面控件/已验收内容三项浏览器回归、静态检查和
自审已通过。当前只待负责人视觉 gate；本阶段仍 active，验收后独立提交，再进入前向
冗余回查与独立矢量适配。

## Owner visual follow-up — 2026-10-14

负责人未接受密集分段的蓝色贴地面缺口。当前页面已复现，原生与延迟两条诊断路径均有
同样缺失；不再将其仅列为原生遗留而提交本阶段。隔离 GPU 探针证实，仅将分类 Shader
自动追加的 log-depth 写入改为 clamped depth，即可恢复完整覆盖，不需改顶点位置。

根因是 DerivedCommand 对调用 `czm_writeDepthClamp` 的分类体仍追加普通
`czm_writeLogDepth()`，该函数丢弃视锥外片元，破坏 z-fail stencil 所需的封闭体。
用独立 SGP-0053 修正自动派生：只有原 Shader 声明 depth clamp 且没有自行写入日志
深度时，将 depth 参数限定在当前 near/far 的有效范围后调用原生 builtin。普通几何继续
discard，显式日志深度实现保持所有权；不新增附件、pass、API，也不改变分段参数掩盖问题。

验证一项真实 GroundPrimitive 跨段覆盖/拾取回归，补充日志派生的 GPU 边界契约与原生
分类/贴地线最小回归，再复查同一页面单段/密集分段及 TAA 移动。既有视觉待验收状态被
本修复替代，前向清理与矢量阶段仍不提前进入。

SGP-0053 已完成，新增真实地面覆盖/拾取测试前红后绿。72 项延迟 Specs、119 项原生
分类/贴地图元、一项 GPU 深度契约、Globe E2E、完整 release/types 与静态/补丁检查通过。
同一页面单段与 20 段恢复完整分类覆盖，无新资源或绘制。

## Completion — 2026-10-14

负责人确认“缺口已消失，通过并提交 P4c”，修复后的视觉 gate 通过。Architecture
确认实现、定向回归、交付检查、补丁登记与 review 已完成；本阶段形成独立本地 checkpoint。
既有两项环境测试债务与非法 Framebuffer 夹具继续保留记录，不计作本次通过项。
不透明前向冗余回查与独立矢量适配依总体计划后续推进，不混入本阶段提交。
