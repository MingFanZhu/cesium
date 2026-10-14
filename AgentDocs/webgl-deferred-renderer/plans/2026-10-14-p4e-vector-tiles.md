# P4e：独立矢量切片的延迟适配

## Metadata

- Type: phase plan；Status: completed；Updated: 2026-10-15。
- Parent: [extension plan](2026-10-13-webgl-deferred-renderer-extension.md)。
- Entry checkpoint: P4d `4ba2e217c7`，负责人已确认全部画面并授权继续。
- Architecture / execution / self-review: 当前任务。
- Review: [入口审计](../reviews/2026-10-14-p4e-vector-entry-audit.md)。
- 相关 ADR：0069、0070、0071、0072、0073、0074、0161；已有透明 Globe 集成缝隙 SGP-0012。本阶段修改 Scene.js 的拾取深度与透明 Planar 阶段调用缝隙，复用 SGP-0046；其余实现为 SceneGIS-owned。

## Scope and contracts

适配 `SceneGISVectorTileLayer` 的 background、flat、Planar / Globe ground、fill-extrusion、circle / symbol，以及既有 pattern、feature-state、独立透明度、层序、遮挡与拾取。保留公共 API、source / Worker、调度、资源所有权和 feature identity；不新增样式能力。

不透明受光几何写材质并在屏幕阶段受光；透明内容可保留必要的透明专用光照。circle / symbol 保持不受光的制图颜色。保留原矢量扩展的边界：当前可见表面独立透明度不等于任意地下 / 背面跨透明排序；本阶段不新增建筑投影阴影或完整 Model PBR 承诺。

现有预算内的源码审计、复现及材质接入可直接实施。新增附件、提交或场景语义须先形成基于实际调用链的讨论，由负责人确认，不挪用 P4d 扩展材质预算。

## Verified entry facts

1. extrusion 在 `_SceneGISVectorTileBatch` 提交 OPAQUE / TRANSLUCENT，FS 已计算基础或高级环境光照；延迟控制器尚无 vector family，故 opaque 仍是预受光 passthrough。
2. flat / ground fill、line 使用 TERRAIN_CLASSIFICATION，已有分类目标保存最终预乘颜色。其间还混有不受光 circle / symbol，不能对整个目标统一补光。
3. ground 通过 `czm_globeDepthTexture` 重建真实地表位置 / 法线；覆盖体的光栅深度不能代替该位置。
4. `_SceneGISVectorSurfaceOverlays` 复用透明 Globe 剥离深度；当前延迟布局对注册的直接矢量覆盖显式拒绝。
5. 原矢量阶段已有独立透明度、地形、图案、状态及资源测试；必须按真实风险复用，不改写历史能力边界。

## Implementation sequence

1. 复现相关 vector Specs 与透明 Globe 拒绝，确认现有材质 / 层序契约。
2. 为 opaque extrusion 接入现有四张材质附件和独立光照 family，保留梯度、基础 / 物理受光、透明切换、拾取；不增加材质纹理和几何提交。
3. 按实际透明 Globe 时序确定有序地图覆盖的 lit / unlit 编码与合成；需要新预算时先讨论，获确认后实施。
4. 验证 circle / symbol、pattern / state、terrain / pick 与实际受影响的共享效果、水面、多视锥路径；修复确认的问题。
5. 完成 ADR / SGP、双世界本地验收页、成本与构建 / 类型检查、自审、负责人视觉验收，再独立本地提交。

## Completed implementation and approved decisions

负责人已批准 [不透明地图预算](../discussions/2026-10-14-vector-overlay-budget.md)。opaque extrusion 使用现有四张材质附件的 group -6；受光地图颜色使用按需 RGBA16F，与原分类颜色分别累计 lit / unlit 贡献，保持层序和独立 alpha。附件空间不足时仅做屏幕清理；几何不重放。

