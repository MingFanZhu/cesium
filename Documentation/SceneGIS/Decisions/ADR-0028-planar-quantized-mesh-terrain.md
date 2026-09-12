# ADR-0028：坐标系无关的平面 Quantized-mesh Terrain

## 状态

- Status：`approved`
- Date：`2026-08-11`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- Related plan：
  `AgentDocs/planar-terrain-advanced/plans/2026-08-11-phase-a5-planar-quantized-mesh.md`
- Related patch：预计无；A5 复用 ADR-0027 的唯一 SceneGIS terrain Worker entry，默认只修改
  SceneGIS-owned files

## 上下文与源码事实

A1-A4 已完成地形感知导航、surface/underground 模式、surface clearance、地下中键穿越，以及
`decodeLerc` / `createHeightmapMesh` Worker 管线。A4 checkpoint 为 `bf339ee853`。当前公共
`SceneGISPlanarTerrainProvider` / `SceneGISPlanarTerrainData` 本来就是格式无关的 structural
contract，但私有实现仍只接受 Heightmap：

- `_SceneGISPlanarTerrainMesh` 只识别 Heightmap 的 `_createMeshTaskPayload`，并从
  `TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices` 取得共享规则网格索引；
- `_SceneGISPlanarTerrainUpsampler` 只把直接父级 Heightmap 采样为新的规则 Heightmap；
- `_SceneGISPlanarTerrainQuery.getHeight` 只按 `width` / `height` 定位规则网格 cell；
- ray picking 已按 `mesh.indices` / `surfaceIndexCount` 遍历真实三角形，本身不依赖规则网格；
- terrain runtime 已有 direct/fallback/active、四子覆盖门禁、normal-render-only mutation、每帧最多
  两个 Worker task start与两个GPU promotion、generation/token stale isolation和exactly-once release。

