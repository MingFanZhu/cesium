# SceneGIS 开发指南

本文档说明 SceneGIS 的日常开发流程。强制规则由仓库根目录及相关包中的 `AGENTS.md` 定义；长期系统边界见 [Architecture.md](Architecture.md)；跨 Agent 协作方式见 [AgentDocs README](../../AgentDocs/README.md)。可重建的对话角色见 [Architecture Agent](AgentRoles/ArchitectureAgent.md) 和 [Execution Agent](AgentRoles/ExecutionAgent.md)。

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
- 源码、测试、`Test/**` 开发示例、保留的legacy Sandcastle和相关分支路径。
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
- 只新增 `Test/**` SceneGIS开发示例，或维护已有Sandcastle `scenegis-*` 示例。
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
| 交互和完整场景          | Specs、`Test/**`开发示例、必要的 Playwright              |
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

## SceneGIS 开发示例

可视化或交互型公共功能默认在SceneGIS-owned `Test/**`下提供一个可由根Cesium开发服务器直接访问的HTML入口：

```text
Test/
├── <名称>.html
├── <feature>/        # 复杂示例可选
│   ├── index.html
│   └── ...
└── lib/              # 仅供示例使用的本地第三方浏览器库
```

简单示例优先使用单HTML文件；结构复杂时才拆为子目录。页面必须在Cesium import前设置：

```html
<script type="module">
  window.CESIUM_BASE_URL = "/Build/CesiumUnminified/";
  const Cesium = await import("/Build/CesiumUnminified/index.js");
</script>
```

只加载ESM `index.js`；不得再以`<script src>`同时加载`Cesium.js` IIFE，否则会产生两份Cesium module identity。
示例默认使用本地确定性数据，不包含access token或其他secret。开发便利所需的公开diagnostic reference可以挂在`window`，
但不得成为产品API。

`Test/lib/**`可以保存经典WebGL/UI等浏览器库，但必须在`Test/lib/README.md`登记固定版本、上游来源、许可证和使用页面，
并一并保存许可证文本。产品源码不得导入该目录。

当前upstream `.prettierignore`的directory allowlist尚未包含新`Test/**`根目录；在不修改upstream config的前提下，
Test页面必须使用显式命令检查，例如
`npx prettier --check --ignore-path .gitignore "Test/**/*.html" "Test/**/*.md"`。不要把默认`prettier-check`没有报告
Test文件误当成已验证。

开发示例负责组装和人工验收；边界条件、资源释放和内部状态必须由Specs覆盖。关键交互和持久画面变化使用Playwright。
tool/control panel面向用户的标题、标签、按钮、选项说明、帮助文字和状态提示统一使用中文；API名称、枚举值、源码标识符、
代码片段和必须与Cesium对齐的技术术语保持英文。

已有`packages/sandcastle/gallery/scenegis-*`示例作为legacy案例保留，不要求为本次约定迁移。后续只有在明确验证上游
Sandcastle集成、gallery兼容性或维护既有案例时才继续修改它们；新能力默认补`Test/**`示例。

### 平面影像实现检查

实现或评审 `SceneGISPlanarWorld` imagery 时同时检查：

- 通用协议入口见 ADR-0082：验证 WMS 版本 / 轴序与米制 BBOX、WMTS REST / KVP / matrix labels、
  TMS XML 的网格及相对 href。Resource query / headers / proxy 与 Request identity 必须保留。
  SingleTile 非正方形像素图像要在真实 GPU 上传验证；共享 provider 不得复用 closable ImageBitmap。
  WMTS dimensions 标脏必须唤醒 request-render readiness，多个 layer 均重载，监听器随 runtime 释放。

- provider 的 `tilingScheme` 必须与 world 的 canonical scheme 保持 object identity；collection
  owns layer，provider 始终由调用方拥有。
- `tilesLoaded` 汇总当前视图 terrain coverage/readiness 与当前 shown imagery readiness；任何
  recoverable direct content pending 都不能提前标为 loaded，terminal failure 配合稳定 fallback 才可 settled。
- 对 imagery contribution，每个 binding 只请求 desired 与必要的 Level 0 bootstrap，不主动推进 intermediate ancestor；
  cache 中已有的最近 READY ancestor 可以复用，reference 切换和 eviction 必须 exactly once。
- 每个 ideal tile 保持一个 opaque command；shown layer 数必须在任何 request 或 GPU mutation
  前按 texture-unit limit fail-fast，不能用 multipass 绕过。
- provider failure、retry、cancel、stale generation、decoded image close、texture destroy 和第二
  Context 拒绝都需要自动化 Specs；开发示例的外网结果不能替代这些证据。
- `scenegis-planar-imagery` 只展示 engine-level 显式组装。不要在 P5 示例中加入 Viewer、widgets、
  provider picker、离线下载或预取；这些属于后续 UI 集成阶段。

### 平面 URL Heightmap Provider 检查

`SceneGISPlanarLayerTerrainProvider` 是 ADR-0080 的独立服务入口，负责异步 layer.json、显式平面 profile、
canonical scheme 校验与稀疏 availability。以下检查约束原 URL-template provider，不禁止服务层解析元数据。
元数据接入必须验证目录/JSON 相对 URL、Request/Resource 保留、TMS/XYZ、缺失全局高度与实际 producer 产物。

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

### 平面地形裁剪检查

- World 属性复用原生 `ClippingPlaneCollection` / `ClippingPolygonCollection` / `ClippingPolygon`，
  不新增同义公共类型；polygon 使用 XY 米制直线环，不调用原生球面 compute。
