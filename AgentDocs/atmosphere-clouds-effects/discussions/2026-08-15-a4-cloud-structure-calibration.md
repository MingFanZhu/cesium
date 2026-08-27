# A4 Cloud Structure Calibration

## Metadata

- Status: `superseded for delivery ordering; calibration history retained`
- Extension: `atmosphere-clouds-effects`
- Phase: `A4 — Volumetric cloud core`
- Trigger: Architecture review `A4-AR-003`
- Governing decision:
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Exact retained HEAD/base: `ad9898261831e1314fe98307b7b0303fce3ba08f`

## Problem

Architecture rejected the first default artifacts. Globe day/sunset appeared as a smooth dark diagonal wedge, Planar day/sunset as a broad blue-grey slab, and night lacked recognizable cloud structure. Numeric changed-fraction and variance gates passed, but they do not satisfy the ADR-0046 visual stop condition.

Two source defects must be removed before judging calibration:

- the low-resolution cloud pass reconstructed off-center rays with full-resolution window coordinates against the cloud viewport;
- the tileable volume sampler clamped its R axis, freezing upper detail slices at the public maximum thickness.

## Bounded rework

1. Reconstruct rays from the cloud-pass fragment coordinate while retaining full-resolution coordinates only for depth and blue-noise sampling.
2. Repeat shape/detail/weather textures on S, T, and R.
3. Re-run the off-center dual-world raw geometry matrix before changing calibration.
4. If the corrected geometry remains visually insufficient, adjust only the ADR-0046 CloudCore density/weather/detail/lighting/upsample model using the existing deterministic assets, fixed public defaults, Sun/sky authority, and frozen resource/pass budget.
5. Regenerate day, sunset, and night artifacts with structured cloud-only and combined diagnostics.

No Test-only multiplier, hidden opacity, billboard/skybox fallback, temporal behavior, ground shadow, or A5/A6 work is allowed.

## Resolution gate

The discussion closes only when both worlds show recognizable volumetric cloud bodies while retaining sky and ground separation in day, sunset, and night, and the focused raw evidence confirms correct off-center geometry and depth clipping.

## Resolution — 2026-08-26

- Correct low-resolution viewport ray reconstruction and S/T/R repeat were established before calibration.
- The bounded source-backed model now combines Perlin-Worley low-frequency FBM, weather coverage/type/density, type-shaped vertical profile and
  detail erosion at private shape/detail/weather scales `12/2/60 km`. Public defaults, deterministic assets, Sun/sky authority and resource/pass budget
  remain unchanged.
- Strict 24-state smoke completed without render/browser/network errors. Default day cloud-ground sky fraction/max/stddev is
  Globe `0.244/174/22.32` and Planar `0.653/210/81.63`; near targets remain exact identity while far targets reach max delta `17/39`.
- Regenerated day/sunset/night artifacts show separated cloud bodies and retained ground/sky. Night intentionally introduces no foreign light source;
  cloud silhouette remains observable against the existing lit diagnostic target.

The ADR-0046 stop condition is therefore resolved for Architecture re-review. Owner visual judgment remains a later gate.

## Architecture re-review — 2026-08-26

Discussion重新打开。最终combined artifacts虽已消除原viewport斜向畸变，但Globe仍主要呈低矮黑灰烟带，Planar仍呈覆盖大部分sky ROI的宽阔
veil/fog bank，night artifact没有提供可辨识cloud structure。Architecture判定ADR-0046视觉停止条件尚未关闭。

Rejected snapshot的共同根因已定量确认：default coverage additive remap只在weather column `<=0.05`时清空，而tracked fixed-Z weather
slice有`99.61%` columns高于该阈值；`12 km`重复shape与near-horizontal long path再把这些非零column累计成接近opaque的连续层。后续修正必须先恢复
default macro clear cells，并以path transmittance而非整帧variance校准density。暗部lighting是否另有Sun/ambient imbalance仍需cloud-only radiance
诊断确认。

下一轮必须同时提供both-world day/sunset/night的cloud-only与combined artifact，使cloud结构能与A2/A3 atmosphere/fog隔离判断；若冻结asset/public
contract无法产生多个有天空间隙、内部明暗和可信轮廓的cloud bodies，应reopen ADR-0046，而不是继续仅以private scale和整帧统计声明收敛。

## Execution second resolution — 2026-08-26

### Root cause retained

Architecture的定量根因成立：旧additive coverage remap令tracked fixed-Z weather slice的`99.61%` columns在default下非零；`10°`ray的
`25.9 km`in-medium path在default extinction下把这些column积成连续veil。此前procedural raw fixture与live analytic ray脱节，也无法独立证明
off-center geometry正确。

### Bounded repair

- Default macro coverage改为以`1 - cloudCoverage²`为中心的bounded threshold；`cloudCoverage=0`保持exact identity。Tracked fixed-Z slice的
  default active occupancy现为`70/1024 = 6.8359375%`，而不是几乎全覆盖。
