# SceneGIS 开发指南

本文档说明 SceneGIS 的日常开发流程。强制规则由仓库根目录及相关包中的 `AGENTS.md` 定义；长期系统边界见 [Architecture.md](Architecture.md)；跨 Agent 协作方式见 [AgentDocs README](../../AgentDocs/README.md)。

文档中的“必须”和“不得”表示强制要求，“建议”表示默认选择；偏离建议时应在代码评审、SGP 或 ADR 中说明理由。

## 开始任务前

按以下顺序准备：

1. 确认当前分支、工作区状态和任务范围，保留不属于任务的现有修改。
2. 阅读作用域内的 `AGENTS.md`。
3. 对扩展范围内的实现或维护任务，确定其 `AgentDocs/<extension-slug>/`；新扩展先
   创建目录，已有扩展先阅读索引、active extension/standalone plan、current phase
   plan、open discussion 和未解决 review。仓库治理、协作规范维护和纯官方升级等
   非扩展任务不创建伪扩展目录。
4. 使用代码知识图谱确认相关符号、调用路径、构建入口和测试入口；图谱不足时再使用 `rg`。
5. 判断任务是否只涉及 SceneGIS-owned paths。
6. 判断是否需要架构阅读、ADR、SGP 或独立分支。
7. 扩展任务先选择 planning model。大型或分阶段扩展先确认 extension plan，进入阶段
   前再确认 phase plan；小型单阶段工作确认 standalone plan 后开始实现。非扩展任务
   使用其专用流程记录。

不得以“目录看起来相似”为依据假定 Shader、Worker、资源或类型会被正确构建。

## AgentDocs 协作流程

每个扩展使用一个 lowercase kebab-case 的稳定标识，例如 `terrain-materials`：

```text
AgentDocs/terrain-materials/
├── README.md
├── plans/
│   └── YYYY-MM-DD-<topic>.md
├── discussions/
│   └── YYYY-MM-DD-<topic>.md
└── reviews/
    └── YYYY-MM-DD-<topic>.md
```

首次开发扩展时，从 `AgentDocs/_template/` 建立目录并填写索引。一个独立扩展只使用一个目录；维护、缺陷修复和不同分支继续使用原目录。相同日期和主题发生文件名冲突时追加稳定序号，例如 `-02`，不得覆盖其他 Agent 的记录。

扩展 `README.md` 是交接索引，至少维护：

- 扩展状态、范围和非目标。
- 源码、测试、Sandcastle 和相关分支路径。
- Planning model、active extension/standalone plan、current phase 和 active phase plan。
- 相关 ADR、SGP 和 open discussion。
- 最新 review、未解决发现和下一步动作。

三类文档职责如下：

| 目录           | 内容                                                                                       | 状态示例                                              |
| -------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `plans/`       | Extension roadmap、phase/standalone 设计、步骤、验证、风险、依赖和完成条件                 | `draft`、`active`、`completed`、`superseded`          |
| `discussions/` | 提炼后的问题、证据、备选方案、权衡、结论、后续动作和正式决定链接                           | `open`、`resolved`、`superseded`                      |
| `reviews/`     | review target、发现严重度、负责人角色、证据、处置状态、follow-up、验证结果、结论和剩余风险 | `open`、`changes-requested`、`approved`、`superseded` |

协作顺序：

1. 架构 Agent 创建或校正扩展索引，并判断使用 extension/phase 还是 standalone
   planning model。
2. 大型扩展先创建 extension plan，确认稳定边界、phase roadmap、依赖、ADR/SGP
   触发条件和整体验收；尚未进入的阶段只保留粗粒度 entry/exit gate。
3. 阶段开始前重新检查当前源码和 open discussion，再创建 phase plan。涉及架构边界时
   保持 `Architecture review: pending`，由架构 Agent 核对后改为 `confirmed`。
4. 执行 Agent 负责 phase/standalone plan 的 `draft -> active -> completed` 流转；出现
   偏差时先回写当前 plan，改变总体边界时同步更新 extension plan，重大问题进入
   discussion。
5. discussion 只保存提炼后的源码事实和方案权衡，不粘贴原始对话。长期决定提升为
   ADR，并从 discussion 和扩展索引链接。
6. 评审 Agent 在 `reviews/` 新建记录，明确 review target、finding 严重度、负责人角色、
   证据、状态和 follow-up；执行 Agent 回填处置结果。
