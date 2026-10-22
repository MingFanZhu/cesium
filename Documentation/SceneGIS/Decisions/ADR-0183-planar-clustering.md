# ADR-0183：平面原生 EntityCluster

## 状态与上下文

- Status: `approved`
- Date: `2026-10-22`
- Owner: 当前维护 Agent，依据负责人开放平面聚类的请求
- Plan: [平面聚类](../../../AgentDocs/planar-clustering/plans/2026-10-22-planar-clustering.md)
- Patch: `SGP-0066`

Cesium 1.144 的 EntityCluster 共用原生 collection、屏幕包围盒和 KDBush，但 SCENE3D 候选经过 EllipsoidalOccluder，
历史簇按 camera.positionCartographic.height 缩放复用。平面同样运行 SCENE3D，且正交缩放不对应 Z 高度；
仅删除 ADR-0014 / ADR-0016 的 disabled-only 检查会产生错误结果。

## 决策

复用原生 EntityCluster，保留 enabled 默认 false、pixelRange、minimumClusterSize、三个类型开关、show、clusterEvent 和 pool ownership。
CustomDataSource、默认 DataSource、显式绑定同一 World 的 GeoJSON/CZML 自动支持；不增加公共平行类。

EntityCluster 在 _initialize 时为真实 SceneGISPlanarWorld 创建私有实例策略；默认球面无策略，保留原算法。
策略位于 SceneGIS/DataSources，不复制聚类算法或注册全局 visualizer。
平面只排除相机后方锚点，不做椭球 horizon cull；重新聚类时使用当前屏幕坐标，不按球面高度复用旧簇。
这也避免动态位置变化时保留旧 centroid。透视与正交共享真实 Camera 投影，pixelRange 单位仍为 CSS pixels。

策略比较 view / projection matrix 与 canvas client dimensions，实际变化才标脏；忽略 camera.changed 的同步回调，
由 collection update 读取实际相机变化，不在更新 Entity 前同步聚类。Anchor 比较解析后位置、show 与影响屏幕包围盒的属性；动态 Property 每次 update 读取，
包括冻结 clock 和 resident terrain 高度变化。标脏后复用原生 update / atlas readiness 收敛。
聚类前恢复原 graphic clusterShow；未参与类型与全部类型关闭不得被旧聚类永久隐藏。

原生 PointPrimitive 的 public computeScreenSpacePosition 在 worldToWindowCoordinates 之后额外翻转 Y，
与 Billboard / Label 的左上角约定不同，混合类型会错误合并上下镜像位置。平面策略对点调用原生底层
_computeScreenSpacePosition，使用当前 resolved position；不改 Globe public Point 行为。混合类型离中心测试锁定这一差异。

clusterEvent 接收原 Entity 数组，默认 label.id 为该数组；自定义 point/billboard 需按原生方式自行赋 id。
普通未聚类 primitive.id 和 getBoundingSphere 保留原 Entity identity，framing/tracking 不读取 cluster centroid。
聚类是屏幕布局，不是地形遮挡分析；遵循原生同 Entity 图文处理，不额外承诺跨 DataSource 合并或稳定簇 ID。

Scene / World 仍由 Viewer 所有；策略仅持有 CPU 快照，无 GPU、timer、独立监听或 Worker。
EntityCluster.destroy 释放策略；移除/重新添加的数据源重建策略，继续原生可重用语义。
单个 live cluster 不允许跨 Scene / World 误用；默认球面行为及已有 DataSource 坐标绑定保持。

## 备选、发布与升级

拒绝复制 EntityCluster 或 monkey patch；仅解除校验不解决坐标语义，按相机 Z 复用历史也不适合正交场景。
唯一新增 upstream-owned file 为 packages/engine/Source/DataSources/EntityCluster.js，使用 SGP-0066 paired markers。
无 Shader / Worker / build 入口变更。私有 helper 自动生成 JS barrel，但不进入公共声明；原生 API 类型不变。
升级需复核 _initialize/update/destroy、ready、camera.changed、collection screen bbox、clusterShow 与池索引。
上游提供等价实例空间策略时移除该 seam。

## 验证

owned Specs 验证平面原点及大坐标、Point/Billboard/Label、动态 position/show、类型开关、透视/正交与视口变化、生命周期。
原生 EntityCluster Specs 锁定默认球面。Viewer dev/release E2E 提供拾取、重复增删、静态/变更成本与截图；
完整 release build、types、scoped lint/format 和 patch audit 确保交付边界。
