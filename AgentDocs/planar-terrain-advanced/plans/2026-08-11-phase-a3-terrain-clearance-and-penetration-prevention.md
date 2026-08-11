# 阶段计划：A3 平面地形净空与防穿透

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`A3-terrain-clearance-and-penetration-prevention`
- 状态（Status）：`completed`
- 负责人角色（Owner role）：`architecture`
- 执行角色（Execution role）：Execution Agent
- 架构评审（Architecture review）：`approved`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- 创建日期（Created）：`2026-08-11`
- 更新日期（Updated）：`2026-08-11`
- Extension plan：
  [SceneGIS 平面高级地形总体计划](2026-08-10-planar-terrain-advanced-extension.md)
- Architecture decision：
  [ADR-0026：平面地形净空与防穿透](../../../Documentation/SceneGIS/Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)
- Related review：实现 ready 后创建
  `../reviews/2026-08-11-a3-terrain-clearance-and-penetration-prevention.md`
- Implementation base：`5ff4753579be5cf063d9efd84aa138ba4093d5c9`（A2 completed checkpoint）
- Branch：`feature/planar-terrain-advanced`
- SGP：预计 `0`

## 阶段目标

A3 在 A2 的显式 `surface`/`underground` policy 上增加真正的 Camera-local clearance：

- surface mode 的 Camera 在 input、programmatic placement、mode切换或resident terrain升高后，不再留在
  terrain/Z=0 fallback下方，也不再因正常碰撞跳回Home；
- underground mode继续允许Camera位于terrain上下两侧，collision不得把它推回surface；
- underground mode允许通过既有中键orbit在terrain上下两侧双向穿越，换侧后pan/wheel继续工作；
- PC input与programmatic Camera在同一个controller update边界采用一致规则；
- correction只做最小Z-up push-out，保持相机姿态、frustum、A1锚点、公有Z=0 pick和terrain runtime ownership；
- 本阶段不把未经profiling的triangle sweep、free-look或物理角色控制器塞入navigation热路径。

## 进入条件

- A2 implementation、Architecture review、项目负责人人工验收和中文checkpoint
  `5ff4753579be5cf063d9efd84aa138ba4093d5c9` 已完成。
- Planning开始时branch为`feature/planar-terrain-advanced`且worktree clean。
- 已重新审计 `SceneGISPlanarCameraController` 的 `firstUpdate`、`update`、`_syncRig`、pan/rotate/wheel时序，
  `ControllerHost` 更新顺序，`world.getTerrainHeight`/`pickTerrain`实现及Cesium globe
  `adjustHeightForTerrain`思想。
- ADR-0026 已批准；本阶段无需再次等待项目负责人确认即可派工。

## 阶段边界

### In scope

- Public `minimumTerrainClearance` constructor option/mutable property，默认`1.0`米，finite且严格大于0。
- Surface mode的Camera-local resident terrain→Z=0 fallback clearance。
- `firstUpdate`、idle/programmatic update与input后的统一Z-up correction。
- 正/负terrain、provider attach/detach、resident revision升降与mode切换行为。
- Correction保持Camera X/Y、direction/up/right、frustum、mode和现有pointer anchor/public pick契约。
- 一个focused real-Context non-flat terrain closure和既有Sandcastle人工入口的最小更新。
- Public types/API docs、ADR successor、Architecture/DevelopmentGuide/PlanarWorldGuide/UpgradeChecklist和
  AgentDocs回写。

### Out of scope / 禁止范围

- Continuous/swept triangle collision、固定步长terrain采样、速度/惯性、角色半径、坡度、滑移、重力或
  terrain-following。
- 新的event mapping、free-look、wheel signed-dolly crossing、touch/pinch、flight/tracking或自动mode switching；
  本轮只复用既有中键drag完成orbit crossing。
- SceneGISPlanarWorld/Surface/Quadtree/TerrainQuery、terrain request/mesh/cache/resource、Shader、Worker或build
  product修改。
