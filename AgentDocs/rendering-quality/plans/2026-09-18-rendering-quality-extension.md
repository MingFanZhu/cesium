# Extension Plan: Rendering Quality

## Water-quality roadmap, 2026-10-28

The owner approves improving medium optics, shoreline/crest foam and underwater
effects. Extend the former above-water scope in separate phases; preserve local
ENU, metric Planar, curved-water and river geometry, existing reflection captures
and resource ownership. SDK and hydraulic simulation remain excluded.

- R31 technically complete, owner visual gate pending: [water optics and comparison fixture](2026-10-28-r31-water-optics.md),
  separate absorption/scattering, coherent refraction and authoring presets.
  [Review](../reviews/2026-10-28-r31-water-optics.md) records verification and limits;
  its independent local checkpoint is the commit containing the R31 implementation.
- R32 checkpoint `8a5600d08a`: [editable colors and persistent FFT foam](2026-10-28-r32-water-foam.md).
  Source review narrows this checkpoint to crest history and filtered contact foam;
  stable bathymetry-driven shoreline transport remains a separate follow-up.
- R33 active: [local underwater and stable depth fields](2026-10-28-r33-local-underwater.md).
  Actual-wave projected caustics, bathymetry-driven shore foam, finite local medium
  and underside Fresnel/TIR. Mean-height immersion; wave-exact meniscus stays deferred.
  The owner-approved material follow-up after `30ec19eb80` replaces procedural
  foam detail with licensed texture films and separate relief lighting; it retains
  the concentration simulation and does not activate another phase.

- R34 technically complete, 2026-10-29: [regional Globe underwater](2026-10-29-r34-globe-underwater.md)
  extends finite underwater viewing to constant-height ellipsoid water. Reuse the
  existing chart, optical model and render schedule; varying-height rivers,
  curved bathymetry/caustics and global oceans remain excluded. R33 implementation
  checkpoints exist; its owner visual gate is retained independently. R34's
  [review](../reviews/2026-10-29-r34-globe-underwater.md) records completed strict
  GPU/browser/build checks and bounded composition cost. Owner visual acceptance
  remains open; no next implementation phase is active.

Each phase requires technical review and a separate local commit before the next.
Visual acceptance uses both worlds, shallow slopes, vertical walls, depth changes
and moving cameras. Earlier R25 cold mesh and R27 visual findings stay open.

## R30 activation, 2026-10-23

The owner requests rectangular area lighting on the existing light system after
the completed R29 and Planar depth-test checkpoints. Activate
[R30](2026-10-23-r30-rect-area-light.md): shared LTC rectangular direct lighting,
an independent both-world fixture and bounded validation. Local shadows, textured
emitters and anisotropic LTC remain outside scope. ADR-0186 records API and
single-sampler integration; previous visual gates stay recorded independently.

R30 implementation and [technical review](../reviews/2026-10-23-r30-rect-area-light.md)
are complete, with both-world/dev-release pictures, GPU evidence and public types.
Its independent local checkpoint is `02644b6ecc`. The owner visually accepts R30
on 2026-10-23 and requests the acceptance record commit. R30 is complete; merge
remains pending and no next phase is active.

## R29 activation, 2026-10-22

The owner visually accepts R28 at `023016e69c` and authorizes performance work in
[R29](2026-10-22-r29-directional-occlusion-cost.md). Preserve the accepted shading
and sampling. Profile full-frame costs and remove reproduced redundant lighting
work; do not activate a new diffuse or atmosphere algorithm. R29 is now complete:
duplicate light draws are removed with pixel-identical accepted pictures, and
remaining incremental GPU cost is documented in its review. No next phase is
activated; the R28 activation text below is historical.

## R28 activation, 2026-10-22

After R27 checkpoint `0d4b58b8a4` and the separate imagery/assessment checkpoint
`b31f09bdff`, the owner approves [R28 directional environment occlusion](2026-10-22-r28-directional-occlusion.md).
Implement optional GTSO using existing screen depth and native environment lighting.
Full directional diffuse and Planar irradiance changes remain candidates. Historical
visual/cold-build findings remain recorded; R28 is the only active implementation.

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner role: `architecture`
- Architecture review: `confirmed`
- Architecture reviewer: Current task, source-based self-review
- Created: `2026-09-18`
- Updated: `2026-09-19`
- Related discussions: None
- Related reviews: [R1 technical review](../reviews/2026-09-18-r1-planar-shadows.md)
- ADR: Related `ADR-0039`, `ADR-0054`, `ADR-0055`; R1 adds `ADR-0083`; R2 adds `ADR-0084`
- SGP: Related `SGP-0007`, `SGP-0008`, `SGP-0009`, `SGP-0010`; R1 adds `SGP-0013` and reuses `SGP-0001/0002`; R2 adds `SGP-0014`

