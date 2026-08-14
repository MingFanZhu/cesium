# Extension Plan: Atmosphere, Clouds, and Environment Effects

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner roles: Architecture Agent, Execution Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Branch: `feature/atmosphere-clouds-effects`
- Current phase: A2 — Bruneton atmosphere and aerial perspective（`active`）
- Active phase plan:
  [2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md](2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md)
- Latest completed phase plan:
  [2026-08-14-phase-a1-render-foundation.md](2026-08-14-phase-a1-render-foundation.md)
- Architecture decisions:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md)
- Upstream patch: active `SGP-0008`
- A1 implementation: `completed`

## Goal

在 Cesium 1.144 上建立 SceneGIS-owned、可升级、可测试的现代 outdoor environment rendering stack，同时覆盖 native Globe 与
`SceneGISPlanarWorld`：

- physically based Rayleigh/Mie/ozone atmosphere 与 Sun disk；
- geometry-aware aerial perspective；
- artistic exponential height fog，并能与 physical atmosphere一致合成；
- volumetric cloud density、lighting、weather/noise、ground shadow；
- crepuscular rays / god rays；
- HDR bloom、ghost/halo lens flare；
- temporal stabilization、quality tiers、性能/资源预算与完整 build/package delivery。

“同样支持”定义为两种 World 提供同一 feature family、quality/profile 与 lifecycle semantics；几何模型分别正确，不要求球面与
平面输出相同像素。

## Stable boundaries

### In scope

- SceneGIS-owned shader、renderer、resource owner、quality profile、temporal state 与 public Controller。
- Globe ellipsoid-radial atmosphere shell/cloud shell 与 planar fixed-axis layered slab/cloud layer。
- shared optical coefficients、Sun/light authority adapter、LUT/noise interfaces、HDR compositor 与 debug/qualification modes。
- depth-aware geometry attenuation、request-render integration、resize/context loss/destroy、WebGL capability guards。
- license/provenance manifest、offline asset generation、dev/release/installed npm/root delivery、中文 direct Test 与 focused E2E。
- 为正确 HDR 时序所必需的最小 upstream `Scene.js` hook，登记为独立 `SGP-0008`。

### Out of scope

- weather simulation、precipitation、fluid dynamics、local cloud authoring editor与 arbitrary local volumetric-light framework。
- 修改 Cesium native `SkyAtmosphere`、`Fog`、`SunPostProcess` 或用 prototype/global/load-order 技巧替换它们。
- raw `Context._gl`、浏览器私有 PBO、外部 `three`/GUI runtime dependency、运行时公网 shader/texture fetch。
- WebGPU renderer、mobile/WebGL1 parity、XR-specific reprojection、full spectral path tracing。
- 复制参考仓库的二进制资源、shader 或代码而不进行独立 provenance/license/format 审计。

## Architecture invariants

1. **Pass graph**：advanced background在 ordinary geometry 前；aerial/cloud/fog/lens optical composite在 resolved scene color/depth
   之后、Cesium built-in bloom/tone mapping之前。Pick/shadow/classification/offscreen pass不得误执行。
2. **Reference frames**：Globe只使用 ellipsoid center/radii/radial altitude；planar只使用 fixed ENU axes、显式 base height 与
   resident planar terrain。不得从数值范围、CRS或 `Camera.positionCartographic` 推断模式。
3. **Ownership**：每个 GPU resource 属于一个 Cesium `Context`与一个 SceneGIS owner；candidate 完整成功后才发布，destroy exactly
   once。不得让 SceneGIS-owned resource 泄漏到 native Scene slots，也不得销毁 caller-owned environment/skybox。
4. **Disabled fast path**：默认关闭时零 LUT/noise/FBO/temporal allocation、零额外 command、零常驻 listener/timer/network，且不改变
   existing Globe/planar pixels。
5. **Time**：只消费 Cesium Clock/ControllerHost明确传入的 simulation time。Cloud animation停止、seek与 request-render语义必须可测，
   不读取 system time 建立第二 authority。
6. **Assets**：runtime asset必须随 dev/release/installed packages可寻址；生成器与 source/provenance可重现，生成物边界明确，禁止依赖
   本机残留或临时 clone。
7. **Failure atomicity**：unsupported capability、shader compile、asset decode、resize或 framebuffer allocation失败不得发布半成品、
   覆盖上一帧稳定资源或静默降为错误坐标模型。

