# ADR-0044：Separate Background and Aerial Radiance Calibration

## 状态

- Status：`approved`
- Date：`2026-08-15`
- Decision owners：Architecture Agent、project owner gate feedback
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md`
- Related review：
  `AgentDocs/atmosphere-clouds-effects/reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md`
- Related patch：active `SGP-0008`（consume only）
- Amends：ADR-0043 scene-linear radiance mapping与visual diagnostics
- Constrains：ADR-0041、ADR-0042、ADR-0043

## 上下文与第三次 owner gate 证据

第三次project-owner visual gate判定A2不能通过：default `radianceScale=10`时地表被大气颜色覆盖。Architecture直接检查当前
`Test/高级环境.html`并隔离pass：

- background-only保留Globe与Planar的原始深绿地表，Planar黄色comparison box也保持黄色；
- aerial-only在scale `10`把两种世界的地表变为近乎统一的蓝色，并把黄色box漂白；所以问题不来自background order、native冲突或
  RGBA16F storage clamp；
- scale `10`的ground/day aerial-only统计为Globe `L1=41,327,126`、`max=465`、`305,232` changed pixels，Planar
  `L1=66,585,926`、`max=414`、`334,665` changed pixels；每个changed pixel的平均RGB绝对偏移约为`135.4/199.0`；
- 同一场景把scale降到`1`后，Globe/Planar aerial-only平均偏移降为约`3.7/24.7`，地表颜色恢复，但combined sky重新变暗，复现了前一次
  owner gate的“强度较弱”。

ADR-0043的单一`radianceScale`假设physical atmosphere radiance与Cesium geometry scene color共享同一radiometric calibration。实际
Cesium材质输出是renderer scene-linear color而非有绝对物理单位的surface radiance。用同一倍率把sky调到可见，会使aerial in-scattering相对
`inputColor * transmittance`过强；降低该倍率又会同时削弱sky。单一默认值不存在能满足两个gate的稳定折中。

## 决策

### Public calibration contract

A2尚未checkpoint或发布，因此在首个A2提交前移除含义含混的public `radianceScale`，不保留alias或deprecation shim，改为两个双世界一致的
public calibration：

- `backgroundRadianceScale`：constructor option与writable property；default=`10.0`；finite `[0.0, 64.0]`；只用于
  background sky、Sun disk与background ground-boundary radiance；
- `aerialRadianceScale`：constructor option与writable property；default=`1.0`；finite `[0.0, 64.0]`；只用于resolved geometry的
  aerial in-scattering radiance；
- 两个setter都只更新uniform source并`requestRender`，不得reload LUT、recompile program、重建FBO/texture或改变generation state；
- Test页分别暴露`Background radiance`与`Aerial radiance`控制，不得用一个UI slider在runtime外再次耦合两者。

这是active、uncommitted phase中的public contract correction，不是已发布API的breaking change。Package、types与docs中不得残留
`radianceScale`。

### Shader composition

- Background先完成physical sky/Sun/ground composition，再计算
  `physicalRadiance * backgroundRadianceScale`，最后执行ADR-0043 RGBA16F storage guard。
- Aerial继续计算
  `inputColor * transmittance + radiance * aerialRadianceScale`，最后执行storage guard。不得把aerial scale乘到input color、
  transmittance或整个composition，也不得新增隐藏mix/opacity/exposure multiplier。
- LUT、phase function、multiple-scattering、segment transmittance、log-depth reconstruction与Sun physical formula均保持不变。
- 两个scale只解决Cesium renderer domain的calibration mismatch；它们不宣称改变physical transport，也不引入gamma、white-point或tone
  mapping。Cesium仍是display-transfer authority。

### Two-sided visual diagnostics

ADR-0043仅用`max RGB delta >= 8`作为minimum observability floor，不能识别过强效果；本次gate证明单侧下限会把严重washout误报为PASS。
A2R3诊断必须同时证明“看得见”和“保留地表颜色”：

- ground/day的background、aerial与combined仍报告`L1`、`max`与changed pixels；nonidentity case继续要求`max >= 8`；
- ground/day aerial-only额外报告`meanChangedDelta = L1 / changedPixels`。Globe与Planar默认值都必须满足
  `0 < meanChangedDelta <= 32`；当前错误默认的约`135/199`必须失败；
- Direct Test还应报告每个viewer下方中央ground ROI的mean RGB delta，排除少量远景box或Sun pixel掩盖整片地表。ROI必须避开badge、logo和
  sky；默认值应非零且不超过`32`；
- air/high允许更强的距离雾化，不套用ground ROI上界；night、clear-depth与nonintersecting继续按identity/optional规则判断；
- 数值门槛只是防止明显回归，不能替代project-owner visual judgment。

## 验证

- Public Specs覆盖两个constructor option/property的default、finite range、requestRender、warm resources及no-fetch/no-compile；确认
  `radianceScale`不再出现在public runtime/types/docs。
- Shader contract与raw RGBA16F pixel fixtures分别证明background只响应`backgroundRadianceScale`、aerial只响应
  `aerialRadianceScale`；另一scale变化不得改变对应pass。
- 既有Sun-aligned scale `10/64` storage fixtures迁移到background scale；aerial scale `0/1/2` linearity、scale `64` finite、
  transmittance invariance与log-depth fixtures迁移到aerial scale。
- Test页在ground/day默认`10/1`下执行background/aerial/combined、full-frame mean与ground ROI双侧诊断；local Chromium保存准确统计与截图，
  然后重新请求第四次project-owner visual gate。
- A1 slots/reference frame、Scene aggregate、build/types/docs、installed package、exact LUT/hash、disabled/native conflict/lifecycle、upstream与
  generated audit全部回归。

## 停止条件

A2R3不得修改LUT、physical transport、`Scene.js`、SGP-0008、FramebufferManager或新增render target。若双scale仍不能在default ground/day
同时满足sky可见与地表保持，Execution必须停止并提交新的Architecture discussion，不得继续增加Test-only multiplier或进入A3。

## 参考

- [ADR-0041](ADR-0041-bruneton-atmosphere-aerial-perspective.md)
- [ADR-0042](ADR-0042-planar-precomputed-atmosphere.md)
- [ADR-0043](ADR-0043-atmosphere-log-depth-and-radiance-mapping.md)
