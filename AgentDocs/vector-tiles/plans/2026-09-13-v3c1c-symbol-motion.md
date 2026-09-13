# Phase Plan: V3C1C 标注交互更新

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent: [Extension](2026-09-12-vector-tiles-extension.md)
- Owner / reviewer: 当前 architecture/execution Agent，自审
- Date: `2026-09-13`
- Entry checkpoint: V3C1B `065c345efd`
- Architecture review: `approved`；负责人要求实施已讨论的前三项优化
- ADR: [ADR-0068](../../../Documentation/SceneGIS/Decisions/ADR-0068-symbol-placement-and-dynamic-buffers.md)
- SGP: None
- Review: [V3C1C review](../reviews/2026-09-13-v3c1c-symbol-motion-review.md)

## Source facts and scope

V3C1B 当前视角连续 pan/rotate CPU median 为 22.0/22.8 ms。相机矩阵失效触发完整
collect/sort/identity/collision/publication；map-aligned collision 逐字投影四角，显示字形重复写入
25 floats × 6 vertices。MapLibre 的 pauseable placement、独立碰撞框/路径、静态与动态 buffers
提供职责参考。本阶段只实现这三项；不修改 tile selection、底图命令合批、深度策略或 terrain/Globe。

## Implementation

1. 按 render entry/symbol layout 缓存稳定候选及 identity。Placement 保存不可变相机快照，
   用可暂停遍历按约 2 ms 软预算推进，正常交互复用近期提交结果，最长 100 ms 后启动新的布局。
   正在计算的 cohort 不因连续相机变化重启；最新视图在下轮处理。资源/cover 变更及时调度，
   已失去 owner、出视口、越 near/far/远景阈值的已发布文字在当前帧隐藏。
2. Collision 与 glyph geometry 分离。Point 使用整组布局框；along-line 使用覆盖路径和字形外扩
   的分段保守代理。先碰撞预检，再为通过候选计算真实 glyph geometry/验证 max-angle，最后插入。
   路径代理允许保守的额外避让；不声明旧逐字碰撞逐像素一致。
3. 每帧只更新已发布标注的实际 geometry/visibility/size；GPU 保持当前相机与原有 pick 派生。
   字形 UV、paint/pick 与动态 position/offset/size/visibility 分离为两个 buffers；保持必要批次层序。
   只有 dirty stream/range 上传，静止与平移时不重复上传不变数据。
4. 撤销、清空、移除及销毁释放 active/pending references、GPU 与 picks；pending 不能复活已删除内容。
   Readiness 包含 pending placement；pick/depth 不推进布局、资源请求或上传。

## Validation and exit

- Specs：可暂停布局收敛、相机移动不饿死、当前帧投影/pick、候选缓存、碰撞代理、optional/
  overlap/max-angle、dirty buffer、cover/resource invalidation 与 clear/destroy。
- 本地 Test/E2E：中文/Latin、曲线/路牌/箭头、倾斜/旋转/缩放、DPR、重建；保留公开页实际交互。
- 同一应用浏览器/相机轨迹对比 CPU、placement 工作、buffer 上传与资源，视觉由负责人最终确认。
- Engine/root build、相关 Specs/E2E、release 与 installed-package Shader smoke；只检查相关变更。
- Review/正式契约/handoff 记录收益与代理碰撞、布局延迟边界；负责人 gate 后独立 checkpoint。

## Implementation result and handoff

三项优化已实现，技术自审通过；具体函数归属、失败处置和验证证据见 review。沿线路径代理采用
字形外接圆半径形成保守分段包络，没有照搬 MapLibre collision circles；2 ms 是可暂停步骤的
软预算，sort、首次 tile candidate 建立和批次发布不能在单步骤内抢占。100 ms 是普通相机更新
复用已提交布局后启动下一轮的间隔，不是完整布局完成期限。字形 draw/pick 始终使用当前相机。

146 项 vector Specs、8 项相关 E2E 和实际 installed-engine / release ESM / IIFE 验证通过。
浅角同轨迹 CPU median 降至 12.9/13.3 ms，主地图 command/cover 范围保持；保守代理降低部分
标注密度，负责人需要验收密度、交互布局延迟与画面。无上游改动、无新 SGP、无新 public API。
剩余地图命令/深度开销和驻留字节硬上限沿用总体计划风险；本阶段不扩展实现。
负责人于 2026-09-13 明确确认验收通过，视觉/交互 gate 已关闭；本阶段实现、Specs、ADR 与
AgentDocs 形成独立本地 checkpoint。后续阶段尚未激活，地形能力讨论不扩大本次已验收范围。
