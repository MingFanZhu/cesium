# C11 Planar Depth/Stencil Ground Rendering

## 元数据

- Extension：`planar-content`
- 阶段（Phase）：`C11-planar-depth-stencil-ground-rendering`
- Status：`completed`
- Date：`2026-08-10`
- Branch：`feature/planar-content`
- Implementation base/checkpoint：`c376e82c7e`
- Planning owner：Architecture Agent
- Execution owner：Execution Agent（task `019fcff7-3313-7d03-b970-57b3d08e3a32`）
- Related extension plan：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- Related discussion：
  [Planar depth/stencil ground backend](../discussions/2026-08-10-planar-stencil-ground-backend.md)
- Related decision：
  [ADR-0023](../../../Documentation/SceneGIS/Decisions/ADR-0023-planar-depth-stencil-ground-rendering.md)
- Superseded runtime decision：ADR-0021 actual-cover CPU drape backend
- Previous checkpoint：C10 commit `c376e82c7e`
- Review request：实施完成后创建
  `AgentDocs/planar-content/reviews/2026-08-10-c11-planar-depth-stencil-ground-rendering.md`
- Ownership：预期upstream-owned files=`0`、C11 SGP=`0`

## 阶段目标

C11以单一SceneGIS-owned GPU depth/stencil ground backend替换C9 actual-mesh drape：

1. Planar Surface在现有Scene primary-surface pass中先写color/depth，ground area/polyline随后进入现有terrain
   classification pass。
2. Polygon类使用stable planar shadow volume与z-fail stencil；Polyline类使用stable segment volume与专用ground-line
   Shader。两者都不读取actual terrain triangles或随LOD/revision重建Geometry。
3. `SceneGISPlanarGroundPrimitive`收窄为implicit continuous clamp，保留public lifecycle/picking/attributes，但删除mixed
   HeightReference与ground-relative extrusion承诺。
4. 删除C9 private draper、ground snapshot与late registration，迁移automatic Entity、bounds、Specs、E2E、package与
   Sandcastle。
5. 对地表上方、下方、接近侧视、perspective/orthographic与代表性linear/log depth建立真实GPU闭环。
6. 完成Architecture/code review与项目负责人新页面人工验收后，才关闭`planar-content` extension。

## 非目标

- 不保留C9 actual-mesh runtime或failure fallback；不建立backend选择器。
- 不支持面状`RELATIVE_TO_GROUND`、mixed top/bottom reference、terrain-following extrusion、classificationType、
  3D Tiles classification、ordered ground layers、zIndex或arbitrary Material。
- 不建立terrain height texture、displacement atlas、new LOD/request/cache、Worker或per-tile ground batching。
- 不支持SCENE2D/COLUMBUS_VIEW、Globe与PlanarWorld同场混合或运行时world切换。
- 不新增第二个Sandcastle/E2E/qualification入口，不增加workflow，不做无关全库性能工程。
- 不因极端数值猜测扩大验证矩阵；只验证正常大坐标、核心pass/camera/pick/resource边界。

## 当前源码事实

### Cesium球面area ground

- `GroundPrimitive.update`先把input geometry转为ellipsoid rectangle，读取`ApproximateTerrainHeights`，要求
  `geometry.constructor.createShadowVolume`，最终构造`ClassificationPrimitive`。
- `ClassificationPrimitive`为每个VA创建两条相邻command：stencil-depth与color/pick。Z-fail front/back对classification
  mask做decrement/increment，color/pick在mask非零处绘制并归零。
- `ClassificationPrimitive.isSupported(scene)`只直接检查`scene.context.stencilBuffer`；material能力另依赖depth texture。

### Cesium球面ground polyline

- `GroundPolylinePrimitive`使用standard `Primitive` private hooks、自有`GroundPolylineGeometry` attributes与
  `PolylineShadowVolumeVS/FS`，每个VA只创建一条terrain-classification color/pick command。
