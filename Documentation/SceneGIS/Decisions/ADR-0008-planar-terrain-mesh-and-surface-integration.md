# ADR-0008：平面地形 Mesh、Surface 集成与最小加载契约

## 状态

- Status：`approved`
- Date：`2026-08-07`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-terrain/plans/2026-08-07-phase-t2-terrain-surface.md`
- Related patch：无；T2 只允许修改 SceneGIS-owned files

## 上下文与源码事实

T1 已通过 ADR-0007 建立独立的 `SceneGISPlanarTerrainProvider`、
`SceneGISPlanarTerrainData` 和 `SceneGISPlanarHeightmapTerrainData`。Provider 使用 world 的
canonical `SceneGISPlanarTilingScheme`、米制高程和几何误差，并以 Promise 返回通用
TerrainData；Heightmap 固定 north-to-south、west-to-east row-major 与 SW→NE 三角插值。

当前 planar surface 仍是同步 Z=0 平面：

- `SceneGISPlanarTile` 在创建时固定零厚度 OBB、由 OBB 派生的 command sphere、unit-quad
  `modelMatrix` 和一个可复用 `DrawCommand`；
- `SceneGISPlanarQuadtree` 以 tile extent、`abs(camera.z)` 和固定
  `worldWidth / (256 * 2 ** level)` 计算距离与 SSE；
- `SceneGISPlanarSurface` 共享一份 unit quad、render state 和按 imagery layer count 缓存的
  shader，并让每个 ideal tile 只提交一个 opaque command；
- planar imagery 的 UV 已由 tile-local `position.xy + 0.5` 得到，因此只要 terrain mesh
  保持同一局部 XY 语义，就可以贴附在真实高程 geometry 上；
- normal render 是 selection、request、GPU、command cache 和 LRU mutation 的唯一通道，
  pick+depth pass 只重放最近 normal render 的 command references。

Cesium 1.144 的官方 terrain mesh 流程不能整体复用：`HeightmapTerrainData.createMesh`、
`HeightmapTessellator`、`TerrainMesh` 和相关 Worker 依赖 geodetic `Rectangle`、`Ellipsoid`、
terrain encoding 与 horizon 数据。另一方面，`TerrainProvider.getRegularGridIndices(width,
height)` 只生成规则网格索引，不读取球面状态；其三角形使用 SW→NE 对角线并根据 vertex
count 选择 `Uint16Array` 或 `Uint32Array`，可以作为窄小的坐标无关工具复用。

World 在构造时创建自己唯一的 canonical tiling scheme。严格 identity 规则意味着调用方在
World 构造前无法创建合法 provider，因此 `terrainProvider` 不能同时作为普通构造参数和
canonical identity API；应先创建 World，再用 `world.tilingScheme` 创建并挂载 provider。

## 决策

### World 的 `terrainProvider` 属性

`SceneGISPlanarWorld` 增加公开可写属性：

```text
terrainProvider: SceneGISPlanarTerrainProvider | undefined
```

- 初始值为 `undefined`，表示现有 Z=0 flat surface；T2 不增加同名 constructor option。
- 推荐组装顺序是先创建 World，再用 `world.tilingScheme` 创建 provider，最后赋值。
- 赋值 `undefined` 恢复 flat surface；重复赋值同一 provider 是 no-op。
- provider 始终 caller-owned。World、surface、tile 和 runtime 不调用 provider 的
  `destroy`，也不把 provider 是否可销毁加入结构契约。
- setter 必须先完成全部 preflight，再改变当前 provider、请求、command 或 GPU 状态；无效
  provider 抛出 `DeveloperError` 且旧画面与资源保持不变。

T2 attachment preflight 要求：

- `provider.tilingScheme === world.tilingScheme`；数值相等或相同 CRS 不能替代 identity；
- `minimumHeight`、`maximumHeight` 有限且有序；其相对 range 必须能够形成有限 bounds 和
  Float32 relative-height vertex；
- `maximumLevel` 是不超过 tiling scheme safe level 的非负整数，并且 T2 暂时要求
  `provider.maximumLevel >= world.maximumLevel`；
- `errorEvent`、`credit`、request 和 availability methods 满足 ADR-0007；
- 对 `0..world.maximumLevel` 的 `getLevelMaximumGeometricError` 结果一次性读取、验证并缓存；
  每项必须有限、非负且随 level 不增加。

T2 不通过 `min(world.maximumLevel, provider.maximumLevel)` 静默降低 surface/imagery LOD，
也不在 provider level 不足时让高层 imagery tile 丢失 terrain。T3 引入明确的 ancestor/
upsample policy 后才可以放宽这个临时限制。

### T2 支持的数据类型

Provider 继续返回通用 `SceneGISPlanarTerrainData`，但 T2 renderer 只内置
`SceneGISPlanarHeightmapTerrainData` adapter。其他 concrete TerrainData 进入 runtime 时按
provider tile failure 处理，不把 Heightmap 固化进 Provider 返回类型。

Heightmap concrete type 增加一个标记为 `@private` 的精确 sample access seam，供 SceneGIS
terrain mesh builder 读取构造期已验证的 decoded height。它不公开 raw buffer，不进入正式
类型声明或 API HTML，也不是调用方兼容性承诺。mesh builder 不通过世界坐标反向调用
`interpolateHeight`，避免完整 CRS 下的坐标往返舍入和重复四点解码。

### Tile-local terrain mesh

新增 SceneGIS-owned private Renderer mesh role。每个 Heightmap sample 生成一个
Float32 position：

```text
localX = column / (width - 1) - 0.5
localY = 0.5 - row / (height - 1)
localZ = decodedHeight - referenceHeight
```

`referenceHeight` 使用 tile accurate min/max 的 overflow-safe midpoint。tile `modelMatrix`
把 X/Y 分别缩放到 extent width/height，并平移到完整 CRS tile center 与
`referenceHeight`。因此绝对 X/Y 和可避免的绝对 Z 不进入 Float32 vertex buffer。

每个 local coordinate 和相对高度必须在 Float32 中保持有限；无法表示的 TerrainData 作为
tile failure 报告，不能上传 Infinity/NaN。T2 保留 TerrainData 与 CPU mesh，由 tile cache
共同管理；T3 再依据 Worker、byte budget 和查询需求决定复制、转移或释放策略。

规则网格索引复用 `TerrainProvider.getRegularGridIndices(width, height)`。它是 T2 唯一复用
的官方 terrain helper；T2 不创建或使用官方 `TerrainMesh`、`HeightmapTessellator`、
`TerrainEncoding`、skirt helper 或 terrain Worker。

### 三维 bounds、距离与 SSE

tile 的 selection OBB 改为轴对齐的完整三维范围：

```text
[minimumX, maximumX] × [minimumY, maximumY] × [minimumHeight, maximumHeight]
```

- 无 provider 与 terminal flat fallback 使用 `[0, 0]`；
- terrain pending 使用 provider global range 与 `0` 的并集，保守包含 potential terrain 和
  当前实际绘制的 flat fallback；
- terrain READY 后使用该 TerrainData 的准确 min/max；
- provider replacement 先把 resident tiles 恢复为新 global fallback range，再允许下一次
  selection。

OBB、由其派生的 command BoundingSphere 和 modelMatrix 使用原对象更新，不能形成逐帧
allocation。DrawCommand 的 command sphere 继续只负责 near/far fitting；quadtree visibility、
distance 和 SSE 继续使用 exact OBB/height interval。

透视距离改为 camera 到上述闭合三维 AABB 的准确最近距离。相机位于高度区间内时 Z 距离为
零；相机在地形上方或下方使用相同公式，不增加“Camera 必须在 terrain 上方”的约束。
正交 SSE 仍与 camera distance 无关。

有 provider 时每层误差为：

```text
max(
  worldWidth / (256 * 2 ** level),
  provider.getLevelMaximumGeometricError(level)
)
```

nominal error 保留现有 flat/imagery LOD；terrain error 可以进一步推动细化。无 provider 时
使用现有公式和快速路径。

### 最小 terrain runtime

新增 SceneGIS-owned private Scene runtime，每个 surface tile 最多持有一个当前 provider
generation 的 terrain entry：

```text
UNLOADED -> LOADING -> RECEIVED -> READY
                 \--------------> FAILED
