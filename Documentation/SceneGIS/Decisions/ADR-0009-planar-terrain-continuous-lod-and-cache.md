# ADR-0009：平面地形连续 LOD、上采样与缓存契约

## 状态

- Status：`approved`
- Date：`2026-08-07`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-terrain/plans/2026-08-07-phase-t3-terrain-continuous-lod.md`
- Related patch：无；T3 只允许修改 SceneGIS-owned files

## 上下文与源码事实

T2 checkpoint `e0959172e84d4e49c254b38fa45184027c22e39d` 已建立：

- caller-owned `SceneGISPlanarTerrainProvider` attachment、replacement 与 detach；
- tile-local Heightmap Float32 mesh、三维 OBB/SSE 和 terrain/imagery single command；
- `UNLOADED -> LOADING -> RECEIVED -> READY/FAILED` 的最小 terrain runtime；
- request retry/cancel/generation isolation、shared regular-grid index buffer 和 tile-owned VA；
- normal render mutation、pick+depth exact command replay 和无 provider flat fast path。

T2 的 quadtree 仍只计算一个 ideal leaf set。每个 ideal tile 在自己的 direct terrain 未 READY
时绘制 Z=0 shared quad，因此虽然没有 geometry hole，却会逐 tile 从 flat 跳到 terrain，不能保持
已有祖先地形细节，也没有跨 LOD crack suppression。Terrain runtime 尚未调用
`loadTileDataAvailability`、不读取直接父数据的 child mask，也没有 upsample、父子 replacement、
每帧 promotion budget 或 ref-counted shared-index eviction。

Cesium 1.144 的球面实现提供了可借鉴但不能整体复用的事实：

- `GlobeSurfaceTile.prepareNewTile` 先读取 provider availability；provider 未知时可读取直接父级
  TerrainData 的 child availability；
- terrain direct failure 可以从直接父级逐层 upsample；官方 Heightmap 也只允许一次跨一级；
- `QuadtreePrimitive` 在后代未完整 renderable 时保留祖先，避免 detail loss 和孔洞；
- `TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices(width, height)` 只依赖规则网格
  topology，可提供与坐标形态无关的 skirt indices 与有序 edge indices；
- Globe 的完整 traversal、terrain fill、ellipsoid bounds、horizon、geodetic mesh/Worker 和 imagery
  detail policy 携带球面语义，不能复制为真正的平面 runtime。

当前 SceneGIS planar imagery 已有逐 layer desired/ancestor fallback。只要 imagery 绑定本帧实际
render terrain tiles，父级影像就能在新的子 terrain geometry 上继续覆盖，不需要第二个 imagery
plane 或新 shader。

## 决策

### Desired、load 与 render 集合分离

`SceneGISPlanarQuadtree` 把原来的单一 ideal leaf 结果拆成三个职责：

- **desired tiles**：由 visibility、SSE 和 `maximumLevel` 决定的当前视图目标叶集合；
- **load tiles**：达到 desired coverage 所需的 root、祖先、直接子节点和 desired tiles；
- **render tiles**：本帧真正提交 command 的不重叠完整覆盖。

Desired traversal 仍使用现有 planar extent、三维 height interval 和 perspective/orthographic SSE，
不引入 ellipsoid、horizon 或 Globe tile provider。Terrain readiness 不改变“需要什么细节”，只决定
“当前可以安全绘制到什么细节”。

### 完整四子门禁与单层覆盖

当一个可见父 tile 需要细分时，其四个直接子 tile 必须全部至少拥有一种可渲染 content，父级
才允许退出 render cover：

```text
parent rendered
    |
    | all four direct children renderable
    v
parent removed + visible child subtrees rendered
```

- 门禁未满足时只绘制父 tile，不提交部分 children；
- 门禁满足的 normal render frame 中先确定完整 child cover，再完全移除父级；
- command 只提交 visible children，但四个 sibling 都提前准备 fallback，防止视锥边缘移动时
  因新 sibling 尚未准备而退回父级；
- 每个 child subtree 可以在自己的四子门禁满足后继续细分；
- 同一平面区域每帧只由一个 quadtree level 覆盖，不使用父子 alpha blend 或 stencil 混合。

“连续 replacement”在 T3 表示空间覆盖和资源切换连续，不承诺 geomorph、高度渐变或时间淡入。

### Direct、fallback 与 active content 分离

每个 terrain tile entry 分开维护 direct pipeline 与 fallback pipeline：

```text
Direct:
UNLOADED -> AVAILABILITY_LOADING -> UNLOADED
UNLOADED -> LOADING -> RECEIVED -> READY
                         \----------> FAILED
UNLOADED ---------------------------> UNAVAILABLE

Fallback:
NONE -> QUEUED -> READY
            \----> FAILED

