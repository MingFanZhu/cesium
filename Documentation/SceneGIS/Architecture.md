# SceneGIS 架构

本文档记录 SceneGIS 长期维护所依赖的系统边界、分层原则和架构决策入口。它面向架构 Agent、维护者，以及执行公共 API、渲染管线、Shader、Worker、构建发布和官方版本升级等非局部任务的 Agent。

具体编码、分支、测试和补丁操作见 [DevelopmentGuide.md](DevelopmentGuide.md)。强制执行规则见仓库根目录和相关包中的 `AGENTS.md`。

## 当前基线

官方基线的机器可读来源是 [upstream-base.json](../../.scenegis/upstream-base.json)：

- 上游仓库：`CesiumGS/cesium`
- 上游版本：`1.144`
- 上游提交：`6d5d8b1f0725b6f831b336463f4b11c98023427b`
- 产品开发分支：`scenegis/develop`

远程与分支模型：

```text
CesiumGS/cesium:main (upstream)
             |
             v
MingFanZhu/cesium:main (origin, clean mirror)
             |
       official release tag
             |
             v
MingFanZhu/cesium:scenegis/develop
        |             |
        v             v
   feature/*     upgrade/cesium-*
```

`origin/main` 不承载 SceneGIS 修改。`scenegis/develop` 是长期产品主线；官方版本升级通过专用 `upgrade/cesium-*` 分支合入稳定 release tag。

## 架构目标

SceneGIS 的主要目标是：

- 在 CesiumJS 基础上长期扩展 GIS 功能、数据能力和渲染表现力。
- 最大限度集中自有实现，使官方升级成本可观察、可测试、可回退。
- 对不得不修改的 Cesium 原文件建立明确、窄小、带理由的集成缝隙。
- 保持 Cesium 现有 engine、widgets、Sandcastle、构建和测试体系的总体结构。
- 让公共 API、渲染结果、资源生命周期和性能变化都能够被验证。

以下不是目标：

- 追求形式上的“零上游改动”，却使用 monkey patch、隐式全局状态或复制大段上游实现。
- 在不知道真实需求前预先设计所有 Shader、Worker 或资源构建方案。
- 为了目录整齐破坏 Cesium 现有包边界和依赖方向。
- 将 SceneGIS 私有实现误认为浏览器或 npm 层面不可访问的安全边界。

## 所有权模型

`.scenegis/upstream-base.json` 中提交已经包含的路径是 upstream-owned。SceneGIS-owned 路径由根 `AGENTS.md` 列出，核心区域包括：

```text
packages/engine/Source/SceneGIS/**
packages/engine/Specs/SceneGIS/**
packages/widgets/Source/SceneGIS/**
packages/widgets/Specs/SceneGIS/**
packages/sandcastle/gallery/scenegis-*/**
Specs/e2e/scenegis-*.spec.js
Documentation/SceneGIS/**
AgentDocs/**
.scenegis/**
scripts/scenegis/**
```

所有权按照“上游基线中是否已经存在该路径”判断，而不是按照当前分支中文件所在目录判断。修改 upstream-owned file 必须登记 SGP；新增 SceneGIS-owned file 不需要 SGP。

## Agent 协作文档边界

`AgentDocs/**` 是架构 Agent、执行 Agent 和评审 Agent 之间的持久协作区。它不属于 Cesium 或 SceneGIS 的运行时代码，不得被 engine、widgets、Sandcastle、构建或发布流程导入，也不进入 npm 产物。未来如果工具需要读取该目录，必须先通过 ADR 明确协议、失败行为和发布影响。

每个独立 SceneGIS 扩展对应一个稳定目录：

```text
AgentDocs/<extension-slug>/
├── README.md
├── plans/
├── discussions/
└── reviews/
```

扩展目录按产品能力或子系统划分，不按 Agent 对话、Git 分支、提交或单个缺陷划分。
目录索引维护当前状态、范围、planning model、current phase、active plan、未决问题和
工程链接；三个子目录分别保存计划、提炼后的方案讨论和带处置状态的评审记录。

大型扩展使用 progressive elaboration：一个 extension plan 维护稳定目标、架构边界、
阶段依赖和整体验收条件；阶段真正开始时再建立 phase plan，依据当前源码细化设计、
步骤和验证。尚未进入的阶段不得提前固化易变实现。小型单阶段工作可以使用一个
standalone plan。

AgentDocs 是工作过程和交接记录，不建立新的规范层：