- 保持private shape/detail/weather scales `12/2/60 km`，结合Perlin-Worley、weather type、vertical profile、detail erosion和三项bounded
  source-backed scattering contributions；没有隐藏/Test-only product multiplier、foreign night light、asset/public/resource/pass变更。
- Raw fixture以solid volumes与zero dither控制density，从live camera/frustum、cloud viewport和exact asymmetric texels推导Planar slab/Globe shell
  intervals；旧`fullPixel`mutation会确定性失败。

### Verification

- Cloud-only structure：Globe active/gap/bodies/largest=`0.399066/0.600934/2/0.394922`；Planar=
  `0.444175/0.555825/3/0.308750`。两者均报告10-bin transmittance/radiance histograms。
- Near targets exact identity；far max delta Globe/Planar=`168/42`，并保留ordered、finite、inside-canvas target proof。
- Day/sunset/night各生成cloud-only与combined artifacts；cloud-only隔离A2/A3后仍显示多个bounded bodies、sky gaps、内部明暗与silhouette，
  combined保留sky/ground/near geometry；night不添加foreign light。
- Focused real-Context `51/51`、generator `9/9`与strict `24/24` local/no-network smoke通过。

Execution认为视觉停止条件已按root-cause/evidence/fix/verification闭环；discussion等待Architecture独立复审，不提前请求owner gate。

## Architecture second re-review — 2026-08-26

Product visual correction已达到Architecture下限：六张artifact显示both-world bounded bodies与sky gaps，不再呈旧veil/smoke bank。Discussion暂不关闭，
因为`A4-AR-006`确认structure mask把ordinary geometry计为cloud：full-frame radiance capture包含ground和comparison boxes，mask的
`radianceMaximum >= 32`又直接把它们标为active，导致histogram/component metrics污染。

Execution只需修正Test evidence authority：从cloud MRT或geometry-subtracted/geometry-free capture得到cloud-only mask，证明clouds-off exact zero且
target/ground visibility不改变metrics，再重新报告histogram/components与六张artifact。当前不要求继续修改product density/lighting。

## Execution evidence correction — 2026-08-26

Structure capture现在在相同camera/cloud state下隐藏全部ordinary primitives与Globe/Planar ground authority，直接从geometry-free composed
frames推导transmittance与radiance；结束后恢复全部Test/caller状态。Clouds-off在两世界均得到zero active/body/radiance和全像素identity
transmittance。反转targets与ground/world visibility再capture时，histograms、component areas和radiance totals逐项不变。

去污染后的结果：Globe active/gap/bodies/largest=`0.143351/0.856649/8/0.075033`，Planar=
`0.061590/0.938410/5/0.031020`。Component门限为ROI的`0.2%`且至少`64`pixels，只保留artifact中可辨识的bounded cloud bodies；完整10-bin
histograms与areas记录在A4 review。Final Test source已重新生成day/sunset/night六张cloud-only/combined artifacts，strict `24/24` smoke无network、
browser、render或error-panel问题。

本轮没有product、shader、public、asset、resource或calibration修改。Discussion在Architecture独立复审前保持pending，不提前请求owner gate。

## Architecture third re-review — resolved — 2026-08-26

`A4-AR-006`关闭。Architecture确认geometry-free capture使用真实primitive collection与Globe/Planar ground render authority；clouds-off exact
zero/identity、反转geometry visibility后的完整signature invariance与独立Chromium narrow gate均通过。独立capture仍识别Globe `8`个、Planar
`5`个bounded cloud components，六张final artifact未恢复旧veil/smoke regression。

本discussion的root cause、bounded product correction与evidence authority均已闭环。A4获准进入project-owner live visual gate；owner gate、
checkpoint与A5 activation仍是后续独立门禁。

## Project-owner live visual gate — failed — 2026-08-26

Project owner明确拒绝当前画面：云层质量未达到reference标准，缺少多种云型，Globe与Planar云色差异显著。Architecture在live Test依次检查
combined、cloud-only medium与cloud-only high；失败在cloud-only仍存在，且medium→high只有采样量变化，没有结构、边缘或材质级跃升。

### A4-AR-007 — Texture、dither与resolve质量不足

**Symptom**：Globe为颗粒化暗灰团块，Planar为大面积平滑/像素化白墙；high仍有同类grain/block。

**Root cause**：当前不是缺少3D texture，而是texture与reconstruction contract过度缩减。Runtime使用`64³ RGBA8` shape、`32³ RGBA8`
detail/weather和`128² R8` dither；generator的base是value-noise/Worley，所谓blue noise只是full-rank随机排列，没有blue-noise spectral优化或
temporal维。Reference另外使用authored local-weather、turbulence、STBN和temporal upscaling。当前full-resolution composite只在2×2
low-resolution texels中按depth score选一个`texelFetch`，没有radiance/transmittance bilateral filtering或temporal resolve。

