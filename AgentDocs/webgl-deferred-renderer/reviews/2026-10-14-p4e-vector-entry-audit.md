# P4e 矢量切片入口审计

- Status: completed；Created: 2026-10-14；Updated: 2026-10-15。
- Target: P4d checkpoint `4ba2e217c7` 之后的独立 vector 阶段。
- Reviewer: 当前 Architecture / execution 任务自审。
- Plan: [P4e](../plans/2026-10-14-p4e-vector-tiles.md)。

| ID         | Priority | Status | Finding / required evidence                                                                                                                                                   |
| ---------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WDR-P4E-01 | high     | fixed  | extrusion FS 几何阶段已受光，opaque 尚为 passthrough。须写入真实材质并统一屏幕受光，证明透明切换、梯度、拾取及生命周期不退化。                                                |
| WDR-P4E-02 | high     | fixed  | flat / ground 的 lit fill / line 与 unlit circle / symbol 已分开记录有序贡献；透明 Planar 的独立 alpha、层序和真实表面深度通过 GPU / 浏览器及 2026-10-15 新增负责人视觉验收。 |
| WDR-P4E-03 | high     | fixed  | 透明 Globe direct overlays 被延迟入口拒绝。须沿现有剥离深度与前后面时序接入，不用不透明深度猜测。                                                                             |
| WDR-P4E-04 | medium   | fixed  | pattern、feature-state、地形、circle / symbol、pick、共享效果、资源释放与成本已有对应证据；2026-10-15 新增透明 Planar 负责人视觉通过，完整交付检查通过。                      |
| WDR-P4E-05 | medium   | fixed  | 透明 Globe 相邻三角形局部逆投影不一致造成重复混合；共享边 frame 与 depth-only 裙边修正通过 GPU / 浏览器回归，负责人视觉已于 2026-10-15 通过。                                 |
| WDR-P4E-06 | high     | fixed  | 地图 additive 光照把共享 coverage alpha 从 1 累加为 2，使 SSR / 水面 radiance 翻倍；已修正为保留地表 alpha，GPU / 双世界浏览器通过，2026-10-15 负责人视觉通过。               |
| WDR-P4E-07 | high     | fixed  | Globe background 样式漏过材质接入，仍在覆盖阶段受光；已加入统一地图材质路径，保留透明专用光照，19 项 GPU 与 Globe 浏览器通过，2026-10-15 负责人视觉通过。                     |

图谱已用于符号与调用关系发现；prototype update 索引缺失及延迟控制器行号陈旧处，以当前源文件补充读取。原 vector extension 的完成状态不表示新延迟入口已适配；历史样式和透明边界继续有效。

## Incremental evidence and disposition

以下记录各增量当时的发现与处置；最终状态以上表和末尾 architecture gate 为准。

- WDR-P4E-01 fixed / owner visual accepted 2026-10-15：opaque extrusion group -6 写入真实 albedo / normal，基础和物理光照移入屏幕阶段。材质、共享 AO / SSR / SSIL、透明切换、拾取、借用资源与释放：16 + 8 项通过。
- WDR-P4E-02 partial：按负责人批准的预算增加一张按需 RGBA16F，保存 lit albedo；unlit circle / symbol 仍通过原分类颜色保持原生混色。原生容量、5 附件单视锥、6 附件多视锥共 3 项 GPU 用例通过；确认纹理释放与每视锥最多两次清理。透明 Planar 的 2 项原契约失败已定位，预算于 2026-10-15 获负责人批准；新增深度与合成已接入，技术和新增视觉 gate 单独记录于末尾。
- WDR-P4E-03 fixed / owner visual accepted 2026-10-15：透明 Globe 使用原生 peel 深度；direct overlay 不再进入不透明分类目标。Globe 整组最终 23 项通过，包括独立 alpha、前方物体、真实地形、符号和 feature pick。
- WDR-P4E-04 in progress：图案 / 状态 / 符号回归首次 44 通过、2 项测试入口问题；一个私有资源 helper 与公共 Resource spy 属于不同 bundle identity，另一个旧断言未沿 logDepth 派生链查找 picking command。保留原断言语义修正测试入口，两项定向复查通过。双世界 E2E 基础 / 物理环境、共享效果、地图预算、要素状态、地形和多视锥控制通过；GPU 热路径的技术回归通过，现有页面视觉 gate 已于 2026-10-15 通过；新透明 Planar 增量单独验收。
- 新发现的多视锥 Globe pickPosition 丢失已修复：第二阶段不能借用上一段的 packed Globe 深度；同一次复制改读当前 frustum tag 的保留深度与最终硬件深度，保留原 pick 相机 near offset。Globe log / linear 与 10 km 级多视锥位置精度共 3 项通过，不增加资源或提交。