- 它仍依赖map projection、ellipsoid和ApproximateTerrainHeights，因此不能直接用于米制XY route；但stable volume、
  GPU width/clipping和classification pass职责可作为实现参考。

### Scene pass ordering

- `Scene.updateAndRenderPrimitives`先update `scene._groundPrimitives`与`scene._primitives`，再通过SGP-0001调用primary
  World render，所有command之后统一进入visible-set/pass execution。
- 每个frustum先clear depth/stencil，执行`Pass.GLOBE`，随后执行`Pass.TERRAIN_CLASSIFICATION`，最后才执行
  `Pass.OPAQUE`。
- 当前`_SceneGISPlanarSurface` command仍是`Pass.OPAQUE`；C11必须迁移到`Pass.GLOBE`，否则classification早于
  planar surface depth。
- PlanarWorld与Globe构造互斥；无Globe时`clearGlobeDepth=false`，因此现有pass slots理论上可直接承载planar surface
  与ground classification。

### C9待删除seams

- `_SceneGISPlanarGroundDraper`按geometry/tile broad phase和regular-grid cells生成actual terrain Geometry。
- Surface维护lazy `_groundRenderSnapshot*`，World维护per-pass `_registerGroundPrimitive`队列并在Surface之后调用
  wrapper `_updateGround`。
- Ground wrapper以coverage signature驱动candidate/current standard Primitive；GroundBounds只承认可匹配actual
  snapshot的last-successful current。
- Automatic Polyline/Polygon/Area/Route把C9 HeightReference组合传入wrapper；qualification/E2E/Sandcastle和package
  private inventory均记录旧backend。

## Public contract

### SceneGISPlanarGroundPrimitive

保留以下public面：

- constructor与`geometry`、`appearance`、`show`、`id`、`allowPicking`；
- `ready`、`getGeometryInstanceAttributes`、`getBoundingSphere`、`isDestroyed`、`destroy`；
- same-kind geometry replacement、compatible Color appearance、representable attributes、original id、single Context；
- required live caller-owned `SceneGISPlanarWorld`，wrapper不拥有World/provider/Geometry/Appearance/collection。

变更：

- 删除constructor/property中的`heightReference`、`extrudedHeightReference`；Ground Primitive本身即表示surface clamp；
- Polygon只接受non-extruded public Polygon Geometry；Polyline继续接受public Polyline Geometry；source Z不构成离地偏移；
- `geometry` kind在construction固定，cross-kind replacement继续fail-fast；
- 新增/对齐static `isSupported(scene)`，stencil不可用时constructor可保持CPU snapshot，但首次update必须在任何GPU/current
  mutation前抛`DeveloperError`；具体时点以现有Cesium public风格为准并由Spec锁定。

Public declaration/API必须移除旧HeightReference fields并新增准确support/lifecycle JSDoc；public symbol总数不变。

### Automatic Entity contract

- Polyline：仅`clampToGround === true`进入GPU ground-line；false走ordinary Primitive。
- Polygon/Ellipse/Rectangle/Corridor：仅non-extruded且effective top reference为`CLAMP_TO_GROUND`进入area
  classification；ordinary `NONE`保持source geometry。
- 面状`RELATIVE_TO_GROUND`、任何ground-relative extrusion、mixed top/bottom references在child低层mutation前
  fail-fast；不得退回vertex sampling、resident query或ordinary floating geometry。
- Ground outline使用同一个GPU ground-line backend；vertical extrusion outline不再存在于ground profile。
- Point/Billboard/Label/Model与Solid anchor-level resolver的NONE/CLAMP/RELATIVE语义不变。

## Private rendering design

### Planar surface pass

- `_SceneGISPlanarSurface`创建的surface DrawCommand改为`Pass.GLOBE`，其selection/SSE/terrain/imagery/lighting、
  command refs、single Context与resource ownership保持。
- 审计P3/P4 normal/pick/depth replay：每个pass只能提交预期数量且exact command refs一致；不得因Scene自动处理GLOBE
  slot而重复提交。
