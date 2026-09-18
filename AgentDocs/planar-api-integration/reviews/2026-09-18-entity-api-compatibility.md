# 平面 Entity API 兼容性审计

- Type: architecture / API audit
- Status: audit completed；EA-R001 fixed、EA-R003 partial、EA-R005 accepted；EA-R002/EA-R004 open
- Created / Updated: 2026-09-18
- Author / owner: 当前 Agent；未启用独立评审 Agent
- Target: Entity public API 与 automatic planar visualizer 的实际语义
- Parent: None；Camera standalone 已验收，本轮为只读兼容性审计
- Related: planar-content C1–C11；ADR-0013、0016、0019、0022、0038
- SGP: 本轮无 upstream-owned 修改；既有集成依赖 SGP-0001、0005、0006

## 结论

总体结构遵循原 API：Entity、EntityCollection、Property、DataSourceDisplay 与官方基线没有差异。
Viewer 的 entities、selection、framing、tracking 入口复用既有 API；平面几何和渲染通过 instance-local
visualizersCallback 实现，没有平行 Entity 类型或全局 prototype patch。

但原 API 外形不等于完整行为兼容。过去分阶段交付的封闭 profile 包含额外限制；其中一部分是覆盖缺口，
不能作为平面坐标必然要求。以下是审计发现，不代表本轮已经取消现有校验。

## Findings

全部 open 项的负责人为当前 Agent（architecture / execution）；后续实现需先形成有界 plan，更新对应 ADR 和 Specs。

| ID      | 严重度 / 状态 | 证据与影响                                                                                                                                                                                                                                               | 处置方向                                                                                                                                                            |
| ------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EA-R001 | P2 / fixed    | `_SceneGISPlanarVisualizersCallback.validateEntityProfile` 对全部 propertyNames 使用 allowlist；原生 `entity.addProperty("businessCode")` 赋值后也会抛错。现有 callback Specs 明确断言 custom property 被拒绝；PropertyBag 仅是当前可用替代入口          | 区分已知不支持的渲染 Graphics 与业务自定义属性，不能因普通元数据阻止渲染                                                                                            |
| EA-R002 | P2 / open     | 同一 gate 要求 `instanceof CustomDataSource`，拒绝带原生 EntityCollection 的其他 DataSource 实现，Specs 也固定了此行为                                                                                                                                   | 保留数据格式与坐标契约检查，审计结构性 DataSource 接入；不能用删除 class guard 冒充完成 GeoJSON/CZML/KML CRS 转换                                                   |
| EA-R003 | P2 / partial  | Polyline / Polygon visualizer 拒绝 distanceDisplayCondition；Area visualizer 已解析并映射相同原生属性。多种 Geometry visualizer 仅允许 ColorMaterialProperty                                                                                             | 普通几何的距离显隐应保持原字段并补齐；材质需要独立验证 Geometry / Appearance 能力，ground 单列，不能只移除 guard                                                    |
| EA-R004 | P1 / open     | 原生 `Entity.computeModelMatrix` 在 orientation 缺省时调用 eastNorthUpToFixedFrame；Model/Solid 等平面渲染使用 `_SceneGISPlanarEntityTransform` 的平移加 identity。应用读到的矩阵可能与画面不同；VelocityOrientationProperty 也仍通过 ellipsoid 计算姿态 | 明确 Entity / Property 如何获得平面坐标上下文，保持原入口且避免全局改写；显式 fixed-axis Quaternion 可使 computeModelMatrix 与渲染一致，但并未解决缺省情况          |
| EA-R005 | P1 / accepted | `_SceneGISPlanarAreaVisualizer.rectangleVertices` 要求原生 Rectangle，却把 west/south/east/north 直接作为米制 X/Y；原生 Rectangle 定义为弧度。这是 ADR-0019 的既有选择，与当前 Camera / Scene 不重释 Rectangle 的边界不一致                              | 明确平面范围的类型契约，尽量保留 Entity.rectangle / Graphics / Property 入口，避免让 Rectangle.fromDegrees 的输出被静默当作米；需修订正式决策，不能在本次审计中暗改 |
| EA-R006 | P2 / fixed    | PlanarContentGuide / PlanarContentCompatibility 仍称 tracking、zoomTo、flyTo 不支持，已落后于 API integration I2/I3                                                                                                                                      | 本轮修正文档，明确在当前受支持 Entity/DataSource profile 内可用；不扩大实现范围                                                                                     |

## 2026-09-18 后续处置

负责人要求修复部分问题，并接受为复用 Cesium 类型而保留平面字段解释。
[通用属性修复](../plans/2026-09-18-entity-api-fixes.md)关闭 EA-R001、补齐 EA-R003 的距离显隐；材质仍未扩展。
EA-R005 按负责人意见 accepted：保留 ADR-0019 的米制字段解释，明确只适用于平面 Entity adapter。
具体实现与验证、两个既有资格用例失败见[技术自审](2026-09-18-entity-api-fixes.md)。
上表事实为初始审计现场，状态按此处后续处置更新。

## 必要坐标差异

- 位置使用场景一致的米制 Cartesian3，固定 X/Y/Z 轴；fromDegrees / Cartographic 不应隐式变为投影坐标。
- 地表高度和 HeightReference 读取平面地形；默认姿态应与固定 world axes 一致。
- GEODESIC / RHUMB、Earth INERTIAL / ENU 不能直接复用；普通业务 Property、事件和距离显隐没有这些球面依赖。
- GeoJSON/CZML/KML 自动转换、3D Tiles、clustering、shadow 等现有边界仍有效；“尚未支持”不等于“平面永远不应支持”。

## 初始审计验证

- 对比 upstream commit `6d5d8b1f0725b6f831b336463f4b11c98023427b`：Entity、EntityCollection、Property、DataSourceDisplay 四个源文件无差异。
- 执行 callback focused Specs 命令，runner 报告 10 passed；其中 custom property rejection、gate activation / rollback 等用例验证了当前限制，而非证明限制合理。
- Node 直接调用实际 Entity 与 private transform：position=(1000,2000,30)，缺省 orientation 的 computeModelMatrix 与 planar matrix 不同；设置 Quaternion.IDENTITY 后相同（epsilon 1e-12）。
- 源码交叉检查 Graphics 属性处理、Rectangle 原生单位与实际坐标构造、Widget 的 SGP callback/framing/tracking 接缝。
- 修改文档的格式检查、全 AgentDocs Markdownlint 与 git diff --check 通过；全 AgentDocs Prettier 仍有 285 份既有无关文档未通过，本轮不改这些文件。
- 本轮不修改 runtime、Specs、生成文件或 upstream-owned 文件；未进行新一轮画面验收。

## Follow-up 与剩余风险

1. EA-R001 和 EA-R003 距离显隐已在后继 standalone 实现；待负责人验收。
2. EA-R002 / EA-R004 后续需要梳理 DataSource 和坐标上下文；EA-R005 已按负责人意见保留，不启动类型重设计。
3. 材质、ground、clustering 等按各自渲染风险独立补齐，不能批量删除 validation 后宣称原生兼容。

初始审计未修改 runtime；后继实现以通用属性修复 plan / review 为准。剩余限制仍然存在，本记录不替代正式 ADR。
