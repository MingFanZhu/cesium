# ADR-0053：Globe Moonlight, Directional Shadows, and Lunar Surface

## 状态

- Status：`accepted; A11-G completed; owner visual gate passed 2026-09-04`
- Date：`2026-09-02`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-09-02-phase-a11g-globe-moonlight-shadow-surface.md`
- Related patches：active `SGP-0008`（consume only）、active `SGP-0009`
  （reuse existing Globe surface-lighting seam）
- Builds on：ADR-0047、ADR-0048、ADR-0050、ADR-0051
- Frozen predecessor：A10-G
  `6afba87af181f3cdb7a20aff09b81af11eb302f4`

## 上下文

A9-G提供固定`readable` blue-gray night ambient，A10-G让caller-owned native
`scene.moon`按Cesium的Simon1994星历、IAU orientation、Sun-lit phase与Globe
occlusion正确合成。它们没有改变`scene.light`，所以Models与3D Tiles夜间仍消费
native `SunLight`；Globe surface没有方向月光，Cesium native `scene.shadowMap`也未启用。
现有`256 x 128` `moonSmall.jpg`只能提供低分辨率月面。

Cesium 1.144只有一个scene-wide light和一个native cascaded `ShadowMap`。当
`scene.light`是`DirectionalLight`时，UniformState与native shadow camera都消费其
world direction；Globe、3D Tiles与Models已有cast/receive derived-command路径。
因此A11-G不应复制geometry shadow renderer。A5 Beer atlas继续负责volumetric-cloud
transmittance；native ShadowMap负责terrain/3D Tiles/models geometry occlusion。

Pinned `three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`
提供NASA CGI Moon Kit `2048 x 1024` `color_large.webp`。该源文件为
`213446` bytes，SHA-256为
`1709ba3b65991842cd84a8d338ef46ad942241ee056b1ac8aad0d3776edf7dbd`；
来源记录要求NASA credit与NASA Images and Media Usage Guidelines。Reference还使用
displacement texture与自定义Moon shader，但Cesium native `Moon`没有public normal/
displacement material contract。

## 决定

### Celestial authority

A11-G保留actual ECEF Sun direction作为atmosphere background、aerial scattering、
native Moon phase与A7 Sun lens authority。新增一个Globe-only primary directional-light
authority供surface、cloud directional transport、A5 Beer atlas/rays与native scene light
消费。

Moon ECEF position必须由与native Moon相同的
`Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame`和
`Transforms.computeIcrfToCentralBodyFixedMatrix`得到。Observer-to-Moon direction从
current geodetic surface position指向该position；它不读取camera view/right/up，因此
camera pitch/heading变化不得改变world light或shadow direction。Camera跨地理位置移动
只允许产生真实topocentric变化。

Readable Moon strength使用以下单一风格，不增加physical/readable mode：

- A9同一local Sun transition在`-6 degrees`为0、`-12 degrees`为1；
- Moon horizon factor从`0 degrees`到`3 degrees`平滑进入；
- phase使用Lambert-sphere phase function，full Moon为1、new Moon为0；
- fixed full-phase readable source为`vec3(0.12, 0.16, 0.22)`，再乘public
  `moonlightIntensity`；reference `2.5e-6` physical brightness ratio只作为来源事实，
  不在当前fixed-exposure readable product中直接使用。

Primary direction是day Sun与night Moon source的finite irradiance-weighted normalized
sum；零能量时保留最后一个finite direction但发布zero intensity。Day端必须精确保留
captured/default `SunLight` color与intensity，full night端必须精确使用Moon direction与
readable source。Actual Sun、Moon position、phase、night/horizon factors和primary result
每帧只能计算一次并在existing renderer/frame record内共享；不得建立camera-derived第二
authority。

### Lighting consumers

- Globe surface在existing `SGP-0009` branch中增加Lambertian direct Moon term，并与
  A9 ambient、A2 Sun/sky和A5 Beer transmittance按同一linear-HDR顺序合成。
- Globe cloud directional lighting、A5 Beer atlas与crepuscular directional source在
  night transition后消费同一primary direction/energy；day behavior必须bitwise或
  half-float-equivalent保持existing Sun authority。不增加第二次Moon raymarch或第二
  Beer atlas。
- `scene.light`使用一个controller-owned stable `DirectionalLight`，in-place更新direction、
  color与intensity，使Models与3D Tiles获得同一day/night primary light。不得逐帧替换
  light object或同时伪造two-light Cesium path。
- Physical background atmosphere/aerial Sun scattering、native Moon body lighting、A7
  Sun gate与tone mapping不改为Moon source。A9 ambient在无月夜继续提供readability。

Public Globe controls为`showMoonlight=true`、`showMoonShadows=true`和
`moonlightIntensity=1.0`（inclusive `[0,64]` relative multiplier）。Setters只
`requestRender`；它们不得重建A2-A7 resources或invalidate A6 cloud history。Planar对
这三个property保持exact bypass。

### Native geometry shadows

A11-G只复用caller Scene已拥有的`scene.shadowMap`。当Moon contribution为positive且
`showMoonlight && showMoonShadows`时，controller暂时设置
`scene.shadowMap.enabled=true`和`scene.globe.shadows=ShadowMode.ENABLED`；native
per-primitive/tileset `ShadowMode`继续由caller控制。该map的light camera自动消费stable
`DirectionalLight.direction`，因此terrain、3D Tiles与Models共享Cesium native cast/
receive path。

Moon contribution为zero、toggle关闭、controller disabled/disconnected时，恢复各自
captured value。不得创建第二`ShadowMap`、copy cascade shader、修改primitive/tileset
collection或把A5 Beer atlas解释为geometry depth shadow。

### Ownership and fail-closed lifecycle

Globe A11 activation在任何mutation前继续完成existing conflict/capability validation，并
额外拒绝active non-`SunLight` caller light。Controller按一个lifecycle snapshot：

- caller `scene.light` identity；
- `scene.shadowMap.enabled`；
- `scene.globe.shadows`；
- defined native `scene.moon.textureUrl`。

Controller只恢复自己实际改变且仍由其拥有的object/property。Active期间外部替换
`scene.light`或修改owned shadow/texture state进入existing `errorEvent` fail-closed path，
不得静默重写。Re-enable重新capture。`scene.moon.show`、Moon object identity、ellipsoid、
orientation、`onlySunLighting`与destroy ownership始终caller/native-owned。

### Lunar surface asset

Tracked SceneGIS Moon asset是pinned reference `color_large.webp`的exact copy，放入
`packages/engine/Source/Assets/SceneGIS/Environment/Moon/`，并附canonical provenance
与NASA notice。Importer必须验证source/output hash、dimensions、bytes、commit和notice，
installed-package verifier必须验证engine/root delivery。

Active Globe controller只把defined native `scene.moon.textureUrl`切换到
`buildModuleUrl`生成的packaged URL，并在release lifecycle恢复原值。Cesium native
Moon material继续拥有decoded texture和GPU lifecycle。A11不导入displacement/normal
asset，不修改Moon primitive/material shader，不改变physical ellipsoid或angular size。

### Upgrade and upstream boundary

新增Moon direction/primary-light uniforms属于SceneGIS-owned renderer/shaders。Globe
surface新增uniform只扩展existing `GlobeSurfaceTileProvider.js` `SGP-0009` hunk；
`GlobeSurfaceShaderSet.js`、`GlobeFS.glsl`、`Scene.js`与`SGP-0008`不需要新改动。
`.scenegis/upstream-patches.json`把SGP-0009 governing decision更新为ADR-0053；
upstream path count仍为3、new SGP count为0。Generated shader modules与Build输出不得
手工编辑或提交。

## 验证

- Constructor/API fixture覆盖三个new controls的default、range、request-render与A6 history
  identity；Planar runtime保持exact bypass。
- Lifecycle fixture覆盖prior false/true shadow state、prior Moon texture、stable light identity、
  day/night in-place update、disable/disconnect restore、re-enable fresh capture与external
  mutation fail-closed。
- Actual-GPU fixture在fixed full-Moon night证明surface/cloud direct Moon contribution、phase/
  horizon zero endpoints、finite RGBA16F和day source identity；compiled same-camera-direction
  mutation必须失败。
- Native-shadow witness使用一个fixed caster/receiver state证明shadow world position在仅改变
  camera pitch/heading时保持不变，time变化才允许移动；同一native map publication覆盖
  Globe、3D Tiles/Model shadow flags。
- Asset importer、exact provenance/hash/dimensions、dev/release/installed package与native
  Moon texture load得到直接证据。
- Direct Globe page提供一个15E/45N、500 m、`2026-07-02T00:00:00Z`固定观察；source
  discovery计算该状态Sun约`-20.67 degrees`、Moon约`22.28 degrees`、illuminated fraction
  约`0.963`。Owner判断月面、cloud/terrain/3D Tiles/model lighting与camera-rotation shadow
  stability；自动证据不得替代视觉gate。

## 后果

- Globe夜景得到一个camera-independent primary Moon light、native geometry shadows与高分辨率
  月面，同时保留A9无月夜readability和A10 native body authority。
- A11会激活Cesium已有native ShadowMap GPU attachment/cascade commands与更大的native Moon
  texture；Execution必须报告实测native resource delta，但这些资源不转移给SceneGIS。
- Lunar displacement/normal relief、eclipse、stars/Milky Way、local artificial lights、city
  emissive、auto exposure与Planar celestial adaptation仍需后续独立phase。

## 执行记录（2026-09-02）

Implementation按本ADR完成：一个camera-independent primary record驱动Globe surface、
cloud、A5 Beer atlas/rays与stable native `DirectionalLight`；actual Sun仍独立驱动
atmosphere、native Moon phase和A7 lens gate。Controller只获取并恢复自己改变的light、
native shadow开关、Globe `ShadowMode`与Moon texture URL。Moon packaged URL延迟到Globe
activation时解析，bare Node/CJS import不再触发DOM base-URL发现。

Pinned Moon payload精确为`2048 x 1024`、`213446` bytes及既定SHA-256，且随engine/root
package交付provenance、NASA notice与MIT license。SceneGIS-owned pass/program/FBO/
texture/history delta为0；运行时只激活Scene已有native four-cascade ShadowMap（默认
`4096 x 4096` depth-stencil atlas，约`67,108,864` bytes）及native Moon所拥有的
`8,388,608` byte decoded RGBA color texture。

Focused controller `75/75`、A1 `7/7`、importer `2/2`、TypeScript、release build、
installed-package/provenance verifier与upstream audit均通过。唯一fixed browser observation
为`ready · HDR`、Moon `21.467 degrees`、Sun `-20.763 degrees`、errors `0`，并同时看到
native Moon与bounded local caster/receiver。该记录不替代Architecture review或owner视觉
验收。

## 评审修正执行记录（2026-09-02）

A11-AR-001..005修正保持本ADR资源/API边界不变。Sun/Moon phase统一在Earth-fixed frame，
固定状态Lambert phase为`0.9326044744950956`，旧mixed-frame mutation为
`0.29384491398532053`。Controller current `time`在asset loading阶段即更新stable
DirectionalLight；renderer后续pass沿用该current authority。

Beer atlas producer、cloud body与SGP-0009 surface receiver统一使用
`primaryLightDirection`，actual Sun仍单独服务physical sky。Moon object/URL、light、native
shadow enable与Globe ShadowMode采用identity/value-guarded release，external replacement或
mutation fail-closed且不会被release覆盖。

Compiled night surface/cloud、day identity、real Beer producer/receiver及一个native Model
caster/Primitive receiver均通过。Camera-only rotation保持shadowed receiver pixel exact；time
change保留同一Scene-owned ShadowMap但允许primary direction变化。最终controller
`79/79`、A1 `7/7`、TypeScript与upstream audit通过；current-delivery upstream-owned仍仅
existing SGP-0009 path，generated=`0`、new SGP=`0`、SceneGIS resource/API/Planar delta=`0`。

## 最终评审修正执行（2026-09-02）

SGP-0009 surface seam进一步明确拆分actual Sun与primary light：physical Bruneton sky和A9
night ambient只使用actual Sun；direct irradiance与A5 Beer receiver只使用primary light。
该拆分不改变frame-local protocol、资源或API数量。

生命周期证据分别变更light、Moon、`shadowMap.enabled`与`globe.shadows`，每个路径独立
fail-closed，release只恢复controller-owned identity/value。Moon horizon endpoint证明below
horizon为零，固定`21.467 degrees`时factor为一。Native Model/Primitive witness在同一
receiver和同一Scene ShadowMap下使用两个不同camera position/direction，两个视角均区分
caster disabled/enabled。

最终focused结果为primary/lifecycle `1/1`、night/native shadow `1/1`、Beer atlas `1/1`、
controller `76/76`、A1 `7/7`与TypeScript exit `0`。唯一刷新后browser witness为
`ready · HDR`、Moon `21.467 degrees`、Sun `-20.763 degrees`、errors `0`；其使用可重建
local caster/receiver，不依赖恢复刷新前的cloud-shadow位置。

## A11-AR-006隔离fixture修正（2026-09-02）

Existing lifecycle Spec在A11首次activation前显式安装deterministic caller-owned native
`Moon`及caller URL，消除bare Spec Scene中`scene.moon`缺失导致的test-order依赖；原有
ownership、independent mutation、fail-closed与release assertions保持不变。Exact isolated
lifecycle filter与compiled night/native-shadow filter均为`1/1 SUCCESS`，final controller为
`78/78 SUCCESS`。该修正仅影响既有Spec，无product/resource/API/browser/Planar/upstream/SGP
delta。

## A11-AR-006/007最终执行（2026-09-02）

Lifecycle fixture的test-local deferred resource authority在initial eight requests之后继续返回
pending promise，使每次re-acquisition独立到达light、Moon、ShadowMap与Globe ShadowMode
fail-closed contract；exact isolated result为`1/1 SUCCESS`。

A11低角度Moon暴露了此前frozen A5/A8 Beer producer geometry defect：producer ray在cloud
top径向外100 km开始，却把相同200 km同时作为approach与useful traversal cap。最终实现把
ray origin直接置于Sun-facing cloud-top shell，200 km只约束useful in-shell traversal。
Global ECEF lattice、primary direction、three cascades、atlas/resource、receiver与history
protocol均保持不变。

Amended actual-GPU atlas fixture保留high-Sun authority，并在fixed Sun
`27.019736617450597 degrees`和Moon `21.467 degrees`证明finite positive atlas、receiver optical depth及
packed crepuscular length；旧inflated-origin mutation在low-Sun endpoint确定性返回零。
Final results为lifecycle `1/1`、Beer atlas `1/1`、compiled night/native shadow `1/1`与
controller `79/79`。Bounded browser check在existing 2.175-degree low-Sun与fixed A11 Moon
state均为`ready · HDR`、errors `0`，不替代owner visual judgment。

Low-Sun endpoint固定为`2026-06-21T16:00:00Z`；compiled product在15E/45N的实际仰角为
`27.019736617450597 degrees`。此前`26.725 degrees`仅为stale evidence label，本次校正不
改变below-30-degree state或任何product source。
