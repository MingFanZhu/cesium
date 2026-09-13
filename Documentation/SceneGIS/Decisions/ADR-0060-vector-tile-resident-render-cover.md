# ADR-0060：矢量瓦片 resident render cover

## Status and context

- Status: `accepted`
- Date: `2026-09-13`
- Parent: [ADR-0059](ADR-0059-planar-vector-tile-batch-renderer.md)
- Plan: [V3A](../../../AgentDocs/vector-tiles/plans/2026-09-13-v3a-streaming-cover.md)
- SGP: None

V2 `a6e4383cfc` 已通过实现、自动化与项目负责人视觉验收。
其 desired 与 actual cover 相同，缩放后虽有旧缓存，pending tile 区域仍立即缺图。
延续 SceneGIS 的 normal-render mutation 与 snapshot replay，增加显式 resident coverage。

## Decision

每个 source 保留 desired tiles、resident entries 与实际 render regions 三个概念。
每个 desired 区域按如下顺序选择：

1. 已发布 exact entry，包括合法空 tile。
2. 最近的已发布 ancestor，裁剪到 desired 区域。
3. 没有 ancestor 时使用已发布 descendants；只选择相互不包含的较浅节点，覆盖已知区域。

Published 与 current desired ready 分开；上传中的新状态不得删除旧 geometry，
失败不得被当成空内容。一个 desired 区域出现 exact content 后，在正常帧完全切换到它。
Render regions 互不重叠，ancestor 不覆盖已由 exact child 替换的区域；
同一个 source/style layer 的 alpha 不因 LOD replacement 叠加两次。
跨 style layer 继续保持原有全 tile painter order。

比较过整组 child 等齐再切换：它避免子区域命令，但会让已到达细节等待最慢 sibling。
选择 region clipping 允许独立发布，裁剪只改变 uniform/command，不复制 geometry 或引入颜色纹理。
不使用 cross-fade；数据 LOD 自身的几何跳变不属于 coverage 消除的范围。

## Resources, budgets and errors

tileCacheSize 继续是每 source resident tile 总数硬上限。desired 优先，其余容量先保留本帧 fallback，
再按 LRU 保留其余缓存；不足时允许淘汰 fallback。建议为 desired 和历史 cover 留出容量，
但不能暗中放宽原有配置或让小 cache 死锁。
只复用 resident ancestors/descendants，不新增 bootstrap 或祖先链 request。
请求与上传仍由既有 maximumRequests/maximumUploadsPerFrame 控制。

新 region DrawCommand 只借用原 batch VA、Shader 和 pick identity，销毁仍由原 Primitive exactly once 负责。
每 region 具有独立的 uniformMap 与 local clip bounds，color/pick 借用相同 region 的 bounds；
不能在执行前把所有 region 共享的 uniform 改成最后一个区域。
Normal render 计算覆盖、更新 region command；pick/depth 使用最近发布状态，不触发 selection 或 LRU。

style/source 仍固定。Fallback 的 camera-dependent paint 在 upload 预算内更新，
其 terminal error 不允许无限 retry 或持续 requestRender。`tilesLoaded` 描述 desired 工作，
使用 fallback 不等于 desired ready；terminal failure 可收敛但通过 errorEvent/failedTiles 报告。

`statistics.visibleTiles` 继续表示 desired 数；新增 `renderedTiles`、`fallbackTiles` 与 `renderRegions`，
分别表示实际借用的独立 source tiles、其中的替代 tiles、以及互不重叠覆盖区域数。
`drawCommands` 表示实际 region 命令数，不把 GPU buffer 的复用误报为一条 command。
Pick ID 中的 tile 始终是真实 source tile，而非裁剪目标。
隐藏或无法计算有效平面比例时，在 normal update 清空 desired/render 并取消 pending，保留缓存。

## Build, validation and upgrades

V5A 浅俯角修正通过 [ADR-0064](ADR-0064-vector-perspective-lod.md) 将 desired selection 改为
共享 planar SSE 的 mixed leaves；本 ADR 的 region resolution、资源 ownership 与发布优先级保持。

沿用 ADR-0030 固定 GLSL 与普通 JS 构建，不新增 upstream-owned 文件。
Pure coverage、部分到达/空数据/失败的 WebGL alpha/pick、bounded cache 和生命周期共同验收。
实际页面加可控延迟，检查 replacement 中间状态；不采用额外 settling frames。
升级检查 DrawCommand clone/derivedCommands、uniformMap、Primitive ownership 与 planar pass 顺序。
实现与验证记录见 [V3A review](../../../AgentDocs/vector-tiles/reviews/2026-09-13-v3a-cover-review.md)。