当前 upstream-owned 修改为 `packages/engine/Source/Scene/Scene.js`（SGP-0046 的显式 pick depth 与透明 Planar 阶段 hook）及 `packages/engine/Source/Scene/GlobeTranslucencyState.js`（SGP-0012 的深度裙边派发）；实现、Shader 和测试位于 SceneGIS-owned 路径。P4e 未提交，透明 Planar、剩余资格 / 视觉验收和最终交付检查仍 open。

## Browser cost and visual follow-up

水面消费者审计确认 `_SceneGISWaterFrame.capture` 的 SSR / AO / SSIL 分支分别借用当前共享屏幕结果，仍是延迟光照后的必要消费者；不是完整不透明前向兼容分支，不能删除。矢量资源的基础 Shader / 物理环境模板同时服务动态 opacity 的透明绘制、原生 pick 派生及发布前编译验证；本阶段不改变该准备和所有权协议。

WDR-P4E-06 已复现 GPU 输出：SSR weight / AO indirect 的 coverage alpha 为 2，radiance red 约 0.993，而已合成颜色约 0.496。地图光照保留 RGB additive，将 alpha source factor 改为 ZERO、destination 保持 ONE，从而保留基础地表的 coverage / roughness / normal encoding；不改 Shader 输出布局或增加资源。新增 GPU 用例验证 alpha=1、radiance 与合成颜色相等、水面借用同一 radiance / linear depth，SSR 与 AO-only 均无地图重放。双世界 E2E 增加地图上方水面、共享效果及成本断言，2 项通过。验收页新增可选水面开关，默认关闭。

WDR-P4E-07 源码审计确认 Globe background 使用独立屏幕覆盖 Shader，原先未带地图材质标记；新增回归先复现 `_vectorOverlays` 未创建。现在 background 使用同一有序 lit / unlit 材质目标，capture define 跳过几何阶段光照；原样式 pattern / alpha 与透明 Globe 专用受光保留，不新增附件、提交或 API。背景定向回归、矢量环境与 pattern 共 19 项 GPU Specs 通过，验证原始 albedo 不随主光变化、最终受光颜色变化，以及透明 Globe 切换后释放不透明地图资源。Globe E2E 新增背景开关、附件预算及截图检查通过；水面和背景截图已由当前任务检查，负责人于 2026-10-15 确认该现有页面增量视觉通过。

1280 × 800、Edge 155 / Windows、页面使用本地数据。基础地图关闭环境时不分配 lit 附件；物理环境开启后增加 8,192,000 bytes 和一次屏幕光照。固定视角中 Planar 普通几何 2→2、地图 7→7；Globe 普通几何 41→41、地图 7→7。AO / SSR / SSIL 开启后两者普通几何计数保持不变。多视锥下仍复用同一张地图纹理；原生按视锥分发导致提交增长，不能计为新增地图重放。

透明 Globe 释放不透明地图附件。provider 切换后的浏览器证据须等待真正替换的地形和 marker anchors 完成；不能用旧的 tilesLoaded / placedSymbols 快照关闭新地形验收。早期即时截图的暂时缺少符号已通过等待真实资源状态排除，不在产品中增加 settling frame。

