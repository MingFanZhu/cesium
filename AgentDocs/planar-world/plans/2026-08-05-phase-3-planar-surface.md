# 阶段计划：P3 平面 Surface Runtime

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- 总体计划（Parent plan）：
  [2026-08-05-planar-world-extension.md](2026-08-05-planar-world-extension.md)
- 阶段（Phase）：`P3-planar-surface`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`approved`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-05`
- 更新日期（Updated）：`2026-08-05`
- 相关讨论（Related discussions）：无；结论已提升到 ADR
- 相关评审（Related reviews）：
  [P3 planar surface review request](../reviews/2026-08-05-p3-planar-surface.md)
  （`approved`）
- ADR：
  `Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md`
- SGP：无；本阶段禁止修改 upstream-owned file

## 目标

实现第一个可运行的 `SceneGISPlanarWorld`。调用方应能通过已经完成的米制
`SceneGISPlanarCoordinateSystem` 创建平面 primary world，设置程序控制的相机，并
在 `scene.globe === undefined` 的 Scene 中渲染、裁剪和按 SSE 细化纯色平面。

本阶段必须闭合：

- `SceneGISWorld` lifecycle conformance；
- 单根隐式平面 quadtree；
- 透视与正交 SSE；
- tile-local geometry 与每 tile `modelMatrix`；
- 确定性 LRU cache；
- WebGL 资源创建、复用和销毁；
- 公共 API、类型、文档、渲染和默认 Globe 回归证据。

P3 完成、review 和本地提交前不得进入 P4。

## 非目标

- 修改 `SceneGISWorld`、`Scene`、`CesiumWidget` 或 P1 primary-world contract。
- 复用、复制或修改 `Globe`、`QuadtreePrimitive`、`QuadtreeTile`、
  `QuadtreeTileProvider`、`GlobeSurfaceTileProvider` 或 terrain/imagery runtime。
- 支持 `SCENE2D`、`COLUMBUS_VIEW`、`MORPHING` 或 `scene.morphTo*`。
- 实现 Camera controller、home view、minimum/maximum height、边界约束或输入交互。
- 实现 screen/world picking、depth reconstruction 或 pick pass。
- 实现 raster provider、图层、异步请求、loading queue、ancestor fallback 或合成。
- 实现高程 terrain、地下模式、lighting、shadow、clipping、透明 surface 或材质系统。
- 公开 surface provider、tile provider、quadtree、tile、cache 或 debug statistics。
- 新增 `.glsl` 特殊资源、`czm_*` builtin、Worker、静态资源或构建器修改。
- 创建 Viewer、Sandcastle、Playwright E2E 或 P4/P5/P6 文档。
- 修改或提交生成文件。

## 进入条件

- P1 与 P2 均为 `completed`，相关 review 为 `approved`。
- P2 已形成独立本地提交
  `031159f825add33115980ada4ebfc6b8d3945ecd`（`完成平面世界第二阶段坐标与瓦片核心`）。
- 当前分支为 `feature/planar-world`，P3 不创建新分支。
- 项目负责人已确认本计划中的 public API、SceneMode、SSE、隐式 quadtree、cache、
  local geometry、lifecycle 和 Shader 策略。
- ADR-0003 状态为 `approved`，Architecture review 为 `confirmed`。
- P3 implementation diff base 固定为 `031159f825add33115980ada4ebfc6b8d3945ecd`。
- Execution Agent 开始前重新读取根、engine、AgentDocs `AGENTS.md`，以及
  Architecture、DevelopmentGuide、总体计划、ADR-0001 至 ADR-0003、P2 plan 和
  P2 review。
- Execution Agent 使用 code graph 重新确认当前 DrawCommand、CullingVolume、
  UniformState、ShaderProgram cache、VertexArray/Buffer、RenderState、Scene frame
  lifecycle 和 Specs WebGL matcher；不能仅根据本计划中的源码行号实现。

## 当前源码事实

1. 上游基线是 Cesium `1.144`，提交
   `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
2. P1 的 `SceneGISWorld` required contract 包含 `show`、`tilesLoaded`、
   `update`、`beginFrame`、`render`、`endFrame`、`isDestroyed` 和 `destroy`。
3. `Scene` 在 pre-pass 调用 world `update`，在 `Context.beginFrame()` 后调用
   `beginFrame`，在 command collection 调用 `render`，在 command execution 和
   framebuffer resolve 后调用 `endFrame`。
4. `Scene` 在 world `tilesLoaded === false` 时继续 request-render。P3 没有异步 tile，
   因而不应制造持续 render loop。
5. P2 的 coordinate system 保留完整米制 CRS 数值，轴向为 X east、Y north、Z up；
   不提供 render origin。
6. P2 tiling scheme 的 Level 0 为 `1 × 1`，Y 向南递增，不 wrap，并提供
   `tileXYToExtent`、`getTileSizeAtLevel` 和 coordinate-specific
   `maximumSafeLevel`。
