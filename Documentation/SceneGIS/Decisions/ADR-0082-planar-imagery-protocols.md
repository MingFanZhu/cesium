# ADR-0082：平面通用影像协议

- Status: approved；实现、技术验证与负责人视觉验收通过
- Date: 2026-09-18
- Owner: 当前 Agent；负责人要求通用来源覆盖与 API 一致
- Plan: [通用影像来源](../../../AgentDocs/planar-world/plans/2026-09-18-imagery-protocols.md)
- SGP: None

## 决策

新增 SceneGISPlanarWebMapServiceImageryProvider、SceneGISPlanarWebMapTileServiceImageryProvider、
SceneGISPlanarTileMapServiceImageryProvider、SceneGISPlanarSingleTileImageryProvider。
复用 SceneGIS 自有 URL provider 的 Resource / Request 管线；不继承球面 Provider，不复制地理投影代码。
名称、构造参数和 fromUrl 工厂与对应 Cesium 类保持同形，tilingScheme 使用显式 canonical planar 实例。

- URL template 增加 reverseX / reverseY / reverseZ、width / height、四个 Projected bounds、
  customTags 和 urlSchemeZeroPadding。坐标始终是原始米制 XY，不提供伪造的 Degrees tags。
  reverseZ 遵循当前 Cesium 的既有约定：level < maximumLevel 时为 maximumLevel - level - 1，
  最高层自身返回 level。兼容性来源为 Source/Scene/UrlTemplateImageryProvider.js 的 reverseZTag，
  基线提交 6d5d8b1f0725b6f831b336463f4b11c98023427b；升级时须同步检查该短表达式和边界测试。
- WMS 使用 layers、parameters、crs / srs；支持 1.1.1 和 1.3.0。CRS 默认取 world coordinateSystem.crs，
  缺失时要求显式提供；不选择隐含 EPSG。1.3.0 的 axisOrder 明确为 xy / yx，由调用方依服务 CRS 轴定义配置。
- WMTS 使用 layer、style、format、tileMatrixSetID、tileMatrixLabels、dimensions、subdomains。
  KVP 和 REST 都只映射 canonical address，tileMatrixLabels 不必是数值；服务矩阵由应用确认与 world 匹配。
  dimensions 替换通过私有多订阅事件使所有使用该 provider 的 runtime 标脏，下一 normal frame 释放并重载。
  不使用上游只面向单 imagery owner 的 _reload callback，不在 setter 中修改 GPU 或深度快照。
  World.update 在加载未完成时通过已有 frameState.afterRender callback 唤醒按需渲染；callback 在帧末
  重新检查 readiness，已就绪或已销毁时不再请求帧。稳定帧不注册 callback，不修改上游 Scene。
- TMS fromUrl 接受目录或 XML Resource，读取标准 TileMap / TileFormat / TileSets / BoundingBox / Origin / SRS。
  metadata 必须描述与 world 相同的完整单根二分网格；首层 order 可以非零，URL 保留 metadata href / order，
  根据 units-per-pixel 对应 canonical level，服务 Y 向北，内部 Y 向南。字段冲突直接拒绝，无猜测式 metadata fallback。
  数值匹配允许文本序列化误差（1e-10 倍根边长 / 对应分辨率），不用于接纳实际不同网格。
- SingleTile 覆盖完整 world，maximumLevel=0，子瓦片继续使用已有 ancestor UV。
  fromUrl 用 HTMLImageElement 读取自然尺寸并缓存非 closable image，避免跨 layer 重复关闭 ImageBitmap。

修订 ADR-0005 的像素尺寸约束：tileWidth / tileHeight 各为正整数，不要求相等。
米制 world 和网格仍是正方形；纹理的像素纵横比不决定物理覆盖。上传继续检查声明与实际尺寸一致。
Resource headers / query / proxy、Request identity、同步 undefined 节流、errorEvent、credit 和 provider 调用方所有权保持。

## 范围

以上覆盖当前 Cesium 的通用外部影像来源。OpenStreetMap 用 URL template 即可。
Grid / TileCoordinates 是 canvas 诊断能力，不是加载协议；厂商服务不增加专用适配。
GetCapabilities 自动发现、跨 CRS 重投影、球面 feature picking、Clock / times 预取、KTX2、局部覆盖和非二分矩阵不在本项。
WMS / WMTS 的时间参数可作为静态 parameters / dimensions 提交；不默默接受不支持的 times 配置。
后续需不同矩阵、coverage 或 feature picking 时，单独扩展网格/查询契约，而非伪造 Globe Rectangle。

## 验证与升级

Specs 覆盖 WMS 轴序、两种 WMTS 编码、TMS metadata 与翻行、非正方形 SingleTile、Resource/Request 保留、
共享 provider 重载与迟到隔离。真实本地浏览器覆盖图层组合、色彩、加载收敛和资源释放。
公开类经 engine / root 自动导出并验证 types 和 release。当前 upstream-owned files=0。
升级时核对 Resource 模板展开、fetchXML / fetchImage、HTMLImageElement 上传和 RequestScheduler 语义。

参考：[OSGeo TMS 规范](https://wiki.osgeo.org/wiki/Tile_Map_Service_Specification)、
[OGC WMTS](https://www.ogc.org/standards/wmts/)、
Cesium 1.144 本地 WMS / WMTS / TMS / SingleTile 源码。