WDR-P4E-05 的人工截图显示少量暗点。关闭 AO / SSR / SSIL、物理环境后仍可见覆盖异常；新增 `preserves uniform translucent fill coverage on native terrain` 在透明 Globe、35 m heightmap、alpha=0.5 的 64 × 64 内部区域复现两个 red=192 像素，期望均匀 red=128。片段 frame ID 探针确认相邻三角形 0 / 1 各混合一次；单视锥 log 与多视锥 linear 均复现，排除仅由视锥重叠引起。根因是每三角形不同局部 frame 的逆投影对共享边得出不一致结果。

修正使用既有表中的冗余槽保存共享边归属，两侧用同一 frame 和有序端点计算边界；不增加持久几何 bytes、纹理、varying 分量或提交。定位探针已移除，保留均匀 alpha 产品契约测试。Globe / pattern 共 32 项回归通过，包含 log / linear、地形、极区与日期变更线、holes、line、pattern、pick 和 provider 复用。浏览器连续覆盖回归通过；成本结果见下文。

Globe alpha=0 时从 heightmap 切回 ellipsoid 的地图消失观察已排除：等待新 provider 的 tilesLoaded、实际渲染 tile bounds 和 marker anchors 后地图正确恢复。getHeight 是实际网格射线交点，不能以其与输入 heightmap 的 0.1 m 差值判断资源加载完成；浏览器改为检查实际渲染瓦片的高度范围，Globe E2E 通过。

常规构建、定向 ESLint / Markdown、SGP 审计通过（2 个当前 upstream-owned 文件，884 个有效标记，生成物 0）。本次已实现部分的完整 `build-release`、`build-ts` 和 `tsc` 均通过；类型生成仅有既存上游 JSDoc 提示，生成入口无 tracked 差异。该结果覆盖当前实现快照，不关闭透明 Planar 和最终负责人视觉 gate。所有修改保留未提交。

共享输出自审确认：地图 additive 光照不会再次写入基础地表的 SSR ray / roughness 或 SSIL normal encoding；当前地图材质没有对应 specular / SSIL 记录，RGB 默认值为零，alpha 已由 WDR-P4E-06 保留。AO 则只增加地图自身的 indirect，基础地表 indirect 已按地图覆盖率衰减。资源释放检查覆盖 raw target、光照 program 与按容量创建的 clear program；borrowed classification / environment 资源仍由原 owner 释放。既有透明 / pick Shader 模板与共享效果消费者继续保留，不把未执行的不透明前向模板当作第二次几何提交。

共享边修正的有界成本对比（1280 × 800，16 次 GPU query / 状态）：无物理环境时，不透明整帧中位数 6.14→4.85 ms，透明 5.20→4.58 ms；该差异包含运行波动，不能宣称性能提升，只能说明未观察到整帧回退。20,000 三角形的 Worker 准备后 6 次中位数约 11.9→33.7 ms，增加一次性邻接表构建；持久几何均为 1,926,432 bytes。CPU 增长需如实保留，不能以 GPU 指标替代。

共享边修正后的另一个稀疏漏点根因为 native translucent Globe 禁用裙边，瓦片缝处读到远侧地球（不是 packDepth 编码错误）。在相同 native depth-only 命令加入已有裙边索引后，三个已定位像素从远侧变为近处地表深度；浏览器无光与物理受光画面漏点及邻近异常法线消失。产品修正仅对当前可见 direct overlays、地表上方相机及 showSkirts=true 生效，保留透明颜色路径。Globe 整组 23 项及最终 Globe E2E 通过；新增用例检查连续 alpha、showSkirts 开关、隐藏矢量后无深度修正，以及索引增加但绘制次数相同。16×16 heightmap 单瓦片 depth indices 为 1350→1710，使用现有 buffer；接缝修正前后透明整帧 GPU 中位数 4.58→4.59 ms，不透明 4.85→4.42 ms，均为有界观测、不能外推普遍性能。无新增 texture / bytes / draw，截图中的漏点与相邻暗点已消失。WDR-P4E-05 fixed / owner visual accepted 2026-10-15。