7. `maximumSafeLevel` 是 mathematical addressing limit，不是 P3 runtime
   `maximumLevel`。
8. Cesium `QuadtreePrimitive` constructor 读取 `tilingScheme.ellipsoid` 并创建
   `QuadtreeOccluders`；selection 和 height update 读取 cartographic、Rectangle 和
   ellipsoid。
9. `QuadtreeTile` constructor 强制调用 `tileXYToRectangle`，不是可选择实现的
   平面 tile record。
10. 当前 perspective SSE 由 provider maximum geometric error、drawing-buffer
    height、tile distance、frustum denominator 和 pixel ratio 组成；orthographic
    使用 frustum height。
11. `UniformState` 在 CPU 使用 `view * model` 形成 model-view matrix。P3 可以让
    GPU vertex 保持局部值，由 DrawCommand `modelMatrix` 保存完整 tile placement。
12. `OrientedBoundingBox` 支持退化 half axis，并提供 `intersectPlane`，可以表达
    Z half-axis 为零的平面 tile。
13. engine Shader generator 只扫描 `Source/Shaders/**/*.glsl` 与 ThirdParty Shader；
    `Source/SceneGIS/Shaders` 当前不是自动构建入口。
14. 普通 `Source/SceneGIS/**/*.js` 与 `Specs/SceneGIS/**/*Spec.js` 使用现有 basename
    和 SpecList generator。私有 `_SceneGIS*` module 仍是 soft-private JS module，
    但应由 `@private` 排除公开文档和声明。
15. P1 upstream-owned files 为 `Scene.js` 和 `CesiumWidget.js`，由 `SGP-0001`
    跟踪。P3 不得改变这些文件、marker 或 patch manifest。

源码行号不是契约。若 Execution Agent 发现上述事实不再成立，先停止实现并回写本
计划；改变架构边界的问题交回 Architecture Agent，不得自行扩大 upstream diff。

## 详细设计

### 对象关系与可见性

```text
Scene
  └─ owns → SceneGISPlanarWorld (public)
                 ├─ references → SceneGISPlanarCoordinateSystem
                 ├─ owns → SceneGISPlanarTilingScheme
                 └─ owns → SceneGISPlanarSurface (private)
                                  ├─ owns → shared GPU resources
                                  └─ owns → SceneGISPlanarQuadtree (private)
                                                   └─ caches → SceneGISPlanarTile (private)
```

预计私有模块路径为：

```text
packages/engine/Source/SceneGIS/Scene/_private/
├── _SceneGISPlanarSurface.js
├── _SceneGISPlanarQuadtree.js
└── _SceneGISPlanarTile.js
```

类、constructor function 和 JSDoc 名称分别为 `SceneGISPlanarSurface`、
`SceneGISPlanarQuadtree` 和 `SceneGISPlanarTile`，不带前导 `_`。模块 basename 带
`_`，module/type 标记 `@private`，不形成公共兼容性承诺。

如果一个私有角色最终只被单文件使用且拆分没有测试或职责收益，Execution Agent
可以把它降为 file-scope helper，但必须在“偏差与结果”说明最终布局；不得反向增加
公共 API。

### `SceneGISPlanarWorld` 公共 API

构造形式：

```text
new SceneGISPlanarWorld({
  coordinateSystem,
  maximumLevel,
  maximumScreenSpaceError = 2.0,
  tileCacheSize = 100,
  baseColor = Color.GRAY,
})
```

构造验证：

- `coordinateSystem` 必须是 `SceneGISPlanarCoordinateSystem`。
- `maximumLevel` 必须是非负整数，且不超过 canonical tiling scheme 的
  `maximumSafeLevel`。
- root tile size 与 `maximumLevel` tile size 经 `Math.fround` 后必须分别保持 finite
  和大于零，避免纯数学范围静默变成无效 GPU scale。
- `maximumScreenSpaceError` 必须是 finite positive number。
- `tileCacheSize` 必须是 non-negative integer。
- `baseColor` 必须是 `Color` 且 `alpha === 1.0`。world 保存 clone，输入 Color 后续
  mutation 不影响 world。

公开只读属性：

- `coordinateSystem`
- `tilingScheme`
- `maximumLevel`
- `tilesLoaded`

公开可写属性：

- `show`，默认 `true`
- `maximumScreenSpaceError`
- `tileCacheSize`
- `baseColor`

可写属性必须在赋值时维持上述约束。`baseColor` getter/setter 不得允许外部通过共享
输入引用绕过 opaque contract；采用 clone-on-set 或等价的 owned-value 方案。P3 不
增加 setter for coordinate system、tiling scheme 或 maximum level。

