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
- 对 imagery contribution，每个 binding 只请求 desired 与必要的 minimumLevel ancestor bootstrap，不主动推进 intermediate ancestor；
  cache 中已有的最近 READY ancestor 可以复用，reference 切换和 eviction 必须 exactly once。
- 每个 ideal tile 保持一个 opaque command；shown layer 数必须在任何 request 或 GPU mutation
  前按 texture-unit limit fail-fast，不能用 multipass 绕过。
- provider failure、retry、cancel、stale generation、decoded image close、texture destroy 和第二
  Context 拒绝都需要自动化 Specs；开发示例的外网结果不能替代这些证据。
- `scenegis-planar-imagery` 只展示 engine-level 显式组装。不要在 P5 示例中加入 Viewer、widgets、
  provider picker、离线下载或预取；这些属于后续 UI 集成阶段。

局部影像按 ADR-0162 验证：实际 render surface 层级低于 minimumLevel 或 coverageExtent
外不建立请求；仅子层采样父层，不能反向拼接。coverage 使用世界米制矩形，XYZ 与完整
BBOX 不变，边界外只让该层透明。明确 image HTTP 404 进入 UNAVAILABLE；其他错误仍报告。
WMTS labels 按 canonical level 索引；TMS metadata 分辨率识别最低层级，Origin 保持全球原点。

影像分屏按 ADR-0005 的 2026-10-22 修订使用原生 SplitDirection / scene.splitPosition。
验证 LEFT/RIGHT/NONE、0/1 端点、透明层序与 coverage 叠加；被屏蔽一侧必须保留
地表深度。分屏方向走 normal-render slot 快照，不触发请求、shader/command 重建；
浏览器检查 CSS/drawing-buffer 比例、resize 和显式 requestRender。

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
- planar Home只调用`controller.viewHome(scene)`。`zoomTo`/`flyTo`接纳精确Entity/DataSource profile，以及已正确放置在平面 World 的原生 tileset；
  `trackedEntity`仅接纳真实Entity、FIXED position与AUTODETECT/ENU fixed-axis tracking。InfoBox camera按当前sample在
  track/untrack与DONE-bounds zoom之间选择，left-double-click使用同一track-or-zoom规则，left-click selection保留。
- tracking controller必须晚于planar input controller注册，使用独立计数token暂停input；不得复用Earth `EntityView`、读取
  orientation或接受INERTIAL/VELOCITY。Direct Camera flight暂时优先，successful framing/Home/remove/destroy必须
  exactly-once释放definition listener、Camera transform与token。
- tileset 取景读取执行时的公开 `boundingSphere`，不访问私有 root、不重投影 CRS。覆盖根/模型矩阵更新、
  Promise readiness、目标移除/销毁、取消/替换及 Widget/Scene teardown；所有 operation listener 和 flight token 必须释放。
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

合法 roll 不得作为 controller Home/rejection 条件；initial/idle/pan/wheel 保留姿态。
中键按实际 angular travel 逐步扶正，zero-delta press 不改姿态，完整 HPR 参与固定
window anchor 解算。惯性、再次 press、外部 pose、非 identity transform、nadir 等价
分解与 underground tangent release 必须验证；不增加 idle animation。见 ADR-0004 的 roll 修订。

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
  Surface 有效锚点的中键旋转和惯性允许 center target 越界；开始新中键手势时不得先执行 center clamp
  移动 Camera 再拾取。Pointer miss fallback、pan、wheel 与初始同步保留边界，terrain clearance 始终优先。
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
- C4 automatic path 接受 live planar World、`CustomDataSource`、显式绑定当前 World 的 GeoJSON/CZML
  与同 Scene 的 `EntityCluster`（ADR-0183 支持可选聚类）。业务 metadata
  可使用 `Entity.properties` 或原生 `Entity.addProperty`；gate 只对 Entity.prototype 上的内建 Property 执行
  supported allowlist，未支持的标准 Graphics 在 child normal update 和低层资源 mutation 前拒绝。
  自定义属性不自动成为可绘制 Graphics；同步 collection listener 可以先更新 CPU tracking。
- 升级时复核 default visualizer、clamping、model matrix、`DataSourceDisplay` callback/update snapshot、
  per-DataSource primitive container、ordering 和 destroy lifecycle。
- C2 Anchor使用caller-owned `EntityCluster` pool，低层对象接收absolute planar position；
  temporary hidden/outside保留slot，graphic/entity removal与destroy成对归还。
  开启聚类时，解析后位置、显隐和屏幕包围盒属性变更标脏，不能每帧无条件重建索引。
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
- C6 public Primitive使用single或static batch GeometryInstance与`asynchronous:false`，只接受approved SceneGIS geometry/
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
  面 Graphics 按 ADR-0178 支持原生 MaterialProperty；Color 保留快速路径，其余类型由 adapter 拥有生成的 Material。
  同类型更新只改 uniform，类型改变原子替换 owner；Polygon/Ellipse/Rectangle 支持 finite stRotation。
  ADR-0182 同样支持 PolylineGraphics（ordinary/ground）；冻结时钟也读取非恒定属性，派生材质由 owner 释放。
  原生 ShadowMode 与其他批准字段不变；partial Ellipsoid、Rectangle granularity、classification和zIndex必须在
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
  appearance（面另接纳 ADR-0178 MaterialAppearance；线接纳 ADR-0182 PolylineMaterialAppearance / Fabric）。Clamp是implicit；不得提供`heightReference`、`extrudedHeightReference`、任意modelMatrix、classification、
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

### 方向性环境反射遮蔽（R28）

按 [ADR-0184](Decisions/ADR-0184-directional-environment-occlusion.md) 可选开启：

```js
const ao = viewer.scene.postProcessStages.ambientOcclusion;
ao.enabled = true;
ao.uniforms.directionalOcclusion = true; // Default false; a boolean callback is also accepted.
```

当前 deferred 管线直接复用完整 opaque 深度，不增加几何重画；方向估计与原有 AO 共用
径向深度采样及两次全屏估计/滤波。过滤后的 bent direction 仅用于基础层和 clearcoat 的
环境镜面遮蔽，保留原生材质法线、粗糙度、各向异性和 BRDF。漫反射仍使用同一标量 AO，
不修改太阳直射、自发光或背景；SSR 命中结果不再重复乘环境遮蔽。

适用于 Globe / Planar 的不透明及 MASK PBR Model / 3D Tiles，包含显式 IBL；普通地表、
Phong 图元沿用标量 AO。透明接收与半透明反向分类独立工作集不接入，单层屏幕深度无法
补齐屏幕外或隐藏遮挡，也不能用单个可见锥精确描述多个开口。严格平面大气保持原样。

