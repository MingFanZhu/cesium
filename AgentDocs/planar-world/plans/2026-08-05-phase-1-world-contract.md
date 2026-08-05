# 阶段计划：P1 SceneWorld 契约与集成缝隙

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- 总体计划（Parent plan）：
  [2026-08-05-planar-world-extension.md](2026-08-05-planar-world-extension.md)
- 阶段（Phase）：`P1-world-contract`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`approved`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-05`
- 更新日期（Updated）：`2026-08-05`
- 相关讨论（Related discussions）：无
- 相关评审（Related reviews）：
  [P1 world contract review request](../reviews/2026-08-05-p1-world-contract.md)
- ADR：`Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md`
  （计划在本阶段创建）
- SGP：`SGP-0001`（primary world lifecycle slot，`active`）

## 目标

在 Scene 中引入一个小型结构化 world 契约，以及唯一的主世界生命周期槽位。
现有 `Globe` 通过该槽位运行，但其渲染和公共行为不发生变化；同时提供一条构造
路径，使后续 `SceneGISPlanarWorld` 无须伪装成 `Globe` 即可接入。

## 非目标

- 实现 `SceneGISPlanarWorld`、平面坐标类型或平面 quadtree。
- 修改相机控制、世界坐标拾取或高度采样以支持平面。
- 泛化 `Globe` 的影像、地形、大气、地下或遮挡功能。
- 在本阶段修改 Viewer、BaseLayerPicker、Geocoder 或其他 widget。
- 增加新的 `SceneMode`，或支持运行时 world 切换。
- 在接触共享文件时顺带重构无关的 Scene 或 `Globe` 代码。

## 进入条件

- 总体计划已通过架构评审并标记为 `active`。
- 工作在从当前 `scenegis/develop` 创建的 `feature/planar-world` 分支上进行。
- 如果实现分支已经变化，先刷新 codebase knowledge graph。
- 在实现公共契约前，先起草 `ADR-0001-scene-world-contract.md`。
- 在编辑第一个 upstream-owned hunk 前，先分配一个 SGP 条目。
- 执行 Agent 已阅读根目录、engine 和 AgentDocs 约束，以及总体计划。

## 当前源码事实

1. `packages/engine/Source/Scene/Globe.js:43` 将 `Globe` 定义为具体构造器，
   而不是接口。它会创建椭球地形、影像、矢量和 quadtree 对象。
2. `Globe` 已提供结构化主世界槽位所需的生命周期方法：`update`、
   `beginFrame`、`render`、`endFrame`、`destroy` 和 `isDestroyed`。
3. `packages/engine/Source/Scene/Scene.js:183` 初始化 `_globe`；约在第 989 行的
   公共 `scene.globe` setter 会销毁旧对象、赋值新 `Globe`，并安装
   `Globe` 专用 listener。
4. `Scene.js:798-818` 直接订阅 `imageryLayersUpdatedEvent` 和
   `terrainProviderChanged`；它们属于 `Globe` 能力，不是通用 world 成员。
5. Scene 目前直接通过 `Globe` 调用主 surface 生命周期：约在第 4445 行调用
   `update`、第 4525 行调用 `beginFrame`、第 3897 行调用 `render`，
   第 4536 行调用 `endFrame`。Scene 还会读取 `tilesLoaded`，以维持
   request-render mode。
6. `Scene.js` 还包含更多 `Globe` 专用行为，包括 terrain exaggeration、
   `_surface`、`depthTestAgainstTerrain`、cartographic height、
   ellipsoid occlusion 和 underground state。本阶段必须让这些访问继续只走
   `Globe` 路径。
7. `packages/engine/Source/Widget/CesiumWidget.js:157` 声明 `options.globe`；
   约在第 335 行的构造逻辑会创建默认 `Globe`、赋给 `scene.globe`，
   并设置 terrain shadow。
8. 同一构造器根据 `options.globe !== false` 决定 Earth sky atmosphere、
   默认影像和地形行为；sky atmosphere 还会解引用 `globe.show`。因此，
   自定义非 `Globe` world 需要显式构造分支，不能只替换一次赋值。
9. `packages/widgets/Source/Viewer/Viewer.js` 会转发 `options.globe`，
   并直接构建 `Globe` 专用 provider 和控件。Viewer 支持明确推迟到后续阶段。
10. Cesium Specs 已经使用有限的 `MockGlobe` 对象，说明运行时采用结构化类型；
    但这些 mock 仅满足个别调用路径，并不是完整的 world 契约。

行号仅用于定位当前基线。执行 Agent 在编辑前必须从当前分支重新发现 symbol
和调用路径。

## 详细设计

### 结构化契约

新增一个 SceneGIS-owned 公共 `@interface`：`SceneGISWorld`。它的必需契约
仅包含 `Globe` 与规划中的平面世界共同需要的成员：

```text
show
tilesLoaded
update(frameState)
beginFrame(frameState)
render(frameState)
endFrame(frameState)
isDestroyed()
destroy()
```

该接口只描述结构兼容性；`Globe` 不需要继承它，也不应仅为了声明符合接口而
修改 `Globe` 构造器。

`maximumScreenSpaceError` 属于 P3 的 surface/LOD capability，
`pickWorldCoordinates` 属于 P4 的 picking capability。二者都明确延后，不属于
P1 required contract，也不得为了提前冻结后续能力而加入本阶段接口。

以下内容不属于必需接口：

- `ellipsoid`、`Cartographic` 和 map projection
- 影像与地形 provider
- 大气、半透明和阴影
- 地下与地平线遮挡行为
- 高度采样与 terrain exaggeration
- `Globe` 私有 surface 字段

未来的可选能力必须显式表达，不得通过 `SceneGISPlanarWorld` 上虚假的空实现
成员表示。

### Scene 所有权与兼容性

- 增加一个内部 `_world` 引用和公共只读 `scene.world` 访问器。
- 默认 `Globe` 场景使 `_world` 与 `_globe` 指向同一个实例。
- 非 `Globe` world 只设置 `_world`，`_globe` 保持 `undefined`。
- 对于 `Globe` 场景，现有 `scene.globe` getter、setter 和 `Globe` listener
  行为保持兼容。
- 集中处理替换与销毁，确保同时被两个槽位引用的 `Globe` 恰好只销毁一次。
- 未启用自定义 world 时，保留运行时替换 `Globe` 的能力。非 `Globe` world
  占用槽位时，如果给 `scene.globe` 赋一个已定义值，必须抛出
  `DeveloperError`，不能静默切换，也不能形成两个主世界。
- 本阶段只将公共生命周期调用和 `tilesLoaded` 路由到 `_world`。
- 所有 `Globe` 专用便捷 API 和私有访问继续路由到 `_globe`，并保持当前
  guard 行为。
- 不提供受支持的运行时 `scene.world` setter。world 的选择发生在构造阶段；
  仅为向后兼容保留既有的 `Globe` 替换行为。

ADR 必须在核实现有构造顺序后选择最小的构造期初始化缝隙。优先设计是由
`CesiumWidget` 决定 world，并以该 world 初始化 Scene；自定义 world 场景
不应先创建再销毁一个默认 `Globe`。

### CesiumWidget 构造

- 为 `CesiumWidget.ConstructorOptions` 增加 `world`，类型为
  `SceneGISWorld | false`。
- 同时提供 `options.world` 与 `options.globe` 时抛出 `DeveloperError`。
- 两个选项均未提供时，保持既有的默认 `Globe` 构造。
- 对既有调用方保持 `options.globe` 和 `globe: false` 的行为。
- 提供非 `Globe` 的 `world` 时，不得通过该对象访问 `terrainShadows` 等
  `Globe` 专用属性。
- 将 `world: false` 解释为显式创建不含主世界的 Scene。
- 非 `Globe` world 不得自动创建 Earth skybox、Sun、sky atmosphere、Moon、
  默认影像或地形。显式提供的通用环境对象仍作为独立 Scene 选项处理。
- 对非 `Globe` world 显式提供 `baseLayer`、`terrainProvider` 或 `terrain`
  等 `Globe` 专用选项时，应抛错，不能静默忽略。
- 第一阶段不增加 Viewer 转发，也不自动修改 widget。

### 帧生命周期与显式渲染

- 保持当前 `update`、`beginFrame`、`render` 和 `endFrame` 的调用顺序。
- 保持现有的 `Globe` 影像与地形 listener 订阅。
- 本阶段不标准化自定义 world 自身的异步 invalidation 协议。后续平面世界阶段
  必须提供显式 event capability，或通过由 owner 明确提供的 hook 调用
  `scene.requestRender()`。
- 当 `scene.world.tilesLoaded === false` 时继续请求帧，与当前 `Globe`
  行为一致。

### 兼容性策略

- 普通 `Globe` 场景满足 `scene.world === scene.globe`。
- 安装非 `Globe` world 时，`scene.globe === undefined`。
- `scene.imageryLayers`、`scene.terrainProvider` 及其他现有 `Globe` 便捷
  属性保持当前的无 `Globe` 行为。
- 第一阶段不得宣称任意自定义 world 已支持 Cesium 相机控制、拾取、地形或
  widget。当前范围只有构造、帧生命周期和销毁。

## 影响路径

### SceneGIS-owned 新增文件

- `packages/engine/Source/SceneGIS/Scene/SceneGISWorld.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISWorldCesiumWidgetSpec.js`
- `Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md`
- `AgentDocs/planar-world/**`
- `.scenegis/upstream-patches.json`

### 预期修改的 upstream-owned 集成文件

- `packages/engine/Source/Scene/Scene.js`
- `packages/engine/Source/Widget/CesiumWidget.js`

执行 Agent 必须依据当前 source graph 确认最终影响文件清单。若需要增加其他
upstream-owned file，必须先记录明确的计划偏差并更新 SGP，之后才能编辑。

### 禁止编辑或提交的生成文件

- `packages/engine/index.js`
- `packages/engine/index.d.ts`
- `packages/engine/Specs/SpecList.js`
- `Source/Cesium.js`
- `Source/Cesium.d.ts`
- `Build/**`

## 实施步骤

1. 重新发现 Scene 生命周期、`Globe` 赋值、`CesiumWidget` 构造、销毁、
   request-render 行为及相关 Specs。
2. 编写并批准 `ADR-0001-scene-world-contract.md`，覆盖备选方案、所有权、
   兼容性、构造期选择以及禁止切换规则。
3. 为主世界生命周期缝隙分配一个 SGP，并列出全部预期 upstream-owned file
   和聚焦测试。
4. 新增 SceneGIS-owned `SceneGISWorld` 接口及其 API/实例化 Specs。
5. 向 Scene 增加最小的 `_world` 状态和公共只读访问器；集中管理所有权，
   但不改变 `Globe` 专用 API。
6. 通过主世界槽位路由公共帧生命周期、`tilesLoaded` 处理和销毁，同时保持
   完全相同的既有顺序。
7. 增加 `CesiumWidget` 的 `world` 构造选项、互斥校验及 no-world 行为，
   同时保持默认 `Globe` 构造。
8. 增加 SceneGIS-owned 集成 Specs，覆盖默认 `Globe` 身份、自定义 world
   生命周期、冲突错误、避免重复销毁以及持续 request-render。
9. 除新增 Specs 外，运行现有 Scene 和 `CesiumWidget` 聚焦回归测试。
10. 运行公共 API build 和类型检查；检查但不提交生成结果；依据 SGP 审计每个
    upstream hunk。
11. 在本计划和总体路线图中记录实现偏差、验证结果及第一阶段交接状态。

## 验证要求

至少需要提供以下证据：

- `SceneGISWorld` 接口和错误路径 Specs 通过。
- 默认 `CesiumWidget` 仍会创建 `Globe`，并满足
  `scene.world === scene.globe`。
- `globe: false` 仍然不创建 `Globe`，也不创建 world。
- `world: false` 不创建 world。
- 同时提供 `world` 和 `globe` 时，抛出文档所述的 `DeveloperError`。
- 对非 `Globe` world 提供 `Globe` 专用 base-layer 或 terrain 选项时，
  抛出文档所述的 `DeveloperError`。
- 非 `Globe` world 不会获得自动创建的 Earth sky atmosphere、影像或地形。
- 模拟的非 `Globe` world 按既有顺序收到 `update`、`beginFrame`、
  `render` 和 `endFrame`，同时 `scene.globe` 保持 `undefined`。
- `tilesLoaded === false` 的 mock world 会让 request-render mode 继续运行。
- 替换或销毁 `Globe` 时只销毁一次，并且 listener 只移除一次。
- 自定义 world 处于 active 状态时，给 `scene.globe` 赋已定义值会抛错，
  且自定义 world 保持不变。
- 现有聚焦的 Scene、`Globe` 和 `CesiumWidget` Specs 通过。
- 本阶段会修改公共 API 和生成声明，因此 `npm run build`、
  `npm run build-ts` 和 `npm run tsc` 均需通过。
- 相关 ESLint、Prettier 和 Markdownlint 检查通过。
- 已检查生成产物，但提交 diff 中不包含生成产物。

执行 Agent 应记录确切命令与结果，不能仅用“build 已通过”替代本清单。

## 风险与依赖

- Scene 当前的 `Globe` setter 负责所有权销毁和 listener。拆分所有权时，
  如果没有唯一 helper 管理状态迁移，可能造成重复销毁、listener 泄漏或
  alias 失效。
- 调整 `CesiumWidget` 构造顺序可能影响错误清理和默认环境行为；必须保持
  可观察到的默认值并增加聚焦测试。
- 过早增加公共接口可能固化不必要的成员。必需契约只保留两个目标 world
  已经明确共享的成员。
- 在相机与拾取被泛化前，自定义 world 已可进入帧生命周期。必须记录
  第一阶段的支持边界，不能将其描述为完整的平面场景。
- 上游以后可能增加直接访问 `_globe` 的生命周期代码。每次 Cesium 升级时，
  SGP 升级检查清单必须搜索 `_globe` 和 `scene.globe` 的使用者。

## 完成条件

- `ADR-0001` 已获批准，并与 SGP 双向关联。
- SGP manifest 准确列出全部被修改的 upstream-owned file 和聚焦测试。
- `SceneGISWorld` 位于 SceneGIS-owned 路径，并通过正常的 engine 公共 API
  生成流程导出。
- Scene 拥有唯一的主世界生命周期槽位；默认 `Globe` 场景使用该槽位时
  不发生视觉或 API 回归。
- `CesiumWidget` 可以构造只具备生命周期能力的自定义 world，而不会将其
  当作 `Globe`。
- world 与 `Globe` 的所有权、listener 移除和销毁都被自动化测试覆盖。
- 所有必需验证通过，并且没有提交生成文件。
- 本计划记录实际偏差和结果，状态改为 `completed`，同时更新总体阶段路线图
  和扩展索引。

## 偏差与结果

### 实际设计

- `SceneGISWorld` 保持 structural contract，没有修改 `Globe.js`。公开方法的
  `frameState` 参数在 JSDoc 中使用 `object`，因为 Cesium 的 `FrameState` 是
  private type，不能泄漏到公共声明；运行时调用参数与顺序没有变化。
- `Scene` 新增唯一 `_world`，并用 `setPrimaryWorld` 集中迁移 alias、Globe
  listener 和销毁所有权。`scene.world` 只读；`_initializeWorld` 是供
  `CesiumWidget` 构造期使用的 `@private` 窄入口。
- 只有 `update`、`beginFrame`、`render`、`endFrame`、`tilesLoaded` 和销毁
  路由到 `_world`。所有 terrain、imagery、ellipsoid、underground、occlusion、
  shadow 和 `_surface` 访问继续只走 `_globe`。
- `CesiumWidget` 在 DOM 分配前验证 `world`/`globe` 互斥和 custom world 的
  Globe-only options；custom world 与 `world: false` 都不会创建临时 `Globe`
  或默认 Earth skybox、Sun、Moon、sky atmosphere、imagery、terrain。
- `Sun` 的实际默认创建点是 `CesiumWidget` 的 skybox 安装分支，不是 `Scene`
  constructor。显式 `skyBox`/`skyAtmosphere` 等通用 environment option 仍保留
  现有安装路径；显式 `skyBox` 仍会沿用既有的关联 `Sun` 安装行为。

### 最终影响路径

SceneGIS-owned 新增或更新：

- `packages/engine/Source/SceneGIS/Scene/SceneGISWorld.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISWorldCesiumWidgetSpec.js`
- `Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md`
- `.scenegis/upstream-patches.json`
- `AgentDocs/planar-world/**`

Upstream-owned 修改仅有：

- `packages/engine/Source/Scene/Scene.js`
- `packages/engine/Source/Widget/CesiumWidget.js`

二者全部使用 `SGP-0001` paired marker。没有修改 `Globe.js`、Viewer、widgets、
camera、picking、terrain、imagery、Shader、Worker、build script 或生成源文件。

### 验证结果

| 命令                                                                                                                                                                                                                 | 结果                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISWorld"`                                                                                                                                                       | Exit 0；2/2 success。                                                                                                                                |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"`                                                                                                                                          | 最终 Exit 0；16/16 success。首次 15/16 暴露 custom world 的隐式 `Sun`；P1-R001 修复构造分支并恢复 `scene.sun` 空值断言后通过。                       |
| `npm run test -- --includeName "CesiumWidget"`                                                                                                                                                                       | Exit 0；91/91 success。                                                                                                                              |
| `npm run test -- --includeName "Globe"`                                                                                                                                                                              | Exit 0；126/126 success。                                                                                                                            |
| `npm run test -- --includeName "Scene/Scene"`                                                                                                                                                                        | Exit 0；143/143 success。                                                                                                                            |
| `npm run build`                                                                                                                                                                                                      | 最终 Exit 0；engine、widgets、Cesium unminified bundles 构建成功。                                                                                   |
| `npm run build-ts`                                                                                                                                                                                                   | 最终 Exit 0。首次 Exit 1 暴露 public JSDoc 泄漏 private `FrameState`；改用 `object` 后声明生成成功。仓库既有 TSD-JSDoc warnings 仍输出但不导致失败。 |
| `npm run build-docs`                                                                                                                                                                                                 | Exit 0；P1-R002/R003 修复后公共 API 文档生成成功。                                                                                                   |
| `npm run tsc`                                                                                                                                                                                                        | Exit 0。                                                                                                                                             |
| `npx eslint "packages/engine/Source/SceneGIS/**/*.js" "packages/engine/Specs/SceneGIS/**/*.js" "packages/engine/Source/Scene/Scene.js" "packages/engine/Source/Widget/CesiumWidget.js"`                              | Exit 0。                                                                                                                                             |
| `npx prettier --check "packages/engine/Source/SceneGIS/**/*.js" "packages/engine/Specs/SceneGIS/**/*.js" "packages/engine/Source/Scene/Scene.js" "packages/engine/Source/Widget/CesiumWidget.js" ".scenegis/*.json"` | Exit 0。                                                                                                                                             |
| `npx prettier --check --ignore-path .gitignore "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"`                                                                                                    | Exit 0。                                                                                                                                             |
| `npx markdownlint "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"`                                                                                                                                 | Exit 0。                                                                                                                                             |
| `git diff --check`                                                                                                                                                                                                   | Exit 0。                                                                                                                                             |
| `rg -n "SCENEGIS_PATCH_(BEGIN\|END) SGP-0001" packages/engine/Source/Scene/Scene.js packages/engine/Source/Widget/CesiumWidget.js`                                                                                   | Exit 0；两个 upstream-owned files 的 marker 均可定位。                                                                                               |

