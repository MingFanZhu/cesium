# Review: directional environment occlusion assessment

## Metadata

- Type: assessment and technical self-review; status: completed, implementation not activated.
- Created/updated: 2026-10-22; author/reviewer: current architecture/execution task.
- Target: `scenegis/develop` at `acd9cddbb0`, including the separate, uncommitted Globe-reference imagery fix.
- Plan: [bounded assessment](../plans/2026-10-22-directional-occlusion-assessment.md).
- Predecessor: [material/lighting audit](2026-10-22-material-lighting-audit.md).
- Related: ADR-0084, ADR-0093, ADR-0158, ADR-0161; existing SGP-0014/0010/0015/0046.
- Modified upstream-owned files / SGP: none in this assessment. No production rendering or default changes.

## Recommendation

值得做一个可关闭、范围受控的实现，优先改善近中距离建筑的环境反射漏光。
它对檐下、墙角、凹槽和粗糙金属更有价值，对高空影像、大面积开阔地表收益有限。
当前 Bistro 画面以粗糙非金属为主，不能仅凭该场景承诺显著提升。
这项能力应在现有 AO 上扩展，避免另加一套重复的深度搜索。

建议先计算 visibility bent normal 和可见锥，用于方向性环境反射遮蔽（GTSO）；
漫反射暂时保留已有标量 AO。随后再评估完整方向性漫反射，其中平面的方向性天空
照度是实际前置缺口。该建议是实施顺序，不是已激活的多个 phase。
下一次实施需按当时源码建立 phase plan，形成 ADR，并核对所需上游 SGP 集成缝隙。

Bent normal 表示未遮挡环境方向的加权平均，不是修改模型法线。
它与遮蔽比例一起描述一个近似可见区域，再与粗糙度决定的反射范围相交。
因此可以区分“反射朝向墙内”和“反射朝向开放天空”；当前单个 AO 值无法做到这一点。
该近似仍不能完整表达多个互不相连的开口，也不替代场景反射、直接阴影或 GI。

## Current source facts

### Sampling, normals and ownership

- `_SceneGISAmbientOcclusion.js` 复用原生 `ambientOcclusion` 控件，由 SceneGIS
  状态管理资源。当前路径使用 deferred 不透明深度；本次两种世界均无额外深度几何重绘。
- `SceneGISAOEstimate.glsl` 的 8 个方向由 4 个切片、每片两侧构成，每侧 8 次采样，
  共 64 次径向深度读取，另有几何法线重建读取。现有 horizon 信息可以用于方向矩计算。
  当前输出是 `RGBA8 = visibility + geometry normal`，后三通道并非 bent normal。
- `SceneGISAOFilter.glsl` 使用 5×5 深度/几何法线双边滤波，最后写入 `R8` 标量可见度。
  不能直接将原法线替换为 bent normal：同一平面上不同遮挡方向不应形成虚假的几何边界。
  后续方向滤波需保留几何引导和有效权重，避免归一化零方向或跨墙混合。
- 计算在 eye space 进行，可以共用 Globe / Planar。进入环境查询时必须显式转换到
  对应环境坐标系，不能把大世界坐标直接用于方向精度敏感的计算。

### Lighting and composition

- `_SceneGISLightingMrt.js` 当前输出材质加权后的间接光 RGB，合成时增加
  `(visibility - 1) * indirect`。这个总量包含漫反射和环境高光，无法事后分别改方向。
- `_SceneGISDeferredLighting.light` 在 lighting groups 前调用 `_captureDepth`。
  这是候选接入点：在对应不透明深度就绪后、材质光照执行前计算方向性可见度，
  避免为获得新的光照结果重画几何。不能仅把当前末尾 resolve 的 AO 纹理换成方向纹理。
- `LightingStageFS.glsl` / `ImageBasedLightingStageFS.glsl` 保留原生 PBR、显式 IBL、
  clearcoat、各向异性和环境因素。应只在环境分量附近添加窄 hook；不能替换
  `material.normalEC`，否则会同时改变太阳 BRDF、normal map 和 SSR。
  原生各向异性代码中的 `bentNormal` 是反射法线构造，不能与 visibility bent normal 混用。
