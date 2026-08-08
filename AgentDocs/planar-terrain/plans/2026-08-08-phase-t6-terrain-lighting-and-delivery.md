# T6 阶段计划：平面地形基础光照与交付收尾

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- Parent extension：
  [SceneGIS 平面地形总体计划](2026-08-07-planar-terrain-extension.md)
- 负责人角色（Owner role）：`architecture` / `execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-08`
- 更新日期（Updated）：`2026-08-08`
- Implementation diff base：
  `1cafd98ed07fda045833b4fca0c14f9004b8e0f6`
- 相关讨论（Related discussions）：项目负责人已在 T5 公开 terrain Sandcastle 人工查看后批准
  T6 完整设计；确认采用片元几何法线、Cesium scene light、默认关闭的基础 Lambert lighting，
  不在本阶段引入 Worker、CPU vertex normal、完整材质系统或重型资格矩阵
- 相关 ADR：
  - [ADR-0003：平面 Surface 运行时与 LOD](../../../Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md)
  - [ADR-0005：平面栅格影像运行时与图层合成](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)
  - [ADR-0008：平面地形 Mesh 与 Surface 集成](../../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)
  - [ADR-0009：平面地形连续 LOD、上采样与缓存](../../../Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)
  - [ADR-0011：坐标系无关的平面 XYZ Heightmap Terrain Provider](../../../Documentation/SceneGIS/Decisions/ADR-0011-planar-url-template-heightmap-terrain-provider.md)
  - [ADR-0012：平面地形基础光照与几何法线](../../../Documentation/SceneGIS/Decisions/ADR-0012-planar-terrain-lighting-and-geometric-normals.md)
- SGP：无；T6 禁止修改 upstream-owned file
- 相关评审（Related reviews）：Execution 完成后创建
  `../reviews/2026-08-08-t6-terrain-lighting-and-delivery.md`，初始状态必须为 `pending`

## 阶段目标

T6 是 `planar-terrain` extension 的最后阶段。它在不改变 terrain 数据、LOD、查询、拾取和
provider 契约的前提下，为现有平面 surface 增加可选的基础地形光照，并完成与风险相称的人工
验收、有限性能检查、使用文档和升级清单收尾：

- `SceneGISPlanarWorld` 提供默认关闭的基础 Lambert lighting 配置；
- 法线直接由实际渲染三角面在 fragment shader 中求得，不扩大 mesh/GPU ownership；
- flat、direct、upsampled、fallback、skirt 和 imagery 继续使用同一个 opaque command path；
- 相机位于 surface 下方仍是合法状态，双面渲染不会因为光照被改成 back-face culling；
- 当前 terrain Sandcastle 提供稳定光源、光照开关和可观察地形起伏的视图；
- 只执行最小充分的画面、资源、warm-frame、类型、文档和 Sandcastle 验证；
- 根据已经观察到的 T5 页面和有限 profiling 明确是否存在 Worker/byte budget 后续需求，但 T6
  本身不预先实现 Worker。

T6 不实现 smooth vertex normals、normal map、PBR、阴影、水体、大气、terrain material system、
地形夸张、碰撞、Entity clamp、地下模式或新的 provider。

## 进入基线与依赖

- 分支：`feature/planar-terrain`。
- implementation diff base：
  `1cafd98ed07fda045833b4fca0c14f9004b8e0f6`。
- T5 已完成 Architecture/code review并形成 clean local checkpoint；Execution 必须以该 commit 为
  T6 diff base，不把 planar-world、T1 或 upstream merge-base 当作本阶段 base。
- T2/T3 已固定 tile-local XY、relative Z、regular grid、skirts、single-command terrain/imagery、
  normal-render mutation 和 depth replay；T6 只能在其上增加表现层变体。
- T4 已固定 resident query、terrain picking 与 Z=0 reference picking 职责；光照不得改变 geometry、
  bounds、selection、query snapshot 或 ray result。
- T5 已提供公开 EPSG:3857/OSM/ArcGIS LERC 案例。项目负责人已确认该案例可进入下一阶段；公网
  服务仍只用于 best-effort 人工检查，自动化不得依赖公网。

## 当前源码事实

### Scene light 与 Shader 基础设施

