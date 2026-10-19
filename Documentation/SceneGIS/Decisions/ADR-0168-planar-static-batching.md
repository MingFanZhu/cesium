# ADR-0168：平面静态实例合批

- Status: accepted
- Date: 2026-10-19
- Decision owner: 当前任务（项目负责人要求补齐 SDK 静态业务图形合批）
- Plan: [Planar batching](../../../AgentDocs/planar-batching/plans/2026-10-19-planar-batching.md)
- SGP: None；不修改 upstream-owned files。

## 源码事实与决定

ADR-0018 的单实例限制是 C6 交付范围，不能满足本次明确的大量静态图形需求。
Cesium PrimitivePipeline 在 scene3DOnly 下不会投影到球面，支持多实例 DOUBLE 坐标变换、合并和
high/low encoding。完整世界坐标的 DOUBLE CPU 中间值不会造成 Float32 顶点精度损失。

扩展 SceneGISPlanarPrimitive.geometryInstances 构造选项，接收原生 GeometryInstance 形状的
实例描述数组（geometry、id、attributes、modelMatrix），继续限定已审计的 SceneGIS geometry。
不另建公共 Batch/Layer/实例类，也不公开私有 vector tile batch 或复制原生 renderer。
单 geometry 入口保持兼容；两种输入互斥。

## 坐标、属性与生命周期

- 实例世界坐标为 `translation(geometry.origin) * instance.modelMatrix * localVertex`。
  批次 modelMatrix 在上述世界坐标外层应用。单 geometry 的原有 origin-local modelMatrix 语义不变。
- 在创建内部 Primitive 前复用 GeometryPipeline.transformToWorldCoordinates 完成 CPU 变换，
  内部实例矩阵均为 identity；随后由原生 Primitive 完成真正的 combine/encode/BatchTable/picking。
- 兼容实例共享一个 Appearance。新增普通线 PolylineColorAppearance，允许独立 color；
  PolylineMaterialAppearance 继续只支持共享 Color material。非线延续已有 flat/open/closed 配对。
- 每个实例必须有唯一非空 id 和一致 attributes schema；避免原生 attribute 交集导致某个对象属性静默丢失。
- 输入实例列表、attributes、矩阵为构造快照。静态拓扑/实例矩阵变更通过新批次替换；颜色、显隐等已提供
  attributes 通过 getGeometryInstanceAttributes(id) 更新，不重建几何。
- pick 返回 wrapper 与原始业务 id；getBoundingSphere(result, id) 可查询单实例，省略 id 查询整批。
- normal-render candidate/current、单 Context、失败回滚、exactly-once destroy 沿用现有协议。
- 几何、Appearance、Material 和 id 仍由调用方拥有。

## 性能和范围

一个兼容批次对应一个原生 Primitive，draw/VA 数由原生索引拆分、透明 pass 等决定，不承诺恒为一个。
同步初次构建、整批剔除与拓扑重建成本仍存在；SDK 应按空间区域和 Appearance 分批。
不把原有逐 Entity 的动态适配路径宣称为自动合批，也不改球面 Primitive 行为。
Ground 的 stencil/segment/envelope 协议需要单独审计，B1 不扩大其支持面。

## B2 贴地线面

项目负责人已明确要求同轮覆盖贴地线面。SceneGISPlanarGroundPrimitive 增加同 geometry kind 的静态数组，
复用同步 Primitive/BatchTable/VA；各实例保持 id、attributes、width 与 presentation bounds。
不引入第二套 ground backend，也不改变 implicit clamp、无任意 modelMatrix/Material 的边界。

共用 XY origin 与 normalized Z envelope；line 用 CPU DOUBLE 点差生成 FLOAT 方向，避免不同 origin 的
FLOAT previous/next 点失真；width 改为顶点属性。Provider 变化只更新共享矩阵与包围体。

