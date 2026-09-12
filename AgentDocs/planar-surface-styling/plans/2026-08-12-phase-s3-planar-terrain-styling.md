# Phase Plan: S3 Planar Terrain Styling

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-surface-styling extension](2026-08-12-planar-surface-styling-extension.md)
- Phase: `S3`
- Owner role: `execution`
- Architecture review: product code `approved`; development tooling follow-up `approved`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-12`
- Updated: `2026-08-12`
- Related discussions: 项目负责人提出平面 terrain 的坡度、坡向、等高线与 height styling
- Related reviews: [S3 review request](../reviews/2026-08-12-s3-planar-terrain-styling.md)
- ADR: 新建 `Documentation/SceneGIS/Decisions/ADR-0032-planar-terrain-material-styling.md`
- SGP: None expected；upstream-owned diff 出现前必须停止并升级计划

## Objective

为 `SceneGISPlanarWorld` 增加 caller-owned `Material | undefined` terrain styling contract，直接复用 Cesium
`Material`/Fabric 的 shader source、uniform map 与 texture update 生命周期，由 SceneGIS planar Surface 组装不依赖
椭球的 `czm_materialInput`。首个稳定资格集为 `ElevationContour`、`ElevationRamp`、`SlopeRamp` 与
`AspectRamp`：height 是绝对米制 world Z，slope 相对 `+Z`，aspect 从 `+Y` north 顺时针。材质在 imagery
composition 后、现有 lighting 前 alpha-over 到 opaque surface，且 `material === undefined` 保持 S2 像素、variant、
资源与性能 fast path。

## Non-goals

- 不复制或修改 Globe shader，不复用 Globe 的 ellipsoid/cartographic、ENU、water-mask 或 atmosphere runtime。
- 不新增 SceneGIS terrain-style class、色带 API、Material type、Material cache、Fabric parser 或 shader DSL。
- 不承诺任意 Cesium Material 都具有 Globe 完整语义；本阶段只资格化四个 terrain styling builtin，以及只消费本文
  保证输入/输出的 custom Fabric。
- 不消费 `czm_material` 的 `normal`、`specular`、`shininess` 或 `emission`；只取 `diffuse` 与 `alpha`，不改变
  现有 planar Lambert lighting 模型。
- 不增加 translucent Surface、multipass、framebuffer、CPU texture/color processing、额外 terrain request/mesh，
  或让 terrain provider/Material 所有权转移给 World。
- 不修改 A6/A7 terrain Worker、mesh、oct normal、up-sampling、imagery filter、Ground/Primitive、Viewer、controller、
  Scene loop 或 package/build pipeline。
- 不在本 phase 实现 ElevationBand、water、normal-map material、日月、大气、昼夜 alpha 或环境光照。

## Entry conditions

- Branch=`feature/planar-surface-styling`，implementation base 由 Architecture 的 S3 规划 checkpoint 确认；该
  checkpoint 的父提交为已批准 S2 checkpoint `9d1cb4de44af3c2b21ad75bfc8b07c8dfd34ff8c`。
- S1/S2 implementation、Architecture review、manual gate 与独立本地 checkpoint 已完成，working tree 在规划
  checkpoint 后必须 clean。
- Architecture 已审计当前 Cesium `Material`、Globe material injection、`czm_materialInput`、四种 builtins、planar
  world-Z/model matrix、A7 oct normal、Surface shader/cache/uniform/replay 与 real-Context 测试入口。

## Current source facts

- `Globe.material` 直接保存 caller reference。normal render 先调用 `material.update(context)`，再把
  `material.shaderSource` 与 private `_uniforms` 接入 Globe shader；Globe 不在 replacement 或 destroy 时销毁
  `Material`。这套 source/uniform lifecycle 可复用，但 Globe 自己组装的 ellipsoid input 不可复用。
- Cesium 四个目标 builtin 分别消费 `materialInput.height`、`slope` 或 `aspect`；`ElevationContour` 使用
  `dFdx/dFdy` 抗锯齿，三个 Ramp material 使用一个 `sampler2D` 色带。Material shader 最终返回
  `czm_material`；Globe terrain 也只把 `diffuse/alpha` alpha-over 到当前 surface color 后再 lighting。
- 当前 planar Surface 由 base color 与 shown imagery bottom-to-top 合成一个 opaque command。S2 fragment template 在
  composition 后只执行可选 Lambert lighting，输出 alpha `1.0`。
- Surface shader key 目前为 `layerCount/enableLighting/normalMode`。Material source 会改变 shader program；uniform
  value mutation本身不应改变 source variant。当前 shader map由Surface拥有并在destroy时release。
- 无 lighting 时使用 unlit VS；lighting 时 terrain mesh 使用 A7 smooth oct normal，flat/未就绪 fallback 使用
  geometric fragment derivatives。Material 即使 lighting 关闭也可能需要 normal，因此 material path 必须独立请求
  smooth/geometric input，不能沿用 unlit VS。
- Worker position Z 是 `absoluteHeight - referenceHeight`；tile model matrix Z translation 是
  `referenceHeight`、Z scale 是 `1`，因此 vertex 中 `(czm_model * vec4(position, 1.0)).z` 是绝对米制 world Z。
- A7 oct normal 是固定 planar world-axis、topology-up `Uint8Array` 两分量；`(128,128)` 解码出的 flat normal 有
  一个量化 bin 内的水平分量。style slope/aspect 必须显式消除该 flat 量化偏差，不能用 `abs(dot)` 掩盖 winding。
- 当前 shown imagery count 只与 `maximumTextureImageUnits` 比较。Material sampler 同样占 fragment texture units；
  preflight 必须在 request、selection、Material update 与 Surface-owned GPU mutation前计入。
- Pick/depth-only pass 只重提最近 normal render 发布的 command references，不运行 selection、slot/resource state
  machine。Material identity assignment也必须遵循这一发布边界。

## Public contract

`SceneGISPlanarWorld` 新增 mutable `material` property：

- Type 为 `Material | undefined`，default `undefined`。不增加 constructor option；用法与 `Globe.material` 对齐为
  构造后显式赋值。
- setter 接受 `undefined` 或当前 engine module identity 的 `Material`；其他值抛 `DeveloperError`，且 assignment
  failure atomic。赋相同 reference 是 no-op。
- getter 返回同一 caller-owned reference，不 clone。替换、设为 `undefined` 或销毁 World 均不调用
  `material.destroy()`，也不销毁其 texture/sub-material。
- Material identity assignment 在下一次成功 normal render 才发布到 Surface commands；此前 pick/depth-only pass
  继续重提最近 normal snapshot。新 assignment 不请求 tile、不主动创建 shader/texture，也不清空 replay。
- 同一个 Material 的 `uniforms` 保持 Cesium live mutable contract；数值/Color uniform mutation不更换
  DrawCommand、ShaderProgram、mesh、VA 或 imagery texture。Material 自己的 image/cube uniform mutation允许按
  `Material.update` 创建/替换 Material-owned texture，不能伪称 uniform-only 零 texture churn。
- SceneGIS 在成功 normal render 内调用当前 pending Material 的 `update(context)`；destroyed/invalid Material 所产生的
  error不得使 Surface-owned selection、command publication、request、shader map或 replay进入半更新状态。

支持的 planar `czm_materialInput` 与 output contract：

| Field                | Planar meaning                                                             |
| -------------------- | -------------------------------------------------------------------------- |
| `st`                 | 当前 tile 的 normalized XY texture coordinates                             |
| `s`                  | `st.s`                                                                     |
| `str`                | `vec3(st, 0.0)`                                                            |
| `normalEC`           | topology-up planar terrain normal in eye coordinates                       |
| `positionToEyeEC`    | fragment-to-eye vector `-positionEC`，米制                                 |
| `tangentToEyeMatrix` | fixed planar `+X East/+Y North/+Z Up` basis transformed to eye coordinates |
| `height`             | absolute planar world Z，meters                                            |
| `slope`              | `acos(dot(normal,+Z))`，range `[0, pi/2]`                                  |
| `aspect`             | downslope azimuth from `+Y` north clockwise，range `[0, 2pi)`；flat=`0`    |
| `waterMask`          | deterministic `0.0`；本 phase 不支持 water-mask semantics                  |

- `normalEC` 在 geometric fallback/地下双面视角均朝 planar `+Z` hemisphere；不根据 camera facing 翻面。
- Slope/aspect 使用 world-axis normal 对 `+X/+Y/+Z` 的投影。A7 eight-bit oct decode 的水平投影不超过一个量化
  bin 时，style input snap 为 `slope=0`、`aspect=0`；阈值及升级复核写入 ADR-0032，lighting normal 不因该 style
  snap 改变。
- `aspect` 明确不同于当前 Globe material 文档中的 East-based convention。SceneGIS 的稳定定义是 north-clockwise：
  downslope `+Y=0`、`+X=pi/2`、`-Y=pi`、`-X=3pi/2`。
- Custom Fabric 只有在消费上述已初始化 fields、只依赖 `czm_getMaterial` 的 `diffuse/alpha` 结果时属于支持范围；
  normal mapping、water、ellipsoid/cartographic input 与 translucent pass 不在契约内。

## Shader, state, and lifecycle design

1. `material === undefined` 不加入 define、source、uniform map、sampler、position varying 或 normal requirement；现有
   S2 key/source/command与 default pixel fast path必须保持。
2. Material-defined variant 在 S1 fixed fragment template 中插入 `material.shaderSource` 并定义一个明确
   `SCENEGIS_MATERIAL` seam；JS 继续只动态组合 layer declarations/source与Material source。不得复制 Cesium Material
   builtins 或 GlobeFS。
3. Material-defined path 无论 lighting 是否开启都使用 normal-capable VS：terrain-ready=`smooth`，flat/未就绪=
   `geometric`。vertex/fragment 传递 absolute world height 与 positionEC；style normal、lighting normal共享同一个
   topology-up结果，lighting仍只执行一次且位于Material overlay之后。
4. 顺序固定为 base color → 每层 imagery sample/filter/alpha composition → `czm_getMaterial` →
   `material.diffuse/alpha` source-over opaque color → optional existing Lambert lighting → alpha `1.0`。Material
   `translucent` 不改变 Surface render state、pass或single-command contract。
5. Shader variant至少包含 layer count、lighting flag、normal mode与Material source identity。Material reference/source
   identity改变时必须获得正确 source/uniform map；同一Material的public uniform value变化不得 recompile。
6. 不允许 unbounded Material identity registry或全局 cache。Execution须采用Surface-owned、可销毁的稳定 identity/
   variant策略；上一normal snapshot在新normal publication前必须保持可重提。新normal成功发布后，旧的
   Material-specific Surface shader refs按Cesium ShaderCache规则release，World destroy时剩余refs exactly once release。
7. Per-tile uniform map将Surface/imagery uniforms与当前已发布Material的 `_uniforms`组合，不能写入或复制Material
   uniforms。使用 `_uniforms` 是受ADR-0032约束的 soft-private seam；未来Cesium升级必须复核其shape、suffix与
   `Material.update` lifecycle。
8. Material sampler count从最终 assembled `material.shaderSource` 的实际 `uniform sampler2D/samplerCube`
   declarations推导，去重后与 shown imagery layer count相加。若总数大于
   `ContextLimits.maximumTextureImageUnits`，normal render必须在 tile request、selection、`material.update`、shader/
   texture/command mutation前 fail-fast。Real Context要证明当前16-unit设备上一个Ramp sampler为imagery预算保留一格。
9. Material `update(context)` 只在非零drawing-buffer、实际normal render且preflight通过后执行；pick/depth replay与
   duplicate render pass不调用。Material update error可以影响Material自有内部状态，但不得部分发布
   SceneGIS Surface-owned状态。
10. LOD、ready ancestor、upsampled child、skirts、underground与flat fallback继续走同一 selected tile/mesh；不新增
    terrain request或style mesh。Skirt只作为遮缝几何继承style，验收不赋予其独立等高线语义。

## Affected paths

### Allowed

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js`
- `packages/engine/Source/Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceGeometricLitVS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceSmoothLitVS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceShaderSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainAdvancedQualificationSpec.js`
- 可新增
  `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainStylingCesiumWidgetSpec.js`
