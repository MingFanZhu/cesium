# ADR-0076：矢量样式运行时状态

- Status: accepted; implemented
- Date: 2026-09-17
- Plan: [V3D3](../../../AgentDocs/vector-tiles/plans/2026-09-17-v3d3-state.md)
- Related: [ADR-0058](ADR-0058-vector-tile-frontend-contract.md)、[ADR-0067](ADR-0067-vector-worker-preparation.md)、[ADR-0068](ADR-0068-symbol-placement-and-dynamic-buffers.md)
- SGP: None

## 决定

Feature state 按 Layer/source/sourceLayer/id 保存，不与瓦片驻留绑定；相同 ID 的切片共享状态，
不同 source/source-layer 与不同 Layer 隔离。MVT 原始 ID 为 string，安全整数 API ID 转 string；缺失 ID 不臆造。
set 合并 key，remove 可删除指定 key 或整个 feature；get 返回副本。所有状态只接受有限 JSON 数据。
Global state 按 Layer 保存，setGlobalStateProperty 的 null 删除该 key；getGlobalState 返回副本。

Style 是可共享的不可变配置；计算 context 通过显式参数传入。仅 paint 允许状态表达式，layout/filter 仍拒绝。
状态默认空，业务用 coalesce/case 指定默认值；不新增动态 style 替换或 root state defaults。

Worker 准备返回完整 ID 索引，包括被 filter/零 alpha 排除的要素，以便后续状态能恢复显示。
改变状态只失效命中 ID 与表达式 key 的 entry/style，沿用批次预算发布与旧任务隔离；不重新请求 MVT。
保留无关批次及旧可见结果，避免重新加载整图。首轮仍在 Worker 重建受影响批次的几何，
不宣称达到 MapLibre paint-only GPU subrange 更新成本。Symbol paint 复用既有 shape 与 buffers。

状态 API 不创建/销毁 GPU；资源操作只在 normal render。Layer 销毁同时释放状态和任务所有权。
所有 API、数据约束与性能边界在 Specs、类型生成和实际安装包中验证。