Ground 颜色正确性优先：沿用原生 ClassificationPrimitive 无 extent picking 的 offset/count 思路，
不同颜色、透明对象和线按实例范围交替 stencil/color，仍共享一个 Primitive/VA。
连续同色不透明 polygon 可合并，但单组最多 `StencilConstants.CLASSIFICATION_MASK`（15）个闭体，
避免 16 个重叠面使 stencil 计数归零；picking 继续逐实例范围隔离。
因此普通批次颜色命令近似按 VA 数增长，ground 的命令数依颜色/透明性/几何类型而变，不能把共享 VA
等同于所有场景只需一个 draw call。BatchTable 标脏后才重新规划范围，warm 不逐实例扫描颜色。

大批次需要 uint element indices；超过 65535 顶点且 Context 无该能力时在 GPU 创建前明确拒绝，
不使用原生 16-bit split 后无法完整表达单实例的 offset，也不自行复制索引拆分算法。
新增升级复核点：Primitive `_createPickOffsets`/`_pickOffsets`、BatchTable `_batchValuesDirty`、
ClassificationPrimitive 范围命令与 classification mask。

## 升级检查

### B3 贴地线片元范围判定

B3 替代 B2 对 line 必须逐实例 stencil/color 的限制。原生 `GroundPolylinePrimitive.createCommands` 按 VA
建立 terrain 命令，`PolylineShadowVolumeFS` 读取 `czm_globeDepthTexture` 并以 start/end/right plane 和 pixel width
判断地表片元。Planar 采用同样的分工：稳定 XY segment volume、保守 VS 扩张、FS 地表位置裁剪和原生 per-instance picking。
只借鉴该算法，不复制其 ellipsoid、2D/morph 和材质实现；不修改 Scene pass，不增加 depth target 或 CPU terrain clipping。
Line 一条命令覆盖一个 VA，不再需要 per-instance offset；area 继续 B2 stencil 契约。
Ground 支持检测加入 depth texture 能力；升级须复核当前 frustum 的 globe-depth copy、log depth reconstruction、
back-face volume rasterization 和 pick derived Shader。

### B4 贴地面实例范围裁剪与空间合批

B4 替代 B2 对异色/透明面和 picking 一律逐实例绘制的限制。原生 GroundPrimitive 提供实例 extents，
ClassificationPrimitive 的 extent 路径按 VA 提交 stencil/fill 两条命令；ShadowVolumeAppearanceFS 用地表深度
重建位置并裁剪实例范围。Planar 增加 XY extent 属性及同类片元判定，stencil pass 保持完整闭体，color/pick pass
才做 extent 裁剪。复用已有深度复制，不增加 GPU target、Scene pass 或 terrain CPU clipping。

为了保留已有的透明叠加、后绘制覆盖和孔洞契约，按输入顺序与 VA 建立连续空间分组，不任意合并相交实例。
使用已有 rbush 依赖检测 XY bounding extents 的内部相交；边界接触允许同组，保守 bbox 相交可能减少合批率。
互不相交的异色/透明对象共用一个 stencil/fill pair，pick 同样共享；同色不透明的相交对象仍可在最多 15 个
闭体的计数容量内合并 render，pick 保持空间分组。组内重叠层数不会溢出 classification bits。
静态空间信息保存在 candidate 内；颜色变更按需重算 render 分组，pick 分组和 warm 资源复用。
两种 ground geometry 均要求 depth texture；polygon 大批次继续使用 native pick offsets 和 uint-index 能力契约。

升级须同时复核 stencil 精确轮廓、extent FS discard 与 stencil 清零的执行关系、原生 pick varying 和
linear/log globe-depth 重建；用凹面/孔洞/相邻边、宽 envelope 低视角、透明重叠和独立 ID/显隐验证。

复核 GeometryPipeline 的 position/prevPosition/nextPosition、normal 变换，PrimitivePipeline 的
scene3DOnly/combine/high-low 路径，BatchTable 的实例 attributes、ID 和 Primitive 生命周期。
用不同 origin 的大坐标像素/pick 测试及对象数与命令/VA 数对照证明其仍在真实合批。