- `packages/sandcastle/gallery/scenegis-planar-terrain/index.html`
- `packages/sandcastle/gallery/scenegis-planar-terrain/main.js`
- `packages/sandcastle/gallery/scenegis-planar-terrain/sandcastle.yaml`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/Decisions/ADR-0032-planar-terrain-material-styling.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `AgentDocs/planar-surface-styling/**`

### Forbidden without Architecture re-approval

- Cesium upstream-owned `Material.js`、Globe/GlobeSurface、`Shaders/Materials/**`、builtin struct/function或Renderer
- `SceneGISPlanarImageryLayer*`、private imagery request/cache/texture runtime、S2 filter contract与shader order
- planar terrain Provider/Data/Worker/Mesh/normal generation/upsampler、quadtree与terrain query
- `SceneGISPlanarSurfaceUnlitVS.glsl`；无Material fast path不需要改变
- Ground、Primitive、Viewer/widgets integration、controller、Scene/world switch或render loop
- 新 public SceneGIS terrain-style type/helper、new Material builtin/cache registration或新 shader root
- `scripts/**`、package/build/index generator、package manifests、`.gitignore`、`.scenegis/**`
- 新 Sandcastle目录、E2E/Playwright、网络fixture或下载/预取逻辑
- generated index、declaration、Shader JS、SpecList、API docs或`Build/**`

