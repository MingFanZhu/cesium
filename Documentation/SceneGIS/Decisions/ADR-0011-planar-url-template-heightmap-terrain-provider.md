# ADR-0011：坐标系无关的平面 XYZ Heightmap Terrain Provider

## 状态

- Status：`approved`
- Date：`2026-08-08`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-terrain/plans/2026-08-08-phase-t5-url-template-heightmap-provider.md`
- Related patch：无；T5 默认只允许修改 SceneGIS-owned files

## 上下文与源码事实

T1-T4 已完成平面 terrain provider/data 契约、Heightmap mesh、异步连续 LOD、fallback、
resource lifecycle、查询、terrain picking 与独立采样。当前尚缺少一个可直接使用的 concrete
provider，以及能够证明 terrain、imagery、Viewer 和公开服务实际组装方式的 Sandcastle。

`SceneGISPlanarTerrainProvider` 已规定 provider 必须使用 world 的 canonical
`SceneGISPlanarTilingScheme` object；`SceneGISPlanarHeightmapTerrainData` 已规定 north-to-south、
west-to-east row-major、包含四条 tile edge 的采样网格、Cesium-compatible `structure` 解码和
SW→NE triangle split。T3 runtime 已拥有 Request、TerrainData、CPU mesh、GPU resource、cache 与
fallback；concrete provider 不应重复建立这些 ownership。

Cesium 1.144 的 `SceneGISPlanarUrlTemplateImageryProvider` 已证明 `{z}`、`{x}`、`{y}`、`{s}`、
`xyz/tms`、`Resource`、subdomain 和 caller-supplied canonical tiling scheme 的可行模式。上游
`VRTheWorldTerrainProvider` 证明 image pixel 可以解码为 Heightmap；现有 engine dependency
`lerc` 也已用于官方 terrain/worker 路径。两者都只是实现启发，不能把 Globe tiling、ellipsoid
或服务专有 metadata 带入平面公共 API。

XYZ 只描述 tile address，不描述 CRS、采样位置或 payload encoding。公开服务可能使用
Terrain-RGB、Terrarium、LERC 或其他格式；普通 raster tile 的像元中心也不能自动等同于 terrain
mesh 的边界采样点。项目负责人据此明确：通用 provider 不绑定 EPSG:3857、ArcGIS 或其他服务，
应用负责保证 URL 数据、world coordinate system 与 tiling scheme 一致。公开服务只作为案例配置。

## 决策

### 公共类型与坐标职责

新增 public `SceneGISPlanarUrlTemplateHeightmapTerrainProvider`。它是
`SceneGISPlanarTerrainProvider` 的 concrete structural implementation，职责限定为：

- 展开 URL template 并通过 Cesium `Resource` 请求 tile payload；
- 按显式配置把 image 或 LERC payload 解码为
  `SceneGISPlanarHeightmapTerrainData`；
- 发布 provider height range、maximum level、geometric error、Credit 与 error event；
- 对完整、连续的 `0..maximumLevel` XYZ pyramid 报告 availability。

Provider 不读取、比较或转换 CRS，不从 URL、metadata 或 payload 猜测坐标系，不创建新的 tiling
scheme。调用方必须传入目标 world 的 canonical `SceneGISPlanarTilingScheme` object，并负责保证
数据与其 extent、northwest-origin XYZ address、米制 XY/Z 和无 wrap 语义一致。World setter
继续以 object identity 执行最终集成检查。

### 构造配置

首版构造器使用同步显式配置，不增加 async metadata factory。公共 options 至少包含：

```text
url
tilingScheme
urlScheme = "xyz" | "tms"
maximumLevel
heightmapWidth
heightmapHeight
minimumHeight
maximumHeight
format = "image" | "lerc"
structure                  // image format 使用
levelZeroMaximumGeometricError // optional override
subdomains
credit
```

最终 JSDoc 命名可在不改变上述语义的前提下按当前代码风格微调，但不得增加 CRS、projection、
ellipsoid、ArcGIS metadata 或隐式 network discovery 参数。

`url` 接受 `string|Resource` 并由 provider 建立自己的派生 Resource；`credit` 接受
`string|Credit`。`maximumLevel` 必须位于 tiling scheme safe range。sample width/height 均至少为
2，允许矩形 grid；provider height range 必须 finite、ordered，并能通过既有 World Float32
relative-height preflight。

未显式给出 `levelZeroMaximumGeometricError` 时，使用 Level-0 square tile edge 与 grid 两轴中较大
sample spacing 推导一个固定的 heightmap estimate，并逐级除以 2。该值是 LOD 几何误差估计，
不是 LERC compression tolerance；调用方可按数据源的已知误差显式覆盖。

### URL 与 tile address

URL template 支持 `{z}`、`{x}`、`{y}` 和 `{s}`，placeholder 在 URL 中的排列不受限制。因此
`.../{z}/{x}/{y}` 与 `.../tile/{z}/{y}/{x}` 都是合法配置，不代表 provider 绑定某个服务。

Provider 接受 world 的 canonical northwest-origin XYZ address。`urlScheme="xyz"` 原样使用 Y；
`urlScheme="tms"` 使用该 level 的 `count - y - 1`。subdomain 选择必须使用 safe integer arithmetic，
不能依赖 32-bit bitwise shift。非法 level/address 必须在发起网络请求前抛 `DeveloperError`。

### Heightmap payload

`format="image"`：

- 使用 `Resource.fetchImage` 和现有 `getImagePixels` 读取 RGBA pixel buffer；
- RGBA channel 是数值编码而非颜色，request显式设置
  `skipColorSpaceConversion: true`；该保证依赖浏览器对相应 `ImageBitmap` option的支持，不增加
  跨浏览器转换补偿；
- CPU Heightmap 按图片自然的 top-to-bottom row order解释，不使用 imagery texture 的 Y flip；
- 实际 image dimensions 必须精确匹配显式 sample width/height；
- `structure` 使用 `SceneGISPlanarHeightmapTerrainData.Structure`，可表达常见多 channel
  scale/offset 编码；所有structure字段及`width * height * stride`必须在constructor中完整规范化、
  验证并fail-fast，不能等到tile fetch后重复失败；
- 若 payload 是 caller 不可见的 `ImageBitmap`，provider 在解码完成、失败或 stale path 后只关闭
  一次；TerrainData 只取得独立 pixel TypedArray ownership。

`format="lerc"`：

- 使用 `Resource.fetchArrayBuffer` 并在主线程调用现有 `lerc` dependency；
- 只接受一个 elevation band，decoded dimensions 必须精确匹配配置；
- decoded numeric TypedArray 直接交给 `SceneGISPlanarHeightmapTerrainData`，使用单 element 默认
  structure；
- mask/NoData、空 band、dimension mismatch 或非 finite height 使整个 tile request reject，不能
  用 0 或 provider minimum 伪造样本。

两种格式都必须产生包含 tile 四条边的逻辑采样网格。Provider 只能验证尺寸和单 tile 数值，无法
验证相邻服务 tile 是否共享相同边界样本；这是数据发布者与应用配置的契约。普通 pixel-center
raster 若未先做合适的邻域拼接或重采样，不得被文档宣称为无缝 boundary-sampled terrain。

### Availability、错误与生命周期

首版 URL-template provider 表示完整连续 pyramid：Level 0 到 `maximumLevel` 的合法地址返回
`true`，更高 level 返回 `false`，`loadTileDataAvailability` 返回 `undefined`。Sparse metadata、
tilemap discovery 和 per-tile child availability 不进入此 generic provider；需要这些能力的数据源
应实现独立 provider，或在后续有真实需求时扩展而不是预先加入 service-specific API。

成功 tile 的 `childTileMask` 在 `level < maximumLevel` 时为 15，在 maximum level 为 0。网络、
decode、mask、NoData 或维度错误沿 Promise rejection 进入 T3 已有 `TileProviderError`、retry、
terminal failure 和 ancestor fallback，不在 provider 内另建 retry state。

`Resource` 接收 runtime 创建的原始 `Request`，并保留 scheduling 返回 `undefined` 与 cancellation
语义。Provider 只拥有 Resource、配置副本、Event 和 Credit reference，不拥有 World、Request、
TerrainData、mesh、GPU 或 runtime cache，也不新增 `destroy`。Global `provider.credit` 由Surface
单独提交，不复制到每个`TerrainData.credits`；后者只保留真正的per-tile attribution。World
replacement/destroy继续不销毁caller-owned provider。

### Sandcastle 与公开数据

新增唯一 `scenegis-planar-terrain` Sandcastle，复用既有 EPSG:3857 planar world、Viewer、PC
controller、显式 skybox 和 OSM imagery 组装方式。EPSG:3857 只是案例配置，不进入 provider
validation。

案例可以选择满足边界采样契约的公开 terrain source。当前优先使用 generic URL template 的
LERC 配置加载公开 tiled elevation 数据；服务 URL、format、sample dimensions、height range、
maximum level 和 Credit 全部由案例显式提供。若最终人工核对发现候选服务的 tile topology、CORS、
授权或访问政策不合适，则保留同一 provider，改用仓库内确定性 XYZ fixture 完成 hard gate，并把
公网案例标为 best-effort 或延期，不能为了展示效果放宽产品契约。

公开案例必须显示 terrain 与 imagery Credit，`sandcastle.yaml` 写明服务、政策、CORS/可用性和
best-effort 边界，只请求当前交互视图需要的 tile，不做批量预取或离线下载。自动化测试不得访问
公网。

## 不采用的方案

### ArcGIS/EPSG:3857 专用公共 provider

不采用。ArcGIS metadata、Tilemap 和 EPSG:3857 是具体服务能力，不是 XYZ Heightmap 的必要条件。
将其放进首个公共 provider 会混淆数据适配与 coordinate-system ownership。未来需要 sparse
ArcGIS 服务发现时，可以增加并列的专用 provider。

### Provider 自动判断或重投影 CRS

拒绝。`SceneGISPlanarCoordinateSystem.crs` 是 opaque metadata；当前没有 projection engine。
Provider 只能信任 caller-supplied canonical tiling scheme。

### 把任意 256×256 DEM raster 自动当作边界网格

拒绝。XYZ address 与 image dimensions 不能证明 sample placement。隐式半像元平移会破坏 tile
extent、查询和边界连续性。

### 首版开放任意 decoder callback

暂不采用。任意 callback 会立即固定 payload ownership、sync/async、cancel、worker transfer 和
error boundary 的长期公共协议。T5 先支持已知的 image structure 与 LERC Heightmap；其他格式通过
现有 provider interface 独立实现，等出现第二个真实共性后再抽象。

### 在 T5 引入 Worker 或 renderer 修改

拒绝。T3 已接受主线程 mesh，现有 `lerc` 可在 Core 路径解码；Worker、Shader、lighting 和 terrain
appearance 留到有 profiling/画面证据的 T6 或后续阶段。

## 兼容性、所有权与升级

T5 应只修改 `packages/engine/Source/SceneGIS/**`、对应 SceneGIS Specs、
`packages/sandcastle/gallery/scenegis-planar-terrain/**`、Documentation 和 AgentDocs。预计
upstream-owned files=`0`、T5 SGP=`0`，不修改 `.scenegis/upstream-patches.json`、SGP-0001 或
SGP-0002。

Public provider 必须进入 engine/Cesium root exports、types 和 API docs。不得手工提交生成文件。
若实际实现证明必须修改 upstream build、Resource、Sandcastle generator 或其他 upstream-owned
file，Execution 必须停止并交回 Architecture Agent 创建/批准 SGP，不能自行扩大范围。

每次 Cesium 升级复核 `Resource.fetchImage/fetchArrayBuffer` 的 scheduling/cancel 语义、
`getImagePixels` 的 row order/ImageBitmap 行为、`lerc` dependency/API、JSDoc generation，以及
`SceneGISPlanarHeightmapTerrainData.Structure` 的解码兼容性。
