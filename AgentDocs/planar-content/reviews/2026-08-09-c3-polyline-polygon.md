# Review：C3 平面 Polyline、Polygon 与地表关系

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-09`
- Updated: `2026-08-09`
- Review target: branch `feature/planar-content`相对
  `464ed0fdc3f1e969dd977803678c5b7c842308c4`的完整working-tree diff
- Related plan:
  [C3 phase plan](../plans/2026-08-09-phase-c3-polyline-polygon.md)
- Related ADR:
  [ADR-0015](../../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)
- Related patch: None；C3 SGP=`0`

## Review target

请Architecture Agent评审：

1. Polyline straight/default NONE、absolute/clamp supplied-vertex、solid material、bounds、pick与lifecycle；
2. Polygon outer/direct holes、simple topology、height/extrusion、caps/sides/outline与vertex-only terrain；
3. per-Entity Buffer owner的DOUBLE local geometry、translation model matrix、candidate/current atomicity与
   exactly-once cleanup；
4. real Context大坐标像素、hole、extrusion、original Entity pick、finite depth、warm identity与destroy；
5. C4前explicit-private边界、types/API隐藏和zero-upstream/zero-SGP范围。

## Implementation summary

- 新增两个private visualizer和一个窄private Buffer owner；未增加public API或修改C1/C2 runtime。
- Polyline逐supplied vertex解析absolute/clamp位置；Polygon显式构造cap、outer/hole walls与outline，并保留
  original Entity pick。
- 新增direct unique cases=`17`：Polyline`7`、Polygon`9`、real Context`1`。
- Durable docs只提升已实现的C3规则，并继续声明`viewer.entities`要等C4。

## Validation evidence

- Polyline`7/7`、Polygon`9/9`、real Context`1/1`、C1 resolver regression`11/11`，均Exit 0。
- Real Context覆盖EPSG:3857量级offset、line/fill/hole/extrusion像素、三个original Entity pick fixture、finite
  `pickPosition`、warm owner/render-context identity与primitive/destroy balance。
- `npm run build`、`npm run build-ts`、`npm run build-docs`均Exit 0；build-ts仅有仓库现有
  TSD-JSDoc warnings。
- Scoped ESLint/Prettier、Markdownlint、`git diff --check`和upstream audit均Exit 0。
- Private symbols在engine/Cesium declarations与API HTML命中`0`；generated status=`0`。
- Architecture Agent独立复跑Polyline `7/7`、Polygon `9/9`与real Context `1/1`，均Exit 0。
- Architecture Agent以Cesium真实`PrimitiveCollection`重现：`primitiveAdded`在插入后抛错时，
  candidate已留在collection中但owner把它当作未插入对象销毁；同时以
  `BufferPolylineMaterial.pack/unpack`确认`width=2.5`被静默编码为`2`。
- Architecture Agent以真实`BufferPolylineCollection`确认：collection清洁后，对相同positions/material
  再调用setter会使`_dirtyCount`从`0`变为`1`，随后renderer进入attribute/index buffer copy路径。
- Architecture focused re-review独立复跑Polyline `7/7`、Polygon `9/9`、real Context `1/1`与
  `npm run build`，均Exit 0；scoped ESLint和upstream audit同样Exit 0。

## Ownership audit

- Upstream-owned product/test files: `0`
- C3 SGP: `0`
- `.scenegis/upstream-patches.json`, SGP-0001, SGP-0002: unchanged
- New `SCENEGIS_PATCH` markers: `0`
- Generated files in status: `0`
- Commit: Architecture Agent在本review批准后形成C3本地checkpoint
- Push: none

## Findings

- `C3-R001`（high，fixed）：Candidate insertion rollback不能处理`PrimitiveCollection.add`“先插入、
  后raise event”的真实语义，且owner销毁依赖外部`destroyPrimitives`配置，无法保证Scene membership与
  owned collection exactly-once收敛。
- `C3-R002`（medium，fixed）：`width`/`outlineWidth`允许fractional number，但Buffer material实际用
  `Uint8`存储，导致例如`2.5`静默变为`2`；实现限制与ADR/phase/durable docs也未对齐。
- `C3-R003`（medium，fixed）：相同signature的未变化warm update仍无条件重写positions/triangles/
  material并标脏collection，真实renderer会重复上传GPU buffer；现有warm fixture只证明owner/
  `_renderContext` identity，未证明phase要求的无geometry/GPU churn。

### C3-R001：插入回滚与销毁所有权

`_SceneGISPlanarBufferOwner.insert`只在`scene.primitives.add`正常返回后增加`insertedCount`。Cesium当前
`PrimitiveCollection.add`先修改collection membership，再调用`primitiveAdded.raiseEvent`；listener抛错时，
catch进入`destroy()`，但该collection因`insertedCount===0`仅被直接destroy，仍作为已销毁对象留在
`scene.primitives`。现有Spec用`spyOn(..., "add").and.throwError`在mutation前抛错，未覆盖真实失败点。

修复必须：

- 依据实际membership或等价的逐collection状态回滚，而不是仅依赖正常返回计数；
- 无论`scene.primitives.destroyPrimitives`为true或false，owner都保证自己拥有的collection最终从Scene
  移除并exactly once destroy；
- cleanup失败不得覆盖原始candidate insertion异常，current owner不得被替换；
- 增加一个使用真实`PrimitiveCollection`、在`primitiveAdded`中抛错的聚焦fixture，并验证Scene baseline、
  current owner与destroy计数。无需扩张为事件异常穷举矩阵。

Execution disposition：`SceneGISPlanarBufferOwner.destroy`逐collection检查真实membership；Scene removal后只在
`destroyPrimitives=false`或从未插入时直接destroy，且所有cleanup路径继续收敛。`insert`忽略cleanup异常并
重抛原始insertion异常。Polygon真实`PrimitiveCollection` fixture分别覆盖`destroyPrimitives=true/false`，
`primitiveAdded`与cleanup listener均抛错时Scene保持baseline、current owner不变、两个candidate各destroy
一次。Polygon focused `9/9` Exit 0。

### C3-R002：Buffer线宽必须精确可表示

`BufferPolylineMaterial.pack`通过`DataView.setUint8`存储width。当前visualizer只验证finite且位于
`[0,255]`，fractional value会被无声截断，违反invalid/unsupported input fail-fast与Graphics property
可预测性。C3采用现有Buffer backend，不在本阶段修改上游layout；因此Architecture裁决为：

- Polyline `width`与Polygon `outlineWidth`均只接受integer `[0,255]`；
- `2.5`等fractional value在current mutation前抛`DeveloperError`，`255`作为代表性上界可正常编码；
- 同步更新ADR-0015、phase plan、Architecture/DevelopmentGuide/PlanarContentGuide中的supported profile与
  error wording。

Execution disposition：Polyline `width`和Polygon `outlineWidth`均在preflight要求`Number.isInteger`且位于
`[0,255]`；英文错误信息与ADR/durable docs同步。Existing-owner fixtures证明`2.5`在mutation前抛
`DeveloperError`，代表性`255`精确通过Buffer material。Polyline `7/7`、Polygon `9/9`均Exit 0。

同时修正文档中的两个事实表述：`Architecture.md`的“不沿边插值”应改为“不沿边新增terrain采样或
细分”（几何本身仍在线段/triangle内线性插值）；real Context evidence当前是三个original Entity pick
fixture，不应写成“四类”。无需为文案数字额外增加GPU case。

### C3-R003：未变化warm update不得重复上传Buffer

Polyline `applyState`每帧调用`setPositions`/`setMaterial`，Polygon还调用`setTriangles`；这些setter即使
写入相同值也会把primitive/collection标脏。当前renderer在`_dirtyCount>0`时执行index/attribute array
重建与`copyAttributeFromRange`，所以第二个静态normal frame存在可避免的CPU/GPU churn。

修复应在SceneGIS private visualizer/owner内保存足够的last-applied state，并在完整preflight后只写入
实际变化的geometry/style/bounds/show；terrain或Property结果真实变化仍须在该normal update生效。
聚焦证据至少证明首次render清洁后：未变化update保持各collection `_dirtyCount===0`，再次render保持
DrawCommand/vertex-array identity且没有新增buffer-copy调用；一个代表性动态变化仍能标脏并更新。
不要求C3增加批量性能矩阵或跨Entity batching。

Execution disposition：两个visualizer保存last-applied geometry/material key/bounds，只在值变化时调用
Buffer setter；shared owner的`setShow`也先比较当前值。Real Context fixture在首次render后证明四个collection
静态update的`_dirtyCount===0`，第二次render保持DrawCommand/VertexArray identity且
`copyAttributeFromRange`/`copyIndexFromRange`为0；随后同topology Polyline position变化在normal update
标脏、更新local position并触发attribute buffer copy。Real Context `1/1` Exit 0。

## Remaining risks

- Buffer collections是experimental/private升级面；C5前没有跨Entity batching或批量性能结论。
- Vertex-only terrain drape不保证长边/大三角形连续贴地；simple topology validation不是穷举几何证明。
- Real Context是一个代表性fixture，不是跨硬件/全属性GPU矩阵。
- C4前没有automatic Entity/DataSource/Viewer integration。

## Review result

Approved。Architecture focused re-review确认C3-R001～C3-R003全部关闭；C3实现、Specs、ADR、durable
docs与AgentDocs可以形成独立本地checkpoint。阶段完成后才开始C4源码审计和phase planning。Ownership
边界为upstream-owned files=`0`、C3 SGP=`0`，未push。
