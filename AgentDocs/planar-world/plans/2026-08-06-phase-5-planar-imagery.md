# 阶段计划：P5 平面栅格影像与图层合成

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- 总体计划（Parent plan）：
  [2026-08-05-planar-world-extension.md](2026-08-05-planar-world-extension.md)
- 阶段（Phase）：`P5-planar-imagery`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`approved`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-06`
- 更新日期（Updated）：`2026-08-06`
- 相关讨论（Related discussions）：无；已确认的长期结论已提升到 ADR-0005
- 相关评审（Related reviews）：
  [P5 planar imagery review](../reviews/2026-08-06-p5-planar-imagery.md)
  （`approved`，P5-R001 至 P5-R006 均为 reviewer-confirmed `fixed`）
- ADR：
  `Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md`
  （`approved`）
- SGP：无；本阶段禁止修改 upstream-owned file

## 目标

在 P3/P4 已稳定的 ideal-tile surface、LOD、depth replay 和 resource lifecycle 之上，
增加第一个不携带 Globe/ellipsoid 语义的平面 raster subsystem。调用方应能为
`SceneGISPlanarWorld` 添加有序图层，通过公共 URL-template provider 请求 canonical
planar pyramid 的 XYZ 或 TMS 瓦片，并在异步加载期间逐图层使用 ready imagery
ancestor，最终以一个 opaque surface command 完成顺序和 alpha 合成。

本阶段必须闭合：

- public planar imagery provider structural contract；
- public XYZ/TMS URL-template provider；
- public layer 和 world-owned layer collection；
- Cesium Request/Resource compatible 的异步请求、retry、取消和 stale-result isolation；
- per-layer imagery cache、desired/fallback binding 和 reference lifecycle；
- dynamic `tilesLoaded`；
- 单 pass、bottom-to-top、alpha-aware 的 opaque raster composition；
- P4 pick/depth replay 在 textured surface 下继续成立；
- public exports、types、API docs、WebGL pixel、性能和 release evidence；
- 一个显式使用 `CesiumWidget` 的 EPSG:3857/OpenStreetMap Sandcastle 人工案例；
- upstream-owned files = 0、P5 SGP = 0。

P5 implementation、验证、Architecture/code review 和独立本地提交完成前不得进入 P6。

## 非目标

- 复用、继承或伪装上游 `ImageryProvider`、`ImageryLayer`、
  `ImageryLayerCollection`、`Imagery`、`TileImagery` 或 Globe surface runtime。
- 修改 `Scene`、`CesiumWidget`、`Viewer`、`Globe`、`QuadtreePrimitive`、
  `GlobeSurfaceTileProvider` 或任何 upstream-owned file。
- 在 `Scene` 增加通用 `imageryLayers` 属性；P5 只公开
  `SceneGISPlanarWorld.imageryLayers`。
- 支持 runtime reprojection、ellipsoid、`Rectangle`、`Cartographic`、degree units、
  wrap、多个 root tile 或非 canonical planar tiling scheme。
- 支持缺失 Level 0 的 pyramid、provider `minimumLevel > 0`、partial layer extent、
  tile availability metadata、tile discard policy 或 no-data detection。
- 支持 WMS、WMTS、ArcGIS REST、Bing、Ion、single-tile、time-dynamic 或异步 metadata
  provider；P5 只交付 structural custom-provider seam 和一个 URL-template provider。
- 支持 KTX2、compressed texture、mipmap、anisotropy、用户可配置 sampler、brightness、
  contrast、hue、saturation、gamma、split direction 或 color-to-alpha。
- 支持 imagery feature/pixel picking；P4 `world.pick` 仍只返回数学平面位置。
- 通过多 pass、OIT、texture array、CPU canvas 或 per-tile framebuffer 支持超过硬件
  fragment texture units 的 shown layers。
- 根据 provider tile dimension 改变 P3 nominal `256` SSE、quadtree selection、
  bounding volume、model matrix、surface geometry 或 tile cache size 语义。
- 修改 P4 Camera/controller/input/picking 数学。
- 自动创建 base layer、修改 Viewer widgets、建立通用 Viewer/Sandcastle 集成或增加
  network-dependent E2E；这些属于 P6。P5 只增加本计划明确限定的一个 engine-level
  EPSG:3857/OpenStreetMap 人工案例。
- 创建 Worker、Shader builtin 或 SceneGIS `.glsl` build/generation seam。
- 修改或提交任何生成文件。

## 进入条件

- P1 至 P4 均为 `completed`，相关 review 均为 `approved`。
- P4 已形成独立本地 checkpoint
  `e4d45e3bafcb249dac98ac8118c28a6b643c8146`
  （`完成平面世界第四阶段导航与拾取`）。
- 当前分支为 `feature/planar-world`，P5 不创建新分支。
- checkpoint worktree clean；P5 implementation diff base 固定为上述 P4 checkpoint。
- 项目负责人已确认 ADR-0005 中的三项关键取舍：完整 Level-0 pyramid、per-layer
  imagery ancestor fallback，以及受 hardware texture units 限制的 single-pass
  composition。
- ADR-0005 状态为 `approved`。
- 项目负责人已于 `2026-08-06` 明确批准本 phase plan，并同时批准把一个
  EPSG:3857/OpenStreetMap Sandcastle 人工案例纳入 P5。
- Architecture Agent 已把本计划转为 `active/confirmed`、Owner role 转为
  `execution`；Execution Agent 只能在本计划边界内实现。
- Execution Agent 开始前重新读取根、engine、Sandcastle、AgentDocs `AGENTS.md`，以及
  `Architecture.md`、`DevelopmentGuide.md`、总体计划、ADR-0001 至 ADR-0005、P3/P4
  plan/review 和本计划。
- Execution Agent 使用 code graph 重新确认当前 `Resource`、`RequestScheduler`、
  `Texture`、`ShaderProgram`、`TileProviderError`、P3/P4 surface/quadtree/tile 和 Scene pass
  lifecycle；不得根据本计划记录的旧行号实现。

## 当前源码事实

1. 上游基线是 Cesium `1.144`，提交
   `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
2. P4 checkpoint 上 `SceneGISPlanarWorld` 公开 `coordinateSystem`、`tilingScheme`、
   `maximumLevel`、surface settings、picking 和 frame lifecycle；尚无 imagery collection。
3. 当前 `tilesLoaded` 恒为 `true`，P1 Scene lifecycle 会在其为 `false` 时设置
   `_renderRequested`，因此 P5 不需要新的 upstream request-render hook。
4. `SceneGISPlanarTilingScheme` 是单根、northwest-origin XYZ、无 wrap；safe level最高
   可到 52，parent/address math不得使用32-bit bitwise operator。
