# Phase Plan：A3 Exponential Height Fog

## Metadata

- Plan type: `phase`
- Status: `active`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Previous phase:
  [2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md](2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md)（`completed`）
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-15`
- Updated: `2026-08-15`
- Architecture review: `not-started`
- Implementation status: `not-started`
- Branch: `feature/atmosphere-clouds-effects`
- Predecessor checkpoint: A2=`da2eb55743a46423e65b2047965907c05ea260b7`
- Related decision:
  [ADR-0045](../../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md)
- Upstream patch: active `SGP-0008`（consume only）
- Manual visual gate: required after Architecture approval

## Goal

在A2已接受的physical atmosphere/aerial pipeline内增加一层art-directed exponential height fog，为Globe和
`SceneGISPlanarWorld`提供相同public capability、正确的radial/fixed-Z geometry、atmosphere-aware inscattering与明确的native Fog
authority。A3完成时应能看见随高度和距离变化的近地雾、远景方向性Sun雾光与高空向下穿层效果，同时保持近地surface albedo，不重复A2曾出现的
全屏颜色覆盖。

A3只交付height fog。Volumetric clouds、cloud shadows、god rays、temporal、bloom/lens flare和quality tiers仍属于A4+。

## Entry evidence

- A2 implementation、Architecture/code review、第四次project-owner manual visual gate与独立local checkpoint均已完成；精确checkpoint为
  `da2eb55743a46423e65b2047965907c05ea260b7`，planning前working tree clean。
- A1 `Scene.js`提供advanced background和linear-HDR两个`SGP-0008`slot；A2已在resolved color/depth/id之后支持linear/log-depth、
  Perspective/Orthographic reconstruction，不需要新的render seam。
- A2 renderer当前拥有one background program、linear/log-depth aerial programs、Globe/Planar atmosphere LUT与one lazy RGBA16F aerial FBO；
  `executeHdr`可在现有composition内加入fog而不增加pass或resource。
- A2 public Controller已建立disabled-zero、capability/native conflict、generation/error/retry、warm property与package delivery contract；A3只扩展
  同一owner，不建立第二Controller或Scene slot。
- Cesium native `Fog`使用Globe camera height/horizon density并同时驱动terrain culling和material fog。其坐标、density及合成与A3不同，不能作为
  dual-world视觉实现或隐藏culling optimization；active advanced effects继续要求其disabled。

## Frozen scope and public contract

严格实现ADR-0045定义的single layer及九个public option/property：`showHeightFog`、`heightFogDensity`、
`heightFogHeightFalloff`、`heightFogBaseHeight`、`heightFogStartDistance`、`heightFogMaximumOpacity`、
`heightFogInscatteringScale`、`heightFogDirectionalInscatteringScale`和`heightFogDirectionalInscatteringExponent`。Defaults、单位、范围、
request semantics与calibration isolation不得在Execution中自行改变。

所有property是warm uniform state。Construct/register while global `enabled=false`仍必须保持零attachment/request/GPU resource/command；
`showHeightFog=true`只是controller启用后的默认feature flag。`showAerialPerspective || showHeightFog`决定HDR pass，两个都false时必须返回input
identity。`showAtmosphere`单独决定background command是否存在；fog不得创建独立clear-sky pass。

Globe与planar active validation都要求caller-owned `scene.fog.enabled=false`，不得自动写native flag。Late conflict沿用A2一次error并等待显式
disable/re-enable retry。

## Render and optical contract

### Shared composition

- Aerial先保持ADR-0044 accepted公式，再执行height fog：`sceneWithAtmosphere * T_fog + fogInscattering`；最终RGB只执行一次
  ADR-0043 RGBA16F guard，alpha保持input alpha。
- Background只在A2 background command存在时施雾；HDR clear depth返回已完成的background，避免double application。
- Fog amount来自single exponential density的clipped segment integral并受maximum opacity限制。Start distance和300 km cap只裁剪fog segment，不
  篡改resolved geometry depth或A2 atmosphere distance。
- Fog source使用A2 world-specific Sun transmittance/occlusion与shared scattering coefficients，只消费A3自己的ambient/directional scale；不得读取
  `backgroundRadianceScale`或`aerialRadianceScale`，不得使用hard-coded blue、gamma/tone mapping或隐藏Sun multiplier。

### Globe

- 使用A2 virtual sphere/radial altitude与`[0, 60 km]`support shell；先解析ray/support intersection，再对有效segment积分。
- Curved height采用build-time fixed Gauss-Legendre quadrature，常量不超过16 samples。CPU adaptive double reference必须满足ADR-0045的误差gate。
- ground、tangent、air、120 km outside-shell looking down/nonintersecting以及Perspective/Orthographic都必须finite且有明确identity/nonidentity。

### Planar

- 使用A1/A2 exact planar frame的fixed `+Z`、explicit base与`[0, 60 km]`slab；先对untruncated ray求slab intersection，再应用start/cap。
- Linear-height exponential integral必须解析且数值稳定；horizontal、vertical、falloff=`0`、base crossing、shallow 50/150/300 km、high
  intersecting/nonintersecting各有CPU/shader fixture。
- 不采样Globe geometry，不使用position magnitude/Cartographic推断，不新增planar-only public参数。

## Resource and performance contract

- Expected product changes限于现有`SceneGISEnvironmentEffects`、private renderer、EnvironmentEffects GLSL、focused Specs、package/docs与
  `Test/高级环境.html`；允许新增一个SceneGIS-owned shared height-fog `.glsl` source。
- 相对A2 resource ceiling为增量零：仍是三个program、现有LUT、one lazy aerial FBO、one background/one HDR command maximum；无texture、asset、
  Framebuffer、network、listener、timer、temporal history或第二postprocess stage。
- Shared GLSL source进入现有三个program；generated shader modules只通过official build验证，不手工编辑或提交。
- Setter和show flag不得fetch/compile/reallocate。Resize/candidate swap/late generation/destroy exactly-once/failure atomicity必须保留A2实证。
- 每pixel fog work为bounded analytic planar path或最多16-sample Globe path，加fixed-bound Sun-transmittance lookup；源码和Specs必须能观测上界。
- `packages/engine/Source/Scene/Scene.js`与`.scenegis/upstream-patches.json`保持exact unchanged；current-delivery upstream-owned=`0`、
  generated=`0`。

## Implementation steps

1. 先补public defaults/range/warm-state Specs与private uniform snapshot，保持disabled-zero和A2 old-name/package contract。
2. 新增shared height-fog density/clipping/source/composition GLSL；实现planar exact integral和CPU reference fixtures。
3. 实现Globe support-shell clipping与fixed quadrature，以adaptive double reference锁定误差和sample budget。
4. 接入现有background、linear aerial和log-depth aerial programs；完成feature-flag identity、clear-depth、calibration isolation与raw-half evidence。
5. 扩展dual-world conflict/lifecycle/resource/resize/failure Specs，证明相对A2无新增resource/pass与native authority mutation。
6. 扩展`Test/高级环境.html`的fog controls、fog-only/combined diagnostics、near/far regions和ground/air/high/frustum matrix；完成local no-network
   smoke及visual artifacts。
7. 完成source/types/docs/build/installed-package、A1/A2 regression、lint/format/audit，把deviation、验证与风险写入open review后停下交给Architecture。

## Required automated validation

- Focused real-Context Controller/private renderer Specs，包括public、shader contract、raw-half pixels、linear/log、Perspective/Orthographic、
  lifecycle/failure/resource counts。
- Planar analytic与Globe CPU reference tests；Globe exact sample constant及误差上界、planar exact-horizontal/semi-infinite-safe分支必须被assert。
- A1 render-slot/reference-frame Specs与A2 focused regression；使用精确Scene/Scene filter，不能把broad substring suite误报为qualification evidence。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`，以及installed npm/root verifier对runtime/types/API docs/GLSL/private hiding的
  exact checks。
