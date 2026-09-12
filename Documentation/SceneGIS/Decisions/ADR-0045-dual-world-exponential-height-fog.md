# ADR-0045：Dual-world Exponential Height Fog

## 状态

- Status：`approved`
- Date：`2026-08-15`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-15-phase-a3-exponential-height-fog.md`
- Related patch：active `SGP-0008`（consume only）
- Builds on：ADR-0040、ADR-0041、ADR-0042、ADR-0043、ADR-0044

## 上下文

A2已经在Globe与`SceneGISPlanarWorld`交付physical atmosphere和depth-aware aerial perspective，但这不能替代近地、可艺术调节的
exponential height fog。Cesium native `Fog`同时承担Globe tile culling状态与material-level视觉雾化，其密度、height falloff、坐标和
合成位置都不属于SceneGIS双世界HDR contract。让native `Fog`与advanced environment同时运行会形成第二套独立介质和潜在的错误culling
authority；把平面世界伪装成`Camera.positionCartographic`同样违反ADR-0040的reference-frame边界。

A3需要增加成熟引擎常见的base density、height falloff、start distance、maximum opacity、ambient与directional inscattering，同时避免重演
A2由单一radiance calibration导致的地表washout。该效果必须复用A1/A2现有pass和resource owner，而不是增加另一个postprocess链或私有
Framebuffer。

## 决策

### Public contract

`SceneGISEnvironmentEffects`增加以下constructor option与同名writable property；所有数值必须finite并在闭区间内：

| Property                                   |    Default |             Range | Meaning                                                       |
| ------------------------------------------ | ---------: | ----------------: | ------------------------------------------------------------- |
| `showHeightFog`                            |     `true` |           boolean | 独立启用height fog；global `enabled`仍default `false`         |
| `heightFogDensity`                         | `0.000008` |      `[0, 0.001]` | base height处的每米extinction coefficient                     |
| `heightFogHeightFalloff`                   |   `0.0002` |      `[0, 0.001]` | 每米指数衰减；`0`表示uniform fog                              |
| `heightFogBaseHeight`                      |      `0.0` | `[-60000, 60000]` | 相对world reference ground的米制density reference             |
| `heightFogStartDistance`                   |    `250.0` |     `[0, 300000]` | 从每pixel ray origin起不施加fog的距离                         |
| `heightFogMaximumOpacity`                  |     `0.70` |          `[0, 1]` | 仅限制height fog extinction/inscattering，不限制A2 atmosphere |
| `heightFogInscatteringScale`               |     `0.35` |         `[0, 64]` | ambient fog source的scene-linear calibration                  |
| `heightFogDirectionalInscatteringScale`    |     `0.15` |         `[0, 64]` | view-to-Sun directional lobe的scene-linear calibration        |
| `heightFogDirectionalInscatteringExponent` |      `8.0` |        `[1, 128]` | directional lobe exponent                                     |

Setter只更新uniform source并在active、connected且值实际变化时`requestRender`。不得触发asset fetch、shader compile、generation replacement、
FBO/texture/program重建或lifecycle churn。A3不增加public color、second layer、distance cap、quality tier或native-culling option；后续phase若有
真实需求必须另行决策。

### Density and composition

单层density定义为：

```text
sigma_t(s) = heightFogDensity * exp(-heightFogHeightFalloff *
             (height(s) - heightFogBaseHeight))
tau = integral(sigma_t(s), clipped ray segment)
rawFogAmount = 1 - exp(-tau)
fogAmount = min(rawFogAmount, heightFogMaximumOpacity)
fogTransmittance = 1 - fogAmount
```

积分段先去掉`heightFogStartDistance`，再裁剪到world-specific fog support与固定`300000 m`in-medium cap。实现必须对指数和optical depth执行
明确的finite/saturation guard；guard只能防止overflow/NaN，不能成为隐藏的tone mapping或不透明度倍率。

Geometry的严格合成顺序为：

```text
sceneWithAtmosphere = inputColor * atmosphereTransmittance +
                      atmosphereRadiance * aerialRadianceScale
sceneFinal = sceneWithAtmosphere * fogTransmittance + fogInscattering
```

`fogInscattering = fogAmount * fogSource`。只有最终`sceneFinal.rgb`经过ADR-0043的RGBA16F storage guard；input color、两种
transmittance、physical atmosphere radiance与alpha的既有语义不变。`showAerialPerspective=false`时第一步是identity；
`showHeightFog=false`时第二步必须raw-half exact identity；两个geometry flag都false时不执行HDR pass。

Background只在`showAtmosphere=true`时由现有background command把height fog应用到A2 sky/Sun/ground-boundary结果。Aerial clear-depth分支继续
返回已经写入的background，禁止二次施雾。`showAtmosphere=false && showHeightFog=true`只雾化resolved geometry，不凭空创建新的sky
authority。

### Atmosphere-aware fog source

Fog color不是public hard-coded blue，也不消费`backgroundRadianceScale`或`aerialRadianceScale`。Shader在裁剪段的稳定代表点使用A2既有
world-specific Sun transmittance/ground-occlusion authority，形成finite、non-negative的Sun color；ambient使用Sun color与shared
Rayleigh/Mie coefficients形成fixed-reference normalized source，directional项使用同一fixed-reference rule和
`pow(max(dot(viewToSun, 0)), exponent)`。两项只分别乘自己的A3 scale。Sun在地平线下或transmittance近零时对应项为零，不允许用隐藏fallback
颜色维持白天亮度。

2026-08-15的bounded calibration amendment冻结下列定义：

```text
ambientNumerator = max(sunColor * (RAYLEIGH + MIE_SCATTERING), 0)
ambientDenominator = maxComponent(
    SOLAR_IRRADIANCE * (RAYLEIGH + MIE_SCATTERING))
