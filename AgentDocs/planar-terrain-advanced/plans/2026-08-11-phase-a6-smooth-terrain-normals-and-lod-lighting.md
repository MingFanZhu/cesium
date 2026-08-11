# 阶段计划：A6 平面地形平滑法线与 LOD 光照连续性

## 元数据

- Plan type：`phase`
- Status：`active`
- Owner role：`execution`
- Architecture review：`confirmed`
- Architecture reviewer：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- Created：`2026-08-11`
- Updated：`2026-08-11`
- Parent plan：
  [总体计划：SceneGIS 平面高级地形](2026-08-10-planar-terrain-advanced-extension.md)
- Entry checkpoint：`e7375acf8b57bdeb15ac8fe9ccf53c7a7586d27b`
- Related decision：
  [ADR-0029](../../../Documentation/SceneGIS/Decisions/ADR-0029-planar-smooth-terrain-normals-and-lod-lighting.md)
- Related review：None；Execution ready后创建A6 pending review
- Related patch：None planned；预计 upstream-owned files=`0`、A6 SGP=`0`

## 阶段目标

在不改变public terrain API、surface状态机或draw-command数量的前提下，为Heightmap与Quantized-mesh统一增加
Worker生成的压缩smooth vertex normals，替代non-flat terrain lit path的per-triangle derivative表现。A6必须以
代表性CPU/GPU证据证明triangle facet和LOD明暗跳变有可重复改善，同时保持flat fallback、双面/地下视角、imagery、
pick/depth replay、normal-render mutation与resource lifecycle。

## 进入基线与源码事实

- A5 checkpoint `e7375acf8b` 已完成两种terrain data、同一Worker entry、direct/upsampled/flat runtime、
  query/pick、imagery与GPU index ownership。
- 当前`_SceneGISPlanarSurfaceShader` lit fragment使用`dFdx/dFdy(v_positionEC)`，因此同一triangle内是常量
  geometric normal；flat/no-provider路径依赖这一能力。
- Heightmap Worker最终position topology与`TerrainProvider.addRegularGridIndices`的两个triangle/cell完全一致；
  Quantized Worker持有真实CCW surface indices和canonical edge lists。
- `_SceneGISPlanarTerrainMesh`当前只finalize position/index/query metadata；`_SceneGISPlanarTerrain`只创建一个
  position buffer，并已把position/index/VA创建纳入原子rollback。
- Surface shader cache key当前只含shown layer count和lighting；tile command在FLAT与terrain content间复用。
- `czm_octDecode(vec2)`可直接读取`0..255` encoded normal；`czm_normal`可把model-coordinate normal转换为
  eye coordinates。
- 当前private JS shader builder还承担动态imagery source composition。A6不需要新builtin、include或独立shader
  asset，因此不启用项目负责人预先允许的SceneGIS `.glsl`/build seam。

## 已批准设计

### 1. 单一 Worker 协议生成 normals

扩展existing private terrain Worker tasks，而不是新增Worker entry：

- Heightmap按shared regular-grid真实surface triangle顺序累加area-weighted vertex normals；
- Quantized mesh按其真实surface indices累加；
- skirt triangle不参与surface累计，skirt duplicate复制对应surface edge normal；
- 无triangle contribution的合法vertex稳定回退`+Z`；
- normalize后oct encode为transferable `Uint8Array`，严格`2 * vertexCount` bytes。

算法必须使用bounded typed-array scratch和数值循环，不逐vertex分配对象。小型oct encode实现引用上游
`Core/AttributeCompression.js`及baseline，但不得复制无关代码或引入Scene层依赖。TerrainData-owned storage仍只
transfer独立clone。

### 2. Main-thread mesh 与 GPU ownership

`_SceneGISPlanarTerrainMesh`把`octEncodedNormals`纳入完整result preflight；malformed type/length在GPU mutation前
抛`DeveloperError`。每个non-flat content上传第二个static VertexBuffer：location 1、`UNSIGNED_BYTE`、2 components、
`normalize=false`。