- `Scene` 已将 `scene.light` 写入 `frameState.light`；`UniformState` 自动发布
  `czm_lightDirectionEC`、`czm_lightColor` 等 uniform。未显式设置 light 时 Cesium 使用既有默认
  light。
- `czm_getLambertDiffuse` 已是 Cesium shader builtin。T6 不需要新增 builtin、automatic uniform、
  `Light` 类型或 upstream hook。
- Cesium 当前 shader 转换链会在需要时启用 standard derivatives；仓库已有 `dFdx`/`dFdy` 使用
  先例。T6 仍必须通过真实 Context Spec，而不能只凭源码字符串推断兼容。
- `Globe` 的 `enableLighting=false`、`lambertDiffuseMultiplier=0.9` 和 Lambert 公式只作为命名与
  默认值启发；平面 surface 不复制 Globe 的 ellipsoid normal、atmosphere、day/night、shadow 或
  material variants。

### 当前 planar surface

- `_SceneGISPlanarSurfaceShader` 当前 vertex shader只接收 tile-local `vec3 position`，输出
  `position.xy + 0.5` UV；fragment shader按 shown layer bottom-to-top合成并输出 opaque RGB。
- `_SceneGISPlanarSurface` 以 `layerCount` 缓存 `ShaderProgram`，每个实际 render tile保持一个
  `DrawCommand`。terrain只替换同一 command 的 VertexArray、primitive type、count、model matrix和
  bounding volume。
- depth/pick pass只重放最近 normal render缓存的 exact command references，不重新 selection、加载、
  promotion、mesh、imagery或 command创建。
- culling关闭，`castShadows=false`、`receiveShadows=false`；这是当前 camera-below-surface合法性的
  一部分，T6 不得改变。

### Terrain mesh 与资源

- `_SceneGISPlanarTerrainMesh` 只有 Float32 position与共享 index topology，没有 normal attribute。
  regular-grid surface、skirts、direct和upsampled内容最终都走同一 positions/indices路径。
- Tile model matrix承担完整 CRS translation/scale与 relative-height reference；`czm_modelView`
  可从现有 model-local position得到 eye-space position，无需把完整 CRS坐标作为 vertex varying。
- CPU vertex normal会增加 mesh格式、buffer带宽、fallback生成、边界邻域和生命周期责任；当前没有
  画面或 profiling证据证明这些成本是基础光照必需的。
- T3 已限制每帧promotion并由 tile cache控制resident记录；T5 LERC仍在主线程decode。项目负责人
  当前未报告明显阻塞，因此没有进入 Worker build/protocol设计的依据。

## 已确认设计

完整长期决定以 ADR-0012 为准。本节把决定转为执行边界。

### 1. Public World lighting 配置

`SceneGISPlanarWorld` 构造 options和可变属性增加：

```text
enableLighting = false
lambertDiffuseMultiplier = 0.9
```

- `enableLighting` 必须为 boolean；constructor与setter对其他值抛 `DeveloperError`。
- `lambertDiffuseMultiplier` 必须为 finite non-negative number；constructor与setter执行相同
  fail-fast验证。
- 默认 `false` 保证 existing flat/imagery/terrain画面和 fragment成本不变。
- multiplier只在 lighting启用时生效，并通过 uniform动态读取；修改 multiplier不得创建新的
  ShaderProgram、DrawCommand、VertexArray、Buffer、terrain mesh或请求。
- World继续只消费 `scene.light` automatic uniforms，不拥有、复制或销毁 scene light。
- 不新增 public light class、normal option、ambient option、shadow option或 material object。

### 2. Fragment geometric normal

lighting vertex variant输出当前 vertex的 eye-space position；fragment variant使用实际屏幕导数：

```glsl
vec3 normalEC = normalize(cross(dFdx(v_positionEC), dFdy(v_positionEC)));
normalEC = faceforward(normalEC, vec3(0.0, 0.0, 1.0), -normalEC);
```

- normal直接对应实际 Float32 render triangle，而不是重新从 TerrainData、provider height或理想
  double extent计算。
- `faceforward` 语义与 Cesium双面 appearance一致，使法线朝 viewer-facing eye-space半球；不会
  因相机到 surface下方而启用 back-face culling或非法恢复。