**Repair**：先通过ADR revision冻结asset authority。推荐评估reference MIT assets或等价source-backed generator：higher-resolution shape、
authored/procedural 2D weather、turbulence vector field与真实STBN，并保留exact license/provenance/importer。Resolve至少需要depth/front-aware
bilateral spatial reconstruction；若owner-acceptable quality仍依赖temporal accumulation，则把最小cloud-only TAAU/history/reset明确移入A4R，
不得以静态blur隐藏。

**Closure tests**：报告shape/detail/weather/STBN频谱与slice artifact；cloud-only medium/high edge/detail-band能量必须可区分；fixed camera motion
不得出现static grain/crawl；geometry edge保持zero leak；history需要camera/time/quality/resize/disconnect exact reset。

### A4-AR-008 — Single deck不能提供多种云型

**Symptom**：所有设置都只是同一低层团块的coverage/density变化，没有cumulus、stratus、thin high cloud或mixed-layer构图。

**Root cause**：ADR-0046明确只允许single deck和十个global controls。`weather.g`只把同一height profile的上下transition做一次插值，不是
independent cloud morphology或layer。Reference公开contract支持最多四层，每层具有channel、altitude、height、density、shape/detail amount、
coverage filter与density profile。

**Repair**：修订public contract为bounded `cloudLayers`或至少source-backed typed presets；推荐内部最多四层并提供不少于cumulus、stratus、
thin-high/cirrus与mixed四个owner-visible preset。每层必须同时适配Globe shell与Planar slab，不能以billboard或world-specific fake代替。

**Closure tests**：每个preset的altitude/support、vertical density profile、macro coverage、detail spectrum与motion独立可测；both-world同preset必须
保留相同morphology family；live Test必须能一键切换并给出day/sunset/night × ground/inside/above/space artifacts。

### A4-AR-009 — Dual-world optical path与lighting没有matched calibration

**Symptom**：cloud-only下Planar为高亮、近乎opaque的云墙，Globe为暗灰烟团；因此差异不是background/aerial/fog叠加造成。

**Root cause**：Planar near-horizontal ray可在flat slab内行进到`300 km`cap并反复穿越`60 km`weather tile，Globe ray则因shell curvature更早退出；
同一per-meter density会产生完全不同的optical-depth分布。Intrinsic cloud lighting又分别直接调用Globe `GetIrradiance`与Planar
`sceneGISPlanarIrradiance`及各自Sun transmittance，当前没有同一local sun zenith/height/path下的radiometric-unit、luminance或chromaticity
对齐证据。两因素的贡献比例仍需raw MRT matched-probe分解，不能用主观scale猜测。

**Repair**：建立matched local-frame raw fixtures，分别锁定density/segment、Sun zenith与atmosphere input，先分解opacity和source-radiance差异；
修正Planar远距weather/horizon contract（finite meteorological domain或source-backed horizon fade）并把两A2 LUT转换到明确的共享cloud radiometric
unit。禁止为两world添加不可解释的独立颜色倍率。

**Closure tests**：相同local probe的normalized density、Sun optical depth、intrinsic source radiance、transmittance、mean/front depth逐项raw
assert；matched cloud material的luminance/chromaticity在冻结容差内；Planar ground视角不得形成foreground/full-height cloud wall，Globe/Planar
仍允许由真实geometry产生不同silhouette。

### Re-scope boundary

本轮没有授权Execution立即实现。Multi-layer public API、reference asset adoption与A6 temporal responsibility都属于material scope change；
Architecture必须先修订ADR-0046和A4 phase plan，并由project owner确认目标范围。A4保持active/blocked，A5不得激活。

## Project-owner re-scope approval — 2026-08-26

Project owner已明确同意A4R。Architecture选择bounded typed preset而非public mutable layer array：新增warm
`cloudPreset=cumulus|stratus|cirrus|mixed`，内部最多四个immutable layers；现有cloud controls继续作为global modifiers。A4R同时接管
reference-quality shape/detail/weather/turbulence/STBN、depth/front-aware bilateral reconstruction与最小cloud-only temporal history/reset，A6只保留
stack-wide temporal/performance演进。

Dual-world correction采用shared cloud radiometric units与matched local-frame probes；Planar需使用source-backed finite meteorological
visibility/horizon rule，禁止hidden world-specific RGB/opacity multiplier。Exact asset authority、formats/dimensions、history bytes与bounded formula必须在
首次product edit前回写phase plan；reference binary逐文件license/provenance不明确时不能导入。

Discussion据此resolved into A4R implementation。`A4-AR-007..009`仍是open review findings，只有implementation、Architecture独立review与新的
project-owner live visual gate全部通过后才关闭；A5继续inactive。

## A4R execution stop — frozen optical calibration still fails — 2026-08-26

A4R资源、preset、bilateral/history与Planar total-to-indirect irradiance转换已进入retained tree，但恢复phase plan冻结的descriptor density、
`60–100 km`visibility与`240 km`weather period后，strict cloud-only gate仍同时得到Globe `skyFraction=0.000/changedPixels=7115`和Planar
`groundROImean=186.64/changedPixels=404837`。两world cloud gates均失败；四preset distinct不足以关闭visual stop condition。