`SceneGISPlanarWorld` 结构化实现 `SceneGISWorld`，不继承其 throwing interface
constructor，不增加 `globe`、imagery、terrain、ellipsoid 或 projection 假字段。

### SceneMode 与 Camera Contract

- 只允许 `frameState.mode === SceneMode.SCENE3D`；其他 mode 抛出明确的
  `DeveloperError`。
- `show === false` 仍不改变 world 的 supported mode contract。
- perspective 与 orthographic frustum 都必须支持。
- camera position 统一使用 `camera.positionWC`；tile placement 和 bounding volume
  也使用 world coordinate。
- 不读取 `positionCartographic`，不通过 `frameState.mapProjection` 转换。
- P3 只接受调用方程序设置 camera；不改变 controller、home view 或 collision。

### Tile Address、Extent 与 Bounding Volume

tile key 为确定性的 `level/x/y`。tile record 至少保存：

- `x`、`y`、`level` 和 stable key；
- 由 canonical tiling scheme 得到的只读 `SceneGISPlanarExtent`；
- 以 tile center 和 X/Y half size 构造、Z half-axis 为零的
  `OrientedBoundingBox`；
- tile-local `modelMatrix`；
- 可复用 DrawCommand；
- last-used frame 和 tile-owned cleanup state。

center 使用不会因 `minimum + maximum` 产生中间 overflow 的公式，例如
`minimum + (maximum - minimum) * 0.5`。tile 不保存 `Rectangle`、Cartographic、
Ellipsoid、parent/children pointer 或 wrap neighbor。

### 隐式 Quadtree Traversal

从 `(0, 0, 0)` 开始，每个 child 通过整数地址生成：

```text
NW = (2x,     2y,     level + 1)
NE = (2x + 1, 2y,     level + 1)
SW = (2x,     2y + 1, level + 1)
SE = (2x + 1, 2y + 1, level + 1)
```

每个 tile 的处理顺序为：

1. 取得或创建 tile record。
2. 使用 `frameState.cullingVolume` 与 zero-thickness OBB 做 visibility test。
3. `OUTSIDE` 立即停止，不计算 distance/SSE，不进入 render set。
4. 计算当前 level maximum geometric error 和 projection-specific SSE。
5. 满足 refine 条件时按固定 child order 继续；否则把当前 tile 加入 ideal set。

refine 条件：

```text
tile is visible
AND tile.level < maximumLevel
AND tileSSE > maximumScreenSpaceError
```

SSE equality 不 refine。实现不得使用 bitshift 计算 tile count/address，也不得引入
wrap、horizon occlusion、fog adjustment 或每帧无界 recursion/allocation。

### Distance 与 SSE

perspective distance 是 `camera.positionWC` 到 closed planar tile rectangle at
`Z = 0` 的 exact Euclidean distance：

```text
dx = 0 inside [minimumX, maximumX], otherwise distance to nearest X edge
dy = 0 inside [minimumY, maximumY], otherwise distance to nearest Y edge
dz = abs(camera.z)
distance = sqrt(dx² + dy² + dz²)
```

默认 surface：

```text
maximumGeometricError(level) = coordinateSystem.extent.width / (256 * 2 ** level)
```

perspective：

```text
SSE = maximumGeometricError * drawingBufferHeight
      / (distance * frustum.sseDenominator)
      / frameState.pixelRatio
```

orthographic：

```text
SSE = maximumGeometricError * drawingBufferHeight
      / effectiveFrustumHeight
      / frameState.pixelRatio
```

`OrthographicFrustum` 和 off-center orthographic 使用当前源码能够提供的 effective
height，不根据 camera distance 改变。distance 为零时返回正无穷，不产生 `NaN`。
zero-sized drawing buffer 不应产生 unbounded selection 或 invalid command。

### Ideal Set 与 Renderable Set

quadtree 输出 ideal leaf set。surface 负责把 ideal set 解析成 renderable set。
P3 每个纯色 tile 同步 ready，因此两个集合相同：

- refine 后不渲染 parent；
- 未 refine 时不渲染 child；
- 同一 renderable set 不包含 ancestor/descendant overlap；
- visible child 的 union 覆盖 visible parent 区域，不出现 hole。

不要在 P3 实现 async-ready state 或 ancestor fallback；只保留 surface resolution
边界，使 P5 可以扩展而不改 selection 算法。

### Cache 与 Eviction

quadtree 内部以 stable key 保存 resident tile record，并记录 last-used frame：

- selected/renderable tile 进入本帧 protected set；
- 将来 fallback/loading tile 可以复用 protected-set seam，但 P3 不实现这些状态；
- `endFrame` 才执行 trim，避免 command 执行前释放资源；
- unprotected tile 按 last-used frame 从旧到新淘汰；同 frame 按 tile key 排序；
- `tileCacheSize` 只计未保护但继续保留的记录；selected count 不受该上限破坏；
- `tileCacheSize = 0` 仍保留本帧 selected tile；
- tile 被重新需要时可以从数学地址确定性重建；不要求常驻完整 tree；
- eviction 调用 tile-owned cleanup exactly once；不得销毁 shared surface resources。

