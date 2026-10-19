# B6 贴地面安全范围放宽

- Plan type: phase
- Status: completed
- Owner role: execution / architecture
- Created / Updated: 2026-10-19
- Architecture review: confirmed，基于 B5 实现及精确轮廓评估
- Parent plan: [批量渲染计划](2026-10-19-planar-batching.md)
- Discussion: [评估](../discussions/2026-10-19-exact-footprint-batching-evaluation.md)
- Review: [B6 review](../reviews/2026-10-19-b6-safe-footprint-batching.md)
- Base checkpoint: `9e65a8a8f9`
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None

## 设计

保留 RBush broad phase。bbox 内部相交时，只有交叠矩形 R 与双方的真实填充区域均不相交，才解除该对象对的顺序约束。
采用环边/矩形相交与包含判断，支持外环和孔洞；边界接触与浮点无法证明的分离保守保留约束。
同 bbox、实心矩形等可直接确认冲突的情况走短路径，不为所有对象预建 triangle tree。

把静态 area 分层规划提取为一个私有模块；返回内部实例顺序及每个对象最后一个不兼容前驱在该顺序中的索引。
按前驱的 layer、原始 index 比较取得最后前驱。分组时当前 run 若包含此前驱则冲突；否则可以直接合并。
此 O(N) 元数据替代 command planner 的重复空间查询，color/show 变化不再遍历轮廓，不持久缓存 O(N²) 对象对。
原有同色不透明、最多 15 个闭体的 render 合并保留。

删除前驱要求新对象同时包含旧 bbox 和旧填充轮廓。本阶段仅接受共享同一 immutable geometry、
bbox 与逐环逐点 XY 完全一致，或新对象为无孔、四角轴对齐的实心矩形且包含旧 bbox。
其他包含情况保守保留前驱。上述条件都能传递 bbox/footprint 冲突约束；最后前驱索引亦可通过更高 layer 的新节点传递。

不改变 GLSL、深度/模板状态、原生 VA/index/BatchTable、公开 API、单实例或 line 路径。

## 影响与 gate

- 私有 area planner、GroundPrimitive candidate 创建、commands 的范围兼容性判定。
- 先复现 1024 个双凹面 bbox 假相交仍为 4 draw；完成后 render/pick 各 2 draw。
- CPU Specs：斜边、孔洞、接触与大坐标；最后前驱、传递链、包含剪枝反例与合法剪枝。
- WebGL：透明/不透明与逐对象基线、独立改色/显隐/pick、重建及 warm 资源。
- 90° 到低视角，地形宽包络与 linear/log depth；孔内独立面继续分组。
- 同机 B5/B6 分组及真实浏览器构建/命令对照；完全重叠 8192 实例不发生无谓二次退化。
- Ground/DataSources 最小回归、开发构建及私有模块交付检查、文档/审查，完成后独立本地提交。

## 实施与证据

- `_SceneGISPlanarGroundAreaBatch` 负责一次性静态规划；commands 仅保留 IDs 与 O(N) 最后冲突前驱，未改 Shader 或上游文件。
- 先复现 B5 的 1024 个共同空区凹面仍需 4 draw；B6 render/pick 各 2 draw。
- Ground 39/39、DataSources 102/102；含孔轮廓、浮点/接触、包含剪枝反例、不同轮廓同 bbox、最后前驱及既有资源生命周期通过。
- 90°、25°、5° 与 linear/log depth，真实 heightmap、±80 m 包络下的两面内部和共同空区 RGBA/ID 与逐对象基线一致。
- 同机 Chrome 155：1024 个安全凹面首次构建/提交中位数 B5/B6 为 16.8/16.3 ms；8192 个共享重叠凹面为 112.8/109.9 ms。
  仅说明这两个样本未见明显额外开销，不代表所有输入更快。warm 20 帧 median/P95 为 0.3/0.9 ms。
- 测量暴露独立 geometry 对象的相同凹面无法使用 identity 剪枝；补充严格 XY 等价剪枝后，2048 个对象分组中位数从 44.5 降至 2.6 ms。
  该数字仅包括静态分组；已验证同 bbox、不同凹轮廓仍保留前驱。
- 示例增加“凹面共同空区”，检查截图、独立改色/隐藏/pick，页面错误 0。
- 开发构建、类型生成、package 导入与生命周期检查通过；格式、lint 及阶段 gate 见 review。生成产物不提交。