新增开关默认 false；方向模式将估计/滤波存储从 5 B/pixel 增至 12 B/pixel，1280×800
增加约 6.84 MiB（不含 driver padding）。关闭 AO、切回标量、resize 或 Scene 销毁时释放或
替换方向资源。派生光照程序由原生 ShaderCache 随源程序管理；热帧按 Shader 实例复用。
上述 R2/R13/R14 是历史接入记录，当前共享深度与资源边界以 ADR-0158/0161/0184 为准。

人工对比入口为 `Test/Rendering/PBR综合验收.html?world=globe|planar`，在环境遮蔽面板切换
“方向性环境反射遮蔽”。自动验证为 `SceneGISDirectionalOcclusionSpec`、现有 AO/SSR Specs
及 `Test/playwright.directional-occlusion.config.mjs`。性能和画面结论见 R28 review。

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

2026-10-17 起，Globe / Planar 的默认及显式环境均使用已验收的外观默认：
backgroundRadianceScale=2.5、surfaceRadianceScale=1.2，空气透视 / 云的相对倍率仍为 1。
HDR/LDR 切换不改变这些值。它们是艺术控制，不改变共同物理单位；需要中性倍率时显式
设置为 1。HDR 和自动曝光默认关闭；显式 HDR 可设置手动 exposure，LDR 在固定太阳白点
校正后裁剪并应用 gamma，不进行曝光。调用方显式参数优先，不由默认环境覆盖。
已有应用若需要旧外观，可显式指定原背景倍率（Globe 4 / Planar 10）及原地表倍率
（自动环境 1 / 显式环境 10）；这仅恢复旧倍率，补齐光谱转换后不保证旧色彩逐像素相同。
Earth LUT 的三波段结果按原实现 Sun / Sky 系数转换到线性 sRGB，并除以固定的
40000 cd/m² 日光参考单位；它使天顶太阳下的海平面 18% 灰面接近显示线性 0.18，
不是动态曝光或太阳强度倍率，HDR/LDR 使用同一换算。
该相对光度单位贯穿表面、大气、云和物理天空反射；不是直接向 HDR 缓冲写 lux。
自定义 DirectionalLight、model lightColor、发光与注记仍接受原来的场景 RGB，不要自行
再乘光谱转换系数。系数、单位和三波段近似边界见 ADR-0044。

`scene.environmentEffects.whiteBalance` 默认 true，球面 / 平面及 HDR / LDR 共用
Bruneton demo 的固定太阳光谱白点（ADR-0169）。它在显示曲线之前校正整幅画面，
不增加绘制 pass；切换布尔值只更新 uniform，不重建环境或重置 history。
综合环境示例的“天空与光照 → 太阳白平衡（HDR / LDR）”可直接开关比较。
设为 false 可查看原始色彩；高级环境停用时也不再执行这项校正。
它保留大气造成的日落暖色，不根据当前白屋顶或太阳高度强制归一，也不能消除影像中
已经拍摄进去的光照。显式 HDR `SceneGISColorGrading` 的色温 / 色偏在此之后作用。

AgX 可通过既有显示接口显式选择（ADR-0164 / SGP-0060）：

```js
scene.highDynamicRange = true;
scene.postProcessStages.tonemapper = Cesium.Tonemapper.AGX;
scene.postProcessStages.exposure = 10;
```

这是日间物理大气来源示例的对照配置，不会改引擎 PBR Neutral / exposure=1 默认，
也不会自动启用自动曝光。曝光 10 不是太阳强度换算或所有材质的通用校准；独立大气与矢量
示例提供曲线 / 手动曝光控件。AgX 复用调色和输出 gamma，保持 alpha；LDR 忽略曝光与曲线。
本地保留 Cesium 的可配置 gamma，和 Three.js 的 sRGB 输出传递函数并非逐像素相同。

平面栅格影像按 ADR-0031 对齐 Globe：raw color-to-alpha → 批次 gamma 分支 → brightness →
contrast → hue → saturation → alpha 混合 → 光照。同一 tile command 只要有 READY 且 alpha
非零的参与层 gamma 非默认，所有层就改用 `pow(rgb, 1/gamma)`；否则使用 `czm_gammaCorrect`。
因此保留原生 gamma=1 附近的亮度跳变，以及非默认 gamma 对同批次其他层的影响。
默认滤镜、`scene.gamma=2.2` 的 LDR 输出还原未受光照影响的影像颜色，无需手动抵消偏白。
`baseColor` 与 Material diffuse 保持线性输入。

按 ADR-0165，矢量文字 / 图标抵消曝光增益，继续接受 AgX 等曲线和调色；提高 exposure
不会再同时冲白注记。alpha、样式顺序、地形 / 外部模型遮挡与拾取规则不变。自动曝光仍
默认关闭；显式启用时补偿使用上一完成帧的自动增益，适应期间可能有一帧亮度比值变化。
共享环境漫反射包含原反照率 0.1 的下半球地面反弹，改善背光侧墙；显式 IBL / SH 保持
调用方所有权。该区域近似没有计算建筑之间的多次反弹或局部地面纹理，不作为完整 GI。

Globe 表面天空补光使用方向性照度表，按表面位置、太阳与法线查询实际天空的余弦积分，
不再对侧墙固定采用水平天空的一半。表在环境冷创建时生成，不随相机或太阳移动重建；
占用约 1.35 MiB，替代原 8 KiB 照度纹理，材质 sampler 和每帧 pass 数量不增加。
首次使用包含 shader 编译与一次 GPU 积分；具体测量和有限网格误差见 ADR-0165 及环境
radiance review。此改进不改变 Planar transport、天空外观倍率或自动曝光默认。

Globe 默认使用 `scene.environmentEffects.aerialPerspectiveDistanceScale = 0.5` 减轻
远景空气透视（ADR-0166）。它在原大气模型中缩短有限接收点的查询距离，同时计算散射
和透射率；不同于只乘散射颜色的 `aerialRadianceScale`。显式 1 保持原物理查询距离，0 移除
有限距离空气透视，支持有限值 [0, 8]；Planar 当前仅接受 1。天空背景、真实几何深度、
云遮挡、表面光照和高度雾不受影响。修改不重建 LUT，也不编译 shader。非 1 倍率是
艺术控制，仍需检查地平线及远景边界；不代表修改了整个星球的物理气溶胶密度。

球面物理大气示例当前用于正午 LDR 验收，继承默认天空 2.5、地表 1.2、空气亮度 1、
空气透视距离 0.5；界面可实时调节。平面物理大气示例继承相同天空 / 地表 / 空气亮度默认，
保留 Planar 中性空气距离 1；两页均提供北京时间和夜间环境光控件。
两页已移除重复的外观倍率配置，直接使用引擎默认；HDR 与自动曝光仍关闭。

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

## 矩形面光源

矩形光与点光、聚光共用 `SceneGISLightCollection`（总容量 256，含隐藏灯）：

