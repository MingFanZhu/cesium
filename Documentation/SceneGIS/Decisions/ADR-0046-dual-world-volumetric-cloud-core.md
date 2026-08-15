# ADR-0046：Dual-world Volumetric Cloud Core

## 状态

- Status：`approved`
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

| Property             |    Default |                Range / values | Meaning                                                                |
| -------------------- | ---------: | ----------------------------: | ---------------------------------------------------------------------- |
| `showClouds`         |     `true` |                       boolean | 独立启用cloud core；global `enabled`仍default `false`                  |
| `cloudQuality`       | `"medium"` | `"low"`, `"medium"`, `"high"` | 固定resolution/ray-step预算，不是shader permutation                    |
| `cloudCoverage`      |     `0.45` |                      `[0, 1]` | weather remap后的global coverage bias                                  |
| `cloudDensity`       |    `0.001` |                   `[0, 0.01]` | 每米extinction scale                                                   |
| `cloudBaseHeight`    |   `1500.0` |               `[-500, 20000]` | 相对world reference ground的云底米制高度                               |
| `cloudThickness`     |   `4500.0` |                  `[0, 20000]` | single deck厚度；`0`产生identity                                       |
| `cloudWindDirection` | `0.785398` |                   `[-pi, pi]` | 从world/local North顺时针的切平面advection方向                         |
| `cloudWindSpeed`     |     `20.0` |                    `[0, 200]` | texture-domain advection的米每秒速度                                   |
| `cloudTime`          |      `0.0` |   `[-1000000000, 1000000000]` | caller-owned simulation seconds；允许seek/倒放，不读取system time      |
| `cloudRadianceScale` |      `1.0` |                     `[0, 64]` | 只校准intrinsic cloud lighting，不影响A2/A3或input color/transmittance |

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
