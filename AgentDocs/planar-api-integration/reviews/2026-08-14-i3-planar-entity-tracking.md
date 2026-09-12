# Review: I3 Planar Entity Tracking

## Metadata

- Status: `approved`
- Requested by: Execution Agent
- Reviewer: Architecture Agent
- Date: `2026-08-14`
- Base: `8386eef2bd18bffb817c67235ae263ac44539d20`
- Architecture checkpoint: `63cf8bbe44`（`实现平面实体跟踪`，not pushed）
- Phase plan: [I3](../plans/2026-08-14-phase-i3-planar-entity-tracking.md)
- ADR: new `ADR-0038`; amended `ADR-0006`; dependency `ADR-0037`
- SGP: proposed `SGP-0006`

## Review request

请复核I3 FIXED planar Entity profile、native Clock/ControllerHost时序、viewFrom/bounds acquisition、Camera authority、独立
tracking/flight token、I2 framing/Home/remove/destroy互斥、Viewer double-click/InfoBox行为以及Globe/default EntityView隔离。
Architecture批准前不请求direct Test manual gate，不commit/push，不进入I4。

## Architecture review findings

### I3-R001 — High — framing flight must be published before tracking-clear callbacks

`_SceneGISPlanarEntityFraming.update` starts `camera.flyToBoundingSphere`, then calls
`clearForSuccessfulFraming`, and only afterwards stores `camera._currentFlight` in the framing operation. The clear raises
`trackedEntityChanged` synchronously. A supported listener can re-enter `zoomTo`/`flyTo` or assign another tracked Entity; the replacement
then cancels the old operation while `operation.flight` is still undefined, so the already-started Camera flight cannot be cancelled and
continues as a detached stale mutation.

Publish the actual flight identity into the current operation immediately after `flyToBoundingSphere` returns and before any tracking-clear
event/request callback can run. Add a focused regression in which a `trackedEntityChanged` listener starts a replacement operation during a
successful non-zero-duration fly, and prove the old flight is cancelled, the replacement operation remains current, stale callbacks cannot
settle it, and tracking/event state remains coherent.

### I3-R002 — High — active tracking must migrate input authority before a position-gap return

`_SceneGISPlanarEntityTracker.update` returns for an undefined current position (and for a direct Camera flight) before
`synchronizeInputAuthority`. If controller A is removed and controller B is registered during the explicitly supported position-gap state,
the tracker keeps A's token while B is unsuspended and can mutate the Camera. This violates the phase contract that an acquired tracking
authority and input suspension survive position gaps and controller replacement/disconnection.

Once `_hasAuthority` is true, reconcile the registered controller/token before the position-gap and current-flight early returns, without
acquiring a token while initial authority is still pending. Add focused coverage for active tracking → undefined position → controller A
removed/controller B registered → host update, proving A resumes exactly once, B is suspended and cannot process input, and clear/destroy
releases B exactly once. Cover the same reconciliation while a direct Camera flight is active if that path shares the early return.

### I3-R003 — Medium — InfoBox must remain able to untrack through a position gap

`Viewer._onTick` enables the planar InfoBox camera button only for DONE bounds or a currently trackable finite sample. During a supported
temporary undefined-position/PENDING-bounds frame, `isCameraTracking` remains true but `enableCamera` becomes false, so the visible public
InfoBox cannot invoke its already-correct untrack-first click path.

For a planar Viewer, keep the camera action enabled when the selected Entity is already the current `trackedEntity`, independently of the
current sample/bounds result. Add a focused Viewer regression that enters tracking, publishes an undefined sample with PENDING or FAILED
bounds, proves `enableCamera=true` and `isCameraTracking=true`, and proves the InfoBox action clears tracking without starting framing.

### I3-R004 — Medium — ADR validation wording must match the staged publication contract

ADR-0038 currently states that all candidates pass validation before Camera, listener, token, and public tracking-state mutation. The
confirmed phase contract and implementation intentionally validate only the static Entity profile before public publication; a currently
undefined position remains a valid published assignment, while time-dependent position/viewFrom/bounds candidates are validated later
before their corresponding Camera/token/offset mutation. The current ADR sentence therefore overstates failure atomicity and contradicts the
phase plan.

