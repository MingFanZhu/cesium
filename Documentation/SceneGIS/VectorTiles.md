# Vector Tiles

程序员上手入口：[简单示例目录](../../Test/vector-tiles/examples/示例目录.html)。
平面和球面各有独立的公开 Bright 示例及完整初始化 JavaScript；
不含高级环境和调试面板，阅读顺序及数据替换方法见 [上手说明](../../Test/vector-tiles/examples/README.md)。

## 当前交付范围

2026-09-17 四类样式增强已实现，覆盖 Planar/Globe；本轮技术资格与人工 gate 见
[增强计划](../../AgentDocs/vector-tiles/plans/2026-09-17-style-enhancements-extension.md)。

| 类别     | 支持内容                                                 | 契约与限制                                                                           |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 重复纹理 | background/fill/line/fill-extrusion pattern              | 共享 sprite；不含跨整数 zoom crossfade 或跨 tile 道路纹理相位拼接                    |
| 动态状态 | paint feature-state/global-state、五个 Layer 状态 API    | 只重建受影响的几何批次；标注 paint 复用排版；不支持状态 layout/filter                |
| 自动换位 | text-variable-anchor、text-radial-offset                 | 点标注，Worker 候选与稳定碰撞选择；沿线换位未接入                                    |
| 适配牌面 | icon-text-fit、padding、sprite content/stretchX/stretchY | 普通 RGBA、多段伸缩、与可变 anchor 配对；不含 SDF icon、textFitWidth/Height 比例规则 |

四项本地入口：[平面样式增强](../../Test/vector-tiles/平面样式增强.html)、
[球面样式增强](../../Test/vector-tiles/球面样式增强.html)。图文设置见 [标注](VectorTileSymbols.md)。
下列阶段条目保留历史交付范围，不代表当前支持数量。

V1 提供独立的 MVT 数据、坐标、URL source 与 Style v8 子集计算前端。
V2 在此基础上提供无 terrainProvider 的平面批量 renderer；不依赖 Cesium experimental MVT。
`Test/vector-tiles/planar-city.html` 的实际 flat 画面已于 2026-09-13 通过项目负责人验收。
V3A 增加缓存瓦片的逐区域替换，自动化与项目负责人加载过渡画面验收均已通过。
V3B0 将资源与命令迁入自有地图图元，保持已验收样式范围；
不再依赖原生 Primitive/Appearance/BatchTable，通用 Renderer 与拾取派生继续复用。
V3B1 增加自有 stroke、虚线数值表、fill fringe 与 circle blur；代码和自动验证已完成，
新增样式图集已于 2026-09-13 通过项目负责人视觉验收。
V3C0 新增 [公开地图 Test 页面](../../Test/vector-tiles/planar-map.html)，以真实数据建立样式与性能基线；
现有 runtime/API 没有变化。按负责人选择，采用 MapLibre 示例使用的 OpenFreeMap / Bright，
接入 93/119 层，另保留 Liberty 82/111 层对照；Streets v12 仅保留离线样式参考。
未支持层及来源见 [参考说明](../../Test/vector-tiles/reference/README.md)。
Bright 在线俯视/倾斜/16 级数据已 smoke，无需 token，公开页已于 2026-09-13 通过负责人验收。
V5A 增加独立平面点标注与 [本地点标注图集](../../Test/vector-tiles/planar-symbols.html)，
当时 Bright 接入 108/119 层，Liberty 97/111 层，各新增 15 个 point symbol layers。
V5B 继续接入各 10 个沿线名称、路牌与箭头层：当前 Bright 118/119、Liberty 107/111。
新增 [沿线标注图集](../../Test/vector-tiles/planar-line-symbols.html)；语义和限制见 [标注文档](VectorTileSymbols.md)。
V4A 已实现平面直接贴地、terrain anchors 和公开页地形开关，技术资格见下文；
负责人已于 2026-09-14 确认视觉验收。G1 增加 Globe 适配，技术验证与人工页见下文；
G1 负责人于 2026-09-14 确认视觉与性能结果可接受，完整连续曲面字形仍未支持。
整体边界见 [ADR-0057](Decisions/ADR-0057-independent-vector-tiles-runtime.md)，
公共契约见 [ADR-0058](Decisions/ADR-0058-vector-tile-frontend-contract.md)。
渲染与调度契约见 [ADR-0059](Decisions/ADR-0059-planar-vector-tile-batch-renderer.md)。
Resident coverage 见 [ADR-0060](Decisions/ADR-0060-vector-tile-resident-render-cover.md)。
自有图元边界见 [ADR-0061](Decisions/ADR-0061-owned-vector-tile-primitives.md)。
基础样式与覆盖协议见 [ADR-0062](Decisions/ADR-0062-vector-stroke-and-coverage.md)。

