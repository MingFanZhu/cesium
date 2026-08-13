# Phase Plan: V1 Declarative Planar World Bootstrap

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-viewer-bootstrap extension](2026-08-14-planar-viewer-bootstrap-extension.md)
- Phase: `V1`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Base commit: `685a3bb06e54243706e1b73caef5833d48bdf197`
- Related discussions: None
- Related reviews:
  `../reviews/2026-08-14-v1-declarative-planar-world-bootstrap.md`
- ADR: amend `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
- SGP: reuse active `SGP-0002`

## Objective

增加一个明确、同步、声明式的planar Viewer入口：调用方通过`options.planarWorld`提供raw square extent、opaque CRS、
maximumLevel和现有World constructor参数，Viewer在任何child DOM/WebGL mutation前完成option/config验证与三级对象组装，然后
沿用既有planar Viewer controller、Home、DataSource和Scene ownership路径。成功后通过只读`viewer.planarWorld`取得resolved
World并显式安装provider。把`Test/平面环境.html`迁移到该入口，证明常用初始化不再手工创建Extent/CoordinateSystem/World/
CameraController。

## Non-goals

- 不新增provider URL/factory、async setup callback、default basemap/terrain、CRS inference或network request。
- 不自动创建Environment/SkyBox/Material，不修改它们的caller ownership。
- 不修改`CesiumWidget.js`、`Scene.js`、engine SceneGIS product、Home widget、controller实现或generic Viewer widget行为。
- 不支持non-square extent、missing maximumLevel、runtime World replacement、generic custom World descriptor或CesiumWidget bootstrap。
- 不实现V2 E2E/release closure，不修改项目负责人自有`Test/地形.html`。

## Entry conditions

- Branch=`feature/planar-viewer-bootstrap`，base/HEAD=`685a3bb06e54243706e1b73caef5833d48bdf197`。
- `planar-environment` E1-E5 completed；working tree仅有本phase Architecture plan和owner untracked `Test/地形.html`。
- ADR-0001 primary-world ownership、ADR-0006 planar Viewer、active SGP-0002均已复核。
- 当前graph未暴露最新SceneGIS类，已按仓库规则回退到精确`rg`/文件读取并确认实际constructor/API事实。

## Current source facts

- `Viewer.js`在container解析后、child DOM创建前以`defined(options.world)`进入`validatePlanarViewerOptions`；它目前强制live
  `SceneGISPlanarWorld`并拒绝Globe-only/Earth widget options。
- 之后同一World被转发给`CesiumWidget`、camera controller和planar Home；`this._planarCameraController`在Viewer destroy前
  remove，CesiumWidget/Scene再销毁World。
- `SceneGISPlanarExtent`验证finite boundaries与positive width/height；CoordinateSystem clone extent并验证strict square/opaque
  CRS；World创建canonical tiling scheme并验证maximumLevel、Float32 scale和现有render参数。
- Direct environment example当前手工创建三级对象、两个provider、CesiumWidget和camera controller。Environment仍应由caller
  注册；Viewer只替代三级对象与camera/controller/Home组装。
- `SGP-0002` manifest已登记`Viewer.js`和`SceneGISPlanarViewerSpec.js`，reason覆盖planar-world construction/controller/Home/
  capability guards；V1复用该ID。

## Detailed design

### Public contract

- 在`Viewer.js` JSDoc增加`Viewer.PlanarExtentOptions`：required finite `minimumX/minimumY/maximumX/maximumY` meters。
- 增加`Viewer.PlanarWorldOptions`：required `extent`、`maximumLevel`；optional `crs`、`maximumScreenSpaceError`、
  `tileCacheSize`、`baseColor`、`enableLighting`、`lambertDiffuseMultiplier`，语义与现有三个public constructors一致。
- `Viewer.ConstructorOptions`增加`planarWorld`，与`world`/defined `globe`互斥。`world`类型和strict live instance语义不变。
- `Viewer.prototype.planarWorld`为readonly `SceneGISPlanarWorld|undefined`；两种planar入口返回resolved identity，Globe/
  `globe:false`返回undefined。

### SceneGIS-owned factory

- 新增`packages/widgets/Source/SceneGIS/_SceneGISPlanarViewerBootstrap.js`，模块级`@private`、唯一basename/default export。
- Helper只同步创建`SceneGISPlanarExtent`→`SceneGISPlanarCoordinateSystem`→`SceneGISPlanarWorld`；不访问DOM、Scene、Context、
  clock、network或provider，不保留config引用。
- 不复制底层validation。Helper只验证config是non-null non-array object并把字段转发给public constructors；错误保持英文
  `DeveloperError`及精确property attribution。

### Viewer routing and failure boundary

- 在任何DOM mutation前识别`world`与`planarWorld`两条互斥入口，先验证完整planar Viewer option matrix，再调用helper。
- 建立单一local `planarWorld` resolved reference；后续CesiumWidget forwarding、controller construction与instance publication不得再
  读取`options.world`作为运行时source。
- Config/option failure不得创建World/DOM/Context/controller或请求帧。成功构造World后沿用现有CesiumWidget/Scene ownership；
  controller registration failure继续通过既有cleanup销毁Widget/World并移除container。
- 不承诺修复上游Viewer/CesiumWidget对任意非planar外部构造错误的全局transaction；Specs只锁定本phase确定性preflight和既有
  controller rollback。

### Direct example

- `Test/平面环境.html`改为`new Cesium.Viewer(...,{planarWorld:{...}})`并从`viewer.planarWorld`取得World、从
  `viewer.planarCameraController`取得唯一controller。
- 在Viewer返回后使用`world.tilingScheme`创建既有OSM imagery和Esri LERC terrain并安装；不得增加默认网络资源或token。
- 显式关闭示例不需要的Viewer UI；保留中文lil-gui、native Clock、Environment、SkyBox、public providers、fallback、compact/
  credit-safe与BFCache cleanup。Destroy时只remove caller-owned Environment；planar camera由Viewer自行remove。

### Durable documentation

- Amend ADR-0006：记录声明式入口是strict live `world`高级路径的增量，不接受arbitrary structural World；说明resolved getter、
  Scene ownership、provider-after-construction和failure boundary。
- Architecture/DevelopmentGuide/PlanarWorldGuide/UpgradeChecklist更新最小使用示例、SGP-0002升级复核与两条入口兼容矩阵。

## Affected paths

Allowed product/test/example:

- `packages/widgets/Source/Viewer/Viewer.js`（upstream-owned；只允许paired `SGP-0002` hunks）
- `packages/widgets/Source/SceneGIS/_SceneGISPlanarViewerBootstrap.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js`
- 如helper独立failure matrix确有必要：
  `packages/widgets/Specs/SceneGIS/_SceneGISPlanarViewerBootstrapSpec.js`
- `Test/平面环境.html`

Allowed formal delivery/docs:

- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
- `scripts/scenegis/verify-planar-packages.mjs`，仅当现有verifier不能证明installed widgets declaration/API时允许窄扩展
- `AgentDocs/planar-viewer-bootstrap/**`

Read-only/audit:

- `.scenegis/upstream-base.json`
- `.scenegis/upstream-patches.json`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarExtent.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/Widget/CesiumWidget.js`
- `packages/engine/Source/Scene/Scene.js`

Forbidden:

- `Test/地形.html`
- 任何`packages/engine/Source/**`产品修改、`CesiumWidget.js`、`Scene.js`、controller/Home实现、provider/Environment/SkyBox产品。
- 其他upstream-owned文件、`.scenegis/**`修改、新SGP、package manifests、build/gulp/Vite/server/workflow。
- 生成`index.js/index.d.ts/Source/Cesium*.js/SpecList/API HTML/Build/**`、tarball、node_modules。
- Legacy Sandcastle；V1只使用direct Test。

## Steps

1. 在V1 review request创建前记录exact pre-implementation status/base/allowlist；确认owner file仍未触碰。
2. 先补helper与focused Specs，再以最小SGP-0002 hunks接入Viewer JSDoc/preflight/routing/getter。
3. 证明existing live-world path、Globe、`globe:false`与所有planar capability guards无变化。
4. 迁移direct Test并使用root development server人工/短浏览器验证；用户可见tool panel全部中文。
5. 更新ADR-0006与四份正式文档；必要时窄扩installed verifier。
6. 完成focused/build/types/docs/package/static/SGP/generated审计，创建V1 review与handoff；不commit、不push、不进入V2。

## Validation

Focused required:

- `npm run test -- --includeName "SceneGIS/SceneGISPlanarViewer"`，覆盖：
  - raw config创建正确Extent/CRS/World参数与getter identity；
  - config mutation不改变已构造World；
  - `world`/`planarWorld`/`globe`互斥和invalid raw boundaries/maximumLevel/world options；
  - 全部确定性错误发生在container child/Context/controller/request mutation前；
  - live-world路径仍工作；Globe/`globe:false` getter undefined；
  - 唯一camera controller/Home、destroy顺序与forced registration rollback。
- 如新增helper Spec，运行对应basename focused suite。
- Direct Chromium/root server：声明式EPSG:3857、公开OSM/Esri best-effort、planar wheel/drag/Home、Environment、中文panel、
  compact/credit、persisted/non-persisted pagehide；公网可拦截验证fallback，不要求自动化公网成功。

Public/delivery required because Viewer API changes:

- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run build-docs`
- `npm run tsc`
- `node scripts/scenegis/verify-planar-packages.mjs`或等价installed widgets evidence，必须确认`planarWorld` option/typedef/getter在
  ESM/CJS、declarations与API HTML中存在且生成物不进status。
- Changed-scope ESLint/Prettier/Markdownlint，AgentDocs scoped checks，`git diff --check`。
- `node scripts/scenegis/audit-upstream-patches.mjs`与exact status；expected upstream-owned=`1` only `Viewer.js`，SGP=`SGP-0002`，
  generated=`0`。

Not required:

- Full suite、unrelated engine terrain/content/environment suites、E2E dev/release、Sandcastle gallery、performance timing或V2矩阵。
- Architecture重复执行Execution已通过的长build/browser矩阵；Architecture review代码、证据和manual gate。

## Risks and dependencies

- `Viewer.js` JSDoc typedef和constructor flow对上游升级敏感；所有修改必须成对标记，不能顺手格式化邻近上游代码。
- 使用private helper不得依赖import side effect或修改widgets barrel生成器；构建必须证明它在dev/release/npm中可解析。
- Viewer返回前不能配置依赖tilingScheme的provider；示例必须先create Viewer再配置World，接受首次空surface frame而不引入异步factory。
- Direct example中的Environment/SkyBox仍caller-owned；迁移到Viewer不能重复remove planar controller或在Context销毁后destroy SkyBox。

## Completion criteria

- 常见应用不再直接实例化Extent、CoordinateSystem、World或CameraController；声明式Viewer创建正确且可立即取得World。
- Existing live-world、Globe、globe:false、capability guards、controller/Home/DataSource/destroy回归通过。
- Deterministic invalid config/option全部在DOM/WebGL前失败，resolved World与config clone/ownership明确。
- Direct Test由项目负责人验收；build/release/types/docs/installed/static/audit通过。
- V1 review approved、manual gate通过、upstream-owned=`Viewer.js` only、SGP-0002、generated=0，然后Architecture创建独立中文checkpoint。

## Deviations and results

- Implementation deviations: None。未修改`CesiumWidget.js`、engine Source、manifest或构造transaction边界；未新增helper
  独立Spec，public Viewer aggregate直接覆盖helper与routing。
- 实际新增private helper；Viewer所有新增/修改hunk均在paired SGP-0002内，runtime在preflight后只使用resolved local World。
- Focused Viewer aggregate=`20/20 SUCCESS`；build、build-release、build-ts、build-docs、tsc、installed verifier通过。
- Direct root browser证明EPSG:3857 identity、公开provider best-effort、wheel/left-drag/Home、Environment、中文panel、compact/
  credit与BFCache/non-persisted cleanup；console error/warning=0。
- Official audit通过：current delivery upstream-owned=1，仅`Viewer.js`；SGP-0002；generated=0。
- Architecture/code review无finding，项目负责人于`2026-08-14`完成人工验收并通过；V1所有exit gate关闭，等待Architecture独立
  checkpoint。未push、未进入V2。
