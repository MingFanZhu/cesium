# Phase Plan: V3A 有界瓦片替换

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Phase: `V3A`
- Owner / reviewer role: 当前 architecture/execution Agent，自审
- Architecture review: `confirmed`
- Created / Updated: `2026-09-13`
- Entry checkpoint: `a6e4383cfc`（V2，项目负责人实际画面验收通过）
- Related review: [V3A](../reviews/2026-09-13-v3a-cover-review.md)；
  entry [V2](../reviews/2026-09-13-v2-flat-review.md)
- ADR: [ADR-0060](../../../Documentation/SceneGIS/Decisions/ADR-0060-vector-tile-resident-render-cover.md)
- SGP: None

## Objective and scope

将 V2 单级 desired cover 与实际 render cover 分开。缩放后的新瓦片准备期间复用缓存中已发布的
ancestor 或 descendant；每个地图片段只贡献一次，颜色和拾取使用相同覆盖。
保持单根坐标、独立解码、直接矢量、normal-frame ownership 与既有预算。

V3 拆为 V3A 流式替换、V3B 样式质量、V3C 密集数据性能与必要线程三个独立 checkpoint。
原因是 V2 已分别暴露覆盖缺失、线型质量和未测真实负载，三者具有独立实现面与验收条件。
本阶段不修改 stroke/AA profile，不做 style mutation、Worker 或生产 terrain。

## Source facts

- V2 `updateSources` 只保留 desired entries 到 visible，`publishOrder` 只发布 visible；
  缩放后 pending desired 不会使用已经上传的旧瓦片。
- V2 缓存有 raw data、batches、signature、request attempt 和 LRU；可复用 published entry，
  空数据同样是合法完成状态。网络失败不能冒充空 tile。
- V2 fragment 已把 fragment ray 变换到 tile-local plane 并做半开裁剪；
  可以把完整 tile bounds 收窄为显式 render region，复用 geometry/VA/Shader/pick IDs。
- 普通 DrawCommand 支持 shallowClone 与 uniformMap；normal render 可发布独立 region 命令，
  pick/depth 仍重放，不能在执行时改共享 uniform 为另一个 region。
- 普通 JS、GLSL、镜像 Specs 的现有自动构建入口保持；没有新资源种类或上游文件需要接入。

图谱未包含新 VectorTile 符号，已回退读取 V2 checkpoint 源码，未以旧索引推断调用关系。

## Implementation sequence

1. Core pure helper 计算不重叠的 resident render regions：exact → 最近 ancestor → 无重叠 published descendants。
   每个 region 保留真实 source tile 身份；不伪装为 desired tile。
2. Layer 保留独立 desired/render sets；desired 优先占 cache，剩余 slots 优先保护本帧 fallback。
   不增加隐式 request 或无限保留旧 cover；取消未选中 request，exact arrival 正常帧替换。
3. Batch 把 region 变为稳定命令与局部裁剪 uniform；借用相同 GPU 对象，background 继续完整 root。
   同 style layer 的所有 exact/fallback regions 完成后再进入下一层。
4. 已发布 fallback 的 zoom-dependent 样式按既有 upload budget 更新；
   失败只报告一次，合法空 exact 必须移除 fallback。
5. Test 页面增加可控请求完成延迟验收，自动化验证中间状态的颜色/pick，而不只验证最终 ready。
   性能与 command/resource 身份对比 V2 同数据 baseline。

## Validation and exit

- Pure selection：ancestor 裁剪、partial child arrival、descendant 空洞与去重、缓存上限。
- 真 WebGL：半透明 parent/child 无双叠色；共享边正确；错误、空数据、zoom-out 与多 style layer 的 pick。
- 生命周期：pending replacement、隐藏、取消与迟到结果；GPU clone 不拥有 VA/Shader；
  warm 和 pick/depth 不额外请求/上传；exact 发布后清除 region 对旧资源的引用。
- 当前公开统计新增 rendered/fallback region 计数，运行完整 build/types；Shader 更新需 release/package。
- 本地页面及 E2E 验证延迟缩放；用户确认本阶段画面后自审关闭并独立提交，再进入 V3B。

## Accepted limits

只复用现有 resident 内容，不主动下载祖先链。首图或相机跳到完全未缓存区域仍等待 desired。
Cache count 是硬上限；没有剩余 slots 时可以淘汰 fallback，不能为连续性突破配置。
不做 cross-fade，不保证不同 LOD 数据本身在几何/拓扑/属性上连续。
Terminal failed desired 可使用 resident fallback，但仍在 failedTiles/errorEvent 中显式报告。

## Implementation and handoff

Core selector、Layer desired/render/cache、每 region 独立命令与裁剪已实现；
固定 Shader 继续直接输出矢量颜色。新增 3 项 pure selection 和 5 项真实 Context 回归。
Test 的“逐块加载演示”使用真实 PBF 并延迟 source 完成；2 项 E2E 检查最终与中间状态。

自审复现了 camera Z=0 后旧覆盖计数与 pending 保留的问题，已统一无视图/隐藏退出路径；
回归确认取消、过时结果忽略和恢复时重新请求。此修复属于本阶段 coverage 生命周期。
当前 67 项 focused Specs 与 2 项 E2E 通过，完整验证证据见本阶段 review。
项目负责人于 2026-09-13 确认过渡画面通过；实现、自审和视觉 gate 全部关闭。
Architecture Agent 建立本阶段独立 checkpoint 后再激活 V3B。
