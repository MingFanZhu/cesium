# C10 统一集成、Compatibility Matrix 与交付

## 元数据

- Extension：`planar-content`
- 阶段（Phase）：`C10-unified-integration-and-delivery`
- Status：`completed`
- Date：`2026-08-10`
- Branch：`feature/planar-content`
- Implementation base/checkpoint：`ef2df22e1957ddae6e8ec9bbca3f5623f0370d02`
- Planning owner：Architecture Agent
- Execution owner：Execution Agent（task `019fcff7-3313-7d03-b970-57b3d08e3a32`）
- Related extension plan：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- Related decision：
  [ADR-0022：平面内容兼容性矩阵与最终交付](../../../Documentation/SceneGIS/Decisions/ADR-0022-planar-content-compatibility-and-delivery.md)
- Previous checkpoint：C9 commit `ef2df22e1957ddae6e8ec9bbca3f5623f0370d02`
- Review request：实施完成后创建
  `AgentDocs/planar-content/reviews/2026-08-10-c10-unified-integration-and-delivery.md`
- Ownership：预期upstream-owned files=`0`、C10 SGP=`0`

## 阶段目标

C10不再增加新的内容类别，而是把C1-C9已经完成的能力作为一个可交付整体收口：

1. 形成与Cesium `1.144`基线绑定、逐类可执行的Entity Graphics与public Primitive/Geometry兼容性矩阵。
2. 修正C5时期的qualification、E2E、Sandcastle和package smoke，使它们真实覆盖当前八个child visualizer、
   C6-C9 public runtime与continuous ground，而不是继续验证旧的六类/vertex-only实现。
3. 以一个确定性local terrain profile验证automatic Entity、direct public Primitive、Ground Primitive、动态更新、
   selection、bounds、warm identity、provider replacement和destroy closure。
4. 保留一个EPSG:3857公开数据Sandcastle供项目负责人真实浏览器/GPU验收，并把所有外部网络依赖明确为
   best-effort，不让自动化依赖公网。
5. 完成build/types/API/package/upgrade/ownership证据；经Architecture review和项目负责人人工验收后关闭
   `planar-content` extension。

## 非目标

- 不新增Entity Graphics类别，不支持`Cesium3DTilesetGraphics`、3D Tiles classification、GeoJSON/CZML/KML
  转换或运行时重投影。
- 不新增classification、ordered ground layers、zIndex、arbitrary Material、shadow、custom shader或新的terrain
  LOD/request/cache协议。
- 不新增CI workflow；项目负责人已明确本扩展不需要workflow级交付。
- 不建立多GPU、全浏览器或大量极端输入矩阵；只运行与C10交付边界相关的最小充分验证。
- 不为没有可重复证据的性能猜测重写runtime；timing是诊断信息，功能、资源和稳定性才是hard gate。
- 不push、tag、publish或进入新的C11；发布动作仍由项目负责人另行决定。

## 当前源码与交付事实

### Automatic callback已经是gate加八个child visualizer

- `_SceneGISPlanarVisualizersCallback`当前固定顺序为gate、Anchor、Model、Polyline、Polygon、Solid、Area、Route、
  Path，共`9`个visualizer对象。
- gate仅接受live `SceneGISPlanarWorld`、`CustomDataSource`、disabled `EntityCluster`与批准的top-level Entity
  property allowlist；`Cesium3DTilesetGraphics`等未知内容会fail-fast。
- C5 E2E仍断言visualizer count=`5`，只创建Point/Billboard/Label/Model/Polyline/Polygon，已经不能代表当前
  automatic path。

### C5 qualification仍依赖旧的vertex-only terrain seam

- `SceneGISPlanarContentQualificationSpec`的moderate profile仍spy `world.getTerrainHeight`，并直接读取source
  Polyline/Polygon Geometry的Z来判断贴地。