- 修改仅在 normal render 发布；颜色、linear/log depth 与 terrain ray 使用同一快照，
  被裁掉的最近 ray 交点不能阻止继续查找后方可见交点。resident height 和独立 sampler 保持源数据。
- 覆盖 plane 交/并、modelMatrix、edge style、凹 polygon、多区域、inverse、增删与原地修改，
  并验证大 CRS 偏移、非法环、独占集合所有权、sampler 预算和 GPU 资源销毁。
- 默认无纹理；稳定帧无上传或 shader/command 重建，动态数量使用同一 shader。
  新增 GLSL 走既有生成与 package 链，不手工维护生成模块。详见 ADR-0081。

### 平面地形光照检查

- 默认`enableLighting=false`必须保留unlit shader fast path；shader cache key同时包含shown layer count、
  lighting flag与normal mode。`lambertDiffuseMultiplier`只经uniform读取，修改它不得创建command、shader、
  mesh或其他GPU/request资源。
- Lit non-flat terrain必须使用existing Worker mesh task按真实Heightmap/Quantized surface topology生成的
  area-weighted `Uint8x2` oct normals；skirt duplicate复制surface normal且skirt triangles不参与累计。Main thread
  必须验证exact TypedArray与`2 * vertexCount` byte length，再与position/index/VA放入同一原子GPU lifecycle。
- Worker normal必须在tile extent的真实meter XY与meter Z中累计；oct stream是fixed planar world-axis normal，不能在
  unit-local XY/meter Z混合尺度上先量化。Smooth variant以`czm_octDecode`和`czm_viewRotation`恢复并插值eye-space
  normal；flat/no-provider和active `FLAT`
  fallback继续使用`dFdx`/`dFdy` geometric normal，unlit不得读取normal attribute。Smooth lighting保持Worker
  topology-up方向，geometric fallback必须归一到planar `+Z` hemisphere；double-sided可见性不能用camera-facing
  normal决定。不要增加back-face culling、runtime邻居normal registry或camera collision。
- Base color和imagery必须先完成single-pass bottom-to-top合成，再统一应用scene light、Lambert与固定
  ambient；depth pick仍只重放最近normal render的exact command references。
- Real Context Spec至少证明smooth/geometric/unlit mode、lit/unlit像素不同、terrain/imagery single command、
  2-byte normal stream、two-buffer warm allocation收敛、multiplier uniform-only、surface下方可见与destroy平衡。
  Sandcastle使用显式稳定
  `DirectionalLight`，但公网画面只能作为人工best-effort验收。
- Standard derivatives、oct decode、normal matrix、automatic light uniforms与ShaderProgram cache都是升级检查点。
  A6只保证task-local/representative continuity，不得把通过证据扩大为任意provider tile的universal seam guarantee。

### 平面地形 Worker 检查

- 唯一批准entry为`packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js`；它只包装
  SceneGIS private handler。不要把terrain算法写入entry，也不要预防性修改`bundleWorkers`或package manifest。
- `decodeLerc`只transfer provider-owned compressed buffer并返回decoded samples；`createHeightmapMesh`只transfer
  TerrainData raw buffer的独立clone并返回positions/metadata。TerrainData-owned原buffer、indices、Request、
  provider和GPU objects不得转移。
- Worker result必须在主线程按kind、TypedArray、length/count和finite metadata完整preflight；GPU upload、bounds、
  active switch和LRU仍只能发生在normal render。
- Mesh task每normal frame最多启动两个，GPU promotion仍最多两个；pending task参与current-view readiness。Flat
  no-provider path必须保持零Worker creation/task/payload clone。
- TaskProcessor 1.144没有per-task abort。取消要区分fetch Request cancellation、提交前不再schedule与active late
  result generation isolation；不得通过destroy共享Worker冒充单tile取消。
- Focused验证覆盖真实TaskProcessor Worker、LERC/mesh transfer、stale/retry/fallback、depth replay、resource
  lifecycle、development/release与installed-tarball Worker文件；不增加浏览器/driver大矩阵。

### 平面 Quantized-mesh Terrain 检查

- Public provider只接受caller-supplied canonical tiling scheme与显式URL/range/error配置；不要读取`layer.json`、
  projection或CRS，也不要把header ECEF center/bounds/horizon用于planar runtime。
- Binary decode必须在Worker中逐段执行safe length/alignment preflight，再验证delta/zig-zag vertices、high-water
  indices、CCW triangles、edge coverage和extension length。A5只请求base format并安全跳过extension。
- TerrainData接管decoded TypedArrays，但mesh/upsample task只能transfer独立clone。Public min/max是实际surface
  vertex range；private quantization range不得误暴露为另一个generic TerrainData contract。
- Quantized child fallback必须裁剪父级真实triangles并继续输出Quantized data；不得为了复用Heightmap路径进行规则
  重采样。所有terrain Worker task共享normal-frame start预算，Promise callback只发布CPU state。
- Heightmap shared regular-grid index ownership保持；Quantized index buffer逐tile拥有并在rollback、replacement、
  eviction、detach、destroy中exactly once释放。Query cell index必须有linear storage bound和single-cell退化路径。
- 使用仓库内small/32-bit fixture、一个real Context closure与installed-package Worker验证。不要建立截断byte穷举、
  公网自动化、E2E或driver矩阵；A6 normal extension不得提前混入A5。

### 平面 Viewer 集成检查

实现或评审 `Viewer({ world })` / `Viewer({ planarWorld })` 时同时检查：