- `SceneGISSSRComposite.glsl` 当前将标量 AO 同时用于间接光与 SSR replacement correction。
  改为 GTSO 时必须重新核对这一关系。以 `c` 为 SSR confidence、`S` 为环境可见度，
  目标混合为 `(1-c) * S * environment + c * tracedReflection`，材质权重保持一致。
  若基础环境已乘 `S`，替换量应为 `c * (tracedReflection - S * environment)`。
  不能把只针对环境的遮蔽再盲目乘到已命中的 SSR；radiance capture 和 clearcoat 同样受影响。
- SSIL 的接收端间接反弹独立合成，不能再次作为环境高光压暗。太阳直射、emission、
  天空背景和透明表面也不应因新增屏幕方向遮蔽而被整体调暗。

### A real Globe / Planar difference

`SceneGISModelEnvironmentLighting.glsl` 的 Globe 路径通过
`SceneGISGlobeDirectionalSkyIrradiance` 查询法线方向相关的天空照度；其 atlas 包含高度、
太阳方向、法线方向及相对方位信息。

Planar 的 `sceneGISPlanarSkySource` 则主要依据 `normalWC.z` 混合上半球天空与地面贡献。
它没有相同的法线/太阳相对方位查询。此前大气多次散射的方向性改进，不等于地表漫反射
照度已经具备这一能力。因此仅传入 bent normal，无法使平面完整区分左右两侧天空补光。

两种世界的 `_SceneGISSkyReflections` 已有方向性天空 cubemap，适合先完成 GTSO。
后续完整 diffuse 方案需从严格平面大气推导方向性 irradiance，或验证与当前大气一致的
投影表示；不得借用球面曲率、局部行星模式或调色补偿。现有 cubemap 没有可直接借用的
diffuse SH 输出，不能把 specular mip 当成已经验证的余弦卷积照度。

## Mature references and applicability

Primary sources inspected on 2026-10-22:

| Reference                                                                                                                                                                                        | Relevant evidence                                                   | Boundary for SceneGIS                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Intel XeGTAO](https://github.com/GameTechDev/XeGTAO) and its `XeGTAO.hlsli`                                                                                                                     | 主采样中累计方向矩，与 AO 一起降噪；项目报告约 25% 的额外开销       | 可复用 horizon 设计；该数字不是本引擎测试。当前几何法线布局不同，不能照搬存储假设 |
| [Filament occlusion shader](https://github.com/google/filament/blob/main/shaders/src/surface_ambient_occlusion.fs)                                                                               | 可见锥与粗糙反射锥相交，并处理低粗糙度；屏幕方向未直接用于 diffuse  | 支持先做 GTSO 的边界；保留 material normal、材质 AO 与屏幕 AO 的不同职责          |
| [Epic bent normal maps](https://dev.epicgames.com/documentation/en-us/unreal-engine/bent-normal-maps-in-unreal-engine)                                                                           | 漫反射可见方向及 reflection occlusion；要求匹配空间、距离和采样分布 | 其贴图工作流含离线信息；不能假设任意 GIS 动态资产具有这些数据                     |
| [Practical Real-Time Strategies for Accurate Indirect Occlusion](https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf) | GTAO / GTSO 原始研究，XeGTAO 指向其方向矩算法                       | 本次算法核对以公开实现为主；未以下载失败的完整 PDF 作为逐式复核证据               |

参考实现不等于直接移植授权记录。后续若复制代码，须固定实际 revision、保留 MIT / Apache
等适用许可证与 attribution，并核对公式空间、归一化、材质粗糙度定义和本引擎的遮蔽强度语义。
不加入材质多次反弹的经验补亮来掩盖误差；它与现有 SSIL 是不同工作。

## Measured baseline

Reproduce with:

```text
npx playwright test -c Test/playwright.directional-occlusion-assessment.config.mjs
```

使用现有 Bistro 资源与相同局部 restaurant 视角，Greenwich / 2026-03-20 12:00 UTC。
固定物理大气、exposure 1、IBL factors 1、surface/background radiance scales 1.2/2.5。
关闭雾、空气透视、自动曝光、调色、SSR、SSIL 和 AA，保留直接阴影。
AO 半径 0.7 m、强度 0.8、8 方向 × 8 steps；这是验收场景设定，不是引擎默认值。

RTX 3060 Ti / ANGLE D3D11，1280×800，单 worker：

| Measurement                                    |       Globe |      Planar |
| ---------------------------------------------- | ----------: | ----------: |
| AO estimate + filter GPU median, 8 samples     |   1.8913 ms |   1.8918 ms |
| Shared deferred depth                          |         yes |         yes |
| Additional AO depth prepass draws              |           0 |           0 |
| Reported material / light draws, AO off and on |   627 / 627 |   627 / 627 |
| Estimate storage, RGBA8                        | 4,096,000 B | 4,096,000 B |
| Filtered storage, R8                           | 1,024,000 B | 1,024,000 B |

GPU query 包围两个实际命令，检查 disjoint 并销毁 query；复用当前深度，恢复 pass framebuffer。
两张 AO 纹理共 4.88 MiB，不含共享深度和间接光辅助资源。
这些数字是已有标量 AO 的成本，方向性增量尚未实现、不能实测。

另外保存了交替开关的完整帧 GPU 样本。其运行期间时钟/驱动状态存在明显波动，
首个关闭样本约 10 ms，后续约 29–35 ms；不能把两组中位数之差当成稳定的新增功能成本。
627 个 light draws 是当前分组光照统计，不是新增几何绘制。

检查了两种世界的 off / scalar / visibility 截图，局部材质与遮蔽分布接近。
可见改进主要集中在椅子、花槽和接触边缘；遮阳篷本来已有直接阴影。
这证明测试基线可复现，不证明尚未实现的方向性效果，也不是负责人视觉验收。
证据位于忽略目录 `Build/Specs/e2e/directional-occlusion-assessment/`，包括每世界的
`baseline.json`、三张图及汇总图 `baseline-comparison.png`。

## Incremental cost estimate

预计保留 64 次径向深度搜索，增加方向矩计算、方向纹理写入、双边滤波和 IBL 可见锥计算。
估计/滤波可以维持两次全屏 pass，但额外带宽不免费。

一个保守布局保留原 estimate 的 geometry normal / visibility，另外输出 raw bent direction，
并将 filtered R8 改为含方向的 RGBA8。若 raw direction 用 RGBA8，增量为 7 B/pixel；
若验证通过 RG8 八面体编码及目标格式支持，增量为 5 B/pixel。
这只是候选预算，不是已选定的纹理协议。

| Resolution | Estimated extra storage, 5–7 B/pixel |
| ---------- | -----------------------------------: |
| 1280×800   |                        4.88–6.84 MiB |
| 1920×1080  |                       9.89–13.84 MiB |
| 3840×2160  |                      39.55–55.37 MiB |

不含未来 planar irradiance LUT、驱动对齐或 temporal history；首版建议不新增 history。
也不预先计入尚未实现的 MRT 回收收益。可将同机 1280×800 额外不超过 0.5 ms
作为原型验收目标，而非性能承诺。若超预算，应基于实际热点评估降分辨率/采样或停止推进，
不能通过加深 AO、改变曝光来换取表面上的提升。

## Proposed implementation boundaries

| Area                           | Candidate change                                     | Important restriction                                                  |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Owned AO estimate/filter/state | 共用 horizon，输出并滤波 visibility / bent direction | 保留几何边界引导，明确开阔/完全遮挡及强度参数语义                      |
| Owned deferred lighting        | 在可用不透明深度与光照之间调度一次                   | 检查 multi-frustum、inverse classification 与深度切换；移除重复估计    |
| Native IBL / lighting seams    | 环境高光专用可见度，后续才接方向性 diffuse           | 最小 hook，保留原生 BRDF、normal map、显式 IBL、clearcoat / anisotropy |
| Owned MRT / SSR / SSIL         | 统一环境基值与 SSR replacement/radiance 语义         | 不重复遮蔽命中反射、直接光、emission 或 SSIL bounce                    |
| Planar physical irradiance     | 后续完善方向性查询                                   | 保留严格平面几何，单独测 LUT 构建/存储/运行成本                        |

现有 SGP-0014（AO）、0010（物理光照）、0015（天空反射）和 0046（deferred）可供核对。
本次没有编辑 upstream-owned files，也没有新建/扩展 SGP。后续是否修改 `Scene.js`，
以及复用或新增哪个 SGP，取决于进入实现时的真实集成范围，不在评估中预登记虚构补丁。

## Findings, risks and next gates

| Finding                                                                  | Severity / owner                                       | Disposition and follow-up                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| F1: combined indirect RGB cannot express separate directional visibility | P1 implementation blocker / architecture               | Assessment complete; preserve separate component semantics at lighting and SSR seams before implementation can pass              |
| F2: Planar surface diffuse lacks relative-azimuth sky irradiance         | P1 for full diffuse scope / atmosphere + architecture  | Documented dependency; first GTSO proposal excludes claiming full directional diffuse parity                                     |
| F3: screen depth lacks offscreen, rear-layer and transparent occluders   | P2 limitation / rendering + product owner              | Accepted screen-space boundary for a prototype; test entry/exit, thin geometry and camera motion; no hidden ray-tracing fallback |
| F4: additional image quality and GPU cost are unmeasured                 | P2 open implementation gate / execution + visual owner | Baseline complete; implementation must produce matched old/new images and incremental timings before any default change          |

下一次 phase plan 至少需明确以下验收，不扩展成无边界组合矩阵：

1. 数学/着色器：开放半球返回原结果、已知单侧遮挡的方向正确、共面几何的滤波连续；
   对极低粗糙度、normal map、材质 AO、clearcoat 和显式环境检查正确职责与坐标空间。
2. 画面：相同灯光、曝光、相机的两种世界，包含檐下/凹角与粗糙金属；对比 scalar / directional，
   以及 SSR 命中和未命中，确认减少环境漏光而非整体变暗。负责人视觉判断为最终质量依据。
3. 集成：连续移动、屏幕边缘、近远裁剪和 multi-frustum；直接阴影、SSIL、透明与天空保持
   各自语义。重建/resize/disable/destroy 验证资源所有权；不新增几何重绘。
4. 性能：同设备的 GPU 分段成本与实际 target bytes；以 0.5 ms 增量目标评估首版价值。
   若涉及 diffuse LUT，另测构建和查询，不能混入现有 AO 数字。
5. 构建：改 GLSL 后验证两种 shader 产物，影响公共 API 后完整 release/types；ADR/SGP 与
   phase checkpoint 同步。此次评估不修改这些路径，故无需重复全量构建。

## Verification and review conclusion

两项浏览器评估通过（27.9 s），覆盖 Globe / Planar，断言共享深度、零额外 AO 深度绘制、
Viewer 销毁和无页面错误。GPU query 与截图由独立测试页生成，未改动用户打开的页面。
实现新增的只是基线测试、配置和本评估文档；渲染行为保持原状。

Scoped Prettier / ESLint and `git diff --check` pass. Required full AgentDocs
Markdown lint passes; full Prettier reports 565 other files with existing style
issues. Unrelated files are not mass-formatted. No runtime/API change requires a
release or type rebuild in this assessment.

评估完成，允许据此讨论并授权一个受控实现；方向性效果尚未完成，视觉/增量开销 gate 仍开放。
已有 R27 及其他历史 review 的状态不因本次评估而变更。