ambientSource = ambientNumerator / max(ambientDenominator, epsilon)
directionalSource = max(sunColor, 0) /
    max(maxComponent(SOLAR_IRRADIANCE), epsilon)
fogSource = ambientSource * heightFogInscatteringScale +
    directionalSource * directionalLobe *
        heightFogDirectionalInscatteringScale
```

分母是fixed top-of-atmosphere reference，不得再用当前pixel numerator的
luminance或max component重新归一化。这保留world-specific Sun transmittance的
magnitude与spectral shift；unattenuated top-of-atmosphere的两类source component peak均不超过
`1`。只可将finite计算roundoff限制为non-negative并继续使用已接受的
RGBA16F final storage guard，不得增加fog-source clamp或隐藏multiplier。

该定义共享光学/Sun authority但保持独立scene-linear calibration，因此A3调雾不会改变A2 sky或aerial radiance，A2两个scale的变化也不会改变
fog-only输出。每pixel新增的Sun-transmittance lookup必须有固定上界并写入shader contract evidence。

### Dual-world geometry

- Globe复用A2 virtual-sphere/ellipsoid reference adapter，height为reference surface以上的radial altitude，support固定为`[0, 60000] m`。
  先解析裁剪top shell与可见segment，再用build-time固定、最多16个sample的Gauss-Legendre quadrature积分curved radial height；不得读取
  `Camera.positionCartographic`或按position magnitude猜world。
- Planar使用registered world的fixed `+Z`与explicit base Z，height为`worldZ - planarBaseZ`，support同样是`[0, 60000] m`。对裁剪后的
  linear-height ray使用数值稳定的exact analytic exponential integral；horizontal、falloff=`0`、base crossing与outside-slab必须有独立
  分支/fixture。
- Perspective使用camera ray origin；Orthographic使用A2的per-pixel local ray origin。高于support的相交ray必须从entry开始积雾；不相交ray为
  identity。Underground继续使用A2 fail-closed semantics。

两种world共享public参数和composition，不要求pixel-identical。Globe quadrature必须对adaptive double-precision CPU reference验证：在
non-saturated case中fog amount绝对误差不超过`0.005`，且`1e-4 <= tau <= 20`时optical-depth相对误差不超过`2%`。如果最多16 samples仍无法
满足，Execution必须停止并提交Architecture discussion，不能放宽误差或切换错误的planar公式。

### Pass, resource, and native authority

- 复用现有one background program、linear/log-depth aerial programs及lazy RGBA16F aerial FBO；A3不得新增program、Framebuffer、texture、asset、
  network request、timer、listener、command slot或upstream hunk。
- Fog helper作为SceneGIS-owned shared GLSL source进入现有program build；`.js` shader module仍由官方build生成且不提交。
- HDR pass在`showAerialPerspective || showHeightFog`且已有valid resolved color/depth时执行；resize、candidate publication、late generation、
  failure atomicity与destroy exactly-once沿用A2。
- Globe与planar active guard都要求`scene.fog.enabled === false`。Controller不得自动修改或恢复native object；late conflict按A2 error/retry
  contract fail closed。Native fog culling不会作为advanced fog的隐藏优化，因为它使用另一套density和Globe-only frame。
- A3没有temporal state或quality permutation。Fog density evaluation的loop/sample count必须compile-time bounded，禁止dynamic/unbounded
  raymarch。

## 验证

- Public Specs覆盖defaults、range/type errors、warm setters、same-value/inactive/disconnected request语义，以及package runtime/types/docs exact
  delivery。
- Shader/CPU fixtures覆盖planar horizontal/vertical/base crossing/falloff=`0`、Globe ground/tangent/high outside shell、Perspective/
  Orthographic、linear/log depth、start distance、300 km cap、maximum opacity与finite saturation。
- Raw RGBA16F fixtures证明fog disabled是A2 byte identity、aerial disabled的fog-only仍nonidentity、两个flag都false为pipeline identity、A2与A3
  calibration互不串扰、alpha保持、clear depth不二次施雾。
- Resource fixtures证明program/FBO/texture/request/command上界相对A2不增加，candidate/resize/destroy/failure atomicity保持。
- Direct Test增加独立fog控制与fog-only/combined diagnostics，覆盖day/sunset/night、ground/air/120 km high、near/far geometry与两种frustum。
  Default ground/day必须既nonidentity又保留地表：fog-only full-frame与lower-center ground ROI的mean RGB delta均为`0 < mean <= 24`；near target
  变化小于far target；120 km向下穿层可见、未穿层ray identity。数值只防明显回归，不能替代project-owner visual gate。
- 回归A1 slots/reference frame、A2 focused controller/pixels、exact Scene aggregate、build/release/types/docs、installed package、LUT verify、local
  no-network browser、changed-scope lint/format、upstream/generated audit。

## 停止条件

如果默认参数仍造成ground washout、fog source依赖A2 radiance scale、Globe积分不能在16 samples预算内达标、native Fog需要共同运行，或现有A1/A2
pass无法在不新增upstream seam/FBO的前提下正确合成，Execution必须停在A3并提交Architecture discussion。不得进入cloud phase、增加Test-only
multiplier或把visual failure包装成quality preset。

## 参考

- [ADR-0040](ADR-0040-dual-world-advanced-environment-rendering.md)
- [ADR-0041](ADR-0041-bruneton-atmosphere-aerial-perspective.md)
- [ADR-0042](ADR-0042-planar-precomputed-atmosphere.md)
- [ADR-0043](ADR-0043-atmosphere-log-depth-and-radiance-mapping.md)
- [ADR-0044](ADR-0044-separate-background-aerial-radiance-calibration.md)
