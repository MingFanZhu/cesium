# atmosphere-clouds-effects

## Status

- Extension: `active`
- Current phase: none（A4-G `completed`; A5-G not activated）
- Current review: `approved; project-owner Globe visual gate passed`
- Active phase plan: none
- Latest completed phase plan:
  [2026-08-27-phase-a4g-globe-integrated-cloud-core.md](plans/2026-08-27-phase-a4g-globe-integrated-cloud-core.md)
- Extension plan:
  [2026-08-14-atmosphere-clouds-effects-extension.md](plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Architecture decisions:
  [ADR-0040](../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md),
  [ADR-0042](../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md),
  [ADR-0043](../../Documentation/SceneGIS/Decisions/ADR-0043-atmosphere-log-depth-and-radiance-mapping.md),
  [ADR-0044](../../Documentation/SceneGIS/Decisions/ADR-0044-separate-background-aerial-radiance-calibration.md),
  [ADR-0045](../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md),
  [ADR-0046](../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Upstream patch: active `SGP-0008`
- Branch: `feature/atmosphere-clouds-effects`
- A1 checkpoint: `a62aaf16ae3a22ae0a27d6bd21358d65b50b55e1`（未push）
- A2 checkpoint: `da2eb55743a46423e65b2047965907c05ea260b7`（未push）
- A3 checkpoint: `43ed40117104e0450bf23dc094b2ab2e602bbfa2`（未push）

## Objective

为 Cesium Globe 与 `SceneGISPlanarWorld` 建立同等级的现代环境渲染能力：physically based atmosphere、aerial
perspective、exponential height fog、volumetric clouds、cloud shadows、crepuscular rays（god rays）以及
HDR bloom/lens flare。两种世界共享光学参数、质量档、资源与合成框架，但分别使用 ellipsoid-radial 与 fixed-axis planar
reference frame，不互相伪造坐标语义。

## Active work

- A1 已实现并通过 Architecture/code review：双阶段 render integration、private pipeline lifecycle 与 globe/planar
  reference-frame contract。
- A2经过A2R、A2R2与A2R3修正后，implementation、Architecture review和第四次project-owner visual gate均已通过；本次A2
  独立本地checkpoint关闭该阶段。
- A3首轮Architecture review的两个blocker均已由Execution修复并通过Architecture独立复审：Planar近水平短segment使用float32稳定的指数积分比，
  direct Test对`Scene.renderError`、有限有序frustum、新成功帧与Cesium error panel执行严格门禁；A3已
  `approved`，项目负责人live visual gate已明确通过。
- A4已基于checkpointed A3 renderer、MRT capability、asset/package边界以及fixed reference commits完成source-based planning。Frozen scope是
  single-deck dual-world cloud core、deterministic local assets、bounded low-resolution raymarch、A2/A3-aware composition与caller-owned motion；
  `A4-AR-002`已关闭且product visual已达到Architecture下限；第二次re-review发现的`A4-AR-006`已通过geometry-free structure capture、
  clouds-off exact identity和ordinary geometry visibility invariance关闭；但project-owner live visual gate随后因低质量噪声团块、缺少多云型和
  Globe/Planar opacity/color严重分歧而失败。Project owner现已批准ADR-0046 A4R revision：四种typed cloud preset、内部最多四层、
  reference-quality assets/turbulence/STBN、bilateral + minimum cloud-only temporal resolve及dual-world matched radiometric contract。A4R执行已激活；
  `A4-AR-010`的actual compiled matched core、16-phase real-asset distribution与weather/CDF authority已经通过独立source复核。2026-08-27第六次独立复审关闭
  `A4-AR-013/017`：conservative max hierarchy与actual-runtime mip failure atomicity均通过source、Specs和live visual下限。Architecture复跑controller/A1为
  `63/63`、exact Scene aggregate `127/127`。Execution已完成Architecture授权的real-Context constant -> ray -> density -> lighting分阶段replay：
  both worlds × two frusta × linear/log × four presets、same owner与independent A/B MRT及fixed real-asset phase全部raw exact。完整depth copy/hash又把集成差异定位到
  resolve的implementation-dependent `exp2` weight rounding；current shader改用固定16次幂有理bilateral weight，并把stationary映射为与invalid相同的
  shader-facing spatial-only state。两次cache-busting clean load各经过合法grid transition并连续执行两次diagnostic，四次both-world均为
  `fixed=0`、`captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`与cloud gates PASS。Architecture第七次独立复审又复跑
  controller/A1=`63/63`、exact Scene aggregate=`127/127`，并在two clean loads的four transactions/`40`组paired reads中复现全部raw exact；
  `A4-AR-011/016`已关闭。Display-grid的Planar cumulus edge在两次load为`2.175/2.179`，只作为observational range，不再冒充bit-exact
  runtime authority。随后project-owner live visual gate以三张final-source截图拒绝当前画面：both-world horizon/cloud出现断带，downward aerial与
  height fog出现viewport-wide分层。Source review把`A4-AR-018`定位到A4新增的near-sentinel clear-depth epsilon classifier，并把
  `A4-AR-019`定位到错误geometry distance被固定250 m cloud binary reject放大。A4只执行focused source fix和固定俯视/horizon验证，不跑full suite、不做
  防御性fallback。A4-AR-021进一步把shared semantics收敛为resolved depth texture raw exact `0/1`唯一sentinel authority；`czm_readDepth`只用于finite
  geometry reconstruction。Exact controller=`57/57`且A4-AR-020 assertion保持通过。A4进入`review-ready`，等待
  Architecture独立复审；checkpoint与A5继续blocked。
- Project owner在`A4-AR-023/025`的owner visual re-gate再次判定No-Go。Architecture已按owner授权下载ADR固定的两个MIT参考提交并完成
  source/visual audit；`A4-AR-026`把根因收敛到cloud-lighting结构，而不是A2单位或最终亮度：current sky ambient相对reference core高约一个数量级、
  缺少layer-height gradient，higher-order Sun scattering被各向同性化并再次放大，current powder又以Sun-path optical depth增亮direct，方向与reference
  local-extinction edge suppression相反。A4恢复`changes-requested`；Execution只可重建shared lighting core与focused evidence，不得改density/assets、
  occupancy/log-depth、public API、最终RGB/tone mapping或进入A5。

## Discussions

- [双世界环境渲染架构与参考项目取舍](discussions/2026-08-14-dual-world-render-architecture.md) — `resolved`
- [A2 LUT 资产与 planar atmosphere 模型](discussions/2026-08-14-a2-lut-and-planar-model.md) — `resolved`
- [A3 default height-fog washout](discussions/2026-08-15-a3-default-fog-washout.md) — `resolved`
- [A4 cloud structure calibration](discussions/2026-08-15-a4-cloud-structure-calibration.md) — `reopened by owner visual No-Go`
- [Globe-first advanced environment delivery](discussions/2026-08-27-globe-first-delivery.md) — `resolved; A4-G active`
- [A4-G Globe cloud whiteness and frequency calibration](discussions/2026-08-27-a4g-cloud-whiteness-frequency-calibration.md) — `design resolved by Architecture; implementation assigned`

## Reviews

- [A1 render foundation implementation review](reviews/2026-08-14-a1-render-foundation.md) — `approved`
- [A2 Bruneton atmosphere and aerial perspective implementation review](reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md) — `approved`
- [A3 exponential height fog implementation review](reviews/2026-08-15-a3-exponential-height-fog.md) — `approved`
- [A4 volumetric cloud core implementation review](reviews/2026-08-15-a4-volumetric-cloud-core.md) — `changes-requested; superseded by A4-G`

## Engineering paths

- A1 integration/private frame：`packages/engine/Source/Scene/Scene.js`、
  `packages/engine/Source/SceneGIS/Scene/_private/`
- A2 public/private runtime：`packages/engine/Source/SceneGIS/Scene/`、
  `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`
- A2 assets/importer/generator：`packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/`、
  `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/`、`scripts/scenegis/`
- A4 assets/generator：`packages/engine/Source/Assets/SceneGIS/Environment/CloudCore/`、`scripts/scenegis/`
- Specs/manual page：`packages/engine/Specs/SceneGIS/Scene/`、`Test/高级环境.html`

## Current handoff

Architecture fresh diagnosis已把owner可见云断层的主因定位到SceneGIS explicit `R8` occupancy mip upload：base width `128`选择
`UNPACK_ALIGNMENT=4`，tight-packed LOD6 `2³`上传时被错误解释为4-byte row stride并在GPU保持全零。Execution已按正式派工保留tight max
hierarchy，只对显式mip upload副本补齐base alignment要求的3D row/image stride；GPU LOD5/6/7现均非零且parent conservative，accelerated cloud MRT与
exhaustive-density reference在both worlds逐bit一致。并行log-depth defect也已修复：三个自有log variants同时定义`LOG_DEPTH`与
`LOG_DEPTH_READ_ONLY`，raw exact `0/1`继续是唯一geometry-presence authority，finite geometry由`czm_readDepth`得到的resolved depth通过
conventional-depth `vec4` overload重建eye coordinates。

Architecture独立source、real-Context与local Chromium复审已关闭`A4-AR-022`，状态为`Go for project-owner visual re-gate`。Execution exact
controller=`59/59`、A1 pipeline=`7/7`；Architecture独立新增回归=`2/2`。Fresh browser GPU audit确认both-world LOD5/6/7全部nonzero、三个actual selected
log programs均包含两个defines，ground与downward固定画面未复现原始row-wide discontinuity。Current repair只修改five SceneGIS-owned product/Spec
files并回写current A4 docs；upstream-owned=`0`、generated=`0`、new SGP=`0`，active `SGP-0008`仍consume-only。GPU texture/program/pass/API/asset预算
不变，temporary CPU padding delta=`+11 bytes`。Full suite、Scene aggregate及generator/package/type/build矩阵按派工未运行；tree未commit/未push，
owner visual gate、checkpoint与A5继续blocked。

Project-owner再次以`medium/cumulus`、day、`cloudTime=0`、`cloudRadianceScale=1`拒绝A4视觉gate，Architecture新增`A4-AR-023/024`。Execution
actual-GPU probe先确认高日照backward direct Sun欠能量，随后又证明初版additive lobe会重复创建angular energy。Current phase先把forward/backward HG
coefficients写成解析归一化形式，再以`0.25 HG mixture + 0.75 normalized backward diffusion`作非负凸组合；解析积分为`1`，256点GPU quadrature=
`0.997459`，additive mutation=`1.990521`并确定失败。Backward/side/forward phase为`0.19019/0.04990/1.30957`。

Controlled top backward direct/multiple/ambient现为`[0.158,0.138,0.119]`、`[0.126,0.111,0.095]`、
`[0.104,0.125,0.166]`，集成为`[0.388,0.374,0.379]`；underside仍为`[0.204,0.231,0.291]`。Same-final-source fixed
Sun-camera live backward/side/forward中位亮度Globe/Planar为`0.354/0.342`、`0.239/0.214`、`1.357/1.320`，且actual cosine分别为
`-1/0/1`。普通below/inside/above、four presets、sunset/night及cloud-only/combined evidence均已刷新。Isolated component/angular=`1/1`、exact
controller=`60/60`、A1 pipeline=`7/7`。Implementation为`review-ready`，tree仍uncommitted/unpushed，owner gate、checkpoint与A5继续blocked。

Architecture随后关闭`A4-AR-024`但以`A4-AR-025`继续阻塞蓝灰云。Execution用actual-GPU Sun-only、sky-only、combined矩阵确认A2 adapter incident
单位正确；失衡位于shared view-independent diffuse partition。Current shared core保持normalized phase冻结，在分量源头显式采用
`solar multiple × 1.48`与`sky ambient × 0.8`。最终标准云上median Y Globe/Planar=`0.3147/0.2955`，`B/G=1.078/1.069`，
D65 xy distance=`0.0096/0.0081`；fixed forward median/p90相对accepted phase baseline均小于`+5%`。Isolated diffuse=`1/1`、
controller=`60/60`、A1=`7/7`。A4-AR-023/025现为`review-ready`，仍等待Architecture复审；tree未commit/未push，owner gate、checkpoint与
A5继续blocked。

Architecture独立source、actual-GPU fixture与fresh local Chromium复审现已关闭`A4-AR-023/025`。独立标准ground median Y Globe/Planar=
`0.2877/0.2689`，标准above=`0.3123/0.3009`，above `B/G=1.080/1.065`；fixed forward median/p90保持accepted normalized-phase `+5%`内。
A4状态为`Go for project-owner visual re-gate`。Owner明确通过前tree继续uncommitted/unpushed，checkpoint、commit/push与A5保持blocked。

上述owner re-gate现已失败，latest authority为`A4-AR-026`。固定reference source与checked-in example images证明current component rebalance在数学上过度
填充sky/isotropic energy，亮度与D65门槛不再作为closure。Execution的新边界是reference-shaped shared lighting reconstruction与component/contrast
evidence；所有其他A4 owners冻结，tree继续uncommitted/unpushed。

Project-owner A4-AR-025 visual re-gate为No-Go，Architecture新增`A4-AR-026`并完成两套MIT reference equation audit。Execution已按派工重建candidate shared
lighting：normalized dual-HG `g=(0.7,-0.2)` equal mix、8-octave phase-preserving Kulla approximation、`1/(4π)` density-weighted active-layer gradient sky，
以及基于local extinction的`1-0.8 exp(-σₜ·150 m)` powder。Actual-GPU fixture与独立CPU equation、incident separation及三类旧缺陷mutation全部通过。

但same-source live触发派工的radiometric stop condition：canonical medium/cumulus云上median Y仅`0.02976/0.03048`，owner exact high/mixed云上仅
`0.02755/0.02463`；除forward外的ground/inside/back/side也集中在约`0.02-0.04`。Candidate reference equations约比A4-AR-025 accepted-source能量低一个
数量级，不能用hidden final scale补偿。Architecture现已接受reference-shaped source equations，并以ADR-0046 amendment明确
`cloudRadianceScale`是solar-normalized cloud result到Cesium scene-linear HDR的唯一公开校准：default从`1.0`修正为`10.0`、range保持`[0,64]`，
且不与background/aerial scale耦合。Current state=`changes-requested; A4-AR-026 default calibration repair assigned`；tree仍未commit/未push，owner gate、
checkpoint与A5 blocked。

Execution现已完成Architecture授权的A4-AR-026 calibration correction：public/JSDoc/Test `cloudRadianceScale` default为`10.0`，range继续`[0,64]`，
accepted reference-shaped shader source没有再变化。Actual compiled Globe/Planar linear/log scale `0/1/10` fixture证明RGB linear、zero identity、
transmittance/distance half-bit invariant及cloud/background/aerial calibration隔离。Same-final-source default-10 canonical与owner-exact固定矩阵全部
`nonfinite=0`、storage guard=false，最大premultiplied RGB=`3.1328125`；sunset保持`R>G>B`，no-moon night exact zero，cloud-only forward保留内部暗部。
Exact focused controller加A1 pipeline=`68/68 SUCCESS`。Current state=`review-ready; Architecture independent re-review pending`；tree仍uncommitted/unpushed，
owner gate、checkpoint与A5 blocked。

Architecture独立复审接受A4-AR-026的product correction与`61/61 + 7/7` actual rerun，但新增blocking evidence finding `A4-AR-027`：Test MRT
summary在alpha非finite时直接skip而不计数，新scale fixture也只证明RGB finite，alpha/distance仅比较相等bits，因此相同NaN可以错误通过并使交付的
`nonfinite=0`结论fail-open。Latest review writeback另未通过Prettier。Current state=`changes-requested; A4-AR-027 focused evidence repair assigned`；
Shader/source equations/default contract不重开，owner gate、checkpoint与A5继续blocked。

Execution已完成A4-AR-027 focused evidence repair。Test helper现在先解码每个pixel的完整color/distance RGBA half values，分别报告color/distance/union
nonfinite count，并以所有pixel的absolute raw premultiplied RGB计算storage guard；alpha、distance与validity bounds也显式报告。Actual-GPU scale
`0/1/10` fixture逐scale证明color RGBA与distance/front/max/validity全部finite且在编码范围内，同时保留bit invariance、RGB linearity与calibration
isolation。Fresh unchanged default/camera/light/density capture两世界的full-color/full-distance nonfinite均为`0`，raw absolute maximum=`0.379638671875`。
Current state=`review-ready; A4-AR-027 Architecture re-review pending`；product source保持冻结，owner gate、checkpoint与A5继续blocked。

Architecture独立复跑isolated calibration=`1/1`、controller=`61/61`、A1 pipeline=`7/7`，并确认完整color/distance RGBA finite/bounded authority、
absolute raw RGB guard、ESLint、Prettier、Markdownlint与`git diff --check`全部通过。`A4-AR-027`关闭，A4 technical state=
`approved-for-owner-gate`。Project-owner需在当前final-source页面重新判断默认与owner-exact画面；明确通过前tree继续uncommitted/unpushed，checkpoint与A5
保持blocked。

Project-owner在Planar同时启用exponential height fog与volumetric clouds后拒绝该gate：画面出现大面积白色背景与错误cloud/fog层序。Architecture以
`A4-AR-028`撤销此前owner-gate授权；截图只构成visual No-Go，不冒充root-cause evidence。Owner随后明确改变交付顺序：先完成并验收全部Globe高级
环境能力，之后再恢复Planar。Architecture已核验固定Cesium reference commit并把它提升为Globe实现authority，同时继续禁止raw `_gl`、PBO、runtime
network fetch与重复tone mapping。Active phase现为[A4-G](plans/2026-08-27-phase-a4g-globe-integrated-cloud-core.md)；retained dual-world tree冻结且
未commit/未push，Planar defect明确deferred，A5-G仍blocked。

Execution已完成A4-G reference-first Globe core候选。逐文件source/license/texture audit见
[A4-G source map](discussions/2026-08-27-a4g-reference-source-map.md)；因opaque binary缺少独立file-level生成provenance，没有复制reference资产，继续使用
SceneGIS deterministic CloudCore。Globe compiled source现采用reference cube-sphere weather、layer/profile、shape/detail/turbulence与erosion结构，shared transport
继续使用accepted A2 Sun/sky、8-octave scattering、local powder、bounded march与单次A3 composition。集成时发现并修复WGS84 ECEF magnitude被误当Bruneton
cloud altitude的unit seam：现在先投影到`SCENEGIS_BOTTOM_RADIUS`再叠加ENU offset。Planar不编译新Globe library且未做产品校准。

Actual-GPU reference probe、lighting mutation、scale附件、controller=`62/62`、A1=`7/7`、CloudCore generator=`10/10`、installed package/provenance=
`23/23`均通过。Test新增明确的A4-G Globe owner-gate六组合态与ground/inside/above/near-space固定机位；fresh browser遍历后Globe保持
`ready · HDR`，cloud-only/fully-combined未见viewport-wide white/gray slab。远景云仍偏柔与低频，保留为owner visual risk。Current state=
`changes-requested; A4-AR-029 open`。Architecture独立复核发现primary/Sun march把WGS84 surface的地心径向误当成参考实现要求的椭球
geodetic normal；45度纬度下会把Globe texture phase平移约`21.4 km`。Cube-sphere face选择又使用strict dominant-axis比较，精确tie会错误落到Z face；
现有GPU probe只直接调用赤道density/lighting helper，绕过两条错误链路。独立direct probe=`1/1`、controller=`62/62`及4 camera × 6 state
browser smoke仍通过，但不足以证明reference-coordinate correctness。Tree继续uncommitted/unpushed，owner gate、checkpoint与A5-G blocked，等待
Execution已完成A4-AR-029窄修复：primary与Sun march现在共享geodetic-normal bottom-sphere anchor，cube-sphere face选择匹配inclusive
Y-then-X tie order。Actual-GPU boundary mutation=`1/1`、45度WGS84 integrated Cloud MRT mutation=`1/1`、controller=`64/64`、A1=`7/7`、
generator=`10/10`、installed/provenance=`23/23`通过；accelerated/exhaustive attachment bit-exact，geocentric mutation被确定性拒绝。Final-source
Globe browser覆盖equator/45度 × ground/inside/above/near-space × 六组合态，共`48`帧且error=`0`。低频灰带风险未用scale/tint/camera/Sun隐藏，
仍留给后续owner判断。Current state=`review-ready; A4-AR-029 repair awaiting Architecture re-review`；tree继续uncommitted/unpushed，owner gate、
checkpoint与A5-G blocked。

Architecture现已独立关闭`A4-AR-029`：共享geodetic-normal anchor、inclusive cube-face tie order、45度WGS84 integrated mutation authority及
Planar冻结边界均通过源码复核。独立GPU/controller/A1=`1/1 + 1/1 + 64/64 + 7/7`，CloudCore generator=`10/10`，installed
delivery/provenance=`23/23`；final-source equator/45度 × 四机位 × 六组合态为`48/48 ready · HDR`且browser error=`0`。Current state=
`approved-for-project-owner-Globe-visual-gate`，但远景云仍偏柔和低频，必须由项目负责人明确判断；在此前tree继续uncommitted/unpushed，checkpoint、A5-G与
全部Planar排查/校准保持blocked。

Project-owner现判定该Globe visual gate为No-Go并授权适度增强，`A4-AR-030`成为新的blocking finding：云层仍过灰，远景仍偏柔、低频。Architecture已接管并
完成reference live comparison、参数sweep和方案裁决。A4-G的东经15度/北纬45度owner机位继续使用通用`04:00Z day`，实际太阳高度仅`6.229°`；所谓
`10:30Z sunset`反而是`67.484°`高太阳，这是暖灰证据被错误标注的第一原因。独立高太阳sweep仍确认public scale `24`偏灰，`48`在真实Cesium PBR Neutral
下达到cloud-only median RGB `230/224/218`且保留暗腔，`64`开始压平高光。Globe LOD `1.0 -> 0.5`使interior five-pixel high-pass提高`17.3%`，而`0.35`
只再增加`3.7%`并在低太阳下暴露ray-aligned banding。正式实现已收敛为：保留macro scale `0.25`、LOD改`0.5`、public default改`48.0`、新增location-aware
high-Sun/sunset/night owner inputs；accepted solar-normalized source与全部资源/transport/depth/history边界冻结。Current state=
`changes-requested; A4-AR-030 converged implementation assigned`；tree仍uncommitted/unpushed，owner re-gate、checkpoint、A5-G与Planar排查继续blocked。

Execution已按收敛方案完成A4-AR-030：Globe macro保持`0.25`、LOD改为`0.5`、public/JSDoc/Test/package default改为`48.0`；旧Spec-local
scalar ACES已删除，改由actual-compiled raw interior gradient/Laplacian/high-pass与真实Cesium PBR Neutral显示取证。GPU scale=`0/1/48`、
cube-face、45度WGS84、controller=`65/65`、A1=`7/7`、generator=`10/10`、package/provenance=`23/23`全部通过。Final-source high-Sun
cumulus/mixed 16-row matrix全部finite，raw max=`1.34375`、display max=`0.9765`；45度机位太阳高度精确报告`67.484/2.175/-20.120°`，sunset
保持`R>G>B`，night raw cloud为零，resolved attachment非连续重放bit-exact。Current state=`review-ready; A4-AR-030 awaiting Architecture re-review`；
tree仍uncommitted/unpushed，owner re-gate、checkpoint、A5-G与Planar排查继续blocked。

Architecture独立复审接受A4-AR-030产品实现与自动化边界：Globe macro=`0.25`、LOD=`0.5`、public default=`48.0`及冻结的source/transport均
正确，独立GPU/controller/A1/generator/package验证全部通过；真实high-Sun画面已接近白云且保留暗腔，sunset与night也符合契约。但新增Test-only
blocking evidence finding `A4-AR-031`：位于A4-G控件组的四预设网格仍以通用`currentArtifactMode`命名并控制primitive visibility，导致选择A4-G
`Cloud only`后仍显示`combined`并混合Globe/Planar不同状态；display replay又只比较全帧hash，独立四帧采样出现最多`1`个8-bit LSB、约`2.11%`
pixel的Cesium最终显示量化抖动，raw color/distance attachment仍bit-exact。Current state=`changes-requested; A4-AR-031 Test evidence repair
assigned`；产品JS/GLSL、默认值、资源与Planar继续冻结，owner re-gate、checkpoint、A5-G仍blocked。

## External references

- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere) — fixed commit是Globe功能拓扑与逐文件
  license/provenance审计后实现移植的首选authority；其raw WebGL/runtime fetch/PostProcess容器不直接进入产品。
- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [three-geospatial](https://github.com/takram-design-engineering/three-geospatial)

## Handoff rule

本索引只保存当前稳定状态。Phase 结果、偏差、验证、upstream-owned files、SGP 与未解决风险必须回写当前 phase plan 和
review；原始聊天、绝对路径、临时 clone 与大型日志不得写入 AgentDocs。

## A4-AR-031 execution state — review-ready 2026-08-27

The Test-only evidence repair is complete. The A4-G four-preset capture is now
explicitly Globe-only and records the owner location, camera, lighting, owner
state, quality and fixed preset order. `a4gCloudOnly` hides only Globe
primitives; the retained Planar controller and primitive visibility are
snapshotted before/after and remain unchanged.

Displayed replay now reports dimensions, changed pixels/fraction, maximum
channel delta, p10/median/p90 deltas, truthful `displayExact`, and fail-closed
`displayStable`. It compares two ordered groups of four nonconsecutive samples
from a repeatedly observed, bit-exact resolved-attachment phase. High-Sun,
true-sunset and no-moon-night captures passed exact color/distance replay and
bounded display stability with zero browser errors.

Product JS/GLSL, defaults, API, resources and Planar behavior were not changed.
The shared tree remains uncommitted/unpushed; owner gate, checkpoint and A5-G
remain blocked pending Architecture re-review.

Architecture复审接受Globe-only网格、可见state label、Globe primitive隔离和Planar before/after不变证据，但拒绝当前replay gate并新增
`A4-AR-032`。24帧协议会按raw attachment hash分组、选择出现最多的phase，再把其余帧任意标成`stateApplicationFrames`排除；独立首次采集的替代
phase一直出现在index `6/10/13/17/20`，并非连续的状态应用前缀。无warm-up量化中，未选phase相对主phase有`219392`个color half-word与
`38087`个distance half-word变化，display变化`8368/577005` pixels、maximum one LSB；当前helper仍可报告raw exact/display exact。相同产品在显式连续
收敛后`24/24`帧只剩单一raw/display hash，故finding继续限于Test调度与fail-closed证据协议。Current state=`changes-requested; A4-AR-032
contiguous convergence evidence repair assigned`；产品和Planar保持冻结，owner re-gate、checkpoint、A5-G继续blocked。

## A4-AR-032 execution state — review-ready 2026-08-27

Replay evidence no longer groups or selects attachment phases. After disabling
the default render loop, it drains pending RAF work, performs eight explicit
controlled convergence renders, and then searches within the bounded 64-render
budget for one uninterrupted 16-frame run. Any raw color/distance mismatch or
bounded-display mismatch resets the candidate run. Only the single contiguous
prefix before the accepted run is excluded; every accepted and intervening
frame is part of the exact/stable authority.

Final high-Sun/sunset/night captures converged with prefix lengths `22/8/10`
and accepted original indices `22-37`, `8-23`, and `10-25`. Each accepted run
had one color hash, one distance hash, one display hash, stationary history with
read index zero, exact raw attachments, and `displayStable=true`. The Globe-only
preset grid additionally uses immutable `snapshot.ownerState`, validates all
owner controls after capture, and reports `valid=true` only when owner and
Planar snapshots remain unchanged.

Only Test evidence and current A4-G records changed. Product/Planar remain
frozen; owner gate, checkpoint, commit/push and A5-G remain blocked pending
Architecture re-review.

## Architecture A4-AR-032 re-review — changes requested 2026-08-27

The submitted 16-frame raw-exact convergence gate is not reproducible in the
independent high-Sun run: the bounded 64-render helper failed closed with two
raw Cloud MRT phases. Same-frame inspection showed that the Globe default loop
was stopped, `frameNumber` did not change during reads, and low Cloud MRT,
resolved attachments and final display changed together. The final display
difference remains within the previously accepted one-LSB stability bound.

Architecture therefore withdraws strict multi-frame raw replay as an
over-validation of the owner-visible result. `A4-AR-032` remains Test-only and
now requires one atomic same-frame display/raw capture per explicit owner state,
finite/bounds and visible quality summaries, plus the already accepted immutable
Globe snapshot and Planar isolation. Convergence loops, phase selection,
multi-frame hash gates and replay pair matrices must be removed. Product and
Planar remain frozen; state=`changes-requested; simplified A4-AR-032 evidence
repair assigned`.

## A4-AR-032 simplified execution — review-ready 2026-08-27

Architecture withdrew strict multi-frame raw identity as stronger than the
owner-visible contract. Execution therefore removed every replay, hash, phase,
warm-up and convergence gate from the A4-G owner evidence. Each selected owner
state now performs exactly one controlled render; its `postRender` callback
copies both the actual final framebuffer and raw Cloud MRT attachments before
resolving, and summaries are computed only from those completed copies.

Fresh high-Sun, true-sunset and no-moon-night captures were finite, within raw
attachment bounds and storage-safe. Their immutable owner snapshots remained
valid; sunset stayed `R > G > B` and night raw cloud RGB remained exact zero.
The accepted Globe-only grid and Planar before/after isolation remain unchanged
and `valid=true`. Product/Planar stay frozen; owner gate, checkpoint, commit/push
and A5-G remain blocked pending Architecture re-review.

Architecture复核确认已启用的单帧原子路径正常，但发现一个最小fail-open：页面初始disabled状态调用helper时会返回
`raw.available=false`，顶层却仍为`valid=true`。A4-AR-032继续changes-requested，仅允许把`valid`绑定到现有
controller ready、raw available/finite/bounds/storage与owner snapshot结果；不得新增采样、hash或gate。产品与Planar继续冻结。

## A4-AR-032 final fail-closed execution — review-ready 2026-08-27

The single-frame helper now computes its raw summary once and derives `valid`
only from controller enabled/ready, unchanged owner state, raw availability and
finiteness, zero existing nonfinite/bounds failures, and a clear storage guard.
Exactly two direct invocations confirmed disabled/not-ready returns
`raw.available=false, valid=false`, while enabled/ready high-Sun cloud-only
retains every raw check and returns `valid=true`. No render, wait, retry, hash,
replay, metric, product or Planar behavior was added or changed.

Architecture independently reproduced both direct outcomes on the final source
and accepts the simplified evidence implementation. `A4-AR-032` is closed;
product and Planar remain frozen. A4-G now awaits project-owner visual judgment,
with checkpoint, commit/push and A5-G still blocked.

The project owner subsequently reported `通过` on the live Globe result. The
A4-G visual gate is accepted and this change set is the local unpublished A4-G
checkpoint. A5-G has not been activated; Planar adaptation remains deferred.