Active source priority:
DIRECT > UPSAMPLED > FLAT
```

Direct request 与 fallback 可以同时存在。Fallback READY 后可以参加四子门禁；direct READY 后
在 normal render 中原子替换同一 tile 的 fallback。Tile address、imagery binding 与 command
coverage 不改变。

每份 active content 带有 revision。Upsampled fallback 记录直接父级 content revision：

- 父级 active content 改变时，现有 child fallback 暂时保持 renderable，避免孔洞；
- 新 fallback 进入 blocking promotion queue；
- 新 fallback READY 后再替换旧 revision；
- direct child READY 后不再因父级 revision 改变而重建；
- upsample 结果拥有独立 TerrainData，不长期引用 source content。

### Flat fallback 与 Level 0

Provider contract 要求存在完整 `1 x 1` Level 0 root：

- root direct 仍可能恢复时，使用单个 Z=0 root flat command 保底，并优先推进 root；
- root/ancestor terrain 可用后，逐级生成 child fallback 并通过四子门禁细分；
- 某分支 direct 已确定 `UNAVAILABLE` 或 terminal `FAILED`，且没有 terrain ancestor fallback 时，
  允许稳定 flat content 继续向 desired LOD 继承，使 imagery 不永久停在粗级；
- Level 0 明确返回 unavailable 属于 provider contract failure，报告 `TileProviderError`，但仍以
  flat root 保持可用画面；
- 无 provider 时不创建 terrain runtime、entry、load/fallback collection 或 GPU resource，继续
  使用既有 flat fast path。

Recoverable pending flat content 不提前通过四子门禁；terminal flat content 才能作为稳定 child
fallback source。

### Availability 协议

T3 放宽 T2 的临时 provider-level preflight：`provider.maximumLevel` 只需是
`0..tilingScheme.maximumSafeLevel` 内的整数，不再要求覆盖 `world.maximumLevel`。World 的
selection 与 imagery level 不被静默 clamp；`level > provider.maximumLevel` 的 direct content 直接
视为 `UNAVAILABLE`，不调用 availability 或 geometry request，并使用逐级 upsample/flat fallback。
Provider error curve 只读取其声明范围；更深层保持 `provider.maximumLevel` 的末级 error 不变，
因为上采样不能创造新的地形精度，再与 ADR-0008 nominal planar error 取最大值，形成覆盖 World
maximum level 的有限 non-increasing effective errors。

每个 direct tile 最多执行一次当前 generation 的 availability metadata attempt：

1. 读取 `provider.getTileDataAvailable(x, y, level)`；
2. `false` 直接进入 `UNAVAILABLE`，非 root 不发请求、不报告 provider error；
3. 结果为 `undefined` 且直接父级持有非上采样 direct TerrainData 时，调用
   `parentData.isChildAvailable(...)`；
4. 仍未知时调用 `loadTileDataAvailability(...)`；
5. 返回 Promise 时进入 `AVAILABILITY_LOADING`，完成后在后续 normal render 重新检查；
6. 返回 `undefined`，或 Promise 完成后仍未知时，乐观调用 `requestTileGeometry`，不能因
   “不支持”和“调度延迟”共用 undefined 而永久等待。

Upsampled TerrainData 的 `childTileMask=0` 只描述该合成数据，不用于断言 provider direct tile
不存在。Availability Promise 没有 Request cancellation contract；provider replacement、eviction
和 destroy 通过 generation/attempt 忽略迟到结果。

### 私有逐级 Heightmap 上采样

T3 不在 `SceneGISPlanarTerrainData` 上增加 public `upsample` 或 mesh API。SceneGIS private
adapter 使用通用 `interpolateHeight` 从直接父级逐一级产生 child Heightmap：

- destination grid 保持 source width/height；
- destination sample 使用 child extent 中的完整平面 X/Y；
- interpolation 必须继续使用 SW→NE triangle surface；
- output buffer 为 `Float64Array`，默认一元素结构；
- `createdByUpsampling=true`、`childTileMask=0`；
- 继承 source credits，不复制当前未消费的 water mask；
- 任何 undefined、NaN 或 Infinity sample 都使该 fallback attempt 失败。

完整 CRS 的 X/Y 只参与定位与插值。Mesh 继续使用 tile-local XY 与 relative Z，不把 EPSG:3857
等大型绝对坐标写入 Float32 vertex buffer。

### 请求与 promotion 调度

Geometry request 保持 `RequestType.TERRAIN`、`throttle:false`、`throttleByServer:true` 和 provider
返回 undefined 的调度契约。SceneGIS 只决定调用顺序，不建立第二套网络 scheduler：

- blocking queue：阻止当前 render cover 细分的 root、ancestors 和 direct children，粗级优先；
- desired queue：当前可见 desired direct tiles，按 level、camera distance、tile key 稳定排序；
- 不请求纯粹不可见的 direct data，也不增加 flight/predictive prefetch。

Promise completion 可以投递 received/error 结果，但 selection、fallback construction、mesh、GPU、
bounds、active-content switch、command cache 和 LRU mutation 只在 normal render 发生。

T3 不引入 Worker。每个 normal render 最多完成两个 CPU-to-GPU promotion，blocking 优先；一次
promotion 可以包含 upsample、mesh build 和 GPU upload。这个 private 初值不是 public compatibility
contract，T6 可以依据 profiling 调整或以 Worker 取代。T3 接受单个超大 grid 仍可能造成主线程
峰值的剩余风险，不在没有测量证据时猜测 Worker payload/build URL。

### Terrain skirt 与 bounds

所有 direct/upsampled terrain mesh 增加四边 skirt。Topology 复用：

```text
TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices(width, height)
```

Skirt vertex 复制对应 surface edge vertex 的 local XY，高度为：

```text
skirtDepth = 4 * effectiveGeometricError[level]
skirtHeight = max(edgeHeight - skirtDepth, provider.minimumHeight)
```

这样既保留 Cesium 的 geometric-error 启发，又不引入对自定义平面无意义的固定地球高度上限，
并保证 relative Z 仍位于 provider 已验证的 Float32 range 内。

- selection/SSE OBB 只描述 surface，不把 skirt 当作可见地形高度；
- direct 仍可能到达时，selection height interval 保持 provider global range 与当前 fallback 的并集；
- direct 已 READY 或 terminal 后可以收紧到 stable active surface range；
- command BoundingSphere 必须包含实际 skirt minimum，保证 near/far 与 depth fitting；
- shared GPU index buffer key 至少包含 grid width/height/skirt topology，并使用 reference count。

T3 不做 neighbor index stitching、强制 2:1 balancing、geomorph 或额外 corner-cap topology。
Provider 应提供合理一致的同级公共 edge samples；四子门禁负责父子覆盖，skirt 负责遮蔽 mixed-LOD
T-junction 和 transient edge crack。

### Normal render、imagery 与 depth replay

Terrain-enabled normal render 顺序固定为：

1. Context、provider 与 shown imagery preflight；
2. 清空上一 normal render command replay cache；
3. quadtree 计算 desired traversal 与 load candidates；
4. terrain 消费异步结果、推进 availability/request 和有限 promotion；
5. quadtree 依据四子门禁计算实际 render cover；
6. imagery 只为实际 render tiles 建立 desired/ancestor bindings；
7. 每个 render tile 提交一个 terrain+imagery opaque command；
8. 汇总 active TerrainData credits 与 terrain/imagery readiness；
9. `endFrame` 执行 deterministic LRU trim。

Imagery 可以在新的 child terrain 上继续选择自己的 cached READY ancestor，不通过第二个重叠
平面保持影像。Terrain parent 与 child 不在同一 frame 同时提交。

`passes.pick && passes.depth && !passes.render` 继续只重放上一 normal render 的相同 command
references，不执行 selection、SSE、availability、request、upsample、mesh、GPU、protection 或
LRU mutation。`scene.pickPosition` 反映实际 rendered terrain depth；`world.pick`、camera helper
和 navigation 继续使用有界 Z=0 reference plane，直到 T4。

### Cache、资源与取消

T3 保留 `SceneGISPlanarWorld.tileCacheSize` 的既有语义：每帧结束后最多保留该数量的
unprotected tile records。Protected set 包含：

- 本帧 render cover；
- desired leaves 与它们的 ancestor chain；
- 四子门禁所需的 bridge children；
- 当前 blocking promotion 的 source tile。

视图外 request 不影响当前 view readiness，也不因离开一帧就强制取消；它可以留在
unprotected cache，并在 LRU eviction、provider replacement 或 destroy 时取消。LRU 使用
`lastUsedFrame` 和 tile key 保持 deterministic。

Ownership 固定为：

- tile content 独占 TerrainData reference、CPU mesh、vertex buffer 与 VertexArray；
- terrain runtime ref-counted 拥有 shared index buffers；tile VA 不销毁 shared index；
- DrawCommand、model matrix 与 bounds 仍属于 tile record；
- upsampled child data 是独立对象，不保持父级资源引用；
- provider caller-owned，任何 release path 都不调用 provider destroy；
- provider replacement/detach 先清除 replay cache，再释放 direct/fallback content；
- cancellation、late completion、fallback replacement、eviction 和 world destroy 必须 exactly once。

T3 不新增 public byte cache option。当前 generic `SceneGISPlanarTerrainData` 没有 byte-size contract，
只对 Heightmap 估算并不能形成可信的通用预算。实现应记录已知 CPU/GPU byte debug evidence，
正式 byte budget 留到 T6 profiling 和 generic memory reporting 一并决定。

### `tilesLoaded` 收敛语义

Terrain current view 只有在以下条件全部满足时才 settled：

- 每个 desired region 都由 render cover 完整覆盖；
- direct 已 READY，或已 terminal `UNAVAILABLE/FAILED` 且存在稳定 ancestor/upsample/flat fallback；
- 没有会改变当前 view 的 availability、request、retry、fallback refresh、mesh 或 upload 工作；
- current-view source revision refresh 已 READY 或 terminal；
- actual render tiles 的所有 shown imagery bindings 也已 settled。

Request scheduling undefined、recoverable failure、pending direct（即使正在绘制 upsample）、等待四子
门禁或 promotion 时必须为 false。Terminal direct failure 在完整 fallback 下可以为 true，不能形成
永久 request-render loop。视图外 cache/request 不参与当前 view `tilesLoaded`。

## 不采用的方案

### 直接复制 `QuadtreePrimitive` 与 `GlobeSurfaceTile`

不采用。它们的 traversal 与 state machine 依赖 Globe tile provider、ellipsoid visibility、terrain
fill、官方 TerrainData/mesh 和 imagery detail history。SceneGIS 只采纳父级保底、direct-child
upsample 和 skirt 等坐标无关原则。

### 始终绘制 desired flat leaves

不采用。它虽然无孔洞，却会在祖先 terrain 已可用时丢弃已有高度细节，并让 direct tile 独立
跳变。T3 使用 render cover 和四子门禁保留已获得的祖先 surface。

### 同时绘制父子并通过深度或 alpha 掩盖

不采用。重叠 geometry 会产生 z-fighting、重复 imagery、depth/picking 歧义和额外 command。
平面四叉树可以使用严格的空间 cover replacement。

### 把 upsample 加入 public TerrainData

不采用。上采样是当前 Heightmap adapter 与 runtime 的内部策略；generic TerrainData 不应承诺
mesh-dependent sampling、线程或缓存协议。

### T3 立即引入 Worker 或 byte budget

不采用。Worker 会首次触发入口、输出、URL、transferable 和 package 发布决策；当前没有 profiling
证明它是 correctness gate。Generic TerrainData 也没有统一 byte reporting。T3 以有限 promotion
和 tile-count LRU 建立可测基线，T6 再基于证据决策。

### 强制邻居 level difference 不超过一级

不采用。它会扩大不可见 selection、load 与 cache，并不是 skirt 正确性的前置条件。若人工场景
证明任意 mixed LOD 仍有不可接受 artifact，再以独立 measured change 增加 balancing。

## 兼容性、构建与升级

T3 不新增 public type/property，不修改 `SceneGISPlanarTerrainProvider`、
`SceneGISPlanarTerrainData` 或 `SceneGISPlanarWorld` 的公共签名。预计 upstream-owned files=`0`、
T3 SGP=`0`，不修改 `.scenegis/upstream-patches.json`、Shader、Worker 或 build scripts。

Cesium 升级时重点复核：

- `TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices` 的 edge order、corner duplication、
  index datatype 和 cache semantics；
- Buffer、VertexArray 和 non-destroyable/ref-counted index-buffer ownership；
- `RequestType.TERRAIN`、Request cancellation、provider undefined scheduling 与
  `TileProviderError` retry；
- DrawCommand mutable fields、BoundingSphere near/far fitting 与 depth replay；
- upstream terrain traversal 是否出现真正不依赖 ellipsoid/cartographic 的通用 coverage role。

Private SceneGIS state names、promotion count 和 queue containers 不构成 public compatibility promise；
四子单层覆盖、normal-render mutation、caller-owned provider 和 `tilesLoaded` 语义是长期契约。

## 测试原则

- 用一个 deferred child 证明父级保底；四子 READY 后证明同帧无重叠 replacement；
- 用 direct、upsampled 和 terminal flat 三种 active source 证明完整 coverage；
- 覆盖 provider availability false、metadata Promise、unknown optimistic request 和 direct-parent
  child mask；
- 覆盖 retry、cancel、provider generation、late resolve、source revision refresh 和 eviction；
- 纯 CPU fixture 锁定 EPSG:3857 大坐标、SW→NE upsample、metadata 和 skirt topology/bounds；
- real WebGL 只建立足以证明 mixed-LOD 无 clear-color crack、imagery drape、depth replay、warm
  reuse 与 exactly-once release 的代表场景；
- flat no-provider path 必须继续保持 zero terrain allocation；
- 不为每种 TypedArray、frustum、失败排列或极端数值建立无收益矩阵。
