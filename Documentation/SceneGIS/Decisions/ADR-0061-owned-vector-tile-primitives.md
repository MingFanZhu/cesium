# ADR-0061：地图专用图元与底层 Cesium 渲染接口

## Status and context

- Status: `accepted`
- Date: `2026-09-13`
- Plan: [V3B0](../../../AgentDocs/vector-tiles/plans/2026-09-13-v3b0-owned-primitives.md)
- Related: [ADR-0059](ADR-0059-planar-vector-tile-batch-renderer.md)、[ADR-0060](ADR-0060-vector-tile-resident-render-cover.md)
- SGP: None

V3A `ad3ea51f13` 的平面画面和流式替换已验收。项目负责人进一步明确：
以 MapLibre 图形渲染能力为目标，原生图元无法表达的能力由 SceneGIS 自有图元实现，
避免为了地图功能大量修改 Cesium 原生 Primitive、Polyline 与 Shader。

当前 batch 借用 Primitive、Appearance、BatchTable 与私有 queue hook；line 借用 PolylineGeometry。
MapLibre 参考的 LineBucket.addLine 使用连续拓扑、join/cap 分类与累计距离，
line Shader 计算边缘 coverage，dash Shader 消费重复线型 SDF。
这些能力不能通过放宽现有 Style 校验自动获得。

## Decision and layering

地图 batch 直接拥有 GPU buffers、VA、ShaderProgram、DrawCommand 与 feature pick IDs。
不再构造原生 Primitive、Appearance 或 BatchTable，也不靠其私有 queue hook 发布地图命令。
Cesium Context/Buffer/VertexArray/ShaderProgram/RenderState/DrawCommand 与 Scene 调度继续复用；
它们是通用渲染基础，不是地图样式与图元能力的上限。

Core 负责独立解码、样式求值、拓扑与数值数组。允许复用 Core 的普通数学、三角化、
Geometry 数据容器与 buffer packing 工具；不引入另一个 WebGL context、raw GL 状态机或平行场景。
Renderer helper 只负责 GPU allocation、编译与资源所有权；Scene batch 负责坐标矩阵、
地图层序、region clipping 与 Scene command publication。
未来线型、fill coverage、贴地与标注在自有地图图元上发展，不回到逐 Entity/原生图元补丁路线。

## Compatibility migration

V3B 拆成两个独立 checkpoint：V3B0 先迁移资源所有权并保持 V3A 行为，V3B1 再实现线型与 AA。
V3B0 不放宽当前 rendered style profile，不新增公共 layer 构造选项。
原始 geometry 按 feature 顺序合并，颜色与 pick color 展开为顶点属性；
feature identity 仍包含真实 source tile 与业务属性，allowPicking=false 不分配 pick IDs。
每个 batch 内相同 identity 的多个 part 借用同一个 pick ID，不建立全局 registry。

所有 DOUBLE position attributes 使用既有 Core encodeAttribute 的 high/low 编码。
自有 vertex Shader 直接使用 czm_translateRelativeToEye 与 model-view-projection RTE，
不依赖 Primitive 动态注入的 czm_computePosition/batch table 函数。
完整 tile origin 仍由 double modelMatrix 保存；fragment 的 eye-space 裁剪射线保持。

为了让资源迁移可单独验证，V3B0 的已验收 butt/miter 线型暂时复用纯 CPU PolylineGeometry
和 PolylineCommon 的 near-plane/window extrusion 数学。自有兼容 vertex main 参考
`Source/Shaders/Appearances/PolylineColorAppearanceVS.glsl`；
来源为官方基线 `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
同步条件：在 V3B1 移除桥接前，Cesium 升级必须复核 width + 0.5、近裁剪与 viewport/RTE 行为；
不得为支持新 cap/join/dash 修改该上游 Shader。该桥接不代表完成自有 stroke。

后继 [ADR-0062](ADR-0062-vector-stroke-and-coverage.md) 已在 V3B1 移除上述临时桥接；
stroke mesh 与 Shader 均为自有实现。这里保留 V3B0 的来源与阶段迁移事实。

## Ownership and publication

公共 layer 构造仍不请求数据、不分配 GPU。候选 batch 只在正常帧创建；
VA/Shader/pick ID 全部成功且 Shader compile/link 后才能替换旧 batch。
任一 buffer 或 Shader 创建失败，释放已创建的候选资源，保留此前发布的数据并报告错误。
VA 接管它的 buffers；Shader 使用 Cesium cache 引用计数；pick IDs 由 batch 释放。
分块仅由 index capacity 决定，不按每种颜色生成 command。

Scene batch 继续发布 V3A 的独立 region 命令；region 只借用 VA/Shader，不能销毁它们。
同一 region command 设置 DrawCommand.pickId，由 Scene/DerivedCommand 自动派生 pick command、
Shader 与关闭 blending 的 render state；不额外维护一套手工 pick 命令。
自有 Shader 显式声明逐要素 pickColor/v_pickColor；派生 Shader 复用正常 fragment 的
coverage/clip/discard，再输出 pick color，因此颜色与拾取使用同一套区域边界。
Normal frame 拥有更新；warm 与 pick/depth 重放，不创建资源或改变 cover。
缓存淘汰、图层移除与销毁 exactly once 释放所有 batch 资源。

## Build, verification and limits

沿用 ADR-0030 的固定 GLSL root、现有构建与 npm 交付，不修改上游文件。
以已验收 V3A 页面为迁移基线，保持 fill/line/circle、alpha、holes、pick、streaming 与资源回归。
新增候选失败清理、pick ID 生命周期和大 index buffer 检查；运行 build/types/release/installed package。
只迁移所有权不构成 MapLibre 完整图形兼容；V3B1 冻结并验证 cap/join/dash/AA。
生产 terrain、symbol 与 Globe 继续遵守各自阶段资格，不由自有 DrawCommand 自动获得支持。
