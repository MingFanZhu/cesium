# Extension Plan: Rendering Quality

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
| R4    | 全场景抗锯齿与时间稳定性                                    | 经验证的深度/相机路径、静态画面基线  | 先验证 MSAA / FXAA；再用运动片段判定 TAA 的收益与集成成本             | 细线/高光闪烁下降，移动物体与标注清晰，拖影和 LOD 历史污染可控      | proposed  | None                                            |
| R5    | 地表材质与近景细节                                          | 地形法线、素材和现有材质接口         | 用可控素材区分数据问题与渲染问题                                      | 近景尺度与粗糙度可信，远近过渡合理，纹理开销有界                    | candidate | None                                            |
| R6    | 屏幕空间反射；水面和其他局部反射保留后续候选                | 已验收 IBL、深度、材质粗糙度         | 明确前向材质捕获与 IBL 融合边界                                       | 两个 World 的不透明 PBR 倒影、回退和生命周期正确，视觉及成本验收    | completed | [R6](2026-09-19-r6-screen-space-reflections.md) |
| R7    | 夜景局部光与更完整间接照明                                  | 材质、曝光、光源需求与帧预算         | 基于夜景/室内实际场景决定局部灯或 GI 的优先级                         | 真实场景提升覆盖其带宽、阴影和资源成本                              | active    | [R7](2026-09-19-r7-local-lights.md)             |

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
