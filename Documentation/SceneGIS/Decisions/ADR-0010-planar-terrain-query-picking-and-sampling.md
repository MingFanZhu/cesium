# ADR-0010：平面地形驻留查询、Terrain Picking 与独立采样

## 状态

- Status：`approved`
- Date：`2026-08-07`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-terrain/plans/2026-08-07-phase-t4-terrain-query-and-picking.md`
- A1 successor：`2026-08-10`，[ADR-0024](ADR-0024-planar-terrain-aware-navigation-anchors.md)
  允许controller私有使用terrain query作为rendered-depth miss后的fallback；public terrain与Z=0 API不变
- Related patch：无；T4 只允许修改 SceneGIS-owned files

## 上下文与源码事实

T3 checkpoint `8c72ac3ef76071da24fad820bf3b75cb4899127b` 已建立 desired/load/render
分层、完整四子门禁、direct/fallback/active content、逐级 Heightmap upsample、skirt、
deterministic tile cache 和 exactly-once terrain resource lifecycle。当前每个 active terrain
content 保留：

- caller/provider 返回或 SceneGIS upsample 生成的 `TerrainData`；
- 实际上传 GPU 的 tile-local Float32 `mesh.positions`；
- surface 与 skirt 共用的 `mesh.indices`，以及明确的 `surfaceIndexCount`；
- tile extent、model matrix、surface height range 和 command height range。

Quadtree cache 使用稳定 `level/x/y` key，但只有 `getOrCreateTile`；读取查询若调用它会产生 tile、
改变 debug count 并扩大 cache。`_renderTiles` 表示本次 normal render 的实际不重叠 cover，但会在
下一次 `beginFrame` 清空，不能直接作为跨帧公共 picking snapshot。

现有三个拾取边界已经稳定：

- `SceneGISPlanarWorld.pick` 与 `pickFromWindowPosition` 是 render-independent、有界 Z=0
  reference-plane intersection；
- `SceneGISPlanarCameraController` 只使用上述 Z=0 能力维持既有导航；
- `scene.pickPosition` 使用 Cesium rendered depth，可能命中 terrain、skirt、Entity、Primitive 或
  其他 frontmost geometry。

Cesium 1.144 的球面实现提供以下启发，但不能直接复用：

- `Globe.getHeight` 沿已驻留 quadtree 寻找包含位置的最深 `renderedMesh`，可以读取已 culled 但仍
  驻留的 mesh；它不是“当前屏幕 LOD”的查询；
- `Globe.pick` 只在当帧实际 rendered tiles 上做 broad phase，再调用 mesh picking；
- `TerrainPicker` 依赖官方 `TerrainEncoding`、SceneMode/projection，并会惰性启动 Worker 构建空间
  结构，不适合直接接入真正的平面 mesh；
- `sampleTerrain` 按 tile 聚合位置、独立请求 provider，并通过 `TerrainData.interpolateHeight`
  采样；它不依赖 Globe cache。

T4 需要同时提供驻留查询、render-cover terrain picking 和独立 provider sampling，但不能让三者
互相隐式回退，也不能让读取操作推进 T3 的 selection、request、promotion、LRU 或 GPU 状态。

## 决策

### 公共 API

`SceneGISPlanarWorld` 增加：

```text
world.getTerrainHeight(position)
world.pickTerrain(ray, result)
world.pickTerrainFromWindowPosition(windowPosition, scene, result)
```

`SceneGIS/Core` 增加非实例化公共工具 `SceneGISPlanarTerrainSampler`：

```text
SceneGISPlanarTerrainSampler.sampleAtLevel(
  terrainProvider,
  level,
  positions,
  rejectOnTileFail = false,
)
```

这些 API 不加入 generic `SceneGISWorld` structural lifecycle contract，也不要求未来其他 world
类型提供相同 terrain 语义。

### 驻留高度查询

`world.getTerrainHeight(position)` 接受 finite `Cartesian3`。X/Y 用于定位，Z 必须 finite 但不参与
寻址。finite extent 外位置返回 `undefined`；无 terrain provider、无覆盖该位置的驻留 terrain
mesh 或 world 已销毁分别返回 `undefined` 或按既有 destroy contract 抛 `DeveloperError`。

查询从 `world.maximumLevel` 向 Level 0 沿 canonical owner address 查找，不扫描无关 tile，也不创建
缺失 tile。内部 X boundary 归 east tile、Y boundary 归 south tile，四条 world outer boundary
inclusive，继续服从 ADR-0002。

第一个具有 active terrain mesh 的 resident tile 是结果来源：

- `DIRECT` 与 `UPSAMPLED` 都是合法 terrain source；
- `FLAT` 不是 terrain data，不能返回 0 冒充已知地形；查询继续尝试 ancestor，仍无 mesh 时返回
  `undefined`；
- tile 可以是 visible、culled、bridge 或普通未驱逐 cache entry，因此结果不保证等于当前屏幕正在
  使用的 LOD；
- 查询不更新 `lastUsedFrame`、protected set、LRU 或 `tilesLoaded`。

高度从 active mesh 的 Float32 surface vertices 和实际 surface indices 计算，不重新调用原始
Heightmap 的 double-precision sample，也不使用 bilinear interpolation。这样 resident result 与
真正上传 GPU 的 regular-grid 三角面一致。Skirt vertices/indices 不参与高度查询。

### Terrain ray picking

`world.pickTerrain(ray, result)` 是 render-dependent 的 world-space terrain intersection：

- ray origin/direction 与结果均使用完整米制 `Cartesian3`；direction 必须 finite、non-zero，但无需
  normalize；
- 使用最近一次成功 normal render 完成后固化的实际 render-cover snapshot；视图外 resident cache
  不参与；
- provider attach/replacement/detach、world 隐藏、zero drawing buffer、无 submitted cover、destroy
  或下一次 normal render 失败前的明确失效点必须清空 snapshot；
- 对 snapshot 中所有候选 tile 先做无分配 broad phase，再使用 active mesh 的 Float32 positions 与
  `surfaceIndexCount` 内的实际 indices 求精确 triangle intersection；
- 支持从地形上方或下方射入，不 cull back faces；`t=0` 是合法 hit；返回最近的 non-negative hit；
- mixed-LOD boundary 的相同距离使用稳定 tile key 作为 deterministic tie-breaker；
- skirt 只是 crack mask，不属于语义地形，不能被 `pickTerrain` 返回。

Snapshot 中的 `FLAT` cover 参与最近 surface occlusion 判断，但不作为 terrain result 返回。如果 ray
最近命中的是 flat fallback，结果为 `undefined`，不能穿过它返回更远 terrain，也不能把该 Z=0 点
作为 terrain hit。这既保持当前画面 cover 顺序，也避免把 reference plane 隐式并入 terrain API。

Snapshot 只保存可复用 tile/content references，不复制 CPU mesh、不创建 GPU resource，也不得在
steady frame 产生新的每帧对象。若 content identity/revision 与 snapshot 不一致，该 entry 视为失效，
不能读取已替换或已释放资源。

### Window terrain picking

`world.pickTerrainFromWindowPosition(windowPosition, scene, result)` 使用 ADR-0004 已验证的 SceneGIS
private four-frustum helper构造 world ray，再委托 `pickTerrain`：

- 参数顺序、scene/world/SCENE3D/liveness validation、zero-sized canvas 和 result reuse 与现有
  `pickFromWindowPosition` 保持一致；
- 不调用或 monkey patch `Camera.getPickRay`；
- 不触发 color、pick 或 depth render，也不把 `scene.pickPosition` 作为 fallback。

### Mesh query role

T4 增加 SceneGIS-owned private mesh query role，职责限定为：

- 对 regular-grid Float32 surface 做单点 triangle height；
- 把 world ray 以 tile model 的同一 affine parameter 转入 local space；
- 对 surface indices 做 broad/precise intersection并复用 scratch/result；
- 明确排除 skirt index range。

Resident height 使用 regular-grid cell 定位后只测试该 cell 的实际两个 index triangles，避免每次查询
扫描整个 mesh。Ray picking 首版允许在 tile broad phase 后线性检查该 tile 的 surface triangles；它
是低频 pointer/query path，不进入 normal-render hot path。T6 只有在 profiling 证明必要时才增加
BVH、grid DDA 或 Worker acceleration；不得为 T4 复制官方 `TerrainPicker`。

### 独立异步采样

`SceneGISPlanarTerrainSampler.sampleAtLevel` 使用 provider 自己的 canonical
`SceneGISPlanarTilingScheme`，不要求 provider 已挂载到 World。它接受一个显式 level 和
`Cartesian3[]`，返回与输入等长、顺序一致的 `Promise<Array<number|undefined>>`，不修改输入
positions 或其 Z。

调用前必须在任何 provider request 前完整验证：

- provider 与其 tiling scheme、height range、maximum level 以及所需 request/availability methods；
- level 是 `0..provider.maximumLevel` 内的整数；
- positions 是数组，且每项为 finite `Cartesian3`。

每次调用按 canonical `level/x/y` 聚合 positions：

1. extent 外 position 直接对应 `undefined`，不发请求；
2. `getTileDataAvailable === false` 对应 `undefined`；
3. availability 未知时最多执行一次 `loadTileDataAvailability`，完成后重新检查；仍未知或该方法
   返回 `undefined` 时 optimistic request；
4. 每个 unique tile 创建独立 `RequestType.TERRAIN` request；provider 返回 `undefined` 表示调度
   延迟，使用私有延迟再次尝试，不 busy-poll，具体 delay 不属于公共兼容契约；
5. 成功 TerrainData 必须具有 finite、ordered 且位于 provider range 内的高度，以及可调用的
   `interpolateHeight`；tile 内采样必须返回 finite height；
6. 一个 tile 的所有位置共享请求结果，但输出仍保持原输入顺序。

`rejectOnTileFail=false` 时，known unavailable、request rejection、sync throw、无效 TerrainData 或
无效 tile-interior interpolation 只把该 tile 对应高度设为 `undefined`，其他 tile 继续完成。
`rejectOnTileFail=true` 时上述运行时 tile failure reject 整体 Promise。Programmer-error preflight
始终使用 `DeveloperError`，不因该 flag 降级。

Sampler 不 raise provider `errorEvent`、不采用 World runtime retry state、不执行 upsample/ancestor/
flat fallback、不使用或污染 World cache，也不拥有或销毁 provider/TerrainData。它只拥有本次调用
的临时分组、Request 与 Promise。T4 不增加跨调用 cache、public cancellation 或
`sampleMostDetailed`；provider 永久返回 scheduling `undefined` 时 Promise 可能保持 pending，与该
provider scheduling contract一致。

独立 sampler 使用 `TerrainData.interpolateHeight`，因此保证与 TerrainData 声明的 SW→NE triangle
topology 一致，但不承诺与某个未来 GPU mesh 的 Float32 round-off bit-identical。需要当前驻留 GPU
mesh 语义时必须使用 `getTerrainHeight`。

### 四类结果的职责边界

| API                                          | 数据来源                             | 是否依赖 render | 是否包含对象/Skirt | 缺失时是否回退 Z=0 |
| -------------------------------------------- | ------------------------------------ | --------------- | ------------------ | ------------------ |
| `world.pick`                                 | bounded mathematical reference plane | 否              | 否                 | 本身就是 Z=0       |
| `world.getTerrainHeight`                     | 最深 resident active terrain mesh    | 仅依赖先前加载  | 否                 | 否                 |
| `world.pickTerrain`                          | 最近 normal-render terrain cover     | 是              | 否；Skirt 排除     | 否                 |
| `scene.pickPosition`                         | frontmost rendered depth             | 是              | 是，取决于画面     | 不适用             |
| `SceneGISPlanarTerrainSampler.sampleAtLevel` | provider 指定 level TerrainData      | 否              | 否                 | 否                 |

T4阶段的Camera Controller未切换到terrain API；后续ADR-0024仅在controller私有anchor chain中把它作为
rendered-depth miss后的fallback。Viewer selection与既有`world.pickFromWindowPosition`均不切换到terrain
API，也不增加相机碰撞、Entity clamp、自动request render、地下导航或programmatic terrain flight。

## 不采用的方案

### 把既有 `world.pick` 改为 terrain-aware

拒绝。它会静默改变 P4/P7 navigation target、边界拖动和地下模式的 reference-plane contract，也会
让一个原本 render-independent 的 API 依赖异步 cache。

### 用 `scene.pickPosition` 实现 terrain picking

拒绝。Depth result 取 frontmost rendered object，并可能命中 skirt；它还依赖 depth support 和当前
framebuffer。Terrain picking 必须只返回 world terrain triangles。

### 驻留高度只调用 `TerrainData.interpolateHeight`

不采用。T2/T3 真正渲染的是 tile-local Float32 positions；在大 CRS、relative height 或 sample
rounding 下，重新读取原始 encoded height 会绕过实际 mesh 表示。Resident query 以 mesh 为准。

### Terrain picking 扫描整个 resident cache

拒绝。那会拾取未显示、culled 或更高 LOD cache tile，与当前画面 cover 不一致。只有
`getTerrainHeight` 使用 resident cache；ray picking 使用 normal-render snapshot。

### T4 直接复用官方 `TerrainPicker`

拒绝。它依赖 TerrainEncoding、SceneMode/projection 和 Worker acceleration，会重新打开当前明确
延迟的 Worker build/runtime 决策。T4 使用小型平面私有 query role。

### 同时增加 `sampleMostDetailed`

延期。当前 provider 只有 per-tile tri-state 与 lazy metadata，没有官方 `TileAvailability` 等价物。
在 T5 concrete provider 前猜测最高可用层会造成不必要的逐级请求和不稳定语义。

### Sampler 原地修改 `Cartesian3.z`

不采用。失败时把 `undefined` 写入 `Cartesian3.z` 会破坏其 finite vector 语义，并使同一输入数组
难以并发复用。T4 返回独立 height array，同时保持 positions caller-owned、unchanged。

## 兼容性、所有权与构建

T4 只新增或修改 `packages/engine/Source/SceneGIS/**`、对应 SceneGIS Specs、Documentation 和
AgentDocs。预计 upstream-owned files=`0`、T4 SGP=`0`，不修改
`.scenegis/upstream-patches.json`、`SGP-0001` 或 `SGP-0002`。

`SceneGISPlanarTerrainSampler` 与三个 World method 必须进入 engine/Cesium root exports、types 和
API docs。Private query role 不得进入 public declarations/API HTML。T4 不增加 Shader、Worker、
static resource、Sandcastle、widgets 或 release path。

Resident/query snapshot 不拥有 TerrainData、mesh 或 GPU resource；所有资源继续由 T3 tile/runtime
释放。独立 sampler 不销毁 caller-owned provider 或其返回 data。Query 与 sampler 都不能改变
normal render command cache 或 depth replay references。

## 测试与最小验证

- Resident height：direct、upsampled、flat/no-mesh、deepest canonical tile、extent boundary、result
  与实际 Float32 triangle，以及一个 EPSG:3857 large-offset fixture。
- Mesh/ray：上方、下方、non-normalized direction、nearest hit、result reuse、flat front occlusion、
  skirt exclusion 和 stable boundary tie。
- Snapshot：无 prior render、normal render完成、hidden、zero buffer、provider replacement/detach、
  content revision mismatch 与 destroy；查询前后 selection/request/promotion/LRU/GPU counters不变。
- Window：复用既有 four-frustum helper，只补一个 perspective 与一个 orthographic integration
  representative，不重复 P4 已有完整 frustum matrix。
- Async sampler：preflight atomicity、same-tile grouping、extent 外、availability false、一次 metadata、
  scheduling defer 后成功、默认局部 failure 与 reject-on-fail、输入不变。
- WebGL：一个 deterministic terrain point 证明 `getTerrainHeight`、`pickTerrainFromWindowPosition`
  与无遮挡 `scene.pickPosition` 在合理 depth tolerance 内闭环，同时同 ray `world.pick` 仍为 Z=0。
- 只运行受影响的 SceneGIS Core/query/World/terrain Widget、一个 navigation regression，以及
  build/types/docs/static checks；不要求 Globe/Viewer/full-repo/Sandcastle/E2E 或性能矩阵。

## 升级检查点

每次 Cesium 升级复核：

- `TerrainProvider` regular-grid/skirt index order 与 `surfaceIndexCount` 假设；
- `IntersectionTests.rayTriangleParametric` 对 non-normalized ray、back-face 与 `t=0` 的语义；
- `Request`、`RequestType.TERRAIN` 和 provider scheduling `undefined` 行为；
- `Scene.pickPosition` depth replay 与 World normal-render lifecycle 顺序；
- upstream `Globe.getHeight`、`Globe.pick` 或 terrain picker 是否出现真正不依赖 ellipsoid、
  TerrainEncoding、projection 和 Worker 的通用抽象。

只有 upstream 抽象能保持完整 planar Cartesian、double-sided、skirt-excluded 和 no-mutation 语义时，
才评估替换 SceneGIS private query role。