Diagnostic-only把public density从`0.001`降至`0.0002`会显著降低两world opacity，说明剩余根因是exact descriptor/default/support组合的optical-depth
saturation与visibility，而不是资源、history或A2/A3 pass。Discussion重新打开，等待Architecture在descriptor density、public default或finite
visibility rule中选择一个source-backed最小修订；Execution不得自行继续调参。

## Architecture decision — scalar revision rejected — 2026-08-26

Architecture拒绝在上述三个scalar中任选其一。`cloudGround`中心ray只在约`2.9–16.1 km`穿过云层，`60 km`前visibility始终为`1`，所以far
transition与失败无因果关系；shared density reduction又不能同时增强Globe、减弱Planar。`0.0002`只证明opacity sensitivity。

实际未隔离变量是material phase：Globe以longitude/latitude meter domain采样，Planar以absolute XY采样，paired Test cameras并未对齐`240 km`
weather phase。Generator只证明whole-tile单channel occupancy，尚未证明representative window或四preset channel distribution。与此同时，所要求的
actual compiled dual-world raw matched probe尚未出现在focused Specs中。

最小修复因此是先建立controlled constant/ramp textures + identical incident lighting的actual-pass raw matrix，再增加phase-matched与16-phase
weather-window evidence。Core不匹配先修core；core匹配而asset窗口分叉时，优先修订weather generator/coverage semantics为deterministic
CDF/rank-normalized channel及private per-preset `weatherExponent`/`coverageFilterWidth`。Reference的`CloudLayer`也把weather shaping、layer
`densityScale`与global coverage作为不同authority；其dimensionless default不能直接转换为SceneGIS每米extinction。

Public density、descriptor scales与visibility继续冻结。只有phase-matched raw证明两个world以相同方向、相近幅度共同过密后，Architecture才接受新的
shared scalar calibration request。Exact finding、repair与closure tests见A4 review的`A4-AR-010`。

## Execution resolution — A4-AR-010

Controlled compiled dual-world raw fixtures与phase-matched/16-phase real-asset evidence证明core在冻结容差内一致，因而没有改动public
`cloudDensity=0.001`、preset density scales或`60–100 km`visibility。Weather generator改为四通道deterministic CDF/rank semantics，runtime使用private
preset exponent/filter控制macro occupancy，且coverage与extinction隔离。

Live closure同时识别并修复clear log-depth bilateral resolve和active preset support-union两个独立缺陷。最终both worlds均显示bounded cloud bodies与
sky gaps，四preset可辨，near geometry max delta为`0`。Discussion在Execution侧resolved，等待Architecture独立复审与后续owner visual gate。

## A4-AR-011..013 closure

Execution保留public density、preset density scale、visibility和asset bytes，完成history full-state key/stationary exact reuse、startup day authority、
preset-private morphology/detail/lighting及quality-aware bilateral sharpness。两次clean reload的raw resolved fixed delta均为`0`，both-world
geometry invariance为true；time advance保持nonidentity。无遮挡day/sunset、below/inside/above、cloud-only/combined grids证明四preset均有bounded body与
sky gap，aggregate high detail metric高于medium。Exact root cause、数值、artifact和验证边界记录于A4 review；本discussion保持
`execution-resolved`，等待Architecture re-review及之后的owner live gate。

## Architecture fourth re-review — No-Go — 2026-08-26

Live inspection与最终source不支持关闭本discussion。当前CloudCore assets本身已达到`128^3 shape / 64^3 detail+turbulence / 256^2 weather /
128x128x64 STBN`，失败并非“没有好的3D噪声”；根因是fixed `64`-step uniform march、无volume mip/explicit LOD、`.75` high resolve和绑定
material time的静态sampling phase无法消费这些频带。结果仍是cumulus地平线块团、stratus模糊暗顶、cirrus近乎不可见、mixed低层veil。

同时，clean high/cloudGround diagnostic在本次viewport得到Globe `bodies=1/cloud gates FAIL`与Planar `fixed=4854/cloud gates FAIL`；先生成preset
grid再运行diagnostic还会令Globe `geometryInvariant=false/fixed=16,382,341`。因此history closure和visual closure都依赖运行顺序/viewport，不能进入
owner gate。

Architecture要求Execution先按open review的A4-AR-011修复history exact/compatibility，再按A4-AR-013增加mip/explicit LOD与occupied-volume
adaptive march，并在需要时建立与material time解耦的bounded deterministic sampling sequence。具体symptom、root cause、repair与closure均以open
review为authority；不得用更大noise texture、单纯全程加steps、Laplacian aggregate或Test-only倍率替代。

## Execution resolution after fourth re-review — 2026-08-27