Position buffer、normal buffer、owned/shared index acquisition与VA construction共享一个try/catch。Candidate失败
保留current和原始异常，只清理已取得resource；replacement、eviction、detach、destroy成对释放两个vertex buffer。
Private debug counters按实际资源计数，不能掩盖normal buffer。

### 3. Lit normal variant

Private shader builder增加明确的normal mode：

- `smooth`：vertex shader读取oct normal，经`czm_octDecode`与`czm_normal`输出eye-space normal；fragment shader
  normalize插值结果并沿用既有face-forward/Lambert/ambient/imagery顺序；
- `geometric`：flat/no-provider及active FLAT fallback继续使用`dFdx/dFdy`；
- `unlit`：不声明或读取normal attribute。

Shader cache key为`layerCount + lighting + normal mode`。Content promotion可更新同一command的VA/shader/bounds，
但不能增加command、pass或depth replay mutation。Lighting toggle不重建mesh/buffer，multiplier仍uniform-only。

### 4. 连续性与成本边界

A6保证同一mesh内共享vertex的插值normal连续，并在解析一致的代表性相邻tile和parent/four-child上验证边界；不承诺
任意provider独立tile的boundary gradient bit-identical，也不隐藏更高LOD新增真实细节。不得为此加入runtime邻居
normal stitch、全局cache、temporal cross-fade或第二draw pass。

Normal持久成本固定为每terrain vertex 2 bytes，相对12-byte position stream约16.7%。Execution必须记录Worker
output bytes、GPU buffer delta、warm identity与destroy balance；不建立跨机器FPS阈值。A7再承担最终浏览器/GPU统一
资格验收。

## 允许的实现路径

### Product source

