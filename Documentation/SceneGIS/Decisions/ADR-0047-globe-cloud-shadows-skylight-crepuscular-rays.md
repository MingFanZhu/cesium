# ADR-0047：Globe Cloud Shadows, Skylight, and Crepuscular Rays

## 状态

- Status：`accepted for A5-G implementation`
- Date：`2026-08-28`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md`
- Related patch：active `SGP-0008`（consume only）、proposed `SGP-0009`
- Builds on：ADR-0040、ADR-0041、ADR-0045、ADR-0046

## 上下文

A4-G已经完成Globe reference-first volumetric cloud core，但云只参与自身lighting与resolved HDR composite。地表尚未消费
atmosphere irradiance或cloud optical-depth shadow，aerial/fog也没有Sun-to-view segment的cloud shadow length，因此缺少云影、统一天光和
crepuscular rays。

固定参考实现的Beer Shadow Map（BSM）使用cloud density得到光学深度，而Cesium native `ShadowMap`面向geometry depth与derived command。
两者不是同一种visibility authority。参考实现还使用temporal Beer shadow、PBO和raw WebGL路径；这些容器机制不符合SceneGIS的resource
ownership与A6 temporal边界。另一方面，参考实现通过Bruneton `GetSkyRadianceToPoint`的`shadow_length`参数生成物理体积光，说明无需增加
screen-space radial blur或第二层haze。

Cesium `GlobeFS.glsl`在imagery/material合成后、native lighting选择处仍持有可解释为Globe surface base reflectance的`color`。这是本阶段唯一获准
消费SceneGIS Sun/sky irradiance的scene surface。resolved scene color已经包含Models、3D Tiles与其他primitive的Cesium lighting，不能在
fullscreen composite中再次统一relight。

## 决策

### Public contract

`SceneGISEnvironmentEffects`增加两个writable boolean option/property：

| Property              | Default | Meaning                                                              |
| --------------------- | ------: | -------------------------------------------------------------------- |
| `showCloudShadows`    |  `true` | `showClouds`时用Beer optical depth衰减Globe surface的direct Sun      |
| `showCrepuscularRays` |  `true` | `showClouds`时把equivalent cloud shadow length传入atmosphere/fog积分 |

不增加`showSkylight`。当advanced Globe controller `enabled && ready`时，Globe surface Sun+sky lighting是A5-G固有能力；
`showAtmosphere`继续只控制既有sky/aerial可见分量，不建立第二套irradiance authority。`showCloudShadows`和
`showCrepuscularRays`只控制cloud对该lighting的影响。Global `enabled=false`仍保持Cesium原始画面与零A5资源。

Setter遵守既有warm-property规则：值实际变化且controller已连接、active时只`requestRender`并失效相关frame/history state，不得同步创建资源或编译
program。`showClouds=false`时两个cloud coupling均为identity。

### Beer Shadow Map owner and budget

A5-G使用一个SceneGIS-owned current-frame BSM atlas：

- one `RGBA16F` color texture、one framebuffer、one shader program；无depth attachment、无history；
- 2×2 tile atlas，low为2 cascades × 256（512² atlas），medium为3 × 256（512² atlas），high为3 × 512（1024² atlas）；
- persistent texture bytes固定为low/medium `2,097,152`、high `8,388,608`；
- practical split lambda=`0.5`，camera shadow distance最多`200000 m`；支持Perspective与Orthographic frustum；
- low shadow march=`25` steps，medium/high=`50`，program使用统一最大50步与runtime count，不建立quality shader variants；
- 每个需要BSM的rendered Globe frame在advanced background slot内、sky/cloud consumer之前执行最多3个atlas tile commands；
- primary与Sun density必须复用A4-G Globe cloud material、preset、time、asset与geodetic-normal/local-ENU anchor。

Cascade使用camera frustum split corners建立local-ENU light-space orthographic bounds，覆盖cloud shell并把XY投影按tile texel snap。不得用ECEF大数值
直接构造float shader matrix。Atlas channel契约沿用reference topology：R=`frontDepth`（m）、G=`meanExtinction`（m⁻¹）、
B=`maxOpticalDepth`、A=`tail`；ground receiver使用`min(B, G * max(0, distanceToTop - R))`恢复bounded optical depth并执行
Beer-Lambert transmittance。Cascade overlap只做bounded PCF/blend，不创建独立temporal stabilization。

### Globe surface lighting seam

Renderer在Globe surface command构建之前的pipeline update中，于当前`FrameState`发布一个显式、frame-local、read-only SceneGIS Globe lighting
record；只有candidate resources ready后才可标记active，inactive frame必须不存在或明确inactive。Atlas commands随后在advanced background slot执行，
Globe uniform callbacks在surface draw时读取同一帧已完成的atlas。禁止
prototype patch、implicit global与load-order dispatch。`GlobeSurfaceShaderSet`只在该record active时选择一个新的SceneGIS surface shader variant，
使用现有最高位之后的`0x400000000` flag并注入SceneGIS-owned Bruneton/surface helper source；`GlobeSurfaceTileProvider`只增加读取该record的uniform
callbacks；`GlobeFS.glsl`只在native final
lighting selection处增加一个互斥SceneGIS branch。这个最小上游接缝登记为`SGP-0009`。

SceneGIS branch把imagery/material后的`color.rgb`作为Lambertian albedo，计算：

```text
surfaceRadiance = albedo / PI *
  (sunIrradiance * max(dot(normal, sunDirection), 0) * cloudTransmittance
   + skyIrradiance)