```js
const lights = new Cesium.SceneGISLightCollection({ scene: viewer.scene });
const panel = lights.add(
  new Cesium.SceneGISRectAreaLight({
    position: new Cesium.Cartesian3(0, 0, 6), // Planar coordinates; use ECEF in Globe.
    direction: new Cesium.Cartesian3(0, 0, -1),
    up: Cesium.Cartesian3.UNIT_Y,
    width: 4,
    height: 2,
    intensity: 8,
    range: 30,
    color: new Cesium.Color(1, 0.8, 0.5),
  }),
);
panel.width = 8;
viewer.scene.requestRender();
```

position 为面板中心，direction 为发光法线，up 控制高度方向；宽度方向是
`cross(direction, up)`。两方向必须非零且不平行，运行时自动正交化；宽高、range 用米。
默认单面，可设置 `twoSided=true`。intensity 为线性 HDR 面辐亮度，固定值下增大面积
会增加总出光量，与点光/聚光的一米照度尺度不同；range 按中心距离在积分后平滑衰减。
支持 PBR/clearcoat、Phong（含透明）和 lit terrain；使用 LTC 计算矩形高光。
Phong 镜面转换为 GGX，anisotropy 的面光镜面项使用 isotropic 拟合。
灯本身不创建可见几何，不投射局部阴影，也不照亮体积介质。

集合由 Scene 销毁，描述对象不需要 destroy；request-render 模式修改属性后手动请求帧。
人工入口 [矩形光源](../../Test/Rendering/矩形光源.html) 提供 Globe/Planar、宽高、旋转、
倾斜、单双面和照明开关。验证入口为 `SceneGISRectAreaLight`、`SceneGISLightCollection`、
`SceneGISLightTiles` Specs，以及 `Test/Rendering/playwright.rect-area-light.config.mjs`。
固定版本数据、许可、存储与算法边界见 ADR-0186。

## 局部水面使用与验证

先设置 `scene.highDynamicRange = true`，再把 `SceneGISWaterSurface` 加入 `scene.primitives`。
`polygonHierarchy` 沿用 PolygonHierarchy，可含孔洞；坐标为局部 XY 米，Z 固定为零。
使用 `modelMatrix` 放置水位：Planar 使用平移矩阵，Globe 使用对应水位的 ENU 刚体矩阵。
不接受缩放、反射变换或经纬度数值直接充当局部坐标。构造时复制轮廓，改变轮廓需重建图元。

`waveAmplitude` / `waveLength` 使用米，`flowDirection` 是局部二维方向，`flowSpeed` 使用米/秒。
默认波纹跟随 Viewer Clock，仅扰动法线；暂停 Clock 即冻结波纹。`absorption` 是每米 RGB 吸收系数，
`waterColor` 是线性散射色，启用物理环境后随光源变化。`roughness`、`refractionStrength`、
`foamWidth` / `foamIntensity` 控制反射粗糙度、折射偏移和浅水接触泡沫。属性修改在下一帧验证；
requestRenderMode 下由应用调用 scene.requestRender。`show`、`id`、集合生命周期沿用图元习惯。

水面无需创建 SceneGISScreenSpaceReflections 即可显示场景倒影；若已有启用的 SSR，会自动共享
opaque 快照。`water.reflections=false` 只关闭水面的屏幕追踪，天空反射仍保留。没有物理环境时，
`reflectionColor` 提供明确的常量环境辐亮度。共享天空和 opaque targets 均不能由图元销毁。

人工入口为 `Test/Planar/局部水面.html?world=planar` 或 `world=globe`。关闭显示水面检查水下结构，
切换场景倒影，暂停时间、调整波纹和泡沫并旋转相机。首版只支持水上视角、局部单层和 opaque
水下物体；屏幕外/隐藏反射、透明水下物体、焦散及水下介质不在范围内。真实风浪位移见下文。

实现和资源预算见 ADR-0087 与 R8 review。严格 GPU 入口为 SceneGIS/Scene/SceneGISWaterSurface，
关联 SSR、AO 和 physical model lighting Specs。独立屏幕目标约 18.7 bytes/pixel，隐藏保留，
Scene 销毁释放；启用 SSR 时借用已有捕获，避免重复 replay。Shader 修改先 gulp build。

## 风浪水面使用与验证

`SceneGISWindWaves` 是可选的可共享模拟，传入现有水面即可启用真实几何位移：

```js
const waves = new Cesium.SceneGISWindWaves({
  windSpeed: 8,
  windDirection: new Cesium.Cartesian2(-1, 1),
  fetchLength: 1800,
  waterDepth: 2,
  resolution: 128,
});
const water = scene.primitives.add(
  new Cesium.SceneGISWaterSurface({
    polygonHierarchy,
    modelMatrix,
    windWaves: waves,
    meshSpacing: 1,
  }),
);
// Before destroying the Viewer/Context:
scene.primitives.remove(water);
waves.destroy();
```

`windSpeed` 为水面上方 10 米风速（m/s）；`windDirection` 为局部 XY 中波浪传播的去向，
不是气象学的来向。`fetchLength` 为有效风区长度，`waterDepth` 为谱和色散使用的均匀平均水深，
不会移动实际湖底。`amplitudeScale` 是艺术倍率；`choppiness` 控制水平位移；
`whitecapIntensity` 控制波峰压缩产生的白沫。`directionalSpread`（默认 0.7，范围 0–1）
控制波浪方向的分散程度，短波更分散，0 保留原来的窄方向分布。`rippleIntensity`
（默认 1，范围 0–4）只缩放细波频段，不改变大波。参数可动态修改，直接重建谱而不模拟气象渐变。

`resolution`（32/64/128/256）、`patchLength`（默认 64 米，另外两个频段为四倍和八分之一）、`seed`、
水面的 `windWaves` 和 `meshSpacing` 在构造后只读。风浪替代原来的法线波，原有
`waveAmplitude/waveLength/flowSpeed` 不控制 FFT；`flowSpeed/waveLength` 仍用于浅岸泡沫漂移。
反射、折射、吸收、粗糙度和岸边泡沫沿用既有属性。轮廓边缘 4 米内衰减位移，保留岸线和孔洞。
不同水面共享模拟时须使用对齐的局部坐标；独立方位或水位可使用独立实例。

每个 128² 三频段实例增加 48 次小尺寸 GPU 绘制及约 2.75 MiB 纹理，暂停复用；风浪模拟不增加几何预通道。
额外网格按距离生成，最多保留 16 MiB 非当前 LOD 缓存。位移过滤沿相机距离连续变化，
接边顶点与内部使用相同规则，避免分块边缘保留额外高频波浪而形成高光网格。波谱有周期、截断和均匀水深限制，
没有沿岸绕射、浅水流动、破碎浪或水下相机；默认模式在 Globe 使用局部 ENU 平面。
区域曲面入口见下一节，两个模式均不是全球海洋模拟。