7. phase 完成时将 phase plan 标记为 `completed`，更新 extension roadmap 和索引
   handoff。所有 review finding 必须已解决、明确延期或链接到后续 plan。
8. Architecture Agent 将该 phase 的代码、Specs、ADR/SGP 和 AgentDocs 创建为一个
   独立本地提交检查点。提交完成前不激活或实现下一 phase；已经形成的下一阶段规划
   必须留在后续提交中。

仓库内 plan 是跨对话长期保存的交接资料，不替代 Agent 运行时计划。extension plan
回答“整体为什么做、分几步、何时完成”，phase plan 回答“当前阶段具体怎么做和验证”。
历史 plan、discussion 和 review 应标记 `superseded` 或 `resolved` 并链接后继文档，
不通过删除历史掩盖变化。

默认只提交 Markdown。不得在 AgentDocs 中保存 secret、本机绝对路径、原始聊天转录、大型日志、二进制、构建输出或可复用产品源码；验证证据应尽量链接到测试、提交或受版本控制的小型文本资料。

## 分支策略

分支用于开发隔离，不用于表达上游补丁身份。

| 工作类型                                   | 默认分支策略                      |
| ------------------------------------------ | --------------------------------- |
| 小型、原子、易验证、易回退的修改           | 可以直接提交到 `scenegis/develop` |
| 大型、跨模块、实验性、长期未完成或多人并行 | `feature/<description>`           |
| Cesium 官方版本升级                        | `upgrade/cesium-<version>`        |
| 已发布产品线维护                           | `release/<description>`           |

要求：

- 每个提交保持单一目的，即使没有独立分支。
- 分阶段扩展按 phase 提交。阶段实现、验证和 review 完成后先提交该阶段代码与文档，
  再进入下一阶段，禁止在一个提交中混合多个 phase。
- 不在普通功能提交中同步官方版本或更新 `upstream-base.json`。
- 不把格式化整个上游文件与功能改动混在一起。
- 不 force-push `main` 或 `scenegis/develop`。
- 分支名可以包含 SGP，但不是强制要求。

## 所有权判断

官方基线由 `.scenegis/upstream-base.json` 唯一确定。该提交中已存在的路径都是 upstream-owned files。

判断原则：

- 在基线提交中不存在、且位于根 `AGENTS.md` 所列 SceneGIS-owned roots 的文件，是 SceneGIS-owned。
- 在基线提交中已经存在的文件，即使当前放在常用扩展目录附近，也仍是 upstream-owned。
- 删除或重命名 upstream-owned file 仍属于上游修改。
- 新增不在允许根路径中的文件前，先更新架构文档说明其边界。

需要机器判断时使用基线 commit，而不是当前 merge-base：

```powershell
git cat-file -e "<upstream-base-commit>:<path>"
```

命令成功表示该路径在官方基线中存在。

## SGP：上游补丁追踪

`SGP-####` 是 SceneGIS upstream patch 的稳定追踪号。它回答“为什么必须修改上游”，不回答“在哪个分支开发”。

以下情况需要 SGP：

- 修改、删除或重命名 upstream-owned file。
- 修改 upstream-owned 构建、package、测试基础设施或工作流。
- 对无法注释的上游配置或二进制产生差异。

以下情况通常不需要 SGP：

- 只新增或修改 SceneGIS-owned files。
- 只新增 Sandcastle `scenegis-*` 示例。
- 只更新 SceneGIS 文档或 ADR。

一个 SGP 可以覆盖多个相关文件和多个提交，但只能对应一个稳定的集成目的。不同原因必须使用不同 SGP；同一集成点的后续修正继续使用原编号。编号退役后不得复用。

### 补丁清单

`.scenegis/upstream-patches.json` 是机器可读清单。active 条目至少包含：

```json
{
  "id": "SGP-0001",
  "title": "Expose a SceneGIS frame-stage hook",
  "status": "active",
  "reason": "The current Scene API cannot schedule the required stage.",
  "risk": "high",
  "files": [
    {
      "path": "packages/engine/Source/Scene/Scene.js",
      "markerMode": "paired"
    }
  ],
  "tests": ["packages/engine/Specs/SceneGIS/Scene/SceneGISFrameStageSpec.js"],
  "decision": "Documentation/SceneGIS/Decisions/ADR-0001-frame-stage.md",
  "removalCondition": "Retire when upstream exposes an equivalent stage hook."
}
```

