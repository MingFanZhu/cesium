# Review: S3 Planar Terrain Styling

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-12`
- Updated: `2026-08-12`
- Review target: uncommitted working tree on `feature/planar-surface-styling` at base
  `06d31deceb73d8f9e733e3946d9c2fb01ac37eff`
- Related plan: [S3 phase plan](../plans/2026-08-12-phase-s3-planar-terrain-styling.md)
- ADR: `Documentation/SceneGIS/Decisions/ADR-0032-planar-terrain-material-styling.md`
- SGP: None

## Scope

复核`SceneGISPlanarWorld.material` public/caller ownership、normal-render identity publication、Cesium Material assembled
source/`_uniforms`/update reuse、planar inputs、imagery→Material→lighting order、sampler budget、shader lifetime、四个stable
builtins、Sandcastle controls与zero-upstream/generated边界。

## Summary

Architecture已完成focused re-review，`S3-R001`至`S3-R006`均确认fixed，代码评审结论为`approved`。Smooth Material
variant接口、cached command shader重绑、compile-before-publication失败原子性、sampler预算、demo controls与public contract
均已闭环；未发现新的代码级finding。项目负责人明确由manual gate负责视觉表现，不再以补充像素/LOD视觉断言作为代码批准
前置条件。随后项目负责人批准增加SceneGIS-owned Sandcastle开发编排脚本；Architecture最终窄范围复核确认T001至T006
全部fixed，tooling follow-up为`approved`。项目负责人随后通过manual gate并授权进入S4。

## Findings

<!-- markdownlint-disable MD060 -->

| ID      | Severity | Status | Owner role | Location                                                                                            | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Required disposition / evidence                                                                                                                                                                                                                |
| ------- | -------- | ------ | ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-R001 | high     | fixed  | execution  | `SceneGISPlanarSurfaceFS.glsl:4-22,78`；`SceneGISPlanarTerrainAdvancedQualificationSpec.js:241-278` | `SCENEGIS_MATERIAL + SCENEGIS_LIGHTING + SCENEGIS_SMOOTH_NORMALS`下，fragment只声明`v_normalEC`，但`sceneGISPlanarMaterialInput`仍读取`v_positionEC`。Architecture在A7临时开启`scene.rethrowRenderErrors=true`后稳定得到`Fragment shader failed to compile: v_positionEC undeclared`。原A7未开启重抛，Cesium捕获render error后继续执行，因而`1/1 SUCCESS`不是有效的compile/link证据。                                                                                                       | Smooth VS/FS接口已补齐`v_positionEC`，A7永久开启render-error重抛；Architecture focused re-review确认Contour + smooth + lighting代码路径与真实Context `1/1`结果成立。                                                                           |
| S3-R002 | high     | fixed  | execution  | `_SceneGISPlanarSurface.js:319-374,401-413,638-640`                                                 | 旧Material source发布后会release其Surface shader refs，但未选中的cached tile仍保留`tile.command.shaderProgram`与旧`_materialCommand/_materialCommandSource`。Material从A切到B、ShaderCache在frame end真正销毁A、再切回A并重新选中该tile时，`getShaderProgram`可返回新A shader，而更新谓词因material/source元数据仍相等而跳过重绑，提交已销毁的旧program。现有单tile warm test无法覆盖该路径。                                                                                               | Command更新同时比较current shader identity，release使resident cached metadata失效；A→B→A跨ShaderCache release回归证明旧program销毁后command重绑live shader与正确uniform map，Surface refs保持bounded。                                         |
| S3-R003 | high     | fixed  | execution  | `_SceneGISPlanarSurface.js:540-640`；`SceneGISPlanarSurfaceSpec.js:1341-1395`                       | 当前只证明`material.update`同步抛错前的原子性。ShaderProgram实际在command execution时lazy compile；Surface在此之前已经清空旧`_renderCommands`、改写tile command、发布`_publishedMaterial`并release旧source。任一合法`Material`对象所携带的非法/不兼容Fabric source发生compile/link error时，旧normal snapshot与shader map会被半更新，违反phase plan“下一次成功normal render才发布”和invalid Material error不得改变Surface-owned replay/selection/shader state。R001已经实际触发了这一时序。 | Material variants现在于selection/publication前以`ShaderProgram._bind()`完成compile/link，失败销毁candidate且不写Surface maps；invalid Fabric回归证明旧publication、replay、tile command/uniform、selection/request counters与shader refs保持。 |
| S3-R004 | medium   | fixed  | execution  | `SceneGISPlanarTerrainStylingCesiumWidgetSpec.js:57-386`；S3 phase plan lines 230-240               | 现有4-case Widget Spec只让四个builtin在flat fallback上link/render；确定性像素来自custom probe，不是四个稳定builtin。Sampler case是“0 imagery + 16/17 sampler custom Material”，没有证明“1-sampler Ramp + 15/16 shown imagery”的共享预算。也没有Material下的ready ancestor/upsampled child/LOD transition，或确定性imagery→Material alpha→lighting像素。因而review request中“四个builtin pixels、共享预算、LOD/composition闭环”的结论超出现有证据。                                          | Widget矩阵已扩为7 cases，覆盖四builtin、shared imagery/Ramp sampler budget、composition、invalid compile与upsampled LOD shader lifecycle。项目负责人明确额外视觉表现由manual gate把关，不再要求补充Slope/LOD像素断言作为code-review前置条件。  |
| S3-R005 | medium   | fixed  | execution  | `scenegis-planar-terrain/index.html`；`main.js:56-116,204-219`；S3 phase plan lines 244-252         | Demo只提供style下拉与reset；Contour spacing/width和Ramp色带没有任何可操作控件，无法执行已确认manual gate“contour interval/width与Ramp色带可操作”。Reset也仅重置不可编辑的Contour值。                                                                                                                                                                                                                                                                                                        | Demo已增加Contour spacing/width、Ramp low/high color与完整reset，Material仍由demo显式持有/销毁；overlay显式absolute、z-index与overflow。视觉布局与交互观感留给项目负责人manual gate。                                                          |
| S3-R006 | medium   | fixed  | execution  | `SceneGISPlanarWorld.js:250-259`；`PlanarWorldGuide.md:91-95,159-171`                               | Public JSDoc把属性描述为任意Cesium `Material`，Guide只列四个builtin，均未说明planar `czm_materialInput`稳定字段、只消费diffuse/alpha、custom Fabric支持子集与unsupported outputs；同一Guide支持矩阵仍把`material`列在unsupported，形成直接矛盾。ADR/phase plan虽完整，但不是用户API指南。                                                                                                                                                                                                   | Public JSDoc与Guide已明确四个qualified builtins、planar inputs、diffuse/alpha-only、custom Fabric边界、sampler共享预算与unsupported outputs，支持矩阵矛盾已消除。                                                                              |

<!-- markdownlint-enable MD060 -->

## Changed paths

- Product：`SceneGISPlanarWorld.js`、`_SceneGISPlanarSurface.js`、`_SceneGISPlanarSurfaceShader.js`、Planar Surface
  `FS.glsl`、`GeometricLitVS.glsl`、`SmoothLitVS.glsl`。
- Specs：World、SurfaceShader、Surface、A7 advanced qualification；新增Styling Widget Spec。
- Demo：既有`scenegis-planar-terrain`的`index.html`、`main.js`、`sandcastle.yaml`。
- Docs：Architecture、PlanarWorldGuide、PlanarWorldUpgradeChecklist、新ADR-0032及本extension AgentDocs。
- Architecture scope audit在review-ready时实际得到`22`个changed paths，而handoff报告为`21`；全部仍在confirmed allowlist，
  upstream-owned与generated paths均为`0`。Architecture另更新本review及reviews index，不属于产品实现。

## Initial validation evidence

- World `21/21`；Surface aggregate `40/40`；Styling Widget `4/4`；A7 `1/1`。
- Real Context：四个stable builtins实际link/render；custom pixels覆盖non-zero reference absolute height、slope、
  north/east/south/west aspect与flat snap；warm numeric/Color mutation保持command/shader/VA；A7让Contour穿过imagery、
  lighting churn、underground、warm frames、Heightmap→Quantized replacement与destroy。
- GL limits：texture units `16`、fragment uniform vectors `1024`；16 sampler成功，17 sampler在update/selection/request/
  Surface shader/GPU mutation前产品fail-fast。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`均exit 0；installed package verifier通过；gallery
  no-embedding处理307 examples。