人工入口 `Test/Rendering/玄武湖风浪.html?world=planar` / `world=globe`，
可选 `quality=64|128|256`。数据目录记录 OSM 许可，地形和植被为示意。
自动验证使用 `SceneGIS/Scene/SceneGISWindWaves`、`SceneGIS/Scene/SceneGISWaterSurface`
和 `Test/Rendering/playwright.wind-water.config.mjs`；GPU 数值与独立 CPU DFT 对照。
曲面湖泊主验收入口为 `Test/Rendering/曲面河湖.html?sample=lake`，新增“浪面特写”视角和两项风浪参数。
实现、边界和实测预算见 ADR-0101、ADR-0181 与 R22 / R27 review。

## 区域曲面河湖使用与验证

Globe 上的大范围河湖显式启用 `geometryMode: "ellipsoid"`，传入 ECEF 轮廓。
默认的局部 XY 水面入口保持不变，普通法线水面也保留。曲面要求现有 `SceneGISWindWaves`：

```js
scene.highDynamicRange = true;
const waves = new Cesium.SceneGISWindWaves({ resolution: 128, windSpeed: 10 });
const water = scene.primitives.add(
  new Cesium.SceneGISWaterSurface({
    geometryMode: "ellipsoid",
    polygonHierarchy: new Cesium.PolygonHierarchy(
      Cesium.Cartesian3.fromDegreesArray([
        117.6, 31.3, 119.1, 31.3, 119.1, 32.6, 117.6, 32.6,
      ]),
    ),
    height: 30,
    windWaves: waves,
    maximumScreenSpaceError: 2,
    maximumTileCount: 512,
  }),
);
// After removing every surface that borrows this simulation:
scene.primitives.remove(water);
waves.destroy();
```

`height` 为固定椭球高。河流可用 `fromDegreesArrayHeights` 并设置
`perPositionHeight: true`，水位沿固定 chart 三角形线性插值；不是沿地形自动铺水，
也不是水文计算。轮廓、孔洞、椭球、模式和水位在构造时复制，修改这些输入需要重建水面。
`ellipsoid` 默认 WGS84，必须与 Globe 一致；`modelMatrix` 必须一直为 identity。
曲面入口拒绝 Planar World，平面场景继续使用 `local`。

固定区域 chart 跨日期变更线不拆相位，但轮廓必须处于同一个开放切向半球。
边是 chart 中的直线；复杂 GIS 岸线按所需曲线精度提供采样点。曲面跟随椭球，
FFT 使用区域米制 chart 并存在投影畸变。区域光学使用局部曲面近似；没有全球海洋掩膜、
海拔转换、水下相机、透明水下对象或多层水面支持。

网格按 16×16 单元分块，结合约 8 个绘制缓冲像素的单元尺度及
`maximumScreenSpaceError` 曲率目标自动细分。`meshSpacing` 是最小间距，
`maximumTileCount` 限制四叉树叶节点数量，预算不足时精度目标可能达不到。
`water.statistics` 返回最新 render 帧的快照：`selectedTiles` 为可见命令数，
`geometryBuilds` 为本帧构建数，`budgetLimited` 提示细分受限；`geometryBytes`
包含在用和闲置 GPU 网格，`inactiveGeometryBytes` 不超过 16 MiB。
`cachedTiles` 为 CPU 节点数，并非全部持有 GPU 网格。FFT 和 Scene 共享目标不计入这些字节。
局部模式的 `statistics` 为 undefined。首次构建是同步的，快速跳到未缓存区域可能产生短暂停顿。

人工入口 `Test/Rendering/曲面河湖.html?sample=lake` / `sample=river`，包含岛屿、
凹岸线、沿程水位、近景、低角度和高空切换，使用本地确定性示意几何。
严格 GPU Specs 为 `SceneGISEllipsoidWater`；E2E 入口
`Test/Rendering/playwright.curved-water.config.mjs`，回归沿用 WaterSurface/WindWaves 和双 World 玄武湖示例。
设计与已知性能范围见 ADR-0179、R25 plan/review。

## 河流水位、流向与风浪

`SceneGISRiverSurface` 是独立河流图元，复用现有水面绘制。先开启 HDR，再明确绑定 World：

```js
const river = scene.primitives.add(
  new Cesium.SceneGISRiverSurface({
    world: scene.world,
    // Globe: ECEF positions containing ellipsoid heights, in downstream order.
    positions: Cesium.Cartesian3.fromDegreesArrayHeights([
      118.7, 32.1, 25, 118.72, 32.11, 22, 118.75, 32.1, 20,
    ]),
    widths: [120, 180, 140],
    speeds: [0.6, 1.2, 0.8],
    currentSpeedScale: 1,
    maximumTileCount: 256,
    // windWaves: waves, // Optional, caller-owned, independent from river current.
  }),
);
```

Planar 的 `positions` 改为当前 World 的 `new Cartesian3(x, y, z)` 米制坐标，z 是显式水位；
不能把经纬度或 ECEF 直接传给 Planar。`widths` 是全宽，`speeds` 是沿中心线的非负 m/s，
二者均可传统一数值或与 positions 等长的数组。位置顺序决定正向流动，0 表示不平流；
水位与速度独立输入，允许显式表达坡度，但不自动求解水力学或判断水位是否合理。

`polygonHierarchy` 可精确裁剪岸线与岛屿孔洞，其高度被忽略；mask 不扩大中心线宽度包络。
过急且过宽的弯道可能折叠或自交，此时构造会报错，应修改中心线采样或宽度。
Globe 使用区域 chart，宽度按控制点局部度量换算，沿程距离采用椭球测地线；
远离 chart 中心的形状和材质仍有投影畸变，不是全球连续流场。

`currentSpeedScale`、`currentRippleAmplitude`、`currentRippleLength` 和
`currentFoamIntensity` 为运行时控制。河流自持两组随机 FFT 波场，按局部流向采样，同时改变顶点高度与法线；
`currentRippleAmplitude` 是最大位移上限（默认 0.12 m），`currentRippleLength` 是主波长
（默认 12 m），近岸衰减，远处按网格与像素尺度过滤。大波主导几何，细波补充法线，实际浪高小于上限；有限 FFT 区块仍有空间周期。
双相位周期为 32 秒，不累计随时间增长的变形。Scene time 可暂停、回退；变更流速参数会重新求值当前相位。
`currentFoamIntensity` 是艺术性白色流纹，默认 0，不代表物理破浪；与接触泡沫分开。
流速只控制搬运，设为零仍会发生波浪自身演化；暂停 Scene clock 才会冻结全部波动。
可选 `windWaves` 另行叠加风浪，不随河流流速改变。内部河流 FFT 由 RiverSurface 创建和销毁，
128² 双频带每次时间变化执行 32 个小尺寸绘制 pass，纹理约占 2.17 MiB；隐藏和拾取不推进模拟。
共有的水色、吸收、粗糙度、倒影、接触泡沫、显隐和 id 均可修改。

