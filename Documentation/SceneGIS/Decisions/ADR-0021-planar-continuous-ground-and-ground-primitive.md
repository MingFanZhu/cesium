# ADR-0021：平面连续贴地与 Ground Primitive 晚阶段渲染协议

## 状态

- Status：`approved`
- Date：`2026-08-10`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-10-phase-c9-continuous-ground-and-ground-primitive.md`
- Related patch：无；C9 预期 upstream-owned files=`0`、SGP=`0`

## 上下文与源码事实

C1-C8 已建立固定平面坐标、高度语义、public planar Geometry/Primitive 与 automatic Entity adapter，
但 Polyline、Polygon、Ellipse、Rectangle 和 Corridor 的 ground 语义仍只在调用方或已生成边界顶点读取
resident terrain。边和面内部按输入几何线性插值，不能随着实际 terrain triangle、LOD 和 revision 连续收敛。

当前 Cesium 与 SceneGIS 源码存在以下约束：

1. Cesium `GroundPrimitive`、`GroundPolylinePrimitive` 依赖 ellipsoid rectangle、
   `ApproximateTerrainHeights`、shadow volume、classification/stencil 以及 Globe/3D Tiles pass，不能通过把
   Cartesian3 换成平面米制坐标来复用。
2. `Scene.updateAndRenderPrimitives` 先更新 `scene._groundPrimitives` 和 `scene._primitives`，随后才通过
   SGP-0001 调用 primary World 的 `render(frameState)`。因此普通 Primitive/DataSource visualizer 的 update
   早于当帧 planar terrain selection 和 actual render cover。
3. Private planar Surface 已在 normal render 后维护 actual-cover terrain query snapshot；它只覆盖有 terrain
   mesh 的读取语义，不包含无 provider 或 active `FLAT` fallback，也不能直接作为 renderer-owned ground
   resource registry。
4. 当前 terrain tile 的 active surface 可以是 `DIRECT`、`UPSAMPLED` 或 `FLAT`。只有前两者具有 Float32
   mesh；selection bounds 可以包含 skirts，但实际 surface triangle 必须排除 `surfaceIndexCount` 之后的 skirt
   indices。
5. C6-C8 的 public Geometry 保存 world-position snapshot 和 local DOUBLE mesh，public
   `SceneGISPlanarPrimitive` 使用 synchronous standard `Primitive`、single GeometryInstance、candidate/current、
   original id 与 exact lifecycle。这些 renderer contract 可以复用，但 ground 生成必须发生在 Surface 确定
   当帧实际覆盖之后。

因此 C9 不复用 Globe classification，也不修改 Scene update 顺序。它在 SceneGIS-owned World/Surface 与一个新
public wrapper 之间建立显式、按 pass 清空的晚阶段协议。

## 决策

### 新增一个 public Ground Primitive，不复制 Geometry 类型

C9 新增：

```text
SceneGISPlanarGroundPrimitive
```

它只接受现有 `SceneGISPlanarPolylineGeometry` 或 `SceneGISPlanarPolygonGeometry`。不新增等价的
GroundPolyline/GroundPolygon Geometry；应用和 Entity adapter 继续共享 C6 的 immutable world-position
snapshot、width、ring、hole、bottom 与 origin 语义。

Constructor 固定以下契约：

- required live caller-owned `SceneGISPlanarWorld world`；wrapper 不取得 World、Surface、terrain provider 或
  snapshot 的所有权；
- required supported `geometry`、compatible Color `appearance`、non-null `id`；`attributes`、`show` 和
  `allowPicking` 沿用 `SceneGISPlanarPrimitive` 的验证与 pick 语义；
- required `heightReference`；只接受 `NONE`、`CLAMP_TO_GROUND`、`RELATIVE_TO_GROUND`；
- `extrudedHeightReference` 只对具有 `bottomPositions` 的 Polygon 定义，且此时必须显式提供；Polyline 和
  non-extruded Polygon 定义该值时 fail-fast；
- 至少一个 effective reference 必须不是 `NONE`，否则调用方应使用 `SceneGISPlanarPrimitive`；
- geometry kind 在 construction 时固定，replacement 只允许同 kind；appearance pairing、instance attribute
  representability、single Context 和 destroyed-use 继续 fail-fast；
- extruded Ground Polygon要求每个bottom position与对应top position具有相同X/Y；public Polygon Geometry仍允许
  不同bottom footprint，但该输入不属于Ground wrapper可正确表达的surface-relative extrusion并在mutation前拒绝；
- 不提供任意 public `modelMatrix`。Continuous ground 的 X/Y 必须仍是 World addressing coordinates；需要刚性
  变换时先在应用侧生成已变换的 public Geometry snapshot。

HeightReference 对每个 source vertex 的 Z 解释如下：

| Reference            | 结果 Z                                    |
| -------------------- | ----------------------------------------- |
| `NONE`               | source Z                                  |
| `CLAMP_TO_GROUND`    | 当前实际 surface triangle 的 Z            |
| `RELATIVE_TO_GROUND` | 当前实际 surface triangle 的 Z + source Z |

Polygon top 使用 `heightReference`，bottom 使用 `extrudedHeightReference`。Top/bottom 可以混合 absolute 与
ground-relative；每个生成位置仍要求 bottom 不高于 top。Ground Primitive 不发 terrain request，也不改变
`world.tilesLoaded`。

Public wrapper 保持 `geometry`、`appearance`、`show`、`id`、`allowPicking`、`ready`、
`getGeometryInstanceAttributes`、`getBoundingSphere`、`isDestroyed` 与 `destroy` 的可识别 Primitive 生命周期。
内部把多个 tile/triangle 片段合并为一个 local-DOUBLE raw Geometry 和 single GeometryInstance，因此 instance
attributes 与 original pick id 不需要暴露 per-tile facade。

### World 驱动 normal-render late registration

`SceneGISPlanarGroundPrimitive.update(frameState)` 不在普通 Primitive 顺序中读取 terrain 或提交新 candidate。
它只通过 required World 的 private method 注册本次 pass 的 wrapper。注册必须满足：

- wrapper 确实被某个在 World 之前更新的 caller-owned PrimitiveCollection 访问；direct path 使用
  `scene.primitives`，automatic path 使用既有 per-DataSource primitive container；
- 每个 wrapper 每个 pass 最多注册一次；队列是 World instance-owned、短生命周期且不形成全局 registry；
- 注册时frameState必须与该World由`update`绑定的reusable lifecycle frameState为同一对象，防止跨Scene/World注册；
- `SceneGISPlanarWorld.render(frameState)` 先执行 Surface render/replay，再按稳定注册顺序驱动 ground wrapper；
- normal render 可以依据刚生成的 current ground snapshot 建立或 promote candidate；pick/depth pass 只能调用
  last-successful current，不得 drape、promote 或修改 snapshot；
- 每次 World render 在 `finally` 中清空该 pass 队列，`beginFrame`、zero-buffer、异常和 destroy 也不得遗留
  wrapper strong reference。

World 不拥有注册对象。Wrapper 从 caller collection 移除后不再注册，下一 pass 即停止提交；其最终 GPU
lifecycle 仍由 wrapper/既有 owner 的 `destroy` 负责。

### Surface 增加独立的 actual ground-render snapshot

现有 terrain query snapshot 的 public/query contract 保持不变。C9 在 private Surface 内增加独立、可复用容器的
ground-render snapshot，normal render 完成 selection、terrain promotion 与 actual render tile 决定后填充。

Snapshot 必须覆盖每个实际 render cover：

- `DIRECT` 与 `UPSAMPLED` entry 引用当帧 active Float32 mesh、tile-local transform、source level/revision 和稳定
  key；只允许读取 `surfaceIndexCount` 内的 surface triangles；
- no-provider 或 active `FLAT` entry 明确提供 tile rectangle 上 Z=0 的两个 surface triangles；
- parent cover、four-child promotion 与 camera-dependent actual render set 必须按当帧真实结果记录，不能用 desired
  leaf 或仅 resident tile 代替；
- provider attach/replacement/detach、hidden、zero-buffer、no-cover、source revision/key mismatch 和 destroy 会
  invalid snapshot；persistent array/entry 可以复用，但被移除范围必须清除 tile/content/mesh strong references。

Ground wrapper 只能在同一次 late update 中读取 snapshot，不能把 tile/content/mesh 引用保存在 current。它只保存
复制后的 source signature、生成 Geometry/Primitive 和 bounds。这样 terrain cache eviction 与 provider lifecycle
不受内容 runtime 阻塞。

### 连续 drape 以当前渲染 triangle 为唯一基准

C9 新增 private `_SceneGISPlanarGroundDraper`。它消费 public Geometry snapshot 与当帧 ground-render snapshot，
输出一个以 source Geometry world origin 重基的 local DOUBLE raw Geometry：

- Polyline 的每个 source segment 在 actual tile boundary 和 active surface triangle edge 处拆分；每个生成点从同一
  triangle plane取得 surface Z，再应用 source Z 的 segment-linear `NONE`/`RELATIVE`语义。不同可见片段在合并前
  保持断开，不能跨空白 cover 人为连接。
- Polygon 先使用既有 simple outer/direct-hole triangulation 表达 source footprint，再把每个 source triangle 与
  actual surface triangle 在 XY 上做 convex clipping。Top/bottom cap 分别按其 HeightReference求 Z；outer/hole
  boundary 在相同 triangle crossing 处分段并生成连续 side wall。`closeTop`/`closeBottom` 与 hole exclusion保持。
- Shared tile edge、shared terrain triangle edge、corner touch 和恰好位于内部边界的 segment 使用统一半开 ownership
  规则去重；World inclusive outer boundary仍保留。不得生成重复 cap、零长度 line 或 crack-causing unmatched side。
- Draper先以source/tile XY bounds排除无关cover entry；regular-grid terrain只流式访问source bounds覆盖的cell，禁止
  eager materialize或扫描整瓦片triangle array。Current signature同样只包含与该Geometry相交的actual-cover entries。
- Clipped ring必须清除duplicate/collinear点，cap/side以精确key去重；所有derived top/bottom端点均须finite且
  `bottom <= top`。Entity extrusion vertical outline通过private per-endpoint reference在同一snapshot解析，最终相同端点省略。
- Flat snapshot 使用同一算法与 Z=0 triangles，不建立第二条 fallback renderer。
- 所有 derived count、intersection parameter、position、normal、index 与 world/local bounds 在任何 current/resource
  mutation 前完整验证。空 intersection 表示本 pass 不提交；失败保留 last-successful current但本 pass不得显示与
  当前 surface generation 不匹配的旧结果。

误差预算定义为：相对当前实际渲染 Float32 triangle surface，CLAMP 生成点的额外垂直误差只允许 numeric tolerance；
RELATIVE 只再叠加 source offset 的线性插值。相对真实 terrain 的绝对误差不优于 active source level 对应的 provider
geometric error；`UPSAMPLED` 使用其真实 source level，不能冒充 child level。`FLAT` 只保证稳定 Z=0 fallback，不声明
terrain accuracy。C9 不发起更高 LOD 请求，也不通过内容改变 terrain SSE。

### Standard Primitive、depth 与原子 replacement

Ground wrapper 继续使用 synchronous standard `Primitive`，不引入 classification、专用 Shader 或 Worker。Private
draper 可以把多个兼容 piece 合并为一个 raw Geometry，但最终仍是 single GeometryInstance、original id 与一个
logical current。

Internal Appearance 从 caller-owned compatible Color appearance 派生，只覆盖 ground 所需的 depth state；不得修改
caller object。初版使用 depth test `LESS_OR_EQUAL`，不依赖 `polygonOffset`，因为 log-depth derived shader 下该状态
不能作为通用无闪烁保证。Normal-render candidate 必须先在隔离 command list 中完整创建和 update，成功后原子替换
current；失败保留旧 current、attributes、bounds 和资源。Snapshot signature不变时 warm frame复用 Primitive、
DrawCommand、VertexArray、shader、pick id与attributes。

Entity/DataSource bounds只聚合visible owner中last-successful且仍匹配current snapshot的Ground current；尚未完成首次
promotion或已被normal no-cover失效时返回`PENDING`，hidden/无owner仍返回`FAILED`。

Pick/depth pass只更新 current standard Primitive，不重新读取 terrain、重建 Geometry或修改 candidate state。
`scene.pick`返回 original caller id；`scene.pickPosition`命中 ground surface 时应与 submitted ground triangle一致。
第二 Context在 registration或资源 mutation前拒绝；destroy对current/candidate恰好一次，且不销毁caller World、
Appearance、Geometry或PrimitiveCollection。

若真实 WebGL 证明 local-DOUBLE generated geometry加`LESS_OR_EQUAL`在代表性linear/log depth下仍不能稳定覆盖当前
terrain triangle，Execution必须暂停并回报。不得未经Architecture复核静默增加custom Shader、classification pass、
polygon offset hack或upstream Scene修改。

### Entity compatibility 迁移

C9 不增加新的 callback child，也不改变 C4 child顺序。既有 visualizer 在以下条件选择 public Ground Primitive：

- Polyline：`clampToGround === true` 使用continuous ground，source Z忽略；false继续使用普通 public Primitive。
- Polygon：top或bottom任一 effective HeightReference非`NONE`时，fill使用Ground Primitive；top/bottom outline按各自
  reference选择ground或普通 Polyline，vertical outline保持相同已解析端点。
- Ellipse、Rectangle：沿用Area生成的simple Polygon/Polyline，但ground reference不再只采样generated perimeter。
- Corridor：沿用Route生成的simple Polygon/Polyline，ground reference不再只采样generated perimeter。

Point、Billboard、Label、Model、Box、Cylinder、Ellipsoid仍是anchor-resolution语义；Plane没有HeightReference；
Wall、PolylineVolume与Path不隐式ground。C9不扩大这些profile。

Visualizer仍负责Property evaluation、unsupported字段、Color/style、distance condition、original Entity id、
per-DataSource target和owner replacement。Ground wrapper自身监视surface signature，因此Entity Property不变时也能随
terrain LOD/revision/provider变化收敛；不得要求visualizer订阅terrain或每帧替换owner。

## 不采用的方案

### 复用 Cesium GroundPrimitive/GroundPolylinePrimitive

拒绝。两者的高度范围、shadow volume、classification和stencil路径以Ellipsoid/Globe为前提，不能为平面surface
提供coordinate-neutral triangle drape。

### 在普通 visualizer update 中读取上一帧 terrain query snapshot

拒绝。它会把camera movement、parent/child promotion和provider revision稳定滞后一帧，并把query snapshot误用为
renderer ownership协议。

### 让 Ground Primitive 自己请求或持有 terrain tile

拒绝。内容请求会建立第二套LOD/readiness/cache，破坏Surface normal-render-only mutation和四子覆盖门禁。Ground只
消费actual render cover。

### 在 C9 同时实现 3D Tiles classification、zIndex、arbitrary Material 或 Worker

拒绝。3D Tiles classification属于独立扩展；zIndex需要明确的planar overlay ordering协议；arbitrary Material需要
单独的Appearance矩阵；Worker需要pack/build/transfer和profiling依据。C9只交付Color ground line/fill与同步drape。

## 兼容性、所有权与构建

C9默认只修改`packages/engine/Source/SceneGIS/**`、对应SceneGIS Specs、SceneGIS durable docs与AgentDocs。
预计upstream-owned files=`0`、C9 SGP=`0`；不得修改`Scene.js`、`CesiumWidget.js`、`Viewer.js`、
`.scenegis/upstream-patches.json`或历史SGP-0001/0002 hunks。

`SceneGISPlanarGroundPrimitive`必须进入engine/Cesium runtime root、`.d.ts`与API HTML。Draper、ground snapshot、
late-registration method与其他underscore role不得进入declarations/API。不得手工修改generated barrel、types、
SpecList或Build产物。

## 测试与升级检查点

C9至少验证：

- private draper的triangle/tile split、hill-between-input-vertices、hole、mixed top/bottom reference、skirt exclusion、
  shared-edge ownership、large-offset precision与invalid atomicity；
- public Ground Primitive的API validation、same-kind replacement、attributes、ready/bounds、single Context、normal/pick/
  depth pass、warm identity与exact lifecycle；
- World/Surface的same-pass registration、actual parent/child cover、flat/no-provider、provider replacement/detach、hidden/
  zero/no-cover、snapshot reference cleanup与terrain cache non-ownership；
- Polyline/Polygon/Area/Corridor automatic migration、dynamic Property、original Entity pick、per-DataSource target和
  ordinary non-ground regression；
- 一个代表性真实Context fixture中的中间terrain峰值、continuous line/fill/hole/extrusion、linear/log depth、pixel、
  `scene.pick`、`scene.pickPosition`、LOD/revision convergence、warm/resource与below/grazing camera；
- public generation、focused build/types/docs/static audit与zero-upstream/zero-SGP边界。

升级Cesium时必须复核Scene primitive/World调用顺序、Surface actual render set、terrain mesh index/transform、standard
Primitive synchronous candidate、Appearance derived renderState、log depth、pickPrimitive/id和DataSource primitive
container ordering。
