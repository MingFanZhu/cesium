# ADR-0022：平面内容兼容性矩阵与最终交付

- Status：`approved`
- Date：`2026-08-10`
- Decision owners：Project Owner、Architecture Agent
- Scope：`planar-content` C10
- Cesium baseline：tag `1.144`，commit `6d5d8b1f0725b6f831b336463f4b11c98023427b`
- Related plan：
  [C10 统一集成、Compatibility Matrix 与交付](../../../AgentDocs/planar-content/plans/2026-08-10-phase-c10-unified-integration-and-delivery.md)
- Existing upstream seams：`SGP-0001`、`SGP-0002` unchanged；C10预期不新增SGP
- Successor ground decision：C10完成后，项目负责人以
  [ADR-0023](ADR-0023-planar-depth-stencil-ground-rendering.md)决定替换C9 actual-mesh backend；本文ground rows与
  最终人工验收门禁由C11更新，C10自动化交付baseline仍保留。

## Context

C1-C9已经分别完成position/height contract、八个automatic visualizer role、public planar Geometry/Primitive、
ordinary Graphics与actual-cover continuous ground。C5的交付资产早于C6-C9：它只覆盖六类Graphics，qualification
仍以resident query改写source Z来近似ground，E2E仍假定五个visualizer，package smoke也遗漏Terrain和C6-C9 public
入口。若直接把这些旧资产称为最终交付，会得到与当前runtime不一致的半成品compatibility结论。

同时，项目负责人要求验证保持有边界，不引入正式workflow，也不为少见极端输入或跨机器timing噪声消耗大量时间。
C10需要把产品范围收口，但不能借交付阶段继续扩大Entity、terrain或3D Tiles范围。

## Decision

### 1. 使用版本化Compatibility文档作为产品矩阵

新增`Documentation/SceneGIS/PlanarContentCompatibility.md`，绑定Cesium `1.144` upstream baseline，逐行记录：

- 24个public engine SceneGIS入口、2个public widget入口；
- 16类automatic Entity Graphics及其坐标、HeightReference、continuous-ground与property边界；
- direct ordinary/Ground Primitive的Geometry、Appearance、ownership和picking约束；
- 明确unsupported能力与对应fail-fast边界。

该矩阵是Guide和示例的索引，不替代源码、JSDoc或Specs。Cesium升级、public contract变化或支持范围变化时必须同步
更新矩阵和UpgradeChecklist。

### 2. 保留一个automatic path与一个交付入口

- Automatic Entity继续只通过instance-owned gate加八个child visualizer，不增加默认Cesium visualizer并行消费。
- 更新现有`SceneGISPlanarContentQualificationSpec`、唯一content E2E、唯一`scenegis-planar-content` Sandcastle与唯一
  package smoke；不复制第二套资产。
- Sandcastle可使用公开EPSG:3857数据供人工验收；所有自动化使用local deterministic terrain/assets并阻断公网。

### 3. Qualification区分hard gate与diagnostic timing

Hard gate是类型激活、actual-ground正确性、pick/depth/bounds、warm identity、provider convergence、资源/监听器/DOM
lifecycle、dev/release E2E和installed-package可用性。Timing只记录同机环境、median和P95，不设跨机器固定毫秒阈值。
只有同轮可重复且能定位到SceneGIS private hotspot的明显回退才触发优化。

### 4. 最终完成需要项目负责人人工验收

Architecture review可以确认代码、自动化和交付证据，但不能代替真实浏览器/GPU下的视觉与交互判断。C10和
`planar-content` extension只有在项目负责人明确确认Sandcastle通过后才能标记`completed`并形成最终phase commit。

### 5. C10不新增workflow或产品范围

C10不新增`.github/workflows`，不引入3D Tiles、classification、格式转换、runtime reprojection、ordered ground
layers或新的terrain协议。若交付测试发现确定性缺陷，只允许在既有SceneGIS-owned contract内做最小修复；大量Cesium
修改或public范围改变必须回到Architecture裁决。

## Consequences

- 最终矩阵会清楚区分anchor-level terrain reference与actual-cover continuous ground，避免把所有
  `HeightReference`内容误称为连续贴地。
- C5 qualification与package smoke需要有意迁移，旧的visualizer count、BufferOwner和source-Z断言不再保留。
- Sandcastle页面内容会增加，但通过分组视图而不是新增多个示例控制复杂度。
- C10 product runtime理想delta为零；若确有修复，review必须逐项说明行为变化与focused evidence。
- 无workflow意味着交付命令由本地phase evidence维护；升级或发布时按UpgradeChecklist显式执行。

## Rejected alternatives

- **继续沿用C5资产并只补文档**：会把已失效的ground与package断言当作最终证据。
- **为每类Graphics建立独立E2E/Sandcastle**：维护成本和脆弱性过高，focused Specs加每个child role的代表性E2E更合适。
- **用公网terrain完成自动化**：无法保证可重复性、SLA与离线构建。
- **设置固定跨机器性能阈值**：现有毫秒级样本易受浏览器/GPU调度影响，不应成为功能发布门禁。
- **新增CI workflow**：超出项目负责人明确要求。

## Upgrade triggers

以下变化必须复核本ADR、Compatibility文档与C10交付资产：

- Cesium Entity property/Graphics类型、DataSourceDisplay callback、Primitive/GeometryInstance或Model生命周期变化；
- public SceneGIS Geometry/Primitive、HeightReference、Ground snapshot/drape或World/Viewer contract变化；
- npm package exports、declaration generator、Sandcastle或Playwright入口变化；
- `SGP-0001`/`SGP-0002`移除条件满足或补丁hunk改变。
