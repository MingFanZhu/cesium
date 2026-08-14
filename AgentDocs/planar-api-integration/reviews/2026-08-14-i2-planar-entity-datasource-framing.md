# Review: I2 Planar Entity/DataSource Framing

## Metadata

- Status: `approved`
- Requested by: Execution Agent
- Reviewer: Architecture Agent
- Date: `2026-08-14`
- Base: `ff7c1916d6604400465414305f3f647ef9347d5c`
- Phase plan: [I2](../plans/2026-08-14-phase-i2-planar-entity-datasource-framing.md)
- ADR: amended `ADR-0006`; dependency `ADR-0037`
- SGP: proposed `SGP-0005`

## Review request

请复核I2 exact Entity/DataSource target profile、operation-isolated Promise/loading/flight lifecycle、CesiumWidget/Viewer paired
SGP-0005 seams、InfoBox zoom-only与Globe/default isolation。Architecture批准前不请求direct Test manual gate，不commit/push，
不进入I3。

## Implementation summary

- SceneGIS-owned private helper集中validation/snapshot、loading listener、PENDING/DONE/FAILED aggregation与Camera bounds handoff。
- Direct invalid input failure-atomic；replacement/cancel/tracked cleanup/destroy resolve false once；stale callbacks identity-guarded；
  async rejection/invalid与bounds/Camera failures reject and clear。
- Viewer live/declarative paths委托同一resolved Widget/World；InfoBox DONE启用且click只zoom，tracking/double-click继续拒绝。
- Test页面只使用public Viewer API组装本地Entity/DataSource中文controls；正式文档与installed API verifier闭环。

## Evidence

| Scope                                   | Result                                                     |
| --------------------------------------- | ---------------------------------------------------------- |
| focused direct planar CesiumWidget      | `TOTAL: 11 SUCCESS`                                        |
| focused live/declarative planar Viewer  | `TOTAL: 23 SUCCESS`                                        |
| existing real-content Viewer            | `TOTAL: 3 SUCCESS`                                         |
| upstream CesiumWidget Globe/globe:false | `TOTAL: 75 SUCCESS`                                        |
| upstream Viewer                         | `TOTAL: 59 SUCCESS`                                        |
| build/release/types/docs/tsc            | passed                                                     |
| installed package verifier              | passed; 12/12 GLSL + 12/12 generated modules + I2 API docs |
| scoped format/lint/docs/diff/audit      | passed                                                     |

Real-Context evidence includes actual planar Point visualizer bounds, Perspective zoom, Orthographic duration>0 tween/cancel/complete and
warm tile/terrain mesh/Surface command/shader/VA/imagery binding/texture identities. No full suite、E2E、Sandcastle或public-network
automation was run. Direct Test browser smoke is intentionally deferred until Architecture approval.

## Ownership and status

- Upstream-owned changed files: `packages/engine/Source/Widget/CesiumWidget.js`、
  `packages/widgets/Source/Viewer/Viewer.js`。
- SGP: `SGP-0005` proposed; every new/changed upstream hunk is paired; SGP-0001/0002/0004 remain independent。
- Generated status: `0`。
- Working tree: uncommitted/unpushed；owner `Test/地形.html`未读取、未修改、未暂存。
- Concurrent Architecture baselines under`AgentDocs/planar-viewer-bootstrap/**`were preserved and are outside this review scope。

## Findings

<!-- markdownlint-disable MD060 -->

