# Extension Plan: WebGL 延迟管线探索

## Metadata

- Plan type: `extension`
- Status: `completed`
- Owner role: `architecture`
- Architecture review: `confirmed`，P4g 全生产者技术审查与负责人最终视觉通过，所有阶段完成
- Architecture reviewer: Current task
- Created: `2026-10-13`
- Updated: `2026-10-15`
- Related discussion: [接入审计](../discussions/2026-10-13-command-integration-and-reuse.md)
- Related review: [最终 P4f](../reviews/2026-10-15-p4f-custom-shader.md)、[P4e](../reviews/2026-10-14-p4e-vector-entry-audit.md)、[P4d](../reviews/2026-10-14-p4d-entry-audit.md)
- ADR / SGP: [ADR-0156](../../../Documentation/SceneGIS/Decisions/ADR-0156-webgl-deferred-lighting-experiment.md) / SGP-0046；依赖 ADR-0155 / SGP-0045

## Objective

2026-10-15 负责人明确扩大完成边界：所有直接创建、派生或通过工厂创建 DrawCommand 的模块及其公共委托入口，均须接入当前延迟与透明前向管线。只有被现有同类型模块替代且明确提前拒绝 / 门禁的路径可以排除；不能将历史未列举、一般不支持条件或缺少测试等同于合法排除。P4f checkpoint `8f3baba438` 后激活 [P4g](2026-10-15-p4g-all-draw-command-producers.md)，最终完成以全生产者矩阵为准。

同日负责人另行明确反射探针不启用、仅作技术积累，现阶段可以暂缓。显式局部探针的六面捕获和启用后的采样器容量问题保留在 P4g review，暂不阻塞阶段或分支目标完成；此项为负责人的范围例外，不代表已完成适配，不扩大到物理天空反射、SSR 或其他生产者。

2026-10-15 P4e checkpoint `60cedcbb7b` 后，负责人要求继续支持原生 CustomShader。新增 [P4f](2026-10-15-p4f-custom-shader.md) 按当前源码验证其既有 API 与透明前向 / OIT 路径，修复实际缺口；不自动扩大为任意外层 Shader / DrawCommand 协议或多表面矢量贴附。此前阶段完成状态保持。

在当前 WebGL 街道画质成果之上，验证统一 G-buffer 与延迟光照能否改善多光源和
屏幕空间效果的复用、画质及成本，并依据证据决定是否替换现有不透明前向主通道。
“用了延迟”不是验收标准；必须有材质正确性、兼容性和同条件成本证据。

负责人于 2026-10-13 明确后续顺序：先完成 Globe 接入并验收，再回查 Entity、Primitive、
glTF Model 与 3D Tiles，清理仅用于完整不透明前向兼容的分支、重复提交、资源和 Shader。
不保留两套不透明主通道；透明、阴影、拾取等仍按实际用途保留。此工作已设为持续目标，
Globe 后继清理阶段仅记录稳定目标，进入时再依据当时源码建立 phase plan。

## Non-goals

- 不移植整个 WebGPU 后端或重新设计模型加载、相机和同步拾取 API。
- 不同时推进世界空间 GI、Lumen 对等或路径追踪。
- 不承诺第一阶段覆盖所有 Cesium DrawCommand、任意 CustomShader 和全部 GIS 组合。
- 不要求维护完整的旧前向运行模式，也不提前删除已有透明、阴影、拾取等通道。

## Stable exploration boundaries

1. 使用独立分支和工作目录；原已验收 WebGL 分支作为稳定对照。
2. 默认复用现有 API、资源、几何准备、LOD、材质解析和 GPU 资源所有权；先按材质家族
   适配，再决定统一调度缝隙，禁止在底层 draw 入口猜测任意 Shader 的材质语义。
3. 以单一不透明/MASK 延迟主通道为目标，透明和特殊内容保留专用通道；不维护完整旧前向
   兼容模式或为了过渡 Globe 前向另建调度层。探索中的调试选择不形成永久公开选项。
