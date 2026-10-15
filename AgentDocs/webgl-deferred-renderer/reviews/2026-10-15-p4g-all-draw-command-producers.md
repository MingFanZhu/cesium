# P4g 全部 DrawCommand 生产者审计

- Type: review；Status: completed；Created: 2026-10-15。
- Target: P4f `8f3baba438` 之后全部命令生产者。
- Reviewer / owner: 当前 architecture / execution 任务自审。
- Plan: [P4g](../plans/2026-10-15-p4g-all-draw-command-producers.md)。
- Inventory: [全部生产者矩阵](2026-10-15-p4g-command-producer-matrix.md)。

## Initial findings (historical; current disposition follows)

| ID         | Priority | Status | Evidence / required disposition                                                                                                                                                                         |
| ---------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WDR-P4G-01 | high     | open   | PointCloudEyeDomeLighting 的离屏点绘制和混合命令被 DeferredLayout 拒绝。原生三个 GPU Specs 中两个在真实 render 报错，一个 pick 通过。须接入延迟结果并保留 EDL / alpha / occlusion / lifecycle。         |
| WDR-P4G-02 | high     | open   | TimeDynamicPointCloud 仍使用 PointCloud VS 的 Lambert / ambient 光照；当前按 unlit passthrough 捕获已受光颜色，未完成不透明材质分离。须保留 normalShading、样式、动态帧、透明及拾取。                   |
| WDR-P4G-03 | medium   | open   | ReflectionProbes 显式六面捕获仍直接运行不透明受光 Shader；需明确与统一材质、局部灯及专用捕获语义的接入，不能按未列入旧矩阵排除。                                                                        |
| WDR-P4G-04 | high     | open   | 75 个直接生产者、208 个创建 / 派生点及委托入口尚需逐项闭合。仅真正有同类型替代及提前拒绝 / 门禁的模块允许排除。                                                                                         |
| WDR-P4G-05 | high     | open   | PointPrimitiveCollection 的 TRANSLUCENT-only 命令被标为 OPAQUE，真实渲染触发深度校验失败；新增混合 / 遮挡 / 拾取用例 1 失败、mixed 模式 1 通过。SGP-0055 已按原有 opaqueCommand 标志修正 pass，待复验。 |
| WDR-P4G-06 | medium   | open   | DebugInspector 的 debugShowCommands / debugShowFrustums 被通用场景门禁拒绝，尚未找到同功能替代依据；须按新要求接入，不能沿用 P4e 的一般排除表。                                                         |

## Reproduction

在 P4f runtime、Edge 155 / WebGL2 上运行原生 `Scene/PointCloudEyeDomeLighting`：3 项中 2 FAILED / 1 SUCCESS。失败用例为 “adds a clear command and a post-processing draw call” 与 “works when point cloud shader changes”；均报 `Deferred material layout requires ordinary depth-writing opaque commands.`。原生 “does not change commands for pick calls” 通过。这是运行时接入失败，不是测试命令数断言过时。

PointCloud 的源码链为 TimeDynamicPointCloud.update → 独立 PointCloud → normalShading 在 VS 乘 Lambert / 0.4 ambient 与主光 → 未识别的普通颜色写入 deferred passthrough。Model pnts 的已验收材质路径不覆盖此链。

## Discovery and ownership

已优先请求图谱符号 / 调用关系；Layout 不在索引，DeferredLighting 索引仍为早期版本，后续 graph 查询未返回可用结果。故按规则回退到当前源读取和 AST 调用点清单。清单中间数据留在 ignored Build；本目录仅保留提炼后的模块矩阵与结论。

本阶段当前改动的 upstream-owned files 共六项，均采用成对最小接点：

- `packages/engine/Source/Scene/PointPrimitiveCollection.js`：SGP-0055，仅透明 pass 修正。
- `packages/engine/Source/Scene/PointCloud.js`：SGP-0056，独立点材质捕获。
- `packages/engine/Source/Scene/PointCloudEyeDomeLighting.js`：SGP-0057，延迟帧注册与资源释放。
- `packages/engine/Source/Scene/Cesium3DTileset.js`：SGP-0057，释放所属 EDL 处理器。
- `packages/engine/Source/Scene/TimeDynamicPointCloud.js`：SGP-0057，释放所属 EDL 处理器。
- `packages/engine/Source/Scene/Cesium3DTileStyle.js`：SGP-0058，Shader 函数缓存计入签名与变量替换表。