## 数据与坐标

### Globe 使用范围

`SceneGISVectorTileLayer` 可加入保留原生 `Globe` 的 WGS84 / SCENE3D 场景。零高程椭球和真实
terrainProvider 使用同一直接贴地后端；Planar 无地形的 flat 快速路径保持独立。
morph/SCENE2D、非 WGS84 不在本阶段范围，构造或 update 会明确拒绝。
透明 Globe 支持当前可见面的独立矢量显示，背面与地下观察尚未资格确认。

```js
const layer = scene.primitives.add(
  new Cesium.SceneGISVectorTileLayer({ scene, style }),
);
```

### 独立透明度

```js
layer.opacity = 0.5;
scene.globe.translucency.enabled = true;
scene.globe.translucency.frontFaceAlpha = 0.3;
scene.globe.translucency.backFaceAlpha = 0;
// An existing imagery layer retains its native, independent alpha.
imageryLayer.alpha = 0.7;
```

三者分别表示矢量要素的透明度、地形与影像合成后的地表颜色透明度、影像在地表颜色中的贡献。
地表颜色完全透明仍保留贴地所需深度，矢量可以正常显示和拾取。
矢量 `opacity` 可在构造时设置，默认 1，仅接受有限 `[0,1]`；0 跳过绘制/拾取但保留数据。
它乘每个 background/fill/line/circle/text/icon 的 style alpha，以及 fill-extrusion-opacity，不先合成地图纹理，
因此重叠要素的结果与整幅地图 group opacity 不同。修改无需重新解析或上传几何。

[球面测试页](../../Test/vector-tiles/globe-map.html) 提供三个滑块和本地网格影像；
平面页同样提供三个滑块：`viewer.planarWorld.opacity` 控制地表整体颜色，
`viewer.planarWorld.imageryLayers.get(0).alpha` 控制影像贡献，Layer.opacity 控制矢量。
World.opacity 默认 1，接受有限 0..1，在下次正常 render 发布；requestRenderMode 下设置后调用 scene.requestRender()。
透明模式要求 WebGL 2。地表为零仍保留深度和矢量贴地，不显示地下内容或后面的山坡。
仅保存绘制地表前的背景快照，矢量始终直接绘制。详见 [ADR-0073](Decisions/ADR-0073-planar-surface-opacity.md)。
本次透明资格限当前可见地表及其上方普通三维对象；地下/背面、穿越透明地表的对象排序，
以及透明地表配合高级环境的深度合成留待后续验证。详见 [ADR-0072](Decisions/ADR-0072-vector-surface-transparency.md)。

### Globe matrix

省略 `tilingScheme` 时 Globe 自动创建 EPSG:3857 / ±π×6378137 米的单根 source matrix。
显式 source override 必须与传入的 `tilingScheme` 共享 identity；不能传 Globe 的 geographic
terrain scheme。MVT 数值和 style/layout 不重投影；渲染 adapter 映射到 ECEF。矢量 cover 独立使用
地理包围体、horizon、三维 SSE 与现有 tile budget，保留近细远粗与 resident parent coverage。
Style zoom 以视轴椭球交点和当地 Mercator 比例计算；越过地平线时采用前向最近点，不限制相机俯角。

面和线读取 native Globe depth，按独立 Worker 准备的数值几何做覆盖、透明混合和拾取，
不合成地图颜色纹理。真实地形的圆点和文字使用 Worker 构建的已渲染 mesh BVH 查询高度，
地形 LOD/provider 变化保留地图几何与 glyph atlas；待索引就绪前的锚点受真实地表遮挡。
G1 不承诺完整环境材质融合；V4B 的环境资格见下文。陡坡大字形连续曲面贴合和稳定 60 FPS 仍未承诺。

