# 总体计划：SceneGIS 平面世界

## 元数据

- 计划类型（Plan type）：`extension`
- 状态（Status）：`active`
- 负责人角色（Owner role）：`architecture`
- 架构评审（Architecture review）：`approved`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-05`
- 更新日期（Updated）：`2026-08-05`
- 相关讨论（Related discussions）：无
- 相关评审（Related reviews）：
  [P1 world contract review request](../reviews/2026-08-05-p1-world-contract.md)
- ADR：
  - `Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md`
  - `Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md`
- SGP：`SGP-0001`（primary world lifecycle slot，`active`）

## 目标

为 CesiumJS 增加一个真正的平面主世界。平面场景使用可配置、严格为正方形且
以米为单位的坐标域，不创建也不模拟 `Globe`。最终应支持瓦片化平面渲染、
相机导航、拾取和栅格图层，同时保持 Cesium 默认 `Globe` 的既有行为。

## 非目标

- 在运行时切换 `Globe` 与平面世界，或同时渲染二者。
- 在运行时执行 CRS 重投影，或支持非米制世界坐标。
- 支持矩形、无界、曲面或混合世界坐标域。
- 增加新的 `SceneMode`；平面世界仅在 `SCENE3D` 中运行。
- 在首个版本中支持高程地形、地下导航或 `Globe` 大气效果。
- 自动兼容全部 `Globe` 专用 provider、widget 或 DataSource API。
- 将 `Globe`、`QuadtreePrimitive` 或 `GlobeSurfaceTile` 复制到 SceneGIS 中。

## 稳定架构边界

1. 一个 Scene 最多拥有一个主世界。`Globe` 与 `SceneGISPlanarWorld` 占据
   相同语义的生命周期槽位，并且互斥。
2. `scene.world` 暴露主世界。`scene.globe` 保留为向后兼容的 `Globe`
   访问器，在平面场景中为 `undefined`。
3. 平面位置、相机目标和拾取结果均使用 Cesium 原生、以米为单位的
   `Cartesian3(x, y, z)`。保留 Z 维度，并约定 Z 轴正方向向上。
4. `SceneGISPlanarExtent` 是通用、只读的 min/max 二维范围；
   `SceneGISPlanarCoordinateSystem` 组合该 extent，并对世界范围施加严格正方形、
   米制和固定轴向约束。二者都不负责重设坐标原点或隐式重投影。
5. 精度策略沿用 Cesium 的内容局部化方式：瓦片和模型的顶点使用局部坐标，
   再由 `modelMatrix` 放置到完整的平面世界坐标中。
6. 内部瓦片约定采用左上角为原点的 XYZ：X 向东递增，瓦片 Y 向南递增，
   Level 0 恰好只有一个根瓦片。
7. 平面遍历、平面数据和栅格数据使用平面接口，不引入 `Ellipsoid`、
   `Cartographic` 或大地测量语义的 `Rectangle`。
8. SceneGIS 实现保留在 SceneGIS-owned 路径中。对 upstream-owned file 的修改
   仅限窄小集成缝隙，并通过 SGP 标记和追踪。
9. `Globe` 专用功能仍是 `Globe` 的能力，不应成为
   `SceneGISPlanarWorld` 的必需成员，也不得用虚假的空实现字段冒充支持。

## 源码与基线事实

- 上游基线为 Cesium `1.144`，提交
  `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
- `packages/engine/Source/Scene/Globe.js` 定义的是具体类，它会创建椭球地形
  provider、影像集合以及 Globe surface quadtree。
- `packages/engine/Source/Scene/Scene.js` 持有 `_globe`，调用其帧生命周期，
  同时还会访问 `Globe` 专用 provider、私有 surface 状态和大地测量行为。
- `packages/engine/Source/Widget/CesiumWidget.js` 创建默认 `Globe`，并在
  构造 Scene 后将其赋给 Scene。
- `packages/widgets/Source/Viewer/Viewer.js` 的 base layer picker、地形选项
  和多个便捷属性都以 `Globe` 为前提。
- Cesium 的 `TilingScheme`、`QuadtreeTile` 和 `QuadtreePrimitive` 与
  `Ellipsoid`、`Cartographic`、大地测量 `Rectangle`、地平线遮挡和高度
  更新存在耦合。
- 在 `SCENE3D` 中，Cesium 的 command 执行、矩阵、视锥裁剪以及基于深度的
  位置重建可以作用于一般的笛卡尔世界坐标。

## 阶段路线图

