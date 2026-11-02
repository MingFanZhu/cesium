# 分段 Gaussian 泼溅

## Metadata

- Extension slug: `gaussian-splats`
- Status: completed; ordinary tiler source-coordinate reporting validated
- Planning model: extension
- Active extension plan: 无；[已完成迁移](plans/2026-10-23-migration.md)
- Current phase: P2 completed
- Active phase plan: 无；[已完成原生渲染](plans/2026-10-23-p2-native-rendering.md)
- Active standalone plan: 无；[已完成源坐标报告](plans/2026-10-28-source-coordinate-report.md)
- Architecture / execution contact: 本任务
- Last updated: 2026-11-02

## Scope

迁移 segmented-active-cut-v3 渲染、分段 CPU 切片与 authored LOD 导入。
排除 fixed10 加载/切片、训练蒸馏、SDK。保留旧分段二进制数据兼容。

## Engineering links

- Source: `packages/engine/Source/SceneGIS/{Core,Renderer,Scene}`
- Tool: `Tools/GaussianSplatTiler`
- Tool guide: [切片器使用说明](../../Tools/GaussianSplatTiler/使用说明.md)
- Specs: `packages/engine/Specs/SceneGIS` 与工具 Node tests
- Example: [分段高斯泼溅](../../Test/Rendering/分段高斯泼溅.html)
- API: [使用说明](../../Documentation/SceneGIS/GaussianSplats.md)
- Integration branch: `scenegis/develop`
- Current maintenance commit branch: `feature/mvt-building-materials`
- ADR: [ADR-0188](../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: SGP-0067（`Renderer/createUniform.js`）

## Current handoff

2026-11-02：视频投射扩展由 [video-projection](../video-projection/README.md) 管理，
共享多视角选级与 GPU 视频接收 / 遮挡已完成；
[G3 review](../video-projection/reviews/2026-11-02-g3-gaussian-qualification.md)记录公开 API、
双世界画面与资格。不重做解析加载，不改变 MCI4/GSP、排序源或 SDK。既有工具维护事项保持原状态。

P1 `040e7d72f6`、P2 `e1dc28d796` 已按负责人要求集成到 `scenegis/develop`。
RequestScheduler 临时取消误耗尽加载重试的问题已修复，253 项 Gaussian Specs 通过，
[调度取消 review](reviews/2026-10-23-scheduler-cancellation.md) 关闭 G7。
[切片器文档 review](reviews/2026-10-27-tiler-usage.md) 记录完整参数及坐标处理核对。
[磁盘分块 review](reviews/2026-10-27-bounded-partition.md) 关闭 G11～G13，
82 项工具测试通过，真实 2.14 亿点全量分块/读回通过，RSS 采样峰值约 295 MiB。
最新 [源坐标报告 review](reviews/2026-10-28-source-coordinate-report.md) 关闭 G14～G15，
普通报告新增源 EPSG/offset 与原始注释，20 项相关测试通过。共享工作区误带入其他提交的
构建器与索引已恢复为本次改动；本维护提交完整包含磁盘分块、注释解析、测试、独立使用说明
及交接文档。负责人于 2026-10-28 授权本地提交；未合并到集成分支或推送。
完整实际 LOD 成品未生成。
G10 为已说明的现有普通 raw spool 大坐标 Float32 限制；先局部化可避开该路径精度损失，
直接大坐标输入的实现修复等待范围确认。本次真实 PLY 的采样点为局部坐标，header 含
EPSG 4549 / offset，分块内存错误与大坐标精度无关，定位仍需明确的矩阵配置。
无 open discussion；[P2 review](reviews/2026-10-23-p2-rendering.md) 保留原迁移资格与验证边界。
