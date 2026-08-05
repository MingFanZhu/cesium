# ADR-0002：平面坐标与瓦片寻址契约

## 状态

- Status：`approved`
- Date：`2026-08-05`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-world/plans/2026-08-05-phase-2-planar-core.md`
- Related patch：无；P2 不修改 upstream-owned file

## 上下文与源码事实

P1 已建立与 `Globe` 互斥的 primary world 生命周期槽位。P2 需要在进入
surface renderer、相机和拾取之前，先冻结平面世界的坐标范围、坐标元数据和
瓦片寻址数学。

当前 Cesium `TilingScheme` 的公共契约包含 `Ellipsoid`、`MapProjection`、
大地测量 `Rectangle` 和 `Cartographic` 转换。`WebMercatorTilingScheme` 仍会把
瓦片范围转换为球面经纬度。`QuadtreeTile` 同样保存大地测量 `Rectangle`，并包含
根级 X wrapping、反经线和 cartographic cache 等球面行为。因此，即使它们使用
相似的 `level/x/y` 形式，也不是平面世界可以选择性实现或直接复用的抽象。

Cesium `BoundingRectangle` 使用 `x/y/width/height` 表示一个可变二维包围框。
它适合一般二维包围计算，但不能直接表达本扩展要求的只读
`minimumX/minimumY/maximumX/maximumY` 公共契约，也不应同时承担坐标系、世界
范围和瓦片范围三种职责。

## 决策

### 独立的三个公共 Core 类型

在 `packages/engine/Source/SceneGIS/Core` 中新增三个彼此分工明确的公共类型：

1. `SceneGISPlanarExtent`：通用二维平面范围值对象。
2. `SceneGISPlanarCoordinateSystem`：平面世界的坐标语义和合法世界范围。
3. `SceneGISPlanarTilingScheme`：该坐标系上的固定单根四叉瓦片寻址。

三个类型均属于纯 Core 数学，不依赖 Scene、Renderer、DOM、WebGL、provider 或
`SceneGISPlanarWorld`。公共文件 basename、default export 和 JSDoc 类型名保持
一致，并由 engine 现有根导出生成流程公开。

### `SceneGISPlanarExtent`

- 构造参数为
  `{ minimumX, minimumY, maximumX, maximumY }`。
- 四个边界必须是有限数；必须满足 `maximumX > minimumX` 和
  `maximumY > minimumY`。
- extent 本身允许矩形。它以后可以表示图层或数据覆盖范围，不等同于一个合法的
  平面世界。
- 公共契约只读：只提供 getter，不提供 setter；不要求通过 `Object.freeze` 改变
  Cesium 现有对象模型。
- 提供派生 getter `width` 和 `height`。
- 首版只提供 `clone(extent)`、`equals(left, right)` 和
  `contains(extent, position)` 三个静态操作。
- `contains` 只检查位置的 X/Y，且四条外边界均包含在范围内。调用方可传入具有
  平面 X/Y 的 `Cartesian2` 或 `Cartesian3`。

不在 P2 增加 center、intersection、union、padding 或可写 result 参数。
`tileXYToExtent` 每次返回新的只读 extent。

### `SceneGISPlanarCoordinateSystem`

- 构造参数为 `{ extent, crs? }`，其中 `extent` 是
  `SceneGISPlanarExtent`。
- coordinate system 克隆并拥有自己的 extent；边界不在 coordinate system 上
  重复成四个平行字段。
- 世界范围必须严格为正方形，即 `extent.width === extent.height`。不使用 epsilon，
  不静默扩展、裁剪、交换或归一化输入。
- `crs` 是可选、非空的字符串，只作为不透明标识保存，例如 `EPSG:3857` 或本地
  自定义标识。P2 不查询 EPSG 数据库，不标准化标识，不验证 CRS 声明的单位，也不
  执行重投影。
- 坐标单位固定为米；轴向固定为 X 向东、Y 向北、Z 向上。不存在可配置的单位或
  axis-order option。
- public contract 只读，不支持运行时更换范围、CRS 或 render origin。
- Z 在 P2 中没有最小值或最大值。

### `SceneGISPlanarTilingScheme`

- 构造参数为 `{ coordinateSystem }`。因为 coordinate system 是只读值对象，
  tiling scheme 保存其只读引用。
- `coordinateSystem` 和 `maximumSafeLevel` 是公共只读属性。
- Level 0 恰好为 `1 × 1`；Level L 的两个轴均为 `2 ** level` 个瓦片。
- 世界轴保持 X 向东、Y 向北；瓦片采用 northwest-origin XYZ：瓦片 X 向东递增，
  瓦片 Y 向南递增。
- 不支持水平或垂直 wrapping。
- 提供：
  `getNumberOfXTilesAtLevel(level)`、
  `getNumberOfYTilesAtLevel(level)`、
  `getTileSizeAtLevel(level)`、
  `tileXYToExtent(x, y, level)` 和
  `positionToTileXY(position, level, result)`。
- `getTileSizeAtLevel` 返回正方形瓦片的理想边长
  `coordinateSystem.extent.width / 2 ** level`。
- `tileXYToExtent` 返回新的 `SceneGISPlanarExtent`，不提供 result 参数。
- `positionToTileXY` 接收世界坐标 `Cartesian3`，Z 不参与瓦片选择；可选 result
  使用 `Cartesian2`，提供时必须复用并返回同一对象。

### 瓦片边界数学

设世界边长为 `size`，`count = 2 ** level`。瓦片边界直接从 root extent 和整数
边界编号计算，不从相邻瓦片累计加法：

```text
west  = minimumX + size * x       / count
east  = minimumX + size * (x + 1) / count
north = maximumY - size * y       / count
south = maximumY - size * (y + 1) / count
```

这种公式保证所有层级都以配置的完整世界坐标为事实源。P2 保存完整 CRS/world
数值，不引入 recenter、`modelMatrix` 或局部顶点；后续 renderer 才负责把完整瓦片
坐标转换为 tile-local geometry 并通过 `modelMatrix` 放回世界位置。

### 点到瓦片的归属

- 世界的四条外边界均属于世界；`maximumX` 映射到最东列，`minimumY` 映射到
  最南行。
- 内部 X 共享边界属于其东侧瓦片。
- 内部 Y 共享边界属于其南侧瓦片。
- 世界范围外返回 `undefined`，不进行 wrap 或 clamp。
- 无效或非有限位置、无效 level 以及越界 tile index 抛出 `DeveloperError`。

### 数值安全层级

瓦片数必须使用 `2 ** level`，禁止位移运算。公共寻址上限不是任意的数据 LOD
配置，而是该 coordinate system 在 JavaScript `Number` 中仍能可靠区分 tile index
和相邻边界的数学上限：

- 硬上限为 52；Level 53 的 `2 ** level` 已不再是 safe integer。
- 构造 tiling scheme 时，从 Level 0 向上检查 X/Y 两端的相邻边界。若首列、末列、
  首行或末行在浮点表示中出现相邻边界相等，则前一级为
  `maximumSafeLevel`。
- `maximumSafeLevel` 是 52 与上述坐标精度上限中的较小值。
- 所有公开寻址方法在 `level > maximumSafeLevel` 时抛出 `DeveloperError`。

provider 或 surface 的业务 `maximumLevel` 属于后续阶段。它可以低于
`maximumSafeLevel`，但不得被混入 coordinate system 或本类型的数学契约。

## 备选方案与取舍

### 实现 Cesium `TilingScheme` 或复用 `WebMercatorTilingScheme`

拒绝。这样会把 `Ellipsoid`、`MapProjection`、`Cartographic` 和大地测量
`Rectangle` 重新带入真正的平面世界，并让公开 CRS 坐标被隐式转换到球面。

### 复用 Cesium `QuadtreeTile`

拒绝。它的 rectangle cache、cartographic cache、root X wrapping 和反经线语义
不是可选的纯索引实现。P3 应实现只依赖平面 extent 的 tile node 和 traversal。

### 直接使用 `BoundingRectangle`

拒绝作为公共契约。可变 `x/y/width/height` 与配置输入和边界审计不一致，而且会让
“通用矩形 extent”与“严格正方形 coordinate system”之间的职责不清。内部实现
以后仍可在确有需要时使用 `BoundingRectangle` 做临时计算。

### 把四个边界直接放在 coordinate system 上

拒绝。extent 还需要被 tile、provider 和数据覆盖范围复用。由 coordinate system
组合一个 extent，可以保留单一边界事实源，并由 coordinate system 单独施加正方形
约束。

### 使用中心点和边长，或 minimum 加 size

拒绝。`minimumX/minimumY/maximumX/maximumY` 与公开 CRS 的常见数据范围直接
对应，更容易审计外边界和相邻瓦片共享边。

### 现在引入 CRS object 或 reprojection service

拒绝。P2 只需要声明输入坐标的身份，不应提前选择 EPSG 数据源、轴序规则或变换
库。重投影若进入产品范围，必须作为独立扩展重新设计。

## 兼容性与所有权

P2 只新增 SceneGIS-owned Core 和 Specs 文件，不修改 `Globe`、Cesium
`TilingScheme`、`QuadtreeTile`、`Scene`、`CesiumWidget` 或任何 upstream-owned
file，因此不需要新的 SGP。三个公共 basename 必须在 engine 中保持唯一。

P3 的 `SceneGISPlanarWorld` 将接收 `coordinateSystem`，并在内部创建该 world
唯一的 canonical `SceneGISPlanarTilingScheme`；该 tiling scheme 引用同一个只读
coordinate system。world 以后公开只读 `coordinateSystem` 和 `tilingScheme`。
tiling scheme 仍允许被 provider 或离线预处理代码独立构造。

## 构建与发布影响

新增类型通过 engine 现有 basename-based generator 进入根 export、生成声明和 API
文档。不修改 generator，不手工编辑生成文件。没有 Shader、Worker、静态资源、
WebGL 或发布协议变化。

## 测试

- extent 的构造、只读属性、clone、equals、contains 和错误输入。
- coordinate system 对 extent 的所有权、严格正方形、可选 CRS 和米制固定语义。
- Level 0/1/2 数量、northwest-origin XYZ、相邻共享边和完整外边界。
- 负坐标、非零原点、公开投影尺度坐标和大坐标小范围的精度上限。
- 四角、中心、内部 X/Y 边界、外部位置、无 wrap 和 result 复用。
- level、x、y、position 的错误路径，以及超过 `maximumSafeLevel` 的拒绝。
- engine 根导出、生成类型、build、JSDoc 和 type-check。

P2 是纯 Core 数学，不要求 WebGL、Sandcastle、E2E 或性能基准。

## 升级检查点

每次 Cesium 升级检查 upstream 是否新增真正笛卡尔的 tiling/quadtree 抽象，以及
engine 根导出和类型生成规则是否变化。在确认新抽象不携带 ellipsoid、cartographic、
wrap 或大地测量 rectangle 语义前，不替换 SceneGIS 类型。
