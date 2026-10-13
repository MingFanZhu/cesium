# Review: P4c Globe 入口审计

## Metadata

- Status: passed，2026-10-14 技术、自审与负责人视觉复验通过
- Reviewer role: architecture，当前任务自审；未启用独立评审 Agent
- Target: P4b checkpoint `5bde0722ba` 至当前 P4c Globe、跨视锥与环境接入
- Parent: [P4c draft](../plans/2026-10-13-p4c-globe-integration.md)
- Discussion: [调度边界](../discussions/2026-10-13-globe-scheduling-boundary.md)
- Created: 2026-10-13
- Updated: 2026-10-14

## Findings

2026-10-14 视觉反馈新增 WDR-P4C-08（high，verified，execution）：密集分段使蓝色
GroundPrimitive 缺失覆盖。SGP-0053 修复自动日志深度 discard 破坏分类体封闭性的问题，
新增回归前红后绿，详见文末证据；负责人已确认缺口消失，批准 P4c 独立提交。

| ID         | Severity | Status   | Owner         | Evidence / follow-up                                                                                                                              |
| ---------- | -------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| WDR-P4C-01 | high     | verified | architecture  | 单视锥 clearGlobeDepth 已复用统一 R32F，真实抬高地形/地下物体、原生拾取与 TAA/water/resize 通过；跨视锥见 03。                                    |
| WDR-P4C-02 | high     | verified | execution     | 多影像只合成 albedo；基础 terrain/Tiles 分类复用原生 stencil，按需覆盖附件与实际 Entity/Tiles、拾取和响应测试通过。inverse 见 06。                |
| WDR-P4C-03 | high     | verified | architecture  | RG32F/八附件、跨段半透明反色、透明 Globe 与高级环境/水面最终深度已有 GPU/E2E 证据；71 项延迟 Specs 通过。阶段交付与视觉 gate 单独收尾。           |
| WDR-P4C-04 | high     | deferred | execution     | 原生 Globe 多影像叠加局部灯超出 16 samplers。负责人取消前向兼容后，不优先修补被替换路径；P4c 分离材质/光照纹理预算并验证，旧缺陷未声称修复。      |
| WDR-P4C-05 | gate     | resolved | project owner | 负责人先选择 A，随后取消完整前向兼容要求。ADR-0161 取代过渡 Globe 前向方案，按统一不透明延迟推进。                                                |
| WDR-P4C-06 | high     | verified | execution     | alpha=1 的 IGNORE_SHOW/乘色及 alpha<1 的 A 缓存路线已验证；背景、样式、原生透明/OIT、七附件、拾取和释放有 GPU 证据。多视锥另见 03。               |
| WDR-P4C-07 | high     | verified | execution     | Fabric、海洋、fill/underground、裁剪、原生 vector 与原生透明 Globe 已验证；独立矢量 direct surface overlay 属后继矢量阶段，不据此解除其组合限制。 |

以下按增量保留审计过程；早期未完成或待批准描述已由文末最新证据替代，未解决的遗留问题继续保留。
入口复现为已构建 P4b 的实际 GPU 行为。当前已登记 SGP-0051 并增加 GlobeFS 材质 hook；
真正的 imagery G-buffer、原生/物理/局部光照、AO 间接分量与合成后的天气已有 GPU 证据。
WDR-P4C-02 的多影像和基础 classification 已通过；WDR-P4C-04 的新延迟路径已通过
超过硬件采样槽数的多影像与局部灯组合，原前向缺陷仍保留记录。其余调度问题未声称修复。
当前改动的 upstream-owned files 为 `packages/engine/Source/Shaders/GlobeFS.glsl`
（材质/裁剪/海洋 hook SGP-0051，既有物理地表调用 SGP-0009 显式传入几何法线与已排除水域的湿润度），以及
`packages/engine/Source/Scene/Scene.js`（SGP-0046，保存地表深度、统一 TAA/water 深度及分类目标调度）。
Fabric 后续增量增加 `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js` 的窄预算 hook
（SGP-0051），在原生 imagery batching 前预留当前 Material 及子材质的纹理槽。
方向见 [ADR-0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md)。
源码纠正：只有 AO/SSR 有既有 replay，SSIL 要求主 MRT；不可沿用旧草案对三者的概括。

## Implementation evidence in progress

- 35 项 `SceneGISDeferred*` GPU Specs、12 项 `SceneGISSurfaceWeather` 与一项物理地表
  radiance/空气透视端点测试通过，含真实多影像绘制、资源归属及此前 Model/Tile/Primitive 回归。
- 一个测试最初直接导入源文件 `ContextLimits`，与组合 Specs 的 IIFE runtime 不是同一实例，
  错读采样上限为 0；改为 index runtime 导入后真实触发多影像分批，未为测试增加产品分支。
- 既有 readable-night 测试在背景 cloud-shadow 绘制报 `INVALID_OPERATION`；大型 Beer atlas
  测试存在 STBN/history、analytic inverse mutation 等失败。用 P4b `5bde0722ba` 原源码
  隔离生成 runtime 与原 Specs 后，两项均复现相同失败，确认不是本次增量回归。隔离生成
  不修改工作树源码或服务 bundle；保留失败为待调查环境测试债务，不扩大本次材质接入为云实现重构。
- 当前无完整 phase gate；inverse classification、跨视锥等产品资格仍待完成。
- 1280×800 Edge/D3D11 的实际 Bistro + Globe 混合场景 smoke 通过：启用物理天空、既有
  TAA/屏幕效果，干燥/湿润/积雪三种状态无 page/WebGL 错误；72 条 Globe commands，
  全场 1548 次材质、2 次屏幕光照（Model 与 Globe），控制器自有材质纹理 31.25 MiB。
  该视角为单视锥、地表深度开启、原生 ground atmosphere 关闭；未据此宣称默认 Globe
  或整阶段通过。截图已检查，尚无负责人视觉 gate；GPU 耗时在调度完成后测量。
- 深度增量的 37 项 `SceneGISDeferred*` 与 13 项既有 TAA Specs 通过；随后新增的原生
  ground atmosphere/fog 连同 resize、AO+water 的 8 项 Globe Specs 通过。按唯一用例计，
  本轮覆盖 39 项延迟与 13 项 TAA，未将重复运行累加。地形用例使用真实 2000 米
  Heightmap 和 600 米高物体，明确区分地形与原生 ellipsoid depth plane。
