# Discussion: Globe 接入与调度边界

## Metadata

- Status: resolved，负责人取消完整前向兼容目标，过渡 A 方案被后续指示替代
- Author role: architecture / execution，当前任务
- Created / Updated: 2026-10-13
- Parent: [总体计划](../plans/2026-10-13-webgl-deferred-renderer-extension.md)
- Candidate phase: [P4c](../plans/2026-10-13-p4c-globe-integration.md)
- Entry checkpoint: P4b `5bde0722ba`，技术、review、视觉与提交钩子通过
- Related decisions: ADR-0091、ADR-0093、ADR-0156；尚未作出新 ADR / SGP 决定

## Source and reproduction

当前真正拆分材质/光照的是 Model 和已资格确认的普通 Phong appearance。Globe 仍进入
passthrough，不能把能显示 Globe 等同于完成地形延迟光照。

`GlobeSurfaceTileProvider.endUpdate` 经 `addDrawCommandsForTile` 按 sampler 容量拆分
影像；第一 pass 写入颜色/深度，后续 pass 使用 alpha blending。`GlobeFS` 在每个 pass
内执行 imagery/material、天气、native/physical 光照、局部灯、裁剪/高亮、大气/雾和地表
矢量合成。把已光照颜色当 albedo 或直接混合全部 G-buffer 附件均不保持这些语义。

`Scene.executeCommands` 在每个原生 frustum 内依次绘制 Globe、复制 Globe depth、
terrain classification，按 `depthTestAgainstTerrain` 清除主深度，再画 Tiles/分类/普通物体。
现有延迟 begin 在视锥循环之前，所有材质仅在普通 opaque 之后统一 light；仅移除校验会
让前段颜色与后段深度不再对应。`_SceneGISLightingMrt.layout` 同样限制单视锥、分类、
地表清深度、混合命令及 AO/SSIL 的后光照分支，不能只放开 `_SceneGISGBuffer.validate`。

Edge 155 / ANGLE D3D11 / RTX 3060 Ti，1280×800，原生 EllipsoidTerrainProvider、
离线影像与真实 Globe/Entity，单采样 HDR；本次审计没有改产品校验或接口：

| Case                                            | Evidence                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| 保留地表默认 `depthTestAgainstTerrain=false`    | 单视锥、26 个 Globe commands，因 clearGlobeDepth 拒绝                    |
| 显式打开 terrain depth，无 AO                   | 渲染成功，但 0 个材质光照组，仅 passthrough                              |
| terrain depth + ground atmosphere + AO          | LightingMrt layout 拒绝                                                  |
| 原生贴地 rectangle Entity                       | 实际提交 2 个 classification commands，延迟资格拒绝                      |
| 17 层离线影像，设备 16 个 fragment samplers     | 原生形成 52 次 Globe draw，其中 26 次混合；每瓦片 2 passes，延迟资格拒绝 |
| 非日志深度、显式 farToNearRatio=10 的地平线视角 | 实际 2 个 frustums，现有延迟入口拒绝；不声称默认相机必然如此             |

另复现现有 Globe sampler 预算缺口：17 层影像的原生路径成功，加入一盏局部灯即链接失败，
移除灯后恢复。tile provider 为影像预留原生 water/shadow/clipping/translucency samplers，
没有扣除新增局部灯参数纹理。应在接入阶段修复实际预算，而不是降低用户影像层数或灯数。
此缺陷在 deferred disabled 时也存在，不归因为新的 Globe 材质编码。

临时脚本与 JSON/log 位于忽略的 `Build/Specs/p4c-globe-audit.*`，此处只保存交接结论。

## Options

- A（建议）：先完成 Globe 与延迟内容的调度兼容，地球和贴地分类暂用原生绘制，Model/
  普通图元继续延迟。按真实颜色/深度边界安排光照，验证多影像、地形遮挡、多视锥与
  AO/SSR/SSIL；后继单独拆 Globe 材质与光照。好处是先建立可用、可比较的 Globe 基准，
  边界是地表本身暂时没有获得延迟多光源收益。
- B：本阶段一起完成 Globe 真正的延迟光照与上述调度。还需同批解决影像多 pass、天气/
  海洋/后光照大气及分类的材质表达和组合，扩大一次验收与回退范围。

两者保留现有 API，不自动修改地形遮挡、关闭雾或限制 imagery layer 数。透明 Globe、
任意 custom shader、Planar 与全面主线替换不自动纳入本阶段；发现新的公共/资源决定再确认。

## Decision

负责人先选择 A，随后明确无需兼容前向渲染，以减少后续修改负担。后续指示优先：不再实现
暂时保留 Globe 前向的过渡调度，以单一不透明延迟管线推进 Globe 材质接入。决定已提升到
[ADR-0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md)。