- Changed-scope ESLint、Prettier、Markdownlint、AgentDocs scoped checks、`git diff --check`与upstream audit通过。
  Upstream-owned files=`0`、generated status=`0`、SGP=None。

## Initial Architecture validation

- 独立复跑Styling Widget：`TOTAL 4 SUCCESS`。该结果确认flat fallback link/render与custom input probes，但不补足
  S3-R004列出的builtin/shared-imagery/LOD/composition矩阵。
- 独立复跑原始A7：`TOTAL 1 SUCCESS`；随后仅作临时诊断，在同一Spec设置`scene.rethrowRenderErrors=true`，得到
  `TOTAL 1 FAILED`，compile log明确为`v_positionEC undeclared identifier`。临时诊断行已立即移除，产品/Spec工作树只保留
  Execution原始diff。
- Architecture核对ShaderCache语义：`ShaderProgram.destroy()`在reference count归零时排队，并由frame-end
  `destroyReleasedShaderPrograms()`最终销毁；因此S3-R002不是同帧cache revive可掩盖的理论问题，而是跨frame cached-tile风险。
- `git status --short`在Architecture review改文档前为实际`22`条，全部位于phase allowlist；未发现upstream-owned或generated
  状态。未重复大构建，因为R001已直接否定code-review gate。