- C9以后Polyline `clampToGround=true`与Polygon/Area/Corridor ground branch由
  `SceneGISPlanarGroundPrimitive`消费normal-render actual-cover snapshot；source Geometry不会被改写成terrain Z。
- C10必须用deterministic local terrain provider与ready ground current验证，不得继续通过stubbed resident query冒充
  continuous ground。

### 现有Sandcastle与public package smoke已经落后于C6-C9

- `scenegis-planar-content`目前只展示六类Graphics；Polyline错误使用不存在于批准profile中的
  `heightReference`字段，而正确入口是`clampToGround: true`。
- package smoke的public engine清单仍停在早期World/Imagery类型，遗漏Terrain与C6-C9 public类型；它还要求已删除
  `_SceneGISPlanarBufferOwner.js`进入tar，并把全部public symbol都假定为function，而
  `SceneGISPlanarTerrainSampler`是namespace object。
- C10应更新现有脚本和示例，不重复创建第二套交付入口。

### 当前公开与automatic产品范围

- Public low-level：`SceneGISPlanarPrimitive`支持Polyline、Polygon、Box、Cylinder、Ellipsoid、Wall、
  PolylineVolume Geometry；`SceneGISPlanarGroundPrimitive`只支持Polyline/Polygon Geometry和已批准Color
  appearance pairing。
- Automatic Entity共`16`类Graphics：Point、Billboard、Label、Model、Polyline、Polygon、Box、Cylinder、
  Ellipsoid、Plane、Ellipse、Rectangle、Corridor、Wall、PolylineVolume、Path。
- Continuous ground只适用于Polyline `clampToGround`，以及Polygon/Ellipse/Rectangle/Corridor的批准
  `heightReference`/`extrudedHeightReference`组合。其余类型只有absolute或anchor-level reference，不得在C10
  文档中扩大为continuous ground。

## 兼容性矩阵设计

C10新增`Documentation/SceneGIS/PlanarContentCompatibility.md`作为稳定、版本化的产品矩阵，并从
`PlanarContentGuide.md`、`Architecture.md`与UpgradeChecklist链接。矩阵至少记录：

- Cesium tag `1.144`、upstream commit `6d5d8b1f0725b6f831b336463f4b11c98023427b`与本扩展交付阶段C10；
- 全局环境：meter-based `Cartesian3`、fixed planar axes、SCENE3D-only、应用负责CRS一致、CustomDataSource-only、
  clustering disabled；
- 24个public engine SceneGIS入口与2个public widget入口，区分constructor/function和namespace；
- 16类Entity Graphics逐行列出position/source、允许的height模式、ground是否continuous、主要style/topology边界与
  负责的private visualizer；
- direct `SceneGISPlanarPrimitive`与`SceneGISPlanarGroundPrimitive`的Geometry/Appearance/ownership/picking边界；
- 明确unsupported：3D Tiles、classification、非Custom DataSource、enabled clustering、runtime reprojection、
  geodesic/rhumb、任意Material与每类已经fail-fast的Globe-specific property；
- 每一类对应的focused Spec或C10 qualification/E2E证据，不把Sandcastle当作自动化替代品。

矩阵应消除Guide中的历史歧义：C3的vertex-only叙述只保留为ordinary历史实现说明；当前Polyline/Polygon等
ground branch必须统一指向C9 actual-cover continuous ground。

## Qualification设计

更新现有`SceneGISPlanarContentQualificationSpec.js`，不再新建第二个大套件。

### 固定profile

- 保留C5 moderate热路径规模：256 Point、128 Billboard、128 Label、64 Polyline、32 Polygon与2个local glTF
  Model，用于可比较的warm/dynamic/lifecycle证据。
- 增加一个小型coverage cohort，每种Solid/Area/Route/Path Graphics至少一个合法实例；不把每类扩成大批量。
- 增加一个direct `SceneGISPlanarPrimitive`与一个direct `SceneGISPlanarGroundPrimitive`代表实例，证明应用无需
  private visualizer也能走公开低层API。