- 默认地表清深度的 Bistro + Globe smoke 以原生光照、ground atmosphere、TAA 和天气
  验证，72 条 Globe commands、1548 次材质、2 次光照、自有材质纹理 31.25 MiB，无
  page/WebGL 错误。高级环境控制器显式关闭；其既有契约仍强制 terrain depth 为 true，
  因此不能把这次证据声称为高级环境与 terrain depth=false 已接通。此前 physical=true
  的 smoke 仍对应 terrain depth=true。高级后处理的深度消费者在后续调度审计中保留。
- 原生大气复用上游散射函数，在屏幕端按可见地表位置计算；雾/地表大气的 AO 响应经仿射
  合成的线性部分变换，不遮蔽散射。1280×800、单色椭球、默认 terrain depth=false，
  开启大气的近地/太空/地平线 GPU 全帧中位数约 0.41/0.71/0.57 ms，单次采样有波动；
  仅说明本次基本场景的成本，没有据此宣称相对加速或外推真实纹理地形/街区性能。
- 定向 ESLint、开发构建与上游补丁审计通过。审计发现不允许嵌套 SGP 标记，已将 TAA hook
  改为独立且窄小的 SGP-0046 段；没有格式化或修改旁邻 Cesium 代码。

## Next source boundaries

基础分类与裁剪增量：45 项 `SceneGISDeferred*` GPU Specs 全部通过，包含新增 4 项分类与
2 项裁剪。分类测试使用真实 GroundPrimitive / DataSourceDisplay Entity 与有 batch table
的 Tiles；验证多层预乘 alpha、与 feature style 共存的第六附件、动态 Entity 材质、后画
物体遮挡、原生 pick、AO/SSR/SSIL 响应及 resize/卸载/destroy。SSR 用实际 KTX2 specular
IBL，确保四种被检查的响应均非零后再验证 alpha 衰减，避免零值比对掩盖问题。
经纬度零点的贴地样例在原生和延迟均不可见，改用经纬度 1 度处确认正常的原生样例，
没有为该测试修改地形高度或增加产品分支。边缘颜色保持原生 post-light 语义，多边形
在材质写入前 discard；裁剪与动态 inverse 的 G-buffer/深度/拾取验证通过，无新增附件。

1280×800 Edge/D3D11 的 Bistro + Globe + 贴地 Entity 检查通过，移动相机后覆盖色仍在
地面，建筑遮挡正常，TAA ready，无 page/WebGL 错误。使用原生地表大气与默认地形深度
清除，高级环境控制器显式关闭。分类前后材质均 1537 draw、屏幕光照均 2 draw；分类
复用 2 次 stencil/color draw，自有材质由 31.25 增至 39.0625 MiB，恰为批准的 7.8125 MiB。
9 次整帧 GPU 样本中位数约 20.11 / 18.34 ms，范围 16.69–24.21 / 17.33–21.72 ms；
两组波动交叠，不将这次采样解释为分类带来加速。移动后 1538 次材质、2 次分类与 2 次
光照正常，已检查截图，尚未进行负责人整阶段视觉 gate。测量时移除/重新加入 Entity，
因为原生静态批处理的 Entity.show 只改变实例属性，隐藏对象仍可提交 classification commands。
按需分配依据这些实际 commands；没有声称仅修改 show 就一定释放附件。

定向 ESLint、开发 build、Markdown 检查、diff 检查与 SGP 审计通过；新增代码只涉及前述
两个 upstream-owned files。完整 release/types 仍在 P4c 总 gate 执行，不为每个内部增量重复。

`Scene.executeCommands` 每个 frustum 的原生清深度仍保留。单视锥在清 Globe depth 前
保存 terrain 的线性深度，后续只更新有新 G-buffer 材质的非 Globe 像素；深度平面不会
覆盖保留的地形值。TAA 在 water 前复制统一不透明深度，water 原绘制向 TAA 自有 R32F
同步写深度；不恢复会改变透明遮挡语义的 native terrain depth，不新增深度纹理。

基础分类按负责人批准的按需 RGBA16F 附件实现，资格不含 inverse classification。
跨视锥和其余 Globe 材质/覆盖分支仍待接入，不把当前增量视为整阶段完成。
完成 Globe 视觉与技术 gate、独立提交以后，才激活前述 Entity/Primitive/
Model/Tile 不透明前向冗余清理阶段。

## Fabric sampler and composition increment

`Globe.render` 已在 tile commands 发布前执行 `Material.update`，包括默认/异步纹理与子材质。
预算 hook 直接统计当前 `_textures`，递归子材质，不增加 Material 公共接口、纹理副本或
隐式缓存。每个 tile 原来的最后一批影像独自合成 Fabric；中间批次保留 straight alpha，
避免重复叠色或丢失前面批次。原生 terrain-normal 资格判断与调用方的 Material 所有权保留。

48 项 `SceneGISDeferred*` GPU Specs 通过，新增三项 Fabric 测试覆盖 Color alpha 与日夜/
局部灯、嵌套双贴图与 17 层影像、动态换图/透明度、移除与资源归属、容量不足明确报错。
本机 16 槽在双贴图时每批影像 14 层；移除 Fabric 后恢复 16 层。附件仍为四张，材质
draw 与原生影像批数一致。第一轮一个失败来自不存在的测试 matcher，改用现有
`toThrowError(RuntimeError)` 后容量用例及全部延迟回归通过，没有为测试修改产品错误路径。
当时尚未编码的 Fabric 水掩码在后续海洋增量接入，证据见下文。

1280×800 Edge/D3D11 的真实 Bistro + Globe、17 层影像、原生阴影/地表大气和 TAA 检查
通过。阴影预留一槽，Fabric 前后每批影像上限为 15/13；均为 1598 次材质、122 次 Globe
批次与 2 次屏幕光照，四附件/31.25 MiB 不变。9 次整帧 GPU 中位数 14.37/14.11 ms，
范围 11.99–16.56/13.51–17.99 ms；不声明性能提升。移动后 TAA ready，无 page/WebGL
错误，已检查截图，禁用延迟不销毁借用的 Fabric 贴图。测试初稿在禁用延迟后额外渲染旧
完整前向路径时抛出 RuntimeError，未取得可用诊断；最终脚本只检查禁用时的资源释放，
不把已取消维护的完整前向多影像路径计入本次通过范围，也不声称该错误已修复。

