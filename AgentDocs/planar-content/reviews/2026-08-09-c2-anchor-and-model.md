# Review：C2 平面锚点内容与普通 Model

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-09`
- Updated: `2026-08-09`
- Review target: branch `feature/planar-content`相对
  `aa2aba25778497b8d9fc3ffa2a9d483939968aa5`的完整working-tree diff
- Related plan:
  [C2 phase plan](../plans/2026-08-09-phase-c2-anchor-and-model.md)
- Related ADR:
  [ADR-0014](../../../Documentation/SceneGIS/Decisions/ADR-0014-planar-anchor-and-model-visualizers.md)
- Related patch: None；C2 SGP=`0`

## Review target

请Architecture Agent评审：

1. Anchor的disabled caller-owned EntityCluster pool、三个HeightReference、direct property mapping与slot
   lifecycle；
2. Model fixed planar transform、compatibility preflight、generation/candidate/active lifecycle与bounds；
3. 四类content local real Context fixture的大坐标、terrain-relative、picking、warm/destroy证据；
4. C4前explicit-private边界、types/API隐藏和durable docs；
5. 相对base的zero-upstream、zero-SGP、zero-generated范围。

## Implementation summary

- 新增两个private visualizer和三个C2 Specs；未增加public API或共享helper。
- Anchor覆盖Point/Billboard/Label，低层只接收absolute planar Cartesian3；Model不调用Entity ENU或
  ellipsoid height path，使用generation-isolated async ownership。
- 新增direct unique cases=`21`：Anchor`11`、Model`9`、real Context`1`；C2 focused修复增加`6`个
  direct cases。
- Architecture、DevelopmentGuide和PlanarContentGuide只提升已经实现的C2长期规则，并继续声明
  `viewer.entities`要等C4。

## Validation evidence

- Anchor`11/11`、Model`9/9`、real Context`1/1`均Exit 0。
- Real Context suite现在使用与`createScene`相同的engine module identity并读取实际`scene.context`；本机
  capable，Point/Billboard/Label/Model四类branch均执行，覆盖Model normal-render pixel region、四类
  original Entity pick、大坐标、warm identity与slot/listener/caller-owned cluster/Model destroy。
- `npm run build` Exit 0；focused修复未改变public API，按review要求未重复build-ts/build-docs/tsc。
- scoped ESLint/Prettier、Markdownlint、`git diff --check`、upstream audit均Exit 0。
- 两个private symbols在engine/Cesium declarations和API HTML命中`0`；generated status=`0`。

## Ownership audit

- Upstream-owned product/test files: `0`
- C2 SGP: `0`
- `.scenegis/upstream-patches.json`, SGP-0001, SGP-0002: unchanged
- New `SCENEGIS_PATCH` markers: `0`
- Generated files in status: `0`
- Commit: C2 Architecture checkpoint；具体 hash 由下一阶段 plan 记录
- Push: none

## Findings

| ID      | Severity | Status | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Required disposition / evidence                                                                                                                                                                                                                                                                                                                |
| ------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C2-R001 | high     | fixed  | Anchor只在constructor检查`entityCluster.enabled === false`。`enabled`是caller可变public property；slot建立后把它改为true，visualizer仍会继续更新，而随后`EntityCluster.update`会执行读取`camera.positionCartographic`、`scene.ellipsoid`和`EllipsoidalOccluder`的Globe clustering path。这会让已批准的planar-only contract在正常动态配置中静默退回ellipsoid语义。                                                                                                       | `update`在遍历item前重验`cluster.enabled === false`。Anchor Spec“rejects clustering enabled after construction…”证明enabled时同步抛错且slot/property/listener不变，恢复disabled后原slot继续更新；Anchor focused `11/11` Exit 0。                                                                                                               |
| C2-R002 | high     | fixed  | Billboard release只清`item.billboard`，没有清`item.billboardImage`。而`EntityCluster.removeBillboard`会把真实`billboard.image`设为`undefined`并把slot放回pool。一个同时拥有Point与Billboard的Entity移除Billboard后仍保留item；重新加入同一image时，新slot因cache identity相等跳过`billboard.image = image`，最终show=true却没有图像。`setImageSubRegion`失败后也可留下同一stale cache。                                                                                 | Billboard release与new-slot rollback同步清`item.billboardImage`。Anchor Spec“reinitializes a released billboard…”证明same-image re-add会重新赋image、id/show正确且Point identity不变；Anchor focused `11/11` Exit 0。                                                                                                                          |
| C2-R003 | medium   | fixed  | Anchor visualizer把三种graphic合并到一个Visualizer，但`getBoundingSphere`只取`point ?? billboard ?? label`的第一个已分配slot，不检查`show`，并固定radius=0。三种graphic可使用不同HeightReference，现有Spec已经产生Z=20、25、5；返回point的零半径sphere既不包含其他可见graphic，也可能在point已隐藏、label仍可见时返回过期位置。                                                                                                                                         | `getBoundingSphere`使用`BoundingSphere.fromPoints`联合全部visible slots，无visible slot返回`FAILED`。Anchor Spec用Z=-10/10/20证明联合sphere，隐藏首个slot后center/radius跟随剩余visible slots，并覆盖全部隐藏的`FAILED`；Anchor focused `11/11` Exit 0。                                                                                       |
| C2-R004 | high     | fixed  | Model candidate activation在`try`之外先调用`applyModel`。任一Model setter、node transform或articulation应用抛错时，candidate仍留在item中、未destroy也未进入stable failure，后续update会重复部分mutation。现有preflight又没有覆盖例如`DistanceDisplayCondition.far <= near`、non-finite Color/IBL/light/node/articulation等会在setter/render前后失败的approved fields，因此active Model也可能在异常前被部分改写。这违反per-resource atomicity与exactly-once ownership。  | `evaluateState`对数值、DistanceDisplayCondition、Color/IBL/light、node/articulation与boolean fields做窄preflight；candidate apply与primitive add位于同一cleanup boundary。Model Specs证明invalid distance condition不改变active pose/style，以及fake apply failure clear/stable-fail/exactly-once destroy且不add；Model focused `9/9` Exit 0。 |
| C2-R005 | medium   | fixed  | Anchor的通用`validateMappedValues`把所有非finite number都拒绝，因此三个graphics文档明确支持的`disableDepthTestDistance = Number.POSITIVE_INFINITY`无法使用；该值表示永不进行depth test，是常规Cesium direct-property语义。另一方面，该通用检查只查看少量component name，不能验证NearFar/DistanceDisplay ordering或BoundingRectangle width/height，仍不足以兑现“direct equivalents + mutation前失败”。                                                                   | property-aware preflight允许`disableDepthTestDistance=+Infinity`，并验证NearFar/DistanceDisplay ordering、finite components与image subregion rectangle。Anchor Spec证明Infinity正例和existing-slot invalid NearFar原子失败；Anchor focused `11/11` Exit 0。                                                                                    |
| C2-R006 | high     | fixed  | Real Context Spec的capability判断读取direct-source `ContextLimits`，但`createScene`从`@cesium/engine`构造另一module identity的Context；前者保持初始化默认值`maximumVertexTextureImageUnits=0`。因此本轮所谓“GPU不支持”是测试接线错误：reviewer复跑该suite仅耗时0.002秒，line 41在创建World/Model前直接return。即使capable branch执行，当前断言也只有`scene.pick`，没有验证normal render pixel，destroy只检查Model，不能支撑phase plan所称的四类pixel/resource closure。 | Integration Spec从同一engine root取得runtime并从实际`scene.context`判断Anchor capability；Model branch始终执行。本机capable并实际通过四类pick、Model pixel region、大坐标、warm identity、slot/listener/cluster ownership与destroy balance；Content focused `1/1` Exit 0。                                                                     |

### Architecture review evidence

- Reviewer逐行审查两个private visualizer、三个新增Specs、durable docs和相对base的完整路径范围。
- Knowledge graph/source核对确认：enabled `EntityCluster`会进入camera cartographic/ellipsoid occlusion；
  `removeBillboard`会清真实image并复用slot；Model `distanceDisplayCondition` setter会拒绝`far <= near`；
  三个Anchor graphics均把positive infinity定义为合法`disableDepthTestDistance`。
- 首轮reviewer复跑Anchor`7/7`和Model`7/7`，并确认旧Content fixture因错误module identity在
  `0.002 s`提前return，据此提出C2-R001～C2-R006。
- Focused re-review逐行核对六项修复，并独立复跑Anchor`11/11`、Model`9/9`和Content real Context
  `1/1`，均Exit 0；Content case用时约`1.25 s`，实际执行Point/Billboard/Label/Model四类branch。
- Reviewer复跑`npm run build`、`git diff --check`与upstream audit，均Exit 0；current delivery
  upstream-owned files=`0`、C2 SGP=`0`、generated status=`0`。六项finding全部关闭。

## Remaining risks

- `EntityCluster` pool与Model async lifecycle是upstream private/high-change surfaces，升级时必须复核。
- Real Context仍是单一代表性fixture，不是多硬件/全属性GPU矩阵；本轮本机进入capable branch。
- C2尚无supported application construction path；C4前不得把private roles当作`viewer.entities`能力。

## Review result

Architecture/code focused re-review结论为`approved`。C2-R001～C2-R006均经源码、focused Specs和
real Context证据确认关闭；C2实现保持SceneGIS-owned、zero-upstream、zero-SGP与private API边界。
Architecture Agent据此形成独立本地C2 checkpoint；未push，未在该checkpoint混入C3工作。