- `AGENTS.md` 定义强制执行约束。
- 本文档和 ADR 定义长期架构边界与决策。
- `.scenegis/upstream-patches.json` 定义上游补丁台账。
- 源码和自动化测试定义当前可执行行为。
- AgentDocs 引用上述事实，并记录尚未完成的计划、讨论、review 和 handoff。

讨论形成长期决定时必须提升为 ADR；形成跨扩展强制规则时必须同步提升到本文档或相应 `AGENTS.md`。原讨论保留并链接正式决定，以保存决策过程而不产生两个事实源。

## Engine 分层

SceneGIS engine 目录镜像 Cesium 的概念层，而不是建立独立平行引擎：

```text
SceneGIS/Core
      |
      v
SceneGIS/Renderer
      |
      v
SceneGIS/Scene
      |
      v
SceneGIS/DataSources
```

允许依赖关系如下：

| 层            | 可以依赖                                              | 不得依赖                              |
| ------------- | ----------------------------------------------------- | ------------------------------------- |
| `Core`        | Cesium Core、SceneGIS Core、无平台副作用工具          | Renderer、Scene、DataSources、Widgets |
| `Renderer`    | Core、Cesium Renderer、SceneGIS Renderer              | Scene、DataSources、Widgets           |
| `Scene`       | Core、Renderer、Cesium Scene、SceneGIS Scene          | DataSources、Widgets                  |
| `DataSources` | Core、Scene、Cesium DataSources、SceneGIS DataSources | Widgets                               |

UI 能力属于 `packages/widgets/Source/SceneGIS`。Sandcastle 只组装示例，不承载可复用业务实现。

## 公共 API 与私有语义

Cesium 当前由 [scripts/build.js](../../scripts/build.js) 递归发现普通 engine JS，并按文件 basename 生成根导出。这是扁平 API，不会根据目录生成命名空间。

SceneGIS 当前采用以下策略：

- 公共模块文件名、default export 和 JSDoc 类型名以 `SceneGIS` 开头，并保持一致。
- 公共 API 通过 Cesium 现有根入口暴露，不要求调用方 deep import。
- 文件内部 helper 优先保持文件作用域，不为猜测中的复用提前拆分。
- 跨文件私有模块 basename 使用 `_SceneGISFoo.js`，可以同时放在 `_private/`，并标记 `@private`。目录名不会进入根导出名。
- `@private` 表示不属于兼容性承诺；它默认从公开文档和类型声明隐藏，但仍可能出现在 JS barrel 或通过 deep import 访问。
- 不引入 `@package` 可见性层级。

当前不修改构建器来严格隐藏 `_` 模块。未来只有在真实内部模块数量、包体积或 API 污染问题出现后，才评估 barrel、JSDoc、类型、tree-shaking 和 npm 发布的完整影响。

## 上游集成策略

实现顺序从低耦合到高耦合：

1. 使用 Cesium 现有公共或内部扩展点。
2. 在 SceneGIS-owned 目录中通过组合实现。
3. 在 upstream-owned file 中增加一个窄小、显式、可测试的 hook，主体实现仍位于 SceneGIS。
4. 最后才直接修改 Cesium 算法、渲染流程或资源协议。

每个上游集成目的使用一个稳定的 `SGP-####`。SGP 记录在 [upstream-patches.json](../../.scenegis/upstream-patches.json) 中，并通过 `SCENEGIS_PATCH_BEGIN` / `SCENEGIS_PATCH_END` 标记具体文本 hunk。

SGP 生命周期：

```text
proposed -> active -> retired
```

- `proposed`：已确认需要上游缝隙，但尚未完成实现或验证。
- `active`：当前产品主线仍依赖该补丁。
- `retired`：官方已提供等价能力、设计已移除，或不再支持相关功能。

编号不得复用。官方升级时逐项复核所有 active SGP。

## 构建边界

当前已确认的构建行为：

| 扩展类型                       | 当前行为                              | 架构要求                                       |
| ------------------------------ | ------------------------------------- | ---------------------------------------------- |
| 普通 `Source/SceneGIS/**/*.js` | 自动进入 engine 与根 Cesium barrel    | default export；basename 唯一                  |
| `Specs/SceneGIS/**/*Spec.js`   | 自动进入 SpecList                     | 镜像源码目录                                   |
| GLSL                           | 当前主要扫描 `Source/Shaders/**`      | 首次需求时追踪完整 shader 转换链路             |
| Worker                         | 当前主要扫描 `Source/Workers/**`      | 首次需求时决定输出路径和运行时 URL             |
| 静态资源、WASM、图片           | 发布复制与测试访问链路不同            | 同时验证 workspace、release、npm 和 Sandcastle |
| CSS 与 UI                      | engine 与 widgets 规则不同            | UI 保持在 widgets 包边界内                     |
| 模块副作用                     | 受 tree-shaking 和 `sideEffects` 影响 | 优先显式安装或注册 API                         |