- Globe/Planar LUT `--verify-only`保持byte/hash不变；local Chromium只访问local target且console warning/error为零。
- Exact changed-scope ESLint、Prettier、Markdownlint、`git diff --check`；official upstream/generated audit和`Scene.js`/manifest exact diff。

不要求full Spec suite；focused + A1/A2 + exact Scene aggregate构成最小充分边界，必须在review中记录未运行范围。

## Manual visual gate

Architecture review通过后才能请求project owner gate。Direct Test至少提供：

- Globe/Planar并列的day/sunset/night与ground/air/120 km high presets；
- independent atmosphere、aerial、height fog开关和全部A3数值控制；
- identity/background/aerial/fog-only/combined诊断，报告`L1`、`max`、changed pixels、mean changed delta和lower-center ground ROI mean；
- known-depth near/far geometry区域，证明default fog随distance增强而不是全屏constant overlay；
- high looking-down ray穿层可见、未穿层identity，以及Perspective/Orthographic切换；
- default ground/day fog-only full-frame和ROI mean均满足`0 < mean <= 24`，同时保留surface albedo和far-distance cue。

项目负责人视觉判断优先于数值下限。Gate失败时A3保持active并在当前phase内rework；不得checkpoint或进入A4。

## Exit criteria

- ADR-0045 public/optical/authority/resource contract全部有源码、Specs与package evidence，Globe/planar representative views均通过。
- Architecture/code review无blocking finding，所有finding写回同一review文档并关闭。
- Project owner manual visual gate明确通过。
- Architecture Agent把A3 code、Specs、ADR/doc updates形成独立本地checkpoint；不push。
- 只有上述全部完成后才能规划A4 volumetric cloud core。

## Stop conditions and handoff

出现ADR-0045任一停止条件、需要新upstream seam/FBO/texture、无法在16-sample budget内满足Globe积分误差、或默认效果washout时，Execution立即
停止并提交discussion/review evidence。正常完成时也必须保持working tree uncommitted/unpushed，不请求owner gate、不激活A4；仅发送
`review_ready`给Architecture Agent。
