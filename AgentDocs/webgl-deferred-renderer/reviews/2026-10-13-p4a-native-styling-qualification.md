# Review: P4a 原生 Model 与网格要素样式

## Metadata

- Status: approved，技术与负责人视觉 gate 均通过
- Reviewer role: architecture，当前任务自审；未启用独立评审 Agent
- Target: P3b checkpoint 84aafea838 之后的 P4a
- Parent: [P4a plan](../plans/2026-10-13-p4a-model-and-tile-styling.md)
- Decision: [ADR-0159](../../../Documentation/SceneGIS/Decisions/ADR-0159-deferred-feature-styling.md) / SGP-0048
- Created / Updated: 2026-10-13

## Findings and disposition

| ID         | Severity | Status   | Owner         | Evidence and follow-up                                                                                                                                                                          |
| ---------- | -------- | -------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WDR-P4A-01 | high     | fixed    | execution     | 原型拒绝 Model.color 与 selected feature。复用原生 ModelColor stage，捕获 CPUStyling 的光照后乘数；材质前 REPLACE/MIX 保留。PBR/unlit、b3dm/i3dm、纹理 feature ID 的实际 HDR 与原生对照通过。   |
| WDR-P4A-02 | high     | fixed    | execution     | 第五附件独立所有，所有材质变体均匹配四/五布局；普通内容写中性乘数。GPU/E2E 覆盖混合内容、隐藏恢复、resize、卸载、disable/destroy；基础四纹理与借用深度不误释放。                                |
| WDR-P4A-03 | high     | fixed    | execution     | 初版资格检查逐命令扫描 Shader 字符串，Bistro 整帧约 27.33 ms。CPU profile 在该扫描累计约 195.6 ms/16 帧。改为按样式 define 进入既有 Shader identity cache；同条件恢复 15.79 ms，固定 HDR 不变。 |
| WDR-P4A-04 | medium   | fixed    | execution     | 原生 LOD 粗细切换、trimLoadedTiles、子内容重载后更新分组并移除旧 Model；异步测试以所需内容实际提交为就绪条件，不新增产品 settling frame 或 retry。                                              |
| WDR-P4A-05 | boundary | accepted | architecture  | 第五附件存乘数而非 feature/pick ID，不接管同步拾取，不增加全屏或几何 pass。四附件设备无法使用本阶段的 selected-feature opaque 内容，入口明确报错。                                              |
| WDR-P4A-06 | gate     | accepted | project owner | 负责人于 2026-10-13 回复“通过”，接受独立街道与要素样式结果；architecture 确认阶段退出条件满足，批准形成 P4a 独立本地提交。                                                                      |

## Qualification evidence

Chrome Headless 155，真实 WebGL / webglValidation：DeferredLighting 15、DeferredStyling 7、
GBuffer 7、AmbientOcclusion 14、ScreenSpaceReflections 13、ScreenSpaceIndirectLighting 13，
共 **69** 项通过。无 WebGL stub。Model.color 的动态增删、透明转换不增加第五纹理；
feature 属性、实例和纹理路径保留 native pick / show / alpha 与 AO/SSR/SSIL 处理。
附加样例复用原生属性表及纹理 fixture，不修改上游测试资产或 loader。

Bistro 浏览器验证覆盖 14:00、22:00、SSIL 和新增 Model.color 染色。1280×800 的 HDR
相对误差均值依次约 0.00001989、0.00000136、0.00001990、0.00001135，无非有限值。
普通街道与此前 P3b/P3a 固定 HDR 快照的均值及最大差均为 **0**。

独立要素页面验证原生三种混合、部分透明、直接点击染红、隐藏恢复、普通灰色底板混合、
TAA 相机移动与 SSIL，以及四/五附件资源身份；HDR 对原生均值约 0.0000012–0.0000031。
已查看要素染色与移动截图；数值及截图不替代负责人视觉判断。

## Cost and limits

RTX 3060 Ti / Edge 155 / ANGLE D3D11，1280×800、相同街道相机与 14:00、单采样，
TAA/AO/SSR 保留。12 个有效 GPU timer 样本，中位数按中间两项平均：

| 配置           |   P3b GPU |   P4a GPU |    P3b / P4a CPU |
| -------------- | --------: | --------: | ---------------: |
| TAA + AO + SSR | 15.841 ms | 15.789 ms | 16.75 / 16.75 ms |
| 上述 + SSIL    | 16.486 ms | 16.755 ms | 16.40 / 16.55 ms |

差异处于短测波动范围，不声明普遍提速。街道保留四附件、627 次材质 + 1 次屏幕光照，
Deferred 自有材质存储仍为 31.25 MiB（借用深度不计入）。

10 要素与底板样例使用五附件，Deferred 自有材质为 39.0625 MiB，增加 7.8125 MiB；
2 次材质 + 2 次屏幕光照，没有逐要素重绘。最终同画质 native 前向约 2.17 ms、
延迟约 2.58 ms；这是小场景完整管线差异，不能解释为第五附件的独立成本。
基础纹理不因四/五布局切换重建；第五纹理在无 eligible opaque feature 时释放。

继续排除点云样式、分类、多视锥、clearcoat/anisotropy/specular 扩展、outline/silhouette/
clipping edge 与其他未资格确认分支；这不是全面替换主线。带要素内容要求至少五 MRT；
后续 AO/SSR/SSIL 响应 MRT 的既有上限独立有效。

## Delivery and gate

唯一修改的 upstream-owned file：
[CPUStylingStageFS.glsl](../../../packages/engine/Source/Shaders/Model/CPUStylingStageFS.glsl)，
对应 SGP-0048，两处成对标记，仅声明和调用自有 capture hook。
其余实现、Specs、示例和文档均为 SceneGIS-owned；无生成文件手工修改或提交。

完整 dev/release、build-ts 与根 tsc 已通过，生成类型保留既有 JSDoc 警告。
补丁审计与定向 ESLint 通过；本扩展改动文档格式通过。全 AgentDocs Markdownlint 通过；
全目录 Prettier 仍报告 **416** 个未改历史文件，不顺带格式化。
消费者 Specs/TypeScript 完整 tsc 通过，重建后的 Bistro 与要素 E2E **2/2** 通过。
全部技术检查与自审完成，负责人于 2026-10-13 通过视觉 gate；批准 P4a 独立本地提交，提交后方可进入下一阶段。