4. 新实现进入 SceneGIS-owned 区域。长期管线决定形成 ADR；上游最小接点逐项登记 SGP。
5. 任何旧能力删除、设备门槛提高、AA 语义改变或 API 改变均属重大选择；获得证据后确认。
   已有 ADR 中要求前向材质求值的范围，在具体替换前正式修订，不能只靠本计划覆盖。

## Source and baseline facts

- 基线 `5688deaeeb` 已含街道曝光、白平衡预设与夜间泛光验收成果。
- 现有共享 MRT 记录的是已求值的光照响应，不是通用材质 G-buffer；具备资源和合成经验，
  但受单视锥、分类、后光照 Shader 分支及附件数量限制。
- SSR 已有分层深度、半分辨率和历史重建；SSIL 已有一跳屏幕估计。
  后继优化必须对照现有实现，不能把已有能力重新计为新增收益。
- WebGPU 已有独立延迟主通道，但内容覆盖受限且完整街区 GI 视觉 gate 未通过。
  它提供参考，不构成本分支兼容性或性能依据。

## Phase roadmap

| Phase | Objective                   | Dependencies / entry gate                      | Exit gate                                                      | Status    | Phase plan                                                                               |
| ----- | --------------------------- | ---------------------------------------------- | -------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| P0    | 隔离与接入范围审计          | 已提交 WebGL 基线                              | 分支、源码事实、复用/风险清单、文档检查与独立提交              | completed | [P0](2026-10-13-p0-isolation-and-audit.md)                                               |
| P1    | 统一表面数据的有限 GPU 原型 | P0 checkpoint；依据源码细化材质/深度与附件预算 | 已限定材质正确性、覆盖率、精度、资源生命周期和 MSAA 取舍证据   | completed | [P1](2026-10-13-p1-gbuffer-prototype.md)                                                 |
| P2    | 不透明延迟光照与混合合成    | P1 契约通过；必要重大选择已确认                | 同条件直接光/环境光/阴影/透明/曝光正确性和街道对照             | completed | [P2](2026-10-13-p2-deferred-lighting.md)                                                 |
| P3a   | 256 灯分块调度              | P2 已验收                                      | 256 灯同语义、共享接收、资源/成本、视觉验收与独立提交          | completed | [P3a](2026-10-13-p3-many-light-and-shared-data.md)                                       |
| P3b   | 共享屏幕空间效果            | P3a 独立 checkpoint                            | AO/SSR/SSIL 数据复用收益及稳定性                               | completed | [P3b](2026-10-13-p3b-shared-screen-depth.md)                                             |
| P4    | GIS 内容覆盖与替换决策      | P3a / P3b 有明确收益；按缺口安排子阶段         | 兼容矩阵、回归、实际设备成本、视觉验收，明确迁入主线或保留实验 | completed | [P4a](2026-10-13-p4a-model-and-tile-styling.md) 至 [P4e](2026-10-14-p4e-vector-tiles.md) |
| P4f   | 原生 CustomShader 资格      | P4e checkpoint；负责人新增请求                 | API / 透明专用通道证据、成本、自审、视觉验收与独立提交         | completed | [P4f](2026-10-15-p4f-custom-shader.md)                                                   |
| P4g   | 全部 DrawCommand 生产者接入 | P4f checkpoint；负责人全模块要求               | 全量矩阵无遗漏、真实缺口修正、合法替代门禁、技术与视觉 gate    | completed | [P4g](2026-10-15-p4g-all-draw-command-producers.md)                                      |

后继阶段仅记录目标，不提前冻结 G-buffer 编码、灯光分块方式、Shader 文件或接口。
默认顺序推进，每阶段独立提交后才能激活下一阶段。

## Cross-phase validation

- 正确性：材质响应、MASK 孔洞、光照分量、几何阴影只衰减直接光；曝光独立对照。
- 合成与 GIS：前后遮挡、同步拾取、日志深度、多视锥、Globe/Planar、分类、裁剪和透明，
  按阶段明确已支持/待验证/不支持，不能把小场景通过报告成全面替换。
- 生命周期：创建、resize、场景销毁、模型卸载与 Shader 变体失效；借用资源不得销毁。
- 成本：固定资产、相机、Clock、分辨率、采样数和效果质量，报告 GPU 分项、帧耗时、
  几何提交数及可核算附件显存；光源数量和覆盖面积分别变化，包含少光源场景。
