# ADR-0050：Globe Readable Night Skylight

## 状态

- Status：`accepted; A9-G active`
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
    vec3(0.010, 0.018, 0.030);
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