| 阶段 | 目标                                                                           | 依赖   | 进入门槛                              | 完成门槛                                                              | 状态        | 阶段计划                                         |
| ---- | ------------------------------------------------------------------------------ | ------ | ------------------------------------- | --------------------------------------------------------------------- | ----------- | ------------------------------------------------ |
| P1   | 引入主世界契约和生命周期集成缝隙，同时保持 `Globe` 行为。                      | 无     | 总体计划获批；已分配 ADR 和 SGP。     | 默认 `Globe` 回归通过；模拟的非 `Globe` 世界可以完成 Scene 生命周期。 | `completed` | [第一阶段](2026-08-05-phase-1-world-contract.md) |
| P2   | 实现米制范围、坐标系元数据和单根平面瓦片数学。                                 | P1     | P1 契约稳定。                         | 公共 Core API 与完整的瓦片边界 Specs 通过。                           | `proposed`  | [第二阶段](2026-08-05-phase-2-planar-core.md)    |
| P3   | 实现 `SceneGISPlanarWorld`、平面 surface renderer、平面 quadtree、SSE 和缓存。 | P1、P2 | Core 类型稳定；已检查 renderer 源码。 | 通过程序控制的 Scene 可在没有 `Globe` 的情况下渲染并细化平面。        | `pending`   | 在阶段进入时创建。                               |
| P4   | 实现平面导航、home view、边界约束和世界坐标拾取。                              | P3     | 平面 surface runtime 稳定。           | 鼠标/触摸导航及 `Cartesian3` 平面拾取通过交互 Specs。                 | `pending`   | 在阶段进入时创建。                               |
| P5   | 实现平面栅格 provider、图层、加载状态、祖先瓦片回退和合成。                    | P3、P4 | 瓦片选择与拾取契约稳定。              | XYZ 和 TMS 影像无空洞渲染，且资源能被确定性释放。                     | `pending`   | 在阶段进入时创建。                               |
| P6   | 集成 Viewer 默认行为、兼容 widget、Sandcastle 和公共开发流程。                 | P4、P5 | Engine API 稳定。                     | Viewer 可创建不含 `Globe` 专用控件的平面场景；示例与类型检查通过。    | `pending`   | 在阶段进入时创建。                               |
| P7   | 完成性能、生命周期、升级审计和首个版本文档的发布验收。                         | P1-P6  | 已形成 feature-complete 候选版本。    | 总体验收条件和发布证据齐备。                                          | `pending`   | 在阶段进入时创建。                               |

阶段状态只允许使用 `pending`、`proposed`、`active`、`completed`、
`deferred` 和 `superseded`。

## 跨阶段验证要求

- 每项行为变化都必须具有 SceneGIS-owned 自动化 Specs；Sandcastle 不能作为
  唯一证据。
- 公共 API 必须通过 engine 根导出和生成声明流程进行验证。
- 涉及公共 API 的阶段必须运行相关 build、`build-ts` 和 `tsc` 检查。
- 涉及渲染的阶段必须验证像素或 command、资源销毁以及可重复的性能特征。
- upstream-owned hunk 必须使用成对的 `SCENEGIS_PATCH` 标记，或登记为
  `manifest-only`，并能追溯到聚焦测试。
- 每个修改共享集成缝隙的阶段，都必须以默认 `Globe` 构造和代表性
  `Globe` 渲染作为回归门槛。
- 禁止手工编辑或提交生成文件。

## 全局风险与依赖

- `Scene.js`、`CesiumWidget.js` 和 `Viewer.js` 是上游变动频繁的文件，
  很可能成为升级冲突点。每个 SGP 应保持窄小并可独立测试。
- Camera、picking、Entity clamping 和 widget 中存在间接的 `Globe` 假设，
  其中一些可能只会在交互测试中暴露。需要维护明确的兼容性矩阵。
- 复用 Cesium 私有但与球面无关的工具可以减少重复，却会增加升级风险。
  每项此类依赖都应封装在一个 SceneGIS 私有 wrapper 后面。
- 极大的投影坐标可能暴露渲染路径中的精度假设。必须保留局部顶点数据，
  并使用大坐标测试 fixture 验证。
- 栅格回退和多图层合成会增加 GPU 内存与 draw call。在优化 shader 结构前，
  应先建立可量化的预算。
- 首个版本明确排除高程地形，但 surface provider 契约应允许后续扩展高程，
  同时不得宣称当前已经支持。

## 总体验收条件

- 调用方可通过米制范围和可选的公开 CRS 标识创建有界正方形平面世界。
- 平面 Scene 不包含 `Globe`，并且不能在运行时切换到 `Globe` 或与之混合。
- Level 0 只有一个瓦片；之后每一级的两个轴上均有 `2^level` 个瓦片，
  并具有明确记录的 XYZ 寻址约定。
- 公共位置、相机目标和拾取结果直接使用所配置的平面 `Cartesian3` 坐标，
  不执行全局重定心。
- 平面 surface 瓦片细化时无空洞，使用局部 geometry 加 `modelMatrix`，
  并遵循确定性的缓存和销毁规则。
- 平面相机控制、home view 和 surface picking 能覆盖所配置的坐标范围。
- 至少一个公共 URL template 栅格 provider 支持 XYZ 与 TMS 寻址、图层顺序
  和 alpha，并能在加载期间使用祖先瓦片回退。
- Viewer 具有显式的平面构造路径，且不会静默启用 `Globe` 专用 provider
  或 widget。
- 默认 `Globe` 应用保持既有行为，并通过针对性的回归测试。
- 公共构建、生成类型、相关 Specs、Sandcastle 及性能证据均通过验收。
- 每项上游修改都有 SGP 记录，每项长期架构决策都有 ADR 记录。

## 进度与交接

- 最近完成阶段：`P1-world-contract`（`completed`）。
- 最近完成阶段计划：
  [2026-08-05-phase-1-world-contract.md](2026-08-05-phase-1-world-contract.md)。
- P1 阶段提交：`10e7b42d4c`（`完成平面世界第一阶段主世界契约`）。
- 当前交接：P1-R001 至 P1-R003 均已复核为 `fixed`，
  [P1 review](../reviews/2026-08-05-p1-world-contract.md) 为 `approved`。
- 当前候选阶段：`P2-planar-core`（`proposed`）。核心架构已形成
  [ADR-0002](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)
  并获批准；中文
  [P2 phase plan](2026-08-05-phase-2-planar-core.md) 已由项目负责人确认，当前保持
  `draft` 以等待 Execution Agent 激活。
- 下一步：Execution Agent 从 P2 planning checkpoint 开始，将 P2 plan 和路线图
  转为 `active` 后实现本阶段。当前不得开始 P3 设计或实现。
- 后续阶段在达到各自进入门槛前，刻意只保留粗粒度描述。