几何输入在构造时复制，不提供原位编辑；替换河流后再销毁不再使用的 caller-owned FFT。
拾取返回 `{ primitive: river, id }`，`getBoundingSphere()` 返回包含水流和风浪位移的 World 空间保守包围球，
`statistics` 沿用水面 LOD/缓存指标。首次到访高精度区域仍可能同步构建较多网格。

人工入口 `Test/Rendering/河流水面.html?world=globe` / `world=planar`，使用本地示意河道和河床，
提供水位、流速、独立风浪、控制点标注和近/远/低角度视角。自动化入口：
`SceneGISRiverSurface` Specs、`Test/Rendering/playwright.river-water.config.mjs`。
接口边界与性能证据见 ADR-0180 和 R26 review；视觉效果仍需项目负责人验收。

## 可编程 GPU 粒子使用与验证

把 `SceneGISGpuParticleSystem` 加入 `scene.primitives`，由用户 GLSL 定义运动规律：

```js
const acceleration = new Cesium.Cartesian3(0, 0, -2);
const particles = scene.primitives.add(
  new Cesium.SceneGISGpuParticleSystem({
    maximumParticles: 65536,
    emissionRate: 10000,
    modelMatrix,
    boundingSphere: new Cesium.BoundingSphere(Cesium.Cartesian3.ZERO, 100),
    simulationShader: `
      uniform vec3 u_acceleration;
      void initializeParticle(inout SceneGISParticle p) {
        float a = sceneGISParticleRandom(p.seed, 0.0) * 6.2831853;
        p.velocity = vec3(cos(a), sin(a), 4.0);
        p.life = 4.0;
        p.size = vec2(0.2);
        p.color = vec4(0.2, 0.7, 1.0, 0.8);
      }
      void updateParticle(inout SceneGISParticle p, float dt) {
        p.position += p.velocity * dt + 0.5 * u_acceleration * dt * dt;
        p.velocity += u_acceleration * dt;
      }`,
    uniformMap: { u_acceleration: () => acceleration },
  }),
);
```

`SceneGISParticle` 包含 `position/velocity`（vec3）、`color`（vec4）、`size`（vec2）、
`rotation/life/age/seed`（float）。位置与尺寸使用局部米制，rotation 为屏幕逆时针弧度，
life/age 单位秒。age/seed 由底层维护，其余字段由 Shader 保存和修改；更新函数读取推进后的 age。
引擎本身不会积分 velocity。`sceneGISParticleRandom(seed, stream)` 提供确定性 [0,1) 随机值。
出生粒子按其帧内年龄执行首次更新；life=0 可主动终止粒子。

构造后 capacity（`maximumParticles`）、Shader、uniformMap 的键、seed 和输入 image 不变。
回调可返回变化的 uniform；资源由调用方负责，避免回调中每帧分配新对象。
`u_sg` 与 `czm_` 开头的 uniform 名保留。decoded image/canvas/bitmap 可作为可选 image；
底层拥有上传副本，没有 image 时使用柔边圆形。

`paused=true` 保留画面并冻结模拟，`show=false` 隐藏并停止模拟，`emissionRate=0` 只停止发射。
`initialParticles` 默认 0；可在构造时指定初始填充数量。
`reset()` 在下一可见且未暂停的正常帧重新填充并重启序列，复用已有资源；Scene 时间倒退同样重置。
向前跳时直接把实际 dt 传给 Shader，调用方须选择适合的积分方案，没有隐式限步或补帧。
`modelMatrix` 必须是刚体变换，修改后已有粒子一起移动；Globe 使用 ENU，Planar 使用笛卡尔放置。
可选 `renderShader` 定义 `void styleParticle(inout SceneGISParticle p)`，在顶点副本上修改
显示属性，支持冻结模拟后随相机变化的呈现；不回写 GPU 状态。uniformMap 同时供模拟和绘制使用。
调用方确保位置及 sprite 最大范围（包括 styleParticle 修改）处于局部 boundingSphere 内；
不做逐粒子 CPU 回读计算包围体。

要求 WebGL2、float color buffer 与四个 MRT 输出；每个分配槽位双缓冲共 128 字节，
64K 状态占 8 MiB、256K 占 32 MiB，非方形容量有纹理 padding。固定容量决定更新成本，
大 sprite 和大量透明叠加仍受 fill rate 限制。OIT 不可用时不做逐粒子排序；不含碰撞、光照、
阴影和粒子运动矢量。默认集合拥有图元：`scene.primitives.remove(particles)` 会销毁资源。

自动验证入口 `SceneGIS/Scene/SceneGISGpuParticleSystem`，独立人工入口
`Test/Rendering/GPU粒子.html?world=planar` / `world=globe`。
示例的喷泉重力、轨道与体积漂浮均为调用方 Shader；天气不是底层参数。
性能证据与首版边界见 `AgentDocs/gpu-particles/reviews/`。

## 鸟瞰雨雪天气

```js
const weather = scene.primitives.add(
  new Cesium.SceneGISWeather({
    scene,
    environmentEffects: effects, // Existing registered/enabled environment controller.
    mode: "planar", // Globe scenes use "globe".
    type: "rain",
    intensity: 0.7,
    windVelocity: new Cesium.Cartesian2(5, 1),
    quality: "medium",
    radius: 1800,
    ceilingHeight: 2500,
  }),
);
weather.type = "snow";
weather.intensity = 0; // Fade to clear over transitionDuration.
weather.surface.wetness = 0.8; // Retained full-rain strength.
weather.lens.rainIntensity = 0.5;
weather.snowLens.coverage = 0.4; // Shape controls use the shared native stage.

// External fog controls use the very same controller, without competing writers.
weather.fog.automatic = false;
effects.showHeightFog = true;
effects.heightFogDensity = 0.0001;
weather.fog.automatic = true; // Explicitly return authority to weather.
```

`mode` 必须匹配场景且构造后不变。风速为 m/s，Planar XY 或 Globe 东/北；半径单位米，
降水顶高为 Planar Z 或 Globe 椭球高。强度是 0..1 视觉密度，不是降雨量。
`transitionDuration` 默认为 3 秒，作用于强度、雨雪形态和风速；`particleSize` 与 `color` 控制外观。
强度通过稳定随机阈值改变可见粒子子集，降雨还随强度增强雨丝宽度和长度；近景覆盖半径上限为 60 米，
避免大量粒子位于附近建筑之后。固定槽位/显存不代表所有粒子始终可见，雾并非雨量变化的唯一表现。
`actualIntensity` 为当前过渡值。`show=false` 立即隐藏并暂停时间，`paused=true` 冻结模拟和过渡，
相机移动仍保持覆盖；零强度完成淡出后停止 GPU 模拟/绘制。按需渲染由应用请求帧。