## Deviations and risks

- 无产品scope deviation。WorldSpec resident fixture同步当前oct-normal Worker/finalize contract，路径在assignment allowlist。
- `Material._uniforms`仍是ADR-0032记录的soft-private升级风险；sampler上限依赖当前Context；arbitrary Fabric超出已声明
  input/output subset不受保证。
- Sandcastle manual gate尚未执行；Architecture code review已批准，下一步由项目负责人核验视觉表现与交互。

## Initial requested conclusion

`changes-requested`。Execution只修复S3-R001至S3-R006并回写处置/验证；允许路径保持现有S3 allowlist，不批准修改
upstream-owned Material/Renderer/Globe、imagery runtime、terrain Worker/provider/quadtree或新增public helper。修复后请求focused
re-review；此前不请求manual gate、不commit、不push、不进入S4。

## Execution response to findings

- `S3-R001`：FS现在为Material + smooth + lighting显式声明`v_positionEC`，且A7永久设置
  `scene.rethrowRenderErrors = true`。真实Context中的Contour + smooth terrain + lighting完成compile/link/draw，A7
  `1/1`成功。
- `S3-R002`：command更新谓词同时比较当前`shaderProgram`；旧Material source release会使所有resident cached tile的
  对应source metadata失效。新增upsampled四child → root → 四child的A→B→A用例，跨
  `ShaderCache.destroyReleasedShaderPrograms()`后旧program已销毁、原child command重绑live shader和正确uniform map。
- `S3-R003`：Surface在selection/publication前预编译并bind geometric/smooth两个candidate variant；任一失败会销毁
  candidate且不写Surface map。真实非法Fabric compile用例证明旧published identity/source、normal/depth replay、tile
  command/uniform map、shader entries以及surface/quadtree/imagery counters均保持不变。