- 使用local、无网络、caller-owned TerrainProvider返回deterministic HeightmapTerrainData；至少包含一个输入顶点之间
  的terrain变化，以区分continuous ground与source vertex sampling。

### Hard gates

- gate加八个child全部激活，owner位于per-DataSource target，ordinary与ground路径类型正确；
- 16类Graphics至少通过对应focused suite，qualification coverage cohort验证八个child role均真实产出内容；
- ground current ready前bounds=`PENDING`，ready后pixel/depth/pick/bounds与actual terrain闭环；
- 20个identical warm frames保持slot/owner/current/command/VA identity和关键资源计数稳定；
- 五轮有限local mutation覆盖Anchor、ordinary Primitive、Ground Primitive及至少一个Solid/Area/Route/Path，未变对象
  identity保持；
- 一次deterministic provider replacement或revision convergence验证旧ground current被抑制并由新current替换；
- 三个small lifecycle cycles恢复EntityCollection listener、per-DataSource PrimitiveCollection、ControllerHost、DOM和
  caller-owned provider基线。

### Timing边界

- 记录同机浏览器/GPU、viewport、warm count、batch normalization、update/render median与P95。
- 不设置脆弱的固定毫秒门槛，不与不同机器数字比较；只有同一轮、同一profile出现可重复明显回退并能定位到
  SceneGIS private hotspot时才允许优化。
- C10不得因timing噪声扩大到全库性能工程。

## E2E设计

更新唯一`Specs/e2e/scenegis-planar-content.spec.js`：

- 使用local Cesium assets与deterministic local terrain，拦截并断言public network attempts=`0`；
- dev与release各执行同一条content E2E；不新增workflow；
- 断言visualizer count=`9`、world/controller唯一、per-DataSource target、terrain/ground ready和无page/console error；
- 每个child visualizer role至少选择一个original Entity，覆盖16类Graphics的创建状态；避免要求16个脆弱pixel点；
- 代表性检查ordinary Primitive、continuous ground、direct public Primitive、direct Ground Primitive、dynamic update、
  Entity remove、DataSource remove和Viewer destroy；
- release E2E必须使用release build，不把dev结果复用为release证据。

## Sandcastle与人工验收设计

更新现有`packages/sandcastle/gallery/scenegis-planar-content`：

- 继续显式创建EPSG:3857 World、OSM imagery、ArcGIS LERC terrain、Viewer、P4 controller与visible Credits；外部服务
  失败时显示best-effort状态，不静默报成功；
- 修正Polyline ground入口为`clampToGround: true`，文案改为actual-cover continuous ground；
- 以Basic、Solid、Area、Route/Path、Ground、Direct Primitive分组展示全部16类Graphics、一个direct ordinary
  Primitive与一个direct Ground Primitive；可用toolbar按钮切换视图，避免全部内容堆叠在一个局部；
- 保留有限dynamic run与serialized batch add/remove；重复点击、Add后立即Remove和失败cleanup必须确定性收敛；
- 页面显式列出坐标/高度语义与unsupported 3D Tiles/classification边界。

项目负责人人工验收清单：页面加载、terrain/imagery/credits、16类内容可见、八类代表Entity可选中、dynamic与batch
可重复、continuous ground随terrain成立、direct public primitives可见、相机导航正常、console无unexpected error。
人工验收由项目负责人明确确认；Execution与Architecture不得代替确认。

## Package、types与API交付

更新`scripts/scenegis/verify-planar-packages.mjs`：

- public engine清单覆盖SceneGISWorld/World/Core、Imagery、Terrain、七种Geometry、Primitive与GroundPrimitive共
  24个入口；public widgets仍为HomeButton/ViewModel两个入口；
- callable exports与`SceneGISPlanarTerrainSampler` namespace分开断言，不再全部假定为function；
- installed tarball外部consumer继续验证bare ESM `@cesium/engine`、`@cesium/widgets`、`cesium`与bare CJS
  `require("cesium")`；