Revise ADR-0038 (and any copied formal-doc wording) to distinguish static pre-publication validation from time-dependent pre-authority
validation, including the position-gap behavior and the fact that a dynamic failure preserves the published tracking assignment and last
Camera pose. This is a documentation correction only; do not narrow the accepted public profile.

## Architecture review disposition

- Result: `changes-requested`.
- Manual gate remains forbidden until all four findings are closed by focused re-review.
- Correction boundary: the affected private framing/tracker, `Viewer.js`, focused Specs, ADR/formal wording, and existing I3 AgentDocs only.
- Do not rerun broad builds, package delivery, unrelated aggregates, direct browser/manual checks, full suite, E2E, or Sandcastle for this
  correction round.

## Execution response to I3-R001..R004

- I3-R001 addressed：`flyToBoundingSphere`返回后立即把实际`camera._currentFlight`写入仍为current的operation，再触发
  tracking clear。Focused regression让`trackedEntityChanged`同步启动replacement，证明旧flight被cancel、replacement保持
  current，旧complete callback不能settle新operation，tracking event只发布一次。
- I3-R002 addressed：已取得authority时，tracker在position-gap与direct-flight early return前先reconcile registered
  planar camera controller。Focused regression覆盖A移除/B注册的gap以及B移除/C注册的active flight，旧token各resume一次、
  新controller保持suspended，clear与destroy不重复release；initial PENDING仍不提前获取token。
- I3-R003 addressed：planar selected Entity已经是`trackedEntity`时，InfoBox camera action独立保持enabled。Focused Viewer
  regression在undefined sample与PENDING bounds下锁定`enableCamera=true`、`isCameraTracking=true`，click只untrack且不调用
  framing。
- I3-R004 addressed：ADR-0038现区分static profile pre-publication validation与time-dependent pre-authority
  validation，并明确position gap/dynamic failure保留published assignment与last pose且不部分取得authority。
- Focused rerun：EntityZoom Widget `TOTAL: 11 SUCCESS`；private tracker `TOTAL: 7 SUCCESS`；planar Viewer
  `TOTAL: 23 SUCCESS`。未重复build/package、real-Context aggregate、direct browser、E2E、Sandcastle或full suite，符合本轮边界。
- Scoped ESLint、Prettier、Markdownlint、`git diff --check`与official upstream audit通过；current delivery
  upstream-owned=`2`（`CesiumWidget.js` / `Viewer.js`），SGP=`SGP-0006`，generated status=`0`。
- Status remains `changes-requested` until Architecture focused re-review closes the findings；working tree仍未commit/未push，
  manual gate未请求，未进入I4。

## Architecture focused re-review

- I3-R001：`closed`。Actual flight identity现已在`trackedEntityChanged`等同步callback前发布；reentrant replacement regression
  证明旧flight可取消且stale callback不能影响新operation。
- I3-R003：`closed`。已track selected Entity在undefined sample/PENDING bounds期间仍发布可用的InfoBox untrack action，且不误启
  framing。
- I3-R004：`closed`。ADR已区分static pre-publication与time-dependent pre-authority validation，并记录position gap/dynamic
  failure保留语义。
- I3-R002：`open`。Controller reconciliation已经移到两个early return之前，但当前仍发生在
  `getCurrentPosition(entity,time,...)`之前。`CallbackPositionProperty`是caller code；它可以在取值期间移除当前controller A并注册
  B。此时reconcile只看到了A，callback返回undefined后tracker立即return，后注册且priority更高的B未suspend并可在同一
  `ControllerHost` frame修改Camera。相同顺序也与ADR刚确认的time-dependent candidate validation-before-authority contract不一致。

I3-R002的剩余修复必须按以下顺序完成：先读取并验证current position；若已有authority，再reconcile当下registered controller；
随后才处理undefined-position与direct-flight early return。Initial PENDING仍不得获取token。新增focused regression，让active
`CallbackPositionProperty`在取值callback内部执行A remove/B add并返回undefined，证明同一host frame中A exactly-once resume、B
suspended且不能修改Camera，clear/destroy exactly-once release。现有pre-frame A→B与direct-flight B→C覆盖继续保留。