字段约定：

- `status`：`proposed`、`active` 或 `retired`。
- `risk`：`low`、`medium` 或 `high`。
- `markerMode`：可注释文本使用 `paired`；JSON、删除、重命名、二进制等使用 `manifest-only`。
- `operation`：`modify`、`delete`、`rename` 或 `binary`；省略时视为 `modify`。
- `path`：`modify`、`delete` 和 `binary` 的目标路径。
- `from` / `to`：`rename` 的原路径和新路径，替代 `path`。
- `markerReason`：`manifest-only` 必填，说明为什么无法加入 paired marker，例如 JSON 不允许注释或文件已被删除。
- `tests`：列出验证补丁目的的测试或明确验证步骤，不只写通用 build。
- `decision`：只有存在 ADR 时填写；没有时省略。
- `removalCondition`：说明何时可以删除该上游补丁。

### 文本标记

每个独立修改 hunk 使用目标语言合法的注释语法包围：

```js
// SCENEGIS_PATCH_BEGIN SGP-0001: Expose a narrow frame-stage hook.
sceneGISFrameStage.update(frameState);
// SCENEGIS_PATCH_END SGP-0001
```

要求：

- 固定检索词只能是 `SCENEGIS_PATCH_BEGIN` 和 `SCENEGIS_PATCH_END`。
- 说明使用简短英文，描述集成目的，不写作者和日期；作者、日期由 Git 记录。
- 一个文件有多个不连续 hunk 时，每个 hunk 独立成对标记。
- 同一 SGP 可以在多个位置重复使用。
- 不在整个文件顶部放一个笼统标记。
- 不在 SceneGIS-owned 实现文件中添加标记。规范文档可以展示标记语法；审计时只检查相对基线发生变化的 upstream-owned files，不能把文档示例当成补丁。
- `manifest-only` 必须写明为什么无法使用 paired marker，并接受人工审查。

## 上游修改实现方式

修改 upstream-owned file 前依次考虑：

1. 现有 Cesium API 是否已经可以表达需求。
2. 是否可以完全在 SceneGIS-owned 模块中组合实现。
3. 是否可以增加一个小型 hook、回调、接口或状态入口，使主体逻辑保持在 SceneGIS。
4. 是否确实需要修改上游算法或渲染流程。

上游 hunk 中不放复杂 SceneGIS 业务逻辑。理想形式是导入或调用一个自有模块，并保留 Cesium 原控制流。

禁止：

- prototype monkey patch。
- 覆盖模块缓存或依赖加载顺序。
- 使用未登记的隐式全局变量改变 Cesium 行为。
- 复制整个 Cesium 类到 SceneGIS 后独立演化。
- 在同一 hunk 中顺手修复无关上游风格问题。

## Engine 源码约定

普通扩展按职责放入：

```text
packages/engine/Source/SceneGIS/Core
packages/engine/Source/SceneGIS/Renderer
packages/engine/Source/SceneGIS/Scene
packages/engine/Source/SceneGIS/DataSources
```

规则：

- 公共文件、default export 和 JSDoc 类型名统一使用 `SceneGIS` 前缀。
- 文件名使用 PascalCase 类名或与导出函数一致的 camelCase；basename 在 engine 全局唯一。
- 不创建局部 `index.js`。
- engine 内使用相对源码路径，不从生成 barrel 或包自身导入。
- 遵守 `packages/engine/AGENTS.md` 中的层次依赖。
- 源码、JSDoc、标识符和注释使用英文，并跟随 Cesium 的 ESLint、Prettier 和编码风格。

### 私有代码

Cesium 的私有是兼容性语义，不是 JavaScript 访问控制：

- 小型 helper 保持文件作用域。
- 私有字段使用 `_name`。
- 跨文件私有模块 basename 使用 `_SceneGISFoo.js`，可以同时放入 `_private/`，并标记 `@private`。不能只依靠目录名表达私有，因为当前根导出只使用 basename。
- 被普通源码 glob 命中的 JS 仍必须有 default export。
- 调用方不得 deep import 或依赖 SceneGIS 私有模块。
- 当前不为严格隐藏私有模块修改构建器；出现真实需求时再写 ADR。

## 特殊构建领域

首次涉及以下领域时，必须先阅读当前源码并判断后记录：

