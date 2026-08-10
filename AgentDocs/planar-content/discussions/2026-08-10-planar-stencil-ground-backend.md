# Discussion: Planar depth/stencil ground backend

## Metadata

- Status: `resolved`
- Date: `2026-08-10`
- Owner role: `architecture`
- Decision owner: Project Owner
- Parent plan:
  [SceneGIS 平面内容总体计划](../plans/2026-08-08-planar-content-extension.md)
- Resulting phase:
  [C11 Planar depth/stencil ground rendering](../plans/2026-08-10-phase-c11-planar-depth-stencil-ground-rendering.md)
- Resulting decision:
  [ADR-0023](../../../Documentation/SceneGIS/Decisions/ADR-0023-planar-depth-stencil-ground-rendering.md)

## 问题

C9通过CPU把public Polyline/Polygon与当帧actual terrain triangles裁切，生成真正贴合当前render cover的
Geometry。项目负责人在C10最终人工验收前提出：Cesium球面Ground Primitive使用shadow volume与stencil
classification，为何planar ground没有采用同一思想？长期实现是否应继续保留actual-mesh backend？

## 源码事实

1. Cesium `GroundPrimitive`不是coordinate-neutral接口。它从ellipsoid rectangle读取
   `ApproximateTerrainHeights`，要求Geometry实现`createShadowVolume()`，再委托`ClassificationPrimitive`。
2. `ClassificationPrimitive`为每个volume创建stencil-depth与color/pick命令，使用z-fail front/back计数，命令进入
   `Pass.TERRAIN_CLASSIFICATION`。该pass在Scene中位于`Pass.GLOBE`之后、`Pass.OPAQUE`之前。
3. Cesium `GroundPolylinePrimitive`不是面状classification的简单复用；它使用stable polyline volume和专用
   `PolylineShadowVolume*` Shader，但同样进入`Pass.TERRAIN_CLASSIFICATION`，不按terrain triangle重建line mesh。
4. 当前planar Surface command使用`Pass.OPAQUE`，所以若Ground command直接改成
   `Pass.TERRAIN_CLASSIFICATION`，会在planar terrain depth之前执行。
5. PlanarWorld与Globe在同一Scene中互斥，且只支持SCENE3D。把planar primary surface放入现有
   `Pass.GLOBE`槽位，可以先建立surface color/depth，再执行现有terrain-classification槽位；这只是复用Scene pass
   ordering，不复用Ellipsoid、Globe对象或球面Geometry。
6. `SceneGISPlanarTerrainProvider`提供同步global `minimumHeight`/`maximumHeight`，可以替代
   `ApproximateTerrainHeights`作为planar shadow volume的Z envelope。无provider时surface为Z=0。
7. C9 actual-mesh backend可以表达mixed `NONE`/`RELATIVE_TO_GROUND`和ground-relative extrusion，但代价是
   terrain LOD/revision变化时重新CPU clip、构建Geometry并替换GPU资源。纯surface classification只表达地表本身，
   不能正确生成离地偏移面或随terrain变化的拉伸侧壁。

## 方案

### A. 保留C9并为简单面增加stencil fast path

优点是保留全部C9语义，风险较低。缺点是形成两个长期backend、两套picking/bounds/lifecycle与难以解释的自动
选择规则。项目负责人明确拒绝。

### B. 单一planar GPU ground backend

Polygon类使用planar shadow volume + depth/stencil classification；Polyline类使用对应的stable volume与专用GPU
ground-line Shader。两者共享同一个public Ground Primitive、surface pass、provider envelope、pick/lifecycle和
capability contract，不保留actual-triangle CPU drape fallback。

该方案要求把continuous ground公共语义收窄为surface clamp：ground wrapper隐式表示
`CLAMP_TO_GROUND`，不再接受`heightReference`或`extrudedHeightReference`。Ordinary `NONE`继续走普通
Primitive；面状`RELATIVE_TO_GROUND`和ground-relative extrusion明确fail-fast。Anchor类对象现有resident-height
relative语义不受影响。

### C. 为全部C9语义建立GPU height/displacement系统

可以保留relative/extrusion，但需要terrain height atlas、per-tile displacement、额外细分或新mesh protocol，已经不再
是Cesium Ground Primitive的stencil思想，也会扩大terrain renderer与public Material范围。本阶段不采用。

## 结论

项目负责人选择方案B。C11是替换性阶段，不是可选性能优化：

- 删除C9 actual-cover draper、ground-render snapshot和late registration；
- public `SceneGISPlanarGroundPrimitive`保留名称与single logical instance，但收窄为implicit surface clamp；
- area与polyline允许内部采用与Cesium对应的两种GPU算法，但都属于同一depth/stencil ground backend，禁止
  actual-mesh fallback；
- 优先将planar Surface迁移到现有`Pass.GLOBE`并把ground命令放入现有
  `Pass.TERRAIN_CLASSIFICATION`，预期upstream-owned files=`0`；
- 若现有pass reuse在真实render/pick/depth中不成立，Execution停止并回报，不自行新增Scene pass或SGP；
- C10旧页面没有获得最终人工验收，最终浏览器/GPU门禁转移到C11更新后的唯一Sandcastle。