相同 camera 和配置的 warm frame 后，不应继续增长 resident tile、DrawCommand、
buffer 或 shader creation count。private debug counters 可以为 Specs 提供证据，但不得
成为 public API。

### Local Geometry、DrawCommand 与 Render State

surface 共享一个 Float32 unit quad，建议使用四个 local vertex 和 triangle strip：

```text
(-0.5, -0.5, 0)  (0.5, -0.5, 0)
(-0.5,  0.5, 0)  (0.5,  0.5, 0)
```

每 tile `modelMatrix` 把 local quad 缩放到 tile width/height，并平移到完整 CRS tile
center。不得把 tile absolute corners 写进 vertex buffer，也不得给整个 coordinate
system 增加隐式 render origin。

vertex shader 使用：

```glsl
gl_Position = czm_modelViewProjection * vec4(position, 1.0);
```

fragment shader 从 uniform 读取 opaque base color。P3 command：

- `Pass.OPAQUE`
- depth test enabled
- depth write enabled
- face culling disabled，平面双面可见
- 不生成 pick、shadow、translucent 或 Globe-specific command
- bounding volume 使用 tile OBB

所有 tile 共享 VertexArray/Buffer、ShaderProgram cache reference 和 RenderState。
每 tile 可以缓存 DrawCommand、modelMatrix、bounding volume 和 uniform binding；改变
baseColor 不得重建 shader/buffer。

### Shader 策略

vertex/fragment shader 作为 `SceneGISPlanarSurface` module file-scope string，通过
当前 `ShaderSource`/`ShaderProgram` API 构建。不得：

- 在 `Source/SceneGIS/Shaders` 新增 `.glsl`；
- 修改 `scripts/build.js` Shader glob、生成或 cleanup；
- 创建/提交 generated shader JS；
- 新增或注册 `czm_*` builtin；
- 依赖 import side effect 安装 Shader。

Execution Agent 必须在“偏差与结果”记录实际使用的 ShaderProgram cache 获取和释放
API。若当前 API 无法安全表达该生命周期，停止并交回 Architecture Agent，而不是
自行修改 upstream build/runtime。

### Frame Lifecycle

| Method                   | Required behavior                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `update(frameState)`     | 校验 mode 和 public settings；不创建 GPU resource，不遍历 tree。                                               |
| `beginFrame(frameState)` | reset ideal/render/protected set 和 frame counters；可安全处理 hidden world。                                  |
| `render(frameState)`     | 仅在 color render pass 且 `show` 时 select；有 visible tile 时 lazy-create shared resources 并 push commands。 |
| `endFrame(frameState)`   | command execution 后 update LRU、trim cache、finalize frame state；没有 render 调用也安全。                    |

同一 `frameState.frameNumber` 不得因重复 lifecycle 调用而重复创建 tile/resource 或把同一
command 重复加入同一 command list。P3 `tilesLoaded` 为 `true`，不能触发持续
request-render。

### Resource Ownership 与 Destroy

- constructor 不创建 Context-bound resource。
- 第一个可见 color frame 绑定 `frameState.context`；后续不同 Context 抛出
  `DeveloperError`。
- surface 明确记录 VertexArray/Buffer 的单一 owner，遵守当前 Cesium
  destroyable-buffer contract，不能 double destroy。
- ShaderProgram 从 cache 获取时按当前 cache reference 语义释放 exactly once。
- cached RenderState 和 plain DrawCommand 不作为独占 GPU resource 销毁。
- `destroy()` 先 free all tile-owned resources，再释放 shared GPU resources，最后使用
  Cesium `destroyObject` 语义使后续方法调用报错。
- constructor 后、首 frame 前 destroy 必须安全。
- owning Scene 销毁 world exactly once；P3 不增加第二个 owner。

## 影响路径

预计 Source：

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarQuadtree.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js`

预计 Specs：

- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/_SceneGISPlanarQuadtreeSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/_SceneGISPlanarTileSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarWorldCesiumWidgetSpec.js`

实现允许合并不需要独立职责的 private module/spec，但不得把实现移出
`Source/SceneGIS`，不得新增公共类型，也不得修改 upstream-owned file。任何新增
SceneGIS-owned path 都必须在本节和最终结果中登记。

Documentation 与 AgentDocs：

- `Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md`
- `AgentDocs/planar-world/README.md`
- `AgentDocs/planar-world/plans/README.md`
- `AgentDocs/planar-world/plans/2026-08-05-planar-world-extension.md`
- `AgentDocs/planar-world/plans/2026-08-05-phase-3-planar-surface.md`
- 实现 ready 时新增
  `AgentDocs/planar-world/reviews/2026-08-05-p3-planar-surface.md`
