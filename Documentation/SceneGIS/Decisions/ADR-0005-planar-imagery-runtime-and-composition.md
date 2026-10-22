# ADR-0005：平面栅格影像运行时与图层合成

## 状态

- Status：`approved`
- Date：`2026-08-06`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-world/plans/2026-08-06-phase-5-planar-imagery.md`
- Related patch：无；P5 禁止修改 upstream-owned file
- Amendment：项目负责人于 `2026-08-06` 批准在 P5 内增加一个受限的
  EPSG:3857/OpenStreetMap Sandcastle 人工案例

## 上下文与源码事实

P2 已建立米制、严格正方形的 `SceneGISPlanarCoordinateSystem`，以及 Level 0 为
`1 × 1`、northwest-origin XYZ、无 wrap 的 `SceneGISPlanarTilingScheme`。P3 已建立
flat surface、ideal-tile selection、SSE、tile-local geometry、surface-tile LRU 和单
Context GPU ownership。P4 在同一 surface command 上补齐了 depth/pick pass replay，
因此 normal render 之外的 pass 不得重新运行 selection、加载状态机或资源 mutation。

Cesium 1.144 的上游影像类型不是与坐标系无关的通用接口：

- `ImageryProvider` 的公共契约包含 geodetic `Rectangle`、Cesium `TilingScheme`、
  projection、tile discard policy 和 feature picking 等球面语义；
- `UrlTemplateImageryProvider` 默认创建 `WebMercatorTilingScheme`，并支持 geographic、
  projected bounds 等依赖 `Cartographic` 和 map projection 的 template tag；
- `ImageryLayer`、`TileImagery` 和 `GlobeSurfaceTile` 通过 terrain rectangle、imagery
  rectangle、Web Mercator reprojection 和 Globe surface state machine 建立绑定；
- `ImageryLayerCollection` 的 feature picking、layer readiness 和 base-layer behavior
  依赖上述具体 `ImageryLayer`；
- `GlobeSurfaceTileProvider.addDrawCommandsForTile` 通过 Globe shader、terrain encoding
  和 geodetic uniforms 批量合成影像，不能作为平面 renderer 的可选接口复用。

以下上游设施与球面无关，可以作为实现依赖而不改变其公共语义：

- `Resource`、`Request`、`RequestScheduler` 和 `RequestType.IMAGERY`；
- `Texture`、`Sampler`、`ShaderProgram`、`DrawCommand` 和 `ContextLimits`；
- `Event`、`TileProviderError` 和 `Credit`。

`Resource.fetchImage` 会把 `Request` 交给 `RequestScheduler`，在服务器饱和时返回
`undefined`，并通过 `Request.cancelFunction` 中止可取消的网络请求。`Texture` 可以从
`ImageBitmap`、HTML image/canvas 和 buffer source 建立 GPU texture。P5 不需要复制
`Imagery`、`TileImagery` 或 Globe shader，只需要为 canonical planar pyramid 建立较窄的
状态机和采样变换。

P3 的 shader 仍是 `SceneGISPlanarSurface` 内的极小 JavaScript string。当前 Cesium
shader generator 只扫描 `packages/engine/Source/Shaders/**/*.glsl` 和 ThirdParty shader；
新增 `Source/SceneGIS/Shaders` 不会自动生成可导入的 `.js`，而生成文件又不得手工提交。

## 决策

### 公共平面影像类型

> 2026-09-18 amendment：[ADR-0082](ADR-0082-planar-imagery-protocols.md) 增加通用 WMS / WMTS / TMS /
> SingleTile 与 URL tags，异步 fromUrl 在 resolve 后同步 ready，像素宽高不再要求相等。
> 以下 P5 范围作为历史设计保留；canonical 网格、所有权、图层合成与请求状态机保持。

P5 新增以下 SceneGIS-owned 公共类型：

- `SceneGISPlanarImageryProvider`：不可直接实例化的 structural interface；
- `SceneGISPlanarUrlTemplateImageryProvider`：同步就绪的 URL-template provider；
- `SceneGISPlanarImageryLayer`：provider 的显示、alpha 和 collection attachment；
- `SceneGISPlanarImageryLayerCollection`：world-owned 的有序图层集合。

`SceneGISPlanarWorld` 增加只读 `imageryLayers`。这些类型不继承、包装或伪装上游
`ImageryProvider`、`ImageryLayer` 和 `ImageryLayerCollection`，也不把大地测量
`Rectangle` 引入平面 API。

`SceneGISPlanarImageryProvider` 的最小 structural contract 为：

```text
tilingScheme       readonly SceneGISPlanarTilingScheme
minimumLevel       readonly number，P5 固定为 0
maximumLevel       readonly non-negative integer
tileWidth          readonly positive integer
tileHeight         readonly positive integer，且等于 tileWidth
hasAlphaChannel    readonly boolean
errorEvent         readonly structural addEventListener/raiseEvent capability
credit             readonly Credit | undefined
requestImage(x, y, level, request)
```

`requestImage` 返回 image promise，或在 Cesium request throttling 暂时拒绝请求时返回
`undefined`。P5 provider 在构造完成后必须同步 ready；异步 metadata/provider readiness
不属于本阶段。

图层加入 world collection 时，`provider.tilingScheme` 必须严格等于
`world.tilingScheme`。P5 不比较两个独立 coordinate system 的数值相等性，也不根据
相同 `crs` 字符串推断可互换性。调用方应先创建 world，再把其 canonical
`tilingScheme` 传给 provider。这个 identity rule 用于 fail-fast 阻止隐式重投影、轴向
误解和范围相同但实际 CRS 不同的数据被静默混合。

### URL Template 与寻址

`SceneGISPlanarUrlTemplateImageryProvider` 至少接收：

```text
url
tilingScheme
urlScheme = "xyz" | "tms"，默认 "xyz"
maximumLevel = tilingScheme.maximumSafeLevel
tileWidth = 256
tileHeight = tileWidth
subdomains = "abc"
hasAlphaChannel = true
credit
```

P5 template 只承诺 `{x}`、`{y}`、`{z}` 和 `{s}`。内部 tile address 始终保持
northwest-origin XYZ；`urlScheme: "tms"` 只把 URL 中的 Y 替换为
`2 ** level - y - 1`，不改变 quadtree、cache key 或 public tile coordinate。subdomain
选择使用不会在高层级对 `x + y` 造成 safe-integer overflow 的模运算。

provider 的 Level 0 必须覆盖完整 world extent，`minimumLevel` 固定为 `0`。P5 不支持
局部 layer extent、缺失 Level 0 的 pyramid、不同 root tile count、wrap 或 runtime
reprojection。`maximumLevel` 可以小于 world `maximumLevel`；更深的 surface tile 通过
ancestor UV transform 采样 provider 的最高可用层级。

URL provider 使用 `Resource.getDerivedResource` 和调用方传入的 `Request`，再直接调用
`Resource.fetchImage({preferImageBitmap: true, flipY: true})`。它不调用或实现上游
`ImageryProvider` 的 Earth-specific contract。P5 只承诺普通 raster image source，不
承诺 KTX2、tile discard policy 或 compressed texture。

### EPSG:3857 / OpenStreetMap 参考案例

P5 同时交付一个 SceneGIS-owned Sandcastle 人工案例
`packages/sandcastle/gallery/scenegis-planar-imagery/`，用于验证以上公共 API 对真实公开
XYZ pyramid 的组装能力。这个案例是 P5 的窄小验收面，不增加 `Viewer` 自动集成，也不把
Sandcastle 业务逻辑带入 engine。

案例固定使用完整 EPSG:3857 正方形范围：X/Y 均为
`[-20037508.342789244, 20037508.342789244]` 米，CRS metadata 为 `EPSG:3857`。它显式创建
`SceneGISPlanarWorld`、`CesiumWidget` 和 `SceneGISPlanarCameraController`，并把
`world.tilingScheme` 原样传给 `SceneGISPlanarUrlTemplateImageryProvider`。

OpenStreetMap provider 使用官方 standard raster endpoint
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`、XYZ、`256 × 256`、maximum Level 19。
CreditDisplay 必须持续显示带 copyright 链接的 `© OpenStreetMap contributors`。案例只
允许普通交互式当前视图请求，禁止预取、批量/离线下载或规避 HTTP cache；endpoint
best-effort failure 降级为平面 `baseColor` 或已 ready ancestor。所有自动化 Specs/E2E
继续使用本地可控 fixture，不依赖该外部服务。案例必须遵守
[OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)。

