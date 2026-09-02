# ADR-0052：Planar Integrated-medium Restoration and Requalification

## 状态

- Status：`accepted design; execution deferred before acceptance`
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
- Planar volumetric cloud MRT、spatial resolve、existing same-UV history；
- clear sky、finite ground/geometry与cloud前后层序上的single linear-HDR composition。

P1不实现Planar cloud shadow、crepuscular rays、Globe-style world reprojection、dynamic
performance policy、Bloom/Lens、readable night skylight、native Moon或其他A5–A10迁移。
这些能力只能在P1关闭后按新的Planar phase逐项source-discover。

### Geometry and optical authority

Planar继续使用registered `SceneGISPlanarWorld`的`+X East/+Y North/+Z Up`、explicit
base Z、flat atmosphere slab与cloud slabs。不得调用Globe ellipsoid shell、radial height、
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
