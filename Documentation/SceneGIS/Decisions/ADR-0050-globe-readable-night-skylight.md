# ADR-0050：Globe Readable Night Skylight

## 状态

- Status：`accepted; A9-G complete`
- Date：`2026-09-02`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-09-02-phase-a9g-globe-readable-night-skylight.md`
- Related patches：active `SGP-0008`、active `SGP-0009`，均unchanged/consume-only
- Builds on：ADR-0040、ADR-0041、ADR-0045、ADR-0046、ADR-0047、ADR-0048

## 上下文

A8-G冻结的Globe stack以Bruneton physical Sun/sky照亮terrain、cloud与ambient
participating media。夜间物理源衰减后，natural terrain和cloud趋近黑色，而Models/
3D Tiles仍走Cesium PBR/IBL路径，因此可能保持可见。用fullscreen后处理抬升黑位或
强行统一resolved geometry会破坏HDR/source ownership，也会越过ADR-0047只允许
Globe surface消费SceneGIS irradiance的边界。

项目负责人决定先解决Globe natural environment，并只保留一种`readable`夜景。
Moon、phase/shadow、stars、emissive city content、local lights、auto exposure、
Models/3D Tiles和Planar均不在本阶段。

## 决策

### 单一固定source

A9-G在A2 physical irradiance/source domain增加一个固定、directionless、blue-gray
hemispherical source：

```glsl
const vec3 SCENEGIS_READABLE_NIGHT_SKY_IRRADIANCE =
    vec3(0.020, 0.036, 0.060);
```

这是engine-readable fill，不宣称physical moonlight。它不增加public property、
toggle、color、intensity、mode或style；existing `surfaceRadianceScale`、
`cloudRadianceScale`及fog source calibration继续在各自既有边界映射scene-linear
radiance。

### Local solar transition

每个receiver/sample从其actual Globe radial up与existing ECEF Sun direction计算：

```glsl
float nightFactor = 1.0 - smoothstep(
    -0.2079116908,
    -0.1045284633,
    dot(radialUp, sunDirection));
```

两条边界分别是`sin(-12 degrees)`和`sin(-6 degrees)`。Local solar elevation
`>= -6 degrees`时A9 contribution exact zero；`<= -12 degrees`时为full source；
中间仅使用一次cubic smoothstep。不得使用camera position/pitch、Test label、全局
单点solar elevation或screen coordinate作为transition authority。这样terminator
随Globe空间位置变化，但固定time/world point的lighting不随相机变化。

### Consumer semantics

- Globe surface在Lambertian reflection前把night source加入sky irradiance，并复用
  existing `0.5 * (1 + dot(normal, radialUp))` hemisphere orientation、`albedo/pi`
  与`surfaceRadianceScale`。Beer atlas只attenuate direct Sun，不attenuate night sky。
- Globe cloud body在existing sky-irradiance domain加入同一source，再进入current
  `1/(4*pi)` angular source、height gradient、phase/multiple scattering与
  `cloudRadianceScale`。不得在final cloud RGB追加fill。
- Cloud ground bounce以existing ground lookup position和surface orientation消费
  同一source；cloud-local haze在existing scalar sky authority消费同一source。
- Globe height fog只把night source加入ambient input。Directional source、forward
  lobe和A5 shadow fraction仍只消费attenuated physical Sun。

Background atmosphere/aerial radiance、Sun disk、cloud shadow production、
crepuscular rays、Bloom/lens、tone mapping和exposure完全不变。Night source不是
directional light，不产生新shadow或ray。

### Ownership and lifecycle

固定source与factor helper位于SceneGIS-owned shader source。`SGP-0009`已提供所需
Sun direction、LUT和surface scale，因此A9不增加FrameState field、uniform、JS
state、history compatibility key或upstream hunk。A9资源增量必须为零：zero program
category、command、texture、FBO、history、readback、asset、request、dependency和
GPU bytes。Planar compile可看到shared declaration，但不得调用或改变output。

## 后果

- Globe natural terrain、cloud与ambient fog在night保持低亮度cool readability，
  day/civil twilight above `-6 degrees` exact unchanged。
- Background sky仍是A2 physical atmosphere；A9不伪造stars或blue sky dome。Night
  terrain可读而sky保持黑暗是本阶段允许的结果。
- Models/3D Tiles不被SceneGIS fullscreen relight；其night差异留给独立PBR/IBL或
  content-emissive design。
- A9不改变public API、resource budget、A6/A8 histories、A5 Beer semantics、
  upstream-owned path、SGP或Planar behavior。

## 最小验收

- Actual-GPU evidence覆盖`-6/-12 degree`边界、day exact identity、night terrain/
  cloud/fog ambient、Beer independence、finite RGBA16F storage和Planar identity。
- Source audit确认所有night contribution在ambient/irradiance domain只加入一次，
  directional Sun/rays/shadows不变。
- Direct Test只增加一个固定Globe readable-night observation，不增加style switch、
  sweep、retry、hash、convergence或automatic acceptance metric。
- Architecture code review通过后，由项目负责人判断dark-but-readable terrain、
  cloud thickness、fog balance、camera invariance和无terminator/horizon artifact。

## 执行记录（2026-09-02）

A9-G按本ADR实现为一个shared SceneGIS shader helper，并在Globe terrain、cloud
body、ground bounce、cloud-local haze与height-fog ambient的existing source domain
各消费一次。没有新增uniform、JS state、resource、final-color lift或directional
source；Planar不调用该helper。

聚焦actual-GPU fixture在Chrome 152通过`1/1`，覆盖factor边界、night terrain/cloud/
fog ambient、Beer independence、day/Planar exact identity与RGBA16F storage safety。
固定15E/45N观察在`2026-06-21T22:00:00Z`测得Sun `-20.120 degrees`，页面为
`ready · HDR`且browser/render errors为`0`。Architecture review与owner visual gate
仍待后续明确结论。

## Architecture review（2026-09-02）

Architecture逐项确认fixed helper与五个ambient/irradiance consumer没有重复source、
final-RGB lift、directional/Beer coupling或camera authority。独立production GPU
fixture=`1/1 SUCCESS`；upstream audit current delivery entries=`0`、generated
status=`0`，focused lint/format/diff checks均通过。固定Sun `-20.120 degrees`页面
保持`ready · HDR`且browser warnings/errors=`0`，未见bright-blue veil、viewport-wide
fill或seam。Code gate已批准；night readability与cloud/terrain contrast留给项目负责人
人工gate。

## A9-AR-001 owner calibration（2026-09-02）

首个owner gate只拒绝absolute night-fill magnitude：画面仍过暗。Blue-gray ratio、
local `-6/-12 degree` transition、五个ambient consumer及所有resource/source边界均
已接受并冻结。Fixed private source校正为exact 2x：

```glsl
const vec3 SCENEGIS_READABLE_NIGHT_SKY_IRRADIANCE =
    vec3(0.020, 0.036, 0.060);