5. P3 quadtree只负责visibility、perspective/orthographic SSE、ideal tile selection和
   surface-tile LRU。它返回的ideal set不含data readiness。
6. 当前每个 `SceneGISPlanarTile` 持有extent、exact zero-thickness OBB、conservative
   command BoundingSphere、model matrix、一个DrawCommand和last-used frame。
7. 当前surface共享unit quad、vertex array、shader、render state；normal render做
   selection并缓存submitted command references。
8. P4 depth-pick correction要求`passes.pick && passes.depth && !passes.render`只重提最近
   normal render的相同command references，不能做selection或resource mutation。
9. `ImageryProvider`、`UrlTemplateImageryProvider`、`ImageryLayer`、`TileImagery`和
   `ImageryLayerCollection`包含Rectangle、projection、ellipsoid或Globe surface语义。
10. `UrlTemplateImageryProvider`的internal `{y}`是northwest XYZ，`{reverseY}`使用
    `tileCountY - y - 1`；P5可以复用该寻址事实，但不能复用其Earth public contract。
11. 上游`Imagery` parent使用`(x / 2) | 0`，不适用于P2允许的高safe level，P5不得复制。
12. `Resource.fetchImage`通过其`request`调用`RequestScheduler`；server saturation时返回
    `undefined`，取消active image request可以触发XHR abort/cancel callback。
13. 当前Cesium imagery request使用`RequestType.IMAGERY`、`throttle: false`、
    `throttleByServer: true`，并把provider返回`undefined`解释为稍后重试而非failure。
14. `Texture`支持ImageBitmap/HTML image/canvas source、RGB/RGBA pixel format、Sampler和
    exactly-once destroy；默认image upload与`Resource.fetchImage({flipY: true})`共同处理
    DOM/ImageBitmap origin差异。
15. `ContextLimits.maximumTextureImageUnits`来自当前WebGL Context；Globe renderer也以该
    值决定一次shader可以绑定的imagery texture数量。
16. Globe多图层shader按texture count缓存variant并静态展开sample/blend，但其source、
    uniforms和terrain encoding本身是Earth-specific，不能复制大段实现。
17. 当前SceneGIS shader为JavaScript string；Cesium generator不会扫描
    `Source/SceneGIS/Shaders`，且对应生成`.js`不能手工提交。
18. P1已有upstream-owned files仍只有`Scene.js`和`CesiumWidget.js`，由`SGP-0001`
    跟踪。P5不得改变它们、marker或patch manifest。
19. Cesium `WebMercatorProjection` 将 EPSG:3857 描述为以米为单位的球面 Web Mercator；
    使投影域成为正方形的完整世界范围是
    `[-20037508.342789244, 20037508.342789244]` 两轴相同边界。
20. 当前 Sandcastle 稳定示例使用扁平
    `packages/sandcastle/gallery/scenegis-<domain>-<feature>/` 目录以及 `index.html`、
    `main.js`、`sandcastle.yaml`；案例不应承载可复用业务逻辑。

源码行号不是契约。若Execution Agent发现上述事实不再成立，先停止实现并回写本计划；
改变public API、provider coverage、fallback粒度、shader pass数量、upstream diff或P5
非目标的问题必须交回Architecture Agent。

## 详细设计

### 对象关系与私有边界

```text
SceneGISPlanarWorld
  ├─ owns → SceneGISPlanarImageryLayerCollection (public, readonly property)
  └─ owns → SceneGISPlanarSurface (private, one Context)
                 ├─ owns → SceneGISPlanarQuadtree / SceneGISPlanarTile
                 ├─ owns → per-layer imagery runtimes and caches
                 ├─ owns → shared unit quad / transparent texture
                 └─ caches → shader variants by shown-layer count

SceneGISPlanarImageryLayerCollection
  └─ ordered bottom-to-top SceneGISPlanarImageryLayer
        └─ references, but does not own → SceneGISPlanarImageryProvider
              └─ concrete → SceneGISPlanarUrlTemplateImageryProvider

ideal surface tile
  └─ per shown layer binding
        ├─ desired imagery entry
        ├─ current ready ancestor or transparent placeholder
        └─ UV translation/scale
```

预计新增或修改：

```text
packages/engine/Source/SceneGIS/Scene/
├── SceneGISPlanarImageryProvider.js
├── SceneGISPlanarUrlTemplateImageryProvider.js
├── SceneGISPlanarImageryLayer.js
├── SceneGISPlanarImageryLayerCollection.js
├── SceneGISPlanarWorld.js
└── _private/
    ├── _SceneGISPlanarImagery.js
    ├── _SceneGISPlanarTileImagery.js
    ├── _SceneGISPlanarSurfaceShader.js
    ├── _SceneGISPlanarSurface.js
    ├── _SceneGISPlanarQuadtree.js
    └── _SceneGISPlanarTile.js
```

前三个private文件是建议role split，不是要求机械创建三个class。Execution Agent可以把
纯函数留在最相关module，或在职责过大时拆成等价private module，但必须保持：

- provider/layer/collection public contract不受private布局影响；
- request/cache entry、surface-tile binding和shader variant职责可单独测试；
- private basename使用`_SceneGIS*`，constructor/class symbol不带前导`_`；
- private types不进入root exports、generated declarations或API HTML；
- 最终路径和偏差回写本计划。

### `SceneGISPlanarImageryProvider` 公共契约

新增不可直接实例化的public structural interface，风格与`SceneGISWorld`一致，但具体
provider不要求继承它。interface至少声明：

```text
tilingScheme
minimumLevel
maximumLevel
tileWidth
tileHeight
hasAlphaChannel
errorEvent
credit
requestImage(x, y, level, request)
```

layer构造和collection add必须在任何attachment或runtime mutation前验证完整structural
contract：

- `tilingScheme`必须是`SceneGISPlanarTilingScheme`；
- `minimumLevel`必须严格等于0；
- `maximumLevel`是`[0, tilingScheme.maximumSafeLevel]`内整数；
- tile width/height为相同的positive integer；
- `hasAlphaChannel`为boolean；
- `errorEvent`满足Event add/raise structural capability；
- `requestImage`为function；
- credit为undefined、Credit或concrete URL provider已规范化的Credit。

custom provider的`requestImage`参数使用canonical northwest XYZ。它可以返回Promise或
`undefined`，但不能返回Earth rectangle、projection或reprojected texture。public JSDoc
必须写明Request throttling和完整Level-0 pyramid前置条件。

### `SceneGISPlanarUrlTemplateImageryProvider`

构造形式：

```text
new SceneGISPlanarUrlTemplateImageryProvider({
  url,
  tilingScheme,
  urlScheme = "xyz",
  maximumLevel = tilingScheme.maximumSafeLevel,
  tileWidth = 256,
  tileHeight = tileWidth,
  subdomains = "abc",
  hasAlphaChannel = true,
  credit,
})
```

