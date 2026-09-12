# E2 Review：天文天体方向模式

## Metadata

- Status：`approved`
- Date：`2026-08-13`
- Phase：[E2 phase plan](../plans/2026-08-13-phase-e2-astronomical-direction-mode.md)
- Reviewer：Architecture Agent
- Commit/push：None；working tree intentionally uncommitted
- ADR：`ADR-0034` proposed
- SGP：None；upstream-owned files=`0`

## Review request

请复核：

- `directionMode`、project-origin radians、manual fallback与readonly effective clone contract及failure atomicity。
- 显式host `JulianDate`→Simon1994 inertial→TEME pseudo-fixed→WGS84 observer topocentric ENU pipeline；Moon保留parallax，
  整张平面共享方向且无CRS/camera/XY推断。
- Sun/Moon/time/origin candidate原子publication、same-time clean no-op、setter/reenable当前frame request去重，以及E1
  authority/restore/ownership兼容。
- Real Context terrain/imagery pixel与warm identities、installed runtime/declarations/API、中文direct Test与ADR/upgrade边界。

## Exact changed paths

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarEnvironmentSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`
- `Test/平面环境.html`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0034-planar-environment-astronomical-directions.md`
- `AgentDocs/planar-environment/README.md`
- `AgentDocs/planar-environment/plans/README.md`
- `AgentDocs/planar-environment/plans/2026-08-13-planar-environment-extension.md`
- `AgentDocs/planar-environment/plans/2026-08-13-phase-e2-astronomical-direction-mode.md`
- `AgentDocs/planar-environment/reviews/README.md`
- `AgentDocs/planar-environment/reviews/2026-08-13-e2-astronomical-direction-mode.md`

`plans/README.md`仅因active E2链接继续存在而列入scope；如最终diff为零，ready handoff按actual status校正计数。

## Validation evidence

