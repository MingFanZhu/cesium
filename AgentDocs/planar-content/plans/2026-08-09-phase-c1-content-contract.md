# 阶段计划：C1 平面内容基础契约与兼容性基线

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`active`
- 总体计划（Parent plan）：
  [2026-08-08-planar-content-extension.md](2026-08-08-planar-content-extension.md)
- 阶段（Phase）：`C1-content-contract`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-09`
- 更新日期（Updated）：`2026-08-09`
- 基线（Planning base）：`d3e0bce1d44f0b0706b4b49fd4b52b243b933c58`
- 相关讨论（Related discussions）：无；本阶段架构对话结论已提升到 ADR-0013
- 相关评审（Related reviews）：None；实现完成后创建 C1 pending review request
- ADR：
  [ADR-0013：平面内容坐标、高度、朝向与兼容性基线](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)
- SGP：无；C1 禁止修改 upstream-owned file

## 目标

在不接入具体 Entity Visualizer、Geometry、Viewer 或 WebGL 渲染的前提下，为后续 C2-C4 建立唯一
的平面 anchor 解析契约和版本化 compatibility baseline：

- finite 米制 `Cartesian3` 与 inclusive World extent；
- `HeightReference.NONE`、`CLAMP_TO_GROUND`、`RELATIVE_TO_GROUND` 的平面语义；
- resident terrain height、Z=0 fallback、LOD/revision 和 provider lifecycle 的同步解析边界；
- planar fixed axes 与默认 identity orientation 规则；
- approved、deferred 和 unsupported Entity/DataSource graphics matrix；
- 一个无状态、无资源所有权的 SceneGIS private position resolver，供 C2/C3 使用。

阶段结束时必须有可执行的纯数据 resolver Specs、ADR 与使用指南，但不得宣称
`viewer.entities`、Point/Billboard/Label/Model 或 Polyline/Polygon 已完成运行时支持。

## 非目标

- 实现或接入 Point、Billboard、Label、Model、Polyline 或 Polygon visualizer/runtime。
- 创建 `SceneGISPlanarEntity`、新的 Property 系统、新的 HeightReference enum 或公共 resolver。
- 修改 `Entity`、`DataSourceDisplay`、`CesiumWidget`、Viewer 或默认 visualizer list。
- 使用 `DataSourceDisplay.registerVisualizer`、prototype patch、全局 registry 或加载顺序技巧。
- 修改 `SceneGISPlanarWorld` public API、terrain runtime、query snapshot、`tilesLoaded` 或 request
  行为。
- 实现 terrain subscription、主动 sampling、preload、per-anchor request、cache 或 readiness state。
- 读取或实现 Model pipeline、GPU resource、Shader、Worker、GeometryUpdater 或 ground pipeline 的
  C2/C3 细节。
- 新增 Sandcastle、Widget、E2E、WebGL 或性能测试。
- 修改任何 upstream-owned file、patch manifest、生成器或生成文件。
- 开始 C2 设计或实现。

## 进入条件

- `planar-world` 和 `planar-terrain` extension 已完成，checkpoint 为
  `23d06ad14c79825f680e9397c6f4a8fa70a0f008`。
- `planar-content` extension plan 已确认并由 checkpoint
  `d3e0bce1d44f0b0706b4b49fd4b52b243b933c58` 激活。
- 项目负责人已一次性批准 C1 的 coordinate domain、HeightReference subset、resident-height
  fallback、eventual consistency、orientation 与 compatibility enforcement。
- ADR-0013 状态为 `approved`，本 phase plan 状态为 `active`。
- Execution Agent 从 Architecture Agent 提交后的干净 planning checkpoint 开始，留在
  `feature/planar-content`，不创建额外阶段分支。
- Execution Agent 开始前读取根、engine、AgentDocs 的 `AGENTS.md`，以及 Architecture、
  DevelopmentGuide、planar-content extension plan、ADR-0002、ADR-0010 和 ADR-0013。

## 当前源码事实

1. `Entity` 的 position/orientation、Property、availability 与 collection/event 模型本身可以复用；
   `Cartesian3` 不绑定 CRS。
2. `BillboardVisualizer`、`LabelVisualizer` 和 clamped `PointVisualizer` 最终调用
   `Billboard._updateClamping`，该路径使用 Ellipsoid、Cartographic 和
   `Scene.getHeight/updateHeight`。
3. `ModelVisualizer` 调用 `Entity.computeModelMatrix`；orientation undefined 时使用
   `Transforms.eastNorthUpToFixedFrame`。`Model.heightReference` 也使用 ellipsoid clamping。
4. `PolygonGeometryUpdater` 和 ground/geodesic paths 具有直接 ellipsoid 假设，不能因接受
   Cartesian3 就宣称 planar-compatible。
5. `DataSourceDisplay` 有 constructor-level `visualizersCallback`，但当前 CesiumWidget/Viewer 没有
   传入入口；private global `registerVisualizer` 只能追加默认 visualizer。
6. `world.getTerrainHeight` 是 no-request、no-LRU-mutation 的 resident Float32 triangle query；
   `DIRECT`/`UPSAMPLED` 合法，`FLAT` 不冒充 terrain，并能继续寻找 ancestor。
7. Scene normal frame 先更新 ground/scene primitives，再执行 primary `world.render`；内容高度允许在
   下一 normal content update 反映刚完成的 terrain promotion。
8. 当前生成链会发现 SceneGIS JS basename；跨文件 private module 必须使用 `_SceneGIS` basename、
   `@private` 和 default export，并验证不进入 declarations/API docs。生成文件不得提交。

源码行号不是契约。Execution Agent 实现前使用 codebase knowledge graph重新确认上述符号、调用链、
Spec discovery 和生成边界；图谱不足时才使用 `rg` 或定点读取。

## 详细设计

### Private resolver

新增：

```text
packages/engine/Source/SceneGIS/DataSources/_private/
  _SceneGISPlanarPositionResolver.js