low/medium/high 总槽位为 16K/32K/64K，双池模拟纹理约 2.02/4/8.04 MiB；
`textureMemoryInBytes` 返回含 padding 的精确值。更改 quality/radius 重建池，暂停期间延迟至恢复时创建。
雨雪类型和强度变化复用资源。相机局部体积不是全城逐点天气场；Globe 五公里以内使用切平面近似。
粒子无光照、遮雨碰撞、地面状态或运动矢量，TAA 下运动粒子仍可能有拖影。

传入 `scene` 后，天气统一联动高度雾、湿润/积雪、地表涟漪、雨滴镜头和结霜。
雨雪交叉过渡使用同一当前强度/类型比例，不在示例中额外逐帧拼接。`show=false` 隐藏全部自动联动效果，
`paused` 冻结粒子及联动强度过渡；已有镜头雨滴/地表涟漪的细节动画仍随 Scene time，完全静止需暂停场景时间。
不传 `scene` 保持独立粒子用法，不能同时传联动配置。`mode` 必须与绑定 Scene 匹配，
每个 Scene 只允许一个绑定天气实例。

`fog`、`surface`、`lens` 三组配置各有 `automatic` 和 `enabled`。自动模式下，`enabled=false`
关闭该项；`automatic=false` 完全停止天气对该项的写入，允许外部直接调节共享实例，即使天气切晴/隐藏也不覆盖。
手动状态不会因切天气预设而悄悄重置，重新开启 automatic 才恢复联动。
`fog.density`、`surface.wetness/snowCoverage/rippleIntensity`、`lens.rainIntensity/snowIntensity`
是满强度数值，晴天保留；运行时当前值可从共享实例读取。修改配置与旧粒子参数一样由下次 Scene update 消费，
按需渲染应用应请求一帧。自动联动只在值变化时调用效果 setter，不增加持续请求帧。

雾必须显式传入已注册的 `environmentEffects`，天气不会创建第二个环境控制器、启用它或接管物理大气。
未绑定时 fog.automatic 默认 false；强行打开会报配置错误。其他雾参数可通过同一 `weather.environmentEffects`
调节。天气借用既有 Scene surface 或显式 `surfaceWeather`；显式借用的 `rainLens/snowLens` 必须已在本 Scene collection。
缺少时自动创建 surface 和两种 native stage，首次启用才加载镜头纹理。
集合移除销毁天气自建的效果及粒子池，移除 preUpdate listener；借用资源不销毁，仅条件恢复仍等于最后一次天气写入的字段，
保留后续外部修改。Fog controller 仍由调用方注册/移除。见 ADR-0106。

鸟瞰天气示例不提供云层配置或开关。
基础物理光照和曝光不随天气预设修改；该示例的固定 surfaceRadianceScale 为 3。
天空亮度沿用环境默认值（Globe 4、Planar 10），不额外压暗天空。
自动模式下天气雾密度随 actualIntensity 归零；关闭“能见度随天气变化”也清除天气雾。
下雨自动湿润、下雪自动积雪，晴天关闭覆盖；独立地表 API 仍可使用。
示例同时提供联动强度和当前值的手动控件，编辑当前值会显式转为对应的手动模式。
人工入口 `Test/Rendering/鸟瞰天气.html?world=planar` / `world=globe`，
自动验证 `SceneGIS/Scene/SceneGISWeather` 与 `SceneGIS/Scene/SceneGISGpuParticleSystem`。

球面鸟瞰天气通过 `createOsmBuildingsAsync` 在线加载 Cesium ion OSM Buildings，
并使用 `Terrain.fromWorldTerrain()` 与 `ImageryLayer.fromWorldImagery()`；观察位置为南京。
沿用 SDK 的 `Ion.defaultAccessToken`
配置，不在示例中保存凭据。ion 建筑和地形按视角流式加载；请求失败会明确提示。
平面继续使用示意街区。
不保存本地建筑快照或自行挤出建筑；Globe 验证依赖公网与 ion 授权。
示例加载、控件和销毁验证：`npx playwright test --config Test/Rendering/playwright.weather.config.mjs`。

本地调试可在当前页面的 `sessionStorage` 设置 `sceneGIS.ionAccessToken` 后刷新。
鸟瞰天气示例在创建任何 ion provider 前读取此值；未配置时保留 SDK 默认行为。
凭据仅存于该标签页会话，不写入示例源码、页面 URL、日志或版本控制。

## 地表湿润与薄雪

```js
const surfaceWeather = new Cesium.SceneGISSurfaceWeather({
  scene: viewer.scene,
  enabled: true,
  wetness: 0.7,
  snowCoverage: 0.0,
  patchScale: 40,
});
surfaceWeather.snowCoverage = 0.8;
```

`wetness` / `snowCoverage` 是独立的 0..1 视觉参数，不跟随降水类型或时间自动累积/消退。
`patchScale` 是正数、单位米；`snowColor` 是线性反射率 Color。属性赋值请求一帧，直接修改
返回的 Color 分量后由调用方 `scene.requestRender()`。Scene 拥有实例，提前 `destroy()` 会解除绑定。

自动使用现有坡度与材质：朝上面优先积雪，湿润降低粗糙表面的高光宽度并使非金属底色变暗。
支持 opaque PBR Model/3D Tiles、lit Phong 图元及两种地表；地形保留原 diffuse 光照和近似湿润方向高光。
不改变透明、unlit 模型、分类、水面、alpha 与自发光；不要求新的 GIS 资产材质字段。
薄雪不改变轮廓，无屋檐遮挡或真实积水深度；底图无地物语义，可能覆盖照片里的树木/水域。
探针仍按其原有手动更新契约捕获，修改表面后如需更新离屏反射，应重新捕获。

人工入口 `Test/Rendering/地表雨雪.html?world=planar` / `world=globe`，
真实数据入口 `Test/Rendering/鸟瞰天气.html?world=globe`。前者不依赖公网；后者沿用 ion。
专项 Specs：`SceneGIS/Scene/SceneGISSurfaceWeather`；示例 E2E 沿用 weather 配置。

### 湿地涟漪与镜头雨滴

```js
surfaceWeather.rippleIntensity = 0.8; // [0, 1], default zero
surfaceWeather.rippleScale = 0.8; // positive meters
const rainLens = scene.postProcessStages.add(
  new Cesium.SceneGISRainLensStage({
    scene,
    enabled: true, // default false
    intensity: 0.6, // [0, 1]
    dropletSize: 36, // drawing-buffer pixels, [8, 128]
    distortion: 12, // pixels, [0, 40]
  }),
);
// Collection removal destroys the stage and releases native resources.
scene.postProcessStages.remove(rainLens);
```