- direct、upsampled、flat fallback、无 provider unit quad和 skirts均使用同一方法。Skirt参与
  render lighting，但仍不进入 T4 terrain query/picking。
- 首版明确是 triangle geometric lighting，不承诺跨 triangle、tile或 LOD的 smooth vertex normal。
  不增加 normal buffer、normal packing、邻 tile sample请求或 mesh topology变化。

### 3. Lambert 合成

在 baseColor与所有 shown imagery完成单 pass合成后，仅对最终 RGB应用：

```text
diffuse = czm_getLambertDiffuse(czm_lightDirectionEC, normalEC)
intensity = clamp(diffuse * lambertDiffuseMultiplier + 0.3, 0.0, 1.0)
rgb = rgb * czm_lightColor * intensity
alpha = 1.0
```

固定 `0.3` 是首版环境亮度底值，参考 Cesium terrain lighting的既有默认，用于避免背光和
camera-below-surface视角完全变黑；它暂不作为公共配置。若人工验收证明必须调整，再由
Architecture Agent裁决是否增加公共 API，不得由 Execution自行扩展。

lighting不增加 day/night、Sun position、HDR intensity、gamma/material、specular、normal texture、
shadow map或 atmospheric逻辑。应用若需要稳定方向，应显式设置 `scene.light`。

### 4. Shader variant 与 command lifecycle

- private Shader builder分别产生 unlit/lit vertex和fragment source；unlit variant不输出
  `v_positionEC`，也不执行 derivatives/Lambert，保持默认 fast path。
- Shader cache key必须至少包含 `layerCount`与`enableLighting`。同一组合只获取一次
  `ShaderProgram.fromCache` reference，surface destroy时exactly once释放每个已取得reference。
- command variant identity同时跟踪 layer count和lighting flag。切换lighting允许更新既有 command
  的 shader/uniform map，但不得新建 DrawCommand或改变tile selection、terrain content、imagery
  binding和resource ownership。
- normal render发生配置变化后发布新variant；随后的depth replay继续提交该次normal render缓存的
  exact command references并保持零selection/allocation mutation。
- 同一layer count下首次使用lit/unlit最多产生两个shader cache entries；steady warm frames不得继续
  增长。

### 5. Sandcastle 与人工验收

只更新现有 `packages/sandcastle/gallery/scenegis-planar-terrain/**`：

- World显式启用lighting并保留EPSG:3857、OSM imagery、ArcGIS LERC terrain、visible Credits和
  application-selected Earth skybox；
- `viewer.scene.light` 使用显式、归一化且稳定的 `DirectionalLight`，案例不依赖默认SunLight的时间
  方向；
- 增加一个lighting开关，并提供一个适合观察山地起伏的近景入口；不增加底图/地形选择器；
- 保留terrain error的best-effort fallback说明，不将公网可用性作为engine correctness；
- `sandcastle.yaml` 更新feature说明，但不改变服务policy/CORS/development边界。

Execution只能完成自动化与本地人工准备，不能代替项目负责人宣称最终视觉通过。T6 review后必须
由项目负责人在真实浏览器/GPU复核：起伏方向、明暗、lighting toggle、LOD切换、PC导航、边界视角、
surface下方视角、Credit与console。

### 6. 有限性能与 Worker 决定

- 使用确定性本地 terrain/imagery fixture比较unlit/lit稳定视图，记录selected/submitted、command、
  shader、VA、buffer、texture、mesh、promotion和request计数；hard gate是warm frame不持续分配、
  command数量不增加、destroy平衡，而不是瞬时FPS百分比。
- 可记录一个固定浏览器/画面条件下的简短timing作为趋势证据；不建立P8式长时间soak、跨机器阈值、
  workflow或新的release harness。
- 结合T5已人工打开的257×257 LERC案例记录是否观察到明显decode/mesh阻塞。若没有可重复阻塞，
  T6明确维持main-thread decode/mesh、现有promotion budget与tile-count cache。
- 若发现可重复且不可接受的主线程阻塞，Execution必须停止并交回Architecture Agent；Worker入口、
  payload、transferable、输出URL、build/release和byte budget需要新的phase/ADR，不能在T6中临时加入。