其余产品实现为 SceneGIS-owned 源。EDL 在批准预算内完成；阶段保持 open、未提交。

## Current disposition and verification

上表保留最初失败模式；以下为当前处置，不把初始 open 当作尚未实施任何修正。

- WDR-P4G-01：closed，批准预算内完成；[EDL 方案](../discussions/2026-10-15-point-edl-depth-budget.md)及下述 GPU / 浏览器证据通过，负责人已确认点云画面与拾取通过。保留原生点专用邻域，不用混合场景深度偷换其语义。
- WDR-P4G-02：closed，材质分离、EDL 组合技术与点云视觉通过。换主光时 raw color 不变；normalShading 开关、样式 show / alpha、拾取、销毁经过真实 GPU。原生 TimeDynamicPointCloud 的多帧 clipping 用例通过。四张既有材质目标复用；材质分离无新增几何提交，EDL 提交单独按批准预算计量。
- WDR-P4G-03：deferred by owner。2026-10-15 负责人明确“反射探针不启用，仅作为技术积累，所以现阶段可以先不管”。保留源码与已知问题，不再阻塞 P4g，也不宣称其完成延迟适配。原有六项 GPU 用例五通过、一失败；失败为 “shares 256 tiled lights with cube cameras and restores the main-camera table”，主视图 `_drawLight` 超过 16 fragment samplers。离屏不透明光照和启用探针后的主视图容量均留待恢复探针工作时处理。
- WDR-P4G-04：矩阵已建立但未全部关闭。新增点深度 helper 后直接生产者 76 / 创建点 210；还须继续追踪委托入口，特别是环境 / 调试派生，不能把 known family 测试外推所有分支。探针例外来自负责人本轮明确范围决定，不是按名称或未知支持情况排除。
- WDR-P4G-05：技术 fixed。修复前仅透明模式报深度写入布局错误；修复后仅透明和 mixed 两项真实颜色、遮挡、拾取、移除测试通过。没有额外附件或提交，待阶段视觉。
- WDR-P4G-06：partial。debugCommandFilter 已恢复，过滤前后材质清理回归通过；debugShowCommands / debugShowFrustums 和 shadow cascade tint 仍有门禁，不能关闭整个 finding。
- WDR-P4G-07：技术 fixed，原生环境门禁遗漏。明确注册的 PlanarEnvironment 在高级环境 disabled 时恢复旧天空 / Sun / Moon 资源及绘制，违反 ADR-0161 不恢复旧视觉的契约。owned PlanarWorld 现按 deferred frame 标志提前返回，仍保留显式 light authority。新增真实 GPU 用例修复前生成两个旧 Shader 并输出蓝天空，修复后保持背景色、没有旧 Shader 或网络请求；无新增资源 / 提交 / SGP。
- WDR-P4G-08：closed，两类点云共享同一 Cesium3DTileStyle 时，原生 Shader 函数缓存忽略签名与变量替换表，浏览器真实编译报错。SGP-0058 为 color / show / pointSize 三类缓存计入这两个参数。192 项原生样式测试、实际混合点云 GPU 和页面通过；没有新增 API 或资源预算。

## Point-cloud qualification and owner acceptance

六项新增真实 GPU 验证 EDL 可见响应 / 半径 / 强度、动态 normalShading、多个处理器、普通物体后的点邻域、TAA 与完整视锥去重、Model 裁剪边、AO / SSR / SSIL、两帧 TimeDynamicPointCloud、共享样式、拾取、关闭 / 隐藏 / resize / destroy。八项生产者回归、192 项原生样式测试通过；页面十六个控制步骤无 GL 错误。1280×800 两个处理器共 15.625 MiB、两次点深度提交，多视锥去重后仍两次，关闭或透明时归零。EDL 合入原有光照组，没有单独屏幕合成；点颜色 gamma 校正复用既有提交。

