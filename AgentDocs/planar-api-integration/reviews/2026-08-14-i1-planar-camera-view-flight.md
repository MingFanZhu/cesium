# Review: I1 Planar Camera View and Flight

## Metadata

- Status：`approved`
- Review type：Architecture/code review
- Extension：`planar-api-integration`
- Phase：`I1 Planar Camera View and Flight`
- Base：`b6377c5e6e865c8c04041359f99d952c15be17e3`
- Branch：`feature/planar-api-integration`
- Requested by：Execution Agent
- Requested on：`2026-08-14`
- Related plan：[I1 phase plan](../plans/2026-08-14-phase-i1-planar-camera-view-flight.md)
- ADR：[ADR-0037](../../../Documentation/SceneGIS/Decisions/ADR-0037-planar-camera-view-and-flight.md)
- SGP：`SGP-0004`（`proposed`）
- Architecture checkpoint：created locally（`实现平面相机视图与飞行接口`；稳定hash由后续phase作为parent记录）

## Review request

请Architecture复核I1 public Camera fixed-axis view/flight dispatch、private Cartesian tween、controller suspension、
Globe non-regression、JSDoc/ADR与验证边界。批准前Execution不请求direct Test manual gate、不commit/push且不进入I2。

## Findings

<!-- markdownlint-disable MD060 -->

| ID      | Severity | Status    | Finding |
| ------- | -------- | --------- | ------- |
| I1-R001 | high     | closed | `_SceneGISPlanarCamera.computeHomeState`只用`extent.width`生成一个`halfSize`并同时套用到水平、垂直frustum span；`SceneGISPlanarCameraController._computeHomeState`保留了同一重复算法。对于height大于width的非方形planar extent，public `Camera.flyHome`和controller Home都会按较短X边计算距离/orthographic scale，无法包含完整Y范围。修复应分别使用padded half-width/half-height，并让public flight与controller Home共享或以Spec锁定同一计算契约；覆盖至少一个tall extent、一个wide extent及Perspective/Orthographic（含off-center deterministic coverage）。 |
| I1-R002 | high     | closed | Fixed-axis HPR反解在vertical direction时无条件使用`atan2(up.x, up.y)`。该公式只适用于nadir（`direction.z < 0`）；对zenith（`direction=+Z`），例如heading=0产生的up为`-Y`，当前反解得到heading=π，再由`getAxes`重建为up=`+Y`。因此planar `Camera.heading`的奇异点表示不能重建原basis，direction/up形式的`flyTo`到朝天姿态会以相反up结束。`_SceneGISPlanarCamera.getHeadingPitch`与`_SceneGISPlanarCameraFlight.axesToHeadingPitchRoll`两处重复逻辑都需按vertical direction符号统一修正，增加zenith HPR/basis round-trip及public flight最终direction/up证明；nadir既有契约必须保持。 |
| I1-R003 | high     | closed | `addFlight`的zero-duration路径在同一个transaction `try/catch`内发布终态并调用caller `complete`。若callback抛错，catch只恢复`state.originalTransform`，却不恢复Camera local position/direction/up；当`endTransform`非identity时，终态local pose会在旧transform下被重新解释，Camera落到既非起点也非请求终点的损坏world pose。Caller callback发生在成功发布之后，不应再走candidate rollback；请把内部发布/恢复与外部callback边界拆开（或完整保持一致的终态），并以nonidentity `endTransform` + throwing complete的focused Spec锁定：input exactly-once恢复、Camera world pose/transform一致、无遗留flight/tween。 |

<!-- markdownlint-enable MD060 -->

## Execution response to findings

- I1-R001：`computeHomeState`现在分别以padded half-width/half-height拟合水平和垂直frustum；controller删除重复公式并直接调用同一helper，`flyHome`与controller Home共享唯一契约。Private Spec覆盖tall/wide extent与四类frustum，controller Spec覆盖tall large-offset extent及Perspective/Orthographic两类off-center。当前public `SceneGISPlanarCoordinateSystem`仍要求square extent，因此controller回归在构造live World后以soft-private owned extent注入tall fixture，只隔离验证Home数学，不改变公共extent contract。
- I1-R002：两个vertical HPR inverse都按`direction.z`选择up-axis符号；zenith/nadir basis round-trip与direction/up形式public flight终态均锁定，既有nadir行为保持。
- I1-R003：zero-duration内部发布、input恢复与`requestRender`在transaction内完成；caller `complete`只在成功commit后、rollback边界外调用。Nonidentity `endTransform` + throwing callback Spec证明终态world pose/transform一致、caller原`enabled`恢复、suspension count归零且无flight/tween残留。
- Focused re-validation：Camera/controller/flight aggregate `TOTAL: 68 SUCCESS`；real-Context Camera Widget `TOTAL: 2 SUCCESS`。未重跑build/package/Globe/Environment或其他suite，符合Architecture窄修复边界。

## Architecture focused re-review

- Result：`approved`；I1-R001、I1-R002、I1-R003均已关闭，没有发现新的代码阻断项。
- I1-R001：共享Home helper分别使用padded half-width和half-height拟合水平、垂直span；controller与public
  `flyHome`不再维护两套公式，tall/wide及四类frustum的focused Specs锁定同一契约。
- I1-R002：两处vertical HPR inverse均按`direction.z`选择up-axis符号，zenith与nadir可重建原始basis；
  direction/up形式public flight终态覆盖了对外路径。
- I1-R003：zero-duration的内部发布、input恢复和`requestRender`构成commit边界；caller `complete`在rollback
  `try/catch`之外调用。Nonidentity `endTransform`与throwing callback回归证明成功终态不会被错误回滚或重新解释。
