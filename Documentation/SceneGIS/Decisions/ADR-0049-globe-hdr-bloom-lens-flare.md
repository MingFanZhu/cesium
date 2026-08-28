# ADR-0049：Globe HDR Bloom and Lens Flare

## 状态

- Status：`accepted; A7-G implementation active`
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
| `lensFlareIntensity` |   `1.0` |     `[0,64]` | Multiplier over reference ghost/halo amplitude |

Setters只request render，不invalidate A6 cloud history。A7-G只执行Globe分支；
Planar可保留公共值但产品公式、command、resource与画面必须完全不变，直到A8-G后
单独适配。

### Linear-HDR pass graph

在现有Aerial/cloud composite之后、Cesium postprocess之前执行：

1. 以`ceil(width/2) x ceil(height/2)` RGBA16F执行reference-shaped
   luminance downsample与`smoothstep(threshold, threshold+1)`；
2. 使用一个固定、对称、separable blur horizontal/vertical通过第二个同尺寸
   RGBA16F target；
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
- four commands：threshold、horizontal blur、vertical blur、composite；
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
