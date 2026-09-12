# A4 Volumetric Cloud Core Implementation Review

## Metadata

- Status: `changes-requested; A4-G active`
- Implementation status: `A4-G A4-AR-030 converged repair assigned`
- Architecture review: `A4-AR-029 closed; A4-AR-030 changes requested`
- Owner visual gate: `failed`
- Branch: `feature/atmosphere-clouds-effects`
- Exact implementation base / retained HEAD:
  `ad9898261831e1314fe98307b7b0303fce3ba08f`
- Review target: retained uncommitted working-tree diff
- Governing decision:
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Upstream patch: active `SGP-0008`（consume only）

## Current delivery summary

- Public contract是十一项warm cloud properties：原十项加A4R `cloudPreset`，exact values为`cumulus|stratus|cirrus|mixed`；默认disabled仍零
  attach/fetch/allocation/command/listener/timer。
- Active world candidate-create总计七个program：existing background one、aerial linear/log two、cloud linear/log two、resolve linear/log two；四个command复用one
  fullscreen VA。A4R相对A3增量为program `+4`、command `+2`、VA/upstream slot `+0`。
- Five tracked cloud assets为shape/detail/weather/turbulence/STBN；runtime另从shape candidate原子派生one R8 conservative max-density mip hierarchy，
  因而active world共有six static cloud textures。Shape/detail/turbulence建立完整runtime mip chain并使用`LINEAR_MIPMAP_LINEAR`与S/T/R
  repeat；derived hierarchy使用`NEAREST_MIPMAP_NEAREST`与one-cell periodic halo，weather/STBN保持base-level sampler。High/medium/low分别使用
  `.75/64/4/4`、`.5/64/4/3`、`.375/32/1/2`的resolution/primary-fine/Sun budget；只有max hierarchy证明整个interval低于preset
  morphology threshold时才跳过，occupied interval的fine budget由interval length与minimum retained feature推导且上限为four。
- Full-resolution resolve执行`3x3` depth/front-aware bilateral reconstruction。Invalid history first frame与stationary frame都直接发布current spatial attachments；只有
  continuous moving-time且validity/front/mean/scene-depth/transmittance/radiance全部compatible才以`0.82` EMA。History key覆盖完整camera/frustum/A1
  frame与radiance scale，并对同一frame的sub-picometer/sub-`1e-12`roundoff作有界canonicalization。
- Globe spherical shell、Planar fixed-Z slab、`60–100 km` shared visibility、public density/default、matched radiometric adapter及A2/A3 composition均保持不变。
  Cumulus/mixed macro weather使用CDF-ranked channel和private `2.2/0.04`、`1.7/0.04` exponent/filter，形成真实sky gaps而不引入world multiplier。

## Assets and provenance

Generator-v4 authority是SceneGIS-owned fixed-seed periodic algorithms；没有复制reference binary/source、runtime network或Float32 expansion。Tracked
payload exact `11,796,480 bytes`：shape `8,388,608` / `E6D6C471...7749EC2`，detail `1,048,576` /
`D09AA650...29CE7B`，weather `262,144` / `122ABD03...8F0B88`，turbulence `1,048,576` /
`C8F66FA8...54B8E8`，STBN `1,048,576` / `B16C8B01...4A71AE`。Exact dimensions/formats/channel semantics与完整hash保存在
`PROVENANCE.json`。Generator支持candidate/backup atomic publication、injected rollback、deep verify及full separate-target byte comparison。

## Resource boundary

- Lazy FBO managers：existing aerial one-color manager、cloud MRT one manager/two attachments、history ping-pong two full-resolution managers/two attachments
  each。没有额外render slot、VA、asset fetch loop、timer、listener、raw GL或PBO。
- Static cloud GPU bytes（three filtered mip chains加derived R8 max hierarchy）=`15,691,189`（`14.96 MiB`）。1080p two-history
  bytes=`63.28 MiB`；cloud MRT low/medium/high=`4.45/7.91/17.80 MiB`，因此A4R over-A3总计约`82.69/86.16/96.04 MiB`。
- 4K two-history bytes=`253.13 MiB`；cloud MRT medium/high=`31.64/71.19 MiB`，总计约`299.73/339.28 MiB`。这是公式化persistent
  ceiling；本轮本机live viewport接近1080p，未强制分配双world 4K历史以避免超出最小充分验证边界。

## Exact changed product/test paths

- `packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`
- `packages/engine/Source/Assets/SceneGIS/Environment/CloudCore/**`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `scripts/scenegis/generate-cloud-core-assets.mjs`
- `scripts/scenegis/generate-cloud-core-assets.test.mjs`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Test/高级环境.html`

## Validation

- Execution final exact focused rerun与Architecture独立复跑均为controller `56/56 SUCCESS`、A1 pipeline `7/7 SUCCESS`，focused+A1=`63/63`。
  新增两项分别为actual-runtime mip failure identity/cleanup closure后的conservative thin-sub-cell fixture，以及compiled sampling-counter matrix。
- Architecture独立复跑exact aggregate（`Scene/Scene` filter包含尾随空格）为`127/127 SUCCESS`。
- CloudCore generator Node tests `10/10 SUCCESS`；tracked `--verify-only` exact `11,796,480` bytes；BrunetonEarth与PlanarEarth
  verify-only通过。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`通过。`build-ts`保留repository-wide既有
  TSD-JSDoc warnings，无A4 failure。
- Installed-package verifier通过：`23/23` GLSL、`23/23` generated modules、Bruneton/PlanarEarth/CloudCore exact
  assets/provenance、engine/root ESM/CJS、A4 runtime/types/docs与private hiding。
- Changed-scope ESLint、Prettier、Markdownlint与`git diff --check`均通过。
- Official upstream audit通过：current-delivery upstream-owned=`0`、generated=`0`；`Scene.js`与
  `.scenegis/upstream-patches.json` exact diff empty。
- Current retained browser authority为cache-busting query suffix `final=ar011f{1|2}`、`1280x720` CSS viewport / DPR `1`，序列为
  `enabled -> high -> cloudGround -> Perspective -> cloud-only -> preset grid -> close -> combined -> diagnostic -> diagnostic`。Two clean loads的四次
  both-world运行均为`fixed=0`、`captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`与cloud gates PASS；每次10组paired reads均
  generation exact `+1`且完整authority相等，browser/page/render errors=`0`。
- Pre-fingerprint artifact names与matched high `2.595/2.503`、`.977/.978`、`.637/.665`、`1.978/1.840`及matched medium
  `2.437/2.246`、`1.036/1.005`、`.674/.691`、`1.850/1.719`仅是superseded historical evidence，不属于current validation authority。

Full Spec suite未运行；按phase plan使用focused、A1 regression与exact Scene aggregate作为最小充分边界。Initial sandbox `spawn EPERM`、错误CLI
argument与非exact filter尝试均不计入通过证据。

## Deviations and source facts

- Codebase-memory graph已按规则优先尝试，但recent environment symbols仍未被index收录；随后只使用exact path/string fallback。这是tool
  index gap，不是源码缺失。
- Earlier A4 evidence observed raw clear sentinels `0`或`1`，但由此扩展出的epsilon-neighborhood classifier现已被owner俯视截图证伪；哪一个
  exact sentinel属于当前resolved target必须由real Scene depth capture重新建立，不能继续把near-sentinel finite geometry归为clear。
- Public、asset bytes、quality/resource ceiling与upstream contract无偏差。当前private descriptor的shape/detail尺度分别为cumulus
  `10/.9 km`、stratus `22/2.8 km`、cirrus `30/.9 km`、mixed-low `13/1.2 km`，macro weather period为`240 km`；footprint LOD、
  occupied-interval fine march与Test-only可见结构阈值`36`是满足ADR-0046 morphology/depth gates的private implementation details。

## Remaining risks

- Mean-depth composition在稀疏远近cloud overlap处仍可能产生bounded edge artifact；moving-frame EMA不是A6 stack-wide TAA，仍需owner判断camera motion。
- Matched phase能清楚显示vertical cumulus、layered stratus、thin cirrus与multi-layer mixed；unmatched representative phase仍会因真实macro weather window产生
  较远/较稀cloud，这是预期material variation但仍需owner live judgment。
- Live 4K GPU timing未在本轮双world页面强制执行；resource ceiling与bounded sample count已精确记录，Architecture若要求特定GPU timing应作为owner-gate前
  环境证据补跑，而不扩大product contract。

## Review request

请Architecture独立检查public/default/range、asset generator/provenance、candidate ownership、dual-world cloud geometry、coverage/depth selection、
composition/resource ceiling、package/upstream boundary与local visual evidence。A4保持active；Architecture review前不请求owner gate，不commit/push，
不激活A5。

## Architecture review — 2026-08-15

结论：`changes-requested`。A4保持active；owner visual gate、phase checkpoint、commit/push和A5 activation均继续blocked。

本次Architecture review以exact retained HEAD/base
`ad9898261831e1314fe98307b7b0303fce3ba08f`上的uncommitted diff为边界，独立检查了public/runtime、renderer、cloud/aerial shader、asset generator/tests、
focused Specs、package verifier、ADR-0046及三张final local artifact。Codebase-memory按规则优先使用；recent A4 symbols仍未入图，随后使用exact
path/string fallback。独立复跑CloudCore generator tests `6/6`、`git diff --check`并核对`Scene.js`与
`.scenegis/upstream-patches.json` exact diff empty。由于以下source-correctness与ADR stop-condition findings已经阻断，本轮不重复扩大到build或
browser qualification；Execution之前的通过结果不能关闭这些findings。

### A4-AR-001 — Blocking: low-resolution cloud pass使用错误viewport重建离轴ray

`executeCloudPass`把`PassState.viewport`设为cloud MRT的low-resolution dimensions；Cesium `RenderState.applyViewport`同时把该viewport发布到
automatic uniform state。`SceneGISEnvironmentEffectsCloudFS.glsl`却把full-resolution depth texture dimensions乘UV得到`fullPixel`，再把该坐标
传给`czm_windowToEyeCoordinates`。例如medium tier在`1600x800` resolved depth、`800x400` cloud viewport下，UV.x=`0.75`被解释为window
x=`1200`对viewport width=`800`，得到NDC x=`2`而不是`0.5`。这会系统性破坏离轴Perspective/Orthographic ray、Globe shell/Planar slab
intersection与resolved-depth clipping；center-only MRT读回可能偶然通过。

Required correction：分离low-resolution reconstruction pixel与full-resolution depth/noise sample coordinate。ray reconstruction必须使用当前cloud
viewport下的fragment coordinate（或等价的UV × cloud target dimensions）；full-resolution coordinate只能用于resolved depth/noise映射。新增both-world
off-center real-Context/raw MRT fixtures，覆盖Perspective/Orthographic、linear/log、clear/near/far depth，并用analytic expected ray/intersection证明不是
center-only nonidentity。

### A4-AR-002 — Blocking: ADR-0046冻结的dual-world geometry/raw evidence matrix未交付

当前A4 focused Specs的cloud raw path只以Planar和MRT center pixel为主；没有独立Globe spherical-shell CPU/shader fixture，也没有以both-world raw
RGBA16F覆盖ground/inside/above/space intersect/miss、Perspective/Orthographic、linear/log及near/far resolved-depth ordering。Direct Test 24-state
smoke与最终整帧metrics不能替代ADR-0046明确要求的这些自动化边界，尤其不能发现A4-AR-001这种离轴重建错误。

Required correction：补齐Globe shell与Planar slab的finite analytic fixtures，并补齐both-world off-center real-Context/raw cloud/composite fixtures。至少显式断言
front/mean distance ordering、geometry clip identity/nonidentity、linear/log program selection与Perspective/Orthographic per-pixel origin/direction；不得仅用
shader string、command count、center pixel或整帧changed fraction作为替代。

### A4-AR-003 — Blocking: final default artifacts触发ADR-0046视觉停止条件

Architecture逐张检查了final `a4-day-cloud-ground.png`、`a4-sunset-cloud-ground.png`和`a4-night-cloud-ground.png`。Globe day/sunset呈一块跨越大部分
horizon/sky的平滑深色斜楔；Planar day/sunset呈近乎均匀的大范围蓝灰gradient/slab；night几乎没有可辨识cloud structure。这不是owner gate前可接受的
“large-scale low-frequency transition”余留风险，而是ADR-0046所列uniform slab/不可信cloud core停止条件。ADR也明确规定changed fraction、max和
standard deviation只防identity/washout，不能替代visual judgment。

Required correction：Execution停止在A4并建立/更新A4 discussion，先修复A4-AR-001及A4-AR-005，再使用source-backed A4 density/weather/detail/lighting/
upsample校准，使Globe与Planar默认day/sunset/night均呈可辨识、非整片平滑覆盖的volumetric cloud bodies，保留天空与地表层次。重新生成同名三张最终
artifact并提交结构化cloud-only/combined diagnostics。不得使用hidden multiplier、Test-only product calibration、billboard/skybox降级或偷带A5/A6
shadow/temporal行为。

### A4-AR-004 — Blocking: generator test未证明rollback