任何必须扩大产品路径的发现都先回报Architecture，更新plan/assignment后再实现；不得把方便性当作扩范围理由。

## Steps

1. Execution复核branch/base/status、本plan与S2 checkpoint；复读相关DevelopmentGuide、Architecture、ADR-0012、
   ADR-0029、ADR-0030、ADR-0031及作用域`AGENTS.md`，任何事实偏差先回报。
2. 为`SceneGISPlanarWorld.material`实现严格、failure-atomic、caller-owned public contract，仅把pending reference传入
   Surface normal render；不在setter中触碰Context资源或replay。
3. 扩展Surface material preflight、normal-render update/publication、source identity、uniform-map组合、shader lifetime与
   texture-unit预算；先用focused unit Specs锁住错误顺序与replay，再接GPU。
4. 扩展两个normal-capable VS和fixed FS，组装完整planar `czm_materialInput`、flat oct quantization snap、north-clockwise
   aspect与固定composition顺序；不修改unlit/no-material source。
5. 用built-in `Material.fromType`完成四类style的source/real-Context qualification，补custom Fabric受支持输入与
   unsupported output边界测试；不得以raw source字符串断言替代实际compile/link/pixels。
6. 扩展现有`scenegis-planar-terrain`，明确持有/销毁demo自己创建的Materials，提供None、Contour、Height、Slope、
   Aspect、reset、lighting与现有mountain/underground controls。overlay显式position/z-index/scroll，不能再次依赖
   `bucket.css .backdrop`隐式布局。