Shader builtin、SceneGIS Worker 输出结构以及严格私有 barrel 当前都是延迟决策，不在没有真实功能和源码证据时预设答案。

## 渲染扩展原则

渲染表现力扩展可能涉及 Primitive、DrawCommand、PostProcessStage、CustomShader、Model pipeline stage、Globe shader、FrameState 或 Scene render loop。选择接入层时遵循：

- 优先使用已有公开抽象；只有公开抽象无法表达需求时才进入内部渲染层。
- SceneGIS 计算和状态尽量封装在自有模块；Cesium 原文件只调用窄接口。
- 不通过 prototype 替换、加载时注入或隐式全局注册改变渲染流程。
- 明确 GPU/CPU 资源的创建、所有权、复用、失效和销毁时机。
- 热路径避免无依据的逐帧对象分配、Shader 重编译和状态抖动。
- 影响默认画面时提供稳定的像素回归场景；影响性能时记录可重复的基线和对比条件。

### 平面地形 Core 契约

平面地形使用独立的 `SceneGISPlanarTerrainProvider`、`SceneGISPlanarTerrainData` 和
`SceneGISPlanarHeightmapTerrainData`，不得继承、包装或伪装 Cesium 的 ellipsoid-oriented
terrain runtime。Provider 必须引用 world 后续使用的同一个 canonical
`SceneGISPlanarTilingScheme` object，使用米制保守全局高度范围并提供 Level 0 `1 × 1` root。

Provider 返回通用 TerrainData，不能把 Heightmap 固化为永久返回类型。TerrainData 是只读的
CPU data object，不拥有 Request、GPU 或 Worker resource，也不提供 `destroy`、`createMesh`
或公共 mesh-dependent upsample。Heightmap 的 raw buffer/structure、row order、child mask 和
SW→NE triangle interpolation 与 Cesium 数据表示兼容，但 extent、坐标、mesh、Worker 和
运行时必须保持真正的平面语义。解码高度、geometric error 和所有范围统一使用米。

首版 Heightmap 不接受 NoData/NaN 或单瓦片孔洞。插值必须与后续 terrain mesh 三角化一致，
不能用 bilinear height 替代实际 triangle surface。完整公共契约、ownership、availability 和
错误边界见
[ADR-0007](Decisions/ADR-0007-planar-terrain-core-contract.md)。

### 平面地形 Surface 集成

`SceneGISPlanarWorld` 的 terrain provider 通过可写 `terrainProvider` 属性在 World 创建后显式
挂载；T2 不提供 constructor option，因为 provider 必须引用该 World 已创建的同一个 canonical
`SceneGISPlanarTilingScheme` object。provider 始终由调用方拥有，setter 必须在任何 request、
command 或 GPU mutation 前原子验证 identity、米制全局高度范围、maximum level、error curve、
event、Credit 和 request/availability contract。replacement、detach、tile eviction 与 world
destroy 必须取消旧 request、隔离迟到 generation 并 exactly once 释放 World-owned CPU/GPU
terrain resource，但不得销毁 provider。

Heightmap terrain mesh 使用 tile-local normalized XY 与相对 reference height；完整 CRS tile
center、scale 和 reference Z 只通过 `modelMatrix` 恢复。selection OBB 与 camera distance 使用
真实三维高度区间；SSE 取现有 flat/imagery nominal error 与 provider terrain error 的最大值。
相机位于 terrain 下方仍是合法笛卡尔视角，surface 继续双面渲染。

terrain geometry 与 imagery 必须共用同一 ideal tile 和单个 opaque command。normal render 是
request、mesh、GPU、bounds、command cache、readiness 与 LRU mutation 的唯一通道；pick+depth
pass 只重放最近 normal render 的 command references。`scene.pickPosition` 可以反映 rendered
terrain depth，但 World 和 camera controller 的现有 public pick 继续表示有界 Z=0 reference
plane，直到独立 terrain query/picking phase 提供明确 API。

无 provider 时不得 materialize terrain runtime、entry、request、mesh 或 terrain GPU buffer，
现有 shared-unit-quad flat path 保持。T2 只提供 Z=0 ideal-tile fallback 和主线程 Heightmap mesh；
ancestor fallback、upsampling、裂缝处理、availability metadata、Worker 和 byte budget 必须在
后续 phase 依据真实 runtime 重新设计。完整决定见
[ADR-0008](Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)。

