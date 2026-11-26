# 跨 tileset 延迟光照组验证

- 日期 `2026-11-26`
- 评审角色 `architecture / execution`
- [计划](../plans/2026-11-26-lighting-binding-equivalence.md)
- [ADR-0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md#model-lighting-group-reuse)

| 风险                     | 验证结果                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| tileset 拆分引入光照绘制 | 同一份原生数据从 1 个 tileset 拆为 5 个，材质提交数相同，光照提交均为 1 次，HDR 像素误差在 0.002 内。 |
| 模型级光照参数串用       | 相同光色和 SH 值可共享，改变 IBL 强度或参考坐标系拆组。共享反射纹理合并，独立纹理绑定拆组。           |
| 相机变化导致程序重建     | 相机旋转改变 IBL 矩阵，代表模型与光照程序缓存复用。2049 个默认物理光照模型仍共享 1 次屏幕绘制。       |
| 原生 IBL 来源优先级      | 原生 stage、双世界物理光照和天空反射共 14 项通过，包含显式 Model / Scene 来源和动态替换。             |

Chrome Headless 158 / Windows WebGL，开启 `--webglValidation`。延迟管线综合与针对性重跑覆盖 161 项，
160 项通过。余下的云接收者测试为 [既有 TD-04](../../planar-world/reviews/2026-10-23-terrain-depth-test.md)。
其中 DeferredLighting 24/24、DeferredStyling 8/8。显式反射纹理的测试在 Context 销毁前释放借用资源。

上游接缝为 `Source/Scene/Model/ImageBasedLightingPipelineStage.js`，复用 `SGP-0015`。
新增屏幕组仍受独立组容量约束，实际运行 Viewer 的场景验收依赖 SDK 引擎构建同步。
