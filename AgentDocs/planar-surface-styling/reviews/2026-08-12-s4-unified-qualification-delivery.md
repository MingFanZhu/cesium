# Review: S4 Unified Qualification and Delivery

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-12`
- Updated: `2026-08-13`
- Review target: uncommitted S4 working tree on `feature/planar-surface-styling` at implementation base
  `201fb98213a15a160fbc4340c63918180734f6a7`
- Related plan: [S4 phase plan](../plans/2026-08-12-phase-s4-unified-qualification-delivery.md)
- ADR: None；复用ADR-0030、ADR-0031与ADR-0032既有contract
- SGP: None expected

## Scope and implementation

- 既有TerrainStyling Widget composition case现在以local Heightmap证明non-default brightness → Color Material
  diffuse/alpha → lighting的真实compile/link/draw/pixel链；filter和Material Color mutation均保持command/shader/VA/
  imagery texture/terrain mesh identities。
- 既有release E2E使用公开S2/S3属性和caller-owned no-sampler Color Material，保留blocked-network、single command、
  readiness、pick/depth、wheel/Home与destroy断言；没有新增E2E file或browser entry。
- Package verifier逐项检查8个GLSL source及8个generated JS，installed ESM runtime properties/caller ownership、CJS
  public smoke、七个filter declarations、World Material declaration与稳定API member anchors。
- 两个既有Sandcastle example仅中文化用户可见tool/control panel与runtime/fallback status；技术identifiers、values、
  Credits、YAML metadata、layout和行为保持。
- Guide/UpgradeChecklist只增加S4联合资格、installed delivery与中文panel升级映射；无public/runtime Source变化、无新ADR。

## Findings

| ID      | Severity | Status | Owner role | Location                                                              | Finding                                                                                                                                                                                                                                                                                                                                                                                     | Required disposition / evidence                                                                                                                                                                                                   |
| ------- | -------- | ------ | ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4-R001 | medium   | fixed  | execution  | `Specs/e2e/scenegis-planar-release.spec.js:103-113,173-178`           | 新E2E像素期望与其自身确定性合成输入不一致。红色底层经`alpha=0.5`、`brightness=0.5`蓝色顶层合成后为约`(0.5,0,0.25)`；再经alpha约0.5的绿色Material为约`(0.25,0.5,0.125)`，`lambertDiffuseMultiplier=0`固定乘`0.3`，最终8-bit约为`(19,38,10)`。当前却要求R/G都在`34..42`，端口释放后test body会确定失败，因而尚不能作为dev/release gate。                                                      | 红通道已改为`15..23`，围绕推导值19保留有界容差；绿、蓝及全部API/lifecycle断言不变。该修正仅来自固定shader顺序推导，dev/release E2E仍为`not run`，未宣称browser pass。                                                             |
| S4-R002 | medium   | fixed  | execution  | `SceneGISPlanarTerrainStylingCesiumWidgetSpec.js:641-669`             | Warm identity断言在mutation前保存`tile`，之后只读取该旧对象的`tile.command`、binding与terrain mesh。若错误实现替换了当前render tile/command，旧对象上的引用仍可保持不变并使测试误通过；当前断言没有证明`surface._quadtree._renderTiles[0]`与`surface._renderCommands[0]`仍是所保存的对象。                                                                                                  | 新增共享identity断言，并在filter与Material mutation各自成功normal render后验证当前renderTiles仍只有原tile、当前renderCommands仍只有原command，再验证shader/VA/binding/texture/mesh identity。                                     |
| S4-R003 | medium   | fixed  | execution  | `scripts/scenegis/verify-planar-packages.mjs:364-376,441-455,496-515` | Installed consumer先把`world.material`清为`undefined`再destroy world，因此只证明clear不销毁Material，没有独立证明“Material仍挂在world上时world destroy不销毁caller object”。此外七个filter和`material`字段级声明只检查engine tarball的`index.d.ts`，root installed `Source/Cesium.d.ts`虽读取却未调用`verifyStylingDeclarations`，不能支撑review中installed root declarations已闭环的结论。 | clear及live断言后已把同一Material重新挂回World；World destroy后Material仍live，最后由caller destroy。字段级styling declaration verifier现在同时覆盖engine `index.d.ts`与root `Source/Cesium.d.ts`，不应用于widgets declarations。 |

Architecture未发现产品Source、中文面板或文档边界finding。S4-R001至S4-R003只允许修改上述三个既有验证文件及
`AgentDocs/planar-surface-styling/**`处置记录；不得借此修改renderer、public API、package manifest、Playwright配置或扩大测试
矩阵。

## Execution response

- S4-R001：E2E红通道容差已按`(19,38,10)`推导修正；由于已确认的8080/8081环境占用，dev/release test body仍未运行，
  本轮不报告E2E通过。
- S4-R002：两次mutation后的当前selection与publication identity均已闭环，focused Widget复跑仍为
  `TOTAL: 7 SUCCESS`。
- S4-R003：installed consumer同时覆盖clear与destroy-while-attached caller ownership；engine与root declarations均执行
  styling字段验证。现有package verifier复跑通过。
- 本轮只修改三个既有validation files与本review；没有产品Source、manifest/config或新测试入口变化。Scoped static与
  ownership/generated audit复跑结果见下文；Execution请求Architecture focused re-review，phase仍为`active`。

## Changed paths

Architecture assignment baseline（5个AgentDocs paths）已保留并继续回写；launcher follow-up加入3个既有SceneGIS scripts与
`DevelopmentGuide.md`，当前review target为20 paths：

- Specs/E2E：
  `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainStylingCesiumWidgetSpec.js`、
  `Specs/e2e/scenegis-planar-release.spec.js`。
- Delivery：`scripts/scenegis/verify-planar-packages.mjs`。
- Development tooling：`scripts/scenegis/start-sandcastle-dev.mjs`、
  `scripts/scenegis/sandcastle-vite.config.mjs`、`scripts/scenegis/start-sandcastle-dev.spec.mjs`与
  `Documentation/SceneGIS/DevelopmentGuide.md`。
- Sandcastle：两个既有`scenegis-planar-imagery`/`scenegis-planar-terrain`目录的`index.html`与`main.js`；
  `sandcastle.yaml`未修改。
- Durable docs：`Documentation/SceneGIS/PlanarWorldGuide.md`、
  `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`。
- AgentDocs：extension `README.md`、extension plan、S3/S4 phase plans、plans/reviews indexes及本review。

## Validation evidence

- Focused Widget：`TOTAL: 7 SUCCESS`；新增证据复用既有7-case suite中的composition case，没有重复S2/S3矩阵。
- `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`：exit 0。
  `build-ts`只有既有TSD-JSDoc warnings。
- Package verifier：通过，输出明确为8/8 GLSL、8/8 generated modules、bare ESM/CJS、S2/S3 runtime properties、
  declarations/API、soft-private与broken-entry fixtures。
- Sandcastle no-embedding：通过，processed 307 examples。
- Dev headed E2E：
  `npm run test-e2e -- Specs/e2e/scenegis-planar-release.spec.js --headed`通过，主联合资格`1 passed`，
  release-only timing case按设计`1 skipped`。
- Release headed E2E：使用Windows process-local `release=true`调用同一Playwright config/project/spec并追加
  `--headed`，结果`2 passed`；联合资格与fixed timing protocol均通过。Timing环境为Chromium 151、RTX 3060 Ti
  OpenGL ANGLE、drawing buffer `960×540`，selected/submitted均为16。
- Changed-scope ESLint、Prettier、Markdownlint与`git diff --check`通过（仅Windows LF→CRLF notices）。Official
  upstream audit通过：current delivery upstream-owned=`0`、generated status=`0`、SGP=None。Exact status为20 paths，
  均在S4 allowlist或Architecture assignment baseline；没有generated Shader JS、index、declaration、API HTML、Build、
  tarball或node_modules进入status。

## E2E execution and environment note

- 项目负责人授权释放端口复测后，Architecture确认8080由Windows服务`GeoServer 2.24.0`占用，8081/8092已空闲；通过UAC
  临时停止该服务完成测试，之后恢复原`Automatic`启动类型与`Running`状态，并确认其重新监听8080。没有修改GeoServer配置。
- 端口释放后的默认headless dev命令与Windows process-local release等价命令都进入test body，但完整planar Viewer在当前
  Chromium 151 + NVIDIA RTX 3060 Ti + `--use-angle=gl` headless组合中无法初始化WebGL Context。Dev报告
  `RuntimeError: The browser supports WebGL, but initialization failed.`；release压缩bundle报告同源`oL`错误。
- 短生命周期诊断证明同一bundle和planar Viewer在Chromium默认D3D11、SwiftShader以及headed
  `--use-angle=gl`中均可构造；失败被收敛为当前headless OpenGL ANGLE/driver组合，而非S4 shader、API或断言失败。
- 不修改Playwright config、package manifest、server或产品代码，改用同一config、同一`chromium` project、同一spec并追加
  `--headed`完成门禁。Dev主联合资格通过；release联合资格与fixed timing protocol均通过。现有literal
  `npm run test-e2e-release`的POSIX `release=true`在Windows仍不可直接执行，故release继续使用process-local PowerShell等价
  环境变量；该工具链差异不影响已执行的browser test body。

## Deviations and risks

- Installed Node consumer最初使用Color Material时触发Cesium `Material`内部`HTMLCanvasElement`引用。为保持明确的
  no-DOM/no-WebGL边界，最终改用无uniform/sampler custom Fabric，仅验证World public reference/clear/caller ownership；
  Color Material实际render继续由Widget与E2E源码覆盖。该调整不改变产品或phase scope。
- 中文文本变长的compact overlay、credit safety和实际可理解性仍须项目负责人manual gate。
- 当前Windows/NVIDIA环境中Playwright固定`--use-angle=gl`的headless模式不能初始化完整Viewer；headed dev/release已通过，
  但后续升级或CI仍应区分browser product regression与ANGLE/driver启动后端问题。

## Architecture conclusion

Architecture已完成focused re-review，确认S4-R001至S4-R003全部fixed，未发现新的产品Source、validation、delivery、
中文panel或文档边界finding。S4代码与release evidence review结论为`approved`。

端口释放后的headed dev/release E2E现已通过，S4 browser product gate关闭；默认headless OpenGL ANGLE失败保留为环境/
工具链风险，不覆盖通过结论。该批准仍不代表phase或extension完成：项目负责人下一步完成两个中文panel的visual/manual
gate。在owner manual gate完成前，phase/extension保持`active`，不commit、不push、不publish。

## Sandcastle dev launcher live-failure follow-up

项目负责人使用正式launcher进行final manual gate时发现两项SceneGIS-owned tooling defect：build-watch ready marker可能先于
四个required outputs对父进程可见，旧逻辑会瞬时失败；upstream static-copy dev delivery在当前Windows路径下把external
Cesium请求落入SPA HTML fallback，使terrain bucket停在“正在加载”。本轮不重开产品/release findings，只请求窄工具复核：

- Source/live evidence进一步确认upstream incremental `buildCesium`会删除root output，而esbuild context初始化不执行build；
  SceneGIS child因此在watchers注册后复用现有`buildCesium`只物化root tree，再发marker。父进程在marker后仍有界轮询outputs，
  并分别保留child exit与actionable timeout。
- Vite wrapper按明确的`vite-plugin-static-copy:serve/build`名称移除对应plugins，保留其余upstream root/plugins/define；新增
  SceneGIS-owned GET/HEAD middleware，只读交付明确的Source、engine/widgets、CesiumUnminified和SampleData routes，拒绝
  traversal/其他repo文件并返回明确MIME/404/405；同时保留`/Apps/SampleData/**`与strip-base后的`/SampleData/**`。
- launcher在打印URL前以HEAD检查实际runtime root `/Build/CesiumUnminified/index.js`返回JavaScript而非HTML，避免轮询时
  下载multi-megabyte bundle；raw/package routes只保留为type/source兼容入口。
- Focused test覆盖marker先到/稍后ready、永不ready timeout、plugin name replacement与临时HTTP server上的
  allowlist/traversal/method/MIME/404、HTTP HTML→JavaScript readiness与child early exit；保留T001至T006既有cases。
  加入S4-T007 transform case后，`node --test scripts/scenegis/start-sandcastle-dev.spec.mjs`最终为15/15 passed。
- 短生命周期live run使用read-only确认空闲的6124端口。正式launcher完成gallery/type、build-watch、必要root
  materialization与Vite自身HTTP gate后打印terrain URL。实际HTTP逐项确认`Source/Cesium.js`、engine/widgets Unminified入口、
  正常Vite root交付的`templates/Sandcastle.js`、一个`Build/CesiumUnminified/Assets`资源，以及
  `/Apps/SampleData/cesium_stripes.png`与`/SampleData/cesium_stripes.png`均为200、正确Content-Type且非HTML。
- Chromium打开打印的canonical localhost URL后，terrain bucket iframe创建`#toolbar`，`#loadingOverlay`为
  `display:none`，page/console startup errors为0。验证后只用`taskkill /t`终止本轮launcher PID及其子树，6124恢复空闲；
  未终止或修改其他用户/外部服务。

当前允许路径之外无新增diff；无upstream-owned修改，SGP=None，无新ADR。该follow-up经Architecture批准前，final Chinese
panel manual gate继续等待，phase保持`active`。

### S4-T007 response

Architecture live-development review确认首次修复只解决startup：upstream import map仍把`cesium`指向raw `Source/Cesium.js`，
后者继续引用startup后不会由root-only watcher更新的engine/widgets package bundles。Execution已按具名plugin边界补齐：

- 移除且fail-fast验证upstream `custom-import-map`，以窄SceneGIS plugin为`bucket.html`/`standalone.html`注入import map；
  `cesium`、`@cesium/engine`、`@cesium/widgets`全部解析到`/Build/CesiumUnminified/index.js`，形成单一module identity，
  `Sandcastle`保持`../templates/Sandcastle.js`，`__VITE_TYPE_IMPORT_PATHS__`等upstream defines不变。
- launcher HTTP readiness改为实际runtime root URL，不再以raw/package兼容routes代表runtime readiness。
- Focused transform test直接解析plugin对`bucket.html`的tag结果并锁定四个mapping；live evidence将读取实际bucket HTML import map，
  无需重跑产品render/E2E。
- 第二次6124短live run中，正式launcher通过root runtime HEAD gate并打印URL；GET `/templates/bucket.html`为200，实际注入
  import map严格为`Sandcastle -> ../templates/Sandcastle.js`且三个Cesium specifiers全部指向
  `/Build/CesiumUnminified/index.js`；该root URL的HEAD为200 `text/javascript`。验证后仅终止本轮launcher进程树，端口恢复空闲。

### Launcher follow-up Architecture conclusion

Architecture focused re-review确认S4-T007 fixed，launcher follow-up为`approved`。独立复跑focused tests为15/15 passed；scoped
ESLint、Prettier、Markdownlint、`git diff --check`与official upstream audit均通过，current delivery upstream-owned=`0`、
generated status=`0`、SGP=None。静态route allowlist、root-only materialization、marker/output barrier、runtime HEAD readiness与
single watched-root module identity闭环，没有产品、upstream、manifest、gallery或E2E路径变化。

该结论关闭SceneGIS-owned launcher窄工具gate。项目负责人随后使用修复后的launcher完成中文panel与Cesium画面的final
visual/manual gate，并于`2026-08-13`授权进入后继扩展。S4 review与全部人工门禁均已关闭，无unresolved finding。
