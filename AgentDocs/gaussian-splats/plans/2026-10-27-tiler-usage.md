# 切片器使用说明与坐标契约核对

## Metadata

- Type: standalone plan
- Status: completed
- Owner: 本任务（architecture / execution）
- Date: 2026-10-27
- Parent plan: 无；迁移已完成，本次为文档维护
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: 无；不修改 upstream-owned files
- Discussion: 无未决产品设计
- Review: [文档与坐标核对](../reviews/2026-10-27-tiler-usage.md)

## Scope and facts

单独编写 `Tools/GaussianSplatTiler/使用说明.md`，覆盖普通 CPU 切片 CLI 的全部参数、
已有 LOD CLI 与 manifest 的全部字段、输入格式、产物、部署和已有坐标/中心点的使用。
不改变算法、协议、公共 API、SDK 或默认值。

源码调用链：`segmentedCli -> segmentedBuilder -> segmentedHierarchyBuilder ->
segmentedPartition / fixedRangeRawGaussianSpool`；已有 LOD 路径为
`prebuiltLodCli -> prebuiltLodBuilder -> prebuiltLodSource`。
工具无需构建，直接运行 Node ESM 并引用 engine owned Core；测试入口为工具 `package.json`。
交付仅 Markdown，无生成文件。

已核对：`coordinateSystem` 不投影；`localOrigin` 不参与顶点位移；运行时复合矩阵为
`modelMatrix * localToFixed`。普通 raw spool 在减局部 origin 前写 Float32，double 大坐标
可能损失细节；已有 LOD 路径保留 double 到减共用 origin。PLY comments 不驱动坐标变换，
已有 LOD 仅校验并记录 epsg/offset 注释。这些限制必须明确，不能写成已支持自动地理配准。

## Steps and verification

1. 逐项对照 CLI 白名单、默认值、校验和运行时放置链，编写参数表及坐标情形示例。
2. 用最小合成数据核对注释、localOrigin、非 identity 矩阵、double 坐标精度行为。
3. 运行现有 CLI/已有 LOD 相关 Node tests，检查文档命令及参数覆盖。
4. 对改动 Markdown 运行格式、lint、相对链接和 diff whitespace 检查，回写 review/index。

## Acceptance and risks

用户能从完整仓库直接执行 build/inspect/validate，区分分块 origin、信息 origin 和放置矩阵，
理解投影坐标、ENU、ECEF、偏移坐标的前置条件。未提供用户的实际 PLY，本次不能判断其
header/sidecar 中中心点的具体语义；不声称验证真实数据配准或修复大坐标精度路径。

## Result

独立使用说明已完成，README 和引擎使用文档增加入口。16 项相关测试、12/10 项参数覆盖
核对及坐标/big-endian 合成探针通过。大坐标 Float32 限制记录为 review G10；
未修改算法或新增坐标转换功能，不自动提交。