生成检查确认 `packages/engine/index.js` 根导出 `SceneGISWorld`，生成声明包含
`SceneGISWorld`、`Scene.world` 和 `CesiumWidget.ConstructorOptions.world`；生成
文件未进入 Git diff。P1-R002 修复后，`packages/engine/index.d.ts`、
`Source/Cesium.d.ts` 和 `Build/Documentation/**/*.html` 中 `SCENEGIS_PATCH` 命中数
均为 0。

未运行完整 15773 Specs、Sandcastle、E2E 和性能测试。P1 没有 Shader、Worker、
交互、视觉输出或热路径算法变化；专项测试加 `Scene`、`Globe`、`CesiumWidget`
代表性回归是本阶段的最小充分证据。

### 决策、补丁与剩余风险

- ADR：
  [ADR-0001 Scene primary world contract](../../../Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md)
- SGP：`.scenegis/upstream-patches.json` 中 `SGP-0001`，状态 `active`，风险
  `high`。
- Review：
  [P1 world contract review request](../reviews/2026-08-05-p1-world-contract.md)
  状态 `approved`；P1-R001 至 P1-R003 均已由 architecture reviewer 复核为
  `fixed`。
- 剩余风险：`Scene.js` 与 `CesiumWidget.js` 是高频上游变更点；升级时必须复核
  `_globe` 生命周期调用和 widget Earth 默认资源构造。custom world 在 P1 只有
  生命周期能力，不宣称支持 camera controls、picking、surface/LOD 或 Viewer。

P1-R001 至 P1-R003 已完成修复并通过 architecture re-review，本计划状态改为
`completed`。本次交接在阶段边界停止，不开始、设计或创建 P2 phase plan。