- `world`只接受live `SceneGISPlanarWorld`；`planarWorld`只接受non-null/non-array raw config，并把extent、CRS和
  World字段转发给对应public constructors。两者与任意defined `globe`严格互斥，所有确定性config/option错误必须在
  Viewer child DOM、WebGL Context、controller或request mutation前fail-fast。没有planar入口的默认Globe与
  `globe: false`路径必须保持原行为。
- helper不得访问DOM/Context/provider或保留config引用。成功后`viewer.planarWorld === viewer.scene.world`；后续
  runtime只能消费这个resolved reference。provider必须在Viewer返回后使用resolved `world.tilingScheme`显式创建。
- planar Viewer 固定 `SCENE3D`/`scene3DOnly`，禁止 Earth base layer、terrain、map projection、
  provider view model，以及 Geocoder、mode/projection picker、NavigationHelp 和 VR。Animation、
  Timeline、Fullscreen、SelectionIndicator、InfoBox title/description 与 planar Home 保持可用。
- Viewer 必须关闭 legacy camera inputs，通过 `ControllerHost` 注册唯一
  `SceneGISPlanarCameraController`，并在 CesiumWidget/Scene/world destroy 前 exactly-once remove。
  registration failure 也必须释放已经连接的 aggregator 和 child state。
- planar Home只调用`controller.viewHome(scene)`。`zoomTo`/`flyTo`仅接纳精确Entity/DataSource profile；
  `trackedEntity`仅接纳真实Entity、FIXED position与AUTODETECT/ENU fixed-axis tracking。InfoBox camera按当前sample在
  track/untrack与DONE-bounds zoom之间选择，left-double-click使用同一track-or-zoom规则，left-click selection保留。
- tracking controller必须晚于planar input controller注册，使用独立计数token暂停input；不得复用Earth `EntityView`、读取
  orientation或接受INERTIAL/VELOCITY。Direct Camera flight暂时优先，successful framing/Home/remove/destroy必须
  exactly-once释放definition listener、Camera transform与token。
- planar imagery仍由应用通过canonical `world.tilingScheme`和`world.imageryLayers`显式组装；
  `scenegis-planar-viewer` 只演示该高层 ownership，不引入通用 provider picker、预取或离线下载。

### 平面 Environment Controller检查

- Environment必须是caller-created并显式`addController`；World只登记一个reference且不拥有它。调用方在destroy host前先
  `removeController`。ControllerHost在`connectedCallback`前已插入controller，因此只注册已通过constructor validation的
  instance，不宣称callback failure会回滚host。
- Manual celestial direction固定为`+X East/+Y North/+Z Up` observer-to-body，`DirectionalLight.direction`必须取负。
  禁止使用Earth SunLight、automatic celestial uniform或CRS推断替代显式方向。
- First update前不写`scene.light`；active update可reassert同一stable light但不得每帧request render。Disable/remove/world
  sever必须按当前light reference conditional restore，并保留外部override。
- Environment light authority是scene-wide而非terrain-only；不能自动切换`world.enableLighting`。E1 Moon只保存状态。

### 平面地形感知导航锚点检查

Camera public API 的回归应直接创建真实 Camera，覆盖非 identity transform 的 HPR / setView / flyTo、
lookAtWorldPosition 的固定 +Z up、四类 frustum 的 public getPickRay 和 frame update。
正交 move / rotate 保持宽度，zoom 改变 span；changed 不能使用 positionCartographic.height 计算平移比例，
还须检测无位移的正交缩放。负 roll 读取与 Cesium 的非负一周范围一致；应用位置一律使用 Cartesian 状态。

实现或评审planar controller gesture时同时检查：

- Pan、rotate与wheel共享一份private anchor resolver，严格按合法in-extent rendered depth、
  `world.pickTerrain(ray)`、`world.pick(ray)`顺序解析；depth命中后不得重复线性terrain query。
- Pan drag与rotate drag只在press时解析一次；pan movement与wheel correction使用anchor自身Z的水平面。
  Wheel每次event重新解析pointer anchor，但复用controller-owned scratch，不在hot path分配对象。
- 惯性延续最后消费输入的 anchor/pivot/window pointer，按 wall-clock release elapsed time 衰减；
  不在惯性帧重新做 depth/terrain picking，也不受 simulation Clock 暂停影响。`inertiaSpin`、
  `inertiaTranslate`、`inertiaZoom` 接受 finite `[0,1)`，0 立即取消对应余速。新 press、外部 pose、
  Home、feature/整体 disable、mode 切换、flight/tracking suspension 与 disconnect 必须取消且不重放。
- Public `world.pick`/`pickFromWindowPosition`与Home仍是Z=0 contract；center rig按actual-cover terrain→
  resident camera-surface height/Z=0 fallback解析，target clamp只限制X/Y并保留target Z。
- `navigationMode`只接受`"surface"`/`"underground"`且默认surface；setter切换必须隔离held input，但不移动
  Camera、调用Home或查询terrain。Viewer通过`planarCameraController`配置，不增加Viewer option或Event。
- Observed relationship是private resident height→Z=0 fallback，不能自动切mode。Surface只接纳上侧/负pitch；
  underground接纳上侧/负pitch与下侧/正pitch，并只通过既有中键纵向orbit完成双向穿越。Crossing必须冻结
  press-time完整3D pivot/window anchor，不重复terrain query、不调用Home或切mode；包括惯性在内的手势结束后才重新同步新侧。
- `minimumTerrainClearance`默认1米且只接受finite positive number；setter本身不得移动Camera或查询terrain。
  Surface在first update与每次enabled update的input前检查Camera-local resident height→Z=0 fallback，并在input可能
  移动Camera后再检查endpoint；只沿world +Z纠正，不能用Home代替collision，也不能在terrain降低/detach时向下吸附。
  Underground必须完全跳过clearance query/correction。