[CesiumGS quantized-mesh-1.0 specification](https://github.com/CesiumGS/quantized-mesh) 定义了
little-endian header、delta/zig-zag 的 `u/v/height`、high-water-mark triangle indices、四条 edge
indices 与可选 extension。`u/v/height` 的有效量化范围是 `0..32767`，三角形采用 counter-clockwise
winding；index datatype 由 vertex count 决定。Header 中的 center、bounding sphere 与 horizon
occlusion point 使用 ECEF/ellipsoid 语义，不能进入真正的平面 runtime。Header 的 height range、
tile-local `u/v`、surface triangles 与 edge lists 则是 coordinate-system agnostic 的数据语义。

Cesium 1.144 的 `QuantizedMeshTerrainData`、`createVerticesFromQuantizedTerrainMesh` 和
`upsampleQuantizedTerrainMesh` 可以启发 typed-array ownership、edge skirt 和直接子级 triangle clipping，
但它们同时依赖 `Rectangle`、`Ellipsoid`、ECEF、horizon、`TerrainEncoding` 与 Globe mesh。A5 不复制
该整套实现，而是在 ADR-0027 的单一 SceneGIS Worker 中实现窄小的 planar decode、mesh 与 child clip task。

仓库已经包含上游测试数据，例如
`Specs/Data/CesiumTerrainTileJson/QuantizedMesh/tile.terrain` 与 32-bit index fixture。它们继承当前
仓库许可，可作为不访问公网的确定性自动化输入。A5 不需要为了格式正确性绑定公开服务、token 或 CRS。

## 决策

### 两个公共 Core 类型

A5 新增：

- `SceneGISPlanarQuantizedMeshTerrainData`；
- `SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider`。

两者与 Heightmap 类型并列，不继承或包装 Cesium 的 Globe terrain 类型。Provider 必须接受调用方提供的
canonical `SceneGISPlanarTilingScheme` object；应用负责保证 URL pyramid、extent、CRS 与米制高度一致。
类型不读取 `layer.json`、不推断 projection，也不执行重投影。

`SceneGISPlanarQuantizedMeshTerrainData` 的构造输入是已经解码为 absolute `0..32767` 值的
`Uint16Array quantizedVertices`，以及 `Uint16Array|Uint32Array` surface/edge indices。构造器还接受：

```text
quantizedMinimumHeight
quantizedMaximumHeight
westIndices / southIndices / eastIndices / northIndices
childTileMask = 15
waterMask
createdByUpsampling = false
credits
```

`quantizedMinimumHeight` / `quantizedMaximumHeight` 是量化高度的米制解码区间。构造器接管全部 TypedArray
ownership，并在发布实例前完整验证：安全长度、vertex/index datatype、`0..32767`、index bounds、三角形
triplet、nondegenerate counter-clockwise topology、四条 edge membership/coverage、finite ordered height range、
child mask 与 metadata。调用方在成功构造后不得修改或复用输入 storage。

公共 `minimumHeight` / `maximumHeight` 仍遵守 ADR-0007：它们是实际 decoded surface vertices 的准确
finite range，而不是盲目回显可能比现存 vertex 更宽的 binary header range。实例私有保存量化解码区间，
用于 interpolation、mesh task 与后续 upsample。`interpolateHeight(extent,x,y)` 把平面 X/Y 映射到
tile-local `u/v`，只在真实 surface triangles 上做 piecewise-linear interpolation；extent 外返回
`undefined`。公共类不拥有 Request、Worker、mesh 或 GPU resource，不增加 public `createMesh` / `upsample`。

### Generic URL-template provider

`SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider` 使用同步显式配置：

```text
url
tilingScheme
urlScheme = "xyz" | "tms"
maximumLevel
minimumHeight
maximumHeight
levelZeroMaximumGeometricError
subdomains
credit
```

与 Heightmap provider 一样，URL 支持 `{z}`、`{x}`、`{y}`、`{s}`；输入 address 始终是 canonical
northwest-origin XYZ，只有 `urlScheme="tms"` 转换网络 Y。`minimumHeight` / `maximumHeight` 是 provider
完整数据集的保守米制范围。Quantized mesh 没有固定 sample dimensions，无法诚实推导 Level-0 error，因此
`levelZeroMaximumGeometricError` 是 required finite non-negative option，后续逐级除以二。

Provider 通过 `Resource.getDerivedResource` 传递 caller-owned `Request`，并显式发送 base-format Accept：

```text
application/vnd.quantized-mesh,application/octet-stream;q=0.9,*/*;q=0.01
```

`fetchArrayBuffer` 返回 `undefined` 时继续表示 network scheduling defer。成功 buffer transfer 给
`decodeQuantizedMesh` Worker task；provider在main thread完整preflight结果后构造TerrainData。Fetch、decode或
validation failure沿Promise rejection进入既有runtime retry/fallback，不在provider中另建cache/retry。

首版仍表示 `0..maximumLevel` full pyramid，child mask在末级前为15、末级为0；不发现sparse metadata。
Provider global Credit由Surface显示，不复制到每个TerrainData。Provider只拥有Resource/config/Event/Credit
reference，不拥有World、Request、TerrainData、Worker、mesh或GPU，也不提供destroy。

### Binary decode 与 extension 边界

`decodeQuantizedMesh` 必须按 little-endian 格式逐字段做 bounds/safe-arithmetic preflight，再执行 delta/zig-zag
和 high-water-mark decode。它必须验证 finite header、ordered height range、16/32-bit branch、index bounds、
CCW surface、edge lists和完整payload边界。Header中的ECEF center/bounds/horizon字段只校验并跳过，不进入返回
TerrainData、bounds、visibility或picking。

A5只请求base format，不公开normal/water/metadata extension option。若payload仍带extension，decoder必须按
little-endian `id + length` 安全跳过完整未知/已知块，不能错位读取或把它们静默解释为平面语义。A6若决定消费
oct-encoded normals，必须用后继ADR扩展Accept、data ownership和shader/mesh contract；A5不提前冻结该API。

### 单一 Worker entry 下的三项新增 task

复用 `SceneGISPlanarTerrainWorker` 与 module-scoped scheduler，增加：

1. `decodeQuantizedMesh`：transfer network `ArrayBuffer`，返回owned decoded vertex/index/edge TypedArrays和
   header height interval；
2. `createQuantizedMeshMesh`：transfer TerrainData-owned arrays的独立clones，生成tile-local Float32 surface/
   skirt positions、per-tile indices、bounds metadata与height-query acceleration；
3. `upsampleQuantizedMesh`：transfer source data clones，把直接父级triangles裁剪到一个child quadrant，生成
   独立child quantized vertices/indices/edges与height interval。

不新增第二个 Worker entry，不修改 build discovery。Provider decode 与 renderer mesh 继续分离；不能返回
provider-specific prepared mesh sidecar。TerrainData-owned storage永不transfer。Promise completion只发布CPU state，
所有TerrainData rehydration、GPU upload、active switch、bounds、LRU和readiness mutation仍在main-thread normal render。

Quantized upsample沿用球面实现的“裁剪父级真实三角形到直接子级”思想，但只使用tile-local `u/v/height`：

- 按child west/east、south/north quadrant裁剪所有相交surface triangles；
- intersection height使用原triangle线性插值；
- child `u/v`重新映射到`0..32767`，height按child finite range重新量化；
- 输出去重、nondegenerate CCW triangles和完整edge lists；
- `createdByUpsampling=true`、`childTileMask=0`、继承credits，不传播water mask；
- 不计算Rectangle、Ellipsoid、ECEF、horizon或Globe bounds。

不得逐段复制上游四百余行 Worker。若复用少量坐标无关clip/helper思想，源码注释记录上游路径与基线
`6d5d8b1f0725b6f831b336463f4b11c98023427b`，并保持SceneGIS-owned实现可独立验证。

### Mesh、查询与 GPU index ownership

Quantized mesh把 `u/v`映射为tile-local `[-0.5,0.5]` XY，decoded meter height相对一个finite reference Z存入
Float32。Surface indices保持原CCW topology；四条edge按稳定顺序生成向下skirt，skirt depth继续是
`4 * effectiveGeometricError`并clamp到provider minimum。Selection只使用surface range，command bounds包含skirt。

Heightmap继续复用ref-counted shared regular-grid/skirt index buffer。Quantized topology逐tile不同，因此每个
direct/fallback content独占自己的GPU index buffer；candidate失败保留current，replacement/eviction/detach/destroy
必须exactly once释放VA、vertex buffer和tile-owned index buffer。两类content继续共享相同single opaque command、
imagery composition、double-sided、lighting与depth replay路径。

Quantized mesh Worker为surface triangles建立private bounded uniform-cell query index。初始维度可按triangle count
推导并限制上界；如果triangle AABB引用数超过明确的linear memory budget，必须逐级降低维度，最差退化到单cell，
不得产生不受限的`triangles × cells` storage。每个cell保存surface triangle ordinal，不含skirt。Resident
`getTerrainHeight`按point所在cell测试真实Float32 triangles；ray picking继续使用既有tile broad phase和surface
triangle遍历。Heightmap 3×3 regular-cell路径保持不变。

### Runtime fallback 与帧预算

Terrain runtime必须按data capability dispatch，不用`instanceof Heightmap`把公共provider重新收窄。Direct
Quantized data进入`createQuantizedMeshMesh`；Heightmap继续进入`createHeightmapMesh`。

Quantized fallback使用独立async upsample-data state，再进入已有mesh state：

```text
source data --upsampleQuantizedMesh--> child TerrainData
child TerrainData --createQuantizedMeshMesh--> CPU mesh result
CPU mesh result --normal-frame promotion--> active UPSAMPLED content
```

Heightmap synchronous upsample保持ADR-0009行为。所有normal-render terrain Worker task（Heightmap/Quantized mesh与
Quantized upsample）共享每帧最多两个start预算；blocking coverage优先。GPU promotion仍最多两个。Worker callback
不得直接构造tile/GPU状态；generation、attempt、source revision和token必须隔离late result。Direct RECEIVED/READY
不得被stale fallback覆盖。`tilesLoaded`在current-view coverage缺少active content、upsample/mesh pending或recoverable
direct pending时保持false；terminal direct配合stable fallback仍可settle。

四子覆盖、`DIRECT > UPSAMPLED > FLAT`、actual render tile imagery、provider caller ownership、pick/depth exact-ref replay
和flat/no-provider zero terrain allocation全部不变。Provider可以在不同tile返回任一受支持TerrainData实现，runtime按
每份data选择adapter；不建立第二套quantized surface/quadtree。

## 不采用的方案

### 直接使用 `CesiumTerrainProvider` / `QuantizedMeshTerrainData`

拒绝。它会引入layer metadata projection、Rectangle、Ellipsoid、ECEF bounds、horizon、TerrainEncoding与Globe
mesh/upsample协议，并破坏canonical planar tiling identity。

### 把 Quantized mesh 转成固定规则 Heightmap

拒绝。规则重采样会丢失服务端不规则三角网、额外量化并改变真实surface topology；也无法验证真正的
quantized fallback和per-tile index ownership。A5保持triangle mesh并裁剪父triangle生成child。

### 首版支持 `layer.json` discovery / sparse metadata / extensions

暂不采用。Generic URL-template provider与ADR-0011保持一致，由caller显式提供tiling、levels、height range和error。
Service-specific metadata、availability以及A6 normal extension应在出现明确需求时作为独立扩展，不混入base format。

### 每次高度查询线性扫描全部 triangles

不采用。Surface-mode clearance会重复调用resident height query，公开quantized tile通常包含数千triangle；A5在Worker
构建bounded cell index，避免把格式支持变成新的main-thread hot path。

### 合并 decode、upsample 与 mesh task

拒绝。Combined task会把provider、fallback和renderer职责耦合，并使TerrainData无法独立采样/缓存。三种task共享
entry但保持各自ownership与state边界。

## 构建、兼容性与升级

A5预计只修改SceneGIS-owned Core/Renderer/Scene/Specs/Documentation/AgentDocs、既有SceneGIS package smoke，以及
ADR-0027批准的Worker private handler/scheduler。Worker entry本身若无新包装需求应保持不变。预计
upstream-owned files=`0`、A5 SGP=`0`、`.scenegis/upstream-patches.json`与SGP-0001/0002 unchanged。

两个public类型必须进入engine/root JS、declarations与API HTML；private adapter/task/query data不得进入公共
declarations/API。Installed package必须包含可由现有Worker basename执行三个新增task的development/release/tar
产物。Public non-underscore inventory预计从engine/widgets/root `24/2/26`变为`26/2/28`。

Cesium升级时复核quantized-mesh binary spec与官方parser、`Resource` headers/scheduling、TaskProcessor transfer/error、
`IndexDatatype`的65536边界、Buffer/VertexArray index ownership、clip helper、Worker bundling/package和TerrainProvider
edge/skirt启发。若官方出现真正不依赖ellipsoid/projection/TerrainEncoding的generic quantized role，再评估替换private
实现。

## 验证边界

- 使用仓库内small quantized tile锁定binary decode、transfer、public TerrainData interpolation/ownership、provider
  XYZ/TMS/Accept/error与provider→World闭环；只用一个现有32-bit fixture覆盖datatype branch。
- Worker/mesh Specs锁定local XY、height/reference、CCW、skirt、tile-owned indices、bounded query cells和malformed
  representative；不建立字节截断位置的穷举矩阵。
- Runtime Specs锁定direct、quantized child clip fallback、revision/stale/replacement、two-start/two-promotion、Heightmap
  regression和mixed-format dispatch。
- Real Context只建立一个quantized terrain + imagery representative，闭合pixel、depth、resident query、terrain pick、
  warm command/resource identity、depth exact replay和destroy balance。
- `SceneGISPlanarTerrainSampler`增加一个quantized representative，证明public interpolation契约。
- 运行public API所需build/types/docs/tsc、development/release Worker、installed package smoke、scoped static checks与
  official upstream audit。A5不增加公网自动化、E2E、driver矩阵或跨机器performance gate。