- 画质：街道日/夜、金属/粗糙表面、树叶、轮廓和移动；数值不能替代负责人视觉判断。
- 仅运行与风险有关的 Specs/E2E；管线和交付变化时补完整 build/release/types 与补丁审计。

## Global risks and acceptance

主要风险是材质信息不足、clearcoat/自定义材质、MSAA 材质边缘混合、附件带宽、
多视锥合成以及现有派生阴影/拾取命令的组合。延迟本身不解决屏幕外缺失、运动历史、
多光源剔除或多灯阴影开销。达到兼容矩阵和同质量收益证据后，才能提出主线替换；
无收益的候选优化不因已实现就强行保留。

## Progress and handoff

最新全局状态：2026-10-15 负责人在最终验收页确认“画面通过，提交 P4g”。调试着色、Globe 空地伪阴影、Planar 斜向投影与水面不透明反射的最终视觉 gate 已关闭，点云此前验收继续有效。77 个生产者模块 / 217 个创建和派生点的技术审查、Specs、浏览器 / 成本检查、完整 release / types、静态与补丁审计均已完成。本提交为 P4g 独立本地 checkpoint；全分支当前 WebGL2 / SCENE3D 单采样、不透明 / MASK 延迟与透明专用前向目标完成，没有 active phase。反射探针和透明物体水面 SSR 仍按负责人决定暂缓，不宣称这两项已适配。

最新状态：P4e `60cedcbb7b` 已提交；P4f 技术、自审与负责人视觉 gate 全部通过，负责人于 2026-10-15 确认画面与拾取通过并授权提交。原生 API 无需新增产品分支，七项 GPU Specs 与浏览器验收检查通过，支持边界已写入接入说明及 ADR-0161。本阶段形成独立本地 checkpoint，当前没有 active phase。以下完成结论对应 P4e 关闭时的原目标范围。

当前结论：P4e 新增透明 Planar 画面于 2026-10-15 获负责人验收并授权提交，全部既定阶段 gate 关闭。WebGL2 / SCENE3D 单采样的 Entity、Primitive、glTF Model、3D Tiles、Globe、Planar 与独立矢量切片已完成本计划范围内的单一不透明 / MASK 延迟接入和冗余清理；透明、阴影、拾取、标注、体积继续使用必要专用通道。最终覆盖与限制见 P4e review 末尾。成果作为 `feature/webgl-deferred-rendering` 的本地阶段检查点交付，主线合并和发布不属于本次授权范围；没有激活后继阶段。以下保留历史推进证据。

P0 checkpoint `bb9b16eba0`；[P1 G-buffer 原型](2026-10-13-p1-gbuffer-prototype.md) completed。
技术验证通过，负责人于 2026-10-13 接受视觉结果；P1 checkpoint 为 `0a48afdd65`。
负责人确认 P2 单采样 + TAA / FXAA 路线，并于 2026-10-13 接受延迟光照视觉结果；
[P2 plan](2026-10-13-p2-deferred-lighting.md) completed，批准阶段提交后继续。
P2 checkpoint `b1c3a8a494` 已形成；P3 draft 与源码/成本调查已记录，负责人已选择 A，P3a 技术与负责人视觉 gate 已通过，批准独立提交后继续；P3a checkpoint `085f47e8f7` 已形成；P3b 已细化为共享屏幕深度并激活。

负责人于 2026-10-13 接受 P3b 共享深度结果，技术与视觉 gate 均通过；批准形成独立 checkpoint 后继续 P4。

P3b checkpoint `84aafea838` 已形成。P4 首个 draft 针对已复现的 Model / Tiles 样式阻碍；
负责人已确认按需第五附件，保留原生光照前/后着色；P4a 已激活，见 ADR-0159 / SGP-0048。

P4a 技术检查、review 与负责人视觉 gate 于 2026-10-13 全部通过；批准形成独立 checkpoint。
P4a checkpoint `b6a1f17178` 已形成，提交钩子通过。
依据源码激活 [P4b](2026-10-13-p4b-primitive-materials.md)：原生 Phong 面图元与 Entity 批处理；
Globe、多视锥、影像多 pass 和贴地分类作为后继独立阶段，不自动更改现有用户开关。