- A3只保证controller update后的point/endpoint clearance与underground中键orbit crossing；不得宣称
  continuous/swept collision、free-look、角色体积、速度相关采样或terrain following。热路径复用scratch对象，
  resident query不得推进request/LRU/GPU。
- Specs至少覆盖source priority、非零正负height、release后重新解析、一个perspective/orthographic
  representative、大坐标、mode切换、terrain上下两侧、programmatic/input/revision clearance、非中心pivot的
  双向/tangent crossing，以及真实terrain depth/pivot且runtime零mutation。

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
  可使用 `Entity.properties` 或原生 `Entity.addProperty`；gate 只对 Entity.prototype 上的内建 Property 执行
  supported allowlist，未支持的标准 Graphics 在 child normal update 和低层资源 mutation 前拒绝。
  自定义属性不自动成为可绘制 Graphics；同步 collection listener 可以先更新 CPU tracking。
- 升级时复核 default visualizer、clamping、model matrix、`DataSourceDisplay` callback/update snapshot、
  per-DataSource primitive container、ordering 和 destroy lifecycle。
- C2 Anchor只使用caller-owned disabled `EntityCluster` pool，低层对象接收absolute planar position；
  temporary hidden/outside保留slot，graphic/entity removal与destroy成对归还。
- C2 Model的URI/load-time generation、candidate与active primitive必须隔离；Promise completion只缓存并
  request render，下一normal update才add。Stale、replacement和destroy路径都要exactly-once cleanup。
- Model transform只使用fixed planar translation/normalized Quaternion。不要调用`computeModelMatrix`、
  ENU或Model height clamping。
- C3 Polyline只允许`ArcType.NONE`的planar straight segments；C3逐vertex clamp与C9 actual-cover CPU drape均为历史。
  当前ordinary `HeightReference.NONE`保留source geometry，批准的surface-clamp分支统一走C11 GPU wrapper，不做
  geodesic/rhumb或自行发terrain request。C6迁移后`width`接受finite nonnegative
  number，0隐藏，不得重新引入Buffer Uint8的integer/255限制。
- C3 Polygon只接受simple outer ring与direct holes。Scalar height、per-position height、extrusion、caps、
  side walls与outline必须先完整preflight，再以local DOUBLE geometry、translation `modelMatrix`和explicit
  world bounds原子替换。C3 vertex-only与C9 actual-cover drape均为历史；当前批准的non-extruded Polygon CLAMP分支
  使用C11 GPU area backend。C6迁移后`outlineWidth`与Polyline width采用相同finite nonnegative规则。
- C6 public Geometry必须clone finite米制Cartesian3输入、以完整XYZ local origin重基，并只输出审计过的
  standard Geometry vertex format。Polyline固定`ArcType.NONE`；Polygon只使用XY triangulation，不调用Ellipsoid
  subdivision或ground path。
- C6 public Primitive固定single GeometryInstance与`asynchronous:false`，只接受approved SceneGIS geometry/
  Appearance pair。Geometry replacement只在normal render通过candidate/current完成；pick/depth不得promote，失败
  保留current。第二Context、invalid matrix/bounds和destroyed use必须在mutation前拒绝。
- Polyline/Polygon automatic Entity adapter必须复用public SceneGISPlanarPrimitive，并保留original Entity id、
  per-DataSource target、world bounds和exactly-once lifecycle；不得继续引用private Buffer owner、experimental
  collection私有字段或建立dual runtime。
- Polyline/Polygon 的原生 `distanceDisplayCondition` 同时作用于 fill/outline 和 ordinary/ground 路径。
  未设置时不增加 instance attribute；增删条件允许重建 attribute layout，ready 后只改 near/far 必须复用 GPU geometry。
  距离条件先验证，再写既有 GeometryInstance attributes，不用 CPU camera show 判据替代 native rendering/picking。
- C7 public Box/Cylinder/Ellipsoid Geometry只描述以center为origin的local Cartesian volume，并与closed、non-flat
  `PerInstanceColorAppearance`配对。跨geometry kind replacement继续fail-fast；Plane/Ellipse/Rectangle必须降级到
  public Polygon/Polyline，不能调用upstream ellipsoid-oriented Geometry。
- Solid的clamp/relative anchor在resolver结果上增加未旋转support height；Area的Ellipse position.z不参与surface
  height，Rectangle coordinates按meters严格有序。C7的Ellipse/Rectangle generated-vertex terrain sampling是历史
  行为，C9 actual-cover drape也已被C11 GPU area backend取代；ordinary `NONE` geometry仍可以越过extent。
- Planar callback完整顺序固定为gate、Anchor、Model、Polyline、Polygon、Solid、Area、Route、Path。六类C7
  Graphics只支持Color material、
  原生 ShadowMode 与批准字段；partial Ellipsoid、Rectangle granularity、stRotation、classification和zIndex必须在
  child低层mutation前拒绝。
- C8 public Wall Geometry必须使用XY route与explicit top/bottom生成open non-flat mesh；PolylineVolume Geometry的
  shape +X映射route-left、+Y映射world-up，并以planar corner stations生成closed mesh。不得调用upstream
  Corridor/Wall/PolylineVolume Geometry、ENU、Cartographic或geodesic subdivision。
- Corridor必须降级到public Polygon/Polyline，Path必须降级到public Polyline。Corridor rounded granularity是
  planar corner angle step；Corridor CLAMP分支使用C11 GPU area backend，Wall/PolylineVolume不隐式terrain clamp。