```

- `UNLOADED`：尚未请求或 provider 返回 `undefined` 表示调度暂缓；
- `LOADING`：持有 `RequestType.TERRAIN` request 与 Promise；
- `RECEIVED`：Promise 已返回 TerrainData，但尚未在 normal render 建立 mesh/GPU；
- `READY`：持有可提交的 CPU mesh 与 VertexArray；
- `FAILED`：当前 attempt terminal，使用 Z=0 flat fallback。

`getTileDataAvailable(...) === false` 直接形成 settled flat fallback，不发起请求也不报告
provider error；`true` 或 `undefined` 允许请求。T2 不主动调用
`loadTileDataAvailability`，也不消费 parent `childTileMask`；这些属于 T3。

request synchronous throw、Promise rejection、unsupported TerrainData、range mismatch、mesh
validation 和 GPU upload failure 通过 provider `errorEvent` 报告。真实 Cesium `Event` 使用
`TileProviderError.reportError/reportSuccess`，structural event 保持与 planar imagery 相同的
`addEventListener/raiseEvent` seam。listener 设置 `retry` 后 entry 在后续 normal frame 回到
`UNLOADED`，不能在错误回调中递归重试。

Promise completion 只把当前 generation entry 转为 `RECEIVED` 或 `FAILED`。selection、mesh、
GPU、bounds、command、LRU 和最终 readiness 只在 normal render 发生。tile eviction、provider
replacement、detach 和 world destroy 递增 generation、取消 request 并忽略迟到结果。
TerrainData 没有 destroy contract，stale result 直接释放引用并交给 GC。

### Surface 与 imagery 组合

normal render 顺序固定为：

1. 校验 Context、provider 与 shown imagery layer；
2. quadtree 依据当前三维 bounds 和 effective error 选择 ideal tiles；
3. terrain runtime 推进这些 ideal tiles；
4. imagery runtime 继续绑定同一 ideal tile set；
5. 每个 tile 在 READY terrain geometry 与 Z=0 flat fallback 中二选一；
6. 提交每 tile 一个 opaque command，并汇总 terrain/imagery readiness 与 Credit。

现有 surface vertex/fragment shader 不变。terrain local XY 与 unit quad 一致，UV 仍由
`position.xy + 0.5` 得到，所以 imagery 在同一个 command 中采样真实 terrain geometry，不能
提交第二个重叠 imagery plane。

tile 尽量复用既有 DrawCommand；normal render 可以更新它的 `primitiveType`、VertexArray、
count、modelMatrix 和 bounds：flat 使用 shared `TRIANGLE_STRIP` quad，terrain 使用 indexed
`TRIANGLES`。provider replacement/detach 必须先清空 replay cache，再销毁旧 terrain VA，避免
pick/depth pass 重放失效资源。

`passes.pick && passes.depth && !passes.render` 继续只重放最近 normal render 缓存的相同
command references，不推进 terrain 状态或产生任何 mesh/GPU/LRU mutation。现有
`scene.pickPosition` 自然反映 rendered terrain depth；`SceneGISPlanarWorld.pick`、
`pickFromWindowPosition` 和 camera controller 继续保持 Z=0 reference-plane 语义。

### GPU 与 CPU 所有权

- tile terrain entry 拥有 Request、TerrainData 引用、CPU mesh 和 terrain VertexArray；VA
  destroy 负责其独占 vertex buffer；
- terrain runtime 按 `width × height` 拥有共享 GPU index buffer；tile VA 不得销毁它；
- surface 继续拥有 flat unit quad、shader cache、render state 与 transparent texture；
- DrawCommand 与 model/bounds objects 仍属于 tile record，不作为独占 GPU resource destroy；
- provider replacement/detach 先释放所有 tile terrain entry，再释放 runtime shared index
  buffers；world destroy 遵循相同 exactly-once 顺序；
- provider、TerrainData credits 和 waterMask 不由 GPU runtime 销毁。T2 不使用 waterMask。

同一个 world 仍绑定单一 Context。terrain path 不能绕过 surface 已有的 second-Context
fail-fast，也不能在 zero drawing buffer、hidden world 或无 selected tile 时创建 GPU 资源。

### `tilesLoaded` 与 Credit

`SceneGISPlanarWorld.tilesLoaded` 继续表示最近 normal render 的当前视图是否 settled：

- selected terrain entry 为 `UNLOADED`、`LOADING` 或 `RECEIVED` 时 terrain 未完成；
- `READY`、known unavailable 或无 retry 的 terminal `FAILED` 为 settled；
- terrain 与所有 shown imagery 都 settled 时 surface 才 loaded；
- hidden world、zero drawing buffer 或无 selected tile 保持 loaded；
- provider replacement/attach 使下一 normal frame 重新评估，不能用旧 view 结果提前完成。

provider-level Credit 在当前视图使用该 provider 时显示；READY selected tile 的
TerrainData credits 同时显示。重复 Credit 继续交给 Cesium `CreditDisplay` 去重。

### Flat fast path

无 provider 时不创建 terrain runtime、entry、request、CPU mesh、terrain VA 或 index buffer。
现有 unit quad、imagery、SSE、command identity、depth replay、cache 和 warm-allocation 行为必须
保持。TerrainData 字段只在 provider 实际挂载后按 tile lazy materialize。

## T2 与 T3 的边界

T2 使用 Z=0 ideal-tile fallback 保持覆盖，但不承诺：

- ready ancestor terrain fallback、父子 replacement 或 heightmap upsampling；
- 邻接层级平衡、skirt 或其他 crack suppression；
- provider maximum level 低于 world maximum level；
- availability metadata 主动加载或 parent child-mask 协调；
- Worker mesh、每帧 mesh budget、复杂 request priority 或 byte-based cache；
- terrain normals、lighting、water、material、terrain query 或 ray picking。

因此 T2 允许 flat tile 逐块替换为 terrain，并允许 mixed-LOD 或 failed fallback 边界暂时出现
高程裂缝。T3 必须在真实 runtime 基础上重新设计连续 coverage；T2 测试不得把同层确定性场景
误报为跨 LOD 无缝已经完成。

## 不采用的方案

### 把 provider 直接作为 World constructor option

不采用。调用方在 World 创建前拿不到其 canonical tiling scheme；让 World 采用等值但不同
identity 的 provider scheme 会重新打开 ADR-0002 的 canonical ownership。显式 setter 顺序更
清楚，也支持后续 replacement。

### 复用官方 TerrainMesh、HeightmapTessellator 或 Worker

不采用。它们的输出与调度携带 ellipsoid、rectangle、encoding、horizon 和 build/runtime URL
协议。T2 的三维笛卡尔规则网格不需要这些语义。Worker 只有在 T3 的真实 mesh scheduling
需求出现后才设计。

### terrain 未 ready 时不提交 geometry

不采用。这样会在异步加载期间产生孔洞，也使 imagery 没有承载 surface。T2 使用 Z=0 flat
fallback；T3 再用 ancestor/upsample 改善连续性。

### 用 provider maximum level 静默 clamp quadtree

不采用。这会同时降低 imagery LOD，却让公开 `world.maximumLevel` 仍显示原值。T2 选择
fail-fast；T3 以明确 upsample/fallback policy 放宽。

### 为 terrain 增加第二个 imagery command 或新 Shader

不采用。现有 local XY 和 shader 已能在同一 geometry 上生成 UV。第二平面会导致深度冲突，
新 Shader build seam 在 T2 没有真实必要性。

## 兼容性、构建与升级

T2 只新增或修改 SceneGIS-owned Core、Renderer、Scene、Specs、Documentation 和 AgentDocs。
预计 upstream-owned files=`0`、T2 SGP=`0`，不修改 `.scenegis/upstream-patches.json`、
`SGP-0001` 或 `SGP-0002`。

`terrainProvider` 是新的公共 World property，必须进入 engine/Cesium root declarations 与 API
docs。private mesh/runtime 和 Heightmap sample seam 不得进入 public `.d.ts` 或 API HTML。
T2 不增加 GLSL、Worker、静态资源、Sandcastle 或发布路径；development/release build 只验证
普通 JS bundling 与现有 shader strings。

Cesium 升级时复核：

- `TerrainProvider.getRegularGridIndices` 的三角方向、typed-array threshold 和缓存语义；
- Buffer、VertexArray 与 non-destroyable shared index buffer ownership；
- DrawCommand 在 normal/depth replay 间的 mutable field 与 command reference 行为；
- `RequestType.TERRAIN`、Request cancellation 和 `TileProviderError` retry；
- `CreditDisplay.addCreditToNextFrame` 去重；
- OBB、BoundingSphere、UniformState model-view 与大坐标处理；
- upstream 是否出现不依赖 ellipsoid/cartographic 的真正通用 terrain mesh/runtime。

## 测试原则

- CPU mesh 锁定 sample 方向、SW→NE indices、正负高程、rectangular grid、relative-height 与
  EPSG:3857 tile-local precision；
- provider/runtime 锁定原子 attachment、request transition、retry/cancel/stale generation、
  replacement、eviction、destroy 和 caller ownership；
- quadtree 锁定三维 visibility/distance、effective error 与 perspective/orthographic/below-terrain
  camera；
- WebGL 锁定 non-flat geometry、同一 command imagery drape、rendered depth、large offset、
  command replay、single Context、warm allocation 与 exactly-once GPU release；
- flat path 锁定 zero terrain allocation 和既有 imagery/navigation/depth behavior；
- 测试使用小型确定性本地数据，只覆盖足以证明契约的代表场景，不建立无收益的极端矩阵；
- T2 不要求 Sandcastle、E2E、外网 DEM、Worker 或跨 LOD 无缝视觉证明。