- Architecture本轮只复核修复代码与对应Specs，没有重复运行测试或build；接受Execution记录的`68 SUCCESS`、
  Widget `2 SUCCESS`和SGP audit结果。
- Manual gate：项目负责人已通过`Test/平面环境.html`完成public Camera setView/lookAt/bounds/fly/cancel/complete/Home
  人工验收并明确通过。Architecture已创建独立本地checkpoint；I1 completed，checkpoint未push，I2未进入。

## Changed paths

### Product and SGP

- `.scenegis/upstream-patches.json`
- `packages/engine/Source/Scene/Camera.js`（唯一upstream-owned；paired `SGP-0004`）
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCameraFlight.js`（new）
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`

### Specs and direct example

- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCameraSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCameraFlightSpec.js`（new）
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarCameraCesiumWidgetSpec.js`（new）
- `Test/平面环境.html`

### Formal docs and AgentDocs

- `Documentation/SceneGIS/Decisions/ADR-0037-planar-camera-view-and-flight.md`（new）
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `AgentDocs/planar-api-integration/README.md`
- `AgentDocs/planar-api-integration/plans/README.md`
- `AgentDocs/planar-api-integration/plans/2026-08-14-planar-api-integration-extension.md`
- `AgentDocs/planar-api-integration/plans/2026-08-14-phase-i1-planar-camera-view-flight.md`
- `AgentDocs/planar-api-integration/discussions/README.md`
- `AgentDocs/planar-api-integration/discussions/2026-08-14-cesium-public-api-planar-compatibility.md`
- `AgentDocs/planar-api-integration/reviews/README.md`
- `AgentDocs/planar-api-integration/reviews/2026-08-14-i1-planar-camera-view-flight.md`（new）

Architecture planning baseline created the extension directory before assignment. Execution changed only handoff/results/review links in
those baseline files and added this review. Two dirty `planar-viewer-bootstrap` AgentDocs paths are Architecture-owned assignment baseline;
project-owner untracked `Test/地形.html` was neither read nor modified and is excluded from this delivery.

## Implementation summary

- `Camera.js` detects only a live primary `SceneGISPlanarWorld` and dispatches HPR getters, `setView`、`lookAt`、
  `viewBoundingSphere`、`flyTo`、`flyToBoundingSphere`、`flyHome`及flight cancel/complete。
- Fixed axes are`+X East/+Y North/+Z Up`; target transforms use translation only. Four-frustum sphere framing centers the target on
  each actual center ray and preflights near/far/overflow before mutation.
- Private flight interpolates Cartesian XY、planar Z arc and shortest HPR, preserves duration/easing/callback/replacement/preload/
  requestRender, rejects Rectangle and`flyOverLongitude*`, and performs candidate-before-publication rollback.
- Registered planar controller receives an exactly-once suspension token; input and surface clearance stay paused during flight without
  mutating caller `enabled`. The next controller frame resumes existing clearance policy.
- `CameraFlightPath.js` was not changed. Viewer/CesiumWidget zoom/fly/tracking guards remain byte-for-byte unchanged.

## Validation evidence

| Command / evidence                                                                      | Result                                                                                 |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCamera"`                   | `TOTAL: 68 SUCCESS`（controller 47、flight 7、private Camera 14）                      |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarCameraCesiumWidget"`      | `TOTAL: 2 SUCCESS`                                                                     |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"` | `TOTAL: 10 SUCCESS`                                                                    |
| `npm run test -- --includeName "Scene/Camera"`                                          | `TOTAL: 241 SUCCESS`（upstream Camera/CameraFlightPath/CameraEventAggregator）         |
| `npm run build` / `npm run build-release`                                               | passed                                                                                 |
| `npm run build-ts` / `npm run build-docs` / `npm run tsc`                               | passed；仅既有TSD-JSDoc warnings                                                       |
| `node scripts/scenegis/verify-planar-packages.mjs`                                      | passed；12/12 GLSL、12/12 generated modules、ESM/CJS/public installed contracts        |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                      | passed；current delivery upstream-owned=1 (`Camera.js`), patch=`SGP-0004`, generated=0 |
| base diff for `CameraFlightPath.js`、`Viewer.js`、`CesiumWidget.js`                     | unchanged (`git diff --quiet` exit 0)                                                  |

Real Context Perspective case runs actual tween frames, dispatches an actual wheel event while controller is suspended, and proves
terrain tile/mesh、Surface command/shader/VA、imagery binding/texture及Environment light identity remain warm. Orthographic case covers
public lookAt/bounds/flight/Home/zero-duration and next-frame surface clearance.

## Deviations, unrun boundary, and risks

- No `CameraFlightPath.js` dispatch was necessary; this reduces upstream scope to one file.
- `scripts/scenegis/verify-planar-packages.mjs` required no change because no signature/type member was added; the existing installed verifier
  and successful generated API docs establish delivery. Public Camera JSDoc triggered the full build/types/docs/package matrix.
- Direct Test page先完成formatted/static review；Architecture approval后，项目负责人已完成public Camera人工验收并明确通过。
  Public providers仍不是自动化gate。
- Full suite、E2E、Sandcastle、network automation、unrelated World/Surface suites and I2 Viewer tests were not run.
- Remaining risk is the soft-private `ControllerHost._controllers` lookup and upstream Camera tween/internal fields; ADR-0037 and the upgrade
  checklist record their removal/re-audit conditions.

## Ownership and status

- Upstream-owned changed files：`1` — `packages/engine/Source/Scene/Camera.js`
- SGP：`SGP-0004`; `CameraFlightPath.js` unchanged
- Generated status：`0`
- Commit/push/publish：none
- I2：not entered