- Path sampler只能以`ReferenceFrame.FIXED`调用Cesium property sampler；non-FIXED position、INERTIAL、
  entity-relative/VVLH、`PathMode.PORTIONS`必须fail-fast。Route、Path位于完整callback顺序的最后，existing
  children顺序不变。
- C9 actual-mesh、ground snapshot与World late queue已由C11删除，不得恢复或保留fallback。Planar Surface commands使用
  existing `Pass.GLOBE`；area/polyline ground commands使用existing `Pass.TERRAIN_CLASSIFICATION`。
- C11 Ground Primitive只接受existing non-extruded planar Polygon或Polyline Geometry、live World与compatible Color
  appearance。Clamp是implicit；不得提供`heightReference`、`extrudedHeightReference`、任意modelMatrix、classification、
  zIndex或arbitrary Material。Ordinary NONE继续使用普通Primitive。
- Area使用stable planar shadow volume与z-fail stencil-depth/color/pick；Polyline使用stable segment volume与dedicated
  SceneGIS ground-line Shader。两者不得读取actual terrain triangles、发request或改变SSE/LRU/`tilesLoaded`。
- Height envelope只读caller-owned provider同步global min/max；无provider围绕Z=0使用非退化padding。Provider lifecycle
  只更新model transform/bounds，不得替换footprint VA/index/DrawCommand/Shader或订阅tile/LOD/revision。
- Polyline clamp与non-extruded Polygon、Ellipse、Rectangle、Corridor的批准CLAMP组合使用同一GPU wrapper；面状
  RELATIVE、mixed top/bottom和ground-relative extrusion必须在child低层mutation前fail-fast。Entity owner继续使用
  per-DataSource target，ready current提供bounds，hidden或无owner保持`FAILED`。
- C4 callback第一次合法update原子追加当前完整children序列Anchor、Model、Polyline、Polygon、Solid、Area、
  Route、Path并返回false；children必须等下一次update。Model及geometry自动路径使用
  `dataSource._primitives`，显式private构造省略target时仍使用`scene.primitives`；两种路径都不拥有caller
  collection。
- C5先以固定moderate profile验证initial/warm/local mutation/remove/destroy；Anchor仍使用Cesium pool，
  Model逐实例，Polyline/Polygon保持per-Entity owner。没有可复核热点时不得为了“批量”重写runtime。
- Content timing固定对象数、viewport、build、warmup和样本协议，分开记录display update与render
  median/P95；timing不是跨机器hard assertion。Hard gate是slot/owner/command/VA identity、dirty/copy、
  persistent resource与exactly-once lifecycle收敛。
- Content Sandcastle可以使用公开imagery/terrain做best-effort人工展示，但local E2E必须阻断公网并覆盖
  automatic content、dynamic update、original Entity selection、remove和destroy；不新增workflow。
- C10交付时以`PlanarContentCompatibility.md`核对24个engine与2个widget public入口、16类automatic Graphics、
  ordinary/Ground Primitive。Qualification必须使用local deterministic terrain和真实GPU surface-clamp current；不得用
  resident-height spy或source-Z改写冒充ground rendering。Dev/release E2E分别执行且public network attempts为0。
- Package smoke从repo外installed-tarball consumer验证bare ESM/CJS。`SceneGISPlanarTerrainSampler`是namespace
  object；underscore模块只允许作为soft-private JS artifact存在，必须从declarations和API HTML隐藏。

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

## `Test/**` 本地开发

从仓库根目录直接启动官方Cesium开发服务器：

```powershell
npm run start -- --port 8092 --no-embeddings
```

然后访问`http://localhost:8092/Test/<页面>.html`。端口被占用时更换`--port`，并使用相同端口访问页面。
`--no-embeddings`只跳过Sandcastle semantic-search embedding生成，与`Test/**`页面或Cesium runtime无关。

`Test/**`运行时不使用Sandcastle，但当前upstream `server.js`仍会额外创建固定`8081` Sandcastle mirror；
`--port`只改变主服务端口。如果`8081`被其他进程占用，根开发服务器仍会启动失败。本约定不通过SceneGIS patch改变
该upstream行为；先释放`8081`，或在后续独立任务中评估是否需要正式SGP integration seam。

根开发服务器启动engine、widgets和root Cesium bundle的incremental build contexts，并监听对应JS与Shader源码。
`/Build/CesiumUnminified/index.js`是development route：源码变化会清理相关bundle cache，页面刷新后的新请求会从增量构建
context取得最新代码。因而不需要另跑`npm run build-watch`或Sandcastle Vite；HTML/CSS/JS及Cesium源码修改后刷新页面即可。
这里的“热更新”指开发服务器按请求重建并返回最新bundle，不承诺浏览器自动HMR或保留页面状态。

## 完成任务前检查

平面Scene API开发还必须区分Cartesian supported、ellipsoid guarded、internal-only与deferred：高度使用
`world.getTerrainHeight`、`world.pickTerrain`或`SceneGISPlanarTerrainSampler`；应用位置使用`Camera.positionWC`/`position`，
不得把`positionCartographic`或`Scene.ellipsoid`解释为planar CRS。planar Widget/Viewer不传ellipsoid/map projection/2D/native
sky/shadow选项；自动化同时覆盖constructor preflight与`preRender`后的frame-boundary guard。