7. 新建ADR-0032并更新Architecture、Guide、UpgradeChecklist；对ADR-0012/0029只添加必要amendment/link，不改写
   历史决定。记录Material soft-private seam、north-clockwise convention、quantization floor、sampler budget、
   ownership与升级条件。
8. 运行本plan自动化/交付/static/ownership矩阵，回写精确命令、case count、GL limits、偏差与结果；新建S3 review
   request并通知Architecture ready-for-review。review批准前不请求manual gate。

## Automated validation

- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`
- `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainStylingCesiumWidget"`（若按允许路径新增）
- `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainAdvancedQualification"`
- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run build-docs`
- `npm run tsc`
- `node scripts/scenegis/verify-planar-packages.mjs`
- 在`packages/sandcastle`运行`npm run build-gallery-no-embedding`；不把公网OSM作为自动化gate。
- changed-scope ESLint、Prettier、Markdownlint；AgentDocs另运行
  `npx prettier --check --ignore-path .gitignore "AgentDocs/planar-surface-styling/**/*.md"`与
  `npx markdownlint "AgentDocs/planar-surface-styling/**/*.md"`。
- `git diff --check`
- `node scripts/scenegis/audit-upstream-patches.mjs`
- `git status --short`与generated-file audit；generated declaration/API HTML只读验证，不进入diff。

Real-Context evidence至少覆盖：

- `material === undefined`的unlit/lit local fixture pixels、ShaderProgram/command count与S2 baseline等价；
- `ElevationContour`在含non-zero `referenceHeight`的terrain上按绝对米制height产生正确interval/width像素；
- `ElevationRamp`消费Material-owned sampler，height mapping可预测；`SlopeRamp`在flat与确定斜坡上匹配radian输入；
- `AspectRamp`分别证明downslope north/east/south/west为`0/pi/2/pi/3pi/2`，flat因quantization snap为0；
- multi-layer imagery filter先完成，Material source-over后只执行一次lighting；Contour/alpha overlay顺序由像素证明；
- flat fallback、terrain-ready smooth、ready ancestor/upsampled child与一次LOD transition无compile error、无方向翻转、
  无额外request；地下视角normal/aspect不随camera-facing翻转；
- Material assignment后、下一normal render前depth/pick重提旧command；下一normal才原子发布新source/uniform map；
  相同reference no-op与numeric/Color uniform mutation不重建command/shader/mesh/VA/imagery texture；
- 1-sampler Ramp与shown imagery共同受当前Context真实texture-unit上限约束；允许的最大组合link/render成功，超一层在
  request/selection/Material update/Surface GPU mutation前产品fail-fast；
- Material replacement/World destroy不销毁caller Material或其texture；Surface shader refs/cache与现有resources仍
  exactly-once release，无长期identity registry增长。

## Manual gate

Architecture/code review approved后，由项目负责人在现有`scenegis-planar-terrain` Sandcastle完成一次人工gate：

- None/reset恢复当前terrain像素；Contour、Height、Slope、Aspect均可见且切换无瓦片重载或长闪烁；
- contour interval/width与Ramp色带可操作，lighting on/off仍发生在style之后；
- mountain、flat fallback、LOD缩放与underground navigation下坡向不反转；
- controls/status始终位于canvas上方，紧凑视口可滚动且不遮挡credit；
- OSM best-effort、credit、usage policy与caller ownership保持。

公网OSM不可用只影响该人工服务画面，不能替代或阻塞local deterministic Specs。项目负责人确认前不得创建S3
completion checkpoint或进入S4。

## Risks and dependencies

- `Material.shaderSource`与`_uniforms`是Cesium source事实，其中`_uniforms`为soft-private seam；minor升级可能改变
  suffix、texture update或sub-material组合，ADR/checklist必须要求源码与installed package复核。
- Arbitrary custom Fabric可能引用本phase未保证的input/output。公共文档必须说清支持子集，不能仅因能compile就宣称
  Globe Material完整兼容。
- eight-bit oct normal的flat量化误差会污染Slope/Aspect；snap阈值必须由编码数学与pixels共同证明，未来若normal
  packing改变必须同步复核，不能硬编码成无来源magic number。
- Material sampler会压缩imagery layer预算。只检查imagery count会到link/runtime才失败；preflight顺序和声明去重
  必须有真实Context边界case。
- Material identity/source与上一normal replay存在lifetime竞争。过早release会使depth replay持有失效shader，永久
  cache又会增长；publication与release顺序必须由identity/destroy Specs证明。
- Contour derivative、large world-Z interpolation与LOD seam对precision敏感；资格数据需要non-zero reference、明显
  interval和受控camera，不能依赖公网DEM肉眼判断。

## Completion criteria

- `SceneGISPlanarWorld.material`具有严格、文档化、failure-atomic、caller-owned契约；default undefined无行为/成本回归。
- Cesium Material/Fabric在零upstream diff下复用，planar inputs、north-clockwise aspect、composition、unsupported范围与
  soft-private升级边界由ADR-0032冻结。
- Contour/Height/Slope/Aspect四种builtin在real Context以absolute meters与stable world-axis normals通过pixels；
  lighting、underground、flat/LOD、normal/depth replay、texture-unit budget与resource lifecycle闭环。
- 现有terrain Sandcastle可操作展示并通过项目负责人manual gate；API/types/docs、dev/release/installed package与
  ownership/generated-file检查全部通过。
- Upstream-owned files=`0`、SGP=None，或任何偏差已停止并获Architecture重新批准。
- Architecture/code review approved、findings关闭、manual gate通过后，由Architecture创建中文本地S3 checkpoint；
  此前Execution未commit、未push、未进入S4。

## Deviations and results

- Implementation status：Architecture focused re-review已批准，`S3-R001`至`S3-R006`全部fixed；等待项目负责人
  manual gate。
- Product设计无scope deviation。新增允许的Styling Widget Spec；A7 qualification加入caller-owned Contour，使Material
  持续穿过lighting churn、warm frames、underground、Heightmap→Quantized replacement与destroy ownership。WorldSpec旧
  resident fixture同步当前oct-normal Worker/finalize contract，未修改产品terrain pipeline。
- Shader使用固定`SCENEGIS_MATERIAL` seam；undefined继续返回S2 fast path。Material variant在selection/publication前完成
  geometric/smooth真实compile/link；失败释放candidate且不改变旧replay。成功publication后release旧source并使resident
  cached command metadata失效，A→B→A跨ShaderCache release会重绑live program。Uniform map直接组合published `_uniforms`。
- Sampler preflight去除注释、支持precision qualifier并按identifier去重。当前real Context texture units=`16`、fragment
  uniform vectors=`1024`；15 shown imagery + ElevationRamp完整link/render，第16层在update、selection/request与Surface
  mutation前fail-fast。
- Focused results：World `21/21`；Surface aggregate `40/40`；Styling Widget `7/7`；A7 `1/1`。所有GPU用例暴露render
  errors；pixels覆盖四个stable builtin、non-zero absolute height、Contour width、flat slope、四方位aspect、imagery→Material
  alpha→lighting及ancestor/upsampled/LOD。非法Fabric compile失败保持publication/replay/counters/shader refs原子。
- Delivery：build、release、types、docs、tsc、installed package verifier与gallery 307 examples通过。Generated d.ts只读确认
  `material: Material | undefined`且constructor无material option。
- Static/audit：scoped ESLint、Prettier、Markdownlint、diff与upstream audit通过；upstream-owned=`0`、generated=`0`、
  SGP=None。仅有Windows LF→CRLF提示。
- S3-R005/006：terrain demo新增Contour spacing/width与Ramp color controls；JSDoc/Guide明确planar inputs、
  diffuse/alpha-only及custom Fabric非完整Globe兼容。当前精确changed paths=`23`，全部在allowlist。
- 项目负责人于`2026-08-12`在`scenegis-planar-terrain`完成Sandcastle manual gate并确认视觉验收通过；Architecture无需
  重复或扩大像素/LOD用例。Architecture随后创建独立本地checkpoint
  `201fb98213a15a160fbc4340c63918180734f6a7`，S3正式关闭并作为S4 implementation base。
- Development tooling follow-up：项目负责人批准新增`scripts/scenegis/start-sandcastle-dev.mjs`、SceneGIS-owned Vite
  wrapper及focused Node test，统一编排initial gallery sync、exported build-watch task readiness、Sandcastle Vite、serialized
  gallery rebuild与跨平台process cleanup。Architecture最终窄范围复核已批准；T001至T006全部fixed。
  Vite listen/printed URL/compiled outer+inner origins共享validated port；build child只在full build、incremental context与watcher
  registration完成的task callback后发marker，父进程再校验必需outputs。HTTP port 80保留Vite numeric listen参数，同时
  URL/origins canonicalize为`http://localhost`。Node test `8/8`与
  changed-scope ESLint/Prettier/Markdownlint、
  diff/upstream/generated audit通过；完整working tree为27 allowlist paths。Tooling follow-up本身未替代manual gate；项目负责人
  随后已单独确认视觉验收通过。