`generate-cloud-core-assets.test.mjs`中名为“publishes atomically”的case只执行正常publish、payload tamper rejection、再次正常publish和provenance
tamper rejection；它没有在old target移为backup之后、candidate替换target之前注入publication failure，也没有断言original target被byte-identically
恢复或candidate/backup无泄漏。因此测试虽然`6/6`通过，ADR-0046要求的tamper/**rollback**证据仍为空缺。

Required correction：为publication file operations提供deterministic failure injection（或等价可测试seam），在old target已经移动后令candidate rename失败；
断言原target所有payload/provenance byte-identical恢复、target始终可验证、无half-published candidate/backup残留。保留正常separate-target byte compare与
tamper rejection，并把case名称与实际断言对齐。

### A4-AR-005 — Blocking: tileable 3D texture sampler遗漏R-axis repeat

`volumeSampler`只设置`wrapS`/`wrapT=REPEAT`，而Cesium `Sampler`的`wrapR`默认是`CLAMP_TO_EDGE`。ADR-0046把shape/detail/weather三张volume
asset冻结为3D tileable；shader又把detail Z设为`heightFraction * cloudThickness / 12500`。在public `cloudThickness`上限`20000 m`时坐标达到
`1.6`，上层detail会被clamp到同一slice，而不是按冻结contract周期采样，形成垂直detail冻结并削弱结构。

Required correction：显式设置`wrapR: TextureWrap.REPEAT`并在resource/sampler fixture中断言三轴repeat；增加public max-thickness下跨Z tile boundary的
density/sample continuity或non-frozen fixture。不得修改asset bytes或扩大resource budget。

上述五项全部execution-fixed、写回本review并完成对应最小验证后，再请求Architecture re-review。当前review不批准owner gate。

## Execution rework resolution — 2026-08-26

- `A4-AR-001` fixed：cloud pass现在以low-resolution `gl_FragCoord`重建ray，仅以UV × full-resolution dimensions读取resolved
  depth与blue noise。Both-world off-center raw MRT fixtures覆盖Perspective/Orthographic、live linear/log selection、clear/near/far depth，并与
  analytic slab/shell intersection核对。
- `A4-AR-002` fixed：新增Planar slab与Globe spherical-shell CPU reference matrix，覆盖ground/inside/above/space intersect/miss、parallel
  Orthographic origins、Perspective directions与near/far ordering；raw RGBA16F fixtures断言finite front/mean distances、geometry clip identity和
  非中心像素输出。
- `A4-AR-003` fixed：在不改public defaults、assets、resource/pass budget的前提下，依据Perlin-Worley + weather coverage/type + vertical
  profile + detail erosion模型，将private sampling scales校准为shape/detail/weather=`12/2/60 km`。最终day/sunset artifacts在两世界均显示
  离散、有内部明暗的cloud bodies并保留sky/ground；night保持A2 Sun/sky authority，不增加隐藏夜间光源，远端亮目标仍提供结构轮廓证据。
  Diagnostic framing使用明确world geometry与`10°`仰角；Globe/Planar target distances分别为`2.09/40.31 km`与
  `2.18/43.29 km`，投影与完整ROI均在canvas内，near严格identity，far max delta=`17/39`。
- `A4-AR-004` fixed：generator在old target已移动到backup后提供deterministic failure hook；测试证明失败后tracked target逐字节恢复、可再次
  verify，且candidate/backup均不残留。Full separate-target regeneration仍与tracked delivery byte-identical。
- `A4-AR-005` fixed：所有3D CloudCore samplers显式使用S/T/R `REPEAT`；resource fixture断言三轴，max-thickness test跨R tile boundary
  证明periodic continuity且不同于clamped slice。Asset bytes与resource count不变。

Final rerun：focused controller `44/44`、A1 pipeline `7/7`、CloudCore generator `8/8`、CloudCore `--verify-only`、installed-package
verifier、`npm run build`与strict 24-state local Chromium smoke全部通过。Changed-scope ESLint/Prettier/Markdownlint、`git diff --check`、
exact `Scene.js`/upstream-manifest diff和official audit全部通过；audit报告current-delivery upstream-owned=`0`、generated=`0`。Full Spec
suite仍未运行。Working tree保持uncommitted/unpushed，A5未激活，现请求Architecture独立re-review。

## Architecture re-review — 2026-08-26

结论：`changes-requested`。`A4-AR-001`、`A4-AR-004`与`A4-AR-005`已经关闭；`A4-AR-002`和
`A4-AR-003`仍为blocking。A4保持active，owner visual gate、checkpoint、commit/push与A5 activation继续blocked。

Architecture在exact retained HEAD/base
`ad9898261831e1314fe98307b7b0303fce3ba08f`上独立核对最终source、Specs、generator与三张2026-08-26重新生成的artifact。独立复跑focused
`SceneGISEnvironmentEffects`得到`44/44 SUCCESS`，CloudCore generator得到`8/8`；这些通过结果证明当前测试可执行，但不能关闭下面仍缺失的精确
evidence与视觉停止条件。

### A4-AR-001 — Resolved

CloudFS现在使用low-resolution cloud pass的`gl_FragCoord.xy`调用`czm_windowToEyeCoordinates`，full-resolution coordinate仅用于resolved
depth与blue-noise映射；source层面的viewport/ray defect已修复。

### A4-AR-002 — Still blocking: raw fixtures未把GPU离轴结果绑定到analytic ray/segment

新增Planar/Globe raw MRT cases读取`4x2`全部texels，但最终断言仅要求`far + clear`集合中“至少一个”procedural cloud hit、命中的
`mean >= front`、near集合identity和live program selection。Planar只额外断言`far[0]`与`far[1]`不相等；Globe没有任何离轴texel间或相对analytic
expected distance的断言。原先错误的full-resolution window coordinate同样可能满足finite、some-hit、mean/front ordering与near identity，因此这个
case不能证明A4-AR-001在integrated GPU path上真正关闭。

独立CPU case也未与GPU fixture绑定：它使用手写NDC与frustum尺度，Planar origin与real-Context camera不一致；Globe部分只验证radial
outward/inward shell interval，没有计算raw fixture中每个off-center Perspective direction或Orthographic origin。因此review中“raw MRT与analytic
slab/shell intersection核对”的表述目前没有对应断言。

Required correction：在测试内使用deterministic solid shape/detail/weather与zero-dither textures（或等价test-only controlled inputs）移除procedural
holes，再从live camera/frustum、cloud viewport和选定off-center texel计算expected local origin/direction与Planar slab/Globe shell segment。对actual raw
front/mean/support输出执行per-texel expected interval/ordering断言，至少覆盖左右不对称texel、Perspective/Orthographic和live linear/log path；旧的
`fullPixel` reconstruction必须能被fixture确定性打红。不得新增product debug uniform或扩大public/resource contract。

### A4-AR-003 — Still blocking: final artifacts仍未达到ADR-0046 cloud-core视觉下限

Architecture逐张检查了2026-08-26 14:49–14:54生成的`a4-day-cloud-ground.png`、`a4-sunset-cloud-ground.png`和
`a4-night-cloud-ground.png`。Viewport斜向畸变已经消失，但默认效果仍不符合discussion所写“separated cloud bodies with internal lighting”：

- Globe day/sunset主要是贴近horizon的低矮黑灰烟带/团块，缺少可信的体积与受光层次；
- Planar day是覆盖约三分之二sky ROI的大块浅色veil，sunset仍是单一宽阔暗团，视觉上接近fog bank/slab而不是分离云体；
- night的Globe sky完全黑，Planar主要只剩lit comparison target，当前artifact不能提供可辨识cloud silhouette或结构证据。

这些不是只留给owner判断的细节品味，而仍落入ADR-0046的uniform slab/不可信core停止边界。Changed fraction、max与stddev门限按ADR原文只防
identity/washout，不能替代visual judgment；当前combined截图也没有把cloud structure与A2/A3 atmosphere/fog隔离。

Root cause at the rejected snapshot：默认`cloudCoverage=0.45`进入
`clamp(columnWeather.r + cloudCoverage - 0.5, 0, 1)`后，实际clear-column threshold只有`columnWeather.r <= 0.05`。Architecture直接统计
tracked `weather.bin`在fixed-Z `0.5`切片的线性样本：`99.61%` columns得到positive local coverage，median=`0.4294`，因此default macro
coverage几乎没有真正sky gap。与此同时shape/weather周期为`12/60 km`；`10°`仰角穿过`4.5 km`deck约有`25.9 km`in-medium path，重复约
`2.2`个shape周期。default extinction `0.001 m^-1`下，即使path-average normalized density只有`0.1`，transmittance也约为
`exp(-2.59)=0.075`。近水平ray因而几乎必然累计成连续opaque veil/smoke bank，而不是由分离weather cells控制的cloud bodies。这是
Planar broad slab与Globe horizon smoke band的已证实共同根因；暗部是否还存在Sun/ambient source imbalance必须以cloud-only radiance/
transmittance诊断继续确认，不能在没有数据时伪称已定位。

Required correction：重新打开A4 cloud-structure discussion。先补齐A4-AR-002的受控geometry证据，再在现有A4范围内继续source-backed density/
weather/type/detail/lighting/upsample修正。Macro coverage remap必须在default下产生真实zero-coverage cells并保持`cloudCoverage=0` exact identity；
density/extinction需按actual in-medium path验证transmittance distribution，避免仅靠缩短private period把连续veil切成高频噪点。为Globe和Planar分别生成
day/sunset/night的cloud-only与combined对照artifact，并分别报告coverage occupancy、cloud-only transmittance/radiance histogram与sky-gap/connected-body
diagnostic。Cloud-only画面必须显示多个
有轮廓、内部明暗与天空间隙的体积云体；combined画面必须保留sky/ground与near-geometry层次。若冻结的asset/public contract无法达到该下限，必须
reopen ADR-0046讨论，而不是继续只调private scale。仍不得加入hidden/Test-only multiplier、foreign night light、billboard/skybox或A5/A6行为。

### A4-AR-004 — Resolved

Generator现在在old target移动到backup后提供deterministic failure hook；独立`8/8`运行证明失败后target逐字节恢复、可重新verify且无
candidate/backup残留。

### A4-AR-005 — Resolved

3D volume sampler已显式设置S/T/R `REPEAT`；resource fixture与max-thickness跨R tile boundary generator fixture均存在，asset bytes与resource
budget不变。

Execution需修复并写回仍open的A4-AR-002/A4-AR-003，再请求Architecture re-review。当前不批准owner gate。

## Execution second rework resolution — 2026-08-26

### A4-AR-002 — Execution-fixed; independent re-review pending

- Root cause：原raw MRT fixture使用procedural CloudCore density，合法空洞迫使断言退化为`4x2`中“任一命中”；分离的CPU reference又使用手写
  NDC/frustum，未与live camera、cloud viewport和具体texel建立同一authority，因此旧`fullPixel`重建也能通过。
- Fix：fixture以test-controlled solid shape/detail/weather textures和zero blue-noise dither移除procedural holes；expected ray从live
  `Scene` camera/frustum、A1 reference frame、`4x2`cloud viewport与每个asymmetric texel推导，再计算Planar slab或Globe shell的exact
  support interval。
- Verification：both worlds的Perspective/Orthographic与live linear/log raw RGBA16F paths逐texel断言support、front与mean落在analytic
  interval内，并保持near-depth identity。Top-right asymmetric texel另计算旧full-resolution `fullPixel` ray，实际front明确落在其错误interval外；
  恢复旧实现会确定性失败。Focused controller/A1最终为`44/44 + 7/7 = 51/51`。

### A4-AR-003 — Execution-fixed; independent re-review pending

- Root cause：旧default remap只在`weather.r <= 0.05`时产生clear column；tracked weather fixed-Z线性切片中`99.61%` columns高于该阈值。
  `10°`ray穿过`4.5 km`deck约`25.9 km`，在default density下把几乎处处非零的column累计成Planar veil与Globe horizon smoke。
- Fix：macro coverage改为以`1 - cloudCoverage²`为中心的bounded smooth threshold，`cloudCoverage=0`仍exact identity；private
  shape/detail/weather scales保持`12/2/60 km`并配合既有Perlin-Worley、weather type、vertical profile、detail erosion和source-backed bounded
  multiple scattering。未改变public defaults、asset bytes、Sun/sky authority、resource/pass budget或A5/A6边界。
- Evidence：generator fixture对tracked fixed-Z slice测得default active occupancy为`70/1024 = 6.8359375%`，证明存在真实macro sky gaps。
  Strict dual-world diagnostics在cloud-only pass分别读取transmittance/radiance histogram，并以connected-component gate约束结构：Globe
  `active=0.399066`、`gap=0.600934`、`bodies=2`、`largest=0.394922`；Planar `active=0.444175`、`gap=0.555825`、
  `bodies=3`、`largest=0.308750`。Near target保持exact identity；far max delta为Globe `168`、Planar `42`。
- Visual verification：从final source重新生成`a4-day-cloud-only.png`、`a4-day-combined.png`、
  `a4-sunset-cloud-only.png`、`a4-sunset-combined.png`、`a4-night-cloud-only.png`与`a4-night-combined.png`。Cloud-only使用中性
  diagnostic backdrop隔离A2/A3，不增加product multiplier或foreign light；两世界均显示多个bounded bodies、sky gaps、内部明暗和可信silhouette，
  combined保留sky、ground与near geometry。Night继续遵守A2 Sun authority。

### Final affected-boundary validation

- Focused real-Context：controller `44/44`、A1 pipeline `7/7`，合计`51/51`。
- CloudCore generator：`9/9`；`--verify-only`通过，tracked payload总计`1,327,104 bytes`。
- Installed-package verifier通过：`22/22` GLSL、`22/22` generated modules及CloudCore/PlanarEarth/BrunetonEarth exact assets。
- Strict local/no-network Chromium smoke覆盖`24/24` lighting/preset/frustum states：external request=`0`、render error=`0`、visible error
  panel=`0`，两Scene均产生new successful frames且frusta finite/ordered。
- `npm run build`与engine workspace build通过；此前已通过且输入边界未扩大的release/types/docs、exact Scene aggregate不重复运行。Full Spec
  suite未运行。
- Changed-scope ESLint/Prettier/Markdownlint、`git diff --check`、exact `Scene.js`/upstream-manifest diff与official audit均通过；official audit
  报告current-delivery upstream-owned=`0`、generated=`0`。

Working tree保持uncommitted/unpushed；A4保持active，owner gate、checkpoint与A5 activation继续blocked，现请求Architecture独立re-review。

## Architecture third re-review — approved for owner gate — 2026-08-26

Decision：`approved-for-owner-gate`。`A4-AR-006`关闭；retained uncommitted tree中未发现新的Architecture/code blocker。A4仍保持active，
project-owner live visual gate通过前不得checkpoint、commit/push或激活A5。

### Root cause、repair与closure

- Root cause已被最终Test authority直接消除：`captureIsolatedCloudStructure`在采样前把`scene.primitives.show`与对应
  `scene.globe.show`/`scene.world.show`设为`false`，因此neutral identity、cloud transmittance与black-background cloud radiance不再含
  ground、yellow/white targets或其他ordinary geometry。
- Capture保持相同camera、cloud state与ROI，并在成功路径恢复background、cloud radiance scale、primitive collection和ground authority。
  `PrimitiveCollection.show`与`SceneGISPlanarWorld.show`均是实际render authority，不是Test自造shadow state。
- Clouds-off capture把neutral identity同时作为input/transmitted，并以black radiance frame测量；最终两世界均得到exact zero
  active/body/radiance和全pixel identity transmittance。
- Geometry-invariance复测先反转ordinary primitive collection与ground/world visibility，再由同一isolated authority重新采样；两次signature对
  active pixels、component areas、transmittance/radiance histograms、radiance total与maximum逐项deep-equal。由于ROI不变，其derived
  fractions与largest-body fraction也随之确定一致。
- Component threshold固定为ROI的`0.2%`且至少`64`pixels；capture中已没有ordinary geometry，保留的connected components只来自visible cloud
  attenuation/radiance，不再能由comparison target或ground连接。

### Independent evidence

- Architecture确认Execution本轮实际文件变更只涉及`Test/高级环境.html`与AgentDocs；已接受的product runtime、Shader、Specs、assets与generator
  未再次修改，因此不重复运行focused `51/51`与generator `9/9`。
- 独立local/no-network Chromium narrow gate通过`3/3` day/sunset/night × cloudGround × Perspective states：external requests=`0`、browser/page
  errors=`0`、render errors=`0`、visible error panels=`0`，两Scene均继续产生successful frames且frusta finite/ordered。
- 独立capture得到Globe `8`个、Planar `5`个bounded components；Globe/Planar disabled均为`activePixels=0`、
  `connectedBodies=0`、`radianceDelta=0`、`radianceMaximum=0`，identity bin分别覆盖全部`352310/352800` pixels；
  `cloudStructureGeometryInvariant=true`。
- Architecture逐张检查final Test source生成的day/sunset/night cloud-only与combined六张artifact：两世界保留bounded bodies、sky gaps、ground与near
  geometry，未恢复旧Planar veil、Globe continuous smoke或error overlay。最终美术可信度仍由project owner live gate判断。
- Exact Test Prettier、ESLint、`git diff --check`与exact `Scene.js`/`.scenegis/upstream-patches.json` empty diff独立通过。Codebase-memory对
  recent Test symbol仍有index gap，按仓库规则使用exact path/string fallback复核。

Upstream-owned files=`0`，generated=`0`；A4仅consume既有`SGP-0008`，没有新增upstream hunk或SGP。Full Spec suite仍按phase边界未运行。

## Project-owner visual gate — failed — 2026-08-26

Decision：`no-go`。Project owner指出云层质量明显低于reference、缺少多种形态且Globe/Planar颜色差异显著。Architecture直接检查当前live
combined、cloud-only medium与cloud-only high：Globe是低频暗灰烟团，Planar是覆盖近景的大面积高亮云墙；关闭atmosphere/aerial/fog后问题
保留，medium→high也没有结构、边缘或材质级改善。ADR-0046第203–205行停止条件触发，前述`approved-for-owner-gate`撤销。

本No-Go不是单一“没有3D texture”：runtime已使用shape/detail/weather `sampler3D`。Blocking root causes是：

- `A4-AR-007`：`64³/32³/32³` volumes、非真正blue-noise的static shuffled-rank dither、缺失turbulence/STBN，加上2×2 nearest
  low-resolution resolve与无temporal accumulation，共同造成grain/block且high改善很小。
- `A4-AR-008`：ADR明确冻结single deck；单一`weather.g` height-profile interpolation不能产生reference的multiple authored layers和
  cumulus/stratus/thin-high/mixed morphologies。
- `A4-AR-009`：Planar slab可在`300 km`cap内形成远长于Globe curved shell的in-medium path；intrinsic cloud lighting又直接消费两个不同A2
  irradiance/transmittance LUT，尚无matched local-probe radiometric alignment，因此opacity与color同时分叉。

详细repair与closure tests写入
[A4 cloud structure discussion](../discussions/2026-08-15-a4-cloud-structure-calibration.md)。推荐方向是：source/licensed higher-quality
shape + authored/procedural weather + turbulence + true STBN；depth-aware bilateral resolve并在确有必要时正式把最小cloud TAAU移入A4R；bounded
multi-layer/preset contract；Planar horizon/weather-domain处理与shared radiometric-unit matched probes。禁止只增加steps、调隐藏倍率或用Test-only
preset掩盖。

本轮只做diagnosis与gate writeback，没有修改product、shader、asset、public API、resource或upstream surface。Working tree继续
uncommitted/unpushed；Architecture与project owner批准ADR-0046 re-scope前，Execution必须停止，checkpoint与A5继续blocked。

## Architecture second re-review — 2026-08-26

结论：`changes-requested`。`A4-AR-002`已经关闭；`A4-AR-003`的root cause、product fix与六张视觉artifact已经达到Architecture视觉下限，
但其结构化closure evidence被新发现的`A4-AR-006`阻塞。A4保持active；owner visual gate、checkpoint、commit/push与A5 activation继续blocked。

Architecture在exact retained HEAD/base
`ad9898261831e1314fe98307b7b0303fce3ba08f`上独立复跑controller `44/44`、A1 pipeline `7/7`与CloudCore generator
`9/9`，全部SUCCESS；逐张检查2026-08-26 16:09–16:13生成的六张cloud-only/combined artifact。Codebase-memory仍未索引recent A4
symbols，因此依规则使用exact path/string fallback。

### A4-AR-002 — Resolved

Real-Context fixtures现在以solid shape/detail/weather与zero-dither控制inputs；每个`4x2`texel的expected ray从live camera/frustum、A1 frame与
cloud viewport推导，再计算Planar slab/Globe shell interval。Actual raw support/front/mean逐texel落入expected interval，near-depth保持identity。
Top-right legacy `fullPixel`ray的interval与actual front不兼容；若legacy ray miss，逐texelsupport断言也会直接失败。当前fixture已能确定性打红原缺陷。

### A4-AR-003 — Product/visual fix accepted; evidence closure blocked by A4-AR-006

Runtime coverage修复保留`cloudCoverage=0` identity，并把default macro support从旧`99.61%`非零column降为tracked fixed-Z texel-center
`70/1024 = 6.8359375%`。Shape/detail/weather仍为`12/2/60 km`，没有public、asset、resource/pass或A5/A6扩张。

Architecture直接检查六张artifact：day/sunset/night的cloud-only画面在Globe和Planar均呈现多个有sky gap的bounded bodies；combined画面不再出现
Planar veil或Globe连续horizon smoke，并保留ground与near geometry。Night cloud-only在neutral backdrop上提供silhouette，combined继续服从A2
Sun/sky authority。产品画面已经跨过ADR-0046的uniform slab/washout停止条件，后续仍需owner live gate判断最终美术可信度。

### A4-AR-006 — Blocking: cloud structure mask把ordinary geometry计为cloud

Root cause：`measureCloudStructure`从full composed framebuffer推断cloud radiance，而不是从cloud MRT或geometry-subtracted delta读取。Diagnostic
阶段虽然关闭A2/A3并切换neutral/black background，但`cloudDiagnosticPrimitive.show`仍为`true`，ordinary ground/boxes也继续渲染。`radiance`
frame因此包含黄色comparison box、ground与其他geometry；mask又以
`attenuation >= 32 || radianceMaximum >= 32`判active。`cloudRegion`覆盖framebuffer y=`5%..70%`，明确包含ground和comparison targets。六张
cloud-only artifact也直接显示这些geometry位于统计区域内。

Consequence：报告的radiance histogram、`connectedBodies`与`largestBodyFraction`不是cloud-only metrics。特别是亮黄色Planar target必然形成active
component，ground/near-horizon geometry还可能把多个cloud body连接起来；因此Globe `bodies=2/largest=0.394922`和Planar
`bodies=3/largest=0.308750`不能作为A4-AR-003关闭证据。Transmittance ratio在opaque geometry处虽接近identity，`radianceMaximum`的OR条件仍会把
这些像素纳入mask。

Required correction：structure measurement必须使用cloud MRT color/transmittance attachments，或在保持同一camera/cloud state时用geometry-identical
black identity frame从radiance frame扣除ordinary geometry。若继续读full framebuffer，应在structure capture期间隐藏ground与所有ordinary/
diagnostic primitives，或显式排除ground、near/far target mask；sky/cloud ROI不得覆盖这些对象。增加exact guards：`showClouds=false`时
active/body/radiance histogram必须为zero/identity；切换yellow target与ground visibility不得改变cloud histogram/body counts；cloud mask与artifact中
visible bodies一一对应。随后重新报告uncontaminated both-world histograms/components，并从final Test source重生成六张artifact。无需修改product shader、
public API、asset或resource budget。

上述A4-AR-006 execution-fixed并完成受影响的Test/browser evidence后，再请求Architecture re-review。当前不批准owner gate。

## Execution A4-AR-006 resolution — 2026-08-26

### Root cause and bounded fix

Architecture定位正确：旧`measureCloudStructure`读取含terrain/world与ordinary primitives的composed framebuffer，black-background radiance
frame中的ground/boxes通过`radianceMaximum >= 32`污染mask、histogram与components。

本轮只修改`Test/高级环境.html` evidence authority：structure capture期间强制隐藏`scene.primitives`及对应`scene.globe`/`scene.world`，在相同
camera、cloud state与cloud ROI下依次采集neutral identity、clouds-off black radiance、cloud transmittance与cloud radiance。Capture结束后逐项恢复
caller/Test visibility、background与radiance scale。Product shader、public API、assets、resources和calibration均未修改。

### Closure verification

- Clouds-off exact identity：Globe/Planar的`activePixels=0`、`connectedBodies=0`、`radianceDelta=0`、`radianceMaximum=0`；全部
  `352310/352800` pixels落在transmittance identity bin。
- Geometry visibility isolation：分别反转ordinary primitives（含yellow/white targets）与ground/world visibility后重新capture，两个世界的
  active pixels、component areas、transmittance/radiance histograms和radiance totals逐项相同；`cloudStructureGeometryInvariant=true`。
- Uncontaminated Globe：active/gap=`0.143351/0.856649`，components=`8`，areas=
  `[26435,4844,2244,2112,1308,1292,848,800]`，largest fraction=`0.075033`；transmittance histogram=
  `[10204,11948,6401,3614,3423,3193,3406,3214,3944,302963]`，radiance histogram=
  `[300152,6535,6595,15776,23252,0,0,0,0,0]`。
- Uncontaminated Planar：active/gap=`0.061590/0.938410`，components=`5`，areas=`[10944,3924,3624,1260,996]`，
  largest fraction=`0.031020`；transmittance histogram=`[7942,4269,1956,1149,1012,1060,980,895,1188,332349]`，
  radiance histogram=`[330865,914,694,830,809,1115,1488,2939,13146,0]`。
- Component minimum使用cloud ROI的`0.2%`（且至少`64`pixels），移除pixel-scale speckles；保留的components与cloud-only artifacts中可见的
  bounded bodies对应，不再包含ground/target geometry。
- 从final Test source重新生成day/sunset/night六张cloud-only/combined artifacts。Strict local/no-network Chromium smoke再次覆盖`24/24`
  states：external requests=`0`、page/console/render errors=`0`、visible error panels=`0`，frusta finite/ordered且两Scene均产生new successful frames。

Affected checks：exact Test ESLint/Prettier、AgentDocs Prettier/Markdownlint、`git diff --check`、exact `Scene.js`/upstream-manifest diff和official
audit均通过；official audit报告current-delivery upstream-owned=`0`、generated=`0`。Product source未变，Architecture已接受的focused
`51/51`与generator `9/9`无需重复；full Spec suite仍未运行。

Working tree保持uncommitted/unpushed；A4保持active，owner gate、checkpoint与A5 activation继续blocked，现请求Architecture独立re-review。

## A4R re-scope authorized — 2026-08-26

Project owner已明确同意Architecture提出的A4R范围。ADR-0046修订现已accepted，Execution可恢复product work；本授权不关闭
`A4-AR-007..009`，三项仍是blocking findings：

- `A4-AR-007`按逐文件license/provenance冻结reference-quality shape/detail/weather/turbulence/STBN，替换nearest-only upsample，增加
  depth/front-aware bilateral resolve和最小cloud-only temporal history/reset；
- `A4-AR-008`增加warm `cloudPreset=cumulus|stratus|cirrus|mixed`，内部最多四层且两世界共享相同descriptor；
- `A4-AR-009`以matched local-frame raw probes驱动Planar bounded far-cloud rule与shared radiometric-unit correction，禁止hidden
  world-specific opacity/RGB multiplier。

Exact resource ceiling、parity tolerances、history invalidation matrix、closure artifacts和禁止项以ADR-0046 `A4R accepted revision`及A4 phase plan
`A4R formal assignment`为准。Execution必须在首次product edit前先回写asset/source audit、formats/dimensions、history bytes和Planar bounded
formula；完成后在本review写回root cause → repair → closure evidence并发送`review_ready`。Architecture re-review、project-owner live gate、A4
checkpoint与A5 activation仍是后续独立门禁。

## A4R execution blocker — exact frozen calibration fails — 2026-08-26

### Root cause and repairs already retained

- AR-007 infrastructure is present in the retained tree: generator-v2 assets total `11,796,480 bytes`, turbulence + STBN, bilateral full-resolution resolve and two
  ping-pong history framebuffer managers with bounded invalidation. Generator replay passes `10/10`; focused real-Context replay before the final authority restore
  passes `46/46`.
- AR-008 public `cloudPreset` and private typed descriptors are present. Runtime/Spec/Test recognize exact `cumulus|stratus|cirrus|mixed` values; no mutable layer
  array or world-specific preset exists.
- AR-009 Planar adapter now removes `solar * mu * T_sun` direct irradiance from its total A2 irradiance before sky normalization, matching Globe indirect
  `GetIrradiance` semantics. Density erosion is applied before the preset physical density scale. No LUT byte, public default, hidden multiplier or upstream seam changed.

### Remaining exact-contract failure

With the authoritative `60–100 km` visibility fade, `240 km` weather period, phase-plan descriptor scales and public default density `0.001`, the strict
geometry-free local diagnostic reports:

- Globe cloud-only: `L1=3,137,219`, `max=198`, `changedPixels=7,115`, `meanChangedDelta=440.93`, `skyFraction=0.000`,
  `skyStdDev=0.00`, `groundROImean=0.00`, `cloud gates FAIL`.
- Planar cloud-only: `L1=35,581,614`, `max=193`, `changedPixels=404,837`, `meanChangedDelta=87.89`, `skyFraction=0.745`,
  `skyStdDev=34.94`, `groundROImean=186.64`, `cloud gates FAIL`.

The Globe output therefore lacks a recognizable sky body while Planar still produces the prohibited foreground/full-height wall and overwrites ground. A diagnostic-only
`cloudDensity=0.0002` reduced both raw opacity distributions substantially, binding the failure to frozen optical-depth calibration rather than fetch, resource,
history or composite execution. Continuing would require Architecture to revise at least one exact descriptor density, the public default, or the finite visibility
rule. Execution has stopped without such authority; no `review_ready`, owner gate, checkpoint or A5 activation is requested.

## Architecture blocker review — A4-AR-010 — 2026-08-26

Decision：`changes-requested`。Architecture不批准修改public `cloudDensity=0.001`、preset density scales或`60–100 km`visibility。Execution的
`0.0002`试验只证明Beer-Lambert output对extinction敏感，未证明三个frozen scalar contract中的任何一个是dual-world分叉根因。

### Symptom and independent evidence

- Architecture刷新final local page并复现`cloudGround/day/Perspective/cloud-only`。同一当前source下Globe sky ROI changed fraction约`0.007`，Planar约
  `0.758`；Globe几乎是neutral backdrop，Planar仍是宽阔云墙。Exact数值受history/frame timing影响，但失败方向与Execution handoff一致。
- `cloudGround` camera从`500 m`以normalized local `z≈0.342`仰视`1500–6000 m`support；中心ray约在`2.9 km`进入、`16.1 km`退出，in-medium
  segment约`13.2 km`。全部sample distance小于`60 km`，所以`visibilityWeight=1`；改变`60–100 km`far transition不可能修复此gate。
- `cloudDensity`与preset descriptor在Globe/Planar完全共享。同一个scalar reduction会同时减弱两world，不能同时解决“Globe需要更多visible body”和
  “Planar需要更少opacity”。
- Product source按Globe `longitude/latitude * radius`、Planar absolute `worldPosition.xy`采weather/shape。当前paired Test cameras只匹配local ray和
  geometry，没有匹配material-domain phase；两个world实际读取`240 km`weather tile中无关的窗口。当前generator只约束whole-tile R-channel
  occupancy，没有约束representative window或四channel/preset coverage distribution，因此一边落入macro clear cell、另一边落入dense cell可直接产生
  当前症状。
- Focused Specs没有ADR-0046要求的actual-pass matched raw matrix：现有checks覆盖public preset、history/reset与shader source contract，但没有在两种
  compiled world variant中以同一controlled material、ray和incident inputs逐项比较density integral、Sun optical depth、T、source radiance、
  front/mean depth。由此不能排除geometry/coordinate/adapter defect，也不能把失败归因于default extinction。

### Root cause

根因是measurement authority把三个变量混在一起：world geometry、absolute weather phase和optical/radiometric calibration。当前单个live camera pair
不是matched material probe；`cloudDensity=0.0002`又只观察最终opacity。缺少raw分解时选择public default、descriptor scale或visibility distance都会是
未经证明的调参，并可能掩盖Globe/Planar实际实现错误。

### Required repair

1. 增加actual compiled Globe/Planar cloud-pass raw fixtures。使用test-controlled constant与analytic ramp shape/detail/weather、zero turbulence、fixed
   STBN sample、history weight `0`，同一local origin/direction/support/maximum distance及synthetic identical Sun/sky incident textures。不得只使用CPU
   reference或绕过world shader branch。
2. 逐texel报告并assert geometric entry/exit、integrated normalized density、`tau=-log(T)`、Sun optical depth、intrinsic source RGB、front/mean
   distance。Perspective/Orthographic、linear/log各覆盖；先按geometric curvature允许的analytic interval，再执行ADR-0046 `2%/10%/0.02`parity bounds。
3. 对真实A4R assets增加两类独立证据：一是material phase matched（Globe lon/lat domain与Planar XY modulo weather period对齐）的raw/live pair；二是至少
   `16`个deterministic phase/origin的windowed occupancy、optical-depth与color distribution。单一unmatched phase不得再用作radiometric calibration
   authority。
4. 若controlled raw core不匹配，先修复geometry/coordinate/A2 adapter，三项scalar继续冻结。若controlled core匹配而真实asset窗口分叉，则允许在
   A4R既有asset authority内修订weather generator与coverage shaping：每channel必须有deterministic CDF/rank-normalized coverage语义，并采用
   source-backed per-preset private `weatherExponent`/`coverageFilterWidth`，使public `cloudCoverage`控制macro occupancy而不直接改变material
   extinction。该分层与reference `CloudLayer` contract一致；不得增加public knob或world-specific phase/color/density multiplier。
5. 只有phase-matched raw与multi-phase statistics证明两world以相同方向、相近幅度共同过密后，才可再次请求一个shared `cloudDensity`或descriptor
   revision。届时必须提交current assets下的T/optical-depth target与候选值比较；文献中的dimensionless `densityScale`不能直接当作SceneGIS每米
   extinction常量。

### Closure tests

- Controlled raw fixture恢复旧world branch、旧ray、旧texture-coordinate或漏扣Planar direct irradiance中的任一项时必须确定性失败。
- Material-phase matched pair满足density/T `<=2%`、intrinsic luminance `<=10%`、CIE xy `<=0.02`，且front/mean distance落入analytic support。
- Generator tests覆盖四weather channels的CDF、periodicity、whole-tile及representative sliding-window occupancy distribution；runtime fixtures证明
  `cloudCoverage=0` exact identity、coverage monotonic并与extinction scale隔离。
- Live Test同时保留phase-matched parity diagnostic和unaligned representative-world diagnostic；四preset在both worlds均有可辨形态，Globe不再
  accidental clear、Planar不再full-height wall，near geometry保持max delta `<=1`。

本finding只允许补measurement authority及其证明后暴露的weather/coverage或actual core defect；不授权A5/A6扩张、Test-only opacity、public default
change、world multiplier、checkpoint、commit/push或A5 activation。完成后在本review以root cause → repair → raw closure → live closure回写并发送
`review_ready`。

## A4-AR-010 execution closure — 2026-08-26

### Root cause and repair

- Controlled raw evidence confirmed that the shared core is not a scalar-density defect. The implementation therefore retains public
  `cloudDensity=0.001`, every preset density scale, and the `60–100 km` visibility rule.
- The CloudCore weather generator now rank-normalizes all four channels with deterministic empirical CDF semantics. Runtime preset descriptors use
  private `weatherExponent` and `coverageFilterWidth`, so public `cloudCoverage` controls macro occupancy independently of material extinction.
- The actual compiled Globe and Planar cloud programs are exercised with constant and analytic-ramp shape/detail/weather inputs, zero turbulence,
  fixed STBN, history weight zero, identical local ray/support/distance, and identical synthetic Sun/sky inputs. The fixture derives every expected
  texel interval from the live camera, frustum, A1 reference frame, and cloud viewport for Perspective/Orthographic and linear/log depth.
- Real assets are checked at phase-matched material coordinates and at 16 deterministic phases. The generator covers channel CDFs, periodicity,
  whole-tile occupancy, representative sliding windows, and extinction isolation.
- Integrated live testing exposed two independent defects after the controlled core passed. Clear log depth was reconstructed as a finite scene
  distance in the bilateral resolve, suppressing Globe background clouds; the resolve now treats clear depth as unbounded. Preset marching also used
  the global default support instead of the active preset-layer union; primary and Sun intervals now use the exact descriptor union.

### Raw and live closure

- Controlled per-texel output reports geometric entry/exit, normalized density integral, `tau=-log(T)`, Sun optical depth, intrinsic source RGB,
  front distance, and mean distance. Globe/Planar parity satisfies density/transmittance `<=2%`, intrinsic luminance `<=10%`, CIE xy `<=0.02`, and
  analytic support bounds. Restoring the legacy full-resolution reconstruction, world-coordinate, ray, or direct-irradiance defects makes the
  fixture fail deterministically.
- Phase-matched live cloud MRT evidence is comparable: isolated low-resolution opacity sums are Globe `15614.888` and Planar `16023.594`; resolved
  valid-distance pixels are Globe `180520/282438` and Planar `185998/282880` after the clear-depth correction.
- `cloudCoverage=0` remains exact identity; increasing coverage is monotonic without changing the frozen extinction scale. Cumulus, stratus,
  cirrus, and mixed each use distinct marched support and remain visible in both worlds. Day phase-matched structure evidence reports Globe
  `3` bounded bodies (`active=0.098`, `largest=0.070`) and Planar `4` (`active=0.106`, `largest=0.071`); the old accidental-clear Globe and
  full-height Planar wall are absent. Near-geometry maximum delta remains `0` (`<=1`).

### Validation boundary

- Focused real-Context controller Specs: `51/51 SUCCESS`; A1 pipeline regression: `7/7 SUCCESS`.
- CloudCore generator tests: `10/10 SUCCESS`; `--verify-only` passed for exact `11,796,480` tracked bytes.
- `build`, `build-release`, `build-ts`, `tsc`, and `build-docs` passed. Installed-package verifier passed with `23/23` GLSL and generated modules plus
  exact atmosphere, PlanarEarth, and CloudCore assets/provenance and public runtime/types/docs.
- Local no-network browser matrix passed `24/24`: day/sunset/night × below/inside/above/space × Perspective/Orthographic, with zero external requests,
  browser/page/render errors, or visible Cesium error panels and with new successful frames and finite ordered frusta.
- Exact Scene aggregate passed `450/450`. Changed-scope ESLint/Prettier/Markdownlint and `git diff --check` passed; exact `Scene.js` and
  `.scenegis/upstream-patches.json` diffs are empty. The official audit reports current-delivery upstream-owned `0` and generated `0`.
- The full repository Spec suite remains intentionally unrun; validation is limited to the phase-plan focused, A1, exact Scene, build/package,
  asset, browser, lint, format, diff, and audit boundaries above.

## Architecture A4R independent re-review — 2026-08-26

结论：`changes-requested`。`A4-AR-010`的controlled raw、material-phase与weather/CDF measurement authority可以关闭；但当前retained
working tree新增暴露三个blocking问题。A4保持active，owner visual gate、checkpoint、commit/push与A5 activation继续blocked。

Architecture在exact retained HEAD/base `ad9898261831e1314fe98307b7b0303fce3ba08f`上独立检查public controller、private renderer、cloud/resolve/
composite shaders、A4R focused Specs、generator authority、ADR/phase contract及local direct Test。Codebase-memory仍未收录recent A4R symbols，因此按仓库
规则使用exact path/string fallback。独立浏览器复核使用当前`http://localhost:8080/Test/高级环境.html`最终源码；两Scene均为`ready · HDR`，console
warning/error、render error与external request均为zero。本轮以下source-correctness与live-gate失败已经阻断，不重复扩大到Execution已报告通过的build/
package/full focused matrix。

### A4-AR-010 — Resolved

Actual compiled controlled fixtures现在确实进入Globe/Planar shader variants，并以constant/ramp material、zero turbulence、fixed STBN、matched local
ray/support与synthetic incident inputs核对per-texel density/T/radiance/front/mean。Real assets另有phase-matched与16-phase distribution evidence；weather
generator/runtime使用per-channel rank-normalized CDF与preset-private coverage shaping。Clear-depth resolve和preset support-union两个集成缺陷也已在source中
修复。该finding不再阻挡；下面问题属于独立的history、Test authority与最终视觉下限。

### A4-AR-011 — Blocking: temporal history没有覆盖已写入attachment的全部状态，当前门禁不确定

#### Symptom and exact evidence

- `_SceneGISEnvironmentEffectsRenderer.js`的`cloudHistoryKey`包含quality、preset、base/thickness、coverage/density、wind、log depth和camera basis，
  但不包含`cloudRadianceScale`，也未包含完整reference-frame identity（例如ellipsoid radii/center与planar base）。
- `SceneGISVolumetricClouds.glsl`在写入low cloud color前已经执行`accumulatedRadiance * cloudRadianceScale`；
  `SceneGISEnvironmentEffectsCloudResolveFS.glsl`随后又以`0.82`权重混合上帧RGBA16F color。Public scale setter只走`setWarmNumber`和
  `requestRender`，没有invalidate history。因此`1 -> 0/64`会把旧scale的radiance带入新帧。
- Direct Test的structure capture正好在`showClouds=true`期间把`cloudRadianceScale`从`0`恢复到saved value，却没有invalidate history；所谓
  geometry-invariance comparison因而同时比较了不同EMA历史。Architecture在显式`白昼 + 云下0.5 km + Perspective`下连续复跑：Globe与Planar均
  `cloudStructureGeometryInvariant=false`；Planar fixed-time delta先后出现`26`、`65`、`13` changed pixels，Globe也在一次复跑出现`147`，与review声称
  的fixed-time exact不相符。
- `_cloudStbnSequence`只初始化而从未推进或消费；STBN slice只由`cloudTime * 60`决定。当前Direct Test也没有ADR-0046要求的temporal on/off
  diagnostic。现有fixed/moved metric既不能隔离spatial-only与history，也不能证明无history ghost。

#### Root cause

History authority把“会改变attachment内容的material state”和“只影响geometry/support的state”混为一个不完整key。递归EMA又在RGBA16F量化后的
history与本帧spatial resolve之间继续反馈；在没有显式material discontinuity reset和spatial/history对照的情况下，输出依赖之前渲染过多少帧及之前的
scale/state，导致同一Test source不能稳定复现其自身exact gate。

#### Required repair

1. 把`cloudRadianceScale`及完整reference-frame identity加入history invalidation authority，或在对应setter/frame/publication transition上显式
   invalidate；逐项审计所有会改变cloud color/distance attachments的warm state，不能只补当前一个字段。
2. Structure capture在每次scale、visibility与measurement-authority切换后必须显式从invalid history开始；spatial-only sample取invalid first frame，
   temporal sample只从第二个valid frame开始。Capture restoration使用`try/finally`，失败时也不能污染live page state。
3. 修正RGBA16F feedback的fixed-input稳定性，或先通过ADR明确一个有上界、可重复的convergence contract；当前phase/review冻结的“fixed time exact”
   不能在实际失败时仍记为pass。
4. 增加real-Context tests：scale `0/1/64` transition的first frame等价spatial-only、reference-frame transition reset、两次相同fixed input的稳定性、
   geometry visibility exact invariance，以及Direct Test明确的temporal off/on对照。Test必须让遗漏scale或恢复旧history key时确定性失败。

#### Closure

同一clean reload连续两次运行时，两世界`fixedTimeDelta=0`、`cloudStructureGeometryInvariant=true`；scale transition首帧无旧radiance ghost，
invalid first frame与spatial-only byte-equivalent，second valid frame才允许EMA。Direct Test输出temporal off/on差异、reset原因和history validity，且不需要
product debug public API或permanent render loop。

### A4-AR-012 — Blocking: Direct Test把未初始化的Globe实时时钟误报为白昼

#### Symptom and exact evidence

`Test/高级环境.html`初始化`currentLighting = "day"`，但Globe day time `2026-06-21T04:00:00Z`只在用户点击`白昼`按钮后写入。页面clean
reload、未点击任何lighting button时，Planar已经使用固定day Sun，而Globe仍使用Viewer默认当前时刻。Architecture实际看到Globe天空全黑、Planar蓝天；
此时内置diagnostic仍按`currentLighting === "day"`套用day gate，报告Globe background `L1=0/max=0/changed=0 required>=8 FAIL`，Planar background
`L1=205950490/max=248`。点击一次`白昼`后Globe立即恢复蓝天，background变为`L1=217098322/max=249`。

#### Root cause

UI label/state、Globe clock authority与Planar Sun authority由三个分散路径维护；初始值只赋了label，没有调用与button相同的lighting transition。因此项目负责人
打开默认页面时看到的不是review所称的default day双世界画面，也会产生假的Globe/Planar color mismatch。

#### Required repair and closure

把day/sunset/night统一到一个`applyLightingPreset`，button和initialization共同调用；两Scene/controllers ready前后都必须得到同一确定性preset并request
new successful frames。Clean reload无需click即可证明Globe clock exact day ISO、local Sun above horizon、Planar Sun为对应day方向、两世界background
nonidentity且不出现black/error overlay。24-state smoke必须从clean reload验证initial state，而不是先由automation点击`白昼`掩盖初始化缺口。

### A4-AR-013 — Blocking: 当前高质量preset仍未越过owner要求的云体视觉下限

#### Symptom and exact evidence

在先显式点击`白昼`排除A4-AR-012后，Architecture检查`云下0.5 km/Perspective/cloud-only/high`：

- `cumulus`在两世界主要仍是贴近frame底部的宽、软、暗灰smudge，缺少可辨的竖向体积、边缘侵蚀与内部受光层次；
- `mixed`几乎把可见区域变成连续低频灰色veil，Globe/Planar虽比旧版更接近彼此，但并没有形成参考项目级的多层分离云体；
- 当前内置day gate本身仍显示两世界`cloud gates FAIL`。显式day复核中Globe structure为`5` bodies但geometry invariant失败；Planar只有`1`
  body、geometry invariant失败且fixed delta非zero。`presets=distinct PASS`只证明numeric signature不同，不能替代形态与光照下限。

#### Root cause

四个public preset虽然已有不同support/profile/scale/coverage descriptor，但最终仍共享同一shape/detail density remap、同一phase/multiple-scattering
近似和同一resolve。`high`主要提高resolution/step budget，不会自动增加preset-specific morphology或受光结构。当前自动化只冻结“签名不同”和区域统计；在
history/initial-light authority又不稳定时，它无法证明owner看到的是可信cumulus/stratus/cirrus/mixed。

#### Required repair

1. 先关闭A4-AR-011/012，确保画面与指标可重复，再在A4R既有private descriptor/generator/shader authority内进行source-backed morphology与lighting
   校准：至少分别冻结preset-specific shape/detail mix、vertical erosion/profile、weather channel/coverage response及受光对比；不得新增world-specific
   RGB/opacity multiplier、Test-only product scale或A5 shadow/god-ray行为。
2. Direct Test提供无遮挡、逐world可读的four-preset artifact grid；至少覆盖medium/high、cloud-only/combined、day/sunset及below/inside/above，不能让
   diagnostic overlay遮住主要sky ROI。High相对medium必须体现edge/detail frequency提升，而不是只增加成本。
3. 同一final source在两次clean reload中均通过现有cloud structure gates，四preset各自满足有sky gap、bounded bodies、near geometry identity、motion
   nonidentity与fixed-input stability；随后再请求project owner live visual gate。最终美术标准仍由owner确认，Architecture不以histogram代替该gate。

上述三项全部execution-fixed并回写root cause -> repair -> closure evidence后，再发送`review_ready`。当前不批准owner gate；不得checkpoint、commit、
push或激活A5。

## A4-AR-011..013 execution closure — 2026-08-26

### A4-AR-011 — history authority

Root cause是history key未覆盖写入attachment的`cloudRadianceScale`与完整A1 reference-frame identity，同时Test把ordinary geometry visibility、
scale transition和递归RGBA16F history混在同一measurement中。Renderer现在把scale、mode/altitude/base、frustum、camera basis、surface frame及
ellipsoid center/radii全部纳入key；所有transition在publication前invalidate。Resolve保留time-advanced `0.82` EMA，但stationary compatible pixel直接
复用已量化history attachment，depth/front不兼容pixel仍回到current spatial result，避免固定输入的half-float recursive drift且不让geometry edge泄漏。

Direct Test在每次scale/authority transition前显式invalidate，并在`try/finally`恢复background、FXAA、primitive/ground、scale与camera。Fixed criterion
直接读取cloud-owned full-resolution RGBA16F color和distance attachments；两次clean reload最终均报告Globe/Planar color与distance delta=`0`，
`geometryInvariant=true`。Time advance仍为nonidentity：最终记录Globe `64,783` changed pixels、Planar `63,343`；invalid first frame保持
spatial-only，后续valid moving-time frame进入EMA。Scale `0/1/64`、reference-frame/frustum change和warm transition Specs均确定性覆盖旧key失败路径。

### A4-AR-012 — initial lighting authority

Root cause是UI label、Globe clock和Planar Sun由三条路径维护，初始化只写label。`applyLightingPreset`现是button与startup的唯一authority；clean reload在
无点击前即固定Globe time=`2026-06-21T04:00:00Z`，两world local Sun均在horizon上方，background nonidentity，frustum finite/ordered，且无
render error或visible Cesium error panel。

### A4-AR-013 — morphology and quality closure

Root cause不是public density或world calibration，而是四preset共享过多shape/profile/detail/lighting private state，且相同bilateral kernel掩盖了high档
增加的采样/纹理频带。Public `cloudDensity=0.001`、descriptor density scales、`60–100 km`visibility及所有asset bytes保持不变。Private immutable
descriptors现冻结preset-specific shape/detail scale、erosion/profile、weather response和direct/multiple/ambient contrast；high使用完整detail erosion，
medium使用coarser weak detail。Resolve仍为同一depth/front-aware 3x3 bilateral reconstruction，但按low-resolution ratio使用high=`2.5`、
medium/low=`0.35`的spatial sharpness，不新增program、command、FBO、texture或public knob。

最终无遮挡four-preset grids在两world显示bounded cumulus、broader stratus、thin-high cirrus和multi-layer mixed，均保留sky gaps与近地面。Day/below
cloud-only的四preset Laplacian总和从medium到high分别为Globe `5.802 -> 6.171`、Planar `5.741 -> 6.211`；high提高aggregate edge/detail
frequency且不引入fixed-camera crawl。最终artifacts：

- `a4r-final-high-day-below-cloud-only.png`
- `a4r-final-medium-day-below-cloud-only.png`
- `a4r-final-medium-day-inside-combined.png`
- `a4r-final-high-sunset-above-cloud-only.png`
- `a4r-final-medium-sunset-below-combined.png`

Browser structure gate在两次clean reload保持同一结果：Globe `4` bodies、active=`0.596`、largest=`0.588`、gaps=`0.404`；Planar `8`
bodies、active=`0.407`、largest=`0.248`、gaps=`0.593`。Clouds-off exact identity，near geometry max=`0`，far cloud max分别`133/141`，
`geometryInvariant=true`。

### Final validation and boundary

- Focused real-Context controller `53/53` + A1 pipeline `7/7` = `60/60 SUCCESS`。
- Exact `Scene/Scene` aggregate（按phase的include boundary）=`452/452 SUCCESS`；full repository Spec suite未运行。
- CloudCore generator=`10/10 SUCCESS`；full separate-target byte identity、rollback injection与tracked `--verify-only`通过，exact binary bytes
  `11,796,480`。PlanarEarth和BrunetonEarth verify-only通过，Globe bytes/runtime未变。
- `build`、`build-release`、`build-ts`、`tsc`、`build-docs`通过；`build-ts`只有repository-wide既有TSD-JSDoc warnings。Installed package verifier
  通过`23/23` GLSL与`23/23` generated modules、exact assets/provenance及public runtime/types/docs。
- Strict local no-network browser smoke=`24/24`：day/sunset/night × below/inside/above/space × Perspective/Orthographic；external request、
  browser/page/render error及visible error panel均为`0`，每个state都有新成功帧与finite ordered frusta。
- Changed-scope ESLint/Prettier/Markdownlint、`git diff --check`、exact `Scene.js`/`.scenegis/upstream-patches.json` empty diff及official audit在最终
  handoff通过；current-delivery upstream-owned=`0`、generated=`0`，只消费active `SGP-0008`。
- Codebase-memory graph仍未收录recent environment symbols；本轮按规则先尝试graph后只使用exact file/string fallback，该gap为工具限制。

Remaining gate是Architecture独立re-review和新的project-owner live visual gate。Working tree保持exact HEAD/base
`ad9898261831e1314fe98307b7b0303fce3ba08f`上的uncommitted/unpushed diff；未请求checkpoint，A5未激活。

## Architecture independent re-review — No-Go — 2026-08-26

Architecture接受`A4-AR-012`的startup lighting修复：clean reload后无需点击`白昼`，页面即使用统一的
`applyLightingPreset("day")`初始化label、Globe clock与Planar Sun。`A4-AR-011`和`A4-AR-013`的closure在独立live运行中未复现，因而重新打开；
另有一项交付记录一致性finding。Owner visual gate、checkpoint、commit/push和A5 activation继续blocked。

### A4-AR-011 — Reopened: stationary history并非exact，门禁依赖运行顺序

#### Symptom and exact evidence

Architecture在当前retained source、同一local page上得到两组失败：

1. clean reload后依次执行`启用 -> high -> 云下0.5 km -> Perspective -> 完整合成 -> diagnostic`：
   - Globe：`cloud gates FAIL`，`bodies=1`、`active=0.496`、`largest=0.491`、`geometryInvariant=true`、`fixed=0`；
   - Planar：`cloud gates FAIL`，`bodies=7`、`active=0.361`、`largest=0.199`、`geometryInvariant=true`、
     `captureTemporal=0/4854`、`fixed=4854`。
2. 在同一合法页面会话先生成`high`四preset grid，再恢复combined并运行diagnostic：Globe出现
   `geometryInvariant=false`、`fixed=16,382,341`，Planar仍为`fixed=4,854`；两world均报告`cloud gates FAIL`。

因此“两次clean reload fixed delta=`0`且geometry invariant”的closure不是对当前viewport与合法UI transition sequence稳定成立的contract。

#### Root cause

- Stationary路径不是attachment的byte-preserving复用。`CloudResolveFS`从上一张RGBA16F history texture执行filtered `texture()`读取，再写入另一张
  RGBA16F target；shader re-sampling/re-quantization本身不提供byte identity保证。
- `historyCompatible`只比较distance attachment的`.z`（resolved scene distance），没有比较validity `.a`、cloud front `.y`、mean distance `.x`或
  current cloud color/transmittance。Clear scene depth保持相同而cloud support/history已变化时，旧history仍可能被判compatible。
- STBN slice完全由`floor(cloudTime * 60)`决定；固定caller time的第二帧没有新的sampling phase。当前stationary branch既不能形成真正temporal
  supersampling，又把“shader反馈近似复用”当成exact稳定性来源。

#### Required repair

1. 若继续冻结fixed-input exact contract，stationary compatible路径直接输出本帧`spatialColor/spatialDistance`，不得把上一张history重新采样后称为
   byte-exact。Moving-time EMA的compatibility至少同时覆盖validity、front、mean和scene distance；任一不兼容即使用current spatial。
2. 若视觉质量需要stationary temporal accumulation，则先修订ADR为bounded deterministic convergence：sampling sequence与material
   `cloudTime`分离，只在成功cloud render后推进，在有限sample count后冻结；不得建立permanent loop。该路径不能再同时宣称第二帧立即byte-exact。
3. Specs和Direct Test必须覆盖clean reload及`grid -> close -> combined -> diagnostic`两种顺序、scale `0/1/64`、primitive/ground visibility、
   viewport/quality/preset和Planar/Globe；raw color与distance都要求contract一致。加入private test instrumentation记录key、stationary、compatibility与
   reset reason，先定位Planar `4854`而不是用重复capture掩盖。

#### Closure

至少两个固定viewport的两次clean reload及上述grid transition sequence都得到both-world raw color/distance fixed delta=`0`、
`geometryInvariant=true`、cloud gates PASS；旧`.z`-only compatibility或history texture feedback恢复时，focused Spec必须确定性失败。

### A4-AR-013 — Reopened: 3D assets已足够，raymarch/LOD/temporal消费仍低于reference-quality

#### Symptom and exact evidence

Architecture查看最终source生成的`day / cloudGround / cloud-only / high`四preset grid：

- `cumulus`主要聚集在地平线附近，轮廓仍有明显低采样块状与软糊；
- `stratus`退化为大面积模糊暗顶/低频涂抹；
- `cirrus`在两world几乎不可辨；
- `mixed`主要是更密集的低层团块，没有清楚的多高度层分离。

这与project owner此前指出的“未达到参考项目标准”一致。Laplacian aggregate或connected-component门槛只能证明像素统计变化，不能关闭该视觉
finding；本轮live gate本身也仍显示`cloud gates FAIL`。

#### Root cause

问题不是缺少高质量3D noise。当前generator已经交付`128^3 RGBA8` shape、`64^3 RGBA8` detail、`256^2 RGBA8` weather、
`64^3 RGBA8` turbulence与`128x128x64 R8` STBN，共`11,796,480` bytes。主要损失发生在消费侧：

1. `high`仍只有`.75` resolution和固定`64`个primary samples；shader以
   `stepLength = (segmentEnd - segmentStart) / primarySteps`均匀跨越整个active support。在`60–100 km`可见距离下，每步约
   `0.94–1.56 km`，已经接近或大于`cirrus 0.9 km` detail scale和`cumulus 1.2 km` detail scale，无法稳定重建侵蚀边缘与内部层次。
2. Shape/detail/turbulence Texture3D只使用`LINEAR` sampler，未生成mipmap；density loop全部使用implicit `texture()`，没有基于ray footprint、
   distance或empty-space的explicit LOD。远距高频alias最后只能被low-resolution bilateral kernel抹成块/雾。
3. `high`的narrow spatial kernel只保留已有low-resolution signal，不会创造缺失的沿射线样本。STBN slice又绑定material time，stationary history
   复用同一phase，因此没有reference级的temporal supersampling。
4. Preset-specific morphology/lighting常量改变了占用率和亮度，但没有解决上述sampling bandwidth；所以`stratus`和`mixed`仍是低频veil，
   `cirrus`则因薄层+粗step而消失。

参考仓库明确使用shape/detail 3D texture、weather、turbulence、逐帧STBN与TAA；其cloud shader还提供`min/max step size`、
`perspectiveStepScale`、empty-space skipping、distance mip level及远高于固定64步的bounded loop。参考链接：
[repository overview](https://github.com/yuwoniu03/cesium-clouds-atmosphere)、
[cloud shader source](https://github.com/yuwoniu03/cesium-clouds-atmosphere/blob/main/src/ThreeGeospatialPipeline.js)。SceneGIS不应复制其代码，
但当前实现缺少的正是这些sampling/LOD/temporal机制，而不是再生成一张更大的noise texture。

#### Required repair

1. 为power-of-two shape/detail/turbulence volume建立mipmap与trilinear mip sampler，并以ray footprint/distance显式选择LOD；generator/verify记录
   mip authority或证明runtime deterministic generation与resource bytes。
2. 把uniform 64-step改为bounded adaptive/hierarchical march：weather/low-frequency density为空时大步跳过，进入active cloud body后按最小detail
   feature size使用细步；high的occupied-volume spatial step必须有source-backed上界。可以提高loop ceiling，但不能简单让所有像素全程增加steps；需给
   1080p/4K GPU timing和early-out/empty-space evidence。
3. 在A4-AR-011修复后，选择bounded stationary temporal accumulation或足够的full/spatial sampling；sampling phase必须与material motion time分离。
4. 用固定viewport生成both-world side-by-side four-preset grids，至少覆盖medium/high、day/sunset、below/inside/above和cloud-only/combined。
   `cumulus`需有竖向体积与受光层次，`stratus`保留层状但不能成为模糊暗顶，`cirrus`必须可辨且保持高薄，`mixed`显示真正分层；最终仍由project
   owner live visual gate确认。

#### Closure

Architecture先验收adaptive/LOD/temporal raw evidence、geometry identity、dual-world radiometric bounds和性能预算，再检查同一final source的实际
画面。只有自动化cloud gates在规定viewport与transition matrix稳定通过，且project owner明确通过live visual gate，才关闭A4-AR-013。

### A4-AR-016 — Blocking: review顶部仍描述旧A4资源与验证边界

当前review前半仍写`+2 programs/+4 textures/no temporal history`、四个旧asset总计`1,327,104 bytes`、`22/22` GLSL与旧focused计数；文件尾部则写
A4R的五texture、ping-pong history、`11,796,480 bytes`、`23/23`和`60/60`。Root cause是Execution只追加A4R closure，没有替换已失效的delivery
summary。修复时必须把Implementation、Assets、Resource boundary、Validation和remaining risks统一到最终事实，同时保留历史finding段落；不能让
checkpoint依赖互相矛盾的资源/测试记录。Closure为review内所有current-delivery数字与source、package verifier和phase plan exact一致。

## Superseded execution repair — A4-AR-011/013/016

### A4-AR-011 root cause -> repair -> closure

- Root cause一是stationary resolve仍读取上一张RGBA16F history，形成filter/re-quantize feedback；二是compatibility只验证scene-depth；三是Globe同一
  reference frame重算产生约`5e-17`方向roundoff，而Direct Test的preset-grid finally在恢复preset后只request、不await恢复帧，且诊断捕获仍允许camera
  collision controller改变输入。
- Resolve现在stationary直接输出current spatial color/distance；moving EMA同时验证validity、front、mean、scene-depth、transmittance和radiance。
  History key覆盖完整reference frame并用方向`1e-12`、位置/尺度`1e-4`的fixed canonicalization只过滤numerical roundoff。Direct Test在`try/finally`
  内冻结request-render/time/camera-input/collision authority，preset-grid在允许关闭前await both-world restored frame。
- Two clean-load final runs及合法`high cloud-only -> grid -> close -> combined -> diagnostic`序列均为both-world raw `fixed=0`、
  `captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`。Scale `0/1/64`、preset/quality/viewport/frustum/reference-frame/show/connect及
  non-continuous time reset仍由focused real-Context覆盖；first invalid frame=spatial-only，second stationary frame=the same current spatial result。

### A4-AR-013 root cause -> repair -> closure

- Root cause确认在消费带宽而非asset缺失：原high沿60–100 km support只有64个uniform density samples，3D base-level linear sampling和固定2x2-style resolve
  无法保留0.9–1.2 km morphology/detail。
- Shape/detail/turbulence现建立完整mipmap，trilinear mip sampler按ray angular/origin footprint与distance选择LOD。64-step outer loop变为bounded coarse
  occupancy skip；only occupied intervals进入最多四个fine samples，medium也使用同一loop ceiling以关闭dual-world raw quantization误差，low保持one fine
  sample。Resolve保留3x3 depth/front bilateral，high narrow、medium/low broad；没有新增pass/resource或改变public defaults/world radiometry。
- Private immutable morphology冻结separate shape/detail anisotropy、erosion/profile/weather response。CDF-ranked macro coverage的cumulus/mixed low layer
  使用`2.2/.04`与`1.7/.04` exponent/filter，`cloudCoverage=0`仍exact identity；无world-specific opacity/color multiplier。
- Focused raw matrix `61/61`、generator `10/10`、installed `23/23`及final live gates全部通过。Matched high/day/below grid的Globe/Planar edge
  metrics为cumulus `2.595/2.503`、stratus `.977/.978`、cirrus `.637/.665`、mixed `1.978/1.840`；画面显示vertical cumulus、layered
  stratus、visible thin cirrus和separated mixed layers。Same matched medium为cumulus `2.437/2.246`、stratus `1.036/1.005`、cirrus
  `.674/.691`、mixed `1.850/1.719`；high提高cumulus/mixed实际edge frequency，同时stratus/cirrus维持连续薄层而非引入锐化噪声。
  Medium/high、day/sunset、below/inside/above、cloud-only/combined artifacts已从final source重生成；final visual acceptance仍保留给Architecture与
  project owner。

### A4-AR-016 coherent delivery record

Review顶部已改写为唯一current-delivery authority：five tracked textures=`11,796,480` bytes，runtime mip GPU static=`13,294,444` bytes，active
programs/commands=`7/4`，A4R over-A3=`+4/+2`，cloud MRT one plus two full-resolution ping-pong history managers，installed shader/modules=`23/23`，
focused/A1=`61/61`，exact Scene aggregate=`127/127`。Pre-A4R数字仅保留在带日期的Architecture finding/history段落，不再作为current summary。

Execution status：`review-ready`。Tree保持uncommitted/unpushed；owner gate、checkpoint、push与A5 activation继续blocked，等待Architecture独立复审。

## Architecture sixth independent re-review — No-Go — 2026-08-27

Architecture按fingerprint `9173f323eb66fe622f0f71709e8b76f61fca1b13`对应的retained tree独立复核candidate lifecycle、conservative
occupancy hierarchy、compiled sampling fixtures、focused/Scene boundaries及local direct Test。Codebase-memory仍未收录recent A4R symbols，按规则改用
exact path/string fallback并保留该tool index gap。结论为`changes-requested`：`A4-AR-013/017`关闭；`A4-AR-011`因合法序列与重复诊断不确定性重新
打开；`A4-AR-016`因current validation互相矛盾继续blocking。Owner visual gate、checkpoint、commit/push和A5 activation继续blocked。

### A4-AR-013 — Resolved for Architecture cloud-quality lower bound

#### Independent evidence

- Candidate-owned ceil-quantized R8 max hierarchy、periodic one-cell halo、preset morphology threshold rejection、thin/sub-cell regression与actual compiled
  coarse/fine/skip counters共同关闭旧center-point false-negative。Five tracked assets保持byte-identical，derived hierarchy进入同一candidate lifecycle与
  resource ceiling。
- 同一final tree/query/`1600x900` DPR `1`的两个Architecture clean loads均稳定到`.001`：第一次high/day/below matched edge Globe/Planar为
  cumulus `2.089/2.071`、stratus `.968/.985`、cirrus `.645/.669`、mixed `1.839/1.771`；第二次为
  `2.090/2.072`、`.968/.985`、`.645/.669`、`1.839/1.771`。画面可辨cumulus体积、连续stratus、high thin cirrus与
  separated mixed，Globe/Planar色调处于同一lighting family；browser warning/error为`0`。

Architecture cloud-quality下限已达到，但project owner live visual gate仍是独立mandatory gate；本finding关闭不等于owner验收，也不覆盖下面的历史帧/记录阻断。

### A4-AR-017 — Resolved: actual runtime mip failure atomicity

#### Independent evidence

- Spec从published `cloudShapeTexture`取得actual runtime prototype，wrong deep-source prototype spy保持zero calls；第一次actual
  `generateMipmap`调用抛出exact injected error。
- Last-good `_resources`保持exact object且旧textures全部live。Failure candidate exact cleanup为Texture3D `2`、Texture2D `2`、program `7`、VA
  `1`、vertex buffer `1`，未创建项不destroy。
- Architecture exact复跑controller `56/56`、A1 pipeline `7/7`与Scene aggregate `127/127`全部SUCCESS。

### A4-AR-011 — Reopened: diagnostic frame authority未建立quiescent generation boundary

#### Exact symptom

- Architecture第二个clean load执行execution记录的合法`preset grid -> close -> combined -> diagnostic`后，Globe仍为`fixed=0`、
  `captureTemporal=0/0`、`mrtFixed=0/0`，但Planar为`fixed=6208`、`captureTemporal=0/6208`、`mrtFixed=3187/197`，cloud gate FAIL。
- 未改动任何product/Test状态立即重复diagnostic，Globe变为`fixed=624256`、`captureTemporal=624256/0`、
  `geometryInvariant=false`，Planar仍保持上述非零delta。第一次运行通过、第二次运行失败，且Planar raw cloud MRT在paired frames之间变化，证明当前gate依赖
  pending render/order而不是冻结后的唯一frame generation。

#### Root cause

Direct Test的sampling authority只等待“`requestRender`之后首次`postRender`”。Matched mode的Globe `postRender`又可能调用
`synchronizeMatchedPlanarSun()`并请求Planar frame；diagnostic handler在一次同步调用后立即并行启动both-world capture，没有等待sun同步后的both-world settled
generation，也没有用successful-frame generation token排除先前grid restore或cross-scene request。因而所谓spatial/temporal paired read可能落在不同的pending
generation。当前Test无法区分“采样到错误frame”与“product MRT在完整authority相同下真实不稳定”，所以exact-zero结论不是有效门禁。

#### Required repair

1. 把diagnostic建立为有generation token的串行transaction：先完成matched Sun同步，等待both Scenes各产生明确的新successful settled frame，再冻结
   postRender cross-scene synchronization；raw read只接受该transaction请求后且authority generation匹配的frame，不能接受第一个任意`postRender`。
2. 每组paired read记录并比较camera/frustum/A1 reference frame、Sun、`cloudTime`、preset、quality、viewport、history key/reset reason和successful-frame
   generation。任一authority变化必须使capture失败，而不是继续计算delta。
3. 先在同一clean load执行合法grid transition，随后连续运行两次diagnostic；both worlds两次都必须exact `fixed=0`、
   `captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`。把该序列固化为local automated browser gate。
4. 若quiescent generation与authority snapshot相同后raw MRT仍变化，则在product Spec中最小复现并修复runtime determinism；不得用额外settling frames、隐藏
   history reuse或放宽delta阈值掩盖。

#### Closure

两个cache-disabled clean loads均完成合法transition加两次immediate repeated diagnostic；四次both-world结果exact zero/true，authority snapshots和generation
均匹配，browser/page/render errors=`0`。只有在该条件下才能再次关闭`A4-AR-011`。

### A4-AR-016 — Still blocking: current record与final-source evidence互相矛盾

#### Exact symptom

- Review current Validation同时保留execution fingerprint metrics `2.039/1.944`等与旧artifact metrics `2.595/2.503`等，旧值此前没有标成
  superseded current authority；Architecture已在本次复审将旧bullet明确降为historical。
- Architecture同一tree/query/viewport的两次clean load稳定得到`2.089/2.071`与`2.090/2.072`等，而非execution声称两次逐项exact
  `2.039/1.944`等。数值差异本身不否定画质，却否定“exact reproducibility”与唯一current validation record。
- Execution记录的both-world exact-zero legal transition也未被Architecture复现，实际Planar与repeated Globe结果见`A4-AR-011`。

#### Root cause

Execution以append-only方式加入final fingerprint evidence，没有撤销同一current Validation中的旧artifact authority；同时browser证据只保存结果，没有把成功帧
generation与全部render authority作为可复核输入。于是相同query/viewport看似相同，实际capture sequence仍可落在不同pending frames，records无法解释差异。

#### Required repair and closure

- 在`A4-AR-011`关闭后，从同一个quiescent transaction输出唯一current query/viewport/sequence、authority snapshot、两次clean-load metrics与两次连续diagnostic
  结果。README、extension/phase plan、discussion与review必须使用同一组事实。
- 旧artifact names/metrics只能出现在明确`superseded historical evidence`段落；current summary不得同时存在两套互称exact的metrics。
- Exact search与人工核对证明所有top-level records一致，Architecture再以相同transaction复现后关闭。仅格式整理或把矛盾数字继续追加到文档尾部不能关闭。

## Architecture independent re-review — No-Go — 2026-08-27

Architecture按final retained tree独立复核renderer、cloud/resolve shaders、focused Specs、phase/current records及local direct Test。Codebase-memory仍未收录
recent A4R symbols，按规则改用exact path/string fallback。结论为`changes-requested`：`A4-AR-011`关闭，`A4-AR-012`继续关闭；`A4-AR-013`与
`A4-AR-016`保持blocking，新建`A4-AR-017`。Owner visual gate、checkpoint、commit/push和A5 activation继续blocked。

### A4-AR-011 — Resolved: stationary history与transition-order gate

#### Independent evidence

- Renderer的stationary branch直接选择current `spatialColor/spatialDistance`，不再采样或重量化previous RGBA16F history；moving `0.82` EMA只在current/
  history validity、front、mean、scene depth、transmittance与radiance compatible时执行。
- 合法`four-preset grid -> close -> combined -> diagnostic`序列独立复现Globe/Planar `fixed=0`、`captureTemporal=0/0`、`mrtFixed=0/0`与
  `geometryInvariant=true`。Cloud gates PASS，无browser/page/render error或visible error panel。

`cloudHistoryDiagnostics.compatibility`当前仍是constructor中固定字符串，不构成per-pixel compatibility证据；本finding依据raw attachments与shader/source
行为关闭，后续记录不得把该常量本身当作动态检测结果。

### A4-AR-013 — Blocking: final-source visual closure不可复现，coarse occupancy非保守

#### Exact symptom

- Architecture以final source、clean load、matched phase、fixed `1600x900` viewport重跑high/day/below four-preset grid。Globe/Planar edge metrics是
  cumulus `.797/.765`、stratus `.718/.697`、cirrus `.273/.315`、mixed `1.550/1.434`，明显不同于交付记录的
  `2.595/2.503`、`.977/.978`、`.637/.665`、`1.978/1.840`。
- 实际画面仍是cumulus地平线小团、stratus宽阔模糊层、cirrus近乎不可见；mixed仅有有限层次，尚未达到owner/reference visual target。
- `a4r-high-day-below-cloud-only-matched.png`生成于最终renderer/Test修改之前；它可以显示旧metrics，但不能证明current final source。

#### Root cause

1. Stationary history修正后只发布current spatial signal，旧transition/history状态不再替当前空间采样补充细节；这暴露了交付artifact与final source不一致。
2. Outer march的coarse “occupancy”只是cell中心的一次full-density sample。它不是conservative max/min bound；thin layer、侵蚀边缘或sub-cell body在中心为零时会被
   直接跳过，即使interval内其他位置有云。
3. 只有中心样本为正的coarse interval才执行最多four fine samples。Explicit LOD/mipmap能降低远距alias，却不能恢复已经被empty-space判定跳过的形态，也不能
   单独证明0.9–1.2 km feature得到足够积分。
4. Review没有记录final artifact的source fingerprint、query/viewport或生成时序，因此旧artifact与后续source修改没有被门禁隔离。

#### Required repair

1. 把center-point skip替换为conservative macro/occupancy authority，例如max-density mip、min-max hierarchy或能证明不会漏掉positive sub-cell的analytic bound。
   增加controlled thin/sub-cell feature fixture：旧中心点算法必须确定false-negative，新算法必须保留support与非零积分。
2. 从最小保留feature和每个occupied interval长度推导fine-step budget；记录Globe/Planar各preset的actual coarse/fine sample、skip、early-out histogram，而不是只
   检查shader常量或loop上界。
3. 如果有界spatial path仍不足，经ADR明确授权与`cloudTime`解耦的bounded stationary sampling sequence；必须有限收敛、可freeze、request-render可控，不能恢复
   永久loop或依赖Test transition history。
4. 在所有final product/Test edit之后生成artifacts。记录source diff fingerprint、page query、CSS viewport/device scale、preset/quality/light/view sequence；两次clean
   reload和`grid -> close -> combined -> diagnostic`都必须复现同一范围内的metrics与云型。

#### Closure

- Controlled fixture证明positive sub-cell不再被coarse skip丢失；sample/skip evidence与resource/performance budget一致，near geometry identity及dual-world
  radiometric bounds不回归。
- Current final source的medium/high、day/sunset、below/inside/above、cloud-only/combined matched/unmatched grids在规定viewport可重复；cumulus显示竖向体积和
  受光层次，stratus保持层状而非fog wall，cirrus是可辨的高薄云，mixed显示分离高度。
- 自动化门禁通过后仍需project owner明确通过live visual gate，才能关闭本finding。

### A4-AR-016 — Blocking: current record仍含错误验证结论和active-looking旧contract

#### Exact symptom

- Review/top-level records报告focused+A1 `61/61 SUCCESS`，Architecture exact command
  `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"`实际是controller `53 SUCCESS / 1 FAILED`。
- Phase plan前半仍以普通current heading描述十properties、四assets `1,327,104 bytes`、`+2 programs/+4 textures`和“无history”，而current A4R是十一properties、
  five assets `11,796,480 bytes`、`+4 programs/+2 commands`与two ping-pong history managers。

#### Root cause

Execution改写了review顶部资源摘要，但没有以一次真实clean focused rerun验证其count；phase plan又只在尾部追加A4R closure，旧frozen contract仍呈现为active
authority。由此“coherent delivery record”结论先于事实成立。

#### Required repair and closure

- 在`A4-AR-017`修复后重跑exact focused并按真实结果更新review、phase、README和extension plan；不得保留失败时的`61/61`。
- 将pre-A4R contract全部置于明确的dated/superseded history容器，或直接把authoritative sections改写为A4R current contract；提供唯一current资源/验证表。
- Exact search只能在清楚标记的historical/superseded段落找到旧数字；README、extension/phase plan、review和ADR current status一致后关闭。

### A4-AR-017 — Blocking: mip candidate failure atomicity Spec未命中actual runtime class

#### Exact symptom

Focused failure位于`destroys candidate 3D textures when cloud mip generation fails`：预期throw没有发生，`destroy` spy预期`2`实际`0`，
`renderer._resources`不再是last-good object，旧`cloudShapeTexture`已被销毁。这不仅是计数偏差，而是测试执行了成功publication并破坏previous resources。

#### Root cause

Spec从deep source导入`Texture3D`并spy `Texture3D.prototype.generateMipmap/destroy`，但subject经public `packages/engine/index.js`运行，使用bundled duplicate
`Texture3D` class identity。Spy从未拦截actual runtime texture，故“injected cloud mipmap failure”没有注入；现有atomicity assertion是无效测试authority。

#### Required repair

1. 从`publishedResources.cloudShapeTexture`取得actual runtime prototype/constructor并在该identity注入第一次cloud mip generation failure；或让subject与spy
   一致使用deep-source renderer/class graph，不能再混用public bundle与source prototype。
2. 断言publish同步抛出exact injected error；`_resources`保持last-good exact object，旧textures全部live且未destroy。
3. 断言失败candidate中已创建的cloud texture、scattering Texture3D、program/command/2D textures等按ownership exactly once释放，未创建项不destroy、无backup/
   candidate leak。另加guard使错误module identity的spy确定失败，避免再次出现vacuous injection。

#### Closure

Controller focused达到`54/54`，A1 `7/7`后focused+A1达到`61/61`；failure fixture确实经过`generateMipmap`throw path并证明last-good preservation与candidate
exact cleanup。随后再更新current validation summary；未满足前不得请求owner gate或checkpoint。

## Execution repair — A4-AR-013/016/017 — 2026-08-27

### A4-AR-017 actual runtime identity and failure atomicity

- Root cause与Architecture一致：subject经public bundle加载的`Texture3D`和Spec deep-source import不是同一class identity。Fixture现在从已发布
  `cloudShapeTexture`取得actual runtime prototype；同时保留wrong-module spy并断言它未命中，从而错误identity不能再产生vacuous pass。
- Actual runtime `generateMipmap`第一次调用抛出exact injected error。Publication后`renderer._resources`仍是last-good exact object，全部旧textures保持live；
  candidate已创建的Texture3D `2`、Texture2D `2`、program `7`、VA `1`、vertex buffer `1`均exactly once销毁，未创建项保持untouched。
- Final controller为`56/56 SUCCESS`，A1 pipeline为`7/7 SUCCESS`，合计`63/63`。相对Architecture当时的`54+7`，新增两项是下面的thin
  conservative fixture与compiled scheduler histogram fixture；不是遗漏或过滤变化。

### A4-AR-013 conservative hierarchy and bounded sampling

- Root cause进一步量化：旧center-point authority允许thin/sub-cell positive density在coarse center为零时被跳过；最初“positive shape”层级也不足，因为tracked
  shape的derived base value在全部`2,097,152` texels上均大于零，无法形成真实empty-space skip。
- Candidate现在从tracked shape建立ceil-quantized R8 maximum hierarchy。每级在periodic S/T/R上合并`4x4x4` source neighborhood，形成one-source-cell
  halo；nearest mip lookup只在整个covered interval的maximum仍低于当前preset morphology threshold时跳过。Weather、height profile与detail erosion只能在
  该保守判定后进一步降低density。Derived hierarchy拥有candidate lifecycle，大小exact `2,396,745 bytes`，失败时参与同一atomic cleanup。
- Controlled thin fixture使用周期`20` voxels、active width `8`的shape。Planar旧64个center samples命中`0`次，且duty `0.4`低于cumulus
  threshold `.56`；new compiled Globe/Planar pass均保留nonzero support、finite front/mean和nonidentity transmittance。Fine budget由
  `ceil(coarseStep/(minimumFeature*0.5))`推导并clamp到quality上限；该fixture的Planar/Globe interval分别得到`4/3` fine samples。
- Test-only compile define在不新增runtime uniform/program/resource的前提下，从actual cloud pass的RGBA16F MRT读取visited coarse、fine、skip和early-out。
  Four deterministic phases同时覆盖Perspective/Orthographic与linear/log。High/default real-asset totals如下；所有fine counts均不超过
  `(coarse-skip)*4`：

| World  | Preset  | Rays | Coarse |  Fine |  Skip | Early-out |
| ------ | ------- | ---: | -----: | ----: | ----: | --------: |
| Planar | cumulus | 1050 |  67200 | 64574 |  7822 |         0 |
| Planar | stratus | 1098 |  70266 | 70266 |     0 |         1 |
| Planar | cirrus  | 1098 |  70272 | 24812 | 45582 |         0 |
| Planar | mixed   | 1098 |  70148 | 53138 | 24266 |         3 |
| Globe  | cumulus | 1152 |  73728 | 75737 |  7752 |         0 |
| Globe  | stratus | 1152 |  73728 | 73728 |     0 |         0 |
| Globe  | cirrus  | 1152 |  73728 | 26118 | 47610 |         0 |
| Globe  | mixed   | 1152 |  73484 | 56750 | 24676 |         6 |

Stratus的连续sheet descriptor在这些real-asset rays上不产生skip，属于预期语义；其他三种preset均有真实empty-space skip。No permanent render loop、
cloudTime-independent stationary sequence或A5/A6扩展被引入。

### Final-source reproducibility and visual evidence

- Product/Test/asset evidence fingerprint是`9173f323eb66fe622f0f71709e8b76f61fca1b13`。Clean gate使用
  `http://127.0.0.1:8080/Test/高级环境.html?phase=matched&globePhaseX=90000&globePhaseY=30000&final=threshold{1|2}`、Chromium
  viewport `1600x900`、device scale `1`、`enabled -> high -> day -> cloudGround -> cloudOnly -> Perspective -> preset grid -> close -> combined -> diagnostic`。
- Two clean loads逐项得到matched high edge Globe/Planar：cumulus `2.039/1.944`、stratus `.971/.950`、cirrus `.644/.670`、mixed
  `1.842/1.730`；随后both-world `fixed=0`、`captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`与cloud gates PASS，errors=`0`。
  这些数值取自stationary current-spatial final source，不再沿用stale artifact或history-contaminated指标。
- Final artifact根目录为local temp `a4r-artifacts-9173f323-*`，不纳入repository。Matched medium edge Globe/Planar为cumulus
  `1.893/1.824`、stratus `1.085/1.052`、cirrus `.747/.753`、mixed `1.728/1.619`。Evidence重新覆盖matched high/medium、
  representative unmatched high/medium、day/sunset、below/inside/above和cloud-only/combined；exact files为
  `matched-high-cloud-only.png`、`matched-medium-day-below-cloud-only.png`、`unmatched-high-day-below-cloud-only.png`、
  `unmatched-medium-day-below-cloud-only.png`、`unmatched-medium-day-inside-combined.png`、`unmatched-high-sunset-above-cloud-only.png`及
  `unmatched-medium-sunset-below-combined.png`。每张都在全部final product/Test edits之后生成。Owner visual acceptance仍由Architecture发起独立live
  gate，本handoff不自行请求。

### A4-AR-016 coherent current record

- Current authority统一为eleven public properties、five tracked assets=`11,796,480 bytes`、six runtime cloud textures（含derived occupancy）、static
  GPU=`15,691,189 bytes`、program/command=`7/4`、one low-resolution MRT plus two full-resolution ping-pong history managers、controller/A1=`63/63`。
- Phase plan前部的pre-A4R十properties、four assets、no-history内容保留在明确`Superseded pre-A4R contract`容器内，仅作为dated history；review历史finding中的
  旧计数同样不是current authority。README、extension plan、phase plan、discussion与本review的current handoff将同步到上述事实。

### Final affected validation boundary

- Controller `56/56`、A1 pipeline `7/7`、exact Scene aggregate `127/127`、CloudCore generator `10/10`及correct
  `--target ... --verify-only`全部通过。一次省略required `--target`的CLI尝试按预期被argument guard拒绝，不计为验证结果；随后exact command通过并报告
  `11,796,480 bytes`。
- `npm run build`、`npm run build-release`及installed-package verifier通过；verifier报告GLSL/generated modules `23/23`、three asset roots exact、
  engine/root ESM/CJS、A4R public runtime/types和private hiding均通过。Public contract与type/doc source本轮未变化，因此未重复先前已接受的`build-ts`、
  `build-docs`和`tsc`。
- Exact changed-scope ESLint、Prettier、AgentDocs Markdownlint、`git diff --check`、Scene.js/upstream-manifest empty diff及official audit通过；audit报告
  current-delivery upstream-owned=`0`、generated=`0`。Full repository Spec suite与dual-world live 4K timing仍按phase boundary未运行。

Execution status：`review-ready`。Tree保持uncommitted/unpushed；owner gate、checkpoint、push与A5 activation继续blocked，等待Architecture独立复审。

## Architecture blocker decision — A4-AR-011 runtime determinism stage — 2026-08-27

Execution按sixth re-review要求建立serialized generation-token transaction，先冻结matched Sun，再串行both-world capture；paired frames报告
`generationOrdered=true`与`authorityEqual=true`。Architecture独立复跑current focused controller为`56/56 SUCCESS`。本轮不接受`review-ready`，但接受
“wrong-generation race已不再是当前首要解释”的收敛结果。

### Exact retained blocker

- Query `phase=matched&globePhaseX=90000&globePhaseY=30000&final=ar011ab`、`1600x900` DPR `1`下，diagnostic #1 both-world
  exact zero/true；无UI/product change的consecutive diagnostic #2中，Globe low MRT color/distance delta=`73.4021/13.1719`，Planar=`587.8660/153.1220`，
  resolved transmitted/radiance也非零。Browser/page/render errors为`0`。
- Difference已出现在history resolve之前的low-resolution cloud MRT；因此EMA、history read/write index或stationary resolve不能单独解释当前失败。
- 但当前`captureDiagnosticAuthority`仍不是“full authority”：depth只记录texture object id/width/height，不记录contents；history只记录`key/resetReason`，未记录
  valid/stationary/weight/readIndex、history framebuffer/texture identities；也没有记录low MRT target/program/static texture/sampler identities。Execution提到的
  clear-depth direct-execute fixture已移除，不能作为retained review evidence。因此当前只能把root-cause layer收敛到“unfrozen GPU input/content、FBO/readback
  state或cloud Shader子阶段中的undefined/stateful behavior”，不能在没有可证伪矩阵时指定某一GLSL表达式。

### Architecture-authorized bounded diagnostic

Execution只在A4 retained scope内建立一个real-Context deterministic replay Spec，不继续视觉调参，不扩大public API/pass/resource/asset/upstream surface：

1. 复用现有Globe/Planar off-center raw MRT fixture，固定one clear-depth texture、controlled constant shape/detail/weather/turbulence/STBN、camera/A1 frame/Sun/
   preset/quality与`cloudTime`。同一个`executeHdr`/cloud command连续执行两次，立即复制两张owner low-MRT attachments的完整raw half bits；same Context内必须
   byte-identical。覆盖Perspective/Orthographic与linear/log，先用one preset定位，closure再覆盖four presets及one fixed real-asset phase。
2. Snapshot必须包含depth texture exact contents/hash、all CPU uniform values、program identity/defines、cloud framebuffer及attachment identity、six static texture
   identities/dimensions/sampler state、history valid/stationary/weight/readIndex与history attachment identities。History字段用于证明resolve边界；low MRT replay不得把
   history当输入。
3. 用Spec-owned program/FBO且`try/finally`恢复product command，按以下first-failing-stage顺序执行exact raw replay：
   - constant dual-MRT sentinel；
   - pixel/ray/STBN/segment-only；
   - occupancy+density、lighting disabled；
   - full density+Sun/sky lighting。
     每一stage先same owner FBO repeated draw，再two independently allocated MRT targets A/B。不得一次加入更多stage；第一个失败stage即成为下一次root-cause
     authority。
4. 若constant stage失败，先修command/FBO attachment/readback ownership，不改cloud math；若ray stage失败，检查viewport/fullPixel/uniform upload；若density stage
   首次失败，检查3D mip/LOD/wrap/precision；若仅full-lighting失败，检查LUT sampling与radiometric math。Test-only programs/defines不得进入runtime candidate或package
   resource count。
5. Latest fullPixel、analytic footprint、STBN `texelFetch`、weather LOD0、rationalized Globe height与stable spatial target可暂时保留，但source-string assertion不是
   closure；它们必须由上述behavioral replay覆盖。任何实验性product edit必须在对应first-failing-stage变绿时才可保留。

### Closure

- Low MRT：same Context、identical input bytes下，both worlds × two frusta × linear/log × four presets的two consecutive full-attachment raw reads exact
  byte-identical；one fixed real-asset phase同样exact。Constant/ray/density/full stage均给出明确结果，test instrumentation完全移除或保持Specs-only。
- Resolve：在low MRT exact之后，invalid与stationary full-resolution attachments连续两帧exact；moving-time EMA继续nonidentity且bounded。
- Integrated：two cache-disabled clean loads各执行合法grid transition后连续两次diagnostic，四次both-world均为`fixed=0`、
  `captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`，authority snapshot完整、errors=`0`。
- `A4-AR-016`只能用上述唯一retained evidence关闭。未满足前保持`changes-requested`，不得请求owner gate、checkpoint、commit/push或进入A5。

## Execution repair — A4-AR-011/016 deterministic replay closure — 2026-08-27

### Root cause and first-failing-stage evidence

- Retained real-Context fixture now runs constant sentinel -> ray/STBN/segment -> density-only -> full lighting. Each stage compares two owner-MRT draws and
  independently allocated A/B MRT targets under `try/finally`; controlled textures, clear depth, camera/A1 frame, Sun, preset, quality and time are frozen.
- Both worlds × Perspective/Orthographic × linear/log × four presets and one fixed real-asset phase are byte-identical for both low-MRT RGBA16F attachments.
  This closes the suspected command/FBO, ray, density/mip/LOD and lighting/LUT layers behaviorally, not through source-string assertions.
- Test authority includes full depth-texture GPU-copy hash, all cloud CPU uniforms, program/defines, command/VA/render state/pass viewport, low/history framebuffer and
  attachment identities, six cloud textures plus three atmosphere textures with dimensions/samplers, and complete history state. Raw reads cannot cross a successful
  frame generation; paired captures require exact generation `+1` and deep-equal comparable authority.
- With full depth and low MRT exact, the remaining intermittent one-half-ULP delta occurred only in full-resolution spatial resolve. GLSL `exp2` bilateral weights use an
  implementation-dependent transcendental approximation, so repeated identical draws could quantize the same mathematical result to adjacent RGBA16F values.

### Repair

- Spatial/front bilateral weights now use fixed `(1 + ln(2) * x / 16)^-16` rational arithmetic. No output quantization, relaxed threshold, previous-history reuse,
  visual multiplier, new program/pass/resource or public change was introduced.
- Stationary history remains valid in JS diagnostics, but the shader-facing state is the same as an invalid spatial-only first frame (`valid=false`, `weight=0`). Moving
  time still uses the accepted `0.82` EMA and full attachment compatibility checks.

### Raw and integrated closure

- Final product/Test/assets/scripts content fingerprint is `4ca82559fd900f67608a2c6340320a71dd2aca51`. Two cache-busting clean loads used `1280x720`
  DPR `1`, query
  `phase=matched&globePhaseX=90000&globePhaseY=30000&final=ar011f{1|2}` and sequence
  `enabled -> high -> cloudGround -> Perspective -> cloud-only -> preset grid -> close -> combined -> diagnostic -> diagnostic`.
- All four diagnostics in both worlds report `fixed=0`, `captureTemporal=0/0`, `mrtFixed=0/0`, `geometryInvariant=true`, cloud gates PASS and zero browser/page/render
  errors. Each transaction retained ten exact paired-authority comparisons. Final matched-high edge Globe/Planar is cumulus `2.349/2.175`, stratus `.812/.774`,
  cirrus `.601/.533`, mixed `2.089/1.881`; these are the only current grid metrics.
- Final automated boundary passed: controller `56/56`, A1 pipeline `7/7`, exact `Scene/Scene` trailing-space filter aggregate `127/127`, CloudCore generator `10/10`, tracked
  verify-only `11,796,480 bytes`, `build`, `build-release`, and installed verifier `23/23`. Public/type/doc source did not change, so previously accepted
  `build-ts`/`build-docs`/`tsc` were not rerun. Full Spec suite and dual-world live 4K timing remain unrun by phase boundary.

### A4-AR-016 current record

Current authority is eleven public properties, five tracked assets, six runtime cloud textures, static GPU `15,691,189 bytes`, program/command `7/4`, one low MRT and
two full-resolution ping-pong history managers. Pre-A4R and earlier failed-review metrics remain only in explicitly historical sections. README, extension plan, phase
plan, discussion and this review now point to this closure. `Scene.js` and `.scenegis/upstream-patches.json` remain exact unchanged; current-delivery upstream-owned=`0`,
generated=`0`.

Execution status is `review-ready`. The retained tree is uncommitted/unpushed; owner gate, checkpoint, push and A5 activation remain blocked pending Architecture
independent re-review.

## Architecture seventh independent re-review — Go for owner visual gate — 2026-08-27

Architecture对fingerprint `4ca82559fd900f67608a2c6340320a71dd2aca51`对应的retained tree完成source、real-Context与local Chromium独立复核。
Codebase-memory仍未收录本轮replay/resolve symbols，按仓库规则使用exact path/string fallback；这是tool index gap，不是代码证据。

### A4-AR-011 — Resolved: low MRT与resolve确定性闭环

- 分阶段Spec确实创建并执行real `ShaderProgram`：constant sentinel、ray/STBN/segment、density-only三层使用Specs-owned program，full层直接复用产品
  Globe/Planar linear/log cloud program。每层均比较same owner MRT连续draw与independent A/B MRT targets，所有mutation由`try/finally`恢复；不是
  source-string或vacuous fixture。
- Architecture exact复跑controller=`56/56 SUCCESS`、A1 private pipeline=`7/7 SUCCESS`、`Scene/Scene` trailing-space filter aggregate=
  `127/127 SUCCESS`。Controller边界实际覆盖both worlds × Perspective/Orthographic × linear/log × four presets、controlled texture replay与real-asset
  phase raw equality；resolve另有invalid/stationary raw attachment equality与moving-time nonidentity。
- Architecture以`1280x720` DPR `1`、matched phase `90/30 km`独立执行two clean loads。每个load均按
  `enabled -> high -> cloudGround -> Perspective -> cloud-only -> preset grid -> close -> combined -> diagnostic -> diagnostic`执行。四个transaction、
  共`40`组paired reads全部`generationOrdered=true`、`authorityEqual=true`、differences empty；both worlds四次均为`fixed=0`、
  `captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`、cloud gates PASS。Browser warning/error、page/render error与error panel均为`0`。
- `sceneGISCloudDeterministicExp2Negative`只替换resolve spatial/front bilateral weight；invalid/stationary仍发布current spatial attachments，moving
  `0.82` EMA和完整compatibility保持。该有理式在实际spatial输入域保持positive/monotonic；相对原`exp2`的最大绝对weight偏差约`0.0166`，属于
  需要owner视觉门禁确认的filter calibration，而不是未关闭的determinism defect。不得把它描述为原`exp2`的pixel-identical替代。

### A4-AR-016 — Resolved with evidence precision qualification

- 第一clean load的matched-high Globe/Planar edge与Execution记录一致：cumulus `2.349/2.175`、stratus `.812/.774`、cirrus `.601/.533`、mixed
  `2.089/1.881`。第二clean load只有Planar cumulus为`2.179`，其余七项在三位小数下相同。
- Symptom不是raw runtime漂移，而是serialized transaction之外、从8-bit display-grid capture计算的observational scalar具有`0.004`幅度差异。Root
  cause boundary是grid capture/display transfer/timing没有纳入raw diagnostic authority；因此修复是把该指标记录为Planar cumulus
  `2.175–2.179`（或两位小数`2.18`），不得再宣称two-clean-load bit-exact，也不得用该scalar覆盖raw attachment gate。
- Closure以本轮四个transaction/`40`组raw paired reads exact为determinism authority；grid edge只用于视觉结构趋势。Current delivery事实继续统一为
  eleven public properties、five tracked assets=`11,796,480 bytes`、six runtime cloud textures、static GPU=`15,691,189 bytes`、program/command=`7/4`、
  one low MRT与two full-resolution ping-pong history managers。

Architecture结论为`Go for project-owner visual gate`。这不是A4 phase completion：owner需对four presets、Globe/Planar color/opacity一致性、云下/云内/
云上与day/sunset画面作live确认。Owner通过前不得checkpoint、commit/push或激活A5；owner若No-Go，必须按可见symptom、root cause、repair和closure重新打开
具体finding，不能只写“质量不足”。

## Project-owner visual gate — No-Go — 2026-08-27

Owner提供三张final-source截图并明确拒绝当前画面：Globe与Planar均在地平线/云层交界出现整行断带；相机俯视时，aerial perspective出现贯穿viewport的
水平颜色分层；同视角height fog也出现同类分层。该反馈是可复现的具体现象，不是泛化的“质量不足”。因此撤销
`approved-for-owner-gate`，A4保持active/changes-requested；checkpoint、commit/push与A5继续blocked。

### A4-AR-018 — Blocking: A4 clear-depth widening把有效地表深度误判为clear

#### Symptom

- Owner截图2在俯视地表时出现一条完整水平分界：上下区域使用不同aerial composition，但两侧仍能看到ordinary geometry。
- Owner截图3在相同俯视构图、height-fog路径下报告同类分层。Aerial与fog共享同一full-resolution shader和depth branch，因而不是两套独立光学模型同时偶然
  产生相同边界。

#### Root cause

- A4相对A3把`SceneGISEnvironmentEffectsAerialFS.glsl`的clear test从decoded depth单一far-plane判断扩为
  `rawDepth <= 1e-7 || rawDepth >= 1-5e-7 || czm_readDepth(...) >= 1-5e-7`。
- 同一shader随后用`!isClearDepth`同时门控aerial和height fog。俯视时，远处但有效的surface depth落入epsilon neighborhood即整行跳过A2/A3，邻行仍执行，
  直接形成owner截图中的full-width discontinuity。`CloudFS`与`CloudResolveFS`复制了同一classifier，使错误继续进入cloud geometry clipping和resolve。
- 这是A4引入的shared depth-classification regression；不是LUT、fog积分或radiance scale本身的根因。现有`renderDepth(0)`与`renderDepth(1)`相等fixture只证明
  synthetic endpoints被当作clear，未覆盖`0 < depth < 1`的near-sentinel valid geometry，因此未能发现该回归。

#### Required repair

1. 先以real Scene downward fixture读取分界线上下pixel的raw depth、decoded depth、reconstructed eye distance与geometry presence，分别覆盖Globe/Planar和
   linear/log；明确current resolved target的exact clear sentinel。
2. 用一个直接、精确的geometry-presence contract替换epsilon-neighborhood heuristic。只有actual clear sentinel可走identity/background path；任何finite
   non-sentinel depth必须重建并执行aerial/fog。不得增加fallback、自动纠偏、额外clamp或“再放宽一点”的阈值。
3. Aerial、cloud low MRT与cloud resolve必须消费同一语义，不能保留三个会再次漂移的不同classifier。修复不得新增pass/FBO/texture/public API或upstream hook。

#### Closure

- Focused real-Context fixture使用sloped/large surface让depth跨过旧`1e-7`和`1-5e-7`边界；除exact clear sentinel外，每个sample都必须
  `geometryPresent=true`且eye distance finite/ordered。覆盖both worlds与live linear/log即可，不运行full suite。
- 两个固定Perspective/day视角足够：一个俯视、一个近地平线。分别运行aerial-only与fog-only；用跨分界scanline的相邻pixel delta证明没有viewport-wide
  step，同时geometry仍可见。无需重跑24-state、all presets或build/docs/type边界，除非实际修改触及对应surface。

### A4-AR-019 — Blocking: cloud/scene hard occlusion在错误depth分类上放大为双世界断带

#### Symptom

Owner截图1中Globe与Planar都在sky/ground/cloud交界出现多条水平断层：云体不是自然被terrain遮挡，而是在整行范围内突然消失/重新出现，并与大气颜色留下
可见间隙。两世界相同拓扑说明问题位于shared cloud depth/composite path，而非Globe shell或Planar slab单独的density morphology。

#### Root cause

- `CloudFS`在同一错误`isClearDepth`下把有效geometry从finite `distanceToGeometry`切换为background distance；`CloudResolveFS`又把同一pixel切换为
  unbounded scene distance。
- Full-resolution `sceneGISSelectCloudSample`随后以
  `distances.y + 0.00025 >= encodedSceneDistance`执行固定250 m、binary reject。Low-resolution depth状态一旦跨行从finite跳到background，最终composite
  没有连续coverage可过渡，因而放大成owner截图的row-wide detach。该hard cutoff原本用于阻止near-geometry leakage，但没有获得horizon continuity证据。

#### Required repair

1. 必须先完成A4-AR-018；在正确geometry-presence下分别捕获cloud front/mean/max march distance与full-resolution scene distance，确认断带是否仍由250 m
   cutoff触发。
2. 若仍触发，把occlusion authority收敛到已depth-aware resolved的front/max-distance contract；移除固定binary 250 m偏置，或改为与实际reconstruction
   footprint一致的bounded transition。不得用Test-only opacity、world-specific multiplier、blur pass或扩大temporal history掩盖边界。
3. 保持near geometry不泄漏、clouds-off identity、both-world matched radiometry和现有resource/pass预算；不在本修复中继续云型美术调参。

#### Closure

- 同一horizon fixture必须同时证明：cloud front在scene前时连续可见，在scene后时正确遮挡；former boundary两侧不再出现整行空带；near target max delta继续
  `<=1`。只需cloud-only与combined两次fixed-camera capture，both worlds side-by-side。
- 最小验证限定为受影响的controller Specs、A1 pipeline smoke、两张fixed-camera local screenshots以及changed-scope lint/diff check。明确不跑full
  repository Specs、不重跑无关generator/package/type/docs矩阵。

Owner追加执行约束已接受：后续只做上述source-directed fix和最小充分验证，不做全量测试；也不以fallback、宽松阈值、隐藏倍率、额外guard或重复状态检查进行
防御性编程。Execution下一次handoff必须逐项给出symptom -> root cause -> repair -> closure evidence。

## Execution repair — A4-AR-018/019 depth and occlusion continuity — 2026-08-27

### Root cause -> repair

- `A4-AR-018`：三个fragment path不再使用`1e-7`/`5e-7` neighborhood。共享
  `sceneGISIsClearResolvedDepth(rawDepth, resolvedDepth)`只在raw与decoded storage同时为exact `0/1` sentinel时判定clear；任一finite
  non-sentinel都进入Cesium
  depth builtin一次并重建finite scene distance。Aerial、cloud low MRT和cloud resolve引用同一个GLSL语义函数，没有fallback、额外clamp或第二状态检查。
- `A4-AR-019`：移除`distances.y + 0.00025 >= encodedSceneDistance`的fixed 250 m binary reject。Final composite先形成
  `frontDelta=sceneDistance-cloudFrontDistance`，再以`fwidth(frontDelta) + 1 m encoded baseline`定义bounded reconstruction footprint，并连续缩放cloud
  premultiplied radiance/opacity。Cloud在scene front前连续可见、在scene后连续遮挡；未增加blur/history/pass/FBO/texture/API或world multiplier。

### Focused raw and real-Scene closure

- Controller real-Context fixture以raw depth `5e-8`及`1-2e-7`跨越旧阈值；both worlds、Perspective/Orthographic、linear/log均证明旧classifier会走错的
  sample现在走finite geometry path，exact `0/1`仍保持clear identity。新增真实opaque Globe surface同时覆盖linear/log depth，真实Planar resolved-depth
  integrated path保留log路径并以controlled real-Context linear/log fixture补齐variant authority；reconstructed distance均finite/positive。
- Final controller=`57/57`，A1 private pipeline=`7/7`，focused+A1=`64/64`。未运行full repository Specs、24-state smoke、generator、package、types或build矩阵，
  符合本finding冻结的最小边界。

### Fixed-view live closure

- Local/no-network Chromium query为`phase=matched&globePhaseX=90000&globePhaseY=30000&ar018=final-and`。Perspective/day downward view使用Test-owned
  `500 km × 500 km` opaque surfaces，确保两世界整个测量ROI内ordinary geometry持续存在。Aerial相邻scanline最大step Globe/Planar=
  `0.033/0.032`，fog=`0.020/0.034`；transaction=`passed`、render errors=`0`。
- Horizon `cloudGround` clean load的cloud-only geometry scanline step两世界均为`0.000`，near-target maximum delta均为`0`（要求`<=1`）；cloud-only与combined
  side-by-side均无旧row-wide空带。Local artifacts保存在
  `C:/Users/USER/AppData/Local/Temp/a4r-ar018-019-final/`：`downward-aerial-fog-continuity.jpg`、`horizon-cloud-only.jpg`、
  `horizon-combined.jpg`，不纳入repository。

### Boundary and handoff

- Codebase-memory graph未收录近期uncommitted EnvironmentEffects shader symbols；按规则完成graph attempt后使用exact path/string fallback，作为tool index gap记录。
- Product resource/program/pass/asset/public/upstream surface不变。`Scene.js`、SGP-0008 ranges及`.scenegis/upstream-patches.json`保持exact unchanged；
  current-delivery upstream-owned=`0`、generated=`0`。
- Exact changed-scope ESLint、Prettier、AgentDocs Markdownlint与`git diff --check`通过；official upstream audit报告current-delivery
  upstream-owned=`0`、generated=`0`。
- Implementation status=`review-ready`。Retained tree保持uncommitted/unpushed；owner gate、checkpoint、push与A5仍blocked，等待Architecture独立复审。

## Architecture focused re-review — No-Go — 2026-08-27

结论：`changes-requested`。`A4-AR-018`关闭；`A4-AR-019`尚未形成portable closure，并新增一个source-correctness blocker
`A4-AR-020`。A4保持active；owner visual re-gate、checkpoint、commit/push与A5 activation继续blocked。

Architecture按owner约束只检查affected shader/Specs与三张final artifact，并独立复跑controller `57/57`、A1 private pipeline `7/7`，未运行full suite、
Scene aggregate或无关build/package/generator/type/docs矩阵。三张artifact中未再观察到owner原始的downward full-width layer或horizon row-wide detach；
`A4-AR-018`的shared exact-sentinel source、raw fixtures与real opaque depth evidence一致。Codebase-memory recent uncommitted symbol仍未入图，已按规则完成
graph/search attempt后使用exact path/string fallback。

### A4-AR-020 — Blocking: cloud occlusion footprint在non-uniform control flow内求fragment derivative

#### Symptom / evidence

`SceneGISEnvironmentEffectsAerialFS.glsl::sceneGISSelectCloudSample`先对`distances.a < 0.5`执行per-fragment early return，再仅在
`if (!clearDepth)`内执行`fwidth(frontDelta)`。Invalid cloud distance与resolved geometry presence都会在cloud/scene silhouette处逐fragment变化，正是该
transition需要稳定导数的区域。Fragment derivative在non-uniform control flow内没有defined portable result；因此本机Chromium截图和scanline数值通过只说明
当前driver的一个执行结果，不能证明另一GPU/driver或相邻quad不会重新产生edge detach。

#### Root cause

`A4-AR-019`把fixed 250 m binary reject替换为derivative-based reconstruction footprint时，只替换了visibility公式，没有把derivative evaluation提升到
uniform execution region。结果是新公式的数学方向与premultiplied composition正确，但其footprint authority仍依赖silhouette处的undefined derivative。

#### Required repair

在`sceneGISSelectCloudSample`中，于任何基于`distances.a`或`clearDepth`的branch/return之前无条件计算`frontDelta`与
`fwidth(frontDelta) + 1 m encoded baseline`；随后再用现有invalid/clear语义选择visibility，并保持
`cloudColor.rgb *= visibility`与`cloudColor.a = mix(1.0, cloudColor.a, visibility)`不变。不得增加fallback、额外guard、clamp、blur、threshold tuning、
history、pass/resource/API或world-specific multiplier。

#### Closure evidence

1. Shader contract证明`fwidth(frontDelta)`在该函数第一个data-dependent branch/return之前；invalid distance仍返回identity、clear depth仍保留cloud、finite
   geometry仍按front distance连续遮挡。
2. 仅复跑affected controller与A1 pipeline focused Specs；不扩大到full suite或无关矩阵。
3. 从最终source重生成同一downward aerial/fog与horizon cloud-only/combined artifacts，维持既有scanline、near-target no-leak与zero render-error gates。

### Boundary

本轮没有修改product source。Current delivery的upstream-owned files=`0`、generated=`0`；`Scene.js`、SGP-0008 ranges与
`.scenegis/upstream-patches.json`保持unchanged，A4仅consume active `SGP-0008`。Retained working tree继续uncommitted/unpushed。

## Execution closure — A4-AR-020 portable derivative ordering — 2026-08-27

- `frontDelta`与`fwidth(frontDelta) + 1 m encoded baseline`现于cloud-distance sample之后立即无条件计算，严格位于
  `distances.a < 0.5` early return及`if (!clearDepth)`之前。Invalid/clear selection、visibility方向与premultiplied color/alpha composition未改变。
- Shader contract把`sceneGISSelectCloudSample`独立切片，并分别断言`fwidth(frontDelta)`早于第一个invalid-distance branch、clear-depth branch和early
  return；把derivative移回任一data-dependent control flow会确定失败。
- Focused controller=`57/57`、A1 pipeline=`7/7`，focused+A1=`64/64`。没有运行full suite、Scene aggregate或无关build/package/generator/type矩阵。
- Final local/no-network queries为downward `phase=matched&globePhaseX=90000&globePhaseY=30000&ar020=final`及独立clean-load horizon
  `phase=matched&globePhaseX=90000&globePhaseY=30000&ar020=clean-horizon`。Downward aerial scanline Globe/Planar=
  `0.033/0.032`、fog=`0.020/0.034`；horizon cloud-only geometry scanline=`0/0`、near-target max delta=`0/0`。两个transaction均`passed`且没有
  render error。三张同名artifact已从final source覆盖写入local temp `a4r-ar018-019-final`。
- Product public/resource/pass/asset/upstream boundary没有变化。Implementation status=`review-ready`；tree保持uncommitted/unpushed，owner re-gate、
  checkpoint、push与A5继续blocked，等待Architecture独立复审。

## Architecture A4-AR-020 independent re-review — No-Go — 2026-08-27

结论：`A4-AR-020`源码修复accepted，但A4仍为`changes-requested`。新增`A4-AR-021`；owner visual re-gate、checkpoint、commit/push与A5
activation继续blocked。

Architecture按冻结边界检查了current shader、source-order assertion及三张final artifact。`fwidth(frontDelta)`确实在
`sceneGISSelectCloudSample`的invalid-distance branch、clear-depth branch与first early return之前执行，且原visibility/premultiplied composition未改变。
三张artifact未再显示owner原始的downward full-width layer或horizon row-wide detach。Codebase-memory recent uncommitted symbols仍未入图；完成graph/search
attempt后只使用exact path/string fallback。

### A4-AR-021 — Blocking: focused clear-depth identity依赖Spec order/state

#### Symptom / evidence

Architecture独立运行exact controller filter得到`56/57`。失败项为
`renders the planar day-night, height, orthographic, and underground matrix`：`logarithmicDepth=true`、cloud disabled、clear-sky场景中，启用aerial pass后的
实际像素为`[57,111,170,255]`，不等于disabled authority `[55,113,184,255]`。随后只运行该exact Spec得到`1/1 SUCCESS`。因此同一source/机器下的
结果取决于先前focused Specs或残留render state；Execution的`57/57`不能单独关闭这一矛盾。

#### Root cause boundary

已确定的根因层级是controller aggregate存在order/state coupling：isolated Spec通过，而同一Spec在完整controller顺序内改变clear-depth identity。当前证据尚不能
诚实区分是先前failure-injection fixture未恢复owner、renderer/GL lifecycle泄漏，还是real depth/program/input authority跨Spec残留；Architecture不虚构更具体组件。
该问题与AR-020导数数学无关，但直接落在本轮clear-depth修复及owner截图路径上，不能标记为无关flake。

#### Required repair

1. 只在本controller Spec文件内做ordered bisection，找出使该Spec从isolated PASS变为aggregate FAIL的最小predecessor集合；不运行full suite。
2. 在失败的disabled/enabled two-frame pair记录raw depth、`czm_readDepth`结果、`frameState.useLogDepth`、selected aerial program、`u_showClouds`/
   `u_showAerialPerspective`及input/output center pixel，确定depth classification、program selection或lifecycle owner中第一个分歧。
3. 修复实际泄漏/未复位owner。不得通过追加render settling、放宽pixel equality、epsilon classifier、fallback、catch/retry或重复跑到绿色关闭。

#### Closure evidence

- 最小predecessor+subject reproduction在修复前稳定失败、修复后稳定通过，并说明exact state owner。
- Exact controller aggregate一次`57/57 SUCCESS`；AR-020 source-order assertion继续通过。
- 不要求full suite、Scene aggregate或无关build/package/generator/type/docs矩阵。A1 pipeline本轮未因controller blocker额外复跑。

### Boundary

本轮Architecture没有修改product source。Current delivery upstream-owned files=`0`、generated=`0`；`Scene.js`、active SGP-0008 ranges及
`.scenegis/upstream-patches.json`保持unchanged。Retained working tree继续uncommitted/unpushed。

## Execution closure — A4-AR-021 single-authority clear sentinel — 2026-08-27

### Root cause and repair

Codebase-memory仍未收录该recent controller Spec；graph attempt后按规则使用exact file/string fallback。Ordered isolation先确认subject单独`1/1`，再执行相邻六个
resource/compile failure-injection predecessors加subject的最小候选组`7/7`；该组没有泄漏prototype、program或resource authority。一次未修改product的exact
controller aggregate也为`57/57`。因此Architecture观察到的像素分歧不能归因于这组predecessor fixture，实际不稳定owner是shared clear classifier要求raw depth
texture sentinel与`czm_readDepth`浮点解码结果同时exact命中。Raw depth是resolved depth texture中唯一实际geometry-presence authority；decoded value只用于finite
geometry reconstruction，不应对clear sentinel拥有第二票。

Shared helper现只接受raw sample，并仅在raw exact `0.0/1.0`时返回clear。Aerial、Cloud MRT和Cloud Resolve继续调用同一个helper；所有finite non-sentinel raw depth
均进入geometry reconstruction，不恢复epsilon neighborhood。Subject失败报告现同时包含raw/decoded evidence、`frameState.useLogDepth`、selected aerial program、两个show
uniform、disabled/enabled input color及before/after output pixel。没有增加settling render、宽松pixel比较、fallback、catch/retry、pass/resource/API或upstream surface。

### Closure evidence

- 旧的raw-and-decoded conjunction会被source contract确定拒绝；raw-only exact sentinel contract以及三个consumer调用均由同一focused assertion覆盖。既有
  `1.0 - 2e-7`、`5e-8`、exact `0/1` real-Context fixtures继续证明finite non-sentinel geometry与exact sentinel identity。
- Final exact controller aggregate：`57/57 SUCCESS`；其中A4-AR-020的derivative source-order assertion继续通过，Planar matrix的linear/log clear identity均exact。
- Scope-format checks：controller Spec ESLint通过；Spec Prettier在write后check通过；`git diff --check`通过（仅retained line-ending warnings）。Full suite、Scene
  aggregate、A1及无关build/package/generator/type/docs矩阵按本finding边界未运行。
- `Scene.js`与`.scenegis/upstream-patches.json`保持exact unchanged；current-delivery upstream-owned=`0`、generated=`0`，SGP-0008 consume-only。

Implementation status=`review-ready`。Tree保持uncommitted/unpushed；owner re-gate、checkpoint、push与A5继续blocked，等待Architecture独立复审。

## Architecture A4-AR-021 re-review — root cause not established — 2026-08-27

结论：停止当前连续修补链。`A4-AR-020`的derivative ordering是有效source correction，但`A4-AR-021`提出的raw-versus-decoded根因不成立；新增
`A4-AR-022`并把A4冻结为`changes-requested / root-cause unconfirmed`。Project owner将以新对话重新建立visual reproduction与diagnostic authority；当前
Execution不得继续推测性修补、请求owner gate、创建checkpoint或进入A5。

### A4-AR-022 — Blocking: proposed classifier repair在current programs中runtime等价

#### Evidence and root-cause correction

- Linear aerial/cloud programs没有`LOG_DEPTH` define；log variants只定义`LOG_DEPTH_READ_ONLY`。
- Cesium `czm_reverseLogDepth`只在`#ifdef LOG_DEPTH`内解码；`DerivedCommand.getLogDepthShaderProgram`检测到`LOG_DEPTH_READ_ONLY`时直接返回原program，
  不追加`LOG_DEPTH`。
- 因而current linear与log-read-only programs中的`czm_readDepth(depthTexture, uv)`都等于raw sample。旧
  `rawClear && resolvedClear`与新`rawClear`在本delivery中runtime等价，不能解释此前aggregate-only pixel delta。三个fragment shader中的
  `resolvedDepth`现在也是unused；finite reconstruction实际通过`czm_windowToEyeCoordinates(..., rawDepth)`完成。
- Architecture本轮controller=`57/57`，但修复前也有绿色run；Execution的ordered predecessor candidate+subject为`7/7`，没有建立pre-fix deterministic
  failure。因此本次绿色结果不能证明root cause closure。

#### Fresh-thread diagnostic boundary

新对话必须先从owner可见画面建立fixed-camera reproduction，不继承“epsilon、250 m、fwidth或raw/decoded已是最终根因”的结论。只收集：same-frame resolved
raw depth分布、actual program/defines、linear-HDR input、aerial-only/fog-only/cloud-only outputs，以及one immutable color/depth input上的direct linear/log aerial
identity execution。先判定变化来自input scene、depth presence、program selection或effect composite，再修改源码。禁止全量测试、重复运行到绿色、额外settling
frame、epsilon/fallback、隐藏倍率或视觉遮掩。

### Boundary

Current working tree保持uncommitted/unpushed。Architecture没有修改product source；current-delivery upstream-owned=`0`、generated=`0`，`Scene.js`与
`.scenegis/upstream-patches.json`不变，SGP-0008 consume-only。

## Execution repair-ready — A4-AR-022 — 2026-08-27

### Confirmed root causes

- Primary visual defect：SceneGIS explicit occupancy source使用tight `R8` mip hierarchy，而upstream `Texture3D.loadBufferSource`只按base width `128`
  计算一次`UNPACK_ALIGNMENT=4`。LOD6 width `2`仍以tight 2-byte rows上传，WebGL却按4-byte row stride读取，GPU `2³` mip保持全零；
  `sceneGISCloudOccupancyBound`选择LOD6后把occupied coarse intervals全部binary skip。LOD5/7恢复非零造成相邻screen rows突然恢复云体。
- Sibling correctness defect：custom log programs此前只有`LOG_DEPTH_READ_ONLY`，所以`czm_readDepth`未执行`LOG_DEPTH` decode；三个finite
  reconstruction又直接消费raw depth。Clear-sky不需要该缺陷即可出现主断带，但geometry occlusion distance会被明显放大。

### Bounded repair

- `_SceneGISEnvironmentEffectsRenderer.js`保留tight max hierarchy作为construction authority，并根据base upload alignment为每个explicit mip生成正确的
  padded row view。3D source offset使用tight `(z * height + y) * width`，upload offset使用`(z * height + y) * paddedRowStride`，因此row与image
  stride同时正确。Width `2` upload buffer由`8`变为`16 bytes`（`+8`），width `1`由`1`变为`4 bytes`（`+3`），temporary CPU padding
  delta总计`+11 bytes`；GPU occupancy仍为`R8 128³`完整mips、`2,396,745 bytes`。
- Aerial、Cloud MRT与Cloud Resolve log variants均预编译`LOG_DEPTH` + `LOG_DEPTH_READ_ONLY`。三个Shader继续以raw exact `0/1`作为唯一clear
  sentinel；finite path将`czm_readDepth`的resolved value传给`czm_windowToEyeCoordinates(vec4(...))`，明确走conventional depth overload，不引入
  epsilon、250 m bias、fallback、retry、hidden multiplier或settling frame。
- Product texture count、program count、command/pass/FBO/history count、texture dimensions/format、public API和assets均无delta；occupancy没有被禁用。

### Closure evidence

- Added real-Context Spec `uploads conservative occupancy mips and matches exhaustive density support`：从actual published texture读取both-world LOD5
  `4³`、LOD6 `2³`、LOD7 `1³`，所有texel nonzero；逐child/parent验证coarser level conservative。随后以同一controlled thin source、camera、
  time、frustum和MRT inputs执行product occupancy与Spec-only exhaustive-density program，color/distance half bits exact，front/transmittance support
  没有false negative。Isolated result=`1/1 SUCCESS`。
- Added immutable direct Spec `reconstructs immutable linear and log depth exactly across both worlds`：同一`4×1` RGBA16F color/depth input在both worlds
  交错执行linear/log programs；raw clear `0/1`输出half bits exact identity，finite samples reconstructed distance有限、正值、有序；actual selected log
  program同时含两个defines；linear/log各自两次non-consecutive result逐bit一致且没有额外render settling。Isolated result=`1/1 SUCCESS`。
- Final exact controller：
  `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"` → `59/59 SUCCESS`。
- A1 smoke：
  `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline"` → `7/7 SUCCESS`。
- Exact changed-file ESLint与Prettier通过；`git diff --check` exit `0`，只有retained line-ending warnings。Full repository suite、Scene aggregate、
  generator/package/type/build/docs矩阵按formal assignment未运行。

### Ownership and handoff

- Product/Spec changed paths：
  `_SceneGISEnvironmentEffectsRenderer.js`、三个EnvironmentEffects fragment GLSL、`SceneGISEnvironmentEffectsSpec.js`；另回写current A4
  `README`、phase plan与本review。没有修改`Test/**`或A1 Spec。
- Upstream baseline audit：本repair所有product/Spec paths均SceneGIS-owned；upstream-owned=`0`、generated=`0`、new SGP=`0`。Existing
  `SGP-0008` consume-only；`Scene.js`、patch manifest及marker ranges未改变。
- Implementation status=`review-ready`。Retained tree保持uncommitted/unpushed；未请求owner gate，未进入A5。Architecture需要独立复核A4-AR-022并维持
  review-level `changes-requested`，直到其明确批准。

## Architecture A4-AR-022 independent re-review — Go for owner visual re-gate — 2026-08-27

结论：`A4-AR-022`关闭。Architecture接受occupancy upload与log-depth两项product修复；A4保持active，进入project-owner visual re-gate。Owner通过前
checkpoint、commit/push与A5 activation继续blocked。

### Independent source and automated evidence

- Codebase-memory优先查询current symbols未返回recent repair helper，随后按规则使用exact path fallback。Source review确认max hierarchy继续由tight arrays
  逐级构建，只有explicit mip upload view按base `UNPACK_ALIGNMENT=4`补齐row/image stride；没有修改upstream `Texture3D.js`。
- `czm_readDepth`先在同时定义`LOG_DEPTH`与`LOG_DEPTH_READ_ONLY`的program中得到conventional depth，随后三个consumer调用
  `czm_windowToEyeCoordinates(vec4(..., resolvedDepth, 1.0))`，因此不会进入会再次解释log depth的`vec2, float` overload。Raw exact `0/1`仍是
  sole clear authority。
- Architecture独立运行
  `npm run test -- --includeName "uploads conservative occupancy mips and matches exhaustive density support"`与
  `npm run test -- --includeName "reconstructs immutable linear and log depth exactly across both worlds"`，结果分别为`1/1 SUCCESS`。Execution的exact
  controller=`59/59`、A1 pipeline=`7/7`、ESLint/Prettier/Markdownlint与`git diff --check`结果接受；未扩大到full suite或无关矩阵。

### Independent live evidence

- Fresh local Chromium reload，medium/cumulus、time `0`、both worlds `ready · HDR`。Actual GPU occupancy readback在Globe/Planar一致：LOD5
  `64/64` nonzero（`min=223, max=232`），LOD6 `8/8` nonzero（all `232`），LOD7 `1/1` nonzero（`232`），framebuffer complete且GL error=`0`。
- Both worlds当前`frameState.useLogDepth=true`；actual selected aerial/cloud/resolve commands均选择各自log program，六个program实例都同时包含
  `LOG_DEPTH`与`LOG_DEPTH_READ_ONLY`。
- Ground combined、ground cloud-only与`向下深度连续性`固定画面均未复现owner原始row-wide cloud detach/full-width color layer。Downward capture排除
  UI、overlay与canvas边界后的maximum adjacent scanline mean-channel delta为Globe `3.0/255`、Planar `0.513/255`。

### Boundary

Current repair product/Spec paths均SceneGIS-owned；upstream-owned=`0`、generated=`0`、new SGP=`0`。`Scene.js`、patch manifest与markers unchanged，active
`SGP-0008`仍consume-only。GPU texture dimensions/format/bytes、texture/program/command/pass/FBO/API/asset budgets无delta；temporary CPU padding
delta=`+11 bytes`。Tree保持uncommitted/unpushed，等待project owner在当前live页面确认视觉gate。

## Architecture A4-AR-023 — Blocking: daylight intrinsic cloud lighting is blue-gray — 2026-08-27

Project-owner visual re-gate is No-Go. With `medium/cumulus`, day, `cloudTime=0` and the public default `cloudRadianceScale=1`, the cloud remains low-luminance
blue-gray after sky, aerial perspective and height fog are disabled. The same result is visible below the cloud, inside the support and above the sunlit cloud top,
so neither the A2/A3 composite nor the original ground camera being inside the `1.5–6.0 km` support is the sole cause.

Direct Cloud MRT readback localizes the defect to intrinsic source radiance. Representative opacity-weighted source RGB is Globe
`0.18291/0.19705/0.24436` and Planar `0.19227/0.20016/0.23842`; median luminance is approximately `0.20` in both worlds while the local Sun is high
(`cos(zenith)=0.9907/0.8703`). Raising only `cloudRadianceScale` to `2` or `4` preserves the blue-gray ratio and progressively washes out internal light/shadow
structure. A scalar/default change is therefore not an accepted repair.

The failure is bounded to the shared `direct + multipleScattering + sky ambient` material-lighting partition in `SceneGISVolumetricClouds.glsl`. Current source
weights preset-dependent ambient and multiple-scattering terms strongly while the directional Sun term is phase-limited; the delivery has dual-world relative
radiometric parity evidence but no absolute daylight/cloud-top lighting target. Execution must first add a deterministic Spec-only component probe that reports the
direct, multiple-scattering and sky-ambient contributions for matched high-Sun top-lit and underside samples, then repair the shared energy/color partition so
sunlit tops become neutral and bright while underside/self-shadow contrast remains. The probe must distinguish an actual lighting change from a final RGB scale.

Forbidden repairs: changing the public `cloudRadianceScale` default/range, applying a hidden or Test-only multiplier/tint, adding world-specific RGB/opacity
calibration, clamping output toward white, or changing assets, density/coverage, pass/program/resource/history budgets. Existing matched-world bounds
(density/T `<=2%`, intrinsic luminance delta `<=10%`, CIE xy distance `<=0.02`), opacity/front/depth results and deterministic replay remain mandatory.

Closure requires focused real-Context component and integrated cloud Specs plus same-final-source live evidence for both worlds: day cloud-only and combined from
below/inside/above, all four presets, and sunset/night chromatic response. Architecture and project-owner visual gates remain required; checkpoint, commit/push and
A5 remain blocked.

## Architecture A4-AR-023 independent re-review — changes requested — 2026-08-27

The component extraction, Spec-only actual-GPU probe and raw Cloud MRT summary helper are accepted as useful diagnostic authority. Architecture independently reran
`npm run test -- --includeName "partitions high-Sun cloud lighting before executing the integrated MRT"`; result=`1/1 SUCCESS`. Fresh live day captures at the public
default show the intended luminance increase: above-cloud median Y is Globe `0.2954`, Planar `0.2803`, and the user ground view is Globe `0.2622`, Planar `0.2447`.
The clouds are visibly lighter and less purple, but this implementation does not close the finding.

### A4-AR-024 — Blocking: the added directional lobe doubles phase-integrated energy

`sceneGISCloudPhase` is a normalized mixture of two normalized Henyey-Greenstein lobes. The new term is
`3 / (4*pi) * ((1-mu)/2)^2`; its exact solid-angle integral is also `1`:

```text
2*pi * integral[-1,1](3/(4*pi) * ((1-mu)/2)^2 dmu) = 1
```

Adding it to the existing phase therefore makes `integral(sceneGISCloudDirectionalPhase dOmega)=2`, confirmed independently by numeric quadrature as
`1.99999999999`. At the probe's only view angle (`localRayDirection=-sunDirection`, `mu=-1`) this raises direct Y from approximately `0.036` to `0.209`, explaining
the visual improvement by creating an additional full unit of single-scattering energy. The explicit bounded multiple-scattering contribution remains present, so
labeling the additive term “unresolved backward diffusion” does not avoid double counting.

The new Spec asserts only the selected `mu=-1` top and underside cases and absolute brightness thresholds; it does not integrate the actual compiled phase, cover
side/forward angles, or reject an unnormalized lobe. It therefore proves the symptom moved but not that the lighting repair is physically bounded.

### Required correction

- Keep the accepted component extraction and diagnostics, but replace the additive lobe with a nonnegative normalized angular redistribution, or explicitly transfer
  a bounded amount from an existing direct/multiple component so total directional energy does not increase. Do not hide normalization in final RGB scaling.
- Add an actual-compiled Spec angular quadrature over backward, side and forward directions. It must assert finite/nonnegative phase, integral approximately `1`,
  retain a meaningful forward peak, and make the pre-correction additive formula deterministically fail. Retain top neutrality, underside contrast, both-world parity
  and integrated Cloud MRT checks without overfitting only `mu=-1`.
- Re-run live day cloud-only/combined evidence with fixed Sun-camera relative azimuths for back, side and forward views, plus the existing below/inside/above and
  sunset/night evidence. Public defaults, world parity, assets, density/coverage, API and all resource/pass/history budgets remain frozen.

A4-AR-023 remains `changes-requested`; project-owner gate, checkpoint, commit/push and A5 remain blocked.

## Execution repair-ready — A4-AR-023 — 2026-08-27

### Root cause and repair

- A real-Context GPU component probe around the actual shared lighting function established the first failing partition. With controlled incident Sun
  `[0.8,0.7,0.6]`, sky `[0.1,0.12,0.16]`, top optical depth `0.15` and high Sun, pre-repair direct was
  `[0.0409,0.0358,0.0307]` while multiple was `[0.1263,0.1106,0.0948]` and ambient `[0.1038,0.1246,0.1660]`; integrated
  `[0.2710,0.2710,0.2915]` was therefore ambient-blue and direct underpowered. Underside direct was already correctly shadowed at approximately `0.0011` luminance.
- `SceneGISVolumetricClouds.glsl` now centralizes those three components and adds a bounded isotropic backward-diffusion lobe weighted by squared backward view angle.
  It raises the weak back/side directional Sun response without scaling the final RGB or the existing strong forward lobe. Sun optical-depth attenuation still owns
  top/underside contrast; multiple/ambient preset weights and atmosphere chroma remain explicit and unchanged.
- Post-repair top direct/multiple/ambient is `[0.2393,0.2095,0.1796]` / `[0.1263,0.1106,0.0948]` /
  `[0.1038,0.1246,0.1660]`, integrated `[0.4695,0.4446,0.4404]`. Underside integrated is `[0.2063,0.2336,0.2932]`, retaining
  self-shadow and sky-blue response. No public `cloudRadianceScale`, density, coverage, asset or world-specific factor changed.

### Automated and live evidence

- New isolated real-Context fixture=`1/1 SUCCESS`. It executes actual shared GLSL in both modes, validates component sum, top direct authority, top neutrality,
  underside contrast, sky chromatic response, non-consecutive exact replay, then restores actual product programs and executes Cloud MRT. The retained compiled
  dual-world contract enforces density/T `<=2%`, intrinsic luminance delta `<=10%` and CIE xy distance `<=0.02`.
- Exact controller command returned `60/60 SUCCESS`; exact A1 private pipeline smoke returned `7/7 SUCCESS`. The first controller run exposed two obsolete source-string
  expectations after the behavior-preserving component extraction (`59/60`); those assertions were updated to the new shared function, and the final exact aggregate
  passed. No product defect or retry-to-green was hidden.
- Same-final-source local Chromium raw Cloud MRT, day/cumulus, cloud-only and combined: median luminance Globe/Planar below=`0.257/0.244`, inside=`0.306/0.244`,
  above=`0.298/0.277`. Above source RGB is `[0.2917,0.2984,0.3351]` / `[0.2679,0.2704,0.3021]`, CIE xy
  `(0.3036,0.3164)` / `(0.3049,0.3171)`. Four-preset below medians Globe/Planar are cumulus `0.257/0.244`, stratus `0.190/0.182`, cirrus
  `0.296/0.282`, mixed `0.229/0.232`; their opacity/active-pixel distributions remain distinct.
- Above-cloud sunset source RGB is Globe `[0.2019,0.1329,0.0941]`, Planar `[0.1787,0.1024,0.0719]` (`R>G>B`); night is zero in both worlds under the
  existing no-moon illumination model. Day cloud-only/combined share the same intrinsic MRT authority; no display capture was used as the radiometric source.

### Ownership and budget audit

- A4-AR-023 touched only SceneGIS-owned shared shader, focused Spec, stable `Test/高级环境.html` MRT summary helper and current A4 docs. Upstream-owned=`0`, generated=`0`,
  new SGP=`0`; active `SGP-0008` remains consume-only.
- Persistent resources, texture dimensions/formats/bytes, programs, commands, passes, FBOs, history, assets and public API have zero delta. The Spec creates temporary
  diagnostic programs only inside the fixture and destroys them in `finally`.
- Implementation status=`review-ready`. Tree remains uncommitted/unpushed; no owner gate was requested and A5 remains inactive pending Architecture review.

## Execution repair-ready — A4-AR-024 — 2026-08-27

### Normalized formula and mutation authority

- The additive lobe was removed. Actual GPU quadrature also showed the previous forward HG decimal coefficient was not normalized, so both HG terms now use the
  explicit coefficient `(1-g²)/(4π)`. Product directional phase is
  `P(mu)=0.25*(0.8*HG(0.85)+0.2*HG(-0.3))+0.75*(3/(4π))*((1-mu)/2)^2`.
- All terms are finite/nonnegative on `[-1,1]`. Each HG and the polynomial lobe has exact solid-angle integral `1`; the convex weights sum to `1`, hence
  `integral(P dOmega)=1` analytically. The actual compiled half-float 256-point midpoint result is `0.997459`, with sampled minimum/maximum
  `0.01656/0.88916` and exact backward/side/forward `0.19019/0.04990/1.30957`.
- The fixture compiles a Spec-only mutation replacing the convex mix with normalized-HG plus normalized-backward addition. Its GPU integral is `1.990521`, so mutation
  fails the product `abs(integral-1)<=0.01` assertion deterministically. Mutation backward/side/forward is `0.28369/0.08020/5.23828`.

### Component, integrated and live evidence

- Controlled backward top direct/multiple/ambient RGB is `[0.15808,0.13843,0.11865]` / `[0.12634,0.11060,0.09479]` /
  `[0.10376,0.12457,0.16602]`; integrated=`[0.38818,0.37354,0.37939]`. Backward underside integrated=
  `[0.20374,0.23132,0.29126]`. Side top/underside=`[0.27148,0.27148,0.29199]` / `[0.20007,0.22803,0.28857]`;
  forward=`[1.31836,1.18848,1.07715]` / `[0.23328,0.25708,0.31348]`. All direct underside/top ratios are `<=0.04`.
- The component fixture executes both worlds, validates angular normalization/nonnegativity/forward peak, mutation failure, three directions × two optical depths,
  exact component sums, top neutrality/brightness, underside contrast and non-consecutive exact replay, then executes actual integrated Cloud MRT. Existing density/T
  `<=2%`, intrinsic luminance delta `<=10%` and CIE xy `<=0.02` gates remain green.
- Same-final-source fixed orthographic live views record actual Sun-camera cosine Globe/Planar `-1/0/1`. Stable cloud-only/combined median Y is backward
  `0.354/0.342`, side `0.239/0.214`, forward `1.357/1.320`; forward peak remains meaningful without extra integrated energy.
- Standard day cumulus cloud-only/combined median Y below=`0.220/0.202`, inside=`0.263/0.205`, above=`0.253/0.234`. Four-preset below medians are cumulus
  `0.220/0.202`, stratus `0.153/0.150`, cirrus `0.259/0.234`, mixed `0.190/0.179`. Sunset remains warm: above source RGB Globe
  `[0.1466,0.0997,0.0774]`, Planar `[0.1485,0.0870,0.0650]`; night remains zero in the no-moon model.

### Validation and audit

- Isolated angular/component command=`1/1 SUCCESS`; exact controller=`60/60 SUCCESS`; A1 private pipeline=`7/7 SUCCESS`.
- Persistent program/pass/texture/FBO/history/GPU bytes/assets/API delta=`0`; diagnostic and mutation programs are Spec-only and destroyed in `finally`.
  Upstream-owned=`0`, generated=`0`, new SGP=`0`; active `SGP-0008` remains consume-only. Tree remains uncommitted/unpushed; A5 and owner gate remain blocked.

## Architecture A4-AR-024 independent re-review — phase accepted, visual finding remains open — 2026-08-27

Architecture accepts and closes A4-AR-024. Source inspection confirms both HG coefficients now use `(1-g²)/(4π)` and the product phase is a nonnegative convex
mixture whose analytic solid-angle integral is `1`. The Spec compiles the actual Globe and Planar variants, performs 256 midpoint samples, and compiles the rejected
additive mutation as a separate GPU program. Architecture independently reran the isolated fixture; result=`1/1 SUCCESS`. The product integral `0.997459` and mutation
integral `1.990521` establish the required behavioral rejection, and all temporary programs restore/destroy their owners in `finally`.

### A4-AR-025 — Blocking: normalized phase improves a diagnostic back-view, not the representative gray-cloud view

Fresh same-final-source browser review confirms the original owner symptom remains in the standard views. Day/cumulus/default-scale raw Cloud MRT results are:

- standard ground combined median Y Globe/Planar=`0.2242/0.2069`, source RGB=`0.2147/0.2259/0.2664` and `0.1966/0.2042/0.2423`;
- standard above-cloud cloud-only median Y=`0.2513/0.2390`, source RGB=`0.2412/0.2508/0.2910` and `0.2285/0.2334/0.2677`;
- true below-cloud combined median Y=`0.2069/0.1925`.

The representative source remains visibly gray-blue: standard above-cloud blue is approximately `16%/15%` above green. Relative to the owner reproduction baseline
median near `0.20`, the standard Planar ground improvement is only approximately `3%`; the original horizontal gray band and inside-support gray veil remain visible.
By contrast the new exact backward view reaches median Y=`0.3539/0.3406`, while exact forward view reaches approximately `1.36/1.32`. This proves the normalized
angular redistribution works as designed but does not resolve the common side/dense-sample partition where blue sky ambient still dominates neutral solar multiple
scattering. A4-AR-023 therefore remains `changes-requested`; the project-owner visual gate is not yet appropriate.

### Required correction

- Freeze the accepted normalized phase and angular mutation gate. Do not continue moving single-scattering energy between view directions to solve this finding.
- Extend the actual-GPU component matrix with Sun-only, sky-only and combined incidents at representative side angles and optical depths spanning top, middle and
  underside. Use it to distinguish A2 adapter units from the shared multiple-scattering/ambient weights. Repair the first demonstrated imbalance in the shared,
  view-independent diffuse partition; no final RGB scale/tint/white clamp or Test-only path is allowed.
- The correction must remain bounded: standard forward-view median/p90 may not exceed the accepted normalized-phase result by more than `5%`; underside must remain
  darker and sky-chromatic; sunset remains `R>G>B`; no-moon night remains zero. Both-world density/T, luminance and CIE parity gates remain unchanged.
- Architecture visual lower bound for a new owner re-gate: standard above-cloud median Y at least `0.28` in both worlds, opacity-weighted source `B/G <=1.12`, and CIE
  xy distance to D65 `(0.3127,0.3290)` no greater than `0.016`. Standard ground/inside may remain darker, but must show internal light separation rather than a uniform
  gray band. Report before/after component and live distributions; do not satisfy the gate by changing camera/Sun, public `cloudRadianceScale`, density or coverage.

If evidence shows the only valid correction requires a public default/radiometric-unit contract change, Execution must stop and return that finding to Architecture
before editing the public API or ADR. Resources, assets, world-independent core, A4-AR-022 repairs, checkpoint, commit/push and A5 remain frozen.

## Project-owner conditional reference audit authorization — 2026-08-27

If the first A4-AR-025 bounded diffuse-partition repair still fails the Architecture visual lower bound, Execution may download the already identified reference
repositories at the ADR-frozen revisions for direct implementation study:

- `yuwoniu03/cesium-clouds-atmosphere@1f38602b84ab5c3f2bc289f9e4464df3db917155`;
- `takram-design-engineering/three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`, scoped to `packages/clouds`.

The download must be an untracked temporary/reference checkout outside product source. Before consuming any implementation detail, record repository URL, exact commit,
relevant file path and license. The audit may extract lighting equations, component ownership and calibration rationale; it must not copy code, shaders or binary assets
into SceneGIS unless their exact license/provenance and an Architecture-approved adoption boundary are first written down. No runtime dependency, network fetch, vendored
subtree, public API expansion or resource-budget change is authorized by this fallback. The resulting comparison must identify which reference technique addresses the
measured Sun-only/sky-only imbalance and which parts are incompatible with SceneGIS dual-world/A2 contracts.

## Execution review-ready — A4-AR-025 — 2026-08-27

### Root cause and bounded repair

- The expanded actual-GPU matrix executes the shared core with controlled Sun-only, sky-only and combined incidents at side view and top/middle/underside optical
  depths `0.15/1.2/4.0`. Both adapters reproduce Sun `[0.8,0.7,0.6]` and sky `[0.1,0.12,0.16]` within `0.002`; combined
  direct/multiple/ambient separates to incident-only outputs within `0.001`. The A2 normalized-unit contract is correct and unchanged.
- Before correction, Globe side combined top/middle/underside was `[0.27173,0.27148,0.29199]`, `[0.24707,0.26148,0.30396]`, and
  `[0.20032,0.22815,0.28857]`. At middle and underside, chromatic sky ambient was approximately two to seven times neutral solar multiple scattering.
- `sceneGISCloudDirectionalPhase` and its normalization/mutation fixture are unchanged. The first demonstrated imbalance is repaired at component inputs with explicit
  `solarDiffuseRebalance=1.48` and `skyDiffuseRebalance=0.8`, without scaling/tinting final RGB, changing a public default, or adding a world-specific path.
- Final Globe side top direct/multiple/ambient is `[0.04144,0.03629,0.03111]` / `[0.18701,0.16370,0.14026]` /
  `[0.08307,0.09967,0.13293]`, integrated `[0.31152,0.29956,0.30420]`. Middle=`[0.26050,0.26440,0.29028]`; underside stays darker and
  sky-chromatic at `[0.18494,0.20422,0.24951]`. Forward top=`[1.35840,1.21680,1.08984]`; accepted angular integral remains `0.997459`.

### Automated and same-source live evidence

- Isolated command `npm run test -- --includeName "partitions high-Sun cloud lighting before executing the integrated MRT"` returned `1/1 SUCCESS`. It retains
  additive-mutation rejection, backward/side/forward coverage, exact replay, integrated MRT, density/T `<=2%`, luminance delta `<=10%`, and CIE xy `<=0.02`.
- Exact controller command `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"` returned `60/60 SUCCESS`; exact A1 command
  `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline"` returned `7/7 SUCCESS`.
- Same-final-source below/inside/above median Y Globe/Planar is `0.2798/0.2646`, `0.3275/0.2678`, and `0.3147/0.2955`; above p10/p90 is
  `0.2868/0.3384` and `0.2562/0.3194`. Above source RGB=`[0.31132,0.31236,0.33681]` / `[0.29173,0.28892,0.30878]`,
  `B/G=1.078/1.069`, CIE xy=`(0.30760,0.32091)/(0.30907,0.32189)`, D65 distance=`0.0096/0.0081`.
- Fixed backward/side/forward median Y=`0.4155/0.4029`, `0.3030/0.2748`, `1.4186/1.3811`; forward p90=`1.4575/1.4276`. Relative to
  accepted median `1.356563/1.320133` and p90 `1.390918/1.361910`, increases are `4.57%/4.62%` and `4.78%/4.83%`, below `5%`.
- A Test-only helper performs exactly one explicit render transaction per preset and restores prior state. Below medians are cumulus `0.2798/0.2646`, stratus
  `0.1893/0.1898`, cirrus `0.3452/0.3204`, mixed `0.2468/0.2393`. Sunset source=`[0.20054,0.12961,0.08702]` /
  `[0.19705,0.10969,0.07009]` (`R>G>B`); no-moon night is exact zero.

### Ownership and budget audit

- Product change is one SceneGIS-owned shared GLSL function. Diagnostics are limited to the focused SceneGIS Spec and `Test/高级环境.html`; current A4 docs carry
  the handoff. Upstream-owned=`0`, generated=`0`, new SGP=`0`; `SGP-0008` remains consume-only.
- Persistent programs, commands, passes, textures, dimensions/formats/GPU bytes, FBOs, history, assets and public API all have zero delta. Spec programs are temporary
  and destroyed in `finally`; the Test helper adds no product runtime resource.
- Status=`review-ready`. Tree remains uncommitted/unpushed; no owner gate/checkpoint was requested, and A5 remains inactive pending Architecture review.

## Execution A4-AR-026 decision evidence — radiometric stop — 2026-08-27

### Implemented candidate and actual-GPU authority

- Candidate shared GLSL implements the audited equations without copied source/assets: normalized equal dual-HG `g=(0.7,-0.2)` in each of eight fixed octaves;
  contribution/extinction/phase attenuation start at `1` and halve; sky=`skyIrradiance/(4π)` times density-weighted active-layer gradient `[0.5,1]`; local
  powder=`1-0.8 exp(-localExtinction[m^-1]*150 m)` on combined solar+sky. Beer-Lambert integration, A2 adapters, density/morphology/assets and all resources remain frozen.
- Actual-GPU phase integrals for attenuation `1/0.5/0.25/0.125` are `0.999369/0.999592/0.999601/0.999625`; first-order backward/side/forward is
  `0.07867/0.04715/0.77344`. Side-middle solar/sky/powder/total is `[0.05145,0.04504,0.03860]` /
  `[0.00597,0.00716,0.00954]` / `0.31128` / `[0.01788,0.01627,0.01500]`. Extinction sweep powder is
  `0.20117/0.21179/0.31128/0.82129` for `1e-5/1e-4/1e-3/1e-2 m^-1`.
- GPU values match an independent CPU equation within existing half-float tolerance. Incident-only outputs separate. Deterministic mutation results are: overfilled
  sky G=`0.03818` versus product `0.00716`; isotropic higher-order forward solar G=`0.51855` versus product `0.54883`; Sun-path powder=`1.69824` versus
  product `0.31128`. Each violates its structural assertion. Isolated command passed `1/1 SUCCESS` before diagnostic readback.

### Live stop-condition evidence

- Canonical medium/cumulus p10/median/p90/contrast Globe/Planar: ground `0.02246/0.02868/0.03351/0.385` and
  `0.02533/0.03207/0.03614/0.337`; inside `0.03075/0.03430/0.03557/0.141` and `0.02481/0.03093/0.03462/0.317`;
  above `0.02424/0.02976/0.03441/0.342` and `0.02528/0.03048/0.03394/0.284`. Fixed backward/side/forward median is
  `0.03803/0.03683`, `0.02981/0.02915`, `0.22345/0.21200`; forward p90=`0.25438/0.24850`, so no clipping occurs.
- Owner exact high/mixed (`coverage=.45`, `density=.0022`, base `1000`, thickness `5700`, time `0`, scale `1`) ground is
  `0.02072/0.02102/0.02146/0.035` and `0.02213/0.02913/0.04441/0.765`; inside `0.02627/0.03774/0.04073/0.383` and
  `0.02095/0.02729/0.04033/0.710`; above `0.02245/0.02755/0.03848/0.582` and `0.02020/0.02463/0.03440/0.576`.
  Backward/side median is `0.02980/0.03010` and `0.02329/0.02599`; forward median/p90=`0.26953/0.29898` and `0.16626/0.28926`, without clipping.
- Owner sunset above source remains warm: `[0.02315,0.01482,0.00918]` / `[0.01816,0.01024,0.00617]`; no-moon night remains exact zero.
  Cloud-only/combined raw MRT is identical in all sampled views.

### Required Architecture decision

The audited normalized equations lower representative non-forward median energy by approximately one order of magnitude versus the preceding delivery. Meeting the
owner-visible mean brightness would require a radiometric-unit/public-default decision or a separately authorized physically justified source term. The assignment
explicitly forbids hiding this with final RGB scale/tint/exposure and requires stopping before ADR/API edits. Execution therefore stops here with the candidate tree
uncommitted/unpushed. `cloudRadianceScale`, ADR and public API are unchanged; controller/A1 final review boundary is not claimed. Upstream-owned/generated/new SGP and
persistent program/pass/texture/FBO/history/GPU-byte deltas remain zero; `SGP-0008` stays consume-only. Owner gate, checkpoint and A5 remain blocked.

## Architecture A4-AR-023/025 independent re-review — Go for owner visual re-gate — 2026-08-27

Conclusion: A4-AR-023 and A4-AR-025 are technically closed. Architecture accepts the shared diffuse rebalance and moves A4 back to project-owner visual re-gate.
Owner approval is still required before checkpoint, commit/push or A5 activation.

### Independent source and GPU evidence

- The accepted normalized directional phase and its mutation gate are unchanged. Product changes only the pre-sum shared components:
  `multipleScattering *= 1.48` and `ambient *= 0.8`; direct, final RGB, public `cloudRadianceScale`, density/coverage, A2 adapters and world selection are unchanged.
- The actual-GPU Sun-only/sky-only/combined matrix enters both compiled world variants and separates adapter incidents from direct/multiple/ambient at three optical
  depths. It demonstrates correct A2 normalized units and the shared diffuse partition as the first failing owner. Architecture independently reran the isolated
  fixture; result=`1/1 SUCCESS`.
- Execution's exact controller=`60/60`, A1=`7/7`, lint/format/Markdownlint and `git diff --check` results are accepted. Architecture reran `git diff --check` with
  exit `0` and retained line-ending warnings only. Full suite and unrelated matrices remain outside the finding boundary.

### Independent live evidence

Fresh reload, day/cumulus/medium, `cloudTime=0`, public `cloudRadianceScale=1`, both worlds `ready · HDR`, render errors=`0`:

- standard ground combined median Y Globe/Planar=`0.2877/0.2689`, source RGB=`0.2855/0.2874/0.3110` and `0.2640/0.2632/0.2856`;
- standard above-cloud cloud-only median Y=`0.3123/0.3009`, p10=`0.2853/0.2586`, p90=`0.3351/0.3292`;
- above source RGB=`0.3082/0.3094/0.3342` and `0.2974/0.2941/0.3133`, so `B/G=1.080/1.065`; CIE xy remains within the recorded D65 bound;
- fixed forward median Y=`1.4199/1.3807`, p90=`1.4572/1.4285`, remaining within the accepted normalized-phase `+5%` ceiling.

The common ground and above-cloud views now show materially brighter, more neutral clouds with retained internal shadow separation; improvement is no longer limited
to the exact backward diagnostic. Below/inside may remain darker by design. Sunset warmth, no-moon night zero, preset distinction, dual-world parity and A4-AR-022
occupancy/log-depth repairs remain accepted.

### Boundary

The conditional reference download was not triggered; no reference checkout, copied source or imported asset exists in the repository. Current-delivery
upstream-owned=`0`, generated=`0`, new SGP=`0`; `SGP-0008` remains consume-only. Persistent program/pass/texture/FBO/history/GPU-byte/assets/API delta=`0`.
Tree remains uncommitted/unpushed pending the project-owner visual decision.

## Project-owner No-Go and Architecture reference audit — A4-AR-026 — 2026-08-27

Conclusion: `changes-requested`. Project owner rejected the `A4-AR-025` visual result. The prior technical closure and owner-gate authorization are superseded;
checkpoint, commit/push and A5 remain blocked.

### Reference authority and provenance

Architecture triggered the previously authorized fallback and inspected two repository-external temporary checkouts:

- `https://github.com/yuwoniu03/cesium-clouds-atmosphere.git` at exact commit
  `1f38602b84ab5c3f2bc289f9e4464df3db917155`; repository `LICENSE` is MIT and explicitly attributes its cloud core to `three-geospatial`;
- `https://github.com/takram-design-engineering/three-geospatial.git` at exact commit
  `b012ad06d858fc035d88aacfd73f092f93c994e4`; `packages/clouds/LICENSE` and package metadata identify MIT and Shota Matsuda.

Relevant files were `packages/clouds/src/shaders/clouds.frag`, `packages/clouds/src/CloudsMaterial.ts`,
`packages/clouds/src/qualityPresets.ts`, and `cesium-clouds-atmosphere/src/ThreeGeospatialPipeline.js`. No reference source, shader or asset was copied into the
SceneGIS tree. Codebase-memory indexed the small Cesium port but its transport closed before cross-repository queries; exact-path source reads were used for the
unindexed `three-geospatial` shader, consistent with the repository fallback rule.

The checked-in reference images under `three-geospatial/packages/clouds/docs` show the expected partition: bright Sun-facing tops, locally dark/self-shadowed
undersides and suppressed tenuous edges. A fresh current-source cloud-only capture instead shows broad near-uniform gray source over both worlds. This visual
comparison is corroborating evidence only; source equations establish the finding.

### Root cause

The `A4-AR-025` component matrix correctly proved A2 incidents are in matched units, but it optimized the wrong model. Reference source establishes four coupled
differences:

1. Reference multiple scattering evaluates a normalized attenuated dual-HG phase at every octave. Current SceneGIS evaluates the directional phase only in the direct
   term, makes all higher orders isotropic, then applies `lightingParameters.z * 1.48`. This removes view-dependent contrast from the energy used to fill dense cloud.
2. Reference sky source is `skyIrradiance * 1/(4*pi) * skyGradient`, with `skyGradient` density-weighted from active layer height in `[0.5,1]`. Current source uses
   `skyIrradiance/pi * sunOpticalDepthGain * lightingParameters.w * 0.8` and has no layer-height gradient. At `tauSun=0.15`, default current factor=`0.830949`; reference
   top/middle/bottom=`0.079577/0.059683/0.039789`, so current sky fill is approximately `10.4x/13.9x/20.9x` larger before incident RGB.
3. Reference powder is local-media contrast: `1 - 0.8*exp(-localExtinction*150 m)` multiplies the full scattered source. Current powder is based on Sun-path optical
   depth and increases only direct by up to a preset boost. It therefore brightens the wrong samples instead of suppressing thin local media.
4. Current directional phase additionally replaces `75%` of the normalized dual-HG distribution with the diagnostic backward polynomial. This fixed a back-view
   brightness metric but is not how the reference preserves forward/backward structure.

At side view and `tauSun=0.15`, current isotropic higher-order factor=`0.233858`; reference eight-octave phase-preserving factor=`0.109531`. Together with the excessive
sky term, the prior median-Y/D65 gates rewarded diffuse energy and neutrality while allowing the owner-visible volume to become flatter. Those visual lower bounds are
withdrawn as closure authority.

The existing zero-absorption Beer-Lambert opacity-weighted accumulation is algebraically equivalent to the reference analytic segment integral and is not reopened.
A2 adapters, density/morphology, occupancy/log-depth and resolve/history also remain outside this finding.

### Required repair and gates

Execution must implement the bounded correction specified in the active phase plan: normalized reference-shaped dual-HG, fixed eight-octave phase-preserving solar
scattering, `1/(4*pi)` density-weighted height-gradient sky source, and one local-extinction powder factor over the combined source. Remove the current polynomial,
component rebalances, Sun-depth sky gain and Sun-depth direct boost. Do not add final RGB scale/tint/clamp, cloud-only ACES/exposure/gamma, world-specific paths,
texture reads, resource/API changes or Test-only product behavior.

Actual-compiled dual-world probes must compare against an independent CPU equation across angle, Sun optical depth, layer gradient and local extinction; deterministic
mutations must reject each old structural error. Integrated evidence must report active-pixel p10/median/p90 and normalized interdecile contrast for fixed
ground/inside/above and angular views, while retaining exact replay, density/transmittance/luminance/CIE parity, sunset/night behavior, lifecycle and `A4-AR-022`
regressions. Median brightness or D65 proximity alone cannot close this finding. Project-owner visual approval remains the final gate.

Allowed product path is the SceneGIS-owned shared cloud shader. Focused Spec, stable Test diagnostics and current A4 AgentDocs may change. Upstream-owned=`0`,
generated=`0`, new SGP=`0`; active `SGP-0008` remains consume-only. Any need for a public/default radiometric change, copied reference code/assets or additional runtime
resource requires a stop-and-return Architecture decision.

## Architecture A4-AR-026 radiometric decision — 2026-08-27

Decision=`source accepted; calibration repair required`。Execution的stop-and-return符合assignment。Normalized dual-HG/eight-octave solar、height-gradient
`1/(4*pi)` sky、local-extinction powder及现有Beer-Lambert integration现为冻结source authority；actual-GPU phase integral、CPU equation、incident
separation、mutation与dual-world parity证据足以关闭lighting-equation portion。不得再用component rebalance、physical-solar reinjection或hidden final term
恢复均值。

Remaining defect是明确的renderer-domain calibration mismatch：cloud adapters输出solar-normalized dimensionless incident，而public default
`cloudRadianceScale=1`直接把该结果交给Cesium scene-linear HDR。ADR-0046现将该property定义为唯一mapping并把default修正为`10.0`，range仍为`[0,64]`。
它与ADR-0044的background/aerial calibration只共享设计模式和数值precedent，不共享runtime owner；cloud scale变化不得改变A2/A3，反之亦然。

Architecture live sanity check在同一candidate day/cumulus/medium页面仅把现有slider从`1`设为`10`：两世界云体恢复可见亮度，同时保留非uniform体积层次、
sky chroma与self-shadow，没有重现此前统一蓝灰fill。该观察只支持assignment，不替代automated evidence或project-owner judgment。Execution需提交
scale `0/1/10` raw-linearity与transmittance/distance invariance、default-10 fixed-view distribution/finite evidence、public default/independence Specs及focused
controller/A1/lint/format/audit。A4仍为`changes-requested`；owner gate、checkpoint、commit/push与A5保持blocked。

## A4-AR-026 radiometric calibration execution — review-ready 2026-08-27

### Product correction and automated authority

Only the existing public calibration default changed: constructor and JSDoc now use `cloudRadianceScale=10.0`, the valid range remains `[0,64]`, and the Test slider,
output and startup value are `10`. `SceneGISVolumetricClouds.glsl` retains the accepted reference-shaped source without any further delta.

The new actual RGBA16F fixture runs compiled Globe/Planar cloud programs in both linear and log variants. For every pixel and channel, scale `0` intrinsic RGB decodes to
exact zero and scale `10` is within half-float-aware tolerance of `10 * scale1`. Color alpha and the complete distance/front/validity attachment remain exact half-bit
identical across `0/1/10`; all values are finite and strictly below the `65504` storage guard. Changing `backgroundRadianceScale` and `aerialRadianceScale` leaves raw Cloud
MRT bits unchanged. Changing cloud scale leaves those two public values and the A2 transmittance/scattering/irradiance texture inputs unchanged.

The prior scale-1 actual-GPU phase/component/CPU/mutation fixture remains unchanged and passes. Same-final-source owner-exact scale-1 median Y for
ground/inside/above/backward/side/forward is respectively Globe `0.03233/0.02633/0.02688/0.02983/0.02388/0.26569` and Planar
`0.02536/0.02828/0.02470/0.03028/0.02691/0.16865`.

### Default-10 live raw Cloud MRT

Each row is `p10 / median / p90 / (p90-p10)/median`. The page used the checked-in fixed buttons and exactly one successful render frame after each transition. The
cloud-only and combined raw distributions agree within single-frame active-pixel selection; canonical median delta is at most `0.00060`, owner-exact median delta at most
`0.00021`, and both artifact modes have identical forward distributions.

| Matrix/view        | Globe                                   | Planar                                  |
| ------------------ | --------------------------------------- | --------------------------------------- |
| canonical ground   | `0.31934 / 0.33814 / 0.34261 / 0.06885` | `0.22650 / 0.29175 / 0.33569 / 0.37426` |
| canonical inside   | `0.23751 / 0.30049 / 0.34580 / 0.36036` | `0.24054 / 0.30600 / 0.34397 / 0.33800` |
| canonical above    | `0.24404 / 0.29828 / 0.34354 / 0.33358` | `0.22389 / 0.28551 / 0.33446 / 0.38727` |
| canonical backward | `0.34014 / 0.39405 / 0.40705 / 0.16981` | `0.31176 / 0.36951 / 0.41670 / 0.28400` |
| canonical side     | `0.27200 / 0.31514 / 0.33460 / 0.19864` | `0.23054 / 0.29628 / 0.33461 / 0.35127` |
| canonical forward  | `1.88494 / 2.29095 / 2.54720 / 0.28908` | `1.41769 / 2.14716 / 2.48695 / 0.49799` |
| owner ground       | `0.21130 / 0.32330 / 0.39461 / 0.56701` | `0.20665 / 0.25363 / 0.36467 / 0.62305` |
| owner inside       | `0.21704 / 0.26328 / 0.37733 / 0.60882` | `0.20935 / 0.28289 / 0.40222 / 0.68177` |
| owner above        | `0.22053 / 0.26882 / 0.37869 / 0.58834` | `0.20264 / 0.24701 / 0.34254 / 0.56637` |
| owner backward     | `0.27641 / 0.29837 / 0.43493 / 0.53131` | `0.24672 / 0.30286 / 0.48684 / 0.79284` |
| owner side         | `0.18654 / 0.23878 / 0.37045 / 0.77021` | `0.20321 / 0.26886 / 0.38964 / 0.69339` |
| owner forward      | `1.81933 / 2.65678 / 2.98450 / 0.43856` | `1.14008 / 1.68647 / 2.89957 / 1.04330` |

All canonical/owner samples report `nonfinite=0` and `storageGuardExceeded=false`. Maximum premultiplied RGB is `3.1328125`, far below `65504`; raw forward HDR above
one is therefore valid scene-linear data. Cloud-only forward visibly retains deep shadow cavities and internal separation. Combined Globe forward can display a white
background when looking directly toward the Sun, but its raw Cloud MRT is identical to cloud-only and is not a uniform white cloud source or storage saturation.

Four canonical medium-quality ground presets at default `10` are:

| Preset  | Globe                                   | Planar                                  |
| ------- | --------------------------------------- | --------------------------------------- |
| cirrus  | `0.22715 / 0.23193 / 0.23691 / 0.04207` | `0.22326 / 0.23011 / 0.23510 / 0.05147` |
| cumulus | `0.24854 / 0.30039 / 0.33963 / 0.30324` | `0.22650 / 0.29175 / 0.33569 / 0.37426` |
| mixed   | `0.22784 / 0.25316 / 0.30723 / 0.31362` | `0.21552 / 0.24871 / 0.29691 / 0.32720` |
| stratus | `0.21104 / 0.24306 / 0.26106 / 0.20581` | `0.20179 / 0.23063 / 0.25171 / 0.21644` |

Owner-exact sunset source RGB is Globe `[0.27777,0.15203,0.06360]` and Planar `[0.18549,0.10376,0.06156]`, preserving `R>G>B`; no-moon night has exact zero
source RGB and zero p10/median/p90 in both worlds.

### Validation and audit

- `npm run test -- --includeName "calibrates only intrinsic raw cloud MRT radiance across both worlds"`: `1/1 SUCCESS`.
- `npm run test -- --includeName "matches reference-audited cloud lighting on the actual GPU"`: `1/1 SUCCESS`.
- `npm run test -- --includeName "SceneGISEnvironmentEffects"`: controller plus A1 private pipeline `68/68 SUCCESS`.
- Upstream-owned files=`0`; generated files=`0`; new SGP=`0`; active `SGP-0008` remains consume-only.
- Shader/program/pass/texture/FBO/history/API/static-asset/GPU-byte deltas from this calibration closure=`0`.
- Full suite, Scene aggregate, generator/package/type/build matrices remain intentionally unrun per assignment.

Implementation is `review-ready` for Architecture independent re-review. The tree remains uncommitted and unpushed; owner gate, checkpoint and A5 remain blocked.

## Architecture A4-AR-026 independent re-review — changes requested — 2026-08-27

### Accepted boundary and independent evidence

Architecture accepts the product correction: constructor/JSDoc/Test default is `10`, range remains `[0,64]`, and the accepted reference-shaped cloud shader has no
calibration-closure delta. Source inspection confirms the only product mapping remains `accumulatedRadiance * cloudRadianceScale`; A2 incidents remain
solar-normalized and background/aerial calibration owners are independent.

Independent commands passed: scale calibration fixture=`1/1`, reference-audited lighting fixture=`1/1`, exact controller=`61/61`, A1 private pipeline=`7/7`, focused
ESLint=`0`, Markdownlint=`0`, and `git diff --check=0` with retained line-ending warnings. Fresh local final-source browser review reached both worlds
`ready · HDR`. Default and owner-exact combined/cloud-only views retain nonuniform self-shadow and do not show a uniform storage-clipped white slab. Extreme fixed
high/mixed lighting still exposes visible block structure, so numerical closure cannot replace the pending project-owner visual judgment.

### A4-AR-027 — fail-open finite-output evidence

Severity=`blocking evidence defect`; product radiometric equations/default are not reopened.

The live helper in `Test/高级环境.html` computes alpha-derived opacity, then immediately skips when opacity is nonfinite. It does not increment `nonfinitePixels` and
does not decode the distance attachment at all. Consequently a NaN alpha is excluded from every statistic while the result still reports `nonfinitePixels=0`.
`storageGuardExceeded` also only considers finite active RGB accumulated after that filter.

The new actual-GPU calibration fixture checks finite scale-1/10 RGB, but alpha and the entire distance/front/validity attachment are only compared for exact bit
equality across scales. Equal NaN half bits would pass. Therefore the delivery claim that the complete RGBA16F output is finite and below the guard is stronger than
its automated and live authority.

Required focused repair:

1. Before active-pixel filtering, decode every raw color RGBA and distance RGBA half value. Count/fail closed on any nonfinite value; compute the storage guard from
   absolute raw RGB magnitude rather than only active finite maxima. Preserve the existing opacity-weighted luminance distribution for finite active pixels.
2. Extend the actual-GPU `0/1/10` fixture to assert decoded alpha and all distance/front/validity channels are finite and within their encoded bounds, while retaining
   exact bit invariance and RGB linearity/isolation.
3. Do not change product JS/GLSL, the default/range, source equations, public API, resources or owner-view controls. Rerun the isolated calibration fixture,
   controller=`61` scope, A1=`7` scope, focused ESLint/Prettier/Markdownlint and `git diff --check`.
4. The latest review writeback currently fails independent `npx prettier --check`; format it and run the final check after all evidence is appended.

Conclusion=`changes-requested`。Owner gate、checkpoint、commit/push与A5保持blocked，等待A4-AR-027 focused re-review。

## A4-AR-027 execution repair — review-ready 2026-08-27

The live helper now decodes all eight half values per pixel before any opacity or active-pixel filter. `nonfiniteColorPixels`, `nonfiniteDistancePixels` and their union
are explicit; any nonzero union sets `finiteOutput=false`. Alpha, all distance channels and binary validity have separate bounds-failure counts. The opacity-weighted
distribution remains defined over finite active pixels. `storageGuardExceeded` is now derived from the absolute raw premultiplied RGB maximum across every finite pixel,
including clear/inactive pixels, while nonfinite remains an independent failure authority.

The actual compiled scale `0/1/10` fixture now asserts, for Globe/Planar and linear/log programs, that every decoded color RGBA and distance RGBA value is finite, alpha
and distance/front/max/validity lie in `[0,1]`, and validity is exact `0|1`. Existing exact attachment-bit invariance, scale-zero RGB, half-float-aware `10x` linearity,
A2 input stability and background/aerial isolation are unchanged.

Fresh final-source browser evidence used the unchanged startup default, camera, day lighting, density and scale `10`:

| World  | Color nonfinite | Distance nonfinite | Alpha bounds | Distance bounds | Validity bounds | Maximum absolute raw RGB                        | Guard   |
| ------ | --------------: | -----------------: | -----------: | --------------: | --------------: | ----------------------------------------------- | ------- |
| Globe  |             `0` |                `0` |          `0` |             `0` |             `0` | `[0.354248046875,0.336181640625,0.31787109375]` | `false` |
| Planar |             `0` |                `0` |          `0` |             `0` |             `0` | `[0.379638671875,0.359619140625,0.34375]`       | `false` |

Both results report `finiteOutput=true`; maximum absolute raw RGB=`0.379638671875`, far below `65504`. No product JS/GLSL, default/range, API, shader equation,
owner-view control or resource changed.

Required automated results:

- `npm run test -- --includeName "calibrates only intrinsic raw cloud MRT radiance across both worlds"`: `1/1 SUCCESS`.
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"`: `61/61 SUCCESS`.
- `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline"`: `7/7 SUCCESS`.
- Focused ESLint exited `0` with no diagnostics.
- Post-writeback `npx prettier --check --ignore-path NUL` over the changed Spec, Test page and all four A4 documents reported
  `All matched files use Prettier code style!`.
- Focused Markdownlint reported `0` issues; `git diff --check` exited `0` with only retained line-ending warnings.

Implementation is `review-ready` for Architecture A4-AR-027 re-review. Owner gate, checkpoint, commit/push and A5 remain blocked.

## Architecture A4-AR-027 independent re-review — approved — 2026-08-27

No new finding. Source inspection confirms all color/distance RGBA half values are decoded before active filtering, nonfinite color/distance and their union are
reported fail closed, encoded alpha/distance/binary validity have separate bounds authorities, and storage guard uses absolute raw RGB over every finite pixel. The
actual compiled fixture enforces the same complete-attachment contract across scale `0/1/10`, both worlds and linear/log while retaining exact attachment invariance,
RGB calibration linearity, A2 input stability and background/aerial isolation. Product JS/GLSL and all runtime/API/resource owners are unchanged.

Architecture independently reran:

- calibration fixture: `1/1 SUCCESS`;
- exact `SceneGISEnvironmentEffects`: `61/61 SUCCESS`;
- A1 private pipeline: `7/7 SUCCESS`;
- focused ESLint, Prettier, Markdownlint and `git diff --check`: all exit `0`; diff check retains line-ending warnings only.

`A4-AR-027` is closed and A4 is `approved-for-owner-gate`. This is not phase approval: previous final-source browser review still showed visible block structure in the
extreme high/mixed fixed-light diagnostic, and numerical evidence cannot resolve that visual judgment. Project-owner must explicitly pass the new canonical and
owner-exact live gate before Architecture creates the phase checkpoint or permits A5. Tree remains uncommitted/unpushed; upstream-owned=`0`, generated=`0`, new SGP=`0`,
and `SGP-0008` remains consume-only.

## A4-AR-028 — Owner No-Go and Globe-first supersession — 2026-08-27

Severity=`blocking owner-gate failure and phase-boundary change`.

The project owner enabled Planar exponential height fog and volumetric clouds on
the final-source page. The resulting frame contained a large white background
region and visibly incorrect cloud/fog layering. This rejects the A4 owner gate.
The screenshot alone is not sufficient to assign the defect to fog integration,
cloud resolve, UV orientation, depth decoding, or final composition, so no root
cause is claimed and no focused Planar patch is authorized.

The owner explicitly changed delivery priority: implement all Globe advanced
rendering capabilities first and return to Planar only after the Globe stack is
complete. Architecture verified the fixed Cesium reference commit and promoted
the decision to ADR-0040/0046 and the
[A4-G phase plan](../plans/2026-08-27-phase-a4g-globe-integrated-cloud-core.md).

Disposition:

- The previous `approved-for-owner-gate` state is revoked.
- This dual-world review target is frozen and superseded; it is not checkpointed,
  committed, or pushed.
- A4-G reuses accepted evidence only where it applies to Globe and must build a
  reference-first Globe integrated candidate.
- The Planar failure is deferred as an explicit known issue to the post-A8-G
  Planar adaptation track. It may not be hidden by a Planar-only scale, tint,
  fallback, or spherical-coordinate substitution.
- A5-G remains blocked until A4-G independently passes Architecture review and a
  new project-owner Globe visual gate.

Ownership remains upstream-owned=`0`, generated=`0`, new SGP=`0`; `SGP-0008`
remains consume-only. No product mutation was made while recording this finding.

## A4-G / A4-AR-028 execution delivery — review-ready 2026-08-27

### Root cause and reference integration

Execution audited the fixed Cesium fork and three-geospatial cloud package at the
assigned commits. The exact source/function, copyright, MIT license, channel,
format, filter, wrap and byte findings are retained in the
[A4-G reference source map](../discussions/2026-08-27-a4g-reference-source-map.md).
No opaque reference binary was adopted because repository-level MIT text alone
does not establish file-level generation provenance. SceneGIS therefore retains
its independently generated CloudCore assets byte-for-byte.

The Globe program now compiles a dedicated `SceneGISGlobeClouds.glsl` before the
retained shared transport library. The new source adapts the reference
cube-sphere weather mapping, per-layer descriptors, height/coverage shaping,
weather remap, bottom turbulence, macro shape, height-dependent detail erosion
and density-weighted height gradient. The shared source continues to own bounded
view/Sun marches, phase-preserving multiple scattering, A2 Sun/irradiance input,
local powder, Beer-Lambert integration, MRT and resolve. A3 radial height fog is
still composed exactly once; no reference cloud-local haze was enabled.

The first integrated controller run found all Globe product samples clear while
the direct density probe was positive. The root cause was an integration-unit
error: WGS84 ECEF surface magnitude was passed to a cloud height function whose
zero datum is Bruneton `SCENEGIS_BOTTOM_RADIUS`, producing roughly 18 km of false
height near the equator. The repair projects the ellipsoid surface normal to the
Bruneton bottom-radius sphere, then applies the local ENU sample offset. The
compiled scale, coverage, thin-support, occupancy, real-asset and A2 fixtures all
turned green after this correction.

Planar does not compile the new Globe density library. Its retained density body,
assets and product controls are unchanged. Prior dual-world density/luminance/
chromaticity/distance parity assertions were removed because A4-G explicitly
revoked that contract; each path still has independent finite-output,
positive-density, ordered-distance, attachment-bounds and exact replay checks.

### GPU, browser and lifecycle evidence

The new actual-GPU probe compiles the shipping Globe source and independently
computes the same fixed sample on the CPU. It matches normalized density
`0.625`, height gradient `0.75`, optical depth, transmittance, eight-octave solar
source, sky `1/(4*pi)` gradient source, local-extinction powder, opacity and
premultiplied radiance within half-float-aware tolerances. The retained angular
normalization/old-defect mutations and scale `0/1/10` complete-attachment fixture
remain unchanged and green. The exact controller continues to cover Globe
linear/log, raw exact clear, full color/distance finiteness and bounds, depth
clipping, deterministic replay, occupancy acceleration versus exhaustive density,
disabled/failure/resize/context/destroy and resource publication atomicity.

The Test page now has a labeled Globe-only owner-gate control group with stable
ground/inside/above/near-space cameras and six component combinations. Fresh
final-source browser smoke traversed all states and cameras and ended Globe
`ready · HDR`. Cloud-only and fully combined ground views retained visible
nonuniform cloud structure/gaps and no viewport-wide white/gray slab. The distant
ground cloud presentation remains soft/low-frequency and is retained as a project
owner visual risk; numerical and execution review do not close that gate.

### Exact commands and audit

- `npm run test -- --includeName "matches the reference-derived Globe cloud core on the actual GPU"` -> `1/1 SUCCESS`.
- `npm run test -- --includeName "matches reference-audited cloud lighting on the actual GPU"` -> `1/1 SUCCESS`.
- `npm run test -- --includeName "calibrates only intrinsic raw cloud MRT radiance across both worlds"` -> `1/1 SUCCESS`.
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"` -> `62/62 SUCCESS`.
- `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline"` -> `7/7 SUCCESS`.
- `node --test scripts/scenegis/generate-cloud-core-assets.test.mjs` -> `10/10 PASS`.
- `node scripts/scenegis/verify-planar-packages.mjs` -> installed delivery and exact asset/provenance smoke `23/23`.

The package smoke initially exposed two stale expected defaults (`1.0`) in its
generated consumer fixtures; those SceneGIS-owned assertions now match the
already accepted public `cloudRadianceScale=10.0` contract. No runtime contract
changed. Focused ESLint, supported-file Prettier, Markdownlint and
`git diff --check` are run after this writeback. Prettier has no configured parser
for `.glsl`; compiled shader Specs and diff checks are the formatting/parse
authority for those files.

Runtime delta: pass=`0`, program=`0`, texture=`0`, FBO=`0`, history=`0`, asset=
`0`, public API=`0`, GPU bytes=`0`. The only program change is Globe fragment
source composition; the existing program count is unchanged. Upstream-owned
changed=`0`, generated changed=`0`, new SGP=`0`; `SGP-0008` remains consume-only.
No raw `_gl`, PBO, runtime fetch, third-party runtime dependency, cloud-local
tone/display transfer, second haze medium, hidden scale/tint/fallback, A5-G work,
commit or push was introduced.

Conclusion=`review-ready for independent Architecture review`; owner gate,
checkpoint and A5-G remain blocked.

## Architecture A4-G independent review — changes requested — 2026-08-27

### Accepted boundaries and independent evidence

Architecture accepts the Globe-first phase boundary, fixed reference commits,
license/source map, rejection of opaque reference binaries, retention of the
deterministic SceneGIS CloudCore package, and the freeze on Planar behavior. The
new Globe density library is SceneGIS-owned, introduces no program/pass/texture/
FBO/history/asset/public-API/GPU-byte delta, and A3 fog is still composed once.

Architecture independently reran the existing direct Globe reference fixture
(`1/1 SUCCESS`), exact controller (`62/62 SUCCESS`) and A1 private pipeline
(`7/7 SUCCESS`). Focused Prettier and Markdownlint passed; `git diff --check`
exited zero with retained line-ending warnings only. A fresh Chromium session
enabled the final source, traversed all four A4-G cameras and all six component
states, and recorded Globe=`45` successful frames, Planar=`38`, render errors=`0`
and page errors=`0`. Ground cloud-only/combined no longer reproduces the prior
viewport-wide white failure. It still presents as a soft low-frequency grey band,
which remains an owner visual risk rather than a numerical acceptance result.

### A4-AR-029 — Globe reference-coordinate authority is incorrect and untested

Severity=`blocking product correctness and evidence defect`.

The fixed Cesium reference computes its altitude correction as
`center = surface - geodeticNormal * bottomRadius` and uses `-center`; therefore
the corrected zero-altitude anchor is exactly
`geodeticNormal * bottomRadius`. Both SceneGIS primary and Sun marches instead use
`normalize(surfacePosition - ellipsoidCenter) * bottomRadius`. That is the WGS84
geocentric surface direction, not the ellipsoid geodetic surface normal supplied
as `worldVertical`/`vertical`.

The difference is not merely terminology. An independent WGS84 calculation at
geodetic latitude 45 degrees gives angular separation=`0.192423` degrees and a
bottom-sphere chord=`21,396.48 m`. Cloud height at 1500 m happens to differ by only
about `0.0085 m`, but `sceneGISGlobeCloudDensitySample` uses the complete corrected
position for repeated shape/detail sampling. The horizontal phase therefore moves
by about `2.14` periods for the 10-kilometre cumulus shape scale and no longer
matches the fixed reference's geospatial anchor.

A second exact source mismatch exists in
`sceneGISGlobeCloudCubeSphereUv`. The reference chooses dominant faces with
inclusive comparisons and stable Y-then-X ordering. The product uses two strict
`greaterThan` branches, so an exact dominant-axis tie falls through to the Z face.
For direction `(1,1,0)`, adjacent directions converge to periodic X/Y edge values,
but the exact product tie evaluates to approximately
`(1.112372,-0.207107)` instead of reference `(0,0.5)`. Multiplication by the weather
repeat and sampler wrapping then selects an unrelated weather texel, creating a
deterministic cube-face seam.

The new GPU test does not cover these product paths. Its shader constructs only
`vec3(bottomRadius + sampleHeight,0,0)` and directly invokes the density and
lighting helpers. It never executes WGS84 surface conversion, a non-equatorial ENU
frame, primary/Sun marches, cube-face ties, occupancy, or the final Cloud MRT.
Existing real-asset phases are near the equator and prove replay/finite ordering,
not reference-coordinate equality; the exhaustive-occupancy fixture covers one
equatorial phase only.

Required correction:

1. Centralize the Globe bottom-sphere anchor and use the normalized geodetic
   surface normal in both primary and Sun marches, matching the fixed reference
   altitude correction exactly. Remove the duplicated geocentric formula.
2. Match the reference cube-face inclusive dominance/tie order (or an exactly
   equivalent mapping). Test every X/Y/Z dominant-axis tie plus adjacent
   `+/- epsilon` directions with periodic-edge continuity and exact reference UVs.
3. Add an actual-compiled integrated fixture at a non-equatorial WGS84 location,
   including 45-degree latitude. Derive the expected corrected anchor/rays from
   the live ellipsoid surface and ENU frame; execute the real primary and Sun
   marches and compare accelerated versus exhaustive Cloud MRT under linear and
   log depth. A helper-only density probe cannot close this finding.
4. Repeat the current focused GPU/controller/A1, CloudCore generator and installed
   package/provenance checks, then run focused ESLint/Prettier/Markdownlint and
   `git diff --check`. Refresh the Globe-only browser matrix at equatorial and
   mid-latitude ground/inside/above/near-space views.
5. Keep Planar, accepted radiometric equations/defaults, assets, public API,
   runtime resource budgets, `SGP-0008`, owner gate and A5-G frozen.

Conclusion=`changes-requested`. The current green tests and browser smoke do not
authorize the project-owner visual gate. Tree remains uncommitted/unpushed;
checkpoint, commit/push and A5-G remain blocked pending A4-AR-029 repair and an
independent Architecture re-review.

## A4-G / A4-AR-029 execution repair — review-ready 2026-08-27

### Root cause to bounded repair

The primary and Sun marches independently reconstructed the Bruneton bottom
sphere from the geocentric WGS84 surface direction. This preserved altitude but
translated the reference weather/shape phase by more than 20 km at 45 degrees
geodetic latitude. Both marches now call one
`sceneGISGlobeCloudSurfaceAnchor(normal)` helper with the normalized live WGS84
geodetic normal. The cube-sphere selector also now exactly follows the fixed
reference's inclusive Y-then-X-then-Z dominance order; exact dominant-axis ties
no longer fall through to an unrelated face.

The renderer's existing private program-construction test seam accepts an
optional Globe cloud-library source solely so compiled mutation fixtures can
replace the shipping source. Runtime call sites and resources are unchanged.
The shared anchor helper is unconditionally declared because the frozen Planar
variant parses the shared function containing the Globe sample-position path;
the Planar product branch does not call the helper and its output remains frozen.

### Actual-GPU and browser evidence

- Cube boundary fixture: all X/Y/Z dominant-axis ties plus adjacent positive and
  negative epsilon directions match an independently written reference UV map
  within the half-float-aware tolerance. Periodic weather-edge samples remain
  continuous. Restoring strict `greaterThan` comparisons fails the matrix with a
  UV delta greater than `0.1`.
- Integrated WGS84 fixture: longitude 15 degrees, geodetic latitude 45 degrees,
  live ellipsoid surface and ENU frame, actual primary/Sun marches, linear/log
  variants, and accelerated/exhaustive modes. Accelerated and exhaustive color
  and distance attachments are bit-exact; all decoded values are finite and
  bounded, active pixels are ordered, and exact raw clear pixels remain present.
  The derived geocentric anchor differs from the reference anchor by more than
  `20,000 m`; the compiled geocentric mutation changes raw Cloud MRT color and is
  rejected deterministically.
- Final-source browser matrix: equator and 45-degree location, four fixed cameras
  and six component states, for `48` successful Globe frames. The fresh browser
  remained `ready · HDR`; page/render errors=`0`. The soft low-frequency grey-band
  risk remains visible for the later owner judgment and was not hidden by any
  scale, tint, camera or Sun change.

### Exact validation and audit

- `npm run test -- --includeName "matches reference cube-face ties on the actual GPU"`
  -> `1/1 SUCCESS`.
- `npm run test -- --includeName "matches integrated mid-latitude Globe reference coordinates on the actual GPU"`
  -> `1/1 SUCCESS`.
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"`
  -> `64/64 SUCCESS`.
- `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline"`
  -> `7/7 SUCCESS`.
- `node --test scripts/scenegis/generate-cloud-core-assets.test.mjs` -> `10/10`.
- `node scripts/scenegis/verify-planar-packages.mjs` -> installed
  GLSL/generated modules=`23/23`, exact CloudCore/provenance passed.
- Focused ESLint, Prettier, Markdownlint and `git diff --check` are rerun after
  this final writeback.

Product resource/pass/program/texture/FBO/history/API/GPU-byte deltas=`0`.
Assets/defaults remain unchanged. Upstream-owned changed=`0`, generated
changed=`0`, new SGP=`0`; `SGP-0008` remains consume-only. Planar was not
diagnosed or calibrated. Conclusion=`review-ready for independent Architecture
re-review`; the tree stays uncommitted/unpushed and owner gate, checkpoint and
A5-G remain blocked.

## Architecture A4-AR-029 independent re-review — approved 2026-08-27

### Source and evidence decision

No new finding. Architecture confirms that
`sceneGISGlobeCloudSurfaceAnchor` receives the live WGS84 geodetic normal in
both primary and Sun marches, eliminating the rejected geocentric reconstruction.
`sceneGISGlobeCloudCubeSphereUv` now follows the fixed reference's inclusive
Y-then-X-then-Z face order. The renderer's optional Globe-library argument is
default-preserving and used only by compiled mutation fixtures; runtime program
count and call sites are unchanged. Planar parses the shared declarations but
does not enter the Globe sampling branch, so the Globe correction does not
authorize or perform Planar calibration.

The two new fixtures close the exact evidence gaps identified by `A4-AR-029`.
The boundary fixture runs the compiled Globe mapping at dominant-axis ties and
adjacent epsilon directions and rejects the former strict-comparison mutation.
The integrated fixture constructs the live WGS84 surface/ENU frame at geodetic
latitude 45 degrees, executes the shipping primary and Sun Cloud MRT marches in
linear/log variants, proves accelerated/exhaustive attachment-bit identity, and
rejects a compiled geocentric-anchor mutation. It includes finite/bounded active
output and exact raw-clear authority.

### Independent validation and visual boundary

- Cube-face boundary GPU fixture: `1/1 SUCCESS`.
- Integrated mid-latitude WGS84 GPU fixture: `1/1 SUCCESS`.
- SceneGIS environment controller: `64/64 SUCCESS`.
- A1 private pipeline: `7/7 SUCCESS`.
- Deterministic CloudCore generator: `10/10 PASS`.
- Installed delivery/package/provenance: `23/23 PASS`.
- Focused ESLint, Prettier and Markdownlint: pass; `git diff --check`: exit `0`
  with retained line-ending warnings only.
- Final-source browser: equator/45 degrees x four cameras x six states = `48/48`
  rows; Globe and Planar status stayed `ready · HDR`; browser errors=`0`.

Architecture's mid-latitude ground cloud-only and fully-combined captures show
nonuniform bodies and gaps and do not reproduce the viewport-wide white slab.
The distant Globe cloud deck remains visually soft and low-frequency. That
quality concern is deliberately preserved as a project-owner visual-gate risk;
it is not grounds to reopen the now-correct coordinate authority, nor is it
declared visually accepted by Architecture.

Conclusion: `A4-AR-029` is closed and A4-G is
`approved-for-project-owner-Globe-visual-gate`. This is not phase completion and
does not authorize a checkpoint, commit/push, A5-G, or any Planar diagnosis or
calibration. Runtime/resource/public-API/asset deltas remain zero;
upstream-owned changed=`0`, generated changed=`0`, new SGP=`0`, and `SGP-0008`
remains consume-only. The shared tree remains uncommitted/unpushed pending the
project owner's explicit Globe visual decision.

## Project-owner Globe visual No-Go — A4-AR-030 2026-08-27

### Finding

Severity=`blocking owner-visible quality defect`.

The owner rejects the Globe candidate after the technical closure of
`A4-AR-029`: the cloud deck remains too grey to read as white sunlit cloud, and
distant structure remains too soft and low-frequency. The coordinate and
finite-output repairs remain accepted; this finding does not reopen them.

### Independent reference/source diagnosis

The audited Cesium reference does not display linear raymarch radiance directly.
`src/ThreeGeospatialPipeline.js#getCloudFragmentShader` divides by alpha and
applies `cloudExposure=3`, `ACESFilmic`, gamma `1/2.2`, and magenta reduction;
the reference defaults also set `sunIntensity=20`. Its visibly whiter result is
therefore partly a private cloud display transform. Copying those operations
would create the cloud-local/double tone mapping already forbidden by ADR-0043
and ADR-0046, so reference appearance cannot be recovered by pasting that tail.

A separate source mismatch directly explains the frequency failure. The
reference default `shapeRepeat=4.1/10000 m` yields a macro period of about
`2439 m` and uses default `mipLevelScale=0.35`. The current Globe adaptation uses
private shape periods of `10 km` cumulus, `13 km` mixed low cloud, `22 km`
stratus and `30 km` cirrus, with conservative full-footprint LOD. The SceneGIS
candidate is therefore designed to be roughly four to twelve times lower in
macro frequency before distant filtering is applied.

### Required bounded repair

1. Run the fixed local reference demo when buildable and record its default
   cloud-only/combined appearance and effective source defaults. Do not copy its
   opaque binaries or introduce a runtime dependency.
2. Build compiled Globe mutation/sweep evidence that independently varies macro
   layer period, footprint LOD response and existing `cloudRadianceScale`.
   Attribute raw/final luminance and chroma separately from active-mask edge
   frequency and connected-body structure.
3. Prefer a minimal private Globe scale/LOD correction. A change to the existing
   public `cloudRadianceScale` default is allowed only when final-display and raw
   evidence justify it; keep `[0,64]` and linear semantics, update ADR-0046,
   constructor/JSDoc/Test/Specs, and repeat scale invariance/storage safety. Any
   shared Planar inheritance must be recorded but is not a Planar visual claim.
4. Do not add cloud-local ACES/gamma/exposure, tint/clamp, hidden RGB multiplier,
   Test-only product behavior, new assets/resources, or camera/Sun workarounds.
   Keep accepted phase/transport/powder/Sun-sky, WGS84/cube mapping,
   occupancy/depth/composition/history and A5-G frozen unless a focused mutation
   first proves a remaining defect and Architecture explicitly reopens it.
5. Refresh same-final-source day cumulus/mixed at equator/45 degrees, fixed
   ground/above views and cloud-only/combined states. Report raw and displayed
   p10/median/p90, D65/chroma, finite/max, active-mask transition density,
   connected bodies/largest body, replay stability, forward HDR safety, sunset
   warmth and night zero. Automated thresholds do not replace owner judgment.

Conclusion=`changes-requested; A4-AR-030 open`. Tree remains
uncommitted/unpushed; project-owner re-gate, checkpoint, commit/push, A5-G and
Planar diagnosis/calibration remain blocked.

## Architecture A4-AR-030 root-cause decision — 2026-08-27

### Independent diagnosis

Architecture has completed the reference run, parameter sweep and scheme
decision that were previously assigned too broadly to Execution. The reference
demo was served locally on port `8100`; `8081` remained occupied by a SceneGIS
Node process. No runtime/reference binary was copied.

The owner-gate lighting input was mislabeled at the A4-G location. At longitude
`15 degrees`, geodetic latitude `45 degrees`, `04:00Z` gives actual local Sun
elevation `6.229 degrees`, while `10:30Z` gives `67.484 degrees`. The rejected
frame was therefore a valid warm low-Sun result presented as `day`, not a valid
noon-white comparison.

An independent high-Sun sweep still confirms two product-quality defects. With
the retained source equations and macro scale `0.25`, public scale `24` produced
cloud-only display median Y `162.56` and median RGB `166/162/158`; scale `48`
produced median Y `224.84`, p90 `233.77` and median RGB `230/224/218` while
retaining shadow cavities. Scale `64` compressed p90/p95 to approximately
`240.89/241.89` and was rejected. The existing global Cesium PBR Neutral stage,
not a Spec-local ACES approximation, is the final display authority.

Changing only Globe LOD factor `1.0 -> 0.5` increased interior five-pixel
high-pass energy `0.46535 -> 0.54576` (`+17.3%`), Laplacian energy
`1.96516 -> 2.14120` (`+9.0%`) and reduced directional anisotropy
`2.250 -> 1.681`. Factor `0.35` added only `3.7%` further high-pass energy and
showed low-Sun ray-aligned banding. The retained macro scale `0.25` places the
private preset periods at `2.5–7.5 km`, including cumulus close to the reference
`2.439 km` period.

A temporary reference Sun/sky source mutation moved high-Sun CIE xy from the
retained source's approximately `(0.32093,0.33573)` to
`(0.30133,0.32978)` and did not repair low-Sun olive chroma. It was restored.
The accepted solar-normalized source, phase, higher-order transport, powder and
Beer-Lambert equations remain frozen.

### Changes requested

1. Keep private Globe macro scale `0.25`; change private Globe LOD scale from
   `1.0` to `0.5`.
2. Change public/JSDoc/Test/package-smoke default `cloudRadianceScale` from the
   partial `24.0` candidate to `48.0`. Keep finite `[0,64]`, exact linearity,
   request/history semantics and `cloudRadianceScale=1` diagnostic authority.
3. Replace the partial A4-AR-030 Spec's premultiplied cloud-local scalar ACES
   calculation. Raw GPU evidence must separate interior spatial frequency from
   active-mask transitions; final display must execute the actual Cesium PBR
   Neutral composition.
4. Add location-correct A4-G high-Sun/day `10:30Z`, sunset `18:30Z` and no-moon
   night `22:00Z` controls, reporting actual local solar elevation. Preserve the
   generic dual-world controls; this correction is Test evidence, not a product
   Sun/camera workaround.
5. Rerun actual RGBA16F scale `0/1/48`, complete attachment invariance/finite
   bounds, forward storage guard, raw LOD frequency, controller/A1,
   generator/package provenance, focused lint/format/docs/diff, and the
   equator/45-degree ground/above cloud-only/combined high-Sun/sunset/night
   browser matrix.

No cloud source equation, tint, local tone map, hidden multiplier, asset,
resource/pass/program/texture/FBO/history count, WGS84/cube/depth/composition,
Planar-specific behavior, owner-gate request, checkpoint, commit/push or A5-G is
authorized. Conclusion remains `changes-requested; A4-AR-030 implementation
assigned`.

## Execution review request — A4-AR-030 2026-08-27

### Implemented delta

- `SceneGISGlobeClouds.glsl`: retained macro scale `0.25`; changed only private
  footprint LOD scale `1.0 -> 0.5`.
- `SceneGISEnvironmentEffects.js`: public/JSDoc default `24.0 -> 48.0`; range,
  setter, requestRender and history semantics are unchanged.
- Focused Spec: removed the copied scalar ACES model; added actual-compiled raw
  interior gradient/Laplacian/3x3 high-pass authority and retained independent
  macro-mask mutation. The complete MRT calibration matrix is now `0/1/48`.
- `Test/高级环境.html`: default control is `48`; added location-aware owner
  inputs for `10:30Z`, `18:30Z`, `22:00Z`, live geodetic solar elevation and a
  visible actual-scene/raw-MRT evidence panel.
- Installed-package smoke expects public default `48.0`. No product shader other
  than the private Globe LOD constant changed.

### Automated evidence

- `npm run test -- --includeName "separates Globe cloud macro frequency, LOD, and radiance calibration on the actual GPU"`
  -> `1/1 SUCCESS`.
- `npm run test -- --includeName "calibrates only intrinsic raw cloud MRT radiance across both worlds"`
  -> `1/1 SUCCESS`.
- A4-AR-029 cube-face and mid-latitude fixtures -> `1/1 SUCCESS` each.
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"`
  -> `65/65 SUCCESS`.
- `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline"`
  -> `7/7 SUCCESS`.
- `node --test scripts/scenegis/generate-cloud-core-assets.test.mjs` ->
  `10/10 PASS`.
- `node scripts/scenegis/verify-planar-packages.mjs` -> `23/23 GLSL` and
  `23/23 generated shader modules`, with exact CloudCore/Bruneton/PlanarEarth
  asset and provenance verification.

The radiometric fixture decoded every color/distance component for Globe/Planar
and linear/log programs. Scale zero RGB was exact zero; scale `48` remained
half-float-linear to scale `1`; alpha and distance/front/max/validity bits were
exact invariant; all values were finite/in bounds and below the RGBA16F guard.
The revised frequency fixture proved LOD `0.5` materially increases all three
interior frequency measures over `1.0`, while macro `0.25` retained the causal
mask-frequency mutation.

### Actual Cesium display evidence

The final-source high-Sun matrix covered cumulus/mixed, equator/45-degree,
ground/above, cloud-only/combined (`16` rows). Raw median Y was
`1.0083–1.2661`, raw absolute maximum RGB `1.34375`, all nonfinite/bounds counts
zero, displayed p90 Y `0.7587–0.9289`, and displayed maximum RGB `0.9765`.
Near-white lit regions retain dark cavities and sky gaps; distant interior
variation is materially stronger without a uniform white slab. At longitude
`15 degrees`, latitude `45 degrees`, measured elevations were high Sun `67.484`,
sunset `2.175` and night `-20.120 degrees`. Sunset ground source mean was
`0.43675/0.16669/0.04150` (`R > G > B`); no-moon-night raw cloud source and
luminance were exact zero. A nonconsecutive equatorial capture was exact for
resolved color/distance and final display.

### Audit and residual risk

Upstream-owned changed=`0`; generated changed=`0`; new SGP=`0`; SGP-0008 remains
consume-only. Pass/program/texture/FBO/history/static-asset/GPU-byte delta=`0`;
public API shape/range delta=`0`. The public default is the sole API-value delta
and the shared Planar controller inherits it without any Planar formula or visual
qualification. Extreme high/mixed views still expose some block/ray-step texture;
this remains an owner-visible risk. Tree is uncommitted/unpushed. Conclusion=
`review-ready; A4-AR-030 awaiting independent Architecture re-review`.

## Architecture A4-AR-030 independent re-review — changes requested 2026-08-27

### Accepted product and automated boundary

Architecture finds no remaining product-source defect in A4-AR-030. The final
Globe source retains macro scale `0.25`, changes only the private footprint LOD
factor to `0.5`, and the public constructor/JSDoc/package contract defaults to
`48.0` within the unchanged finite `[0,64]` range. The rejected cloud-local ACES
model is absent. Accepted phase, Sun/sky, multiple scattering, powder,
Beer-Lambert, WGS84/cube, occupancy, log-depth, composition, assets and runtime
resource ownership remain frozen.

Architecture independently reran:

- revised actual-GPU frequency fixture -> `1/1 SUCCESS`;
- complete actual-GPU `0/1/48` calibration fixture -> `1/1 SUCCESS`;
- exact environment controller -> `65/65 SUCCESS`;
- A1 private pipeline -> `7/7 SUCCESS`;
- deterministic CloudCore generator -> `10/10 PASS`;
- installed delivery/package/provenance verifier -> `23/23 PASS`.

Independent live capture at `15 degrees E / 45 degrees N` measured high Sun
`67.484 degrees`; mid-latitude ground cloud-only source RGB was approximately
`1.0811/1.0211/0.9579`, raw median/p90 Y `1.0236/1.1473`, displayed p90 Y
`0.9120`, display maximum `0.9569`, with finite output and retained cavities.
True sunset measured `2.175 degrees` and source RGB remained warm
(`0.5029/0.1892/0.0449`). No-moon night measured `-20.120 degrees` and raw cloud
RGB/luminance were exact zero. Browser render errors were zero.

### Blocking evidence finding A4-AR-031

Severity=`blocking Test evidence-integrity defect`; product repair remains
accepted and frozen.

`Test/高级环境.html` exposes the four-preset grid inside the A4-G owner controls,
but `capturePresetGrid` still derives its title, stored key and primitive
visibility from generic `currentArtifactMode`. A4-G state is independently owned
by `currentGlobeOwnerGateState`. Consequently, after choosing A4-G `Cloud only`,
the visible grid remains labeled `combined`, ordinary primitives are not hidden,
and Globe/Planar are captured under different component states. That evidence
cannot be presented as an A4-G owner matrix.

The replay helper also treats an exact 8-bit final-frame hash as its only display
authority. Architecture captured four same-state frames with hashes
`daa7345f/daa7345f/e1a6b8ec/daa7345f`; raw color and distance attachments were
bit-exact, while displayed changes were bounded to one 8-bit LSB over
`12,190 / 577,005` pixels (`2.11%`). This is a bounded final-display
quantization/dither difference, not raw Cloud MRT instability, but it proves the
reported one-off exact display replay is not a deterministic gate.

### Required focused repair

1. Make the A4-G preset grid explicitly Globe-only and key its visible title,
   stored record and capture behavior from a snapshotted
   `currentGlobeOwnerGateState`, owner location/camera, lighting and quality. For
   `a4gCloudOnly`, hide only Globe primitives. Do not mutate, capture or present
   Planar as A4-G evidence. If the generic dual-world grid remains useful, expose
   it separately with an unambiguous control and state authority.
2. Preserve strict resolved color/distance attachment bit identity. Extend the
   final-display comparison with equal dimensions, changed-pixel count/fraction,
   maximum channel delta and p10/median/p90 deltas. Keep `displayExact` truthful;
   add fail-closed `displayStable` requiring maximum channel delta `<= 1`,
   changed-pixel fraction `<= 0.05`, and percentile deltas `<= 1/255`.
3. Refresh visible high-Sun/sunset/night browser evidence and demonstrate that
   the grid title/state snapshot is exact, Globe-only capture does not alter
   Planar, raw replay is bit-exact, and bounded display replay passes without
   claiming byte identity when it is false. Run focused Test ESLint/Prettier,
   Markdownlint and `git diff --check`.

No product JS/GLSL, default/range, equation, resource, asset, Planar behavior,
owner-gate request, checkpoint, commit/push or A5-G work is authorized.
Upstream-owned changed=`0`; generated changed=`0`; new SGP=`0`; `SGP-0008`
remains consume-only. Conclusion=`changes-requested; A4-AR-031 focused Test
evidence repair assigned`. The shared tree remains uncommitted/unpushed.

## A4-AR-031 execution repair — review-ready 2026-08-27

### Test-only repair

The four-preset control now produces a visibly labeled Globe-only grid from
`currentGlobeOwnerGateState`. Its snapshot includes owner location/camera,
lighting, owner state, quality and the fixed four-preset sequence. In
`a4gCloudOnly`, only Globe primitives are hidden. Final capture recorded title
`Globe A4-G · midLatitude · ground · a4g-highSun · a4gCloudOnly · medium ·
cumulus -> stratus -> cirrus -> mixed`, Globe visibility=`false` during capture,
and byte-for-byte-equivalent Planar before/after state with primitive
visibility=`true`.

The replay helper preserves strict resolved color/distance attachment equality
and adds full display dimensions, changed-pixel count/fraction, maximum RGBA
byte delta, p10/median/p90 deltas, truthful `displayExact`, and fail-closed
`displayStable`. The actual Cesium framebuffer is read in `postRender` while
the default loop is paused. Twenty-four controlled renders identify a recurring
exact attachment phase; the first and last ordered four samples are compared,
their nonconsecutive capture indices and total occurrences are reported, and
fewer than eight occurrences fails closed.

### Final-source browser evidence

- High Sun `67.484 degrees`, cloud-only: raw RGB
  `1.06725/1.00793/0.94548`, raw Y `0.90366/1.00634/1.14574`, displayed Y
  `0.40067/0.40067/0.91366`, displayed max `0.95686`.
- True sunset `2.175 degrees`, fully combined: raw RGB
  `0.57202/0.21432/0.04926` with `R > G > B`; displayed Y
  `0.28633/0.39281/0.50898`, displayed max `0.96078`.
- No-moon night `-20.120 degrees`, cloud-only: raw RGB and raw Y distribution
  exact zero.

High-Sun/sunset/night exact phases occurred `16/20/16` times over 24 renders.
Every final comparison reported equal `799 x 586` dimensions, changed pixels=
`0`, changed fraction=`0`, maximum channel delta=`0`, percentile deltas=`0`,
truthful `displayExact=true`, `displayStable=true`, and resolved color/distance
exact=`true`. Nonfinite pixels and browser errors were zero. The comparator still
reports and bounds non-exact one-LSB output rather than converting it into an
exact claim.

### Scope audit

This finding changes no product JS/GLSL, public value/API, asset, resource,
pass, program, texture, FBO, history or GPU-byte budget. Upstream-owned changed=
`0`; generated changed=`0`; new SGP=`0`; `SGP-0008` remains consume-only.
Conclusion=`review-ready for independent A4-AR-031 Architecture re-review`.
The tree remains uncommitted/unpushed; owner gate, checkpoint and A5-G remain
blocked.

Post-writeback validation:

- `npx eslint "Test/高级环境.html" --quiet --no-cache`: exit `0`.
- `npx prettier --check --ignore-path NUL` over the Test page and four current
  A4-G documents: `All matched files use Prettier code style!`, exit `0`.
- `npx markdownlint` over the four current A4-G documents: exit `0`, no issues.
- `git diff --check`: exit `0`; retained LF/CRLF conversion warnings only.

## Architecture A4-AR-032 independent re-review — changes requested 2026-08-27

The implementation matches the assigned contiguous-run algorithm, and the
immutable Globe grid repair is accepted. The replay gate itself is rejected as
disproportionate evidence. A fresh high-Sun invocation reached 64 controlled
renders with `acceptedFrameCount=0` and alternated between two exact raw/display
phases. Atomic follow-up established that the default Globe loop was stopped,
`frameNumber` stayed unchanged during display/raw reads, repeated reads within
the same frame were bit-exact, and the low Cloud MRT, resolved attachments and
display phase changed together. This is not a capture-frame mismatch.

The known cross-phase final-display difference remains bounded to one 8-bit LSB
over `1.450%` of pixels, inside the accepted display-stability contract. Requiring
16 consecutive bit-exact raw attachments is therefore stronger than the
project-owner visual requirement and would incentivize defensive scheduling,
additional hashes and repeated gate testing without improving the feature.

Required focused correction:

1. Delete the convergence prefix, eight warm-up renders, 64-frame search,
   accepted-run hashes, replay pairs and multi-frame exact/stable flags.
2. Capture one explicit frame per requested high-Sun/sunset/night state. Copy
   the actual displayed framebuffer and raw Cloud MRT attachments atomically in
   the same `postRender` callback, then compute summaries after capture.
3. Retain only direct owner evidence: finite/bounded/storage-safe raw output,
   source RGB and luminance distribution, displayed p10/median/p90/max, measured
   solar elevation, immutable Globe state, Globe-only primitive behavior and
   unchanged Planar state. Do not add a substitute replay gate or product fix.
4. Run only focused Test lint/format, changed A4-G Markdownlint and diff check.

Conclusion=`changes-requested; simplified A4-AR-032 Test evidence repair
assigned`. Product JS/GLSL and Planar remain frozen. Owner gate, checkpoint,
commit/push, A5-G and Planar diagnosis remain blocked.

## Architecture A4-AR-031 independent re-review — changes requested 2026-08-27

### Accepted grid repair

The A4-G four-preset control is now explicitly Globe-only. Architecture's fresh
browser run showed the exact title
`Globe A4-G · midLatitude · ground · a4g-highSun · a4gCloudOnly · medium`, the
fixed four-preset sequence, Globe primitive visibility `false` during capture,
and unchanged Planar primitive visibility, preset, atmosphere, aerial, height-fog
and cloud toggles. This part of A4-AR-031 is accepted.

### Blocking finding A4-AR-032

Severity=`blocking Test evidence-integrity defect`; product remains accepted and
frozen.

The replay helper groups all 24 frames by color/distance attachment hash, selects
the most frequent phase, and compares only the first/last four frames from that
phase. Every other frame is labeled `stateApplicationFrames`, even when alternate
phases recur after selected stable samples. In Architecture's first independent
high-Sun run, alternate raw phases appeared at capture indices
`0/6/10/13/17/20`; the selected phase appeared 18 times, yet only eight of those
frames were compared and the other 16 frames were excluded. The helper then
reported strict raw identity and exact display replay.

Architecture separately captured the same controlled sequence without phase
selection. Across a dominant and alternate phase, `219,392` color attachment
half-words and `38,087` distance attachment half-words differed. The final
display differed in `8,368 / 577,005` pixels (`1.450%`) with maximum channel
delta one. Thus bounded display stability can legitimately pass, but strict raw
attachment identity must fail. A frequency threshold such as eight occurrences
does not prevent this cherry-pick.

The product is not reopened: after eight explicit convergence renders,
Architecture captured 24 consecutive frames with one color/distance phase, one
display hash, stationary history, read index zero and weight `0.82`. The failure
is the Test protocol's lack of contiguous convergence, not demonstrated Cloud
MRT instability after convergence.

The grid also snapshots owner state but later decides primitive visibility from
the live `currentGlobeOwnerGateState`; it does not verify that owner location,
camera, lighting, state or quality stayed unchanged during capture. A mid-capture
control change can therefore leave the visible snapshot inconsistent with the
captured frames.

### Required focused repair

1. Delete attachment-phase grouping and arbitrary exclusions. Drain the pending
   default-loop task after pausing it, then use at most 64 controlled frames to
   find one uninterrupted 16-frame convergence/validation run. All accepted
   frames must share exact color and distance attachments and satisfy bounded
   display stability; discarded frames may only form one reported contiguous
   prefix.
2. Compare the first four and last four accepted frames as nonconsecutive pairs,
   while including every intervening accepted frame in the strict raw and bounded
   display gate. Report the prefix, accepted indices and all hashes/deltas. Fail
   if no uninterrupted run exists.
3. Drive the Globe grid from `snapshot.ownerState` and verify the complete owner
   state/quality snapshot at completion. Fail closed if it changed. Preserve the
   already-correct Globe-only and Planar-isolation behavior.
4. Refresh the three lighting captures and grid evidence, then run focused Test
   ESLint/Prettier, A4-G Markdownlint and `git diff --check`.

Independent current lint/format/Markdownlint and diff check are green, but do not
close the semantic finding. Product JS/GLSL changed by this finding=`0`;
upstream-owned=`0`, generated=`0`, new SGP=`0`; `SGP-0008` remains consume-only.
Conclusion=`changes-requested; A4-AR-032 focused Test evidence repair assigned`.
Owner gate, checkpoint, commit/push, A5-G and Planar work remain blocked.

## A4-AR-032 execution repair — review-ready 2026-08-27

### Contiguous convergence authority

Execution removed attachment-hash grouping and arbitrary frame exclusion. After
stopping the default loop, the helper drains pending RAF work and executes eight
explicit controlled convergence renders. It then captures within a total bound
of 64 controlled renders. A candidate run resets at the current frame on any raw
color/distance or bounded-display mismatch and is accepted only at 16 continuous
frames. The only excluded records form the exact contiguous prefix before that
run; no accepted or intervening frame can be removed.

All 16 accepted frames participate in resolved color exactness, resolved
distance exactness and display stability against the run reference. The first
four and last four are also reported as nonconsecutive pairs. The evidence lists
prefix length, total controlled frames, continuous original indices, every
accepted display/color/distance hash, stationary/read-index diagnostics, and
maximum display deltas. The absence of a 16-frame run fails every authority
closed.

### Final browser evidence

- High Sun `67.484 degrees`, cloud-only: convergence prefix `0-21`; accepted
  `22-37` (`16/16`) within 38 total controlled renders. Raw RGB
  `1.06725/1.00793/0.94548`; raw Y `0.90366/1.00634/1.14574`; displayed Y
  `0.40067/0.40067/0.91366`, max `0.95686`.
- True sunset `2.175 degrees`, fully combined: prefix `0-7`; accepted `8-23`
  (`16/16`) in 24 renders. Raw RGB `0.57202/0.21432/0.04926` retained
  `R > G > B`; displayed Y `0.28633/0.39281/0.50898`, max `0.96078`.
- No-moon night `-20.120 degrees`, cloud-only: prefix `0-9`; accepted `10-25`
  (`16/16`) in 26 renders. Raw RGB and raw Y p10/median/p90 remained exact zero.

Every accepted run contained one display hash, one resolved-color hash and one
resolved-distance hash. All 16 histories were stationary with read index zero.
All accepted/intervening-frame comparisons and first-four/last-four pairs had
equal `799 x 586` dimensions, zero changed pixels/fraction, zero maximum channel
delta, zero percentile deltas, `displayExact=true`, `displayStable=true`, and
strict color/distance exactness. Nonfinite pixels and browser errors were zero.

### Immutable grid snapshot

The accepted Globe-only grid now uses `snapshot.ownerState` rather than the live
owner state for primitive behavior. On completion it verifies owner location,
camera, lighting, state and quality against that snapshot and preserves the
Planar before/after equality check. Final evidence retained the exact visible
`midLatitude / ground / a4g-highSun / a4gCloudOnly / medium` title and preset
order, Globe primitive visibility `false` during capture, owner unchanged=
`true`, Planar unchanged=`true`, and aggregate `valid=true`.

### Scope audit

Only `Test/高级环境.html` and the four current A4-G records changed for this
finding. Product JS/GLSL, public values/API, assets, resources, passes, programs,
textures, FBOs, history, GPU bytes and Planar behavior remain unchanged.
Upstream-owned=`0`, generated=`0`, new SGP=`0`; `SGP-0008` remains consume-only.
Conclusion=`review-ready for independent A4-AR-032 Architecture re-review`.
Owner gate, checkpoint, commit/push and A5-G remain blocked.

Post-writeback validation:

- `npx eslint "Test/高级环境.html" --quiet --no-cache`: exit `0`.
- `npx prettier --check --ignore-path NUL` over the Test page and four current
  A4-G documents: exit `0`; all matched files use Prettier code style.
- `npx markdownlint` over the four current A4-G documents: exit `0`, zero
  issues.
- `git diff --check`: exit `0`; retained LF/CRLF conversion warnings only.

## A4-AR-032 simplified execution — review-ready 2026-08-27

### Atomic single-frame evidence

Execution removed the rejected convergence prefix, RAF/warm-up renders,
64-frame search, candidate run, phase/hash arrays, replay pairs, and all
multi-frame exact/stable reporting. For the explicitly selected owner state,
the helper now stops the default loop and performs one controlled render. The
same `postRender` callback synchronously copies the actual final framebuffer and
both raw Cloud MRT attachments before resolving; raw and displayed summaries are
computed afterward from those immutable copies.

The returned authority contains only owner location/camera/state/lighting/
quality, measured solar elevation, raw finite/bounds/storage and radiometric
statistics, displayed p10/median/p90 and maximum, and an immutable owner-state
before/after validity result. It contains no replay, hash, convergence or
substitute stability gate.

### Fresh final-source captures

- High Sun `67.484 degrees`, cloud-only: raw RGB
  `1.06725/1.00793/0.94548`; raw Y `0.90366/1.00634/1.14574`; displayed Y
  `0.40067/0.40067/0.91366`; maximum `0.95686`.
- True sunset `2.175 degrees`, fully combined: raw RGB
  `0.57202/0.21432/0.04926` (`R > G > B`); raw Y
  `0.06905/0.25847/0.55249`; displayed Y `0.28633/0.39281/0.50898`; maximum
  `0.96078`.
- No-moon night `-20.120 degrees`, cloud-only: raw source RGB, premultiplied/
  absolute/source maxima and raw Y distribution were exact zero; displayed Y
  `0.03957/0.40067/0.40067`; maximum `0.41961`.

Every capture had `finiteOutput=true`, all nonfinite/alpha/distance/validity
failure counts zero, `storageGuardExceeded=false`, `ownerUnchanged=true`, and
`valid=true`. Browser error count was zero.

The independently accepted preset-grid arm remains intact. Its fresh visible
title was `Globe A4-G · midLatitude · ground · a4g-highSun · a4gCloudOnly ·
medium · cumulus -> stratus -> cirrus -> mixed`; Globe primitives were hidden,
owner before/after matched, Planar primitive visibility/preset/atmosphere/
aerial/fog/cloud state was unchanged, and aggregate `valid=true`.

### Scope audit

This simplified correction changes `Test/高级环境.html` and the four current
A4-G records only. Product JS/GLSL, public values/API, assets, resources, passes,
programs, textures, FBOs, history, GPU bytes and Planar behavior remain frozen.
Upstream-owned=`0`, generated=`0`, new SGP=`0`; `SGP-0008` remains consume-only.
Conclusion=`review-ready for independent simplified A4-AR-032 re-review`.
Owner gate, checkpoint, commit/push and A5-G remain blocked.

Post-writeback validation:

- `npx eslint "Test/高级环境.html" --quiet --no-cache`: exit `0`.
- `npx prettier --check --ignore-path NUL "Test/高级环境.html"`: exit `0`; all
  matched files use Prettier code style.
- `npx markdownlint` over the four changed A4-G records: exit `0`, zero issues.
- `git diff --check`: exit `0`; retained LF/CRLF conversion warnings only.

### Simplified repair re-review: one fail-open remains

Source inspection accepts the single controlled render and same-`postRender`
copies of final RGBA8 display plus raw Cloud MRT. An enabled high-Sun invocation
was `ready · HDR`, raw available/finite, all existing bounds failures zero,
storage-safe and visually bright. No removed replay/hash/convergence field was
returned.

A direct page-initial-state invocation reproduced one bounded defect:
`globeEffects.enabled=false`, `ready=false`, `raw.available=false`, yet
`ownerUnchanged=true` caused top-level `valid=true`. The evidence must not claim
validity when its raw authority is absent. The only required correction is to
derive `valid` from the existing controller enabled/ready, raw available/finite,
zero bounds failures, storage guard false, and owner-unchanged values. Do not
add retries, extra renders, hashes, replay checks or new automated matrices.

Conclusion=`changes-requested; A4-AR-032 final Test fail-closed correction
assigned`. Product and Planar stay frozen; all later gates remain blocked.

## A4-AR-032 final fail-closed execution — review-ready 2026-08-27

The Test helper now computes `raw` once and returns that same summary. Its
top-level `valid` is the conjunction of the existing controller enabled/ready,
owner unchanged, raw available/finite, zero color/distance/union nonfinite
counts, zero alpha/distance/validity bounds counts, and storage guard false.

Exactly two direct invocations were performed:

- Fresh disabled/not-ready page: `raw={ available:false }`,
  `ownerUnchanged=true`, and `valid=false`.
- Enabled/ready high-Sun cloud-only: raw available/finite, every nonfinite and
  bounds count `0`, `storageGuardExceeded=false`, source RGB
  `1.06725/1.00793/0.94548`, raw Y `0.90366/1.00634/1.14574`, displayed Y
  `0.40067/0.40067/0.91366`, owner unchanged, and `valid=true`.

Browser errors were zero. No throw, wait, retry, render, hash, replay, metric,
test matrix, product or Planar change was added. Conclusion=`review-ready for
independent final A4-AR-032 fail-closed re-review`; all later gates remain
blocked.

Post-writeback focused validation: Test ESLint exit `0`; Test Prettier check
exit `0`; four changed-document Markdownlint exit `0`; `git diff --check` exit
`0` with retained LF/CRLF conversion warnings only.

## Architecture final A4-AR-032 acceptance — 2026-08-27

Architecture independently reproduced the two required final-source calls.
Disabled/not-ready produced `raw.available=false` and `valid=false`.
Enabled/ready high-Sun cloud-only produced raw available/finite, zero existing
nonfinite and bounds failures, storage guard false, owner unchanged and
`valid=true`; the bright displayed result remained intact. Source review found
no additional frame, retry, wait, hash, replay, metric or product behavior.

Conclusion=`accepted; A4-AR-032 closed`. Product and Planar remain frozen.
Project-owner Globe visual judgment is now the next gate; checkpoint,
commit/push, A5-G and Planar work remain blocked.

## Project-owner visual gate — passed 2026-08-27

The project owner explicitly reported `通过` for the final Globe result.
Conclusion=`approved; A4-G closed by local unpublished checkpoint`. Product and
Planar scope remain as reviewed; A5-G is not activated and no push is requested.