- `S3-R004`：Styling真实Context扩为`7/7`。四个stable builtin均有确定性pixel证据；覆盖Contour interval/width、
  ElevationRamp absolute height、SlopeRamp flat、AspectRamp north/east/south/west与flat、imagery→Material alpha→lighting、
  16-unit Context下15 imagery + 1 Ramp成功/16 imagery + 1 Ramp在update/request/selection/mutation前失败，以及
  ancestor/upsampled/LOD transition。
- `S3-R005`：既有terrain demo新增Contour spacing/width与当前Ramp low/high color控件；reset恢复全部builtin默认配置。
  Toolbar继续显式absolute、`z-index:2`、compact max-height/scroll并为credit保留底部空间。Manual gate尚未请求。
- `S3-R006`：World public JSDoc与Guide现在列出四个资格builtin、全部planar materialInput字段、diffuse/alpha-only、
  custom Fabric与unsupported outputs边界；支持矩阵不再把terrain Material整体列为unsupported。ADR-0032另记录
  compile-before-publication `_bind()` soft-private升级缝隙。
- 最终focused results：World `21/21`、Surface aggregate `40/40`、Styling Widget `7/7`、A7 `1/1`。GL limits为
  texture units `16`、fragment uniform vectors `1024`。build/release/types/docs/tsc、installed package verifier、gallery
  307 examples、scoped static与ownership/generated audit均通过。
- 当前精确working-tree paths=`23`（含Architecture写入的review/index），全部位于S3 allowlist；upstream-owned=`0`、
  generated status=`0`、SGP=None。Execution未commit、未push、未请求manual gate、未进入S4，等待Architecture focused
  re-review。

## Focused Architecture re-review

- Architecture逐项复核R001至R006的产品diff、Specs、ADR/JSDoc/Guide与demo ownership；未发现新的代码级finding。
- R001至R003的关键修复成立：smooth Material varying完整；cached command以current shader identity重绑；Material
  candidates在Surface publication前真实compile/link，失败不改Surface-owned publication/replay/maps/counters。
- R004的sampler预算、composition与LOD lifecycle代码路径成立。项目负责人于`2026-08-12`明确视觉表现由manual gate
  把关，不要求Architecture为批准重复执行或继续扩大像素/LOD用例矩阵。
- R005/R006的demo controls、caller ownership、overlay边界、public input/output contract与支持矩阵均与phase plan一致。
- Architecture在收到该取舍前已独立复跑Styling Widget `7/7`与A7 `1/1`；此后未再重复测试。最终静态复核中
  `git diff --check`与official upstream audit通过，current delivery upstream-owned=`0`、generated status=`0`、SGP=None。
- Working tree仍为精确23个S3 allowlist paths，HEAD未变，未commit、未push、未进入S4。

## Final conclusion

`approved`。S3-R001至S3-R006均为`fixed`，无unresolved code finding。项目负责人已在现有
`scenegis-planar-terrain` Sandcastle完成样式观感、控件交互、LOD/underground方向与overlay/credit布局的manual gate并确认
通过。S3满足独立本地checkpoint条件。

## Development tooling follow-up

- Status：`approved`；原S3产品代码review保持approved，tooling findings T001至T006全部fixed。
- 单入口先执行no-embedding gallery sync与`build-ts`，再由SceneGIS child调用exported `buildWatch` task。只有首次full
  build、incremental context初始化与watcher registration全部完成并触发task callback后，child才发送ready marker；父进程收到
  marker并确认四个必需output存在后才启动Sandcastle `dev-no-embedding`。这支持clean generated tree且不额外执行第二次
  full build，文件signature不再作为readiness contract。
- 默认端口`5173`，支持`--port`与可选`--id`；Vite参数固定加入`--strictPort`，输出URL为Vite根
  `/index.html[?id=...]`。
