# ADR-0043：Atmosphere Log-Depth Reconstruction and Scene-Linear Radiance Mapping

## 状态

- Status：`approved`
- Date：`2026-08-15`
- Decision owners：Architecture Agent、project owner
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md`
- Related review：
  `AgentDocs/atmosphere-clouds-effects/reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md`
- Related patch：active `SGP-0008`（consume only）
- Amends：ADR-0041 public render calibration、shader resource budget与depth validation
- Amended by：ADR-0044 background/aerial calibration separation
- Constrains：ADR-0040、ADR-0041、ADR-0042

## 上下文与第二次 owner gate 证据

A2R 修正了 planar slab transport、multiple-scattering recurrence与irradiance，但第二次project-owner visual gate仍判定双世界效果过弱。
Architecture对真实`Test/高级环境.html`执行了background/aerial隔离诊断：

- ground preset下Globe aerial-only为`RGB L1=0`，Planar仅为`L1=1770`、`max=2`、`934`changed pixels；
- 120 km planar high preset下aerial-only为`L1=0`、`max=0`，尽管目标box可见且其ray应在300 km后进入slab；
- 同一high preset的Globe aerial-only为`L1=15134493`、`max=277`、`201230`changed pixels；
- Planar scattering LUT按runtime同一坐标映射离线采样，ground/air representative radiance约为`0.01–0.15`，不是zero asset。

Cesium `czm_screenToEyeCoordinates(screenXY, depthOrLogDepth)`只有shader定义`LOG_DEPTH`或`LOG_DEPTH_READ_ONLY`时才解释log depth。
A2 aerial program没有任一define，而direct Test默认启用logarithmic depth；shader因此把log depth当普通window depth，高空endpoint被重建为到不了
slab entry的短ray。现有高空Specs显式关闭log depth，只证明了linear-depth路径。

同时，A2把physical spectral radiance直接写入Cesium scene-linear HDR。Bruneton reference demo明确在display transfer前使用
`radiance / white_point * exposure`；SceneGIS既没有该radiometric-to-display映射，也没有可测试的等价scene-linear scale。当前仅有Sun
disk的hardcoded`20.0` multiplier，它不能代替统一的sky/aerial/ground/Sun mapping。

## 决策

### Log-depth aerial program

- 每个active world保留一个depth-independent background program，并拥有两个aerial program：linear-depth与定义
  `LOG_DEPTH_READ_ONLY`的log-depth variant。
- `executeHdr`必须按当前`frameState.useLogDepth`选择variant；它是resolved depth在该帧中的实际encoding。Cesium会为
  Orthographic frustum把它置为`false`，即使public `scene.logarithmicDepthBuffer` preference仍为`true`。运行时切换不得重新fetch
  LUT、临时compile shader或丢失last-good resources。
- Log-depth variant继续把depth texture的raw sample传给`czm_windowToEyeCoordinates`，由Cesium builtin执行一次decode；禁止先
  `czm_reverseLogDepth`再触发builtin的第二次decode。
- 两个variant作为同一candidate resource set failure-atomic创建与销毁。新增预算仅为一个aerial `ShaderProgram`；不得新增texture、FBO、
  raw GL、第二render loop或第二upstream file。

### Scene-linear radiance mapping

`SceneGISEnvironmentEffects`新增双世界一致的public `radianceScale`：

- constructor option与writable property名称均为`radianceScale`；default=`10.0`；有效范围为finite `[0.0, 64.0]`；
- setter只更新uniform并`requestRender`，不得reload LUT、recompile program或重置temporal/lifecycle state；
- 它只把atmosphere model radiance映射到Cesium scene-linear HDR：background输出`radiance * radianceScale`，aerial输出
  `inputColor * transmittance + radiance * radianceScale`；不得缩放input color或transmittance；
- Sun disk、sky scattering、aerial in-scattering与ground boundary radiance必须先在同一physical单位中完成，再统一应用该scale；
- shader不得执行gamma、exponential display curve、ACES/Reinhard或white-point clipping；Cesium现有bloom/auto exposure/tone mapping仍是唯一
  display-transfer authority；
- Test页可把该scale表示为EV control，但不得拥有runtime外的Test-only multiplier。

当前`SCENEGIS_SOLAR_IRRADIANCE * 20.0`不是有来源的solar radiance。Globe使用fixed Bruneton authority的
`solar_irradiance / (pi * sun_angular_radius^2)`语义；planar使用同一公式与constants。Sun disk随后与其余atmospheric radiance一起应用
`radianceScale`，不得保留第二个hidden intensity multiplier。

### RGBA16F storage safety amendment

A2R2 Architecture review发现，统一radiance mapping还必须显式处理Cesium HDR storage的有限表示域。当前capability contract要求
RGBA16F，而Cesium在支持half-float时也把HDR scene framebuffer建为`HALF_FLOAT`。使用冻结常量
`SCENEGIS_SOLAR_IRRADIANCE=(1.474, 1.8504, 1.91198)`与`sunAngularRadius=0.004675`时，Sun disk在scale前约为
`(21467.64, 26949.61, 27846.48)`；default `radianceScale=10`后约为
`(214676.44, 269496.12, 278464.76)`，已超过binary16最大有限值`65504`。允许上界`64`不能依赖隐式float-to-half overflow行为。

- Background与aerial必须在所有physical radiance合成和`radianceScale`应用之后、写入目标之前，把最终scene-linear RGB限制到显式常量
  `SCENEGIS_HDR_MAX=65504.0`；aerial仍先计算`inputColor * transmittance + radiance * radianceScale`，不得分别clip或缩放input color与
  transmittance。
- 该操作是RGBA16F representation/storage guard，不是display transfer、white-point normalization、tone mapping或额外Sun intensity。低于
  storage ceiling的值保持线性；Cesium仍是唯一gamma、bloom、auto exposure与tone-mapping authority。
- 不得通过降低Test页scale、隐藏Sun、恢复第二个Sun multiplier、改用Test-only framebuffer或扩大upstream hook规避该边界。

### Integrated visual diagnostics

- Direct Test为Globe/planar分别报告`background-only`、`aerial-only`与combined enabled-vs-identity，而不是只报告一个可由另一pass掩盖的
  aggregate delta。
- ground/air/high与day/sunset/night保留；planar high camera保持120 km，box ray必须在真实300 km slab entry之后终止，不能移动camera或
  geometry到slab内隐藏log-depth defect。
- Default `radianceScale=10.0`的designated day/sunset scenes不得再以single-LSB作为通过证据：local Chromium smoke中每个required
  background/aerial case的maximum RGB delta至少为`8`，并报告changed-pixel count；此数值只是minimum observability floor，不代替owner
  visual judgment。
- Night、nonintersecting与clear-depth cases仍允许exact identity；诊断必须按case标明expected identity/nonidentity，不能对所有preset套同一
  nonzero assertion。

## 验证

- Real Context分别覆盖linear/log depth、Perspective/Orthographic、Globe/planar、clear/nonclear depth与runtime flag selection。
- 至少一个normal integrated `Scene.render` Spec用真实opaque primitive、resolved color/depth和postprocess链证明planar 120 km log-depth
  aerial nonidentity；只直接调用private `executeHdr`并手写depth texture不充分。
- `radianceScale` constructor/property边界、requestRender、warm resources与no-refetch/no-recompile有public/resource Specs。
- HDR pixel fixture分别证明transmittance不随scale变化、radiance term在scale 1/2下近似线性，以及scale 0仅保留
  `inputColor * transmittance`。
- Globe与Planar分别增加对准Sun disk的raw RGBA16F background fixture；default scale `10`与public上界`64`解码后的全部channel必须
  `Number.isFinite`且不大于`65504`。Postprocessed 8-bit page、console无错误或未对准Sun的background sample不能替代此证据。
- Aerial raw RGBA16F fixture还必须在scale `64`证明最终composition的全部channel有限且不大于`65504`。
- Direct page与local smoke分别验证background-only、aerial-only、combined矩阵及minimum observability floor，之后再次执行project-owner
  visual gate。
- A1 slots、LUT bytes/hashes、disabled-zero、native conflict、lifecycle、package与upstream audit全部回归；A2R2不要求重新生成LUT。

## 停止条件

若正确log-depth decode需要修改Cesium builtin、PostProcessStageCollection、FramebufferManager或除现有`Scene.js` paired ranges之外的
upstream-owned file，Execution必须停止并提交Architecture discussion。A2R2通过Architecture review与owner gate前不得checkpoint或激活A3。

## A17-G amendment — preserve raw-depth precision through Globe clouds

The [A17 diagnosis](../../../AgentDocs/atmosphere-clouds-effects/discussions/2026-09-11-far-cloud-bands.md)
reproduces horizontal false cloud occlusion at a large far/near ratio. Globe
cloud tracing, resolve and aerial composition must pass raw texture depth to
Cesium's precise `(vec2, float)` eye-coordinate overload. The intermediate
float32 perspective depth loses distance precision even when decoded once.

CloudFS uses normalized cloudCoordinates with czm_screenToEyeCoordinates;
ResolveFS and AerialFS use gl_FragCoord.xy with czm_windowToEyeCoordinates.
This extends A13's medium correction to all Globe tiers and final composition.
Keep native LOG_DEPTH_READ_ONLY selection, exact-clear gating, Orthographic
linear handling, ray/sample coordinates and receiver tolerances. No custom
formula, new GPU resource, upstream hunk or SGP is needed. Planar is unchanged.
The [A17 phase](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-11-phase-a17g-far-cloud-depth.md)
owns far-depth/foreground regression and owner quality gates.

## 参考

- [Bruneton atmosphere demo shader](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/demo/demo.glsl.html)
- [ADR-0041](ADR-0041-bruneton-atmosphere-aerial-perspective.md)
- [ADR-0042](ADR-0042-planar-precomputed-atmosphere.md)
