# ADR-0007：平面地形 Core 契约与 Heightmap 兼容表示

## 状态

- Status：`approved`
- Date：`2026-08-07`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-terrain/plans/2026-08-07-phase-t1-terrain-core.md`
- Related patch：无；T1 禁止修改 upstream-owned file

## 上下文与源码事实

`planar-world` 已提供米制 `SceneGISPlanarCoordinateSystem`、单根 northwest-origin XYZ
`SceneGISPlanarTilingScheme`、Z=0 flat surface、imagery、navigation 与 picking。新的
`planar-terrain` 扩展需要先建立不依赖 Scene、Renderer 或 WebGL 的地形数据契约，后续阶段
才能在不破坏公共 API 的前提下增加 geometry、异步 LOD 和采样。

Cesium 1.144 的 `TerrainProvider`、`TerrainData` 和 `HeightmapTerrainData` 可以启发职责
划分，但不能直接作为平面类型使用：

- `TerrainProvider` 和 `TerrainData` 的完整运行时协议面向 ellipsoid surface；
- `HeightmapTerrainData.createMesh`、官方 upsample、terrain Worker、`TerrainMesh` 和
  `TerrainEncoding` 依赖 geodetic `Rectangle`、`Ellipsoid` 与 Globe surface；
- 官方 `TerrainData.interpolateHeight` 使用 longitude/latitude 和 geodetic rectangle；
- 官方 heightmap 的原始 buffer、`structure` 解码、north-to-south row-major 布局、
  `childTileMask` 和单元三角化本身不要求球面，可以作为兼容的数据表示。

如果 Provider 直接返回具体 Heightmap，未来增加 quantized mesh 或其他平面地形数据时将
破坏 Provider 返回类型。反过来，如果首版只接受预先转换的 Float32/Float64 米制数组，
Terrain-RGB、Terrarium 和既有 Cesium heightmap 数据都必须产生额外转换 buffer，不利于
EPSG:3857 等公开数据的验证和复用。

## 决策

### 独立的三个公共 Core 类型

T1 在 `packages/engine/Source/SceneGIS/Core` 增加：

- `SceneGISPlanarTerrainProvider`：不可直接实例化的 provider interface；
- `SceneGISPlanarTerrainData`：不可直接实例化的通用 CPU terrain data interface；
- `SceneGISPlanarHeightmapTerrainData`：首个 concrete terrain data。

三个类型都属于纯 Core，不依赖 Scene、Renderer、Context、Worker 或 DOM，也不继承、包装、
伪装官方 terrain 类型。Provider 返回 `SceneGISPlanarTerrainData`，Heightmap 只是第一种
实现，因此未来新增数据格式不需要改变 Provider 返回契约。

### `SceneGISPlanarTerrainProvider`

Provider 使用以下最小公共契约：

```text
tilingScheme          readonly SceneGISPlanarTilingScheme
minimumHeight         readonly finite number
maximumHeight         readonly finite number
maximumLevel          readonly non-negative integer
errorEvent            readonly structural addEventListener/raiseEvent capability
credit                readonly Credit | undefined
getLevelMaximumGeometricError(level)
requestTileGeometry(x, y, level, request)
getTileDataAvailable(x, y, level)
loadTileDataAvailability(x, y, level)
```

`minimumHeight` 和 `maximumHeight` 是 Provider 全数据集的保守米制范围，必须满足
`minimumHeight <= maximumHeight`。每个返回 TerrainData 的准确高度范围必须位于该全局范围
内。`maximumLevel` 不得超过 `tilingScheme.maximumSafeLevel`。

Provider 构造完成后同步 ready，不增加 `ready` 或 `readyPromise`。需要异步元数据的具体
Provider 应由后续阶段使用异步工厂构造。

`requestTileGeometry` 沿用官方名称，返回
`Promise<SceneGISPlanarTerrainData> | undefined`。`undefined` 只表示 RequestScheduler 当前
没有调度请求；实际网络、服务端或解码错误由 Promise rejection 表达。

`getTileDataAvailable` 返回 `true`、`false` 或 `undefined`，分别表示已知存在、已知不存在和
未知。默认实现返回 `undefined`。`loadTileDataAvailability` 是可选的异步 availability
入口，默认返回 `undefined`。T1 不创建与 cartographic position 耦合的官方
`TileAvailability` 替代品。

首版 Provider 不公开 `minimumLevel`，并且必须能够提供完整世界的 Level 0 `1 × 1` root。
局部数据应选择与覆盖范围匹配的 planar extent，或由数据适配层生成粗层 root。缺少 Level 0
的 sparse world coverage 是后续独立能力，不能在首版中通过盲目遍历空祖先实现。

World 在 T2 接入 Provider 时必须要求 `provider.tilingScheme === world.tilingScheme`。数值相等
或 CRS 字符串相同不能替代 canonical object identity，也不能触发隐式重投影。

### `SceneGISPlanarTerrainData`

TerrainData 是不可变的 CPU value/data object，公共契约包含：

```text
minimumHeight
maximumHeight
credits
waterMask
wasCreatedByUpsampling
interpolateHeight(extent, x, y)
isChildAvailable(thisX, thisY, childX, childY)
```

`minimumHeight` 和 `maximumHeight` 是当前数据解码后的准确米制范围。`credits` 和
`waterMask` 保留官方 terrain data 的可选元数据语义；T1 不解释或渲染 water mask。
`wasCreatedByUpsampling` 为后续真实数据替换提供稳定标识，但 T1 不实现公共 `upsample`
方法。

TerrainData 不拥有请求、GPU 或 Worker 资源，不提供 `destroy`、`createMesh` 或可变 raw
buffer API。消费者只能持有和释放 JavaScript reference；同一个已构造实例可以被 Provider
缓存或共享。T3 的私有 upsample runtime 可以通过 `interpolateHeight` 生成新的 Heightmap，
不复制官方 mesh-dependent upsample 协议。

### `SceneGISPlanarHeightmapTerrainData`

构造参数与 Cesium `HeightmapTerrainData` 的数据表示保持兼容：

```text
buffer
width
height
childTileMask = 15
waterMask
structure
createdByUpsampling = false
credits
```

`buffer` 接受非 BigInt 的 numeric TypedArray。`width` 和 `height` 是至少为 2 的整数。
样本按 north-to-south、west-to-east 的 row-major 顺序排列，并包含瓦片四条外边界。

`structure` 保持官方字段语义和默认值：

```text
heightScale = 1.0
heightOffset = 0.0
elementsPerHeight = 1
stride = 1
elementMultiplier = 256.0
isBigEndian = false
```

多个 element 按 `elementMultiplier` 和 endian 组合，最终高度为
`encodedHeight * heightScale + heightOffset`，单位固定为米。这样 RGB/RGBA elevation tile
可以直接用 `structure` 描述，而不强制先生成浮点副本。buffer 长度必须与
`width × height × stride` 一致，所有解码高度必须 finite。

构造器接管 `buffer` 和可选 `waterMask` 的所有权，不复制；调用方在构造成功后不得修改或
复用它们。公共 API 不暴露可写 height buffer。构造时扫描一次全部解码高度，同时完成 finite
校验并得到准确的 `minimumHeight`、`maximumHeight`；不信任调用方提供的未校验最值。

T1 不支持 NoData、NaN 或单块 heightmap 内的孔洞。Provider/decoder 必须先填补数据，或把
整个瓦片报告为不可用。

### 插值与 availability

`interpolateHeight(extent, x, y)` 接受 `SceneGISPlanarExtent` 和米制 X/Y：

- 非 finite X/Y 或无效 extent 抛出 `DeveloperError`；
- finite 但位于 extent 外的坐标返回 `undefined`；
- 四条外边界 inclusive，精确样本位置返回对应解码高度；
- 每个 grid cell 使用固定 SW→NE diagonal 做 piecewise-linear triangle interpolation；
- 不使用 bilinear interpolation，保证 T2 mesh 和后续查询可以使用同一表面定义。

`childTileMask` 沿用官方 bit mapping：SW=`1`、SE=`2`、NW=`4`、NE=`8`。缺省 `15`。
`isChildAvailable` 只接受当前 tile 的直接四个 child；无效 parent/child address 抛出
`DeveloperError`。Provider availability 与已返回父瓦片的 mask 必须一致；任一来源明确
为 `false` 时不得请求该 child，`undefined` 不等于不可用。

### 错误与阶段边界

无效构造参数、dimension/stride/buffer 不一致、无效 structure、非 finite 解码结果、非法
tile address 和非 finite query 属于 programmer error，使用 `DeveloperError`。网络、服务端和
decoder failure 使用 rejected Promise；T3 才负责 `errorEvent`、retry、cancel、generation 和
terminal failure 状态机。

T1 不修改 `SceneGISPlanarWorld`、surface、tile、quadtree、imagery、camera、Viewer、Shader、
Worker、构建脚本或 upstream-owned file。T1 只证明 Core contract、Heightmap decoding、
interpolation、availability 和正式公共导出。

## 考虑过的方案

### 直接实现或继承官方 terrain 类型

拒绝。它会重新引入 ellipsoid、cartographic rectangle、Globe mesh/Worker 和球面 surface
状态机，并使真正的平面坐标成为伪装类型。

### Provider 直接返回 Heightmap

拒绝。它会把首个数据格式固化成 Provider 的永久返回类型，使未来 quantized mesh 等格式
需要破坏公共 API。

### Heightmap 只接受已解码 Float32/Float64 米制数组

拒绝。虽然实现更小，但会迫使 Terrain-RGB、Terrarium 和既有 encoded heightmap 产生额外
转换 buffer。保留官方 `structure` 语义可以在不引入球面空间语义的情况下提高数据兼容性。

### 首版支持 `minimumLevel` 或 sparse root

暂不采用。缺少父级数据会扩大 T2/T3 的遍历、bounds、fallback 和无孔洞状态机。首版要求
Level 0，后续在出现明确局部全世界数据需求时再设计 coverage metadata。

## 结果与约束

- T1 会增加三个需要维护兼容性的公共 SceneGIS Core 类型。
- Heightmap 原始表示与 Cesium 数据兼容，但 mesh、Worker 和空间坐标语义完全独立。
- T2 可以只消费通用 TerrainData 和准确/保守高度范围，不把具体 URL 编码带进 renderer。
- T3 可以使用同一插值契约生成临时上采样数据，并以 `wasCreatedByUpsampling` 区分真实数据。
- `waterMask` 在 T1 只是保留的数据；任何渲染语义必须由后续 ADR 明确。
- 升级 Cesium 时需要复核官方 Heightmap `structure`、row order、child mask 和 triangle diagonal
  是否变化，但不得因此自动采用官方 ellipsoid runtime。