- 更新critical private runtime file清单，删除BufferOwner，加入PrimitiveOwner、EntityTransform、Solid/Area/Route/
  Path、GroundBounds、GroundDraper等当前依赖；
- non-underscore private spelling保持runtime undefined；underscore soft-private build artifacts可存在于JS barrel，但必须
  精确缺席于engine/root/Cesium declarations与API HTML；
- 每个public类型的declaration/API page存在，并验证World/Viewer关键成员；保留broken-entry negative fixture；
- tar与consumer位于repo外临时目录，最终清理，不向仓库写入archive或node_modules。

## 影响路径

### 默认允许修改

- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarContentQualificationSpec.js`
- 现有C6-C9 SceneGIS focused Specs（仅在新增交付断言确有必要时）
- `Specs/e2e/scenegis-planar-content.spec.js`
- `packages/sandcastle/gallery/scenegis-planar-content/**`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/**`
- `AgentDocs/planar-content/**`

### 条件允许

- 如果qualification/E2E发现C1-C9的确定性产品缺陷，可在`packages/engine/Source/SceneGIS/**`或
  `packages/widgets/Source/SceneGIS/**`做最小修复，并补同层focused Spec和review记录。
- 预期不修改upstream-owned file。若发现必须修改少量现有SGP seam，可复用正确SGP并完整审计；若需要大量Cesium
  代码、改变public contract或扩大总体范围，停止并通知Architecture。

### 禁止范围

- 不修改`.github/workflows/**`。
- 不新增第二个content Sandcastle、第二套qualification或重复package脚本。
- 不手工编辑或提交generated files、Build、SpecList、root declarations或API HTML。
- 不修改terrain selection/SSE/cache/request、C9 drape协议或Viewer tracking/fly/zoom guard，除非有直接阻断证据。

## 验收命令与证据边界

Execution应按影响逐步运行，最终最小充分矩阵为：

1. C10 qualification focused suite；C4 automatic Widget/Viewer与C6-C9 affected focused suites。
2. `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`。
3. `npm run test-e2e -- Specs/e2e/scenegis-planar-content.spec.js`与对应release命令；在本机headless WebGL不可用时
   使用既有headed real-GPU方式并如实记录，不伪报headless通过。
4. `node scripts/scenegis/verify-planar-packages.mjs`。
5. `npm run build-sandcastle -- --no-embeddings`与no-embedding gallery discovery；不因已知外部Hugging Face metadata
   失败重复运行standard embedding。
6. changed-scope ESLint、JS/Markdown Prettier、AgentDocs Markdownlint、`git diff --check`与official upstream audit。
7. 生成结果只做read-only断言，最终`generated status=0`。

不要重复执行无关全库回归。CesiumWidget/Viewer/default Globe只运行与C4/C6-C10 seam直接相关的focused aggregate。

## AgentDocs与review回写

- 新建pending review：
  `AgentDocs/planar-content/reviews/2026-08-10-c10-unified-integration-and-delivery.md`。
- phase结果必须记录compatibility rows到具体Spec/E2E/Sandcastle的映射、direct unique case count、timing环境、
  package public/private inventory、人工验收状态、ownership和实际偏差。
- 更新extension plan、README、plans/reviews index、Architecture/DevelopmentGuide/PlanarContentGuide/
  Compatibility/UpgradeChecklist。
- 人工验收前不得把C10或extension标记`completed`；review通过但人工未完成时明确记录唯一remaining gate。

## 完成门槛

- Compatibility matrix与实现、Specs、package exports一致，没有C3/C5旧语义冲突。
- 16类automatic Graphics、七种public Geometry、ordinary/Ground Primitive均有明确自动化与可执行示例证据。
- local dev/release E2E、installed-package smoke、build/types/docs、Sandcastle build与ownership audit通过。
- 没有新增workflow、未登记upstream modification、generated files或公网自动化依赖。
- Architecture/code/release-evidence review通过，项目负责人完成真实浏览器/GPU人工验收并明确确认。
- Architecture Agent形成C10独立中文本地提交，并把extension状态更新为`completed`。

## 当前交接

- C1-C9均已review并独立提交；C9 checkpoint为`ef2df22e1957ddae6e8ec9bbca3f5623f0370d02`。
- ADR-0022已`approved`，C10 phase=`completed`；Architecture/code/release-evidence review=`approved`。
- Approved review：
  [C10 unified integration and delivery review](../reviews/2026-08-10-c10-unified-integration-and-delivery.md)。
- Architecture focused re-review已确认C10-R001～C10-R004全部关闭，没有新的阻断项。
- 项目负责人在旧C9 actual-mesh backend人工验收前作出替换性架构决定：不采用混合后端，后续C11按Cesium
  GroundPrimitive/GroundPolylinePrimitive思想建立单一planar depth/stencil GPU backend。因此旧页面没有被宣称
  人工验收通过，原最终产品门禁转移到C11后的新页面。
- C10仅作为自动化qualification、E2E、package与delivery baseline完成并独立提交；extension继续`active`。

## 偏差与结果

### 实际设计与影响路径

- Product runtime delta=`0`。C10没有修改`packages/engine/Source/**`、`packages/widgets/Source/**`或任何
  upstream-owned product file。
- 新增`Documentation/SceneGIS/PlanarContentCompatibility.md`，绑定Cesium `1.144`与upstream commit
  `6d5d8b1f0725b6f831b336463f4b11c98023427b`，逐项记录24个engine public入口、2个widget入口、16类
  automatic Entity Graphics、ordinary/Ground Primitive、高度与unsupported边界。
- 更新现有而非新增第二套入口：
  `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarContentQualificationSpec.js`、
  `Specs/e2e/scenegis-planar-content.spec.js`、
  `packages/sandcastle/gallery/scenegis-planar-content/**`和
  `scripts/scenegis/verify-planar-packages.mjs`。
- Qualification保留moderate profile `256 Point + 128 Billboard + 128 Label + 64 Polyline + 32 Polygon`，新增一个
  小型C10 deterministic local terrain case，覆盖Solid/Area/Route/Path、automatic ground、direct ordinary/
  Ground Primitive、20 warm frames、5轮有限mutation、provider replacement/convergence和cleanup。
- E2E继续只有一个content spec；dev/release分别运行，阻断所有非local request，验证gate + 8 children=`9`、16类
  Graphics创建、八个child role各一个original Entity GPU pick/Viewer selection、direct public primitives、
  dynamic/remove/destroy与网络尝试=`0`。
- Sandcastle继续只有`scenegis-planar-content`一个案例，展示16类Graphics、direct ordinary/Ground Primitive、分组
  视图、有限dynamic与serialized batch；OSM/LERC仍仅为带visible credit和失败状态的best-effort人工入口。

### Compatibility-to-evidence mapping与计数

- 24+2 public inventory、bare ESM/CJS、declarations/API、soft-private边界和broken-entry negative fixture由
  `verify-planar-packages.mjs`直接验证；installed engine/widgets/root的非下划线`SceneGIS*` export集合分别精确等于
  24、2、26项，`SceneGISPlanarTerrainSampler`按namespace object而不是callable验证。
- 16类automatic Graphics与八个child roles由C10 qualification、唯一local dev/release E2E和既有C4/C7/C8/C9
  focused suites共同覆盖；Sandcastle只作为人工展示，不替代自动化。
- C10新增direct `it` case=`1`（qualification）；E2E扩展既有case=`1`，Viewer扩展既有case=`1`，二者不计为
  新增direct case。Qualification aggregate=`4/4`；受影响engine focused aggregate=`46`（qualification 4 +
  C4/Content/Primitive/Ground/Solid/Area/Route/Path/geometry 42），widgets Viewer aggregate=`2/2`。Aggregate之间
  可能复用同一产品路径，未冒充direct unique总数。
- Timing环境为Windows 10、Chrome `151.0.7896.4`、headless WebGL、`256x256` drawing buffer；协议保持20 warm
  frames和5轮约10% mutation，输出batch median/P95仅作诊断，无跨机器阈值。当前runner成功摘要不持久化逐batch
  数值，因此不声明性能提升；真实浏览器/GPU timing仍属于人工验收风险。

### 验证矩阵

| 命令/证据                                                                                                  | 结果                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarContentQualification"`                       | Exit 0，`4/4`                                                                                                                                    |
| C4 Content Widget、callback、Primitive、GroundPrimitive、Solid、Area、Route、Path、geometry focused suites | 各Exit 0，aggregate `42`                                                                                                                         |
| widgets `SceneGISPlanarContentViewer`                                                                      | Exit 0，`2/2`；同步更新gate + 8 children=`9`断言                                                                                                 |
| `npm run build` / `npm run build-release`                                                                  | Exit 0 / Exit 0                                                                                                                                  |
| `npm run build-ts` / `npm run build-docs` / `npm run tsc`                                                  | 全部Exit 0；`build-ts`仅有既有广域TSD-JSDoc warnings                                                                                             |
| `node scripts/scenegis/verify-planar-packages.mjs`                                                         | Exit 0；engine/widgets/root exact exports=`24/2/26`，bare ESM/CJS、soft-private与broken-entry通过                                                |
| local dev/release content E2E                                                                              | 各Exit 0，`1/1`；direct Ground pick/depth/terrain闭环与八role original Entity pick/selection通过；用户`8081`进程保留，使用已验证等价local config |
| `npm run build-sandcastle -- --no-embeddings`                                                              | Exit 0；仅既有Vite plugin/chunk warnings                                                                                                         |
| `npm run build-gallery-no-embedding`（`packages/sandcastle`）                                              | Exit 0；发现并处理`307`个案例                                                                                                                    |
| changed-scope ESLint / Prettier / Markdownlint                                                             | Exit 0（最终AgentDocs回写后再次执行）                                                                                                            |
| `git diff --check` / official upstream audit                                                               | Exit 0（最终回写后再次执行）                                                                                                                     |

### Ownership、生成边界与剩余风险

- 相对implementation base，upstream-owned files=`0`、C10 SGP=`0`、new patch markers=`0`；
  `.scenegis/upstream-patches.json`、SGP-0001/0002及其hunks均未修改。
- Public inventory为engine `24`、widgets `2`；deleted BufferOwner不再进入package smoke。Underscore soft-private JS
  barrel可由生成链出现，但installed declarations和API HTML必须为`0`；non-underscore private spelling runtime为
  `undefined`。
- Generated files只用于验证，最终status=`0`；repo外临时package consumer/E2E config已清理。
- 自动化不访问公网。剩余风险为公开OSM/LERC服务、真实GPU/driver画面与交互以及诊断timing；均留给项目负责人
  在C11替换ground backend并更新Sandcastle后完成最终人工验收；C10不宣称旧后端人工验收通过，extension继续
  `active`。

### Post-review architecture supersession

- `2026-08-10`：项目负责人在C10 review通过后明确拒绝长期混合actual-mesh/stencil backend，要求按照Cesium球面
  ground思想使用单一GPU depth/stencil路径。该决定不否定C10自动化、package与交付基线证据，但使旧C9 ground
  runtime及其Sandcastle画面不再是最终产品验收对象。
- 为保持phase提交独立，C10以自动化交付baseline标记`completed`并先形成中文本地提交；新的public语义收窄、
  C9 runtime删除、classification/ground-polyline Shader与最终浏览器/GPU人工验收全部进入后续C11。
