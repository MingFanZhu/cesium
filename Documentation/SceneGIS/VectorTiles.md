# Vector Tiles

## 当前交付范围

V1 提供独立的 MVT 数据、坐标、URL source 与 Style v8 子集计算前端。
V2 在此基础上提供无 terrainProvider 的平面批量 renderer；不依赖 Cesium experimental MVT。
`Test/vector-tiles/index.html` 的实际 flat 画面已于 2026-09-13 通过项目负责人验收。
V3A 增加缓存瓦片的逐区域替换，自动化与项目负责人加载过渡画面验收均已通过。
V3B0 将资源与命令迁入自有地图图元，保持已验收样式范围；
不再依赖原生 Primitive/Appearance/BatchTable，通用 Renderer 与拾取派生继续复用。
V3B1 增加自有 stroke、虚线数值表、fill fringe 与 circle blur；代码和自动验证已完成，
新增样式图集已于 2026-09-13 通过项目负责人视觉验收。
V3C0 新增 [公开地图 Test 页面](../../Test/vector-tiles/public.html)，以真实数据建立样式与性能基线；
现有 runtime/API 没有变化。按负责人选择，采用 MapLibre 示例使用的 OpenFreeMap / Bright，
接入 93/119 层，另保留 Liberty 82/111 层对照；Streets v12 仅保留离线样式参考。
未支持层及来源见 [参考说明](../../Test/vector-tiles/reference/README.md)。
Bright 在线俯视/倾斜/16 级数据已 smoke，无需 token，公开页已于 2026-09-13 通过负责人验收。
V5A 增加独立平面点标注与 [本地点标注图集](../../Test/vector-tiles/symbols.html)，
当时 Bright 接入 108/119 层，Liberty 97/111 层，各新增 15 个 point symbol layers。
V5B 继续接入各 10 个沿线名称、路牌与箭头层：当前 Bright 118/119、Liberty 107/111。
新增 [沿线标注图集](../../Test/vector-tiles/line-symbols.html)；语义和限制见 [标注文档](VectorTileSymbols.md)。
V4A 已实现平面直接贴地、terrain anchors 和公开页地形开关，技术资格见下文；
负责人视觉 gate 待验收。Globe 和完整连续曲面字形仍未支持。
整体边界见 [ADR-0057](Decisions/ADR-0057-independent-vector-tiles-runtime.md)，
公共契约见 [ADR-0058](Decisions/ADR-0058-vector-tile-frontend-contract.md)。
渲染与调度契约见 [ADR-0059](Decisions/ADR-0059-planar-vector-tile-batch-renderer.md)。
Resident coverage 见 [ADR-0060](Decisions/ADR-0060-vector-tile-resident-render-cover.md)。
自有图元边界见 [ADR-0061](Decisions/ADR-0061-owned-vector-tile-primitives.md)。
基础样式与覆盖协议见 [ADR-0062](Decisions/ADR-0062-vector-stroke-and-coverage.md)。

## 数据与坐标

`SceneGISVectorTile.decode(buffer)` 接受解压后的 ArrayBuffer 或 Uint8Array。
返回 `{layers}`，每层有 name/version/extent/features；每个 feature 有 id/type/properties/geometry。
ID 为十进制 string，缺失时为 undefined；安全整数属性用 number，超出安全范围用 bigint。
原始属性保留类型，不能直接假设包含 bigint 的数据可 JSON.stringify。

`geometry.parts` 是 Float64Array 数组，每个数组按 XY 交错保存 tile-local 坐标。
Point 的单个 part 可含多个点；line 每个 part 一条线；polygon 每个 part 一个 ring，
`polygonStarts` 标出 exterior ring 的索引，其后的 rings 直到下一个 exterior 属于同一 polygon。
Ring 不重复末端。解码保留 buffer 坐标，不把它们裁到 `[0,extent]`。

```js
const data = Cesium.SceneGISVectorTile.decode(bytes);
const layer = data.layers[0];
const transform = new Cesium.SceneGISVectorTileCoordinates({
  tilingScheme: world.tilingScheme,
  x: 0,
  y: 0,
  level: 0,
  extent: layer.extent,
});
const position = transform.toWorld(100, 200, 0);
const localPosition = transform.toLocal(100, 200, 0);
// localPosition is relative to the immutable transform.origin.
```