影像/灯表冲突的表述仅适用于现有原生前向 Globe；目标延迟阶段先合成影像材质再光照，
二者不在同一个片元程序竞争 sampler。影像数量本身超过材质 sampler 容量时仍需分批，
这不等于重复执行光照，也不能据此对整个 G-buffer 做普通 alpha blend。

源码补充纠正：AO 与 SSR 有既有 replay 路径；当前 SSIL 明确禁止 replay，要求共享主 MRT。
后继方案不把这三者都视为已有兼容回退。原生多影像/局部灯缺陷保留记录，不为已取消的
前向过渡方案优先修补；新材质与光照程序分别验证实际纹理预算。

## Classification attachment decision

材质、单视锥深度和原生大气增量通过后，核对 `ClassificationPrimitive.createColorCommands`、
`getColorRenderState` 和 `ShadowVolumeAppearanceFS`：原生地形/Tiles 分类使用 shadow-volume
stencil 后绘制预乘 alpha 覆盖色；后续普通 opaque 会遮住此前分类。直接把这份颜色写入
albedo 会改变其受光语义，直接写主颜色则会被后来的统一延迟光照覆盖。

建议 A：有分类命令时按需增加一张 RGBA16F 覆盖附件，借用原生 depth/stencil，保留原生
分类位置、混合顺序和材质输出。后画的 Globe/Tile/普通物体在原材质 MRT 同时将对应覆盖值
置零，避免地面分类透到楼上；统一光照按预乘 alpha 合成，并同步缩放 AO/反射/间接光响应。
分类多层颜色遵循原生顺序。无分类时不分配，不重绘全场，不保留完整 opaque forward 管线。

代价：1280×800 增加 7.8125 MiB，1920×1080 增加约 15.82 MiB；基础 G-buffer 从 4 张到
5 张，已有 feature-style 附件同时存在时为 6 张。本机支持 8 张，但 WebGL2 的四附件设备
不能启用这组内容，需要明确资格报错。此前 P4a 的五附件批准仅涵盖要素样式，不能自动宣称
已批准本次第六附件。

B：为保持四附件设备范围先重排/压缩 G-buffer，再集成覆盖色；要重新验证法线、材质、
HDR/阴影和要素样式的精度及编码，阶段范围更大。此处不预设未经验证的紧凑格式。

负责人明确选择 A，批准按需增加附件、保留语义和精度，提升到 ADR-0161。原生 invertClassification 仍需单独
核对其 ignore-show mask 与透明反色合成，不因为基础分类方案确定就删除相应校验。

## Ocean attachment proposal

原生 `GlobeFS.computeWaterColor` 先计算双层波纹法线，再按主光方向、视角、water mask、
距离 fade 和 `zoomedOutOceanSpecularIntensity` 调制影像色；之后才执行 Fabric source-over，
再进入原生地表光照/天气。将 ocean 直接作用于已合成 Fabric 的 albedo，会使不透明 Fabric
覆盖仍带海面高光；把当前 `computeWaterColor` 留在材质绘制则仍在 G-buffer 前执行光照。

建议 A：按需增加一张 RGBA16F 保存独立海面法线和 water mask。海洋与 Fabric 同时存在
时，再保存 Fabric 的 RGBA，复用 Model feature-style 的附件位置（按材质家族分别解释），
从而在屏幕阶段保持海洋→Fabric→天气/地表光照→大气的既有顺序。纯 Fabric 无海洋场景
保持本轮已验证的四附件路径；只有 water mask 的 Fabric 仍需海洋数据附件以排除湿润/积雪。
首批地形提交保存海面数据和必要 Fabric 覆盖，后续影像仍仅混合 albedo；不重复绘制地形，
不重新执行 Fabric，也不把海面高光保存为底色。波纹准备通过原函数的窄 hook 复用，
光照部分在屏幕端按原公式求值，所需少量代数代码记录上游来源和同步条件。

资源上，海洋在四附件基础上新增一张，海洋+Fabric 最多新增两张；已有 feature-style
附件可以容纳 Fabric 数据，不另增一张。与 feature-style、classification 共存的最大
同时附件数为七张。每张 RGBA16F 在 1280×800 为 7.8125 MiB，在 1920×1080 约
15.82 MiB；两张分别为 15.625 / 31.64 MiB。本机 Edge/D3D11 实测 draw buffers 与
color attachments 均为 8，fragment samplers 为 16。此预算高于此前分类批准的六附件，
需负责人确认；不因本机支持就默认提高设备门槛。