## Objective

以当前仓库为基线，从现代实时渲染角度找出影响场景可信度的缺口，按收益依次实现。
收益同时考虑视觉变化、典型业务覆盖率、工程成本和运行开销，不以特效数量排序。
暂按桌面 WebGL2、城市与地形兼顾制定顺序；尚未获得具体硬件、分辨率和帧率预算，
不把估计成本写成工期或性能承诺。

## Non-goals

- 不重建已有物理大气、体积云、雾、云影或镜头特效。
- 不把景深、运动模糊、色差等电影效果作为 GIS 默认画质目标。
- 本轮路线图不承诺 WebGPU、路径追踪、全功能实时 GI 或所有后续候选都会实施。
- 不把素材质量、影像自带阴影或数据 LOD 跳变全部归因于后处理算法。

2026-10-21: R25 extends the existing local-water scope to regional ellipsoid rivers/lakes,
automatic bounded mesh LOD and shared FFT. Global ocean coverage and hydrodynamics remain
excluded. [R25 plan](2026-10-21-r25-curved-water.md), ADR-0179; no parallel phase.
Implementation and technical review are complete; owner visual acceptance remains pending.

After the independent R25 checkpoint, the owner authorizes [R26 directed river surfaces](2026-10-21-r26-river-surface.md).
R26's first implementation is checkpointed at `0adb7fe888`; owner feedback reopens its
white-streak and directed-wave visuals. Its coherent sine replacement at `47f56ad792`
was also rejected visually; the same phase now uses random FFT bands with local flow
orientation and separate transport/dispersion. Default artistic streaks stay off. Its owner visual gate is
pending. It adds authored channel height/current semantics on shared water rendering.
R25 visual follow-up remains recorded. Branching, waterfalls and hydraulic simulation
stay outside this extension phase. No next implementation phase is active.

## Stable architecture boundaries

- 默认保留 Cesium 的 `Viewer.shadows`、`scene.shadowMap`、`ShadowMode`、模型 PBR
  和环境光相关接口；只有无法表达新能力时才考虑新增 API。
- Globe / Planar 共用光照与后处理语义；坐标、局部上方向、深度及距离由各 World 正确提供。
- SceneGIS-owned 文件承载实现。上游只允许必要集成缝隙，每个修改必须登记 SGP。
- 不能通过移除 Planar guard 宣告兼容；必须先证明实际渲染路径、生命周期和数值约定正确。
- 每次只激活一个 phase。实现、验证、review 和独立本地提交完成后再进入下一 phase。

## Source and baseline facts

当前官方基线为 Cesium 1.144，具体版本与补丁以 `.scenegis/` 清单为准。
以下保留 R1 启动前的源码盘点；R1 实施状态与验证以 phase plan / review 为准。

| 能力               | 当前事实                                                                | 后续缺口                                                            |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 天空与介质         | SceneGIS 已有物理大气、空气透视、高度雾、体积云、云影和镜头特效         | 继续处理已有扩展的质量问题，不重复建设                              |
| 几何阴影           | Globe 有原生 ShadowMap；Planar API 仍拒绝开启，地表命令不投射或接收阴影 | Planar 建筑、模型、地形之间的投影；之后再按画面证据改善过滤和稳定性 |
| 遮蔽               | 原生 SSAO 存在，`AmbientOcclusionModulate.glsl` 把 AO 直接乘到合成色    | 遮蔽估计质量、间接光融合及天空/雾/自发光保护                        |
| PBR 与环境反射     | 原生模型 PBR 已有，SceneGIS 已接入直接光和天空漫反射                    | ADR-0054 明确未接管镜面 IBL；反射环境与新物理天空尚未统一           |
| 抗锯齿与运动稳定性 | 原生 MSAA / FXAA 可用；体积云有自己的时域历史                           | 未发现覆盖整幅场景的 TAA；须处理运动、显露区域、透明物与 LOD        |
| 色彩输出           | 原生 HDR、曝光参数、PBR Neutral / ACES 等已有                           | 在固定对比场景中核对线性合成、曝光与色调映射，避免重复处理          |
| 地表细节           | 平面有地形法线、影像组合和材质基础，模型支持 PBR 贴图                   | 近景地表法线、粗糙度、重复纹理及素材内容质量                        |

