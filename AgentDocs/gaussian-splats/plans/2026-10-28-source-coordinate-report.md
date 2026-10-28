# 普通切片的源坐标报告

## Metadata

- Type: standalone plan
- Status: completed
- Owner: 本任务（architecture / execution）
- Date: 2026-10-28
- Parent plan: 无；已完成迁移的工具维护
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: 无；仅 SceneGIS-owned Tools / 文档
- Discussion: 无待决事项
- Review: [源坐标报告 review](../reviews/2026-10-28-source-coordinate-report.md)

## Source facts and design

普通 CLI 经 segmentedBuilder 调用 segmentedHierarchyBuilder，磁盘分块已有 header
回调和返回值，但报告仅记录命令配置。prebuiltLodSource 已校验 epsg/offsetx/y/z 并将
数值写入 coordinates.sourceComments，保留 inputs[].comments。

抽取两条路线共用的注释解析器，沿用不区分大小写的空白分隔语法、有限数值和冲突校验。
普通 builder 在 header 回调阶段校验，在 coordinate.sourceComments 保存数值，在
source.comments 保存注释正文及原始数值字符，缺失字段不补零、不猜测 CRS 或高程。
保留原 CLI 配置字段；不应用 offset、不重投影、不改变 MCI/GSP 或 SDK。

## Validation and exit

1. 回归普通 CLI 的报告落盘、原始长小数文本、缺失/部分元数据、大小写、冲突及非法值。
2. 注释有无不改变 runtime sourceBounds、localToFixed 和 pack 字节；执行现有 prebuilt
   注释测试，确认共享解析器未改变导入契约。
3. 更新使用说明的字段路径、精度、缺失行为和球面定位使用边界，回写 review/index。

仅新增构建报告字段，无引擎公共 API / 构建入口变化；采用工具定向测试和格式检查。
G10 普通 raw spool 大坐标 Float32 限制继续适用，保存源定位信息并不消除此限制。

## Result

共享注释解析、普通报告和使用说明均已实现；20 项定向 Node tests 通过，真实 PLY header
读取确认 EPSG/offset 数值及原始长小数文本。无全量大文件重建，无运行时或 SDK 修改。