```

本修订不增加public intensity/style，不改变day/Planar identity、directional Sun、
Beer、fog directionality、background、exposure、resource、upstream或SGP。禁止继续
parameter sweep；同一fixed night state完成一次owner re-gate。

### A9-AR-001 执行记录

Execution已将shared private source更新为上述exact 2x值，并仅同步existing GPU
fixture的constant authority。Focused production fixture在Chrome 152上`1/1`
通过；day/Planar exact identity、Beer independence、ambient-only fog和finite
storage保持不变。同一15E/45N、`2026-06-21T22:00:00Z` fixed observation为
`ready · HDR`、Sun `-20.120 degrees`、browser/render errors `0`；最终亮度继续由
owner视觉判断。

### A9-AR-001 Architecture closure

Architecture确认exact corrected constant、local solar transition与五个consumer
边界一致，并独立复跑production GPU fixture=`1/1 SUCCESS`。同一fixed browser
state保持`ready · HDR`、Sun `-20.120 degrees`、warnings/errors=`0`；未见
viewport-wide fill或seam。`A9-AR-001`关闭并重新开放owner visual gate；该复审不
推断owner接受。

### Project-owner acceptance

项目负责人检查exact 2x fixed night state后明确接受当前亮度。A9-G owner visual
gate通过，Architecture findings全部关闭；本决定的source、transition、consumer与
边界成为A9-G冻结基线。

## P4 Planar amendment（2026-09-12）

P3 checkpoint后，将上述fixed source与transition用于Planar。此前Planar不调用helper
的限制由本修订替代；Globe分支保持不变。Planar以fixed `vec3(0,0,1)`为up，消费
显式world Sun direction，不依赖camera、CRS、经纬度或虚拟球面。

Source仅进入三个既有ambient入口：P2地表/模型shared sky irradiance、Planar cloud
incident sky、height-fog ambient。Cloud入口保留既有solar-normalized radiometry，
先加入canonical night irradiance，再除以solar RGB。地表沿用normal hemisphere、
albedo/pi和surfaceRadianceScale；高度仍为absolute Z，60 km以上既有sky cutoff不变。

不改变direct Sun、Beer、geometry shadow控制、fog directional、background/aerial、
HDR、调用方model lightColor/SH/emissive；不增加API、uniform、asset、resource、history、
pass或GPU bytes。Moon显示与directional moonlight后续独立适配。复用SGP-0008和SGP-0010，
本阶段不修改upstream-owned文件。

以actual-GPU Planar source/consumer、day identity、native PBR与Globe回归，加上代理验收
day/twilight/night可复现画面为本阶段gate。用户已授权代理视觉验收及阶段间持续推进。

## Globe irradiance-driven successor (2026-10-17)

[ADR-0167](ADR-0167-globe-night-ambient-irradiance.md) replaces the Globe fixed
solar-angle transition with a configurable irradiance floor. Its default preserves
the accepted deep-night RGB source. The approved Planar amendment extends this
replacement to P4 ambient consumers; Moon directional lighting retains ADR-0053. The old fixed-source/no-property rules above
remain historical rather than constraints on the approved Globe successor.