- GLSL、`czm_*` builtin 和 Shader 生成。
- Web Worker、inline worker、输出目录和运行时 URL。
- WASM、图片、静态数据和 CDN/base URL。
- CSS、Widgets 和模块副作用。
- Model pipeline stage、Scene render loop 和 Globe 渲染。

如果决定影响多个功能、公共 API、构建发布或官方升级，则创建 ADR。ADR 不应只记录最终代码，应记录源码事实、备选方案、选择理由、测试和升级检查点。

## 测试策略

测试目录镜像源码：

```text
packages/engine/Source/SceneGIS/Scene/SceneGISFoo.js
packages/engine/Specs/SceneGIS/Scene/SceneGISFooSpec.js
```

按风险选择验证：

| 变化                    | 最低验证                                                 |
| ----------------------- | -------------------------------------------------------- |
| 纯函数、数据转换        | Jasmine 单元测试和错误输入                               |
| 公共 API                | 单元测试、根入口导入、JSDoc/类型生成                     |
| WebGL、Shader、渲染状态 | WebGL matcher、默认画面、状态变化、销毁                  |
| 交互和完整场景          | Specs、Sandcastle、必要的 Playwright                     |
| 热路径和缓存            | 正确性测试、资源生命周期、可重复性能对比                 |
| 构建或发布              | development build、release build、包内容和运行时资源路径 |
| upstream patch          | SGP 中列出的专项验证和受影响上游测试                     |

常用命令：

```powershell
# 完整构建
npm run build

# 生成 TypeScript 声明
npm run build-ts

# 编译并检查 TypeScript 声明
npm run tsc

# 按名称运行相关 Jasmine Specs
npm run test -- --includeName SceneGISFoo

# 格式与静态检查
npm run prettier-check
npm run eslint

# 按名称运行相关 E2E
npm run test-e2e -- -g "SceneGIS Foo"
```

不要求每个局部修改运行所有命令，但必须说明实际运行了什么、为什么足够，以及未运行检查的原因。

## Sandcastle 示例

可视化或交互型公共功能应提供：

```text
packages/sandcastle/gallery/scenegis-<domain>-<feature>/
├── index.html
├── main.js
├── sandcastle.yaml
└── thumbnail.jpg  # optional
```

可以使用：

```powershell
npm run create-demo -- scenegis-<domain>-<feature>
```

随后必须修正默认 title、description 和 labels。统一使用 `sandcastle.yaml`，所有 SceneGIS 示例添加 `SceneGIS` label。开发调试页使用 `-dev` 和 `development: true`。

Sandcastle 负责展示和人工验收；边界条件、资源释放和内部状态必须由 Specs 覆盖。关键交互和持久画面变化使用 Playwright。

### 平面影像实现检查

实现或评审 `SceneGISPlanarWorld` imagery 时同时检查：

- provider 的 `tilingScheme` 必须与 world 的 canonical scheme 保持 object identity；collection
  owns layer，provider 始终由调用方拥有。
- `tilesLoaded` 汇总当前视图 terrain coverage/readiness 与当前 shown imagery readiness；任何
  recoverable direct content pending 都不能提前标为 loaded，terminal failure 配合稳定 fallback 才可 settled。
- 对 imagery contribution，每个 binding 只请求 desired 与必要的 Level 0 bootstrap，不主动推进 intermediate ancestor；
  cache 中已有的最近 READY ancestor 可以复用，reference 切换和 eviction 必须 exactly once。
- 每个 ideal tile 保持一个 opaque command；shown layer 数必须在任何 request 或 GPU mutation
  前按 texture-unit limit fail-fast，不能用 multipass 绕过。
- provider failure、retry、cancel、stale generation、decoded image close、texture destroy 和第二
  Context 拒绝都需要自动化 Specs；Sandcastle 外网结果不能替代这些证据。
- `scenegis-planar-imagery` 只展示 engine-level 显式组装。不要在 P5 示例中加入 Viewer、widgets、
  provider picker、离线下载或预取；这些属于后续 UI 集成阶段。

### 平面 URL Heightmap Provider 检查

实现或评审 URL-template terrain provider 时同时检查：

- 只接受调用方提供的 canonical `SceneGISPlanarTilingScheme`；不要读取 CRS、创建等价 scheme、
  发现 metadata 或执行重投影。
