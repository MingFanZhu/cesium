# 全球网格局部影像与最低数据层级设计评估

- Type: discussion / design assessment
- Status: superseded；由同日负责人确认的单向祖先采样契约替代
- Author / owner: 当前 Agent / Architecture；产品取舍由项目负责人确认
- Created / Updated: 2026-10-15
- Source baseline: `scenegis/develop @ c6ac9e2080a51c1e867df8f2c4b7d451c3d7deed`
- Parent plan: None；既有 [extension](../plans/2026-08-05-planar-world-extension.md) 与
  [通用影像来源](../plans/2026-09-18-imagery-protocols.md) 均 completed
- Related review: [通用影像技术自审](../reviews/2026-09-18-imagery-protocols.md)（approved，无遗留 finding）
- Related ADR: [ADR-0005](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)、
  [ADR-0082](../../../Documentation/SceneGIS/Decisions/ADR-0082-planar-imagery-protocols.md)
- Current delivery: 仅本讨论及扩展索引；upstream-owned files = 0，SGP = None

## 后继决定

负责人已确认 SDK 配置覆盖范围、连续数据层级、tile HTTP 404 作为缺图；
低于 minimumLevel 的地表区域不请求、不显示该影像层，不允许父层反向采样子层。
当前依据为 [局部影像与最低层级确认契约](2026-10-15-sparse-imagery-confirmed-contract.md)。
以下初评保留源码证据与历史权衡；绘制分区、overview/mosaic、availableLevels、通用 availability
及远景超预算报错均不是当前实施建议。SI-D01 至 SI-D04 的处置记录见后继文档。

## 需求与评估结论

数据沿用正常全球瓦片网格和原始 XYZ，只在局部区域、部分层级存在影像。
`minimumLevel` / `maximumLevel` 应描述真实数据层级，不能重编号，也不能把局部数据范围变成新的世界或 Level 0。
Provider 仍使用调用方传入的 `viewer.scene.world.tilingScheme`；本项不修改 SDK 的 engine lock。

结论：这是影像寻址、覆盖、binding、绘制与请求状态机的联合扩展，不能作为删除两处校验的小修复。
推荐保留当前地表/地形 LOD，允许一个地表 tile 对应多块影像区域；对局部小覆盖采用有预算的
**影像绘制分区**，每个分区仍一次合成所有图层。该方案无需新增地形瓦片或纹理预合成，
但会增加地表绘制命令；必须经专项 GPU 验证再成为正式决定。

覆盖未知、最低层级很高且没有粗级 overview 时，客户端不能同时保证任意远景完整、固定小请求量和固定小缓存。
这是源数据缺少低分辨率表示的约束，不能通过把 minimumLevel 当显隐阈值、猜测缺图、只取一张细图来掩盖。
首版超预算行为仍是明确待决项；本讨论不把它包装成已经解决的问题。

## 当前源码事实

以下路径均相对本讨论所在目录；结论仅针对上述基线。

| 路径 / 符号                                                                                                                                                         | 已核对行为                                                                                                | 必须改变的原因                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [URL Provider](../../../packages/engine/Source/SceneGIS/Scene/SceneGISPlanarUrlTemplateImageryProvider.js) constructor、minimumLevel getter、`_validateTileAddress` | 构造只接纳 minimumLevel=0；getter 固定 0；request 只检查 0..maximumLevel                                  | 构造、公开值与直接 request 都要遵守真实数据范围               |
| [Imagery runtime](../../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarImagery.js) `validateImageryProvider`                                      | structural provider 同样要求 minimumLevel=0                                                               | 不能只修改具体 Provider                                       |
| [Tile binding](../../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTileImagery.js) `getAddress`、`select`                                        | 每 layer 只有一个 desired；只按 maximumLevel 限制；ancestor 搜至 0，并请求固定 0/0/0                      | 非零最低层级、粗地表覆盖多张细图均不成立                      |
| [Surface](../../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js) `render`、`updateTileSlots`                                            | terrain resolves actual render cover 后，imagery 对该 cover 准备；每 tile 每 layer 一张纹理、一次 command | 应以实际地形 cover 为锚点，不能只看 quadtree desired level    |
| [Shader builder](../../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js) `createFragmentShader`                                    | 每 layer 一个 sampler，UV 被 clamp 到 [0,1]                                                               | 不能用放大 UV 采样一张细图，否则范围外拉伸边缘                |
| [TMS Provider](../../../packages/engine/Source/SceneGIS/Scene/SceneGISPlanarTileMapServiceImageryProvider.js) `fromUrl`                                             | BoundingBox 必须等于 world；分辨率按数组下标 0..N-1 验证；服务 order/href 可以不从 0 开始                 | 接受非零服务 order 不等于支持非零 canonical minimumLevel      |
| [WMTS Provider](../../../packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWebMapTileServiceImageryProvider.js) constructor、`_buildImageResource`                | labels 以 canonical level 为下标；dimensions 多订阅失效                                                   | 不能改成 labels[level-minimumLevel]；稀疏 labels 的校验需同步 |
| [WMS Provider](../../../packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWebMapServiceImageryProvider.js) constructor                                            | 用 canonical tile projected bounds 组装 GetMap，继承 URL 请求管线                                         | BBOX 不得缩成 coverage bounds 后再把响应拉满整个 tile         |
| [World](../../../packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js) `update`                                                                             | tilesLoaded=false 时排入 afterRender callback，回调末端复验                                               | 预算阻塞或确认缺图不能永远伪装成正在加载                      |

