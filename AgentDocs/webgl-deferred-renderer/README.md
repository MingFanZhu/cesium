# WebGL Deferred Renderer

## Metadata

| Field                            | Value                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Extension slug                   | `webgl-deferred-renderer`                                                              |
| Status                           | `completed`                                                                            |
| Planning model                   | `extension`                                                                            |
| Extension plan                   | [总体计划（completed）](plans/2026-10-13-webgl-deferred-renderer-extension.md)         |
| Current phase                    | 无；全部阶段已完成                                                                     |
| Active phase plan                | 无                                                                                     |
| Last completed phase             | [P4g：全部 DrawCommand 生产者接入](plans/2026-10-15-p4g-all-draw-command-producers.md) |
| Architecture / execution contact | 当前任务                                                                               |
| Last updated                     | `2026-10-20`                                                                           |

## Scope

2026-10-22 maintenance: rendering-quality [R29](../rendering-quality/plans/2026-10-22-r29-directional-occlusion-cost.md)
fixes repeated per-model lighting-group selection in the owned deferred helper.
The [review](../rendering-quality/reviews/2026-10-22-r29-directional-occlusion-cost.md)
records preserved images and native binding updates, reduced light draws and cost.
This does not reactivate the deferred renderer's completed phase plan.

2026-10-21 可视域集成中修正 lighting pipeline 的 Shader / uniformMap 配对：
程序化 IBL 在 geometry 与 lighting 准备之间就绪时，不再混用不同分支。
变更范围为 owned `_SceneGISDeferredLighting.js`，无新增上游补丁、资源或
曝光调整；实现和验证归入 [Viewshed V3](../viewshed/plans/2026-10-21-v3-qualification.md)，
21 项 DeferredLighting Specs 通过，原始失败交互由双世界街区 E2E 覆盖。

2026-10-20 深度维护：[空视图深度 plan](plans/2026-10-20-empty-frame-depth.md) completed，修复空视锥列表跳过
原生深度初始化的问题，新增 2 项 GPU 回归及 21 项相关回归通过。
[review](reviews/2026-10-20-empty-frame-depth.md) 记录首次空帧、连续空帧、恢复几何和资源所有权证据；
本增量不改变环境画质参数，SDK 需同步本次引擎检查点后复验南京场景。

2026-10-17 提交收口：负责人已授权将本轮环境维护整体提交到 `scenegis/develop`。
[环境辐亮度 standalone plan](plans/2026-10-16-environment-radiance.md) 标记 completed，
本地检查点包含光谱 / 补光 / 昼夜衔接、Planar 地面反馈、AgX 和已验收默认参数。
当前无 active maintenance plan；验收限于已记录的 Globe / Planar LDR 配置，历史 HDR
观察和既有测试失败保留在 [review](reviews/2026-10-16-environment-radiance.md)，不扩大通过范围。
以下各段保留实施过程中的历史状态；“未提交 / active / pending”以本段及 review 收口节为准。

最新默认值更新（2026-10-17）：负责人授权把已验收外观提升为引擎默认。默认与显式环境
均使用天空 2.5 / 地表 1.2；Globe 空气距离 0.5、Planar 1。HDR / 自动曝光默认关闭，
显式调用方参数优先。两个物理示例已移除重复预设；18 项相关 Specs、完整 dev build、
类型生成 / tsc 和现场刷新检查通过。无新上游文件 / SGP，未提交；见 active plan / review 最新节。

最新维护增量（2026-10-17）：负责人授权保留 flat-slab，补齐地面反射参与 orders 2–4。
generator v4 / PlanarEarth 资产已更新；地面反照率、太阳时间、HDR / 自动曝光关闭均保持。
当前执行、验证与清晨/正午/黄昏对照见下述 active plan / review 最新节；没有新增运行时
绘制、资源或上游补丁。负责人已确认本轮清晨、正午、黄昏及日落后对照通过，
RAD-14 visual accepted；保留平板暮光、四阶截断及方向平均近似，维护增量未提交。