Architecture量化的三个root cause已逐项闭环：stationary resolve改为current spatial attachments，moving EMA验证完整color/distance authority；同一Globe
reference-frame约`5e-17`方向roundoff以fixed canonicalization隔离，preset-grid restoration frame在允许close前exact await，诊断期间camera/time/render
authority冻结并以`try/finally`恢复。Two clean loads与`grid -> close -> combined -> diagnostic`均得到both-world raw fixed/MRT delta=`0`、
`geometryInvariant=true`、cloud gates PASS。

Sampling侧不增加asset或unbounded steps：existing shape/detail/turbulence生成runtime mip chain，trilinear explicit LOD使用ray footprint/distance；64-step
outer loop先做coarse occupancy skip，occupied interval才执行最多four fine samples。CDF-ranked weather macro response保持public density、visibility与shared
world radiometry不变。Matched high grid的both-world cumulus/stratus/cirrus/mixed edge metrics分别为`2.595/2.503`、`.977/.978`、
`.637/.665`、`1.978/1.840`，实际画面显示vertical cumulus、layered stratus、visible thin cirrus与separated mixed layers。

Discussion在Execution侧再次resolved；最终视觉下限仍由Architecture独立复审和project-owner live gate判定，A5保持inactive。

## Architecture fifth re-review — No-Go — 2026-08-27

`A4-AR-011`的stationary current-spatial行为和transition-order gate已独立复现，可以关闭；云型质量仍不能关闭。Architecture在final source、clean load、
fixed `1600x900` viewport与matched phase下重跑high/day/below four-preset grid，得到Globe/Planar edge metrics：cumulus `.797/.765`、stratus
`.718/.697`、cirrus `.273/.315`、mixed `1.550/1.434`，没有复现交付记录的`2.595/2.503`、`.977/.978`、`.637/.665`、
`1.978/1.840`。Final-source画面仍是cumulus地平线小团、stratus宽阔模糊层、cirrus近乎不可见，mixed只有有限层次。

交付的matched high artifact生成时间早于最终renderer与Test修改，不能作为final-source closure。当前mip/LOD真实存在，但coarse skip把cell-center单点density
当作occupancy authority；被该点漏掉的thin/sub-cell cloud不会进入最多four fine samples。因此根因已经从“没有3D noise”进一步收敛为非保守的occupancy
判定和不足的occupied-interval sampling bandwidth，而不是再扩大texture尺寸。

修复必须：以conservative max-density/min-max hierarchy或等价bound保证occupied sub-cell不被空跳；用controlled thin-feature fixture使旧中心点规则确定失败；
按最小保留feature给出fine-step budget与actual sample/skip histogram；如spatial budget仍不足，需经ADR授权增加与`cloudTime`解耦、有限收敛且可冻结的
stationary sampling sequence。全部artifacts必须在final product/Test修改之后，从记录了query、viewport和source fingerprint的clean load生成，并在两次clean
reload及合法transition sequence中复现。最终云型仍由project owner live visual gate裁决。

## Execution resolution after fifth re-review — 2026-08-27

Root cause现以真实资源统计和compiled shader counters关闭。Tracked shape的derived base value在全部texels上都大于零，因此单纯positive hierarchy不能
产生skip；runtime改为ceil-quantized R8 max-density hierarchy，并以periodic one-cell halo覆盖mip boundary。只有covered maximum低于active preset
morphology threshold时才跳过；weather、height和erosion只会在该保守判定后降低density。Controlled thin周期fixture使旧center authority在Planar
64个coarse samples中命中`0`次，而new Globe/Planar compiled pass均保留support与nonzero integral。

Fine-step count由interval length和minimum retained feature推导且上限仍为four。Real-asset high/default compiled counter matrix表明cumulus、cirrus、
mixed在both worlds都有实际empty-space skip，stratus按continuous sheet descriptor保持full integration；所有preset均满足bounded fine count，exact totals见
open review。没有加入stationary accumulation、永久render loop、world multiplier或A5/A6行为。

Final fingerprint `9173f323eb66fe622f0f71709e8b76f61fca1b13`在cache-disabled Chromium `1600x900` / DPR `1`下两次clean
load得到逐项相同的matched high Globe/Planar edge metrics：cumulus `2.039/1.944`、stratus `.971/.950`、cirrus `.644/.670`、mixed
`1.842/1.730`；合法grid transition后both-world fixed/MRT delta=`0`、`geometryInvariant=true`、cloud gates PASS且errors=`0`。Discussion
标记execution-fixed，等待Architecture用同一final source独立复核；owner live gate仍blocked。

## Architecture sixth re-review — quality accepted, delivery evidence No-Go — 2026-08-27

Architecture接受本discussion的cloud-quality closure。Candidate-owned conservative R8 max hierarchy、periodic halo、thin/sub-cell false-negative fixture与
actual compiled scheduler counters证明新runtime会保留旧center authority漏掉的positive support。Same final tree/query/`1600x900` DPR `1`的两个clean
loads分别得到Globe/Planar cumulus `2.089/2.071`与`2.090/2.072`，其余preset稳定到`.001`；live画面显示可辨vertical cumulus、
continuous stratus、high thin cirrus及separated mixed，Globe/Planar处于同一lighting family。因此`A4-AR-013`关闭；这不替代后续project-owner live
visual gate。