validation必须在任何request之前完成。`url`接受string或`Resource`，内部保存不会被调用方
后续mutation破坏的derived/base Resource。string credit转换为`Credit`；Credit identity
可以保留。subdomains接受non-empty string或non-empty string array，并建立不可被调用方
数组mutation改变的owned copy。

template只承诺`{x}`、`{y}`、`{z}`和`{s}`：

- XYZ：URL y = internal y；
- TMS：URL y = `2 ** level - internalY - 1`；
- z始终是internal level；
- subdomain index使用分量modulo组合，不能先做可能超过safe integer的`x + y`；
- level/x/y validation复用provider tiling scheme，不接受越界address；
- `maximumLevel`外的public request抛出`DeveloperError`，surface不会发出这种请求。

derived Resource接收当前entry的Request，并调用
`fetchImage({preferImageBitmap: true, flipY: true})`。不要调用
`ImageryProvider.loadImage`，避免把concrete planar provider伪装为Earth provider。

P5不要求template必须字面包含全部tag；缺少某tag可以用于固定资源或测试custom endpoint，
但URL展开、query、headers、proxy和Resource retry callback不得被手工字符串拼接破坏。

### `SceneGISPlanarImageryLayer`

构造形式：

```text
new SceneGISPlanarImageryLayer(provider, {
  show = true,
  alpha = 1.0,
})
```

公开：

- readonly `imageryProvider`；
- boolean `show`；
- finite `[0, 1]` `alpha`；
- `isDestroyed()`和`destroy()`。

provider structural validation在constructor完成。show/alpha setter无效输入抛出
`DeveloperError`并保持旧值。layer attached时调用`destroy()`抛出，必须先由collection
remove。provider永远不随layer销毁。

layer内部attachment callback只用于通知collection/surface，不公开debug/resource state。
`alpha=0`仍属于shown layer并保持loading；只有`show=false`暂停并释放layer runtime。

### `SceneGISPlanarImageryLayerCollection`

collection由world构造并持有canonical tiling scheme和内部mutation listener。它也可以由
调用方独立构造：

```text
new SceneGISPlanarImageryLayerCollection({ tilingScheme })
```

collection公开只读`tilingScheme`。独立collection可以管理和验证layer，但P5不提供替换
`world.imageryLayers`的setter；只有world-owned collection会通过private listener接入
surface runtime。

公开至少：

```text
length
get(index)
contains(layer)
add(layer, index)
addImageryProvider(provider, index)
remove(layer, destroy = true)
removeAll(destroy = true)
raise(layer)
lower(layer)
raiseToTop(layer)
lowerToBottom(layer)
isDestroyed()
destroy()
```

要求：

- index必须是`[0, length]`内整数，get必须是现有index；
- add只接受live、unattached的`SceneGISPlanarImageryLayer`；
- `layer.imageryProvider.tilingScheme === collection.tilingScheme`，不是value equality；
  world-owned collection的tiling scheme就是`world.tilingScheme`；
- add/addImageryProvider返回加入的layer；
- remove不存在layer返回false，存在则同步detach、通知surface、按destroy参数处理并返回true；
- reorder不存在layer抛出，已经位于边界时为deterministic no-op；
- order最低index是baseColor之上的bottom layer，最高index是top layer；
- 同一layer不能重复加入同一或另一个collection；
- world destroy使collection不可继续使用，并按默认ownership销毁attached layers；provider不
  销毁。
- standalone collection destroy默认销毁attached layers但不销毁providers；
- `world.imageryLayers`由world拥有，调用方在world存活期间单独destroy它会抛出
  `DeveloperError`；world destroy解除private owner guard后成对释放。

collection可以使用private change event/listener驱动surface，不要求P5公开layerAdded等
事件。若Execution Agent认为public event是P6/应用集成的必要API，必须先交回Architecture
Agent，不能顺手扩大P5公共面。

### Imagery Entry、请求与Retry

每个attached layer对应一个private runtime和Map cache，key为`level/x/y`。entry至少持有
address、state、reference count、Request、generation、decoded image、Texture和最近
provider error context。

只在normal render推进state：

1. `UNLOADED`创建新的Request并调用provider；
2. provider返回undefined时清除Request并保持UNLOADED；
3. provider返回promise时进入LOADING；
4. promise resolve只记录RECEIVED image；下一normal render验证dimension并上传Texture；
5. upload成功进入READY并释放decoded image reference；
6. request/decode/dimension/upload failure通过provider errorEvent进入FAILED或retry；
7. retry在下一normal render重新请求，不能在stale microtask中直接复活destroyed entry。

source实际width/height必须与provider声明的tileWidth/tileHeight相同且为positive finite
integer。mismatch作为provider tile failure报告；不能创建不同大小texture后继续渲染。

Request使用`throttle:false`、`throttleByServer:true`、`RequestType.IMAGERY`。entry释放时
调用Request.cancel并递增generation；迟到resolve/reject只做必要的image close，不改变Map、
tilesLoaded或errorEvent。

`TileProviderError.reportError`包含provider、x、y、level和原始error。成功request在需要时
调用`reportSuccess`清理连续error context。取消不是provider error。

### Surface Tile Binding 与Fallback

每个cached surface tile按layer identity维护binding。binding的desired address为：

```text
desiredLevel = min(surfaceTile.level, provider.maximumLevel)
factor = 2 ** (surfaceTile.level - desiredLevel)
desiredX = floor(surfaceTile.x / factor)
desiredY = floor(surfaceTile.y / factor)
```

当surface tile和provider maximumLevel不变时复用binding，不得每帧重建。layer hide/remove
同步删除所有resident surface tile上的对应binding；quadtree需要提供一个窄小private
iteration/invalidation seam，而不是surface直接依赖其Map字段名。

normal render解析规则：

- desired READY：使用desired texture并释放不再需要的fallback dependency；
- desired pending：从desired parent向Level 0查找最近的READY cached ancestor；
- 没有READY ancestor：请求Level 0；P5不主动请求intermediate ancestor；
- cache中已有的READY ancestor按最近层级复用，每binding除desired外最多持有一个fallback
  dependency；切换到更近READY entry时精确释放旧reference；
- desired terminal FAILED：停止无意义的desired重试，保留最近READY ancestor或transparent；
- desired READY或terminal FAILED后，取消并释放仍在推进的fallback request；terminal FAILED
  只能保留已经READY的ancestor；
- 其他tile已经加载的中间ancestor可以立即复用；
- provider max-level ancestor和loading fallback使用同一UV math。

P5不把surface geometry tile替换为ancestor tile，因此P3 ideal selection、protected tile和
draw count保持。imagery entry通过独立reference count保护；surface tile eviction调用
binding release，最后一个reference才销毁共享ancestor texture。

