# Review：C6 Public Planar Primitive/Geometry

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-09`
- Updated: `2026-08-09`
- Review target: branch `feature/planar-content`相对planning checkpoint
  `b5fc61bcb8d1011bc8b08d2ce11cb98810b0384a`的完整working-tree diff
- Related plan:
  [C6 phase plan](../plans/2026-08-09-phase-c6-public-planar-primitive-and-geometry.md)
- Related ADR:
  [ADR-0018](../../../Documentation/SceneGIS/Decisions/ADR-0018-planar-public-primitive-and-geometry.md)
- Related patch: None；C6 SGP=`0`

## Review target

请Architecture Agent评审：

1. 两个CPU-only Geometry的finite snapshot、origin/local DOUBLE、Polyline `ArcType.NONE`与Polygon simple topology/
   hole/extrusion标准Geometry；
2. Public Primitive的Appearance allowlist、single synchronous standard Primitive、pick identity、matrix/bounds、
   candidate/current、Context与destroy；
3. Polyline/Polygon Entity adapter对Property、terrain、target、original Entity与automatic lifecycle的保留，以及
   fractional/large width新契约；
4. experimental Buffer owner/runtime引用清零、public root/types/API与zero-upstream/zero-SGP审计。

## Implementation summary

- 新增三个public类型及`13`个direct cases；两个Geometry复制输入并生成local DOUBLE标准Geometry，Primitive固定
  `asynchronous:false`与single GeometryInstance。
- Polyline/Polygon visualizer迁移为public wrapper adapter；删除`_SceneGISPlanarBufferOwner.js`，不修改上游
  experimental Buffer实现。
- C6新增direct=`13`，C3 adapter/real Context=`14`，C4/C5 aggregate=`7`，focused aggregate=`34`。

## Validation evidence

- Geometry `3/3 + 3/3`、Primitive `7/7`、Polyline/Polygon `6/6 + 7/7`、real Context `1/1`、C4 Widget
  `4/4`、C5 qualification `3/3`，均Exit `0`。
- `npm run build`、`build-ts`、`build-docs`、`tsc`均Exit `0`；build-ts只有仓库既有TSD-JSDoc warnings。
- Real Context覆盖large-offset line/fill/hole/extrusion pixel、depth、wrapper/original Entity pick、warm
  command/VA identity、dynamic replacement与destroy balance。
- Scoped ESLint、JS/Markdown Prettier、Markdownlint、`git diff --check`与official upstream audit均
  Exit `0`。

## Ownership and risks

- Upstream-owned files=`0`；C6 SGP=`0`；manifest、SGP-0001/0002 hunks unchanged；new markers=`0`。
- Root JS/types/API包含三个public类型；removed owner及private helper在declarations/API命中`0`；generated status=`0`。
- Remaining risks：standard Primitive同步pipeline与pickPrimitive是升级敏感依赖；C6保持simple topology和vertex-only
  terrain，continuous ground延后C9。

## Findings

- `C6-R001`（high，fixed）：`SceneGISPlanarPrimitive`没有分离desired geometry与last-successful current
  geometry。Geometry setter后、下一次normal render前，`modelMatrix` setter会用新origin移动旧current，
  `getBoundingSphere`也会报告尚未提交的candidate bounds；这与pick/depth只使用last current及candidate失败保留
  旧画面的契约矛盾。
- `C6-R002`（high，fixed）：Polyline/Polygon adapter删除原Buffer owner后，各自实现的collection cleanup在
  `PrimitiveCollection.primitiveRemoved`抛错时会中断。`destroyPrimitives=false`时已移出集合的public
  Primitive不会被destroy，Polygon还可能遗留其余Primitive；原C3两种`destroyPrimitives`与post-insertion
  failure证据被删除。
- `C6-R003`（high，fixed）：Public GeometryInstance attributes契约尚不闭合。`id`文档为optional，但无id的合法
  wrapper调用`getGeometryInstanceAttributes()`会被standard Primitive以`id is required`拒绝；当前preflight
  只检查`value.slice`，会让无效attribute shape进入Context初始化；通过返回对象写入的current attribute又会在
  geometry/appearance candidate重建时退回constructor snapshot。
- `C6-R004`（medium，fixed）：`geometry`和`appearance`都声明为mutable union，但两个setter分别用另一项当前值
  做兼容性校验，因此Polyline与Polygon之间不存在任何合法setter顺序。C6必须明确这是同kind replacement，或提供
  geometry/appearance/attributes的原子替换入口，不能把无法执行的跨kind语义留给调用方猜测。

### C6-R001：candidate/current必须拥有各自完整状态

Disposition（Execution）：`SceneGISPlanarPrimitive` 新增`_currentGeometry`，desired与last-successful
geometry/origin/bounds分离。`modelMatrix`与bounds在candidate发布前继续使用current origin；成功后才原子
提交geometry/attributes。Primitive focused的different-origin用例直接覆盖pending pick/depth current、candidate
failure与随后成功发布；`7/7 SUCCESS`。

`SceneGISPlanarPrimitive.js`在geometry setter中立即改写`_geometry`，但只延迟创建standard Primitive。随后
`modelMatrix` setter和`getBoundingSphere`仍读取`_geometry`，而pick/depth继续更新旧`_current`。当新旧geometry
origin不同，这会直接把旧DrawCommand矩阵切换到candidate origin；即使candidate下一normal frame失败，公开bounds
也已经指向未成功的geometry。

修复必须：

- 明确保存desired与last-successful current的geometry/origin/bounds状态；
- normal render成功时原子提交current snapshot，失败时旧current的command、matrix、bounds与pick/depth语义均不变；
- `modelMatrix`可以立即作用于旧current，但必须围绕旧current origin；candidate成功后再使用新origin；
- 增加一个普通不同origin fixture，覆盖setter后normal render前的model matrix、bounds、pick/depth current identity，
  并覆盖一次candidate失败后旧状态仍完整。无需增加极端数值矩阵。

### C6-R002：迁移不能丢失已批准的collection回滚

Disposition（Execution）：新增Buffer无关private `_SceneGISPlanarPrimitiveOwner`，对每个wrapper重新检查
collection membership、独立destroy并在全部成员清理后才报告首个cleanup error。Polygon focused用真实
`PrimitiveCollection`、fill+outline多成员、post-add与post-remove抛错及`destroyPrimitives=true/false`
证明baseline恢复、current不替换、candidate全部exactly-once destroy且原add异常保留；Polygon `7/7`。

当前owner在cleanup开始前把`destroyed=true`，随后单次`contains/remove`异常会跳出整个destroy。Cesium
`PrimitiveCollection.remove`先移除/可选destroy，再raise `primitiveRemoved`；因此listener抛错时，
`destroyPrimitives=false`路径不会进入手工destroy，Polygon循环也不会继续清理其他Primitive。原private Buffer
owner已经按“移除后重新检查membership、独立destroy、继续清理全部成员、保留原始插入异常”处理过该事实。

修复必须：

- 提取SceneGIS-owned、与Buffer无关的窄owner/helper，或在两个adapter中实现等价的完整cleanup；
- 无论`destroyPrimitives`为true或false、add在post-insertion event抛错、remove event再次抛错，都恢复集合baseline并
  exactly-once destroy所有candidate；原始add异常不能被cleanup异常覆盖；
- 恢复这一组focused C3 lifecycle fixtures并改为public wrapper，不要求恢复无关的旧Buffer内部断言。

### C6-R003：attributes/id必须形成可用且可替换的公共契约

Disposition（Execution）：`id`收紧为required non-null；constructor在Context mutation前验证
`ComponentDatatype`、integer 1..4 components、boolean normalize、完整finite/representable value。Candidate
创建时先从current batch table拍摄已发布attribute值，成功后与desired snapshot一起提交，失败不污染
current。Focused Spec覆盖missing id、malformed shape零Context mutation与color写入后替换保留；generated
declaration的`id: any`为required，private owner在declarations/API命中`0`。

构造器允许省略`id`，wrapper方法却固定把`undefined`传给standard
`Primitive#getGeometryInstanceAttributes`。同时`cloneAttributes`没有验证`componentDatatype`、
`componentsPerAttribute`、`normalize`等GeometryInstanceAttribute结构，不能满足phase要求的Context mutation前
preflight。最后，standard batch table中的运行时修改没有同步回wrapper snapshot，下一次candidate会静默恢复旧值。

