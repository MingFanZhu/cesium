# Review：C4 Entity、DataSource 与 Viewer 集成

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-09`
- Updated: `2026-08-09`
- Review target: branch `feature/planar-content`相对
  `417396f037026157752d4f7b50e6872913af9592`的完整working-tree diff
- Related plan:
  [C4 phase plan](../plans/2026-08-09-phase-c4-entity-datasource-viewer-integration.md)
- Related ADR:
  [ADR-0016](../../../Documentation/SceneGIS/Decisions/ADR-0016-planar-datasource-display-integration.md)
- Related patch: active `SGP-0001`

## Review target

请Architecture Agent评审：

1. private factory/gate的instance isolation、deferred activation、allowlist、recovery与atomic rollback；
2. Model/Polyline/Polygon/Buffer owner的optional per-DataSource primitive target和exactly-once cleanup；
3. `CesiumWidget.js`仅两个paired `SGP-0001` hunks，默认Globe/`globe:false`/non-planar callback不变；
4. Widget/Viewer automatic Entity、CustomDataSource ordering/removal、original Entity selection与bounds lifecycle；
5. public API delta=0、private declarations/API隐藏、generated与ownership审计。

## Implementation summary

- 新增一个private factory/gate；合法首次update原子追加Anchor、Model、Polyline、Polygon，动态非法profile在
  child normal update和低层资源mutation前失败；同步collection listener可更新CPU tracking。
- 三类primitive visualizer支持caller-owned target，自动path使用`dataSource._primitives`，显式path继续默认
  `scene.primitives`。
- C4 direct unique cases=`18`：gate`8`、Widget`4`、Viewer`2`、optional target`3`、Model post-insertion rollback`1`。
- Durable docs已提升automatic CustomDataSource path、metadata入口、ownership与upgrade规则。

## Validation evidence

- 新增suite：gate`8/8`、Widget`4/4`、Viewer`2/2`，Exit 0。
- C2/C3 focused：Anchor`11/11`、Model`11/11`、Polyline`8/8`、Polygon`10/10`、real Context geometry`1/1`。
- P1/P6与上游回归：World Widget`16/16`、Planar Viewer`18/18`、CesiumWidget`75/75`、Viewer`59/59`。
- Build、build-ts、build-docs、tsc、scoped lint/format、Markdownlint、diff check与upstream audit均Exit 0；
  build-ts仅有仓库现有TSD-JSDoc warnings。
- Private factory/gate与patch marker在generated declarations/API HTML命中`0`；generated status=`0`。
- Architecture Agent独立复跑callback `8/8`、engine Widget `4/4`、widgets Viewer `2/2`，均Exit 0；
  scoped ESLint、official upstream audit与`git diff --check`同样Exit 0。
- Architecture Agent以live `SceneGISPlanarWorld`绑定五个lifecycle方法为own functions，复现
  `world.isDestroyed()===false`但factory返回`undefined`；说明当前`wasDestroyed`启发式误判live实例。
- Architecture Agent以同时包含Point与Box的动态Entity复现：Entity加入后Anchor `_items`已经变化，下一次
  gate update才抛错；因此现有“先于child mutation”文案与测试名称强于实际实现。
- Execution focused fixes：callback`8/8`、P6 Viewer`18/18`、engine Widget`4/4`、Model`11/11`、
  Polyline`8/8`、Polygon`10/10`、widgets Viewer`2/2`与`npm run build`均Exit 0。

## Upstream hunks and ownership

- Upstream-owned product files: `1`，仅`packages/engine/Source/Widget/CesiumWidget.js`。
- `SGP-0001`: active/high；新增factory import与DataSourceDisplay option两个paired hunks，manifest追加三个C4
  Spec paths。
- `Scene.js`、`Viewer.js`、`SGP-0002`: unchanged；new SGP=`0`；其他product/test paths均SceneGIS-owned。
- Commit/push: none。

## Findings

- `C4-R001`（high，fixed）：Factory通过own lifecycle methods猜测`destroyObject`终态，会把合法live World
  误判为destroyed，并把产品行为绑定到销毁器内部实现和旧Spec的调用次数。
- `C4-R002`（medium，fixed）：Gate只能保证先于child normal update；已激活child的同步
  `collectionChanged` listener会先修改内部追踪状态，durable docs与Widget test却宣称先于所有child
  mutation。
- `C4-R003`（medium，fixed）：当前automatic/target integration evidence只真实渲染Point；空
  CustomDataSource与constructor identity assertion没有证明Polyline/Polygon collection进入
  `dataSource._primitives`，也没有执行phase要求的DataSource move ordering。
- `C4-R004`（medium，fixed）：名为“third-child constructor failure”的fixture实际在第二个Model
  constructor就失败，未证明两个已构造candidate在第三个constructor失败时反向清理。

### C4-R001：Liveness必须使用World契约而不是destroyObject形状

`_SceneGISPlanarVisualizersCallback.js`的`wasDestroyed`把同时拥有own `update`、`beginFrame`、`render`、
`endFrame`和`destroy`函数解释为destroyed。`destroyObject`当前确实会生成这些own methods，但live subclass、
instrumentation或简单的`bind`也会形成完全相同的shape。Architecture已用一个live World绑定五个方法复现：
`isDestroyed()`仍为false，factory却返回undefined并静默退回Globe-oriented default visualizers。

修复必须：

- 删除基于own method shape的终态推断，使用`SceneGISPlanarWorld#isDestroyed`这一正式lifecycle contract；
- P6“controller constructor sees a dead world”fixture应按新增的合法liveness check调整观察点，不能让产品代码
  为维持硬编码调用次数而绕开契约；
