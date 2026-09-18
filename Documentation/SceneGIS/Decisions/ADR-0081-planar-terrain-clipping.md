# ADR-0081：平面地形剖切与多边形裁剪

- Status: approved；实现、技术验证与负责人视觉验收完成
- Date: 2026-09-18
- Owner: 当前 Agent；负责人明确授权两类裁剪
- Plan: [地形裁剪](../../../AgentDocs/planar-terrain-advanced/plans/2026-09-18-terrain-clipping.md)
- SGP: None

## 上下文与选择

Cesium 1.144 的 Globe 分别公开 ClippingPlaneCollection 与 ClippingPolygonCollection。
前者的 Hessian plane 和 modelMatrix 是笛卡尔数学；后者的 geodesic polygon、球面坐标转换和 distance texture
具有地球语义。Planar Surface 当前单 Pass.GLOBE command 同时提供颜色和深度，pick/depth 重放 normal render 状态；
独立 CPU TerrainQuery 对 surface triangles 求交。

复用原生 plane / polygon 数据接口，但不为 XY 数据构造假椭球或进入球面 polygon compute。
裁剪只隐藏地表片元，不重切 mesh、不修改 provider、高程数据或 LOD，也不创建侧壁和封底。

## 决策

- World.clippingPlanes 使用 Cesium ClippingPlaneCollection，支持 enabled、unionClippingRegions、
  modelMatrix、edgeColor、edgeWidth 和动态 planes。负半空间为裁剪侧；多平面默认交集，union 为并集。
  共面片元按 Float32 运算精度归入裁剪侧：距离判定容差为
  `8 * 2^-23 * (|nx*x| + |ny*y| + |nz*z| + |d|)`，坐标为已重基的局部坐标。
  该相对舍入边界同时用于 GPU 和 CPU ray，不使用固定米数偏移；避免与裙边共面时插值误差造成碎片残留。
- World.clippingPolygons 直接使用 Cesium ClippingPolygonCollection / ClippingPolygon。
  positions 是 finite Cartesian3 的简单 XY 外环，Z 与 ellipsoid 不参与裁剪；
  顺逆时针和凹环均支持，边界属于内部。多个 polygon 取并集，inverse 裁剪并集之外。
  沿用原生 positions 数组的原地更新、add/get/remove/removeAll/contains、enabled 与 inverse；
  不新增平面专用公共类型。复用已有平面 polygon validation，在局部坐标下验证以避免大 CRS 偏移消减。
  使用精确边测试而非距离场纹理，quality 和 debugShowDistanceTexture 不参与平面渲染。
- 两个集合均为 World 独占；不可同时挂到另一个 owner，替换或 World.destroy 销毁集合。
  Polygon 是无资源的数据对象，Collection 不销毁 polygon，允许复用其数据。
- Surface 使用独立 CPU/GPU 快照，不调用原生集合的 GPU update。所有候选校验先于状态发布；
  pick/depth 与 CPU pickTerrain 使用最后 normal-render 的裁剪状态，未发布修改不得渗入重放。
- 一个惰性 RGBA Float32 数据纹理，使用重基坐标保存 plane equations、polygon headers 和 edges。
  仅数据变化时上传；容量复用，禁用时可保留，随 Surface 销毁。WebGL2 + floating point texture 为能力前提，
  与 imagery/Material/environment/background 共用 sampler 预算，超限明确拒绝。
- 片元解析使用固定 shader variant 加动态计数，避免每次增删重编译与缓存无限增长。
  默认不开启裁剪时不分配纹理、不增加 varying/sampler；启用时使用 tile-local 位置和 CPU origin 差保持大坐标精度。
- discard 同时影响颜色、深度及地面分类使用的 surface depth。CPU terrain ray 对所有候选交点应用相同快照，
  可越过被裁掉的近面找到远面。getTerrainHeight 与独立 sampler 继续描述源数据，World.pick 仍是 Z=0 参考平面。

## 交付与验证

修改限 SceneGIS-owned World、Surface、TerrainQuery、shader 和私有裁剪运行时。GLSL 使用 ADR-0030 的原构建链；
不增加 Worker、Scene pass、上游文件或 SGP。World 属性通过现有 JSDoc 进入公开类型，
不新增公共类型导出；package 验证增加私有运行时及 shader source/generated module 的交付断言。

Specs 验证默认/错误/API/ownership、GPU 像素、linear/log depth、CPU ray、变更快照、大坐标和生命周期；
真实本地 RGB24/quantized-mesh 示例与 E2E 验证发布入口。完整 build/release/buildTs/tsc 覆盖交付，
稳定帧以纹理上传和 shader/VA/command 计数验证资源成本，CPU timing 仅为同机参考。

升级时复核两类原生 Collection 的数据属性、owner slot 和 destroy 契约，平面 polygon validator、
Surface derived depth/pick shader 保留 discard 的规则与纹理能力。未承诺任意大数量 polygon 的性能。
