# ADR-0013：平面内容坐标、高度、朝向与兼容性基线

## 状态

- Status：`approved`
- Date：`2026-08-09`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-09-phase-c1-content-contract.md`
- Related patch：无；C1 只允许修改 SceneGIS-owned files

## 上下文与源码事实

`planar-world` 与 `planar-terrain` 已经建立米制 `Cartesian3`、有界正方形 extent、平面
quadtree、resident terrain height、actual-cover terrain picking 和独立 provider sampling。
`planar-content` 需要复用 Cesium `Entity`、Property 和 DataSource 数据模型，但不能把平面坐标
静默解释为 ECEF。

Cesium 1.144 当前实现具有以下事实：

- `BillboardVisualizer` 和 `LabelVisualizer` 将 Entity position 原样交给 collection；但
  `HeightReference` 非 `NONE` 时，底层 `Billboard._updateClamping` 会把 position 经
  `Ellipsoid.cartesianToCartographic` 转换，并调用 `Scene.getHeight/updateHeight`。
- `PointVisualizer` 在 `HeightReference.NONE` 时使用 `PointPrimitive`，其他模式会切换为
  Billboard，因此同样进入 ellipsoid clamping。
- `ModelVisualizer` 调用 `Entity.computeModelMatrix`；未提供 orientation 时，该方法调用
  `Transforms.eastNorthUpToFixedFrame`。底层 `Model.heightReference` 也依赖 Scene ellipsoid、
  Cartographic 与 `Scene.getHeight/updateHeight`。
- `PolygonGeometryUpdater`、ground polyline/polygon 和多个 geometry path 直接依赖 ellipsoid、
  tangent plane、geodesic/rhumb arc 或 Globe ground primitives。
- `DataSourceDisplay` 接受 constructor-level `visualizersCallback`，但当前 `CesiumWidget` 创建它时
  不传该 option。私有 `registerVisualizer` 只在默认 visualizers 后追加全局类型，既不能替换不安全
  visualizer，也会引入加载顺序和跨 Viewer 全局状态。
- `DataSourceDisplay` 构造还会无条件初始化 upstream ground terrain heights。是否需要为 planar
  Viewer 建立更窄构造缝隙，必须等 C4 依据当时集成路径裁决。
- ADR-0010 已明确 `world.getTerrainHeight` 读取最深 resident `DIRECT`/`UPSAMPLED` Float32
  triangle，允许读取 culled cache，不发请求；`world.pickTerrain` 只读最近 normal-render cover；
  `SceneGISPlanarTerrainSampler` 则会独立请求明确 level。三者不能互相隐式替代。
- Scene normal frame 先更新 scene primitives，再调用 primary `world.render`，所以 Entity content
  使用 resident terrain 时允许比刚完成的 surface promotion 晚一个 normal-render frame收敛。

因此，复用 Entity 数据模型不等于复用默认 Globe visualizers。平面内容需要在进入低层
Primitive/Model 前解析最终绝对平面位置，并把低层 height reference 保持为 `NONE`。

## 决策

### 坐标与有效域

平面内容 position 使用完整米制 `Cartesian3`：X 向东、Y 向北、Z 向上。Opaque `crs` 只用于
标识 World，不参与内容转换；调用方负责在写入 Entity Property 前完成 CRS 转换。

所有自动 planar Entity content 的 anchor X/Y 必须位于
`world.coordinateSystem.extent`，四条 outer boundary inclusive：

- finite extent 外 anchor 解析为 `undefined`，对应 graphic 不显示；不得把它钳制到边界、修改
  Property 或触发 camera Home；
- non-finite X/Y/Z 是 programmer error，必须在 output/resource mutation 前抛
  `DeveloperError`；
- 合法 anchor 上的 geometry 可以延伸到 extent 外，C1 只约束 anchor；
- `HeightReference.NONE` 也遵守相同 anchor domain，不能绕过 World 的有界坐标域。

CPU position 保持 double precision。后续 Point/Billboard/Label 使用 Cesium collection 已有的
position encoding；Model 和 mesh 使用局部 geometry + model matrix。C1 不把世界坐标固化为
Float32 vertex。

### HeightReference subset

首版只接受三个现有枚举值：

| HeightReference      | 解析结果                      |
| -------------------- | ----------------------------- |
| `NONE`               | `z = input.z`                 |
| `CLAMP_TO_GROUND`    | `z = surfaceHeight`           |
| `RELATIVE_TO_GROUND` | `z = surfaceHeight + input.z` |

`CLAMP_TO_TERRAIN`、`RELATIVE_TO_TERRAIN`、两种 3D Tiles reference 和未知数值都必须同步
拒绝。首版不把 terrain-only 值作为别名，以免在没有 3D Tiles 与通用 Scene ground 语义时形成两套
等价公共词汇。

位置解析完成后，低层 Point/Billboard/Label/Model 或 geometry object 必须接收最终绝对
Cartesian3，并保持自己的 `heightReference=HeightReference.NONE`。不得让低层 Cesium object 再次
执行 ellipsoid clamping。

### 逻辑地表与 fallback

Planar Entity height reference 使用 `world.getTerrainHeight(position)`，不使用
`Scene.getHeight/updateHeight`、depth、actual-cover ray picking 或独立 sampler。

当 resident query 返回 finite terrain height 时，该高度就是 `surfaceHeight`。返回 `undefined` 时，
逻辑地表稳定回退为 Z=0，包括：

- world 没有 terrain provider 或 provider 已 detach；
- provider replacement 后新 generation 尚无 resident content；
- root/child 正在 pending，当前位置尚无 direct/upsampled mesh；
- terminal failure 且不存在可用 ancestor terrain；
- flat fallback 是当前位置当前唯一可用 cover。

若 child terminal failure 但已有 resident ancestor `DIRECT`/`UPSAMPLED`，既有
`getTerrainHeight` 会继续读取该 ancestor；不能用 0 覆盖已知 terrain。Provider replacement、
detach、late settlement 和 revision identity 继续由既有 terrain runtime 隔离，content resolver
不建立第二套 generation state。

Resolver 每次 content update 重新读取 resident height，因此随 LOD/revision 自动收敛。它不主动
请求、预取或保留 terrain，不修改 selection、promotion、LRU、GPU、query snapshot 或
`world.tilesLoaded`。`world.tilesLoaded` 继续只表示当前视图 terrain/imagery；content fallback 是
同步可显示结果，不增加新的 pending readiness。由于 frame 顺序，刚发生的 terrain promotion 可以在
下一次 content update 才反映到 graphic，高度变化采用明确的 eventual consistency。

需要离屏或指定 level 的确定高度时，应用显式调用
`SceneGISPlanarTerrainSampler.sampleAtLevel`；HeightReference 不隐藏启动这种请求。

### 朝向

Entity orientation 的目标 frame 是固定 planar axes，而不是位置相关的 ECEF ENU：

- orientation undefined 时，planar transform 使用 translation-only matrix，world rotation 为
  identity；
- defined Quaternion 直接表示从 Cesium-normalized object/model local frame 到 planar
  X/Y/Z axes 的旋转；
- 不调用 `Transforms.eastNorthUpToFixedFrame` 或其他 ellipsoid local-frame helper；
- glTF up/forward axis 的标准模型内转换仍由 Cesium Model pipeline 负责；
- C1 不新增 Heading/Pitch/Roll helper，C2 只在出现真实公共需求时再提案。

C1 只固定上述语义，不提前实现 C2 Model transform；C2 进入时必须重新检查当时 Model pipeline、
axis correction、bounding volume 和 picking 路径。

### 私有 position resolver

C1 在 `SceneGIS/DataSources/_private` 增加无状态跨文件 helper：

```text
_SceneGISPlanarPositionResolver.resolve(
  world,
  position,
  heightReference,
  result,
) -> Cartesian3 | undefined
```

它只负责 world/liveness、finite position、approved height reference、inclusive extent、resident
height、Z=0 fallback、relative addition 和 result reuse。所有 validation、terrain read 和 derived Z
计算必须在写入 result 前完成；relative addition 不可表示为 finite number 时抛
`DeveloperError`，并保持 input/result 不变。

Helper 不持有 subscription、Event、Entity、Property、provider、TerrainData、tile、request 或 GPU
resource，不提供 destroy。C1 不新增 public class、World method、HeightReference enum 或 runtime
registry。该私有 basename 可能被当前 runtime barrel glob发现，但必须标记 `@private`，不得进入
`.d.ts` 或 API HTML，调用方不得依赖它。

### Compatibility profile 与 enforcement

首版 compatibility profile 为：

| 数据/graphics                                                             | 决定           | 负责阶段   |
| ------------------------------------------------------------------------- | -------------- | ---------- |
| `Entity`、Property/event、availability、show、metadata                    | 复用           | C4 集成    |
| `EntityCollection`、`CustomDataSource`                                    | 复用           | C4         |
| Point、Billboard、Label                                                   | approved scope | C2         |
| 普通 glTF Model                                                           | approved scope | C2         |
| planar straight Polyline、Polygon                                         | approved scope | C3         |
| Box、Corridor、Cylinder、Ellipse、Ellipsoid、Plane、Rectangle、Wall、Path | unsupported    | 首版不实现 |
| `Cesium3DTilesetGraphics`                                                 | unsupported    | 独立扩展   |
| GeoJSON、CZML、KML 自动转换                                               | unsupported    | 独立扩展   |
| Globe ground、geodesic/rhumb                                              | 禁止隐式进入   | 不复用     |
| tracking、`flyTo`、`zoomTo`                                               | unsupported    | 不改变     |

C2/C3 在各自进入时依据源码确认 graphics property 子矩阵，C1 不提前承诺每个 material、animation、
classification 或 extrusion option。

未来 automatic planar Entity adapter 必须使用 allowlist，且不能同时运行会消费相同 graphics 的
默认 Globe visualizer。已知 unsupported graphics 或 approved graphic 中的 unsupported 配置必须在
该 entity 的资源 mutation 前抛 `DeveloperError`；不能静默忽略后再落入 Globe path。手工加入
`scene.primitives` 的 raw Cesium primitives 不属于 automatic adapter 的检查范围，由调用方负责。

C1 checkpoint 只建立 resolver 与文档契约，不宣称 `viewer.entities` 已经安全支持 planar content。
C2/C3 可以针对自有 visualizer/runtime 做专项实现；只有 C4 完成后才宣称 Entity/DataSource/Viewer
自动集成可用。

## 不采用的方案

### 直接复用默认 Entity visualizers

拒绝。Absolute Billboard/Label/Point 的部分路径虽然直接使用 Cartesian3，但 clamping、默认 Model
orientation、polygon/ground 仍会进入 ellipsoid。混合复用会让同一 Entity 在 Property 改变后从
planar 语义切回 Globe 语义。

### 调用 `Scene.getHeight/updateHeight`

拒绝。它们的输入和 callback 是 Cartographic，并组合 Globe terrain 与 3D Tiles height；这不是
generic primary-world interface。

### 用 `world.pickTerrain` 或 `scene.pickPosition` 解析 anchor

拒绝。二者依赖最近画面或 depth，可能只覆盖当前 view，且 `scene.pickPosition` 还可能命中其他
Entity/Primitive。HeightReference 需要低成本 resident terrain 语义。

### 为每个 anchor 调用 terrain sampler

拒绝。HeightReference 没有 level、request、cancel 或 failure policy 参数；隐藏 request 会让大量
Entity 产生不可见调度和第二套 cache 生命周期。

### 新建 planar HeightReference enum

拒绝。已有三个值足以表达首版语义。通过严格 subset validation 避免复制枚举与 Property API。

### 使用 `DataSourceDisplay.registerVisualizer`

拒绝。它是 private global append-only registry，不能删除默认 visualizers，并依赖加载顺序。C4 必须
基于当时 Viewer/DataSourceDisplay 源码选择显式、instance-owned integration seam。

### 在 C1 提前修改 Viewer/CesiumWidget/DataSourceDisplay

拒绝。C1 没有运行中的 planar visualizer，无法证明具体 seam。C4 重新审计后，如确需修改
upstream-owned file，必须暂停并登记 SGP。

## 兼容性、所有权与构建

C1 只允许新增或修改 SceneGIS-owned DataSources helper、对应 Specs、SceneGIS 文档和
AgentDocs。预计 upstream-owned files=`0`、C1 SGP=`0`；不修改 SGP-0001、SGP-0002 或 patch
manifest。

不修改 `SceneGISPlanarWorld`、terrain runtime、Renderer、Shader、Worker、Widgets、Viewer、
Sandcastle、E2E、build/release scripts 或生成文件。C1 没有 supported public runtime API delta；
private resolver 必须从 declarations/API docs 隐藏。

## 测试与最小验证

- Focused resolver Specs：三个 approved HeightReference 公式、resident/flat fallback、inclusive
  boundary、outside undefined、finite validation、unsupported enum、relative overflow、result reuse、
  input/result atomicity，以及 `NONE` 不读取 terrain。
- 使用真实 `SceneGISPlanarWorld` 加局部 spy/stub 验证 resolver 与 public resident-height boundary；
  不重复 T3/T4 terrain request、generation、WebGL 或 query matrix。
- `npm run build` 验证源码发现；`build-ts/build-docs` 只验证 private helper 不进入 declarations/API。
- 运行 scoped ESLint/Prettier、SceneGIS Markdown checks、`git diff --check` 和 upstream patch audit。
- C1 不运行 WebGL、Viewer、Globe、Sandcastle、E2E、release build 或性能测试。

## 升级检查点

每次 Cesium 升级复核：

- Point/Billboard/Label/Model visualizer 的 position 与 heightReference flow；
- `Entity.computeModelMatrix` 的默认 frame 和 explicit Quaternion 行为；
- `DataSourceDisplay.visualizersCallback`、default visualizer list、ground initialization 与
  CesiumWidget/Viewer 构造入口；
- `Billboard._updateClamping`、`Model.updateClamping` 和 `Scene.getHeight/updateHeight` 是否出现真正
  generic world abstraction；
- `world.getTerrainHeight` 的 resident mesh、ancestor fallback、no-request 和 no-LRU-mutation
  contract；
- primary world 与 scene primitives 的 normal-render update order。

只有 upstream 提供 instance-owned、可替换默认 visualizers 且不依赖 Ellipsoid/Cartographic 的
明确扩展点时，才评估减少 SceneGIS-owned adapter。