[Globe 离线入口](../../Test/vector-tiles/globe-map.html) 默认使用本地构造 MVT / Bright 样式，
可切换公共 Bright/Liberty 与 Esri 高程。范围与数值协议见 [ADR-0070](Decisions/ADR-0070-globe-vector-ground-rendering.md)。

### 原始瓦片坐标

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

### 建筑拉伸

`fill-extrusion` 在平面和球面均生成真实屋顶和侧墙，支持孔洞、多 polygon 和逐要素拾取。
下面的高度字段采用 OpenMapTiles schema；其他数据源应替换为自己的字段。

```js
{
  id: "buildings",
  type: "fill-extrusion",
  source: "openmaptiles",
  "source-layer": "building",
  minzoom: 14,
  filter: ["!=", ["get", "hide_3d"], true],
  paint: {
    "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
    "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
    "fill-extrusion-color": "#ded6ca",
    "fill-extrusion-opacity": 1,
    "fill-extrusion-vertical-gradient": true,
  },
}
```

height/base 表示相对地形的顶高/底高，单位米，并非顶高加底高；height<=base 时不绘制体积。
无地形以 Z=0 或椭球为基准。有地形时每个 polygon 以外环顶点均值位置查询驻留地形，
屋顶统一抬升；base=0 的底边向下延伸到各顶点较低的地形，正 base 则保留统一底高。
地形更新只改变位置流，不额外请求地形或重新三角化；首次 Planar flat/ground 模式切换仍沿用既有批次重建。
Globe 的建筑求高程与 ECEF 编码异步交给 vector Worker，只在相交地形变化时重算。
等待期间保留上一份位置，完整结果在 normal render 按上传预算发布；待更新的可见建筑参与 `tilesLoaded`。

color 的 alpha 按 Style 语义忽略；透明度使用 fill-extrusion-opacity × Layer.opacity。
建筑使用普通三维深度和 Cesium OIT，不再按二维底图的层顺序覆盖其他物体。
默认使用 Scene 光向与侧墙垂直渐变；已有高级环境可提供矢量材质光照。尚不提供建筑投射阴影、
style light、translate、transition 或复杂屋顶，不承诺 MapLibre 像素一致。Pattern 支持见下节。
跨瓦片建筑当前不做语义拼接，因此起伏地形上的分片 anchor 可能产生接缝；大跨度结构与复杂透明交叠仍有边界。
详见 [ADR-0074](Decisions/ADR-0074-vector-fill-extrusion.md)。

### 重复纹理

`background-pattern`、`fill-pattern`、`line-pattern` 和 `fill-extrusion-pattern` 从 style.sprite 的普通 RGBA 子图取材质。
名称可为字符串或既有 get/match/step 等表达式；图片逻辑尺寸为元数据尺寸 / pixelRatio。
纹理替代基础 color，alpha 乘样式 opacity 与 Layer.opacity；透明像素不可拾取。
同一 Layer 的图案和 symbol 共用 sprite，请求一次，纹理由同一 owner 释放；图案不同的要素仍合批。

面和背景按 source matrix 连续重复，线沿每个 decoded part 累计距离，建筑屋顶使用 XY、墙面使用沿墙距离/高度。
图案使用连续 style zoom 下的参考平面米/像素，倾斜时随地图透视；不是把屏幕颜色先绘入地图纹理。
本轮不含 image/available-images、动态图像注册、整数 zoom crossfade、跨瓦片道路全局里程、复杂建筑纹理展开和各向异性 mipmap。
细密图案在远景可能产生走样，不承诺与 MapLibre 像素一致。详见 [ADR-0075](Decisions/ADR-0075-vector-pattern-materials.md)。

本地入口：[平面样式增强](../../Test/vector-tiles/平面样式增强.html)、[球面样式增强](../../Test/vector-tiles/球面样式增强.html)。

### 动态要素状态