开发 build、定向 ESLint 与 SGP 审计通过；本阶段当前共三个 upstream-owned files，
新增 Fabric 预算只涉及上文 `GlobeSurfaceTileProvider.js` / SGP-0051，其余物理地表、
GlobeFS 与 Scene 集成缝隙及编号保持上述记录。完整 release/types 与负责人视觉仍待总 gate。

负责人已将独立矢量切片适配加入持续目标，记录在总体计划；并非原生 `HAS_VECTOR_LAYER`。
普通 Primitive 资格不代表其自有 Shader/command 已接通，后续阶段单独审计。

## Ocean and water-mask increment

负责人批准 A 后实现按需海洋附件。波纹仍由原生双层 normal-map 函数生成，材质阶段在
任何海面光照前返回；屏幕阶段根据保存的法线/mask 计算原生海面高光，再合成独立 Fabric，
接入天气、地表光照与大气。Fabric 仅求值一次，后续 imagery batches 仍只写 albedo。
少量屏幕端高光公式记录上游基线和同步条件；不复制波纹、纹理更新或地形设施。

53 项 `SceneGISDeferred*` GPU Specs 通过，新增五项海洋用例使用真实 HeightmapTerrainData
water mask，验证平静海面的 native HDR 对照、17 层影像与嵌套贴图 Fabric、覆盖 alpha、
Material.WaterMask、天气水域排除、动态波纹、拾取、5/6/7 附件、resize/disable/destroy
和不足容量明确报错。七附件用例包含真实 batch-table Tiles 与 ClassificationPrimitive，
确认同一附件按材质家族分别保存要素样式和 Fabric，物体遮挡后清除旧海洋/分类字段。
波纹用例采样相隔 120 帧的明确动画时刻，避免把低于纹理/FP16 分辨率的一帧变化误判为失效。

自审发现物理地表 wet-film 原先重新计算覆盖率，会丢失 water mask。现在传入已求值且
排除水域的 wetness；真实物理 Globe 用例验证全水区域不因湿润/积雪变化而改变受光。
12 项既有 SurfaceWeather Specs 通过；三个既有 private shader helper 调用同步新参数。
未增加公共 API、额外绘制或测试专用产品分支。

1280×800 Edge/D3D11、真实 Bistro + Globe、17 层影像、原生阴影/地表大气与 TAA：
海洋和双纹理 Fabric 前后均为 1790 次材质、314 次 Globe 批次与 2 次屏幕光照。
影像采样槽上限从 14 到 11；四附件 31.25 MiB 变为六附件 46.875 MiB，增量恰为
批准的 15.625 MiB。9 次整帧 GPU 样本中位数 14.90/15.40 ms，范围
13.47–21.04/14.36–22.18 ms，波动交叠，不外推普遍性能结论。移动后 1788 次材质、
312 次 Globe 与 2 次光照，TAA ready，无 page/WebGL 错误，截图已检查；
禁用时借用的 Fabric 贴图仍存活。测试使用四象限水掩码与诊断贴图，不替代负责人视觉 gate。

开发 build、定向 ESLint 和上游补丁审计通过。本阶段仍仅修改上述三个 upstream-owned
files，海洋集成使用 SGP-0051，物理地表 wetness 调用位于既有 SGP-0009。
inverse classification、多视锥、其他未资格确认的 Globe 分支与
高级环境深度消费者仍未完成；保留相应限制，后续继续本阶段，不提前建立阶段 checkpoint。

## Fill and underground display increment

复用 mode 的 512/1024 两位记录原生 fill tile 与背面地下显示资格；全部标志最大 2047，
仍由 FP16 精确保存，不新增附件或采样。统一光照后依次合成裁剪边缘、fill highlight、
原生大气和 underground color；距离渐变使用重建表面距离、原生 NearFarScalar 和椭球
高度扣除。覆盖色衰减 AO 响应，既有 albedo/alpha、天气和 Fabric 语义不变。
Globe 组的首条 command 未必是 fill tile，fill color 直接读取统一 Globe 参数；
underground 的统一颜色/距离参数继续复用每条 native command 都准备的 uniform map。

20 项 Globe GPU Specs 全通过，新增两项覆盖真实 TerrainFillMesh 绘制和地下相机，
包括同条件 native HDR 参考、透明度/距离/颜色动态更新、背面限定、AO 分量衰减、
原生拾取、draw/附件字节不变。fill 用例冻结已选瓦片并暂时移除其 vertex array，
由原生 provider 生成真实 fill mesh，测试结束恢复原资源；没有替换 shader 或增加产品分支。
首轮测试没有先生成 GLSL 对应的 JS，运行了旧 Shader；显式开发 build 后全部通过。
该问题属于验证入口顺序，不添加产品兼容或重试逻辑。

真实 Bistro + Globe、海洋、双纹理 Fabric、17 层影像、阴影、大气与 TAA 的 1280×800
检查通过。对固定的真实 fill meshes 开关高亮，均为 1790 次材质、314 次 Globe 提交、
2 次光照、六附件/46.875 MiB；移动后无 page/WebGL 错误，截图已检查。9 次 GPU 样本
中位数约 22.03/24.55 ms，范围 18.35–27.08/21.85–27.29 ms，波动较大，记录为本场景
成本证据，不声称零耗时或普遍性能结论。设备/分辨率同上，未与海洋增量的不同几何状态
直接作加速对比。

本显示增量仅涉及 SceneGIS 自有 Shader、控制器与 Specs，没有新增 upstream-owned file
改动。开发 build、ESLint 与 SGP 审计通过；整阶段 release/types、负责人视觉 gate 和
独立 checkpoint 尚未执行，后续继续 inverse classification、多视锥及剩余深度消费者。

## Opaque inverse classification increment

