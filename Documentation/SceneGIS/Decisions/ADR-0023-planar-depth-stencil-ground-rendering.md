# ADR-0023：平面 Depth/Stencil Ground Rendering

## 状态

- Status：`approved`
- Date：`2026-08-10`
- Decision owners：Project Owner、Architecture Agent
- Related discussion：
  `AgentDocs/planar-content/discussions/2026-08-10-planar-stencil-ground-backend.md`
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-10-phase-c11-planar-depth-stencil-ground-rendering.md`
- Supersedes：ADR-0021中的actual-cover CPU drape、ground-render snapshot与late-registration backend
- Existing upstream seams：`SGP-0001`、`SGP-0002` unchanged；C11预期新增SGP=`0`

## 上下文

C9以correctness-first方式实现连续贴地：normal render确定actual terrain cover后，CPU将source Polyline/Polygon
与Float32 terrain triangles求交，生成local DOUBLE Geometry并通过standard Primitive提交。这使rendered triangle、
`scene.pickPosition`和mixed HeightReference/extrusion具有直接闭环，但terrain LOD、revision或provider变化会触发
Geometry和GPU resource replacement。

项目负责人要求长期实现遵循Cesium球面ground思想，并明确拒绝actual-mesh/stencil混合backend。当前Cesium源码
提供以下可借鉴但不能直接复用的事实：

- `GroundPrimitive`使用ellipsoid rectangle、`ApproximateTerrainHeights`、Geometry `createShadowVolume()`与
  `ClassificationPrimitive`；
- `ClassificationPrimitive`使用z-fail stencil-depth pass和随后color/pick pass；
- `GroundPolylinePrimitive`使用stable polyline volume与专用ShadowVolume Shader；
- 两者的terrain命令均进入`Pass.TERRAIN_CLASSIFICATION`；
- Scene执行顺序为`Pass.GLOBE`、`Pass.TERRAIN_CLASSIFICATION`，之后才是`Pass.OPAQUE`；
- 当前planar Surface使用`Pass.OPAQUE`，因此不能只替换Ground commands；
- PlanarWorld与Globe互斥、固定SCENE3D，TerrainProvider已有global finite height envelope。

## 决策

### 单一GPU ground backend

Planar continuous ground统一采用SceneGIS-owned GPU backend：

1. Area path：stable planar shadow volume + z-fail stencil classification + color/pick pass。
2. Polyline path：stable planar segment volume + dedicated ground-line Shader，采用与Cesium
   `GroundPolylinePrimitive`相同的“由surface depth决定可见贴地片段”思想。

两条内部路径是同一public runtime的geometry-kind specialization，不是两个可选backend。任何路径都不得读取actual
terrain triangles、生成贴地CPU Geometry或在失败时回退到C9 draper。

### Surface与classification pass

Planar Surface normal/pick/depth commands从`Pass.OPAQUE`迁移到`Pass.GLOBE`。这是primary world surface槽位，
不把PlanarWorld伪装为`Globe`，也不引入Ellipsoid或Globe lifecycle。由于一个Scene只能拥有一个primary World，
planar surface与真实Globe commands不会共存。

Ground area/polyline commands进入现有`Pass.TERRAIN_CLASSIFICATION`。预期顺序为：

```text
planar surface color/depth (Pass.GLOBE)
  -> ground stencil/line classification (Pass.TERRAIN_CLASSIFICATION)
  -> ordinary content (Pass.OPAQUE/TRANSLUCENT)