数据必须与传入的单根 tiling scheme/World extent 匹配。MVT 自身无 CRS，
给数据改 CRS 标签不构成重投影。Y 翻转在映射中只做一次。
Origin 和完整 World 坐标保留 double，不直接把完整 3857 坐标降为 Float32。
Height 是明确的绝对 Z，以上转换不采样 terrain。

## URL source 与失败语义

```js
const source = new Cesium.SceneGISVectorTileSource({
  url: "/tiles/{z}/{x}/{y}.mvt",
  tilingScheme: world.tilingScheme,
  minimumLevel: 0,
  maximumLevel: 14,
  scheme: "xyz",
  credit: "Local vector data",
});
const pending = source.requestTile(0, 0, 0);
if (pending !== undefined) {
  const data = await pending;
}
```

构造不发请求；URL 可为 string 或 Resource，Resource 配置被克隆。
TMS 只改变 URL row，不改变 geometry。调用方拥有 Request、取消与缓存；
本对象不拥有 World/GPU，也不提供 destroy。默认 decoded 请求使用模块共享的 lazy 双 Worker 池，
与页面同生命周期；构造不启动 Worker。`requestTile(x, y, level, request, false)` 返回 raw ArrayBuffer，
供 Layer 使用其 owned Worker 池准备；自定义 source 覆盖方法应透传第五个参数，
继续返回 decoded Data 的已有覆盖也可消费，但需要 structured clone，不能 detach 调用方数据。

| 结果                    | 意义                                          |
| ----------------------- | --------------------------------------------- |
| 同步 undefined          | Cesium scheduler 尚未发出请求                 |
| Promise 成功，空 layers | 204/兑现的空响应或合法空 tile                 |
| Promise rejected        | HTTP/网络/取消或畸形 MVT；不自动转换为空 tile |
| 同步 DeveloperError     | 配置、地址或可用 level 无效                   |

不新增自动 retry；显式 Resource 的 headers/proxy/retry 配置继续遵循 Resource 语义。
当前只接收 URL template；TileJSON、托管服务、不同 matrix 重映射均未支持。

## 样式 profile

`SceneGISVectorTileStyle` 使用固定的独立 `@maplibre/maplibre-gl-style-spec 24.8.1`，
profile 为 `scenegis-vector-v1`，构造复制输入 JSON，预检失败带路径抛 DeveloperError。
`validate(style)` 返回诊断字符串数组；编译成功后不会因调用者修改原 JSON 而变化。

| 范围         | V1 计算能力                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Root/source  | version/name/metadata/sources/layers/glyphs/sprite；vector tiles/minzoom/maxzoom/scheme/attribution                                       |
| Layers       | background、fill、line、circle、point/line symbol；source-layer、顺序、filter、min/maxzoom、visibility                                    |
| Paint/layout | 颜色/opacity、基础 fill outline/antialias、line width/gap/offset/blur/dash/cap/join、circle radius/stroke/blur                            |
| Expressions  | 经 profile 允许并测试的属性、分支、类型、算术与 zoom 表达式；完整清单见 ADR-0058                                                          |
| 未支持       | 复杂 shaping/variable anchor、extrusion、pattern、feature-state/global-state、geometry-dependent filter、旧 style function、imports/slots |

这些是前端求值能力；当前 V3B1 实际渲染语义与限制见下节。
`version:8` 不代表支持任意 Mapbox/MapLibre 样式。

```js
const style = new Cesium.SceneGISVectorTileStyle(styleJson);
const errors = Cesium.SceneGISVectorTileStyle.validate(styleJson);
const evaluated = style.evaluateLayer("roads", feature, 8.5);
const widthKind = style.getPropertyKind("roads", "paint", "line-width");
// Colors in evaluated.paint are unpremultiplied Cesium.Color objects.
```

ID 与超安全整数属性在样式中使用十进制 string，原始属性不被改写。
显式 to-number 选择浮点转换；需要精确匹配大整数时使用 string。
合法表达式的缺失值/运行时类型错误采用依赖库的规范默认行为。
Paint 与 symbol 的 text-size/icon-size 使用 fractional zoom，其余 layout/filter 使用 floor zoom；minzoom 包含、maxzoom 不包含。
`constant/source/camera/composite` 分类供后续 renderer 确定失效范围。