## Phase roadmap

### A1 — Render foundation and dual-world frame contract (`completed`)

实现 approved ADR-0040 的 background + linear-HDR slots、private pipeline lifecycle、Globe/planar reference-frame publication 与
order/pick/resource identity Specs；不增加可见效果或 public API。Implementation、Architecture review与本地checkpoint均已完成；
A2已在独立planning checkpoint中激活。

### A2 — Bruneton atmosphere and aerial perspective (`active`)

依据
[A2 phase plan](2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md)与ADR-0041冻结public Controller、capability/fallback、
resource与package contract。Globe交付combined Bruneton LUT physical sky/Sun/aerial；planar交付共享physical coefficients但几何独立的
fixed-axis flat-slab sky/Sun/aerial。A2只消费既有SGP-0008，并在Architecture review、项目负责人manual gate与独立checkpoint前停止。

### A3 — Exponential height fog

增加一至两层 exponential height density、directional inscattering 与 atmosphere-aware composition；Globe使用radial height，planar使用
fixed Z。保持与 native Fog 的明确互斥/降级边界。

### A4 — Volumetric cloud core

增加 Globe shell / planar layer raymarch、shape/detail/weather/noise、Sun lighting、quality tiers和基础运动，不提前承诺 shadow 或
temporal算法细节。

### A5 — Cloud shadows and crepuscular rays

增加 cloud transmittance/shadow representation、ground shadow 与 atmosphere/cloud/fog统一的 crepuscular rays。阶段开始时根据
Cesium shadow/depth源码决定是否需要新的 integration seam；不得在 extension plan猜测。

### A6 — Temporal stabilization and performance tiers

为 clouds/volumetrics增加 Cesium Renderer-owned temporal history、jitter/reprojection、disocclusion/reset与明确的 quality/resource
budgets；不直接采用 raw WebGL PBO readback。

### A7 — HDR bloom and lens flare

增加 bright-source threshold、bloom、ghost/halo/lens artifact与遮挡，保持在 linear-HDR compositor内并与 native `sunBloom`、
`SunPostProcess`明确互斥。

### A8 — Unified qualification and delivery

完成 dual-world visual matrix、performance/resource evidence、build/types/docs/npm/root package、中文 direct Test、focused E2E、upgrade
checklist、manual gate与扩展收口。A8 不补做前序 phase 遗留的核心正确性。

## Global acceptance criteria

- Globe 与 planar representative scenes均可独立启用同一 capability family，并以正确 geometry adapter完成地面、空中和近空间视角。
- Atmosphere/cloud/fog/god rays/lens flare在 HDR、depth、Sun/time、native-effect conflict 与 transparency边界上组成一条确定管线。
- Disabled/fallback/warm paths有像素、command、request、allocation与destroy证据；没有 raw GL state leak或永久render loop。
- 每个 quality tier报告确定的 texture/FBO/step/history预算；性能以相对基线和命令/样本预算评估，不建立跨机器绝对 FPS gate。
- 所有 shader、asset、source/license、generated boundary、dev/release/installed packages 与 direct Test均可从干净 checkout复现。
- 所有 upstream-owned hunk有 paired SGP、focused Specs、ADR与独立 removal condition；generated status=`0`。

## Cross-phase risks

- Bruneton高维 LUT 和 cloud 3D/noise asset可能带来数十 MB download/VRAM；必须先测 format、half-float、packing和压缩再定默认质量。
- Cesium depth/OIT/MSAA/HDR framebuffer路径组合复杂；A1必须锁定 resolved input与resize/context lifecycle，不能等到cloud phase补救。
- Planar atmosphere并非 spherical Bruneton公式的参数替换；若 slab approximation缺少物理依据，必须明确标为独立模型与视觉误差，不能宣称
  与 Globe完全物理等价。
- Temporal history与 request-render、Clock seek、camera teleport、dynamic resolution互相耦合；A6前各phase不得私建不兼容history。
- Native Globe sky/fog/sun bloom与 advanced effects双重执行会产生错误能量；public phase必须 fail-fast或提供显式、可恢复的authority切换。

## Phase gate

所有 phase 严格串行。Execution完成实现与最小充分验证后写 review-ready handoff并停止；Architecture review批准、项目负责人要求的
manual gate通过且 Architecture建立独立本地 checkpoint后，才可创建/激活下一 phase。不得合并多个 phase提交。