Focused re-review result仍为`changes-requested`；只需修复I3-R002及对应Spec/AgentDocs，不重跑其余suite/build/package/browser。

## Execution response to I3-R002 residual

- Tracker顺序现为static profile validation → current position read/validation → existing-authority controller reconciliation →
  position-gap/direct-flight early return。Caller-owned position getter完成后才根据当下registered controller迁移token；initial
  PENDING仍不提前取得token。
- 新增focused regression：active `CallbackPositionProperty`在getter内部同步remove controller A、add controller B并返回
  `undefined`。同一`ControllerHost` frame内A resume exactly once、B在自身update前已suspended且Camera pose不变；clear释放B
  once，随后destroy不重复release。
- 既有pre-frame A→B position-gap与active direct-flight B→C覆盖保持不变。
- Focused rerun：private tracker `TOTAL: 8 SUCCESS`。只运行affected ESLint/Prettier、AgentDocs Markdownlint、
  `git diff --check`与official audit；未重复其他suite/build/package/browser/manual。
- I3-R002 residual已addressed，等待Architecture第二次focused re-review；review status仍为`changes-requested`，manual gate
  未请求，working tree未commit/未push，未进入I4。

## Architecture second focused re-review

- I3-R002：`closed`。Current position现已先完成read/validation，随后才按callback结束后的registry reconcile controller，并在
  position-gap/direct-flight return前完成token迁移；callback内A→B regression锁定authority与exactly-once release。
- I3-R005：`open`（High）。R002 regression确认`CallbackPositionProperty.getValue`是可同步修改widget状态的caller code，但
  tracker在position callback返回后没有确认本次update最初捕获的`entity`仍是current target。若callback执行
  `widget.trackedEntity=undefined`并返回finite position，`setTarget`已清除authority，随后update会以空`tracker._entity`进入
  `acquireAuthority`并访问`entity.viewFrom`；若callback改为Entity B，则会把Entity A的position与Entity B的viewFrom/bounds组合后
  错误发布Camera/token authority。Initial `viewFrom` property callback同样可在candidate evaluation中替换target，而当前代码会继续发布
  stale candidate。

I3-R005需要给tracker target增加明确的transaction identity（entity identity或monotonic target revision），并在caller-owned
position、initial viewFrom及其他可能执行caller candidate code的步骤返回后、任何Camera/token/offset publication前检查。Target已
clear/replaced时，本次stale update必须无异常、无Camera/token mutation地结束，新的target由后续host frame处理。Focused regression至少
覆盖position callback内clear和A→B replacement，证明旧sample不会取得authority或移动Camera，listener/token/event保持setter已发布
状态；另覆盖initial viewFrom callback replacement，避免只修position入口。Same-reference no-op不应误判为replacement。

Second focused result仍为`changes-requested`。修复只限private tracker及其Spec/AgentDocs；不重跑Viewer/framing、build/package或browser。

## Execution response to I3-R005

- Tracker新增monotonic `_targetRevision`；same-reference `setTarget`保持no-op且不递增。每次update捕获entity/revision，
  position getter返回后先核对transaction，再validate candidate；initial viewFrom和bounds candidate返回后也在任何
  Camera/token/published offset mutation前复核同一transaction。
- Stale clear/replacement会无异常结束本次update；setter已经发布的target、definition listener、authority release与event状态
  保持不变，新target只在下一host frame处理。Property scratch可被caller写入，但不会发布到`_offset/_lastPosition`。
- Focused regression覆盖position callback内clear并返回finite、position callback内A→B replacement并返回finite、initial
  viewFrom callback内replacement，以及same-reference setter callback。旧candidate均不移动Camera/取得token；replacement listener
  与target identity保持setter结果，下一frame才取得新target authority。
- Private tracker focused suite：`TOTAL: 9 SUCCESS`。只运行affected ESLint/Prettier、AgentDocs Markdownlint、
  `git diff --check`与official audit；未重复Viewer/framing、build/package、browser/manual或其他suite。
- I3-R005已addressed，等待Architecture focused re-review；status仍为`changes-requested`，manual gate未请求，working tree
  未commit/未push，未进入I4。