| Command / evidence                                                                                  | Result                                                                                        |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarEnvironment"`                          | TOTAL 17 SUCCESS；含same mode/origin active no-op闭环                                         |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"`             | TOTAL 5 SUCCESS；含astronomy real-Context pixel/warm identity                                 |
| `npm run build`、`npm run build-release`                                                            | passed                                                                                        |
| `npm run build-ts`、`npm run build-docs`、`npm run tsc`                                             | passed；仅既有TSD-JSDoc warnings                                                              |
| `node scripts/scenegis/verify-planar-packages.mjs`                                                  | passed；S2/S3/E1/E2 installed runtime、engine/root declarations与API anchors                  |
| direct Test短浏览器检查                                                                             | passed；mode/time/origin改变effective方向，manual恢复，中文labels、camera、compact/credit正常 |
| changed-scope ESLint/Prettier/Markdownlint、AgentDocs checks、`git diff --check`                    | passed                                                                                        |
| `node scripts/scenegis/audit-upstream-patches.mjs`、exact status/generated/upstream ownership audit | passed；E2 15 paths、upstream-owned=0、generated=0、SGP=None                                  |

Browser检查拦截OSM/Esri公网请求并验证fallback，不宣称public tile success。未运行Sandcastle、full suite、E2E、
public-network automation或无关terrain suites，均符合phase plan。

## Implementation notes and risks

- Environment实例持有全部astronomy scratch；每frame不分配Cartesian/matrix，且没有timer/listener/Promise/network/GPU resource。
- Pseudo-fixed采用UT1≈UTC，只承诺visual-grade；不宣称navigation/survey/eclipse accuracy。
- Package verifier的通用class declaration matcher原先只接受`export class Name {`，E2生成类型为
  `export class SceneGISPlanarEnvironment implements Controller {`；matcher已窄扩为可选implements并由完整verifier验证。
- Architecture review批准前不请求项目负责人manual gate；phase仍active，未commit/push/publish，未进入E3。
- Working tree另有项目负责人自有untracked `Test/地形.html`；E2未读取、修改或纳入delivery。

## Architecture findings

- `E2-R001` — Severity: medium；Owner: Execution Agent；Status: `fixed`。

  `SceneGISPlanarEnvironment`的新增公共API缺少完整的public JSDoc错误契约。Constructor当前只列出既有world、direction、
  color和intensity异常，但实现还会因invalid `directionMode`、origin非finite/越界，以及astronomical mode缺少任一origin而抛
  `DeveloperError`；`directionMode`、`originLongitude`和`originLatitude` setter自身也没有对应`@exception`。这会让生成API
  文档无法表达E2已经冻结的validation/failure-atomic contract。补齐精确英文JSDoc，不改变runtime behavior，并让installed
  documentation verification锁定这些exception文本或等价稳定证据。

  Execution disposition：constructor现明确列出invalid mode、origin非finite/越界与astronomical缺origin三类
  `DeveloperError`；三个setter分别记录invalid union/range与active astronomical clear错误。Installed documentation verifier
  锁定constructor/setter exception文本；未改变runtime validation或failure atomicity。

  Architecture focused re-review：public JSDoc现与constructor及三个setter的实际validation边界一致；constructor文本由生成API HTML
  锁定，setter文本从解包后的`@cesium/engine`安装产物源码锁定，证据未回退到workspace source。本finding关闭。

- `E2-R002` — Severity: medium；Owner: Execution Agent；Status: `fixed`。

  E2 plan要求“same mode/origin/manual normalized value是no-op”，但新增Specs没有锁定active astronomical下same
  `directionMode`、same `originLongitude`和same `originLatitude`不会置dirty、不会request，也不会在下一次same-time update
  重算/发布。现有实现按代码看来满足，但requestRender与publication去重是本phase的关键状态机，不能只依赖实现阅读。请在unit
  Spec增加focused闭环，至少保存effective directions、published time、light identity/direction与request count，依次重复赋相同
  mode/origin并same-time update，证明它们全部保持。

  Execution disposition：新增active astronomical unit闭环，首次publication后保存effective Sun/Moon、published time、stable
  light identity/direction与request count；依次重复赋相同mode/longitude/latitude并执行same-time update，证明dirty仍false、
  state/light/time/request count完全保持。

  Architecture focused re-review：用例前置完成首次astronomical publication，随后覆盖三个同值setter与same-time update；dirty、
  effective directions、published time、stable light及request count均被锁定。本finding关闭。

## Execution focused fix validation

- Environment unit：TOTAL 17 SUCCESS。
- `npm run build-ts`、`npm run build-docs`、`npm run tsc`：passed；仅既有baseline TSD-JSDoc warnings。
- Installed verifier：passed；constructor exceptions由API HTML锁定，setter exceptions由installed source artifact锁定，同时继续验证
  E2 runtime、engine/root declarations与member anchors。
- Scoped ESLint/Prettier/Markdownlint与`git diff --check`：passed；official audit passed，upstream-owned=0、generated=0、
  SGP=None。
- 按finding边界未重跑real-Context Widget、`npm run build`/`build-release`、direct Chromium、full suite或E2E。

## Architecture conclusion

- Status：`approved`。
- `E2-R001..R002`均已关闭；本轮focused re-review未发现新增finding。
- Runtime astronomy pipeline、single-origin ENU mapping、topocentric Moon、E1 authority/lifecycle、scope/ownership与warm-resource
  设计经代码审查未见结构性错误；public JSDoc、installed delivery证据及active astronomical同值no-op闭环现已完整。
- Architecture本轮仅复核代码与证据链，未重复Execution已报告通过的unit、types/docs/package verifier或其他验证。
- 项目负责人于`2026-08-13`通过`Test/平面环境.html`人工验收，确认manual/天文模式、project-origin经纬度、UTC时间、
  terrain lighting、中文lil-gui和平面相机表现，并允许进入E3；manual gate已关闭。
- Architecture同时确认E2直接消费Cesium原生simulation time：`CesiumWidget.clock.tick()`的`currentTime`经`Scene.render`与
  `ControllerHost.update`传入Environment；示例时间控件直接写`widget.clock.currentTime`，不存在第二套Clock。
- E2可形成独立本地checkpoint，未push；E3只在该checkpoint之后进入Architecture planning。