alpha=1 的反色仍采用单一不透明延迟。Tiles 材质按原 command 提交一次，复用原生
IGNORE_SHOW 分类 stencil，然后一次屏幕标记将未分类的 Tiles 像素写入现有分类附件：
RGB 是乘色，alpha=-1 是操作标记。普通分类仍为预乘覆盖色；原生 mask 判定使两者
互斥，随后出现的普通物体仍随材质提交清除该字段。光照完成后在 Model/feature 着色
之外应用反色，AO/SSR/SSIL 响应同步乘色。新延迟场景无需创建原生 invert 的颜色副本。

57 项 `SceneGISDeferred*` GPU Specs 全通过，其中分类从 4 项扩为 6 项。新增用例使用
真实 Tiles 与部分覆盖分类体，验证与 native HDR 参考的误差边界（参考的原生 invert
中间色为 RGBA8，测试用低强度光照避免其饱和）、动态反色、feature.color、实例 show=false
仍参与 IGNORE_SHOW、同步拾取和深度拾取、材质值不变。另一用例确认四类非零共享响应
按 RGB 正确缩放、前景物体清除反色、不存在无用 native color FBO、resize/关闭释放，
仅有 Globe 无 Tiles 时不分配分类附件；五附件设备在实际需要六附件时明确报错。
alpha<1 保留具体背景保存资格错误，未将不透明用例通过扩张为透明语义已支持。

真实 Bistro 经 3D Tiles 1.1 单瓦片头加载，继续复用相同 glTF、ENU 放置、IBL 和 Globe。
1280×800 Edge/D3D11、TAA、原生地表大气、部分区域分类与反色：前后都是 1537 次材质、
2 次光照、五附件/39.0625 MiB。分类从 2 次变为 4 次（额外一次 IGNORE_SHOW 和一次
屏幕标记），原生 invert color FBO 未分配。当前视角有 20247 个分类像素和 73350 个
未分类像素，确认不是只验证空区域。9 次整帧 GPU 中位数约 12.97/14.00 ms，范围
12.45–21.68/12.43–15.04 ms；仅记录本场景成本，不作普遍提速/零成本声明。
最初临时 tileset 的顶层 geometricError=0，原生 traversal 在请求前因父级 SSE 为零
直接退出；修正测试数据的顶层误差、叶瓦片仍为零后正常加载，未为测试修改产品代码。

另完成同一街区局部相机移动检查：1538 次材质、4 次分类、2 次光照，五附件和
39.0625 MiB 不变，TAA ready，无 page/WebGL 错误，移动截图已检查。最初计时脚本的
世界坐标绕转离开了街区，不作为局部移动证据；修正为相同 ENU 原点的局部相机操作后
单独完成移动检查，未重复整帧性能采样。

本增量仅扩展已登记的 Scene.js / SGP-0046 调度缝隙，未新增 upstream-owned file；
其余现有三文件及 SGP 清单不变。开发 build、ESLint、格式与 SGP 审计通过。
半透明反色路线为待决事项，见调度讨论；整阶段仍未达到视觉/交付 gate。

## Multi-frustum scheduling follow-up audit

等待半透明 inverse 预算决定期间复核当前调度，未修改产品资格：

- `Scene.executeCommands` 按远到近逐视锥执行 Globe、分类、opaque、屏幕光照、水与透明，
  每段开始清除 native depth/stencil；不透明段 near 有重叠偏移，透明段恢复原边界。
  原生拾取深度也在每段结束保存，不能简单将最后一个硬件 depth 当作整帧深度。
- 延迟 `begin` 仅依据 `frustumCommandsList[0]` 预检和准备组，`light` 完成后关闭 `_active`。
  `LightingMrt.layout` 同样只检查首段；仅删除单视锥限制会使后续段不再提交延迟材质，
  还会漏检其他段的附件与材质资格。
- 现有 R32F 已表示 eye-space 距离，可以作为跨段共享深度的基础。但材质身份没有记录
  当前段覆盖；直接保留旧材质并用下一段投影转换硬件 depth，会让旧像素和新投影失配。
  `clearGlobeDepth` 的 Globe 保留标记也必须按段处理，不能沿用当前全帧单一布尔状态。
- AO、SSR、SSIL 的主 MRT resolve 首次执行后均将 `mainActive` 置为 false，并以完整
  camera frustum 做屏幕求值。每段重新运行整套效果还涉及历史更新与重复合成，不能通过
  重新打开 active 状态就宣称跨段正确。TAA 的 deferred depth 复制也需对应完整表面，
  保留近段 water 已写入的深度，避免后续整屏复制覆盖它。

后续必须先确定跨段材质/深度归属与效果执行边界，并同时核对原生透明、OIT、水和
pick depth 的顺序；不引入完整不透明前向回退。验证至少包含真实双视锥、横跨边界的
同一物体、远近遮挡、地表清深度以及共享效果历史。该审计只明确当前实现的依赖，未批准
额外附件或改变场景语义；WDR-P4C-03 保持 open。

透明 Globe 接通后的源码补充：其 classification framebuffer 在 executeGlobeCommands
清除，executeGlobeClassificationCommands 同时处理主目标上的不透明面分类及内部
透明面 depth peel。因此若将所有透明绘制移到完整表面解析之后，必须同步拆开这个
执行边界；不能沿用最后一段的 classification 颜色/深度绘制其他段的透明地球。
共享效果已按完整 camera frustum 重建线性深度，跨段不需要为每一段维护独立历史；
需要先提供完整且一致的输入，仍在水和透明之前解析一次。

当前 copyDepth 只以材质身份和硬件 depth < 1 判断写入资格。跨段保留材质时，
clearGlobeDepth 后的 depth plane 可能在旧的非 Globe 材质像素写深度；据此复制会把旧
材质与当前椭球深度拼接。这是按源码推导的待验证失败模式，尚未声称有 GPU 复现。
后续方案需要显式的当前段覆盖信息，或直接随材质写入线性深度；具体资源、分批混合
和透明深度恢复合同未冻结。不可通过调整现有 bool 或移除资格检查代替该设计。

## Native Globe vector increment

`VectorCommon.vectorPolygonRender` 与 `vectorPolylineRender` 已确认是预乘 source-over，
保持面先线后、位于地表光照/大气/underground 后的原生语义。材质首批直接调用原函数
得到独立覆盖色，复用分类附件，不执行光照；其后原生 terrain classification 在同一
附件上继续混合。后续影像批次仍只写 albedo，前景物体照常清除此覆盖值。未增加 mode
标志、附件上限或几何重放。GlobeSurfaceTileProvider 的 SGP-0051 hook 同时预留八个
原生 vector sampler，避免与 Fabric/多影像争用硬件槽位。