- 修改A1的rendered depth→terrain→Z=0 pointer anchor优先级，或改写public `world.pick`/
  `pickFromWindowPosition`。
- 新增`enableCollisionDetection`、collision Event、World/Scene状态、Viewer constructor option或runtime export。
- 修改upstream-owned file、创建/扩大SGP。若实现证明不可避免，先记录blocker并交回Architecture。

## 已确认的源码事实

1. A2 checkpoint中controller的`navigationMode`由controller拥有；setter切换隔离held input但不移动Camera。
2. `_syncRig(scene, true)`在surface pose低于Camera-local/center surface时仍调用`viewHome`；collision必须在它
   之前纠正有限pose，不能修改Home本身来掩盖问题。
3. `firstUpdate`当前先validate，再调用`_syncRig`；`update`只在drag start/wheel同步rig，idle不查询terrain。
4. Pan/rotate在press保存`_dragTarget.z`/`_dragSurfaceHeight`；held movement不重复terrain query。Wheel逐event
   同步并复用`_zoomAnchor`。A3不得破坏A2稳定snapshot。
5. `world.getTerrainHeight`从maximumLevel向上查找最深resident direct/upsampled mesh；每层只检查目标tile与
   固定3×3 cell邻域，不发请求、不更新LRU，适合Camera-local point clearance。
6. `world.pickTerrain`遍历最近normal-render cover的terrain triangles并排除flat result，适合偶发pivot而非
   每update continuous collision热路径。
7. `ControllerHost.update`发生在current normal render前。A3采用最近已发布resident height；新revision发布后
   在下一controller update生效，不能在不扩大Scene/Surface seam的情况下声称same-frame correction。
8. Existing `translateCamera`与private world/local pose helper能在non-identity transform下保持direction/up并只
   平移world position；A3无需修改Camera helper。
9. Globe `adjustHeightForTerrain`同样只向外推、terrain降低时不吸附，并区分collision policy与underground
   state；平面实现不复用Cartographic/Ellipsoid/Scene globeHeight。
10. 当前public export inventory为engine/widgets/root `24/2/26`。新增既有controller member不增加export。

## 详细设计

### 1. Public clearance contract

- Constructor增加
  `@param {number} [options.minimumTerrainClearance=1.0]`。
- Prototype增加`minimumTerrainClearance` getter/setter；setter只接受finite且`>0.0`。
- Constructor/assignment invalid必须在mode、Camera、frustum、input或terrain query mutation前失败。
- Same-value no-op；different-value只写controller state，不取消gesture、不移动Camera、不查询World。
- 下一次registered/enabled update采用新值。Controller disabled或未注册时不承诺world-level collision。

### 2. Private clearance resolver

在controller file-scope增加无分配helper，输入finite Camera world position：

1. `world.getTerrainHeight(position)`返回finite值时采用；
2. undefined/non-finite采用`0.0`；
3. 预计算`minimumZ = surfaceHeight + clearance`与所需`deltaZ`；
4. overflow/non-finite在调用`setWorldPose`前抛`DeveloperError`；
5. 仅当`position.z < minimumZ`时沿`Cartesian3.UNIT_Z`平移Camera。

Helper返回是否纠正及采用的surface height，供controller同步private state；不得创建public observed-state API。

### 3. Update时序

- `firstUpdate`：validate/建立scene引用后，在非零或零canvas都可执行surface correction；成功后再调用
  `_syncRig(scene, true)`。合法below-surface pose因此只被推高，不Home。
- `update`：在input dispatch前执行一次surface correction，覆盖programmatic Camera与terrain revision；随后按
  A2处理middle→left→wheel；只有本帧真实input可能移动Camera时，在finally reset前对最终pose再纠正一次。
- 若pre-input correction发生，后续rig sync必须读取纠正后的pose。Post-input correction不重采样pointer anchor，
  不改`_dragTarget`/`_rotatePivot`/`_zoomAnchor`；held gesture继续使用press snapshot，release/new press再sync。