- 实现 ready 时更新 `AgentDocs/planar-world/reviews/README.md`

禁止修改：

- `packages/engine/Source/Scene/Scene.js`
- `packages/engine/Source/Widget/CesiumWidget.js`
- `packages/engine/Source/Scene/Globe.js`
- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/QuadtreeTile.js`
- `packages/engine/Source/Scene/QuadtreeTileProvider.js`
- `scripts/build.js`
- `.scenegis/upstream-patches.json`
- 所有生成文件和 P4-P6 路径

## 执行步骤

1. Execution Agent 将本计划保持为 `active`，重新检查 git base、owned paths、相关
   code graph、WebGL matcher 和 resource APIs；不得先写实现再补源码事实。
2. 实现 `SceneGISPlanarTile` address、extent、zero-thickness OBB、local
   modelMatrix、stable key 和 tile-owned cleanup，并先完成无 WebGL Specs。
3. 实现 `SceneGISPlanarQuadtree` 的 fixed-root iterative selection、frustum culling、
   perspective/orthographic SSE、ideal set、maximumLevel 和 deterministic LRU。
4. 实现 `SceneGISPlanarSurface` shared unit quad、inline shader、opaque render state、
   renderable-set resolution、DrawCommand reuse 和 resource lifecycle。
5. 实现公共 `SceneGISPlanarWorld` constructor/property validation、canonical tiling
   scheme、structural lifecycle、single-context ownership 和 destroy。
6. 添加真实 CesiumWidget integration Spec：安装 world 后
   `scene.world === world`、`scene.globe === undefined`，程序设置 camera 后得到正确
   base-color pixels 和 LOD commands。
7. 覆盖 hidden、offscreen、zero buffer、invalid mode、perspective、orthographic、
   zero distance、maximum level、大坐标 offset、cache trim、warm-frame reuse 和
   destroy-before/after-render。
8. 从 engine 根入口导入 public world，生成并检查 root export、types 和 API docs；
   检查 private modules 未进入 `.d.ts` 和公开 HTML。不得手改生成文件。
9. 运行全部 mandatory commands，记录 exit code、spec count、warning、像素、resource
   和 steady-state counter evidence。
10. 以 P2 commit 为 base 审计 diff，确认 upstream-owned files = 0、P3 SGP = 0、
    patch manifest unchanged、generated files absent。
11. 创建 P3 review request，状态为 `pending`，回写本 plan 的实际路径、偏差、命令和
    结果；总体 roadmap 与扩展索引在 review 通过前保持 P3 `active`。
12. Execution Agent 不 commit、不 push、不创建 P4 文件，通知 Architecture Agent
    review 后停止。
13. Architecture Agent 完成 architecture/code review；findings 由 Execution Agent
    修复并回写，直至 review `approved`。
14. Architecture Agent 将 P3 code、Specs、ADR 和 AgentDocs 创建为单独中文本地提交。
    提交成功后停在阶段边界，与项目负责人讨论 P4，不自动激活下一阶段。

## 验证要求

### 必须覆盖的纯逻辑 Specs

- constructor/property：defaults、required values、readonly identity、setter validation、
  Float32 renderable scale、baseColor ownership 和 opaque alpha。
- tile：stable key、extent、safe center、zero-thickness OBB、model matrix 和 cleanup
  exactly once。
- address：Level 0 单 root、四个 northwest-origin children、无 wrap、maximum level。
- visibility：outside tile 不计算 SSE、不 selected；intersecting/inside tile 正常处理。
- perspective SSE：camera-to-closed-rectangle exact distance、pixel ratio、threshold
  equality、distance zero 和 maximumLevel。
- orthographic SSE：只随 frustum height 改变，不随 camera distance 改变。
- ideal set：没有 ancestor/descendant overlap，coarsen/refine 结果稳定。
- cache：stable LRU、tie-break、protected set、capacity zero、selected-over-cap、eviction
  和 recreation。
- lifecycle：调用顺序、hidden world、non-render pass、same-frame duplication、
  `tilesLoaded` 和 invalid SceneMode。

### 必须覆盖的 WebGL 与集成 Specs

- root/base color 正确渲染，world extent 外保持 background。
- perspective camera 靠近时 command/selected level 增加，远离时合并。
- orthographic frustum 缩小时细化。
- local vertex buffer 保持 unit range，tile placement 来自 modelMatrix。
- 使用非零、投影坐标量级和更大 offset fixture 验证像素与 command matrix finite。
- 相邻 tile 无可见 crack，父子不重复绘制。
- `show = false` 不提交 command；恢复后复用 cache/resource。
- baseColor 修改不重建 shader/buffer。
- warm-up 后相同 frame fixture 的 tile/DrawCommand/buffer/shader creation count 不增长。
- cache eviction 不销毁 shared resource。
- first visible frame lazy creation、different-context rejection、destroy-before-render、
  destroy-after-render 和 owning Scene destroy once。
- 真实 CesiumWidget custom-world path 不创建 Globe 或 Earth defaults。

### 必须运行的命令

```powershell
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTile"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarQuadtree"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarWorldCesiumWidget"
npm run test -- --webglValidation --includeName "SceneGIS/Scene/SceneGISPlanar"
npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"
npm run test -- --includeName "Scene/CesiumWidget"
npm run test -- --includeName "Scene/Globe"
npm run test -- --includeName "Scene/Scene"
npm run build
npm run build-release
npm run build-ts
npm run build-docs
npm run tsc
npx eslint "packages/engine/Source/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Widget/**/*.js"
npx prettier --check "packages/engine/Source/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Widget/**/*.js"
npx prettier --check --ignore-path .gitignore "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"
npx markdownlint "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
```

如果 private roles 合并导致某个 includeName 没有对应 suite，Execution Agent 必须删除
该无效命令并在结果中说明最终 suite mapping；不得以无测试命中作为通过。每条实际
命令记录 exit code、passed/failed count 和必要 warning。

### 生成与发布检查

- `SceneGISPlanarWorld` 出现在 engine root JS export、`packages/engine/index.d.ts`、
  `Source/Cesium.d.ts` 和 API HTML。
- `_SceneGISPlanarSurface`、`_SceneGISPlanarQuadtree` 和
  `_SceneGISPlanarTile` 不出现在生成 `.d.ts` 或公开 API HTML。
- development 与 release bundle 都能解析 inline shader 和 public world。
- 生成文件只作为验证结果，不进入 diff、status 或 stage。
- 不新增 `.glsl`、generated shader JS、Worker 或 runtime resource。

### 性能与资源证据

P3 是新 renderer，没有既有 frame-time baseline，因此不要求宣称性能提升。必须提供
可重复的结构性基线：

- fixture 的 viewport、camera、frustum、world extent、maximum level、SSE 和 cache
  size；
- warm frame 的 visited/culled/selected/resident/command counts；
- 下一相同 frame 的 created tile、DrawCommand、buffer、shader count delta 全为零；
- zoom-in/zoom-out 后 resident count 与 eviction count；
- destroy 后每类 owned GPU resource 的 destroyed evidence。

不得把 private debug counters 升格为 public API。若 runner/browser/GPU 使像素值存在
合理差异，使用 Cesium matcher 的 tolerance 并记录条件，不保存大型截图或日志。

### Diff 与所有权审计

- implementation diff base：
  `031159f825add33115980ada4ebfc6b8d3945ecd`。
- 只允许本计划“影响路径”中登记的 SceneGIS-owned 文件；新增路径先回写本计划。
- upstream-owned files 必须为 0。
- P3 SGP 必须为 0；`.scenegis/upstream-patches.json` 必须 unchanged。
- `Scene.js`、`CesiumWidget.js` 中既有 `SGP-0001` marker 和行为不得改变。
- generated files、Build 输出和 SpecList 不得出现在 final status。

## 风险与依赖

- `maximumSafeLevel` 可能远高于实际可渲染深度；required `maximumLevel` 和 Float32
  scale validation 是防止 zero-distance runaway 与 GPU scale collapse 的双重边界。
- 大绝对坐标仍可能暴露 camera/model-view cancellation；必须使用 large-offset pixel
  fixture，而不能只检查 JS matrix finite。
- zero-thickness OBB 是合法退化 volume，但 frustum boundary equality 容易产生边界
  regression；outside/intersecting Specs 必须包含平面恰好位于 frustum plane 的情形。
- 独立 quadtree 容易无意复制 Globe 行为。实现只保留本计划列出的固定单根、无 wrap、
  无 height/occlusion 的算法，不移植大段 upstream source。
- command、ShaderProgram cache 和 VertexArray/Buffer 的销毁协议属于 Cesium private
  renderer 依赖；每次升级都需复核 ADR checkpoint。
- inline shader 只适用于本阶段极小源码。出现共享、变体、include 或 builtin 时必须
  停止扩张并建立新的 Shader 构建决策。
- P3 没有 async readiness，不能用当前 `tilesLoaded === true` 证明 P5 loading contract
  已解决。
- public `baseColor` 暂不支持 alpha；后续透明设计必须明确 pass、sorting、depth write
  和 layer composition，不能仅放宽 validation。

## 完成条件

- ADR-0003 与实际 API/runtime 一致并保持 `approved`。
- `SceneGISPlanarWorld` 是唯一新增 public type，并结构化满足 P1 lifecycle contract。
- 程序控制的 perspective 和 orthographic Scene 在没有 Globe 时可以渲染并按 SSE
  refine/coarsen 平面。
- Level 0 单 root、maximumLevel、no wrap、ideal set 和 cache contract 均由 Specs
  锁定。
- absolute CRS coordinates 不进入 Float32 vertex buffer；local geometry、modelMatrix
  和 large-offset pixel evidence 通过。
- shared/tile-owned resources 的 lazy creation、reuse、eviction 和 destroy exactly once
  通过 WebGL Specs。
- public root export、types、docs、development/release builds 和 private hiding 通过。
- mandatory tests、WebGL validation、Globe/Scene/CesiumWidget regressions、lint、format、
  Markdown 和 diff checks 通过，或只保留已证明与 P3 无关的既有 warning。
- final diff upstream-owned files = 0、P3 SGP = 0、patch manifest unchanged、generated
  files absent。
- P3 review 为 `approved`，没有 unresolved finding；所有 finding 均有 evidence 或
  明确后继计划。
- Execution Agent 将本 plan、总体 roadmap、扩展索引和 review 回写为 completed
  状态后停止，不进入 P4。
- Architecture Agent 创建独立中文 P3 本地提交；提交完成后与项目负责人讨论 P4。

## 偏差与结果

P3 实现、执行验证与 Architecture/code re-review 均已完成。本计划与总体
roadmap 已收口为 `completed`；未进入 P4。

### 实际设计与路径

- 新增唯一 public type
  `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`。
- private roles 按计划分为
  `_private/_SceneGISPlanarSurface.js`、`_private/_SceneGISPlanarQuadtree.js` 和
  `_private/_SceneGISPlanarTile.js`；没有合并 role，constructor 标识符不带前导下划线。
- Specs 位于 `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`、
  `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceSpec.js`、
  `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarQuadtreeSpec.js`、
  `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarTileSpec.js` 和
  `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarWorldCesiumWidgetSpec.js`。
  private Spec basename 按 constructor symbol 命名，因此不带前导下划线；只有
  private source module basename 使用前导下划线。
- 单根 implicit quadtree 使用固定 NW、NE、SW、SE 遍历，先 culling 后 SSE；
  perspective/orthographic 公式、到闭合 XY rectangle 的精确距离、zero-thickness
  OBB 和 equality-does-not-refine 均由专项 Specs 锁定。
- ideal/renderable set 在 P3 同步 ready 条件下相同；LRU 仅对 unprotected retained
  tiles 计数，按 last-used frame 再 stable tile key 淘汰，`endFrame` trim。
- Surface 在首个有效 render 懒创建共享 Float32 unit quad、Buffer、
  VertexArray、ShaderProgram、RenderState 和 DrawCommand；VertexArray 拥有
  Buffer，Surface 负责 VertexArray destroy 与 ShaderProgram release，每 tile 仅保留
  model matrix/command。只接受首个 `Context`；绑定后在 `beginFrame` 和
  `render` 的任何可变状态或早退前拒绝不同 Context，但未绑定的 zero-buffer
  或 fully-culled frame 仍不建立绑定。销毁幂等性。
- SSE 先识别 Cesium 实际 frustum 类型：`PerspectiveFrustum` 使用
  `sseDenominator`，`PerspectiveOffCenterFrustum` 使用纵向 span/near，
  `OrthographicFrustum` 使用 width/aspect ratio，
  `OrthographicOffCenterFrustum` 使用 top-bottom。实际 perspective camera 不再
  因 `offCenterFrustum` getter 被误判为 orthographic。
- Shader 为 Surface file-scope JS strings，command 使用 `Pass.OPAQUE`、double-sided
  rasterization 与 depth test/write；没有新增 `.glsl`、builtin 或 build hook。
- 实现未偏离 ADR-0003 边界。private JS modules 可由现有 JS barrel 发现，
  但使用 `@private` 排除于 public declarations 和 API HTML，符合计划的 soft-private
  约束。

### 行为与资源证据

- 固定 warm fixture：extent `[-128, 128]`，`maximumLevel=3`，
  `maximumScreenSpaceError=2`，`tileCacheSize=100`，camera 在 extent center 上方
  `128 m`。修正真实 perspective SSE 后稳态为 visited `1`、culled `0`、
  selected/submitted `1`、resident `1`；下一相同帧的 created
  tile/DrawCommand/Buffer/Shader delta 均为
  `0`。
- 纯 cache fixture 在 refine 后创建 root + 4 children；`tileCacheSize=0` trim 后
  仅 4 个 protected children，eviction `1`。coarsen 后 root 变为 protected，
  `tileCacheSize=1` 只保留 stable-key 最后的 child，resident `2`、累计 eviction
  `4`。
- 1x1 WebGL pixel fixture 对默认/changed color 分别精确得到 red/blue；
  large-offset fixture 使用 minimum `1e9`、size `1024`、`maximumLevel=1`、
  camera height `256`，像素仍精确为 red，所有 tile model matrices finite。
- 3x1 orthographic fixture 相机覆盖 world extent 宽度的三倍，读回像素精确为
  black/red/black，证明 configured extent 外保持 background。真实
  `CullingVolume` 的 plane 恰好与 zero-thickness root tile 边界相切时不返回
  `OUTSIDE`。
- Surface cache fixture 先 refine 再 coarsen，累计 eviction `5`；全过程保持同一
  VertexArray/ShaderProgram，shared resource creation 仍为 `1` 且 destroy counters 均为
  `0`。
- Widget 16x16 fixture 的所有像素均为 lime，且 scene 没有 globe、skybox、
  atmosphere、Moon 或 Sun。
- destroy fixture 在 warm resources 后仅销毁 VertexArray `1`、Buffer `1`、
  release ShaderProgram `1`，tile map 清空；重复 destroy 不产生新的 release。

### 验证矩阵

| 命令                                                                              | 结果                                    |
| --------------------------------------------------------------------------------- | --------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTile"`               | Exit 0，3/3                             |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarQuadtree"`           | Exit 0，11/11                           |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`            | Exit 0，13/13                           |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`              | Exit 0，7/7                             |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarWorldCesiumWidget"` | Exit 0，1/1                             |
| `npm run test -- --webglValidation --includeName "SceneGIS/Scene/SceneGISPlanar"` | Exit 0，34/34                           |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"`       | Exit 0，16/16                           |
| `npm run test -- --includeName "Widget/CesiumWidget"`                             | Exit 0，75/75；Node `DEP0060` warning   |
| `npm run test -- --includeName "Scene/Globe"`                                     | Exit 0，119/119；Node `DEP0060` warning |
| `npm run test -- --includeName "Scene/Scene"`                                     | Exit 0，177/177；Node `DEP0060` warning |
| `npm run build`                                                                   | Exit 0                                  |
| `npm run build-release`                                                           | Exit 0                                  |
| `npm run build-ts`                                                                | Exit 0；仅有现有批量 TSD-JSDoc warnings |
| `npm run build-docs`                                                              | Exit 0                                  |
| `npm run tsc`                                                                     | Exit 0                                  |
| scoped ESLint                                                                     | Exit 0                                  |
| scoped source/spec Prettier                                                       | Exit 0                                  |
| SceneGIS Markdown Prettier                                                        | Exit 0                                  |
| SceneGIS Markdownlint                                                             | Exit 0                                  |
| `git diff --check`                                                                | Exit 0                                  |