图谱用于发现符号与 binding 调用关系。图谱未列出部分 prototype assignment methods，
对这些已定位文件直接读取补齐。当前实际调用链是
`World.render -> Surface.render -> quadtree.resolveRenderTiles -> Imagery.prepare -> TileImagery.select -> Surface slots/command`。
Promise 回调只提交结果；GPU upload、selection 与 command publication 发生在 normal render。

## 拟议公共契约

本节的新增名称均为讨论稿，不表示已经存在或获批。

### 网格、范围与层级互相独立

- `tilingScheme` 继续要求与 world 同一对象。世界原点、完整 extent、`2 ** level` 行列数和各层分辨率不变。
- `minimumLevel=0` 保持默认；验证整数 `0 <= minimumLevel <= maximumLevel <= maximumSafeLevel`。
  所有请求、重试与 fallback 都不得越过这两个边界。
- 建议新增可选只读 `coverageExtent: SceneGISPlanarExtent`，使用 world 相同的米制 XY，允许矩形。
  已核对该 Extent 类型本身没有正方形限制；正方形约束来自 CoordinateSystem。
  coverage 是可信的数据覆盖外包范围，不声明范围内每个 tile 都存在，也不重新定义 CRS。
  不相交区域不请求；相交边缘仍请求原始完整 tile，并在采样时限制覆盖，禁止缩放数据范围。
  未给出时覆盖未知，以 world 为候选搜索域，不代表已知全覆盖。
- 若真实服务存在不连续层级，建议可选只读 `availableLevels` 保存有序、不重复的 canonical level 集合；
  未提供时认为 minimum..maximum 是可请求的连续层级区间。min/max 是集合两端，不能替代层级缺口列表。
  若确认服务仅连续截断，可首版不暴露该字段，但必须明示不支持中间缺层，不能探测所有缺层后静默跳过。
- 每 tile 的稀疏性使用可选 `getTileDataAvailable(x, y, level)`：true=声明存在、false=确认该地址无 tile、
  undefined=未知。缺少方法等价于未知；它必须同步、无网络/资源副作用。未知仍可在预算内正常请求。
  false 只说明该 tile，不自动说明后代全无数据；只有 coverage 外或明确子树元数据才允许剪枝整个子树。

`coverageExtent` 提供外包范围与边界约束；任意孔洞、多块范围和按层 tile ranges 可由 availability 描述。
首次不建设通用远程 metadata discovery 框架；已有 TMS XML 的确定性字段单独适配。
大范围下逐地址调用 availability 不能替代空间索引；遍历也必须有预算，不能先展开全球最低层级再过滤。

### 各协议的层级适配

| 来源             | canonical 层级与请求                                                                                             | coverage / availability                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| URL template XYZ | `{z}/{x}/{y}` 保留原值；minimumLevel 不进入任何地址偏移                                                          | 显式配置范围与可选 availability                                                         |
| URL template TMS | 仅服务 Y=`2 ** level - 1 - y`；缓存 key 仍原始 XYZ                                                               | 同上                                                                                    |
| WMTS KVP / REST  | `tileMatrixLabels[level]` 是服务标识，不是重新编号；只要求可请求层级有 label，禁止缺 label 时暗中退回数字        | 显式范围/limits 转 canonical tile ranges；不新增 GetCapabilities 自动发现               |
| WMS              | 使用原始 canonical tile 的完整米制 BBOX 和既有 axisOrder；minimumLevel 限制客户端请求尺度，不是 WMS 天生的矩阵号 | 同一范围与 availability；不自动请求低于 minimumLevel 的 overview                        |
| TMS `fromUrl`    | 由 units-per-pixel 验证 canonical level，保留该 level 对应 href/order；不以数组序号推断 Level 0                  | BoundingBox 转 coverage；Origin 仍必须匹配全局网格，不能取局部 BoundingBox 角点当新原点 |

