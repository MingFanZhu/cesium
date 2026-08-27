# ADR-0046：Dual-world Volumetric Cloud Core

## 状态

- Status：`accepted with Globe-first amendment; A4-G Architecture and owner gates passed; local checkpoint`
- Date：`2026-08-15`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-15-phase-a4-volumetric-cloud-core.md`
- Related patch：active `SGP-0008`（consume only）
- Builds on：ADR-0040、ADR-0041、ADR-0042、ADR-0043、ADR-0044、ADR-0045

## 上下文

A1-A3已经形成一个caller-owned、default-disabled的dual-world linear-HDR environment pipeline：advanced background先于ordinary geometry，
resolved color/depth之后再执行aerial perspective与height fog。A4需要在这个owner内增加真正有体积、可穿行、可从高空俯视的云层，而不是用
skybox、billboard、屏幕空间噪声或uniform color覆盖天空。

参考项目`yuwoniu03/cesium-clouds-atmosphere`把`three-geospatial`的云、大气和光晕组合移植到Cesium，但其运行时shader/asset fetch、
`PostProcessStage`串联、raw WebGL Beer Shadow Map和PBO TAA不符合SceneGIS的ownership、package与upgrade边界。原始
`three-geospatial/packages/clouds`证明shape/detail/weather volume、bounded primary/Sun raymarch、energy-conserving segment integration、
transmittance-weighted cloud depth和quality tier可以形成成熟的实时云核心；它也明确记录了temporal upscaling ghosting以及mean-depth在稀疏重叠云
上的误差。A4采用这些公开算法思想和风险证据，但不复制其shader或二进制资产，也不提前实现A5 shadows/god rays或A6 temporal history。

## 决策

### Public contract

`SceneGISEnvironmentEffects`增加以下constructor option与同名writable property：

| Property             |    Default |                Range / values | Meaning                                                           |
| -------------------- | ---------: | ----------------------------: | ----------------------------------------------------------------- |
| `showClouds`         |     `true` |                       boolean | 独立启用cloud core；global `enabled`仍default `false`             |
| `cloudQuality`       | `"medium"` | `"low"`, `"medium"`, `"high"` | 固定resolution/ray-step预算，不是shader permutation               |
| `cloudCoverage`      |     `0.45` |                      `[0, 1]` | weather remap后的global coverage bias                             |
| `cloudDensity`       |    `0.001` |                   `[0, 0.01]` | 每米extinction scale                                              |
| `cloudBaseHeight`    |   `1500.0` |               `[-500, 20000]` | 相对world reference ground的云底米制高度                          |
| `cloudThickness`     |   `4500.0` |                  `[0, 20000]` | single deck厚度；`0`产生identity                                  |
| `cloudWindDirection` | `0.785398` |                   `[-pi, pi]` | 从world/local North顺时针的切平面advection方向                    |
| `cloudWindSpeed`     |     `20.0` |                    `[0, 200]` | texture-domain advection的米每秒速度                              |
| `cloudTime`          |      `0.0` |   `[-1000000000, 1000000000]` | caller-owned simulation seconds；允许seek/倒放，不读取system time |
| `cloudRadianceScale` |     `48.0` |                     `[0, 64]` | solar-normalized cloud到scene-linear HDR的公开校准                |

所有数值必须finite。Setter只更新uniform/quality source并在active、connected且值实际变化时`requestRender`；不得触发asset fetch、shader compile、
generation replacement或program/texture重建。`cloudQuality`可在下一次需要cloud pass时failure-atomically resize lazy cloud FBO，但不得重建program或
static volume texture。`cloudTime`由caller或Test明确驱动；runtime不注册timer、listener或permanent render loop，也不从wall clock生成第二时间
authority。Large time在CPU侧按asset tile period稳定wrap后再上传，保持seek determinism与float精度。

A4只提供一个可配置cloud deck。Multiple authored layers、local weather editor、precipitation和public scattering/powder/debug参数不进入A4；若后续
有真实产品需求再独立决策。

### Dual-world cloud geometry and motion

- Globe使用A2 virtual-sphere/ellipsoid reference adapter。Cloud support是`bottomRadius + cloudBaseHeight`到
  `bottomRadius + cloudBaseHeight + cloudThickness`的spherical shell；ray intersection、height fraction与local radial normal均不得读取
  `Camera.positionCartographic`或按position magnitude猜world。
- Planar使用registered world fixed `+Z`与explicit base Z。Support是
  `[baseZ + cloudBaseHeight, baseZ + cloudBaseHeight + cloudThickness]`的exact slab。
- Perspective从camera origin发射ray；Orthographic使用A2 per-pixel local origin。Resolved geometry distance裁剪cloud march；在geometry前的云可见，
  geometry前方之外的云不覆盖近物体。Ground、inside deck、above deck、120 km/space looking down与nonintersecting ray均需明确fixture。
- Globe advection在每个sample的stable local East/North tangent basis中解释direction；极区必须使用deterministic fallback basis。Planar直接使用
  `+X East/+Y North`。两者共享公开速度/方向/时间语义但不要求相同纹理坐标或pixel output。
- Underground/invalid reference frame继续fail closed；不得为云建立virtual planar radius或把planar伪装成Globe。

### Density assets and deterministic generation

A4在`packages/engine/Source/Assets/SceneGIS/Environment/CloudCore/`提交SceneGIS独立生成的little-endian原始texture bytes：

| Asset            | Format | Dimensions |     Bytes | Contract                                                        |
| ---------------- | ------ | ---------- | --------: | --------------------------------------------------------------- |
| `shape.bin`      | RGBA8  | `64x64x64` | 1,048,576 | tileable Perlin-Worley base与Worley octave channels             |
| `detail.bin`     | RGBA8  | `32x32x32` |   131,072 | tileable high-frequency erosion/detail channels                 |
| `weather.bin`    | RGBA8  | `32x32x32` |   131,072 | tileable low-frequency coverage/type/density modulation         |
| `blue-noise.bin` | R8     | `128x128`  |    16,384 | static deterministic spatial ray-start dither；A4没有temporal维 |

总binary payload固定为`1,327,104 bytes`。同目录的`PROVENANCE.json`记录generator version、seed、算法/文献、dimensions、channel语义、byte order、
bytes与SHA-256；不得记录本机路径。`scripts/scenegis/`提供explicit-output、atomic-write的deterministic generator、`--verify-only`与Node tests，
必须能在独立target完整重生成并byte-compare。测试覆盖periodic tileability、nonconstant/distribution、channel range、packing round-trip、tamper与rollback。

计划不复制`three-geospatial`或参考Cesium仓库的binary、GLSL或JavaScript。若Execution发现必须改编第三方source，必须先停止并提交Architecture
discussion；Architecture完成逐文件provenance/license决定后才能继续，且需附对应完整license/attribution。

### Density, lighting, and bounded raymarch

Cloud density由weather、shape、detail与normalized deck height profile组合，所有remap都必须finite、bounded并可在CPU reference复现。低密度区域先
采weather/shape执行empty-space skip；命中后才采detail。每个非空segment使用Beer-Lambert与energy-conserving analytic integration：

```text
stepTransmittance = exp(-extinction * stepLength)
scatteringIntegral = radiance * (1 - stepTransmittance) /
                     max(extinction, epsilon)