Style zoom 与 source level 独立。`computeStyleZoom(rootWidth, metersPerPixel, tileSize=512)`
使用参考平面的 meters per CSS pixel；DPR 转换和相机参考点由 renderer 统一处理。
参考点是视轴与 Z=0 的前向交点；相同 orbit range 倾斜保持 style zoom。
瓦片选层复用平面影像/地形的 SSE 计算，按逐 tile 误差选择近细远粗的 mixed leaves，
达到数量预算时保留对应父 tile，不降低全视图层级。策略和边界见
[ADR-0064](Decisions/ADR-0064-vector-perspective-lod.md)。

MVT 选层还消费 `world.maximumTiltedTileDistance`，和地表共享低角度细节距离规则。
默认 Infinity；公开页设置为 100000 米。仅低于 20° 的透视视图启用，远处保留粗 tile；
俯视拉远与正交保持原选层，style zoom 和相机可见范围不变。它不解除当前 MVT 的 flat-only
限制，也不改变 source minimumLevel / maximumVisibleTiles。见
[ADR-0066](Decisions/ADR-0066-planar-tilted-tile-distance.md)。

## 异步准备与上传预算

V3C1B 将 MVT decode、style/filter、面三角化、线网格、geometry combine/high-low encode 与
整数 zoom symbol anchors 移到 Layer 自有的两个 lazy Workers。Glyph decode/atlas packing 与
normalized text/icon shaping 使用同一池；当前相机投影、沿线方向、碰撞、pick IDs 和 GPU 留在主线程。

最多两块 tile 处于准备或待上传状态；原始 payload 保留在 `tileCacheSize` 控制的缓存中，
独立副本 transfer 给 Worker。Worker 复用编译后的 style，几何或整数 layout 失效时重新解码；
目前没有 Worker 内 decoded tile cache，也没有总驻留内存字节硬上限。

`maximumUploadTimePerFrame` 默认 4 毫秒，`maximumUploadBytesPerFrame` 默认 4194304 字节，
均为构造选项。每帧按 Uint16 geometry batch 粒度限制 GPU 提交，单个不可分割 batch 可超过软预算；
`maximumUploadsPerFrame` 继续限制每帧整块 tile 的发布数。新 tile 全部上传后才切换 cover，
过程保留旧批次；隐藏、淘汰、destroy 丢弃过时结果并释放已上传的临时资源。
Worker 入口/通信失败和任务错误显式上报，没有主线程回退或自动重试。

`statistics` 增加 `preparationTasks`、`workerTasks`、`workerMs`、`decodedFeatures` 和 `decodeMs`。
后两项分别为首次有效解码的累计 feature 数与 Worker 内累计解码耗时；Worker 耗时之和不是页面阻塞时间。
部署继续配置 Cesium 的 `CESIUM_BASE_URL`，并保留构建产物的 Workers 和 chunk 目录；
详细边界见 [ADR-0067](Decisions/ADR-0067-vector-worker-preparation.md)。

## 验证与维护

目前 156 项 focused Specs 覆盖前端、几何/cover、真实 Scene 样式、DPR、多视锥、symbol、ground 与 GPU 资源。
另有 11 项页面 E2E，实际检查城市颜色、拾取、requestRenderMode、倾斜、显隐、
重建、延迟替换、样式图集、公开地图、中英文点标注与曲线/路牌/箭头。
完整 build/build-ts/tsc/release、独立 engine 安装后的五个入口与四份固定 Shader 已验证。
V5A 新增的两份 symbol Shader 和类型/资源协议见 [标注文档](VectorTileSymbols.md)；
V5B 复用同一 vertex protocol 和 Shader，没有新增公共入口或上游改动。
V2 的低密度数据 baseline 见 [V2 review](../../AgentDocs/vector-tiles/reviews/2026-09-13-v2-flat-review.md)，
V3A 对比、边界与剩余 gate 见 [V3A review](../../AgentDocs/vector-tiles/reviews/2026-09-13-v3a-cover-review.md)。
V3B0 迁移与资源验证见 [V3B0 review](../../AgentDocs/vector-tiles/reviews/2026-09-13-v3b0-owned-primitives-review.md)。
V3B1 样式资格与视觉 gate 见 [V3B1 review](../../AgentDocs/vector-tiles/reviews/2026-09-13-v3b1-style-primitives-review.md)。