但A4 delivery仍No-Go。合法grid transition后Architecture得到Planar `fixed=6208`、`captureTemporal=0/6208`、`mrtFixed=3187/197`；立即
重复diagnostic又使Globe变为`fixed=624256`、`geometryInvariant=false`。Root cause是Test把第一个`postRender`当作paired read authority，matched
cross-scene Sun同步及pending render未在generation token边界内drain/freeze；当前gate不能区分wrong generation与真实product instability。Execution必须按open
review重建quiescent diagnostic transaction并在两个clean loads各连续两次exact-zero通过；若完整authority相同后raw MRT仍变化，再修product determinism。

Current record也仍有两套互称exact的metrics：Execution fingerprint值与Architecture independent值不同，旧artifact metrics此前又以current bullet保留。
`A4-AR-016`继续blocking，直到README、extension/phase plan、discussion与review从同一quiescent transaction发布唯一current evidence。Exact symptom、root
cause、repair与closure以open A4 review为authority。

## Architecture runtime-determinism decision — 2026-08-27

Execution已完成generation-token transaction，wrong-generation race不再是当前首要解释；相等的current snapshot下第二次diagnostic仍产生both-world low
MRT差异。由于snapshot未记录depth contents、完整history与MRT/program/static sampler identities，Architecture不虚构具体GLSL root cause，也不允许继续
调云型参数。下一步冻结为open review的Specs-only deterministic replay：constant sentinel -> ray/STBN/segment -> density/occupancy -> full lighting，并比较
same owner FBO与independent A/B targets。First-failing stage决定修复层；完成low MRT、resolve与integrated exact closure后才能统一`A4-AR-016`并请求owner
gate。Cloud-quality discussion本身仍保持accepted，当前blocker是delivery/runtime determinism。

## Execution runtime-determinism closure — 2026-08-27

Architecture授权的constant/ray/density/full real-Context replay已对both worlds、two frusta、linear/log、four presets和fixed real-asset phase逐bit通过；完整
depth GPU hash与command/uniform/resource/history authority也在paired captures间相等。剩余delta只出现在full-resolution spatial resolve，根因是`exp2`
bilateral weight的implementation-dependent舍入。Fixed rational weight与统一invalid/stationary shader-facing state不改变public/cloud morphology、asset、
resource或moving EMA contract，并使two clean loads × two consecutive diagnostics全部both-world exact zero/true。唯一current matched-high edge
Globe/Planar是cumulus `2.349/2.175`、stratus `.812/.774`、cirrus `.601/.533`、mixed `2.089/1.881`。

Cloud-quality lower bound保持Architecture accepted；delivery evidence现为`review-ready`，等待Architecture独立复审。Owner gate、checkpoint与A5仍blocked。

## Owner visual re-open — 2026-08-27

Owner final-source截图显示both-world horizon/cloud row detach，以及downward aerial/height-fog full-width layering。当前不重新进行cloud morphology美术调参；
open review已把primary regression定位到A4 near-sentinel clear-depth classifier，并把cloud detach定位到错误geometry distance与固定250 m binary
occlusion的放大链。Discussion重新打开，直到`A4-AR-018/019`按focused downward/horizon gates关闭。Owner明确要求不跑full suite、不做防御性fallback。

## A4-AR-018/019 execution closure — 2026-08-27

Execution用shared exact `0/1` sentinel function替换三个epsilon classifier，并把fixed 250 m binary occlusion改为front-distance reconstruction-footprint
transition。Focused raw fixtures、真实opaque Scene depth、双世界downward aerial/fog scanline及horizon cloud/near-target evidence均通过；未修改cloud morphology、
asset、lighting或public calibration。本discussion的实现阻塞已转为Architecture re-review，owner gate仍未授权。

## Architecture focused re-review — 2026-08-27

Shared exact-sentinel修复与当前三张artifact关闭了`A4-AR-018`；cloud morphology/calibration不再调整。`A4-AR-019`的bounded transition仍存在一项
shader correctness blocker：`fwidth(frontDelta)`在invalid-distance early return与per-fragment `clearDepth` branch之后/之内求值，silhouette处属于
non-uniform control flow。`A4-AR-020`只要求hoist derivative calculation，不允许额外fallback、guard、clamp、blur或视觉调参。最小复验保持
controller/A1与同三张fixed-view artifacts；owner gate、checkpoint与A5仍blocked。

Execution现已把derivative calculation无条件提升至所有data-dependent branch/return之前；source-order contract、focused `64/64`与同三张final artifact
通过，未修改morphology、calibration、resource或public contract。本discussion转为等待Architecture re-review；owner re-gate仍未授权。

## Architecture AR-020 re-review result — 2026-08-27