### UV Translation 与方向

unit quad本地XY转换为surface tile UV：west/south为`(0, 0)`，east/north为`(1, 1)`。
decoded/uploaded image遵循top row = north。对level delta为`d`、factor为`2 ** d`、child在
ancestor内的northwest row/column为`localX/localY`：

```text
scale = 1 / factor
u = localX / factor + tileU * scale
v = 1 - (localY + 1) / factor + tileV * scale
```

实现可以用等价translation/scale uniform，但必须锁定：

- root和same-level identity；
- northwest、northeast、southwest、southeast child方向；
- multi-level ancestor；
- provider maximumLevel cap；
- adjacent child共享边界；
- high safe level不经过32-bit conversion；
- large world offset不进入UV精度计算。

shader输入的base tile UV在fragment sampling前clamp到`[0, 1]`，只用于抑制rasterization
edge interpolation超界，不得改变world extent或tile address ownership。

### Shader Variant 与Command

vertex shader在现有`czm_modelViewProjection`位置计算外，输出tile-local UV。fragment
shader从opaque baseColor开始，按shown layer顺序静态展开sample和alpha blend，最后alpha
固定为1。

surface拥有：

- 一个transparent 1×1 shared texture；
- 按shown-layer count缓存的ShaderProgram variant；
- 每tile按当前slot layout提供texture、translation/scale和alpha uniform；
- 现有opaque RenderState、unit quad VA和command bounding volume。

shown layer count为0时可以复用/等价保留P3 solid-color variant。shown layer count变化时
允许一次性创建variant和更新uniform layout，但同一count重复出现时复用cached shader。
order改变而count不变只改变slot binding；alpha改变只由uniform读取。

在任何request、upload、command mutation前检查：

```text
shownLayerCount <= ContextLimits.maximumTextureImageUnits
```

超过时抛出明确DeveloperError，且旧normal-render command cache和GPU/request state保持可
解释。P5不自动隐藏top layer、不截断collection，也不创建additional pass。

stable ready frame必须保持：one command per ideal tile、zero new request/texture/shader/
command/binding allocation。private debug counters可以用于Specs，但不得公开。

### Normal Render、Depth Replay 与`tilesLoaded`

`beginFrame`继续做Context validation和per-frame reset。normal render顺序建议为：

1. validate Context、drawing buffer和shown-layer hardware limit；
2. select P3 ideal tiles；
3. reconcile shown layer runtimes和tile bindings；
4. advance required request/receive/upload states；
5. choose READY ancestor/transparent per layer；
6. update/reuse tile command并提交；
7. 缓存 exact submitted command references；
8. 计算当前 view `tilesLoaded`。

depth-pick-only pass继续在所有上述步骤之外，只重提缓存command。即使Promise恰好在normal
render和depth replay之间resolve，RECEIVED image也必须等到下一normal render上传和绑定。

`tilesLoaded`定义：

- 每个shown layer、每个selected surface tile的desired/capped imagery为READY或terminal
  FAILED，且没有该view所需的RECEIVED upload时，view settled；
- UNLOADED、LOADING、RECEIVED或retry pending使其为false；
- READY fallback不能把pending desired提前算作loaded；
- show=false world直接对Scene报告true，避免hidden world request-render loop；
- zero drawing buffer、无selected tile或无shown layer为true；
- layer hide/remove后不再阻塞；add/show/retry使下一normal render重新进入false；
- pick/depth replay不改变该值。

`SceneGISPlanarWorld.tilesLoaded`返回`!world.show || surface.tilesLoaded`或语义等价实现。
world show从false恢复true时必须重新评估当前shown layers，不能永久保留hidden true。

### Credit

URL provider把string credit规范化为`Credit`。每个normal render只为实际shown且参与当前
surface的provider把credit加入`frameState.creditDisplay`；相同Credit的去重依赖现有
CreditDisplay语义。P5不实现per-tile credit callback。

### EPSG:3857 / OpenStreetMap Sandcastle 人工案例

P5 增加一个稳定的 engine-level 示例：
`packages/sandcastle/gallery/scenegis-planar-imagery/`。这是项目负责人批准的窄小
阶段边界扩展，用于证明公共 API 能组装真实公开平面瓦片；它不代表提前进入 P6 的
`Viewer` 自动集成。

案例必须显式组装：

- `SceneGISPlanarExtent` 两轴边界均为
  `[-20037508.342789244, 20037508.342789244]` 米；
- `SceneGISPlanarCoordinateSystem({ extent, crs: "EPSG:3857" })`；
- `SceneGISPlanarWorld`，`maximumLevel` 显式设为 `19`；
- `CesiumWidget({ world })`，关闭 legacy
  `scene.screenSpaceCameraController.enableInputs`；
- `SceneGISPlanarCameraController` 通过 `widget.addController` 注册，并调用
  `viewHome(scene)`；
- `SceneGISPlanarUrlTemplateImageryProvider` 必须复用 `world.tilingScheme`，URL 为
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`，`urlScheme: "xyz"`、tile size
  `256 × 256`、`maximumLevel: 19`；不得改用不受 OpenStreetMap policy 覆盖的 subdomain；
- provider credit 必须在 Cesium CreditDisplay 中持续可见，并链接
  `https://www.openstreetmap.org/copyright`，文本至少包含
  `© OpenStreetMap contributors`。

外部 endpoint 用清晰的局部常量声明，便于使用者替换。案例只允许正常当前视图的交互式
请求，禁止预取、批量下载、离线抓取或绕过浏览器 HTTP cache。Sandcastle metadata 和源码
必须说明该公共服务 best-effort、不可用时保留 `baseColor` 且不代表 engine failure。
自动化 Specs/E2E 必须继续使用本地可控 fixture，不得访问 OpenStreetMap；本案例只做人工
网络、画面、署名和 PC 交互验收。实现与人工验收必须遵守
[OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)。

### Destroy与Collection Mutation

ownership顺序必须避免callback和tile eviction双重释放：

- tile eviction释放tile bindings，binding释放entry references；
- layer hide/remove同步释放该layer在全部resident tiles和runtime中的状态；
- remove with destroy=false只detach public layer，不销毁provider；
- world destroy释放全部tile bindings、imagery entries、decoded images、textures、shader
  variants、transparent texture、VA/buffer和public layers exactly once；
- provider不由world销毁；
- 第二个Context继续fail-fast且不产生partial imagery resource；
- destroyed world/layer/collection的public method遵循Cesium destroyObject contract。

## 影响路径