2026-10-16 维护增量：按负责人要求统一默认地表 / 大气辐亮度，保持自动曝光默认关闭。
当前 active standalone plan 为 [环境辐亮度](plans/2026-10-16-environment-radiance.md)；
中午 HDR 诊断后，按负责人要求恢复原实现 Sun / Sky 光谱转换与共同场景 RGB 单位。
41 项相关 Specs、build / types、当前视角 GPU 读回通过；见
[review / technical-pass, visual-pending](reviews/2026-10-16-environment-radiance.md)。
后续已按负责人批准同步日间示例中性倍率，并通过 ADR-0164 / SGP-0060 接入 AgX；
示例显式使用 AgX / exposure=10，引擎默认保持 PBR Neutral / 1、自动曝光关闭。
AgX / 调色 / 自动曝光 26 项专项通过；原生 collection 14 项通过、26 项既有失败，
去掉 AgX 接入后同样复现，详见 review。完整 dev / release / types 通过。
双世界已检查，参考曝光 10 下部分材质及矢量注记仍偏浅，RAD-03 视觉 gate 待确认。
已对照 UE 官方物理光照、曝光和公开大气实现，后续应区分天空补光 / 地面反弹与显示契约，
不能再用统一放大太阳或散射掩盖问题；未把 UE 算法移植纳入本增量。
负责人随后批准 ADR-0165：补齐共享漫反射的下半球地面返回；矢量文字 / 图标抵消曝光，
仍保留 AgX、alpha、样式顺序及外部遮挡。已完成实现，Model / 模型类 3D Tiles 双世界、
矢量光照与注记专项 64 项通过；当前视角背光偏蓝减轻，图标恢复颜色，最终视觉仍待确认。
不新增 pass / 资源，保留地面反照率 0.1 和自动曝光关闭；区域反弹与自动增益一帧历史边界
详见上述 review 的 ADR-0165 增量。当前维护计划继续 active，技术证据不替代负责人视觉 gate。
最新 LDR 反馈继续指出整体暗淡；已确认并修复 Planar 总照度 / 透射 LUT 网格不对齐造成
天空误扣（ADR-0044 补充 / RAD-09）。新增真实资产 GPU 回归通过；相关定向证据共 81 项。
随后按负责人要求移除 Planar 示例的自定义主光覆盖，恢复默认物理太阳，保留 LDR；
大气此前一直启用，当前太阳 / 主光均为固定 +Z、primaryScale=1、自动曝光关闭。
整体观感没有宣称通过；LDR 参考白仍需核对，见 review 的“当前 LDR 反馈”及末节。
自动太阳后仍偏暗；最新 UE 对照确认 Planar 多次散射省略地面返回、LDR 缺少显示参考标定。
参考点太阳约 116156 lux、天空约 6884 lux；参数不同，不能以 UE 的 20% 天空比例直接判错。
该轮只诊断，未启动整体算法替换。负责人随后指定先在球面物理大气页固定南京正午、
关闭 HDR，球面验收后再处理平面 transport。Globe 冻结 LUT 白 / 灰面证实原单位是存储
归一化而非显示白；按 ADR-0044 将共同单位标定为 40000 cd/m²，保留物理能量比例、
LDR clamp/gamma、默认倍率 1 和自动曝光关闭。当前执行与视觉状态见 review 末节。
2026-10-17 负责人认为球面有所改善但仍暗 / 灰。再次 GPU 复核确认水平天空输出与照度
相差约 0.73%，朝南竖直面的半球近似低估天空项约 36%（RAD-11 open）。UE / Unity
分别控制天空外观、环境补光与空气透视，不能照搬三个倍率；后续优先改进方向性 diffuse
sky，再讨论可复现艺术预设。该轮仅诊断，未修改代码 / 参数，详见最新 review。
历史 extension / phases 的完成状态保持，不重开已验收的渲染调度阶段。当前增量未提交。

负责人随后批准优先改善算法。Globe 已用方向天空积分照度表替换非水平面的半球比例，
正午参考侧墙由约 4013 lux 恢复到 6071 lux，独立高采样参考为 6264 lux。12 个方向 /
高度 / 昼暮 / 坐标旋转样本与生命周期 GPU 检查通过，相关回归共 32 项通过。
atlas 约 1.35 MiB，冷创建 GPU 积分本机约 2 ms，首次程序编译测量约 0.6 s；无每帧
预计算或新增 sampler。RAD-11 技术修复完成，RAD-03 球面视觉仍 pending；当前增量仍
未提交。完整误差、成本及近似边界见上述 review 的方向性天空照度增量。