原生三个 EDL 用例现在没有原布局拒绝错误，其中两个仍要求前向流程增加两个命令，因此旧命令数断言失败；没有将其记录为通过或修改产品去满足旧流程。新增 owned GPU 检查当前明确契约。负责人于 2026-10-15 明确确认“点云画面与拾取通过，继续 P4g”，关闭点云增量；其他生产者的阶段 gate 仍独立。

本轮新增 `SceneGISDeferredCommandProducers` 八项通过：上述点云 / 点集合 / 过滤，加上 Buffer 点、线、面三个线性透明与不透明遮挡用例，以及显式 CubeMapPanorama 背景、主表面覆盖和销毁用例。原生 GPU particle 十一项、CloudCollection 四十七项通过，二者保留透明专用通道，不因存在高级体积云而排除 sprite clouds。

原生 `Scene/renderBuffer*` 四十二项中三十九通过，三个失败均为 alpha=0.5 的旧显示域断言：期望绿色 64，实际 94。ADR-0161 已明确先在线性浮点空间合成，再做显示 gamma，正确值为约 `128 * pow(0.5, 1 / gamma)`；新增 owned 回归直接验证该契约，没有改产品去恢复旧 sRGB 混合。其他初次自建夹具误用 allowPicking 默认 false、Buffer destroy 后可复用 CPU 状态的问题已修正，不能报作运行时缺口。

另记录一个待隔离观察：直接修改 BufferPointCollection.modelMatrix 的平移后，单点可能落出旧的零半径 boundingVolume / 紧视锥；该行为需与原生基线核对，本轮遮挡资格采用创建时确定的前后集合，不据此声称动态模型矩阵已关闭。

源 build、变更文件 Prettier / ESLint / Markdownlint 通过。基线差异 SGP 审计通过，当前 delivery upstream-owned 六项、生成物 dirty=0；全 AgentDocs Markdownlint 通过，Prettier 全目录仍有 419 个既有未改文件告警，本轮变更文件已单独格式化通过，不顺手修改历史文档。当前只达到本轮技术增量与点云负责人视觉验收，不是全阶段 release/types、成本、视觉或最终提交 gate。未完成项保留在本 review 与 P4g plan。

## Debug qualification and visual rejection follow-up

当前清单更新为 77 模块 / 217 调用点，EDL 与 Debug helper 均已纳入矩阵。以下为此前记录的后继，不删除初始失败证据。

- WDR-P4G-06：调试着色技术实现完成；四项 debug GPU、反色分类一项、扩展材质一项、点云 EDL 调试响应一项通过。默认模式新增调试资源 / 提交为零，透明不增加提交。普通调试目标 8 bytes/pixel；反色分类 mask 扩充另加 4 bytes/pixel；普通屏幕额外提交为零、反色分类一次，均低于已批准上限。当前主光照增加一个 sampler，需完成带 feature style 等满容量组合核对后再关闭方案偏差。
- WDR-P4G-09：技术 fixed，PostProcessStageCollection 递归 update 丢弃 displayHdr，首帧 LDR 被误 tone-map。透传 displayHdr 后实际颜色与命名输出回归通过。原生 26 个失败包含 25 个无深度 OPAQUE 屏幕夹具和 1 个旧 FXAA 池目标别名断言，不报作全部通过。
- WDR-P4G-10：技术 fixed，skip-LOD ClearCommand 被当作普通不透明材质；现从布局排除，反色分类清理路由到实际 stencil 所属材质目标。原生 duplicate backface 用例通过，增加的反色分类 owned 用例尚待完成最终颜色复核。无新增资源 / 提交。
- WDR-P4G-11：技术 fixed，Vector3DTilePrimitive debugWireframe 无深度命令不属于材质表面；保留每视锥光照后的独立无光照 pass，两类 WebGL2 原生线框回归通过。Model classification wireframe 具体分支仍须完成核对。
- WDR-P4G-12：负责人调试视觉 rejected 后已找到具体根因并技术修复。Globe command pool 由带法线 fill mesh 换到不带法线 terrain mesh 时，基础 Shader 可以不变；ShadowMap 原接收缓存只看 shader / shadow / cast 状态，没有比较 hasTerrainNormal。实际页面出现两块瓦片布局失配，隐藏全部普通物体后仍有大块伪阴影。SGP-0013 增加布局失效条件及记录，不取消地形自投影，不改 bias、滤波、纹理或提交预算。新增缓存转换回归修复前失败；修复后全部八项 ShadowQuality 通过，原相机实际 GPU 布局失配为零、大片伪阴影消失。Planar 透视 / 正交阴影两项通过；验收页原默认垂直太阳投影在物体下方，现以斜向自定义主光展示阴影。页面原 reflections=false 及默认 100 m 射线不匹配公里尺度，现开启并设 12000 m / 20 m thickness；切换调试模式不再关闭已打开的阴影。新画面仍须负责人重新确认。

