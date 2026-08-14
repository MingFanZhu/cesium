# ADR-0040：球面/平面统一的高级环境渲染管线

## 状态

- Status：`approved`
- Date：`2026-08-14`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-phase-a1-render-foundation.md`
- Related patch：active `SGP-0008`
- Constrains：ADR-0030、ADR-0033、ADR-0034、ADR-0036、ADR-0039

## 上下文与源码事实

目标效果包括 Bruneton-style precomputed atmosphere、aerial perspective、exponential height fog、volumetric clouds、cloud
shadow、crepuscular rays 与 HDR lens flare。它们不是互相独立的LDR滤镜：sky/cloud/fog共享Sun、transmittance与participating
media，geometry aerial perspective依赖resolved depth，bloom/lens flare需要linear-HDR亮度。

Cesium 1.144 的`Scene.renderEnvironment`在ordinary geometry前绘制native environment；`SGP-0003`只给non-Globe primary
World提供一个environment command slot。`Scene.resolveFramebuffers`在geometry、OIT与translucent classification之后取得resolved
color/depth texture，再调用`PostProcessStageCollection.execute`。后者顺序是AO、built-in bloom、auto exposure、tone mapping、
custom stages、FXAA；因此public custom stage位于tone mapping之后，不能作为统一HDR atmosphere/cloud入口。

Native `SkyAtmosphere`以ellipsoid shell与radial height工作；native `Fog`、`Camera.positionCartographic`及其automatic state保留
Earth/ellipsoid语义。ADR-0036的planar atmosphere则是固定`+Z` visual-grade fullscreen blend。Bruneton spherical equations不能仅
替换radius就成为无限planar medium。

参考原型`cesium-clouds-atmosphere`证明了LUT atmosphere、cloud raymarch、Beer shadow、temporal accumulation、aerial
perspective与lens flare可以组成效果链，但它直接访问`viewer.scene.context._gl`、自行持有WebGL framebuffer/texture/PBO、读取
Cartographic altitude并运行时下载约数十MB asset。该runtime结构不满足SceneGIS Context ownership、planar coordinates、
build/package delivery与failure atomicity。

## 决策

### Shared optical pipeline, separate geometry adapters

- 高级环境渲染建立SceneGIS-owned shared optical core，统一physical coefficients、Sun/time authority接口、LUT/noise resource、
  quality tier、HDR compositor与debug/qualification状态。
- Globe adapter显式使用live Globe Scene的ellipsoid center/radii、radial altitude、surface normal与atmosphere/cloud shell。
- Planar adapter显式使用live `SceneGISPlanarWorld`的`+X East/+Y North/+Z Up`、planar Z、explicit base height与layered
  atmosphere/cloud slab。不得从CRS、数值范围、ellipsoid identity或`Camera.positionCartographic`推断planar状态。
- 两种adapter必须提供同一capability family与units，但不要求pixel-identical或用同一几何积分式。Planar模型的近似与误差必须单独
  记录，不能宣称spherical Bruneton物理等价。

### Dual-stage Scene integration

新增独立`SGP-0008`，只修改`packages/engine/Source/Scene/Scene.js`并提供两个optional private delegation：

1. **Advanced background slot**：位于native environment work之后、existing `SGP-0003` primary-world hook之前。后续用于
   physical sky/Sun/cloud background；A1为identity，不发布command。
2. **Linear-HDR composite slot**：位于`resolveFramebuffers`取得resolved color/depth/id texture之后、
   `PostProcessStageCollection.execute`之前。Pipeline返回作为postprocess color input的texture；inactive/A1必须返回原texture。

这两个slot只在normal render及既有offscreen framebuffer路径成立；不得进入pick/shadow/classification语义。Existing OIT、MSAA、
globe-depth、AO、bloom、exposure、tone mapping、custom stages、FXAA与final copy顺序不变。Advanced profile后续要求HDR时必须显式
capability/fail-fast，不能把physical composite静默移到tone mapping之后。

`SGP-0008`不并入`SGP-0003`：后者只服务primary-world pre-geometry content，前者是同时覆盖Globe/planar且包含post-geometry HDR
composition的scene-wide effect slot，removal condition不同。A1不得修改`PostProcessStageCollection.js`。

### Attachment, ownership, and lifecycle

- A1建立private SceneGIS pipeline与显式attach/detach；每个live Scene最多一个。Public caller-owned Controller在A2有真实visual/
  asset/capability evidence后冻结，避免A1暴露无效果的空API。
- Scene只保存soft-private attached reference，不拥有caller/controller；detach采用conditional restore，foreign replacement不被覆盖或销毁。
- 所有未来GPU对象必须使用Cesium Renderer abstractions并属于单一`Context`和pipeline resource owner；禁止访问`context._gl`、raw PBO或
  让WebGL state跨Cesium command泄漏。
- Candidate texture/shader/FBO/history完整成功后才发布；compile、decode、resize、context mismatch或capability失败保留last-good或
  empty/retriable状态。Destroy exactly once。
- 默认disabled path不分配LUT/noise/FBO/history、不创建network/listener/timer，也不迫使request-render场景持续渲染。

### Time, native effects, and fallback

- 只消费Cesium Clock/ControllerHost明确传入的simulation time；cloud wind、temporal jitter与history reset不得读取system time。
- Globe advanced mode后续必须与native `SkyAtmosphere`、Fog、Sun bloom/body authority建立显式互斥或可恢复接管；不得默默双重合成。
- Planar advanced mode继续遵守ADR-0039的native-effect guard，并消费ADR-0033/0034发布的planar Sun direction；不得重新引入Earth
  automatic celestial direction。ADR-0036 simple planar atmosphere保留为lightweight/fallback，advanced mode不得无声明覆盖它。
- Advanced capability可以要求WebGL2、float/half-float 2D/3D texture与depth texture。Unsupported时返回明确capability/fallback状态；
  不能部分开启错误效果。

### Shader and asset delivery

- Shader source遵守ADR-0030，进入`packages/engine/Source/Shaders/SceneGIS/**.glsl`；相邻generated JS不提交。
- Runtime LUT/noise不得依赖公网URL或临时clone。采用offline generation还是audited预计算asset、尺寸/format/half precision/packing/
  compression、license/provenance与npm/root delivery由A2基于测量形成补充ADR或修订本ADR。
- 参考仓库及three-geospatial均只作为研究来源。任何derived实现必须保留合法license/provenance并以Cesium Renderer/SceneGIS lifecycle
  重写，不能把`three`、GUI或raw WebGL helper带入产品runtime。

## 不采用的方案

### 只添加多个public `PostProcessStage`

不采用。它们在Cesium 1.144默认位于tone mapping之后，无法保持physical HDR radiance、built-in bloom与depth-aware aerial/cloud
composition的正确顺序。

### 直接修改native `SkyAtmosphere`/`Fog`/`SunPostProcess`

不采用。这会扩大upstream diff、把Globe语义混入planar world，并使升级、fallback与caller ownership难以隔离。

### 把`SGP-0003`泛化为全部effects hook

不采用。`SGP-0003`只在pre-geometry primary-world environment pass执行，不能提供Globe scene-wide和post-geometry HDR阶段。

### 移植参考原型的raw WebGL pipeline与assets

不采用。Raw `_gl`、PBO/readback、运行时fetch、Cartographic altitude与第三方texture wrapper破坏Cesium Context state、planar semantics、
failure atomicity及package delivery；原始asset体量也不能未经预算成为默认交付。

## 上游补丁、升级与移除

`SGP-0008`登记`Scene.js`两个paired marker ranges，风险为high。任何需要`PostProcessStageCollection.js`、`View.js`、Renderer或第二个
upstream file的实现都必须停止并形成新的Architecture decision，不能扩写本SGP。

升级Cesium时复核：environment draw order、`resolveFramebuffers`的OIT/translucency resolve、globe/scene color/depth texture选择、MSAA
resolve、`PostProcessStageCollection`内built-in/tone/custom顺序、HDR强制offscreen条件、pick/offscreen callers与Scene destroy顺序。
当upstream提供等价的pre-geometry advanced environment与pre-tonemap resolved color/depth extensibility时，可退役`SGP-0008`。

## 验证

- A1 focused Specs锁定native environment → advanced background → primary-world environment → geometry，以及resolved color/depth →
  advanced HDR → built-in postprocess → final copy顺序。
- Pipeline absent/inactive/detach与A1 identity返回必须pixel-identical、零额外GPU allocation/command、resize/context稳定。
- Pick/offscreen、OIT、globe depth、MSAA、HDR和Perspective/Orthographic representative路径有real Context证据。
- Globe/planar reference-frame publication覆盖finite/candidate-last-good、result identity、高空/地面与坐标语义隔离。
- Official upstream audit只允许`Scene.js`/SGP-0008，generated status=`0`；后续每个visual phase另行增加pixel、asset、resource、performance与
  dual-world manual evidence。

## 参考资料

- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)：
  transmittance/scattering/irradiance LUT、multiple scattering、ozone、spectral-to-luminance与reference tests。
- [Sébastien Hillaire: A Scalable and Production Ready Sky and Atmosphere Rendering Technique](https://sebh.github.io/publications/egsr2020.pdf)：
  ground-to-space atmosphere、aerial perspective、可伸缩LUT与dynamic atmosphere参考。
- [Frostbite: Physically-based & Unified Volumetric Rendering](https://www.ea.com/news/physically-based-unified-volumetric-rendering-in-frostbite)：
  unified participating media、extinction volume与volumetric shadow参考。
- [Unreal Engine: Volumetric Cloud Component](https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-cloud-component-in-unreal-engine)：
  volume texture raymarch、ground-to-space cloud与atmosphere integration参考。
- [Unreal Engine: Exponential Height Fog](https://dev.epicgames.com/documentation/en-us/unreal-engine/exponential-height-fog-in-unreal-engine)：
  layered height density、directional inscattering与performance controls参考。
- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere)：用户指定的Cesium原型参考；
  Architecture检查commit=`1f38602b84ab5c3f2bc289f9e4464df3db917155`，只参考职责与效果链，不直接移植runtime/assets。