后续 LDR 观感预览在当前球面正午页面采用天空 2.5 / 地表 1.2 / 空气 1.0，未固化源码
或改变引擎默认。降低空气倍率可见地平线明暗接缝；远景去灰需另评估光学厚度而非只乘
散射输出。RAD-03 仍 open，相关比较及下一步见同一 plan / review 末节。

负责人随后批准空气透视调整。按 [ADR-0166](../../Documentation/SceneGIS/Decisions/ADR-0166-globe-aerial-perspective-distance-scale.md)
接入 Globe `aerialPerspectiveDistanceScale`：缩放有限路径查询，同时计算散射与透射率，
保留真实深度、云可见性、光照和高度雾；默认 1，Planar 暂只接受 1。当前球面正午 LDR
示例固化天空 2.5 / 地表 1.2 / 空气亮度 1 / 距离 0.5 的预览，并提供实时控件。
专项及相关回归 22 项通过；无新增 pass / GPU 资源。视觉 gate 仍 open，未提交；
构建、现场检查及边界详见同一 review 的空气透视增量。

最新负责人已接受球面正午预设，蓝色区域确认是水面，撤销此前接缝判断。随后完成
14 个时段与晨昏 212 个逐分钟样本检查：无渲染报错或硬切换，但旧夜间可读性补光在
-6°/-12° 才接入，使清晨 / 黄昏出现比深夜更暗的地表低谷（RAD-12 open）。月光开关
有响应，但同样不能填补此前低谷。本轮只记录检查，页面恢复正午；夜景策略与 Planar
仍待后续，见同一 plan / review 最新节。没有更改引擎实现或提交。

2026-10-17 负责人批准夜间补光独立配置与照度过渡。按
[ADR-0167](../../Documentation/SceneGIS/Decisions/ADR-0167-globe-night-ambient-irradiance.md)
实现 Globe `nightAmbientIntensity`（默认 1、0 关闭），替换固定太阳角过渡。42 项相关 Specs 与当前视角
15 个时段 / 212 个分钟样本通过，RAD-12 technical fixed / visual pending。球面 / LDR / 自动曝光关闭保持，Planar 与月光方向光规则不变；
SGP-0009 仅增加一个 uniform，最新结果仍记录在同一 plan / review。

2026-10-17 最新负责人已验收 Globe 全时段，RAD-12 visual accepted。当前按同一维护
plan 完成 Planar 夜间环境光和示例 LDR 预设同步；27 项相关 Specs、完整构建 / 类型和
上游审计通过。15 时段 / 212 分钟样本不再有地表和模型的晨昏低谷，正午 / 深夜保持。
保留 +Z 平面 transport、Moon、遮挡与样式；平板天空较快变黑和半球 diffuse 近似仍在。
具体结果 / 性能见 plan / review 最新节；RAD-13 technical fixed，Planar visual gate
仍由负责人确认，当前维护增量未提交。

2026-10-15 负责人在最终验收页确认“画面通过，提交 P4g”。调试着色、Globe 空地伪阴影、Planar 斜向投影与水面不透明反射的最终视觉 gate 已关闭，点云此前验收继续有效。77 个生产者模块 / 217 个创建和派生点的技术审查、Specs、浏览器 / 成本检查、完整 release / types、静态与补丁审计均已完成。本提交为 P4g 独立本地 checkpoint；全分支当前 WebGL2 / SCENE3D 单采样、不透明 / MASK 延迟与透明专用前向目标完成，没有 active phase。反射探针和透明物体水面 SSR 仍按负责人决定暂缓，不宣称这两项已适配。

以下保留范围演进及历史阶段记录，最新完成结论以本段和 P4g 最终 review 为准。