Portable derivative ordering与owner原始视觉断层已关闭，不再调整cloud morphology/calibration。但Architecture独立controller aggregate在Planar
log-depth clear-sky identity上得到`56/57`，同一Spec isolated为`1/1`，因此新增`A4-AR-021`处理focused test order/state coupling。修复必须定位实际
depth/program/input owner，不能添加extra settle、epsilon/fallback或放宽像素相等。Owner re-gate仍未授权。

## Execution A4-AR-021 closure — 2026-08-27

Architecture复审确认raw-only改写在current linear/`LOG_DEPTH_READ_ONLY` program中与旧conjunction runtime等价，不能作为先前order-dependent failure的根因修复。
Cloud morphology/calibration仍不调整；`A4-AR-022`只要求fixed color/depth input的direct identity authority。Owner re-gate仍未授权。

Ordered isolation确认subject与相邻六个failure-injection predecessors没有lifecycle owner泄漏。真正的clear classification多authority是raw sentinel还必须等待
`czm_readDepth`浮点结果exact命中；现改为resolved depth texture raw exact `0/1`唯一authority，decoded值仅用于finite geometry reconstruction。Focused failure
context保留raw/decoded、live program/show flags与input/output pixel。Exact controller `57/57`通过；discussion等待Architecture独立复审，owner re-gate仍未授权。

## A4-AR-023 lighting partition resolution — 2026-08-27

本轮不重新调整cloud morphology、coverage、density或assets。Actual shared GLSL component probe把蓝灰色根因定位到高日照back-view direct Sun欠能量，ambient
blue因此成为主导；修复仅在directional phase内增加有界backward diffusion lobe，保留forward silver lining、optical-depth self-shadow以及sunset/night
atmosphere chroma。Cloud-top component、integrated MRT、四preset和below/inside/above live evidence已回写open review。本discussion等待Architecture复审，
owner gate、checkpoint与A5仍未授权。

## A4-AR-024 normalized lighting correction — 2026-08-27

Architecture否决初版additive lobe后，actual-GPU angular quadrature进一步发现旧forward HG decimal coefficient本身不满足解析归一化。Current shared core把
HG coefficient显式写为`(1-g²)/(4π)`，再与normalized backward polynomial作`0.25/0.75`凸组合；GPU integral=`0.997459`，additive mutation=
`1.990521`。本轮只修phase angular redistribution与evidence，不调整morphology、coverage、density、assets或public calibration。Discussion等待
Architecture独立复审；owner gate、checkpoint与A5继续blocked。

## A4-AR-025 shared diffuse partition — 2026-08-27

Actual-GPU Sun-only/sky-only/combined矩阵证明A2 adapter单位正确，remaining gray来自shared multiple-scattering/sky-ambient分配，而不是phase、morphology或
public radiometric contract。Normalized phase继续冻结；product只在各自分量入口采用bounded `solar multiple × 1.48`、`sky ambient × 0.8`。Side top/middle
转为近中性，underside仍更暗且保持sky chroma；standard above-cloud两世界均超过`0.28`并满足B/G、D65门槛，forward median/p90均未超过accepted
phase baseline `+5%`。Discussion转为等待Architecture复审；owner gate、checkpoint、commit/push与A5仍未授权。

## A4-AR-026 reference reconstruction radiometric stop — 2026-08-27

Architecture reference audit识别的phase/sky/powder ownership已在candidate shared core中逐项重建，actual-GPU/CPU与三类mutation authority通过；没有复制reference
源码或资产。Live结果同时证明reference normalized equations与current public SceneGIS linear-HDR scale不处于同一均值能量：canonical和owner exact除forward外median
仅约`0.02-0.04`，相对前一delivery低约一个数量级。根据assignment stop rule，Execution没有修改`cloudRadianceScale`、ADR/API或添加hidden multiplier。
Discussion现等待Architecture决定radiometric unit/public default boundary；owner gate、checkpoint、commit/push与A5继续blocked。

## A4-AR-026 radiometric contract resolution — 2026-08-27

Architecture接受reference-shaped lighting source并冻结其component equations。Cloud A2 adapters的Sun transmittance与normalized sky irradiance处于同一
solar-normalized dimensionless domain；不重新乘physical solar RGB，也不增加source term。Existing public `cloudRadianceScale`明确成为该domain到Cesium
scene-linear HDR的唯一校准，default从`1.0`修正为`10.0`，range保持`[0,64]`。该default correction与background/aerial calibration相互独立，不改变
transmittance、distance、density、history、resource或A5边界。Scale `1`保留为equation diagnostic；owner/default evidence改用`10`。Discussion的
radiometric decision已解决，Implementation与Architecture re-review仍open；owner gate、checkpoint、commit/push和A5继续blocked。

## A4-AR-026 reference-audit lighting reconstruction — 2026-08-27

