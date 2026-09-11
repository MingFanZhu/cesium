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
