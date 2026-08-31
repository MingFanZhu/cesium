# ADR-0049：Globe HDR Bloom and Lens Flare

## 状态

- Status：`accepted; A7-G completed`
- Date：`2026-08-28`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md`
- Related patches：active `SGP-0008`（consume only）、active `SGP-0009`（unchanged）
- Builds on：ADR-0040、ADR-0043、ADR-0046、ADR-0047、ADR-0048

## 上下文

A6-G checkpoint已经冻结完整Globe atmosphere/fog/cloud/shadow/rays与camera-
motion temporal result，但尚无SceneGIS-owned HDR bloom与lens artifact。
`SGP-0008`已把最终scene-linear HDR color和resolved depth交给private renderer，
位置早于Cesium built-in bloom与tone mapping，因此A7-G不需要新的upstream hook。

固定`three-geospatial`参考提供bright threshold、blur、ghost、halo和additive HDR
topology；固定Cesium fork又证明Sun screen projection与depth occultation的必要性。
两者的`PostProcessStage`/third-party renderer container、screen blend、raw WebGL与
display-transfer ownership不能直接采用。

## 决策

### Public contract

A7-G在`SceneGISEnvironmentEffects`增加以下warm writable properties：

| Property             | Default | Finite range | Meaning                                        |
| -------------------- | ------: | -----------: | ---------------------------------------------- |
| `showBloom`          |  `true` |      boolean | Globe scene-wide HDR bright-source bloom       |
| `showLensFlare`      |  `true` |      boolean | Globe Sun ghost/halo lens artifacts            |
| `bloomThreshold`     |  `10.0` |  `[0,65504]` | Scene-linear luminance threshold               |
| `bloomIntensity`     |  `0.05` |     `[0,64]` | Additive blurred-bright-field multiplier       |
| `lensFlareIntensity` |   `5.0` |     `[0,64]` | Multiplier over reference ghost/halo amplitude |

Setters只request render，不invalidate A6 cloud history。A7-G只执行Globe分支；
Planar可保留公共值但产品公式、command、resource与画面必须完全不变，直到A8-G后
单独适配。

### Linear-HDR pass graph

在现有Aerial/cloud composite之后、Cesium postprocess之前执行：

1. 以`ceil(width/2) x ceil(height/2)` RGBA16F执行reference-shaped
   luminance downsample与`smoothstep(threshold, threshold+1)`；
2. 使用一个固定、归一化、对称的separable blur，以direction radius
   `1/2/4`执行三组horizontal/vertical octave，通过同一对half-resolution
   RGBA16F targets ping-pong；
3. full-resolution composite读取原HDR、blurred bright field与resolved depth，
   加上`bloom * bloomIntensity`以及reference ghost/halo；
4. 保持input alpha exact不变，只使用既有finite RGBA16F guard，禁止screen blend、
   gamma、exposure或tone mapping。

两种feature都关闭时必须在任何A7 allocation/command之前直接返回input texture。
第一次启用后resources保持warm，直到controller disable/disconnect/destroy；resize以
candidate-first方式failure atomic替换。

### Sun lens occlusion

Lens artifacts只在Sun direction位于camera前方和viewport内、Sun coordinate的raw
resolved depth为exact clear `0|1`，且同一坐标的final HDR bright signal通过threshold
时启用。Finite terrain/geometry depth抑制lens artifact；cloud已在A4/A5 final HDR中
衰减Sun，因此不新增Cloud MRT coupling。General bloom不受Sun visibility gate影响。

### Resource budget

A7-G增加：

- three programs：threshold、shared separable blur、composite；
- four command objects：threshold、horizontal blur、vertical blur、composite；
  active frame按固定顺序执行一次threshold、六次blur和一次composite；
- three color-only `FramebufferManager`/RGBA16F textures：two half-resolution、
  one full-resolution；
- zero depth attachment、history、readback、asset、network request或runtime dependency。

GPU bytes为`8*W*H + 16*ceil(W/2)*ceil(H/2)`，约`12*W*H`。该固定A7预算不改变
ADR-0048 `cloudQuality`语义，也不建立automatic performance controller。

### Native authority conflict

Existing `scene.sunBloom === false` precondition remains mandatory, so
`SunPostProcess` never owns the active frame. When `showBloom === true`,
`scene.postProcessStages.bloom.enabled` must also be false before A7 allocation
and on every active validation. SceneGIS does not rewrite either native value
and does not scan arbitrary user custom stages; conflicts fail through the
existing controller error path.

## 后果

- A7-G consumes `SGP-0008` unchanged and adds no upstream-owned file or SGP.
- Existing A2-A6 equations, A6 history, A5 BSM, public calibration defaults and
  Globe terrain-depth lifecycle remain frozen.
- Fixed MIT reference shader portions retain copyright, commit and source-path
  notices in the new SceneGIS GLSL.
- A8-G qualification and every Planar effect remain outside this decision.

## 最小验收

- One actual-GPU fixture covers threshold, blur, additive HDR, exact alpha,
  finite/storage bounds, visible Sun, finite-depth occultation and cloud-dimmed
  bright input.
- One existing lifecycle/public fixture may be amended for defaults/ranges,
  zero-work, resize/destroy and native bloom conflict.
- Focused controller/A1, `tsc`, installed-package verification, lint/format and
  direct fixed visual observations are sufficient. No full repository matrix,
  replay/hash/convergence or absolute FPS gate is required.

## Execution evidence — 2026-08-28

- Implemented the Globe-only half-resolution threshold, shared separable blur and
  full-resolution additive HDR composite. The lens branch uses the fixed
  reference ghost/halo amplitude `1e-5` and is gated by projected Sun visibility,
  exact-clear resolved depth and the final-HDR threshold.
- Added warm public controls with defaults `true/true/10/0.05/1`; all setters
  request render without invalidating A6 history. Planar execution remains an
  exact bypass.
- Lazy A7 topology is exactly three programs, four commands and three color-only
  RGBA16F targets. Bytes are
  `8*W*H + 16*ceil(W/2)*ceil(H/2)`; resource/pass/history/upstream/SGP deltas are
  `3 programs / 4 commands / 3 FBOs / 0 history / 0 upstream / 0 SGP`.
- Focused actual-GPU A7 and lifecycle fixtures pass. Final focused controller,
  A1 pipeline, TypeScript, installed-package and changed-scope checks are listed
  in the A7 review. Browser observations used only the three fixed Globe states;
  render errors were zero.

## A7-AR-004 架构修订 — 2026-08-28

Project-owner固定高日照画面证明single-octave finite-support blur会把极高亮Sun
扩展为axis-aligned saturated square，且同一窄blur source使ghost/halo footprint
过小。重新审计固定MIT参考后，Architecture确认参考的bloom是multi-level blur，
feature source另有pre-blur；原A7把两种scale domain压成一次H/V blur是直接偏差。

本修订不增加resource或改变Sun radiometry/public intensity。现有normalized blur
command以固定`1/2/4` direction radius执行三组H/V octave，最终broad field同时供
general bloom与既有mirrored ghost/halo读取。Program、command object、texture、FBO、
GPU bytes、depth/history/API/upstream/SGP/Planar预算保持不变；active execution从
`threshold + 2 blur + composite`调整为`threshold + 6 blur + composite`。

### A7-AR-004 execution result

Execution已按决定复用既有两个blur command object与两个half-resolution target，
依次执行`1/2/4`三组H/V octave。聚焦GPU fixture通过，并用single-octave mutation
证明新图在旧finite footprint之外保留连续非零support。固定高日照观察中原
axis-aligned saturated square已消失，ghost/halo field明显扩大；resource、API、
physical source、upstream、SGP与Planar均无增量。

## A7-AR-006 架构修订 — 2026-08-30

Project-owner画面确认Bloom在可见Sun周围跨越terrain silhouette，但明确判断lens
halo过淡。Bloom是depth-resolved scene之后的additive screen-space point-spread
function；对每个blurred destination pixel再次以terrain depth裁切会产生不真实的
hard horizon edge，因此Bloom threshold、intensity、blur、source gate与composite均
保持冻结。

固定reference的overall effect intensity为`0.005`，ghost/halo source coefficient
为`0.001`，feature-to-bloom ratio为`0.001`。SceneGIS原默认组合为
`1e-5 * 1.0 / 0.05 = 0.0002`，相对reference弱五倍。本修订仅把
`lensFlareIntensity`默认值改为`5.0`，恢复
`1e-5 * 5.0 / 0.05 = 0.001`。Public range仍为`[0,64]`；GLSL内部系数、Bloom、
Sun radiometry、tone transfer、depth、resource、A2-A6、Planar、upstream与SGP均
不变。

### A7-AR-006 execution result

Execution已将constructor、JSDoc、Test与installed-package authority的默认值同步
为`5.0`，并保持public range `[0,64]`与内部`1e-5`系数不变。聚焦constructor
Spec和installed delivery verifier通过；单次固定高日照观察显示halo/ghost相对
Bloom明显增强且仍为宽范围soft field。GLSL、Bloom、depth、resource与其他冻结
边界均无变化。

Architecture逐项复核default链路并独立重跑既有constructor-contract Spec为
`1/1 SUCCESS`。`A7-AR-006`关闭；同一default-5画面进入project-owner visual
re-gate，明确通过前不得继续sweep或进入checkpoint/A8-G。

## A7-G 最终验收 — 2026-08-31

Project owner已对default-5最终画面明确报告`通过`，接受Bloom跨越terrain
silhouette的screen-space optical spread与增强后的lens halo/ghost balance。
Architecture review与owner visual gate全部关闭；本ADR随A7-G独立本地checkpoint
冻结，A8-G需另行激活。