accumulatedRadiance += accumulatedTransmittance * scatteringIntegral
accumulatedTransmittance *= stepTransmittance
```

Primary march、Sun optical-depth march和approximate multiple-scattering octave均compile-time bounded。Quality contract固定为：

| Quality  | Cloud buffer scale | Primary max steps | Sun max steps | Detail |
| -------- | -----------------: | ----------------: | ------------: | ------ |
| `low`    |            `0.375` |                32 |             2 | off    |
| `medium` |             `0.50` |                48 |             3 | on     |
| `high`   |             `0.75` |                64 |             4 | on     |

所有tier的in-medium ray distance上限为`300 km`，accumulated transmittance `<= 0.01`时early terminate。Quality只改变uniform loop上限、detail flag和
lazy FBO dimensions；不得产生shader variant。Static blue-noise只打散ray start，固定camera/time/quality的输出必须deterministic；A6前禁止
frame-index jitter、reprojection或history。

Lighting使用A2同world的Sun transmittance与irradiance LUT，single Sun optical-depth march、fixed dual-lobe Henyey-Greenstein phase、bounded
multiple-scattering approximation及sky ambient。`cloudRadianceScale`只乘最终intrinsic cloud radiance。A4不生成Beer Shadow Map、不修改scene
shadow、不向ground投云影、不计算crepuscular rays；这些属于A5。

### Pass graph, buffers, and composition

A4继续只消费A1 `SGP-0008`的resolved linear-HDR delegation，不修改`Scene.js`。现有private single-Scene owner增加一个internal cloud pass：

1. advanced background正常写入A2/A3 sky；ordinary geometry完成并resolve color/depth；
2. 当`showClouds=true`且support非空时，以resolved depth裁剪并执行one low-resolution cloud raymarch command；
3. 现有full-resolution linear/log aerial command depth-aware upsample cloud buffers，先保持A2 atmosphere、再保持A3 fog，最后合成cloud；
4. 结果继续交回Cesium display transfer/bloom authority。

Cloud pass使用linear与`LOG_DEPTH_READ_ONLY`两个program，复用现有fullscreen VA。新增one lazy `FramebufferManager`，
`colorAttachmentsLength=2`且两个attachment均RGBA16F：

- attachment 0：premultiplied intrinsic scene-linear cloud radiance RGB与cloud transmittance A；
- attachment 1：transmittance-weighted mean distance、front distance、low-resolution resolved scene distance与validity。

现有full-resolution aerial FBO/program负责最终composite，不新增cloud resolve program。Upsample必须使用full/low scene distance与front distance执行
deterministic depth-aware selection，防止cloud跨geometry edge泄漏。`ContextLimits.maximumDrawBuffers`与
`maximumColorAttachments`都必须至少为`2`；不满足时advanced controller按现有capability error/retry contract fail closed，不静默改成错误的
single-target encoding。

Composition把cloud看作premultiplied overlay，使用mean distance近似A2/A3到云的介质：

```text
opacity = 1 - cloudTransmittance
cloudOptical = cloudRadiance * atmosphereTransmittanceToMean +
               atmosphereRadianceToMean * aerialRadianceScale * opacity