主要证据路径：

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSceneApi.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/Scene/ShadowMap.js`
- `packages/engine/Source/Scene/PostProcessStageCollection.js`
- `packages/engine/Source/Shaders/PostProcessStages/AmbientOcclusionModulate.glsl`
- `packages/engine/Source/Scene/DynamicEnvironmentMapManager.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md`
- `Documentation/SceneGIS/Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md`

`ShadowMap` 内仍有 `cartesianToCartographic` 和 `geodeticSurfaceNormal` 等球面假设。
云影只描述云对光照的遮挡，不能代替上述几何阴影。
原生动态环境贴图也不能直接视为已经包含 SceneGIS 新天空和周围建筑的反射捕获。

## Phase roadmap

R1 至 R4 是初始优先序；后续候选在前序验收后按真实场景收益重新排序。
2026-09-19 负责人验收 R3 后，要求优先评估场景反射；R6 的进入评估先于 R4，现已激活 [R6 SSR](2026-09-19-r6-screen-space-reflections.md)。
对比基线作为每个 phase 的必要工作，不单独扩展为耗时的全引擎重构。

| Phase | Objective                                                   | Dependencies                         | Entry gate                                                            | Exit gate                                                           | Status    | Phase plan                                      |
| ----- | ----------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- | ----------------------------------------------- |
| R1    | 几何阴影：优先补齐 Planar 原生 API 兼容，再依据证据处理质量 | 现有物理光照、World 和原生 ShadowMap | 重新追踪阴影派生命令、深度、局部上方向及接收路径；建立有限 phase plan | 模型/地形投射接收正确，开关和销毁可靠，Globe 无回归，视觉与性能验收 | completed | [R1](2026-09-18-r1-planar-shadows.md)           |
| R2    | 高质量环境遮蔽：接触处与凹槽的空间感                        | 深度与必要表面信息、正确光照合成位置 | 比较原生 SSAO 与 GTAO 类候选，明确可在 WebGL2 承担的方案              | 遮蔽改善可见，无明显轮廓黑边，不错误压暗天空/雾/自发光，开销有界    | completed | [R2](2026-09-18-r2-ambient-occlusion.md)        |
| R3    | 物理天空与镜面 IBL 一致                                     | 现有天空辐亮度和原生 PBR 环境接口    | 明确捕获/预过滤来源、更新频率、调用方环境覆盖和资源所有权             | 不同粗糙度材质反射一致，昼夜更新稳定，保留显式用户环境配置          | completed | [R3](2026-09-19-r3-sky-reflections.md)          |
| R4    | 全场景抗锯齿与时间稳定性                                    | 经验证的深度/相机路径、静态画面基线  | 先验证 MSAA / FXAA；再用运动片段判定 TAA 的收益与集成成本             | 已验收 camera-only TAA；独立物体运动限制保留在 phase plan           | completed | [R4](2026-09-20-r4-temporal-antialiasing.md)    |
| R5    | 地表材质与近景细节                                          | 地形法线、素材和现有材质接口         | 用可控素材区分数据问题与渲染问题                                      | 近景尺度与粗糙度可信，远近过渡合理，纹理开销有界                    | candidate | None                                            |
| R6    | 屏幕空间反射；水面和其他局部反射保留后续候选                | 已验收 IBL、深度、材质粗糙度         | 明确前向材质捕获与 IBL 融合边界                                       | 两个 World 的不透明 PBR 倒影、回退和生命周期正确，视觉及成本验收    | completed | [R6](2026-09-19-r6-screen-space-reflections.md) |
| R7    | 夜景局部光与更完整间接照明                                  | 材质、曝光、光源需求与帧预算         | 基于夜景/室内实际场景决定局部灯或 GI 的优先级                         | 真实场景提升覆盖其带宽、阴影和资源成本                              | completed | [R7](2026-09-19-r7-local-lights.md)             |

R2 的 AO 原则上影响间接光，不应把最终合成颜色整体压暗当作物理融合完成。
R4 不能只复用云的历史缓冲；整幅场景的动态物体、显露区域和标签需要独立论证。
R6 的 SSR 只能利用当前屏幕已有信息，不能取代完整的环境反射来源。

## Cross-phase validation

- 每阶段选取少量固定视角和一段可重复的相机运动，对比开启/关闭或原实现/新实现。
- 覆盖 Globe / Planar 的适用路径、典型建筑与地表接触、至少一种不同粗糙度材质。
- 明确 GPU/分辨率/质量设置后记录该能力的帧耗时和资源增量，不预先虚构毫秒预算。
- 自动化测试针对阶段的真实失败模式；热路径还需资源销毁与开关恢复证据。
- 画质由可复现场景及负责人视觉判断验收；不以大量代理数值代替可见效果。
- 修改公共 API 或渲染管线时按仓库要求完成对应构建、类型检查、ADR/SGP 与评审。

## Global risks and dependencies

- 巨大坐标范围、对数深度、多视锥和瓦片 LOD 与游戏引擎假设不同，不能直接移植算法。
- 当前暂按城市与地形兼顾；若优先纯远景，R2 收益下降，地表与反射顺序应调整。
- 地理影像含烘焙阴影、模型缺少法线/粗糙度时，需要素材治理，不能只靠渲染补偿。
- 当前工作区包含既有修复，后续实现必须保留其所有权并建立独立阶段提交边界。

## Overall acceptance criteria

每个被激活阶段都必须有明确画面目标、足够的自动化证据、运行成本记录、负责人视觉
验收和独立提交；不会把未实现的 candidate 标记为已支持。
API 尽量沿用原生，所有 upstream-owned 修改及剩余限制可追踪。

## References

- [Filament rendering model](https://google.github.io/filament/main/filament.html): PBR、IBL、间接光遮蔽和后处理顺序。
- [Cesium PostProcessStageCollection](https://cesium.com/learn/cesiumjs/ref-doc/PostProcessStageCollection.html): 原生后处理能力；实际行为以本仓库基线为准。
- [Cesium DynamicEnvironmentMapManager](https://cesium.com/learn/cesiumjs/ref-doc/DynamicEnvironmentMapManager.html): 原生环境贴图能力与参数。
- [Intel XeGTAO](https://github.com/GameTechDev/XeGTAO): AO 参考实现；其 HLSL/compute 路径不能直接作为 WebGL2 方案。
- [Unreal Engine temporal super resolution](https://dev.epicgames.com/documentation/unreal-engine/temporal-super-resolution-in-unreal-engine): 时域历史、运动信息与拖影问题的工程参考。

## Progress and handoff

- R1 已实现稳定四级 Planar CSM，技术自审与有限 GPU / API / 球面回归见对应 phase plan 和 review。
- R1 负责人验收通过并提交 `4ea24b89ef`；此前已验收集中修复独立保存为 `2d590726af`。R2 已于 2026-09-19 随负责人继续 R3 的指令确认验收。
- 其余阶段保留粗粒度目标，进入时重新检查源码事实。

R1 checkpoint: `4ea24b89ef`. R2 checkpoint: `c824cfec1e`. [R3 sky reflections](2026-09-19-r3-sky-reflections.md) completed technical review and explicit owner visual acceptance on 2026-09-19. R3 checkpoint: `2e2dc02ce6`. [R6 SSR](2026-09-19-r6-screen-space-reflections.md) completed technical review and explicit owner visual acceptance on 2026-09-19. Next requested priority: local water rendering; activate its phase after the R6 checkpoint.

## R8: Local water priority

After explicit R6 acceptance and checkpoint `f9301bf8cd`, the owner selected lakes, rivers and pools.
[R8 Local water](2026-09-19-r8-local-water.md) is completed and owner accepted, ahead of R4. Dependencies are accepted R3/R6.
Entry: verified native Water and opaque capture boundaries. Exit: both-world transmission, reflection,
shallow transitions, lifecycle, bounded GPU cost and visual acceptance. Ocean rendering remains a candidate.

## R9: Photogrammetry comparison priority

R8 checkpoint: `b4a27c7358`. The owner confirms that typical content is photogrammetry with baked
textures; detailed PBR material work mainly concerns added GLBs. Activate the
[R9 public-data reference scene](2026-09-19-r9-reference-scene.md) before further runtime effects.
Subsequent priorities are shadow quality, indirect lighting, reflection completeness and local
night lighting, with an independent example page for each effect as well as this common scene.
R4 temporal work and R5 terrain material work are deferred in this ordering. Cloud reflections
remain deferred by the owner because of their cost. Existing phase identifiers retain their meaning.

R9 is owner accepted on 2026-09-19. The next requested phase is shadow refinement (item 4 in the
visual priorities, distinct from the retained R4 temporal phase identifier).

R9 checkpoint: `f6028f6606`. [R10 shadow refinement](2026-09-19-r10-shadow-refinement.md) is active:
shared stable directional cascades, continuous PCF and geometric receiver-plane correction,
with an independent example and both-world verification. Existing native APIs remain the controls.
Implementation and technical review are complete. After the zoom fix, the owner advanced to direct-only
shadow lighting; checkpoint R10 before activating that phase. See the [R10 review](../reviews/2026-09-19-r10-shadow-refinement.md).

R10 checkpoint: `c2e8127dcc`. [R11 direct shadow lighting](2026-09-19-r11-direct-shadow-lighting.md)
is active at the owner’s request, before probes/GI. Preserve indirect light and emission while
keeping native shadow controls, resources and both-World behavior.

R11 implementation and technical review are complete. The owner advanced to multi-light and
emissive night rendering on 2026-09-19; checkpoint R11 before activating the next phase.

R11 checkpoint: `a94a3232fb`. Activate the existing R7 candidate as
[R7 local night lighting](2026-09-19-r7-local-lights.md). The bounded phase covers point/spot
lights and existing material emission, with local shadows and probes/GI deferred. Native HDR
bloom precision is corrected after a reproduced night-scene banding failure.

R7 technical implementation and review are complete. On 2026-09-19 the owner redirected
work to profiling a saved real-data Viewer scene. Preserve R7 in an isolated checkpoint
before that work; explicit night-example visual acceptance remains a follow-up.

R7 checkpoint: `f1a002ae46`. The [real-scene performance maintenance](2026-09-19-real-scene-performance.md)
removes repeated full-source cache-key work from owned AO/SSR command derivation. Technical
review and bounded verification are complete; no rendering feature or quality setting changes.

Performance maintenance checkpoint: `cbd429e11b`. Current-view follow-up reproduces 8–9 FPS with
all effects and approximately 39 FPS without AO/SSR/shadows/environment. The owner authorizes
[R12 main-pass MRT reflections](2026-09-19-r12-main-pass-reflections.md): remove redundant opaque
shading with existing native material semantics and APIs. AO depth sharing and shadow scheduling
remain subsequent candidates, entered only after this phase's verification and checkpoint.

R12 implementation, verification and architecture/code self-review are complete. The qualified
real scene eliminates 1574 SSR capture draws and paired frame time falls by 25–27%; total frame
rate remains about 9–11 FPS with all effects. MRT memory cost and native compatibility routes are
explicit in the [R12 review](../reviews/2026-09-19-r12-main-pass-reflections.md). Owner visual
acceptance is pending. Preserve this phase in its independent checkpoint before activating further
performance work; AO prepass and shadow/draw submission costs remain candidates, not active scope.

R12 checkpoint: `3df2db9e84`. The owner requests continued AO, cascade and submission optimization.
Activate [R13](2026-09-19-r13-pass-submission.md) using the verified native uniform-cache precision,
depth-lighting and tile cascade-culling facts. R12 explicit visual acceptance remains pending.

R13 implementation and technical self-review are complete. [Review](../reviews/2026-09-19-r13-pass-submission.md)
records unchanged quality settings, 1494 fewer cascade draws per frame and about 68% lower paired
frame time (approximately 19 FPS). Owner visual review is pending. No new phase is active; preserve
R13 in an independent local checkpoint before any further pass sharing or batching.

R13 checkpoint: `6b472fa2e4`. The owner authorizes [R14 main-pass AO MRT](2026-09-19-r14-main-pass-ao.md),
sharing current main depth and exporting indirect contributions so qualified AO needs no geometry
prepass. Keep AO-only operation, material light separation, native MSAA and special-path contracts.

R14 implementation and technical review are complete. Its [review](../reviews/2026-09-19-r14-main-pass-ao.md)
records zero AO geometry on qualified main MRT, about 18% lower paired frame time and the attachment
memory tradeoff. Owner visual review remains pending. No following phase is activated.

## R4 activation after R14

R14 checkpoint `31ba432cc8` is owner accepted on 2026-09-20. Activate
[R4](2026-09-20-r4-temporal-antialiasing.md) to compare optional TAA with MSAA under MRT.
Preserve camera semantics, phase identifiers and a separate visual example.

R4 implementation and [technical review](../reviews/2026-09-20-r4-temporal-antialiasing.md) are
complete. Optional TAA has both-world examples and bounded storage savings; the fixed real-view
frame time did not materially improve. Owner visual review is pending, and no later phase is active.

R4 checkpoint `9255216681` was reopened on 2026-09-21 for wheel-zoom instability. The owned
resolve now retains actual surface depth and adapts a pinned Filament implementation. The
[follow-up review](../reviews/2026-09-21-r4-temporal-reference-adaptation.md) records motion,
static, lifetime and GPU-cost verification. Technical correction is complete; owner visual
re-acceptance remains pending. No new phase or upstream seam is introduced.

On 2026-09-21 the owner accepted correction checkpoint `c3add1660a` as usable. R4 is closed
with its documented moving-content limits. Further GI/probe quality directions are under
discussion only; no next implementation phase is authorized or active.

The owner subsequently approves [R15 PBR reference scene](2026-09-21-r15-pbr-reference-scene.md)
on 2026-09-21: official Intel Sponza plus a separately identified material/water composite.
Keep both-world APIs, fixed visual comparisons and independent future effect examples. This
phase assembles existing capabilities and explicitly records unsupported glass extensions;
GI and transmission renderer implementation remain future candidates.

R15 implementation and [technical review](../reviews/2026-09-21-r15-pbr-reference-scene.md)
are complete. Both-world main/composite pages use pinned local PBR assets, fixed cameras,
lighting and reversible effects. Explicit 2K delivery controls the measured source texture
budget; original 4K remains available. Five dedicated checks pass. Owner visual acceptance
is pending, and no further rendering phase is active.

The owner accepts R15 physical-atmosphere controls and subsequently requests standard GIS
navigation restoration. Both-world example follow-up checks pass; no engine/SGP change is needed.
Sponza remains a material fixture, while the owner prepares a more representative street model
using UE/Blender. Asset replacement was not implemented in that checkpoint.

The owner now supplies Bistro geometry and its original FBX/texture archive. Activate
the [R15 Bistro follow-up](2026-09-21-r15-bistro-scene.md): restore documented source
material channels in a separate local derivative and replace the default composite
architecture with a GIS street fixture. No new renderer phase or engine seam.

The Bistro follow-up is technically complete: source geometry is retained, source ORM and
normal conventions restored in an explicit 1K local derivative, and the default composite
loads the street in both Worlds. Three Bistro checks and the previous Planar Sponza composite
regression pass. Owner visual acceptance remains pending; no later renderer phase is active.

Bistro checkpoint `388a4d8162` receives a focused R15 correction after the owner reports
railing white speckles. The native derivative normal calculation divides by singular UVs.
The one-shader correction preserves geometry normals on those faces and retains normal
maps on valid UVs. `SGP-0023` / ADR-0095 and the existing Bistro plan/review track bounded
GPU validation and unchanged-view evidence. Technical correction is complete; owner
visual acceptance remains pending, and no subsequent renderer phase is activated.

On 2026-09-28 the owner approves [R16 Cycles calibration](2026-09-28-r16-cycles-calibration.md).
Establish a same-asset, matched-camera/light/output reference and inspect material and
AA/SSR contributions before changing lighting algorithms. Local probes, indirect lighting,
glass and foliage remain subsequent candidates, with no implementation activated yet.

R16 implementation and [review](../reviews/2026-09-28-r16-cycles-calibration.md) complete:
matched Cycles full/direct reference, independent comparison and diagnostic exports, six
focused checks, and a confirmed Bistro unused-AO binding correction. Source roughness and
cross-renderer transport limits are explicit. Owner visual acceptance is pending; no next
phase is active. Form the local R16 checkpoint before further implementation.

## R17: Local environment probes

After R16 checkpoint `f66ce0238c`, the owner selected environment occlusion and specular
probes, with runtime capture requested explicitly after model loading or light edits.
[R17](2026-09-28-r17-local-probes.md) is technically complete;
[review](../reviews/2026-09-28-r17-local-probes.md) records validation and remaining limits.
Owner visual acceptance is pending. Entry: complete standalone model commands
and existing physical-sky PBR. Exit: both-world cached capture, source composition,
state/lifecycle correctness, independent example, Bistro controls and bounded cost evidence.
Diffuse bounce and streaming tile capture remain outside this phase. ADR-0096 / SGP-0024.

## R18: Screen-space reflection efficiency and stability

After R17 checkpoint `5972618214`, the owner prioritizes screen-space effects for GIS
and approves [R18](2026-09-28-r18-screen-space-reflections.md). Retain optional manual
probes, defer dynamic probes and diffuse GI. Adapt published AMD SSSR/denoiser designs
to existing WebGL2 MRT; verify quality, history lifecycle and GPU cost before accepting.
Future rendering stages should first consult GPU-vendor references and record revision,
license and platform differences. AO improvements and effect-budget integration are later
candidates and are not active implementation scope.

R18 implementation and [review](../reviews/2026-09-28-r18-screen-space-reflections.md) are complete.
Both-world SSR history/reconstruction and independent controls pass bounded GPU/E2E and release/type
checks. Measured isolated SSR time improves 37–62%, with additional history storage and explicit
screen-space limits. Owner visual acceptance is pending; no next phase is active.

## R19: Geometric specular antialiasing

After R18 checkpoint `8d27a60feb`, the owner requests Three.js-inspired highlight
filtering. Activate [R19](2026-09-28-r19-specular-antialiasing.md): optional shared
PBR geometry roughness, independent both-world fixture and Bistro control.
Retain accepted TAA and authored flat mirrors; no postprocess rewrite or GI.
Exit: material/clearcoat integration, lifecycle, bounded performance and review.
ADR-0098 / SGP-0025 track the native integration seams.

R19 implementation and [review](../reviews/2026-09-28-r19-specular-antialiasing.md)
are technically complete: direct/IBL/SSR roughness agreement, unchanged flat
mirrors, 20 dev Specs, eight release Specs, two E2E checks and bounded GPU timing.
Owner visual review remains pending; no following phase is active.

## R20: Bounded screen-space indirect diffuse

After R19 checkpoint `d68562fbc5`, the owner authorizes an optional SSIL prototype.
Activate [R20](2026-09-28-r20-screen-space-indirect-lighting.md): main-pass diffuse
inputs, finite visibility sectors, bilateral reconstruction and independent fixture.
This expands the earlier deferred diffuse scope only to one local screen-space
bounce. Full GI, dynamic probes and renderer replacement remain outside scope.

R20 implementation and [review](../reviews/2026-09-28-r20-screen-space-indirect-lighting.md)
are technically complete: bounded diffuse transport, shared main MRT, 13 feature
cases, 39 regressions, two E2E cases and release/types. Measured GPU increment is
approximately 1.1 ms at the documented Bistro configuration without more geometry
submissions. Owner visual acceptance remains pending; no next phase is active.

## R21 activation — 2026-09-28

After R20 checkpoint `2bd5a2598f` and owner acceptance, activate
[R21 global auto exposure](2026-09-28-r21-auto-exposure.md). Reuse native tone
mapping with bounded GPU histogram metering; local exposure remains deferred.

R21 implementation and technical review are complete; see its linked review for GPU/regression, release/type and performance evidence. Owner visual review is pending. No subsequent phase is active.

### R4 Bistro stability follow-up, 2026-09-28

The owner reopens accepted R4 for stationary subpixel flicker. The existing phase now
records the corrected previous-jitter depth footprint and Filament luminance weighting.
Implementation and [self-review](../reviews/2026-09-28-r4-bistro-flicker.md) are complete,
with 13 dev/release Specs and bounded GPU evidence. No new phase or upstream seam; owner
visual acceptance is pending.

### R22: Wind-driven lake waves

The owner prioritizes large lake/river surface geometry over occlusion culling. Activate
[R22](2026-09-28-r22-wind-water.md) after checkpoint 5ee8b9b3af: reusable spectral wind
waves, existing water optics, bounded mesh detail and a standalone Xuanwu Lake example.
Entry: R8 ownership/render paths verified. Exit: physical controls, actual displaced
geometry, both-world regressions, visual/performance evidence and independent checkpoint.

R22 implementation and [technical review](../reviews/2026-09-28-r22-wind-water.md) are complete. Owner visual acceptance is pending; no subsequent phase is active.

## WebGL quality priority — 2026-10-12

The owner selects WebGL as the near-term quality backend and explicitly confirms
`scenegis/develop` (`2f6d4ce30b`) as the branch base. The independent
[shared-fix backport](2026-10-12-webgl-fix-backport.md) precedes new picture-quality work.
Preserve prior visual gates and the deferred WebGPU/P4n branch. Next, establish a fixed
Bistro direct-light, sky/environment, shadow, material and HDR/exposure baseline; evaluate
AO, reflections and SSIL by visible benefit afterward. No new implementation phase is
activated by the backport.

After backport checkpoint `16422ff2f4`, the owner authorizes
[R23 street lighting](2026-10-12-r23-webgl-street-lighting.md). First qualify native
direct/environment balance, shadow visibility/precision and HDR exposure on the same
Bistro asset and fixed views. Existing controls are preferred; new algorithms and
physical/API semantic changes require a separate decision. Older visual gates remain
recorded independently. R23 is the sole active implementation phase.

R23 is complete and owner accepted; [review](../reviews/2026-10-12-r23-webgl-street-lighting.md)
records three passing E2E cases, matched restaurant images and unchanged default GPU/
shadow-storage cost. On 2026-10-12 the owner authorizes its checkpoint and continued work.

After R23, [standalone UI/location maintenance](2026-10-12-street-controls-and-location.md)
fulfills the owner's request for direct advanced-environment controls and a Greenwich
spring-equinox placement. Three related E2E cases pass; no new quality phase is activated.

### WebGIS reflection scope, 2026-10-12

The owner prioritizes frequently changing WebGIS scenes without an editor/runtime split.
The [street scope maintenance](2026-10-12-street-reflection-scope.md) removes local probe
capture from the Bistro workflow while preserving optional engine infrastructure, tests
and reference examples. Dynamic placement/refresh is deferred; current WebGL quality work
prioritizes material response, sky/environment reflection and SSR. No diffuse GI phase is
activated, and the earlier R17 technical results and outstanding visual limits remain valid.

### R24: HDR picture controls, 2026-10-12

After checkpoint `69c3f4f098`, the owner authorizes white balance, contrast, saturation
and neutral/clear/soft-film presets. [R24](2026-10-12-r24-color-grading.md) adds optional
grading inside native tone mapping, preserving existing exposure and lighting APIs.
No new color pass, LUT, automatic white balance or GI work. Earlier independent visual
gates remain recorded.

R24 is complete and owner accepted: [review](../reviews/2026-10-12-r24-color-grading.md)
records GPU/E2E/build/type/ownership verification and bounded cost. On 2026-10-12 the owner
accepts the street picture controls and presets and authorizes their independent local
phase checkpoint. No next implementation phase is active.

After R24 checkpoint `2e09227156`, [night emission maintenance](2026-10-12-street-night-emission.md)
addresses the owner's weak-glow report. Source emission is intact; optional bloom uses
a threshold above its range. Qualify example parameters in both Worlds without changing
the renderer, authored materials, accepted daytime picture or deferred GI scope.
Both-world verification and review are complete. The owner visually accepts the street
bloom adjustment on 2026-10-13; form its independent checkpoint with no next phase active.

### R26 acceptance, 2026-10-21

The owner visually accepts random directional river waves at `c6a5da44d2`. R26 is
complete; inherited synchronous mesh construction remains an open limitation. The
owner requests lake-wave quality improvements as the next separate scope.

### R27 activation, 2026-10-21

After acceptance checkpoint `32dc94f984`, activate
[R27](2026-10-21-r27-lake-wave-quality.md) / ADR-0181 for broader directional wind
waves and a separate ripple band. The curved-lake example is the primary owner
acceptance case. Preserve the accepted private river spectrum and existing optics.

R27 implementation and technical review are complete. The
[review](../reviews/2026-10-21-r27-lake-wave-quality.md) records directional/fine-band
coverage, GPU and storage cost, and retained cold-build limitations. Owner visual
acceptance remains pending; no next phase is activated.