涟漪只影响湿润、接近水平的表面法线；积雪和远处亚像素图案抑制涟漪，水面不参与。
不会生成地面位移或雨滴碰撞，屋檐下也可能有涟漪。`rippleScale` 同时决定落点间距与波纹半径。
模型 SSR 使用扰动法线，地形仅影响已有的湿润方向高光。默认零强度保持既有材质行为。

镜头雨滴与地表覆盖互相独立，提供水珠、滑落水痕和局部折射，只有一个颜色后处理，无深度重绘。
两者随 Scene time 动画，暂停时间即冻结；不会主动启动时钟或请求连续帧。
可独立手动控制，也可由绑定 Scene 的 SceneGISWeather 联动强度并关闭零强度的镜头 stage。
独立本地示例 `Test/Rendering/降雨细节.html` 支持两种世界；鸟瞰天气页面已提供开关与强度调节。
专项 Specs 加入 `SceneGIS/Scene/SceneGISRainLensStage`；设计与限制见 ADR-0105。

### 降雪镜头

`SceneGISSnowLensStage` 沿用雨滴镜头的 native collection ownership，默认 disabled；参数为
`intensity`（0–1，霜层不透明度，默认 0.5）、`coverage`（0–1，从四周向内覆盖的范围，默认 0.4）。
两者任一为零时保留原图。例如：

```js
const snowLens = scene.postProcessStages.add(
  new Cesium.SceneGISSnowLensStage({
    scene,
    enabled: true,
    intensity: 0.7,
    coverage: 0.4,
  }),
);
```

使用包内静态冰晶贴图在镜头边缘形成霜层，默认保留清晰中央视野；范围为 1 时延伸至中心。
不随时间动画，不模拟雪点撞击或融化。一次颜色后处理，轻微模糊和透光，无深度、历史或固定亮点高光。
纹理首次启用时加载，跟随 stage 释放；不改变相机、光照、空中粒子或地表积雪。独立调用方可显式选择镜头 stage；
绑定 Scene 的 SceneGISWeather 默认负责自动选择，晴天或隐藏天气时关闭自动控制的镜头。
`Test/Rendering/降雪细节.html` 提供本地球面/平面示例，`鸟瞰天气.html` 提供统一联动及手动控制。

## 几何高光抗锯齿

PBR Model / 3D Tiles 可独立启用几何高光过滤，Globe / Planar 使用同一接口：

```js
const specularAA = new Cesium.SceneGISSpecularAntialiasing({
  scene: viewer.scene,
  enabled: true,
});
specularAA.enabled = false;
```

Scene 拥有该设置；也可提前调用 `destroy()` 解除绑定。默认关闭，不分配额外纹理、
FBO 或绘制通道。它按几何法线的屏幕变化增加基础层和清漆的有效粗糙度，不修改源材质。
平整镜面保持原粗糙度；这不能代替 TAA / MSAA，也不处理法线贴图频率或透明裁剪边缘。
动态修改材质做即时对比时，可调用已有 TAA / SSR 的 `reset()` 清除历史。
独立示例为 `Test/Rendering/高光抗锯齿.html?world=planar|globe`；Bistro 的实验 B
提供“高光抗锯齿”开关。实现与升级边界见 ADR-0098 / SGP-0025。

## 可选屏幕空间间接光（SSIL）

```js
viewer.scene.highDynamicRange = true;
const indirectLighting = new Cesium.SceneGISScreenSpaceIndirectLighting({
  scene: viewer.scene,
  enabled: true,
  radius: 5,
  thickness: 0.5,
  intensity: 1,
  resolutionScale: 0.5,
});
```

SSIL / SSGI 名称有重叠；这里实现的是局部、可见表面之间的一次漫反射。使用同帧主 MRT 的
直接漫反射和自发光，避免模糊最终画面和重复反弹 IBL。非 PBR / unlit / 地形只参与遮挡；
屏幕外和被挡住的几何、玻璃、水和多次反弹不作为源或接收者。Bistro 的
“屏幕空间间接光”分组直接控制当前配置，默认关闭；独立示例是 `Test/Rendering/屏幕空间间接光.html`，
支持 `world=planar|globe`，可关闭彩墙自发光单独检查直接漫反射的颜色传递。

默认每像素 4 个切片方向、每侧 8 个采样，半分辨率估计后保边重建。`radius` 是米制最大距离，
`thickness` 是单层深度假定厚度，过大或过小均可能漏光；它无法恢复真实的隐藏几何。
`directionCount` / `stepCount` 调节开销，`resolutionScale` 为 0.5 或 1。无独立时域历史，
可与已有 TAA 配合；应用即时对比时可调用 TAA / SSR 的 `reset()`。不自动改变抗锯齿或相机。

Scene 拥有效果；`ready` 表示当前帧已产生结果。构造为关闭不分配 GPU，关闭已启用效果会保留
目标，`destroy()` 提前释放并解绑。要求 HDR / SCENE3D / WebGL2 / 浮点附件以及单视锥，
不合格 MRT 布局显式报错；不回放几何。SSIL / SSIL+AO 分别需 3/4 个输出，叠加基础 SSR
需 6/7 个，清漆 SSR 同开需 9/10 个，不在当前原型支持范围。MSAA 辅助数据 resolve 有边缘近似。

已有 AO/SSR 时，半分辨率 SSIL 的新增持久目标约为 26 bytes/pixel（1 sample），
4x MSAA 为 90 bytes/pixel，忽略奇数尺寸向上取整。独立启用另需 opaque color/depth 快照及
线性深度；水面可借用包含反弹项的快照，无需再次绘制。具体 GPU 时间必须在固定场景实测，
参考 ADR-0099 / SGP-0026 和 R20 review；不以样例帧率代表所有 GIS 场景。

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

## 可选自动曝光

`SceneGISAutoExposure` 为 Globe / Planar 提供同一套全局直方图测光与明暗适应接口。

```js
scene.highDynamicRange = true;
const autoExposure = new Cesium.SceneGISAutoExposure({
  scene,
  enabled: true,
  exposureCompensation: 0,
  minimumExposure: 1 / 64,
  maximumExposure: 64,
  speedUp: 3,
  speedDown: 1,
});
autoExposure.locked = true; // Freeze metered gain; compensation still applies.
autoExposure.reset(); // Meter immediately after an application camera cut.
```

API 默认关闭，不改变原生固定曝光。`enabled=false` 释放自有 GPU 资源，下一帧恢复原生
手动路径；Scene 销毁时自动销毁控制器，也可提前 `destroy()`。`ready` 表示已有测光结果。
要求 HDR / WebGL2 / float color targets；不支持时明确报错，不静默降级。