### 平面地形连续 LOD 与缓存

Terrain-enabled quadtree 必须把 desired、load 与实际 render cover 分开。父 tile 只有在四个直接
child 都已有可渲染 direct、upsampled 或稳定 flat content 后才能同帧完全退出；不得提交父子重叠
或部分 child coverage。Provider `maximumLevel` 可以低于 World `maximumLevel`，但不得 clamp
World/imagery LOD；更深层通过 direct-parent Heightmap upsample 或稳定 flat fallback 覆盖，且不发
越界 direct request。

Availability 顺序固定为 provider tri-state、非 upsample direct-parent child mask、一次 metadata
load，再以 optimistic geometry request 处理仍未知的 tile。Direct、fallback 与 active content
必须独立表达，normal render 中按 `DIRECT > UPSAMPLED > FLAT` 原子切换，并以 source revision
刷新旧 fallback。Promise completion 只能投递状态；selection、upsample、mesh、GPU、bounds、
command cache 与 LRU mutation 仍只发生在 normal render。

所有 terrain mesh 使用 regular-grid + downward skirt。Selection OBB 只包含 surface，pending
direct 时保守包含 provider global height range；DrawCommand sphere 还必须包含 skirt。CPU-to-GPU
promotion 每个 normal frame 最多两个，blocking coverage 优先。Tile-count LRU 保护 render、
desired、ancestor、bridge child 与 promotion source；tile-owned direct/fallback VA 和 ref-counted
shared index buffer 在 replacement、eviction、detach 与 destroy 中 exactly once 释放。

`tilesLoaded` 只描述当前 view：recoverable direct、availability、request、promotion 或 revision
refresh 即使已有 fallback 仍为 false；terminal direct 配合稳定 fallback 可以收敛。Imagery 只绑定
actual render tiles，pick+depth 继续精确 replay 最近 normal-render command references。无 provider
仍保持 zero terrain allocation，public World/camera picking 仍是 Z=0 reference plane。完整决定见
[ADR-0009](Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)。

### 平面影像运行时

`SceneGISPlanarWorld` 的 imagery provider 必须与 world 共享同一个 canonical
`SceneGISPlanarTilingScheme` object；等值但非同一 identity 的 scheme 不属于受支持配置。
`SceneGISPlanarImageryLayerCollection` 拥有加入其中的 layer，并负责其 exactly-once destroy，
但 layer、collection 和 world 都不拥有 provider。

影像 readiness 只描述当前 normal-render ideal tile set 上所有 shown layer 的 desired imagery；
因此 `world.tilesLoaded` 是 current-view 动态值，而不是 provider 全金字塔完成标志。每个 binding
请求 desired address，并在需要时 bootstrap Level 0；它可以复用 cache 中最近的 READY ancestor，
但 P5 不主动请求 intermediate ancestor。request、decoded image、texture、generation 和 cache
reference 必须分别有明确的取消、迟到隔离与 exactly-once 释放语义。

图层按 collection 的 bottom-to-top 顺序在每个 ideal tile 的单个 opaque command 中合成。
shown layer 数超过 `ContextLimits.maximumTextureImageUnits` 时必须在 request、selection 或 GPU
mutation 前原子失败；P5 不使用 multipass，也不改变 P3 geometry/SSE/selection。

`scenegis-planar-imagery` 是 engine-level Sandcastle 人工案例，只通过显式 `CesiumWidget({ world })`
和 controller registration 组装能力。Viewer 与 widgets 自动集成属于 P6，不得从该示例反向形成
隐式 engine contract。通用 UI provider selection 不属于 SceneGIS：自定义平面 CRS、extent、
canonical tiling scheme 与服务 coverage 必须由应用显式匹配，具体选择 UI 由应用实现。

### 平面 Viewer 集成

`Viewer` 的平面入口只接受 live `SceneGISPlanarWorld`：

```js
new Viewer("cesiumContainer", { world });
```

generic custom world、`world: false` 和手工 controller ownership 继续使用低层 `CesiumWidget`。
定义 `world` 后不得同时定义 `globe`；planar Viewer 固定 `SCENE3D`/`scene3DOnly`，并在 DOM、
WebGL、controller 或 provider mutation 前拒绝 base layer、terrain、map projection 和不兼容 widget
选项。没有定义 `world` 时，默认 Globe 与 `globe: false` 行为不得改变。