### Layer 与 Collection

> 2026-08-12 amendment：S2在不改变P5 request/cache/texture/composition ownership的前提下增加
> uniform-only颜色滤镜。公共属性、raw sampled RGB顺序、normal-render snapshot与资源边界见
> [ADR-0031](ADR-0031-planar-imagery-color-filters.md)。本节保留P5历史基线。

`SceneGISPlanarImageryLayer` 构造形式为：

```text
new SceneGISPlanarImageryLayer(provider, {
  show = true,
  alpha = 1.0,
})
```

`show` 只接受 boolean；`alpha` 只接受 `[0, 1]` 内的 finite number。collection index
从底到顶定义合成顺序。`alpha === 0` 不等价于 `show === false`：显示图层仍保持请求、
cache 和 shader slot，只有 `show` 控制是否参与当前视图加载与 texture-unit 预算。

collection 至少公开 `length`、`get`、`contains`、`add`、`addImageryProvider`、
`remove`、`removeAll`、`raise`、`lower`、`raiseToTop` 和 `lowerToBottom`。同一 layer
instance 同时只能属于一个 collection。`remove(layer, destroy = true)` 与
`removeAll(destroy = true)` 默认销毁 layer；使用 `destroy = false` 移除后可以把 layer
加入另一个使用同一 canonical tiling scheme 的 world。

