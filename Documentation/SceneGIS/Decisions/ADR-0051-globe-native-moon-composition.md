# ADR-0051：Globe Native Moon Composition

## 状态

- Status：`accepted; A10-G complete; owner gate passed`
- Date：`2026-09-02`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-09-02-phase-a10g-globe-native-moon-composition.md`
- Related patch：active `SGP-0008`，same `Scene.js` path
- Builds on：ADR-0040、ADR-0041、ADR-0046、ADR-0048、ADR-0049、ADR-0050

## 上下文

Cesium的WGS84/default-skybox Viewer已经创建caller-owned native `Moon`。该对象
使用`Simon1994PlanetaryPositions`、`IauOrientationAxes`、`Ellipsoid.MOON`、
`Assets/Textures/moonSmall.jpg`和`onlySunLighting=true`提供位置、朝向、物理角尺寸、
月面纹理与Sun-lit phase；`Scene.updateEnvironment`又提供culling与Globe occlusion。

SceneGIS advanced environment过去把native Moon视为double-energy conflict并要求
`show=false`。直接放开guard仍不够：Cesium先执行Moon command，既有`SGP-0008`
随后绘制opaque advanced background，Moon会被覆盖。

## 决定

### Authority

A10-G直接复用caller-owned `scene.moon`。SceneGIS controller不创建、不复制、不替换、
不销毁、不隐藏也不恢复Moon。应用继续通过native `scene.moon.show`控制可见性；A10不
增加`SceneGISEnvironmentEffects.showMoon`。

### Render order

复用既有`SGP-0008`并只移动同一advanced-background调用：从native Moon/panorama
之后移动到native Moon之前。Active Globe顺序固定为advanced background → native
Moon → panorama/primary-world environment → ordinary geometry → SceneGIS pre-tone-mapping
HDR composition。

Moon command仍由`Scene.updateEnvironment`产生、由existing culling/occluder决定可见性，
并在environment pass中exact-once执行。没有active advanced pipeline时，SGP调用是no-op，
Moon相对Sun与panorama的native顺序不变。

### Conflict policy

Globe advanced validator只移除visible native `scene.moon`这一项。Native
`SkyAtmosphere`、SkyBox、Sun、Sun bloom、built-in bloom、Fog、ground atmosphere与
Globe lighting继续在任何asset/GPU mutation前fail closed。Planar native Moon guard
保持不变。

### Lighting and optical composition

Native Moon保留`onlySunLighting=true`与Cesium phase shading。A9 fixed readable-night
irradiance继续是terrain/cloud/fog的唯一night illumination；A10不把Moon方向写入
`scene.light`，不增加directional moonlight或Moon shadow。Moon先进入resolved scene
color，后续既有clear-depth/cloud/fog/HDR路径可按其既有规则遮挡或合成，不新增Moon
专用branch。

### Resource and upgrade boundary

A10增加zero SceneGIS program/command/texture/FBO/history/readback/asset/request/GPU byte。
Native Moon可能激活其既有`EllipsoidPrimitive`、texture和renderer-cache资源，但ownership
仍完全属于Cesium/native object。Upstream-owned delta限于
`packages/engine/Source/Scene/Scene.js`的existing `SGP-0008`；不得新增SGP或修改其他
upstream-owned path。`SGP-0008` removal condition继续是upstream提供等价的advanced
background/HDR extension slots与明确celestial ordering。

## 验证

- Existing advanced render-slot Spec原位增加Moon command witness，证明active order为
  background → Moon → primary world → geometry，Moon exact-once，inactive/detached identity
  不变。
- Existing SceneGIS environment Spec证明visible caller-owned Globe Moon被接受，其他native
  conflicts仍在fetch/attachment前失败，Planar Moon rejection不变。
- Cesium现有`MoonSpec`继续作为native position/texture/show/destroy行为authority；A10不
  复制其测试矩阵。
- Direct Test增加一个固定15E/45N、500 m、`2026-06-21T22:00:00Z` Moon observation并
  通过same Cesium ephemeris对准camera；project-owner判断body、phase、horizon/terrain
  occlusion与cloud interaction。

## 后果

- Globe advanced night可以显示Cesium原生Moon，而不建立第二天体authority。
- Native Moon texture与phase质量受Cesium原实现约束；若未来需要更高分辨率asset或
  directional moonlight，必须建立独立phase/ADR与resource/radiometry budget。
- Planar仍只使用其SceneGIS procedural celestial-body contract，不继承Earth native Moon。

## 执行记录（2026-09-02）

Execution复用existing `SGP-0008`并将同一advanced-background invocation移动到
unchanged native Moon block之前；Moon command仍exact-once。Focused render-slot=
`5/5`、private pipeline=`7/7`，Globe Moon acceptance、remaining conflict和Planar
Moon rejection witnesses各=`1/1`。Upstream audit确认current-delivery upstream
path仅`Scene.js`、generated=`0`、new SGP=`0`，SceneGIS resource/API delta=`0`。
Fixed direct observation从same Cesium ephemeris得到azimuth `257.917 degrees`、
elevation `7.443 degrees`，native Sun-lit phase可见且browser/render errors=`0`；
owner acceptance未推断。

## Architecture复审（2026-09-02）

Architecture独立确认existing paired `SGP-0008`完整移动到unchanged native Moon
block之前，Moon command继续exact-once并保持caller-owned。Globe只移除Moon conflict；
Planar与其余native conflict继续fail closed。`packages/engine` production focused
render-slot=`5/5`、Globe Moon acceptance=`1/1`、Planar Moon rejection=`1/1`；
upstream audit确认current-delivery upstream path仅`Scene.js`、existing
`SGP-0008`、generated=`0`、new SGP=`0`，SceneGIS resource/API delta=`0`。

Fresh fixed browser observation显示native textured crescent位于terrain horizon上方，
azimuth=`257.917 degrees`、elevation=`7.443 degrees`、Sun=`-20.120 degrees`，
页面保持`ready · HDR`且browser/render warning/error=`0`。一次existing cloud control
检查确认Moon继续进入normal cloud/HDR composition，随后页面恢复clouds-off固定态。
Code gate已通过；texture/phase观感、physical angular footprint以及interactive
terrain/cloud occlusion仍由project owner判断，不推断acceptance。

## Project-owner验收（2026-09-02）

Project owner已检查prepared native Moon result并明确报告通过。A10-G至此完成，
Architecture finding=`0`。包含本记录的phase-closing local commit是A10-G独立、
未push的checkpoint；该结论不激活moonlight、Moon shadow、alternate Moon asset、
Planar behavior或successor phase。