B：先重排/压缩已有 G-buffer，争取复用原有附件，再接海洋。仍保留海洋/Fabric 覆盖语义，
但需要重新验证法线、阴影、分类和 HDR 精度，扩大本阶段实现范围。尚未选择具体紧凑编码，
不会为维持附件数量先牺牲可见效果。当前为待决方案，不能据此移除 ocean/water-mask 限制。

负责人已选择 A，批准上述按需附件及最多七附件门槛，提升到 ADR-0161。
实现及 GPU/资源验证已完成，详见接入审计的 ocean increment；后续整阶段视觉 gate 尚未完成。

## Translucent inverse classification scheduling

不透明 inverse 增量已复用分类附件实现，未扩大已批准附件预算。原生 `Scene.executeCommands`、
`InvertClassification` 与 `OIT` 确认：alpha<1 时先把最近的 Tiles 表面保存在独立深度，
分类片元恢复为不透明，其余片元在专用透明通道中使用原深度合成。不能仅让最终屏幕颜色
乘 alpha，因为当前单层 G-buffer 已覆盖其后的 Globe/其他物体，背景材质与深度会丢失。

待负责人确认的 A：按需暂存 Tiles 材质，分类后把不透明部分并入主 G-buffer；未分类部分
用同一套延迟光照求值到 HDR 中间色，接回已有透明/OIT 通道。保留完整主 G-buffer 和
每个 Tiles command 一次材质提交，不维护完整不透明前向模式。预算上限为四张 RGBA16F
材质、按需要素样式 RGBA16F、一张 R32F 深度、RGBA16F HDR 色，以及原生分类 mask
RGBA8 和 DEPTH24_STENCIL8，合计最多 60 bytes/pixel：1280×800 约 58.59 MiB，
1920×1080 约 118.65 MiB。只在半透明 inverse 使用；最大同时材质附件门槛仍在已批准
七附件内。这是实现前的资源上界，具体复用、生命周期和耗时须在批准后验证。

B：独立 Tiles 深度/分类 mask 预通道，再按 mask 分流主延迟与配套透明绘制。
深度和 mask 的设计预算为 8 bytes/pixel（1080p 约 15.82 MiB），但 Tiles 几何要提交
深度、已分类材质、未分类透明三个阶段；需要严格保证最近层筛选、原生 alpha/MASK、
深度与阴影语义，街道大模型还需验证额外几何/command 开销。配套透明 Shader 可复用，
不等同于继续维护完整不透明前向管线。

建议 A，优先保留一次材质提交和完整共享表面数据；这显著扩大按需显存预算，必须先由
负责人选择，不能套用之前七附件批准。等待决定期间不实现半透明分支，不改变公共 API，
也不将当前 alpha=1 的资格当作完整反向分类完成。

负责人已选择 A，批准按需缓存 Tiles 材质与上述最多 60 bytes/pixel 临时资源上界，
优先避免重复几何提交。实现需保留背景表面、原生 IGNORE_SHOW、样式、透明/OIT 与
拾取语义，验证实际分配、resize/关闭释放及真实街道成本后才解除 alpha<1 资格限制。
该决定不同时批准尚未冻结的多视锥附件方案。

## Multi-frustum resource proposal

半透明 inverse 的 A 缓存路线已实现并通过单视锥技术验证。以下是另一次独立预算选择的提案，
负责人后续已选择 A，结论见本节末尾：
原生 Scene 对每个视锥段清除硬件深度，当前 G-buffer 的线性深度来自后续全屏拷贝；
跨段残留材质可能被新段的地球深度平面误配。只有深度数值还不足以表达当前段覆盖及
terrain depth=false 的原生远近绘制语义，需要同时记录段归属。

建议 A：只在实际多视锥时，把共享 R32F 改为 RG32F，材质写入时一起保存 eye-space
深度与视锥段标记，后续影像批次不修改它。统一表面完成后执行主延迟光照与屏幕效果，
再按原生远到近次序处理水、透明和拾取所需深度。复用原生分段、内容准备、深度平面、
透明/OIT；通过窄时序缝隙拆开透明 Globe 的分类 depth peel，使其与对应段一同执行，
不复制完整 Scene.executeCommands，也不重绘不透明几何来恢复深度。

此方案新增一个同时材质附件，基础多视锥为五附件，海洋/Fabric/分类组合最多八附件；
单视锥保留原布局。共享 R32F→RG32F 净增加 4 bytes/pixel（1080p 7.91 MiB），所有
材质连续字段保持原精度。本机已确认混合七 RGBA16F + RG32F 实际 framebuffer 完整，
但这只是能力证据。附件不足时明确报错，不静默降级。