### 7. 文档与交付收尾

- 新增并保持ADR-0012与实际实现一致。
- 更新`Documentation/SceneGIS/Architecture.md`与`DevelopmentGuide.md`，提炼lighting、geometric
  normal、scene light、variant和Worker延期规则。
- 更新`PlanarWorldGuide.md`：当前文件仍描述surface无terrain，T6必须改为T1-T6真实能力，补
  terrain provider、query/picking、lighting示例、限制和调参说明。
- 更新`PlanarWorldUpgradeChecklist.md`：加入terrain runtime/mesh topology、standard derivatives、
  automatic light uniforms、shader cache key、LERC/getImagePixels和main-thread performance复核。
- 由于没有新增public class/export，只需确认现有`SceneGISPlanarWorld`新增properties进入root types和
  API docs；不重复P8 installed-tarball、完整E2E或全仓release qualification。

## 允许修改范围

默认允许窄修改：

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js`
- 上述模块对应的现有 SceneGIS Specs
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidgetSpec.js`
- 必要时现有 `SceneGISPlanarImageryCesiumWidgetSpec.js`，仅用于证明lit composition与single-command
  行为
- `packages/sandcastle/gallery/scenegis-planar-terrain/**`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0012-planar-terrain-lighting-and-geometric-normals.md`
- 本phase plan、review request和相关`AgentDocs/planar-terrain/**`索引

## 禁止范围

- 修改任何 upstream-owned file，或创建/扩大`SGP-0001`、`SGP-0002`和新SGP。
- 修改`_SceneGISPlanarTerrainMesh.js`、`_SceneGISPlanarTerrain.js`、Quadtree、Tile、Heightmap、
  upsampler、provider、sampler或terrain query实现。
- 增加vertex normal attribute/buffer、normal texture、第二个DrawCommand、multipass、translucency、
  back-face culling、shadow casting/receiving或terrain material system。
- 新增或修改Cesium shader builtin、automatic uniform、`.glsl`生成链、Shader/Worker build配置。
- 增加Worker、WASM、public byte budget、decode cache、promotion policy或tile eviction policy。
- 修改Camera Controller、Scene、CesiumWidget、Viewer、HomeButton、navigation target、terrain picking或
  Z=0 reference-plane contract。
- 增加terrain/imagery picker、runtime CRS转换、新公开服务adapter或自动化公网请求。
- 增加workflow、P8式release soak或无关上游全量回归。
- 手工编辑或提交任何生成文件。

若真实实现证明必须越过以上边界，Execution必须立即停止、记录blocker并交回Architecture Agent；
不得自行选择CPU normals、Worker或upstream patch作为替代实现。

## 实现步骤

1. 确认HEAD、clean diff base和允许路径，重新读取World、Surface、Shader、相关Specs与Sandcastle。
2. 完成private shader builder的lit/unlit source和最小源码级Spec，先锁定unlit不含lighting成本、lit
   geometric normal/face-forward/Lambert以及imagery合成顺序。
3. 增加World constructor/properties验证并把lighting state传入Surface；修改Surface shader cache、
   uniform map和existing command variant更新，不触及selection或terrain runtime。
4. 用真实Context deterministic heightmap证明lit画面、double-sided/below-plane、single opaque
   command、warm stability和depth exact replay；只在现有Specs中补最小充分cases。
5. 更新terrain Sandcastle的stable DirectionalLight、lighting toggle和山地近景入口，完成Execution
   可执行的本地冒烟并明确等待项目负责人视觉验收。
6. 完成Architecture/DevelopmentGuide/PlanarWorldGuide/UpgradeChecklist和ADR回写，运行最小公共
   build/types/docs、Sandcastle和ownership检查。
7. 创建pending review request，回写实际affected paths、case counts、计数/timing证据、人工未验项、
   Worker结论和remaining risks，然后停止等待Architecture review；不得进入下一扩展。

## 验收条件

### API 与默认兼容

- constructor和setter对boolean/finite non-negative契约fail-fast，失败前不改变World/Surface状态。
- 默认`enableLighting=false`的flat、imagery和terrain代表画面保持原有颜色/alpha与command数量。
- 修改`lambertDiffuseMultiplier`只改变uniform结果，不创建shader、command、VA、buffer、mesh或request。
- public properties进入engine/Cesium root declarations和API docs；没有新增public class/export。

### 光照与双面表现

- deterministic sloped terrain在稳定DirectionalLight下产生可辨认且finite的明暗差异；关闭lighting
  恢复原有unlit颜色。
- baseColor和多层imagery先bottom-to-top合成，再统一乘lighting；仍为单个opaque command。
- direct、upsampled、flat fallback和skirt均能编译、绘制；query/picking仍排除skirt并与光照无关。
- camera位于surface上方与下方都能看到双面surface，不新增home恢复、collision或culling变化。
- perspective至少覆盖真实Context；orthographic只在已有shader/command路径能代表时做一个focused
  smoke，不扩展完整导航矩阵。

### 生命周期、depth 与性能

- 同一layer count首次使用lit/unlit后shader entries收敛；warm frames不持续创建ShaderProgram、
  DrawCommand、VA、Buffer、Texture、terrain mesh、request或promotion。
- lighting toggle复用既有tile commands；terrain/imagery binding、selected/render tiles、bounds、SSE、
  protection和LRU不变。
- depth replay提交最近normal render的exact command refs，并保持selection、terrain/imagery state和
  allocation counters零变化。
- destroy后所有Surface取得的shader references与既有GPU resources保持exactly-once平衡。
- 简短timing只作趋势记录；不存在已确认、可重复且不可接受的lighting回退。Worker/byte budget最终
  结论必须在phase results中明确，而不是留成含糊TODO。

### Sandcastle、文档与所有权

- no-embedding Sandcastle构建并发现更新后的唯一terrain案例；自动化不请求OSM/ArcGIS。
- Execution本地冒烟记录source/metadata、scene.light、toggle、console与destroy；公网画面和导航最终
  状态保持“等待项目负责人人工验收”，直到项目负责人明确确认。
- PlanarWorldGuide不再把terrain列为unsupported，且准确说明provider、query、picking、lighting、
  main-thread限制与地下模式边界。
- UpgradeChecklist包含terrain/lighting当前全部private/upstream依赖。
- upstream-owned files=`0`、T6 SGP=`0`、manifest/SGP-0001/0002 unchanged、new patch markers=`0`、
  generated delivery status=`0`。

## 最小充分验证命令

Execution根据实际Spec basename填写精确`--includeName`，以以下边界为hard gate：

```text
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurfaceShader"
npm run test -- --includeName "SceneGIS/Scene/_SceneGISPlanarSurface"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarImageryCesiumWidget"
npm run build
npm run build-ts
npm run build-docs
npm run tsc
```

另运行：

- changed-scope ESLint、JS/Markdown Prettier、Markdownlint与`git diff --check`；
- 现有SceneGIS upstream patch audit；
- no-embedding gallery discovery与Sandcastle build；
- 一个固定本地real-Context lit/unlit warm comparison和Execution可执行的terrain Sandcastle冒烟。

除非实际diff越过既定边界或focused case发现回归，不运行Globe、完整Scene/CesiumWidget/Viewer、
installed tarball、P8 E2E/soak、标准embedding或全仓suite。项目负责人人工验收是独立门禁，不以扩大
自动化矩阵替代。

## 风险与已接受限制

- fragment geometric normal是per-triangle法线，可能观察到三角面或LOD replacement明暗变化；首版
  接受这一基础表现，不冒充smooth vertex normals。
- face-forward lighting优先保证双面可浏览，不追求物理正确的地下光照；真正地下模式仍是后续独立
  扩展。
- 默认SunLight在任意自定义planar CRS中没有投影语义；稳定业务画面应显式设置DirectionalLight。
- standard derivatives、automatic light uniforms、ShaderProgram cache和raw private shader builder是
  Cesium升级敏感点，必须进入升级清单。
- main-thread LERC decode与mesh generation仍可能在更大数据或设备上造成jank；当前无可重复阻塞
  证据，因此不以预防性Worker扩大T6。
- 公网terrain/imagery服务SLA、CORS和policy不属于engine correctness，人工失败不得通过放宽provider
  契约修复。
- 固定环境亮度`0.3`是首版视觉决定；若项目负责人人工验收不接受，应在T6 review中调整设计或公开
  参数，不能在完成后静默改变。

## 完成与阶段门禁

T6只有在以下条件同时成立后才能标记`completed`：

1. implementation、focused Specs、build/types/docs、no-embedding Sandcastle、有限性能和ownership
   evidence完成；
2. Execution在本计划回写actual paths、实现偏差、case counts、validation matrix、timing条件、
   Worker结论、manual-open items和remaining risks；
3. 创建`../reviews/2026-08-08-t6-terrain-lighting-and-delivery.md`并保持`pending`，由Architecture
   Agent完成architecture/code review；
4. 所有finding由Architecture reviewer确认fixed或由项目负责人明确接受；
5. 项目负责人在真实浏览器/GPU明确确认人工视觉通过；
6. Architecture Agent将T6 code、Specs、ADR/durable docs和AgentDocs形成独立中文本地提交，并把
   `planar-terrain` extension标为`completed`。

在该checkpoint前，Execution不得commit、push、tag、发布或进入新的extension/phase，也不得自行把
plan/review/extension标记为`completed`/`approved`。

## Execution results

### 实际设计与影响路径

- `SceneGISPlanarWorld`新增`enableLighting=false`与`lambertDiffuseMultiplier=0.9` constructor/
  mutable property契约；constructor/setter共用boolean或finite non-negative fail-fast验证。
- `_SceneGISPlanarSurfaceShader`生成真正分离的lit/unlit vertex/fragment source。Lit source从
  eye-space position的screen derivatives计算face-forward geometric normal，并在baseColor与全部
  imagery完成合成后应用ADR-0012 Lambert公式。
- `_SceneGISPlanarSurface`以`layerCount/lighting`作为shader cache key；tile继续复用原
  `DrawCommand`，lighting切换只更新shader/uniform map，multiplier由稳定uniform closure读取。
  Depth pass仍重放最近normal render发布的exact command references。
- 现有terrain Sandcastle显式启用lighting、安装normalized stable `DirectionalLight`、提供lighting
  checkbox、mountain view与Home入口；未增加provider picker或自动公网检查。
- 实际产品/Spec路径：
  - `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
  - `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
  - `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js`
  - `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
  - `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceShaderSpec.js`
  - `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceSpec.js`
  - `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidgetSpec.js`
  - `packages/sandcastle/gallery/scenegis-planar-terrain/{index.html,main.js,sandcastle.yaml}`
- Durable docs更新`Architecture.md`、`DevelopmentGuide.md`、`PlanarWorldGuide.md`和
  `PlanarWorldUpgradeChecklist.md`；ADR-0012决策无需偏离。未修改imagery Widget Spec，只运行其
  既有9 cases证明default-unlit composition未回退。

### Source-to-Spec mapping 与 focused cases

| Source / responsibility                                      | Spec / evidence                                      | Focused suite cases |
| ------------------------------------------------------------ | ---------------------------------------------------- | ------------------: |
| World constructor/property defaults、validation与mutation    | `SceneGISPlanarWorldSpec.js`                         |                  19 |
| Lit/unlit source、geometric normal、Lambert与composition顺序 | `SceneGISPlanarSurfaceShaderSpec.js`                 |                   3 |
| Variant cache、command reuse、uniform-only与depth replay     | `SceneGISPlanarSurfaceSpec.js`                       |                  25 |
| Real Context terrain/imagery pixel、warm、below-surface      | `SceneGISPlanarTerrainCesiumWidgetSpec.js`           |                   1 |
| Default unlit imagery composition regression                 | `SceneGISPlanarImageryCesiumWidgetSpec.js`（未修改） |                   9 |
| **Focused aggregate total**                                  | 5 focused suites                                     |              **57** |

相对T5 base，T6新增direct `it` cases共`3`：World、Shader和Surface各`1`。World既有default/
validation cases、Shader既有source cases及terrain Widget既有real-Context case扩展了lighting断言；imagery
Widget未修改，仅作为default-unlit回归。`57`只表示五个focused suite的aggregate cases，不表示T6新增数。

计划示例中的`SceneGIS/Scene/_SceneGISPlanarSurface`实际命中0 cases；真实suite describe为
`SceneGIS/Scene/SceneGISPlanarSurface`，因此最终使用后者。该命令aggregate `28/28`包含Surface direct
`25`与Shader `3`，统计中不重复计算。

### 自动化、画面、资源与 timing evidence

- Real Context固定为Chrome 151、Windows、`128×128` drawing surface、本地`2×2` Heightmap与本地
  `1×1` imagery。Unlit与stable DirectionalLight lit pixels均finite且不同；multiplier `0.0`再次产生
  不同ambient结果。四个actual render tiles保持单opaque command、UPSAMPLED indexed terrain、skirt
  与imagery同command。
- Lighting首次开启只增加一个shader variant；command、VA、buffer、texture、terrain mesh、promotion
  与request counters零增量。下一lit warm render复用相同command/shader/uniform map；修改multiplier不
  增加shader。Camera移到surface下方后仍获得finite非背景像素。
- Surface focused case证明depth replay提交normal-lit frame的相同command reference，且selection/
  shader allocation不变；destroy继续由既有terrain Widget检查VA、vertex/index buffer与shared-index
  reference balance。
- Jasmine报告完整real-Context terrain case用时约`0.287 s`；该数字包含Widget创建、异步terrain/
  imagery settle、warm、query/depth和destroy，不能隔离lighting帧成本，只作为本机趋势记录，不设
  百分比阈值。确定性hard gate是上述allocation/command/resource收敛。
- T5项目负责人人工页面未报告可重复且不可接受的257×257 LERC decode/mesh阻塞，本轮focused fixture
  也未出现重复stall。因此T6保持main-thread decode/mesh、每帧两个promotion与tile-count cache；
  不引入Worker、transferable、byte budget或新build seam。

### 验证矩阵

| 命令 / 检查                                                                         | 结果                                                                                          |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurfaceShader"`        | Exit 0；`3/3`                                                                                 |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                | Exit 0；`19/19`                                                                               |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`              | Exit 0；aggregate `28/28`，其中Surface direct `25`、Shader overlap `3`                        |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"` | Exit 0；`1/1` real Context                                                                    |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarImageryCesiumWidget"` | Exit 0；`9/9`                                                                                 |
| `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`            | 均Exit 0；build-ts仅输出仓库既有TSD-JSDoc warnings                                            |
| no-embedding gallery与Sandcastle build                                              | 均Exit 0；gallery发现`306` examples；Vite仅plugin timing/large chunk warnings                 |
| public declarations/API docs                                                        | 两个World options/properties在engine/Cesium d.ts可见；World API HTML可见；private shader命中0 |
| changed-scope ESLint/Prettier、Markdownlint、`git diff --check`                     | 均Exit 0                                                                                      |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                  | Exit 0；本次upstream-owned=`0`、generated status=`0`                                          |

### 人工验收、ownership 与剩余风险

- Execution完成了本地source/metadata、no-embedding discovery/build和真实Context自动化，且没有把公网
  OSM/ArcGIS可用性当作hard gate。项目负责人随后在真实浏览器/GPU打开terrain Sandcastle，确认页面
  与地形画面可用，并在复核固定`DirectionalLight`与未改造planar Sun语义的边界后明确批准T6。
- Implementation diff base为`1cafd98ed07fda045833b4fca0c14f9004b8e0f6`。最终audit确认
  upstream-owned files=`0`、T6 SGP=`0`、manifest/SGP-0001/0002 unchanged、new markers=`0`、
  generated status=`0`；所有产品与测试修改均位于SceneGIS-owned路径。
- Fragment normal保持per-triangle，可能在triangle或LOD replacement时出现明暗跳变；fixed ambient
  `0.3`和default-off是已批准视觉边界。默认SunLight不具有任意planar CRS语义，稳定应用必须显式
  `DirectionalLight`。真正underground、smooth normals、shadow/material和Worker仍不在T6范围。
- Architecture/code review已`approved`，`T6-R001`与`T6-R002`均确认`fixed`。项目负责人真实浏览器/GPU
  人工验收已通过；T6满足退出门禁并标记为`completed`，由Architecture Agent形成独立本地提交检查点。