### 允许新增或修改的产品代码

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarImageryProvider.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarUrlTemplateImageryProvider.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarImageryLayer.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarImageryLayerCollection.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarImagery.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTileImagery.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarQuadtree.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js`

private split可以按详细设计调整；新增其他SceneGIS-owned product path前先回写本计划。

### 允许新增或修改的Specs

- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarImageryProviderSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarUrlTemplateImageryProviderSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarImageryLayerSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarImageryLayerCollectionSpec.js`
- 对应private imagery、tile imagery和surface shader Specs；basename按最终private source映射
- 现有`SceneGISPlanarTileSpec.js`
- 现有`SceneGISPlanarQuadtreeSpec.js`
- 现有`SceneGISPlanarSurfaceSpec.js`
- 现有`SceneGISPlanarWorldSpec.js`
- 新增或扩展一个SceneGIS Widget/WebGL integration Spec，覆盖真实URL/fake provider、像素、
  fallback、depth和Context lifecycle

测试helper必须留在Specs-owned路径，不得为测试便利增加public debug API。

### 允许新增的Sandcastle案例

- `packages/sandcastle/gallery/scenegis-planar-imagery/index.html`
- `packages/sandcastle/gallery/scenegis-planar-imagery/main.js`
- `packages/sandcastle/gallery/scenegis-planar-imagery/sandcastle.yaml`

该目录只负责组装 P2 至 P5 公共 API 和说明外部服务降级行为；不得放入可复用 imagery、
camera 或 lifecycle 实现，不增加 network-dependent E2E，不修改 Sandcastle 核心应用或
构建文件。

### 允许修改的文档

- 本phase plan、parent extension plan和planar-world索引/评审交接
- `Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md`的P5 refinement
- `Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md`
- implementation稳定后按真实API更新`Architecture.md`和`DevelopmentGuide.md`

### 禁止路径

- 所有upstream-owned files，包括但不限于`Scene.js`、`CesiumWidget.js`、`Viewer.js`、
  `Globe.js`、上游imagery/layer/provider和renderer文件
- `packages/engine/Source/Shaders/**`和shader generator/build script
- `packages/widgets/**`、`Specs/e2e/**`，以及除上述单一案例目录外的
  `packages/sandcastle/**`
- `.scenegis/upstream-patches.json`
- 所有生成文件和Build output

发现必须修改禁止路径时立即停止并交回Architecture Agent；不得自行创建SGP或扩大P5。

## 实施步骤

1. **重新发现并锁定基线**
   - 确认HEAD、clean status和P4 checkpoint。
   - 使用code graph核对调用关系；graph不足的prototype/module再做targeted source read。
   - 在写代码前把任何与本计划不一致的事实回写“偏差与结果”。
2. **建立公共Provider和Layer契约**
   - 实现structural interface、URL provider、layer和collection。
   - 先完成validation、XYZ/TMS expansion、attachment/ownership和纯逻辑Specs。
   - 验证root JS/types/API生成可见，private不存在。
3. **建立Private Imagery Runtime**
   - 实现entry state、Request/Resource、retry、generation、cache/refcount和exactly-once
     decoded image/texture release。
   - 使用fake provider和controlled promises覆盖throttle、success、failure、retry、cancel、
     stale resolution和shared ancestor。
4. **接入Surface Tile Binding与Fallback**
   - 在不改变P3 selection/SSE的前提下增加binding和narrow quadtree iteration seam。
   - 完成desired level cap、parent math、bounded fallback dependency和UV transform。
   - layer mutation、tile eviction和world destroy闭合资源引用。
5. **接入Single-pass Composition**
   - 增加UV varying、transparent texture、shader variant cache和per-tile uniforms。
   - 保持one opaque command per ideal tile及P4 exact command replay。
   - 在mutation前实现hardware texture-unit validation。
6. **动态Loading、Credit与World API**
   - 接入world imageryLayers、dynamic tilesLoaded、hidden/zero-view语义和provider credit。
   - 保持P1 Scene request-render seam不变。
7. **增加 EPSG:3857/OpenStreetMap 人工案例**
   - 先用 `npm run create-demo -- scenegis-planar-imagery` 建立规范目录，再仅在批准的
     Sandcastle 目录组装 explicit Widget/world/controller/provider/layer。
   - `sandcastle.yaml` 使用英文 title/description、`SceneGIS` label 和
     `development: false`；不提交不稳定的外部截图 baseline。
   - 锁定完整 Web Mercator 正方形范围、XYZ 方向、visible attribution 和 service-failure
     说明。
   - 本地人工检查默认画面、PC 导航、瓦片细化、console 和 credit；不把 OSM 加入自动化
     测试。
8. **WebGL、回归与文档闭环**
   - 完成像素、depth、large-offset、warm allocation和destroy evidence。
   - 运行完整命令矩阵，审计exports/generated/upstream ownership。
   - 更新本计划“偏差与结果”、总体计划/index，创建P5 pending review request。
   - 停止等待Architecture/code review，不commit、不push、不进入P6。

Implementation过程中每完成一个步骤可以回写结果，但P5仍是一个phase checkpoint；不能
把未review的中间状态提交为P5完成，也不能把P6内容混入。

## 验证要求

### Provider与Collection Specs

- interface direct construction抛出；structural custom provider可以被layer接受。
- URL/resource input ownership、defaults、invalid scheme/level/dimension/subdomain/credit。
- XYZ `{x}/{y}/{z}`和TMS reversed Y，覆盖Level 0、代表性level和高safe-level address。
- subdomain deterministic且高index组合不发生safe-integer overflow。
- Request identity传入derived Resource；server throttle返回undefined并可在后续重试。
- layer show/alpha validation、provider readonly、attached destroy fail-fast、detach/reuse。
- collection add/index/get/contains/remove/removeAll和全部reorder边界。
- duplicate/multi-collection attachment、wrong tiling-scheme identity、destroyed member。
- standalone collection destroy和live world-owned collection direct-destroy guard。
- provider不随layer/collection/world destroy。

### State、Fallback与Resource Specs

- UNLOADED/LOADING/RECEIVED/READY/FAILED全部transition和非法transition protection。
- synchronous throw、promise reject、undefined throttle、retry true/false、reportSuccess。
- active request cancel、late resolve/reject generation isolation和decoded image close。
- actual image dimension mismatch作为provider failure，不泄漏Texture。
- desired same-level、provider max-level cap、nearest cached ready ancestor、Level-0 bootstrap、
  不主动请求intermediate ancestor和terminal desired failure。
- parent math覆盖level > 31且无bitwise truncation。
- 同一layer多个child共享ancestor entry/texture；不同layer即使同provider也保持独立runtime。
- tile eviction、cache size 0、layer hide/remove/re-show/reorder、world destroy exactly once。
- second Context在request/upload/resource mutation前抛出。

### UV与WebGL Pixel Specs

