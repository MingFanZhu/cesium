# ADR-0052：Planar Integrated-medium Restoration and Requalification

The [ADR-0045 horizon amendment](ADR-0045-dual-world-exponential-height-fog.md)
supersedes P10's pre-fogged Background / clear-Aerial shadow-difference timing.
Both clear and finite scene color now receive fog in Aerial after coverage
composition. Cloud geometry, shadow-prefix transport and resource budgets remain.

P9 supersedes only this decision's retained stationary spatial reconstruction
and cloudTime-based STBN policy. See the [ADR-0048 P9 amendment](ADR-0048-globe-temporal-stabilization-performance-policy.md#p9-amendment--shared-planar-medium-reconstruction)
for shared medium pixel phases and existing-history temporal accumulation.
Absolute-Z geometry, metric CRS independence, origin-relative reprojection,
continuity cuts and caller-owned rendering remain unchanged.

2026-09-11 implementation amendment: the owner authorizes Planar development
under the confirmed metric/custom-CRS, fixed-Z and direct-Z contract. P1 now
also corrects the retained far-cloud visibility, footprint filtering and
same-UV temporal limitations before its first acceptance/checkpoint. This
supersedes only their freezes below; the independent Planar LUT/cloud assets,
public calibration, quality sample budgets and resource counts stay unchanged.
The existing camera/wind reprojection and HDR variance clipping are adapted to
Planar with CPU-computed camera deltas and strict receiver/cut handling.
The 300 km medium budget starts at slab entry; camera distance is not a density
fade. Surface cloud shadows/rays, HDR/celestial work remain later phases.
Current assignment and validation are in the existing P1 phase plan.

## 状态

- Status：`accepted design; execution resumed after A17`
- Date：`2026-09-02`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-09-02-phase-p1-planar-integrated-medium-restoration.md`
- Related patch：active `SGP-0008`（consume only）；P1不得新增upstream hunk
- Builds on：ADR-0040、ADR-0042、ADR-0045、ADR-0046
- Freezes：A1–A10 Globe checkpoints、SGP-0008、SGP-0009

## 上下文

Globe-first路线已经完成A1–A10并形成冻结的A10-G checkpoint。Planar在A2交付了
fixed `+Z` precomputed atmosphere和depth-aware aerial perspective，在A3交付了
fixed-Z analytic exponential height fog，在A4/A4R保留了独立Planar cloud assets、
slab geometry、uniform coarse/fine march、spatial resolve与same-UV cloud history。

2026-08-27的owner画面曾显示Planar height fog与volumetric cloud组合产生大块白色区域和
错误层序。该画面足以否决当时的candidate，但ADR-0040/0046明确没有把它归因于fog、
cloud MRT、resolve、depth、texture orientation或final composite中的任何一个环节。

在冻结A10源码上的重新source discovery确认：renderer仍先执行Planar Cloud MRT与resolve，
再由一个full-resolution aerial command按atmosphere → height fog → cloud的顺序合成；
Planar shader路径不进入`SCENEGIS_GLOBE`分支。当前direct Planar页面也没有原样复现历史
整屏白色故障。页面下半部的灰绿色平面与黄色矩形来自确定性的base plane和box geometry，
不能仅凭最终截图认定为介质覆盖错误。因此Planar恢复必须先建立当前final-composition
authority，而不是按旧截图猜测根因或直接调参。

## 决定

### P1范围

首个Planar恢复阶段命名为P1，只恢复并重新资格化既有A2/A3/A4 capability family：

- fixed-Z atmosphere background与resolved-depth aerial perspective；
- fixed-Z exponential height fog；
- Planar volumetric cloud MRT、spatial resolve、camera/wind reprojection history（September 11 amendment）；
- clear sky、finite ground/geometry与cloud前后层序上的single linear-HDR composition。

P1不实现Planar cloud shadow、crepuscular rays、dynamic
performance policy、Bloom/Lens、readable night skylight、native Moon或其他A5–A10迁移。
这些能力只能在P1关闭后按新的Planar phase逐项source-discover。

### Geometry and optical authority

Planar继续使用registered `SceneGISPlanarWorld`的`+X East/+Y North/+Z Up`、explicit
zero reference-ground Z、direct world-Z height、flat atmosphere slab与cloud slabs。不得调用Globe ellipsoid shell、radial height、
ECEF Sun/receiver、Globe reference assets、Beer shadow atlas、surface-lighting seam或
`SCENEGIS_GLOBE`专用校准来制造视觉相似。

ADR-0042、ADR-0045与ADR-0046冻结的Planar LUT、fog积分、cloud assets、quality defaults、
uniform scheduler和radiometric units仍是authority。P1只有在actual-GPU final-composition
证据定位出具体公式/深度/层序错误后，才可修改对应的Planar product branch。若当前源码
已经满足契约，P1应以qualification-only关闭，不为制造代码差异而改变公式或参数。

### Composition authority

同一immutable resolved input必须分别证明以下状态：baseline、aerial-only、fog-only、
cloud-only与aerial+fog+cloud。Finite geometry的顺序保持：

```text
sceneWithAtmosphere = input * atmosphereTransmittance + atmosphereRadiance
sceneWithFog = sceneWithAtmosphere * fogTransmittance + fogInscattering
sceneFinal = sceneWithFog * cloudTransmittance + cloudOptical
```

`cloudOptical`只在选中的visible cloud mean/front authority上应用到云的atmosphere/fog，
不得对已经写入background的clear-depth sky二次施雾，也不得让云覆盖其前方的finite
geometry。每个disabled component保持既有raw-half identity；alpha与single RGBA16F
storage guard保持不变。

### Evidence-first correction

P1先在existing controller Spec文件内建立一个focused actual-GPU final-composition witness，
直接使用product programs、resolved color/depth与Planar reference frame。它必须把base
scene颜色与介质delta分开，并至少包含一组clear-depth与一组finite-depth authority。
历史白色截图是regression motivation，不是允许Test-only product branch、parameter sweep、
hidden tint/scale、fallback或geometry fiction的依据。

Direct Test保留当前deterministic local plane/boxes，并从“retained/deferred”升级为P1
观察页。测试页可以增加固定观察与清晰标签，但不得改变camera/geometry来隐藏失败，
也不得以截图阈值代替project-owner视觉判断。

### Resource, ownership, and upgrade boundary

P1默认资源增量为零：不新增program、command、texture、FBO、attachment、history、asset、
request、readback、runtime dependency或GPU byte。复用A1–A4现有Planar pipeline、LUT、
Cloud MRT/history与full-resolution aerial target。Public API/default/range保持不变。

P1不得修改upstream-owned file、`.scenegis/upstream-patches.json`、SGP-0008或SGP-0009，
也不得手工编辑generated shader module或Build输出。若根因要求新资源类别、public API、
Globe product path、upstream hunk或Planar A5+能力，Execution必须停止并回报Architecture。

## 验证

- Focused actual-GPU witness覆盖baseline、aerial-only、fog-only、cloud-only与combined，证明
  finite/nonnegative RGBA16F、alpha identity、disabled identity和clear/finite depth层序。
- 至少一组Perspective/linear-depth final composition为主authority；现有Orthographic、
  log-depth、slab entry和Cloud MRT fixtures继续作为几何/解码回归。若产品公式发生改变，
  只补充与该根因直接相关的一组frustum/depth witness，不展开全矩阵。
- 任何修复都必须有旧公式或错误coordinate/depth/composition的compiled mutation失败证据，
  不能只检查shader字符串或uniform存在。
- Direct Planar页面在同一camera、lighting与geometry下逐项观察baseline/aerial/fog/cloud/
  combined，browser/render error为零；Architecture review后才开放owner visual gate。
- 运行changed-scope ESLint、Prettier、Markdownlint、`git diff --check`与相关focused Specs；
  renderer/resource lifecycle若未改变，不重复无关Globe、package或full-suite矩阵。

## 后果

- Planar路线从历史冻结状态恢复，但只恢复到A2/A3/A4 integrated-medium资格，不宣称已经
  获得Globe A5–A10 capability parity。
- 当前源码若已修复历史故障，P1可能只增加最终合成证据与发布页状态，不要求product diff。
- P1通过Architecture与owner gate并形成独立checkpoint后，才可规划后续Planar shadows/
  rays、temporal/performance或HDR optical effects。

## 路线更正（2026-09-02）

项目负责人在P1进入Architecture review与owner gate前明确更正后续顺序：下一阶段继续
Globe-first，先实现Moon directional light、作用于terrain/3D Tiles/models的方向光阴影与
更高质量月面。P1设计本身仍有效，但执行延期；未验收candidate保存在committed delivery
之外，不成为A11-G基线，也不改变冻结A10-G product checkpoint。

## 恢复执行（2026-09-11）

项目负责人验收 A17-G `3cdd2958d1` 后明确转回 Planar 天空大气与体积云。
P1 在当前源码上重新激活；本 ADR 的 fixed-Z、独立 LUT、先验证合成再修复与
资源边界保持有效。Globe 冻结范围更新为 A1–A17。旧 stash 只作为未验收候选，
不能用旧测试结论替代当前源码验证。页面组合比较与视觉质量分别记录；后续
Planar 云影、光束、时序与性能及天体效果仍须经过各自的阶段设计。

当前原生平面页的极大 far/near 比暴露了三处旧深度路径：GPU 复现中，200 km
前向接收点的径向距离误差约为 9.7–10.6 km。P1 因此将三处 Planar consumer
改用 Cesium 原生 raw-depth 重载；低分辨率 producer 使用自身 viewport 的
`gl_FragCoord.xy`，由原生接口归一化，避免把 full-resolution pixel 交给 low-resolution viewport。
这只修正深度/坐标还原，不迁移球面光学、云材质或时序政策，不增加资源或 SGP。

## P10 participating-medium continuation (2026-09-12)

After P9, the owner activates Planar volumetric light. ADR-0047's P10 amendment
specifies fixed-Z shadow-prefix transport and authored cloud-local haze in the
existing composition. Planar Background retains ownership of zero-length fog;
clear Aerial adds only the shadow correction. Cloud haze is the coverage-coupled
reference cloud effect and preserves its lit baseline with rays off. This phase
adds no pass, GPU allocation, public property, coordinate conversion or upstream
integration seam. Ground bounce and directional Moon remain deferred.

## P12 current receiver continuity (2026-09-12)

The owner-reported cloud/horizon seam is a spatial receiver qualification error.
Current Planar source receivers must be reconstructed from current raw depth;
the packed cloud receiver distance saturates at 1,000 km and cannot serve as an
unbounded current geometry position. Packed history/mean/front ranges remain.

Depth-derived receiver normals must use one-sided adjacent samples from the
closest eye-depth side, excluding clear/out-of-viewport samples. A GPU quad
crossing a silhouette is not a single geometric plane. This correction retains
strict receiver/foreground tolerance and clear/finite classification; it does
not authorize cloud bleeding, a larger rejection threshold or a horizon fade.
Four extra raw-depth reads for finite Planar pixels fit the existing resolve
pass and are measured in [P12](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-12-phase-p12-planar-cloud-receiver-seams.md).
Globe, cloud integration, temporal policy, allocations and public API are unchanged.
