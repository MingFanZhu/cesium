# Phase Plan: 协议与 CPU 工具

## Metadata

- Plan type: phase
- Status: completed
- Parent plan: [migration](2026-10-23-migration.md)
- Phase: P1
- Owner role: architecture / execution
- Architecture review: confirmed（本任务）
- Created / updated: 2026-10-23
- Related discussions / reviews: None
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: None

## 设计与源码事实

分段 CPU producer 仅通过 sha256 helper 引入旧 fixed10 builder；提取该 helper。
mixed runtimeIndex 只保留 tiny manifest 和坐标校验。浏览器依赖闭包放 Core private，
Node I/O 与 worker_threads 放 Tools；避免为入口名称兼容搬入被排除的固定网格模块。
保留 source 字段和 producer identity；内部文件改名不改变文件格式。

## 步骤与影响路径

1. 在 `Source/SceneGIS/Core/_private/Gaussian` 迁移纯协议、数学与 segmented runtime。
2. 在 `Tools/GaussianSplatTiler` 迁移 CPU builder/CLI、必要 shared reducer 和 Node I/O。
3. 迁移对应 Node tests 和小型文本 fixture，添加范围/依赖检查与使用说明。
4. Node tests 与 CLI round trip；检查未引入固定网格入口或 browser Node 依赖。
5. 回写结果、review、格式与文档检查，创建本地 checkpoint。

## 验证与完成条件

Node tests 覆盖 MCI 解码与损坏输入、Active Cut/ownership、CPU proxy 和产物校验。
CLI 使用本地小型 fixture 构建、inspect、validate；已知旧产物用同一 reader 验证。
已有公共 API 尚未增加；完整 engine build/type 资格在 P2 完成。
风险：旧共享代码中仍有历史名称；只保留实际分段依赖，不以改名改变 ABI。

## Deviations and results

已迁移 23 个 Core shared 模块和 37 个 Node 工具模块；78 项测试通过。
同输入与旧 producer 的 manifest/MCI/pack 逐字节一致，Core ESLint 与无 Node 依赖检查通过。
来源自带 24 项失效 runtime 测试不计入通过数，详见 [review](../reviews/2026-10-23-p1-migration.md)。
当前阶段未修改 upstream-owned files；待建立本地 checkpoint 后进入 P2。
