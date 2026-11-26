# 模型延迟光照组复用评审

- 日期 `2026-11-26`
- 作者角色 `architecture / execution`
- [计划](../plans/2026-11-26-model-lighting-groups.md)
- [运行时](../../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISDeferredLighting.js)
- [GPU Specs](../../../packages/engine/Specs/SceneGIS/Scene/SceneGISDeferredLightingSpec.js)

| 问题                         | 处置与证据                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| 普通模型各占一个半精度组号   | 已修复。2049 个可见 glTF 模型写入同一组号，屏幕光照提交 1 次，材质提交 2049 次。        |
| 分类与对数深度命令有独立对象 | 预检与材质提交使用相同的光照绑定查找，现有派生 shader 和深度协议继续使用。              |
| 瓦片代表命令及资源会失效     | 切换代表模型时重建匹配的 shader 和 uniforms，LOD 卸载及重载、清空场景的测试覆盖该路径。 |
| 模型独立参数影响外观         | 保留显式光色、SH、IBL 强度与独立资源绑定，使用已有像素回归验证。                        |

Chrome Headless 158 / Windows WebGL 验证启用了 `--webglValidation`，Styling 和 CustomShader 均为 7/7。
延迟管线专项共 159 项，其中 155 项首轮通过，3 项旧缓存断言更新后在专项重跑中通过。
大气透视与云接收者的既有 cloudCommand spy 失败记录见 [TD-04](../../planar-world/reviews/2026-10-23-terrain-depth-test.md)。

SceneGIS 自有调度和测试改动，上游文件和 SGP 均为 0。现有 G-buffer 容量仍为 2048 个独立正组号。
实际 Viewer 中的原视角验收需要加载包含此修复的 SDK 引擎构建。