依赖与第三方名录的最小 upstream-owned 改动登记 `SGP-0011`。
仓库不跟踪 lockfile；顶层样式依赖固定版本，间接依赖按既有 npm 策略解析。
每阶段都保留独立 review/checkpoint，阶段状态见
[extension plan](../../AgentDocs/vector-tiles/plans/2026-09-12-vector-tiles-extension.md)。

## 平面图层

### 真实地形

`world.terrainProvider` 有值时，Layer 自动使用直接 ground 后端；设回 `undefined` 恢复 flat。
共享 source 缓存、MVT/style/Worker 和瓦片调度，切换只重建 GPU 批次与 placement。
不同 terrainProvider 之间切换复用 ground 几何；地形 LOD 改变不重新三角化道路或面。

ground 要求 WebGL2、float textures 与 depth textures。Worker 把已有 fill/line 三角化
打包成数值表，GPU 使用批量垂直三角凸体，从地表深度重建真实位置并恢复 coverage。
孔洞、线型、颜色、透明度与逐要素拾取沿用既有语义；不先渲染地图颜色纹理，不通过抬高 Z
避免冲突。`pickPosition` 返回地形位置。开启 `world.enableLighting` 时，地图颜色采用
地表深度法线的环境光加漫反射，关闭时保持原 style 颜色；不是高级材质/阴影集成资格。