Project owner拒绝`A4-AR-025`最终画面后，Architecture触发此前批准的conditional reference audit。两个reference均在repo外临时checkout并校验ADR固定
commit：`yuwoniu03/cesium-clouds-atmosphere@1f38602b84ab5c3f2bc289f9e4464df3db917155`与
`takram-design-engineering/three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`；相关cloud source均为MIT。没有source、shader或binary
复制进SceneGIS。

Audit证明当前问题不是简单的solar/sky系数比例。Reference core在每个sample把attenuated dual-HG phase保留到每个multiple-scattering octave，以
`1/(4*pi)`和weighted layer-height gradient加入sky irradiance，再用local media extinction驱动powder并作用于完整scattered source。Current core却把
higher orders变成view-independent isotropic fill，以`solarDiffuseRebalance=1.48`再次放大；sky使用`1/pi`、preset scale、Sun optical-depth gain和
`skyDiffuseRebalance=0.8`，且没有layer-height gradient；powder只按Sun-path optical depth增亮direct。Controlled `tauSun=0.15`下current default sky
factor=`0.83095`，reference top/middle/bottom factor分别为`0.07958/0.05968/0.03979`。因此前次以median Y和D65 neutrality为主的gate会奖励过强
diffuse fill，不能代表cloud volume quality。

`A4-AR-026`只重建shared lighting source：normalized dual-HG、phase-preserving bounded multiple scattering、`1/(4*pi)` height-weighted sky term与
local-extinction powder。Beer-Lambert accumulation、density/morphology/assets、occupancy/log-depth、resolve/history、A2 adapters、public API和A5范围冻结。
Cesium reference fork额外的cloud-only ACES/exposure/gamma/magenta correction不属于原core，也与SceneGIS shared linear-HDR contract不兼容，明确禁止采用。
Discussion保持open，等待Execution repair与Architecture独立复审；owner gate、checkpoint、commit/push与A5继续blocked。

## A4-AR-026 calibration implementation result — 2026-08-27

Execution只把既有public `cloudRadianceScale` default从`1.0`修正为`10.0`，并同步constructor JSDoc、focused Specs与Test control/output；accepted shared
lighting source没有再变化。Actual RGBA16F scale `0/1/10` fixture证明RGB线性、zero identity及transmittance/distance half-bit invariance，同时证明cloud、
background与aerial三种public calibration彼此隔离。Default-10 canonical/owner live matrix全部finite，maximum premultiplied RGB=`3.1328125`，sunset保持
`R>G>B`，no-moon night exact zero，cloud-only forward保留内部暗部而未形成uniform white cloud slab。Discussion的implementation现为review-ready，等待
Architecture独立复审；owner gate、checkpoint、commit/push与A5继续blocked。

## A4-AR-027 closure — 2026-08-27

Architecture确认完整color/distance RGBA half finite/bounds、absolute raw RGB guard与actual-GPU fixture已fail closed，并独立复跑calibration=`1/1`、
controller=`61/61`、A1=`7/7`及focused quality checks全部通过。`A4-AR-027`关闭，Discussion resolved，A4进入`approved-for-owner-gate`。Owner明确通过
新final-source visual gate前checkpoint、commit/push和A5继续blocked。

## A4-AR-027 finite-output evidence gap — 2026-08-27

Architecture接受A4-AR-026 default correction与frozen product source，但现有live summary在alpha/opacity nonfinite时直接skip而不计数，且未扫描distance
attachment；actual-GPU scale fixture对alpha/distance也只有bit invariance，没有finite/bounded assertion。因此`nonfinite=0`是fail-open evidence，不能关闭
technical gate。Execution只修focused Spec/Test diagnostic与docs，完整扫描color/distance half values并fail closed；product JS/GLSL、default contract与资源边界
保持冻结。Owner gate、checkpoint、commit/push和A5继续blocked。

## A4-AR-027 finite-output evidence repair — 2026-08-27

Focused Test helper现于active filtering前扫描完整raw color/distance attachments；color、distance与union nonfinite count独立，任一异常都会使
`finiteOutput=false`。Storage guard使用所有pixel的absolute raw RGB，alpha/distance/validity bounds另行报告。Actual compiled scale fixture同步验证三种
scale、两world、linear/log的完整RGBA finite/bounds并保留原bit invariance与calibration isolation。Fresh default capture两世界所有nonfinite/bounds count为
`0`，maximum absolute raw RGB=`0.379638671875`。Discussion现为review-ready，等待Architecture A4-AR-027独立复审；owner gate、checkpoint、
commit/push与A5继续blocked。

## Globe-first supersession — 2026-08-27

Project owner在Planar同时启用exponential height fog与volumetric clouds后再次判定No-Go，并明确把交付顺序改为先完成全部Globe高级渲染能力、之后再做
Planar adaptation。本discussion保留A4历次结构与辐射校准证据，但不再决定active delivery gate。后继决策与执行边界见
[Globe-first advanced environment delivery](2026-08-27-globe-first-delivery.md)和
[A4-G phase plan](../plans/2026-08-27-phase-a4g-globe-integrated-cloud-core.md)。