collection 同时公开 `isDestroyed()` 和 `destroy()`；destroy 默认销毁仍 attached 的
layers，但不销毁 providers。`world.imageryLayers` 由 world 拥有，调用方不得在 world
存活期间单独 destroy 它；这种调用抛出 `DeveloperError`。world destroy 先解除 private
owner guard，再负责成对释放。

provider 不由 layer 或 collection 拥有，也不会因 layer/world destroy 自动销毁；同一
provider 可以被多个 layer 引用，但每个 layer 保持独立 runtime cache 和 alpha/order。
layer 在仍 attached 时不得由调用方直接 destroy，避免 collection 留下 destroyed member。

`SceneGISPlanarImageryLayerCollection` 可以由调用方使用 canonical tiling scheme 构造：

```text
new SceneGISPlanarImageryLayerCollection({ tilingScheme })
```

它公开只读 `tilingScheme`。`SceneGISPlanarWorld` 创建并拥有自己的 collection；P5 不提供
替换 world collection 的 setter。独立构造的 collection 可以管理和验证 layer，但只有
world-owned collection 会通过 private listener 接入 surface runtime。

collection mutation 同步通知 surface：

- add/show 会使当前 imagery readiness 失效；
- hide/remove 会取消并释放该 layer 的 tile bindings、请求、decoded image 和 texture；
- reorder 只改变下一 normal render 的 uniform slot 顺序，不重建影像 cache；
- alpha 通过现有 uniform 读取，不触发 texture reload。

P5 不新增通用 Scene `imageryLayers` 属性。平面图层只从具体
`SceneGISPlanarWorld.imageryLayers` 访问；现有 Globe/Scene imagery API 不变。

### 每图层 Imagery 状态机与缓存

surface 为每个 attached layer 维护一个私有 runtime 和以 `level/x/y` 为 key 的 imagery
cache。cache entry 至少区分：

```text
UNLOADED -> LOADING -> RECEIVED -> READY
                         |          |
                         +--------> FAILED
```

- `UNLOADED`：尚未获得 RequestScheduler slot，后续 normal frame 重试；
- `LOADING`：持有 `Request` 和当前 generation；
- `RECEIVED`：Promise 已得到 decoded image，但尚未在 normal render 上传 GPU；
- `READY`：持有当前 world Context 的 `Texture`；
- `FAILED`：当前 attempt terminal，除非 `errorEvent` listener 要求 retry。

请求使用 `RequestType.IMAGERY`、`throttle: false` 和 `throttleByServer: true`，与当前
Cesium imagery request 的 server-throttling 行为一致。provider 返回 `undefined` 时 entry
回到 `UNLOADED`，不能误记为 failure。

failure 通过 `TileProviderError.reportError` 发送到 provider `errorEvent`。listener 设置
retry 后 entry 回到 `UNLOADED` 并在后续 normal frame 重试；没有 retry 时进入 terminal
`FAILED`。取消请求或 stale generation 的 rejection 不发送 provider failure。

tile eviction、layer hide/remove 和 world destroy 会减少 cache reference。reference 归零
时必须：

- 对未完成 Request 调用 `cancel()`；
- 忽略 generation 不匹配的迟到 Promise；
- 对未上传且支持 `close()` 的 decoded image exactly once close；
- 对 READY texture exactly once destroy；
- 从 layer cache 删除 entry。

parent address 使用 `Math.floor(x / 2)` 与 `Math.floor(y / 2)`，禁止复制上游
`(x / 2) | 0`，因为 planar tiling contract 允许超过 31 的 safe level。