59 项 `SceneGISDeferred*` GPU Specs 通过，其中 Globe 从 20 项扩至 22 项。新增用例
使用真实 BufferPolygon/BufferPolyline 和原生 VectorProvider，验证 HDR 原生参考、
面线顺序、动态颜色、光源变化不改变覆盖色、terrain classification 的后续合成、AO
共存、前景物体遮挡和同步拾取，以及卸载、resize、关闭、借用纹理与容量错误。
17 层影像加两个 Fabric 贴图和八个 vector sampler 时，本机无阴影测试每批最多 6 层；
材质底色不含矢量覆盖，覆盖色只合成一次。首轮失败仅是测试误调用 FramebufferManager
不存在的 isDestroyed；改为检查其原纹理的销毁状态后通过，没有修改产品生命周期。

1280×800 Edge/D3D11，真实 Bistro、原生地表大气、阴影、17 层影像、双贴图 Fabric 与
TAA：无矢量为 1598 次材质/122 次 Globe/2 次光照，四附件 31.25 MiB；有矢量为
1642/166/2，五附件 39.0625 MiB。新增地形批次来自八个 sampler 的真实预留：带矢量
瓦片每批影像从 13 降为 5，无矢量瓦片保持 13。覆盖 457937 个像素，建筑遮挡正常，
局部移动后 1644/168/2，TAA ready，无 page/WebGL 错误，截图已检查，借用贴图未销毁。
9 次整帧 GPU 中位数 13.48/13.76 ms，范围 12.06–16.38/13.19–17.08 ms；波动交叠，
仅记录成本，不外推普遍性能结论。

开发 build、定向 ESLint 与补丁审计通过。该增量只扩展现有 GlobeSurfaceTileProvider /
SGP-0051，整阶段的 upstream-owned files 仍为之前登记的三项。保留半透明 inverse
待决、多视锥和当时的透明 Globe 限制；不替代独立 SceneGISVectorTileLayer 的后继阶段，
未执行整阶段 release/types、负责人视觉或 checkpoint。

## Native translucent Globe increment

原生透明 Globe 的不透明面进入 G-buffer；colorMask 全关的 Globe 深度命令不计作材质，
分类深度 peel framebuffer 内的原生命令继续执行到原目标，避免共享 MRT 接管。透明面
仍在原透明/OIT 阶段合成，复用其分类颜色与深度资源，不增加延迟材质附件或几何重放。
独立 SceneGISVectorTileLayer 的 direct surface overlay 会提前执行透明 Globe，仍保留
显式资格限制，待后继矢量阶段处理，不能与原生 HAS_VECTOR_LAYER 混为一谈。

新增三项 GPU Specs 后，最新 62 项 SceneGISDeferred 用例全部通过，其中 Globe 为 25 项：

- 前/背面三种透明组合、真正启用透明状态的地下相机、原生 HDR 参考、AO/TAA、关闭恢复；
- 原生 ClassificationPrimitive 的深度 peel、前后面分类、主 G-buffer 不误接分类、原生拾取；
- 17 层影像与局部灯先复现 MAX_TEXTURE_IMAGE_UNITS(16) 链接失败，再验证纹理预算修复。
  本机原生分类占一槽；局部灯占一槽时每批 14 层，移除灯后 15；物理天空三槽时为 12，
  再加局部灯为 11，关闭物理天空恢复 14。动态状态和实际 Shader 编译均通过。

预算修复复用 SGP-0051 hook，仅在保留的透明配套通道预留当帧 LocalLights.prepare
显式发布的 0/1 灯表槽，以及已有 transmittance/irradiance/cloud-shadow 三槽；不改变
灯光 API、不新增纹理，不给已取消的完整不透明前向路径增加兼容实现。

1280×800 Edge/D3D11、RTX 3060 Ti，真实 Bistro、原生地表大气、terrain depth=false、
TAA 与贴地矩形分类：不透明/前面 0.5 后面 1.0 均为 1537 次材质、2 次分类、2 次延迟光照，
五张材质附件 40960000 bytes（39.0625 MiB）。透明 commands 从 115 增至 176，
原生分类 framebuffer 覆盖 519426 像素。局部相机移动后 1538 次材质、177 个透明命令，
TAA ready，无 page/WebGL 错误，截图已检查。9 次整帧 GPU 中位数 13.27 → 14.58 ms，
范围 12.15–14.13 / 11.71–16.53 ms；区间交叠，仅记录该组合的成本，不作普遍结论。
材质附件不增加不等同于原生透明分类/深度资源无需内存。高级环境没有用于此次成本场景，
仍遵守其 terrain depth=true 的既有契约；物理纹理槽由上述 GPU Specs 单独验证。

开发构建、定向 ESLint/格式/Markdown 检查与上游补丁审计通过；最新审计 current delivery 为三项 upstream
文件、768 marker tokens、generated status 0。本增量只扩展 GlobeSurfaceTileProvider
已有 SGP-0051 调用；另外两项仍是 Scene.js / SGP-0046、GlobeFS.glsl / SGP-0051 与
SGP-0009。半透明 inverse 的预算选择、多视锥、整阶段完整检查和负责人视觉 gate 未完成。

## Translucent inverse classification increment

负责人选择 A 后，按需缓存 Tiles 四张材质、可选样式、独立深度与分类 mask。分类表面
通过屏幕拷贝并入主 G-buffer，其余表面复用原延迟光照组进入 HDR 色，再交给原生排序
透明/OIT。每个 Tiles command 仍只提交一次材质，未引入完整不透明前向实现。主材质
保存其后方 Globe/普通物体；原生 packed GlobeDepth 继续接收全部 Tiles 深度，保留
pickPosition。颜色乘法、深度与 stencil 合同的少量来源及同步条件已记入 ADR-0161。

64 项 SceneGISDeferred GPU Specs 通过，新增两项分类用例验证：

- 实际 Tiles/部分分类体、feature.color、IGNORE_SHOW 隐藏实例，原生 HDR 参考；
- OIT 与非日志排序透明、背景材质/混色、前景深度、普通透明物体与 AO/SSR/SSIL/TAA；
- resize、alpha 恢复 1、关闭与移除全部 Tiles，所有自有纹理释放且主场景深度存活。