计划原命令 `--includeName "Scene/CesiumWidget"` 不匹配当前 suite 的实际
`describe` 名，因此使用等价且真实命中 75 个 Specs 的
`--includeName "Widget/CesiumWidget"`。曾尝试并行启动三个 gulp test，它们同时
清理 `Build/CesiumUnminified` 导致 Windows `EPERM`；改为串行后上述全部
命令通过，该环境性并发失败不是产品 finding。
首次 review 前 warm-frame 计数曾记录为 85/28/36/85；P3-R001 证明这些
数字来自将真实 `PerspectiveFrustum` 误判为 orthographic 的错误公式。修正后的
有效证据是 1/0/1/1，已由 Surface Spec 直接断言；旧数字不再作为验收
证据。

### 生成、所有权与剩余风险

- `SceneGISPlanarWorld` 已出现于 engine root JS export、`packages/engine/index.d.ts`、
  `Source/Cesium.d.ts` 和 API HTML；三个 private type 不在 `.d.ts` 或 API HTML。
  生成文件未出现在 final status。
- 相对 `031159f825add33115980ada4ebfc6b8d3945ecd` 的 upstream-owned
  files = `0`，P3 SGP = `0`，`.scenegis/upstream-patches.json` unchanged，无
  `SCENEGIS_PATCH` marker。
- 剩余风险为 Cesium private renderer API 升级敏感性，以及 P4/P5 才会解决的
  camera/picking/async loading；它们均已在 ADR-0003 升级检查点或后续阶段
  边界中记录，未在 P3 扩大。
- review request：
  [2026-08-05-p3-planar-surface.md](../reviews/2026-08-05-p3-planar-surface.md)
  （`approved`）。首次 Architecture/code review 提出 P3-R001 至 P3-R003：
  真实 `PerspectiveFrustum` 被误判为 orthographic、绑定后的不同 Context 可绕过拒绝，
  以及强制的 frustum boundary/background/shared-resource eviction Specs 尚未闭合。
  三项均已修复并由 Architecture Agent 复核关闭。

P3 已通过 Architecture/code re-review，可作为独立阶段创建本地提交。P4 仍为
`pending`，必须先与项目负责人讨论并形成阶段计划，不能由本计划自动授权实施。
