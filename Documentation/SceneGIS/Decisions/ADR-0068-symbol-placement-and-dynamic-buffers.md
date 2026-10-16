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

## V3C1D amendment: resident candidates and conservative spatial queries

2026-09-14 南京 Globe 水平绕转复现候选重复构造和 cohort 延迟；字形资源无重新请求，不能把
标注短暂消失解释为主线程 MVT/字形解码。候选现在随 resident entry 的 symbol layout 保存，
render cover 只决定当前归属；真实 eviction、layout 替换、clear/destroy 才释放或替换候选。

每个已使用的 tile/style 候选集合建立私有空间索引，按 Mercator anchor X/Y 交替二分，叶片最多
32 个 anchors。索引构造纳入既有 placement generator 的软预算，包围盒保存该 terrain snapshot
下实际附着的世界位置；terrain snapshot 更换后重新构建，不使用近似高程剔除真实可见标注。
查询按实际 projection 的六个裁剪平面和既有 maximumAnchorDepth，先保守跳过整组不可见 anchors，
剩余 anchors 仍逐一执行原有 horizon、viewport、owner、样式、重复抑制和碰撞判断。包围盒与相机
在双精度下作相对差，保留 Planar/Globe 和各 frustum 的坐标语义。索引不代表新的选择预算或画质档位。

Shaping 待处理队列与已就绪的 LRU cache 分离；每帧只调度待处理记录，pending 不遍历完整 ready
cache。淘汰、generation 失效、clear/destroy 同步移除相应队列记录，迟到完成仍按 record identity 隔离。
字形 CPU 字节数在不可变 Worker 结果接收时计算，统计快照按页面聚合，不逐帧遍历 bitmap。
以上均为自有 JS 缓存/调度调整；Worker 任务协议、碰撞优先级、当前帧 draw/pick、GPU buffers 和上游接缝不变。

## 2026-10-16 amendment: atomic symbol cohort handoff

公开地图跨 LOD 移动复现：render cover 已切换，已发布注记立即被 currentOwner 隐藏，
新 placement 仍在分帧计算，期间可见注记从百余降到个位数。负责人确认新批次准备完成后
原子替换；本节修订上述 owner 消失即隐藏的历史规则。

render cover 的半开 ownership 仍用于收集新候选和去重，不再决定已发布批次的存活期。
待发布批次完成候选收集、glyph/sprite 请求、Worker shaping 与 collision 后，才统一发布
GPU streams / pick identity 并释放旧分组。资源未完成时 generator 让出当前帧，资源版本
变化后继续；终结的加载/排版错误继续报告并排除相应候选，不无限等待或自动 retry。

等待期间旧注记继续使用当前相机、地形 attachment、near/far、远景距离与视域裁剪；
当前 style 的 visibility、filter、min/max zoom 与 paint 仍生效。隐藏 Layer / World 和销毁
继续清空。既有 Shader 深度协议不变：地形、外部 Model / 3D Tiles 遮挡，以及同地图
建筑/注记样式层序保持；pick 复用当前发布批次。

maximumGlyphRanges 约束单批需求和稳态 cache。为了在满 cache 时仍能原子交接，
新批次加载期间额外保护已发布批次使用的页面，合计最多 2 × maximumGlyphRanges；
共用页面不重复分配。取消的待发布需求仍可 LRU 淘汰，不能累积第三批保护集；提交后
回收超额缓存。显示/待发布候选各受 maximumSymbolCandidates 约束，单个 sprite 保持原生命周期。
这是显式、有界的过渡内存成本，不保证加载完全不同字集时保持原稳态峰值。

仅 SceneGIS-owned runtime / assets 和 Specs 修改，无新增上游接缝或 SGP。
验证包含分帧跨 LOD 的逐帧显示/拾取、延迟 glyph/shaping 时旧资源存活、提交后释放、
连续取消时 cache 有界、等待期间样式隐藏，以及既有地形/外部模型遮挡回归。