- same-level identity和root texture方向。
- XYZ raster的NW/NE/SW/SE颜色在正确world quadrant。
- TMS URL request index与internal XYZ render方向同时正确，不出现double flip。
- one-level和multi-level ancestor分别覆盖四个child和相邻共享edge，无black/transparent seam。
- provider maximumLevel较低时，深surface tile正确采样ancestor子区域。
- two/three-layer bottom-to-top order、alpha 0/0.5/1、RGB与RGBA provider和transparent
  missing fallback得到可预测pixel。
- baseColor保持opaque，extent外保持background。
- shown layer count等于hardware limit可以渲染，超过limit原子抛出且不静默截断。
- ordinary和`1e9`量级large-offset CRS下颜色、UV和depth一致。
- textured surface的normal command、first translucent-depth replay、linear/non-log depth和
  default depth均保持`0 < rawDepth < 1`；`scene.pickPosition`与mathematical pick在tolerance
  内一致。
- depth-only replay的request/state/tile/binding/Texture/Shader/DrawCommand/LRU delta均为0。

### `tilesLoaded`与Lifecycle Specs

- no layer、hidden world、hidden layer、zero buffer和fully culled view为true。
- add/show后的UNLOADED、LOADING和RECEIVED为false。
- fallback READY但desired pending仍为false。
- desired READY、provider-capped READY或terminal FAILED为true。
- retry重新变false，随后success变true。
- Promise completion不在pick/depth pass上传GPU；下一normal render才settle。
- world show false不产生request-render loop，恢复show后重新评估。
- stable ready view第二帧tile/binding/request/texture/shader/command allocation delta全部为0。
- world、collection、layer、surface、entry和shared GPU resource destroy顺序没有double
  destroy或retained request。

### 必须运行的命令

```powershell
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarImageryProvider"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarUrlTemplateImageryProvider"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarImageryLayer"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarImageryLayerCollection"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarImagery"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTileImagery"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTile"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarQuadtree"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarImageryCesiumWidget"
npm run test -- --webglValidation --includeName "SceneGIS/Scene/SceneGISPlanar"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCamera"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"
npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarWorldCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"
npm run test -- --includeName "Core/Request"
npm run test -- --includeName "Core/RequestScheduler"
npm run test -- --includeName "Core/Resource"
npm run test -- --includeName "Renderer/Texture"
npm run test -- --includeName "Scene/ImageryProvider"
npm run test -- --includeName "Scene/UrlTemplateImageryProvider"
npm run test -- --includeName "Scene/ImageryLayer"
npm run test -- --includeName "Scene/ImageryLayerCollection"
npm run test -- --includeName "Widget/CesiumWidget"
npm run test -- --includeName "Scene/Globe"
npm run test -- --includeName "Scene/Scene"
npm run build
npm run build-release
npm run build-ts
npm run build-docs
npm run tsc
npm run build-gallery --workspace=packages/sandcastle
npm run build-sandcastle
npx eslint "packages/engine/Source/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Widget/**/*.js"
npx eslint "packages/sandcastle/gallery/scenegis-planar-imagery/main.js"
npx prettier --check "packages/engine/Source/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Widget/**/*.js"
npx prettier --check "packages/sandcastle/gallery/scenegis-planar-imagery/**/*.{html,js,yaml}"
npx prettier --check --ignore-path .gitignore "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"
npx markdownlint "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
```

如果final private layout或Widget suite basename不同，Execution Agent必须把对应命令替换
为真实命中的suite并在“偏差与结果”建立source-to-spec mapping；不得把零命中当作通过。
所有gulp test命令串行运行，避免并发清理Build目录。每条实际命令记录exit code、
passed/failed/skipped count和必要warning。

若完整`Core/Resource`或`Renderer/Texture`回归因已知环境fixture不可运行，不能直接省略；
先记录准确failure与是否由P5引起，再由Architecture Agent裁决等价最小回归。

### Sandcastle 人工验收

- gallery build 能发现 `scenegis-planar-imagery` 且 `sandcastle.yaml` 无 metadata error；
- 本地打开案例后，完整 EPSG:3857 世界首先可见，随后 OSM XYZ tiles 按正确南北方向细化；
- 左键平移、中键旋转、滚轮缩放与 P4 PC 交互一致，console 无 SceneGIS exception；
- Cesium CreditDisplay 持续显示并可访问 `© OpenStreetMap contributors` 链接；
- 模拟 endpoint 不可用时，案例保留 `baseColor`/已有 ancestor，不 crash，并明确提示外部服务
  是 best-effort；
- 不把外部请求结果、截图或缓存文件加入仓库，也不以该人工结果替代 provider、fallback、
  pixel 和 lifecycle Specs。

### 生成与公共API检查

- 四个新增public type出现在engine root JS export、`packages/engine/index.d.ts`、
  `Source/Cesium.d.ts`和API HTML。
- `SceneGISPlanarWorld.imageryLayers`和dynamic `tilesLoaded`声明与ADR一致。
- public provider/layer/collection JSDoc包含全部DeveloperError、ownership和Level-0
  precondition。
- private imagery entry、binding、shader builder、state和debug counter在generated `.d.ts`
  与public API HTML命中为0。
- development/release bundle能解析public types和private modules。
- generated root files、Build output和SpecList只作为验证结果，不进入diff/status/stage。

### 可重复数据与性能证据

Execution Agent在“偏差与结果”至少记录：

- ordinary fixture：world extent、maximumLevel、canvas、selected tile addresses、provider
  target URLs、request/state count、READY/fallback address和representative pixels；
- large-offset fixture：absolute coordinate量级、extent size、selected/desired/fallback
  address、UV transform、rendered/depth pixel和pick tolerance；
- composition fixture：layer order、RGBA source values、layer alpha和最终pixel expected/actual；
- loading fixture：frame-by-frame desired/fallback/tilesLoaded/request count和replacement时机；
- release fixture：created/cancelled/closed/destroyed request/image/texture/shader/command counts；
- warm fixture：第二个相同frame的tile/binding/request/texture/shader/command delta全为0；
- hardware-limit fixture：limit、shown count、throw point和mutation counters。

P5不是frame-time优化阶段，不宣称比Globe imagery更快；但必须量化one-command-per-tile、
texture sharing和warm zero-allocation。若draw call随layer count增加，或ancestor texture按
child重复上传，视为架构偏差并停止review request。

### Diff与所有权审计

- implementation diff base：
  `e4d45e3bafcb249dac98ac8118c28a6b643c8146`。
- 只允许本计划“影响路径”登记的SceneGIS-owned files和docs；新增路径先回写计划。
- 唯一允许的非engine新增产品路径是 SceneGIS-owned
  `packages/sandcastle/gallery/scenegis-planar-imagery/**`。
- upstream-owned files必须为0。
- P5 SGP必须为0；`.scenegis/upstream-patches.json`必须unchanged。
- `Scene.js`、`CesiumWidget.js`中既有`SGP-0001` marker和行为不得改变。
- P5新增`SCENEGIS_PATCH` marker必须为0。
- generated files、Build output和SpecList不得出现在final status。

