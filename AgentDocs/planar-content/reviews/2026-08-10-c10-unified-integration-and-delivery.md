# Review: C10 Unified Integration and Delivery

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-10`
- Updated: `2026-08-10`
- Review target: complete `feature/planar-content` working-tree diff after base
  `ef2df22e1957ddae6e8ec9bbca3f5623f0370d02`
- Related plan:
  [C10 unified integration and delivery](../plans/2026-08-10-phase-c10-unified-integration-and-delivery.md)
- Related decision:
  [ADR-0022](../../../Documentation/SceneGIS/Decisions/ADR-0022-planar-content-compatibility-and-delivery.md)

## Scope

- Review the Cesium `1.144` / upstream `6d5d8b1f...` compatibility matrix for exact public inventory, 16 automatic
  Graphics, height/continuous-ground semantics and unsupported boundaries.
- Review the existing qualification, unique content E2E, unique content Sandcastle and installed-package smoke updates;
  no second delivery entry was created.
- Confirm product runtime delta=`0`, upstream-owned files=`0`, C10 SGP=`0`, generated status=`0` and unchanged
  SGP-0001/0002 integration seams.

## Summary

C10 consolidates C1-C9 without product runtime changes. The existing qualification now adds a deterministic local-terrain
closure for all eight child roles, automatic ground and direct ordinary/Ground Primitive while retaining the moderate
profile. The single dev/release E2E covers all 16 Graphics with network attempts blocked. Sandcastle exposes the same
inventory for best-effort manual inspection, and package smoke validates 24 engine plus 2 widget public entries while
preserving the documented soft-private boundary.

Direct new `it` cases=`1`; qualification aggregate=`4/4`, affected engine focused aggregate=`46`, widgets Viewer
aggregate=`2/2`, and the expanded E2E remains one case per dev/release bundle. These aggregate counts overlap product
paths and are not presented as direct unique totals.

## Findings

| ID       | Severity | Status | Finding                                                                                                                                      |
| -------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| C10-R001 | medium   | fixed  | Durable architecture/development rules still state superseded vertex-only ground and an incomplete callback order.                           |
| C10-R002 | high     | fixed  | The claimed actual-ground render closure does not bind the rendered pick/depth result to the automatic or direct Ground Primitive.           |
| C10-R003 | medium   | fixed  | The E2E creates all eight child roles but exercises original-Entity GPU picking and Viewer selection only for the Anchor/Point role.         |
| C10-R004 | medium   | fixed  | Package smoke checks that the 24+2 expected names exist, but does not reject an unexpected additional non-underscore SceneGIS public export. |

### C10-R001: durable rules conflict with the final compatibility matrix

`Documentation/SceneGIS/DevelopmentGuide.md` still instructs Polyline clamp to resolve only supplied vertices, calls
Polygon terrain drape vertex-only, says Ellipse/Rectangle read terrain only at generated vertices, and presents a
six-child callback order. `Architecture.md` retains the same C3/C7 statements in present tense. Later C9/C10 paragraphs
say those paths moved to actual-cover continuous ground and gate plus eight children, so two normative sections now give
opposite implementation guidance.

Update the durable rules so the old C3/C7 behavior is explicitly historical/superseded and the current contract is
unambiguous: ordinary `NONE` retains source geometry; approved ground branches use C9 actual-cover; callback order is
gate, Anchor, Model, Polyline, Polygon, Solid, Area, Route, Path. Preserve the versioned matrix as the detailed product
index rather than duplicating every row.

**Execution disposition (`fixed`)**：`Architecture.md`与`DevelopmentGuide.md`已把C3 supplied-vertex和C7
generated-vertex ground行为明确标为被C9 supersede的历史语义；当前ordinary `NONE`保留source geometry，批准的
ground分支统一使用actual-cover。两处均记录完整callback顺序gate、Anchor、Model、Polyline、Polygon、Solid、
Area、Route、Path，并继续以Compatibility matrix作为详细索引。相关Markdown checks通过。

### C10-R002: ground closure can pass without proving rendered ground

The qualification currently asserts only `bounds.center.z > 0` and that `scene.pick`/`pickPosition` are defined. The E2E
`terrainClosure` compares `world.pickTerrainFromWindowPosition().z` to `world.getTerrainHeight()`, which validates two
terrain query APIs against each other; it never compares `depthPick.z`, and it never proves `scene.pick(...).id` is the
automatic Ground Entity or the direct Ground Primitive. The test could therefore pass while the terrain surface alone
produces the pick/depth result.

At one deterministic local-terrain point between source vertices, assert the rendered Ground object pick identity and
finite `scene.pickPosition` XYZ/Z against the expected actual terrain height within the existing pixel/depth tolerance.
Use either the automatic ground Entity or direct Ground Primitive, and keep the fixture narrow. Also align the phase and
review wording with the evidence actually asserted.

**Execution disposition (`fixed`)**：Qualification在direct Ground line内部点断言`scene.pick(...).id ===
"direct-ground"`，并将finite `pickPosition` XYZ与同一点actual terrain height以`2.0`容差闭环；focused suite
`4/4`通过。唯一E2E另使用中心local peak上的direct Ground Polygon，断言pick id=`e2e-direct-ground`、depth
XYZ finite且与`(0, 0, 100)`在`2.0`内一致；dev/release各`1/1`通过。

### C10-R003: E2E selection covers only one of eight child roles

The E2E verifies item counts for all eight child roles, but the only real GPU pick and Viewer click is `e2e-point` from
the Anchor role. This does not satisfy the approved phase requirement that each child role have one representative
original Entity selection closure.

Add one non-overlapping representative pick per child role (eight total, not all 16 Graphics), assert the picked id is
the original Entity, and exercise Viewer selection for representative roles as practical. Reuse the existing single E2E
case and local fixture; do not create a pixel matrix or another E2E file.

**Execution disposition (`fixed`)**：唯一E2E将Anchor Point、Model、Polyline、Polygon、Solid Box、Area Plane、
Route Wall与Path放在非重叠代表位置。每个role先通过真实`scene.pick`取得original Entity，再对命中的实际像素执行
Viewer click并逐项断言`viewer.selectedEntity`相同；没有新增E2E文件或16类pixel矩阵。Dev/release各`1/1`通过。

### C10-R004: the package inventory is positive-only

`verify-planar-packages.mjs` iterates the expected public names and validates their shapes, but an accidental additional
non-underscore `SceneGIS*` export would not fail. That makes the documented inventory count descriptive rather than the
claimed exact release boundary.

For installed `@cesium/engine`, `@cesium/widgets`, and root `cesium`, compare the sorted non-underscore `SceneGIS*`
export sets against the expected 24, 2, and union 26 names respectively. Continue treating underscore exports as
soft-private build artifacts and retain the callable/namespace distinction.

**Execution disposition (`fixed`)**：repo外installed consumer现在筛选非下划线`SceneGIS*` exports，并对
`@cesium/engine`、`@cesium/widgets`、root `cesium`分别与排序后的24、2、26项集合做`deepEqual`；CJS root也精确
断言26项。Callable/namespace、underscore soft-private、declaration/API、tar和broken-entry断言均保留；package
smoke Exit 0。

## Validation reviewed

- Qualification `4/4`; affected engine focused aggregate `42` plus qualification `4`; widgets Viewer `2/2`.
- `npm run build`, `build-release`, `build-ts`, `build-docs` and `tsc`: Exit 0. `build-ts` retained only existing broad
  TSD-JSDoc warnings.
- Installed-package smoke: Exit 0 for bare ESM/CJS, 24+2 public inventory, declarations/API soft-private boundary and
  broken-entry failure fixture.
- Content E2E: equivalent local static dev and release runs each `1/1`, public network attempts=`0`. The standard runner
  could not bind its expected port because an existing user process owned `8081`; that process was preserved.
- No-embedding Sandcastle and gallery discovery: Exit 0; gallery processed `307` examples.
- Scoped ESLint/Prettier/Markdownlint, `git diff --check` and official upstream audit: Exit 0 after final handoff update.
- Architecture independently reran the qualification (`4/4`) and installed-package smoke (Exit 0)。Focused re-review
  确认durable rules、direct Ground pick/depth closure、八个child role的GPU pick/Viewer selection，以及installed
  package exact export-set断言均已落到对应源码与测试。
- Execution focused fix：qualification `4/4`、local dev E2E `1/1`、local release E2E `1/1`、installed-package
  smoke Exit 0；Architecture没有占用或终止用户持有的`8081`进程，接受等价local dev/release E2E证据，并独立完成
  changed-scope Markdownlint、`git diff --check`与official upstream audit。C10-R001至C10-R004全部关闭。

## Ownership audit

- Upstream-owned files changed: `0`
- C10 SGP: `0`
- Manifest/SGP-0001/SGP-0002 changes: `0`
- New `SCENEGIS_PATCH` markers: `0`
- Generated files in status: `0`
- Product runtime source changes: `0`

## Non-blocking risks

- The user-owned process on port `8081` was correctly preserved; the equivalent local dev/release runs are acceptable
  for this review round and do not need another port/process matrix.
- C10 timing remains diagnostic. The recorded Chrome/viewport/protocol without persisted batch numbers does not block a
  zero-runtime-delta delivery and must not trigger extra performance work.
- Public OSM/LERC availability and real GPU/driver presentation remain the project-owner manual gate, not automated facts.

## Conclusion

Architecture/code/release-evidence review=`approved`；C10-R001至C10-R004全部关闭，没有新的review阻断项。
项目负责人随后决定不把C9 actual-mesh ground后端作为最终架构，并将真实浏览器/GPU人工验收转移到后续C11
planar depth/stencil替换实现。旧页面没有被宣称人工验收通过；C10仅作为自动化交付baseline标记`completed`并形成
独立提交，extension继续`active`。