原生 metadata pick 19 项、snap 21 项通过。BufferPoint modelMatrix 观察涉及的两个产品文件与上游基线无差异；未做原生运行时对照，不据此声称动态矩阵已验证或问题已修复。

当前 P4g 累计 upstream-owned 修改九项：PointPrimitiveCollection.js（SGP-0055）、PointCloud.js（SGP-0056）、PointCloudEyeDomeLighting.js / Cesium3DTileset.js / TimeDynamicPointCloud.js（SGP-0057）、Cesium3DTileStyle.js（SGP-0058）、Scene.js / PostProcessStageCollection.js（SGP-0046）、ShadowMap.js（SGP-0013）。这些文件均在 packages/engine/Source/Scene/ 下；其余实现 / Specs / 页面为 SceneGIS-owned。

阶段保持 open，点云 owner acceptance 保留有效，调试视觉尚未关闭；不要沿用页面仅无 GL 错误的技术检查替代负责人视觉。全量 release / types、剩余矩阵、满 sampler 场景与最终独立提交仍待完成。

## Final technical review and owner acceptance

2026-10-15，当前 architecture / execution 任务完成逐模块自审。最终 AST 清单为 77 个模块 / 217 个调用点（77 construct、79 derive、61 screen factory），与同目录生产者矩阵的 77 行一一对应。公共委托入口、专用离屏 / 屏幕 / pick / shadow / classification 和旧环境门禁均已核对，未发现仍需接入的生产者。以下结论取代此前 handoff 的待核对状态，但不删除初始失败证据。

- WDR-P4G-01 / 02 / 05 / 08：closed；独立点材质、EDL、点集合透明和共享样式缓存通过技术验证。点云负责人视觉通过继续有效。
- WDR-P4G-03：deferred by owner；局部反射探针六面捕获及其启用后容量问题保留，不宣称适配。负责人另外明确暂缓透明物体的水面 SSR 倒影；不透明 / MASK 和物理天空反射仍在当前通道。
- WDR-P4G-04：technical closed；全量矩阵完成，未知行和笼统待复查项已清零。Model / Primitive / Entity / Tiles / Globe / Planar / 两类矢量 / 标注 / 体积 / Buffer / 粒子等分别保留对应命令证据，不按名称推断统一覆盖。
- WDR-P4G-06：closed，技术与负责人最终视觉通过。四项 GPU 与扩展材质、分类、EDL 组合通过；完整采样器组合的新增失败由下述 WDR-P4G-13 修复。8 类包围体调试 GPU 通过。
- WDR-P4G-07 / 09：closed；旧 Planar 环境不恢复、首帧 LDR / 后处理命名输出通过，均保持既有公共配置语义。
- WDR-P4G-10：closed；新增真实 skip-LOD / inverse / backface GPU 检查颜色、stencil 清理目标和提交数通过。初次黑色来自夹具相机位于 88 m 高建筑内部；改为 200 m 并收紧 SSE 保留混合父子瓦片，不改产品以绕过校验。
- WDR-P4G-11：closed；原生两类 vector 分类线框与新增 Model classification wireframe 的不同路由均有真实 GPU 证据。新增 vctr 贴地线在 Globe 上颜色、隐藏和要素拾取通过。
- WDR-P4G-12：closed，技术与负责人最终视觉通过；Globe command pool 法线布局失效回归及八项阴影质量通过，Planar 透视 / 正交两项通过。修复页保留负责人原相机可复现视角；页面默认主光与水面射线范围调整只用于呈现既有能力，不改变阴影预算或提高设备要求。
- WDR-P4G-13（high）：fixed。完整 feature style + specular / clearcoat / anisotropy + 物理天空 / 云影 / 局部灯在 debug 下实际要求 17 samplers，超过设备 16 导致链接失败。扩展 RGBA16F 目标改用一张数组的独立层，MRT 仍逐层写入，光照 / 反色复制用一个 sampler。真实 Globe / Planar 组合最多 14 samplers，数组写入 / 精度 / 借用 / resize / release 与原生材质对照通过。存储字节、层数、MRT 容量、提交、WebGL2 和公共 API 均不变；SGP-0059 的两个窄接点已登记。