### Per-layer Ancestor Fallback

P3 quadtree 继续返回 ideal surface geometry set。P5 不因影像 readiness 改变 SSE、
visibility、ideal tile address、OBB、model matrix 或 surface-tile LRU。

对每个 ideal surface tile 和每个 shown layer：

1. desired imagery level 为
   `min(surfaceTile.level, provider.maximumLevel)`；
2. surface tile address 映射到该 desired level 的 canonical ancestor；
3. desired entry 始终是最终加载目标；
4. desired 未 READY 时，从已有 cache entry 中选最近的 READY ancestor；
5. 没有 READY ancestor 时确保 Level 0 dependency 被请求；P5 不主动请求 intermediate
   ancestor，其他 tile 已经加载到 cache 的 READY intermediate ancestor 可以被复用；
6. 除 desired request 外，每个 binding 同时最多持有一个 fallback dependency；当 cache 中
   出现更近的 READY ancestor 时，先精确释放旧 fallback reference，再持有新 entry；
7. 没有 READY imagery 时使用共享 transparent placeholder，使 opaque `baseColor` 仍覆盖
   ideal tile，不产生 geometry hole。

desired READY 后释放 fallback dependency。desired terminal FAILED 后停止该 desired 的自动
重试，只保留已经 READY 的最近 ancestor；若 fallback 仍 pending，则释放它，不能让不再影响
最终目标的后台 dependency 继续占用 `tilesLoaded` 或资源。

同一图层内的 desired/fallback entry 通过 cache reference count 在多个 surface tile 间
共享。一个图层的慢请求、失败或较低 `maximumLevel` 不得阻塞其他图层使用各自更高分辨率
的 READY imagery。

这条规则细化 ADR-0003 中“用 ready ancestor 替换未就绪 ideal tile”的描述：P5 不替换
整个 geometry tile，而是在 ideal geometry 上逐图层采样 imagery ancestor。ADR-0003 的
SSE、selection、local geometry 和 tile LRU 契约保持不变。

ancestor UV transform 使用 tile-local `[0, 1]` 坐标，并显式处理 northwest-origin Y。
所有计算使用 `2 ** levelDelta`、除法和 `Math.floor`，不得使用 32-bit bitwise address。
相邻 ideal tiles 采样同一 ancestor 时，内部共享边界必须得到一致 texture coordinate，
不能通过扩大 extent 或 geometry epsilon 掩盖 seam。

### 单 Pass 图层合成

每个 ideal surface tile 继续只提交一个 `Pass.OPAQUE` `DrawCommand`。fragment color 从
opaque `baseColor` 开始，按 collection bottom-to-top 顺序执行：

```text
effectiveAlpha = sampledColor.a * layer.alpha
color.rgb = mix(color.rgb, sampledColor.rgb, effectiveAlpha)
color.a = 1.0
```

`hasAlphaChannel === false` 的 texture 使用 RGB format并按 alpha 1.0 采样。missing imagery
绑定共享 transparent texture。Sampler 使用 clamp-to-edge 和 non-mipmap linear sampling；
P5 不开放 filter、anisotropy 或 mipmap public options。

surface 按 shown layer count 缓存 shader variant，生成静态展开的 sampler、UV transform
和 alpha uniforms。collection order 或 readiness 只改变 per-tile binding/uniform data；稳定
view 不重新编译 shader。layer count 改变可以一次性更新 command shader/uniform layout，
但现有 tile `DrawCommand` identity应尽量复用。

shown layer count 不得超过当前 Context 的 `ContextLimits.maximumTextureImageUnits`。超过时
在发起 imagery request、上传 texture、修改 command 或提交 command 前抛出
`DeveloperError`。P5 不用不稳定的 transparent command sorting 实现多 pass，也不通过
CPU canvas 或 per-tile framebuffer 预合成绕开 hardware limit。

P4 的 normal-render/pick-depth contract保持：

- 只有 normal render 运行 selection、request transition、texture upload、binding mutation
  和 command cache更新；
- `passes.pick && passes.depth && !passes.render` 只重提最近 normal render 缓存的相同
  command references；
- pick/depth replay 不创建 Request、Texture、ShaderProgram、DrawCommand 或 tile，也不
  改变 LRU、protected set、imagery state和 `tilesLoaded`；
- textured surface 最终仍 opaque，`scene.pickPosition` 与 mathematical planar pick 的
  P4 一致性继续成立。

### Shader Source 与构建边界