随后在既有两项用例补强七附件 ocean/Fabric/style/classification 合并和原生深度拾取
位置对照，两项定向通过，不重复累计为新增 Specs。关闭/卸载验证还覆盖原生 GlobeDepth
借用的 framebuffer 与引用确实解除，避免删除纹理后仍被 native FBO 持有。
新增 GlobeDepth.releaseDepthSource 是 SGP-0046 窄生命周期 hook；原生 Scene.destroy
先销毁 view，helper 在此顺序下不会二次访问原生对象。最初排序测试中的中间颜色断言
遗漏原生顶点颜色的字节量化/HDR gamma，改用纯色并保留原生 HDR 和混色代数对照，
没有改变产品色彩转换。非日志夹具以 near=10 保持本阶段已批准的单视锥契约。

真实 1280×800 Edge/D3D11、RTX 3060 Ti、Bistro 作为 Cesium3DTileset、Globe、TAA、
部分分类与 alpha=0.5：材质前后 1537 次，分类 2→5 次，延迟光照 2→3 次；主材质仍为
五附件。当前无要素样式的 cache 为 53248000 bytes（50.78125 MiB），有样式上限仍为
60 bytes/pixel（1080p 118.65 MiB）。这是 cache 自有资源计数，不包含原生 GlobeDepth
复制和 OIT 既有目标；不能当作整个场景的新增/总显存测量。主 G-buffer 在 73321 个
未分类可见 Tiles 像素全部保留背景，20270 个像素为已分类。原生 invert color FBO 未分配。
9 次整帧 GPU 中位数 12.57→13.02 ms，范围 12.29–14.23 / 12.65–16.34 ms，区间交叠。
局部相机移动后 1538 次材质、5 次分类、3 次光照，TAA ready，无 page/WebGL 错误；
截图已检查，不替代负责人完整阶段视觉 gate。

## RG framebuffer qualification increment

多视锥布局审计实际复现原生 Framebuffer 拒绝 RG32F。PixelFormat 已定义/验证 RG 且
具有 internal-format 映射，但 isColorFormat 漏列；SGP-0052 只补这一枚举判断。
新增一项 GPU Spec 同时绘制/采样 RGBA16F 和 RG32F，验证 1234567.75 的深度数值、
独立通道与借用纹理生命周期，通过。实机另外确认七张 RGBA16F 加一张 RG32F framebuffer
完整，MAX_DRAW_BUFFERS/MAX_COLOR_ATTACHMENTS 均为 8；仅为硬件能力证据，未据此
采用八附件场景布局，也未取消多视锥限制。

原生 Framebuffer/FramebufferManager 定向回归 69 项通过、1 项失败：旧的 datatype-change
用例尝试 RGBA/UNSIGNED_INT，texImage2D 报 INVALID_OPERATION。将 P4b 原源码隔离构建
后运行同一用例得到相同失败；保留为原生夹具问题，不修改产品来容忍无效纹理格式。

开发 build、定向 ESLint、格式及上游补丁审计通过；当前阶段 upstream-owned files：

- Scene/Scene.js：SGP-0046，延迟时序、分类/透明通道与原生深度输入；
- Scene/GlobeDepth.js：SGP-0046，明确解除临时深度借用；
- Scene/GlobeSurfaceTileProvider.js：SGP-0051，影像/材质/透明光照纹理槽预算；
- Shaders/GlobeFS.glsl：SGP-0051、SGP-0009，材质捕获与物理地表输入；
- Core/PixelFormat.js：SGP-0052，接受已有 RG color format。

以上路径均相对 packages/engine/Source。审计 current delivery 为五项 upstream 文件、
776 marker tokens、generated status 0。多视锥、整阶段 release/types、负责人视觉与
独立 checkpoint 尚未完成；本增量不进入后继清理/独立矢量阶段。

## Multi-frustum material and environment-depth increment

已按批准预算实现全部 ranges 的材质资格/光照组收集、RG32F eye depth/tag、一次完整
光照及 AO/SSR/SSIL 解析，然后恢复逐段硬件深度执行专用水面/透明/拾取通道。66 项
延迟回归通过；随后新增一项真实抬高地形/近物体跨段用例，以及既有七附件组合扩至八
附件的强化用例分别通过，不把重复运行计为新增测试。内容包含日志/非日志、近物体阻挡
远透明、原生地表清深度、pick/pickPosition、共享目标所有权、resize 和恢复单段 R32F。

1280×800 Edge/D3D11，独立海岸页由一段强制改为二十段，材质提交 4→39、光照仍为 3，
组合附件 7→8；AO 持有共享深度，Deferred 自有计数仍为 57344000 bytes。共享 R32F
改 RG32F 增加 4096000 bytes。九次整帧 GPU 中位数 6.56→8.10 ms，区间交叠；这是强制
分段压力场景的成本记录，不能作为提速结论。页面/WebGL 错误均为零。

截图发现贴地矩形出现缺角后，以同一相机、固定 Clock、停用 TAA 与雾并冻结地形 LOD
对照 native/deferred 的一段/二十段输出。相同缺角在 native 二十段亦存在，延迟分类与
其一致；保留为原生强制小视锥边界问题，未为当前接入修改分类算法。

高级环境仍有独立的真实缺口：在像素 (400,250)，统一 depth/tag 为约 1465.56/14，
最终 native depth 却为 clear=1。高级空气透视、云接收与镜头遮挡必须读取完整线性深度，
不能把最后一段 native depth 当作整帧。当前已开始接入；其正确性与水面最终深度另行验证。
开启 TAA 时已有最终 R32F 可借用；无 TAA 且有水面时，水的 opaque 输入不能同时作为
输出附件，需要条件 R32F（4 bytes/pixel，1080p 7.91 MiB）。预算 A/B 已提交负责人，
未收到确认前不实施新增分配。跨段半透明反色、透明 Globe 仍为明确未完成项。