```js
const target = {
  source: picked.id.source,
  sourceLayer: picked.id.sourceLayer,
  id: picked.id.featureId,
};
layer.setFeatureState(target, { selected: true });
layer.getFeatureState(target);
layer.removeFeatureState(target, "selected"); // Omit key to remove all state for this feature.
layer.setGlobalStateProperty("themeColor", "#ffcc33");
layer.getGlobalState();
layer.setGlobalStateProperty("themeColor", null); // Delete the global property.
```

Paint 可使用 `feature-state` 和 `global-state`，例如
`["case", ["boolean", ["feature-state", "selected"], false], "red", "blue"]`。
状态按 Layer 隔离；同 source/sourceLayer/id 的要素共享状态并跨瓦片驻留保留。
ID 接受 string 或安全整数，不为无 ID 要素自动生成身份。set 合并属性，get 返回副本；只接受有限 JSON 数据。
状态默认空，由表达式提供默认值。本轮不支持 layout/filter 中的状态表达式或 style root state defaults。

修改不重新请求 MVT，只重建含相关 ID、依赖相关 key 的几何批次，保留无关图层与旧可见结果直到预算发布。
标注 paint 更新复用字形与 GPU buffers，不重新 shaping。首轮几何仍由 Worker 重建受影响批次，
不是 MapLibre 的逐要素 paint buffer 局部更新；持续高频、大规模状态变化仍有成本。
编译 Style 可被多个 Layer 共享；独立计算用 `style.evaluateLayer(id, feature, zoom, { featureState, globalState })`。
详见 [ADR-0076](Decisions/ADR-0076-vector-style-state.md)。

### 支持矩阵

`SceneGISVectorTileStyle` 使用固定的独立 `@maplibre/maplibre-gl-style-spec 24.8.1`，
profile 为 `scenegis-vector-v1`，构造复制输入 JSON，预检失败带路径抛 DeveloperError。
`validate(style)` 返回诊断字符串数组；编译成功后不会因调用者修改原 JSON 而变化。

| 范围         | V1 计算能力                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Root/source  | version/name/metadata/sources/layers/glyphs/sprite；vector tiles/minzoom/maxzoom/scheme/attribution                    |
| Layers       | background、fill、fill-extrusion、line、circle、point/line symbol；source-layer、顺序、filter、min/maxzoom、visibility |
| Paint/layout | 颜色/opacity、基础 fill outline/antialias、line width/gap/offset/blur/dash/cap/join、circle radius/stroke/blur         |
| Expressions  | 经 profile 允许并测试的属性、分支、类型、算术与 zoom 表达式；完整清单见 ADR-0058                                       |
| 状态         | paint feature-state/global-state、Layer 局部失效、状态 API 和独立求值 context                                          |
| 点标注       | text-variable-anchor、text-radial-offset；Worker 候选排版与稳定碰撞选择                                                |
| 未支持       | 复杂 shaping、geometry-dependent filter、旧 style function、imports/slots                                              |

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
地表深度法线的环境光加漫反射，关闭时保持原 style 颜色；V4B 高级环境 active 时使用下述物理路径。