P5 可以把现有 surface shader strings 移到一个 SceneGIS private JavaScript shader
builder，并按 shown layer count 生成小型 source。它不得新增或提交生成的 shader `.js`，
不得修改 upstream shader generator，也不得为了本阶段创建 `Source/SceneGIS/Shaders`
build hook。

如果实现发现需要多个 GLSL include、新 `czm_*` builtin、Worker 共享 shader、复杂 material
variant 或显著超过本 ADR 的单组件 source，Execution Agent 必须停止并交回 Architecture
Agent；该需求需要独立 ADR，必要时再建立 SGP/build seam。

### `tilesLoaded` 语义

`SceneGISPlanarWorld.tilesLoaded` 表示最近一次 normal render 的当前视图是否还存在可执行
的 imagery loading/upload工作，而不是声明所有 provider 数据都成功存在：

- shown layer 的 desired entry 为 `UNLOADED`、`LOADING` 或 `RECEIVED` 时为 `false`；
- desired entry READY时为 settled；
- 没有 retry 的 terminal FAILED也为 settled，避免永久 request-render loop；
- READY ancestor 只保证当前画面可渲染，desired仍 pending时不能把 `tilesLoaded` 提前变为
  `true`；
- hidden layer、hidden world、zero-size drawing buffer或当前视图没有 selected tile时不
  阻塞 `tilesLoaded`；
- collection add/show和 retry会使下一 normal frame重新评估为 loading；hide/remove不再
  阻塞。

Promise completion可以把 entry从 LOADING变为 RECEIVED或 FAILED，但 GPU upload和最终
view-settled计算只发生在 normal render。P1 Scene lifecycle 已在 `tilesLoaded === false`
时请求后续帧，P5 不增加新的 upstream request-render hook。

### 资源与性能边界

surface 仍只绑定一个 Context。所有 imagery texture、transparent placeholder、shader
variant和 tile command属于该 world/surface Context；用第二个 Context进入 beginFrame或
render继续 fail-fast。

稳定相机、稳定 layer collection且全部 desired imagery settled后：

- 不创建新 tile、binding、Request、Texture、ShaderProgram 或 DrawCommand；
- 每个 rendered ideal tile保持一个 surface draw command，不随 layer count增加 draw call；
- ancestor texture在同一 layer中由 cache entry共享，不为每个 child重复上传；
- `tileCacheSize` 继续限制 unprotected surface tile record，tile eviction释放其 imagery
  binding，最后一个 reference释放对应 imagery resource；
- world destroy、layer remove/hide和 LRU eviction必须有可计数的 exactly-once evidence。

P5 保持 P3 固定 `256` nominal surface SSE，不因 provider tile dimension或 layer mutation
改变 quadtree selection。provider `tileWidth/tileHeight` 只用于 source validation和 texture
metadata。未来若要由 provider提供真正的 sampling error model，应单独评估多图层下的
LOD policy，不在 P5 静默改变 P3 screen-space behavior。

## 不采用的方案

### 让平面 Provider 实现上游 `ImageryProvider`

不采用。它会迫使平面 provider伪造 geodetic `Rectangle`、projection、ellipsoid和
feature-picking语义，并让自定义 provider暴露不能兑现的公共 API。

### 直接复用 `ImageryLayer` 或 `ImageryLayerCollection`

不采用。虽然 collection的部分 add/remove方法看似通用，实际 layer readiness、base
layer、feature picking和 Globe integration依赖具体上游 `ImageryLayer`。局部复用会形成
脆弱的 structural coincidence。

### 用一个 Ready Ancestor Geometry 替换整个 Ideal Tile

不采用。多个图层可以具有不同 `maximumLevel`、READY ancestor和失败状态；选择单一
surface ancestor会让慢图层阻塞快图层，或丢失已就绪的高分辨率影像。

### 用多 Pass 支持任意数量图层

P5 延期。第一 opaque batch之后的 blended pass需要稳定的跨 tile、跨 batch command
order，并与 Cesium opaque/translucent sorting、OIT和depth state交互。仅靠 command插入
顺序不能形成长期契约。

### CPU Canvas 或 Per-tile Framebuffer 预合成

不采用。CPU canvas引入DOM/worker、CORS和重复像素copy；per-tile framebuffer引入额外
texture、render command和大幅GPU内存。当前硬件sampler上限足以覆盖首版明确的多图层
验收。

### 按范围或 CRS 字符串自动匹配 Provider

不采用。相同数值范围和相同/缺失opaque CRS字符串不证明轴向、datum或业务域可互换。
P5使用canonical tiling-scheme identity，调用方以后若需要reprojection必须显式增加新
subsystem。