### Verification and cost evidence

本轮最终的最小充分证据如下；不将旧夹具失败报成全仓测试通过，不无限叠加组合矩阵。

| 风险                                | 证据                                                                                                                                      | 结果                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 全生产者新路由 / 透明 / 拾取        | SceneGISDeferredCommandProducers，含 skip-LOD、Model wireframe、vctr clamped lines、三种 Buffer、点集合、独立点云、panorama、post-process | 13 GPU 通过                                            |
| 扩展材质数组格式与所有权            | SceneGISMaterialArray；SceneGISDeferredMaterialExtensions；SceneGISDeferredPointCloud                                                     | 1 + 7 + 4 GPU 通过                                     |
| 点邻域 / 调试 / 生命周期            | SceneGISDeferredPointEDL；SceneGISDeferredDebug                                                                                           | 6 + 4 GPU 通过                                         |
| 反色分类与独立层                    | SceneGISDeferredClassification 的 12 项覆盖；多视锥 log / linear 与 OIT / sorted 定向两项复核                                             | 通过；解析混合夹具明确关闭默认大气后两项通过，不改产品 |
| 原生透明分类 / 透明地表深度         | TranslucentTileClassification；GlobeTranslucencyFramebuffer                                                                               | 12 + 4 GPU 通过                                        |
| 包围体辅助诊断 / Buffer CPU 边界    | 8 类原生 debug bounding volume；BufferPointCollection                                                                                     | 8 GPU + 11 CPU 通过                                    |
| 阴影布局与 Planar 主光              | SceneGISShadowQuality；SceneGISPlanarShadows                                                                                              | 8 + 2 GPU 通过，修复前缓存转换用例失败                 |
| 完整屏幕 / 材质 / 环境 / debug 组合 | Globe / Planar 浏览器，十项开关、TAA、多视锥、开云、要素样式、三扩展材质                                                                  | 两项通过，GL errors=0，最大 14 samplers                |
| 源码及发布 / 类型                   | gulp build；build-release；build-ts；tsc                                                                                                  | 通过                                                   |

Edge 155 / WebGL2、1280×800 的 debug 浏览器测量：Globe 单视锥 89 次材质 / 89 次额外 tint，多视锥 133 / 133；Planar 为 15 / 15 与 38 / 38。两者均 7.8125 MiB，普通额外屏幕合成为零，关闭 debug 后额外字节 / 提交归零；这仅是调试成本，不声明整帧普遍提速。GPU 分类用例验证 inverse mask 合计 12 bytes/pixel、一次合并，仍低于批准 16 bytes/pixel / 两次屏幕上限。EDL 两处理器共 15.625 MiB / 两次点深度提交，多视锥去重，已记录的负责人批准和验收保持有效。数组替换没有增加字节或提交。

### Legacy test distinctions and remaining boundaries