- Underground mode两个位置都直接skip World query/correction。
- Mode从underground切到surface：setter仍zero-mutation；下一update推到clearance。Surface切到underground后下一
  update不再push。

Execution可通过一个private“本帧Camera是否可能被input修改”布尔值避免idle重复第二次查询，但不得缓存跨帧
terrain height来绕过revision adoption，也不得引入per-frame对象分配。

### 4. Collision response与稳定性

- Correction只增加world Z；X/Y、direction/up/right、heading/pitch、frustum与mode保持bitwise或现有容差一致。
- Terrain height升高或clearance增大：下一update立即向上推到新minimum。
- Terrain height降低、provider detach或fallback从高处变为Z0：Camera保持当前高度，不向下吸附。
- Positive/negativeterrain与large-offset extent使用同一米制计算。
- Collision不调用Home。若pose的axes/roll/pitch/frustum本身invalid，既有 `_syncRig` recovery/fail-fast继续生效；
  Specs必须区分“below-surface finite pose”与“invalid orientation”。
- 当前phase保证update后的endpoint clearance，不声称连续sweep。大跨度teleport中途跨峰但终点合法是明确接受边界。

### 4a. 项目负责人人工验收后续：Underground orbit crossing

A3首轮code/architecture review通过后，项目负责人人工验收确认既有条件，但发现underground只能通过
programmatic pose或`Underground view`选择所在侧。源码复核确认clearance已正确skip，实际阻断来自中键rotate的
分侧pitch clamp和`remainsOnPivotSide`。A3在checkpoint前重新打开并增加以下完成条件：

- `navigationMode === "underground"`时，中键纵向drag复用press-time完整3D pivot与window anchor，可从
  above/down连续orbit到below/up，也可反向返回；不增加新的输入绑定。
- Crossing期间mode、pivot、target snapshot与Camera axes保持连续，不调用Home、不执行clearance、不重查terrain，
  不把pointer anchor替换为viewport center或Z=0。
- Exact/near-horizontal transition不得令controller卡死。Release后下一次pan、rotate、wheel必须在新侧重新同步并
  正常工作；surface mode相同输入仍受side restriction与endpoint clearance约束。
- 只允许为上述orbit transition增加controller-owned reusable scalar/Cartesian state；不得扩展World/Surface、
  增加public API、引入free-look/first-person flight或把wheel改为穿越手势。
- 若非中心pointer无法在现有four-frustum/window-anchor helper下保持连续，Execution应记录最小可重复fixture并
  停止，由Architecture决定是否另立free-flight phase；不得仅覆盖viewport center。

### 5. Sandcastle与durable docs

- 复用唯一`scenegis-planar-terrain`，不新建页面。保持Surface/Underground selector与Underground view。
- 页面说明：Underground view后切回Surface会在下一frame执行Z-up collision correction且不Home；Home仍是显式
  用户动作。必要时增加一个确定性的“Surface collision”动作，但不增加复杂参数面板。
- ADR-0025增加A3 successor；Architecture/DevelopmentGuide/PlanarWorldGuide把“collision unsupported”更新为
  A3 endpoint clearance，并保留no-sweep/free-look边界。
- UpgradeChecklist增加controller update顺序、resident query、pose preservation与zero-allocation检查。

## 影响路径

