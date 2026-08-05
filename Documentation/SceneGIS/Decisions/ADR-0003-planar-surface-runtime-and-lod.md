# ADR-0003：平面 Surface Runtime、LOD 与缓存契约

## 状态

- Status：`approved`
- Date：`2026-08-05`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-world/plans/2026-08-05-phase-3-planar-surface.md`
- Related patch：无；P3 禁止修改 upstream-owned file

## 上下文与源码事实

P1 已通过 `SceneGISWorld` structural contract 和 `SGP-0001` 建立互斥的 primary
world 生命周期槽位。当前 `Scene` 对 primary world 的调用顺序为：pre-pass 阶段调用
`update(frameState)`，`Context.beginFrame()` 后调用 `beginFrame(frameState)`，在
command 收集阶段调用 `render(frameState)`，command 执行和 framebuffer resolve 后调用
`endFrame(frameState)`，最后依据 `tilesLoaded` 决定是否继续 request-render。

P2 已建立不包含 `Ellipsoid`、`Cartographic` 或大地测量 `Rectangle` 的
`SceneGISPlanarCoordinateSystem` 和 `SceneGISPlanarTilingScheme`。Level 0 固定为
`1 × 1`，后续每层两个轴均为 `2 ** level`，并采用 northwest-origin XYZ。
`maximumSafeLevel` 只表示 JavaScript `Number` 中的数学寻址上限，不表示业务或数据
可用层级。

Cesium `QuadtreePrimitive` 和 `QuadtreeTile` 虽以通用名称存在，但当前实现仍依赖：

- `tilingScheme.ellipsoid` 与 `QuadtreeOccluders`；
- `tileXYToRectangle`、`Rectangle` 和 `camera.positionCartographic`；
- cartographic height callbacks、地形高度更新和椭球坐标转换。

把它们直接用于平面世界需要伪造球面语义，或者修改多个高频 upstream-owned files。
两种方式都不符合长期升级边界。

当前透视 quadtree SSE 将 provider 给出的每层最大几何误差，通过相机到 tile
bounding region 的最近距离、drawing-buffer 高度、frustum SSE denominator 和
pixel ratio 投影到屏幕。地球 tile 的特殊性在于 bounding region 和误差来源，而不是
另一套 SSE 基本公式。

当前 Shader 转换链只扫描
`packages/engine/Source/Shaders/**/*.glsl` 和 ThirdParty shader，并在原目录生成
对应 `.js`。`Source/SceneGIS/Shaders` 不会自动进入该链路。P3 只需要一个局部 quad
vertex shader 和纯色 fragment shader，不需要新 `czm_*` builtin、include 或多变体
shader。

## 决策

### 公共 World 契约

新增公共 `SceneGISPlanarWorld`，它结构化满足 `SceneGISWorld` 的 `show`、
`tilesLoaded`、四个 frame lifecycle 方法以及 `isDestroyed`、`destroy`，但不继承或
模拟 `Globe`。

构造参数为：

```text
new SceneGISPlanarWorld({
  coordinateSystem,
  maximumLevel,
  maximumScreenSpaceError = 2.0,
  tileCacheSize = 100,
  baseColor = Color.GRAY,
})
```

- `coordinateSystem` 必须是 `SceneGISPlanarCoordinateSystem`。world 保存该只读
  引用，并创建唯一 canonical `SceneGISPlanarTilingScheme`。
- `maximumLevel` 必填，必须是 `[0, tilingScheme.maximumSafeLevel]` 内的整数。
  它是默认 surface 的运行时上限，不得与 `maximumSafeLevel` 混淆。
- 从 root 到 `maximumLevel` 的 tile scale 必须能表示为有限、正的 Float32；纯数学
  合法但无法进入当前 WebGL model transform 的范围由 world 构造器拒绝。
- `maximumScreenSpaceError` 是有限正数，默认 `2.0` pixel。
- `tileCacheSize` 是非负整数，默认 `100`。
- `baseColor` 必须是 alpha 为 `1.0` 的 `Color`。P3 只支持 opaque base surface；
  world 保存独立颜色值，调用方后续修改输入对象不能绕过该约束。
- `show` 默认 `true`。

公开只读属性为 `coordinateSystem`、`tilingScheme`、`maximumLevel` 和
`tilesLoaded`；公开可写属性为 `show`、`maximumScreenSpaceError`、
`tileCacheSize` 和 `baseColor`。可写属性的无效赋值抛出 `DeveloperError`。

P3 的 flat surface 没有异步数据，因此 `tilesLoaded` 为 `true`。P5 引入真实加载
队列后可以在不改变属性语义的情况下返回动态状态。

### SceneMode 与相机

平面世界只支持 `SceneMode.SCENE3D`。这里的 `SCENE3D` 表示 Cesium 正常笛卡尔
camera/render transform，不表示地球。`SCENE2D`、`COLUMBUS_VIEW`、`MORPHING`
和 `scene.morphTo*` 不受支持。

P3 同时支持透视和正交 frustum。全部位置、裁剪和距离计算使用
`camera.positionWC`、`frameState.cullingVolume` 和完整的平面 `Cartesian3`；不得
读取 `camera.positionCartographic` 或执行 map projection。

### SceneGIS-owned Surface 与隐式 Quadtree

P3 不复用、复制或修改 `QuadtreePrimitive`、`QuadtreeTile`、
`QuadtreeTileProvider` 和 Globe surface runtime。新增 SceneGIS-owned 私有角色：

- `SceneGISPlanarSurface`：surface renderer、LOD 误差来源、共享 GPU 资源和
  renderable-set resolution；
- `SceneGISPlanarQuadtree`：视锥裁剪、SSE 选择、隐式子节点遍历和 LRU cache；
- `SceneGISPlanarTile`：tile address、extent、bounding volume、local placement、
  DrawCommand 和 tile-owned 状态。

私有类名不使用前导 `_`。跨文件私有模块 basename 使用
`_SceneGISPlanarSurface.js` 等名称，放在 `_private/` 并标记 `@private`。

quadtree 使用 `level/x/y` 隐式寻址，不保存一棵必须整体常驻的 parent/children
对象树。子地址固定为：

```text
NW = (2x,     2y,     level + 1)
NE = (2x + 1, 2y,     level + 1)
SW = (2x,     2y + 1, level + 1)
SE = (2x + 1, 2y + 1, level + 1)
```

缓存 key 使用稳定的 `level/x/y`。只有实际访问或渲染需要的 tile record 常驻。

### 可见性、距离与 SSE

tile 首先通过以完整平面坐标构造的零厚度
`OrientedBoundingBox` 做 frustum visibility；平面没有 ellipsoid horizon
occlusion。只有非 `OUTSIDE` tile 才计算距离和 SSE。

透视相机到 `[minimumX, maximumX] × [minimumY, maximumY] × {0}` 的最近距离为：

```text
dx = distance from camera.x to the closed X interval
dy = distance from camera.y to the closed Y interval
dz = abs(camera.z)
distance = sqrt(dx² + dy² + dz²)
```

默认 flat surface 的每层误差为：

```text
maximumGeometricError(level) = worldWidth / (256 * 2 ** level)
```

`256` 是默认 surface 的名义 sampling resolution，不属于 coordinate system 或
tiling scheme。未来 provider 可以提供自己的误差模型。

透视 SSE 为：

```text
maximumGeometricError * drawingBufferHeight
------------------------------------------------------------
distance * frustum.sseDenominator * frameState.pixelRatio
```

正交 SSE 使用 effective frustum height 代替
`distance * frustum.sseDenominator`。距离为零时 SSE 为正无穷，并由
`maximumLevel` 强制停止。P3 不使用 Globe fog 对 SSE 做衰减。

refine 条件固定为：

```text
visible
AND level < maximumLevel
AND tileSSE > maximumScreenSpaceError
```

SSE 等于阈值时保留当前 tile。遍历顺序保持确定性，不根据尚不存在的异步请求
优先级提前设计调度器。

### Ideal Set 与 Renderable Set

quadtree 只计算当前视角理想的 leaf tile set。surface 再把 ideal set 解析为实际
renderable set。P3 的纯色 tile 同步可用，因此二者相同，父 tile 和其后代不得同时
进入同一个 renderable set。

P5 接入异步 raster data 后，由 surface 把未就绪 ideal tile 替换为最近的 ready
ancestor；不改变 P3 的平面 SSE 和 quadtree selection contract。

### 缓存

cache 以 tile record 为单位，按最后一次被选中或作为 render dependency 使用的
frame 维护 LRU：

- 当前 renderable tile 不得淘汰；
- 未来的 fallback、loading 或不可安全释放 tile 通过同一 protected-set 机制保护；
- 其余 tile 在 `endFrame` 按 LRU 淘汰；
- 同一 last-used frame 使用 tile key 作为稳定 tie-breaker；
- `tileCacheSize` 限制未被保护但继续保留的 tile，实际 resident count 可以超过它；
- `tileCacheSize = 0` 仍保留当前 frame 必需 tile；
- tile eviction 只释放 tile-owned 资源，不释放共享 surface GPU 资源。

P3 的 cache 保留在 `SceneGISPlanarQuadtree` 内部。只有真实异步数据使职责显著扩大
时，才提取独立私有 cache 类型。

### 局部 Geometry 与 GPU 精度

surface 只创建一份 `[-0.5, 0.5]` 范围内的 Float32 unit quad。每个 tile 使用自己
的 `modelMatrix` 将 quad 缩放到 tile size，并平移到以完整 CRS 表示的 tile center。
不得把绝对 `minimumX`、`maximumX` 等写入 Float32 vertex buffer，也不得把整个
coordinate system 静默重定心。

直接 DrawCommand 的 vertex shader 使用局部 model transform：

```glsl
gl_Position = czm_modelViewProjection * vec4(position, 1.0);
```

不把 raw local vertex 直接乘以 `czm_modelViewProjectionRelativeToEye`。当前 Cesium
会在 CPU 以 JavaScript double 计算 `view * model`，使大世界坐标先变成 camera-local
model-view translation，再上传 GPU。

surface 共享一个 vertex array、shader program 和 opaque render state。tile 拥有
自己的 model matrix、用于 quadtree selection 的 exact zero-thickness
`OrientedBoundingBox`、从该 OBB 一次性派生并供 DrawCommand 使用的 conservative
`BoundingSphere`，以及 DrawCommand。两种 bounding volume 都随 tile record 创建，
不得逐帧分配；command sphere 不能回用于 quadtree visibility、SSE 或距离计算。P3
平面双面可见，启用 depth test/depth write，使用 `Pass.OPAQUE`，不参与 shadow、
generic object pick 或透明 pass。

### 生命周期与 Context 所有权

`SceneGISPlanarWorld` constructor 不接收 Scene、Context 或 canvas。职责映射为：

| Lifecycle method | P3 responsibility                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `update`         | 校验 `SCENE3D` 和公开配置；不创建 GPU 资源或遍历 quadtree。                                 |
| `beginFrame`     | 重置 frame-local selection、protected set 和统计。                                          |
| `render`         | normal render 选择 tile、延迟创建资源并缓存实际提交 command；pick+depth pass 只重提该缓存。 |
| `endFrame`       | command 执行后更新 LRU、trim cache 并清理 frame-local 状态。                                |

共享 GPU 资源只在首个具有可见 renderable tile 的 color frame 中创建。一个 world
实例第一次渲染后绑定一个 Context；不得跨 Scene/Context 复用。`show = false` 时不
产生新 selection 或 command，但 cache 可以在 `endFrame` 收缩到配置容量。

`destroy()` 可以在首次渲染前调用，也可以在渲染后由 owning Scene 调用。tile-owned
资源、vertex array/buffer 和 shader cache reference 必须各自只有一个 owner，并且
只释放一次。RenderState cache object 和 DrawCommand 不被当作独占 GPU 资源重复销毁。

### Shader 源码策略

P3 的两个极小 shader 作为 `SceneGISPlanarSurface` 模块中的 file-scope string，使用
现有 automatic uniforms 和 ShaderProgram cache。P3 不新增 `.glsl` 特殊资源，不修改
`scripts/build.js`，不创建生成 shader JS，也不增加 `czm_*` builtin。

出现以下任一真实需求时，重新设计并以独立 ADR/SGP 记录 SceneGIS Shader 构建链：

- shader 被多个组件共享；
- 出现多文件 include、较多变体或显著源码体积；
- 需要新的 `czm_*` builtin；
- development、release、npm 或 Sandcastle 产物需要独立 shader 资源。

## 备选方案与取舍

### 泛化 Cesium `QuadtreePrimitive` 和 `QuadtreeTile`

拒绝。需要把 ellipsoid、cartographic、height callback 和 wrap 变成可选协议，并修改
多个 upstream 热点文件。P3 的单根、无 wrap、零高程平面不需要承担该升级面。

### 为平面伪造 Ellipsoid 和 Cartographic Rectangle

拒绝。这会让公开米制 CRS 被隐式解释为 radians，并破坏“真正平面坐标系”的基本
契约。

### 复制 Cesium Globe quadtree

拒绝。复制会形成难以审计的长期 fork，并携带 P3 不需要的 terrain、imagery、
occlusion、2D mode 和 height update 代码。

### 让 flat geometry 的几何误差为零

拒绝作为 P3 默认策略。数学平面确实没有曲面逼近误差，但零误差会使 SSE 永远为
零，无法在 P3 验证四叉树 LOD，也不能为后续 raster tile 建立选择基础。名义 sampling
resolution 是默认 surface 的 LOD policy，不冒充 coordinate-system 属性。

### 以 projected tile size 取代 SSE

不采用。它可以形成另一种 LOD metric，但不应被称为 geometric SSE。保留 Cesium
标准投影形式可以让未来 provider 提供自己的 world-space error。

### 立即建立 `Source/SceneGIS/Shaders` 生成链

延期。P3 的两个极小 shader 不足以证明修改 upstream build、生成物和发布清理规则的
长期收益。file-scope shader string 可以完整验证现有 automatic uniform 和 release
bundle，同时保持 P3 upstream diff 为零。

## 兼容性与所有权

P3 只新增或修改 SceneGIS-owned Source、Specs、Documentation 和 AgentDocs。
`Scene.js` 与 `CesiumWidget.js` 继续使用已批准的 `SGP-0001`，但 P3 不扩大其 hunk、
测试或 patch manifest。预计 P3 upstream-owned files 为 0，P3 SGP 为 0。

`SceneGISPlanarWorld` 通过现有 engine basename generator 进入根 export。私有模块
使用 `_SceneGIS*` basename 和 `@private`；它们可以出现在软私有 JS barrel，但不得
进入公共类型声明和 API 文档，也不形成兼容性承诺。

## 构建与发布影响

公共 world 使用普通 SceneGIS JS 构建路径。P3 不修改 Shader generator、Worker、
静态资源或运行时 URL。必须同时验证 development build、release build、生成类型、
API 文档以及私有模块隐藏结果；不得提交生成文件。

## 测试与性能

- 纯 selection Specs：root、child addressing、frustum culling、perspective/orthographic
  SSE、threshold equality、zero distance 和 maximumLevel。
- cache Specs：stable key、protected set、LRU tie-break、zero capacity、eviction 和
  tile-owned cleanup。
- WebGL Specs：opaque base color、local geometry/model matrix、大坐标 offset、无父子
  overlap、show、context ownership 和 destroy-before/after-render。
- lifecycle/integration Specs：真实 `SceneGISPlanarWorld` 通过 CesiumWidget 安装，
  `scene.globe === undefined`，四个 world lifecycle 方法参与 frame。
- steady-state evidence：相同 camera 连续 frame 在 warm-up 后不继续创建 tile、
  DrawCommand、buffer 或 shader program。
- 默认 CesiumWidget、Globe 和 Scene 回归。

Sandcastle、navigation、picking、raster loading 和 E2E 不属于 P3。

## 升级检查点

每次 Cesium 升级检查：

- `Scene` primary-world 生命周期顺序和 `frameState.passes`；
- `QuadtreePrimitive`/`QuadtreeTile` 是否出现真正无 ellipsoid/cartographic 的通用
  抽象；
- `UniformState` 的 model/view automatic-uniform 计算；
- DrawCommand、ShaderProgram cache、VertexArray/Buffer 和 RenderState 的所有权；
- orthographic frustum height 和 perspective `sseDenominator`；
- `scripts/build.js` Shader 扫描、生成和清理范围。

只有 upstream 提供语义等价且不重新引入球面假设的抽象时，才评估替换 SceneGIS
private runtime。

## P4-discovered amendment（2026-08-06）

P3 approval 后，P4 的 rendered-depth consistency 验收发现两项属于 P3 Surface pass
contract 的缺口。本 amendment 不重新激活 P3，也不改变原 review 历史：

1. normal `passes.render` 仍是唯一执行 visibility、SSE、LOD selection、LRU/protected-set
   mutation 和 GPU/DrawCommand creation 的路径，并缓存最近一次正常 render 实际提交的
   command references；`passes.pick && passes.depth && !passes.render` 只重提该缓存，
   不重新选择、不分配、不改变 normal-render statistics。无 prior render、无可见 tile、
   zero buffer 或 hidden world 时安全 no-op。generic object pick 仍不在本契约内。
2. exact zero-thickness OBB 继续承担 quadtree selection。将它同时用于 DrawCommand 会使
   nadir 平面精确落在 closest frustum near plane，产生 raw depth `0`，而 Cesium 用 `0`
   表示无有效 depth hit。因此 DrawCommand 改用
   `BoundingSphere.fromOrientedBoundingBox(tile.boundingVolume)` 一次性派生的保守 sphere。
   这不是给数学平面增加厚度；quad/model matrix/shader 仍严格位于 `Z=0`，SSE、tile
   traversal 和 visibility 仍只使用 exact OBB。

P4 correction Specs 锁定 command reference replay 的零 selection/allocation/LRU delta、
双 Context fail-fast、sphere 对真实四角的保守包含、nadir plane 严格位于 command-volume
near/far interval 内，以及 logarithmic/linear 两条真实 WebGL depth path 的
`0 < rawDepth < 1`。相关证据记录于 P4 phase plan/review。