planar Viewer 关闭 legacy `screenSpaceCameraController` 的 inputs，但不替换该属性；它通过
`ControllerHost` 注册唯一 `SceneGISPlanarCameraController`，并在 CesiumWidget/Scene/world
销毁前成对移除。传入 world 表示转移独占生命周期所有权，同一 world instance 不得交给第二个
Viewer/CesiumWidget；P6 不增加跨 Scene owner registry。

Viewer 使用 SceneGIS-owned planar Home command 调用 controller `viewHome(scene)`。InfoBox 只保留
title/description，SelectionIndicator 与 left-click selection 可以保留；Entity tracking、InfoBox
camera、`zoomTo` 和 `flyTo` 不属于当前 planar contract。BaseLayerPicker、Geocoder、
SceneModePicker、ProjectionPicker、NavigationHelpButton 和 VRButton 默认关闭，显式启用时
fail-fast。Animation、Timeline、Fullscreen 以及不携带 Globe 语义的显示控件保持可用。完整选项矩阵、
ownership 和升级检查点见
[ADR-0006](Decisions/ADR-0006-planar-viewer-and-widget-integration.md)。

## 验证架构

SceneGIS 使用四层验证：

1. Jasmine 单元、契约和资源生命周期 Specs。
2. WebGL、Shader 和渲染 matcher 测试。
3. Sandcastle 可执行示例与人工视觉验收。
4. Playwright 关键交互和持久视觉回归。

Sandcastle 默认截图只能作为基础冒烟，不能覆盖参数组合、错误输入、销毁过程和性能变化。

## 平面世界发布资格边界

Planar World 的 release qualification 必须把 observable contract 与测量证据分开：selected/submitted tile、rendered pixel、imagery fallback、depth replay、single-Context 和 exactly-once ownership 是 hard gate；单机 CPU/GPU timing 仅用于同环境趋势与调查，不能作为跨机器 flaky assertion。warm-frame 验证应同时检查持久资源计数、resident cache bound、request/ref/texture 收敛和 destroy balance。

发布审计以 `.scenegis/upstream-base.json` 的 tree 判定 upstream-owned path，并要求每个 upstream diff 都由 SGP 登记、paired marker 配对、引用路径存在。package qualification 必须覆盖 workspace 与 installed tarball 的 root/engine/widgets public exports、types 和 API docs，同时证明 private runtime 不进入 public surface。所有临时 package/profile/generated 产物必须留在 delivery diff 之外。

## 官方版本升级

官方升级必须在 `upgrade/cesium-*` 分支完成：

1. 获取并核验新的官方 release tag。
2. 将 tag 合入升级分支，不混入新功能开发。
3. 逐项检查 active SGP：继续、调整或退役。
4. 复核所有 ADR 中记录的构建、运行时和升级检查点。
5. 运行构建、类型、Specs、关键 Sandcastle、E2E 和性能验证。
6. 更新 `upstream-base.json`，并使补丁清单反映新基线下的实际差异。
7. 验证完成后再合入 `scenegis/develop`。

## 架构决策记录

以下情况需要 ADR：

- 新子系统或新的跨层依赖。
- 公共 API 形态或兼容性承诺变化。
- Shader builtin、Worker、WASM、资源路径或构建发布方案。
- 修改 Scene、Renderer、Model pipeline 或其他高风险热路径。
- 引入新的运行时注册协议、缓存、线程或资源所有权模型。
- 对官方升级方式产生长期影响的决定。

ADR 放在 `Documentation/SceneGIS/Decisions/ADR-####-short-title.md`。首次需要时再创建目录和模板。ADR 至少包含：

- 状态与上下文。
- 当前 Cesium 版本的源码事实。
- 考虑过的方案。
- 最终决定与理由。
- 运行时、构建、发布和升级影响。
- 测试与性能验证。
- 相关 SGP（如有）。

局部、易回退且不形成长期约束的实现细节不需要 ADR。一个决定成熟为全局规则后，应把精简规则提升到本文档或相应 `AGENTS.md`，ADR 保留历史原因。

## 当前延迟决策

- SceneGIS GLSL 和 `czm_*` builtin 的最终目录与生成方式。
- SceneGIS Worker 的入口发现、输出目录、URL 和 inline worker 行为。
- 是否从根 JS barrel 严格排除 `_` 私有模块。
- SceneGIS 静态资源在 workspace、release、npm 和 CDN 中的统一定位方式。
- 持久视觉基线和性能基线的 CI 执行环境。

处理这些问题时必须以届时的 Cesium 源码为准；本文档不把当前推测升级为约束。