- 分开验证 URL address、payload encoding 和 boundary-inclusive sample placement。TMS 只转换 URL
  row；image 自然 row order不得使用 imagery `flipY`。
- Image 必须有与RGBA stride一致的显式structure；constructor完整验证scale/offset、multiplier、
  endian与`dimensions * stride`，request使用`skipColorSpaceConversion: true`保持数值channel，并
  exactly once关闭`ImageBitmap`。该color-space option依赖浏览器支持，不增加隐式补偿。LERC只接受
  单numeric band、精确dimensions、全有效mask/NoData/statistics和finite sample。
- `fetchImage`/`fetchArrayBuffer` 返回 `undefined` 时同步传递 scheduling defer。Provider 不重试、
  不 raise 第二次 error、不缓存 TerrainData，也不拥有 caller Request 或 World。
- Global `provider.credit` 由Surface单独显示，不得复制到每个`TerrainData.credits`；只有真正的
  per-tile attribution才进入TerrainData。
- 自动化使用本地 Resource/LERC fixture。公开 terrain Sandcastle只作 best-effort人工检查，必须
  显示 Credit、说明 CORS/服务失败 fallback，并禁止预取、批量或离线下载。

### 平面地形光照检查

- 默认`enableLighting=false`必须保留unlit shader fast path；lit/unlit shader cache key同时包含
  shown layer count与lighting flag。`lambertDiffuseMultiplier`只经uniform读取，修改它不得创建
  command、shader、mesh或其他GPU/request资源。
- Lit variant从eye-space position的`dFdx`/`dFdy`计算实际triangle geometric normal，并使用
  face-forward保持双面surface。不要增加CPU normals、normal buffer、back-face culling或camera
  collision。
- Base color和imagery必须先完成single-pass bottom-to-top合成，再统一应用scene light、Lambert与固定
  ambient；depth pick仍只重放最近normal render的exact command references。
- Real Context Spec至少证明lit/unlit像素不同、terrain/imagery single command、warm allocation收敛、
  multiplier uniform-only、surface下方可见与destroy平衡。Sandcastle使用显式稳定
  `DirectionalLight`，但公网画面只能作为人工best-effort验收。
- Standard derivatives、automatic light uniforms与ShaderProgram cache是升级检查点。没有可重复的
  main-thread阻塞证据时保持现有decode/mesh和promotion budget；Worker需要独立phase/ADR。

### 平面 Viewer 集成检查

实现或评审 `Viewer({ world })` 时同时检查：

- `world` 只接受 live `SceneGISPlanarWorld`；generic world、`world: false`、destroyed world 和
  任意 defined `globe` 都必须在 Viewer child DOM、WebGL Context、controller 或 request mutation
  前 fail-fast。没有 `world` 的默认 Globe 与 `globe: false` 路径必须保持原行为。
- planar Viewer 固定 `SCENE3D`/`scene3DOnly`，禁止 Earth base layer、terrain、map projection、
  provider view model，以及 Geocoder、mode/projection picker、NavigationHelp 和 VR。Animation、
  Timeline、Fullscreen、SelectionIndicator、InfoBox title/description 与 planar Home 保持可用。
- Viewer 必须关闭 legacy camera inputs，通过 `ControllerHost` 注册唯一
  `SceneGISPlanarCameraController`，并在 CesiumWidget/Scene/world destroy 前 exactly-once remove。
  registration failure 也必须释放已经连接的 aggregator 和 child state。
- planar Home 只调用 `controller.viewHome(scene)`。InfoBox camera、double-click tracking、defined
  `trackedEntity`、`zoomTo` 和 `flyTo` 不属于当前能力，必须同步拒绝；left-click selection 保留。
- planar imagery 仍由应用通过 canonical `world.tilingScheme` 和 `world.imageryLayers` 显式组装；
  `scenegis-planar-viewer` 只演示该高层 ownership，不引入通用 provider picker、预取或离线下载。

### 平面内容实现检查

实现或评审 planar Entity/DataSource content 时同时检查：

- 输入必须是 finite meter-based Cartesian3，使用固定 X east/Y north/Z up；anchor X/Y extent boundary
  inclusive，outside 返回不可见结果而不是 clamp 或 camera mutation。
- HeightReference 只接受 `NONE`、`CLAMP_TO_GROUND`、`RELATIVE_TO_GROUND`。Resolver 只读
  `world.getTerrainHeight`，undefined 回退 Z=0；不得调用 Scene height、depth pick、terrain ray pick 或
  隐式 sampler request。