- 增加一个live World绑定/覆盖lifecycle methods仍获得planar callback的focused assertion，并保留真实
  destroyed World返回undefined；
- 不为此新增World private flag、public API或其他upstream hunk。

Execution disposition：删除`wasDestroyed` shape heuristic，factory直接调用
`SceneGISPlanarWorld#isDestroyed()`。Callback Spec绑定live World的五个lifecycle方法仍获得callback，并验证真实
destroyed返回`undefined`；P6 Viewer fixture把controller-death观察移到第三次合法liveness call。Callback
`8/8`、P6 Viewer`18/18`，Exit 0。

### C4-R002：动态profile的保证应精确到child update/resource mutation

Gate只在`DataSourceDisplay.update`中运行。四个child激活后已经订阅`EntityCollection.collectionChanged`；
新增同时带Point和Box的Entity时，Anchor listener会立即把Entity加入`_items`，随后下一帧gate才拒绝。现有
Architecture、PlanarContentGuide及Widget Spec名称写成“before child mutation”，与事实不符。

ADR-0016批准的稳定边界是“任何child normal update之前失败”，不要求为此建立同步EntityCollection事务。
本轮裁决采用较窄且可兑现的表述：

- durable docs、phase/review summary和Spec名称统一为“before child normal update and low-level resource
  mutation”，不得继续宣称零内部tracking mutation；
- 扩展动态fixture为Point+Box或等价mixed profile，证明四个child `update`均未调用，Point/Billboard/Label
  slot、Model/Buffer primitive等低层资源未创建；允许collection listener只更新CPU tracking；
- 若Execution选择实现真正的同步preflight listener，必须先证明listener ordering、Entity add失败后的
  collection状态与destroy ownership；本finding不要求扩大到该方案。

Execution disposition：Architecture、DevelopmentGuide、PlanarContentGuide、phase/review与Spec名称均收窄为
“before child normal update and low-level resource mutation”。Real Widget mixed Point+Box fixture证明四个child
`update`均未调用，Anchor只发生CPU tracking且Point/Billboard/Label slot仍为空，Model/Polyline/Polygon没有item，
per-DataSource低层primitive数量保持baseline；Widget`4/4`，Exit 0。

### C4-R003：Automatic target与DataSource ordering证据必须实际产生内容

`SceneGISPlanarContentCesiumWidgetSpec`当前只让default source的Point进入normal render。CustomDataSource
case没有Entity，只比较三个visualizer的`_primitives`字段；Polyline/Polygon focused新增case同样只构造并
比较target identity。它们无法捕获`createOwner`仍误用`scene.primitives`、collection插入/销毁错误或
DataSource move时内容未随container移动。

最小修复证据无需增加大矩阵：

- 在一个现有real Widget/CustomDataSource fixture中实际加入代表性Billboard/Label、Polyline和Polygon，
  第二次display update后证明相应slot/owner存在，Buffer collections属于`dataSource._primitives`而非
  `scene.primitives`；Point既有pixel/pick与Model真实target rollback unit可以继续作为各自证据；
- 使用两个CustomDataSource执行一次代表性raise/lower或等价move，证明外层per-data-source container顺序
  改变且内部owner identity/content不变；remove后owned resources exactly once释放；
- 不要求为六类graphics分别增加像素case，也不扩大到C5批量或性能测试。

Execution disposition：既有real Widget/CustomDataSource case实际创建Billboard、Label、Polyline和Polygon；第二次
display update后slot与两个Buffer owner均存在，owner collections只属于`dataSource._primitives`。两个
CustomDataSource执行`raise`后外层container顺序反转，内部owner identity/content不变；remove时五个visualizer
各destroy一次，两个owner释放且第二个DataSource也正常移除。Widget`4/4`、Model`11/11`、Polyline`8/8`、
Polygon`10/10`、widgets Viewer`2/2`，Exit 0。

### C4-R004：第三个constructor rollback fixture没有进入第三个constructor

Callback Spec中的结构target只提供`add`与`removeAndDestroy`。Model constructor对显式target还要求
`remove`和`contains`，所以该fixture在第二个child（Model）立即失败，与test name和phase evidence不符；
两个已成功构造candidate的反向cleanup从未执行。

修复应以现有EntityCollection Event或等价local fixture在第三个child constructor开始时抛出原始异常，
并证明：Anchor与Model两个candidate均destroy一次、listener回到baseline、共享visualizer数组仍只有gate、
原始异常未被cleanup覆盖，纠正条件后仍能激活。不得仅重命名现有case后继续宣称third-child coverage，也
无需增加constructor failure穷举矩阵。

Execution disposition：fixture现在让第三个Polyline constructor注册`collectionChanged` listener时抛出同一
Error instance；Anchor与Model candidate各destroy一次，listener回baseline，shared array仍只有gate。关闭故障后
同一gate成功激活四个children并最终清理回baseline；Callback`8/8`，Exit 0。

## Remaining risks

- C5前没有批量Entity性能、Sandcastle或交付资格结论。
- 非Custom DataSource、enabled clustering和未批准graphics仍为显式unsupported。
- CesiumWidget/DataSourceDisplay构造与destroy ordering、experimental Buffer collections和Model lifecycle是升级
  敏感面。

## Review result

Approved。Architecture focused re-review确认C4-R001～C4-R004全部关闭；独立复跑callback`8/8`、engine
Widget`4/4`与P6 Viewer`18/18`，scoped ESLint、official upstream audit和`git diff --check`均Exit 0。
Upstream-owned product file仍仅`packages/engine/Source/Widget/CesiumWidget.js`，复用`SGP-0001`的两个paired
hunks，无新SGP或generated files。C4可标记`completed`并形成独立本地提交检查点；C5必须在该checkpoint后按
届时源码事实单独设计。