## 风险与依赖

### 高风险：异步结果与销毁竞态

Request.cancel只标记scheduler request；Promise仍可能在entry释放后resolve。generation和
decoded image close必须有focused Specs。任何stale result能复活Map或Texture都是blocking
defect。

### 高风险：每图层Fallback与Reference Cycle

surface tile、binding、entry、parent/fallback和layer runtime之间容易形成悬挂reference。
必须由单一明确方向拥有，并以tile eviction/layer remove/world destroy三条路径证明最后
reference释放。

### 高风险：Y方向和Double Flip

internal XYZ、TMS URL reverseY、DOM image top-left、ImageBitmap decode flip和WebGL texture
UV是不同层次。必须用四象限非对称像素fixture同时证明URL address和render orientation，
不能只检查template string。

### 高风险：Shader Variant与Texture Unit

Context hardware limit、sampler uniform数量和ShaderProgram cache必须一致。limit failure要在
request/upload/command mutation前发生；variant destroy必须与ShaderCache引用协议匹配。

### 中风险：`tilesLoaded`永久循环或过早true

terminal failure要settle，pending desired即使有fallback也不能settle。hidden world/layer和
zero buffer不得造成无限request-render。promise回调与normal render之间的状态边界必须
清楚。

### 中风险：Public API过早扩张

P5不公开collection events、filter、partial extent、availability和feature picking。发现
应用层需求时记录为P6或后续phase，不得在实现中顺手增加。

### 中风险：Provider Tile Size与SSE

P5验证真实tile dimension，但保持P3 nominal 256 SSE。非256 source可以正确渲染，但不会
改变LOD metric。任何根据当前shown layer动态改变quadtree selection的提议需另行架构
裁决。

### 中风险：OpenStreetMap 外部服务稳定性与使用政策

该案例依赖不提供 SLA 的公共 tile service，不能成为 CI 成功条件。请求必须保持普通浏览器
交互范围、正确 Referer/cache 行为和 visible attribution；不得通过并发预取或离线下载提高
案例“稳定性”。服务不可用时展示底色或已就绪 ancestor，并把问题与 engine 自动化验证分离。

## 完成条件

- 本计划由项目负责人明确批准并在实现前转为`active/confirmed`。
- 四个public imagery types和`world.imageryLayers`按ADR-0005实现并通过JSDoc/types/API检查。
- XYZ/TMS、order、alpha、per-layer ancestor fallback和dynamic tilesLoaded具有自动化Specs
  与真实WebGL pixel evidence。
- one opaque command per ideal tile、P4 depth replay、large-offset和default Globe回归通过。
- Request throttle/retry/cancel/stale generation和image/texture exactly-once release闭合。
- stable ready frame没有新tile/binding/request/texture/shader/command allocation。
- shown layer hardware limit原子fail-fast，不静默截断或multi-pass。
- `scenegis-planar-imagery` 能显式创建 EPSG:3857 平面世界并人工加载 OSM XYZ tiles，具有
  visible attribution、外部服务降级说明和既定 PC 导航；其网络请求不进入自动化测试。
- upstream-owned files=0、P5 SGP=0、patch manifest unchanged、generated status=0。
- Implementation Agent把全部偏差、suite mapping、命令矩阵和证据回写本计划，创建pending
  P5 review request后停止。
- Architecture Agent完成Architecture/code review；所有finding reviewer-confirmed fixed，
  review转为approved，phase和parent roadmap转为completed。
- Architecture Agent以中文提交信息把P5代码、Specs、ADR/通用文档和AgentDocs形成独立
  本地checkpoint；提交前不得讨论、激活或实现P6。
- 不push；checkpoint后停下与项目负责人讨论P6。

## 偏差与结果

### 实际设计与路径

- 四个 public type 按 ADR-0005 实现：structural provider、URL template provider、layer 和
  layer collection；`SceneGISPlanarWorld.imageryLayers` 为 readonly collection，
  `tilesLoaded` 动态汇总 geometry 与 shown-layer imagery 状态。
- private runtime 分为 `_SceneGISPlanarImagery.js`（entry/cache/request/texture lifecycle）、
  `_SceneGISPlanarTileImagery.js`（tile-layer binding、desired/fallback/refcount/UV）和
  `_SceneGISPlanarSurfaceShader.js`（按 shown layer 数量缓存 single-pass shader）。P3 tile、
  quadtree 和 surface 仅增加 SceneGIS-owned imagery binding、tile iteration、composition 和
  eviction/release seam；P3 ideal geometry/SSE/selection 与 P4 depth replay 保持不变。
- normal render 对每个 ideal tile 始终提交一个 `Pass.OPAQUE` command；shown layer 自底向上
  alpha composition。texture-unit limit 在 request、selection、upload 或 command mutation 前
  原子抛出。depth pick 继续重提最近 normal-render command references，零 selection/allocation。
- 新增 `packages/sandcastle/gallery/scenegis-planar-imagery/{index.html,main.js,sandcastle.yaml}`；
  使用批准的 EPSG:3857 extent、OSM XYZ endpoint、visible attribution 和 P4 PC controller。
- final source-to-spec mapping：四个 public source 对应同 basename public Specs；
  `_SceneGISPlanarImagery.js` 对应 `SceneGISPlanarImagerySpec.js`，
  `_SceneGISPlanarTileImagery.js` 对应 `SceneGISPlanarTileImagerySpec.js`，
  `_SceneGISPlanarSurfaceShader.js` 对应 `SceneGISPlanarSurfaceShaderSpec.js`；P3 seams 由
  `SceneGISPlanarTileSpec.js`、`SceneGISPlanarQuadtreeSpec.js`、`SceneGISPlanarSurfaceSpec.js`
  和 `SceneGISPlanarWorldSpec.js` 回归；真实 pixels/depth/lifecycle 由
  `SceneGISPlanarImageryCesiumWidgetSpec.js` 覆盖。private Spec 按 constructor symbol 命名，
  source module basename 保持 `_SceneGIS*`，private symbols 未进入 public export/types/docs。
- P5-R001 第二轮修复后，fresh zero-layer tile 的 `_imagerySlots`、`imageryBindings` 和
  `_imageryRelease` 均保持 `undefined`；从有影像过渡到零 shown layer 时只清空既有 slots
  array，不为没有 slots 的 tile 新建 container。lazy Map 和 manager-constructor stable bound
  release callback 保持不变。
- P5-R002 第二轮修复后，只有 `event instanceof Event` 进入 Cesium listener/logging 路径；
  其他已验证 structural event 即使带额外 `numberOfListeners` 属性也直接收到
  `TileProviderError`，并且 retry 只在下一 normal frame 执行。

