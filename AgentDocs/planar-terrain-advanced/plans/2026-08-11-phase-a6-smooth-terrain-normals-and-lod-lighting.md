# 阶段计划：A6 平面地形平滑法线与 LOD 光照连续性

## 元数据

- Plan type：`phase`
- Status：`completed`
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
- Related review：
  [A6 implementation review](../reviews/2026-08-11-a6-smooth-terrain-normals-and-lod-lighting.md)（`approved`）
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

### 实际实现与偏差

- Implementation base确认为`bb880b0496e5f9ac71572c723fbfb06cf466e6db`；未新增helper、Worker entry、
  public API、Shader asset或build seam。
- Existing `createHeightmapMesh`与`createQuantizedMeshMesh` task都在final surface/skirt positions生成后，使用
  bounded `Float64Array`累计真实surface triangle的area-weighted normals。Heightmap使用regular-grid实际indices；
  Quantized使用tile-owned surface indices。退化/无贡献vertex回退`+Z`，skirt duplicate按canonical source edge复制
  surface normal，skirt triangles不参与累计。
- Oct encoder只实现本任务需要的numeric L1 projection/fold/byte quantization，并在源码注明参考
  `Core/AttributeCompression.js`与upstream baseline
  `6d5d8b1f0725b6f831b336463f4b11c98023427b`。Worker返回独立transferable `Uint8Array`，长度严格为
  `2 * finalVertexCount`，不转移TerrainData-owned storage。
- Main-thread mesh finalizer严格验证normal TypedArray、buffer独立性、vertex count与byte length。Terrain content把
  position/normal vertex buffer、owned/shared index acquisition和VA construction放入同一try/catch；失败只释放实际
  取得的资源并保留原始异常，replacement/eviction/detach/destroy准确释放两个vertex buffers。
- Surface shader mode实际为`unlit`、`geometric`、`smooth`；cache key为
  `layerCount/lighting/normalMode`。Smooth vertex path用`czm_octDecode(normal)`与`czm_normal`输出eye-space normal；
  flat/no-provider/active FLAT继续derivative geometric normal。Existing DrawCommand只原位切换VA/shader/bounds，
  imagery composition、single command与depth exact-reference replay未变。
- Sandcastle未修改：现有terrain页面已有Lighting开关、Mountain view和稳定`DirectionalLight`，足以承担A7最终人工
  对比；A6不重复增加控件。

### 最终 Source-to-Spec mapping

| Source / role                          | Direct Spec evidence                                                                                                       | Final cases |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------: |
| `_SceneGISPlanarTerrainWorkerTasks.js` | `SceneGISPlanarTerrainWorkerTasksSpec.js`：两种topology、transfer、skirt copy、CPU continuity与representative tile/LOD边界 |           8 |
| `_SceneGISPlanarTerrainMesh.js`        | `SceneGISPlanarTerrainMeshSpec.js`：两种mesh output与malformed normal type/length                                          |           6 |
| `_SceneGISPlanarTerrain.js`            | `SceneGISPlanarTerrainSpec.js`：dual buffers、owned/shared index、index failure rollback、replacement/destroy              |          15 |
| `_SceneGISPlanarSurfaceShader.js`      | `SceneGISPlanarSurfaceShaderSpec.js`：unlit/geometric/smooth source与normal decode                                         |           4 |
| `_SceneGISPlanarSurface.js`            | `SceneGISPlanarSurfaceSpec.js`：mode/cache key、FLAT geometric、single command/depth replay                                |          30 |
| real Context closure                   | `SceneGISPlanarTerrainCesiumWidgetSpec.js`：Heightmap/Quantized smooth、imagery、below、warm/depth/destroy                 |           2 |

六个suite的direct unique aggregate为`65/65`。本阶段新增direct `it` cases=`2`（Worker continuity、Shader smooth
variant），其余为既有cases扩展A6断言。`includeName SceneGISPlanarSurface`输出`34/34`，其中包含Shader `4`与
Surface `30`，仅作runner aggregate，不重复计入65。

### 验证矩阵

| Command / evidence                                                                  | Result                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainWorkerTasks"`    | Exit 0，`8/8`；Node仅有既有`DEP0060` warning        |
| `npm run test -- --includeName "SceneGIS/Renderer/SceneGISPlanarTerrainMesh"`       | Exit 0，`6/6`                                       |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTerrain"`              | Exit 0，`15/15`                                     |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`              | Exit 0，aggregate `34/34`（Shader 4 + Surface 30）  |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"` | Exit 0，`2/2`；Node仅有既有`DEP0060` warning        |
| `npm run build`                                                                     | Exit 0                                              |
| `npm run build-release`                                                             | Exit 0                                              |
| changed-scope ESLint / Prettier                                                     | Exit 0                                              |
| affected Documentation / AgentDocs Prettier / Markdownlint                          | Exit 0                                              |
| `git diff --check`                                                                  | Exit 0（Git仅报告working-tree line-ending notices） |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                  | Exit 0                                              |

CPU证据中，相邻triangle内部独立插值的decoded smooth candidate angle严格小于同一曲面fixture的per-face angle；
synthetic Quantized坡面normal为finite unit、world Z向上且与解析方向dot大于`0.998`，解析一致的representative相邻
tile与parent/four-child world normals dot均大于`0.999`。Worker output与GPU persistent cost均精确
为每个final vertex `2` bytes；真实Context证明每个non-flat content恰有两个vertex attributes/buffers，20个warm
frames不新增mesh task、buffer、VA、shader或command，Heightmap与Quantized销毁时两条vertex-buffer路径均平衡。

Architecture首轮review提出A6-R001/R002 focused evidence缺口。Execution只修改既有Worker与Quantized Widget
fixtures：移除normal self-comparison，改为共享边两侧candidate interpolation；直接decode Quantized已知坡面方向，并在
同一real Context Quantized scene启用smooth lighting，锁定finite changed pixel与warm identities。Worker `8/8`、Widget
`2/2`重新通过；Architecture focused re-review确认两项finding均已关闭。Product runtime delta=`0`，direct case
count仍为`65`。

### Ownership、生成与剩余风险

- Changed product/spec paths全部位于`packages/engine/Source/SceneGIS/**`与`packages/engine/Specs/SceneGIS/**`；
  upstream-owned files=`0`，A6 SGP=`0`，new `SCENEGIS_PATCH` markers=`0`。
- `.scenegis/upstream-patches.json`、SGP-0001/0002、唯一Worker entry和build files均unchanged；generated files in
  status=`0`。A6没有public JSDoc/type变化，因此按phase边界未运行`build-ts`、`build-docs`、`tsc`或package smoke。
- Remaining risk保持ADR-0029边界：task-local normals不保证任意独立provider tile的gradient bit-identical；极小或
  退化triangle稳定回退`+Z`。A7仍需项目负责人在真实浏览器/GPU比较smooth/FLAT、LOD切换与地下视角。

### Architecture review result

Architecture focused re-review于`2026-08-11`批准A6。Reviewer独立复跑Worker `8/8`、terrain Widget `2/2`、
`git diff --check`与official upstream audit，确认A6-R001/R002关闭；upstream-owned files=`0`、A6 SGP=`0`。
A6至此完成，后续A7不得混入本阶段checkpoint。