```

Sun与sky来自同一个A2 transmittance/irradiance LUT和current Sun authority；cloud shadow只衰减direct Sun，不能压暗sky irradiance。优先使用terrain
normal；无terrain normal时使用ellipsoid geodetic normal。position/normal转换复用A4-G local ENU和virtual Bruneton sphere映射。

SceneGIS surface lighting与Cesium native `globe.enableLighting`互斥；冲突必须在任何A5 resource mutation前fail closed。Models、3D Tiles、water/terrain
material topology和其他primitive继续使用Cesium现有路径；A5-G不对resolved scene color做通用relighting，也不接管`scene.light`。

### Crepuscular shadow-length transport

Cloud low-resolution pass沿view ray采样同一BSM并积累equivalent `shadowLength`：

```text
shadowLength += (1 - exp(-cloudOpticalDepth)) * stepLength * attenuation
```

长度范围固定为`[0, 200000] m`。不得增加第三Cloud MRT attachment或第二套history。现有distance attachment的alpha在rays启用时复用为
cloud-validity与10-bit shadow-length的half-float-exact编码：

```text
code = round(clamp(shadowLength / 200000, 0, 1) * 1023)
packed = valid ? 1 - code / 2048 : code / 2048
```

因此`shadowLength=0`保留旧validity alpha的exact `0/1`。Resolve/history必须先逐sample解码validity和length，分别执行既有semantic selection/filter，
再repack；不得直接平均packed bits。切换rays或影响BSM的cloud参数时复用既有cloud-history invalidation，不新增shadow history。

解码后的length进入Globe `GetSkyRadianceToPoint`，覆盖finite geometry、cloud atmosphere与rays-enabled clear sky；A3 height fog只把相同length作用于
directional Sun inscatter，ambient/sky fog保持不变。`shadowLength=0`必须与A4-G atmosphere/fog/cloud composite一致。禁止radial blur、屏幕空间god-ray
遮罩、额外haze、cloud-local tone map或bloom。

### Lifecycle and failure

- BSM capability要求与现有Cloud MRT兼容的RGBA16F render target及至少2 draw buffers；不得因A5增加3-draw-buffer要求。
- Atlas/commands/program必须由现有renderer owner按context lazy-create、resize failure-atomically、destroy exactly once。
- capability、native-lighting conflict或candidate allocation失败均保留last-good/disabled identity，不发布partial frame-state record。
- request-render mode只在真实rendered frame更新BSM；不注册timer、listener、wall-clock animation或permanent render loop。
- Planar renderer、shader、controls、calibration和owner gate在A5-G保持冻结。

## 最小充分验证

本阶段只运行与新增契约直接相关的检查：

1. public defaults/setters、disabled identity、native-lighting conflict与resource lifecycle；
2. 一个actual-GPU BSM fixture，覆盖known density、Beer transmittance和cascade overlap连续性；
3. 一个packed-alpha/shadow-length fixture，覆盖exact round-trip、zero identity，以及positive length只降低directional Sun；
4. 一个Globe surface shader fixture，覆盖SceneGIS variant on/off与terrain/geodetic normal选择；
5. 既有EnvironmentEffects controller/A1 pipeline、受SGP-0009影响的focused Globe surface specs、package public-contract verifier；
6. changed-scope lint/format/Markdown/patch audit与`git diff --check`；
7. direct Test只取高太阳云影off/on、低太阳rays off/on、combined与no-moon night的少量Globe单帧证据。

默认不运行full repository、Scene aggregate、unrelated generator/type/build矩阵，不增加hash/replay/convergence gate。项目负责人以最终Globe画面判断
shadow softness、cascade visibility、surface skylight和crepuscular-ray质量。

## 被拒绝的方案

- **Cesium native `ShadowMap`**：只表示geometry depth，不能表示volumetric Beer optical depth。
- **resolved-scene fullscreen relighting**：会把Models/3D Tiles已完成的lighting再次照明。
- **第三Cloud MRT attachment**：提高draw-buffer capability和resource预算，且现有alpha可精确承载所需语义。
- **reference temporal BSM/PBO/raw `_gl`**：属于A6与不允许的runtime容器机制。
- **radial blur god rays或第二层haze**：不符合Bruneton shadow-length physical coupling并重复现有fog/aerial composition。
- **同步实现Planar**：违反已批准的Globe-first串行交付顺序。

## 后果

A5-G新增一个bounded current-frame atlas和一个最小Globe surface upstream seam，换取云、地表、atmosphere与fog共享同一Sun/sky/cloud optical
authority。Models与3D Tiles不会获得新的SceneGIS skylight，这是一项有意的首阶段consumer边界；如未来需要scene-wide PBR environment/IBL，应以独立ADR
建立material-level contract，而不是扩张本阶段fullscreen composite。