## Architecture final disposition

- I3-R005：`closed`。Revision guard覆盖position、viewFrom与bounds三处caller-controlled candidate boundary；stale update不会取得
  authority、移动Camera或覆盖setter已发布状态，同引用setter不误失效transaction。
- I3-R001-R005全部关闭；Architecture/code review：`approved`。
- Automated evidence与ownership/SGP boundary接受；Architecture未重复Execution测试。
- 项目负责人已在`Test/平面API集成.html`完成人工验证并明确通过，覆盖Clock tracking、InfoBox/double-click、tracking
  input isolation及stop/zoom/fly/Home恢复。Architecture已创建I3独立本地checkpoint `63cf8bbe44`（not pushed）；I3
  completed，I4未进入。

## Implementation summary

- SceneGIS-owned lazy `_SceneGISPlanarEntityTracker`只接受真实Entity、FIXED position与AUTODETECT/ENU；orientation不参与Camera
  frame。Tracker使用ControllerHost传入的同一JulianDate，position undefined时保留pose，defined nonfinite时failure-atomic。
- Initial authority按viewFrom、PENDING/DONE/FAILED bounds顺序取得fixed offset；active frame重新assert `lookAt`。Planar camera
  controller使用独立tracking suspension token；direct Camera flight等待并在complete/cancel后恢复。
- Successful zoom/fly、Home、replacement/clear、Entity removal与destroy清理tracking；failed/PENDING framing不误清除。Viewer恢复
  left-double-click与InfoBox track/untrack/zoom fallback；nonplanar path继续使用原Earth `EntityView`。
- Test页面新增中文native Clock与dynamic FIXED Entity controls；ADR/Guide/upgrade checklist/installed verifier同步。

## Evidence

| Scope                                                     | Result                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| private tracker validation/lifecycle                      | `TOTAL: 9 SUCCESS`                                                       |
| real-Context Perspective/Orthographic Widget              | `TOTAL: 3 SUCCESS`                                                       |
| live/declarative Viewer interactions/nonplanar regression | `TOTAL: 23 SUCCESS`                                                      |
| nested flight/tracking controller tokens                  | `TOTAL: 2 SUCCESS`                                                       |
| existing I2 framing regression                            | `TOTAL: 11 SUCCESS`                                                      |
| upstream CesiumWidget / Viewer                            | `TOTAL: 75 SUCCESS` / `TOTAL: 59 SUCCESS`                                |
| build, build-release, build-ts, build-docs, tsc           | passed                                                                   |
| installed verifier                                        | passed; I3 tar Source JSDoc, API anchors and private delivery            |
| direct Test headless Chromium                             | root server; network blocked; tracking/Clock/stop/BFCache/cleanup passed |
| scoped static/diff/audit/status                           | passed; exact final result recorded in phase handoff                     |

Real-Context evidence包括native Clock移动、actual Camera tween frame/`completeFlight()`恢复、actual wheel suppression、low-level
no-controller、warm tile/terrain mesh/Surface command/shader/VA/imagery/environment identities。Direct browser的console resource
failures仅来自主动blocked public tiles，`pageerror=[]`；GUI与credit无overlap。

## Ownership and deviations

- Upstream-owned changed files: `packages/engine/Source/Widget/CesiumWidget.js`、
  `packages/widgets/Source/Viewer/Viewer.js`。
- SGP-0006: proposed；全部I3 upstream hunks使用paired markers；SGP-0001/0002/0004/0005保持独立。
- SceneGIS-owned product: tracker、framing successful-clear seam、camera controller tracking token。
- Scope/public profile deviations: none。
- Generated status: `0`；working tree uncommitted/unpushed。
- Architecture-owned `AgentDocs/planar-viewer-bootstrap/**`baseline保持原样且不属于I3 review；owner `Test/地形.html`未读取、
  未修改、未暂存。

## Unrun and remaining gate

- 未运行full suite、E2E、Sandcastle、public-network success或I4 Scene API suites，均不在I3最小充分边界。
- Architecture/code review approved；项目负责人manual gate passed；checkpoint=`63cf8bbe44`（not pushed）；I3 completed，I4未进入。