TMS 层级验证使用 `L = log2(worldWidth / (tileWidth * unitsPerPixel))` 得到候选整数，
再以既有分辨率容差复核，不能仅靠 round 接受非标准分辨率。仍校验 CRS、原点、方形 tile 像素和地址安全范围；
metadata 中重复或不兼容层级拒绝。options 与 metadata 的 level cap/coverage 应取合法交集，
空交集明确报错，不能默默扩大服务数据范围。服务 order/href 可不同于 canonical level，且不改变实际 XYZ。

TMS 的 BoundingBox 与 Origin 本来就是不同概念：前者描述数据关注范围，后者定义 tile 原点，二者可以分离。
这支持放宽现有 BoundingBox 等于 world 的约束，同时保留严格原点校验。
来源：[TMS specification / TileMap Resource](https://wiki.osgeo.org/wiki/Tile_Map_Service_Specification#TileMap_Resource)。

现有 SingleTile 仍只覆盖完整 world、level=0。本需求不新增局部 SingleTile，也不支持跨 CRS、双根地理网格或非标准矩阵。

## 无数据、未知与失败

建议保持 `requestImage` 同步返回 undefined 的唯一含义为 RequestScheduler 暂缓；不能用它表示无数据。
若需要在响应后表达确认缺图，可扩展为 Promise resolve `null`，表示该地址确认无 tile；
内建协议只能在已配置且明确匹配的缺图规则下产生 null。普通 image 仍是成功结果。

| 观测                                              | 拟议运行时处理                                                       | 可否推断后代               |
| ------------------------------------------------- | -------------------------------------------------------------------- | -------------------------- |
| coverage 外                                       | 无请求、无 tile texture；采样透明，保留下层或 baseColor              | 可排除与范围不相交的后代   |
| availability=false / 明确缺图响应                 | `UNAVAILABLE`，不上传、不自动 retry；可用合法祖先作为低清表示        | 不可据此推断子 tile 不存在 |
| availability 未知                                 | 在合法层级和预算内请求；成功/无数据/失败分别结算                     | 不可                       |
| 正常透明 PNG                                      | 正常 READY 纹理，其透明度参与合成；不是网络失败                      | 不可                       |
| 404                                               | 默认 errorEvent/FAILED；只有服务明确约定且调用方配置时才转换为无数据 | 不可                       |
| 401/403、网络/CORS、超时、5xx、解码失败、尺寸不符 | 保留错误及原因；沿用 errorEvent 显式 retry，不新增自动 retry         | 不可                       |
| Request 取消或 stale generation                   | 不发布失败或无数据；迟到 image 依所有权 close                        | 不可                       |

不能通过“全透明/纯白/纯黑像素”猜测缺图，不能把 Promise resolve undefined 当空图。
如服务返回约定空白图或 XML 异常，需要真实响应样本再设计具体识别；没有依据不增加 CPU readback 或通用 discard heuristic。
确认无数据的负缓存要按 runtime generation 与预算管理；WMTS dimensions 刷新后失效，不能跨数据版本永久记忆。

## 粗地表的细影像采样方案

### 地址选择

对实际 render surface tile 的 level `S`：连续数据时 `D = min(max(S, minimumLevel), maximumLevel)`。
有 availableLevels 时选择不大于 S 的最深可用层级；若不存在则选择最小可用层级。

- `D <= S`：保留单 ancestor address 和当前 UV fast path。
- `D > S`：该 surface tile 覆盖 `4 ** (D-S)` 个潜在影像 tile，必须先求 coverage/可见区域交集，
  再生成有限候选，不能选一个 tile 覆盖整块 surface。地址从全球网格计算，不从 coverage 的左下角计算。
- 视锥筛选必须对实际 terrain height bounds 保守；不能只把 Z=0 与相机求交当作有地形时的完整可见区域。
- 层级缺口或该地址无数据不能触发全球几何细分；相机进入更深层级时仍可正常请求已存在的后代。

### 推荐候选：有预算的影像绘制分区

把原 surface tile 在其已有 normalized XY 域划为互不重叠、完整覆盖的绘制分区。
仅在实际影像地址边界和 coverage 边界需要时细分；大片没有该层影像的区域保持粗分区。
多图层使用共同分区，每个分区每层至多选择一张 READY 图或合法 fallback，
仍按现有 bottom-to-top、色彩滤镜、alpha、material、lighting 顺序一次求最终颜色。

每个分区借用原 tile terrain VA/model matrix/包围体，通过 fragment 域约束只写自己区域。
不重建 terrain，不新增 terrain request，不修改 quadtree SSE、maximumLevel、实际地形查询 cover。
这意味着可能重复提交同一 VA；fragment discard 不会消除 vertex processing，不能宣称零成本。
边界采用一致的单侧包含规则，并验证高倍率 UV 精度、纹理方向、边缘过滤与无缝采样。
normal-render 发布完整 command/slot snapshot，depth/pick 只能 replay；不可在 pick 中重新划区。

无数据的分区仍显示下层或 baseColor，不能 discard 整块 surface 造成地形洞。
半透明 World、clipping、deferred material、派生 depth/shadow command 必须保留相同分区域或经证明可合并，
避免边界重复 alpha、重复照明或深度覆盖；当前设计不提前承诺所有派生路径已资格化。
`minimumLevel=0` 且完整覆盖时保留当前单 command 路径。每 patch 的 sampler 预算仍须包含
material、环境、AO、阴影和 clipping，不能只数 imagery layer。

该候选会修订 ADR-0005 / Architecture 的“一个 surface tile 一个 command”约束，
需正式 ADR 与实现前原型评估；仅修改自有 Shader builder 不意味着无需架构评审。

### 其他方案与取舍

| 方案                               | 优点                                          | 不作为首选的原因                                                                                            |
| ---------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 强制地表到 minimumLevel            | 容易继续单图 binding                          | 高最低层级使全球几何/地形请求爆炸，违背独立 LOD                                                             |
| 一个 command 内绑定所有细图        | 少量细图时简单                                | 消耗 fragment sampler，且其他环境功能已经占用预算；不能覆盖通常的区域拼接规模                               |
| atlas / texture array / page table | 可减少 command 与 sampler 压力                | 新资源布局、分页、过滤和驱动支持边界；当前不假设 Cesium Texture 已提供所需接口                              |
| GPU 生成每 layer overview / mosaic | 可保留单 sampler 和远景结果，并按批释放源纹理 | 新 FBO、合成、颜色/alpha/过滤、失效生命周期；会推翻旧“不预合成”边界，且仍不能减少首次必须获取的源 tile 总量 |
| 服务提供粗层 overview              | 从源头降低远景请求量                          | 需要服务能力；可作为另一个同网格来源，不得伪装为已有数据层或局部 SingleTile                                 |

如果预计区域在 minimumLevel 下就是数百/数千 tile，绘制分区可能不合适；
应先选服务 overview 或单独设计 GPU mosaic，而不是先落地无界 patch 再补救。

## 预算与远景约束

需要分别限制候选遍历量、同时请求数、decode 待上传量、每帧上传量、驻留纹理 bytes 和绘制分区数。
仅沿用 RequestScheduler 的每服务器并发限制不能控制总内存；当前 surface tile-count LRU 也不能约束一个 tile 的多图 binding。
估算至少覆盖 `tileWidth * tileHeight * 4` 的 RGBA8 基础存储、缓存/替换时的双份保护、decoded image 与 command 开销；
它不是浏览器实际显存的精确测量。多个图层的预算要汇总，不能每层各自无界。

首选先以负责人实际数据的最小层级、覆盖面积、常见视角资格化一个明确的 bounded profile。
请求优先级可以按可见贡献调度，但稳定视图不能为了优先级轮转而不断淘汰再加载。
离开当前 cover 的请求要解除可见依赖；可缓存内容仍受独立 byte LRU 管理，不能靠 resident surface tile 引用永久保护。

数量约束的例子：S=2、minimumLevel=12 时，一块 surface tile 的未裁剪候选达到 `4^10=1,048,576` 张。
256×256 RGBA8 仅基础纹理数据就是 256 GiB；降低并发不改变完整获取的总量。
若 coverage 实际只覆盖 2×2 张，则只需这 4 张，远景仍可呈现对应局部位置，绝不移动到新的根网格。

推荐首版对超出支持预算的候选在网络/GPU 大规模 mutation 前给出明确的资源限制错误，
由调用方选择更准确 coverage、同网格 overview 或调整显式预算；不得任意裁掉部分瓦片后声称加载完整。
这种 fail-fast 会影响远景交互，因此**仍需负责人明确接受**。
若产品要求任何远景都连续显示且不报此错误，则必须选择 overview/mosaic 等更完整路线并另行评估，
不能默认改成“低于 minimumLevel 就隐藏”。没有数据来源依据时也不预取全球高层级来建立 overview。

## Fallback、readiness 与生命周期

Fallback 搜索仅访问合法且可能存在的层级，截止 minimumLevel；
bootstrap 改为覆盖当前区域的 minimumLevel 祖先，绝不固定请求 0/0/0。
粗 surface 的多个 minimumLevel 叶子独立加载；每个叶子与其他 surface binding 按 canonical address 共享 entry。
已有更近 READY ancestor 优先，所有 fallback 受 coverage mask 限制，不能把父图铺到声明无覆盖的范围。

缺图只代表当前地址无 payload，允许使用仍合法的粗级表示；透明成功影像本身是有效结果，不用祖先覆盖它。
若没有合法祖先，使用下层/baseColor。网络 terminal FAILED 保留可用 READY fallback 并上报错误，
不为掩盖失败创建无限中间祖先请求。确认缺图后若选择加载一个有用祖先，它要成为明确的当前目标依赖。

`tilesLoaded` 继续表示当前视图的可执行工作已经结算，不表示数据完整或成功率 100%。
所有当前可见分区的 desired 与必要 fallback 均结算后才为 true；
READY、无可执行祖先的 UNAVAILABLE、无 retry 的 terminal FAILED 可以结算。
排队但可在后续帧推进的请求/上传保持 false；静止视图必须在有限有效工作后收敛。
禁止把“受硬预算永久阻塞”一直记为 loading，也禁止直接标为成功；推荐错误通道明确暴露该不支持状态。
若后续改选允许部分覆盖的策略，则必须新增独立完整性状态，不能用 tilesLoaded 隐藏未加载区域。

hide/remove/destroy、tile eviction、coverage/provider revision 和 WMTS dimensions 失效时：

1. 撤销分区与 desired/fallback 的引用，最后一个引用取消 Request；共享 tile 不重复取消。
2. generation 使旧请求和旧划区结果失效；迟到 closable image exactly once close，且不能复活 entry。
3. 待上传 image、READY texture、command snapshot 各按所有权释放；新的负缓存也有容量与 revision 边界。
4. hide/remove 不再阻塞 readiness；destroy/remove listener 成对；provider 继续由调用方拥有。
5. Promise completion 不直接修改 GPU 或已发布 depth snapshot；只有 normal render 发布替换。

## 最小影响面与实施门槛

预计修改自有 Provider interface/URL/WMS/WMTS/TMS 的参数、校验与英文 JSDoc，
`_SceneGISPlanarImagery`、`_SceneGISPlanarTileImagery`、`_SceneGISPlanarSurface`、
`_SceneGISPlanarSurfaceShader` 及对应 Specs。必要的 fragment mask 放自有 shader source / builder，
不编辑生成 `.js`。World 仅在确认现有 readiness 唤醒不能表达新状态时才需窄修改。
不改 canonical TilingScheme、CoordinateSystem、terrain decoder/Worker、Globe Provider 和 SDK API。

正式实现前需要新的 ADR，明确修订 ADR-0005 的 level-0/bootstrap/单 command 约束，
并修订 ADR-0082 的完整 TMS pyramid/无局部覆盖边界；同步 Architecture 的精简契约及 PlanarWorldGuide。
此时再确定 extension/phase planning，不能将跨 runtime/rendering 的工作伪装为一个参数微调。
本轮不预分配 ADR 号、不激活 phase、不建立实现提交。预计 upstream-owned = 0 / SGP=None；
若验证发现必须改上游，重新论证最小 seam 并登记 SGP，不沿用预计零补丁作为既成事实。

构建事实已核对：`gulpfile.js` 的 build 调用 engine/widgets/root builder，
`scripts/build.js` 扫描普通 Source JS、Specs 与 `Source/Shaders/**/*.glsl`，生成 barrel、SpecList 和 shader JS。
生成物不进入改动；实际实现扩大公共 API 后须运行完整 build、build-release、build-ts、tsc。
Jasmine 入口是 `npm run test -- --includeName <name> --failTaskOnError`；
后一个参数保证失败传播为非零退出码。现有 E2E 是
[scenegis-planar-imagery-protocols.spec.js](../../../Specs/e2e/scenegis-planar-imagery-protocols.spec.js)，
人工基线入口是 [影像服务](../../../Test/Planar/影像服务.html)。

## 必要验证与可复现画面

| 风险                            | 最小证据                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| minimumLevel 只改表层，地址仍错 | URL/structural Provider Specs：min>0、上下界、x/y 不减偏移，日志中无低于 min 或缺层请求                                |
| 协议层号误映射                  | 同一 canonical 地址测试 URL XYZ/TMS、WMTS KVP/REST label、WMS BBOX；TMS 从真实 L>0 分辨率开始且保留 href/order         |
| 局部覆盖拉伸/漏边               | CPU 分区/UV Specs 加 GPU 四角标记 fixture，coverage 非方形且不贴 tile 边；世界不变，范围外显示下层                     |
| 粗地表无法拼细图                | 固定 actual surface level 小于 min，多张不同色/XYZ 标号图全部显示；加入真实 terrain ancestor fallback                  |
| 没数据与故障混淆                | availability false/unknown、null、透明成功图、404 默认失败/显式缺图、401/403/5xx、尺寸错误；不自动重试                 |
| readiness 永久运行或提前完成    | requestRenderMode + Infinity，desired/fallback 排队、全部缺图、一次失败后 retry、dimensions 切换、预算错误分别收敛     |
| 生命周期泄漏                    | 多 binding 共用 image；hide/remove/destroy/evict 时取消与迟到 Bitmap、纹理、listener exactly once 计数                 |
| 修改地形 LOD 或渲染副作用       | 同场 before/after selected/actual terrain cover 相同；正常/深度/拾取、透明地表与 clipping 像素正确                     |
| 性能/预算失控                   | 小 ROI、高 min、未知大范围三个有目的场景；记录候选/请求/bytes/commands 上限与同视角 CPU/GPU 对比，不扩展无依据组合矩阵 |
| 旧路径与公开包回归              | min=0 完整影像 fast path、既有 SingleTile/样式/WMTS reload Specs；完整构建/类型与导出审计                              |

建议新增单个本地 `Test/Planar` 稀疏影像页面及对应确定性 E2E：固定完整 EPSG:3857 world，
在全球原始地址中的一小块区域提供 min>0 的彩色编号图，低层请求由 fixture 明确拒绝并记录。
包含远景、近景、跨边界平移、显示/隐藏、显式缺图与鉴权失败开关；记录默认相机与分辨率。
不依赖公网，截图与项目负责人视觉判断是最终画面依据；错误图不得被测试 fixture 自动改写为透明成功图。

## 待负责人确认

| ID     | 待决问题                                                                 | 推荐 / 下一步                                                                                |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| SI-D01 | 服务怎样表达覆盖与缺图？是否有范围元数据、tile ranges、404 或约定空图？  | 先用明确 coverage + unknown 请求；保留默认错误语义，拿到响应样本后再选缺图适配               |
| SI-D02 | 最低层级、区域 tile 数和远景完整性的期望是什么？能否接受超预算明确报错？ | 小区域先资格化有界绘制分区；若要求大区域任意远景，优先确认同网格 overview 或独立 mosaic 设计 |
| SI-D03 | “部分层级”是连续 min..max，还是例如 [8,10,12]？                          | 有缺层则保留 canonical availableLevels；不通过服务编号偏移补洞                               |
| SI-D04 | coverageExtent 是否是可用于裁剪显示的可信外包范围？                      | 建议是；若元数据仅是非约束提示，须另行区分提示与硬覆盖，不能擅自裁切                         |

本轮验证为源码/文档/构建入口审查，不代表新增行为已通过运行时测试；产品代码未改，未运行产品构建或 GPU 测试。
设计确认后由 Architecture 明确范围和预算、建立 plan/ADR，再进入实现与视觉验收。

本轮文档检查：修改的两份 Markdown 通过 Prettier，全部 AgentDocs 通过 markdownlint，
两份文档的相对链接及 git diff whitespace 检查通过。全目录 Prettier 仍有 456 份未改动文件的既有格式问题，
未批量修改这些无关文档。使用已有依赖中的 CLI 执行检查，没有安装依赖或修改 lockfile。
