# 平面通用影像来源

- Type: standalone plan
- Status: completed；实现、技术自审及负责人视觉验收通过
- Created / Updated: 2026-09-18
- Owner / architecture review: 当前 Agent；设计自审 confirmed
- Parent: None；原 P1–P8 extension 已 completed，本项为同一扩展的独立增量
- Decision: [ADR-0082](../../../Documentation/SceneGIS/Decisions/ADR-0082-planar-imagery-protocols.md)
- Branch: `codex/planar-imagery-protocols`
- Upstream-owned files / SGP: None planned
- Review: [技术自审](../reviews/2026-09-18-imagery-protocols.md)

## 目标与源码事实

负责人要求补齐球面中的通用影像加载方式，WMTS、TMS 只是例子；不接厂商专用服务，API 尽量一致。
核对 Cesium 1.144 全清单后，外部通用来源为 URL template、WMS、WMTS、TMS、SingleTile。
Grid / TileCoordinates 是程序化诊断图层，不是额外网络协议；OpenStreetMap 是 XYZ 特例。
ArcGIS、Azure、Bing、Google、Ion、Mapbox 等具有厂商配置和地球坐标假设，不在本项。

现有 planar URL provider 只展开 x/y/z/s。runtime 要求 canonical scheme identity、完整单根四叉树，
每图层独立 cache / request / texture，固定 minimumLevel=0；不能直接接球面的 geodetic provider。
新增协议只负责请求和元数据，不改 geometry、LOD、shader、重投影和图层合成。

## 实施

1. 扩展 URL template 的 projected bounds、reverse address、width/height、zero padding 和 customTags。
2. 新增 WMS GetMap（1.1.1 / 1.3.0，显式 CRS / 轴序）、WMTS KVP / REST（matrix labels、dimensions）。
3. 新增 TMS fromUrl，读取 tilemapresource.xml，核对 SRS / BoundingBox / Origin / resolutions，保留 href / order，Y 只在请求时翻转。
4. 新增 SingleTile 同步构造 / 异步 fromUrl。允许非正方形像素图片覆盖正方形米制范围。
5. WMTS dimensions 替换在下一 normal frame 使各 layer cache 失效；迟到图片、纹理与监听器成对释放。
6. 通用诊断图层在清单中说明；服务接入不假装拥有球面 feature picking、时序预取或能力文档自动发现。
7. 独立 Specs 验证 URL、元数据、Request/Resource、错误、共享 provider 和缓存刷新；本地示例及浏览器验收展示所有来源。
8. 完整 build / release / buildTs / TypeScript，定向 lint、已有 imagery 回归、包导出检查与上游审计。

## 验收与风险

- 全部来源使用同一 world.tilingScheme 和 imageryLayers.addImageryProvider，颜色滤镜与 alpha 接口保持。
- 任意自定义米制 CRS，不默认为 3857；TMS 的不兼容网格在创建阶段明确失败，不静默错位。
- HTTP 失败、取消和节流继续走已有状态机，不能把 undefined 包装成已 resolve 的 image。
- 单幅共享图片不能把同一个可 close 的 ImageBitmap 分发给多个 layer。
- 非 canonical、多根、缺失根层或局部覆盖的 TMS 不在当前网格能力内；不能承诺任意服务都可直接贴图。
- 使用本地确定性数据；实际远端服务的 CORS、鉴权、CRS 配置由服务与应用提供。
- 自审和负责人最终视觉验收分别记录，已有 metadata / clipping / atmosphere 变更保持独立。

## 实施交接

四个公共 Provider、URL tags 和元数据验证已实现。实际浏览器验证暴露 WMTS 维度刷新无法唤醒静止场景，
现通过已有 frameState.afterRender 机制修复；无上游 Scene 修改。KVP 重复大小写参数也已处理。
新增本地中文示例与 PNG fixtures，现有示例目录同步更新；全部加载入口保持相同图层 API。
累计 125 项相关 Specs 和 2 项 dev / release E2E、完整构建、类型、实际 engine tarball 与上游审计通过，最终证据见 review。
负责人已确认“影像服务”验收通过，本项完成。