- `packages/engine/Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js`
- `packages/engine/Source/SceneGIS/Renderer/_private/_SceneGISPlanarTerrainMesh.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrain.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- 只有职责不能落入上述现有角色时，才允许在对应SceneGIS `_private`目录增加一个小型normal helper
- `packages/sandcastle/gallery/scenegis-planar-terrain/**`仅在现有lighting/view控件不足以人工比较时做最小修改
- `Documentation/SceneGIS/**`、`AgentDocs/planar-terrain-advanced/**`

### Specs

- 扩展existing Worker task、terrain mesh、terrain runtime、Surface/Shader与terrain Widget Specs。
- 优先在现有suite增加direct assertions；不得为case count复制相同real Context场景。

### 禁止范围

- 不修改public World、TerrainData、provider、navigation或lighting API。
- 不请求/解析quantized-mesh normal extension，不改变A5 base-format Accept。
- 不新增Worker entry、TaskProcessor实例、public normal class、material/shadow/water语义或CPU byte budget。
- 不修改quadtree/SSE/coverage/fallback/query/pick/imagery/content/ground/Viewer/Widgets product runtime。
- 不新增draw command、pass、texture或runtime邻居normal registry/cross-fade。
- 不建立SceneGIS `.glsl`目录，不修改build/upstream-owned file；若实现事实推翻该判断，暂停并回报Architecture。
- 不手工编辑或提交generated files。

## Source-to-Spec 映射

| Source / role            | 最小直接证据                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Worker normal generation | Heightmap与Quantized topology、oct range/length、skirt copy、transfer、输入storage不变          |
| Mesh result preflight    | exact TypedArray/vertex length、malformed结果在GPU mutation前失败                               |
| Terrain GPU lifecycle    | two vertex buffers、shared/owned index、candidate rollback、replacement/detach/destroy平衡      |
| Shader variants          | unlit无normal、flat geometric、terrain smooth、cache key与face-forward/Lambert/imagery顺序      |
| CPU continuity metric    | 非平面fixture相对per-face baseline减少共享边角度跳变；相邻tile与parent/children representative  |
| Real Context Surface     | lit smooth pixel、imagery、below-surface、FLAT fallback、single command、warm/depth/destroy闭环 |

## 执行步骤

1. 在existing Worker task内实现无对象normal accumulation/oct encode，并先锁定两种topology与transfer结果。
2. 扩展main-thread mesh finalizer preflight，再把normal buffer接入terrain content原子创建/销毁边界。
3. 为Surface builder增加geometric/smooth lit variants和完整cache key，保持unlit与command replay不变。
4. 增加一个deterministic CPU continuity comparison和一个现有real Context fixture的代表性视觉/资源闭环。
5. 更新ADR-0012 successor说明、Architecture、DevelopmentGuide、PlanarWorldGuide与UpgradeChecklist当前契约。
6. 运行最小充分矩阵，回写normal byte成本、命令/resource identity、ownership/generated审计。
7. 创建pending A6 review并停下；不得提交、push或进入A7。

## 最小充分验证

执行时按实际changed paths收敛，至少包括：

```powershell
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainWorkerTasks"
npm run test -- --includeName "SceneGIS/Renderer/SceneGISPlanarTerrainMesh"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTerrain"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"
npm run build
npm run build-release
node scripts/scenegis/audit-upstream-patches.mjs
```

另运行changed-scope ESLint/Prettier、affected SceneGIS/AgentDocs Markdown Prettier/Markdownlint和
`git diff --check`。A6没有public JSDoc/type变化，因此默认不运行`build-ts`、`build-docs`、`tsc`、package smoke、
E2E、Globe/Viewer/full-repo或driver矩阵；只有实际跨界修改或失败证据才扩大。

## 完成条件

- Heightmap与Quantized mesh都从existing Worker task返回validated transferable oct normals。
- Non-flat lit terrain使用smooth interpolated normal；flat/FLAT fallback继续使用geometric derivative；unlit不读取normal。
- 同一mesh continuity metric相对per-face baseline有明确改善；代表性cross-tile与parent/children没有新增明显seam。
- Single opaque command、imagery composition、below-surface face-forward、pick/depth exact refs与normal-render mutation不变。
- Normal GPU成本严格2 bytes/vertex；warm frame无持续task/buffer/VA/shader/command allocation，所有失败/销毁路径平衡。
- Build/release/focused/static/audit通过；upstream-owned files=`0`、A6 SGP=`0`、generated status=`0`。
- Durable docs、phase results、pending review与handoff完整；Execution停在A6 review边界。

## 风险与停止条件

- Arbitrary independently authored tiles无法仅靠单tile topology保证exact boundary gradient；不得把representative通过写成
  universal seam guarantee。
- Float32 positions、极小triangle或孤立vertex可能使normal累计退化；必须finite处理并保持public data contract不扩大。
- 第二vertex buffer扩大所有candidate/destroy分支；任何rollback或debug resource count不平衡都是blocker。
- Smooth interpolated normal可能让skirt侧面不再表现为几何侧法线；skirt是遮缝几何，surface continuity优先，但地下/
  extent-edge出现明显伪影时必须回报Architecture。
- 若需要service-provided normals、runtime neighbor stitching、第二pass、新Shader build seam、upstream-owned file或public API，
  立即暂停，不得把它解释为ADR-0029已授权。

## Execution handoff

- Implementation base：本A6 phase plan的独立planning checkpoint；Execution开始时以`git rev-parse HEAD`记录精确hash。
- 修改前确认working tree clean，先核对上述source-to-spec mapping；保留用户并发修改。
- Ready for review时创建
  `AgentDocs/planar-terrain-advanced/reviews/2026-08-11-a6-smooth-terrain-normals-and-lod-lighting.md`，状态
  `pending`，并报告changed paths、case counts、CPU continuity与real Context证据、normal bytes/resource delta、
  upstream-owned files/SGP、generated status和剩余风险。
- 不commit、不push、不进入A7；Architecture review通过后由Architecture Agent形成独立中文checkpoint。

## 偏差与结果

待 Execution 回写。
