# ADR-0070：Globe 独立矢量贴地与投影矩阵适配

- Status: `accepted`
- Date: `2026-09-14`
- Plan: [G1](../../../AgentDocs/vector-tiles/plans/2026-09-14-g1-globe.md)
- Related: [ADR-0069](ADR-0069-planar-vector-ground-rendering.md)、[ADR-0067](ADR-0067-vector-worker-preparation.md)
- SGP: None planned

G2 补充：[ADR-0072](ADR-0072-vector-surface-transparency.md) 放开当前可见面的透明 Globe，
通过 SGP-0012 保留直接矢量颜色与 native 地表深度。下文 opaque 限定记录 G1 的原始资格，
当前透明范围与排序限制以 ADR-0072 为准，其他 G1 坐标/贴地协议保持。

## Context and decision

Globe 的零高程表示椭球表面，不能使用 planar Z=0 或移除 Globe。Cesium 1.144 的 surface
depth copy / TERRAIN_CLASSIFICATION 已提供渲染入口；地图仍拥有自己的批次与 feature pick。

同一 SceneGISVectorTileLayer 借用 Scene 的 primary World；新增 Globe profile 固定 WGS84、
SCENE3D、opaque Globe。MVT/source/layout 仍为 EPSG:3857 的单根米制矩阵，Globe terrain
可以使用不同的原生 geographic/mercator scheme。Layer 的可选 tilingScheme 只定义矢量 source；
planar 继续要求 canonical World scheme identity，Globe 则验证确定的 WebMercator extent。

Globe 使用独立曲面适配，复用数据/样式、Worker、缓存、逐区域覆盖、glyph atlas 和 placement。
Worker 细分长三角形并建立局部 ENU reference；实例化定向盒覆盖椭球曲率与当前地表高度。
片元在相对坐标中逆算 Mercator，按源三角形半开边与实际 region 唯一归属。覆盖体只是光栅化
载体，实际地图不写地表 depth、不采用颜色 RTT、不按 feature 创建 native Primitive。
近处采用 high/low ECEF origin 与局部逆投影，避免绝对 float ECEF/经纬度相减损失精度。

MVT 选取使用地理包围体、三维距离 SSE、horizon 与既有硬 tile budget，独立于 terrain readiness。
Style 比例在视轴椭球交点测量并换算 Mercator metric；未命中时使用前向最近点，朝离地球时由
实际 cover 决定是否有地图，不通过 camera pitch 限制或清空整个图层掩盖部分可见地表。

Globe 默认椭球 anchors 直接映射 geodetic zero。真实地形 anchors 消费已渲染 mesh，由现有
vector Worker 创建空间索引后做局部射线查询；索引与 mesh revision/provider 绑定，过时结果
不发布，图层不主动请求 terrain。GPU 遮挡仍读取实际 surface depth，pick 使用同一判断。

## Numerical and lifecycle details

源边超过 `6378137 × 0.06` 米的三角形在 Worker 二分，每三角形使用四个 RGBA float texels
保存投影 reference、ECEF high/low、ENU 与椭球曲率。每实例采用 8 个共享角点、36 个索引的定向盒；曲率/高度
包络只决定保守光栅化范围，不抬升地图实际位置。逆投影使用相对差分、稳定 Mercator 差值与
局部 Newton 迭代；极小纬差用七阶 sine 多项式，避免 GPU intrinsic 的绝对误差放大为街道偏移。
大于 0.1 rad 的动态 stroke 扩张采用普通 sine，不把小角度近似扩展至任意角度。

默认 EllipsoidTerrainProvider 的高度范围固定为零高程加一米余量，不引入原生 mesh 裙边随 LOD 变化的地下高度。
真实地形选层使用当时已发布 surface 的高度范围；绘制包围体另保留真实 provider 的保守高度包络，
在执行 uniform 时收紧至本帧相交地形。不能把深达百千米的绘制包络直接作为近景 SSE 距离，
否则会误选大量远处的高层级瓦片。Globe fill mesh 的 TerrainEncoding extrema 可为空，应使用
mesh 自身高度；原生 mesh 的 skirt 只参与光栅化高度包络，不进入 anchor 的表面查询索引。

现有 native TerrainPicker 首次查询仍会在主线程扫描/打包整块 mesh，本路径使用独立 Worker BVH。
仅复制候选 mesh 的数据，原生 buffers 不 transfer、不修改；索引结果归属于 mesh 和 exaggeration
revision，provider 切换替换 WeakMap。每帧最多安排一个需要的索引任务，glyph/tile jobs 共享现有
Worker pool。相邻地形量化边可超出理想 rectangle，候选范围按一个量化 cell 扩大并处理日期线，
最终高度仍由真实三角形求交决定。全部数据由 layer 释放或随 native mesh 回收。

## Performance correction

Globe source cover 使用 `EllipsoidalOccluder` 的 geographic horizon point，按矩形最大地表高度
subsample，并以最小高度支持椭球下的地表。不能以一个把瓦片大幅抬离地表的 bounding sphere
替代地理遮挡判断；全局/root 无有效单点时保留它继续细分。该规则排除地球背后不可见工作，
不裁掉可见地平线、不限制 camera pitch，也不把俯视拉远作为远景截断。

Ground vertices、triangles、Globe frames 合入同一 float 数值纹理，以 texel offsets 寻址；pick
与 dash 保留各自契约。Layer 显式拥有 geometry cache，各批次引用计数共享不变的 prism/box VA，
最后一个使用者释放 VA/顶点/索引；没有 global cache。Region commands 在 source 改变时才 clone，
clip 使用稳定 uniform closure；Shader variant 改变时由原生 setter 触发派生命令更新。

默认椭球采用少 varying 的 texture lookup Shader；真实 terrain 的高度跨度扩大了覆盖体，采用
专用 Shader 在顶点阶段读取三角形固定数据，flat 传递给片元，避免高 overdraw 下逐片元重复读取。
Provider 切换惰性选择/复用程序，不重新解析 MVT，不替换 geometry、VA 或 pick identities。
两条路径都使用同一地表 depth、完整 coverage 和原生 derived pick；这不是平面直接绘制或颜色 RTT。

片元先以覆盖体已有的曲率/高度误差界进行保守线性排除，只有确定在三角形外才 discard。
其余片元继续相对坐标 Newton 逆投影；最多四步，仅在物理残差同时小于 1 mm 和参考像素的
1/1000 时结束。该判据随像素尺度收紧，不以降低画质作为性能开关。ECEF 相机绕转产生约 1e-12
量级的 fractional zoom 噪声，style zoom 以 1e-10 精度归一化，避免重复失效样式和字形几何缓存。

## Delivery and limits

所有实现位于 SceneGIS-owned roots；现有 Shader 与 Worker entries 构建生成、包交付方式不变。
新增公共配置与 Globe 支持需要 Specs、实际 WebGL、多 frustum、provider/LOD、资源释放、
平面回归和 Test 页面验收。Globe translucency、morph/2D、非 WGS84 和高级环境完整材质融合
须单独资格；沿用既有陡坡大字形与独立 source LOD 接缝的未完成边界。
