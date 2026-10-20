# ADR-0042：Planar Precomputed Atmosphere and High-Altitude Optical Contract

## 状态

- Status：`approved`
- Date：`2026-08-14`
- Decision owners：Architecture Agent、project owner
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md`
- Related review：
  `AgentDocs/atmosphere-clouds-effects/reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md`
- Related patch：active `SGP-0008`（consume only）
- Supersedes：ADR-0041 的 planar single-scattering、zero-LUT、ray-distance clamp与planar resource-budget决策
- Constrains：ADR-0030、ADR-0033、ADR-0034、ADR-0036、ADR-0039、ADR-0040、ADR-0041

## 上下文与失败证据

A2 首轮实现通过自动化 Architecture/code review，但项目负责人 visual gate 观察到 planar 高空视角几乎没有 atmosphere/aerial
perspective，且双世界第一版视觉不足以形成可接受的 physical environment baseline。该结果不允许建立 A2 checkpoint。

Planar 高空 preset 的 camera Z 为 120 km、view direction Z 为 -0.2，flat atmosphere top 为 60 km。射线需要 300 km 才到达
slab top；原实现先把完整 ray distance clamp 到 300 km，再求 slab segment，得到相等的 `segmentStart` 与 `segmentEnd`，因此返回
identity。指向近/远 geometry 的 ray 多数在 300 km 后才进入 slab，也同样跳过介质。这是 correctness defect，不是单纯调参问题。

原 planar runtime 不分配 LUT，只执行 8-sample analytic single scattering。它没有 multiple scattering与diffuse ground irradiance，且将
integration budget同时误作camera-to-medium entry budget。Globe 已使用真实 RGBA16F `Texture3D` combined scattering LUT；planar 不得复用
spherical LUT，但现有 zero-LUT quality boundary 已被 owner gate 否决。

## 决策

### Ray、slab 与积分预算

- `maximumDistance` 表示 camera 到实际 opaque endpoint 的几何距离；background ray 使用足以覆盖完整 slab entry/exit 的明确 finite limit。
- 先用未裁剪的几何 ray 求 `[0, 60 km]` slab entry/exit，再与实际 endpoint 相交。`300 km` 只限制进入介质后的累计积分长度，不得限制
  camera 在真空中到达 slab 的距离。
- Camera 位于 atmosphere 外且 ray 穿过 slab时必须产生有限、非 identity的transmittance与in-scattering；ray永不进入slab时保持identity。
- Planar 继续保持fixed `+Z`与flat horizon；禁止通过virtual radius或spherical LUT制造Earth curvature。

### Planar fixed precomputed LUT

Planar 改用独立的 immutable `earth-flat-precomputed-v1` asset set，复用 ADR-0041 的 Earth Rayleigh/Mie/ozone、solar irradiance、Sun angular
radius、ground albedo与60 km atmosphere thickness，但使用flat-slab transport equations。它包含：

- RGBA16F 2D transmittance LUT：`256×64`，参数为height与view zenith cosine；
- RGBA16F 3D combined scattering LUT：`256×128×32`，将relative azimuth/scattering cosine与Sun zenith维打包到X，view zenith为Y，
  height为Z；
- RGBA16F 2D irradiance LUT：`64×16`，参数为Sun zenith与height。

参数映射必须在generator、provenance与GLSL中使用同一可逆定义，并为horizon提供足够采样密度。Combined scattering累积single scattering与
orders 2–4 multiple scattering；alpha可保留single-Mie reconstruction authority，但不得引入与RGB不一致的runtime coefficient。Irradiance
包含与固定ground albedo一致的direct/diffuse contribution。

Planar boundary LUT必须积分到真实slab boundary；exact horizontal使用semi-infinite optical limit。`300 km` medium budget只裁剪runtime
visible segment，禁止在generator中伪造一个随sample point平移的finite boundary。Runtime用解析Rayleigh/Mie/ozone optical depth计算actual
segment transmittance，再以同一physical boundary的entry/endpoint radiance做LUT差分。这样exact horizontal segment使用相同boundary radiance但
仍通过`L - Tsegment * L`得到非零结果；不得用两个相同的capped-boundary transmittance相除得到identity。

Orders 2–4必须是严格recurrence：order N只由order N-1的radiance/source产生，每一阶只累加一次；higher-order integration不得再次隐式加入
single scattering或全部lower orders。Irradiance LUT必须是cosine-weighted hemisphere radiance integral加direct solar irradiance，不能把
local scattering source乘以π后命名为irradiance。若ground albedo参与higher-order transport，ground boundary term与order归属必须显式且可测试。

Runtime不执行LUT precompute，不下载external asset，不使用raw GL、PBO、second render loop或temporal history。

### Generator、资产与来源

- 在`packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/`提交三个binary16 LUT、`provenance.json`与适用的完整license/attribution。
- 在`scripts/scenegis/`提供deterministic explicit generator/import-verifier与Node tests。Generator固定physical preset、quadrature、multiple-
  scattering order、dimension、packing、byte order与rounding；同一输入必须生成byte-identical output。
- Provenance记录generator/version、公式来源、全部参数、dimensions、packing、orders、bytes与SHA-256，不记录本机路径。
- 如果实现移植或改编Bruneton/reference source，必须保留完整license header与固定commit/path；不能把未审计prototype binary作为authority。
- Package-local URL、build/release/npm复制继续依赖现有recursive asset pipeline，不修改build script或package manifest。

### Runtime、capability 与资源

- Public `SceneGISEnvironmentEffects` API、default-disabled、native conflict、error/lifecycle与A1 pipeline contract不变。
- 既有advanced profile已经要求WebGL2、`Texture3D`、RGBA16F linear filtering、depth texture与HDR color buffer；planar LUT不新增capability tier。
- Globe继续使用`BrunetonEarth`三个LUT且binary/hash不变。Planar只加载`PlanarEarth`三个LUT，不加载或采样任何spherical asset。
- 一个active planar Controller新增8,527,872 bytes persistent LUT budget；其1920×1080与3840×2160总预算因此与现有Globe A2同级。
- Candidate upload/compile必须failure-atomic；disable保留warm GPU resources，disconnect/destroy清理exact ownership，CPU buffers在成功upload后释放。

## 不采用的方案

### 调高8-sample loop或只修改验收页

不采用。它不能提供multiple scattering/ground irradiance，也不能修复camera-to-slab entry与medium integration budget混淆。验收页必须暴露问题，
不能通过改变camera来隐藏runtime defect。

### Planar复用Globe spherical LUT

不采用。Spherical radius与curved horizon会破坏explicit planar frame，并给长距离optical path引入错误geometry。

### 只增加艺术强度或postprocess

不采用。A2R先修正physical transport与可观察性；exponential fog、cloud、god rays、bloom、lens flare与quality tiers仍属于后续phase。A2R不新增
public exposure/density multiplier来掩盖transport错误。

## 验证与gate

- Node reference/generator tests覆盖deterministic byte identity、packing round-trip、finite/nonnegative energy、order accumulation、tamper与atomic
  publication。
- Generator reference tests还必须分别验证order 2/3/4 recurrence不重复lower order、cosine-weighted irradiance、true-boundary/horizontal optical
  limit与runtime analytic segment transmittance组合恒等式；仅检查positive/finite energy不构成transport validation。
- Real Context Specs确认planar创建真实`Texture3D`、不加载Globe asset、exact bytes/resource lifecycle、disabled-zero与failure-atomic。
- Shader/pixel Specs必须覆盖camera在slab内、slab外向下穿越、slab外不相交、ground/air/high、day/sunset/night及Perspective/Orthographic；
  high-altitude intersecting ray必须相对identity产生可测transmittance与radiance。
- Pixel Specs必须额外覆盖slab内exact horizontal与shallow long-distance aerial：50/150/300 km应产生单调、非identity介质效果；120 km
  camera必须同时覆盖background和resolved-depth aerial，而不能只验证background command。
- Direct Test保留120 km高空case并增加slab entry/exit、near/far geometry与效果差分readout；不得只用command/uniform存在性代替visual evidence。
- A2R完成Architecture/code review后，项目负责人重新执行Globe/planar manual visual gate。Gate通过前不得checkpoint或激活A3。

## 上游与停止条件

A2R仍只消费active `SGP-0008`。若需要第二个upstream-owned file、扩大`Scene.js` ranges、修改Renderer/builtin、build/package manifest或public API，
Execution必须停止并提交Architecture discussion。Generated shader modules与Build outputs不得提交。

## 参考资料

- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [ADR-0041](ADR-0041-bruneton-atmosphere-aerial-perspective.md)

## P5 full-segment amendment（2026-09-12）

P4 far-horizon观察和P5 actual-GPU probe确认：Z=10 km相机看向Z=0远处地表时，
300 km裁剪会丢弃ray末端的浓密低空介质。Red transmittance从300 km处0.315反向上升到
20,000 km处0.604，形成远景颜色回升和条带。完整路径给出600 km处0.0995、1,000 km处
0.0214、20,000 km处0，符合相同高度差下optical depth随距离增长的契约。

当前runtime已经使用closed-form Rayleigh/Mie/ozone integral与true-boundary LUT差分，
没有随路径长度增长的raymarch成本。因此本修订取消**大气**的300 km长度预算：
先求真实`[0, 60 km]` slab entry/exit，再与caller actual endpoint相交，计算完整区间。
Horizontal finite ray使用完整endpoint distance；background保留既有finite distance limit。
云和height-fog各自的采样/积分预算不变，不将本修订传播到它们的marcher。

LUT、generator、asset bytes、物理系数和边界均不变；不增加lookup、loop、uniform、pass、
resource或GPU bytes。Globe transport不变。Actual-GPU回归覆盖远处透射率单调性、超过
300 km的ground/horizontal路径、vacuum entry与slab外不相交，并检查相同原始昼夜视角。
本修订替代上述runtime `300 km medium budget`，只消费SGP-0008，没有upstream文件改动。

## Planar horizon quadrature correction（2026-09-18）

默认平面物理大气示例的 opaque 方块横跨水平视线时出现色带。CPU 极限与实际 GPU probe 确认，
原因是 version 2 generator 对真实 boundary 的几何距离均分 12 段：低空向上近水平时第一采样点
越过近处高密度介质，向上/向下 boundary radiance 的极限不一致。Runtime 深度与解析 transmittance 连续。

Version 3 在每个颜色的 absorbed transmittance 上积分：
`L_c = integral((source_c / extinction_c) d(1 - T_c))`。
每颜色 24 个 midpoint samples，通过解析 optical depth 的单调反解求位置；几何与权重按 height/viewMu
预计算并复用于 Sun/azimuth 和多次散射各阶。颜色必须分别采样，避免 ozone 等差异消光使共用位置漏掉某一颜色的主要贡献。
各颜色到真实 boundary，或 `T_c = 2^-24` 后忽略小于 binary16 最小正值的透射 tail；exact horizontal 仍用解析半无限极限。
这是离线精度预算，不是 runtime 的距离上限，也不通过插值最终颜色掩盖 horizon seam。

同一 canonical generator 重建 `PlanarEarth/scattering.bin`、`irradiance.bin` 与 provenance，更新固定 hash/version；
transmittance bytes、所有物理系数、LUT dimensions/format/packing 和公共 API 不变。Generator version 升级不改变
`earth-flat-precomputed-v1` 的物理 preset 标识。Runtime shader、lookup、pass、resource ownership 与 GPU bytes 均不增加；
Globe assets 和光学路径不变。Package verifier 同步新 manifest，并验证真实复制后的资产。

[独立修复计划](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-18-planar-aerial-horizon-band.md)
负责水平双侧极限、独立 dense integration、实际 GPU 和原示例画面验证；不宣称所有离线 quadrature 已达到无限精度。

## High-altitude boundary precision（2026-10-15）

相机位于远处真空时，slab 裁剪得到的边界高度必须保留为准确的 0 / 60000 m，
不得再以巨大相机高度与射线位移相消来恢复。非水平且到达 slab 出口的介质长度由端点高度差
除以方向 Z 计算，避免两个巨大入射距离相减；有限接收点和原有近水平路径保留原长度，
避免微小高度差再次丢失短光程。
这修正 250000 km 俯视背景的地面反射分支跳变，不扩大地面容差或修改 LUT、物理系数、
background distance limit、公共 API、pass 和资源预算。无 upstream / SGP 增量。
验证与剩余边界见 [独立修复计划](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-10-15-planar-high-altitude-precision.md)。

## Ground feedback in multiple scattering（2026-10-17）

负责人授权补齐地面反射进入大气的缺失能量，保留无限 flat slab、fixed +Z、Earth
albedo=0.1、orders 2–4 和现有方向平均近似。禁止以加白、加黄、太阳角偏移或暮光延时
对齐 Globe。HDR / 自动曝光的默认及当前 LDR 验收配置不变。

Version 4 在第 n 阶散射密度积分中，对朝向地面的入射方向加入
`T_to_ground * albedo / pi * E_ground[n-2]`。E0 为 ground direct solar irradiance；
E1、E2 分别来自 L1、L2 的上半球余弦积分，不是累计总照度。地面反射本身计为一次
相互作用；每条路径只进入所属阶一次。此递推遵循
[Bruneton ground boundary formulation](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/functions.glsl.html#multiple_scattering)，
使用本仓库 flat-slab 积分，没有复制 spherical implementation。

Scattering LUT 仍只包含最后一次相互作用发生在大气中的路径，最后一次可见地面反射
继续由 runtime 单独加入。Irradiance 保持 direct 加全部已计算大气阶次的 diffuse，
不把夜间艺术环境光写入物理 LUT。太阳位于平面以下时仍无新的太阳能量源。

通过 canonical generator 重建并跟踪 scattering / irradiance / provenance，更新
deterministic manifest 和 package verifier；transmittance bytes、物理参数、格式、
纹理尺寸、请求数量、运行时 Shader / pass / GPU 资源均不变，无 upstream / SGP 增量。
高阶方向平均、有限四阶与既有 12×8 angular quadrature 仍是近似，不宣称与完整
directional transport 或 Globe 逐像素一致。当前实施与技术 / 视觉 gate 记录于
[维护 plan](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-16-environment-radiance.md)
及其 review。

## Directional multiple scattering（2026-10-20）

负责人授权取消高阶方向平均近似。Version 5 在离线源网格上保存到 degree 16 的
real cosine spherical harmonics（每颜色 153 系数）。Sun 与 +Z 所在平面的反射对称性
使 sine 系数为零。入射 L(n-1) 和地面 `T * albedo/pi * E(n-2)` 先投影，再分别乘以
Rayleigh / Cornette–Shanks Mie 相函数的 Legendre convolution eigenvalues 及局部密度、
散射系数，形成该阶的方向性散射源。Rayleigh 保留 l=0、2；Mie 使用解析归一化 moments，
不通过经验 tint 或相函数参数修改来对齐球面。

入射角积分采用上下半球各 16 个 Gauss–Legendre zenith nodes、64 个 periodic azimuth
samples。沿 fixed-Z 光路的 view/Sun 方向不变，先积分 source coefficients 与单次散射
Rayleigh/Mie 系数，再对每个输出方向求值，避免重复积分路径。Ground diffuse irradiance
仍为上半球余弦积分；阶次归属、原有 24 samples/channel 光程积分及 32×32 源网格不变。

输出仍为原格式的 combined scattering 与 total irradiance；原有 8 个 scattering-cosine
samples、32 个 Sun samples、纹理尺寸及 runtime GLSL 完全不变。非物理参数组合的 LUT
边缘沿有效 relative-azimuth 边界延拓；有效方向依旧由实际 view/Sun 点积求值。
通过 generator 重建资产和 provenance，批准哈希与 package verifier 同步。Globe 与
transmittance 资产不变，无新增 public API、pass、lookup、capability、资源或 SGP。

直接角积分验证覆盖中午和低太阳高度，独立检查 phase normalization、方向性与 ground
order ownership。有限四阶、球谐截断和输出插值仍是近似；flat slab 水平无限光程与球壳
曲率差异保留，不以逐像素接近 Globe 作为物理正确性的替代判据。
实施与成本证据见[独立计划](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-10-20-planar-directional-scattering.md)。