可见性使用 provider 声明的全局高度包络；实际栅格化凸体在命令执行时根据当前已发布
terrain cover 收紧，含零高程等待地表及 skirts。只改高度 uniform，不重建 geometry。
圆点与文字使用独立 terrain anchor，详见 [地形标注](VectorTileSymbols.md#地形标注)。

`Test/vector-tiles/public.html` 提供“真实地形 · 矢量贴地”开关，以及紫金山、因斯布鲁克定位。
地形使用既有示例的 Esri WorldElevation3D LERC 服务；失败显示提示，关闭恢复零高程。
不限定用户相机的 pitch；style 比例仍沿用视轴与 Z=0 参考面的契约，视轴完全不再朝向参考面
时不显示地图，此既有比例限制尚需后续三维比例契约解决。Globe 仍属 G1，不能由平面结果推断。

契约与取舍见 [ADR-0069](Decisions/ADR-0069-planar-vector-ground-rendering.md)。

### 配置与样式

`scene` 必须已创建 `SceneGISPlanarWorld`，数据与其 canonical tilingScheme 对齐。
实际平面示例见 [Test/vector-tiles](../../Test/vector-tiles/README.md)。

```js
const layer = scene.primitives.add(
  new Cesium.SceneGISVectorTileLayer({
    scene,
    style: styleJson,
    tileCacheSize: 64,
    maximumVisibleTiles: 32,
    maximumRequests: 8,
    maximumUploadsPerFrame: 2,
  }),
);
layer.errorEvent.addEventListener(({ source, tile, error }) => {
  console.error(source, tile, error);
});
// Scene owns the layer; removal destroys its batches and cancels requests.
scene.primitives.remove(layer);
```

构造时配置固定；替换 style/source 时销毁旧图层并创建新图层。
可传 `sources: { sourceId: source }` 借用 caller-owned source；否则从 style 的单 URL 创建。
`show` 控制显隐；`ready` 表示已完成一次正常更新，`tilesLoaded` 表示当前 cover 无待处理工作，
失败会通过 errorEvent 报告，也计入 `statistics.failedTiles`。

| 渲染范围        | V3B1 行为                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| background/fill | color、opacity、polygon holes/multipolygon；显式一像素 outline；边界 fringe 与 fill-antialias=false          |
| line            | color/opacity/width、butt/square/round cap、miter/bevel/round join、miter/round limits、gap/offset/blur/dash |
| circle          | 屏幕圆形、CSS radius/stroke、color/opacity/blur；DPR 感知 AA                                                 |
| style           | 属性/zoom 表达式、filter、visibility、min/maxzoom；全 tile 的 style layer 顺序优先                           |
| pick            | primitive 为图层；id 含 source/sourceLayer/styleLayer/tile/featureIndex/featureId/properties                 |
| 明确拒绝        | profile 之外的属性和类型，包括 pattern、gradient、extrusion、heatmap、raster；symbol 支持见专门文档          |

Line width/gap/offset 从参考平面的 CSS pixel 换算为米，再参与投影；
俯视缩放保持参考宽度，倾斜时随地图透视变化。正 offset 向线方向右侧移动。
Circle 保持屏幕对齐与 CSS 尺寸。Fill AA 关闭时仅绘制 interior，显式 outline 也遵循该开关。
内建 coverage 在关闭 MSAA/FXAA 的 Context 下验证，Map color 始终直接矢量绘制。

Dash 数组交替为 dash/gap，以当前 line-width 为单位；允许零长 dash 的圆点，
周期必须为正。不同数组在同一 batch 共享数值 Texture，不是地图颜色纹理。
相位从每个 decoded part 起点累计；不保证跨瓦片/LOD 接续，
不实现 MapLibre floorwidth/crossfade 的逐像素过渡。拐角附近的 dash 随 stroke 网格变形，
不承诺圆点在所有转折处都是独立正圆；自相交也不执行几何 union。

每 tile/style layer/kind 合批；共享边使用半开平面覆盖，buffer 几何不会在邻接瓦片重复合成。
自有图元持有 GPU buffers/VA/Shader 和必要的 dash Texture，按 feature 顶点属性保存颜色和 pick color。
同一 region DrawCommand 设置 pickId，由 Cesium 自动派生拾取命令；颜色与拾取共享裁剪。
线条由自有连续 strip 与 coverage Shader 实现，不再依赖 PolylineGeometry/PolylineCommon。
瓦片原点与高低位坐标保留大坐标精度；裁剪射线在 eye space 求方向，避免平移后做差丢失有效位。
普通前景对象在平面地图之后绘制，surface 保留自己的真实深度；无 provider 时为 Z=0。
多视锥通过参考平面交点的 canonical depth 区间排除重复颜色贡献，保持透明度与前景层序。

Desired tiles 使用单级 view cover，按预算 coarsen；超出 source maximumLevel 时复用该级几何。
V3A 在 desired tile 就绪前，借用缓存中已发布的最近 ancestor；没有 ancestor 时保留不重叠的 descendants。
Ancestor 只绘制尚未被 exact tile 替换的区域，每块就绪后在正常帧独立替换，颜色和拾取使用同一覆盖。
合法空 tile 会清除对应替代区域；失败不会冒充空内容，仍通过 errorEvent/failedTiles 报告。
Pick 中的 tile 始终指实际源瓦片，替换时可能从父级切到子级。

只复用 resident 数据，不主动请求祖先链；首图或未缓存区域仍可能等待数据。
tileCacheSize 是硬上限，desired 优先，剩余容量才保留替代瓦片；容量不足时允许失去旧覆盖。
不做父子 fade，也不消除不同层级数据量化、拓扑或属性变化带来的几何跳变。
瓦片数、并发请求与每帧上传有界；目前没有任意 payload 的 byte budget。
Warm frames 和 pick/depth 不重复上传；zoom-dependent paint 的重建受上传预算约束。

`statistics` 中各覆盖计数均跨 source 累加；空 tile 也可发布有效空覆盖。

| 字段          | 意义                                          |
| ------------- | --------------------------------------------- |
| visibleTiles  | 当前 desired tile 数，不表示已加载            |
| residentTiles | 缓存条目数，包含 pending 与历史数据           |
| renderedTiles | 实际覆盖引用的独立源瓦片数                    |
| fallbackTiles | renderedTiles 中替代 desired 的源瓦片数       |
| renderRegions | 实际不重叠的覆盖区域数                        |
| drawCommands  | 实际提交的 region 绘制命令数，包含 background |

共享 GPU buffer 不等于一条 command；同一 ancestor 可借给多个裁剪区域。
隐藏或无法计算平面比例时清空 desired/render coverage 并取消 pending；缓存内容保留以供恢复。