### 立即建立 SceneGIS `.glsl` 生成链

不采用。P5只有一个局部、按texture count展开的shader组件；修改build和发布链的长期
成本高于当前收益。出现include/builtin/Worker等真实需求时再立项。

## 结果与影响

- 平面世界获得不携带Earth语义的公共raster extension point。
- XYZ与TMS共享同一internal tile address，差异只在URL展开。
- 多图层可以独立加载和fallback，同时保持一个opaque draw command per tile。
- 首版图层数受fragment texture unit硬件上限约束；这是显式fail-fast contract，不是
  静默丢层。
- 完整Level-0 pyramid、无partial coverage和无reprojection缩小了首版范围；后续能力可以
  在不破坏cache key和canonical world grid的前提下扩展。
- 新public types形成兼容性承诺；private imagery state、binding、shader builder和debug
  counters不进入types/API HTML。
- P5预计upstream-owned files为0、SGP为0，`.scenegis/upstream-patches.json`不变。
- 一个明确受限的 EPSG:3857/OpenStreetMap Sandcastle 案例在 P5 内提供人工集成证据；
  Viewer 默认构造、通用 Sandcastle 集成和 network-dependent E2E 仍保留到 P6 或以后。

## 升级检查点

### 2026-10-22 修订：原生语义的影像分屏

`SceneGISPlanarImageryLayer` 增加构造选项和可写属性 `splitDirection`，默认
`SplitDirection.NONE`。复用原生 `SplitDirection.LEFT / NONE / RIGHT`；invalid 值在
赋值及通知前拒绝，重复赋值无操作。场景位置直接使用原生 `scene.splitPosition`，
有效区间 `[0,1]`、原生初始值 `0`；不创建第二个 World splitPosition 或分屏控制器。

只迁移官方基线 `6d5d8b1f0725b6f831b336463f4b11c98023427b` 的
`Shaders/GlobeFS.glsl#sampleAndBlend` 中必要的 alpha 屏蔽数学：LEFT 在
`gl_FragCoord.x > czm_splitPosition` 时为透明，RIGHT 在 `<` 时透明，等于时双方保留。
`Renderer/UniformState.js` 将 normalized 场景位置换算为 drawing-buffer 像素，
因此无需自定义 CSS/DPR uniform。后续 Cesium 升级同步检查上述比较与坐标定义。

每层方向加入现有 normal-render slot/uniform 快照，depth replay 不发布未绘制的
layer mutation。分屏只影响该影像 sample alpha，不 `discard` 地表，不裁剪 geometry、
depth、Material 或矢量；原有 color-to-alpha、coverage、alpha、gamma 批次选择与层序保持。
遮掉的图层仍参与既有请求/readiness 与 sampler 预算，不增加瓦片调度侧剔除。

方向切换、分屏线移动只更新 uniform，不增加 shader variant、纹理、pass 或 draw call。
方向值通过原有 layer notification 发布；与现有滤镜和原生 splitPosition 一样，
requestRenderMode 下应用修改后显式调用 `scene.requestRender()`。

本修订为现有单次绘制的局部能力扩展；不支持水平/任意形状分屏或独立相机视口。
全部实现、Specs、示例均为 SceneGIS-owned，无 upstream 修改及新 SGP。
见[维护计划](../../../AgentDocs/planar-world/plans/2026-10-22-imagery-split.md)。

### 常规升级检查

每次Cesium升级检查：

- `Resource.fetchImage`对`Request`、`undefined` throttling、flipY、ImageBitmap和cancel的
  行为；
- `RequestScheduler`的server slot、Request state和cancel callback协议；
- `Texture` image upload、PixelFormat、Sampler和exactly-once destroy；
- `ContextLimits.maximumTextureImageUnits`初始化和multi-context含义；
- `ShaderProgram.fromCache`引用与destroy协议；
- `TileProviderError.reportError/reportSuccess`的retry语义；
- Scene normal render与P4 pick/depth replay的pass顺序、derived-command和near/far行为；
- 上游是否出现真正不含Rectangle/projection/ellipsoid的generic imagery interface。只有其
  语义与本ADR等价时，才评估收敛SceneGIS provider/runtime。
- OpenStreetMap standard tile endpoint、visible attribution、cache、Referer 和禁止 bulk
  download/prefetch 的使用政策；如政策变化，先更新或停用案例，不能把兼容负担转入
  imagery runtime。