2026-10-15 负责人纠正完成边界：全部创建 / 派生 DrawCommand 的模块都须适配，不能只核对先前内容矩阵；仅有同类型替代且明确提前拒绝 / 门禁的模块允许排除。P4f 已独立提交 `8f3baba438`，据新要求激活 [P4g](plans/2026-10-15-p4g-all-draw-command-producers.md) 和 [全命令审计](reviews/2026-10-15-p4g-all-draw-command-producers.md)。已关闭本轮发现的点云、诊断和辅助路由技术缺口，最终视觉 gate 已由负责人确认通过，详见下节。以下完成结论为此前阶段的历史范围。

2026-10-15 P4e 独立 checkpoint 为 `60cedcbb7b`，提交钩子通过。负责人随后要求继续支持 CustomShader，明确透明内容继续走前向专用通道。[P4f](plans/2026-10-15-p4f-custom-shader.md) 已补齐原生 API 的测试与支持说明，技术、自审与负责人视觉 gate 全部通过；负责人明确确认“画面和拾取通过，提交 P4f”。本增量形成独立本地 checkpoint，当前没有 active phase。最终证据与保留边界见 [P4f review](reviews/2026-10-15-p4f-custom-shader.md)。

P4d checkpoint 为 `4ba2e217c7`。2026-10-15 负责人在此前矢量画面通过的基础上，明确确认新增透明 Planar 画面通过并指示提交 P4e；本阶段技术、自审与视觉 gate 全部关闭，代码、Specs、ADR / SGP 和记录形成独立本地 checkpoint。WebGL2 / SCENE3D、单采样的既定单一不透明 / MASK 延迟目标完成，当前没有 active phase。最终内容矩阵、资源成本与保留边界见 [P4e review](reviews/2026-10-14-p4e-vector-entry-audit.md#final-owner-acceptance-and-architecture-gate)；成果保留在 `feature/webgl-deferred-rendering`，本轮不包含主线合并或发布。

探索 WebGL2 统一表面数据、不透明延迟光照，以及共享数据支撑的多光源、AO、SSR、SSIL
画质和性能改进。既有效果和街道调校仍属于 `rendering-quality`。
负责人允许不再长期维护完整前向模式；可以采用不透明延迟与透明等配套前向的统一管线。
不预设公开 forward/deferred 切换 API。P1 只交付可观察的材质数据，不接管主光照。

## Final P4g handoff

### 最终状态（负责人验收通过）

2026-10-15 负责人在最终验收页确认“画面通过，提交 P4g”。调试着色、Globe 空地伪阴影、Planar 斜向投影与水面不透明反射的最终视觉 gate 已关闭，点云此前验收继续有效。77 个生产者模块 / 217 个创建和派生点的技术审查、Specs、浏览器 / 成本检查、完整 release / types、静态与补丁审计均已完成。本提交为 P4g 独立本地 checkpoint；全分支当前 WebGL2 / SCENE3D 单采样、不透明 / MASK 延迟与透明专用前向目标完成，没有 active phase。反射探针和透明物体水面 SSR 仍按负责人决定暂缓，不宣称这两项已适配。

以下保留此前增量记录；当前未完成项以上述状态和 review 末尾为准。

全量 [全部生产者矩阵](reviews/2026-10-15-p4g-command-producer-matrix.md)已建立。点集合分流、独立点云材质分离、EDL 和命令过滤修正已通过技术增量。六项 EDL GPU、八项生产者 GPU、192 项原生样式测试及浏览器检查通过，负责人已确认点云画面与拾取通过。动态点云多帧裁剪、十一项 GPU 粒子和四十七项 CloudCollection 也有通过证据；旧 Planar 环境门禁遗漏已修正。探针、调试着色及剩余矩阵尚未关闭，P4g 未提交，不把点云验收扩大为全阶段 gate。

已完成的预算讨论：[EDL 点深度与提交预算](discussions/2026-10-15-point-edl-depth-budget.md)，批准范围内的接入、技术与负责人视觉验收均完成；SGP-0055 / SGP-0056 / SGP-0057 / SGP-0058 已登记。最终阶段事实以 [P4g review](reviews/2026-10-15-p4g-all-draw-command-producers.md) 为准，下面旧阶段记录不构成新范围下的完成声明。

2026-10-15 负责人随后明确反射探针不启用、仅作技术积累，现阶段暂缓；其六面捕获与启用后的 sampler 容量问题保留记录，不再阻塞 P4g。此决定不涉及正常使用的物理天空反射、SSR 或局部灯。其余模块审计与调试着色接入继续。

## Engineering links

- P4f 原生 CustomShader：七项新增 GPU Specs 与独立浏览器检查通过；材质模式、动态纹理 / uniform、顶点 / varying / discard、透明前向 OIT、Model / Tileset 替换和拾取已取得有界证据。未发现需要修改运行时的缺口，无新增附件或提交预算。见 [接入说明](../../Documentation/SceneGIS/CustomShaderGuide.md)、[验收页](../../Test/Rendering/延迟CustomShader验收.html) 与 [P4f review](reviews/2026-10-15-p4f-custom-shader.md)；负责人画面与拾取验收通过，阶段 gate 全部关闭。

- 2026-10-15 透明 Planar 增量技术与负责人视觉 gate 均通过：Ground / DeferredPlanar 25 项、实际页面截图及资源/提交预算、完整 release/types/tsc、定向静态检查与 SGP 审计。新增本地地形、多视锥、opacity=0.5 / 0 / 1 下的地图、圆点、完整 VECTOR 文字、道路及点击拾取已获负责人确认；P4e review 全部七项 findings 关闭。

- P4e [地图覆盖预算](discussions/2026-10-14-vector-overlay-budget.md) 已批准并接入：extrusion 材质 / 共享效果 16 项、矢量环境 8 项、地图层序与附件容量 3 项、Globe 矢量最终 23 项通过。多视锥位置拾取修正另有 3 项通过。图案 / 状态 / 符号 46 项已有通过证据。双世界验收页和基础浏览器检查已建立；透明 Globe 共享边重复混合与原生瓦片缝漏点已修复，新增 GPU 及浏览器连续覆盖回归通过，成本见 WDR-P4E-05。[透明 Planar 深度讨论](discussions/2026-10-14-planar-vector-transparent-depth.md) 已获批准；条件深度、互斥地图颜色、OIT 合成和拾取已接入，新增验收与 P4e 最终 gate 均已关闭。

- P4e 水面 / 共享效果回查修正地图重复 coverage alpha，新增 GPU 与双世界浏览器回归通过；独立 Globe background 已补齐材质标记与几何光照门禁，19 项背景 / 环境 / pattern GPU 用例和 Globe 浏览器回归通过。两项均复用已有预算，详见入口审计 WDR-P4E-06 / 07，负责人已于 2026-10-15 确认现有增量视觉通过。

以下 P4d 及更早记录保留各增量当时的验证状态；P4d 最终状态以本页 Scope 的已提交 checkpoint 为准。

- P4d 当前增量：默认高级环境及云资源按需加载已实现；Planar 大气 / 高度雾及开云黑天空修正已有技术证据，开云画面已获负责人确认。
  自定义 DirectionalLight 保留方向、颜色、强度和所有权，SunLight 恢复自动主光。
  [默认环境验收页](../../Test/Rendering/延迟默认环境验收.html) 的主光 / 阴影增量已获负责人视觉确认，P4d gate 全部通过。
  既有 Planar、扩展材质、标注与原生通道增量已验收；当前范围以
  [能力矩阵与剩余项](reviews/2026-10-14-p4d-entry-audit.md#current-adaptation-matrix-and-remaining-work) 为准。
  Gaussian tileset 移除释放已修复，十一项相关 Specs 通过；消费者审计和最终视觉确认后 WDR-P4D-01 至 08 均 fixed。以下 handoff 保留历史增量状态，当前状态以本节和 review 最后结论为准。

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

## Historical incremental handoffs

以下保留各阶段当时的状态与证据，不表示当前仍有相应待办。最终状态以上方 Scope 和 P4g 最终 review 为准。

2026-10-14 负责人选择 A：只推进 WebGL2 / SCENE3D 的延迟渲染，目标默认单采样，
其他模式明确不支持。HDR 关闭的实现已加入本轮：内部保留线性浮点光照与透明合成，
最终使用原显示槽位做裁剪/gamma，不应用曝光/tone mapping；详见 ADR-0161。
Scene 默认单采样、自动绑定与 Planar/Ellipsoid 不透明材质接入已完成。
负责人随后要求真正透明，并接受半透明 Planar 使用 OIT 专用受光；已移除旧背景
快照，地下物体、透明分层、拾取及阴影回归通过，见
[决定](discussions/2026-10-14-planar-transparency.md) 与末尾 review。
私有前向开关、旧效果几何重放和接收派生已移除。Planar 负责人视觉已通过。
负责人要求 P4d 保持未提交，补齐现有扩展材质、裁剪、轮廓与点云样式后关闭阶段。
[扩展预算](discussions/2026-10-14-extended-material-budget.md) 已获批；最多四张按需
RGBA16F 与容量溢出的材质附加提交已实现。原生材质/点云、MASK、分类与释放的
167 项相关 GPU 用例有通过证据，扩展材质与图元浏览器、成本和交付检查通过。
负责人确认本增量画面符合预期；P4d 保持未提交，继续处理带背景标注及最终兼容矩阵。
全 AgentDocs Prettier 另有九个既存 Planar 文档格式提示，当前扩展文档检查通过。
[标注预算](discussions/2026-10-14-depth-writing-annotations.md) 已获批准，原生标注尾部
和条件深度已接入。负责人指出背景矩形遮挡透明物后，已批准实心 / 透明拆分及标注不参与水面折射；修正后的 12 项定向 GPU 用例与独立 E2E 通过，负责人在页面视觉确认通过。Bentley planar fill 三项 GPU 资格已通过，edge visibility 的 10 项回归与 voxel 基础 17 项回归也已通过；[voxel 与水面语义 / 深度预算](discussions/2026-10-14-voxel-water-depth.md) 已获负责人批准并完成实现。44 项相关 GPU 回归与原生通道 E2E 通过，填充 / 边线 / 体素增量待负责人视觉；Gaussian 的九项原生回归通过，最终兼容矩阵仍 open；独立矢量适配仍为后继范围。
诊断页面为 `Test/Rendering/GBuffer原型.html`，只读主 G-buffer，不再重放几何。
验证与本轮尚未提交状态见 [P4d review](reviews/2026-10-14-p4d-entry-audit.md)。

P4c checkpoint `fbde52dcd5` 已形成，提交钩子的 ESLint、Prettier、Markdown 和类型检查通过。
随后激活 [P4d](plans/2026-10-14-p4d-opaque-pipeline-consolidation.md)：已移除旧 G-buffer
诊断重放，直接借用主延迟数据；6 项诊断 GPU Specs、样式与共享布局回归及街道 E2E
通过。默认配置尚未修改；统一入口场景范围已由上述 A 决定替代原待答复事项。
默认配置、passthrough 家族与专用通道依赖见
[入口 review](reviews/2026-10-14-p4d-entry-audit.md)。
旧独立 Model 诊断 capture 标记也已移除，17 项光照与 7 项样式回归通过；
该句对应早期诊断增量；当前完整 upstream-owned 清单见 P4d review，整个 P4d 尚未提交。

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

## Historical P4d visual gate

标注修正已获负责人视觉确认。左侧 TAA 共面填充修正也已确认正确；右侧体积与后方红面重叠时返回红面的问题已复现并修正，负责人已确认该拾取修正符合预期。20 项相关 GPU 与原生通道点击 E2E 通过；Gaussian 混合场景 GPU 已通过，原生生命周期边界记录在 review。最终兼容矩阵与 P4d 提交 gate 仍 open。

最新默认高级环境已实现：scene.environmentEffects 与接管规则遵循负责人批准。原生视觉雾 / 大气 / Globe daylight 不做兼容补齐；默认物理大气 / 空气透视 / 高度雾，云资源真正按需创建。技术验证及成本记录已完成，新默认画面的负责人视觉待确认；详见默认环境 discussion、P4d plan 与 review 末尾当前矩阵。

负责人随后指出开云时 Planar 天空变黑：已修正 clear-depth=0 被用于表面视线重建的问题，新增修复前失败的 GPU 回归与 Globe / Planar 开云 LDR / HDR 浏览器检查通过，无新增纹理 / 绘制或上游路径。七项默认环境 GPU Specs 现有通过证据；本次画面仍待负责人重新确认，不沿用先前无云结果关闭 gate。