cloudOptical = cloudOptical * fogTransmittanceToMean +
               fogInscatteringToMean * opacity
sceneFinal = existingAtmosphereFogScene * cloudTransmittance + cloudOptical
```

`showAerialPerspective=false`时cloud atmosphere-to-mean为identity/zero；`showHeightFog=false`时cloud fog-to-mean为identity/zero。Clear-depth scene
已经包含background，cloud composite不得把A2/A3再次应用到background。`showClouds=false`必须保持A3 raw-half exact identity；cloud-only时仍执行
HDR composite但不得改变input alpha。最终RGB只经过一次ADR-0043 RGBA16F guard。

Transmittance-weighted mean distance是Frostbite/three-geospatial采用的bounded approximation。A4保留front distance与diagnostic以暴露稀疏远近云
重叠误差；不得通过模糊、hidden clamp或Test-only参数掩盖。如果默认内容出现明显错误层序或halo，A4必须停止，而不是偷带A6 temporal方案。

### Ownership, lifecycle, and resource ceiling

- Cloud四个asset随现有candidate generation异步加载；所有buffer decode、四个texture、两个program和MRT FBO candidate完整成功后才能发布。旧
  current generation在失败期间保持可用；late resolve/reject、retry、disconnect和destroy exactly-once沿用A2/A3。
- Global disabled或所有`showAtmosphere/showAerialPerspective/showHeightFog/showClouds`均false时继续零attachment、fetch、GPU resource和command。
  Candidate一旦warm publication，单独`showClouds=false`保留资源但不执行cloud command；重新启用不fetch/compile。
- 相对A3的active resource ceiling是：program `+2`、lazy FBO `+1` with two color textures、static texture `+4`、internal command `+1`；VA、
  full-resolution aerial FBO与A2 LUT全部复用。无listener、timer、external request、raw GL、PBO、history或第二Scene slot。
- Medium 1920x1080 cloud MRT约`8,294,400 bytes`，high约`18,662,400 bytes`；4K medium约`33,177,600 bytes`，high约
  `74,649,600 bytes`，另加`1,327,104 bytes`static cloud texture。Specs/verifier必须按actual dimensions与RGBA16F bytes精确核算。
- Resize或quality FBO allocation失败不得替换last-good cloud target；Context destruction和Controller destroy必须释放exact ownership且不销毁
  caller/native resource。

## 不采用的方案

### 直接移植参考仓库pipeline

不采用。其runtime shader/asset fetch、PostProcessStage ordering、raw WebGL BSM、PBO TAA和外部runtime dependency违反现有SceneGIS contract。

### Full-resolution或temporal cloud core

不采用。没有A6 temporal时full-resolution 64-step默认成本过高；在A4提前建立history又会把seek、camera reset、disocclusion和dynamic resolution
混入本阶段。A4使用固定低分辨率MRT与depth-aware spatial upsample，并把temporal稳定留给A6。

### Screen-space fake clouds或ground shadow

不采用。Screen-space noise不能正确处理inside/above/space与geometry depth；ground shadow/BSM会扩大pass与资源并属于A5。

## 验证与manual gate

- Public Specs覆盖十个property的defaults、范围/type、warm/same-value/inactive/disconnected request semantics、type declarations/API docs与installed
  package old/new-name exact delivery。
- Generator tests覆盖独立target full regeneration、hash/bytes、tileability、distribution、packing、tamper/rollback与`--verify-only`；browser/network
  smoke只允许package-local asset URL。
- CPU/shader fixtures覆盖Globe shell、Planar slab、all camera positions/frusta、resolved-depth clipping、density/profile、energy integration、Sun march、
  mean/front depth、quality loop上界与static deterministic dither。
- Real-Context/raw RGBA16F fixtures覆盖linear/log、Perspective/Orthographic、day/sunset/night、ground/inside/above/space、clear/near/far geometry、feature
  isolation、calibration isolation、alpha、resize/candidate/destroy/failure atomicity和exact resource counts。
- Direct Test必须提供independent cloud-only/combined diagnostics、三档quality、全部public controls、time seek、dual-world presets与结构化delta ROI。
  Default day/ground sky ROI的cloud delta changed fraction必须在`[0.08, 0.85]`，max RGB delta至少`16`，delta standard deviation至少`2`；这只防
  identity或uniform washout，不代替visual judgment。Known near geometry在云前的max delta不超过`1`，far geometry在云后的max delta至少`8`；
  lower-center near-ground ROI不被云替代。固定camera/time重复帧保持byte stable，`cloudTime`变化产生可测非identity motion。
- Day/sunset/night均finite；sunset相对day产生可测暖色shift，night cloud radiance低于day且不使用hidden fallback。120 km/space looking-down相交
  shell/layer可见，不相交ray identity。
- 回归A1 slots/reference frame、A2/A3 focused/raw-half、exact Scene aggregate、build/release/types/docs、installed package、两套LUT verify、local
  no-network Chromium、changed-scope lint/format、upstream/generated audit。Full suite不是默认要求，但review必须记录未运行边界。
- Architecture/code review通过后，project owner在live dual-world Test执行manual visual gate。数值阈值不能覆盖“云平、噪、闪烁、halo、地表被
  覆盖、inside/space不可信”等视觉失败。

## 停止条件

如果默认云呈uniform slab/full-screen washout、明显覆盖前景地表、mean-depth导致可见错误层序、spatial upsample出现明显geometry halo、静态dither在
motion中不可接受、medium预算不能在代表性桌面设备完成稳定交互、MRT/capability不足、需要第二upstream seam、需要external/runtime source fetch，或
必须提前实现shadow/temporal才能达到owner-acceptable core，Execution必须停在A4并提交Architecture discussion。不得通过隐藏倍率、Test-only
参数、降级成billboard/skybox或偷带A5/A6来绕过gate。

## 参考

- [yuwoniu03/cesium-clouds-atmosphere @ `1f38602b`](https://github.com/yuwoniu03/cesium-clouds-atmosphere/tree/1f38602b84ab5c3f2bc289f9e4464df3db917155)
- [three-geospatial clouds @ `b012ad06`](https://github.com/takram-design-engineering/three-geospatial/tree/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/clouds)
- [Frostbite: Physically Based Sky, Atmosphere and Cloud Rendering](https://www.ea.com/news/physically-based-sky-atmosphere-and-cloud-rendering)
- [Guerrilla Games: Nubis — Authoring Real-Time Volumetric Cloudscapes](https://www.guerrilla-games.com/read/nubis-authoring-real-time-volumetric-cloudscapes)
- [Guerrilla Games: The Real-time Volumetric Cloudscapes of Horizon Zero Dawn](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn)
- [ADR-0040](ADR-0040-dual-world-advanced-environment-rendering.md)
- [ADR-0045](ADR-0045-dual-world-exponential-height-fog.md)

## 2026-08-26 project-owner gate revision trigger

Project owner在live dual-world Test明确拒绝当前A4画面：云体呈低质量噪声团块，缺少可辨识的多种云型，且Globe与Planar的opacity、luminance与
chromaticity差异过大。Architecture复现combined与cloud-only的medium/high画面后确认本ADR第203–205行停止条件触发；此前
`approved-for-owner-gate`结论撤销。

当前contract确实使用`sampler3D` shape/detail/weather，不是“没有3D纹理”。失败来自更深的三项边界：

1. `64³` shape、`32³` detail/weather与static `128²` shuffled-rank dither不足以替代reference的authored local weather、turbulence、
   spatiotemporal blue noise与temporal resolve；现有2×2 nearest depth selection使medium/high都保留明显block/grain。
2. 本ADR明确冻结single deck，`weather.g`只在一个height profile内插值，不能提供reference的multiple authored layers与独立
   altitude/height/density/shape/detail controls，因此无法形成cumulus、stratus、thin high cloud及mixed deck。
3. Planar infinite slab的near-horizontal support可在`300 km`cap内反复穿越weather tiles，而Globe ray受shell curvature约束；同时intrinsic
   cloud lighting直接消费两个不同A2 irradiance/transmittance LUT，尚无matched-probe radiometric normalization。Cloud-only画面已证明
   Planar白墙和Globe暗灰团块的差异发生在cloud core/composite内部，不是A3 fog或background washout。

任何修正若引入multi-layer public contract、reference-derived assets或temporal resolve，都必须先修订本ADR及A4 phase plan，明确license、
provenance、resource/history/reset与dual-world parity contract。Execution不得以增加steps、隐藏world-specific multiplier或Test-only preset绕过。

## 2026-08-26 A4R accepted revision

Project owner已明确批准A4R重新定界。本节覆盖本ADR中与`single deck`、static-only dither、禁止temporal history及把所有cloud temporal work留给A6
相冲突的旧条款；未被本节覆盖的A4 ownership、failure atomicity、A2/A3 composition、caller-owned time、A5 shadow/god-rays边界与upstream边界继续有效。

### Public morphology contract

- `SceneGISEnvironmentEffects`新增warm `cloudPreset` constructor option与同名writable property；默认`"cumulus"`，允许
  `"cumulus"`、`"stratus"`、`"cirrus"`和`"mixed"`。非法值抛出`DeveloperError`，same-value/inactive/disconnected/request-render语义与现有
  cloud properties一致。
- Preset选择private immutable layer descriptors，内部同时active的layer上限为`4`。`cumulus`、`stratus`和`cirrus`分别提供可辨识的low
  convective、low/mid stratiform与high thin morphology；`mixed`组合至少两个、最多四个不同altitude/profile/spectrum/motion layer。
- 现有`cloudBaseHeight`、`cloudThickness`、`cloudCoverage`、`cloudDensity`、wind与time继续作为整个preset的caller-owned global modifier；不得把
  mutable layer array、shader-internal scattering knobs或world-specific preset暴露为public API。
- Globe与Planar必须消费相同preset descriptor与物理单位。World adapter只能改变shell/slab intersection和local frame，不能选择不同asset、颜色、
  density multiplier或隐藏形态。

### Asset and reconstruction authority

- A4R允许替换原CloudCore binaries与generator，并允许增加local weather、turbulence/vector noise和真实spatiotemporal blue-noise资产；cloud static
  texture总数上限为`6`。Shape/detail/weather/turbulence/STBN的dimensions、format、channel semantics、spectral evidence、bytes与SHA-256必须在
  implementation前写入phase plan，随后由exact importer/generator、license和`PROVENANCE.json`冻结。
- 可评估本ADR固定commit的reference repository或`three-geospatial`资产/算法，但逐文件license、copyright与provenance必须先验证。不能从仓库级
  license推断binary asset可复制；authority不清晰时停止并回报，改用SceneGIS-owned deterministic generator或明确许可的替代资产。
- Spatial resolve至少执行depth/front-aware bilateral reconstruction，同时处理radiance、transmittance与cloud depth，不能继续从`2x2`邻域只选择一个
  `texelFetch`。`high`相对`medium`必须增加可测的detail/edge frequency并减少block/grain，而不只是增加step count。
- A4R正式拥有最小cloud-only temporal upscaling/history，不再等待A6。允许相对当前A4最多新增linear/log resolve programs各一、one resolve
  command，以及two ping-pong full-resolution history framebuffer managers；每个history target最多two RGBA16F attachments，分别保存resolved
  premultiplied radiance/transmittance与cloud depth/front/validity。不得增加VA、upstream hook、raw GL、PBO、listener、timer或permanent render loop。
- History只由成功rendered cloud frame推进。Camera cut或projection/world/reference-frame变化、viewport/quality/preset/support变化、asset generation
  replacement、enable/disable、connect/disconnect、retry、context loss/destroy以及non-continuous `cloudTime` seek必须exact invalidate；invalid history的
  first frame等价于spatial-only resolve。Late generation或allocation failure保持last-good generation/history且不得泄漏candidate resources。
- A6保留stack-wide temporal optimization、dynamic performance policy和跨effect stabilization；不得重复建立与A4R不兼容的第二cloud history authority。

### Dual-world optical and radiometric parity

- Density、extinction、single/multiple-scattering source与Sun/sky incident terms先进入world-neutral cloud radiometric contract，再由Globe/Planar adapter
  提供几何和A2 atmosphere inputs。两个A2 LUT输出必须显式转换到该contract的同一scene-linear单位；禁止hidden per-world RGB、opacity或radiance
  multiplier。
- Planar不得让near-horizontal ray无限重复weather tile直至形成opaque wall。Execution必须采用有公开文献/参考实现依据的finite meteorological
  visibility domain、far-cloud LOD/horizon transition或等价bounded rule，并对Globe使用同一距离/可见度语义；具体公式、距离与能量守恒证明在实现前回写
  phase plan。`300 km`只可作为hard safety cap，不能成为默认可见云光程。
- Matched local-frame raw fixtures锁定同一layer descriptor、height fraction、Sun zenith、segment length与incident solar/sky input，分别报告density
  integral、Sun optical depth、source radiance、transmittance、front/mean distance。相同输入下两世界density integral与transmittance相对差不超过
  `2%`，intrinsic cloud luminance相对差不超过`10%`，CIE xy距离不超过`0.02`；final scene可以因真实world geometry与atmosphere path不同而不同。

### A4R closure gate

- Asset tests必须报告shape/detail/weather/turbulence/STBN的periodicity、slice、histogram与spatial/temporal spectrum；fixed camera/time保持deterministic，
  camera motion下没有固定屏幕grain、crawl或history ghost trail。
- 四个preset都要在both worlds证明独立altitude/support、vertical density profile、macro coverage、detail spectrum和motion。相同preset必须属于同一
  morphology family；`cumulus`/`mixed`保留可辨识sky gaps，`stratus`不得退化成full-height opaque wall，`cirrus`保持高薄层语义。
- Spatial/temporal resolve在geometry edge保持max delta `<=1`且无halo；history reset矩阵逐项证明first frame spatial-only、second valid frame开始累积，
  resize/failure/destroy没有resource leak。
- Direct Test提供四preset、三quality、cloud-only/combined、temporal on/off diagnostic，以及day/sunset/night × ground/inside/above/space ×
  Perspective/Orthographic both-world matrix。Owner gate必须同时检查静帧材质、运动稳定性、多云型差异、inside/above/space可信度和Globe/Planar
  opacity/color一致性；数值门槛不能替代project-owner视觉判断。
- `A4-AR-007..009`全部通过Architecture独立review且新的project-owner live visual gate明确通过后，才允许A4 checkpoint与A5 activation。

### A4R history and quality clarification

- History identity必须覆盖已写入attachment的radiance scale以及完整camera/frustum/A1 reference frame。Reference-frame数值进入key前使用固定有界
  canonicalization，过滤同一camera/frame重复计算产生的sub-picometer/sub-`1e-12`方向roundoff，但真实camera/frustum/reference-frame变化仍必须invalidate。
  Invalid frame输出spatial-only；stationary frame直接发布current spatial color/distance，不采样或再次量化previous history。Continuous moving-time frame才使用EMA，
  且compatibility必须同时拒绝invalid validity、front/mean/scene-depth、transmittance或radiance不一致的history；geometry/material authority变化不能泄漏旧云。
- Preset morphology可在private immutable descriptor内分别冻结shape/detail scale、erosion/profile、weather response和lighting contrast，只要两world
  使用同一descriptor与单位，且不改变public density/default或引入world multiplier。
- Depth/front-aware bilateral reconstruction可根据cloud-resolution/full-resolution ratio选择固定spatial kernel：high使用较窄kernel保留增加的
  edge/detail frequency，medium/low使用较宽kernel抑制低分辨率alias。该选择不得增加resource/pass或替代temporal reset contract。
- Shape/detail/turbulence的power-of-two Texture3D必须生成完整mipmap并使用trilinear mip sampler；density sampling按ray footprint与distance显式选择LOD。
  Primary loop使用固定上限coarse occupancy skip，只有occupied interval进入固定上限fine march；不得让所有pixel无条件执行maximum fine budget。
- Direct Test的fixed-history criterion以cloud-owned raw RGBA16F color/distance attachments为authority；foreign FXAA、ordinary geometry和background必须
  在`try/finally`隔离并恢复。Startup lighting必须通过同一preset function同时初始化label、Globe clock与Planar Sun，不得把未执行的button状态当作day。

## 2026-08-27 A4-AR-026 solar-normalized cloud radiance calibration

Project-owner再次拒绝`A4-AR-025`后，Architecture按本ADR冻结的两个MIT reference commits完成source/equation audit。Execution随后在shared core中重建
normalized dual-HG、eight-octave phase-preserving solar scattering、`1/(4*pi)` density-weighted sky source与local-extinction powder。Actual-GPU/CPU
equation、phase integral、incident separation和旧公式mutation均通过；Architecture接受这组source equations，禁止再通过component rebalance改变其能量分配。

### Unit boundary and default correction

- Cloud core消费的Sun incident是A2 transmittance，sky incident是A2 irradiance逐channel除以`SCENEGIS_SOLAR_IRRADIANCE`；二者属于同一
  solar-normalized、dimensionless transport domain。不得重新乘入`SCENEGIS_SOLAR_IRRADIANCE`、Sun solid angle、background scale或world-specific factor。
- `cloudRadianceScale`是该solar-normalized cloud result到Cesium scene-linear HDR的唯一显式校准。它只乘最终premultiplied intrinsic cloud RGB；不得
  改变cloud transmittance、front/mean distance、A2/A3 input、density或source component equations。
- Public default由`1.0`修正为`10.0`是A4-AR-026的历史校准closure；A4-AR-030 amendment现仅覆盖最终public default，不改变该次unit/linearity证据。
  Property仍不与`backgroundRadianceScale`耦合；任一property变化都不得影响其他pass。`aerialRadianceScale`继续保持`1.0`，因为ADR-0044已证明
  geometry aerial在`10.0`下会wash out。
- `cloudRadianceScale=1`保留为reference-equation diagnostic authority；默认产品与owner reproduction使用A4-AR-030校准后的`48`。不得添加hidden final multiplier、
  cloud-only exposure/ACES/gamma/tone mapping、white tint/clamp或Test-only product path。Cesium仍是唯一display-transfer authority；ADR-0043
  `65504` guard仍只是RGBA16F storage guard。

### Required implementation evidence

- Constructor/JSDoc/public Specs与`Test/高级环境.html`默认值同步为`10.0`；range、setter、request-render、history identity及warm-resource语义不变。
- Actual RGBA16F fixture覆盖scale `0/1/10`：RGB相对scale近似线性，scale `0`为zero intrinsic radiance，同时transmittance与distance half bits exact不变；
  Globe/Planar及linear/log variants均不得交叉响应background/aerial scales。
- 保留scale `1`的A4-AR-026 component与contrast证据，并在default `10`下重跑canonical与owner-exact fixed views。报告active-pixel
  p10/median/p90、normalized interdecile contrast、finite/max值、Sunset warmth与night zero；raw forward HDR大于`1`不是clipping，但任何channel命中
  `65504`、display出现uniform white slab或内部阴影消失都失败。
- Focused controller、A1 pipeline、changed-scope lint/format、Markdownlint、`git diff --check`、ownership/generated/resource audit通过后，返回
  Architecture独立复审。Project-owner visual gate、A4 checkpoint、commit/push与A5在复审前继续blocked。

### Execution evidence — 2026-08-27

Execution按上述boundary把constructor/JSDoc/Test default同步为`10.0`，未修改accepted cloud source equations。Actual compiled Globe/Planar
linear/log RGBA16F fixture覆盖scale `0/1/10`并证明intrinsic RGB linear、scale-zero exact、transmittance与distance/front/validity half-bit invariant；
background/aerial calibration不会改变raw Cloud MRT，cloud calibration也不会改变A2 inputs或其他calibration values。Default-10 live matrix全部finite，最大
premultiplied RGB=`3.1328125`，未触发`65504` guard；sunset保持`R>G>B`且no-moon night exact zero。Focused controller与A1 pipeline合计
`68/68 SUCCESS`。这些结果构成Architecture re-review candidate，不授权owner gate、checkpoint、commit/push或A5。

## 2026-08-27 Globe-first A4-G amendment

Project owner rejected the retained A4 candidate when Planar exponential height
fog and volumetric clouds produced a large white background region and incorrect
layering. The visual evidence revokes the dual-world owner gate but does not prove
whether the fault is in fog, cloud resolve, depth, texture orientation, or final
composition. The Planar root cause is therefore deferred rather than guessed.

This section supersedes the earlier A4/A4R closure requirements where they demand
simultaneous Globe/Planar delivery:

- A4-G accepts only Globe ellipsoid-shell geometry, radial atmosphere/fog height,
  reference-derived cloud density/lighting, atmosphere irradiance skylight, and
  integrated linear-HDR composition.
- The fixed Cesium reference
  `yuwoniu03/cesium-clouds-atmosphere@1f38602b84ab5c3f2bc289f9e4464df3db917155`
  is a preferred implementation source for Globe algorithms and legally audited
  assets. The upstream three-geospatial source remains the provenance authority
  where the fork derives from it.
- File-level MIT/copyright/provenance and binary channel/format audits are required
  before adoption. Unclear binary provenance remains a stop condition.
- SceneGIS must translate the reference feature graph into `SGP-0008` and Cesium
  Renderer ownership. Raw `_gl`, PBO, runtime public-network fetch, public
  postprocess product stages, and cloud-local/double tone mapping remain forbidden.
- Existing Planar code is frozen. No matched-world radiometric gate, Planar owner
  screenshot, or Planar correction is required or authorized in A4-G.
- A4-G closure requires independent Architecture review and an explicit
  project-owner Globe visual pass. Only the resulting checkpoint may activate
  A5-G cloud shadow, shared skylight, and crepuscular-ray planning.

The final extension remains dual-world; Planar adaptation begins only after the
complete Globe track is qualified. `A4-AR-028` records this owner-gate failure and
phase supersession.

## 2026-08-27 A4-AR-030 Globe visual calibration amendment

Project-owner rejected the technically correct A4-G candidate because sunlit
Globe clouds remained too grey and distant structure remained too soft. This
amendment supersedes the A4-AR-026 product-default value and its default-specific
evidence matrix, but not its solar-normalized units, linearity, source equations
or scale-`1` diagnostic authority.

Architecture ran the fixed reference and SceneGIS sweeps. The reference's visible
white result combines `sunIntensity=20`, `cloudExposure=3` and a cloud-local ACES,
gamma and magenta correction. SceneGIS must not copy that local display transfer:
Cloud MRT remains premultiplied scene-linear HDR and Cesium's global PBR Neutral
stage remains the sole display-transfer authority.

The accepted calibration is:

- Public `cloudRadianceScale` default is `48.0`; finite range remains `[0,64]`,
  and the property remains the sole exact linear multiplier of intrinsic
  premultiplied cloud RGB. Scale does not affect transmittance, distance,
  validity, A2 inputs, other calibration properties or resource generation.
- Private Globe macro scale is `0.25`, yielding preset macro periods
  approximately `2.5–7.5 km`; no Planar density scale or public morphology
  property is added.
- Private Globe footprint LOD factor is `0.5`. Reference-like `0.35` is rejected
  for the current bounded SceneGIS march because it adds little interior
  high-frequency energy over `0.5` and exposes ray-aligned banding under low Sun.
- Accepted Sun/sky adapters, dual-HG and eight-octave transport, local powder,
  Beer-Lambert integration, WGS84/cube mapping, assets, occupancy, depth,
  composition and history ownership remain unchanged.

The A4-G Test owner gate must use location-aware lighting evidence. At longitude
`15 degrees`, geodetic latitude `45 degrees`, the fixed inputs are high-Sun day
`2026-06-21T10:30:00Z` (measured local elevation `67.484 degrees`), sunset
`18:30:00Z` (`2.175 degrees`) and no-moon night `22:00:00Z`
(`-20.120 degrees`). Generic dual-world presets remain available. A low-Sun
warm cloud is physically valid and must not be relabeled as a noon-white gate.

Implementation evidence covers raw RGBA16F scale `0/1/48`, exact non-RGB
attachment invariance, finite/storage safety, forward HDR, internal
spatial-frequency gain for LOD `0.5`, stable replay, and actual final-scene PBR
Neutral output at equator/45-degree ground/above high-Sun/sunset/night
cloud-only/combined states. A premultiplied cloud-local ACES approximation is not
valid evidence. The shared Planar controller inherits the explicit public default
only; no Planar visual correction or acceptance is implied.

### A4-AR-030 execution evidence

Execution implemented the amendment without changing the accepted transport
equations. The compiled Globe source retains macro scale `0.25`, uses footprint
LOD scale `0.5`, and the constructor/JSDoc/Test/package contract now defaults
`cloudRadianceScale` to `48.0`. The focused actual-GPU fixture measures source-
luminance gradient, Laplacian and 3x3 high-pass energy only inside a fully active
cloud neighborhood; all three metrics for LOD `0.5` exceed LOD `1.0` by the
required material threshold. The prior cloud-local scalar ACES calculation was
removed from the Spec.

Actual RGBA16F `0/1/48` execution in Globe/Planar and linear/log variants proved
zero RGB at scale zero, half-float-aware `48x` linear RGB, exact alpha and full
distance/front/max/validity bit invariance, complete finite/bounded attachments,
stable A2 inputs and storage safety. Final display evidence came only from the
real Cesium PBR Neutral scene. At `15 degrees E / 45 degrees N`, measured solar
elevations were `67.484`, `2.175` and `-20.120 degrees` for the three fixed
inputs. No public range, resource, pass, program, texture, FBO, history, asset,
GPU-byte or Planar-specific formula changed.

Architecture independently accepts this product implementation and its raw GPU
authority. A separate `A4-AR-031` Test evidence repair is required before the
project-owner gate: the A4-G preset grid must use the explicit Globe owner state
instead of the generic dual-world artifact mode, and final display replay must
distinguish exact raw attachment identity from bounded one-LSB display
quantization/dither. This evidence correction does not reopen any product value,
equation, API or resource decision in this ADR.

The A4-AR-031 grid ownership repair is accepted. Architecture later withdrew
the strict multi-frame raw-attachment replay requirement from `A4-AR-032` after
independent runs showed two exact raw phases while the final display remained
inside the already accepted one-LSB stability bound. Raw bit identity is useful
for focused GPU Specs, but it is not a project-owner visual contract and must
not drive repeated convergence, phase selection, hash matrices, or product
changes. The Test owner evidence therefore uses one atomic same-frame display
and raw capture per explicit state, reports finite/bounds and visible quality
summaries, and retains immutable Globe-state plus Planar-isolation checks. This
evidence simplification does not reopen any accepted product decision.

Architecture independently accepted the final direct evidence path: a disabled
or not-ready controller reports `valid=false`, while an enabled/ready high-Sun
capture reports `valid=true` only with available, finite, bounded and
storage-safe raw Cloud MRT plus an unchanged owner state. `A4-AR-032` is closed.