P4b 技术验证、review 与负责人视觉 gate 于 2026-10-13 全部通过，批准独立提交后继续 Globe 接入。

P4b checkpoint `5bde0722ba` 已形成，提交钩子通过。后继
[P4c](2026-10-13-p4c-globe-integration.md) 已完成真实 Globe 入口审计。
负责人选择 A 后进一步取消完整前向兼容目标，以后续指示为准：不实现过渡 Globe 前向调度，
P4c 已按 ADR-0161 激活统一延迟的材质与调度设计。新的 API/资源/可见性语义变化仍须依据
具体证据确认，不以保留旧绘制顺序或逐像素前向等价为目标。

负责人随后将独立 `SceneGISVectorTileLayer` 的延迟适配加入持续目标。完成当前 Globe
阶段后，在内容覆盖/前向冗余回查中单独资格确认 flat、Globe/Planar ground、fill-extrusion
与 circle/symbol；已有普通 Primitive 验收不代表这些自有 Shader/DrawCommand 已接入。
保留 ADR-0071 的地表受光及 circle/symbol 制图颜色语义，复用 source/Worker、瓦片调度、
样式/状态与 feature identity，验证贴地深度、alpha/层序、遮挡和 pick。它独立于原生
experimental `HAS_VECTOR_LAYER`；不得混作一条路径。具体阶段激活时再细化设计和测试。
运行时 goal 当前保持 active；现有工具只支持修改状态，不能改写其文案，本计划保存新增范围。

P4c 于 2026-10-14 完成技术检查、自审与负责人视觉验收；密集分段贴地分类缺口已修复
并经负责人确认消失，批准形成独立阶段提交。该 checkpoint 完成后，再依据当时源码
激活不透明前向冗余审计阶段；独立矢量适配继续属于后继范围。

P4c checkpoint `fbde52dcd5` 已形成，提交钩子通过。依据当前源码激活
[P4d](2026-10-14-p4d-opaque-pipeline-consolidation.md) 的入口审计；默认配置与未适配
能力尚待逐项决定，不把启用开关直接改为常量作为统一管线交付。

2026-10-14 负责人已选择默认入口方案 A：WebGL2 / SCENE3D、目标默认单采样，
WebGL1、2D、Columbus View、WebVR 不进入当前资格。P4d 先补同一线性延迟路径的
HDR 关闭显示契约，再完成默认绑定与旧不透明前向冗余清理；WebGPU 不在本分支范围。
具体实现与未完事项继续由 P4d plan / review 跟踪，不新增阶段或提前关闭 gate。

2026-10-14 P4d 的技术、自审及全部负责人视觉 gate 已完成，最后的自定义主光画面获负责人确认；批准形成本阶段独立本地 checkpoint。阶段完成既定唯一不透明 / MASK 入口、能力补齐和前向冗余清理，保留透明 / 阴影 / 拾取 / 标注 / 体积的必要专用路径。该提交成功后，再依据独立 SceneGISVectorTileLayer 的实际源码激活矢量切片 phase；其 flat、Globe / Planar ground、fill-extrusion、circle / symbol 与透明 Globe 组合仍属未完成范围。

P4d checkpoint `4ba2e217c7` 已提交且钩子通过；现在依据源码与 vector Specs 激活 [P4e](2026-10-14-p4e-vector-tiles.md)。新地图材质预算由独立 discussion 跟踪，不覆盖原 vector extension 的历史完成记录。

2026-10-15 负责人确认现有 P4e 页面视觉通过，并批准透明 Planar 的深度与地形提交预算。该增量实现、技术验证与自审通过后，负责人另行确认新增本地地形、多视锥、opacity=0.5 / 0 / 1 的地图、圆点、完整 VECTOR 文字、道路与点击拾取画面通过，指示提交 P4e。最后视觉 gate 与七项 review findings 全部关闭，形成本阶段独立 checkpoint；未激活下一阶段。