`exposureCompensation` 以档计，+1 使自动结果亮一倍。minimum/maximum 是自动增益的线性
倍率范围，在补偿和原生 `scene.postProcessStages.exposure` 之前约束；原生 exposure 仍是
额外倍率，启用自动曝光时必须为有限正数。这些是相对场景亮度的值，不是校准过的 EV100。
`speedUp` 指进入亮处后降低曝光的速度，`speedDown` 指进入暗处后提高曝光的速度，
单位为档/秒；距目标 1.5 档内转为指数收敛。默认亮处适应快、暗处适应慢。

`lowPercent/highPercent` 是保留直方图区间的累计权重分位（默认 0.05/0.95），差值至少
0.0001，避免 GPU 单精度下空测光区间。`centerWeight` 在均匀测光和中央高斯加权间插值。
采用 64 档直方图，log2 亮度范围 [-16,16]；采样网格最长边不超过 128。罕见极亮/极暗值
按分位排除，天空仍按画面占比参与测光，不做语义识别。

测光使用未曝光 HDR，在原生 bloom / tone mapping 前运行；前序物理大气等已经包含在输入中。
不读取历史曝光后的颜色，不增加几何或全尺寸颜色目标，也不逐帧读回 CPU。最多 4 个小目标
绘制通道；锁定且已有结果时只更新 1x1 输出。五个 RGBA32F 目标上限约 385 KiB（方形网格），
16:9 时约 217 KiB。保留原生 tone mapper，补偿仅在该原生阶段应用一次。

真实时间而非模拟时钟控制适应速度。request-render 模式不主动追加收敛帧；应用需在希望
观察适应的期间维持渲染。长时间无渲染后的下一帧按实际经过时间适应。加载完成或相机瞬移
可调用 reset()，首帧立即测光。全局曝光无法同时解决深阴影和高亮天空的所有局部对比问题。

独立示例 `Test/Rendering/自动曝光.html?world=planar|globe` 默认开启，提供日光/黄昏/夜间
切换。PBR 综合验收的 Bistro 使用“HDR 与曝光”分组直接控制当前配置，默认关闭以保留固定
曝光基准；Sponza 仍使用“自动曝光 / 人眼适应”分组并共用于 A/B。Cycles 校准导出要求先关闭自动曝光。
详见 ADR-0100 / SGP-0027 和 R21 review 的实测结果。

## Globe / Planar 夜间环境光

Globe / Planar 夜间可用 `scene.environmentEffects.nightAmbientIntensity = 1` 配置环境补光；
有限范围 [0,8]，0 完全关闭。它以实际天空 RGB 照度平滑衔接夜间下限，默认保持
原深夜亮度，不修改背景天空、太阳/月亮方向光、HDR 或曝光。平面以固定 +Z 的物理天空照度判断。
这是艺术可读性设置，不是物理月光照度；详见 ADR-0167。

## HDR 白平衡与画面风格

```js
scene.highDynamicRange = true;
const grading = new Cesium.SceneGISColorGrading({
  scene,
  enabled: true,
  temperature: 8000,
  contrast: 1.12,
  saturation: 1.05,
});
grading.tint = 0.03;
```

`temperature` 是日光型相机白平衡色温，范围 4000–25000 K，6500 为中性，升高使画面偏暖；
不是灯光色温，不自动估计光源。`tint` 范围 [-1,1]，正值偏品红、负值偏绿。
`contrast` 范围 [0.5,2]，围绕曝光后线性 0.18 调整明暗；`saturation` 范围 [0,2]，0 为灰度。
中性参数精确跳过颜色运算。允许预设之外独立控制原生 tone mapper 和曝光。

默认 disabled，启用必须打开 HDR。Scene 拥有控制器，也可提前 `destroy()` 解绑。
调色复用原生 tone mapping 通道，无新增纹理/FBO/绘制，不反馈到自动测光或 TAA，参数调整无需
重置 TAA/SSR。全局白平衡不能同时消除阳光与蓝天等混合光源，也不能补充建筑对天空的遮挡。
`Test/Rendering/PBR综合验收.html` 的“画面风格与白平衡”提供三种起点及自定义参数；预设
只调整颜色与 tone mapper，保持时间、光照、大气和曝光配置。完整边界见 ADR-0154。

## 原生局部流体与喷泉

`SceneGISFluidPrimitive` 可直接放入 `Scene.primitives`，不替换 `SceneGISGpuParticleSystem`。
开启 HDR，球面使用 ENU，平面使用米制刚体矩阵。所有模拟量为局部米 / 秒；`modelMatrix`
变更会整体移动已有液体和容器，不重新发射粒子，也不支持缩放矩阵。

```js
scene.highDynamicRange = true;
const fluid = scene.primitives.add(
  new Cesium.SceneGISFluidPrimitive({
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(origin),
    maximumParticles: 4096,
    emissionRate: 270,
    emitterPosition: new Cesium.Cartesian3(0, 0, 0.3),
    emitterVelocity: new Cesium.Cartesian3(0.2, 0, 4.8),
    emitterRadius: 0.07,
  }),
);
fluid.emitting = false;
fluid.paused = true;
fluid.reset();
scene.primitives.remove(fluid);
```

容量是 16～16384 的 2 次幂，默认 4096；不是活跃数量或跨设备帧率保证。发射循环替换最旧槽位，
寿命到期失活。`initialParticles` / `initialDimensions` / `initialMinimum` 可指定重置时水池晶格。
布局、容器、核半径、求解迭代、步长和重建分辨率创建后固定；需要改变时重新创建图元。

默认 `timeStep=1/60`、`maximumSubSteps=2`，Scene 时间的余量累积，超出追赶上限的时间丢弃；
暂停和隐藏期间不追赶，时间倒退重置。相同时间和 pick pass 不推进。`emitting=false` 只停止新生，
`paused=true` 保留画面，`reset()` 在下一可见 render（含暂停状态）恢复初始晶格并复位发射序列。
request-render 应用需要自行请求连续渲染。`destroy()` 释放所有自有 GPU 资源，容器默认负责销毁。

`particleSpacing` 决定粒子体积；建议发射率与 `π * emitterRadius² * speed / particleSpacing³`
处于相近量级，过密发射会由密度约束产生显著压力和飞溅。碰撞为显式局部闭合盒边界，场景中
其他建筑仅参与可见遮挡与光学，不会自动成为碰撞体。连续表面由屏幕深度、厚度、双边平滑和
法线重建得到；厚度按粒子体积归一化，复用水体 Fresnel/GGX、天空、SSR 与 opaque 折射。
渲染半径会影响水团连接与外观；不是粒子的碰撞半径。

可运行 `Test/Rendering/流体模拟喷泉.html`，使用球面/平面入口和暂停、发射、重置控制。
`Test/Rendering/流体求解器验证.html` 提供有界硬件 GPU timer 测量。自动验证入口是
`SceneGISFluidSolverSpec` / `SceneGISFluidPrimitiveSpec`。详细边界和证据见 ADR-0187。