- [ ] 修改位于正确的 owned root 和架构层。
- [ ] 没有意外修改或提交生成文件。
- [ ] 公共 API 名称、default export 和 JSDoc 一致。
- [ ] 没有从 engine 内部导入自身 package/barrel。
- [ ] 每个 upstream-owned hunk 都有有效 SGP 和 paired marker，或有合法 `manifest-only` 说明。
- [ ] 没有混入无关格式化、重构或上游同步。
- [ ] Specs、`Test/**`开发示例、必要的legacy Sandcastle、E2E 和性能验证与风险相称。
- [ ] 长期架构决定已经记录 ADR，并链接相关 SGP。
- [ ] 当前 phase/standalone plan、parent extension roadmap、discussion、review 和扩展
      索引已反映最终状态、验证结果与剩余事项。
- [ ] 最终报告列出验证结果、上游文件、SGP 和剩余风险。

## 几何阴影维护

R1 按 [ADR-0083](Decisions/ADR-0083-planar-cascaded-shadows.md) 接入原生四级 ShadowMap，
不再拒绝 Planar shadows / terrainShadows。CPU 覆盖、纹素稳定和 GLSL 过渡在 SceneGIS-owned
helper 中实现，上游只保留 SGP-0013 dispatch；Widget / Viewer 沿用 SGP-0001/0002 集成边界。

World 通过 DrawCommand castShadows/receiveShadows 与原生派生缓存接入；地表所有位置/法线
变体、caster 裁剪、透明背景和 sampler 预算必须一同维护。Entity Graphics 与普通 Primitive
沿用原生 shadows 字段；ground classification 并非真实投影几何，不扩大资格。
阴影 atlas 由 Scene 的 ShadowMap 所有，销毁发生在 Context 之前。
R10 按 [ADR-0088](Decisions/ADR-0088-directional-shadow-refinement.md) 共享四级 fitter 与连续
4x4 PCF；实现位于 `_SceneGISCascadedShadows.js` 与 `Rendering/SceneGISCascadeShadow.glsl`。
接收面几何导数必须在级联分支前求值，深度校正在各采样中心计算；不要通过扩大 slope bias 掩盖条纹。
Globe 保留可见范围裁剪并向上分档，测试应等待该范围发布后检查档内稳定性。
回归入口是 SceneGISShadowQualitySpec、SceneGISPlanarShadowsSpec 与原生 ShadowMap Specs。
人工入口为 `Test/Rendering/阴影精细度.html?world=planar|globe` 和 `实景对比.html`。

R13 按 [ADR-0092](Decisions/ADR-0092-depth-shadow-submission.md) 在级联插入处检查已委托 camera
traversal 的 tile model bounds。各级联独立测试；普通 command、point/single-pass light 保留
原生路径。没有修改 atlas、PCF、bias、级联划分或更新频率。

## 高质量环境光遮蔽维护

R2 使用 [ADR-0084](Decisions/ADR-0084-forward-ambient-occlusion.md) 的本帧 depth prepass，
支持球面和平面的 SCENE3D 场景。沿用现有入口，默认关闭：

```js
const ao = viewer.scene.postProcessStages.ambientOcclusion;
ao.enabled = true;
ao.uniforms.lengthCap = 5.0; // Radius in world meters.
ao.uniforms.intensity = 1.5;
ao.uniforms.directionCount = 8;
ao.uniforms.stepCount = 8;
ao.uniforms.ambientOcclusionOnly = false;
```

默认半径为 1 米、强度 1.5、cosine bias 0.03、8 个方向及每方向 8 次采样；奇数方向向上补为
成对射线。`randomTexture` 字段继续接受但不参与计算，采样相位由屏幕位置确定。
仅 ambient / IBL 受影响；未开启地表光照的影像、unlit 材质保持原样。`ambientOcclusionOnly`
用于查看遮蔽图；开启 HDR 时它仍经过后续 tone mapping。没有时域积累，不需要静止等待画面收敛。

实现入口为 `_SceneGISAmbientOcclusion.js`，GLSL 位于 `Source/Shaders/SceneGIS/AmbientOcclusion/`。
正交相机的原生 `czm_inverseProjection` 为零矩阵，必须使用原生 window-to-eye 重建；不得把
线性深度当作当前视锥 device depth。多视锥合并、clip/discard、IBL 与自发光分离、资源寿命的
回归入口为 `SceneGISAmbientOcclusionSpec.js`；人工入口为 `Test/Planar/环境光遮蔽.html`。

成本包括额外 opaque 几何提交、4 个复用目标和一个 HDR pass-through/debug 目标，约 21 bytes/pixel
（不计 driver padding 与 ShaderCache）。屏幕外/隐藏遮挡、亚像素细节、透明接收和 specular bent normal
不在当前能力内。不要通过增大世界半径掩盖数据缝隙或把截图指标代替负责人视觉验收。

R13 的 `SCENEGIS_DEPTH_ONLY` 只跳过 ModelFS 中不影响 alpha/depth 的 lightingStage；原生
material/custom shader、style、alpha mask、clipping 和 log depth 均保留。预通道并未删除，
不能把减少着色/uniform 成本报告成减少 AO 几何绘制。原生 floating uniform arrays 在上传前
由 owned helper 对打包后的位模式去重；native packing/validation/callbacks 不变，存储随
uniform/ShaderProgram 生命周期释放。升级回归包括 `SceneGISUniformArraySpec` 与 native
`UniformSpec`，不引入 GL sampler 绑定缓存。

R14 按 [ADR-0093](Decisions/ADR-0093-main-pass-ambient-occlusion.md) 在合格 HDR 单视锥路径
使用 `_SceneGISLightingMrt` 共享主通道深度与间接光输出。AO 单独开启需 2 个 color targets，
与 base SSR 共用需 5 个，含 clearcoat 需 8 个；MSAA 样本数沿用主通道。全屏估计/过滤后
仅合成间接光差值，SSR 与水面读取修正后的不透明颜色。特殊路径仍按上文运行预通道。
检查 `mainPass` 与 `prepassDraws` 区分真实执行路径，不能只依据效果开关推断几何开销。
回归覆盖 AO/SSR/Water Specs、资源生命周期和固定实景；更改 Model/terrain 的后光照颜色
分支时必须同时更新间接光的线性响应或明确排除该分支。