高级环境统一深度增量已通过一项真实 GPU Spec：同一抬高地形的单段/多段空气透视与
高度雾颜色一致，验证 native 最后一段 clear=1 而共享深度仍为约 8000 米；透视/正交、
TAA 开关、medium 云接收距离、借用与释放均通过。云接收实际写入约 0.008 的编码距离，
没有误判为天空的 1。水面位于 7000 米时，高级环境借用 TAA 的最终深度，不改变 opaque
输入的约 8000 米；水面 captureDraws=0，无几何重放。另有一项既有 Globe/Planar、
原生线性/日志深度精确重建 Spec 通过。最初测试错误地在帧末读取已清空的 cloudPassActive，
改为检查实际命令执行和接收距离后通过，未为测试改变产品时序。

本增量只修改 SceneGIS 自有环境 renderer、Shader 与 Specs，不新增 upstream-owned
修改或 SGP。开发构建、定向 ESLint/Prettier、Markdown 与 diff whitespace 检查通过。
无 TAA 的单段水面继续消费包含水的完整 native depth；跨段水面暂保留明确资格错误，
等待上述预算决定。镜头 clear 判定已采用同一线性约定，但尚无本次独立镜头像素证据；
不把共享 helper 或编译通过报告为全部环境组合验收。

独立 Globe 页 E2E 在本轮环境深度改动后通过（43.9 秒），覆盖高级环境、17 层影像、
Fabric、分类/反色、日夜与屏幕效果、移动、resize、释放和无 page/WebGL 错误。此页面
默认单段，不代替上述多段 GPU 用例；仍需剩余组合、阶段完整检查及负责人视觉 gate。

## Multi-frustum translucent Globe and final water depth

原生透明 Globe 分类通过可选内部 stage 参数拆开：opaque 分类在材质阶段完成，透明
阶段按当前段清空并复用原生 classification framebuffer，执行专用 depth peel/分类；
不缓存多份分类颜色，不重绘 opaque 地形。原生 manual depth 使用当前恢复的段深度。
复用 SGP-0046，新登记 GlobeTranslucencyState.js；默认未传参数的原生调度保持原义。

新增实际 GPU 用例验证前透明/背不透明和双面透明、跨段近物体遮挡、分类颜色与拾取、
分类隐藏后清空、AO/TAA、resize 与恢复单段。原生 GlobeTranslucencyState 16 项回归通过。
后续全组 69 项 SceneGISDeferred Specs 通过，其中包含该新增用例和此前环境用例。

负责人批准水面最终深度 A 后，WaterFrame 按需拥有 R32F；TAA 活跃时仍借用其原有深度。
现有水面 MRT 派生逻辑移入 WaterFrame 共用，完成 opaque 后只复制一次深度，在原始
水面颜色绘制中同时输出线性深度。高级大气使用最终目标，折射继续读取 opaque 输入。
仅在多段、可见水面、高级深度效果且无 TAA 时分配，4 bytes/pixel；未增公开 API。

已有高级环境 GPU 用例补强后通过：64×64 目标为 16384 bytes，地形约 8000 米、水面
约 7000 米，目标外保持地形深度，折射输入不变，captureDraws=0。单段原生最终深度与
多段自有最终深度的空气透视颜色在 0.005 内一致。resize 销毁旧 view/纹理，开启 TAA、
隐藏水面、关闭全部高级深度效果时释放目标；借用的 opaque 深度存活。此为资源与绘制
预算证据，未据此宣称 GPU 帧耗时提升。

定向 ESLint、上游补丁审计通过：当前交付为六项 upstream-owned 文件、786 marker
tokens、generated status 0。相对 packages/engine/Source 的完整清单：Scene/Scene.js、
Scene/GlobeDepth.js、Scene/GlobeTranslucencyState.js（SGP-0046）；
Scene/GlobeSurfaceTileProvider.js（SGP-0051）；Shaders/GlobeFS.glsl（SGP-0051、SGP-0009）；
Core/PixelFormat.js（SGP-0052）。其余本增量实现属于 SceneGIS-owned 区域。

当前不扩大原生雾/大气的重复视觉适配；现有公共参数未静默删除。WDR-P4C-03 仍 open，
下一步是已批准的跨段半透明反色层，随后完成阶段交付检查、负责人视觉 gate 和独立提交。

水面 helper 复用后的 13 项 TAA 回归通过；最终分配时序与可见命令查询整理后，高级环境/
水面用例再次通过（不重复计数）。独立 Globe E2E 通过（43.6 秒），日夜截图已检查，
无 page/WebGL 错误。定向格式、Markdown、ESLint 和 diff whitespace 检查通过；完整
release/types 与负责人视觉仍留在阶段退出 gate，不提前报告阶段完成或创建 checkpoint。

## Multi-frustum inverse qualification and delivery gate

按实际包含 Tiles commands 的 ranges 保存透明层，第一层复用既有 color/depth；材质、
depth-stencil 与分类 mask 工作集逐段复用。已分类材质及 eye depth/tag 并入主表面，
未分类像素在缓存被覆盖前完成该段光照；保存颜色的 alpha 区分有效未分类像素，不增加
逐层 mask。透明阶段恢复该段线性/原生 packed 深度并使用原生 OIT 或排序透明。

新增两项 GPU Specs 分别使用 logarithmic+OIT 和普通深度+排序透明。真实远近 b3dm
部分分类，在同一像素保留两个相距超过 100 米的层；主材质的 eye depth/tag 对应实际
分类层。前景实体正确遮挡，pick/pickPosition 与原生参考一致；AO/SSR/TAA、resize、
卸载远层、恢复单段和关闭全部 Tiles 后资源释放通过。Tiles 材质提交数等于原生各段
命令数，未为 inverse 重放几何。最终 71 项 SceneGISDeferred Specs 全部通过，其中
分类组为 10 项，不把重复测试计为新增通过数。

初次新增用例运行使用了未再生的 Shader JS；完整开发 build 后通过。根 `test` 会构建
JS bundles，但本次实测不会代替 `build` 的 GLSL 模块再生，未据旧 Shader 的错误修改产品。
测试另纠正了“第一个保守 bounds 段必有实际像素”的假设，按实际两层重叠像素验证。