透明 Globe 在原生 peel 阶段直接合成；单视锥此前误入不透明分类目标的路由已修正。多视锥 pickPosition 使用当前段的延迟表面深度与最终硬件深度，替换原有复制，不新增纹理或提交。

透明 Planar 原有 log / linear 独立 alpha 与 feature pick 失败已通过新增路径恢复。负责人于 2026-10-15 批准 [按需深度与地形提交预算](../discussions/2026-10-14-planar-vector-transparent-depth.md)，已接入条件 DEPTH24_STENCIL8、整个视图一次 depth-only tile 提交和互斥地图颜色合成；复用 Scene 现有分类 / 透明阶段，以 SGP-0046 提供显式窄 hook。

[双世界验收页](../../../Test/Rendering/延迟矢量验收.html) 与对应 E2E 已建立。透明 Globe 地形覆盖异常已定位并修正，最终 Globe 23 项回归通过，见 WDR-P4E-05；浏览器与成本验证完成，负责人于 2026-10-15 确认现有页面视觉通过。自动化通过不代表画面已经由负责人验收。

水面 / 共享屏幕消费者回查修正 additive 地图光照的重复 coverage alpha（WDR-P4E-06），无新资源；新增 GPU 与双世界水面 E2E 已通过。另补齐独立 Globe background 的材质标记与 capture 光照门禁（WDR-P4E-07），复用已批准地图预算，保持背景样式及透明专用路径。基础 Shader 模板保留供动态透明 / pick 及发布前验证使用；共享水面 radiance 消费分支继续使用延迟输出。

WDR-P4E-05 已通过逐片段 frame ID 探针定位为相邻三角形 0 / 1 的局部逆投影不一致，日志深度单段与 linear 多段均复现。实现使用现有每三角形 16-float frame 表中的冗余 metric 和 triangle.w 身份槽保存共享边归属；metric 从已有曲率半径重新计算，frame ID 使用 gl_InstanceID。两侧在 FS 中使用相同 frame 与有序端点计算共享边，撤销 VS origin varying 并复用其分量用于三个 edge frame ID。不增加持久几何 bytes、texture 或提交；增加的 FS 坐标计算须实测并回归大陆 / 极区 / 地形 / line / pattern / pick。

## Validation and phase gate

包含透明 Planar 增量的完整 `build-release`、`build-ts` / `tsc` 已通过，类型生成仅有既存上游 JSDoc 提示，生成入口没有 tracked 修改。最终 Ground / DeferredPlanar 25 项 GPU Specs、Planar 浏览器、资源/成本与自审已完成。2026-10-15 负责人另行确认新增透明 Planar 画面通过并指示提交 P4e，关闭此前唯一的视觉 gate；review 七项 findings 均 fixed。P4e 以本阶段独立本地提交形成 checkpoint，不混入后继工作。

WDR-P4E-05 另一个已确认根因是 native translucent Globe 禁用裙边后，瓦片接缝漏到地球远侧。三个实际漏点仅在原生 depth-only 命令恢复已有裙边索引后均恢复近处地表深度。修正限定为可见 direct vector overlay、地表上方相机及 `Globe.showSkirts=true`；复用同一次 peel 的 VA / index buffer，不改变 Globe 透明颜色命令，不增加 texture / draw。通过 owned helper 缓存计数不同的 depth command 并使用原生派生链，SGP-0012 仅提供显式派发 hook。验证接缝、光照、showSkirts 关闭、相机地下及无 vector 的范围门禁，并报告新增索引数和实际成本。

- GPU Specs：实际材质值、基础 / 高级环境画面、alpha / pick、资源释放；每项针对明确契约。
- 成本：opaque 不保留完整前向重放；列出新增附件 / 提交（若有），验证按需分配与释放。
- 既有覆盖的独立 alpha 和混合顺序必须保留，透明 Globe 按真实剥离时序验证。
- 源文件格式 / lint、必要 build / types；不提交生成文件。
- review 所有阻断项关闭、负责人画面确认、独立本地提交后方可关闭阶段。