## 验证物理天空环境反射

开启已有 SceneGISEnvironmentEffects 后，Globe / Planar 的原生 PBR Model 与 3D Tiles 默认镜面
IBL 使用同一物理天空来源。无需额外开关；继续设置 model.imageBasedLighting.imageBasedLightingFactor
或 Entity ModelGraphics.imageBasedLightingFactor。x 控制漫反射，y 控制镜面反射。物理变体的
clearcoat 同样遵循 y；材质 metallic/roughness/normal/anisotropy 仍由原生 PBR 处理。

显式 model.imageBasedLighting.specularEnvironmentMaps（KTX2）及 scene.specularEnvironmentMaps
优先于自动天空。model 的显式 sphericalHarmonicCoefficients 保持原语义。
自动天空模式下 environmentMapManager.enabled=false 可退出该模型的物理镜面来源；原生 manager
的 groundColor/gamma 等程序化参数不改变物理 LUT。光照使用 surfaceRadianceScale，天空显示
使用 backgroundRadianceScale。需一致亮度时同时调整二者，不能对已解码 HDR 贴图再作 sRGB 解码。

打开 [环境反射示例](../../Test/Planar/环境反射.html)，用 world=globe 切换球面。前排金属、后排
涂层陶瓷，粗糙度逐渐增大；对比镜面开关、白天/日落/夜间和转动视角。反射中不包含附近球体、
云或地形纹理，这是 R3 的区域天空探针范围。地面仅中性受光近似。球面必须继续关闭与物理
环境冲突的 native Globe lighting / ground atmosphere 等功能；示例已经按契约设置。

验证入口为 SceneGIS/Scene/SceneGISSkyReflections；相关回归为 SceneGISModelEnvironmentLighting、
Scene/Model/ImageBasedLightingPipelineStage 和 Renderer/Framebuffer。Shader 修改先执行 gulp build
再运行带 --webglValidation --failTaskOnError 的 GPU Specs。性能与已知原生基线失败见
[R3 review](../../AgentDocs/rendering-quality/reviews/2026-09-19-r3-sky-reflections.md)。

## 验证屏幕空间反射

### 局部环境遮挡与镜面探针

先启用物理大气和 HDR，并等待独立 glTF/GLB Model 完整就绪。推荐加载时设置
`incrementallyLoadTextures: false`。捕获来源须直接加入 `scene.primitives`。

```js
const probes = new Cesium.SceneGISReflectionProbeCollection({
  scene,
  resolution: 128,
});
const probe = probes.add(
  new Cesium.SceneGISReflectionProbe({
    modelMatrix, // Rigid local-to-world: Cartesian in Planar, ENU/ECEF in Globe.
    halfSize: new Cesium.Cartesian3(10, 10, 6),
    blendDistance: 2,
    maximumDistance: 60,
  }),
);
await probes.capture([model]);
probes.occlusion = true;
probes.reflections = true;
```

每 Scene 至多一个集合、两个探针。`resolution` 支持 32/64/128/256；放置参数只读，改变位置
时移除原探针并添加新描述。中心应放在空处，盒范围匹配局部空间。`show=false` 保留缓存；
移除探针或销毁集合释放贴图，Scene 销毁时自动释放集合，借用的 Model 不受影响。
`capture()` 只更新一次，光照/模型变化后由调用方再次调用；失败保留原结果并拒绝 Promise。
仅支持普通单视图 SCENE3D，捕获当帧可能卡顿，不适合逐帧调用。

打开 [局部环境探针](../../Test/Rendering/局部环境探针.html)，比较屋檐遮挡、粗糙度、离屏红墙
反射与 GTAO/SSR；`world=globe` 使用同一 API。Bistro 的“局部探针（手动捕获）”面板可调位置
和范围，默认不会创建或捕获探针。光照变化后重新捕获；`基线 A` 排除局部探针。
方向遮挡只描述捕获点，跨墙的大盒可能漏光或过暗；不包含漫反射反弹、透明/水面捕获、云、
地形或流式 3D Tiles。GPU 入口为 `SceneGIS/Scene/SceneGISReflectionProbe`，页面组合测试为
`Specs/e2e/scenegis-local-probes.spec.js`。决策及升级边界见 ADR-0096 / SGP-0024。

### 屏幕空间反射使用

先显式设置 scene.highDynamicRange = true，再创建 SceneGISScreenSpaceReflections({ scene, enabled: true })。
已有 glTF 材质、CustomShader 和 ImageBasedLighting 接口保持；效果按最终材质粗糙度及基础层/清漆层方向工作。
同一 Scene 最多一个效果，Scene 拥有生命周期，也可提前调用 destroy；enabled=false 保留已分配资源以便恢复。
maximumDistance / thickness 使用米，maximumRoughness 使用感知粗糙度，stepCount 控制每层追踪预算。
`resolutionScale` 支持 `0.5`（默认）或 `1`，后者保留更细的反射面细节。
`temporalFiltering` 默认开启，独立于 TAA；相机运动使用反射距离修正视差，物体没有运动向量。
材质、光照或场景发生跳变后调用 `reset()`；参数、分辨率和投影变化自动清除历史。
没有额外收敛帧，按当前渲染节奏更新。历史与追踪均使用反射分辨率，随后按完整深度/材质重建。

