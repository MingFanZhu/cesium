# 平面世界默认零高程地形

- 类型：standalone plan
- 状态：completed
- 日期：2026-11-25
- 作者角色：架构与执行
- 关联：[ADR-0008](../../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)、[ADR-0010](../../../Documentation/SceneGIS/Decisions/ADR-0010-planar-terrain-query-picking-and-sampling.md)、[评审](../reviews/2026-11-25-default-zero-terrain.md)
- 上游接点：SGP-0001、SGP-0002

## 目标

构造平面 World 时安装标准零高程 provider。它与 World 共用切片方案，为范围内瓦片提供可采样的 0 米
数据。赋值 `undefined` 恢复同一个内置 provider。地表由该 provider 提供，数学参考面接口继续独立。

## 实施与验收

1. 使内置 provider 的瓦片同步进入覆盖选择，并复用现有共享四边形；默认地形无需网络、Worker、逐瓦片
   mesh 或 GPU buffer。远程 DEM 继续使用现有调度、LOD、占位与释放机制。
2. 让驻留查询、已渲染拾取和独立采样识别真实零高程，保留范围、裁剪及 hide 生命周期。
3. 检查 Viewer 和 CesiumWidget 的地形入口，以及默认栅格、矢量、深度和分析消费者。用定向 WebGL Specs
   验证切换、绘制资源和拾取，并通过发行构建及类型检查。

## 结果

World、Scene、CesiumWidget 和 Viewer 读到同一个 provider，写入 `undefined` 恢复默认。
独立采样无需预先渲染。正常渲染后，驻留查询和地形拾取使用真实零高程。
本地页面实测 0 米 → 30 米 → 0 米，共享顶点缓冲保持一份，自定义地形的顶点缓冲随切换释放。
针对性开发版 138 项及发行版 1 项默认地形测试通过。已有地形光照像素测试在基线上同样失败，
详见评审。