- Default Globe路径完全不变；PlanarWorld fixture中`scene.globe`必须undefined，避免真实GLOBE与planar GLOBE slot并存。

### Shared ground runtime

可新增必要的private SceneGIS modules，建议按真实职责拆分而非预设固定文件数：

- planar shadow/segment volume builder；
- ground command/resource owner；
- area stencil Shader/render-state factory；
- ground-polyline Shader/render-state factory。

允许参考当前baseline以下upstream源码的算法结构，但不得大段复制：

- `packages/engine/Source/Scene/GroundPrimitive.js`
- `packages/engine/Source/Scene/ClassificationPrimitive.js`
- `packages/engine/Source/Scene/GroundPolylinePrimitive.js`
- `packages/engine/Source/Shaders/ShadowVolume*`
- `packages/engine/Source/Shaders/PolylineShadowVolume*`

任何实质性参考需在private源码模块注释和UpgradeChecklist记录source path、upstream baseline
`6d5d8b1f0725b6f831b336463f4b11c98023427b`与同步条件。新GLSL优先包装为SceneGIS-owned JS shader module，先验证
现有build/root/package链路；不修改generated files。

### Area classification

- 从immutable Polygon XY rings构造closed、nondegenerate local-DOUBLE shadow volume；outer/hole winding、top/bottom cap
  与side必须一致，source Z不进入clamp结果。
- Z extrusion通过provider envelope uniform或stable transform完成，tile LOD/revision/camera变化不能改VA/index/command。
- Stencil-depth/color/pick state遵循ADR-0023；每个logical instance的paired commands必须保持顺序并清零mask。
- Hole、shared boundary、多个相交Ground objects、alpha Color与普通opaque content不得发生stencil泄漏或错误覆盖。
- Footprint越出World extent的部分不得给无surface background着色；优先由surface depth自然限制，必要时使用
  coordinate-neutral extent attributes，不做CPU terrain clipping。

### Ground polyline

- 从immutable route生成stable segment/end-plane volume attributes；只做route topology处理，不与terrain/tile求交。
- Dedicated vertex/fragment shader实现pixel width、segment/end clipping与surface-depth visibility；width=0隐藏。
- Join/loop规则沿用public `SceneGISPlanarPolylineGeometry`已有planar straight语义，不引入geodesic/rhumb。
- Above/below-surface camera均需正反方向可见；不得依赖`scene._cameraUnderground`或Globe normal。

### Height envelope与bounds

- 有provider：读取同步finite ordered global min/max；无provider：surface Z=0。建立至少1 meter且finite的确定性padding，
  正常provider replacement只更新uniform/transform与bounds。
- Ground Primitive不订阅tile、revision或LOD；不读取Surface private mesh/snapshot。
- Shadow-volume command bounds覆盖XY footprint和padded Z envelope。Public/Entity presentation bounds使用
  last-successful footprint XY中心与resident-only terrain height（未命中回退Z=0），radius仍保守覆盖provider
  envelope；provider或resident revision变化只在bounds查询时更新presentation center/radius，不重建current或GPU
  resources。hidden/destroyed为FAILED，首次resource readiness前PENDING，ready后DONE。
- World hidden时ground commands不得提交；world/provider仍由caller拥有。

## 删除与迁移

### Product删除

- 删除`packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundDraper.js`。
- 删除Surface `_groundRenderSnapshot`、count/signature/generation及其populate/invalidate/destroy逻辑。
- 删除World ground registration collection、`_registerGroundPrimitive`与late `_updateGround`调用。
- 删除或重写`_SceneGISPlanarGroundBounds.js`，不得继续依赖actual-current snapshot。
- 删除Ground Primitive的draper import、coverage signature、actual mesh candidate与旧HeightReference fields。

### Specs迁移