- 所有 validation、terrain read和relative addition必须在 output/resource mutation 前完成；result
  alias input时也必须保持失败原子性。Resolver 不建立 subscription、request、cache或ownership。
- Orientation undefined 使用 translation-only identity rotation；defined Quaternion映射固定planar
  axes。禁止通过 `eastNorthUpToFixedFrame` 引入位置相关 ECEF frame。
- Automatic adapter 使用 instance-owned graphic/config allowlist，并替换而非追加会消费相同 graphics 的
  默认 Globe visualizer。Unsupported 输入必须在低层资源 mutation 前抛 `DeveloperError`，不得 warning、
  silent ignore或Globe fallback。
- C4 automatic path 只接受 live planar World、`CustomDataSource` 与 disabled `EntityCluster`。业务 metadata
  使用 `Entity.properties`；未知或 unsupported top-level Property 必须在所有 child normal update 和低层资源
  mutation 前拒绝。同步 collection listener 可以先更新 CPU tracking。
- 升级时复核 default visualizer、clamping、model matrix、`DataSourceDisplay` callback/update snapshot、
  per-DataSource primitive container、ordering 和 destroy lifecycle。
- C2 Anchor只使用caller-owned disabled `EntityCluster` pool，低层对象接收absolute planar position；
  temporary hidden/outside保留slot，graphic/entity removal与destroy成对归还。
- C2 Model的URI/load-time generation、candidate与active primitive必须隔离；Promise completion只缓存并
  request render，下一normal update才add。Stale、replacement和destroy路径都要exactly-once cleanup。
- Model transform只使用fixed planar translation/normalized Quaternion。不要调用`computeModelMatrix`、
  ENU或Model height clamping。
- C3 Polyline只允许`ArcType.NONE`的planar straight segments；clamp逐supplied vertex调用resolver，不做
  geodesic/rhumb、ground primitive或隐式terrain采样/细分。C6迁移后`width`接受finite nonnegative number，
  0隐藏，不得重新引入Buffer Uint8的integer/255限制。
- C3 Polygon只接受simple outer ring与direct holes。Scalar height、per-position height、extrusion、caps、
  side walls与outline必须先完整preflight，再以local DOUBLE geometry、translation `modelMatrix`和explicit
  world bounds原子替换；terrain drape是vertex-only sampling。C6迁移后`outlineWidth`与Polyline width采用相同
  finite nonnegative规则。
- C6 public Geometry必须clone finite米制Cartesian3输入、以完整XYZ local origin重基，并只输出审计过的
  standard Geometry vertex format。Polyline固定`ArcType.NONE`；Polygon只使用XY triangulation，不调用Ellipsoid
  subdivision或ground path。
- C6 public Primitive固定single GeometryInstance与`asynchronous:false`，只接受approved SceneGIS geometry/
  Appearance pair。Geometry replacement只在normal render通过candidate/current完成；pick/depth不得promote，失败
  保留current。第二Context、invalid matrix/bounds和destroyed use必须在mutation前拒绝。
- Polyline/Polygon automatic Entity adapter必须复用public SceneGISPlanarPrimitive，并保留original Entity id、
  per-DataSource target、world bounds和exactly-once lifecycle；不得继续引用private Buffer owner、experimental
  collection私有字段或建立dual runtime。
- C7 public Box/Cylinder/Ellipsoid Geometry只描述以center为origin的local Cartesian volume，并与closed、non-flat
  `PerInstanceColorAppearance`配对。跨geometry kind replacement继续fail-fast；Plane/Ellipse/Rectangle必须降级到
  public Polygon/Polyline，不能调用upstream ellipsoid-oriented Geometry。
- Solid的clamp/relative anchor在resolver结果上增加未旋转support height；Area的Ellipse position.z不参与surface
  height，Rectangle coordinates按meters严格有序。Ellipse/Rectangle只在generated vertices读取terrain；`NONE`
  geometry可以越过extent，ground-referenced vertex outside则隐藏current graphic。
- C4 callback顺序固定为Anchor、Model、Polyline、Polygon、Solid、Area。六类C7 Graphics只支持Color material、
  disabled shadows与批准字段；partial Ellipsoid、Rectangle granularity、stRotation、classification和zIndex必须在
  child低层mutation前拒绝。