实现入口为 Source/SceneGIS/Scene/SceneGISScreenSpaceReflections.js 及同名 private renderer，
Shader 位于 Source/Shaders/SceneGIS/Reflections/。捕获使用原生 log/HDR/shadow/AO 命令，逐视锥合并
R32F 深度；MRT 保存基础层和清漆层方向/粗糙度。结果回到材质 IBL，后处理色调映射和环境顺序保持。

验收入口为 Test/Planar/屏幕空间反射.html?world=planar 或 world=globe。对比开关、粗糙度和相机移动；
原生地表仅为反射来源，示例镜面地板是 PBR 模型。透明物体、屏幕外几何和递归反射尚未支持。
R18 的独立入口为 [反射稳定性](../../Test/Rendering/反射稳定性.html)，Bistro 同时提供分辨率和时域开关。
AMD FidelityFX SSSR/Reflection Denoiser 的固定版本来源、MIT 许可和 WebGL2 适配边界见 ADR-0097。
R12 按 ADR-0091 为合格的单视锥启用主通道 MRT，省去完整 shaded replay；多视锥、分类、
清除 Globe 深度及未适配的材质后处理继续使用原路径。保留原生 MSAA，辅助浮点附件独立 resolve。
R18 半分辨率、时域开启时，普通材质在 4x MSAA 下 SSR 资源约 196 bytes/pixel，clearcoat 约 308 bytes/pixel；
原 replay 约 76 bytes/pixel。全分辨率增加约 72 bytes/pixel；关闭时域前未分配历史可少用 16 bytes/pixel。
上述只计 SSR 所有目标，不含借用的 native color/depth，忽略奇数尺寸向上取整。
MRT 用带宽/显存换取绘制和完整着色次数下降；必须在真实场景评估。

GPU 回归入口为 SceneGIS/Scene/SceneGISScreenSpaceReflections，关联 AO、sky reflections、physical model
和原生 IBL pipeline Specs；Shader 修改须先 gulp build。验证记录见 R6 review，架构边界见 ADR-0086。

## 局部水面使用与验证

先设置 `scene.highDynamicRange = true`，再把 `SceneGISWaterSurface` 加入 `scene.primitives`。
`polygonHierarchy` 沿用 PolygonHierarchy，可含孔洞；坐标为局部 XY 米，Z 固定为零。
使用 `modelMatrix` 放置水位：Planar 使用平移矩阵，Globe 使用对应水位的 ENU 刚体矩阵。
不接受缩放、反射变换或经纬度数值直接充当局部坐标。构造时复制轮廓，改变轮廓需重建图元。

`waveAmplitude` / `waveLength` 使用米，`flowDirection` 是局部二维方向，`flowSpeed` 使用米/秒。
波纹跟随 Viewer Clock，仅扰动法线；暂停 Clock 即冻结波纹。`absorption` 是每米 RGB 吸收系数，
`waterColor` 是线性散射色，启用物理环境后随光源变化。`roughness`、`refractionStrength`、
`foamWidth` / `foamIntensity` 控制反射粗糙度、折射偏移和浅水接触泡沫。属性修改在下一帧验证；
requestRenderMode 下由应用调用 scene.requestRender。`show`、`id`、集合生命周期沿用图元习惯。

水面无需创建 SceneGISScreenSpaceReflections 即可显示场景倒影；若已有启用的 SSR，会自动共享
opaque 快照。`water.reflections=false` 只关闭水面的屏幕追踪，天空反射仍保留。没有物理环境时，
`reflectionColor` 提供明确的常量环境辐亮度。共享天空和 opaque targets 均不能由图元销毁。

人工入口为 `Test/Planar/局部水面.html?world=planar` 或 `world=globe`。关闭显示水面检查水下结构，
切换场景倒影，暂停时间、调整波纹和泡沫并旋转相机。首版只支持水上视角、局部单层和 opaque
水下物体；屏幕外/隐藏反射、透明水下物体、焦散、海洋位移及水下介质不在范围内。

实现和资源预算见 ADR-0087 与 R8 review。严格 GPU 入口为 SceneGIS/Scene/SceneGISWaterSurface，
关联 SSR、AO 和 physical model lighting Specs。独立屏幕目标约 18.7 bytes/pixel，隐藏保留，
Scene 销毁释放；启用 SSR 时借用已有捕获，避免重复 replay。Shader 修改先 gulp build。

## 可选 TAA

```js
scene.highDynamicRange = true;
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = false;
const taa = new Cesium.SceneGISTemporalAntialiasing({ scene, enabled: true });
// Call after an application camera cut or scene replacement.
taa.reset();
```

球面、平面、透视与正交相机使用同一接口。MSAA / FXAA 设置由应用显式选择；仅打开 TAA
不会自动关闭它们。效果在 HDR bloom / tone mapping 前运行，逐视锥借用主深度，不重绘几何。
相机和 CPU culling 不抖动，深度拾取抵消采样偏移。关闭会释放历史资源，Scene 销毁时自动销毁
绑定效果；可提前调用 `taa.destroy()` 解除绑定。首帧、reset、resize 和投影变化使用当前颜色。

`historyWeight` 默认 0.9、范围 [0, 0.95]，降低可加快响应但减弱稳定性。当前使用相机运动
重投影，未提供物体 motion vectors；运动模型、透明对象和标注可能柔化或残影。request-render
模式不请求额外收敛帧。独立页面 `Test/Rendering/时域抗锯齿.html` 提供四种 AA 模式、相机和
物体运动对照。详见 ADR-0094 / SGP-0022；性能应在同样视角、分辨率、图层与效果下实测。
