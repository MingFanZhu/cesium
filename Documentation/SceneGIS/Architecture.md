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
packages/engine/Source/Shaders/Builtin/Functions/SceneGISSplitVisible.glsl
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
Tools/GaussianSplatTiler/**
packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js
packages/engine/Source/Workers/SceneGISVectorTileWorker.js
packages/engine/Source/Workers/SceneGISS3mWorker.js
packages/engine/Source/Workers/SceneGISGaussianSortWorker.js
packages/engine/Source/Workers/SceneGISGaussianMappingWorker.js
packages/engine/Source/Workers/SceneGISVoxelizeWorker.js
```

所有权按照“上游基线中是否已经存在该路径”判断，而不是按照当前分支中文件所在目录判断。修改 upstream-owned file 必须登记 SGP；新增 SceneGIS-owned file 不需要 SGP。

`packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js`（ADR-0027）与
`packages/engine/Source/Workers/SceneGISVectorTileWorker.js`（ADR-0067）是批准的精确 owned Worker entries。
它们不在上游基线中，只接入 Cesium 现有 Worker 构建链，算法继续位于 `Source/SceneGIS/**`。
这些例外不授权其他 `Source/Workers` 文件；新增 entry 仍需重新审计、ADR 与所有权说明。

ADR-0174 批准精确 owned entry `SceneGISS3mWorker.js`：仅执行 S3M 解码与内存 GLB
准备，主体位于 SceneGIS Core；复用现有 Worker 构建与原生 Model 渲染，不引入全局 loader。

`packages/engine/Source/Shaders/SceneGIS/**/*.glsl` 是 ADR-0030 批准的 SceneGIS shader source root。
它复用 Cesium 现有 `Source/Shaders/**` GLSL-to-JS 构建链；相邻生成 `.js` 是忽略的 build artifact，
不得手工编辑或提交。SceneGIS runtime 通过显式相对 import 使用生成模块，不依赖 side-effect 注册。

`packages/engine/Source/Assets/SceneGIS/**` 是 ADR-0041 批准的 SceneGIS runtime asset root。只允许保存经过
license/provenance、format、尺寸和资源预算审计的版本化静态资源及其机器可读 manifest；许可证文本必须随衍生资源进入
build/npm 产物。Runtime 使用 `buildModuleUrl("Assets/SceneGIS/...")` 定位，不依赖公网 URL、本机路径或临时 clone。

## Agent 协作文档边界

### 分段 Gaussian 数据工具

ADR-0188 批准 `Tools/GaussianSplatTiler/**` 为独立 Node.js CPU 切片工具根目录。
浏览器可用的分段协议和数学实现位于 `Source/SceneGIS/Core`，工具通过显式相对路径共用；
引擎不得反向依赖 Tools 或 Node.js。工具不加入 Cesium workspace、不进入引擎 npm 包，
从完整仓库运行，独立 CLI、测试与文档自行维护。升级时核对协议、Worker 和包内源码依赖。
固定网格加载/切片、训练蒸馏和 SDK 均不属于此次移植范围。

ADR-0188 批准两个精确 Worker entries：`SceneGISGaussianSortWorker.js` 与
`SceneGISGaussianMappingWorker.js`，仅包装 Core private handlers，复用原生 TaskProcessor
和构建 glob。`SceneGISGaussianSegmentedPrimitive` 接入既有 Gaussian pass，不新增 Scene pass。
SGP-0067 仅扩展 unsigned integer array sampler 分派。移除图元时同步释放依赖 Context 的
VAO/shader，随后异步收敛 Worker/page ownership；Scene 销毁不要求继续 render 或等待 Worker。
整数数组纹理归图元自有。

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

通用 Shader builtin 策略、额外 SceneGIS Worker 入口以及严格私有 barrel 当前仍是延迟决策，不在没有真实功能和源码证据时预设答案。SceneGIS GLSL source/delivery 以 ADR-0030 为准；已批准的 terrain 与 vector Worker 入口分别以 ADR-0027、ADR-0067 为准。

ADR-0193 为原生左右/上下分屏批准唯一 owned builtin `SceneGISSplitVisible.glsl`，
由既有 Builtin/Functions 扫描生成 `czm_SceneGISSplitVisible`。SGP-0071 发布 Y 像素位置并
接入全部已有 splitDirection 消费者；不手写 CzmBuiltins.js、不增加动态注册或新资源。
`scene.splitPosition` 在上下模式从屏幕顶部 0 到底部 1；影像仅屏蔽 alpha，保留地表深度。

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

Planar 高级环境以 m 为长度单位，支持 World 的多种及自定义 CRS；高度直接使用世界 `position.z`，零高度固定为 `z = 0`，
不增加环境 `baseHeight` 偏移。云底高度直接对应世界 Z，地形保留其真实高度。详见
[ADR-0040](Decisions/ADR-0040-dual-world-advanced-environment-rendering.md) 的米制平面高度说明。

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

A16-G通过[ADR-0054](Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)和`SGP-0010`扩展上述初始consumer边界：
PBR Models/3D Tiles在材质光照阶段共享physical primary irradiance、diffuse sky与Beer cloud shadow，禁止对最终颜色统一压暗。
模型只借用current-frame资源，native材质和specular IBL保持原所有权。`surfaceRadianceScale`统一校准Globe与默认physical model光照。
Geometry shadow完全由Cesium既有`Viewer.shadows`、`scene.shadowMap.enabled`和各receiver的`ShadowMode`控制。
移除A11的`showMoonShadows`及自动开启/恢复逻辑，不增加SceneGIS阴影开关；primary light只提供日/月方向。

A6-G只演进ADR-0046既有的two-target Cloud history：Globe resolve从现有mean/front/scene distance重建world position并投影到previous
successful camera，cloud validity与A5 shadow length先semantic decode/filter再repack；invalid、exact-stationary与camera-cut frame均发布完整
spatial-only结果。Public `cloudQuality`是cloud/Beer/resolve唯一caller-owned动态performance tier；renderer不得自动测FPS、按camera motion降档、增加
settling render或建立第二套Beer history。A6-G不增加GPU resource/pass/command category，完整continuity、budget与Planar冻结边界见
[ADR-0048](Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)。

后续 Globe temporal 行为以 ADR-0048 的已接受 amendment 为准：A8/A12 的 stationary Globe 允许现有 STBN/history；A13 允许仅 medium
使用 2x2 phased cloud tracing 与 full-resolution depth-aware reconstruction。First/invalid/cut frame 必须立即发布完整 current spatial image，
不得等待 phase 收敛、提高 history 权重、抖动 native scene camera 或引入自动 FPS 降档。High、low、Planar 与 world-space Beer 保持原路径；
精确 sample-coordinate、distance-domain、resource 和视觉 gate 由 ADR-0048 的 A13 amendment 约束。
ADR-0048 的 A15 amendment 允许 medium 对透明体积估计连续累积，并以本帧合格邻域提供漏采像素的 cloud anchor；
opaque depth 与 cloud support 检查必须独立保留，没有本帧局部支撑时立即移除历史，不得发布历史 distance。

A7-G在同一`SGP-0008` pre-tonemap linear-HDR slot末端执行Globe bright threshold、固定separable blur与additive bloom/ghost/halo composite。
Lens artifact只消费final HDR Sun signal与resolved exact-clear depth完成terrain/cloud visibility；不得新增Sun、Cloud MRT或history authority。
SceneGIS bloom启用时Cesium general bloom必须caller-owned地保持disabled，existing `scene.sunBloom=false` contract继续排除`SunPostProcess`。
A7固定使用two half-resolution加one full-resolution color-only RGBA16F targets，不使用public `PostProcessStage`、raw WebGL、screen blend、asset、
tone mapping或Planar执行；完整public、resource与lifecycle contract见
[ADR-0049](Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)。

ADR-0049 的 2026-10-19 修订统一两世界的六方向有限模糊：保留归一化核、二阶矩与六次 blur 预算，
避免太阳高亮暴露轴向方形支撑。`bloomIntensity` 默认 0.005，仍为显式全场景艺术参数；不添加太阳专用倍率。

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
把二者混用。A16修订后，Controller只snapshot/restore `scene.light`与defined native `Moon.textureUrl`，这两个owned slot的active external
mutation fail closed；native shadow state与Globe ShadowMode完全由caller控制。更高分辨率月面只替换pinned NASA CGI Moon Kit color asset；Moon object/show/phase/orientation/ellipsoid ownership不变，不支持
displacement/normal/eclipses。Existing `SGP-0009`只扩展current frame-local surface uniforms，不增加upstream path或new SGP。完整API、resource、
lifecycle与Planar冻结边界见[ADR-0053](Decisions/ADR-0053-globe-moonlight-shadow-surface.md)。

P1在A17-G验收后恢复Planar路线，首阶段仍只重新资格化既有A2/A3/A4 integrated medium。
Planar必须继续使用fixed `+Z` atmosphere/fog/cloud slab、
独立Planar LUT/asset/scheduler；ADR-0052 的 September 11 amendment 已允许相机/风重投影、历史颜色裁剪、直接 Z 高度、
像素 footprint filtering 和移除距离密度淡出。不得借用 Globe ellipsoid/ECEF；Beer atlas、surface lighting 与 A7–A10 效果需后续阶段独立设计。
任何product修复前，必须先以同一resolved color/depth建立baseline、aerial-only、fog-only、cloud-only与combined actual-GPU final-composition
authority；历史白屏截图不构成调参、hidden multiplier或球面替代的根因证据。完整阶段与零资源/API/upstream增量边界见
[ADR-0052](Decisions/ADR-0052-planar-integrated-medium-restoration.md)。

P2依据[ADR-0055](Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)扩展平面光照：
独立frame-local Planar record借用物理LUT与Beer atlas，模型复用`SGP-0010`源光照接口，地表在imagery/material合成后应用Sun/sky。
Beer producer与receiver均采用固定Z云底/云顶，阴影矩阵使用CPU水平原点差，Z保持绝对高度；不得转换为ECEF。
云影仅衰减direct光，保留原生PBR/emissive、调用方SH/lightColor与Cesium几何阴影控制。
地表预检必须计入3个环境sampler。Planar rays与夜间天体后续独立适配。
P3按ADR-0049的Planar amendment复用同一scene-linear HDR bloom/lens链路；保持原参数、alpha、预算与资源所有权，
Planar lens使用显式Sun方向并要求Sun.z大于0，继续遵守视口、有效深度与最终亮度门控。
P4按ADR-0050的Planar amendment以fixed +Z复用同一readable-night source与-6°/-12°过渡，
只进入地表/模型sky、cloud incident sky和fog ambient；保留直接Z高度、原有radiometry与全部directional/shadow控制，
不增加API、uniform、pass、resource或history。夜间天体与directional moonlight仍需后续适配。
P5按ADR-0042/0044修订计算完整Planar atmosphere slab路径，解析积分不得再按cloud/fog march预算裁剪。
Planar aerial与Globe一样使用`backgroundRadianceScale * aerialRadianceScale`，统一远景和天空的scene-linear source单位；
surface/cloud material与fog标定、光学系数和LUT不变，资源与lookup数量不增加。
ADR-0044 / ADR-0045 的 2026-10-20 修订进一步统一两世界高度雾的 source domain：
Background、有限深度 Aerial、cloud fog 与 shadow delta 均使用 `backgroundRadianceScale`；
directional source 接收 scene RGB，不再次除以 spectral solar max。保留各自几何、密度积分、
最大不透明度和固定计算预算，不通过俯角阈值或增大密度补偿色差。

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

`World.maximumTiltedTileDistance` 按 [ADR-0066](Decisions/ADR-0066-planar-tilted-tile-distance.md)
可选约束低角度透视的细节距离；surface 与 MVT 在 desired selection 前共用判定。
默认 Infinity；俯视、俯视拉远及正交保持原 SSE。超过距离保留粗 tile，仍遵守 terrain
祖先/四兄弟依赖和各自 ready cover；不得把它变成 Camera far、相机俯角限制或全场景距离剔除。

### 平面地形查询、拾取与独立采样

按 [ADR-0185](Decisions/ADR-0185-planar-terrain-depth-test.md)，平面 World 的
`depthTestAgainstTerrain` 默认 true；false 在地形分类后复用原生深度清除，
保持普通对象之间的遮挡。SGP-0001 仅接入显式可选的 World 深度策略，
Globe 的 DepthPlane 仍限定于 Globe。地形查询与分类保留真实地表；延迟地形深度和
多视锥透明恢复共享既有资源，不能通过关闭地表 depthTest/depthMask 代替此开关。

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

Planar controller 默认使用 `inertiaSpin=0.9`、`inertiaTranslate=0.9`、`inertiaZoom=0.8`，
finite `[0,1)` 且 0 关闭对应惯性。短手势释放后按真实时间指数衰减，继续使用该手势的锚点与约束；
惯性状态由 controller 独占，不增加 timer 或重新拾取地形。新输入、外部 Camera pose 修改及
Home/disable/mode change/flight/tracking/disconnect 取消余速，恢复后不得重放，见
[ADR-0079](Decisions/ADR-0079-planar-camera-inertia.md)。

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
同一契约同时覆盖原地 `lookAtWorldPosition` 的固定 +Z up、四类视锥的 public `getPickRay`、
正交 width / zoom 与 `changed` 的平面尺度。平移和旋转不隐式重算正交宽度，公共 roll 读取遵循 Cesium 的非负一周范围。
详见 ADR-0037 的 2026-09-18 补充以及 PlanarWorldGuide 的 Camera 兼容矩阵。
完整决定见[ADR-0010](Decisions/ADR-0010-planar-terrain-query-picking-and-sampling.md)与
[ADR-0024](Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)、
[ADR-0025](Decisions/ADR-0025-planar-navigation-mode-and-surface-relationship.md)与
[ADR-0026](Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)。

### 平面 URL Heightmap Provider

服务元数据接入使用 [ADR-0080](Decisions/ADR-0080-planar-terrain-layer-metadata.md) 的
`SceneGISPlanarLayerTerrainProvider.fromUrl`，异步读取显式平面 profile、rootRange、available 与编码参数后
返回同步 ready provider。World 可显式复用其 tilingScheme；也可向工厂传入既有 World 的 canonical scheme。
私有坐标不转换，缺失的全局高度必须显式提供，不用根 tile 高度猜测后代范围。原 URL providers 继续保持下述低层职责。

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

### 球面地形裁剪

球面 Globe 保留原生 ClippingPolygonCollection 的球面、凹环与多区域语义。
按 [ADR-0191](Decisions/ADR-0191-globe-clipping-precision.md) / SGP-0070，距离场顶点在
CPU double 中先减区域原点再转 Float32；地形插值 RTC 位置，fragment 保留中心高低位后
计算球面坐标。不得用提高纹理分辨率、全局关闭 skirts 或扩大坑壁替代坐标精度修复。
几何、terrain provider 和 collection 资源所有权仍由原生管线持有。

### 平面地形裁剪

`SceneGISPlanarWorld.clippingPlanes` / `clippingPolygons` 复用 Cesium 原生集合和 polygon 类型，
保持增删、启停、交并、inverse、modelMatrix 与平面 edge style API。坐标为米制平面坐标；polygon
使用简单直线 XY 外环，不进入球面投影或 distance texture compute。集合为 World 独占。
Surface 私有 RGBA Float32 纹理与 CPU 快照在 normal render 校验后发布，pick/depth replay 不消费未发布修改。
裁剪只影响地表颜色、深度和可见 terrain ray query；源高程、provider、LOD 和原网格保持。
默认无裁剪资源，启用后增加一个 sampler，数值和数量变化不增加 shader variants；销毁释放缓存纹理。
不创建封底/侧壁，不承诺海量 polygon 性能。完整边界与验证见
[ADR-0081](Decisions/ADR-0081-planar-terrain-clipping.md)。

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

通用外部影像由 SceneGIS 自有 URL template、WMS、WMTS、TMS 与 SingleTile provider 接入，
协议参数与 Cesium 同名接口保持一致。TMS metadata 必须验证 canonical 网格，WMS 明确 CRS 与轴序；
不得静默重投影或猜测地球坐标系。像素宽高分别为正整数，无须相等；米制网格仍严格正方形。
WMTS dimensions 失效使用多订阅事件标脏，只在下一 normal frame 取消旧请求、替换纹理并隔离迟到结果。
见 [ADR-0082](Decisions/ADR-0082-planar-imagery-protocols.md)。

`SceneGISPlanarWorld` 的 imagery provider 必须与 world 共享同一个 canonical
`SceneGISPlanarTilingScheme` object；等值但非同一 identity 的 scheme 不属于受支持配置。
`SceneGISPlanarImageryLayerCollection` 拥有加入其中的 layer，并负责其 exactly-once destroy，
但 layer、collection 和 world 都不拥有 provider。

影像 readiness 描述当前 normal-render 实际 render tile set 上所有 shown layer 的有效影像依赖；
因此 `world.tilesLoaded` 是 current-view 动态值，而不是 provider 全金字塔完成标志。每个 binding
请求 desired address，并在需要时 bootstrap 对应 minimumLevel ancestor；它可以复用合法区间内最近的 READY ancestor，
但 P5 不主动请求 intermediate ancestor。request、decoded image、texture、generation 和 cache
reference 必须分别有明确的取消、迟到隔离与 exactly-once 释放语义。

按 [ADR-0162](Decisions/ADR-0162-planar-sparse-imagery.md)，SDK 声明连续 minimumLevel..maximumLevel
及可选世界米制 coverageExtent。实际地表层级低于最低层或覆盖外不创建影像依赖，只允许子层
采样父层，不能反向拼接或强制细化。请求完整 canonical tile；coverage mask 只影响该层贡献，
不改变全球网格、XYZ、WMS BBOX、geometry 或 sampler/draw 数。明确 image HTTP 404 进入
UNAVAILABLE；其他失败维持 error/retry 通道。必要 fallback pending 仍阻塞 readiness，
缺图记录沿用已有缓存和 generation 生命周期，不建立全局负缓存。TMS metadata 可从真实
非零 canonical level 开始，Origin 仍为全球原点；SingleTile 保持全世界 Level 0。

图层按 collection 的 bottom-to-top 顺序在每个 ideal tile 的单个 opaque command 中合成。
shown layer 数超过 `ContextLimits.maximumTextureImageUnits` 时必须在 request、selection 或 GPU
mutation 前原子失败；P5 不使用 multipass，也不改变 P3 geometry/SSE/selection。

每个shown layer固定携带brightness、contrast、hue、saturation、gamma与color-to-alpha完整uniform shape；
filter mutation只在下一次normal render发布到per-tile slot，depth/pick replay继续读取最后发布快照。
非 gamma 滤镜默认值由 shader 精确 branch 跳过，filter 不改变 shader key、request、texture、binding、mesh、VA、command 或
ShaderProgram identity。raw sample处理顺序、颜色空间与公共契约见[ADR-0031](Decisions/ADR-0031-planar-imagery-color-filters.md)。

平面影像以原生 Globe 的计算顺序为准：raw color-to-alpha 后，先进行 gamma 分支处理，
再依次 brightness、contrast、hue、saturation、alpha 混合。整个 tile command 中任一 READY、
alpha 非零的参与层使用非默认 gamma 时，所有层均采用 `pow(rgb, 1/gamma)`；否则采用
`czm_gammaCorrect`。隐藏、未 READY 或无覆盖的层不启用该分支。该布尔状态随 slots 一起发布。
HDR/LDR 使用同一输入，保留 Globe 在 gamma=1 附近的分支跳变。`baseColor`、Material diffuse
和矢量叠加保留既有线性域，不对整个地表结果重复解码，不新增 pass、texture 或 shader variant。

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
plain object、mixed array及ImageryLayer/point cloud/Voxel/Buffer目标同步或异步明确拒绝。最终bounds只交给
ADR-0037的`Camera.viewBoundingSphere`/`flyToBoundingSphere`，不得复制visualizer bounds或推断CRS。

已使用当前 World Cartesian 坐标的原生 `Cesium3DTileset` 也可取景；执行时读取公开
`boundingSphere`，目标必须属于 Scene primitive collection tree。移除、销毁、替换和
Widget/Scene teardown 必须结算并释放监听/flight suspension；不重投影地理内容或 region。
完整 target contract 与 SGP-0005 见 ADR-0006 的 2026-10-18 amendment。

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

C2 的 private Anchor visualizer 复用 caller-owned `EntityCluster` pools；ADR-0183 开放可选聚类。Point 永远是
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
`globe:false` 和其他 World 保持 Cesium 默认 callback。Planar gate 接受 `CustomDataSource` 或按
[ADR-0172](Decisions/ADR-0172-planar-geojson-loading.md) 显式绑定当前 World 的 `GeoJsonDataSource`，并要求同 Scene 的
`EntityCluster` 和批准的 Entity 内建 Property allowlist；业务属性可复用 `Entity.addProperty` 或 `Entity.properties`。
第一次合法 update 原子追加 C2/C3 children，
后续每帧先于 child normal update 和低层资源 mutation 复验动态 profile；同步 collection listener 可以更新
CPU tracking。Model/Polyline/Polygon 使用 per-DataSource primitive
container，pick 继续返回 original Entity，bounds 由现有 `DataSourceDisplay` 联合。唯一上游缝隙位于
`CesiumWidget.js`，由 `SGP-0001` 与 ADR-0016 追踪。

GeoJSON 使用 native `load/process` 的 `planar: { world, projectCoordinates }` 配置，坐标转换在加载时执行。
首次调用固定实例的 globe/planar 坐标模式；后续省略配置继承绑定，拒绝更换 World 或转换函数。
World CRS 仍为 opaque metadata，不触发默认投影；调用方解释原坐标与 CRS。SGP-0062 只向原生
`GeoJsonDataSource.js` 注入加载 context、坐标 callback 和直线/显式贴地面语义；不复制解析器、
全局注册转换、修改默认 Globe visualizer 或增加逐帧重投影。数据源只供绑定 World 使用。

CZML 使用 native `load/process` 的 `planar: { world }` 显式绑定，坐标直接为 World 米制 XYZ。
首次调用固定坐标域；原生采样、插值、availability、clock、reference 和增量包语义保持。
SGP-0063 在 `CzmlDataSource.js` 加入加载策略，在 `DataSourceDisplay.js` 的正常 update 前校验
绑定 World（包括 Globe 错用和异步加载后绑定）；平面 gate 接纳同 World 的 CZML。
经纬度位置、非 FIXED 系和椭球 velocity orientation 拒绝，不自动投影或注册全局 updater。
完整边界见 [ADR-0173](Decisions/ADR-0173-planar-czml-loading.md)。

ADR-0183 / SGP-0066 为上述路径开放原生 `dataSource.clustering`：复用 KDBush、pools、类型开关、
clusterEvent 和 Entity 拾取。实例策略统一三种 anchor 的屏幕坐标，跳过椭球遮挡及 cartographic-height
历史复用；投影/视口、解析位置、显隐与屏幕尺寸改变才重新聚类，静态帧不重建索引。
聚类表示屏幕布局，不提供地形遮挡分析、跨 DataSource 合并或稳定 cluster ID；默认球面算法不变。

C5的批量边界保持C1-C4 ownership：Anchor继续使用Cesium pool，Model逐实例，Polyline/Polygon继续
per-Entity owner；“批量性能”是固定moderate profile资格，不自动引入第二套batch scene graph。先建立
C4 baseline与persistent resource hard gates，只有可重复热点才允许在现有private visualizer内消除静态CPU
重复计算；不得改变dynamic/terrain、pick、bounds或lifecycle语义。单机timing只用于同环境调查，Sandcastle
公网服务只作人工best-effort展示，本地E2E不得访问公网。完整决定见ADR-0017。

C6建立public `SceneGISPlanarPrimitive`、`SceneGISPlanarPolylineGeometry`与
`SceneGISPlanarPolygonGeometry`。Public Geometry接收米制world Cartesian3 snapshot，自动以完整XYZ local
origin重基并输出DOUBLE local geometry；Primitive wrapper内部只使用Cesium standard synchronous
`Primitive`，C6 单实例入口保留Appearance、attributes、picking、bounds、model matrix和GPU
lifecycle。Public model matrix是围绕geometry origin的local transform，最终matrix为
`translation(origin) * modelMatrix`。只接受明确审计的SceneGIS geometry与Color Appearance pair，不宣布raw
Cesium Geometry自动具有planar语义。Geometry变化使用normal-render candidate/current，pick/depth只复用last
current；Context、replacement与destroy必须原子且exactly once。Polyline/Polygon Entity adapter复用同一public
wrapper，不保留experimental Buffer双路径；width改为finite nonnegative number，0隐藏。完整决定见ADR-0018。

ADR-0178 扩宽普通非线图元的 Color-only 边界，支持原生 MaterialAppearance / Fabric。
按 vertexFormat 生成自有几何的 UV、法线和切线；原生实体使用原生 factory。
颜色路径保留原有属性与成本。每批共享材质，独立 show/id 保持，调用方拥有 Material。
内部外观以不透明基础混合状态接入原生动态透明分流，不修改借用 appearance。
贴地面以深度重建 XY UV 与表面 normal/TBN 接入 Fabric，沿用 z-fail 与保序分组；
材质批仅合并空间无冲突范围，不使用同色 opaque overlap 快路径。Stencil 不求值材质，
pick 保持足迹语义；禁止 Fabric discard，透明用 material.alpha。
Polygon/Area/Solid/Route Entity adapter 复用原生 MaterialProperty，按类型持有材质，
同类型变化仅更新 uniform；替换、移除和候选失败释放其自行创建的材质。
Polygon/Ellipse/Rectangle 支持 finite stRotation，显式 textureCoordinates 仍不接入；
线材质扩展见 ADR-0182；Path 的 MaterialProperty 与 Polygon outline API 仍保持原边界。

ADR-0182 允许普通及贴地 Polyline 使用原生 PolylineMaterialAppearance / Fabric，
PolylineGraphics 使用同一 MaterialProperty/owner 协议，冻结 clock 时仍逐次 update 求值。
普通线 s 按源 XYZ 累计长度归一化，贴地线按 XY；每实例独立，闭合线仅有起点 1→0 接缝。
保留原生像素宽度扩展及折角插值；贴地线从深度与端面重建 st，使用既有单 volume draw。
原生 Arrow/Dash 与 st/uniform Fabric 可用；Dash 仍按屏幕像素周期。
线无 stencil 清理，允许 discard，并按材质覆盖拾取；贴地面 no-discard/足迹拾取规则不变。
Primitive 借用 Material，Entity 拥有派生 Material；逐实例颜色仍用 PolylineColorAppearance。

ADR-0168 扩宽普通 wrapper 的单实例边界：`geometryInstances` 接收兼容 Appearance 的静态实例数组，
复用原生 GeometryPipeline / Primitive 的 DOUBLE transform、combine、high/low encoding 与 BatchTable。
每项保留唯一业务 id、attributes 与 origin-local modelMatrix；批次 modelMatrix 作用于世界坐标。
不再为每个业务对象建立独立 Primitive。线可选 `PolylineColorAppearance` 实现独立颜色；attributes schema
必须一致。拓扑与实例变换为构造快照，颜色/显隐通过 `getGeometryInstanceAttributes(id)` 更新；
批次与单实例 bounds 通过 `getBoundingSphere(result, id)` 获取。初始化完成释放原生中间 GeometryInstance
数组，保留后续 appearance replacement 所需的 CPU descriptor。应用按空间与 Appearance 分批；
Entity visualizer 仍使用逐对象动态更新粒度；Ground 批次见下文。

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

ADR-0168 为 Ground wrapper 增加同 kind 的静态 `geometryInstances`，共享一个原生 Primitive/VA/BatchTable。
保留每项 original id、attributes、bounds，single Context、same-kind candidate/current 与 exactly-once lifecycle。
线用 DOUBLE 点差生成 origin-independent 方向与逐顶点 width；批次共用 XY origin 与 normalized Z envelope。
贴地面以闭体 stencil 保持精确轮廓，color/pick 读取地表深度并裁剪实例 XY extent。
范围内部不相交的异色/透明面共用一对 stencil/fill 命令及独立 pick ID；相交面保持输入顺序，
同色不透明的 render 仍可在 classification mask 容量内合并，不按颜色重排透明面。
B3 贴地线按原生 GroundPolylinePrimitive 分工，读取当前
`czm_globeDepthTexture`，按 segment width/start/end plane 做片元裁剪；每 VA 共用一个颜色/拾取命令，
无需 stencil 计数与逐实例 offsets。两种 ground geometry 都要求 depth texture，不提供静默降级。
拓扑变化重建批次，属性变化复用几何；超过 65535 顶点的贴地面要求 uint element indices，线复用原生拆分。
Pick/depth使用已建立current的命令路径；不读取actual terrain triangles、不发
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

### 独立矢量瓦片

状态按 [ADR-0076](Decisions/ADR-0076-vector-style-state.md) 由 Layer 持有，禁止将其写入可共享的 compiled Style。
Feature/global state 只驱动 paint，按 source/sourceLayer/id 与表达式依赖失效；不重新请求 MVT，不由状态 API 操作 GPU。
几何结果继续通过 Worker 和正常帧预算发布；标注复用不变的 shaping 与 buffers。

绘制规则按 [ADR-0163](Decisions/ADR-0163-vector-dynamic-style-rules.md) 在 Layer 上同步校验、发布独立不可变 Style，
禁止修改调用方或共享 compiled Style。主线程与各 Worker 使用同一规则版本，旧异步结果不得覆盖新规则；
正常帧只替换受影响内部层，保留 Source、原始 MVT cache、state 和资源所有权。getStyle 是当前配置快照，不是 GPU 完成信号。

Pattern 按 [ADR-0075](Decisions/ADR-0075-vector-pattern-materials.md) 借用 Layer 的单 sprite atlas，
Worker 准备图案矩形与坐标，flat/ground/Globe/extrusion 只做材质采样；不得按 feature 拆 command 或生成地图颜色 RTT。
无 symbol 的 Layer 显式拥有 sprite；有 symbol 时共享其 owner。未知图片报错，不能静默替换成纯色。

建筑 `fill-extrusion` 按 [ADR-0074](Decisions/ADR-0074-vector-fill-extrusion.md) 使用独立实体网格，
由 vector Worker 生成屋顶、侧墙和法线，按 tile/style 合批；使用普通 OPAQUE/TRANSLUCENT 和 native pick/depth。
height/base 是相对 polygon terrain anchor 的米制高度，Planar 使用 +Z，Globe 使用 geodetic up；
resident terrain revision 仅更新位置流，不重新三角化或主动请求地形。首次切换 Planar flat/ground 后端仍沿用既有批次重建。
Globe 建筑地形求交与 ECEF 重编码在现有 vector Worker 完成，仅按批次相交地形依赖失效；
主线程以既有上传预算发布完整位置流，并隔离旧地形代际和销毁后的结果。
不把建筑送入地表 coverage，不新增逐 feature Primitive 或 Scene pass；跨瓦片的楼栋拼接尚未支持。

`vector-tiles` 遵循 [ADR-0057](Decisions/ADR-0057-independent-vector-tiles-runtime.md)，
不依赖 Cesium experimental MVT decoder/provider/vector GLB/Buffer vector/VectorProvider。
MVT 保持 CRS 无关，source/World 显式匹配单根 tile matrix；首轮 EPSG:3857 平面验收。
数据/样式/layout、tile batch、World adapter 与 symbol placement 分层；
禁止以逐 feature Entity 或整棵预建 tile tree 作为地图 runtime。

地形优先矢量直接绘制，不采用地图颜色 RTT 主路线。
Depth/stencil ground 是需证明批量、层序、alpha 和 pick 的候选，
公开 GroundPrimitive 的静态合批由 ADR-0168 单独定义，矢量 runtime 不隐式复用该业务图形入口。
地图图元按 [ADR-0061](Decisions/ADR-0061-owned-vector-tile-primitives.md) 自行管理
geometry、GPU buffers、Shader、DrawCommand 与 feature pick；复用 Cesium 通用 Renderer/Scene，
不通过大量修改 native Primitive/Polyline 来扩展地图样式能力。
Flat、生产贴地、标注与 Globe 各有阶段资格；Planar 测试不代表 Globe 已支持。
按 [ADR-0069](Decisions/ADR-0069-planar-vector-ground-rendering.md)，平面 ground 使用 Worker
几何数值表与批量凸体，从实际 surface depth 恢复 coverage；default flat 保留独立快速路径。
模式切换保留 source/Worker，ground 地形 LOD 只更新地表包络和 anchors，不重新三角化地图。
圆点/文字的 terrain anchors 与连续曲面字形质量分开验收。
按 [ADR-0070](Decisions/ADR-0070-globe-vector-ground-rendering.md)，Globe 使用独立 WGS84 / SCENE3D
适配，保留原生椭球和 terrain；矢量 source 固定为独立 EPSG:3857 单根矩阵。曲面三角形细分和
局部 ENU 数值表由 Worker 准备，从实际地表 depth 逆投影恢复覆盖与拾取。Globe cover 使用
地理包围体、horizon 和三维 SSE，不能套用 planar Z=0 的相机比例或地形 tile matrix。
真实地形的标注索引由 vector Worker 异步构建；只借用已发布 native mesh，不请求或修改地形。
按 [ADR-0071](Decisions/ADR-0071-vector-environment-lighting.md)，矢量地表只消费匹配 World 的既有
frame-local 物理光照/云影资源；direct 与 sky 分离，替换基础 Lambert。Globe 定向几何阴影在
真实地表位置接收，覆盖凸体不投影。环境独占 LUT/atlas/history 与 HDR 合成，不新增地图颜色 RTT。
Circle/symbol 保持制图颜色；Planar native geometry-shadow 资格不随此扩宽。
不透明 Globe / Planar 的建筑与 symbol 按 ADR-0161 使用 `SCENEGIS_VECTOR` PASS，
外部材质先于地图建筑收集，共用一次延迟光照。同一地图建筑与注记遵循样式层序，
地形判断锚点可见性，外部 Model / 3D Tiles 保持物理遮挡。保留 source-over 颜色和实心注记深度；
不得将注记颜色写入物理材质。条件外部 / 地形深度快照及拾取 MRT 的预算由 ADR-0161 管理。
Line 按 ADR-0062 在实际地表 / 平面交点的解析覆盖中限制近处放大，保留远处透视收缩；
style zoom、source LOD 和纵向花纹 station 不随宽度补偿改变。
按 [ADR-0072](Decisions/ADR-0072-vector-surface-transparency.md)，Layer opacity 只乘各要素样式 alpha，
不引入地图颜色 RTT。Globe 透明地表通过 SGP-0012 显式 owner slot 借用 native first-surface depth，
先直接合成 Globe 颜色再绘制矢量，普通地表上方对象保持后续 native 渲染；原生 imagery alpha 保持独立。
首轮仅资格确认当前可见地表，背面、地下、穿越透明地表排序与高级环境透明深度合成另行验证。
Planar 共享 vector opacity；按 [ADR-0073](Decisions/ADR-0073-planar-surface-opacity.md)，World.opacity 控制地表颜色。
WebGL deferred 分支按 ADR-0073 的 2026-10-14 修订采用真正透明：opacity<1 使用原生透明/OIT
专用受光，关闭颜色绘制的深度写入，显示后方物体与重叠地表；opacity=1 保持不透明延迟。
移除旧背景快照及 sampler；地形查询保持可用，场景深度拾取遵循 pickTranslucentDepth。
矢量瓦片与平面影像/地形共享私有 SSE 数值判据，MVT 选取预算内互不包含的近细远粗 leaves，
请求与内容缓存保持独立。Style zoom 以视轴在 Z=0 的前向交点为参考，不把倾斜造成的
采样距离变化误认为用户缩放；具体边界见 [ADR-0064](Decisions/ADR-0064-vector-perspective-lod.md)。
沿线标注按 glyph advance 逐字布置，map pitch 使用真实世界 quad corners，viewport pitch 使用 CSS offsets；
有向箭头不随文字阅读方向翻转。按 ADR-0068，碰撞使用独立保守包络，
布局按快照与软预算跨帧更新，实际字形绘制和拾取始终使用当前相机与真实顶点。
具体语义、source LOD 间距与道路拼接边界见 [ADR-0065](Decisions/ADR-0065-line-symbol-placement.md)。

矢量准备按 [ADR-0067](Decisions/ADR-0067-vector-worker-preparation.md) 使用独立 Worker：
MVT、geometry buffers、整数 zoom anchors、glyph atlas 和 normalized shaping 异步准备。
主线程保留请求、当前视图 placement/picking 和有预算的 GPU 提交；异步结果不得直接发布 draw commands。
Layer 销毁终止 owned Workers，过时 tile 结果按 token 丢弃，不引入主线程 fallback 或自动 retry。
标注按 [ADR-0068](Decisions/ADR-0068-symbol-placement-and-dynamic-buffers.md) 分离 persistent candidates、
budgeted placement 与 current-camera drawing；静态 UV/paint/pick 和动态 geometry/visibility 分流，
只上传改变的范围。短期避让延迟与保守碰撞造成的密度差异是显式资格边界。
按 [ADR-0077](Decisions/ADR-0077-variable-symbol-anchors.md)，点标注可变 anchor 的候选在 Worker
缓存，主线程按上次成功位置及声明顺序试放；只有最终选择写入碰撞网格，异步布局不得修改已发布 shape。
按 [ADR-0078](Decisions/ADR-0078-icon-text-fit.md)，fit icon 的 content/stretch 切片与 UV 在 Worker
准备，尺寸缩放复用既有 shaping cache。逻辑文字边界独立于 SDF border，变量 anchor 的图文选择必须一致。

## 模型多区域裁剪

原生 Model / Cesium3DTileset 的平面多区域裁剪按
[ADR-0189](Decisions/ADR-0189-planar-model-clipping.md) 复用 `clippingPolygons` 集合和地形 XY 边算法。
SGP-0068 只在原生集合生命周期、范围判断及 Model polygon stage 分派到自有适配器；
集合拥有一张数据纹理，瓦片模型借用。坐标是 World 绝对米制 XY，模型移动不带动区域。
颜色、拾取、深度和阴影共用 discard，不生成切面，不执行球面距离纹理计算。

## 模型局部压平

模型局部压平按 [ADR-0175](Decisions/ADR-0175-model-flatten.md) 使用显式
`SceneGISModelFlatten` / `CustomShader` 实例及局部米制范围纹理；不修改内置 GLSL。
SGP-0064 仅把原生 tile 与 draw-command 包围体接入保守变形范围，保留原始包围体、
原生加载和 SSE。球面 ENU 平面不等于等椭球高，平面不自动投影。首版只移动静态网格
已有顶点，不切分拓扑；范围/Context/纹理归实例所有，SDK 封装须待视觉验收。

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
- 除 ADR-0027 terrain、ADR-0067 vector entries 外，其他 SceneGIS Worker 的入口、协议与发布行为。
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

## 几何级联阴影（R1 / R10 / R11）

[ADR-0083](Decisions/ADR-0083-planar-cascaded-shadows.md) 通过 SGP-0013 扩宽此前 Planar
几何阴影限制。[ADR-0088](Decisions/ADR-0088-directional-shadow-refinement.md) 将稳定四级覆盖
与连续 PCF 扩展到 Globe；复用原生 ShadowMap atlas、派生命令和控制接口。SceneGIS-owned helper
负责 World 可见性、级联包围球、纹素对齐、重叠混合与接收面逐采样深度校正。Planar 使用固定配置
范围，Globe 对可见 far 范围按 2 的幂向上分档，兼顾小模型精度与档内稳定；跨档会重新分配。
软阴影使用 4x4 tent，硬阴影单点；不增加资源或公共 API。Scene 释放自有
ShadowMap 后才销毁 Context。禁止第二套阴影引擎或伪装 Globe tile owner。

`Viewer.shadows`、`Viewer.terrainShadows` 与 `world.shadows` 保留原生语义；普通 Entity
Graphics / Primitive / Model 使用 `ShadowMode`。地形 clipping 同时作用于 caster，opacity
的背景贡献不受地表阴影衰减。连续贴地分类覆盖、vector 和 label 的资格不随此扩大；不新增
离屏地形预取。

[ADR-0089](Decisions/ADR-0089-direct-shadow-lighting.md) / SGP-0018 将几何阴影可见度提前到
材质光照阶段。PBR（含 clearcoat）、Phong 和启用光照的 Globe / Planar 地表仅衰减
direct 光，保留环境光、IBL / SSR、自发光与后续雾、裁剪边缘合成。unlit glTF 不接收
光照；没有光照分量约定的普通 unlit 地表和自定义最终颜色 shader 保留原有阴影行为。
禁止为此新增 shadow atlas、渲染通道或公共开关。

## WebGL 延迟实验的共享深度

按 [ADR-0161](Decisions/ADR-0161-unified-opaque-deferred-direction.md)，实验分支以后以
单一不透明/MASK 延迟主通道为目标，不维护完整前向兼容模式，也不为过渡 Globe 前向另建
调度层。复用现有 API、内容准备和资源设施；透明、阴影、拾取、天空保留各自专用通道。
Globe 影像先合成材质，再参与光照；旧前向逐像素等价不再作为新增接入的强制验收目标。
原生可见性、分类、深度精度和公共能力仍需独立契约，未完成资格不得通过删除校验来表示支持。

P4d 已获准将唯一入口限定为 WebGL2 / SCENE3D、默认单采样，其他原生场景模式不以完整
前向 fallback 兼容；入口迁移仍按该阶段计划跟踪。`highDynamicRange=false` 的延迟路径
保留内部线性浮点材质、光照和透明合成，在现有显示槽位只做裁剪与 gamma，不应用曝光和
tone curve。开启 HDR 恢复既有显示控制；浮点设备要求及 HDR 专用效果的显式前提不变。
完整颜色、资源和升级边界见 ADR-0161 的 P4d amendment / SGP-0046。

按 [ADR-0160](Decisions/ADR-0160-deferred-primitive-materials.md) / SGP-0049，实验的普通
Primitive 材质通过原生 appearance 组装时的显式标记接入。Phong 复用四附件和共享屏幕光照组，
保留其原生材质、天气、直接阴影和 AO 语义；Entity 仍由原生 visualizer / batch 生成图元。
不将任意 Entity、自定义外层 Shader、Globe 或贴地分类自动视为已完成延迟接入。

[ADR-0159](Decisions/ADR-0159-deferred-feature-styling.md) / SGP-0048 保留原生 Model 与网格
3D Tiles 的光照前/后样式分工。模型级颜色复用原生函数与 uniforms；逐要素的光照后
乘数写入按需第五张 RGBA16F，再在既有屏幕光照中应用于颜色和 AO/SSR/SSIL 响应。
不存 feature/pick ID，不新增全屏绘制，不改变透明分流或拾取。此类不透明内容要求至少
五附件，普通内容仍为四附件；第五附件独立所有，布局切换保留四张基础纹理。
诊断 G-buffer 与延迟实验的资格边界保持独立，不据此扩大分类、点云或特殊边缘效果范围。

[ADR-0156](Decisions/ADR-0156-webgl-deferred-lighting-experiment.md) 的私有单采样实验按
[ADR-0158](Decisions/ADR-0158-shared-deferred-depth.md) 复用当前 lighting MRT owner 的
R32F 线性深度。Deferred 在 opaque 完成后、屏幕光照之前清零并转换一次；AO/SSR/SSIL
直接消费，不再重复 depth blit/转换。没有 consumer 时 Deferred 才自有该目标。
借用 Texture 与自有 FramebufferManager 分离，每帧刷新；销毁借用者不得销毁 owner 资源。
材质法线、AO 几何法线、SSR/SSIL 光照响应的语义保持独立，不能直接以数据名称相似替换。
现有非实验、多视锥/多采样接点保持原有调度与所有权，不新增公共渲染选择 API。

## 局部夜景光照（R7）

[ADR-0090](Decisions/ADR-0090-local-night-lighting.md) / SGP-0019 增加显式绑定 Scene 的
`SceneGISLightCollection`。当前 WebGL2 延迟实验按
[ADR-0157](Decisions/ADR-0157-tiled-local-lighting.md) / SGP-0047 扩至最多 256 个
`SceneGISPointLight` / `SceneGISSpotLight`，调用形式与能量语义不变。
保留 `scene.light` 和原生材质自发光；局部灯只在 PBR、Phong（含 OIT）和 lit terrain
的直接光分量累加，位于雾与 tone mapping 之前，独立于方向光阴影和 AO。Globe 的 ECEF
与 Planar 的 Cartesian 输入共用米制距离与弧度角；CPU 每帧变换到 eye space。
延迟 Model、配套透明/普通接收者、SSR 与探针捕获共享保守 tile 灯列表和 GPU 参数表；
复用原生 Texture，参数 float bits、tile headers 与索引共享一张 RGBA32UI 数据纹理，
只占一个 sampler。集合拥有纹理，空/隐藏时释放，resize 更新，销毁先于 Context。
不读取深度，不截断 tile 候选；局部 range/cone 精确判断保留。多灯高度重叠时不保证提速。
SGP-0047 显式排除 shadow caster 的局部颜色派生；ShaderCache 仍拥有程序。
不增加几何 pass 或 framebuffer。Scene 拥有集合生命周期，
描述对象无 GPU 资源、可共享；超限报错，不静默选灯。局部阴影、体积散射、GI、自动 glTF
灯节点导入和自定义光照 shader 不在首轮资格内。

[ADR-0186](Decisions/ADR-0186-rectangular-area-lights.md) / R30 增加
`SceneGISRectAreaLight`，与点光/聚光共用集合容量、接收路径与生命周期。矩形宽高与
方向构成真实面光积分；漫反射裁剪到接收半球，GGX/clearcoat 使用固定版本 LTC 拟合。
面光 intensity 是线性 HDR 辐亮度，固定亮度时面积增大会增加出光量，区别于点光的一米
照度尺度。默认单面、可双面，range 对中心距离平滑衰减。参数轴和 LTC 数据复用同一
整数纹理，不新增 sampler、pass 或 framebuffer；无活动矩形时沿用原四行参数布局。
Phong 的镜面项映射至 GGX；各向异性材质使用 isotropic 面光高光，不增加局部阴影。

SGP-0020 修正原生 bloom 在 HDR tone mapping 前使用 8 位中间结果的暗部条带和自发光截断。
已有 bloom stages 跟随 Scene framebuffer 精度，HDR/LDR 变化由 native texture cache 重建，
提取的 RGB 不得为负。沿用原生控制和资源所有权；不创建第二套公开泛光效果。

## 本帧环境光遮蔽（R2）

[ADR-0084](Decisions/ADR-0084-forward-ambient-occlusion.md) / SGP-0014 复用
`scene.postProcessStages.ambientOcclusion` 控制接口。SceneGIS-owned helper 重放原生 opaque
depth-only 派生命令，将各视锥深度转换为统一 eye depth，再执行 GTAO hemisphere slice 积分和
保边滤波。主绘制在 ambient / IBL 项采样遮蔽；不得把 AO 乘在最终场景、大气或自发光颜色上。

仅资格确认 SCENE3D / WebGL2 floating-point targets，覆盖 Globe / Planar 地表、普通 lit
primitive 与带法线的 PBR model。透明、classification、vector、label 不因本阶段自动扩大资格。
不引入历史帧、相机 jitter 或第二套公开开关。帧缓冲由 native AO composite 的 owned state 所有，
关闭时保留以便复用、resize 时替换、collection 销毁时释放；ShaderCache 管理派生程序。

## 方向性环境反射遮蔽（R28）

[ADR-0184](Decisions/ADR-0184-directional-environment-occlusion.md) / SGP-0014 为既有 AO 增加
默认关闭的 `uniforms.directionalOcclusion`。复用当前 deferred opaque 全视图深度及 GTAO
径向采样，估计可见半球的一阶矩，用原有几何法线/深度权重过滤。方向信息只作用于不透明/MASK
原生 PBR 的环境镜面项，基础层与 clearcoat 分别使用各自的原生反射方向，保留各向异性。
不得替换材质法线、改变直接光/自发光，或对 SSR 已命中反射再次乘环境遮蔽。

方向模式在 deferred 光照前运行一次估计/滤波；原来稍后的 AO 合成不重复估计，也不重复
遮蔽已处理的 PBR。其漫反射仍用相同标量可见度，其他光照类型保持已有标量修正。两次全屏
pass 和原有径向深度采样数不变，独占估计/滤波目标由 5 B/pixel 增为 12 B/pixel。方向资源
在关闭、布局改变、resize、destroy 时释放/替换；派生 Shader 属原生源程序缓存，热帧禁止
重复源码键查询。借用的主深度不由 AO 释放。

严格 Planar 大气、LUT 和原生透明路径不变；半透明反向分类独立工作集不消费主视图方向。
方向性漫反射需要独立的天空辐照度方案，未由本阶段隐式启用。屏幕外、隐藏层及多个开口的
限制必须保留，不能用调色或相机角度阈值掩盖。

## 物理天空镜面 IBL（R3）

[ADR-0085](Decisions/ADR-0085-physical-sky-specular-ibl.md) / SGP-0015 为 Globe / Planar
物理环境补齐默认镜面 IBL。沿用 ImageBasedLighting、原生 PBR / clearcoat 和 GGX convolution；
显式 model / scene specular maps 优先。环境 renderer 按需所有共享 RGBA16F cubemap 与完整
roughness mip 链，模型只借用；独立世界方向变换保证反射不随 model/referenceMatrix 旋转。
禁止把 per-model procedural manager 复制为第二套引擎。Framebuffer 的私有 color mip 参数
仅用于直接 HDR attachment；深度和默认调用保持 level zero。保持已有材质、AO 与直接光分工。

R3 仅捕获物理天空与中性地面近似；太阳盘由直接光 BRDF 计算，云、雾和局部几何反射不在资格内。
当前为相机区域共享探针；太阳/局部坐标轴变化超过 0.1 度、高度变化超过 100 米或 LUT 替换时
同步重建完整 mip 链。静态帧复用，环境 release/destroy 释放资源，不逐模型重复捕获。

## 前向屏幕空间反射（R6）

局部环境补全遵循 [ADR-0096](Decisions/ADR-0096-local-environment-probes.md) / SGP-0024：
`SceneGISReflectionProbeCollection` 由 Scene 所有，显式捕获完整加载的独立 Model，最多两个
刚体盒状探针。捕获使用独立 Camera 与 capture-only 原生 ShadowMap，完整结果原子发布；
恢复主视图状态，不改主相机、主阴影图或 MRT 布局。静态帧只采样缓存。
默认天空漫反射乘方向可见度；盒投影镜面辐亮度在原生 BRDF 和 SSR 之前替换环境来源。
保留显式 IBL/SH，不能将遮挡乘到最终颜色或直射光上。探针位置可见度不等价于逐点遮挡，
不承诺跨墙无漏光、漫反射反弹、透明捕获、递归或仅凭主相机瓦片完成离屏捕获。

[ADR-0086](Decisions/ADR-0086-forward-screen-space-reflections.md) / SGP-0016 保留前向 PBR，
由显式绑定 Scene 的 `SceneGISScreenSpaceReflections` 捕获本帧 opaque HDR 辐亮度，以及原生
基础层/清漆层求值后的反射方向和粗糙度。原生日志深度与各视锥合并为统一 eye depth；
追踪和保边过滤后的命中辐亮度在原生 IBL 材质权重之前融合，未命中保留已有 IBL。
禁止未按材质权重直接叠加 SSR，或在捕获中再次消费自身 SSR 结果。

Scene 独占已绑定效果的生命周期，调用方可提前 destroy 解除绑定；默认 disabled，不分配 GPU，
启用需要 SCENE3D / HDR / WebGL2 和浮点 MRT。关闭保留资源，resize 替换，Scene 在 Context
销毁前释放。当前不透明 PBR 模型为接收者，opaque 地形/图元为反射来源；透明、分类覆盖、标注、
屏幕外几何和递归反射不在资格内。额外完整 opaque replay 与全分辨率存储是明确的成本边界。

[ADR-0091](Decisions/ADR-0091-main-pass-reflection-mrt.md) 为已资格确认的单视锥 opaque 主通道
增加 MRT，保留上述 API 与材质语义。借用原生颜色/深度，保留 MSAA，附加本帧反射方向、材质响应
与已加权环境贡献；opaque 完成后以带符号差值替换环境反射，再进入 water/translucency。
原生颜色各 MSAA sample 保留，辅助附件独立 resolve；背景从反射来源 mip 链排除。普通材质需要
4 个输出，clearcoat 需要 7 个；多视锥、分类等尚无等价主通道契约的原生路径仍按 ADR-0086 replay。
附加资源为 SSR 所有，借用的原生附件不能由 SSR 销毁；AO 深度预通道仍独立。

[ADR-0092](Decisions/ADR-0092-depth-shadow-submission.md) 限定精确的提交优化：浮点 uniform
数组以实际上传的 Float32 位模式判断重复，不缓存调用方对象身份或跳过本帧 callback；AO 的
模型深度变体保留材质、discard、裁剪与深度，仅跳过原生光照。3D Tiles 的 camera traversal
不能代替 light-volume culling，委托相机剔除的瓦片命令需独立检查各级联，不能假设它们嵌套。
这些优化不授权陈旧深度/阴影复用、自动质量降级或扩大普通 DrawCommand 的 cull 语义。

[ADR-0093](Decisions/ADR-0093-main-pass-ambient-occlusion.md) 将 AO 的常规 HDR 单视锥路径
迁入共享主通道 MRT：额外输出已含材质、clearcoat 和样式响应的间接光，复用主深度进行
全屏 AO，仅向原颜色合成 `(AO - 1) * indirect`。SSR 使用已修正的表面颜色和相同 AO 权重，
水面可借用同一不透明快照。AO 单独开启同样不重绘几何；非 HDR、多视锥、分类及尚无
精确响应契约的后光照分支保留既有预通道，不得把这一有限适用范围报告为全路径替换。

## 屏幕空间间接漫反射（R20）

[ADR-0099](Decisions/ADR-0099-screen-space-indirect-lighting.md) / SGP-0026 增加实验性、
默认关闭的 `SceneGISScreenSpaceIndirectLighting`。Globe / Planar 共用有限距离的一跳
漫反射估计；沿用前向光照，在原始 opaque MRT 中增加两个 RGBA16F 附件，记录直射漫反射
加自发光、接收材质响应和法线。禁止将最终画面、天空 IBL、高光或已有 SSIL 再次作为反弹源。
保留材质遮挡、清漆衰减和已支持的线性样式；GTAO 不再次乘到已经追踪可见性的反弹项。

SSIL 使用稳定空间采样、32 位可见性扇区和保边重建，无独立历史；TAA 仍由应用控制。
只接收支持的 opaque PBR Model / 3D Tiles，其他 opaque 几何仅遮挡。限定 HDR / WebGL2 /
单视锥和已确认的后光照分支，布局不支持时明确报错，不能静默重绘几何或降级。
单独启用需 3 个输出，加 AO 为 4，加基础 SSR 为 6/7；清漆 SSR 同开超出当前附件预算。
Scene 管理生命周期；借用主颜色/深度不可销毁，禁用保留已分配目标，resize/destroy 释放自有资源。
MSAA 保留原生颜色样本，辅助材质独立 resolve；边缘混合后的法线是近似，不能声称逐样本 GI。
屏幕外、隐藏表面、透明和多次反弹不属于本阶段能力。

## 几何高光抗锯齿（R19）

独立的几何高光过滤按 [ADR-0098](Decisions/ADR-0098-geometric-specular-antialiasing.md)
在 Model PBR 光照前调整有效粗糙度，基础层、清漆、IBL 与 SSR 共用结果。
`SceneGISSpecularAntialiasing` 默认关闭、Scene-owned，无额外 GPU 资源或绘制通道。
SGP-0025 仅发布设置、绑定 uniform 并调用自有 Shader；它不改变 TAA 或 MSAA 所有权。

## 时域抗锯齿（R4）

[ADR-0094](Decisions/ADR-0094-temporal-antialiasing.md) / SGP-0022 增加可选的
`SceneGISTemporalAntialiasing`，默认关闭。首轮限定 HDR / SCENE3D / WebGL2 单 viewport，
球面和平面共用 API；原生 MSAA、FXAA 仍由调用方选择。渲染专用 projection jitter 只作用于
UniformState，不修改 Camera、CPU culling 或阴影相机，异常时同样恢复；深度拾取记录并抵消
对应采样偏移。逐视锥转换已有主深度，不重绘几何；独立 HDR/depth 历史在环境合成之后、
bloom/tone mapping 之前重投影与裁剪，关闭、resize、destroy 释放对应 owned targets。

不借用 Cloud history，不增加隐藏的 request-render 收敛帧。首轮仅有相机运动重投影，
没有物体 motion vectors，动态、透明与标注内容可能柔化或残留拖影。远离几何的背景保持
当前帧，轮廓仅扩展一像素深度支持以积累子像素覆盖；不得据此宣称全部场景实现无拖影 TAA。

## 局部水面（R8）

[ADR-0087](Decisions/ADR-0087-local-water-surfaces.md) / SGP-0017 增加显式
`SceneGISWaterSurface` 图元，保留原生 Fabric Water 和 Entity API。PolygonHierarchy 使用
local XY 米制平面，modelMatrix 使用刚体变换；Globe 采用 ENU，Planar 采用笛卡尔放置。
同帧 opaque 快照不包含水面，已有 SSR 时借用其颜色/深度；否则 Scene 延迟创建共享捕获。
水面逐视锥在 opaque 之后、translucent 之前合成透射、吸收、散射和 Fresnel 反射，并写水面深度。
禁止用统一 alpha 替代 RGB Beer 吸收，或把水面重新送入自身反射/AO 输入。

几何、程序和 pick ID 由图元所有，集合负责销毁；屏幕目标由 Scene 所有，天空由已有环境所有。
ADR-0196 的泡沫密度纹理由 Scene 共享并销毁，按需从批准的 runtime asset root 异步加载；
完整许可与固定来源随包分发。水面几何就绪不等待泡沫纹理，加载失败不得静默替换材质。
默认波纹随 Scene time 演化，仅改变法线；散射、泡沫和直接高光借用现有物理光源，不对水下快照重新照明。
首轮资格为水上观察、局部单层水面和 opaque 水下几何，不扩展为海洋、水下相机或多层透射。

[ADR-0194](Decisions/ADR-0194-water-medium-optics.md) 为 WaterSurface / RiverSurface 增加可选
`scattering` 和 `scatteringAnisotropy`。定义 scattering 时使用按米计的吸收、散射与单次散射
解析积分，undefined 保留 waterColor；不增加资源、绘制通道或回读。折射接受的颜色与深度
必须来自同一采样位置，已受光的底面只做消光，不再次照明。无底面保持无限深水近似。
R31 为水上单层光学；R33 的有限水域扩展见下文。

[ADR-0195](Decisions/ADR-0195-water-foam-history.md) 在 FFT finalize 中积累白沫历史。
`foamHalfLife` 以模拟秒控制衰减；新增每频段一张法线历史纹理，不增加 draw。
示例颜色选择器按明确光程转为吸收系数，预设仅填充可编辑值。

[ADR-0196](Decisions/ADR-0196-local-underwater.md) 在 local 水面中增加显式 `underwaterDepth`
与复制的 `bathymetry`。水下合成复用 SGP-0017 现有 owned helper，在最近 frustum 的
opaque 后、透明物体前执行；凹轮廓、孔洞、容积底和 opaque 深度限制光程，无逐帧回读。
`causticsIntensity` 使用实际波面折射网格的面积比形成局部焦散图；同一水深场驱动持久岸沫。
固定场和水下程序归图元所有。曲面/河流容积、半透明水下物体、重叠介质及波浪精确弯月面不在首版资格内。

## 风驱动湖面（R22）

[ADR-0101](Decisions/ADR-0101-wind-water-spectrum.md) 在原有 WaterSurface 上增加可选的
`windWaves: SceneGISWindWaves`，Globe / Planar 共用接口。模拟由调用方所有，可在同一 Context
及对齐的局部坐标中共享；先移除借用的水面，再销毁模拟，最后销毁 Viewer/Context。

初始 JONSWAP/TMA 频谱在参数变化时由 CPU 生成，三频段演化、IFFT、位移及法线由 GPU 完成，
无运行时读回。[ADR-0181](Decisions/ADR-0181-multiscale-lake-waves.md) 使用 L、4L、L/8 三个周期与互补径向频窗；
`directionalSpread` 控制归一化方向分布，短波更分散，`rippleIntensity` 仅控制细波幅度。
河流私有双频带保持独立。Scene time 和配置均不变时复用输出；show=false 不推进模拟。128 米分块裁剪
原始轮廓与孔洞，距离 LOD 保留一致的细分边界。位移按共享 LOD 比例的连续顶点距离和像素足迹过滤，
不得在分块边缘重置波浪精度；包围体涵盖位移。
非当前网格缓存不超过 16 MiB。复用 R8 opaque/天空输入及延迟绘制缝隙，不新增上游补丁。
这是均匀平均水深下的风浪外观，不承诺岸边绕射、地形驱动水流、洪水、破碎浪或水文预测。

## 区域曲面河湖（R25）

[ADR-0179](Decisions/ADR-0179-regional-curved-water.md) 在 WaterSurface 上增加显式
`geometryMode: "ellipsoid"`，使用 ECEF 轮廓、椭球水位和现有 FFT；默认 `local` 保留。
曲面只用于匹配椭球的 Globe，要求 identity modelMatrix；不自动投影 Planar 坐标，也不查询地形。
轮廓和孔洞在固定的 geodetic-normal gnomonic chart 中一次三角化，再按需裁剪为四叉树网格。
顶点通过椭球反算和相对块坐标跟随曲率，常量水位或逐点水位沿三角形插值。

选级结合屏幕网格尺度与曲率误差；公共叶节点预算限制最坏选级规模，不能视为绝对精度保证。
不同 LOD 的相邻边共享细分坐标，波浪相位和过滤足迹跨块连续。各块共用同一 FFT，
不增加模拟和全屏 pass。非当前 GPU 网格缓存上限 16 MiB，旧 CPU 子树按节点预算清理。
构建仍同步进行，复杂轮廓或首次大幅视角跳转可能产生构建停顿，应通过 statistics 和代表性数据评估。

曲面法线参与光照、位移与水上判断；接触深度、折射和 SSR 采用相机相对的局部密切球近似，
保留 R8 的屏幕空间光学限制。区域 chart 有投影畸变，不承诺全球海洋、全球 FFT 连续场或水动力学。
数据须落在一个开放切向半球；大范围水位仍是椭球高，不自动等同海拔或大地水准面。
所有实现使用 SceneGIS-owned 路径，复用 SGP-0017，无新增上游集成缝隙。

## 沿程河流水面（R26）

[ADR-0180](Decisions/ADR-0180-directed-river-surfaces.md) 增加独立 `SceneGISRiverSurface`，
精确绑定一个存活的 Globe / SceneGISPlanarWorld。Globe 输入 ECEF 和椭球水位，Planar
输入当前 World 的米制 XYZ；不自动投影或查询地形。中心线顺序定义流向，逐控制点水位、
全宽和非负流速定义连续河段；几何输入构建时复制，修改几何须替换实例。

中心线横断面形成不自交的斜接河道，显式拒绝折返、折叠和接触自身的轮廓。
可选 PolygonHierarchy 只裁剪河道范围并保留孔洞，不决定水位或扩大宽度包络。
三角形携带沿程坐标、横向坐标和流速，裁剪与 LOD 细分保留插值；禁止按最近河段猜测归属。
复用区域水面的选级、接缝、缓存与绘制，公共拾取对象保持 RiverSurface。

河流自持双频带随机 FFT，通过八个固定方向分区的相邻采样表达局部流向，避免连续旋转坐标的扭曲。
双相位平流与 FFT 自身演化分离；零流速只停止搬运，Scene clock 控制两者。平滑有界高度场
同时用于顶点位移和法线，每相位/方向独立过滤后混合，
避免速度梯度在相位重置时跳变。几何按连续的网格/像素尺度过滤，岸边衰减，包围体包含最大浪幅。
艺术性白色流纹默认关闭，不作为破浪依据。
可选风浪 FFT 独立借用，河流速度不覆盖风速或风向；内部河流 FFT 随河流销毁。斜面法线参与光照和局部光学判断，
Planar 不使用行星曲率修正。资源与上游集成沿用 R8/R22/R25；只增加实例内 FFT 小尺寸计算，
无新增场景全屏 pass、流场纹理或 SGP。
不承诺水动力守恒、汇流分汊、瀑布、自动开挖或海洋；同步网格构建和区域投影限制仍存在。

## 可编程 GPU 粒子

[ADR-0102](Decisions/ADR-0102-gpu-particle-foundation.md) 增加独立的
`SceneGISGpuParticleSystem` 图元。用户提供 GLSL 初始化与更新函数，以及自定义
`uniformMap`；底层不内置力、速度积分、发射形状或天气行为。状态使用局部米制坐标，
调用方提供刚体 `modelMatrix` 与保守的局部 `boundingSphere`；Globe / Planar 共用 API。

固定容量状态存储于四张 RGBA32F 纹理的双缓冲集合；正常帧时间变化时执行一次 MRT 更新，
无逐粒子 CPU 更新或读回。CPU 只调度循环槽位的发射；容量饱和覆盖旧槽位。
一个实例化 quad 命令接入原生透明/OIT、深度与系统级拾取，pick pass 不推进模拟。
资源由图元所有，集合负责销毁；Shader uniform 引用与输入图像借用，上传的图像纹理由图元所有。
`initialParticles` 支持初始/reset 填充，`renderShader` 在顶点局部副本上执行呈现，
与模拟共享 uniformMap，但不回写状态；包围体也须覆盖呈现修改。
不承诺逐粒子排序、光照、阴影、碰撞或运动矢量。

## 鸟瞰雨雪天气

[ADR-0103](Decisions/ADR-0103-aerial-weather.md) 的 `SceneGISWeather` 使用近远两个通用
GPU 粒子池，模拟规则全部在天气 GLSL 内。显式 Globe / Planar 模式，固定容量分档，
以场景时间平滑改变强度、类型与风速；没有逐粒子 CPU 更新或读回。
相机移动时将已有状态转换至当前局部坐标，冻结时间时只在绘制副本上转换。
周期循环和距离渐隐补充视域，球面采用区域 ENU 近似，不是全球降水模拟。

天气归 `scene.primitives` 所有并排除拾取；不提供屋檐遮雨、碰撞或物理积累，强度是视觉密度。
[ADR-0106](Decisions/ADR-0106-unified-weather-composition.md) 将雾、地表及镜头联动纳入可选的
scene-bound composition；不传 Scene 时保持独立粒子。Fog 显式借用已注册的 EnvironmentEffects，
不创建/启用第二个环境控制器，不改变大气、云、光照、曝光或时钟。Surface/Lens 复用现有实现，
没有额外 Shader、几何回放或独立渲染管线。

`fog/surface/lens.automatic=false` 时完全交还共享实例控制权；自动模式才由天气写入当前强度，
clear/hide 撤除自动效果并保留目标强度。Scene preUpdate 在环境与材质 consumer 前同步状态，
primitive update 不重复推进过渡；粒子相机重定位按实际绘制帧计时，不能用未绘制的 preUpdate 代替。
一个 Scene 只绑定一个完整天气实例。销毁释放自建组件与监听；借用实例不销毁，条件恢复仍未被外部改动的天气字段。

## 地表湿润与薄雪

[ADR-0104](Decisions/ADR-0104-approximate-surface-weather.md) / SGP-0028 的
`SceneGISSurfaceWeather` 独立于降水粒子，由 Scene 所有。基于既有几何法线、材质和世界位置，
在 opaque PBR / Phong / Globe 与 Planar 地表光照前应用覆盖；不要求额外资产属性。
Globe 用 geodetic up，Planar 用固定 Z；CPU 降低相机原点数值后进行世界固定周期噪声求值。
SSR MRT/replay 与探针捕获共享同一材质；地形保留 diffuse lighting，只近似增加湿润方向高光，
不因此成为 PBR/SSR 接收者。默认关闭，零覆盖恢复原命令，无额外纹理、几何 pass、history 或读回。
透明、unlit 模型、分类和水面不参与；不模拟屋檐遮挡、水洼深度、排水或雪厚。

[ADR-0105](Decisions/ADR-0105-rain-surface-and-lens-details.md) 的 `rippleIntensity` 默认零，
以 Scene time 在湿润朝上表面求解析环状法线，光照和模型 SSR 共享结果。远处按像素足迹淡出，
不增加纹理、几何回放或水面接入。独立 `SceneGISRainLensStage` 显式加入同一 Scene 的原生
`postProcessStages`，由 collection 管理生命周期；默认关闭，只增加 tone mapping 后、FXAA 前的
颜色通道，保留 alpha，不修改相机、曝光、天气或时钟。

## 全局自动曝光（R21）

[ADR-0100](Decisions/ADR-0100-global-auto-exposure.md) / SGP-0027 增加默认关闭的
`SceneGISAutoExposure`。它由 Scene 的 PostProcessStageCollection 拥有，Globe / Planar
共用 HDR 屏幕空间测光，在 native bloom / tone mapping 前读取未曝光颜色；复用原生 tone
mapper 的 1x1 divisor 接口。禁止曝光结果反馈测光、几何回放、全尺寸中间颜色和逐帧 CPU 读回。

GPU 维护最长边 128 的 log luminance、64 档加权直方图和 1x1 双缓冲历史。全局增益在 stops
空间以实际时间做 linear/exponential 适应，request-render 不额外请求收敛帧。默认不改变
原生曝光/色调映射；关闭释放目标并恢复手动路径。原生 exposure 保持调用方所有权。
GPU 不支持或 HDR 关闭时明确报错；不引入 pre-exposure、EV100 校准或局部曝光。

## HDR 颜色调整（R24）

[ADR-0154](Decisions/ADR-0154-hdr-color-grading.md) / SGP-0044 增加可选的
`SceneGISColorGrading`，由 Scene 的 PostProcessStageCollection 所有。白平衡、亮度对比和
饱和度在原生曝光之后、所选 tone curve 之前作用于线性 HDR，不改变 alpha 或输出 gamma。
原生 stage 在首次 update 前显式组装自有函数与 uniforms；不做源码替换或复制 tone mapper。
无额外纹理、FBO 或 pass；普通参数只更新 uniform，启停和原生 variant 变化可重建 stage。
测光、TAA、光照和天空遮蔽保持独立；预设属于应用配置，不成为引擎隐式默认值。

[ADR-0169](Decisions/ADR-0169-solar-white-balance.md) 在同一显示槽位增加环境固定太阳白点：
`environmentEffects.whiteBalance` 默认 true，双世界共用 Bruneton demo 的太阳光谱积分白点，
按 RGB 算术平均归一后逐通道校正。HDR 位于曝光之后、手动调色及 tone curve 之前；
LDR 位于 clamp/gamma 之前。状态来自已有 active lighting record；停用环境恢复 identity。
普通开关只更新 uniform，不增加 pass / 目标，不改变光传输、测光或 history。
全场景颜色统一处理，包含注记 / unlit / emissive；不根据太阳角度或当前白材质自动校正。

## AgX HDR 显示曲线

[ADR-0164](Decisions/ADR-0164-agx-hdr-display.md) / SGP-0060 在既有 Tonemapper 中增加
`AGX`，由原生 collection 显示槽位选择自有 stage。沿用一次曝光、可选调色、一次输出 gamma
及原生生命周期；AgX 内部 2.2 次幂属于返回线性 RGB，不能当作重复显示 gamma 删除。
保持引擎 PBR Neutral / exposure=1、自动曝光默认关闭；LDR 在可选固定太阳白点校正后裁剪 / gamma。
示例中的 AgX / exposure=10 是来源对照配置，不是太阳倍率或 EV100 标定。没有新增 pass / 目标。

[ADR-0165](Decisions/ADR-0165-diffuse-ground-return-and-symbol-exposure.md)：矢量文字 / 图标
在原有有序混合位置只对线性 premultiplied RGB 抵消曝光，保持 alpha、拾取、深度及样式顺序。
色调映射 / 调色仍作用于注记；LDR 不补偿。显式自动曝光使用上一完成帧的自动增益与当前
手动增益 / compensation，适应期间允许一帧比值变化，不增加测光 pass，默认仍关闭。

## WebGL 默认高级环境

ADR-0044 的 2026-10-17 修订将验收外观提升为引擎默认：两个世界及默认 / 显式环境均以
backgroundRadianceScale=2.5、surfaceRadianceScale=1.2、aerial / cloud 相对倍率 1 起步。
这些是显式艺术默认，不改变共同物理单位；调用方可指定中性倍率 1 或其他受支持值。
默认不随 HDR/LDR 或创建入口变化。HDR 和自动曝光默认关闭；显式 HDR 曝光 / tone
mapping 与调用方设置保持独立，LDR 在固定太阳白点校正后保留 clamp / gamma。
物理 LUT 保留三波段光谱传输，在 SceneGIS 包装边界按原实现 Sun / Sky 各自系数转为
线性 sRGB，并共同除以固定日光参考单位 40000 cd/m²，见 ADR-0044。地表、大气、云和
天空反射共用这一相对光度单位；透射率不转换，已有 RGB 灯光 / 材质不二次转换。
三波段近似不是任意光谱积分或 EV100 标定；数值验证不替代负责人视觉验收。
该单位将地球预设海平面、天顶太阳下的参考 18% 灰面置于约 0.18；不依相机、时刻或
HDR/LDR 动态测光，太阳 / 天空的物理照度比例保持原值。

ADR-0165 为共享漫反射环境来源补齐下半球 Lambert 地面反弹，使用原地面反照率 0.1、
地面水平直射 / 天空照度及接收面半球权重。Globe 按半径平方比约束高空贡献；云影影响
反弹的直射来源，AO 继续影响间接光。矢量建筑、Model / 模型类 Tiles 与地形共用，显式
SH 所有权保留。此区域环境近似不等价于局部纹理、建筑之间或逐反弹可见性的完整 GI。

Globe 的上半球 diffuse sky 按已有 scattering LUT 做方向余弦积分，代替斜面的半球比例
近似（ADR-0165）。资源创建时生成高度 / 太阳 / 法线倾角 / 相对方位的全局照度表，与原
64×16 scalar irradiance 共用一个 649×272 RGBA16F atlas；运行时四次双线性查询。
保持光谱转换边界、独立直射和地面返回，不增加材质 sampler 或每帧更新；不使用相机区域
缓存。原照度纹理及临时 FBO / program 在生成后释放，atlas 由环境生命周期持有。

ADR-0167 用 `nightAmbientIntensity` 替代 Globe / Planar 固定太阳角夜间补光：默认 1、有限 [0,8]，
0 关闭。按接收面的物理天空 RGB 照度做连续环境光下限，保留法线、材质、AO 与
原 ambient 消费边界；背景天空、直射日月光和曝光独立。只扩展 SGP-0009 一个 warm
uniform，不新增资源；Planar 复用既有 lighting record 和固定 +Z 天空照度。

ADR-0166 的 `aerialPerspectiveDistanceScale` 是 Globe 有限接收点的艺术距离控制，
Globe 默认 0.5、有限范围 [0, 8]；1 保留原物理查询距离，0 同时移除沿程散射与衰减。初始真空段不参与缩放，几何和
云前方大气使用同一距离倍率，实际深度、云前后判断、高度雾、光照和背景天空保持原值。
通过 warm uniform 更新，不新增资源或 pass；Planar 暂仅接受 1，不暗中套用球面实现。

ADR-0161 / SGP-0046：WebGL 延迟入口统一使用高级物理环境；原生 sky / Sun bloom / 可见 Fog / Globe ground atmosphere 与 daylight 不再执行。保留调用方对象、Fog 瓦片剔除以及高级环境使用的 Moon / 星历。scene.environmentEffects 只读访问显式控制器或 Scene 自有默认实例，默认开启大气、空气透视和高度雾；云及其阴影 / 光束、bloom、lens flare 默认关闭且云资源按需冷加载。显式环境（包括 disabled）优先，默认让位释放 GPU，移除后恢复原设置；World 变更前释放自有实例，不销毁调用方控制器。显示 HDR 开关不限制内部物理计算，也不由默认创建改写。Planar 复用显式 light authority；没有时提供固定 Z 默认方向，不猜地理坐标。

Globe / Planar 均允许调用方安装 scene.light DirectionalLight；自动主光让位，统一驱动地表、模型、云和现有阴影。恢复 SunLight 后恢复自动太阳 / 月亮主光。自定义光对象不被改写或销毁，天空与天体仍按既有星历或 Planar 天体方向；环境释放只恢复仍归其持有的光源。

## Shared directed observers

ADR-0177 将 Viewshed / VideoProjection 组织为独立公共 stage，共享自有 observer state、
coordinator 和 GLSL 遮挡判定。Scene、Planar Surface、S3M 只依赖通用 observer 协议；
SGP-0065 保留原有调度位置。每实例独立深度资源，不覆盖太阳 shadowMap，不拥有来源几何。

## 局部 GPU 流体

ADR-0187：`SceneGISFluidPrimitive` 是独立于 GPU 粒子特效和 FFT 水面的原生图元。
PBF 求解、排序网格邻域、密度约束与局部盒碰撞全部驻留 GPU；禁止常规帧 CPU 粒子回读。
固定容量与固定步长，超出追赶预算丢弃时间；布局不可变，控制项和刚体放置可以更新。
球面 ENU 与平面米制共用局部状态；物理碰撞不使用屏幕深度替代。

连续液面在 owned WaterFrame 的可选 `_prepareWaterSurface` hook 中重建；复用现有
opaque HDR / linear depth 捕获、世界光照、天空反射与 SSR，不新增 upstream seam。
图元拥有求解和屏幕目标；Scene 拥有被借用的场景输入。最终液面写真实深度和 TAA/final-depth。
首版限定相机在液体外、屏幕空间前层、简单盒容器，不支持透明递归折射或任意网格碰撞。

## 静态网格体素化

ADR-0198 批准独立静态网格体素化与精确 owned Worker entry `SceneGISVoxelizeWorker.js`。
算法位于 SceneGIS Core，复用原生 TaskProcessor/build，不从屏幕深度推断实体。
表面保守占据与网格封闭区域填充分开；显式米制网格、预算和 caller-owned 输出可以被风场等消费者复用。

`SceneGIS3DTilesVoxelizer` 按显式区域和源 geometricError 主动加载静态瓦片，独立于显示相机。
SGP-0072 只增加原生请求与静态三角形访问的两个窄小缝隙，复用加载、解码、缓存和实例变换。
网格格宽与源 LOD 误差分别配置；缺失或不支持的内容中止完整结果，不当作空域。
读取是一次性几何快照，输出所有权属于调用方；不改变源 tileset 或 SDK 的生命周期。
公开接口、填充限制和 SDK 接入见 [StaticVoxelization.md](StaticVoxelization.md)。

## 局部城市空气流动

ADR-0197 增加独立 `SceneGISWindSimulation`，局部米制等距立方网格的 WebGL2 D3Q19 MRT
与 Smagorinsky LES；不复用 PBF 液体物理。一个 producer 拥有固定物理步长和 GPU 场，
normal-render 按 frame number 去重；显示、拾取和阴影不得推进求解。预算限制步数，
不得隐式改变黏度或物理时间步。Globe ENU / Planar 只通过刚性放置区分。

GPU 消费者借用明确布局、格心位置、米制速度、版本和所有权的 live descriptor；
不得每帧回读完整场、重建 Voxel metadata 或读取任意场景对象的私有几何。
静态障碍必须显式输入。显式挤出多边形按格心生成掩码；物理边界和独立的守恒示踪输运
由 producer 固定步长调度。公开 sampling adapter 与显示组件借用同一 GPU 场；少量查询
使用原生 PBO/fence。体渲染按不透明深度截断，透明表面不作为体积遮挡物。
粗网格交互 LES 不构成工程定量精度声明，必须独立验证网格、边界与实验数据。