以下路径全部为 SceneGIS-owned：

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`：public clearance、surface
  correction、update时序与underground orbit crossing。
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`：public contract与
  programmatic/input/mode/revision deterministic evidence。
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js`：扩展一个
  real Context collision/underground closure。
- `packages/sandcastle/gallery/scenegis-planar-terrain/{index.html,main.js,sandcastle.yaml}`：只做人工验收说明或
  确定性动作所需的最小更新。
- `Documentation/SceneGIS/Decisions/ADR-0025-*.md`、`ADR-0026-*.md`：successor与正式A3决定。
- `Documentation/SceneGIS/Architecture.md`、`DevelopmentGuide.md`、`PlanarWorldGuide.md`、
  `PlanarWorldUpgradeChecklist.md`：durable contract与升级检查。
- `AgentDocs/planar-terrain-advanced/**`：phase结果、review、roadmap与handoff。

不计划修改World/Surface/TerrainQuery、private Camera helper、Widget/Viewer product、E2E、package/build config或
`.scenegis/**`。若实际路径扩大，Execution必须先回写plan中的原因和验证边界。

## Spec与验收设计

### Controller deterministic Specs

新增少量参数化cases：

1. Public contract：默认1.0、constructor/property合法值、0/negative/NaN/Infinity原子拒绝、same-value no-op。
2. Programmatic surface：positive terrain、negative terrain与undefined→Z0各一个代表；下一update只提升Z，
   direction/up/right/frustum/mode不变，`viewHome`为0次。
3. Input：pan、rotate、wheel使用现有真实aggregator pattern产生below-clearance endpoint，frame end恢复minimum；
   anchor/pivot、held snapshot、release/new gesture保持。
4. Mode transition：underground同pose不查询/不纠正；切到surface setter保持Camera，下一update纠正；切回
   underground后允许below-side gesture。
5. Revision：height上升再次推高；height下降/provider detach不拉低；query count有界且无terrain runtime mutation。
6. 一个non-identity Camera transform与large-offset representative证明finite world Z correction。
7. Underground crossing follow-up：真实aggregator中键drag双向换侧、一个非中心pointer、exact/near-tangent、
   release后pan/wheel继续工作；surface相同输入不换侧且不Home。

相近断言合并进现有A2 cases，不扩为四frustum、所有边界或大量height矩阵。Direct unique count按真实新增`it`
记录，不把扩展assertion重复计算。

### Real Context Spec

扩展现有local non-flat Heightmap fixture：

- normal render收敛后，把surface-mode Camera放到mountain resident height以下；controller update后Camera Z等于
  terrain height+clearance（合理浮点容差），没有Home；
- terrain升高或clearance增大产生upward-only correction，command refs与terrain debug counters不变；
- 切到underground后相同below-sidepose和一个middle/pan/wheel representative不被推回；
- 同一non-flat terrain representative中，中键orbit可从above穿到below并反向返回；换侧后下一gesture可用，
  command refs与terrain debug counters保持稳定；
- public window pick仍为Z=0，terrain pick/rendered depth语义不变。

一个perspective real Context场景足够；orthographic/non-identity transform放在deterministic controller Specs。

### 人工验收

项目负责人在既有terrain Sandcastle验证：

- Underground view下三种PC gesture仍可用；
- Underground中键纵向orbit可从地上穿到地下并反向返回；换侧后pan/wheel仍可用；
- 切回Surface后Camera被局部推到terrain上方，不跳Home；
- surface下滚轮/平移接近山体不持续穿入，不出现异常复位；
- mode、Lighting、Mountain/Home与Credits/console无回归。

## 实施顺序

1. 增加public clearance验证/属性和direct contract Specs。
2. 实现无分配Camera-local resolver与Z-up atomic correction。
3. 接入firstUpdate、pre-input和post-input时序，先恢复A2 mode/gesture regressions。
4. 增加revision、mode switch、non-identity transform与real Context evidence。
5. 最小更新terrain Sandcastle及durable docs。
6. 回写本plan实际偏差/计数/验证，创建pending review request并停止；不得进入A4。
7. 人工验收发现A3-R001后，只在既有controller/Specs/Sandcastle/docs范围实现underground中键orbit crossing，
   更新review为ready for focused re-review并再次停止；不得进入A4。

## 最小充分验证

Execution记录实际case count与结果，建议矩阵：

```powershell
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"
npm run build
npm run build-ts
npm run build-docs
npm run tsc
```

若Sandcastle实际修改，再运行其scoped ESLint/Prettier、gallery discovery与
`npm run build-sandcastle -- --no-embeddings`一次。另运行changed-scope ESLint/JS Prettier、affected Markdown
Prettier/Markdownlint、`git diff --check`与`node scripts/scenegis/audit-upstream-patches.mjs`，并断言：

- generated runtime/types/API可见`minimumTerrainClearance` number contract；
- non-underscore SceneGIS export inventory仍为24/2/26；
- upstream-owned files=0、A3 SGP=0、generated status=0。

不默认运行build-release、package smoke、Viewer/Globe/full engine、E2E或terrain全套Specs；没有跨这些边界。

## 偏差与结果

### 实际设计与路径

- Product仅修改`SceneGISPlanarCameraController.js`。file-scope resolver复用既有scratch和world/local pose
  seam；surface update先查询Camera XY的resident height，finite失败回退Z=0，仅在低于
  `height + minimumTerrainClearance`时沿world +Z平移。
- `_syncRig`增加private可选的已解析surface height输入，避免同一pre-input阶段重复查询；pan/rotate/wheel仍保留
  A1/A2 press-time anchor/target snapshot。只有本帧真实input可能移动Camera时执行第二次endpoint correction。
- A3-R001中，underground rotate使用完整`[-PI/2, PI/2]`pitch范围并取消held drag的pivot-side拒绝；同一drag
  不再执行center target clamp，而是冻结press-time 3D pivot、window anchor和target，release/new input再通过
  `_syncRig`采用新侧。Surface继续使用原negative-pitch clamp、side check与target clamp。
- A3-R002中，middle press同时保存finite orbit distance；underground Perspective/Orthographic整个held drag复用该值，
  不再在tangent处由`0/0`重算。exact tangent release围绕原pivot/window anchor/distance执行有符号`EPSILON6`
  pitch归一化，再清除held状态；不Home、不查询terrain、不切换mode，后续pan/wheel/rotate可重新sync。
- Sandcastle实际增加一个`Surface clearance`确定性动作，以低于mountain resident surface的pose演示下一update的
  Z-up correction；A3-R001又补充underground纵向中键orbit双向穿越说明。既有Surface/Underground、Mountain、
  Home和Lighting入口保留。
- Specs实际路径为`SceneGISPlanarCameraControllerSpec.js`与
  `SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js`；existing navigation Widget作为回归，未修改。
- Durable docs实际更新Architecture、DevelopmentGuide、PlanarWorldGuide、UpgradeChecklist与ADR-0025 successor。
  未修改World/Surface/TerrainQuery、private Camera helper、Widget/Viewer product或build seam，无设计偏差。

### Spec结果

- Controller focused：47/47，Exit 0。A3 direct unique `it` cases=7，其中首轮clearance 3个、A3-R001新增
  underground双向非中心/tangent crossing与surface side-lock 2个、A3-R002新增Orthographic held tangent与
  exact-tangent release/new gestures 2个；既有A2 cases扩展断言不重复计数。
- Terrain-navigation real Context：1/1，Exit 0；existing case扩展non-flat resident height、clearance增加、
  underground bypass、双向held crossing/release后新侧input、无Home、terrain debug/command reference identity与
  public Z=0 pick。
- Existing navigation depth Widget：4/4，Exit 0。Focused aggregate为50/50，三个命令之间无case重叠。

### 命令与生成证据

- `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`：均Exit 0；`build-ts`仅有既有
  repository-wide TSD-JSDoc warnings。
- `npm run build-gallery-no-embedding`：Exit 0，processed 307 examples；
  `npm run build-sandcastle -- --no-embeddings`：Exit 0，仅有既有chunk size/plugin timing warnings。
- Changed-scope ESLint/Prettier、affected Markdown Prettier/Markdownlint、`git diff --check`与official upstream
  audit的最终结果记录于review request。
- A3-R002 focused rerun：Controller 47/47与`npm run build`均Exit 0；changed controller/spec ESLint/Prettier、
  affected Markdown Prettier/Markdownlint、`git diff --check`和official upstream audit均Exit 0。R002未修改
  real-Context fixture，沿用本轮已通过的terrain-navigation 1/1与navigation 4/4证据。
- Generated `packages/engine/index.d.ts`与API HTML包含`minimumTerrainClearance: number` constructor/member；
  non-underscore SceneGIS export inventory保持engine/widgets/root `24/2/26`，generated files不进入status。

### Ownership与剩余风险

- Upstream-owned files=`0`；A3 SGP=`0`；manifest、SGP-0001/0002不变；new patch markers=`0`；generated
  status=`0`。
- Endpoint clearance使用最近resident terrain，revision在下一controller update采用；不提供continuous sweep、
  free-look、wheel crossing或terrain following。
- Architecture独立复跑Controller 43/43、terrain-navigation real Context 1/1、official upstream audit与
  `git diff --check`后首轮contract无阻断finding。项目负责人随后确认首轮验收条件通过，但将underground
  gesture crossing提升为A3完成条件；review重新打开为changes-requested。Execution完成A3-R001并将finding标为
  fixed，Controller更新为45/45，real Context与navigation回归分别1/1、4/4。Architecture focused review确认
  ordinary Perspective主路径，但发现exact tangent release后的new gesture无法sync，以及Orthographic held
  continuation的orbit distance为`0/0`，登记A3-R002。Execution已用press-time finite distance snapshot与
  release-time窄角度归一化修复，Controller 47/47。Architecture独立复跑Controller、official audit与
  `git diff --check`后确认A3-R001/R002关闭。项目负责人随后在既有terrain Sandcastle完成最终复测，确认
  underground中键双向穿越、tangent附近release与换侧后pan/rotate/wheel均通过，surface防穿透保持；人工门禁关闭。

## 完成条件

- Public clearance契约与ADR-0026一致，types/API生成正确且export inventory不变。
- Surface mode的finite below-surface Camera经input/programmatic/mode/revision路径只做Z-up correction，不Home。
- Underground mode不执行collision，保持terrain上下两侧PC orbit，并能通过中键orbit双向穿越。
- Terrain降低不吸附；高度升高及时推开；positive/negative/Z0 fallback均有代表证据。
- A1/A2 anchor、snapshot、public Z=0 pick、World/Surface资源和command refs不退化。
- Focused Specs、build/types/docs/static/audit与必要Sandcastle build通过；项目负责人人工验收通过。
- Upstream-owned files=`0`、A3 SGP=`0`、generated status=`0`。
- Architecture review关闭所有finding并形成独立中文checkpoint后才能进入A4。

## 风险与停止条件

- 若point clearance无法重现项目负责人的实际穿透问题，记录精确input/terrain fixture并停止；不得自行引入
  triangle sweep或固定采样伪保证。
- 若post-input correction破坏held anchor/pivot连续性，优先调整controller snapshot同步；不得回退到Home。
- 若resident revision产生可重复不可接受的上跳，记录height/time/input证据供Architecture裁决稳定策略；不得
  自动向下吸附或隐藏collision。
- 若需要World/Surface/TerrainQuery/Scene/Viewer/upstream/build修改，先暂停并回写blocker。
- 若新增property不能正确生成types/API，修正JSDoc/generator入口；不得手工编辑生成文件。

## Execution handoff

- 从clean base `5ff4753579be5cf063d9efd84aa138ba4093d5c9`及本次A3 planning docs开始。
- 实现完整A3；不创建A4 plan、不修改A4-A7状态、不commit、不push。
- 只在上述SceneGIS-owned允许路径工作；不得加入swept collision、World/Surface seam或新的SGP。
- 把实际source/spec mapping、direct unique count、validation、types/API、ownership、偏差和剩余风险回写本plan。
- Ready后创建
  `AgentDocs/planar-terrain-advanced/reviews/2026-08-11-a3-terrain-clearance-and-penetration-prevention.md`
  （`pending`），更新README/plans/reviews/extension handoff并通知Architecture review。
- 若命中停止条件，保留可重复证据并暂停，不要以Home、隐式mode切换或terrain mutation绕过。
