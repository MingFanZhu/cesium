# Review: C9 Continuous Ground and Ground Primitive

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-10`
- Review target: branch `feature/planar-content`, complete working-tree diff after
  `884831a2641e370d1b104a7cf2bd7e5ca14a1fbc`
- Related plan:
  [C9 continuous ground and Ground Primitive](../plans/2026-08-10-phase-c9-continuous-ground-and-ground-primitive.md)
- Related decision:
  [ADR-0021](../../../Documentation/SceneGIS/Decisions/ADR-0021-planar-continuous-ground-and-ground-primitive.md)

## Scope

Review the public `SceneGISPlanarGroundPrimitive`, private actual-cover draper, lazy World/Surface late-registration
protocol, automatic Polyline/Polygon/Ellipse/Rectangle/Corridor ground migration, focused real-Context depth/pick
evidence, public/private generation boundary and zero-upstream ownership audit.

Out of scope are classification, ordered ground layers, zIndex, arbitrary Material, Shader/Worker changes,
terrain LOD/request/cache changes, Sandcastle/E2E/package delivery and C10.

## Implementation summary

- Added a same-kind public Ground Primitive over the existing public planar Polyline/Polygon Geometry descriptors.
  It validates a live planar world and ground-relative references, keeps candidate/current state atomic, uses one
  logical `GeometryInstance`, and submits only the successful current standard Primitive in pick/depth passes.
- Added an actual-cover draper. Polyline segments are clipped at surface-triangle boundaries; polygon source
  triangles are clipped against surface triangles with hole-aware caps, mixed-reference extrusion sides and skirt
  exclusion. Disconnected cover pieces retain separate index ranges.
- Added lazy, independent ground-render snapshots to Surface and a per-pass registration queue to World. Normal
  render executes Surface first and registered Ground Primitives second; queue cleanup is protected by `finally`.
- Migrated the approved Entity ground branches while keeping ordinary `NONE` content on the existing fast path.

## Review targets

- Public constructor/property/appearance/same-kind/attribute/context/candidate-current/pick/bounds/lifecycle contract.
- Actual Float32 terrain triangles, shared-edge ownership, holes, mixed top/bottom references, skirt exclusion and
  disconnected coverage.
- Same-pass snapshot publication, queue cleanup, hidden/no-cover/provider invalidation and zero mutation of terrain
  selection/request/readiness/query state.
- Entity adapter original id, per-DataSource target, dynamic reference convergence and ordinary zero-ground path.
- Real Context peak-between-input-vertices, pixel/pick/pickPosition, representative linear/log-depth, warm identity
  and cleanup evidence.
- Root/types/API visibility, private draper hiding, generated status and zero-upstream/zero-SGP boundary.

## Findings

| ID | Severity | Status | Owner role | Location | Finding | Required disposition / evidence |
| --- | --- | --- | --- | --- | --- | --- |
| C9-R001 | high | fixed | execution | `_SceneGISPlanarGroundDraper.js` `getSurfaceTriangles` / `drapePolyline` / `drapePolygon` | 每次 candidate 会先把全部 visible terrain triangles 展开为数组和 `Cartesian3`，随后让每条 source segment/source triangle 扫描全部 surface triangles；signature 又包含完整 visible tile set，因此与对象不相交的 tile 变化也会触发全量重建。这是公开 257×257 heightmap 的常规路径，不是极端输入。Architecture 的只读代表性诊断中，一个 257×257 tile、单条横跨 line 即展开 `131072` 个 surface triangles，单次约 `57.69 ms` 并增加约 `69.97 MiB` Node heap。 | 在不引入 Worker/上游修改的前提下改为有空间边界的遍历：至少先按 geometry/tile XY bounds 排除 entry，并利用现有 regular-grid `width`/`height` 定位相交 cell，或提供等价的 streaming/broad-phase，禁止为不相交三角形创建对象。Ground current signature 只纳入影响该 geometry 的 actual-cover entries。增加一个 257×257 deterministic focused fixture，以 visited/generated 计数或等价结构证据证明小范围对象不会扫描/分配整瓦片；不设置脆弱的墙钟阈值。 |
| C9-R002 | high | fixed | execution | `_SceneGISPlanarGroundDraper.js` `clipPolygon` / `drapePolygon` / `makeTriangleGeometry`；`SceneGISPlanarGroundPrimitive.js` polygon preflight | Polygon clipping 没有清除重复/共线点、零面积 fan 或 shared-edge duplicate cap，也只在 side endpoint 检查 derived bottom <= top。只读复现中，一个与 flat tile 同范围的普通 square 生成 `6` 个 triangles，其中 `4` 个零面积、`2` 个重复；另一个合法 source boundary、内部 terrain peak 的 mixed-reference extrusion 静默生成 bottom Z=`9`、top Z=`5`。此外 public Polygon Geometry 允许 bottom XY 与 top XY 不同，而 draper 却按 top footprint 查询 bottom plane并强制 side XY 使用 top，当前语义不成立。 | 规范化 clipped rings，丢弃零面积 piece，并以确定性 half-open ownership或精确 dedupe保证 shared tile/triangle edge只产生一份 cap/side。对每个配对 derived cap/side vertex执行有限性及 bottom <= top 原子检查。Ground Primitive 必须要么正确处理现有 bottom XY 语义，要么在 public JSDoc 中明确并于任何 current/resource mutation 前拒绝 bottom XY 不匹配；不得静默改变已有 Geometry。补 shared edge/corner、interior inversion、bottom XY contract、hole/extrusion atomicity Specs。 |
| C9-R003 | high | fixed | execution | `_SceneGISPlanarPolygonVisualizer.js`、`_SceneGISPlanarAreaVisualizer.js`、`_SceneGISPlanarRouteVisualizer.js` vertical outline lowering | Ground extrusion 的 vertical outline 没有使用同一次 late snapshot 得到的实际 top/bottom端点。mixed references 被降为普通 `NONE` line，因而仍停留在 source Z；相同 `CLAMP_TO_GROUND` 则把同 XY 的两个端点都压到同一 surface Z，当前 draper随后构造零长度 Polyline并抛出 `DeveloperError`。这会让合法的 Entity outline 错位或使 normal render失败。 | 让 vertical outline 在同一 actual-cover snapshot 下分别求 top/bottom reference并连接实际端点；若最终端点相同则确定性省略零长 piece。实现可使用最小 private seam/helper，但不得扩大 public API 或建立第二套 terrain lifecycle。补相同 CLAMP、mixed NONE/CLAMP/RELATIVE、terrain revision与 original Entity pick 的 focused evidence，并在代表性 real Context extrusion 中闭环。 |
| C9-R004 | medium | fixed | execution | 四个 affected visualizer 的 `createOwner` / `applyState` / `getBoundingSphere` | Entity/DataSource bounding sphere仍是 source-height sphere。Polyline/Polygon直接缓存 `computeState` 的 source bounds；Area/Route只在 owner创建时调用尚未 ready 的 Ground Primitive，因此缓存的是 source fallback。Ground candidate随后随 terrain LOD/revision改变时，reported sphere不会更新，且未 ready ground content被错误报告为 `DONE`。 | `getBoundingSphere` 必须基于 last-successful ready ground current聚合实际 bounds；current尚未建立时返回 `PENDING`，hidden/无 owner按既有契约返回 `FAILED`。普通 non-ground owner行为保持不变。补 first promotion与terrain revision后 sphere Z/radius更新、mixed fill/outline union和 warm identity evidence。 |
| C9-R005 | high | fixed | execution | `SceneGISPlanarWorld._registerGroundPrimitive` / `render`；`SceneGISPlanarGroundPrimitive._updateGround` non-render branch | same-pass registration没有验证传入 `frameState`，因此无法证明 wrapper属于当前 Scene/World frame；现有 World Spec甚至使用不同空对象注册和render。另一方面 provider replacement/detach会清空 Surface commands/snapshot，但 pick/depth分支仍无条件提交旧 ground current，导致 surface不再存在时仍可被拾取/写深度；normal no-cover也存在同样不一致。 | World记录并校验与其 lifecycle绑定的 reusable `frameState` identity，拒绝跨 Scene/World registration，同时保留合法 main/pick/depth pass。Ground current记录其有效 surface generation/signature；non-render pass仅在 current仍匹配有效 last-normal snapshot时重提，provider lifecycle、zero-buffer/no-cover/hidden失效后必须抑制旧 current，直到新的 normal promotion成功。补 wrong-frame/world、provider replace/detach-before-pick、zero/no-cover和 queue cleanup Specs。 |
| C9-R006 | medium | fixed | execution | `SceneGISPlanarGroundPrimitive.js` `cloneAttributes` / Ground Primitive Spec | Public Ground Primitive没有完整继承C6 attribute contract：`null` attribute会产生原生 `TypeError`，非 boolean `normalize`被接受；现有3-case suite也没有覆盖 same-kind replacement/candidate failure与上述 public preflight。 | 复用或对齐 `SceneGISPlanarPrimitive` 的完整 CPU validation：attribute必须是对象、`normalize`必须是 boolean、DataView/typed value与integer/Float representability一致，并在任何 Context/GPU mutation前抛 `DeveloperError`。增加最小参数化 Spec，并补同-kind geometry/appearance candidate failure保留 current/attributes/bounds 的 focused evidence。 |

以上 finding 均可在 C9 已批准的 SceneGIS-owned 路径内修复；不批准新增 upstream-owned file、SGP、Shader、Worker
或进入 C10。

### Execution dispositions

- **C9-R001 fixed:** `SceneGISPlanarGroundDraper` now rejects nonintersecting cover entries by XY bounds and streams
  only the regular-grid cells overlapped by the source bounds. Ground signatures contain only relevant entries. The
  `257 x 257` focused fixture reports one relevant entry and fewer than 100 visited triangles instead of materializing
  the full 131072-triangle tile; Draper focused suite `8/8`, Exit `0`.
- **C9-R002 fixed:** clipped rings remove duplicate/collinear points, zero-area cap triangles are rejected, exact cap
  keys and side intervals enforce deterministic shared-edge ownership, and every derived top/bottom pair is checked
  for finite values and `bottom <= top`. Ground Polygon preflight now requires corresponding bottom/top XY and the
  public JSDoc states this restriction. Draper and GroundPrimitive focused suites cover normalized caps, holes,
  inversion, and bottom-XY atomic failure (`8/8` and `3/3`, Exit `0`).
- **C9-R003 fixed:** Polygon, Area, and Corridor vertical outlines pass private per-endpoint height references into the
  same Ground Primitive snapshot; equal derived endpoints are omitted, and identical source endpoints are not
  constructed. Focused Draper evidence covers equal `CLAMP` and mixed `NONE`/`CLAMP`; Polygon verifies the mixed
  vertical seam and the Surface real-Context terrain polygon/extrusion closure passes (`30/30` aggregate).
- **C9-R004 fixed:** the shared private ground-bounds aggregator returns `PENDING` until every visible Ground Primitive
  has a valid current and unions last-successful actual bounds thereafter. Polyline focused evidence verifies first
  pending state, revised Z/radius, warm owner identity, and hidden `FAILED`; all four affected visualizer suites pass.
- **C9-R005 fixed:** World registration accepts only the reusable `frameState` bound by `world.update` and the same
  world. Ground current replay compares its relevant actual-cover generation/signature and is suppressed after
  replacement, detach, hidden, zero/no-cover, or revision mismatch until normal promotion. World `20/20`,
  GroundPrimitive `3/3`, and Surface/Shader aggregate `30/30` pass.
- **C9-R006 fixed:** Ground Primitive attributes now use the C6 object/boolean/value-shape/typed representability
  preflight. Same-kind candidate failure preserves current identity, attributes, and bounds; malformed attributes and
  polygon footprint failures occur before Scene/Context mutation. GroundPrimitive focused suite `3/3`, Exit `0`.

### Execution focused revalidation

- Focused serial Specs: Draper `8/8`, GroundPrimitive `3/3`, World `20/20`, Surface/Shader aggregate `30/30`,
  Polyline `7/7`, Polygon `7/7`, Area `6/6`, Route `6/6`; all Exit `0`.
- `npm run build`, `npm run build-ts`, `npm run build-docs`, and `npm run tsc`: Exit `0`. `build-ts` emitted only the
  previously recorded upstream TSD-JSDoc warnings.
- Changed-scope ESLint, JS/Markdown Prettier, Markdownlint, and `git diff --check`: Exit `0`. The diff check emitted
  only the repository's existing LF-to-CRLF checkout warnings.
- `node scripts/scenegis/audit-upstream-patches.mjs`: Exit `0`; current-delivery upstream-owned entries=`0`,
  generated status=`0`. Root JS/types/API expose `SceneGISPlanarGroundPrimitive`; private Draper/ground-bounds roles
  have zero declaration/API hits.
- One discarded parallel gulp attempt hit Windows `EPERM` while competing for the shared Build directory. All
  submitted test evidence above was rerun serially and passed.

## Validation submitted

- GroundDraper `5/5`; GroundPrimitive `3/3`; World `20/20`; Surface/Shader aggregate `30/30`.
- Affected adapters: Polyline `6/6`, Polygon `7/7`, Area `6/6`, Route `6/6`; real Context Geometry `1/1`.
- C9 direct new cases=`11`; focused aggregate counts are reported separately and are not summed as direct unique.
- `npm run build`, `build-ts`, `build-docs`, `tsc`: Exit `0`; generation emitted only known upstream TSD-JSDoc
  warnings.
- Scoped ESLint/Prettier, Markdown Prettier/Markdownlint, `git diff --check` and official upstream audit: Exit `0`.
- Generated root JS/types/API contain `SceneGISPlanarGroundPrimitive`; private draper declaration/API hits=`0`;
  generated files are absent from status.

## Ownership audit

- Implementation base: `884831a2641e370d1b104a7cf2bd7e5ca14a1fbc`.
- Upstream-owned files changed: `0`.
- C9 SGP: `0`; manifest and SGP-0001/0002 hunks unchanged.
- New `SCENEGIS_PATCH` markers: `0`; generated files are absent from status.

## Remaining risks

- Ground candidate creation remains synchronous normal-render CPU work; C9 intentionally adds no Worker or public
  budget.
- Standard Primitive plus derived `LESS_OR_EQUAL` passed representative linear/log-depth real-Context fixtures;
  broader GPU/driver visual qualification remains a delivery concern.
- Classification, ordered overlapping ground layers, arbitrary materials and continuous-ground Path/Wall/
  PolylineVolume remain unsupported.

## Architecture diagnostics

- 代码审计确认 terrain mesh 已提供 regular-grid `width`/`height`，因此 C9-R001 可以在当前 private draper
  内做 bounded cell traversal，不需要改变 terrain runtime。
- 四个只读、无文件写入的 CPU 复现分别确认：257×257 全瓦片展开成本、flat square duplicate/zero-area caps、
  interior mixed-reference bottom-over-top，以及同 XY `CLAMP_TO_GROUND` vertical line 的零长 Polyline异常。
- Submitted real-Context C9增量只直接覆盖 terrain ground polyline；既有 `SceneGISPlanarGeometry 1/1` 是普通
  C3 regression，不能替代 C9 polygon/hole/extrusion ground closure。R002/R003修复后只需增加一个代表性 polygon/
  extrusion real-Context case，不要求扩大为全库或多GPU矩阵。

## Requested decision

Architecture focused re-review approves C9. C9-R001 through C9-R006 are closed by the recorded implementation,
focused evidence, and Architecture's independent representative reruns. C9 may be marked `completed` and committed
as its own local checkpoint; C10 remains a separate phase.

## Architecture focused re-review

- Confirmed the bounded regular-grid traversal and relevant-entry signature path; the 257 x 257 fixture no longer
  materializes or scans the full tile.
- Confirmed polygon normalization, footprint preflight, per-endpoint vertical references, current-ground bounds,
  frame-state registration, stale replay suppression, and C6-compatible attribute validation in source and Specs.
- Independent representative reruns passed: GroundDraper plus GroundPrimitive `11/11`, Polygon Visualizer `7/7`,
  Surface/Shader `30/30`, and World plus planar Widget `21/21`.
- No upstream-owned file, SGP, Shader, Worker, generated-file, or C10 scope was introduced. Remaining risks stay
  within the explicitly accepted C9 boundaries above.