独立 Globe E2E 强制多视锥后通过（44.1 秒）：17 层影像、海洋/Fabric、要素样式、分类、
半透明反色、高级环境与共享屏幕效果同时使用八附件。透明层字节数严格等于
`width * height * (60 + (layerCount - 1) * 12)`，日夜、移动、resize、销毁无 page/WebGL
错误。日夜截图已检查；这是技术验证，尚不替代负责人视觉 gate。页面随后增加原生范围/
密集分段的原生参数控件，便于复现跨段遮挡，并将控件开关纳入最终 E2E。

1280×800 Edge/D3D11、Bistro 同一相机和 Clock、两组均开启半透明反色/OIT/TAA，九次
整帧 GPU 采样：单段中位数 13.45 ms（13.04–18.95），强制三段 16.93 ms（15.79–19.60）。
材质提交 1537→1818、分类 5→10、光照 3→4；两个含 Tiles 的段保存两层，inverse 缓存
53248000→65536000 bytes，差值为批准的 12 bytes/pixel。自有材质/缓存/深度总数
94208000→106496000 bytes；此场景共享深度另有 owner，不混入这项计数。相机移动后仍
保留两层，GL=0，未分配原生 inverse color framebuffer。代价包含原生跨段重复提交，
不能解释成纯缓存开销或普遍性能结论。

镜头深度补强复用已有两项 Globe/Planar HDR GPU Specs：真实 composite Shader 中，
线性 clear=0 与原生 clear=1 的光晕输出一致；线性 1 米表面与原生有限表面同样遮挡太阳。
两项通过，不把 uniform 控制的 Shader 证据声称为全场景组合；真实最终深度选择已有前述
地形/水面测试证据。完整 release 与 types 构建通过，types 保留既有上游 JSDoc 警告。

当前上游清单仍为六项，SGP-0046 / SGP-0051 / SGP-0009 / SGP-0052，见上一节完整列表；
补丁审计通过，generated status 为 0。最终场景回归与静态检查收尾后请求负责人视觉，
通过并形成 P4c 独立 checkpoint 前，不进入不透明前向冗余清理或独立矢量阶段。

最终 Globe、P4a 要素样式和 P4b 图元/Entity 三项浏览器回归通过（约 1.1 分钟），覆盖
新增分段控件及恢复原生范围；无 page/WebGL 错误。定向 Prettier、ESLint、Markdown 和
diff whitespace 检查通过。Architecture 自审确认本阶段技术 gate 完成，已批准的附件
预算、所有权与专用透明/拾取边界没有新增偏差。下一步由负责人验收独立 Globe 页面；
未经视觉接受不创建阶段 checkpoint，不把技术通过改写为整阶段完成。

尚存边界：原生强制密集分段的贴地分类缺角、在 P4b 隔离复现的两项环境大测试及一项
非法 Framebuffer 夹具仍保留；本阶段未改这些算法或测试契约。原生 Model 雾未扩展，
独立矢量 direct overlay 和旧不透明前向冗余按总体计划进入后继阶段。

## Owner-reported classification hole — 2026-10-14

负责人确认密集分段的蓝色贴地面不完整。相同固定相机与冻结 terrain LOD 下，原生和延迟
在 20 段时均缺失大片分类，单段完整。此前把它保留为原生边界问题不足以满足本阶段的
可见性目标，WDR-P4C-08 重新进入修复，不以“与原生一致”作为视觉通过依据。

诊断派生只把自动 log-depth 的实参限制到 near/far 的有效域，缺口立即消失；再改顶点
位置没有新增必要收益，因此产品仅修改 DerivedCommand.js（SGP-0053，8 增/1 删）。
源 Shader 使用 `czm_writeDepthClamp` 且未自行写日志深度时，自动包装调用
`czm_writeLogDepth(clamp(...))`。原生 builtin 原先的范围 discard 会把分类体封口删掉，
使 z-fail stencil 不能保持正确内外关系，既影响颜色也影响拾取。此次不改 builtin、
几何、分段参数、RenderState、附件或 pass；普通片元继续 discard，显式 depth writer
仍自行负责深度。

新增真实 GroundPrimitive 回归在修复前漏掉 1428 个单段已覆盖像素，中心 pick 为空；
修复后通过，覆盖与拾取恢复。另一项真实 GPU 派生契约在 near=10/far=20、距离 5/15/25
分别验证：depth-clamped 体三个位置均保留，普通几何及显式 log writer 只保留区间内片元。
72 项延迟 Specs 与八附件/透明/环境/TAA 的 Globe E2E 通过，页面/WebGL 错误为零。
修复后的原生/延迟单段与 20 段截图均已检查，蓝色矩形完整。

本轮补丁审计通过：43 个登记上游条目，当前 P4c 七项 upstream-owned files、788 marker
tokens、generated status 0。本次新增文件仅 `packages/engine/Source/Scene/DerivedCommand.js`
（SGP-0053）；其余六项仍是前述 Scene/Scene.js、Scene/GlobeDepth.js、
Scene/GlobeTranslucencyState.js（SGP-0046），Scene/GlobeSurfaceTileProvider.js（SGP-0051），
Shaders/GlobeFS.glsl（SGP-0051、SGP-0009），Core/PixelFormat.js（SGP-0052）。
定向 ESLint 通过。原生分类/贴地面/线回归与交付检查正在收尾，完成后重新提交负责人视觉。
此修复不处理原先记录的两项旧环境大测试与 Framebuffer 非法夹具。

最终补强用例同时验证无缺失、无越界覆盖和中心拾取，已通过；深度契约测试也通过。
原生 ClassificationPrimitive 37 项、GroundPolylinePrimitive 35 项、GroundPrimitive
47 项回归通过，共 119 项。完整 release/types 通过，类型生成仍有既有 JSDoc 警告。
Architecture 自审确认新增改动仅在 Shader 派生时判断原有 clamp 语义，不进入每帧
绘制热循环、不改公共 API/材质数据布局或资源所有权。

## Final gate — 2026-10-14

负责人确认蓝色贴地面缺口已消失，接受 P4c 并授权提交。WDR-P4C-08 的技术与视觉
gate 均通过；Architecture 确认 P4c 完成并形成独立本地 checkpoint。旧前向多影像
sampler 缺陷按已确认的单一不透明管线方向进入后继清理，不补建完整前向模式；
独立矢量适配和未适配材质家族仍由总体计划跟踪。两项旧环境测试与非法 Framebuffer
夹具未在本阶段解决，不因阶段完成而删除记录。