修复必须：

- 在首次发布前明确`id`规则：可以把它改为required，或提供不破坏pick返回id的内部lookup方案；JSDoc、ADR与types
  必须一致；
- 对C6支持的attributes做完整CPU preflight，非法shape在Context/command/resource mutation前拒绝；
- 明确并实现candidate replacement后的attribute语义。Architecture建议保留last current的受支持attribute值，避免
  geometry replacement让公开写入静默丢失；
- focused Spec覆盖无id规则、malformed attribute零Context mutation、attribute修改后replacement三项即可。

### C6-R004：收敛geometry kind切换语义

Disposition（Execution）：采用Architecture建议的小API：wrapper构造时固定`polyline`或`polygon`
kind，geometry setter仅允许同kind，appearance setter仅允许与该kind匹配的Appearance；跨kind在任何
desired/current mutation前fail-fast，调用方需新建wrapper。JSDoc、ADR-0018、Guide与focused Spec已同步。

当前Polyline geometry不能先换成Polygon（旧Polyline appearance不兼容），appearance也不能先换（旧Polyline
geometry不兼容）。这是公共API形状问题，不是数值边界。

修复可以二选一：

1. 新增一个经过完整preflight的原子replacement入口，同时提交geometry、appearance与必要attributes；或
2. 将wrapper契约明确限制为构造时确定的geometry kind，只允许同kind geometry/appearance replacement，跨kind要求
   新建wrapper。