| ID      | Severity | Status | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I2-R001 | high     | closed | `Viewer._onTick`把原先所有非`FAILED`状态都使用`boundingSphereScratch.center`的共同分支改成了只有`DONE`才发布position。虽然planar Viewer需要严格区分`PENDING`，但Globe、`globe:false`和generic Viewer仍以`allowPartial=true`调用；当`DataSourceDisplay`整体尚未ready而返回`PENDING`时，当前代码会把原有的InfoBox/SelectionIndicator能力从已发布position改成disabled。这违反I2明确的Globe/default isolation，并且现有upstream aggregate没有覆盖该三态。请只在`_isPlanarViewer`分支使用`DONE`/`PENDING`严格语义，非planar分支保持修改前的`state !== FAILED`及fallback逻辑逐字等价，并增加一个focused非planar`PENDING`回归。 |
| I2-R002 | high     | closed | `_SceneGISPlanarEntityFraming.settle`以Cesium `defined(error)`判断reject还是resolve；合法的`Promise.reject(undefined)`和`Promise.reject(null)`因此会走`operation.resolve(value)`，把输入rejection错误地变成fulfilled `undefined`。这违反phase要求的input rejection透传，也会同样吞掉`throw undefined/null`的bounds或Camera失败。请让resolve/reject成为显式不同的settlement路径或使用独立reject标志，并以至少`undefined`和`null` rejection证明原reason、operation清理及exactly-once结算。                                                                                                                                 |

<!-- markdownlint-enable MD060 -->

## Architecture initial review

- Result: `changes-requested`；I2-R001、I2-R002关闭前不得请求direct Test manual gate、commit/push或进入I3。
- Architecture只阅读实现、Specs、ADR/SGP、phase plan和既有验证证据，没有重复运行Execution已经通过的测试或build。
- 已确认target/options先验证、array/collection snapshot、loading listener移除、per-operation flight callback identity、destroy取消及
  paired `SGP-0005`总体边界成立；本轮修复应限制在两个finding及对应focused Specs/AgentDocs writeback。

## Execution response to findings

- I2-R001 addressed：`Viewer._onTick`只对planar Viewer要求`DONE`；非planar Viewer恢复原有
  `boundingSphereState !== FAILED` position publication与`FAILED` fallback。新增`globe:false`的`PENDING`回归，证明
  InfoBox camera、SelectionIndicator及scratch center继续发布。Focused Viewer结果为`TOTAL: 23 SUCCESS`。
- I2-R002 addressed：operation settlement改为显式resolve/reject标志，不再用reason是否defined推断终态。现有input rejection
  case加入`Promise.reject(undefined/null)`，并新增bounds throw `undefined`与Camera throw `null`，锁定原reason、operation清理、
  后续post-render不重复结算。Focused CesiumWidget结果为`TOTAL: 11 SUCCESS`。
- 本轮只修改`packages/widgets/Source/Viewer/Viewer.js`、SceneGIS-owned framing helper及两个既有focused Specs；未扩大
  SGP、ADR或target profile。未重跑build/package/real-Context矩阵、full suite、E2E或manual gate。

## Architecture focused re-review

- Result: `approved`；I2-R001、I2-R002均已关闭，没有新增finding。
- 非planar Viewer继续以`allowPartial=true`读取bounds，`PENDING`与修改前相同地发布scratch center；只有planar Viewer对
  InfoBox camera采用`DONE`门槛，`FAILED`的Entity position仍仅供selection fallback。
- 所有异步输入、bounds与Camera异常入口现在都通过显式reject标志结算，`undefined`和`null`不再与resolve混淆；当前operation、
  listener与后续post-render的exactly-once边界保持成立。
- Architecture只复核修复源码、对应Specs与评审回写，接受Execution报告的`11/11`、`23/23`及静态审计结果，未重复运行
  测试或build。
- 剩余gate仅为项目负责人在`Test/平面环境.html`执行public Viewer Entity/DataSource framing人工验收；通过前不得commit/push或
  进入I3。

## Manual gate

- 项目负责人已在`Test/平面环境.html`验收Entity/DataSource framing中文controls，并明确通过。
- Architecture已创建I2独立本地checkpoint `7e4f574a83`（`实现平面实体与数据源定位`，not pushed）。I2 completed，
  未进入I3；用户提出的示例拆分留待checkpoint后的阶段外临时assignment。
