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
packages/engine/Source/Shaders/SceneGIS/**/*.glsl
packages/engine/Source/Assets/SceneGIS/**
packages/engine/Specs/SceneGIS/**
packages/widgets/Source/SceneGIS/**
packages/widgets/Specs/SceneGIS/**
packages/sandcastle/gallery/scenegis-*/**
Test/**
Specs/e2e/scenegis-*.spec.js
Documentation/SceneGIS/**
AgentDocs/**
.scenegis/**
scripts/scenegis/**
packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js
```

所有权按照“上游基线中是否已经存在该路径”判断，而不是按照当前分支中文件所在目录判断。修改 upstream-owned file 必须登记 SGP；新增 SceneGIS-owned file 不需要 SGP。

`packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js`是ADR-0027批准的唯一特殊Worker entry：
它不在上游基线中，只负责接入Cesium现有Worker构建链，实际算法继续位于`Source/SceneGIS/**`。该精确例外
不自动授权其他`Source/Workers`文件；新增entry仍需重新审计、ADR与所有权说明。

`packages/engine/Source/Shaders/SceneGIS/**/*.glsl` 是 ADR-0030 批准的 SceneGIS shader source root。
它复用 Cesium 现有 `Source/Shaders/**` GLSL-to-JS 构建链；相邻生成 `.js` 是忽略的 build artifact，
不得手工编辑或提交。SceneGIS runtime 通过显式相对 import 使用生成模块，不依赖 side-effect 注册。

`packages/engine/Source/Assets/SceneGIS/**` 是 ADR-0041 批准的 SceneGIS runtime asset root。只允许保存经过
license/provenance、format、尺寸和资源预算审计的版本化静态资源及其机器可读 manifest；许可证文本必须随衍生资源进入
build/npm 产物。Runtime 使用 `buildModuleUrl("Assets/SceneGIS/...")` 定位，不依赖公网 URL、本机路径或临时 clone。

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

UI 能力属于 `packages/widgets/Source/SceneGIS`。`Test/**` 是 SceneGIS-owned 的直接开发示例根目录，只组装API、
本地测试数据和人工调试UI，不承载可复用业务实现，也不进入engine/widgets npm产物。既有
`packages/sandcastle/gallery/scenegis-*` 作为legacy示例保留；除兼容性复现或明确的上游Sandcastle集成需求外，
新SceneGIS示例默认进入`Test/**`。

`Test/lib/**`只允许保存浏览器示例确实需要的本地第三方库。每个库必须记录固定版本、上游来源和许可证；
不得由engine/widgets/runtime导入，不得把CDN、access token或其他secret作为示例运行前提。

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

- `proposed`：已确认需要上游缝隙，但尚未完成实现或验证；可以尚无marker，已存在的marker仍必须完整并覆盖对应diff。
- `active`：当前产品主线仍依赖该补丁；每个登记路径必须存在完整marker pair并覆盖对应diff。
- `retired`：官方已提供等价能力、设计已移除，或不再支持相关功能；只保留manifest历史，不再允许marker或覆盖live diff。

编号不得复用。官方升级时逐项复核所有 active SGP。
同一upstream path可承载多个独立SGP，但必须全部使用`paired`；审计按status解析一次该文件的所有marker，使用active与已落地
proposed ranges的并集覆盖changed lines，使任一retired登记可独立移除而不影响同文件其他active补丁。

## 构建边界

当前已确认的构建行为：

| 扩展类型                       | 当前行为                                              | 架构要求                                                                        |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| 普通 `Source/SceneGIS/**/*.js` | 自动进入 engine 与根 Cesium barrel                    | default export；basename 唯一                                                   |
| `Specs/SceneGIS/**/*Spec.js`   | 自动进入 SpecList                                     | 镜像源码目录                                                                    |
| SceneGIS GLSL                  | 扫描 `Source/Shaders/SceneGIS/**/*.glsl`              | basename 全局唯一；生成 `.js` 不提交；验证 dev、release 与 npm                  |
| Worker                         | 扫描 `Source/Workers/**` 并输出多种构建形态           | 每个新入口单独审计 URL、transfer 与 package 边界                                |
| SceneGIS runtime asset         | `copyEngineAssets` 保持 `Assets/SceneGIS/**` 相对路径 | 验证 workspace、dev/release、root 与 installed npm；随包携带 license/provenance |
| 其他静态资源、WASM、图片       | 发布复制与测试访问链路不同                            | 首次接入时重新审计 workspace、release、npm 和 Sandcastle                        |
| CSS 与 UI                      | engine 与 widgets 规则不同                            | UI 保持在 widgets 包边界内                                                      |
| 模块副作用                     | 受 tree-shaking 和 `sideEffects` 影响                 | 优先显式安装或注册 API                                                          |

Shader builtin、额外 SceneGIS Worker 入口以及严格私有 barrel 当前仍是延迟决策，不在没有真实功能和源码证据时预设答案。SceneGIS GLSL source/delivery 以 ADR-0030 为准；A4 已批准的唯一 terrain Worker 入口以 ADR-0027 为准。

## 渲染扩展原则

渲染表现力扩展可能涉及 Primitive、DrawCommand、PostProcessStage、CustomShader、Model pipeline stage、Globe shader、FrameState 或 Scene render loop。选择接入层时遵循：

- 优先使用已有公开抽象；只有公开抽象无法表达需求时才进入内部渲染层。
- SceneGIS 计算和状态尽量封装在自有模块；Cesium 原文件只调用窄接口。
- 不通过 prototype 替换、加载时注入或隐式全局注册改变渲染流程。
- 明确 GPU/CPU 资源的创建、所有权、复用、失效和销毁时机。
- 热路径避免无依据的逐帧对象分配、Shader 重编译和状态抖动。
- 影响默认画面时提供稳定的像素回归场景；影响性能时记录可重复的基线和对比条件。

### 双世界高级环境渲染

高级 atmosphere/cloud/fog/god-ray/lens stack 使用 ADR-0040 的 SceneGIS-owned advanced background 与
pre-tonemap linear-HDR 两个 slot。Public `SceneGISEnvironmentEffects` 是 caller-created、caller-registered Controller；
`mode="globe"|"planar"` 必须显式给出，planar 还必须绑定 live `SceneGISPlanarWorld`。Controller 默认
`enabled=false`，注册本身不得 attach pipeline、fetch asset 或分配 GPU resource；每个 live Scene 最多一个 active pipeline。

A2 的 Globe atmosphere 把 Cesium geodetic altitude/local vertical 映射到固定 Earth Bruneton sphere，使用随包交付的
transmittance、combined scattering 与 irradiance RGBA16F LUT；planar atmosphere 使用同一 Rayleigh/Mie/ozone coefficients，
但在固定 `+Z` slab 中独立积分，不读取 spherical LUT、不制造 curved horizon。两条路径提供同一 physical sky、Sun disk 与
depth-aware aerial-perspective capability family，但不承诺 pixel-identical 或相同 multiple-scattering order。

Advanced effects 默认不接管 `scene.light`，也不自动修改或恢复 native/simple environment；唯一例外是ADR-0053明确授权的
Globe A11-G primary celestial-light lifecycle。Caller 必须在启用前显式关闭会造成
double energy 的 native `SkyAtmosphere`、ground atmosphere、Fog、Sun body/bloom、SkyBox 或 planar lightweight
atmosphere/body；冲突和 capability failure 必须先于 asset/GPU mutation fail closed。A10-G 起，Globe 的 caller-owned native
`scene.moon` 是唯一 body 例外：它复用 Cesium 星历、月面朝向、Sun-only lighting 与 Globe occlusion，并通过 `SGP-0008` 在 advanced
background 之后、ordinary geometry 之前执行；Planar 仍禁止 native Moon。完整基础 contract 见
[ADR-0041](Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md)，Moon 例外见
[ADR-0051](Decisions/ADR-0051-globe-native-moon-composition.md)。

A5-G遵循Globe-first边界：volumetric cloud shadow使用SceneGIS-owned current-frame Beer optical-depth atlas，不复用Cesium native
geometry `ShadowMap`；Globe surface是唯一获准消费A2 Sun/sky irradiance与cloud transmittance的scene albedo consumer，Models、3D Tiles和
resolved scene color不得被fullscreen relight。Crepuscular rays通过Bruneton `shadow_length`与A3 directional fog inscatter耦合，不使用radial
blur、第二层haze或独立shadow history。最小Globe surface seam登记为`SGP-0009`；资源、packing、public options及Planar冻结边界见
[ADR-0047](Decisions/ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md)。

A6-G只演进ADR-0046既有的two-target Cloud history：Globe resolve从现有mean/front/scene distance重建world position并投影到previous
successful camera，cloud validity与A5 shadow length先semantic decode/filter再repack；invalid、exact-stationary与camera-cut frame均发布完整
spatial-only结果。Public `cloudQuality`是cloud/Beer/resolve唯一caller-owned动态performance tier；renderer不得自动测FPS、按camera motion降档、增加
settling render或建立第二套Beer history。A6-G不增加GPU resource/pass/command category，完整continuity、budget与Planar冻结边界见
[ADR-0048](Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)。

后续 Globe temporal 行为以 ADR-0048 的已接受 amendment 为准：A8/A12 的 stationary Globe 允许现有 STBN/history；A13 允许仅 medium
使用 2x2 phased cloud tracing 与 full-resolution depth-aware reconstruction。First/invalid/cut frame 必须立即发布完整 current spatial image，
不得等待 phase 收敛、提高 history 权重、抖动 native scene camera 或引入自动 FPS 降档。High、low、Planar 与 world-space Beer 保持原路径；
精确 sample-coordinate、distance-domain、resource 和视觉 gate 由 ADR-0048 的 A13 amendment 约束。

A7-G在同一`SGP-0008` pre-tonemap linear-HDR slot末端执行Globe bright threshold、固定separable blur与additive bloom/ghost/halo composite。
Lens artifact只消费final HDR Sun signal与resolved exact-clear depth完成terrain/cloud visibility；不得新增Sun、Cloud MRT或history authority。
SceneGIS bloom启用时Cesium general bloom必须caller-owned地保持disabled，existing `scene.sunBloom=false` contract继续排除`SunPostProcess`。
A7固定使用two half-resolution加one full-resolution color-only RGBA16F targets，不使用public `PostProcessStage`、raw WebGL、screen blend、asset、
tone mapping或Planar执行；完整public、resource与lifecycle contract见
[ADR-0049](Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)。

A9-G在同一physical irradiance/source domain为Globe natural environment增加一种固定`readable` night skylight。它按每个
receiver/sample的actual radial up与ECEF Sun direction在local solar elevation `-6°`到`-12°`之间平滑接管，只进入terrain、cloud body/
ground bounce/haze与height-fog ambient；direct Sun、Beer shadow、directional fog/rays、background atmosphere、Models/3D Tiles、Planar及
HDR display transfer保持不变。A9不增加public mode/property、uniform、resource、history、upstream hunk或SGP；完整source与consumer contract见
[ADR-0050](Decisions/ADR-0050-globe-readable-night-skylight.md)。

A10-G复用Cesium caller-owned native `scene.moon`，不复制Moon primitive、Simon1994星历、IAU orientation或
`Assets/Textures/moonSmall.jpg`。Active advanced pipeline通过既有`SGP-0008`把advanced background排在native Moon command之前；Moon随后仍由
Scene environment pass exact-once执行，并继续使用Cesium culling与Globe occluder。A10不增加SceneGIS GPU resource、controller property、moonlight、
shadow、asset或Planar行为；完整ordering、conflict与ownership contract见
[ADR-0051](Decisions/ADR-0051-globe-native-moon-composition.md)。

A11-G在冻结A10-G后增加一个Globe-only primary celestial light。Actual ECEF Sun继续作为background/aerial/native Moon phase与A7 Sun gate；
surface/cloud directional transport、A5 Beer atlas/rays及一个stable controller-owned `DirectionalLight`共享phase/horizon/night-weighted Moon endpoint。
Moon direction由same Simon1994 + central-body-fixed transform和geodetic surface observer计算，不得读取camera orientation。Geometry shadow只复用
Scene-owned `scene.shadowMap`与native Globe/3D Tiles/Model cast/receive commands；A5 Beer atlas仍是volumetric transmittance，禁止第二ShadowMap或
把二者混用。Controller snapshot/restore `scene.light`、native shadow state、Globe ShadowMode与defined native `Moon.textureUrl`，active external
mutation fail closed。更高分辨率月面只替换pinned NASA CGI Moon Kit color asset；Moon object/show/phase/orientation/ellipsoid ownership不变，不支持
displacement/normal/eclipses。Existing `SGP-0009`只扩展current frame-local surface uniforms，不增加upstream path或new SGP。完整API、resource、
lifecycle与Planar冻结边界见[ADR-0053](Decisions/ADR-0053-globe-moonlight-shadow-surface.md)。

P1设计在冻结A10-G后恢复Planar路线，但已在review/owner gate前延期；重新激活时首阶段仍只重新资格化既有A2/A3/A4 integrated medium。
Planar必须继续使用fixed `+Z` atmosphere/fog/cloud slab、
独立Planar LUT/asset/scheduler与same-UV cloud history；不得借用Globe ellipsoid/ECEF、Beer atlas、surface seam、world reprojection或A7–A10效果。
任何product修复前，必须先以同一resolved color/depth建立baseline、aerial-only、fog-only、cloud-only与combined actual-GPU final-composition
authority；历史白屏截图不构成调参、hidden multiplier或球面替代的根因证据。完整阶段与零资源/API/upstream增量边界见
[ADR-0052](Decisions/ADR-0052-planar-integrated-medium-restoration.md)。

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

### 平面地形查询、拾取与独立采样

平面地形的读取接口必须区分数据来源。`SceneGISPlanarWorld.getTerrainHeight` 只读取 canonical
quadtree cache 中最深的 resident `DIRECT`/`UPSAMPLED` active mesh，并按实际 Float32 surface
triangles求高程；它不创建 tile、不更新 LRU，也不把 `FLAT` 当作已知 terrain。`world.pickTerrain`
只拾取最近成功 normal render发布的 actual terrain cover snapshot，使用双面 surface triangle
intersection并排除 skirt；nearest `FLAT` 可以遮挡更远 terrain，但其自身返回 `undefined`。

Terrain query snapshot只持有可复用 tile/content references，不拥有 mesh或 GPU资源。Provider
attach/replacement/detach、hidden/zero-buffer/no-cover、content revision mismatch和 destroy必须使其
失效。Query不得推进 selection、request、promotion、LRU、readiness或 command allocation；window
terrain picking复用 SceneGIS four-frustum ray helper，不触发 depth render。

`SceneGISPlanarTerrainSampler.sampleAtLevel` 是独立 provider sampler：它按显式 level和 canonical
tile address聚合请求，消费 provider availability/TerrainData interpolation，并按输入顺序返回独立
height array。它不访问 World cache，不做 ancestor/upsample/flat fallback，不 raise provider
`errorEvent`，也不拥有 provider或 TerrainData。既有 `world.pick` 继续保持有界 Z=0
reference-plane语义；`scene.pickPosition` 继续表示包含对象和 skirt在内的 frontmost rendered depth。

Planar camera gesture anchors由controller私有地按 rendered depth → actual-cover terrain → bounded Z=0
reference plane解析。Pan与zoom的后续ray固定与anchor自身高度的水平面相交，rotate围绕完整3D pivot；drag
期间anchor不随LOD变化。Public `world.pick`仍是Z=0；controller的center rig则按actual-cover terrain →
resident camera-surface height/Z=0 fallback解析，并在extent clamp时保留target Z。

`SceneGISPlanarCameraController.navigationMode`是精确的`"surface" | "underground"`同步状态，默认
`"surface"`，由controller而非World/Scene/Viewer拥有。Viewer应用通过readonly
`viewer.planarCameraController`设置，不增加Viewer option或mode event。Mode切换必须取消held input，但不移动
Camera、不调用Home或查询terrain。Observed camera-surface relationship只在controller私有地按resident terrain
height→Z=0 fallback计算，不能反向推断mode。Surface profile保持上侧/负pitch，并以默认1米、finite positive的
`minimumTerrainClearance`在first update、普通input前后把Camera沿world +Z推到Camera-local resident terrain/Z=0
fallback之上；terrain降低或detach不向下吸附，正常纠正不调用Home。Underground完全跳过clearance并允许target上下
两侧，下侧使用镜像正pitch；纵向中键orbit保持press-time完整3D pivot/window anchor，可在above/down与below/up
之间双向穿越。该保证只覆盖controller update后的endpoint与显式orbit crossing，不承诺continuous/swept
collision、free-look、角色体积或terrain following。

Public `Camera`在live primary `SceneGISPlanarWorld`中通过`SGP-0004`使用固定`+X East/+Y North/+Z Up`
的HPR、Cartesian `setView`/`lookAt`/bounding-sphere framing与flight。Planar Rectangle以及
`flyOverLongitude*`同步拒绝；Perspective、PerspectiveOffCenter、Orthographic和OrthographicOffCenter都按自身
frustum bounds求view/flight endpoint，不借用ellipsoid ENU或Cartographic。Flight继续使用Scene的TweenCollection、
callback/cancel/complete/requestRender/preload协议，并以soft-private token暂停已注册planar controller的input/clearance；
结束或失败时exactly once恢复caller原有enabled状态。没有controller的低层planar Scene仍可flight。完整决定见
[ADR-0037](Decisions/ADR-0037-planar-camera-view-and-flight.md)。
完整决定见[ADR-0010](Decisions/ADR-0010-planar-terrain-query-picking-and-sampling.md)与
[ADR-0024](Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)、
[ADR-0025](Decisions/ADR-0025-planar-navigation-mode-and-surface-relationship.md)与
[ADR-0026](Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)。

### 平面 URL Heightmap Provider

`SceneGISPlanarUrlTemplateHeightmapTerrainProvider` 是 coordinate-agnostic 的 concrete provider。
应用必须传入 World 的 canonical `SceneGISPlanarTilingScheme`，并自行保证 URL 数据、world extent
与 CRS 一致；provider 不读取 CRS、不创建 scheme，也不重投影。XYZ/TMS address、payload encoding
和 sample placement 是三个独立契约：URL 行号转换不能改变 north-to-south Heightmap row order，
image/LERC decode 也不能隐式修正 pixel-center 数据。

每个 tile 必须提供覆盖四边的 boundary-inclusive sample grid。Image payload 使用显式 RGBA stride
structure，在constructor完整验证structure和buffer-length arithmetic，并以
`skipColorSpaceConversion: true`保持numeric channel bytes；该选项的实际效果受浏览器
`ImageBitmap`能力约束。Pixel extraction 后必须 exactly once 关闭可关闭 image。LERC payload必须是
单个、尺寸精确、全sample有效且finite的numeric band。首版provider声明`0..maximumLevel` full
pyramid；provider只拥有Resource/config/Event和global Credit reference，global Credit由Surface单独
显示而不复制进每个TerrainData。公开Sandcastle的terrain服务只用于best-effort人工演示；自动化
必须使用本地stub，不得依赖公网。完整决定见
[ADR-0011](Decisions/ADR-0011-planar-url-template-heightmap-terrain-provider.md)。

### 平面地形基础光照

`SceneGISPlanarWorld.enableLighting`默认`false`，保持flat、imagery和terrain既有unlit fast path；
`lambertDiffuseMultiplier`默认`0.9`且只接受finite non-negative number。World只消费Scene已有的
light automatic uniforms，不拥有或销毁`scene.light`。需要稳定方向的应用应显式使用
`DirectionalLight`，不能为任意planar CRS赋予默认SunLight新的投影语义。

Lit non-flat terrain使用Worker按真实surface topology和tile extent meter metric累计fixed planar world-axis
area-weighted smooth normals；Heightmap使用
regular-grid triangle顺序，Quantized mesh使用实际surface indices。Normals编码为每个final vertex 2 bytes的
transferable `Uint8x2` oct stream；skirt duplicate复制对应surface normal，skirt triangles不参与累计。Vertex
shader以`czm_octDecode`和`czm_viewRotation`恢复eye-space normal，不能再用包含tile非均匀scale的model normal
matrix解释oct stream。Flat/no-provider和active `FLAT` fallback继续从
eye-space position以`dFdx`/`dFdy`计算geometric normal；unlit variant不声明或读取normal attribute。两种lit
variant都使用稳定planar-outward lighting orientation：smooth保持Worker topology-up方向，derivative winding显式
归一到`czm_normal * +Z` hemisphere。Surface仍双面可见，但观察侧不得翻转Lambert法线。

Base color与所有shown imagery先bottom-to-top单pass合成，再统一应用Lambert diffuse、light color和固定`0.3`
环境亮度。Shader cache identity包含layer count、lighting flag与normal mode；切换lighting只更新既有DrawCommand的
shader/uniform map，multiplier只作为uniform读取。Single opaque command、normal-render mutation、depth
exact-command replay、terrain query与resource ownership均保持不变。A6只保证同一mesh共享vertex连续，并以
representative cross-tile/parent-child fixtures验证边界；不承诺任意独立provider tile的gradient bit-identical，
也不引入邻居normal registry或cross-fade。基础光照与smooth-normal successor决定分别见
[ADR-0012](Decisions/ADR-0012-planar-terrain-lighting-and-geometric-normals.md)和
[ADR-0029](Decisions/ADR-0029-planar-smooth-terrain-normals-and-lod-lighting.md)。

`SceneGISPlanarWorld.material`复用caller-owned Cesium `Material` assembled source、`_uniforms`与texture lifecycle，
由planar Surface组装absolute world-Z、relative +Z slope和north-clockwise downslope aspect。Material在imagery后、
lighting前source-over；只消费diffuse/alpha。Material identity只在成功normal render发布，sampler与shown imagery共享
fragment texture-unit预算，undefined保持既有fast path。完整输入、ownership、soft-private和升级边界见
[ADR-0032](Decisions/ADR-0032-planar-terrain-material-styling.md)。
Material variant必须在selection/publication前完成真实Context compile/link；失败不得替换旧normal/depth replay。
释放旧source时必须使resident cached tile的对应command metadata失效，避免重新selection时复用已释放program。

### 平面环境方向与Scene light authority

`SceneGISPlanarEnvironment`是caller-created、caller-registered Controller；每个live `SceneGISPlanarWorld`最多登记一个
reference，World不拥有或销毁Environment/light。Manual `sunDirection`与`moonDirection`固定使用`+X East/+Y North/+Z Up`
observer-to-body语义，内部稳定`DirectionalLight.direction`等于normalized `-sunDirection`；Moon在E1只保存状态。

Environment在ControllerHost first update通过live world、registry、Scene/world identity和`SCENE3D`验证后取得scene-wide
`scene.light` authority，并为首次authority acquisition请求一帧。Active update纠正并reassert同一light但不持续request
render；active property mutation与重新enable同样请求一帧。
Disable、disconnect与World sever按reference identity conditional restore，外部override不得被stale light覆盖。Environment不自动
设置`world.enableLighting`，authority也会影响Models/3D Tiles等其他Scene consumer。完整时序、所有权与E2升级边界见
[ADR-0033](Decisions/ADR-0033-planar-environment-manual-celestial-light.md)。

可选`directionMode="astronomical"`要求应用显式提供planar project origin对应的WGS84
`originLongitude`/`originLatitude`（radians），并只消费ControllerHost传入的simulation `JulianDate`。Environment固定使用
`Simon1994PlanetaryPositions`与同步`computeTemeToPseudoFixedMatrix`，在height=0 observer处把Earth-centered body position
转换为topocentric local ENU，再直接映射到planar axes；整张平面共享该方向，不从CRS、camera或planar XY推断。
Sun/Moon候选全部成功才原子发布readonly effective directions与同一stable light；direction publication本身不产生第二盏灯或
visible body，E3才允许应用通过`showSun`/`showMoon`显式启用SceneGIS procedural bodies。
该UT1≈UTC pseudo-fixed路径只提供确定的visual-grade近似，完整时间、视差、publication与升级边界见
[ADR-0034](Decisions/ADR-0034-planar-environment-astronomical-directions.md)。

### 平面地形 Worker 管线

A4依据同一257×257本地LERC fixture的bounded profiling，把LERC decode与Heightmap regular-grid/skirt
position generation迁移到一个`SceneGISPlanarTerrainWorker` entry中的两个独立task。Decode task属于provider
payload边界，mesh task属于generic Heightmap runtime边界；不得合并为携带private prepared mesh的provider结果。

Compressed LERC input、decoded sample output、TerrainData raw buffer的独立clone与mesh position output使用
transferable。TerrainData-owned原buffer、Request、provider、Credit、World/tile、Context和GPU resource不得转移。
主线程继续构造/验证TerrainData、preflight Worker result、复用regular-grid indices并在normal render上传GPU。

Mesh task只按既有blocking/direct/refresh优先级在normal render启动，每帧最多两个；Promise completion只发布
当前attempt/generation的CPU result。Pending task参与`tilesLoaded=false`，GPU promotion仍最多两个，candidate失败
保留last current。Replacement、eviction、detach和destroy使task token stale；Cesium 1.144 TaskProcessor没有
per-task abort，已开始task只能完成后丢弃，不能以终止共享Worker伪装取消。

Worker entry由现有`Source/Workers/**`glob自动进入development、release、IIFE inline与npm `Build/Workers`，并
被普通public barrel排除。A4不修改build/package upstream file；private task/scheduler不构成public API。完整决定见
[ADR-0027](Decisions/ADR-0027-planar-terrain-worker-tasks-and-delivery.md)。

### 平面 Quantized-mesh Terrain

`SceneGISPlanarQuantizedMeshTerrainData` 与 `SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider` 是
Heightmap的并列公共实现。Provider只接受caller-supplied canonical `SceneGISPlanarTilingScheme`、XYZ/TMS URL、
global meter range、maximum level和显式Level-0 geometric error；不读取`layer.json`、不猜测CRS、projection或
extension，也不重投影。Binary header中的ECEF center/bounds/horizon只校验并跳过；tile-local`u/v/height`、
CCW triangles与edge lists才进入planar data contract。

Quantized data接管absolute `0..32767` vertices和surface/edge index TypedArrays。Public height range由实际decoded
surface vertices得到，private quantization interval只用于decode/interpolation/Worker。Provider通过ADR-0027的同一
Worker entry执行`decodeQuantizedMesh`；runtime以`createQuantizedMeshMesh`生成tile-local Float32 surface/skirt与
per-tile indices，并以`upsampleQuantizedMesh`裁剪父级真实triangles生成direct-child Quantized fallback。不得通过
固定规则Heightmap重采样替代该triangle路径。

Heightmap继续使用ref-counted shared regular-grid index；Quantized content独占tile index buffer。两种data共享现有
四子门禁、`DIRECT > UPSAMPLED > FLAT`、normal-frame task/promotion预算、imagery/single command、lighting、
query/pick/depth replay和exactly-once lifecycle。Quantized resident point query使用Worker生成且具有linear memory
bound的private cell index；skirt继续排除在semantic query/pick外。A5只请求base format，oct normals、water rendering、
sparse metadata和service discovery不进入本阶段公共API。完整决定见
[ADR-0028](Decisions/ADR-0028-planar-quantized-mesh-terrain.md)。

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

每个shown layer固定携带brightness、contrast、hue、saturation、gamma与color-to-alpha完整uniform shape；
filter mutation只在下一次normal render发布到per-tile slot，depth/pick replay继续读取最后发布快照。
默认值由shader精确branch跳过，filter不改变shader key、request、texture、binding、mesh、VA、command或
ShaderProgram identity。raw sample处理顺序、颜色空间与公共契约见[ADR-0031](Decisions/ADR-0031-planar-imagery-color-filters.md)。

`scenegis-planar-imagery` 是 engine-level Sandcastle 人工案例，只通过显式 `CesiumWidget({ world })`
和 controller registration 组装能力。Viewer 与 widgets 自动集成属于 P6，不得从该示例反向形成
隐式 engine contract。通用 UI provider selection 不属于 SceneGIS：自定义平面 CRS、extent、
canonical tiling scheme 与服务 coverage 必须由应用显式匹配，具体选择 UI 由应用实现。

### 平面 Viewer 集成

`Viewer` 提供 strict live World 高级入口和同步声明式入口：

```js
new Viewer("cesiumContainer", { world });
new Viewer("cesiumContainer", {
  planarWorld: {
    extent: { minimumX, minimumY, maximumX, maximumY },
    crs,
    maximumLevel,
  },
});
```

`planarWorld`只接受raw square extent、opaque CRS与现有World constructor字段；SceneGIS-owned helper同步组装
Extent→CoordinateSystem→World，不推断CRS、不创建provider且不保留config引用。两种入口均通过readonly
`viewer.planarWorld`发布与`viewer.scene.world`相同的resolved World。generic custom world、`world: false`和手工
controller ownership继续使用低层`CesiumWidget`。

`world`、`planarWorld`与任何defined `globe`严格互斥；planar Viewer固定`SCENE3D`/`scene3DOnly`，并在DOM、
WebGL、controller或provider mutation前拒绝invalid raw config、base layer、terrain、map projection和不兼容widget
选项。没有planar入口时，默认Globe与`globe: false`行为不得改变。

planar Viewer 关闭 legacy `screenSpaceCameraController` 的 inputs，但不替换该属性；它通过
`ControllerHost` 注册唯一 `SceneGISPlanarCameraController`，并在 CesiumWidget/Scene/world
销毁前成对移除。传入live world或声明式创建resolved world均把独占生命周期所有权交给Scene；同一live world
instance不得交给第二个Viewer/CesiumWidget，且P6不增加跨Scene owner registry。依赖canonical tiling scheme的provider
必须在Viewer返回后通过`viewer.planarWorld`显式创建与安装。

Viewer 使用 SceneGIS-owned planar Home command 调用 controller `viewHome(scene)`。InfoBox保留
title/description；camera button对当前可track的FIXED Entity执行track/untrack，对不可track但bounds为`DONE`的Entity执行
`viewer.zoomTo(selectedEntity)`。`Viewer`与低层`CesiumWidget`的`zoomTo`/`flyTo`支持`Entity`、纯`Entity[]`、
`EntityCollection`及`entities`为真实`EntityCollection`的DataSource interface；target Promise、loading、replacement、
cancel与destroy由operation identity隔离。

Planar `trackedEntity`只接受真实`Entity`、defined `ReferenceFrame.FIXED` position与`AUTODETECT/ENU`
`trackingReferenceFrame`；两种tracking frame都解释为translation-only固定`+X East/+Y North/+Z Up`。Lazy private tracker在
`DataSourceDisplay.update(time)`之后由`ControllerHost`消费同一native Clock time，使用初始`viewFrom`或bounds/current-Camera
fallback建立fixed offset，并以独立token暂停planar input controller。Orientation、INERTIAL、VELOCITY/body-frame、clamping与
CRS推断不属于contract。Direct Camera flight暂时优先；成功framing、Home、remove与destroy停止tracking。Planar
left-double-click恢复为track-or-zoom fallback；Globe-specific target仍不属于planar contract。
SelectionIndicator与left-click selection继续保留；public Camera fixed-axis语义见ADR-0037，tracking见ADR-0038。BaseLayerPicker、Geocoder、
SceneModePicker、ProjectionPicker、NavigationHelpButton 和 VRButton 默认关闭，显式启用时
fail-fast。Animation、Timeline、Fullscreen 以及不携带 Globe 语义的显示控件保持可用。完整选项矩阵、
ownership 和升级检查点见
[ADR-0006](Decisions/ADR-0006-planar-viewer-and-widget-integration.md)。

### 平面内容 DataSources 边界

SceneGIS 平面内容复用 Cesium `Entity`、Property、`EntityCollection` 与 `CustomDataSource` 数据模型，
但不复用会把 Cartesian3 解释为 ECEF 或进入 Ellipsoid/Cartographic ground path 的默认 visualizer。
自动 planar content 使用米制固定坐标轴：X east、Y north、Z up；opaque CRS 不参与运行时转换，
anchor X/Y 必须位于 World inclusive extent。

Entity/DataSource framing必须复用`DataSourceDisplay.getBoundingSphere(entity, false, scratch)`：任一`PENDING`等待且不发布
部分Camera状态，mixed `DONE`/`FAILED`只合并`DONE`，empty或全部`FAILED`返回`false`。接纳时snapshot array/collection；
plain object、mixed array及ImageryLayer/3D Tiles/point cloud/Voxel/Buffer目标同步或异步明确拒绝。最终bounds只交给
ADR-0037的`Camera.viewBoundingSphere`/`flyToBoundingSphere`，不得复制visualizer bounds或推断CRS。

首版 HeightReference profile 只接受 `NONE`、`CLAMP_TO_GROUND` 与 `RELATIVE_TO_GROUND`。逻辑地表
读取同步、无请求的 `world.getTerrainHeight`；无 resident terrain 时回退 Z=0，已有 resident ancestor
时不得用 flat fallback 覆盖。Resolver 不拥有 subscription、request、cache 或资源，也不改变
`world.tilesLoaded`。Orientation undefined 表示 translation-only identity rotation；defined Quaternion
直接映射到固定 planar axes，不调用 `eastNorthUpToFixedFrame`。

Automatic adapter 必须是 instance-owned allowlist，不能同时运行会消费相同 graphics 的默认 Globe
visualizer。Unsupported graphic/config 必须在其资源 mutation 前 fail-fast，不得 silent ignore 或
fallback 到 Globe path。完整决定见
[ADR-0013](Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)，使用边界见
[PlanarContentGuide](PlanarContentGuide.md)。

C2 的 private Anchor visualizer 只复用 caller-owned disabled `EntityCluster` pools；Point 永远是
`PointPrimitive`，Billboard/Label 只接收 resolver 产生的 absolute position 并固定 low-level
`HeightReference.NONE`。Private Model visualizer 使用 fixed planar translation/quaternion matrix，直接
管理 `Model.fromGltfAsync` generation 与 `scene.primitives` ownership，不调用 Entity ENU 或 Model
height-clamping path。Async completion 不得直接添加 primitive。完整 profile见 ADR-0014。

C3 的 private Polyline/Polygon visualizer 绕开默认 GeometryUpdater与geodesic/rhumb路径。Polyline只接受
planar straight segments；Polygon只接受simple outer ring与direct holes，并显式生成cap、side wall和outline。
C3曾只在supplied vertices读取resident terrain，C9又曾从actual-cover生成CPU drape geometry；两者均为历史实现。
当前ordinary `HeightReference.NONE`保留source geometry，批准的Polyline/Polygon surface-clamp分支统一使用C11
GPU depth/stencil backend，且不自行发起terrain request。完整当前矩阵见
[PlanarContentCompatibility](PlanarContentCompatibility.md)。

C4 只为 live `SceneGISPlanarWorld` 安装 per-instance `DataSourceDisplay.visualizersCallback`；默认 Globe、
`globe:false` 和其他 World 保持 Cesium 默认 callback。Planar gate 仅接受 `CustomDataSource`、disabled
`EntityCluster` 和批准的 Entity top-level Property allowlist，第一次合法 update 原子追加 C2/C3 children，
后续每帧先于 child normal update 和低层资源 mutation 复验动态 profile；同步 collection listener 可以更新
CPU tracking。Model/Polyline/Polygon 使用 per-DataSource primitive
container，pick 继续返回 original Entity，bounds 由现有 `DataSourceDisplay` 联合。唯一上游缝隙位于
`CesiumWidget.js`，由 `SGP-0001` 与 ADR-0016 追踪。

C5的批量边界保持C1-C4 ownership：Anchor继续使用Cesium pool，Model逐实例，Polyline/Polygon继续
per-Entity owner；“批量性能”是固定moderate profile资格，不自动引入第二套batch scene graph。先建立
C4 baseline与persistent resource hard gates，只有可重复热点才允许在现有private visualizer内消除静态CPU
重复计算；不得改变dynamic/terrain、pick、bounds或lifecycle语义。单机timing只用于同环境调查，Sandcastle
公网服务只作人工best-effort展示，本地E2E不得访问公网。完整决定见ADR-0017。

C6建立public `SceneGISPlanarPrimitive`、`SceneGISPlanarPolylineGeometry`与
`SceneGISPlanarPolygonGeometry`。Public Geometry接收米制world Cartesian3 snapshot，自动以完整XYZ local
origin重基并输出DOUBLE local geometry；Primitive wrapper内部只使用Cesium standard synchronous
`Primitive`，固定single GeometryInstance，保留Appearance、attributes、picking、bounds、model matrix和GPU
lifecycle。Public model matrix是围绕geometry origin的local transform，最终matrix为
`translation(origin) * modelMatrix`。只接受明确审计的SceneGIS geometry与Color Appearance pair，不宣布raw
Cesium Geometry自动具有planar语义。Geometry变化使用normal-render candidate/current，pick/depth只复用last
current；Context、replacement与destroy必须原子且exactly once。Polyline/Polygon Entity adapter复用同一public
wrapper，不保留experimental Buffer双路径；width改为finite nonnegative number，0隐藏。完整决定见ADR-0018。

C7将public Primitive扩展到`SceneGISPlanarBoxGeometry`、`SceneGISPlanarCylinderGeometry`与
`SceneGISPlanarEllipsoidGeometry`。三种volume使用closed、non-flat `PerInstanceColorAppearance`；Plane、
Ellipse与Rectangle不新增public mesh类型，而是按固定平面坐标降级到C6 Polygon/Polyline。Entity adapter新增
Solid与Area两个private visualizer，并在既有Anchor/Model/Polyline/Polygon之后追加；Box/Cylinder/Ellipsoid的
position表示中心，ground reference先解析anchor再加未旋转下部support。C7曾对Ellipse/Rectangle generated
vertices做vertex-only terrain sampling，C9又曾生成actual-cover drape；两者均被C11 GPU surface clamp取代，ordinary `NONE`
仍允许合法anchor的geometry延伸extent外。所有orientation继续使用fixed planar quaternion，不进入ENU、
ellipsoid或默认GeometryUpdater路径。完整决定见ADR-0019与当前compatibility matrix。

C8新增public `SceneGISPlanarWallGeometry`与`SceneGISPlanarPolylineVolumeGeometry`。Wall以米制XY route和显式
top/bottom高度生成open non-flat surface；PolylineVolume以route-left/world-up固定frame扫掠居中的Cartesian2
shape，支持planar MITERED/BEVELED/ROUNDED corner。二者输出local DOUBLE positions、finite normals与bounds，
继续使用同步standard Primitive；Corridor确定降级到public Polygon/Polyline，Path确定降级到public Polyline，不为
等价mesh新增public类型。Corridor surface-clamp分支使用C11 GPU area backend；Wall/PolylineVolume不隐式查询terrain。
Path只允许effective `ReferenceFrame.FIXED`、undefined/`"FIXED"` relativeTo与`PathMode.WHOLE`，通过private
fixed-frame sampler隔离Cesium Property采样；INERTIAL、entity-relative/VVLH与PORTIONS fail-fast。Automatic callback
完整顺序为gate、Anchor、Model、Polyline、Polygon、Solid、Area、Route、Path，保持zero-upstream。完整决定见
ADR-0020。

### 平面 Continuous Ground 与 Ground Primitive

C9的actual-cover CPU draper、Surface ground snapshot与World late-registration queue已由C11删除；ADR-0021保留为被
ADR-0023 supersede的历史决定，不再是运行时契约。Planar Surface commands进入existing `Pass.GLOBE` primary-surface
槽位，ground commands随后进入existing `Pass.TERRAIN_CLASSIFICATION`，不新增Scene pass或upstream seam。

Public `SceneGISPlanarGroundPrimitive`只接受existing non-extruded `SceneGISPlanarPolygonGeometry`或
`SceneGISPlanarPolylineGeometry`、live caller-owned World与compatible Color appearance。Surface clamp是implicit语义；
public `heightReference`/`extrudedHeightReference`已删除，ordinary NONE继续使用`SceneGISPlanarPrimitive`。面状
RELATIVE、mixed top/bottom与ground-relative extrusion在child低层mutation前fail-fast。

Area backend为stable planar shadow volume，使用z-fail stencil/depth后提交color/pick；Polyline backend为stable segment
volume与dedicated SceneGIS ground-line Shader。两者都只从caller-owned terrain provider的同步global
`minimumHeight`/`maximumHeight`建立height envelope；无provider使用围绕Z=0的非退化padding。Provider attach、replace、
detach只更新uniform/model transform/bounds，不替换footprint VA、index、DrawCommand或Shader，也不订阅tile、LOD或revision。

Ground wrapper继续保留single logical GeometryInstance、original id、CPU attributes、bounds、single Context、same-kind
candidate/current与exactly-once lifecycle。Pick/depth使用已建立current的命令路径；不读取actual terrain triangles、不发
terrain request、不改变SSE/cache/readiness，也不存在C9 fallback。Polyline clamp与non-extruded Polygon、Ellipse、Rectangle、
Corridor的批准CLAMP组合使用该backend。完整决定见ADR-0023。

### 平面内容兼容性与交付

`planar-content`的稳定交付面绑定Cesium `1.144` upstream baseline，并由
[PlanarContentCompatibility](PlanarContentCompatibility.md)维护24个engine SceneGIS入口、2个widget入口、
16类automatic Entity Graphics以及ordinary/Ground Primitive边界。该矩阵不把underscore soft-private JS barrel
artifact提升为public API；declarations和API HTML必须隐藏private runtime。

最终qualification使用local deterministic terrain验证gate加八个child、GPU surface-clamped ground、direct public
Primitive、warm/mutation/provider convergence与lifecycle。Dev/release E2E和package consumer禁止公网；公开
Sandcastle只作为best-effort人工展示。Timing只记录同机diagnostic median/P95，不是跨机器hard gate。Architecture
review不能代替项目负责人的真实浏览器/GPU人工验收。完整决定见ADR-0022。

## 验证架构

SceneGIS 使用四层验证：

1. Jasmine 单元、契约和资源生命周期 Specs。
2. WebGL、Shader 和渲染 matcher 测试。
3. `Test/**` 直接开发示例与人工视觉验收；必要时保留legacy Sandcastle兼容案例。
4. Playwright 关键交互和持久视觉回归。

开发示例截图只能作为基础冒烟，不能覆盖参数组合、错误输入、销毁过程和性能变化。

## 平面世界发布资格边界

Planar World 的 release qualification 必须把 observable contract 与测量证据分开：selected/submitted tile、rendered pixel、imagery fallback、depth replay、single-Context 和 exactly-once ownership 是 hard gate；单机 CPU/GPU timing 仅用于同环境趋势与调查，不能作为跨机器 flaky assertion。warm-frame 验证应同时检查持久资源计数、resident cache bound、request/ref/texture 收敛和 destroy balance。

发布审计以 `.scenegis/upstream-base.json` 的 tree 判定 upstream-owned path，并要求每个 upstream diff 都由 SGP 登记、paired marker 配对、引用路径存在。package qualification 必须覆盖 workspace 与 installed tarball 的 root/engine/widgets public exports、types 和 API docs，同时证明 private runtime 不进入 public surface。所有临时 package/profile/generated 产物必须留在 delivery diff 之外。

同一个 upstream-owned path 可以承载目的和移除条件彼此独立的多个 SGP，但这些 registration 必须全部使用
`paired` marker；`manifest-only` registration 始终排他。审计器按文件一次解析全部已登记 marker ID：active必须至少形成
一个完整pair，proposed可以尚无pair但已存在的pair必须完整，retired不得保留marker；changed lines必须位于active与已落地
proposed合法ranges的并集内。该规则允许`Scene.js`的`SGP-0001` world lifecycle seam与`SGP-0003` environment render seam
独立升级，不允许未登记marker或未标记hunk。

## 官方版本升级

官方升级必须在 `upgrade/cesium-*` 分支完成：

1. 获取并核验新的官方 release tag。
2. 将 tag 合入升级分支，不混入新功能开发。
3. 逐项检查 active SGP：继续、调整或退役。
4. 复核所有 ADR 中记录的构建、运行时和升级检查点。
5. 运行构建、类型、Specs、关键 `Test/**` 开发示例、必要的legacy Sandcastle、E2E 和性能验证。
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

- SceneGIS `czm_*` builtin 的接入与生成方式；普通 SceneGIS GLSL source/delivery 已由 ADR-0030 决定。
- 除 ADR-0027 唯一 terrain entry 外，其他 SceneGIS Worker 的入口、协议与发布行为。
- 是否从根 JS barrel 严格排除 `_` 私有模块。
- 持久视觉基线和性能基线的 CI 执行环境。

处理这些问题时必须以届时的 Cesium 源码为准；本文档不把当前推测升级为约束。

### 平面可见天体

平面Environment的可见Sun/Moon必须消费同一Environment发布的effective ENU directions。GPU renderer由
`SceneGISPlanarWorld`拥有，通过`SGP-0003`的单一environment hook在ordinary geometry前执行；不得复用native Earth
body、进入普通command list或引入asset/network。Public World/Surface保持single Context；private renderer遇到异常Context
mismatch时只做旧资源cleanup与新candidate recreate，失败保持empty/retriable，不构成public multi-Context支持。投影、
地平线、地下、native冲突与资源预算由ADR-0035定义。

### 平面大气与固定轴 SkyBox

Planar atmosphere不得复用ellipsoid `SkyAtmosphere`；它由World-owned private fullscreen renderer在`SGP-0003`hook内直接执行，
只消费planar camera/frustum、resident terrain、E2 effective Sun和Environment visual uniforms。资源预算固定为一个VA、一个
ShaderProgram和一个stable command，不创建texture、FBO或postprocess。Planar `SceneGISPlanarSkyBox`由caller创建/销毁，
固定`+X East/+Y North/+Z Up`，不得写入Scene-owned `skyBox`/`skyAtmosphere` slots。

Environment合成顺序固定为planar SkyBox→atmosphere→Sun/Moon→ordinary geometry。统一native conflict与resident-terrain
underground判定必须先于任何E4 allocation/execute；地下时全部planar visual environment隐藏。ADR-0039/I4已取代visible native
generic background与planar atmosphere共存的public配置：live non-Globe Scene的sky、atmosphere和body只允许
`SceneGISPlanarEnvironment`。Atmosphere command中的opaque background mask仅是private defensive compatibility seam，不是应用
配置入口。完整public、soft-private、ownership与升级边界见
[ADR-0036](Decisions/ADR-0036-planar-atmosphere-skybox.md)与
[ADR-0039](Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md)。

### 平面 Scene API 资格与安全

live non-Globe primary World只资格确认SCENE3D Cartesian screen transform、pick/depth、普通ray和World terrain query。Ellipsoid
height/clamp与Camera Rectangle/Ellipsoid方法必须fail-fast；`Camera.positionCartographic`和`Scene.ellipsoid`仅为Cesium internal
ellipsoid substrate，不代表planar CRS。non-Globe构造固定3D-only、关闭默认Fog并拒绝显式native Earth sky/Fog/Shadow；
`Scene.updateFrameState`在发布frame state前再次验证caller late mutation。完整矩阵与SGP边界见
[ADR-0039](Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md)。
