# ADR-0029：平面地形平滑法线与 LOD 光照连续性

## 状态

- Status：`approved`
- Date：`2026-08-11`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- Related plan：
  `AgentDocs/planar-terrain-advanced/plans/2026-08-11-phase-a6-smooth-terrain-normals-and-lod-lighting.md`
- Related patch：预计无；A6 默认只修改 SceneGIS-owned files，upstream-owned files=`0`、A6 SGP=`0`

## 上下文与源码事实

A5 checkpoint `e7375acf8b` 已使 Heightmap 与 Quantized-mesh 共用同一 terrain Worker、runtime、
Surface、imagery、query/pick 与生命周期。当前 lighting 仍沿用 ADR-0012：lit fragment shader 从
`v_positionEC` 的 `dFdx`/`dFdy` 得到每个实际 render triangle 的 geometric normal。该方案无需 normal
storage，但同一光滑坡面会呈现 triangle facet；LOD topology 或采样密度改变时，面法线也会离散变化。

重新审计当前 Cesium 1.144 与 SceneGIS 后确认：

- Heightmap 与 Quantized mesh 都已在唯一 `SceneGISPlanarTerrainWorker` entry 中生成最终 surface/skirt
  positions；这里是生成 topology-aware normal 的最窄共同边界。
- Heightmap 最终 surface topology与
  `TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices` 一致：每个cell使用
  `upperLeft, lowerLeft, upperRight`和`upperRight, lowerLeft, lowerRight`两个CCW triangle。
- Quantized mesh Worker已经拥有真实CCW surface indices和canonical edge lists；TerrainData-owned arrays
  只通过独立clone进入task。
- `_SceneGISPlanarTerrain` 当前只上传一个Float32 position buffer；Heightmap复用shared index，Quantized
  mesh拥有tile-local index。创建position/index/VA已有统一candidate rollback边界。
- `_SceneGISPlanarSurfaceShader` 是一个小型private JS builder，并负责按shown imagery layer count生成
  sampler/composition源码。当前build只发现官方`Source/Shaders/**`与`Source/ThirdParty/Shaders/**`；新建
  SceneGIS `.glsl`目录需要额外build seam，但本阶段没有多文件include、builtin或独立runtime asset需求。
- Cesium已有`czm_octDecode(vec2)`，输入范围为`0..255`。`Core/AttributeCompression.js`可作为oct编码算法
  启发，但它不是A6 public依赖，也不应把额外Scene层依赖引入SceneGIS Core Worker task。

Surface是2.5D单值height field，不能凭单个tile恢复任意相邻tile另一侧的真实梯度。因此A6可以保证同一
mesh内部的插值法线连续，并对共享解析曲面提供代表性的跨tile/LOD连续性；不能承诺任意独立生产数据在
所有边界上bit-identical，也不能掩盖高LOD新增真实地形细节带来的合法光照变化。

## 决策

### Worker 生成 topology-aware smooth normals

现有`createHeightmapMesh`与`createQuantizedMeshMesh` task必须在最终tile-local positions与surface topology上
生成model-coordinate smooth vertex normals：

1. 只遍历`surfaceIndexCount`内的CCW surface triangles，使用triangle cross product累加area-weighted
   vertex normal；skirt triangle不得影响surface normal。
2. Heightmap使用与`TerrainProvider` shared index完全一致的两个triangle/cell顺序，不在Worker复制或
   transfer整份shared index。
3. Quantized mesh使用task clone中的真实surface indices；A5 canonical edge order只服务skirt，不改变
   TerrainData-owned storage。
4. 每个surface vertex在累计后normalize；没有triangle contribution的合法孤立vertex使用`+Z`作为稳定
   fallback，不能因此扩大public TerrainData rejection contract。
5. Skirt duplicate复制其对应surface edge vertex normal，使skirt不反向污染surface法线。Skirt侧面不追求
   独立物理法线；它仍是遮缝几何而不是可编辑terrain material。

实现使用无对象的数值循环和bounded typed-array scratch，不为每个vertex创建`Cartesian3`。Oct encode的少量
坐标无关数学可以在private Worker task内实现，并以源码注释引用
`packages/engine/Source/Core/AttributeCompression.js`与上游baseline
`6d5d8b1f0725b6f831b336463f4b11c98023427b`；不得复制其无关API或引入public helper。

### Worker result 与主线程 preflight

两个mesh task新增transferable `Uint8Array octEncodedNormals`，每个最终surface/skirt vertex严格占两个byte，
长度必须等于`vertexCount * 2`。编码值保持`0..255`，供`czm_octDecode(vec2)`直接读取。

`_SceneGISPlanarTerrainMesh`在发布mesh前必须与positions、indices、query metadata一起完整验证normal result：
exact TypedArray、exact length、buffer ownership与vertex count一致；malformed result在任何GPU mutation前失败。
Public TerrainData、provider、Worker entry basename和TaskProcessor调用方式均不改变，也不请求或公开
quantized-mesh normal extension。