## 2026-10-15 transparent Planar increment

负责人批准透明 Planar 深度/提交预算，并确认此前页面视觉通过；旧增量 WDR-P4E-01/03/05/06/07 标记 fixed。WDR-P4E-02/04 保持 open，直到新增透明 Planar 的技术与负责人视觉 gate 关闭。

实现使用全局最近地形深度和与 opaque map 互斥的 RGBA16F，保持原有 OIT、透明地形和地下可见性。多视锥山坡重复混合、正交接缝漏色、地下对象覆盖 map pick、分段插值导致局部地图消失均已复现并按根因修正。Depth-only 重用 tile VA/index，Shader 不读 imagery/material，不执行光照；每个可见 tile 每视图一次（pick 同样），没有额外地图/普通几何或屏幕光照。

资源 GPU 用例检查 256×256 时 depth=262,144 bytes、map=524,288 bytes、opaque/transparent 互斥、opacity 切换复用、resize、隐藏时释放及 pick 复用。独立用例验证 log/linear alpha/pick、跨视锥重叠山坡、正交相机滚转、地形裁剪、前/后普通物体、越界 circle 与 TAA。实际浏览器曾发现技术计数通过而画面不完整，修复后须以最终截图和新增负责人判断关闭，不能沿用旧视觉确认。

最终技术证据：Ground / DeferredPlanar 共 25 项 GPU Specs 通过，包含 OIT 及原生排序透明、log/linear、正交滚转、TAA、裁剪、地下/前方对象与资源释放。最终 Planar E2E 通过，opacity=0.5/0 截图中的地图、circle、完整 VECTOR 文字与道路连续；无 GL/page errors。1280×800、34 个原生视锥的场景仅一张 12,288,000-byte 条件资源集、一次地形深度提交；地图 49 次等于原始分段命令出现次数，无额外地图提交。

单独有界成本测量使用 Edge 155 / D3D11、1280×800、本地坡面、关闭物理环境，固定相机/时钟，每状态 16 次 GPU query：opacity=1 整帧中位数 2.17 ms，opacity=0.5 为 0.89 ms。两种状态分别使用延迟与 OIT 受光，因此不能把此差异宣称为性能提升；报告实际成本即可。地图均 7 次；opaque 地形转入原 OIT 提交，仅另增 1 次深度；条件深度+颜色共 11.71875 MiB，符合批准上限。

完整 build-release、build-ts、tsc 通过；类型生成只有既存上游 JSDoc 提示。修改文件 Prettier、ESLint、Markdownlint 与 git diff --check 通过；全 AgentDocs Markdownlint 通过。全目录 Prettier 报告 420 个未修改文件的既存格式问题，修改文件与该清单交集为零，未扩展格式化范围。SGP 审计通过：当前 upstream-owned 2 个、886 markers、生成产物 tracked dirty=0。自审已核对 narrow hooks、条件资源销毁/借用、Shader 派生缓存归属、地图单次提交及排序透明后原命令恢复。WDR-P4E-02/04 技术通过，尚待本次新增透明 Planar 的负责人视觉确认；P4e 保留未提交。

## Final owner acceptance and architecture gate

2026-10-15 负责人明确回复新增画面通过并指示提交 P4e。此次确认单独覆盖新增透明 Planar 的本地地形、多视锥、地表 opacity=0.5 / 0 / 1 下的地图、圆点、完整 VECTOR 文字、道路与点击拾取；此前矢量增量的视觉确认保持有效。WDR-P4E-02 / 04 转为 fixed，全部七项 findings 关闭，没有未决 API、资源预算或本阶段画面 gate。