- SceneGIS-owned `sandcastle-vite.config.mjs`调用现有upstream dev config并只覆盖effective
  `define.__OUTER_ORIGIN__`/`define.__INNER_ORIGIN__`。Vite listen port、printed URL与两个compiled iframe/bridge origins均来自
  同一validated port；default `5173`、custom `6123`与HTTP default port `80`的effective config均由focused test锁定。
  Port 80仍向Vite传递numeric `80`，browser URL/origins canonicalize为`http://localhost`。
- Gallery source watcher使用`chokidar`，变化经过防抖并串行重建，不重启Vite/build watcher。文档明确Vite HMR关闭，
  engine/Shader由build-watch产出后需要整页刷新；same-origin Vite不需要固定`8081` mirror。
- Windows优先用当前`node.exe`执行解析出的`npm-cli.js`且`shell:false`，无CLI路径时才对固定`npm.cmd`使用
  `shell:true`；本机诊断实际解析为`C:\Program Files\nodejs\node.exe ...\npm-cli.js`并成功运行`--version`，不再走
  `spawn npm.cmd shell:false`的EINVAL路径。Windows仍按PID清理完整process tree，POSIX使用独立process group并在必要时升级
  SIGTERM为SIGKILL。SIGINT映射exit `130`，SIGTERM映射`143`；任一child/watch/rebuild失败会关闭watcher、清理siblings并
  非零退出。
- Node test `8/8`覆盖real npm CLI launch、root URL/strictPort、effective iframe origins、invalid args、debounce/serialized
  rebuild、ANSI/chunk-boundary ready marker、marker前不启动Vite、gallery变化不重启长期children、child exit sibling cleanup及
  Ctrl+C cleanup。短config-load diagnostic得到custom `6123`的outer/inner origin均为`http://localhost:6123`；短import
  diagnostic确认`gulpfile.js` exported `buildWatch`可调用。
- 只更新`Documentation/SceneGIS/DevelopmentGuide.md`和本extension AgentDocs；未修改package、gulp、server、Vite core或
  generated files。Follow-up新增/修改5个工程/持久文档路径，完整S3 working tree为27 paths；当前delivery upstream-owned=`0`、
  generated status=`0`、SGP=None。
- 未重跑S3 rendering/build矩阵；本follow-up不改变engine、Shader、demo source或public API，按派工只运行脚本focused tests
  与changed-scope static/audit。

<!-- markdownlint-disable MD060 -->

| ID      | Severity | Status | Execution disposition                                                                                                                            |
| ------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| S3-T001 | P1       | fixed  | Windows解析并通过`node.exe npm-cli.js`无shell启动；真实`npm --version`子进程exit 0，保留taskkill tree cleanup。                                  |
| S3-T002 | P1       | fixed  | URL改为Vite root `/index.html`，custom id test精确锁定`http://localhost:6123/index.html?id=scenegis-planar-terrain`。                            |
| S3-T003 | P2       | fixed  | Vite argv精确锁定`--port 6123 --strictPort`；occupied port将使child非零退出并触发现有sibling cleanup。                                           |
| S3-T004 | P1       | fixed  | SceneGIS Vite wrapper保留upstream config并覆盖outer/inner defines；5173/6123 effective config、listen argv与URL共享同一validated port。          |
| S3-T005 | P1       | fixed  | Child在exported task callback后发explicit marker；父进程ANSI/chunk-safe检测，再校验outputs并启动Vite；mock证明marker前Vite未启动。               |
| S3-T006 | P2       | fixed  | Port 80继续以`--port 80`启动Vite，environment/effective defines/printed URL使用canonical `http://localhost`；upgrade checklist记录wrapper seam。 |

<!-- markdownlint-enable MD060 -->

## Manual gate result

- 项目负责人于`2026-08-12`确认视觉验收通过，并授权进入S4。
- 该确认关闭S3最后一个gate，不改变Architecture对产品代码和development tooling的既有批准结论。
- 项目负责人同时要求后续SceneGIS示例的tool/control panel使用中文用户说明；该通用规则已提升到
  `Documentation/SceneGIS/DevelopmentGuide.md`，并纳入S4统一案例检查。