Architecture倾向第2项，API更小且符合一个wrapper/一个GeometryInstance的C6定位。无论选择哪项，都要同步ADR、
JSDoc、guide与一个focused Spec；不需要为此进入C7/C8 geometry。

## Architecture conclusion

C6方向成立：SceneGIS-owned immutable geometry + standard synchronous Primitive wrapper可以替代experimental Buffer
路径，且本轮未发现需要修改upstream-owned file或新增SGP。当前结论为`changes-requested`，仅阻断上述四项公共
状态/生命周期契约；Execution首轮构建、类型、API与ownership证据继续有效，不要求在修复前重复无关全量验证。

## Focused re-review（2026-08-09）

- `C6-R001`：Architecture确认fixed。`_currentGeometry`使pending/failed candidate期间的matrix、bounds与非normal
  pass继续绑定last-successful current；focused Primitive suite由Architecture复跑`7/7 SUCCESS`。
- `C6-R002`：Architecture确认fixed。新private owner逐成员复核membership并在remove event抛错后继续destroy；
  `destroyPrimitives=true/false`多Primitive fixture由Architecture复跑`7/7 SUCCESS`。
- `C6-R004`：Architecture确认fixed。一个wrapper固定construction-time geometry kind，跨kind在mutation前拒绝；
  ADR、JSDoc与Guide一致。
- `C6-R003`：required id、attribute shape与replacement persistence已确认fixed，但“representable value”仍有一个窄缺口。
  `validateAttribute`把输入转换为对应TypedArray后，只检查finite/`Math.fround`，未比较整数输入与转换结果。
  因此普通的`UNSIGNED_BYTE=256`、`BYTE=128`与`UNSIGNED_SHORT=1.5`仍被constructor接受，并分别发生回绕或
  截断；这与源码错误文本、ADR和Execution disposition声明的representable preflight不一致。

R003最后修复只需：对六种integer `ComponentDatatype`验证integer及其合法范围，或用无损转换等价判断；
`FLOAT`/`DOUBLE`继续按各自finite representability处理。增加一个parameterized constructor Spec证明上述三项在
Context mutation前拒绝，并保留合法边界值。无需重跑Entity、Sandcastle、E2E、package或无关Cesium suites。

Narrow follow-up disposition（Execution）：`validateAttribute`对`BYTE`、`UNSIGNED_BYTE`、`SHORT`、
`UNSIGNED_SHORT`、`INT`与`UNSIGNED_INT`要求输入为integer，且typed conversion结果与输入严格相等；
越界、回绕与截断在constructor阶段拒绝，`FLOAT`/`DOUBLE`分支未改。现有malformed-attribute case
参数化覆盖`UNSIGNED_BYTE=256`、`BYTE=128`、`UNSIGNED_SHORT=1.5`的拒绝，以及`255`、`-128`、
`65535`的合法边界；`createPickId`零调用、Scene primitives baseline不变。Primitive focused `7/7
SUCCESS`；scoped ESLint/Prettier、AgentDocs Markdown Prettier/Markdownlint与`git diff --check`均Exit `0`。

Review-level status继续为`changes-requested`；C6-R003 integer representability narrow follow-up已由Execution标记
fixed，等待Architecture最终focused确认。其余实现、build/types/docs与zero-upstream证据继续复用。

## Final focused confirmation（2026-08-09）

Architecture确认C6-R003 narrow follow-up fixed：六种integer `ComponentDatatype`要求integer且typed conversion
无损，普通overflow、wrap与fractional truncation在constructor阶段拒绝，合法边界保留。Architecture复跑
`SceneGIS/Scene/SceneGISPlanarPrimitive`为`7/7 SUCCESS`。

C6-R001～C6-R004全部关闭，review状态更新为`approved`。接受Execution记录的build/types/docs、real Context、
API visibility、zero-Buffer、upstream-owned files=`0`、C6 SGP=`0`与generated status=`0`证据；C6可以形成独立
本地提交检查点。Remaining risks继续是standard Primitive升级敏感性、simple polygon topology与vertex-only
terrain语义，分别由升级清单和C9处理，不阻断C6。
