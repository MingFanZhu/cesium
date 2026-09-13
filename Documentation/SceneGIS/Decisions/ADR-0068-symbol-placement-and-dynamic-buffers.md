# ADR-0068：标注布局调度与动态绘制分离

## Status and context

- Status: `accepted`
- Date: `2026-09-13`
- Plan: [V3C1C](../../../AgentDocs/vector-tiles/plans/2026-09-13-v3c1c-symbol-motion.md)
- Related: [ADR-0063](ADR-0063-point-symbol-renderer.md)、[ADR-0065](ADR-0065-line-symbol-placement.md)、[ADR-0067](ADR-0067-vector-worker-preparation.md)
- SGP: None

负责人批准优化持久 placement、碰撞代理和静态/动态 buffers。此前每次 camera change 都完整
重做 placement，CPU 约 22 ms；Worker 迁移和几何缓存不能减少这一调度工作量。
本决定修订 ADR-0065/0067 的逐帧完整碰撞和碰撞必须使用所有 glyph 顶点的历史限制。

## Decision

稳定候选按 resident render entry 与 symbol layout 生命周期保存。全视图 placement 使用捕获的
不可变相机与 style zoom，按 2 ms 的 candidate/步骤粒度软预算跨正常帧推进；单步骤不可抢占。
已提交 placement 在普通交互期间最多复用 100 ms 后启动下一轮；这不是画面冻结，实际文字
geometry、字号、方向、当前可见性和 GPU 投影始终消费当前相机。持续运动不取消已开始的计算，
以免饥饿；布局完成后再处理更新视图。没有 timer retry、静默主线程 fallback 或自动 FPS 降档。

Point collision 使用完整 layout box；along-line collision 使用路径分段保守包络，覆盖字形半径。
Collision 预检通过后才计算真实弯曲字形与 max-angle；optional/overlap/priority 语义保持。
这允许保守拒绝、短期避让滞后，不承诺与旧逐字 AABB 或 MapLibre collision circles 像素一致。
最终 draw/pick 一律使用真实 glyph alpha 与当前 geometry，不使用碰撞代理替代可拾取形状。

GPU 使用单个 VA 引用独立 static 与 dynamic vertex buffers。UV、paint 与 pick 随内容/paint
变化写入；position、offset、size/halo parameters 与 visibility 随实际变化写入。
Batch 必要顺序、atlas ownership、relative-to-eye 精度、DPR、Cesium native pick 派生不变。
仅 normal update 可以创建、上传、发布、清理资源；pick/depth 重放最近已发布状态。
清空、cover owner 消失和销毁必须取消 pending publication 或在当前帧排除过期标注。

## Delivery and verification

仅 SceneGIS-owned Core/Scene/Renderer 与 GLSL 改动；沿用 ADR-0030 的 Shader 构建和包路径。
没有新 public API、Worker entry、pass、上游 seam 或依赖；平面资格不扩展到 terrain/Globe。
验证布局收敛和预算、代理包络、current-view picking、buffer dirty 范围、资源生命周期、真实
交互性能及 dev/release/installed-package Shader。用户视觉 gate 包含密度与布局更新延迟。