可见性使用 provider 声明的全局高度包络；实际栅格化凸体在命令执行时根据当前已发布
terrain cover 收紧，含零高程等待地表及 skirts。只改高度 uniform，不重建 geometry。
圆点与文字使用独立 terrain anchor，详见 [地形标注](VectorTileSymbols.md#地形标注)。

`Test/vector-tiles/planar-map.html` 提供“真实地形 · 矢量贴地”开关，以及紫金山、因斯布鲁克定位。
地形使用既有示例的 Esri WorldElevation3D LERC 服务；失败显示提示，关闭恢复零高程。
不限定用户相机的 pitch；style 比例仍沿用视轴与 Z=0 参考面的契约，视轴完全不再朝向参考面
时不显示地图，此既有比例限制尚需后续三维比例契约解决。Globe 的独立 G1 资格见前述 Globe 使用范围。

契约与取舍见 [ADR-0069](Decisions/ADR-0069-planar-vector-ground-rendering.md)。

### 地形明暗、hillshade 与高级环境

Style `type: "hillshade"` 是基于 `raster-dem` 高程源生成的制图晕渲，可以使用固定光向而不改变
三维地形，见 [MapLibre style spec](https://maplibre.org/maplibre-style-spec/layers/#hillshade)。
当前 vector source/style profile 未接入该类型。也存在预计算成矢量面的晕渲：本仓库固定 Streets v12
参考的 `id: "hillshade"` 实际是 `type: "fill"`、`source-layer: "hillshade"`；名称不等于渲染类型。

未启用高级环境时，平面/Globe ground 的山体明暗来自实际地表深度的 geometric normal，与场景光方向做
`0.4 + 0.6 * max(N·L, 0)` 基础光照，作用于地图面线颜色；Globe background 同样处理。
它跟随 `world.enableLighting`，没有复用平面 terrain 的 Worker smooth normals、完整 light color/
intensity、物理 irradiance 或云影数据。文字/图标保持其独立样式显示。公开地形示例用显式
DirectionalLight 做基础观察光照。矢量测试页已移除高级环境控件，相关产品接口仍可由应用自行接入。

原生地表先渲染，矢量借用地表 depth 后在 TERRAIN_CLASSIFICATION 绘制，深度共享只保证贴附与遮挡。
不透明矢量颜色会覆盖地表已经计算的照明和阴影，不能自动继承 native Globe/Planar material lighting。
Vector command 当前明确 `castShadows=false`、`receiveShadows=false`，覆盖凸体也不能作为真实 caster。

V4B 在 caller 注册并启用 `SceneGISEnvironmentEffects` 后，background/fill/line 自动消费匹配
World 的当前物理 Sun/Moon、diffuse sky 和 Beer cloud transmittance。颜色作为 albedo，替换基础
Lambert；flat 使用真实平面位置与 +Z 法线，ground/Globe 使用实际地表 depth 和外向 geometric normal。
复用 geometry、Worker、特征和 pick；不新增地图颜色 RTT、环境 LUT、云影 atlas 或后处理。

Globe 另外借用 `scene.shadowMap`，在 `enabled` 且 `globe.shadows` 允许接收时，用真实地表位置
采样原生定向阴影。使用原生 cascades、terrain bias 与可选 PCF；覆盖凸体始终不作为 caster，
普通 3D 物体继续按自身 ShadowMode 投影。该路径不支持点光/聚光 ShadowMap，也不扩宽 Planar
原生几何阴影资格。云影和几何阴影只衰减 direct，sky 不被重复压暗。

既有 pre-tonemap HDR slot 为最终场景合成 atmosphere/aerial/fog/cloud/rays/bloom，各项按原环境
controller 配置生效。Circle/symbol 保持制图颜色，不作为物理材质，但参与场景合成。
环境未 ready/停用时恢复基础路径；借用资源由环境 controller 独占释放。切换不重建地图图层。
Globe 高级环境要求关闭原生 Globe lighting/ground atmosphere、sky/Sun/Fog/bloom 等冲突项；
Planar 需要先注册 `SceneGISPlanarEnvironment`，使用显式光向或提供明确经纬度原点的 astronomical
mode，完整前提沿用高级环境原契约。应用负责启用时保存、停用时恢复这些原生状态；
可用 Viewer clock 驱动双世界天文光向与云时间，定位变化时同步 Planar 的天文原点。
E1 按负责人要求从矢量测试页移除环境、参数面板和 Timeline/Animation，以及对应页面 E2E；
engine Specs 和独立发布包的环境验证保留，V4B 产品能力与历史验收不变。

本阶段接受不实现 MapLibre hillshade。技术验证、负责人视觉验收与剩余边界见
[V4B review](../../AgentDocs/vector-tiles/reviews/2026-09-14-v4b-environment-review.md)。既有光照约束见
[ADR-0054](Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md) 与
[ADR-0055](Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)，矢量接入见
[ADR-0071](Decisions/ADR-0071-vector-environment-lighting.md)。

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
| fill-extrusion  | 米制 height/base、color/opacity、vertical-gradient；实体屋顶、外墙、孔洞内墙，普通三维深度遮挡               |
| pattern         | background/fill/line/fill-extrusion 的普通 sprite 重复材质，支持名称字符串及返回名称的既有表达式             |
| 明确拒绝        | profile 之外的属性和类型，包括 line-gradient、heatmap、raster；symbol 支持见专门文档                         |

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