### 可重复证据

- ordinary/loading：`[-128,128]^2`、maximumLevel 0、1×1 selected tile；蓝色 baseColor 在一次
  local request pending 时令 `tilesLoaded=false`，resolve/upload 后得到 `[255,0,0,255]`、
  `tilesLoaded=true`，同一 stable frame request/texture/shader/command/binding delta 均为 0，
  submitted command 为 1。
- fallback：Level-1 四个 ideal tiles 共用 READY `0/0/0` root texture，pending desired 仍令
  `tilesLoaded=false`，四个 commands 输出绿色且 root entry refcount 随 binding 精确增减；
  terminal desired failure 不丢失已经 READY 的 ancestor。
- composition：底层红色与顶层蓝色 `alpha=0.5` 得到 `[128±1,0,128±1,255]`，两个 shown
  layers仍只有一个 opaque command。四象限 fixture 锁定 NW 红、NE 绿、SW 蓝、SE 黄，证明
  XYZ/TMS/address 与 DOM/WebGL Y 方向没有 double flip。
- large-offset：extent `[1e9,1e9+256]^2`、tile model translation X=`1e9+128`，红色 pixel、
  depth replay 和 mathematical/rendered picking 保持有限且一致。
- release：hide 销毁 texture 1 次，re-show 新建第二个 texture，world destroy 后总计 created=2、
  destroyed=2；shared surface texture 仍 exactly once，provider 非 owned，layer owned and destroyed。
  stale promise 的 decoded image `close()` 恰好 1 次且不复活 runtime；cancel counter 恰好 1。
- hardware limit：shown count=`maximumTextureImageUnits+1` 时在 request/selection/shader/command
  mutation前抛错；request count、created tiles/shaders 和最近 normal command cache均无 delta。
- Sandcastle：gallery 发现 304 examples 中唯一 `SceneGIS Planar Imagery`；人工打开后全球 OSM
  XYZ 南北方向正确，左拖与滚轮改变视图并细化，`© OpenStreetMap contributors` 链接可见，
  console 无 warning/error。外部服务失败降级由本地可控 terminal-failure/baseColor/ancestor
  Specs覆盖；人工网络结果、截图和 cache 未进入仓库。

### 验证矩阵

所有 gulp test 串行运行，均 Exit 0。以下先列直接 source enumeration，再列实际
`includeName` aggregate；aggregate 的 substring overlap 不重复计入 unique total：

- P5 direct unique：provider 3、URL provider 3、layer 3、collection 4、private imagery 13、
  tile imagery 5、shader 2、imagery Widget 9，共 `42` cases；另新增一个 direct P3 Surface
  seam case，完整本轮新增 direct evidence 为 `43` cases。

| Actual runner command / scope                     | Result / attribution                                      |
| ------------------------------------------------- | --------------------------------------------------------- |
| provider / URL provider                           | `3` / `3 SUCCESS`, no overlap                             |
| layer / collection                                | `7` / `4 SUCCESS`; layer aggregate includes collection 4  |
| private imagery substring aggregate               | `23 SUCCESS`; direct private 13 + public overlap 10       |
| tile imagery / tile aggregate                     | `5` / `10 SUCCESS`; tile aggregate includes tile imagery  |
| surface aggregate                                 | `22 SUCCESS`; direct surface 20 + shader 2                |
| imagery Widget                                    | `9 SUCCESS`, direct                                       |
| `--webglValidation SceneGIS/Scene/SceneGISPlanar` | `116 SUCCESS`, `15825 skipped`                            |
| quadtree / world                                  | `11` / `14 SUCCESS`                                       |
| camera aggregate / controller                     | `33` / `25 SUCCESS`; camera aggregate includes controller |
| P3 / P4 navigation Widget                         | `1` / `4 SUCCESS`                                         |

计划中的 `--includeName "Scene/ImageryProvider"` 在当前源码无该 suite，实际为 `0 SUCCESS`，
不记为通过；按真实 basename 替换为无网络的 `Scene/GridImageryProvider`，结果 `6 SUCCESS`。

- fix round 的 `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`：均 Exit 0。
  `build-ts` 仅输出当前 Cesium 全库既有 TSD-JSDoc warnings；10/10 exact declaration
  assertions 证明 provider readonly metadata、structural event shape 与 URL scheme union。
- 标准 `npm run build-gallery --workspace=packages/sandcastle` 与首次标准
  `npm run build-sandcastle` 因环境无法访问 Hugging Face tokenizer metadata 而失败；不写成
  通过。`build-gallery-no-embedding` Exit 0 并发现 304 examples；使用仓库支持的
  `SANDCASTLE_NO_EMBEDDINGS=1 npm run build-sandcastle` Exit 0。另以显式同源 origin 完成
  Sandcastle 人工运行，chunk-size 与 same-origin security warning 仅属于该本地验收配置。
- scoped ESLint、engine/demo/docs Prettier、Markdownlint、`git diff --check` 均 Exit 0；final
  ownership audit 记录在 pending review request。
- public root JS、`packages/engine/index.d.ts`、`Source/Cesium.d.ts` 和 API HTML 可见四个 public
  types以及 world imagery members；三个 private module在 declarations/API HTML命中 0。

### 偏差、所有权与剩余风险

- 未改变 public contract、pass 数或 allowed paths；Architecture review 将 private fallback
  粒度收窄并批准为“desired request + Level 0 bootstrap + 最近 cached READY ancestor”，不主动
  请求 intermediate ancestor。未实现 partial extent、reprojection、imagery picking、
  multipass 或 P6 integration。
- upstream-owned files=`0`，P5 SGP=`0`，`.scenegis/upstream-patches.json` unchanged，P5 新增
  `SCENEGIS_PATCH` marker=`0`；generated/Build/SpecList status=`0`。
- 剩余风险限于 public OSM service 网络/SLA、Cesium 既有全库 doc warnings，以及已记录的
  private renderer upgrade sensitivity；均不构成 P5 blocker。P5-R001 至 P5-R006 已全部经
  Architecture re-review 确认为 `fixed`。

### Architecture review 状态

- 首次 Architecture/code review 于 `2026-08-06` 完成，review-level status 为
  `changes-requested`。
- 第二次 focused Architecture re-review 已确认 P5-R001 与 P5-R002；至此 P5-R001 至
  P5-R006 全部为 reviewer-confirmed `fixed`，P5 review 为 `approved`。完整 finding、位置和
  证据见
  `AgentDocs/planar-world/reviews/2026-08-06-p5-planar-imagery.md`。
- 本 phase 为 `completed`；Architecture Agent 将代码、Specs、ADR/通用文档和 AgentDocs 形成
  独立本地 checkpoint。提交后停在阶段门禁，不 push、不创建 P6 plan、不进入 P6。