- 原生 Framebuffer 前缀套件 69 通过、1 失败；失败仍为旧夹具创建 RGBA + UNSIGNED_INT 纹理，堆栈在未修改 Texture.loadNull，未进入新层附件接点。P4c 的基线隔离已有同一失败证据。普通 2D / cube / MRT / depth 附件通过，新增数组单独 GPU 验证。
- 原生 EDL 两个旧命令数断言、Buffer 三个旧显示域 alpha 断言和 PostProcess 的无深度 OPAQUE / 旧池别名夹具差异保持明确记录；当前契约由对应 owned 真实 GPU 验证，不静默回退或修改产品去迎合旧流程。
- BufferPoint modelMatrix 直接写内部矩阵的观察已核对到 getter 的 readonly 契约；构造时 clone，点位置变更负责更新 bounds。两个产品文件与上游无差异，11 项原生 CPU 通过。不声称支持该未公开的动态写法，也不把它当作已修复的延迟缺口。
- 按负责人 A 决定，WebGL1 / 2D / Columbus / WebVR 不纳入当前模式；原生视觉雾 / 大气 / 天体由高级环境替代并明确门禁。局部反射探针、透明对象水面 SSR 按负责人决定暂缓。其他透明内容继续前向 / OIT 或原有专用通道；不承诺严格的多层折射排序。

### Complete upstream-owned delivery list

本阶段累计 11 个 upstream-owned files，均为最小成对接点；本阶段没有提交生成物。

| File (under packages/engine/Source/) | SGP      | Purpose                                                 |
| ------------------------------------ | -------- | ------------------------------------------------------- |
| Scene/PointPrimitiveCollection.js    | SGP-0055 | Transparent-only pass                                   |
| Scene/PointCloud.js                  | SGP-0056 | Styled point material before lighting                   |
| Scene/PointCloudEyeDomeLighting.js   | SGP-0057 | Register / release owned point depth, early return      |
| Scene/Cesium3DTileset.js             | SGP-0057 | Destroy owned EDL processor                             |
| Scene/TimeDynamicPointCloud.js       | SGP-0057 | Destroy owned EDL processor                             |
| Scene/Cesium3DTileStyle.js           | SGP-0058 | Signature / substitutions in shader cache key           |
| Scene/Scene.js                       | SGP-0046 | Debug routing, skip-LOD clear, dedicated wireframe tail |
| Scene/PostProcessStageCollection.js  | SGP-0046 | Preserve displayHdr during recursive update             |
| Scene/ShadowMap.js                   | SGP-0013 | Terrain normal layout in receive cache invalidation     |
| Renderer/Framebuffer.js              | SGP-0059 | Borrowed array-layer attachment                         |
| Renderer/createUniform.js            | SGP-0059 | Native array sampler binding                            |

### Phase gate

变更文件 Prettier / ESLint / Markdownlint、git diff --check 和上游补丁审计通过。补丁审计识别本阶段 11 个 upstream-owned files，生成物 dirty=0；矩阵 77 行、217 调用点、77 个唯一模块与 AST 一致。完整构建和类型检查通过，类型生成器的既有 JSDoc 告警保留，不记作新运行时缺口。

2026-10-15 负责人在最终验收页确认“画面通过，提交 P4g”。调试着色、Globe 空地伪阴影、Planar 斜向投影与水面不透明反射的最终视觉 gate 已关闭，点云此前验收继续有效。77 个生产者模块 / 217 个创建和派生点的技术审查、Specs、浏览器 / 成本检查、完整 release / types、静态与补丁审计均已完成。本提交为 P4g 独立本地 checkpoint；全分支当前 WebGL2 / SCENE3D 单采样、不透明 / MASK 延迟与透明专用前向目标完成，没有 active phase。反射探针和透明物体水面 SSR 仍按负责人决定暂缓，不宣称这两项已适配。

WDR-P4G-01 / 02 / 04 至 13 全部关闭；WDR-P4G-03 按负责人明确决定 deferred。旧夹具差异与暂缓能力保留上文，不把已批准的例外改写为已完成实现。完成本次本地提交后结束该分支当前任务，不自动合并主线或发布。