- 删除旧Draper Spec，不保留已删除runtime的历史测试；C9 AgentDocs/review保留历史。
- Ground Primitive Spec重写为新public contract、capability、stable source replacement、attributes、Context与lifecycle。
- Surface/World Specs删除snapshot/registration assertions，改为pass ordering、zero-ground allocation、show/destroy与
  no-duplicate replay。
- Polyline/Polygon/Area/Route Specs更新supported mapping与relative/extrusion fail-fast。

### 文档与交付

- ADR-0021标记`superseded`并链接ADR-0023；ADR-0022注明ground rows由C11重写。
- 更新Architecture、DevelopmentGuide、PlanarContentGuide、PlanarContentCompatibility、UpgradeChecklist、package
  private inventory、qualification、E2E与唯一`scenegis-planar-content` Sandcastle。
- Sandcastle移除旧relative/extruded continuous-ground宣称，展示area stencil、ground polyline、hole、direct public
  Ground Primitive以及可切换的above/below/side camera。

## 影响路径

### 默认允许修改

- `packages/engine/Source/SceneGIS/Scene/**`
- `packages/engine/Source/SceneGIS/DataSources/_private/**`
- 对应`packages/engine/Specs/SceneGIS/**`
- 现有C10 qualification、content E2E与`scenegis-planar-content` Sandcastle
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/**`
- `AgentDocs/planar-content/**`

### 条件允许

- 仅为新SceneGIS GLSL build/package可发现性修改SceneGIS-owned脚本或路径；必须先证明现有JS shader module方案不足。
- 预期不修改upstream-owned file。如果`Pass.GLOBE -> TERRAIN_CLASSIFICATION`复用在真实WebGL中失败，停止并回报
  Architecture；不得自行修改`Pass.js`、`Scene.js`、View/Frustum、Renderer或创建SGP。

### 禁止范围

- 不修改`.github/workflows/**`，不创建第二个示例/E2E/qualification。
- 不修改terrain selection/SSE/request/cache/mesh/provider协议。
- 不修改默认Cesium `GroundPrimitive`、`GroundPolylinePrimitive`、`ClassificationPrimitive`或upstream Shaders。
- 不引入C9 draper fallback、height texture/displacement、3D Tiles classification、arbitrary Material或extrusion。
- 不手工编辑或提交generated `index.js`、`.d.ts`、Build、SpecList或API HTML。

## 验收条件

### CPU/contract Specs

1. Shadow volume：outer/hole winding、caps/sides、large EPSG:3857 offset、provider envelope与nondegenerate flat range。
2. Ground-line volume：straight/turn/loop、width 0与normal width、finite attributes/bounds。
3. Public wrapper：implicit clamp、old HeightReference options不再出现在API、extruded Polygon拒绝、same-kind replacement、
   attributes、show、Context、support与exact destroy。
4. Entity adapters：批准CLAMP映射正确；surface RELATIVE、mixed/extruded在child mutation前fail-fast；anchor RELATIVE回归
   保持。

### 真实WebGL hard gates

1. Varying local terrain上area fill跟随surface像素，hole保持未着色；`scene.pick`返回original Entity/direct id，
   `scene.pickPosition`与同像素terrain surface一致。
2. Ground polyline在terrain peak、tile/LOD变化下保持pixel width与pick，不创建terrain-derived CPU Geometry。
3. Perspective与orthographic各一个代表fixture；camera above、below和接近side各验证finite visible pixel/pick。代表性
   linear/log depth均通过。
4. 两个相交Ground objects、随后普通opaque object与多frustum不会stencil泄漏；每个frustum/pass结束mask清理。
5. 20个warm frames保持VA/index/DrawCommand/Shader/pick id identity；camera、terrain LOD/revision变化的ground geometry/
   GPU allocation delta为0。
6. Provider attach/replace/detach只更新height envelope/bounds，不替换footprint resources；World hidden/destroy和second
   Context在mutation前正确处理。
7. Surface迁移到`Pass.GLOBE`后，terrain imagery/lighting、P3/P4 depth replay、P5 imagery、T2-T6 terrain、navigation与
   Viewer representative regressions通过；默认Globe focused case保持。

### Build与交付

- 运行受影响focused suites及一个real Context aggregate，不扩大为无关全库测试。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`。
- content dev/release E2E各一个；installed-package smoke；no-embedding Sandcastle/gallery。
- changed-scope ESLint、Prettier、Markdownlint、`git diff --check`与official upstream audit。
- public root/types/API保持Ground Primitive符号但反映新contract；全部private shader/runtime declarations/API hits=`0`；
  generated status=`0`。
- 项目负责人在更新后的唯一Sandcastle完成真实浏览器/GPU人工验收，Architecture review不能代替。

## AgentDocs与review回写

- 实施完成后创建pending review：
  `AgentDocs/planar-content/reviews/2026-08-10-c11-planar-depth-stencil-ground-rendering.md`。
- Phase results记录area/polyline command结构、pass ordering、height envelope、public breaking change、C9删除清单、
  source-to-Spec mapping、资源计数、upstream/SGP/generated状态与人工验收状态。
- 任何参考upstream实现的private文件都记录source path、baseline与同步条件。
- 实现偏差不得删除本plan中的旧语义冲突；如果existing pass reuse失败，状态保持`active`并回报blocking evidence。

## 完成门槛

- C9 actual-mesh runtime与所有运行时引用为0；不存在silent fallback。
- area/polyline都通过单一GPU ground backend工作，terrain LOD/revision/camera不重建ground Geometry/GPU resources。
- Public/Entity/compatibility/types/docs一致收窄为surface clamp，旧relative/extrusion组合确定性fail-fast。
- Existing pass reuse、above/below camera、pick/depth、stencil cleanup、provider lifecycle与warm identity通过真实WebGL。
- Architecture/code review通过，项目负责人完成新Sandcastle人工验收。
- Architecture Agent形成C11独立中文本地提交，并把`planar-content` extension标记`completed`。

## 当前交接

- C10已以`c376e82c7e`形成独立自动化交付baseline；旧C9页面未被宣称最终人工验收通过。
- 项目负责人人工验收在唯一Sandcastle复现直线ground polyline随heading/pitch出现楔形端部和宽度变化，登记
  C11-R006。Execution已用RTE + eye-space plane/meter-per-pixel expansion替换独立NDC top/bottom deformation；
  Architecture focused re-review独立复跑Surface/Shader `33/33`并完成更新后Sandcastle诊断，R006关闭、review恢复
  `approved`。
- 项目负责人已完成更新后唯一Sandcastle的真实浏览器/GPU人工验收并明确确认通过。
- 不push、不进入C12；由Architecture形成C11独立中文本地提交检查点后关闭本extension。

## 偏差与结果

### 实际实现

- Planar Surface normal commands由`Pass.OPAQUE`迁移到`Pass.GLOBE`。normal render仍负责selection和command缓存，
  generic pick及pick+depth只重提最近normal render的相同Surface command references，不重新selection或分配。
- `_SceneGISPlanarGroundVolume.js`创建稳定planar polygon shadow volume和polyline segment volume；provider的同步
  `minimumHeight`/`maximumHeight`只更新model matrix与conservative bounds，footprint VA/index/DrawCommand/Shader identity
  不变。无provider时使用包含Z=0的至少一米非退化envelope。
- `_SceneGISPlanarGroundCommands.js`只在normal render与generic pick的既有`Pass.TERRAIN_CLASSIFICATION`中提交
  z-fail stencil/color commands；pick+depth不提交ground volume，避免derived depth command覆盖Surface depth。area/line
  shader使用depth clamp与premultiplied output；line以RTE position、eye-space meter-per-pixel miter plane和closed segment
  winding保持跨视角的width/join/end连续。area和
  line均为唯一GPU backend，不读取terrain tile/mesh/revision，也没有C9 fallback。
- Public `SceneGISPlanarGroundPrimitive`只接受Polyline或non-extruded Polygon footprint、compatible Color appearance、
  required id和CPU-preflighted attributes；surface clamp为implicit。旧`heightReference`/
  `extrudedHeightReference` options已从JSDoc/types删除并在runtime fail-fast；`isSupported(scene)`在任何Context/current
  mutation前检查stencil能力。
- Automatic Entity只把Polyline `clampToGround=true`及Polygon/Ellipse/Rectangle/Corridor non-extruded CLAMP组合送入
  GPU backend；surface RELATIVE、mixed top/bottom及ground-relative extrusion在child低层mutation前fail-fast。
- C9 `_SceneGISPlanarGroundDraper`源码/Spec、Surface ground snapshot/signature和World late registration/update queue全部
  删除。Qualification、E2E、Sandcastle、package inventory和durable docs均迁移到C11 contract。

### 实际路径与source-to-Spec mapping

- Public/runtime：`SceneGISPlanarGroundPrimitive.js` -> `SceneGISPlanarGroundPrimitiveSpec.js`；
  `_SceneGISPlanarGroundVolume.js` -> `SceneGISPlanarGroundVolumeSpec.js`；
  `_SceneGISPlanarGroundCommands.js`和`_SceneGISPlanarGroundLineShader.js`由GroundPrimitive、Surface及real Context
  fixtures共同覆盖。
- Pass/lifecycle：`_SceneGISPlanarSurface.js`、`SceneGISPlanarWorld.js` -> `SceneGISPlanarSurfaceSpec.js`、
  `SceneGISPlanarWorldSpec.js`及terrain/imagery/navigation Widget regressions。
- Entity adapters：Polyline、Polygon、Area、Route private visualizers -> 各自focused Specs；C11没有改变callback child顺序。
- Delivery：现有`SceneGISPlanarContentQualificationSpec.js`、唯一content E2E、唯一content Sandcastle和
  `verify-planar-packages.mjs`被原位更新，没有创建第二套delivery入口。

### 验证结果

- GroundVolume `3/3`、GroundPrimitive `6/6`、Polyline `7/7`、Polygon `7/7`、Area `6/6`、Route `6/6`、
  Surface/Shader aggregate `33/33`、World `20/20`、Qualification `4/4`、C4 content Widget `4/4`，均Exit `0`。
  这些是focused aggregate counts，包含既有回归，不作为C11 direct unique total重复相加。
- P1 custom world `16/16`、terrain Widget `1/1`、imagery Widget `9/9`、navigation Widget `4/4`均Exit `0`。
  Imagery的既有单命令Spec由旧`Pass.OPAQUE`断言同步为`Pass.GLOBE`，像素与提交数断言未弱化。
- Upstream `Widget/CesiumWidget` focused regression `75/75`、Exit `0`，覆盖default Globe创建/销毁、
  `globe:false`及既有Widget lifecycle。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`均Exit `0`；docs/types仅产生仓库既有
  TSD-JSDoc warnings。
- 标准content E2E因用户进程占用`8081`在webServer启动前以`EADDRINUSE`退出；保留该进程并使用C10已验证的
  `127.0.0.1:18092`等价local config后，dev/release各`1/1`、Exit `0`。
- Installed-package smoke Exit `0`；no-embedding Sandcastle Exit `0`；gallery处理`307`个案例并Exit `0`，仅有既有
  Vite plugin timing/chunk size warnings。
- Generated declarations/API存在收窄后的public Ground Primitive和`isSupported(scene)`，不含旧ground HeightReference
  fields；三个新private roles及已删除Draper在`.d.ts`/API HTML命中`0`。Generated files未进入status。

### Ownership与剩余风险

- 相对`c376e82c7e`，upstream-owned files=`0`、C11 SGP=`0`；manifest、SGP-0001/0002 hunks和所有upstream product
  files未改，新增`SCENEGIS_PATCH` marker=`0`。
- Private实现参考Cesium `ClassificationPrimitive.js`、`GroundPolylinePrimitive.js`、`ShadowVolumeAppearance.js`及
  `PolylineShadowVolumeVS.js`的算法结构；基线`6d5d8b1f0725b6f831b336463f4b11c98023427b`和升级同步条件已写入源码注释与
  UpgradeChecklist，未大段复制上游实现。
- C11-R001～C11-R005保持关闭。项目负责人人工验收发现C11-R006直线ground polyline视角相关楔形/宽度缺陷；
  Execution的eye-space修复新增普通坐标六视角与EPSG:3857四视角的端部/中心宽度、pixel、original id和warm identity
  证据。Architecture focused re-review确认实现路径并独立复跑Surface/Shader `33/33`；更新后Sandcastle的基准、斜视
  与反向视角诊断未再复现楔形，C11-R006关闭、review=`approved`。
- R006限定复核：GroundVolume `3/3`、GroundPrimitive `5/5`、Polyline `7/7`、Polygon `7/7`、Area `6/6`、Route
  `6/6`均Exit `0`；`npm run build`、changed-scope ESLint/Prettier、affected Markdown Prettier/Markdownlint、
  `git diff --check`与official upstream audit均Exit `0`。Audit确认current-delivery upstream-owned files=`0`、
  C11 SGP=`0`、generated status=`0`。
- R006确认后仍需项目负责人恢复更新后Sandcastle的真实浏览器/GPU人工验收；ordered ground layers、arbitrary
  Material、extrusion和classification仍不在本阶段范围。
- 项目负责人人工复测发现C11-R007：ground Corridor selection正确命中original Entity，但public bounds沿用了
  `[-450,8700]` shadow envelope midpoint，导致斜视SelectionIndicator远离实际surface。Execution已拆分private
  command bounds与public presentation bounds：direct GroundPrimitive使用resident Z=`37 -> 64`、undefined/provider
  detach Z=0验证center自然更新，同时current/VA/Shader/DrawCommand identity不变且radius保持finite/conservative；
  oblique Planar Viewer ground Corridor fixture验证original Entity、SelectionIndicator world anchor与window projection
  闭环。Focused GroundPrimitive `6/6`、Polyline `7/7`、Viewer `3/3`通过。
- Architecture focused re-review确认C11-R007关闭，并独立复跑GroundPrimitive `6/6`与Widgets Viewer `3/3`通过；
  review恢复`approved`。C11仍为`active`，只等待项目负责人在更新后的Sandcastle中复测SelectionIndicator及继续
  人工验收；未授权提交、push或下一阶段。
- 项目负责人人工复测发现C11-R008 delivery blocker：两个direct Primitive继续使用string id，GPU pick虽成功但
  Viewer不会把任意string包装成Entity，因此InfoBox/SelectionIndicator不出现。产品runtime delta保持`0`；唯一
  Sandcastle为ordinary/ground direct对象各创建一个无Graphics的caller-owned metadata Entity并作为Primitive id，
  ordinary position固定为polygon center/Z=130，ground position通过resident-only
  `world.getTerrainHeight(center) ?? 0`动态取得。唯一content E2E真实GPU pick并点击两者，验证对应Entity、InfoBox title
  和finite selection anchor；dev/release各`1/1`、Exit `0`，既有automatic八role选择保持。
- Architecture focused re-review在更新后的真实Sandcastle中分别点击蓝色direct Polygon与紫色direct Ground Polyline，
  两者均显示精确InfoBox title及落在对象上的finite SelectionIndicator；确认product runtime delta=`0`并关闭C11-R008，
  review恢复`approved`。
- 项目负责人随后完成其余页面人工验收并明确确认通过。远距离Label的固定像素文字与background被确认是Cesium
  既有屏幕空间语义，不登记新finding、不改变代码。C11与`planar-content` extension均标记`completed`，由
  Architecture形成独立中文本地提交检查点；upstream-owned files=`0`、C11 SGP=`0`。
