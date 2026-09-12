# Phase Plan: S4 Unified Qualification and Delivery

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-surface-styling extension](2026-08-12-planar-surface-styling-extension.md)
- Phase: `S4`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-12`
- Updated: `2026-08-13`
- Related discussions: 项目负责人要求最终统一交付，并要求后续SceneGIS示例tool/control panel使用中文说明
- Related reviews: [S4 review request](../reviews/2026-08-12-s4-unified-qualification-delivery.md)
- ADR: None expected；不新增产品或长期架构契约
- SGP: None expected；upstream-owned diff出现前必须停止并升级计划

## Objective

S4不再扩展产品能力，而是把S1 Shader source/delivery、S2 planar imagery filters与S3 planar terrain Material
styling作为一个可交付整体收口。阶段只补当前证据中真正缺失的filter + Material + lighting联合资格，固化installed
package中的shader source/generated module、公共类型和运行时属性检查，统一两个现有Sandcastle示例的中文工具面板，并完成
dev/release/npm、文档、升级清单、ownership和人工验收闭环。

## Non-goals

- 不新增或修改public API、imagery filter数学、terrain Material输入、shader合成顺序、Surface cache/replay、terrain/
  imagery request、Worker、mesh、quadtree或资源所有权。
- 不重复S2/S3已经通过的四类terrain builtin、方向、LOD、sampler极限、错误原子性、hidden layer和大规模warm/churn
  矩阵；S4只增加一个跨能力代表场景。
- 不新增第二套大型qualification、第二个Sandcastle目录、CI workflow、性能门槛、网络fixture、离线瓦片或发布动作。
- 不翻译Sandcastle gallery metadata、源码标识符、HTML `id`、option `value`、API名称、Credit文本或必须与Cesium
  对齐的技术术语；不为翻译上游Sandcastle通用界面修改upstream-owned文件。
- 不实现太阳、月亮、大气、SkyBox、day/night alpha或其他`planar-environment`范围。
- 不commit、push、tag或publish；最终checkpoint仍由Architecture Agent在review与人工gate通过后创建。

## Entry conditions

- Branch=`feature/planar-surface-styling`，implementation base/checkpoint=
  `201fb98213a15a160fbc4340c63918180734f6a7`，该提交是已批准S3产品、development tooling与项目负责人
  Sandcastle visual gate的独立本地checkpoint。
- S1 checkpoint=`04ac138b37295f328f3542f143b2f6b738a7e021`；S2 checkpoint=
  `9d1cb4de44af3c2b21ad75bfc8b07c8dfd34ff8c`；S1-S3 review均为`approved`且无unresolved finding。
- Architecture已检查现有Widget Specs、release qualification、local E2E、package verifier、两个Sandcastle案例、
  Guide/UpgradeChecklist和generated declarations；工作树在S4规划写入前为clean。
- `Documentation/SceneGIS/DevelopmentGuide.md`已把SceneGIS Sandcastle tool/control panel中文说明提升为S4起的通用
  规则；S4必须在本扩展两个示例中落实。

## Current source facts

- `SceneGISPlanarImageryCesiumWidgetSpec`已经分别证明五个scalar filters、color-to-alpha、bottom-to-top composition、
  warm identity、hidden replay、texture-unit limit和资源释放；S4无需重复这些case。
- `SceneGISPlanarTerrainStylingCesiumWidgetSpec`已经证明四个稳定Material builtin、absolute height、slope/aspect、
  imagery → Material alpha → lighting、sampler共享预算、LOD/release、compile failure atomicity和warm identity；但组合像素
  case中的imagery仍为identity filters，因此缺少“非默认filter → Material → lighting”完整链的单点证明。
- `SceneGISPlanarTerrainAdvancedQualificationSpec`已用local terrain串联Worker、provider replacement、navigation、lighting、
  imagery、depth和lifecycle。现有`SceneGISPlanarReleaseQualificationSpec`及
  `Specs/e2e/scenegis-planar-release.spec.js`覆盖普通imagery的dev/release local browser链，但尚未消费S2 filter与S3
  Material公共入口。
- `scripts/scenegis/verify-planar-packages.mjs`已在repo外临时目录验证engine/widgets/root tarball、bare ESM/CJS、
  public/private exports、declarations、API HTML和broken entry；它尚未明确要求8个SceneGIS GLSL source与8个generated
  shader modules，也未从installed ESM consumer实例化layer/world验证S2/S3公共属性。
- `Source/Shaders/SceneGIS/**`现有8个全局唯一`.glsl` basename；generated相邻`.js`属于build artifact，必须进入engine
  tarball但不得进入git status。S1已单次dry-run验证，S4应把该断言持久化到现有package verifier。
- `scenegis-planar-imagery`与`scenegis-planar-terrain`工具面板、帮助文字和运行时status当前仍为英文；gallery title、
  description与labels为英文且不在本次中文化边界。
- 现有local E2E harness通过同一`Specs/e2e/cesium.html`在dev使用`Build/CesiumUnminified/Cesium.js`、release使用
  `Build/Cesium/Cesium.js`，并可完全阻断公网；不需要为S4新建浏览器入口。

## Detailed design

### Unified real-Context qualification

- 扩展现有`SceneGISPlanarTerrainStylingCesiumWidgetSpec.js`中的composition case，或在同一suite增加一个最小case；
  不新建第二个terrain styling suite。
- 使用local deterministic imagery和现有flat/local terrain路径，至少给一个shown layer配置非默认filter；优先选择能用
  单像素明确区分顺序的brightness或color-to-alpha，不要求再次覆盖全部七个属性。
- 同一帧必须实际compile/link/draw，并以像素证明base → filtered imagery → Material diffuse/alpha → lighting只执行一次。
  同一layer filter uniform和Material numeric/Color uniform分别变化时，证明DrawCommand、ShaderProgram、VA、imagery texture
  与terrain mesh保持identity；只允许对应uniform/pixel变化。
- 保持`scene.rethrowRenderErrors = true`。不要把raw shader source字符串断言当作GPU证据，也不要复制S2/S3的sampler
  upper-bound、四builtin方向、LOD或destroy矩阵。

### Local dev/release browser qualification

- 扩展唯一`Specs/e2e/scenegis-planar-release.spec.js`，不新增第二个E2E文件。
- 现有local、blocked-network场景中为至少一个`SceneGISPlanarImageryLayer`设置非默认filter，为world设置caller-owned
  `Material`，真实render后证明像素改变、world/layer公共属性可读写、single-command/tiles-loaded/pick/depth/navigation与destroy
  仍闭环。
- dev与release执行同一focused E2E。Material由test caller显式destroy；`viewer.destroy()`/world不得销毁caller Material。
  不增加脆弱截图或公网Sandcastle自动化，不重复完整四类builtin像素。

### Installed-package delivery

- 扩展现有`scripts/scenegis/verify-planar-packages.mjs`，把8个固定GLSL source及其8个generated `.js`模块加入engine
  tarball required entries；basename清单必须显式、可审计，不用宽泛目录存在替代逐项断言。
- installed bare ESM consumer继续验证现有public exports，并以最小local structural provider实例化
  `SceneGISPlanarImageryLayer`，断言S2默认值、一个scalar mutation、color-to-alpha defensive behavior与destroy；实例化
  `SceneGISPlanarWorld`并赋caller-owned`Material`，断言reference identity、clear和caller ownership。不要在Node consumer创建
  WebGL Context或依赖DOM/network。
- generated declarations精确验证`SceneGISPlanarImageryLayer`七个filter属性及`SceneGISPlanarWorld.material:
Material | undefined`；对应API HTML只验证稳定member anchor存在。保留private absence、broken-entry和temporary cleanup。
- verifier运行前仍由build/types/docs生成产物；生成shader `.js`、`.d.ts`、API HTML、Build与tarball不得进入提交。

### Sandcastle Chinese tool panels

- 修改现有`scenegis-planar-imagery`和`scenegis-planar-terrain`，把tool/control panel中的标题、label、button、select
  可见option、帮助文字、初始status和运行时错误/status统一为清晰中文。
- HTML `id`、JavaScript变量/函数、option `value`、Material/filter/API名称、Credit及gallery YAML metadata保持当前英文契约。
  首次出现且用户理解需要的API术语可使用“中文（English API）”，避免全部音译或隐藏技术边界。
- 保持S2/S3已经批准的overlay position、z-index、compact scroll、credit-safe布局与所有交互行为；中文文本变长时只做
  必要的SceneGIS-owned CSS适配，不借机重构demo。
- 公网OSM/LERC仍为best-effort人工展示；错误中文status必须如实说明fallback，不声称服务成功。

### Documentation and extension closure

- 更新`PlanarWorldGuide.md`/`PlanarWorldUpgradeChecklist.md`的最终统一资格映射，仅补S4联合资格、installed shader
  delivery和中文面板升级检查；不重写ADR-0030/0031/0032或历史事实。
- 若实现未改变Architecture、API或长期契约，不新增ADR，也不为了“完成阶段”制造ADR。任何runtime缺陷或新架构需求先
  停止并交Architecture重新确认。
- 实施完成后创建S4 review request并更新extension/phase/reviews索引。Architecture review与项目负责人最终中文面板
  manual gate通过前，phase与extension保持`active`。

## Affected paths

### Allowed

- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainStylingCesiumWidgetSpec.js`
- `Specs/e2e/scenegis-planar-release.spec.js`
- `scripts/scenegis/verify-planar-packages.mjs`
- `packages/sandcastle/gallery/scenegis-planar-imagery/index.html`
- `packages/sandcastle/gallery/scenegis-planar-imagery/main.js`
- `packages/sandcastle/gallery/scenegis-planar-terrain/index.html`
- `packages/sandcastle/gallery/scenegis-planar-terrain/main.js`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `AgentDocs/planar-surface-styling/**`

### Conditional only after Architecture approval

- 若联合资格发现确定性产品缺陷，可提出修改最小的
  `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface*.js`或
  `packages/engine/Source/Shaders/SceneGIS/PlanarSurface/*.glsl`及同层focused Specs；在Architecture书面批准、phase plan和
  allowlist更新前不得实施。
- 若中文文本必须调整现有SceneGIS-owned Sandcastle CSS，可只在上述两个`index.html`内做必要布局修正。

### Forbidden without a new assignment

- `packages/engine/Source/**`、`packages/widgets/Source/**`、public API、Material/filter contract与renderer runtime。
- 任何upstream-owned file、`.scenegis/**`、package manifests、build/gulp/Vite core、`.github/workflows/**`。
- 新Sandcastle目录、新E2E文件、新qualification suite、网络asset/fixture、截图baseline或性能threshold。
- generated Shader `.js`、index/declaration/SpecList/API HTML、`Build/**`、tarball、`node_modules`。
- 修改`sandcastle.yaml` gallery metadata；本phase的中文化只针对示例内部tool/control panel。

## Steps

1. Execution确认branch、base、clean/只含Architecture S4 planning docs的工作树，完整读取本plan、extension index、
   DevelopmentGuide相关章节、Architecture、ADR-0030/0031/0032与作用域`AGENTS.md`；源码事实偏差先回报。
2. 在现有terrain styling Widget suite补一个filter + Material + lighting代表case，冻结像素顺序和双uniform mutation的warm
   identity，不重复既有大矩阵。
3. 扩展现有release E2E，以local、无网络场景消费公开filter与Material入口；dev/release同一case验证pixel、pick/depth、
   navigation、ownership与destroy。
4. 扩展package verifier，逐项验证8个GLSL/8个generated modules、installed runtime属性、declarations/API anchors与caller
   ownership；保持repo外临时consumer和clean generated status。
5. 中文化两个现有示例的tool/control panel可见文字和runtime status，保留英文源码/API值与已批准布局/交互。
6. 更新Guide/UpgradeChecklist和AgentDocs，创建S4 review request；记录复用证据、新增case、dev/release/npm结果、偏差、
   ownership、generated status与manual gate状态。
7. 运行最小充分验证并通知Architecture ready-for-review。Architecture approval前不请求manual gate；manual gate通过前不
   标记phase/extension completed，不commit、不push。

## Validation

最小充分自动化矩阵：

1. `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainStylingCesiumWidget"`；只新增或修改的联合case
   必须真实Context compile/link/draw并暴露render errors。
2. `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`。
3. `npm run test-e2e -- Specs/e2e/scenegis-planar-release.spec.js`与
   `npm run test-e2e-release -- Specs/e2e/scenegis-planar-release.spec.js`；自动化必须断言public network attempts=`0`。
4. `node scripts/scenegis/verify-planar-packages.mjs`；记录8/8 GLSL、8/8 generated modules、installed ESM/CJS、runtime
   property、declaration/API和temporary cleanup结果。
5. 在`packages/sandcastle`运行`npm run build-gallery-no-embedding`；不运行embedding，不把公网服务作为自动化gate。
6. changed-scope ESLint、Prettier、Markdownlint；AgentDocs执行scoped Prettier/Markdownlint；`git diff --check`。
7. `node scripts/scenegis/audit-upstream-patches.mjs`、exact `git status --short`与generated-file audit；预期
   upstream-owned=`0`、SGP=None、generated status=`0`。

不重复World/Surface/S2 filter/A7/ReleaseQualification完整Jasmine suite、full test suite、四类terrain像素或sampler limit，
除非新增case暴露直接相关回归并在review中说明理由。命令退出码与suite的SUCCESS/FAILED输出都必须检查。

Architecture/code review批准后，由项目负责人在最新`start-sandcastle-dev.mjs`入口打开两个现有案例完成最终manual gate：

- imagery与terrain工具面板的用户可见标题、label、button、option、帮助和status均为清晰中文，API/技术词没有误译；
- filter和terrain style控件仍可操作，reset、lighting、navigation、mountain/underground与fallback行为未回退；
- overlay在正常/紧凑视口位于canvas上方、可滚动且不遮挡credit；console无unexpected error；
- 公网不可用时中文status准确说明ready ancestor/base color/flat fallback，Credit仍可见。

项目负责人负责视觉与中文可理解性结论；Architecture只复核代码、契约和交付证据，不重复视觉判断。

## Risks and dependencies

- 扩展旧release E2E若直接依赖Material纹理会增加异步/DOM噪声；代表case优先使用无sampler Color Material，把Ramp
  delivery留给S3 real-Context和package文件断言。
- installed Node consumer没有WebGL/DOM，必须只验证公共对象契约和ownership；shader compile由real-Context与dev/release
  browser证明，不能在consumer中伪造Context。
- JSDoc HTML结构可能随上游生成器改变；只匹配稳定member `id`，升级检查记录该seam，不复制整页文本。
- 中文文本比英文更长，可能影响compact overlay；只允许必要CSS调整，并由项目负责人manual gate确认，不新增截图baseline。
- E2E webServer固定8080可能与本地开发冲突；运行前关闭占用服务或如实报告环境阻断，不修改upstream Playwright config来
  绕过本phase。

## Completion criteria

- 一个最小real-Context case与同一local dev/release E2E证明non-default imagery filter、terrain Material与lighting在完整公开
  路径中共同工作，且uniform mutation不破坏warm identities、pick/depth、navigation、ownership或destroy。
- package verifier持久化8个GLSL source、8个generated modules、S2/S3 installed runtime properties、declarations/API与
  ESM/CJS交付断言，generated artifacts不进入git。
- 两个既有Sandcastle tool/control panel用户可见说明按DevelopmentGuide统一为中文，并通过项目负责人manual gate。
- Guide、UpgradeChecklist、extension/phase/review交接与实际证据一致；S1-S4没有未解决finding。
- upstream-owned files=`0`、SGP=None、generated status=`0`；若出现偏差已停止并获Architecture重新批准。
- Architecture/code/release-evidence review与项目负责人manual gate通过后，由Architecture创建独立中文S4 checkpoint，并把
  extension标记`completed`；未push、未publish。

## Deviations and results

- Implementation status：Architecture code/release-evidence与launcher follow-up review均为`approved`，headed dev/release
  E2E通过；项目负责人已使用修复后的launcher完成中文panel与Cesium画面的final manual gate，phase为`completed`。
- Unified Widget：在既有composition case加入flat local Heightmap、brightness=`0.5`、caller-owned Color Material与lighting，
  真实Context像素证明filter → Material diffuse/alpha → single lighting。随后分别mutation layer brightness与Material Color，
  DrawCommand、ShaderProgram、VA、imagery binding/texture及terrain mesh identity保持。Focused suite输出
  `TOTAL: 7 SUCCESS`，没有新增suite或产品路径。
- Release E2E：既有local blocked-network case使用public brightness、world.material与caller destroy，继续断言single
  command/readiness、pick/depth、wheel/Home与World/Controller lifecycle。项目负责人授权释放端口后，Architecture临时停止
  并最终恢复GeoServer服务；同一Playwright config/project/spec追加`--headed`后，dev主联合资格`1 passed`，release联合资格与
  fixed timing protocol `2 passed`。Release仍使用Windows process-local `release=true`等价命令，因为literal npm script的
  POSIX赋值语法在Windows不可执行。默认headless `--use-angle=gl`会在当前Chromium 151/NVIDIA RTX 3060 Ti环境初始化
  Viewer Context失败；D3D11、SwiftShader与headed OpenGL ANGLE诊断均可构造，故记录为工具链/driver风险而非产品finding。
- Installed delivery：verifier逐项要求8/8 GLSL与8/8 generated shader JS。Bare installed ESM consumer验证七个filter
  defaults、brightness mutation、color-to-alpha getter/setter defensive clone、layer destroy，以及World Material reference/clear/
  caller ownership；CJS public smoke保持。Node consumer使用无uniform/sampler custom Fabric，避免Cesium Color Material在Node
  触碰`HTMLCanvasElement`，没有伪造DOM/WebGL。Declarations与API HTML精确验证七个filter members及
  `Material | undefined`/`material` anchor。最终verifier通过并清理repo外temporary consumer。
- Sandcastle：两个既有example的用户可见标题、labels、options、buttons、help、initial/runtime status与fallback error已
  中文化；ids、JS symbols、option values、API/Material/filter names、Credits与YAML metadata保持。既有absolute/z-index/
  compact-scroll/credit-safe布局未改变。Gallery no-embedding处理307 examples。
- Delivery commands：`build`、`build-release`、`build-ts`、`build-docs`、`tsc`均exit 0；`build-ts`只有既有TSD-JSDoc
  warnings。Package verifier与gallery build通过。Changed-scope static、ownership/generated audit结果见S4 review。
- Sandcastle dev launcher live follow-up：upstream incremental context初始化删除root bundle且不执行首轮build，child在watchers
  注册后复用现有`buildCesium`只物化root output，再发marker；父进程随后有界轮询required outputs。Vite wrapper按明确plugin name替换
  upstream static-copy dev delivery，以SceneGIS-owned只读allowlist middleware交付external Cesium routes，并在打印URL前
  验证实际runtime root module。S4-T007进一步以具名replacement把三个Cesium runtime specifiers统一映射到该watched root
  module，避免refresh读取startup后不更新的package bundles。Focused unit与6124短生命周期live HTTP/Chromium evidence见S4
  review；
  不改变产品或gallery示例。
- Docs：Guide增加统一资格/installed delivery映射；UpgradeChecklist增加联合顺序、8+8 shader、public properties/API anchors与
  中文tool panel升级检查。无新ADR、无产品contract deviation。
- Remaining gate：None。launcher窄工具follow-up及S4-T007已通过Architecture focused re-review；项目负责人final
  visual/manual gate已通过。由Architecture创建独立本地S4 checkpoint；未push、未publish。