- C8 public Wall Geometry必须使用XY route与explicit top/bottom生成open non-flat mesh；PolylineVolume Geometry的
  shape +X映射route-left、+Y映射world-up，并以planar corner stations生成closed mesh。不得调用upstream
  Corridor/Wall/PolylineVolume Geometry、ENU、Cartographic或geodesic subdivision。
- Corridor必须降级到public Polygon/Polyline，Path必须降级到public Polyline。Corridor rounded granularity是
  planar corner angle step，terrain仍只采样generated perimeter；Wall/PolylineVolume不隐式terrain clamp。
- Path sampler只能以`ReferenceFrame.FIXED`调用Cesium property sampler；non-FIXED position、INERTIAL、
  entity-relative/VVLH、`PathMode.PORTIONS`必须fail-fast。Callback顺序在既有Area后追加Route、Path，existing children
  顺序不变。
- C4 callback第一次合法update只原子追加Anchor、Model、Polyline、Polygon并返回false；children必须等下一次
  update。Model/Polyline/Polygon自动路径使用`dataSource._primitives`，显式private构造省略target时仍使用
  `scene.primitives`；两种路径都不拥有caller collection。
- C5先以固定moderate profile验证initial/warm/local mutation/remove/destroy；Anchor仍使用Cesium pool，
  Model逐实例，Polyline/Polygon保持per-Entity owner。没有可复核热点时不得为了“批量”重写runtime。
- Content timing固定对象数、viewport、build、warmup和样本协议，分开记录display update与render
  median/P95；timing不是跨机器hard assertion。Hard gate是slot/owner/command/VA identity、dirty/copy、
  persistent resource与exactly-once lifecycle收敛。
- Content Sandcastle可以使用公开imagery/terrain做best-effort人工展示，但local E2E必须阻断公网并覆盖
  automatic content、dynamic update、original Entity selection、remove和destroy；不新增workflow。

## Planar World release qualification 检查

- 在修改 runtime 前先固定 viewport/build/warmup/sample protocol，采集 bare、imagery 和 motion baseline；没有 failing gate 或可复核热点证据时不做产品优化。
- multi-tile warm、multi-layer warm、camera/cache churn、depth replay 和 layer churn 必须检查 persistent counters 与 cache/resource 收敛，不把单帧 FPS 当作生命周期证据。
- lightweight owner cycles 与串行 real WebGL Widget/Viewer cycles 分开执行；每轮检查 provider non-ownership、late async isolation、controller/DOM baseline 和 exactly-once release。
- 运行 `node scripts/scenegis/audit-upstream-patches.mjs` 及其 destructive fixtures；审计脚本必须只读且失败非零退出。
- build/types/docs 后在临时目录检查 workspace 与 installed tarball imports；E2E 使用本地 imagery 并分别覆盖 dev/release bundle，不访问公网。
- 使用指南见 `Documentation/SceneGIS/PlanarWorldGuide.md`，官方升级前按 `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md` 逐项复核 private semantic 与 SGP。

## 生成文件与构建输出

以下内容由现有工具生成，不作为手工维护源：

```text
packages/engine/index.js
packages/engine/index.d.ts
packages/engine/Build/**
packages/engine/Specs/SpecList.js
Source/Cesium.js
Source/Cesium.d.ts
Specs/SpecList.js
Build/**
```

如果生成结果错误，修改源模块、JSDoc、构建器或配置，不在生成文件中打补丁。修改 upstream-owned 生成器或配置时仍需 SGP。

## 完成任务前检查

- [ ] 修改位于正确的 owned root 和架构层。
- [ ] 没有意外修改或提交生成文件。
- [ ] 公共 API 名称、default export 和 JSDoc 一致。
- [ ] 没有从 engine 内部导入自身 package/barrel。
- [ ] 每个 upstream-owned hunk 都有有效 SGP 和 paired marker，或有合法 `manifest-only` 说明。
- [ ] 没有混入无关格式化、重构或上游同步。
- [ ] Specs、Sandcastle、E2E 和性能验证与风险相称。
- [ ] 长期架构决定已经记录 ADR，并链接相关 SGP。
- [ ] 当前 phase/standalone plan、parent extension roadmap、discussion、review 和扩展
      索引已反映最终状态、验证结果与剩余事项。
- [ ] 最终报告列出验证结果、上游文件、SGP 和剩余风险。