```

采用 default-exported private namespace/object，不建立需要 destroy 的实例：

```text
resolve(world, position, heightReference, result)
  -> Cartesian3 | undefined
```

要求：

- `world` 必须是 live `SceneGISPlanarWorld`；destroyed world 即使解析 `NONE` 也同步拒绝。
- `position` 必须是 finite `Cartesian3`；验证完成前不得写 result。
- `heightReference` 只接受 `NONE`、`CLAMP_TO_GROUND` 和 `RELATIVE_TO_GROUND`。
- X/Y outside `world.coordinateSystem.extent` 返回 `undefined`；outer boundaries inclusive。
- `NONE` 原样复制 X/Y/Z，且不得调用 `world.getTerrainHeight`。
- clamp/relative 每次最多调用一次 `world.getTerrainHeight(position)`；undefined 使用 0。
- clamp 输出 `surfaceHeight`；relative 输出 `surfaceHeight + input.z`。
- derived Z 必须 finite；overflow 使用英文 `DeveloperError`，input/result 保持不变。
- 支持省略 result 和 result reuse，也支持 `result === position`；成功前完成全部 derived value。
- helper 不保存 scratch 之外的跨调用 state，不创建 Event/subscription/request/cache，不拥有任何
  caller/world/terrain object。

Implementation 不得 deep import terrain private roles，不访问 `world._surface` 或 tile/runtime fields；
只使用 public `coordinateSystem.extent`、`getTerrainHeight` 和 liveness contract。

### 坐标、高度与 fallback

完整语义以 ADR-0013 为准。实现必须保持：

- X east、Y north、Z up、meters；不读取 opaque CRS。
- anchor domain 有界且 outside 不 clamp。
- 无 provider、pending、replacement/detach 后暂无 resident terrain、terminal failure 无 ancestor 时
  fallback Z=0。
- 可用 resident ancestor 或更深 direct/upsampled mesh 优先于 flat fallback。
- resolver 不调用 `pickTerrain`、`scene.pickPosition` 或 terrain sampler。
- resolver 不改变 `world.tilesLoaded`；C1 不增加 content readiness。

C1 不需要重新搭建 T3/T4 async terrain fixtures。Focused Spec 可以用真实
`SceneGISPlanarWorld` 加 instance-level spy/stub固定 `getTerrainHeight` 的 public return boundary；
不得修改 prototype 或产品源码建立测试 hook。

### 朝向契约

C1 只在 ADR、Architecture 与 PlanarContentGuide 固定：

- orientation undefined = translation-only、planar world rotation identity；
- defined Quaternion = normalized object/model local frame 到固定 planar axes 的 rotation；
- 禁止 `eastNorthUpToFixedFrame`；
- glTF 内部 axis normalization 留给 Model pipeline；
- C2 进入时再确定 matrix helper、Quaternion validation 和 Model property 子集。

C1 不新增 transform 源码或测试，避免提前实现 C2。

### Compatibility matrix 与阶段可用性

新增 `Documentation/SceneGIS/PlanarContentGuide.md`，明确区分：

- C1 已稳定的 contract；
- C2/C3/C4 planned capability；
- 当前 checkpoint 尚不可通过 `viewer.entities` 宣称自动 planar rendering；
- 首版 approved graphics 与永久/暂时 unsupported graphics；
- raw `scene.primitives` 不属于 automatic Entity compatibility enforcement。

矩阵必须至少包含 ADR-0013 的 Entity/Property、CustomDataSource、Point、Billboard、Label、Model、
Polyline、Polygon、其他 Entity graphics、3D Tiles、地理 DataSource loaders、tracking/flight 状态。
未来 phase 在能力实现后原位更新同一文档，不创建阶段性重复 guide。

### Unsupported enforcement

C1 不实现 aggregate Entity validator，因为 C2/C3 尚未确定 graphic property 子矩阵，C4 也尚未
确定 display integration owner。长期规则是：

- future planar adapter 使用 allowlist，不运行消费相同 graphics 的 default Globe visualizer；
- unsupported graphic/config 在该 entity 资源 mutation 前抛 `DeveloperError`；
- 不通过 warning、silent ignore 或 Globe fallback 冒充支持；
- 具体 validator ownership 与跨 Entity failure boundary 在 C4 依据届时源码进入 phase plan。

### 文档提升

Execution Agent 应将 ADR-0013 的稳定精简规则加入：

- `Documentation/SceneGIS/Architecture.md`：SceneGIS DataSources 层、fixed planar axes、resolver
  boundary、no-default-visualizer 假设和 phase ownership；
- `Documentation/SceneGIS/DevelopmentGuide.md`：实现/评审 planar content 时的 coordinate、
  HeightReference、fallback、unsupported 与升级检查；
- `Documentation/SceneGIS/PlanarContentGuide.md`：面向使用者的当前能力与 compatibility matrix。

不得把全部 phase plan复制到长期文档。

## 影响路径

### 允许新增或修改的 SceneGIS-owned files

- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPositionResolver.js`
- `packages/engine/Specs/SceneGIS/DataSources/_private/_SceneGISPlanarPositionResolverSpec.js`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarContentGuide.md`
- `Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md`
- `AgentDocs/planar-content/**`

若实际 Spec discovery 对 `_private` mirror 目录有既有约束，Execution Agent可以把 Spec 放在
`packages/engine/Specs/SceneGIS/DataSources/`，但必须保持唯一清晰 basename并回写偏差。

### 禁止修改

- 所有 upstream-owned files，包括 `Entity.js`、各 upstream Visualizer、`DataSourceDisplay.js`、
  `Scene.js`、`CesiumWidget.js` 和 `Viewer.js`
- `.scenegis/upstream-patches.json`、SGP-0001、SGP-0002 或任何 patch marker
- `packages/engine/Source/SceneGIS/Core/**`
- `SceneGISPlanarWorld.js`、现有 planar terrain/surface/query/runtime
- Renderer、Shader、Worker、Widgets、Sandcastle、E2E、build/release scripts
- generated root exports、`.d.ts`、SpecList、API HTML 和 `Build/**`
- C2-C5 产品、Spec、plan 或 review 文件

如果实现证明 public World API、terrain event、Visualizer integration 或 upstream seam 必不可少，
Execution Agent必须停止并把源码事实回写为 blocker，交回 Architecture Agent；不得自行扩大范围或
创建 SGP。

## 实施步骤

1. 读取必需约束、extension plan、ADR-0013，并用 knowledge graph重新确认 relevant source facts。
2. 创建 private position resolver，先完成全部 validation/derived value，再原子写 result。
3. 增加 focused resolver Spec，使用最小真实 World/stub boundary覆盖批准语义。
4. 新建 `PlanarContentGuide.md`，写入当前阶段能力与版本化 compatibility matrix。
5. 将精简的持久规则提升到 Architecture 与 DevelopmentGuide；如实现与 ADR不同，先停止请求裁决。
6. 运行最小充分验证，确认 private symbol不进入 declarations/API，生成文件不在 status。
7. 审计 allowed paths、upstream ownership、SGP、patch marker 和 generated status。
8. 回写本 plan 的 source-to-spec mapping、实际 case count、命令、结果、偏差与剩余风险。
9. 创建 `AgentDocs/planar-content/reviews/2026-08-09-c1-content-contract.md`，状态设为
   `pending`，并更新 extension/README/plans/reviews handoff。
10. 停止，不提交、不 push、不进入或设计 C2，等待 Architecture/code review。

## 验证要求

### Focused Specs

至少覆盖：

- `NONE` 保持绝对 Z，且 terrain getter 调用次数为 0；
- clamp 使用 resident height，undefined 时使用 0；
- relative 使用 resident height + input Z，undefined 时等于 input Z；
- exact minimum/maximum X/Y boundary均被接受，一个代表性 outside point返回 undefined；
- 非 Cartesian3、任一 non-finite component、destroyed/wrong world 和四个 unsupported
  HeightReference family/unknown value抛 `DeveloperError`；
- relative derived overflow 在写入前失败；
- omitted result、result reuse、`result === position`、input unchanged 和 failure atomicity。

不扩展为大量数值边界或 terrain 状态组合；T3/T4 已覆盖 terrain lifecycle，本阶段只验证 resolver
对 public return boundary 的处理。

### 必须运行

```text
npm run test -- --includeName "SceneGISPlanarPositionResolver"
npm run build
npm run build-ts
npm run build-docs
```

另运行：

- 只覆盖新增/修改 JS 的 scoped ESLint 与 Prettier；
- 只覆盖 SceneGIS/planar-content 文档的 Prettier 与 Markdownlint；
- `git diff --check`；
- `node scripts/scenegis/audit-upstream-patches.mjs`。

`build-ts/build-docs` 的目标是证明 private helper不形成 supported declaration/API；不要求为 C1
运行 `tsc`、build-release、WebGL、Viewer/Globe/DataSourceDisplay upstream suites、Sandcastle、E2E
或性能矩阵。若某条列出的命令因仓库脚本真实名称不同，使用等价最窄命令并回写。

## 验收条件

- Resolver 的 coordinate、extent、HeightReference、fallback、atomic/result-reuse 语义与 ADR-0013
  完全一致。
- Resolver 无 persistent ownership、subscription、request、terrain mutation 或 public API 泄漏。
- `PlanarContentGuide` 明确当前 C1 不等于 Viewer Entity runtime 已可用，并保存首版 compatibility
  matrix。
- Architecture/DevelopmentGuide 已提升精简长期规则，没有复制易变实现细节。
- Focused Specs 与列出的最小构建/静态检查通过；生成文件未进入 status。
- upstream-owned files=`0`、C1 SGP=`0`、现有 manifest/marker unchanged。
- AgentDocs 记录实际实现、验证、偏差、review request 与剩余风险。
- Execution Agent 未提交、未 push、未进入 C2，并停在 Architecture/code review gate。

## 预期 source-to-spec mapping

| Source/contract                              | Direct evidence                           |
| -------------------------------------------- | ----------------------------------------- |
| `_SceneGISPlanarPositionResolver.js`         | `_SceneGISPlanarPositionResolverSpec.js`  |
| ADR-0013 coordinate/height/fallback contract | resolver focused cases                    |
| private declaration/API boundary             | `build-ts/build-docs` 生成结果查询        |
| compatibility profile 与阶段状态             | `PlanarContentGuide.md` + Markdown checks |
| ownership/upstream boundary                  | upstream audit + `git status/diff`        |

## 剩余风险与后续边界

- C1 resolver 使用 resident height，可能与当前实际 render cover 的 LOD短暂不同；该行为与
  ADR-0010/Globe resident-height启发一致，并通过下一 content update收敛。
- C1 不解决 requestRenderMode 下何时触发额外 content frame；C2/C4 在实际 visualizer/display
  lifecycle 中确认。
- C2 仍需审计 Billboard/Label collection、Point primitive、Model axis/modelMatrix、bounding sphere、
  picking 和 resource ownership。
- C3 仍需审计 straight geometry、triangulation、extrusion 和 terrain drape；不能把单点 resolver
  直接当作完整 polygon draping 算法。
- C4 仍可能发现 Viewer/CesiumWidget/DataSourceDisplay 需要最小 upstream seam；届时必须暂停登记
  SGP，不能预用 private global registry。

## 执行结果

尚未实现。Execution Agent 完成后在此记录：

- 实际 source/spec/docs mapping；
- case count 与运行命令结果；
- 与 ADR/plan 的偏差；
- upstream-owned files、SGP、patch markers 与 generated status；
- review request 和尚未解决风险。

## 当前交接

- C1 设计已由项目负责人批准，ADR-0013 为 approved，本 phase plan为 active。
- 下一步：Architecture Agent提交 planning checkpoint并向 Execution Agent派工。
- Execution Agent只实现 C1；完成后创建 pending review request并停止。