### GPU attribute、Shader variant 与 fallback

每个non-flat terrain content始终上传一个独立static normal VertexBuffer：

- attribute location固定为`1`；
- `ComponentDatatype.UNSIGNED_BYTE`；
- `componentsPerAttribute=2`；
- `normalize=false`，由shader调用`czm_octDecode`。

Normal buffer与position buffer、owned/shared index acquisition、VertexArray creation必须位于同一个原子
candidate boundary。失败只清理已取得resource并保留原始异常；replacement、eviction、provider detach与World
destroy必须exactly once释放。Private debug counters应反映实际创建/销毁的buffer数量，不以隐藏第二个buffer
维持旧计数。

Lit terrain vertex shader解码model-coordinate normal，并通过`czm_normal`转换到eye coordinates；fragment shader
normalize插值结果，然后继续使用ADR-0012既有face-forward、Lambert、light color、固定ambient与imagery合成
顺序。Flat/no-provider与active FLAT fallback没有normal attribute，继续使用derivative geometric-normal lit variant。
Unlit variant不声明、不读取normal attribute。

Shader cache identity从`layerCount + lighting`扩展为`layerCount + lighting + normal mode`。同一tile仍只有一个
opaque DrawCommand；content从FLAT切换到DIRECT/UPSAMPLED时只原子更新既有command的VA/shader/bounds。Lighting
toggle不重建mesh或buffer，`lambertDiffuseMultiplier`仍是uniform-only，pick+depth仍重放最近normal render的
exact command references。

### 成本与可验证边界

Normal必须随terrain mesh预生成和上传，即使当前`enableLighting=false`，以保证运行时lighting toggle不触发
Worker remesh或GPU resource churn。持久GPU增量为每vertex 2 bytes，相对现有12-byte position stream约
16.7%；不新增draw command、texture、request、public cache budget或第二Worker。Worker累计scratch是task-local，
完成或失败后可回收。

A6 hard gate采用小而可解释的证据：

- 一个非平面Heightmap和一个不规则Quantized mesh证明共享vertex的插值normal连续，并比per-face baseline减少
  可重复角度跳变；
- 代表性的相邻tile与parent→four-child解析曲面证明边界/LOD切换没有明显新增seam；不建立任意provider的
  bit-exact矩阵；
- real Context验证lit smooth terrain、imagery、surface下方双面显示、FLAT derivative fallback、single command、
  warm identity、depth replay与destroy balance；
- 记录normal bytes、Worker task output和GPU buffer delta，不设跨机器FPS阈值。

项目负责人在A7统一交付前通过既有`scenegis-planar-terrain`页面做最终视觉复核。若代表性画面没有稳定收益，
或normal buffer造成不可接受的重复成本，A6不能以“实现完成”替代效果验收。

## 不采用的方案

### 继续只用 fragment derivatives

拒绝作为A6终态。它是可靠fallback，但不能改善同一mesh内的triangle facet，也不能降低topology切换带来的离散
法线变化。

### Runtime 邻居拼接、全局 normal cache 或 temporal cross-fade

暂不采用。它们会把normal correctness耦合到tile到达顺序、不同LOD邻居、promotion和LRU，并可能增加draw pass或
跨tile可变状态。A6先选择task-local deterministic normals；只有实际数据仍出现阻断seam时再建立后继阶段。

### 请求 quantized-mesh oct-normal extension

暂不采用。A5 provider只请求coordinate-neutral base format；服务normal extension会扩大Accept、binary ownership、
Heightmap对等语义和public capability。A6对两种terrain data统一从最终topology生成normal。

### Float32 vec3 normal

不采用。它会使vertex stream额外增加12 bytes。`Uint8x2` oct normal已足够表达Lambert视觉法线，并复用现有
`czm_octDecode`。

### 新建 SceneGIS `.glsl` 目录并修改 build

本阶段不采用。项目负责人已允许在确有需要时建立该seam，但当前shader仍是一个小型dynamic builder；拆出
`.glsl`反而需要新的upstream build修改而不减少variant复杂度。若后续出现共享include、新builtin或多个独立
shader组件，再按单独ADR/SGP处理。

## 兼容性、所有权与升级

A6不改变public API、TerrainData/provider ownership、canonical tiling、SSE/selection/fallback、imagery、query/pick、
navigation、tilesLoaded或Worker entry。预计upstream-owned files=`0`、A6 SGP=`0`，不修改
`.scenegis/upstream-patches.json`、SGP-0001/0002或generated files。

每次Cesium升级必须复核：

- `TerrainProvider` regular-grid triangle与skirt topology；
- `czm_octDecode(vec2)`的range和zero encoding、`czm_normal`的model normal transform；
- `Buffer`/`VertexArray`多attribute ownership与destroy语义；
- Worker transferable/result preflight和development/release bundle；
- ShaderProgram cache key/reference release、single-command imagery和depth replay；
- representative same-tile、cross-tile、cross-LOD与below-surface lighting evidence。