Architecture 最终结论：本阶段材质接入、有序地图合成、透明当前表面深度和拾取、共享效果及水面消费者均有对应 Specs / 浏览器、资源生命周期和有界成本证据；完整 release / types / tsc、定向静态检查与上游审计通过。按精确路径将代码、Specs、ADR / SGP 与 AgentDocs 形成独立本地 checkpoint，父提交为 P4d `4ba2e217c7`；保留原提交钩子，不提交生成物或混入后继阶段。

最终覆盖矩阵承接 [P4d 的阶段矩阵](2026-10-14-p4d-entry-audit.md#current-adaptation-matrix-and-remaining-work)，补齐当时仅剩的独立矢量入口；旧 review 仍保留其当时状态。

| 内容               | 已完成的既定适配                                                                                                         | 阶段证据                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Entity / Primitive | Phong / Fabric、批处理和动态 alpha、Ellipsoid、制图线色                                                                  | P4b `5bde0722ba`、P4d `4ba2e217c7` |
| glTF Model         | PBR / MASK、材质协议内的 CustomShader、clearcoat / anisotropy / specular、裁剪与轮廓、Bentley fill / edge                | P4a、P4d                           |
| 3D Tiles           | Model 内容、要素样式、分类 / inverse、多视锥、点云样式；Gaussian 专用合成和释放                                          | P4a、P4c、P4d                      |
| Globe              | 地形 / 影像、Fabric / 海洋、分类 / 裁剪、原生矢量、多视锥、透明专用路径；独立矢量 direct overlay 与透明 Globe 组合       | P4c `fbde52dcd5`、P4d、本 P4e      |
| Planar             | 不透明地表延迟受光、透明 OIT / 排序透明、影像 / Fabric / 阴影 / 天气；透明地表有序地图与拾取                             | P4d、本 P4e                        |
| 独立矢量切片       | background、flat、Globe / Planar ground、extrusion、circle / symbol、pattern / feature-state、alpha / 层序 / 遮挡 / pick | 本 P4e 的技术与负责人视觉证据      |
| 标注 / Voxel       | 实心 unlit 与透明标注专用 pass、体积专用合成；水面遮挡、TAA 与拾取                                                       | P4d，不要求改为 G-buffer 表面      |

统一入口仍由 `Scene.executeCommand` 在延迟绘制接管成功后提前返回，旧 Cesium 共享代码保留；未恢复第二套完整不透明前向绘制。opaque vector 的几何光照被 capture 门禁跳过，透明和拾取所需模板仍保留。当前授权目标没有另列未适配的上述内容家族；这不表示任意自定义 Shader / framebuffer / 不写深度的 opaque 命令或所有组合都已资格确认。

当前 P4e 改动的全部 upstream-owned 文件：

| 文件                                                     | SGP      | 集成目的                                                        |
| -------------------------------------------------------- | -------- | --------------------------------------------------------------- |
| `packages/engine/Source/Scene/Scene.js`                  | SGP-0046 | 当前视锥拾取深度复制及透明 Planar 的准备、分类和透明阶段窄 hook |
| `packages/engine/Source/Scene/GlobeTranslucencyState.js` | SGP-0012 | 可见 direct vector 的地表深度使用已有裙边索引，复用原提交       |

剩余边界与成本：方案 A 仍限定 WebGL2 / SCENE3D、单采样；WebGL1、2D、Columbus View、WebVR、MSAA 及既有明确拒绝的 debug / viewport override 不在资格内。矢量透明范围为当前可见表面，未扩展任意地下 / 背面跨透明排序、建筑投影阴影或完整 Model PBR。条件地图颜色 / 深度和地形提交遵守已批准预算；共享边邻接准备的 Worker CPU 增长已在上文量化保留。全目录未修改文档的既存格式问题不是本阶段运行时阻断项。成果交付于独立 feature 分支，不包含主线合并或发布；没有 active 后继阶段。