半透明 inverse 还存在独立的跨段背景语义：原生在每段保存并合成该段最近的 Tiles，
因此远段和近段可有多个半透明层。一份全帧最近 Tiles 材质不能保留这些层。建议复用
同一材质缓存按段求值，分类部分并入主 G-buffer；未分类部分保存该段的 HDR 色和深度，
待主表面光照/屏幕效果完成后与对应段的原生透明通道合成。无须重复 Tiles 材质提交。
除原先单段缓存上限 60 bytes/pixel 外，每增加一个实际含 Tiles 的段，需要额外
RGBA16F+R32F，即 12 bytes/pixel（1080p 23.73 MiB）。分类 mask 在生成该段颜色时
剔除已分类像素，不为每段另存 mask。三个有 Tiles 的段比单段最多增加 47.46 MiB，
再加共享深度 7.91 MiB；段数减少/反色关闭必须及时释放。此预算不包括原生既有 OIT、
GlobeDepth 及 pick 目标，不能作为整场景显存总量。没有半透明 inverse 时不分配这些层。

B：先重排/压缩现有材质字段，将深度/归属加入后仍限制最多七附件，再做同一跨段时序。
这需要重新验证法线、阴影、样式与海洋精度；额外透明层的信息仍需保存，不能靠压缩
主材质消除。尚未冻结具体压缩格式。建议 A，保持此前精度优先方向；本次扩大同时附件
门槛和按段缓存预算，必须另行征求负责人确认，不能沿用上一次半透明缓存批准。

负责人已选择 A，批准按需 RG32F 深度/视锥标记、最多八附件，以及每额外含 Tiles 段的
12 bytes/pixel 半透明反色颜色/深度缓存。普通单视锥预算保持原有边界。决定提升到
ADR-0161；批准不代表跨视锥实现或资格验证完成，仍需验证遮挡、透明层、拾取与释放。

## Native environment replacement assessment

负责人提出已被高级实现覆盖的原生效果可以弃用，不应为延迟改造继续扩大重复兼容工作。
源码确认 `SceneGISEnvironmentEffects.validateGlobeConflict` 已要求关闭原生 Fog、
SkyAtmosphere、ground atmosphere 等输出；高级空气透视和高度雾与原生雾不会同时运行。
因此新页面默认开启原生雾所暴露的 Model atmosphere 缺口，不是高级环境运行的前提。

原生 `Fog.enabled` 同时控制地形雾剔除与 SSE 调整；`Fog.renderable=false` 只关闭 Shader
输出，仍会保留该裁剪策略。`GlobeSurfaceTileProvider.computeTileVisibility` 和
`QuadtreePrimitive` 的误差计算使用原生雾密度，不能直接认为其与高级大气的透射率相符。
当前高级环境要求完整关闭原生 Fog，已有行为不会因取消新兼容工作而额外失去这项优化。

建议新延迟路径统一使用已验证的高级环境，停止扩大重复原生视觉分支；保留地形遍历、
LOD、视锥/地平线裁剪等公共设施。若后续恢复雾裁剪优化，应依据高级大气的实际遮蔽建立
独立契约。此处为范围评估，尚未删除原生 API、现有兼容实现或宣称全部高级替代路径已验证。

后续按已确认的高级替代范围收敛新管线：停止扩大重复 native 视觉适配，先完成高级环境
的统一深度接入；接口弃用与旧代码清理需要明确记录，不留下静默无效参数。此次不推定
所有 native 能力都存在替代，不删除地形 LOD、影像、分类、拾取等公共设施。

### Water-inclusive final depth budget — approved A

高级环境与 TAA 都需水面后的深度，水面折射仍需不含水的 opaque 深度。WebGL 不能一边
采样 opaque depth 一边把同一纹理作为输出；二者语义也不同，不能就地覆盖。现有 TAA
已分配独立 R32F 并在水面原始绘制的第二附件写入，可直接借用。

- A（推荐）：仅在可见水面、高级深度效果和关闭 TAA 的组合下按需增加 R32F，
  4 bytes/pixel（1080p 7.91 MiB）；复用原始水面绘制，不增加几何提交。条件不再成立时释放。
- B：暂时明确拒绝多视锥、水面、高级深度效果与关闭 TAA 的组合，后续再补。

负责人已选择 A，批准条件 R32F 的 4 bytes/pixel 预算。TAA 开启时借用其现有目标；
无 TAA 的多视锥水面由已有 WaterFrame 按需保存最终深度。原始水面绘制同时输出颜色与
线性深度，复用原有 TAA 水面派生逻辑；不增加几何提交。高级深度效果关闭、水面退出可见
命令列表、切回单段或开启 TAA 时释放额外目标。批准不代表实现与资源资格已完成。