```

`scene.globe === undefined`时`clearGlobeDepth`保持false，classification后的surface depth继续用于普通内容和
`pickPosition`。P3/P4已有surface command replay只允许按真实pick/depth事实做最小调整；不得造成重复提交、selection
mutation或allocation regression。

2026-10-23：[ADR-0185](ADR-0185-planar-terrain-depth-test.md) 补齐可选
`world.depthTestAgainstTerrain=false`，在分类之后清除普通内容的地形深度。
默认 true 保留上述行为；分类始终先使用实际地表深度，不关闭 Surface 的深度写入。

若真实WebGL证明现有pass slots不能满足normal、pick、depth或地下相机语义，Execution必须暂停并回报Architecture。
未经新ADR/SGP不得修改upstream `Pass.js`、`Scene.js`或新增Scene pass。

### Public Ground Primitive契约

保留public `SceneGISPlanarGroundPrimitive`名称、single logical instance、caller-owned Geometry/Appearance/World、
original id、attributes、show、allowPicking、ready、bounds、single Context与exact lifecycle。

构造语义收窄为implicit surface clamp：

- 只接受non-extruded `SceneGISPlanarPolygonGeometry`或`SceneGISPlanarPolylineGeometry`；
- source positions的Z对ground classification不产生偏移，XY定义footprint/route；
- 删除public `heightReference`和`extrudedHeightReference` options/properties；
- 不提供modelMatrix、classificationType、zIndex、arbitrary Material或3D Tiles classification；
- compatible Color appearance、instance attribute representability与same-kind replacement规则继续有效；
- 新增或对齐`SceneGISPlanarGroundPrimitive.isSupported(scene)`，至少要求stencil buffer；unsupported Context必须在
  GPU/current mutation前fail-fast。

Ordinary `HeightReference.NONE`继续使用`SceneGISPlanarPrimitive`。Automatic surface graphics只在明确continuous
clamp配置时选择Ground Primitive：Polyline `clampToGround=true`，以及non-extruded Polygon/Ellipse/Rectangle/
Corridor的批准CLAMP组合。面状`RELATIVE_TO_GROUND`、mixed top/bottom reference和ground-relative extrusion不再属于
支持矩阵，必须在child low-level mutation前fail-fast。Point/Billboard/Label/Model等单anchor resolver的
`RELATIVE_TO_GROUND`保持不变。

### Height envelope、bounds与provider lifecycle

Shadow/line volume的Z envelope来自当前World：

- 有TerrainProvider时使用其finite ordered `minimumHeight`/`maximumHeight`和确定性正padding；
- 无provider时以Z=0为surface并建立非退化envelope；
- provider attach/replacement/detach只更新envelope uniform/model transform与conservative bounds，不因tile LOD、
  revision、camera或actual render cover重建footprint VA/DrawCommand/Shader；
- world hidden、destroyed或Context不匹配时不提交classification；Ground Primitive不发terrain request、不改变
  SSE/cache/readiness或`tilesLoaded`。

Command/culling bounds与presentation/selection bounds职责分离：

- private shadow-volume bounds继续覆盖XY footprint与global height envelope，只服务command culling；
- public `SceneGISPlanarGroundPrimitive.getBoundingSphere`与Entity visualizer使用last-successful source footprint的
  XY中心；Z通过resident-only `world.getTerrainHeight(center)`取得，未命中时回退Z=0，不发请求、不订阅terrain，
  也不读取或生成actual mesh；
- presentation radius把footprint水平半径与相对presentation center的padded provider envelope最大垂向距离合成，
  保持finite且保守，但不得再以provider envelope midpoint作为selection center；
- provider attach/replacement/detach或resident revision变化可在查询时更新presentation sphere，不替换footprint
  VA、Shader、DrawCommand或current；geometry candidate失败继续保留last-successful presentation bounds，成功时才
  原子切换。

首次GPU readiness前可保持`PENDING`；hidden/destroyed仍由visualizer按既有contract报告`FAILED`。

### Area stencil contract

Polygon footprint生成closed local-DOUBLE shadow volume，outer/hole winding与caps/sides完整。Stencil-depth command：

- color mask关闭、depth test `LESS_OR_EQUAL`、depthMask false、cull false；
- front z-fail decrement-wrap、back z-fail increment-wrap；
- 只使用Cesium classification mask，不读写3D Tiles mask。

紧随其后的color/pick command只在classification mask非零处绘制，并把该mask归零，避免对象与frustum之间泄漏。
Color pass使用approved premultiplied Color blending；pick pass写original id；二者不写surface depth，因此
`scene.pickPosition`继续返回被分类planar surface的位置。

### Ground polyline contract

Polyline不复用area CPU triangulation，也不读取terrain mesh。Private builder只从stable planar route生成segment/end-plane
volume attributes；dedicated SceneGIS shader在classification pass内形成pixel width、join/end clipping和surface-depth
visibility。Width仍为finite nonnegative pixel width，0隐藏；ArcType固定NONE，no geodesic/rhumb。

Ground line必须与area path共享Context capability、height envelope、pass、pick/depth、show、attributes、bounds和
lifecycle规则。不得以“line特殊”为由保留C9 actual-mesh fallback。

### C9 backend删除

C11完成时删除：

- `_SceneGISPlanarGroundDraper.js`及其Specs；
- Surface ground-render snapshot/generation/signature；
- World per-pass ground registration/late `_updateGround` queue；
- 只服务actual-current的GroundBounds逻辑，若仍需helper则改为读取新wrapper conservative bounds；
- C9 mixed reference/extrusion public JSDoc、compatibility rows与Sandcastle表述。

ADR-0021保留为历史记录并标记`superseded`。C9 review和commit不重写历史事实。

## 不采用的方案

### 混合actual-mesh与stencil backend

拒绝。它会长期保留两套选择、picking、bounds、resource和failure协议，项目负责人明确要求单一实现。

### 直接实例化Cesium GroundPrimitive/GroundPolylinePrimitive

拒绝。两者继续依赖Ellipsoid、Cartographic、ApproximateTerrainHeights、球面Geometry attributes和Globe/3D Tiles
contracts。C11复用算法思想与现有pass ordering，不复制球面坐标模型。

### 为保留relative/extrusion引入height texture/displacement

拒绝进入C11。该方案需要新的terrain GPU data contract和细分协议，不是stencil classification替换；如果未来确有
需求，应作为独立扩展重新设计。

### 立即增加新的Scene pass

拒绝。PlanarWorld与Globe互斥使现有`GLOBE -> TERRAIN_CLASSIFICATION` slots成为更窄的zero-upstream集成路径。
只有真实证据证明其不可行时才重新决策。

## 后果

- terrain LOD/revision/camera变化不再触发ground CPU clipping或GPU Geometry replacement；warm identity边界更清晰。
- Ground public API在正式发布前发生breaking contraction；types、API、guide、compatibility、package smoke与全部Entity
  fail-fast evidence必须同步。
- Continuous clamp与Cesium球面ground职责对齐，但面状relative和terrain-following extrusion明确不支持；不得以
  vertex sampling或上一帧height冒充。
- 新backend依赖stencil buffer、existing pass ordering、standard Primitive private hook与custom GLSL，成为Cesium升级
  复核点；若参考少量upstream算法，源码注释与UpgradeChecklist必须记录来源路径、baseline和同步条件。
- 最终browser/GPU acceptance只对C11更新后的唯一`scenegis-planar-content`执行。
