# Vector Tiles

## 当前交付范围

V1 提供独立的 MVT 数据、坐标、URL source 与 Style v8 子集计算前端。
它不依赖 Cesium experimental MVT，也尚不包含地图 renderer、贴地或标注。
V2 将建立 `Test/vector-tiles/` flat 场景并验证直接贴地的批量可行性。
整体边界见 [ADR-0057](Decisions/ADR-0057-independent-vector-tiles-runtime.md)，
公共契约见 [ADR-0058](Decisions/ADR-0058-vector-tile-frontend-contract.md)。

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
本对象不拥有 World/GPU，也不提供 destroy。

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

| 范围         | V1 计算能力                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Root/source  | version/name/metadata/sources/layers；vector tiles/minzoom/maxzoom/scheme/attribution                                            |
| Layers       | background、fill、line、circle；source-layer、顺序、filter、min/maxzoom、visibility                                              |
| Paint/layout | 颜色/opacity、基础 fill outline/antialias、line width/gap/offset/blur/dash/cap/join、circle radius/stroke/blur                   |
| Expressions  | 经 profile 允许并测试的属性、分支、类型、算术与 zoom 表达式；完整清单见 ADR-0058                                                 |
| 未支持       | symbol/glyph/sprite、extrusion、pattern、feature-state/global-state、geometry-dependent filter、旧 style function、imports/slots |

这些是前端求值能力；实际线型、抗锯齿、alpha、层序和 pick 还需 renderer 逐项资格。
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
Paint 使用 fractional zoom，layout/filter 使用 floor zoom；minzoom 包含、maxzoom 不包含。
`constant/source/camera/composite` 分类供后续 renderer 确定失效范围。

Style zoom 与 source level 独立。`computeStyleZoom(rootWidth, metersPerPixel, tileSize=512)`
使用参考平面的 meters per CSS pixel；DPR 转换和相机参考点由 renderer 统一处理。

## 验证与维护

Core 的 35 项 focused Specs 覆盖合法/畸形 MVT、无损 ID/属性、多部件/孔洞/buffer、
坐标、请求状态和样式行为。完整 build/build-ts/tsc/release 及独立安装 engine tarball 的
runtime/types 消费已验证。前端检查不代表贴地图像或地图性能资格。

依赖与第三方名录的最小 upstream-owned 改动登记 `SGP-0011`。
仓库不跟踪 lockfile；顶层样式依赖固定版本，间接依赖按既有 npm 策略解析。
每阶段都保留独立 review/checkpoint，阶段状态见
[extension plan](../../AgentDocs/vector-tiles/plans/2026-09-12-vector-tiles-extension.md)。
