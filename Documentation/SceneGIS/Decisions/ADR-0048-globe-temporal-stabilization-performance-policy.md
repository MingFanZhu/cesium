# ADR-0048：Globe Temporal Stabilization and Performance Policy

## 状态

- Status：`accepted; A6-G implementation active`
- Date：`2026-08-28`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md`
- Related patches：active `SGP-0008`（consume only）、active `SGP-0009`（unchanged）
- Builds on：ADR-0040、ADR-0046、ADR-0047

## 上下文

A4R已经拥有一组SceneGIS-owned cloud history：两个full-resolution ping-pong
framebuffer managers，每个保存premultiplied cloud radiance/transmittance与
mean/front/scene distance、validity和A5 shadow length。当前resolve只在同一
screen UV读取history，并把camera/reference frame写入compatibility key，因此任何
camera motion都会退回spatial-only；A5的atmosphere、height fog与cloud-local haze虽
消费同一个resolved shadow length，却不能从camera-motion temporal stabilization受益。

固定`three-geospatial`参考使用velocity attachment、previous view/projection、
variance clipping与16-phase temporal upscale；其Beer shadow又建立独立temporal
targets。固定Cesium fork还包含raw WebGL/PBO final-frame TAA。这些实现证明了
reprojection方向，但第三Cloud MRT、第二套shadow history、16帧收敛与raw `_gl`/PBO
都不符合SceneGIS现有capability、request-render与resource ownership边界。

参考quality presets本身是caller-selected static profiles，并没有跨机器FPS反馈控制。
SceneGIS也不能从system time、timer或持续render loop建立另一套性能authority。

## 决策

### 单一performance authority

现有public `cloudQuality="low"|"medium"|"high"`继续是Globe cloud、Beer atlas与
resolve的唯一performance tier。它可由caller在运行时warm切换，因此这里的
dynamic policy指caller-owned动态档位选择，不是renderer自主测FPS或猜测camera运动后
降档。A6-G不增加public option/property，也不改变default `"medium"`。

固定profiles保持：

| Tier     | Cloud scale | Primary/fine/Sun | Detail | BSM cascades/tile/steps |
| -------- | ----------: | ---------------: | :----: | ----------------------: |
| `low`    |     `0.375` |         `32/1/2` |  off   |              `2/256/25` |
| `medium` |       `0.5` |         `64/4/3` |   on   |              `3/512/50` |
| `high`   |      `0.75` |         `64/4/4` |   on   |              `3/768/50` |

Quality mutation必须继续failure-atomic地resize既有targets并exact invalidate同一
cloud history。不得增加wall-clock采样、timer/listener、automatic tier downgrade、
额外settling render或permanent render loop。性能验收使用相同设备/场景的相对GPU
command与configured sample budget，不建立绝对FPS gate。

### 演进现有cloud history，不新增history

A6-G只演进ADR-0046已经批准的两个ping-pong history managers：

- 不增加texture、attachment、framebuffer、pass、command或program category；
- 不增加velocity MRT。Resolve用现有mean/front/scene distance、当前camera ray和
  CPU保存的previous successful Globe frame重建world position与previous UV；
- previous state只包含可复用的camera position/direction/up/right、projection、frustum、
  cloud offset/time与必要的continuity scalars，不逐帧分配数组、对象或string key；
- valid cloud用opacity-weighted mean distance建立radiance history anchor，并保留front与
  scene-position compatibility；invalid cloud的shadow length以finite scene position为
  anchor，exact-clear ray使用direction reprojection；
- continuous `cloudTime`的cloud-body anchor补偿caller-owned wind advection，不能读取
  system time；
- history color/transmittance先限制到当前3×3 spatial neighborhood的finite range，再按
  reprojected position、scene edge、validity与radiometry compatibility决定是否blend；
- A5 packed alpha必须先解码。Cloud validity和shadow length分别选择、过滤、再repack，
  不直接插值packed bits，也不因invalid cloud丢弃positive length。

Globe Aerial、Bruneton sky/point transport、A3 directional fog与cloud-local haze继续只
读取同一个resolved Cloud attachment，因此自动共享这次stabilization。A5 current-frame
Beer surface atlas继续使用已接受的texel snapping、3×3 Beer PCF与cascade overlap；没有
已复现的剩余surface-shadow temporal defect，A6-G不为它建立独立history。

### Stationary、continuous与cut

History只由成功执行的Cloud resolve推进。每个rendered Globe frame只能属于以下一种：

1. `spatial-only invalid`：没有previous successful frame，或发生既有resource/config/
   enable/disable/context/quality/preset/support/log-depth discontinuity；
2. `spatial-only stationary`：camera、frustum、Sun与`cloudTime`均与previous successful
   frame相同；不得对同一current spatial result反复积累；
3. `reprojected continuous`：至少一个view/time input变化且通过continuity bounds；
4. `spatial-only cut`：任何continuity bound失败，必须在history sampling前invalidate。

Globe continuity bounds冻结为：same projection；camera translation不超过`25 km`；
direction与up dot都不小于`cos(10°)=0.984807753`；每个frustum edge相对previous
horizontal/vertical span的变化不超过`25%`；`abs(deltaCloudTime) <= 1 s`；Sun direction
dot不小于现有`0.99999`。Non-finite input直接cut。边界来自当前cloud visible end
`100 km`的四分之一与可重投影的小角度运动域，不是retry/fallback；超界first frame就是
完整current spatial output。

Projection/world/mode、viewport、quality、preset、cloud support/material/wind/radiance、
log-depth、asset generation、enable/disable/connect/disconnect/retry/context loss/destroy
继续沿用ADR-0046的exact invalidation。Planar保留A4R现有same-UV/history行为；A6-G不
修改或重新验收Planar。

### Resource and hot-path budget

A6-G的persistent GPU delta必须为零。Cloud仍是one low-resolution two-attachment
RGBA16F MRT、two full-resolution two-attachment history managers与one resolve command；
A5 BSM仍是one current-frame RGBA16F atlas/FBO/program。Low/medium/high BSM bytes保持
`2,097,152 / 8,388,608 / 18,874,368`，command与march limits保持上表。

Renderer用复用的structured compatibility snapshot替换当前每帧array/map/join构造的
string key。CPU previous-frame state也必须预分配并原地更新。A6-G不以隐藏sample reduction、
shader recompile、resolution oscillation或额外GPU readback换取性能数字。

## 最小充分验证

1. 一个amended actual-GPU Cloud resolve fixture覆盖smooth Perspective translate/rotate、
   expected previous UV、continuous `cloudTime` advection、stationary spatial-only和一个
   over-bound camera cut；pre-A6 same-UV mutation必须在该fixture中失败。
2. 同一fixture覆盖cloud-valid与invalid-positive-shadow-length两种anchor，证明packed
   validity/length semantic、finite geometry edge与clear direction不会ghost。
3. 一个现有lifecycle/resource Spec确认three tier配置、quality resize/invalidation、GPU
   resource/command/program counts与bytes没有新增。
4. 运行focused `SceneGISEnvironmentEffects` controller与A1 private pipeline，以及
   changed-scope lint/format/Markdown和`git diff --check`。没有upstream edit时不重复跑
   SGP audit、package/generator/type/full矩阵。
5. Direct Test只增加一个Globe high-Sun fixed camera/cloud-motion观察和一个quality切换
   观察；显示history mode/reset reason与tier budget即可。不得增加hash、replay、
   convergence loop、settling frames或数值代理gate。最终稳定性由项目负责人观看判断。

## 被拒绝的方案

- **第三Cloud velocity MRT**：提高draw-buffer/capability与memory边界；现有distance可重建
  所需position。
- **独立temporal BSM**：会复制history authority，并在high额外增加至少一个
  `18,874,368` byte atlas；当前没有未解决的surface-shadow temporal复现。
- **16-phase sparse temporal upscale**：要求多帧收敛并使request-render单帧不完整。
- **automatic FPS/timer adaptation**：引入跨机器阈值、wall-clock与隐式质量authority。
- **raw WebGL/PBO/final-frame TAA**：绕过Cesium Context ownership且错误覆盖整个scene。
- **Planar同步改造**：违反Globe-first顺序；Planar在A8-G后单独source-discover。

## 后果

A6-G能在不增加GPU resource category的前提下让smooth Globe camera/cloud motion复用
existing history，并让A5 shadow-length consumers共享稳定结果。代价是resolve增加少量
world-position/reprojection ALU与最多一个独立shadow-history lookup；cut frame仍有意使用
完整spatial-only输出。任何后续surface BSM temporal需求必须先有固定可复现画面并修订
本ADR，不能在执行期顺手加入。
